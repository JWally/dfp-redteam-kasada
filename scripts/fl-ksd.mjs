#!/usr/bin/env node
/** fl-ksd.mjs — Foot Locker KPSDK: capture /api/* calls + x-kpsdk-cd payload. */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const b = await chromium.connectOverCDP('http://127.0.0.1:9237');
const ctx = b.contexts()[0];
const page = ctx.pages().find(p=>p.url().includes('footlocker')) || ctx.pages()[0];
const log = { requests:[], posts:[] };
page.on('request', req => {
  const u = req.url();
  const h = req.headers();
  if (/footlocker|p\.js/.test(u)) {
    log.requests.push({ method: req.method(), url: u.slice(0,150), hasCd:!!h['x-kpsdk-cd'], hasCt:!!h['x-kpsdk-ct'], v:h['x-kpsdk-v']||null });
    if (h['x-kpsdk-cd']) log.posts.push({ url:u.slice(0,100), cd:h['x-kpsdk-cd'], ct:h['x-kpsdk-ct']||null, h:h['x-kpsdk-h']||null, v:h['x-kpsdk-v']||null });
  }
});
page.on('response', async r => {
  const u=r.url();
  if (/api\//.test(u) && /footlocker/.test(u)) {
    const h=r.headers();
    if (h['x-kpsdk-ct']||h['x-kpsdk-r']) log.posts.push({url:u.slice(0,100)+' [RESP]', status:r.status(), hdrs:Object.fromEntries(Object.entries(h).filter(([k])=>k.includes('kpsdk')))});
  }
});
await page.goto('https://www.footlocker.com/', { waitUntil:'load', timeout:60000 }).catch(()=>{});
await page.waitForTimeout(15000);
// browse to trigger /api calls
await page.goto('https://www.footlocker.com/category/shoes.html', { waitUntil:'load', timeout:60000 }).catch(()=>{});
await page.waitForTimeout(12000);
console.log('kpsdk reqs:', log.requests.filter(x=>x.hasCd||x.hasCt).length, '| /api calls:', log.requests.filter(x=>x.url.includes('/api/')).length);
console.log('\n=== x-kpsdk-cd payloads ===');
for (const p of log.posts.slice(0,8)) {
  console.log('\n ', p.url);
  if (p.cd) console.log('  CD:', p.cd);
  if (p.ct) console.log('  CT:', (p.ct||'').slice(0,50));
  if (p.hdrs) console.log('  RESP:', JSON.stringify(p.hdrs).slice(0,200));
}
writeFileSync('/tmp/opencode/fl/flow.json', JSON.stringify({requests:log.requests.slice(0,40), posts:log.posts},null,2));
await b.close();
