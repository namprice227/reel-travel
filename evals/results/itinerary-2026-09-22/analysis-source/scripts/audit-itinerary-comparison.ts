import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { compileProposal, toMinutes } from "@reel/planner";

const dir=path.resolve(process.argv[2]!);
const manifest=JSON.parse(await readFile(path.join(dir,"manifest.json"),"utf8"));
const rows=(await readFile(path.join(dir,"rows.jsonl"),"utf8")).trim().split("\n").filter(Boolean).map(l=>JSON.parse(l));
const fixtures=new Map<string,any>(manifest.fixtures.map((f:any)=>[f.id,f]));
const providers=[...new Set(rows.map(r=>r.provider))];
const audit:any={};
const csv=["scenario,anonymous_output,reviewer,delivered,preference_fit,timing,geography,seasonal_fit,sparse_usefulness,overall,notes"];
const mapping:any[]=[];
const reviewDir=path.join(dir,"human-review");
await mkdir(reviewDir,{recursive:true});
for(const provider of providers){
 const all=rows.filter(r=>r.provider===provider);
 const attempts=all.flatMap(r=>r.attemptDetails);
 const inputs=attempts.flatMap(a=>a.response?.usage.inputTokens==null?[]:[a.response.usage.inputTokens]);
 const outputs=attempts.flatMap(a=>a.response?.usage.outputTokens==null?[]:[a.response.usage.outputTokens]);
 const weather=all.find(r=>r.caseId==="rainy-afternoon");
 let weatherAdapted=false, gardenBeforeRain=false;
 if(weather?.accepted){
  const plan=compileProposal(weather.proposal,fixtures.get(weather.caseId).input);
  const stops=plan.days.flatMap(d=>d.stops);
  const garden=stops.find(s=>s.placeId==="outdoor-garden"),art=stops.find(s=>s.placeId==="indoor-art");
  gardenBeforeRain=!!garden&&toMinutes(garden.end)<=13*60;
  weatherAdapted=gardenBeforeRain&&!!art&&toMinutes(art.start)>=13*60;
 }
 audit[String(provider)]={
  transport:all.flatMap(r=>r.traces).reduce((counts:any,t:any)=>{const key=String(t.httpStatus??t.error??"unknown");counts[key]=(counts[key]??0)+1;return counts;},{}),
  observedModels:[...new Set(attempts.flatMap(a=>a.response?[a.response.model]:[]))],
  inputTokenRange:inputs.length?[Math.min(...inputs),Math.max(...inputs)]:null,
  outputTokenRange:outputs.length?[Math.min(...outputs),Math.max(...outputs)]:null,
  rainyAfternoon:{delivered:weather?.accepted??false,adapted:weatherAdapted,postHocGardenBeforeRain:gardenBeforeRain},
 };
}
for(const [caseId,fixture] of fixtures){
 // Fixed random-looking permutation derived from a declared public salt; no quality selection.
 const caseRows=rows.filter(r=>r.caseId===caseId&&r.run===1).sort((a,b)=>hash(a.provider+caseId).localeCompare(hash(b.provider+caseId)));
 const sheets=caseRows.map((r,i)=>{
  const label=`${caseId}-${String.fromCharCode(65+i)}`;
  mapping.push({label,provider:r.provider,caseId});
  csv.push(`${caseId},${label},,${r.accepted},,,,,,,`);
  return {anonymous_output:label,delivered:r.accepted,proposal:r.accepted?r.proposal:null};
 });
 await writeFile(path.join(reviewDir,`${caseId}.json`),JSON.stringify({synthetic:true,input:fixture.input,outputs:sheets},null,2));
}
await writeFile(path.join(dir,"audit.json"),JSON.stringify(audit,null,2)+"\n");
await writeFile(path.join(reviewDir,"ratings.csv"),csv.join("\n")+"\n");
// Keep this file away from reviewers until their ratings are locked.
await writeFile(path.join(dir,"human-review-key.json"),JSON.stringify(mapping,null,2)+"\n");
function hash(value:string){return createHash("sha256").update("itinerary-review-20260922/"+value).digest("hex");}
console.log(JSON.stringify(audit,null,2));
