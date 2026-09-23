import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createOpenAIItineraryProvider } from "@reel/ai/openai-itinerary";
import { prepareItineraryRequest, type ItineraryProvider } from "@reel/ai/itinerary";
import { compileProposal } from "@reel/planner";
import { baselineProvider, benchmarkItinerary } from "../evals/itinerary/benchmark";
import { comparisonCases } from "../evals/itinerary/comparison-cases";
import { currentCases } from "../evals/itinerary/current-cases";
import { itineraryCases } from "../evals/itinerary/cases";
import { geminiProvider, ollamaProvider } from "../evals/itinerary/providers";
import { scoreProposal } from "../evals/itinerary/comparison-metrics";

const args=process.argv.slice(2);
const value=(key:string)=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
if(!args.includes("--live")) throw Error("Explicit --live required for external model calls.");
const pilot=args.includes("--pilot");
const resume=args.includes("--resume");
const repeats=Number(value("--runs")??(pilot?1:3));
if(!Number.isInteger(repeats)||repeats<1||repeats>10)throw Error("--runs must be 1..10");
const selected=(value("--providers")??"openai,gemini,ollama").split(",");
if(selected.some(p=>!["openai","openai_small","gemini","ollama"].includes(p)))throw Error("Unknown provider");
const temperature=Number(value("--temperature")??0.2);
const output=path.resolve(value("--out")??`.local/comparison-${Date.now()}`);
await mkdir(output,{recursive:true});
// Never overwrite prior measurements.
if (!resume) await writeFile(path.join(output,"started.txt"),new Date().toISOString(),{flag:"wx"});
const sha=(text:string)=>createHash("sha256").update(text).digest("hex");
const fixtures=pilot?itineraryCases.slice(0,2).map(c=>({...c,description:"Development smoke case",feasible:true,
  targetPlaceIds:c.input.places.map(p=>p.placeId),mealDates:[],requireSuggestions:false,witness:null})):(args.includes("--current")?currentCases:comparisonCases);
const caseFilter=value("--cases")?.split(",");
if(caseFilter) fixtures.splice(0,fixtures.length,...fixtures.filter(f=>caseFilter.includes(f.id)));
if(!fixtures.length) throw Error("No fixtures selected");
for(const f of fixtures)if(f.witness)compileProposal(f.witness,f.input);
const sourcePaths=["packages/ai/prompts/itinerary-v6.ts","evals/itinerary/current-cases.ts","packages/ai/src/itinerary.ts","packages/ai/src/openai-itinerary.ts",
  "packages/planner/src/proposal.ts","packages/planner/src/schedule.ts","packages/planner/src/quality.ts","packages/planner/src/nearby.ts","packages/planner/src/validate.ts","packages/contracts/src/itinerary.ts",
  "evals/itinerary/benchmark.ts","evals/itinerary/providers.ts","evals/itinerary/comparison-cases.ts","evals/itinerary/comparison-metrics.ts","scripts/compare-itinerary.ts"];
const files=await Promise.all(sourcePaths.map(async p=>({path:p,sha256:sha(await readFile(p,"utf8"))})));
const settings={temperature,maxAttempts:2,callTimeoutMs:Number(value("--call-timeout")??25000),totalTimeoutMs:Number(value("--total-timeout")??40000),maxOutputTokens:8000,
  openai:{model:value("--openai-model")??"gpt-4.1-mini-2025-04-14",api:"Responses",store:false},
  openai_small:{model:"gpt-4o-mini-2024-07-18",api:"Responses",store:false},
  gemini:{model:value("--gemini-model")??"gemini-3.6-flash",api:"v1beta generateContent",thinkingLevel:"minimal",candidateCount:1},
  ollama:{model:value("--ollama-model")??"qwen3:8b",api:"/api/chat",think:false,num_ctx:16384,keep_alive:"30m",stream:false}};
const local=selected.includes("ollama")?{version:await fetch("http://127.0.0.1:11434/api/version").then(r=>r.json()),
  tags:await fetch("http://127.0.0.1:11434/api/tags").then(r=>r.json()),
  show:await fetch("http://127.0.0.1:11434/api/show",{method:"POST",body:JSON.stringify({model:settings.ollama.model})}).then(r=>r.json())}:null;
const manifest={createdAt:new Date().toISOString(),synthetic:true,split:pilot?"development-smoke":"synthetic-regression-not-held-out",
  commit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),workingTree:execFileSync("git",["status","--short"],{encoding:"utf8"}),
  files,settings,repeats,selected,hardware:{platform:os.platform(),release:os.release(),arch:os.arch(),cpu:os.cpus()[0]?.model,
    logicalCpus:os.cpus().length,memoryBytes:os.totalmem(),node:process.version},local,
  fixtureHash:sha(JSON.stringify(fixtures)),fixtures:fixtures.map(f=>({...f,request:prepareItineraryRequest(f.input)}))};
