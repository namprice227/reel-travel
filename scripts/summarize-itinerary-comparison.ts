import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const dir=path.resolve(process.argv[2]??"");
const load=async(name:string)=>(await readFile(path.join(dir,name),"utf8")).trim().split("\n").filter(Boolean).map(l=>JSON.parse(l));
const rows=[...await load("rows.jsonl"),...await load("baseline.jsonl")];
const manifest=JSON.parse(await readFile(path.join(dir,"manifest.json"),"utf8"));
const targetCases=new Set(manifest.fixtures.filter((f:any)=>f.targetPlaceIds.length).map((f:any)=>f.id));
const quantile=(values:number[],q:number)=>{const a=[...values].sort((a,b)=>a-b);return a.length?a[Math.max(0,Math.ceil(q*a.length)-1)]!:null;};
const mean=(a:number[])=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
// Date-stamped standard paid-tier estimates, not account invoices. Update when choosing different models.
const modelRates:Record<string,{input:number;cached:number;output:number}>={
  "gpt-4.1-mini-2025-04-14":{input:0.4,cached:0.1,output:1.6},
  "gpt-4o-mini-2024-07-18":{input:0.15,cached:0.075,output:0.6},
  "gemini-3.6-flash":{input:0.75,cached:0.075,output:3.75},
};
const rates=Object.fromEntries(Object.entries(manifest.settings).flatMap(([key,value]:[string,any])=>
  value?.model && modelRates[value.model] ? [[key,modelRates[value.model]]] : []));
function cost(r:any){
  if(r.provider==="baseline"||r.provider==="ollama")return null;
  const p=rates[r.provider];
  if(!p)return null;
  const values=(r.traces??[]).map((t:any)=>{
    if(t.usage==null)return null;
    const u=t.usage;
    const input=u.input_tokens??u.promptTokenCount;
    const cached=u.input_tokens_details?.cached_tokens??u.cachedContentTokenCount??0;
    const output=u.output_tokens??(u.candidatesTokenCount==null?null:u.candidatesTokenCount+(u.thoughtsTokenCount??0));
    return input==null||output==null?null:((input-cached)*p.input+cached*p.cached+output*p.output)/1e6;
  });
  return values.length===r.attempts&&values.every((v:any)=>v!==null)?values.reduce((s:number,v:number)=>s+v,0):null;
}
const summary=Object.fromEntries([...new Set(rows.map(r=>r.provider))].map(provider=>{
  const all=rows.filter(r=>r.provider===provider),feasible=all.filter(r=>r.feasible),impossible=all.filter(r=>!r.feasible);
  const attempts=all.flatMap(r=>r.attemptDetails);
  const scores=all.flatMap(r=>r.scores);
  const finalScore=(r:any)=>r.finalScore ?? r.scores.at(-1);
  const success=feasible.filter(r=>r.accepted);
  const first=feasible.filter(r=>r.scores[0]?.accepted);
  const costs=all.map(cost).filter((v):v is number=>v!==null);
  const issues:Record<string,number>={};
  for(const a of attempts)for(const issue of a.issues){const key=issue.split(":")[0].split(" (")[0];issues[key]=(issues[key]??0)+1;}
  return [provider,{runs:all.length,feasibleRuns:feasible.length,infeasibleRuns:impossible.length,
    interactiveBudgetAccepted:success.filter(r=>r.latencyMs<=40000&&r.attemptDetails.every((a:any)=>a.durationMs<=25000)).length,
    firstPassAccepted:first.length,finalAccepted:success.length,
    usefulRuns:feasible.filter(r=>r.accepted&&finalScore(r)?.quality?.useful).length,
    correctConstraintRejections:impossible.filter(r=>!r.accepted&&r.attemptDetails.some((a:any)=>a.issues.some((s:string)=>/OVERLAP|LOCKED_RESERVATION_UNREACHABLE/.test(s)))).length,
    unsafeInfeasibleAccepted:impossible.filter(r=>r.accepted).length,
    attempts:attempts.length,jsonResponses:attempts.filter(a=>a.response).length,
    appSchemaValid:attempts.filter(a=>a.schemaValid).length,strictSchemaValid:scores.filter(s=>s?.strictSchemaValid).length,
    repairedRuns:all.filter(r=>r.attempts>1).length,repairedSuccesses:success.filter(r=>r.attempts>1).length,
    providerFailureRuns:all.filter(r=>r.issues.includes("PROVIDER_FAILURE")).length,
    meanTargetCoverageDelivered:mean(feasible.filter(r=>targetCases.has(r.caseId)).map(r=>r.accepted?(finalScore(r)?.quality?.targetCoverage??0):0)),
    meanTargetCoverageAccepted:mean(success.map(r=>finalScore(r)?.quality?.targetCoverage).filter((v):v is number=>v!==null&&v!==undefined)),
    allRequiredLunches:success.filter(r=>finalScore(r)?.quality?.mealCoverage===1).length,
    seasonalAdvice:success.filter(r=>finalScore(r)?.quality?.seasonalAdvicePresent).length,
    latencyMedianMs:quantile(all.map(r=>r.latencyMs),0.5),latencyP95Ms:quantile(all.map(r=>r.latencyMs),0.95),
    successfulLatencyMedianMs:quantile(success.map(r=>r.latencyMs),0.5),
    inputTokensKnown:attempts.reduce((s,a)=>s+(a.response?.usage.inputTokens??0),0),
    outputTokensKnown:attempts.reduce((s,a)=>s+(a.response?.usage.outputTokens??0),0),
    attemptsWithUsage:attempts.filter(a=>a.response?.usage.inputTokens!=null&&a.response?.usage.outputTokens!=null).length,
    costKnownRuns:costs.length,costKnownSubtotalUsd:costs.length?costs.reduce((s,v)=>s+v,0):null,
    meanKnownRunCostUsd:mean(costs),costPerAcceptedFeasibleRunUsd:costs.length===all.length&&success.length?costs.reduce((s,v)=>s+v,0)/success.length:null,
    rates:rates[provider]??null,issues,
    cases:Object.fromEntries([...new Set(all.map(r=>r.caseId))].map(id=>{const c=all.filter(r=>r.caseId===id);return[id,{n:c.length,accepted:c.filter(r=>r.accepted).length,firstPass:c.filter(r=>r.scores[0]?.accepted).length,useful:c.filter(r=>r.accepted&&finalScore(r)?.quality?.useful).length,medianLatencyMs:quantile(c.map(r=>r.latencyMs),0.5)}];}))}];
}));
await writeFile(path.join(dir,"summary.json"),JSON.stringify({calculatedAt:new Date().toISOString(),priceDate:"2026-09-22",summary},null,2)+"\n");
const csv=["provider,case,run,feasible,accepted,first_pass_accepted,useful,attempts,latency_ms,input_tokens,output_tokens,estimated_cost_usd"];
for(const r of rows)csv.push([r.provider,r.caseId,r.run,r.feasible,r.accepted,r.scores[0]?.accepted??false,r.accepted&&(r.finalScore ?? r.scores.at(-1))?.quality?.useful||false,r.attempts,r.latencyMs.toFixed(1),r.inputTokens??"",r.outputTokens??"",cost(r)??""].join(","));
await writeFile(path.join(dir,"runs.csv"),csv.join("\n")+"\n");
console.log(JSON.stringify(summary,null,2));
