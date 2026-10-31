#!/usr/bin/env node
/** nike-ksd.mjs — capture Nike's KPSDK flow: p.js load, api.nike.com protected
 *  calls + x-kpsdk-* headers, the cd payload. Clean Chrome attach. */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const b = await chromium.connectOverCDP('http://127.0.0.1:9233');
const ctx = b.contexts()[0];
const page = ctx.pages().find(p=>p.url().includes('nike')) || ctx.pages()[0];
const log = { requests:[], posts:[], bundles:{} };
page.on('request', req => {
  const u = req.url();
  const h = req.headers();
  if (/api\.nike\.com|p\.js|kpsdk/.test(u)) {
    log.requests.push({ method: req.method(), url: u.slice(0,170), hasCd:!!h['x-kpsdk-cd'], hasCt:!!h['x-kpsdk-ct'], v:h['x-kpsdk-v']||null });
    if (h['x-kpsdk-cd']) log.posts.push({ url:u.slice(0,120), cd:h['x-kpsdk-cd'], ct:h['x-kpsdk-ct']||null, h:h['x-kpsdk-h']||null, v:h['x-kpsdk-v']||null });
  }
});
page.on('response', async r => {
  const u=r.url();
  if (/p\.js/.test(u)) { try{ log.bundles[u]=await r.text(); }catch(_){} }
  if (/api\.nike\.com/.test(u)) {
    const h=r.headers();
    if (h['x-kpsdk-ct']||h['x-kpsdk-r']) log.posts.push({url:u.slice(0,100)+' [RESP]', status:r.status(), hdrs:Object.fromEntries(Object.entries(h).filter(([k])=>k.includes('kpsdk')))});
  }
});
await page.goto('https://www.nike.com/', { waitUntil:'load', timeout:60000 }).catch(()=>{});
await page.waitForTimeout(15000);
// try hitting a product + checkout API path to trigger KPSDK
await page.goto('https://www.nike.com/w/mens-shoes-nik1zy7ok', { waitUntil:'load', timeout:60000 }).catch(()=>{});
await page.waitForTimeout(12000);
console.log('kpsdk reqs:', log.requests.filter(x=>x.hasCd||x.hasCt).length, '| api.nike calls:', log.requests.filter(x=>x.url.includes('api.nike')).length);
console.log('\n=== x-kpsdk-cd payloads ===');
for (const p of log.posts.slice(0,5)) {
  console.log('\n ', p.url);
  if (p.cd) console.log('  CD:', p.cd);
  if (p.ct) console.log('  CT:', (p.ct||'').slice(0,50));
  if (p.hdrs) console.log('  RESP HDRS:', JSON.stringify(p.hdrs).slice(0,200));
}
for (const [u,body] of Object.entries(log.bundles)) { writeFileSync('/tmp/opencode/nike/p.js_'+body.length, body); }
console.log('\np.js saved:', Object.keys(log.bundles).length);
writeFileSync('/tmp/opencode/nike/flow.json', JSON.stringify({requests:log.requests.slice(0,40), posts:log.posts},null,2));
await b.close();