if (resume) {
  const prior=JSON.parse(await readFile(path.join(output,"manifest.json"),"utf8"));
  if(prior.fixtureHash!==manifest.fixtureHash || JSON.stringify(prior.settings)!==JSON.stringify(settings)) throw Error("Resume settings or fixtures changed");
  for(const f of files) if(f.path!=="scripts/compare-itinerary.ts" && prior.files.find((p:any)=>p.path===f.path)?.sha256!==f.sha256) throw Error(`Resume source changed: ${f.path}`);
  await writeFile(path.join(output,`resume-${Date.now()}.json`),JSON.stringify(manifest,null,2));
} else {
  await writeFile(path.join(output,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
  for (const source of sourcePaths) {
    const target=path.join(output,"source",source);
    await mkdir(path.dirname(target),{recursive:true});
    await writeFile(target,await readFile(source));
  }
}
// Rotate provider order across cases and repetitions. All requests are sequential; no inference contention.
const jobs=[];
for(let run=1;run<=repeats;run++)for(let i=0;i<fixtures.length;i++){
  const offset=(i+run-1)%selected.length;
  for(let j=0;j<selected.length;j++)jobs.push({run,fixture:fixtures[i]!,provider:selected[(offset+j)%selected.length]!});
}
await writeFile(path.join(output,"order.json"),JSON.stringify(jobs.map(j=>({run:j.run,caseId:j.fixture.id,provider:j.provider})),null,2));
// Trace allowlists only; no credentials, request headers or live user records are written.
let traces:Array<Record<string,unknown>>=[];
const tracedFetch:typeof fetch=async(url,init)=>{
  const start=performance.now();
  try{
    const response=await fetch(url,init);
    const raw=await response.clone().json().catch(()=>null) as any;
    traces.push({httpStatus:response.status,latencyMs:performance.now()-start,
      model:raw?.model??raw?.modelVersion??null,status:raw?.status??raw?.done_reason??raw?.candidates?.[0]?.finishReason??null,
      usage:raw?.usage??raw?.usageMetadata??null,
      ollama:raw?.eval_count===undefined?null:{prompt_eval_count:raw.prompt_eval_count,eval_count:raw.eval_count,
        total_duration:raw.total_duration,load_duration:raw.load_duration,prompt_eval_duration:raw.prompt_eval_duration,eval_duration:raw.eval_duration},
      error:response.ok?null:String(raw?.error?.message??raw?.error??"HTTP error").slice(0,1000)});
    return response;
  }catch(e){traces.push({latencyMs:performance.now()-start,error:e instanceof Error?e.name:"transport failure"});throw e;}
};
const providers:Record<string,ItineraryProvider>={
  openai:createOpenAIItineraryProvider({apiKey:process.env.OPENAI_API_KEY,model:settings.openai.model,temperature,fetch:tracedFetch}),
  openai_small:{...createOpenAIItineraryProvider({apiKey:process.env.OPENAI_API_KEY,model:settings.openai_small.model,temperature,fetch:tracedFetch}),id:"openai_small"},
  gemini:geminiProvider({apiKey:process.env.GOOGLE_AI_API_KEY,model:settings.gemini.model,temperature,fetch:tracedFetch}),
  ollama:ollamaProvider({model:settings.ollama.model,temperature,fetch:tracedFetch}),
};
if(selected.includes("ollama")){
  const start=performance.now();
  const warm=await fetch("http://127.0.0.1:11434/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model:settings.ollama.model,stream:false,think:false,keep_alive:"30m",messages:[{role:"user",content:"Reply OK."}],
      options:{num_ctx:16384,num_predict:8,temperature}}),signal:AbortSignal.timeout(180000)});
  await writeFile(path.join(output,resume?`warmup-resume-${Date.now()}.json`:"warmup.json"),JSON.stringify({latencyMs:performance.now()-start,status:warm.status,response:await warm.json()},null,2));
}
const previous=resume?(await readFile(path.join(output,"rows.jsonl"),"utf8")).trim().split("\n").filter(Boolean).map(l=>JSON.parse(l)):[];
const keys=new Set(previous.map((r:any)=>`${r.provider}/${r.caseId}/${r.run}`));
let done=previous.length;
for(const job of jobs){
  if(keys.has(`${job.provider}/${job.fixture.id}/${job.run}`)) continue;
  traces=[];const startedAt=new Date().toISOString();
  const result=await benchmarkItinerary(structuredClone(job.fixture.input),providers[job.provider]!,{maxAttempts:2,budget:settings});
  const row={caseId:job.fixture.id,run:job.run,feasible:job.fixture.feasible,startedAt,...result,traces:structuredClone(traces),
    finalScore:result.plan ? scoreProposal(result.proposal,job.fixture,result.plan) : null,
    scores:result.attemptDetails.map(a=>a.response?scoreProposal(a.response.proposal,job.fixture,a.plan):null)};
  await appendFile(path.join(output,"rows.jsonl"),JSON.stringify(row)+"\n");
  console.log(`${++done}/${jobs.length} ${job.provider} ${job.fixture.id} run ${job.run}: ${result.accepted?"accepted":"rejected"} ${Math.round(result.latencyMs)}ms attempts=${result.attempts}`);
}
for(const fixture of fixtures){
  const result=await benchmarkItinerary(structuredClone(fixture.input),baselineProvider(fixture.input),{maxAttempts:1});
  await appendFile(path.join(output,"baseline.jsonl"),JSON.stringify({caseId:fixture.id,run:1,feasible:fixture.feasible,...result,
    finalScore:result.plan ? scoreProposal(result.proposal,fixture,result.plan) : null,
    scores:result.attemptDetails.map(a=>a.response?scoreProposal(a.response.proposal,fixture,a.plan):null)})+"\n");
}
await writeFile(path.join(output,"completed.txt"),new Date().toISOString());
console.log(`Saved ${output}`);
