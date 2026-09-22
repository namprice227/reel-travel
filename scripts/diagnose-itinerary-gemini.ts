import fs from 'node:fs';
import { prepareItineraryRequest } from '@reel/ai/itinerary';
import { comparisonCases } from '../evals/itinerary/comparison-cases';
import { scoreProposal } from '../evals/itinerary/comparison-metrics';
if(!process.argv.includes('--live')) throw Error('Explicit --live required');
const c=comparisonCases.find(c=>c.id==='full-day')!;
const request=prepareItineraryRequest(c.input);
// Paired troubleshooting, NOT a replacement for any failed measured trial.
for(const mode of ['normalized-native','prompt-schema']) {
 const start=performance.now();
 function normalize(v:any):any {
  if(Array.isArray(v))return v.map(normalize);
  if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!['$schema','pattern','minLength','maxLength'].includes(k)).map(([k,value])=>k==='const'?['enum',[value]]:[k,normalize(value)]));
  return v;
 }
 const user={...request.input,...(mode==='prompt-schema'?{outputSchema:request.jsonSchema}:{})};
 const config={temperature:0.2,candidateCount:1,maxOutputTokens:8000,thinkingConfig:{thinkingLevel:'minimal'},responseMimeType:'application/json',...(mode==='normalized-native'?{responseJsonSchema:normalize(request.jsonSchema)}:{})};
 const body={systemInstruction:{parts:[{text:request.systemPrompt}]},contents:[{role:'user',parts:[{text:JSON.stringify(user)}]}],generationConfig:config};
 let result:any;
 try {
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',{
   method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GOOGLE_AI_API_KEY!},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
  const raw=await response.json();let proposal:any,score:any;
  try{proposal=JSON.parse(raw.candidates?.[0]?.content?.parts?.filter((p:any)=>!p.thought).map((p:any)=>p.text??'').join(''));score=scoreProposal(proposal,c);}catch{}
  result={httpStatus:response.status,raw,proposal,score};
 } catch(e){result={error:e instanceof Error?e.name:'error'};}
 fs.writeFileSync(`evals/results/itinerary-2026-09-22/preflight/schema-${mode}.json`,JSON.stringify({at:new Date().toISOString(),mode,latencyMs:performance.now()-start,request:body,...result},null,2),{flag:"wx"});
 console.log(JSON.stringify({mode,status:result.httpStatus,error:result.error,accepted:result.score?.accepted,latencyMs:performance.now()-start}));
}
