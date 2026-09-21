import { describe, it, expect, vi } from "vitest";
import { compileProposal } from "@reel/planner";
import { prepareItineraryRequest } from "@reel/ai/itinerary";
import { createOpenAIItineraryProvider } from "@reel/ai/openai-itinerary";
import { comparisonCases } from "../../evals/itinerary/comparison-cases";
import { scoreProposal } from "../../evals/itinerary/comparison-metrics";
import { geminiProvider, ollamaProvider } from "../../evals/itinerary/providers";

const fixture=comparisonCases[0]!;
const request=prepareItineraryRequest(fixture.input);
const response=(data:unknown)=>new Response(JSON.stringify(data),{headers:{"Content-Type":"application/json"}});
describe("itinerary comparison evidence",()=>{
  it("has a valid scheduling witness covering each feasible case's target places",()=>{
    for(const f of comparisonCases.filter(f=>f.feasible)){
      const plan=compileProposal(f.witness,f.input);
      const ids=new Set(plan.days.flatMap(d=>d.stops.map(s=>s.placeId)));
      for(const id of f.targetPlaceIds)expect(ids.has(id),`${f.id}: ${id}`).toBe(true);
    }
  });
  it("rejects the contradictory booking witness rather than rewarding acceptance",()=>{
    const f=comparisonCases.find(f=>!f.feasible)!;
    const raw={days:[{date:f.input.startDate,stops:f.input.reservations.map(r=>({kind:"reservation",referenceId:r.id,start:r.start.slice(11)}))}]};
    expect(()=>compileProposal(raw,f.input)).toThrow();
  });
  it("does not count an empty valid plan as a useful itinerary",()=>{
    const f=comparisonCases.find(f=>f.id==="destination-only")!;
    const scored=scoreProposal(f.witness,f);
    expect(scored.accepted).toBe(true);
    expect(scored.quality?.useful).toBe(false);
    expect(scored.quality?.mealCoverage).toBe(0);
  });
  it("distinguishes application schema from stricter request schema and counts booked coverage",()=>{
    const f=comparisonCases.find(f=>f.id==="booked-place")!;
    expect(scoreProposal(f.witness,f).quality?.targetCoverage).toBe(1);
    const legacy={days:[{date:fixture.input.startDate,stops:[{kind:"place",referenceId:"gallery-north",start:"10:00"}]}]};
    expect(scoreProposal(legacy,fixture).accepted).toBe(true);
    expect(scoreProposal(legacy,fixture).strictSchemaValid).toBe(false);
  });
});
describe("comparison provider transports",()=>{
  it("sends Gemini the identical prompt, schema and repair as user data, with minimal thinking",async()=>{
    const fetcher=vi.fn(async()=>response({modelVersion:"gemini-3.6-flash",candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify(fixture.witness)}]}}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:20,thoughtsTokenCount:3}}));
    const req={...request,repair:{proposal:fixture.witness,issues:["Duplicate place"]}};
    const result=await geminiProvider({apiKey:"test-key",fetch:fetcher}).generate(req);
    const body=JSON.parse((fetcher.mock.calls as unknown as Array<[unknown,RequestInit]>)[0]![1].body as string);
    expect(body.systemInstruction.parts[0].text).toBe(request.systemPrompt);
    expect(body.generationConfig.responseJsonSchema).toEqual(request.jsonSchema);
    expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe("minimal");
    expect(JSON.parse(body.contents[0].parts[0].text).repair).toEqual(req.repair);
    expect(result.usage).toEqual({inputTokens:10,outputTokens:23});
  });
  it("never accepts a truncated Gemini response even when its text parses",async()=>{
    const fetcher=async()=>response({candidates:[{finishReason:"MAX_TOKENS",content:{parts:[{text:JSON.stringify(fixture.witness)}]}}]});
    await expect(geminiProvider({apiKey:"test",fetch:fetcher}).generate(request)).rejects.toMatchObject({code:"MALFORMED_OUTPUT"});
  });
  it("uses local schema-constrained Ollama, bounded output and unknown usage as null",async()=>{
    const fetcher=vi.fn(async()=>response({model:"qwen3:8b",done:true,done_reason:"stop",message:{content:JSON.stringify(fixture.witness)}}));
    const result=await ollamaProvider({fetch:fetcher}).generate(request);
    const call=(fetcher.mock.calls as unknown as Array<[string,RequestInit]>)[0]!;
    expect(call[0]).toBe("http://127.0.0.1:11434/api/chat");
    const body=JSON.parse(call[1].body as string);
    expect(body.format).toEqual(request.jsonSchema);
    expect(body.think).toBe(false);
    expect(body.options).toMatchObject({num_ctx:16384,num_predict:8000,temperature:0.2});
    expect(result.usage).toEqual({inputTokens:null,outputTokens:null});
  });
  it("preserves HTTP failures and rejects truncated local output",async()=>{
    await expect(ollamaProvider({fetch:async()=>new Response("",{status:503})}).generate(request)).rejects.toMatchObject({code:"GENERATION_FAILED"});
    await expect(ollamaProvider({fetch:async()=>response({model:"qwen3:8b",done:true,done_reason:"length",message:{content:"{}"}})}).generate(request)).rejects.toMatchObject({code:"MALFORMED_OUTPUT"});
  });
  it("only overrides OpenAI sampling when explicitly requested",async()=>{
    const fetcher=vi.fn(async()=>response({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(fixture.witness)}]}]}));
    await createOpenAIItineraryProvider({apiKey:"test",temperature:0.2,fetch:fetcher}).generate(request);
    await createOpenAIItineraryProvider({apiKey:"test",fetch:fetcher}).generate(request);
    const calls=fetcher.mock.calls as unknown as Array<[unknown,RequestInit]>;
    expect(JSON.parse(calls[0]![1].body as string).temperature).toBe(0.2);
    expect(JSON.parse(calls[1]![1].body as string)).not.toHaveProperty("temperature");
  });
});
