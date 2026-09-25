// Offline acceptance of real My Trip components, API client and styles.
// Navigation is a reactive Next shim; all HTTP, imagery and Google frames are intercepted.
// Fixtures are fictional. This does not measure live Google Maps or deployed persistence.
// Run: node --import tsx tests/e2e/my-trip-ux.mjs
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { tripFixture, placeFixtures, itineraryFixtures, sharedViewFixture } from '../../packages/contracts/fixtures/index.ts';

const { chromium } = await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE_PATH ?? '.local/browser-tools/node_modules/playwright/index.mjs')).href);
const liveBase = process.env.MY_TRIP_LIVE_BASE;
const base = liveBase ?? 'http://trips.test';
const output = liveBase ? '.local/my-trip-ux-live' : '.local/my-trip-ux';
await mkdir(output, { recursive: true });
const navigation = `import React,{useSyncExternalStore} from 'react';
  for(const method of ['pushState','replaceState']) { const native=history[method].bind(history); history[method]=(...args)=>{native(...args);window.dispatchEvent(new Event('locationchange'));}; }
  const subscribe=cb=>{addEventListener('locationchange',cb);addEventListener('popstate',cb);return ()=>{removeEventListener('locationchange',cb);removeEventListener('popstate',cb);};};
  export function usePathname(){return useSyncExternalStore(subscribe,()=>location.pathname);}
  export function useSearchParams(){return new URLSearchParams(useSyncExternalStore(subscribe,()=>location.search));}
  export const useRouter=()=>({push:url=>history.pushState(null,'',url),replace:url=>history.replaceState(history.state,'',url),back:()=>history.back(),refresh(){}});`;
