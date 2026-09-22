import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

if (!process.argv.includes("--live")) throw Error("Explicit --live required");
const destination = process.argv.at(-1);
if(!destination || destination.startsWith("--")) throw Error("Output directory required");
const root = path.resolve(destination);
await mkdir(root, {recursive:true});
await writeFile(path.join(root,"started.txt"),new Date().toISOString(),{flag:"wx"});
const cases = ["full-day","short-window","three-day-clusters","rainy-afternoon"];
for (let run=1;run<=2;run++) for (let i=0;i<cases.length;i++) {
  const temps = (i+run)%2 ? [0.2,1] : [1,0.2];
  for (const temperature of temps) {
    const out = path.join(root,`t${temperature}`,`${cases[i]}-${run}`);
    execFileSync(process.execPath,["--import","tsx","scripts/compare-itinerary.ts","--live","--current","--runs","1",
      "--providers","openai","--cases",cases[i]!,"--temperature",String(temperature),"--call-timeout","90000",
      "--total-timeout","150000","--out",out],{stdio:"inherit"});
  }
}
for (const temperature of [0.2,1]) {
  const rows=[], fixtures=[];
  let manifest:any;
  for(let run=1;run<=2;run++) for(const id of cases) {
    const dir=path.join(root,`t${temperature}`,`${id}-${run}`);
    const row=JSON.parse((await readFile(path.join(dir,"rows.jsonl"),"utf8")).trim());
    rows.push({...row,run});
    manifest=JSON.parse(await readFile(path.join(dir,"manifest.json"),"utf8"));
    if(run===1) fixtures.push(...manifest.fixtures);
  }
  const dir=path.join(root,`t${temperature}`);
  await writeFile(path.join(dir,"rows.jsonl"),rows.map(r=>JSON.stringify(r)).join("\n")+"\n");
  await writeFile(path.join(dir,"baseline.jsonl"),"");
  await writeFile(path.join(dir,"manifest.json"),JSON.stringify({...manifest,fixtures,repeats:2,aggregation:"Rows from alternating independent parameter-study calls; see per-call manifests"},null,2));
  execFileSync(process.execPath,["--import","tsx","scripts/summarize-itinerary-comparison.ts",dir],{stdio:"ignore"});
}
await writeFile(path.join(root,"completed.txt"),new Date().toISOString());