const bundle = await build({ stdin: { loader: 'tsx', resolveDir: process.cwd(), contents: `
  import React from 'react';import {createRoot} from 'react-dom/client';
  import {usePathname,useSearchParams} from 'next/navigation';
  import {AppNavigation} from './apps/web/src/components/AppNavigation';
  import {TripsPage} from './apps/web/src/features/trips/TripsPage';
  import {AllTripsPage} from './apps/web/src/features/trips/AllTripsPage';
  import {TripHeader} from './apps/web/src/features/trips/TripHeader';
  import {ItineraryPage} from './apps/web/src/features/itinerary/ItineraryPage';
  import {PlacePage} from './apps/web/src/features/places/PlacePage';
  import {PlacesPage} from './apps/web/src/features/places/PlacesPage';
  import {SharePage} from './apps/web/src/features/sharing/SharePage';
  import {SharedTripPage} from './apps/web/src/features/sharing/SharedTripPage';
  function App(){const path=usePathname();const search=useSearchParams();const parts=path.split('/');
    if(parts[1]==='s')return <main className="public-container public-main"><SharedTripPage token={parts[2]}/></main>;
    return <div className="app-shell"><AppNavigation email="synthetic@example.test"/><div className="app-stage"><main className="app-main">
    {path==='/my-trip/all'?<AllTripsPage/>:path==='/my-trip'?<TripsPage/>:<div className="trip-area"><TripHeader tripId={parts[2]}/>
    {parts[3]==='place'?<PlacePage tripId={parts[2]} placeId={parts[4]}/>:parts[3]==='places'?<PlacesPage tripId={parts[2]}/>:parts[3]==='share'?<SharePage tripId={parts[2]}/>:<ItineraryPage key={path} tripId={parts[2]} view={parts[3]==='map'?'map':'itinerary'} day={search.get('day')??undefined} edit={search.get('edit')==='1'}/>}</div>}
    </main></div></div>;}
  createRoot(document.getElementById('root')).render(<App/>);` },
  bundle: true, write: false, outdir: path.join(output, 'bundle'), format: 'iife', jsx: 'automatic', tsconfig: 'apps/web/tsconfig.json', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID': '""', 'process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY': '""' },
  plugins: [{ name: 'next-preview', setup(builder) {
    builder.onResolve({ filter: /^next\/(link|navigation|dynamic|image)$/ }, ({ path }) => ({ path, namespace: 'preview' }));
    builder.onLoad({ filter: /.*/, namespace: 'preview' }, ({ path }) => ({ loader: 'jsx', resolveDir: process.cwd(), contents:
      path.endsWith('image') ? `import React from 'react';export default function Image({src,priority,preload,fill,unoptimized,loader,quality,placeholder,blurDataURL,overrideSrc,onLoadingComplete,...props}){return <img {...props} src={overrideSrc??(typeof src==='string'?src:src.src)}/>}`
      : path.endsWith('navigation') ? navigation : path.endsWith('dynamic')
      ? `import React,{lazy,Suspense} from 'react';export default function dynamic(load,opts){const Component=lazy(load);return props=><Suspense fallback={opts.loading?.()}><Component {...props}/></Suspense>}`
      : `import React from 'react';export default function Link({children,onClick,scroll,prefetch,replace,...props}){return <a {...props} onClick={e=>{onClick?.(e);if(!e.defaultPrevented&&!e.metaKey&&!e.ctrlKey&&e.button===0&&props.href.startsWith('/')){e.preventDefault();history[replace?'replaceState':'pushState'](null,'',props.href);}}}>{children}</a>}`,
    }));
  } }],
});
let fonts = '';
for (const file of await readdir('apps/web/.next/dev/static/chunks').catch(() => [])) {
  if (/internal_font_google_(figtree|newsreader).*single.css$/.test(file)) {
    const css = await readFile(path.join('apps/web/.next/dev/static/chunks', file), 'utf8');
    fonts += (css.match(/@font-face\s*\{[^}]+\}/g) ?? []).join('\n').replaceAll('../media/', '/fonts/');
  }
}
const css = (await Promise.all(['globals.css','styles/home.css','styles/dashboard.css','styles/landing.css','styles/trips.css','styles/itinerary.css','styles/shared-itinerary.css','styles/setup-share.css','styles/place.css','styles/library.css'].map(f=>readFile(`apps/web/src/app/${f}`,'utf8')))).join('\n');
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}\n:root{--font-figtree:Figtree;--font-newsreader:Newsreader}\n${css}</style></head><body><div id="root"></div><script src="/preview.js"></script></body></html>`;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let testTrip = { ...tripFixture };
let returnTripId;
if (liveBase) {
  const signIn = await page.request.post(`${base}/api/auth/dev-sign-in`, { data: { email: `trip-ux-${Date.now()}@example.test` } });
  assert.ok(signIn.ok(), 'Local development sign-in is required for the optional native Next check');
  const created = await page.request.post(`${base}/api/trips`, { data: { title: 'Synthetic My Trip UX check', destination: 'Tokyo', timezone: 'Asia/Tokyo', startDate: '2026-10-01', endDate: '2026-10-04' } });
  assert.ok(created.ok());
  testTrip = { ...tripFixture, id: (await created.json()).trip.id };
  const second = await page.request.post(`${base}/api/trips`, { data: { title: 'Synthetic Kyoto return check', destination: 'Kyoto', timezone: 'Asia/Tokyo', startDate: '2026-11-04', endDate: '2026-11-05' } });
  assert.ok(second.ok());
  returnTripId = (await second.json()).trip.id;
}
const errors = [], checks = [], unexpected = [], requests = [];
page.on('pageerror', error=>errors.push(error.message));
const pass = name=>{checks.push(name);console.log(`PASS ${name}`);};
await page.clock.install({ time: new Date('2026-09-30T16:00:00Z') });
let itinerary = structuredClone(itineraryFixtures.valid);
let place = structuredClone(placeFixtures.confirmed);
place.name = place.selected.name = 'Synthetic Sky Deck';
place.selected.details.provider = 'google'; // Mocked provider shape, never a live verified place.
place.selected.details.providerUrl = 'https://maps.google.com/?cid=123';
place.selected.details.attribution = 'Synthetic test response; not real venue data';
place.selected.details.openingHours = { status: 'known', windows: [{ day:4,open:'09:00',close:'18:00' }] };
const replacement = structuredClone(place);
replacement.id = 'place_replacement';
replacement.name = replacement.selected.name = 'Synthetic Garden Tower';
replacement.selected.providerPlaceId = replacement.selected.details.providerPlaceId = 'fx-garden-tower';
itinerary.days[0].stops[0].title = place.name;
itinerary.unscheduledPlaceIds = [replacement.id];
const longDay = Array.from({length:6},(_,i)=>({...structuredClone(itinerary.days[0].stops[1]),id:`break_${i}`,title:`Free time ${i+1}`}));
itinerary.days[0].stops.push(...longDay);
itinerary.days[1].stops = [{...structuredClone(itinerary.days[0].stops[0]),id:'day_two_stop',title:'Synthetic second-day stop',location:{lat:35.66,lng:139.72}}];
const original = structuredClone(itinerary);
let trips = [testTrip, ...Array.from({length:18},(_,i)=>({...testTrip,id:i===3&&returnTripId?returnTripId:`future_${i}`,title:`Kyoto plan ${i+1}`,destination:'Kyoto',startDate:`2026-11-${String(i+1).padStart(2,'0')}`,endDate:`2026-11-${String(i+2).padStart(2,'0')}`,currentItineraryVersion:i%2?null:1})),{...testTrip,id:'past',title:'Past trip',startDate:'2025-01-01',endDate:'2025-01-05'}];
let rejectList=false, rejectPlaceDelete=false, editMode='success', holdEdit=false, releaseEdit, holdMap=false, stale=false;
const editRequests=[], generateRequests=[], selectionRequests=[], deletionRequests=[];
const deletedPlaceIds=new Set();
await page.route('**/*', async route=>{
  const req=route.request(),url=new URL(req.url());requests.push(url.href);
  if(liveBase && url.origin===new URL(base).origin && !url.pathname.startsWith('/api/'))return route.continue();
  if(url.pathname==='/preview.js')return route.fulfill({contentType:'application/javascript',body:bundle.outputFiles[0].text});
  if(url.hostname==='trips.test'&&!url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/fonts/'))return route.fulfill({contentType:'text/html',body:html});
  if(url.pathname==='/api/trips')return route.fulfill({status:rejectList?503:200,json:rejectList?{error:{code:'INTERNAL',message:'Trips unavailable'}}:{trips}});
  if(req.method()==='DELETE'&&url.pathname.match(/^\/api\/trips\/[^/]+\/places\/[^/]+$/)){
    if(rejectPlaceDelete)return route.fulfill({status:503,json:{error:{code:'INTERNAL',message:'Delete unavailable. Try again.'}}});
    deletionRequests.push(url.pathname);deletedPlaceIds.add(url.pathname.split('/').at(-1));
    return route.fulfill({json:{ok:true}});
  }
  if(req.method()==='DELETE'&&url.pathname.match(/^\/api\/trips\/[^/]+$/)){
    deletionRequests.push(url.pathname);trips=trips.filter(t=>t.id!==url.pathname.split('/').at(-1));
    return route.fulfill({json:{ok:true}});
  }
  if(url.pathname.match(/^\/api\/trips\/[^/]+$/))return route.fulfill({json:{trip:{...testTrip,id:url.pathname.split('/').at(-1)}}});
  if(url.pathname.endsWith('/places/selection')&&req.method()==='PATCH'){
    const body=req.postDataJSON();selectionRequests.push(body);testTrip={...testTrip,selectedPlaceIds:body.placeIds};
    return route.fulfill({json:{trip:testTrip}});
  }
  if(url.pathname.endsWith('/itinerary/edits')){
    const body=req.postDataJSON();editRequests.push(body);
    if(holdEdit)await new Promise(resolve=>releaseEdit=resolve);
    if(editMode==='reject')return route.fulfill({status:422,json:{error:{code:'EDIT_REJECTED',message:'Edit not saved',details:{conflicts:[{message:'This move overlaps your fixed booking.',suggestion:'Choose another day.'}]}}}});
    if(editMode==='stale'){itinerary.version++;return route.fulfill({status:409,json:{error:{code:'STALE_VERSION',message:'A newer itinerary is available. Reloaded the saved version.'}}});}
    assert.equal(body.expectedVersion,itinerary.version);
    const change=body.edit;
    if(body.dryRun){
      const preview=structuredClone(itinerary);
      if(change.type==='replace_stop'){
        const stop=preview.days.flatMap(d=>d.stops).find(s=>s.id===change.stopId);
        if(stop){stop.title=replacement.name;stop.placeId=replacement.id;}
      }
      return route.fulfill({json:{itinerary:preview,saved:false}});
    }
    if(change.type==='move_stop'){
      const from=itinerary.days.find(d=>d.stops.some(s=>s.id===change.stopId));
      const [stop]=from.stops.splice(from.stops.findIndex(s=>s.id===change.stopId),1);
      itinerary.days.find(d=>d.date===change.toDate).stops.splice(change.toIndex,0,stop);
    }
    if(change.type==='replace_stop'){
      const stop=itinerary.days.flatMap(d=>d.stops).find(s=>s.id===change.stopId);
      if(stop){stop.title=replacement.name;stop.placeId=replacement.id;}
      itinerary.unscheduledPlaceIds=itinerary.unscheduledPlaceIds.filter(id=>id!==replacement.id);
    }
    itinerary.version++;return route.fulfill({json:{itinerary,saved:true}});
  }
  if(url.pathname.endsWith('/itinerary/generate')){generateRequests.push(req.postDataJSON());itinerary.version++;stale=false;return route.fulfill({json:{itinerary}});}
  if(url.pathname.startsWith('/api/shared/'))return route.fulfill({json:{view:sharedViewFixture}});
  if(url.pathname.endsWith('/itinerary'))return route.fulfill({json:{itinerary,stale}});
  if(url.pathname.endsWith('/shares'))return route.fulfill({json:{shares:[]}});
  if(url.pathname.match(/\/places\/[^/]+\/photo$/))return route.fulfill({json:{photo:null}});
  if(url.pathname.match(/\/places\/[^/]+\/details$/))return route.fulfill({json:{details:place.selected?.details??null}});
  if(url.pathname.endsWith('/places'))return route.fulfill({json:{places:[place,replacement].filter(p=>!deletedPlaceIds.has(p.id))}});
  if(url.pathname.endsWith('/inspirations'))return route.fulfill({json:{inspirations:[]}});
  if(url.pathname==='/api/account/reels')return route.fulfill({json:{reels:[],places:[]}});
  if(url.pathname.startsWith('/fonts/'))return route.fulfill({path:path.join('apps/web/.next/dev/static/media',path.basename(url.pathname))});
  if(url.hostname==='maps.google.com'){
    if(holdMap)return; // Intentionally unresolved frame; essentials must remain usable.
    return route.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#e7eef3;display:grid;place-content:center;height:100vh;font:14px Arial;color:#45566a">Synthetic Google frame<br>No live map loaded</body>'});
  }
  if(url.hostname==='tile.openstreetmap.org')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e7eef3"/></svg>'});
  if(url.hostname==='images.unsplash.com')return route.abort();
  if(url.hostname==='trips.test'&&!url.pathname.startsWith('/api/'))return route.fulfill({contentType:'text/html',body:html});
  unexpected.push(url.href);return route.abort();
});
const open=async(url=`/my-trip/${testTrip.id}/itinerary?day=1`)=>{
  await page.goto(`${base}${url}`,{waitUntil:'domcontentloaded'});
  await page.locator('.trip-day-workspace,.all-trips-list,.trips-error,.trips-filter-empty,.trips-body,.route-map,.builder-choose-list,.share-page').first().waitFor();
  await page.evaluate(()=>document.fonts.ready);
};
const selectStop=async()=>{
  await page.locator('.stop-scroll').evaluate(el=>{el.scrollTop=0;});
  const target=page.locator('.stop-card-text').filter({hasText:'Synthetic Sky Deck'});
  await target.evaluate(el=>el.scrollIntoView({block:'center'}));
  await target.click();
};
const noOverflow=()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
try {
  await open(`/my-trip/${testTrip.id}/itinerary`);
  await page.getByRole('heading',{name:'Day 1',exact:true}).waitFor();
  const edit=await page.getByRole('button',{name:'Edit day',exact:true}).boundingBox();
  const heading=await page.locator('#day-title').boundingBox();
  assert.ok(Math.abs(edit.y-heading.y)<45);
  assert.equal(await page.locator('.stop-handle').count(),0);
  pass('Destination calendar day selected; Edit day is beside its heading; no false drag handle');
  await selectStop();
  let panel=page.getByRole('complementary',{name:'Details for Synthetic Sky Deck'});
  assert.equal(await panel.getByRole('link',{name:/on Google Maps/}).getAttribute('href'),'https://maps.google.com/?cid=123');
  assert.match(await panel.locator('.selected-place-hours').innerText(),/Thu hours · 09:00–18:00/);
  for(const [width,height] of [[1440,900],[1280,720],[1280,600]]){
    await page.setViewportSize({width,height});
    const detail=await panel.getByRole('link',{name:'Full details'}).boundingBox();
    assert.ok(detail.y+detail.height<height,`details must be visible at ${width}x${height}`);
    assert.ok(await noOverflow());
  }
  await page.screenshot({path:`${output}/selected-desktop.png`,fullPage:true});
  pass('Confirmed title link, planned-day hours and Full details visible together, including short laptop');
  await page.locator('.stop-scroll').evaluate(el=>{el.scrollTop=180;});
  await page.getByRole('link',{name:'Full details'}).click();
  await page.locator('.place-page').waitFor();
  assert.match(await page.getByRole('link',{name:'Back to day 1'}).getAttribute('href'),/day=1&stop=stop_sky/);
  await page.goBack();
  await page.getByRole('link',{name:'Full details'}).waitFor();
  assert.equal(await page.locator('.stop-scroll').evaluate(el=>Math.round(el.scrollTop)),180);
  pass('Full-details browser return restores selected day, stop and list scroll');
  await page.getByRole('navigation',{name:'Trip sections'}).getByRole('link',{name:'Map',exact:true}).click();
  // Without a browser Embed key there is no route view, so no map-style toggle; stops show one at a time on Google Maps.
  assert.equal(await page.getByRole('group',{name:'Map style'}).count(),0);
  await page.locator('.route-map iframe').waitFor();
  assert.match(await page.locator('.route-map iframe').getAttribute('src'),/hl=en/);
  await page.locator('.route-stop').filter({hasText:'Break'}).click();
  await page.getByText('No saved location for this stop.').waitFor();
  assert.equal(await page.locator('.route-map iframe').count(),0);
  await page.locator('.route-stop').filter({hasText:'Synthetic Sky Deck'}).click();
  pass('Selecting a stop without coordinates never substitutes a different place on the map');
  await page.getByRole('button',{name:'Whole trip',exact:true}).click();
  await page.getByRole('group',{name:'Select mapped stop'}).getByRole('button',{name:/Synthetic second-day stop/}).click();
  assert.match(await page.locator('.route-map iframe').getAttribute('src'),/35.66%2C139.72/);
  await page.getByRole('link',{name:'View in day 2'}).click();
  await page.getByRole('heading',{name:'Day 2',exact:true}).waitFor();
  assert.match(page.url(),/stop=day_two_stop/);
  pass('Google coordinates follow map selection and retain day/stop when returning to itinerary');
  assert.equal(requests.some(url=>url.includes('openstreetmap')),false,'Maps never request OpenStreetMap tiles');

  await open();
  await page.getByRole('button',{name:'Edit day',exact:true}).click();
  await page.getByRole('heading',{name:'Editing day 1'}).waitFor();
  assert.equal(await page.locator('.stop-card.is-reservation .stop-edit-actions').count(),0);
  const sources=page.getByRole('list',{name:'Add a place to day 1'});
  await sources.getByText(/not on a day|Every place is on a day/).waitFor();
  assert.deepEqual((await sources.locator('.add-source-text strong').allTextContents()),['From this trip','From your saves','Search places']);
  await sources.getByText(/None in .* yet|\d+ in /).waitFor();
  await page.screenshot({path:`${output}/edit-add-sources.png`});
  await sources.getByRole('button',{name:/From your saves/}).click();
  const picker=page.getByRole('dialog',{name:'Add a place to day 1'});
  assert.equal(await picker.getByRole('tab',{name:'Saved places'}).getAttribute('aria-selected'),'true');
  await picker.getByRole('button',{name:'Close'}).click();
  await sources.getByRole('button',{name:/Search places/}).click();
  assert.equal(await picker.getByRole('tab',{name:'Search'}).getAttribute('aria-selected'),'true');
  await picker.getByRole('button',{name:'Close'}).click();
  pass('Edit panel offers three sources with counts; each opens the place picker on that source');
  holdEdit=true;
  await page.getByRole('button',{name:'Move Synthetic Sky Deck later'}).click();
  await page.getByRole('status').filter({hasText:'Saving'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Done',exact:true}).isDisabled(),true);
  holdEdit=false;releaseEdit();
  await page.getByRole('status').filter({hasText:'Saved'}).waitFor();
  assert.equal(await page.locator('.stop-card-text strong').nth(1).innerText(),'Synthetic Sky Deck');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.stop-card-text strong')?.textContent==='Synthetic Sky Deck');
  assert.equal(editRequests.at(-1).expectedVersion,2);
  assert.equal(editRequests.at(-1).edit.toIndex,0);
  assert.deepEqual(itinerary.days[0].stops.find(s=>s.kind==='reservation'),original.days[0].stops.find(s=>s.kind==='reservation'));
  pass('Moves show Saving then Saved; Undo uses current server version; locked booking remains fixed');
  editMode='reject';
  await page.getByRole('button',{name:'Move Synthetic Sky Deck later'}).click();
  await page.getByRole('alert').filter({hasText:'This move overlaps'}).waitFor();
  assert.equal(await page.locator('.stop-card-text strong').first().innerText(),'Synthetic Sky Deck');
  assert.equal(await page.locator('.day-main [role=alert]').count(),1);
  await page.screenshot({path:`${output}/edit-rejected.png`,fullPage:true});
  editMode='stale';
  await page.getByRole('button',{name:'Move Synthetic Sky Deck later'}).click();
  await page.getByRole('alert').filter({hasText:'newer itinerary'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Undo',exact:true}).count(),0);
  editMode='success';
  await page.getByRole('button',{name:'Move Synthetic Sky Deck later'}).click();
  await page.getByRole('status').filter({hasText:'Saved'}).waitFor();
  assert.equal(editRequests.at(-1).expectedVersion,4);
  pass('Rejected edit stays unchanged with adjacent explanation; stale response reloads before next save');

  itinerary=structuredClone(original);
  itinerary.unscheduledPlaceIds=[replacement.id];
  await open();
  await page.getByRole('button',{name:'Edit day',exact:true}).click();
  const versionBeforePreview=itinerary.version;
  await page.getByRole('button',{name:'Edit Synthetic Sky Deck'}).click();
  await page.getByRole('dialog',{name:'Synthetic Sky Deck'}).getByRole('button',{name:'Swap for another place'}).click();
  await page.getByRole('dialog',{name:'Swap Synthetic Sky Deck'}).getByRole('button',{name:`Swap in ${replacement.name}`}).click();
  const previewDialog=page.getByRole('dialog',{name:'Replace Synthetic Sky Deck'});
  await previewDialog.waitFor();
  assert.match(await previewDialog.innerText(),/Preview · not saved/i);
  assert.equal(editRequests.at(-1).dryRun,true);
  assert.equal(itinerary.version,versionBeforePreview);
  await previewDialog.getByRole('button',{name:'Apply replacement'}).click();
  await page.getByRole('status').filter({hasText:'Saved'}).waitFor();
  assert.equal(editRequests.at(-1).edit.type,'replace_stop');
  assert.notEqual(editRequests.at(-1).dryRun,true);
  assert.equal(itinerary.version,versionBeforePreview+1);
  pass('Swap from the stop editor is server-previewed without saving, then applied explicitly against the saved version');

  itinerary=structuredClone(original);
  itinerary.unscheduledPlaceIds=[replacement.id];
  for(const width of [820,390,320]){
    await page.setViewportSize({width,height:844});
    await open();await selectStop();
    const sheet=page.getByRole('dialog',{name:'Details for Synthetic Sky Deck'});
    await sheet.waitFor();
    assert.ok(await sheet.evaluate(el=>el.contains(document.activeElement)));
    const full=await sheet.getByRole('link',{name:'Full details'}).boundingBox();
    assert.ok(full.y>=0&&full.y+full.height<844);
    assert.ok(await noOverflow());
    await sheet.getByRole('button',{name:'Add a note for Synthetic Sky Deck'}).click();
    await page.getByRole('dialog',{name:'Notes'}).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await sheet.isVisible(),true);
    await sheet.getByRole('button',{name:'Close place details'}).focus();
    await page.keyboard.press('Shift+Tab');
    assert.ok(await sheet.evaluate(el=>el.contains(document.activeElement)));
    if(width===390)await page.screenshot({path:`${output}/selected-mobile.png`});
    await page.keyboard.press('Escape');
    assert.equal(await sheet.count(),0);
    assert.match(await page.evaluate(()=>document.activeElement?.textContent??''),/Synthetic Sky Deck/);
    assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
    await page.getByRole('button',{name:'Edit day',exact:true}).click();
    assert.ok(await noOverflow());
  }
  pass('Tablet/390px/320px sheet: visible details, focus containment, nested notes, Escape and focus/scroll return');
  await page.emulateMedia({reducedMotion:'reduce'});
  await open();await selectStop();
  assert.equal(await page.locator('.trip-place-sheet').evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.addStyleTag({content:'html{font-size:200%}'});
  assert.ok(await noOverflow());
  await page.locator('.trip-place-sheet').getByRole('button',{name:'Close place details'}).click();
  pass('Sheet respects reduced motion; 200% text remains horizontally contained');

  await page.setViewportSize({width:1280,height:720});
  place.selected.details.openingHours={status:'unknown'};
  holdMap=true;
  await open();await selectStop();
  await page.clock.runFor(12500);
  assert.match(await page.locator('.selected-place-hours').innerText(),/Hours unknown[\s\S]*Check before visiting/);
  assert.equal(await page.getByRole('link',{name:'Full details'}).isVisible(),true);
  assert.match(await page.locator('.trip-google-loading').innerText(),/longer to load/);
  holdMap=false;
  pass('Unknown hours remain unknown; delayed map does not block title, hours or Full details');
  place.selected.details.openingHours={status:'known',windows:[]};
  itinerary.days[0].stops[0].hoursCheck='closed';
  await open();await selectStop();
  assert.match(await page.locator('.selected-place-hours').innerText(),/Closed on Thu[\s\S]*outside these hours/);
  place.selected.details.provider='fixture';
  await open();await selectStop();
  assert.equal(await page.locator('.panel-place-name a').count(),0);
  await page.getByText('Synthetic sample place; not a real venue.').waitFor();
  assert.match(await page.locator('.trip-google-caption').innerText(),/Sample coordinates/);
  pass('Closed hours warn; fixture venue is labelled synthetic and has no false canonical place link');

  await open('/my-trip/all');
  await page.getByRole('button',{name:/^Upcoming /}).click();
  assert.equal(await page.locator('.all-trips-row').count(),18);
  await page.getByRole('searchbox',{name:'Search trip or destination'}).fill('Kyoto');
  await page.getByLabel('Sort trips').selectOption('oldest');
  assert.equal(await page.locator('.all-trips-name strong').first().innerText(),'Kyoto plan 1');
  await page.locator('.all-trips-list').evaluate(el=>el.scrollTop=200);
  await page.locator('.all-trips-row').nth(3).click();
  await page.locator('.trip-day-workspace').waitFor();
  await page.goBack();
  await page.locator('.all-trips-list').waitFor();
  assert.equal(await page.getByRole('searchbox').inputValue(),'Kyoto');
  assert.equal(await page.getByLabel('Sort trips').inputValue(),'oldest');
  assert.equal(await page.locator('.all-trips-list').evaluate(el=>Math.round(el.scrollTop)),200);
  pass('Upcoming includes future drafts; search, sort, filter and list scroll survive trip/browser return');
  for(const width of [1440,820,390,320]){
    await page.setViewportSize({width,height:900});
    assert.ok(await noOverflow(),`all trips overflow at ${width}`);
    assert.equal(await page.locator('.all-trips-dates').first().isVisible(),true);
    assert.equal(await page.locator('.all-trips-status').first().isVisible(),true);
    await page.screenshot({path:`${output}/all-trips-${width}.png`});
  }
  await page.getByRole('searchbox').fill('No matching destination');
  await page.getByRole('button',{name:'Clear filters'}).click();
  assert.equal(await page.locator('.all-trips-row').count(),20);
  rejectList=true;await open('/my-trip/all');
  assert.equal(await page.locator('.trips-filter-empty').count(),0);
  rejectList=false;await page.getByRole('button',{name:'Try again'}).click();
  await page.locator('.all-trips-list').waitFor();
  pass('All Trips retains mobile dates/status, no overflow, empty-filter recovery and distinct retryable errors');

  itinerary=structuredClone(original);
  itinerary.days[0].stops[0].travelMinutesBefore=15;
  itinerary.days[0].stops[2].travelMinutesBefore=null;
  await page.setViewportSize({width:1280,height:800});
  await open();
  assert.equal(await page.getByText('Travel time unknown · arrival not checked',{exact:true}).count(),0);
  assert.equal(await page.getByText('Travel time partly unknown',{exact:true}).count(),0);
  await page.locator('.stop-card-text').filter({hasText:'Break'}).click();
  assert.equal(await page.getByText('Travel time unknown · arrival not checked',{exact:true}).count(),0);
  await open(`/my-trip/${testTrip.id}/map?day=1`);
  assert.equal(await page.getByText('Travel time unknown · arrival not checked',{exact:true}).count(),0);
  assert.equal(await page.getByText('Travel time partly unknown',{exact:true}).count(),0);
  pass('Nullable travel remains visible in itinerary details while the map leaves unknown estimates blank');

  place={...place,id:'unverified_sample',name:'Synthetic extracted name',status:'unverified',selected:null,options:[],evidence:[{...place.evidence[0],clue:'Synthetic extracted name',hint:'near the station'}]};
  await open(`/my-trip/${testTrip.id}/places`);
  const row=page.locator('.builder-choose-card').filter({hasText:'Synthetic extracted name'});
  await row.waitFor();
  assert.match(await row.innerText(),/Location not looked up yet/);
  assert.match(await row.innerText(),/near the station/);
  assert.equal(await row.getByRole('button',{name:/Confirm/}).count(),0);
  assert.equal(await row.getByRole('button',{name:'Find location'}).count(),1);
  assert.equal(await row.getByRole('checkbox').count(),1);
  assert.equal(await page.locator('.places-page iframe').count(),0);
  pass('Unverified ideas can be ticked, retain source hints and offer lookup without branch confirmation or a map');

  await page.getByRole('button',{name:'Select all'}).click();
  await page.getByRole('button',{name:'Clear all'}).click();
  await page.getByRole('button',{name:'Save no places'}).click();
  assert.deepEqual(selectionRequests.at(-1).placeIds,[]);
  await open(`/my-trip/${testTrip.id}/places`);
  assert.equal(await page.locator('.builder-choose-card input:checked').count(),0);
  testTrip={...testTrip,selectedPlaceIds:undefined};
  pass('Clear all can persist an empty place selection from the Places page');

  stale=true;
  await open(`/my-trip/${testTrip.id}/share`);
  await page.getByText(/Viewers cannot see the outdated plan/).waitFor();
  assert.equal(await page.locator('.preview-stops').count(),0);
  assert.equal(await page.getByRole('link',{name:'Go to the itinerary'}).getAttribute('href'),`/my-trip/${testTrip.id}/itinerary`);
  pass('Stale owner sharing preview withholds saved stops and points back to the redesigned itinerary');
  place=structuredClone(placeFixtures.confirmed);
  await page.setViewportSize({width:1280,height:800});
  await open();
  const updateToast=page.locator('.itin-update-toast');
  await updateToast.waitFor();
  const updateToastBox=await updateToast.boundingBox();
  assert.ok(updateToastBox.width<=360&&updateToastBox.height<100,'Planning update should be a compact overlay');
  assert.equal(await updateToast.evaluate(el=>getComputedStyle(el).position),'fixed');
  await page.screenshot({path:`${output}/planning-update.png`});
  await updateToast.getByRole('button',{name:'Dismiss planning update'}).click();
  await updateToast.waitFor({state:'hidden'});
  assert.equal(await page.getByRole('button',{name:'Review & regenerate'}).isVisible(),true);
  await page.getByRole('button',{name:'Review & regenerate'}).click();
  const review=page.getByRole('dialog',{name:'Make room for your latest plans'});
  await review.waitFor();
  assert.match(await review.innerText(),/Manual stop order and schedule edits will be replaced/);
  assert.equal(await review.getByRole('button',{name:'Keep current schedule'}).evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Escape');
  assert.equal(generateRequests.length,0);
  assert.equal(await page.getByRole('button',{name:'Review & regenerate'}).evaluate(el=>el===document.activeElement),true);
  await page.getByRole('button',{name:'Review & regenerate'}).click();
  await review.getByRole('button',{name:'Keep current schedule'}).click();
  assert.equal(generateRequests.length,0);
  await page.getByRole('button',{name:'Review & regenerate'}).click();
  await page.screenshot({path:`${output}/regeneration-review.png`});
  const beforeVersion=itinerary.version;
  await review.getByRole('button',{name:'Regenerate itinerary',exact:true}).click();
  await page.getByRole('button',{name:'Review & regenerate'}).waitFor({state:'hidden'});
  assert.deepEqual(generateRequests,[{expectedVersion:beforeVersion}]);
  await page.getByRole('button',{name:'Edit day',exact:true}).click();
  await page.locator('.day-more summary').click();
  await page.locator('.day-more').getByRole('button',{name:'Regenerate itinerary'}).click();
  await review.waitFor();await page.keyboard.press('Escape');
  for(const width of [1280,390,320]){
    await page.setViewportSize({width,height:800});
    const move=page.locator('.stop-edit-actions .icon-btn').first();
    const box=await move.boundingBox();assert.ok(box.width>=44&&box.height>=44);
    assert.notEqual(await move.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
    assert.ok(await noOverflow());
  }
  pass('Planning update is a compact dismissible overlay; the persistent review action explains replacement; cancel and Escape do not write; confirmation uses saved version; reorder targets are 44px');

  for(const width of [1440,1100,1024,921,820,390,320]){
    await page.setViewportSize({width,height:850});
    await open();
    const nav=page.getByRole('navigation',{name:'Main navigation'});
    assert.equal(await nav.locator('[aria-current="page"]').innerText(),'My trips');
    assert.equal(await nav.getByRole('link').count(),4);
    for(const link of await nav.getByRole('link').all()){
      assert.equal(await link.isVisible(),true);
      const box=await link.boundingBox();assert.ok(box.height>=44);
      assert.ok(box.x>=0&&box.x+box.width<=width);
    }
    const firstNavBox=await nav.getByRole('link').first().boundingBox();
    const lastNavBox=await nav.getByRole('link').last().boundingBox();
    if(width>=921){
      assert.ok(Math.abs(firstNavBox.x-lastNavBox.x)<4&&lastNavBox.y>firstNavBox.y,'Desktop destinations should form a vertical rail');
      assert.ok((await page.locator('.app-stage').boundingBox()).x>=56,'Desktop content should clear the navigation rail');
    }else{
      assert.ok(lastNavBox.x>firstNavBox.x&&Math.abs(firstNavBox.y-lastNavBox.y)<4,'Mobile destinations should form a bottom dock');
    }
    const account=page.getByLabel('Account menu');
    await account.focus();await page.keyboard.press('Enter');
    await page.getByRole('button',{name:'Sign out'}).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('button',{name:'Sign out'}).isVisible(),false);
    assert.equal(await account.evaluate(el=>el===document.activeElement),true);
    assert.equal(await page.getByRole('link',{name:'New trip',exact:true}).getAttribute('href'),'/my-trip/new');
    assert.ok(await noOverflow());
    if(width<=390){const title=await page.locator('.trip-header-title').boundingBox();assert.ok(title.width>230&&title.height<70,'Trip title must occupy a readable row on phones');}
    if(width===1440||width===390)await page.screenshot({path:`${output}/navigation-${width}.png`});
  }
  pass('Vertical desktop rail, mobile dock, route state, creation link and keyboard account menu work at desktop, tablet and phone sizes');

  await page.setViewportSize({width:390,height:850});
  await page.goto(`${base}/my-trip/${testTrip.id}/place/${place.id}`);
  const deletePlaceButton=page.getByRole('button',{name:'Delete place'});
  await deletePlaceButton.waitFor();
  assert.ok(await noOverflow());
  await page.screenshot({path:path.join(os.tmpdir(),'reel-delete-place-mobile.png')});
  page.once('dialog',dialog=>dialog.dismiss());
  await deletePlaceButton.click();
  assert.equal(deletionRequests.length,0);
  rejectPlaceDelete=true;
  page.once('dialog',dialog=>dialog.accept());
  await deletePlaceButton.click();
  await page.getByText('Delete unavailable. Try again.').waitFor();
  assert.equal(deletionRequests.length,0);
  rejectPlaceDelete=false;
  page.once('dialog',dialog=>dialog.accept());
  await deletePlaceButton.click();
  await page.locator('.builder-choose-list').waitFor();
  assert.ok(deletionRequests.includes(`/api/trips/${testTrip.id}/places/${place.id}`));
  assert.equal((await page.locator('.builder-choose-copy strong').allInnerTexts()).includes(place.name),false);
  pass('Place details confirms deletion, then removes the place from the trip list');

  await open('/my-trip/all');
  const deleteTripButton=page.getByRole('button',{name:`Delete trip ${testTrip.title}`});
  await deleteTripButton.waitFor();
  page.once('dialog',dialog=>dialog.dismiss());
  await deleteTripButton.click();
  assert.equal(deletionRequests.length,1);
  page.once('dialog',dialog=>dialog.accept());
  await deleteTripButton.click();
  await deleteTripButton.waitFor({state:'detached'});
  assert.ok(deletionRequests.includes(`/api/trips/${testTrip.id}`));
  assert.ok(await noOverflow());
  await page.screenshot({path:path.join(os.tmpdir(),'reel-delete-trip-mobile.png')});
  pass('All trips confirms deletion and removes only the chosen trip row');

  if(!liveBase){
    for(const width of [1440,820,390,320]){
      await page.setViewportSize({width,height:900});
      await page.goto(`${base}/s/synthetic-cover`);
      await page.locator('.shared-view .mag-layout').waitFor();
      const cover=await page.locator('.itin-cover').boundingBox();
      assert.ok(cover.height<=280&&cover.height>=150);
      const tabs=await page.getByRole('navigation',{name:'Itinerary views'}).boundingBox();
      assert.ok(tabs.y+tabs.height<900);
      assert.ok(await noOverflow());
      assert.equal(await page.getByRole('button',{name:'Edit day'}).count(),0);
      if(width===1440||width===390)await page.screenshot({path:`${output}/shared-cover-${width}.png`});
    }
    pass('Shared illustrated covers stay below 280px with magazine navigation above the fold and no editing controls');
  }
  assert.deepEqual(unexpected,[]);
  assert.deepEqual(errors,[]);
  pass('No runtime errors or unexpected requests; every map is Google and no OpenStreetMap tile is requested; all external content intercepted');
  await writeFile(`${output}/results.json`,JSON.stringify({checks,errors,scope:liveBase?'Authenticated local Next runtime and native navigation; two owned synthetic trips. Display/edit API responses and Google frame intercepted; live edit persistence and live Google rendering not covered.':'Offline Chromium; real components/hooks/styles/API client, synthetic data and Google iframe. Native Next navigation, live persistence and live Google rendering are not covered.'},null,2));
} catch (error) {
  console.error({ errors, unexpected, body: (await page.locator('body').innerText()).slice(0,1800) });
  await page.screenshot({path:`${output}/failure.png`,fullPage:true});
  throw error;
} finally { await browser.close(); }
