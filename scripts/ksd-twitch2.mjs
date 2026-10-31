#!/usr/bin/env node
/** ksd-twitch2.mjs — KPSDK is live; drive the full challenge: dismiss consent,
 *  reload with capture, harvest /tl POST + x-kpsdk-* on gql requests. */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const b = await chromium.connectOverCDP('http://127.0.0.1:9231');
const ctx = b.contexts()[0];
const page = ctx.pages().find(p=>p.url().includes('twitch.tv/') && !p.url().includes('gql')) || ctx.pages()[0];
const log = { requests:[], posts:[], respHdrs:[], bundles:{} };
page.on('request', req => {
  const u = req.url();
  const h = req.headers();
  if (/\/tl|\/fp|ips\.js|p\.js/.test(u) || h['x-kpsdk-cd'] || h['x-kpsdk-ct']) {
    log.requests.push({ method: req.method(), url: u.slice(0,160), hasCd: !!h['x-kpsdk-cd'], hasCt: !!h['x-kpsdk-ct'] });
    if (req.method()==='POST') log.posts.push({ url: u.slice(0,140), postData: (req.postData()||'').slice(0,5000), headers: h });
  }
});
page.on('response', async r => {
  const u = r.url();
  const h = r.headers();
  if (h['x-kpsdk-ct'] || h['x-kpsdk-r']) log.respHdrs.push({ url: u.slice(0,100), status: r.status(), hdrs: Object.fromEntries(Object.entries(h).filter(([k])=>k.includes('kpsdk'))) });
  if (/ips\.js|p\.js/.test(u)) { try { log.bundles[u]=await r.text(); } catch(_){} }
  if (/\/tl/.test(u)) { try { log.posts.push({ url: u.slice(0,120)+' [RESP]', resp: (await r.text()).slice(0,800), hdrs: Object.fromEntries(Object.entries(h).filter(([k])=>k.includes('kpsdk'))) }); } catch(_){} }
});
// dismiss cookie consent if present
try {
  const btns = page.locator('button:has-text("Accept"), button:has-text("I Accept"), button:has-text("Agree"), [data-a-target*="consent"]').first();
  await btns.click({ timeout:4000 }).catch(()=>{});
} catch(_){}
await page.waitForTimeout(2000);
await page.goto('https://www.twitch.tv/', { waitUntil:'load', timeout:60000 }).catch(()=>{});
await page.waitForTimeout(10000);
await page.goto('https://www.twitch.tv/directory/gaming', { waitUntil:'load', timeout:60000 }).catch(()=>{});
await page.waitForTimeout(15000);
console.log('kasada reqs:', log.requests.length, '| /tl posts:', log.posts.filter(p=>p.url.includes('/tl')).length, '| respHdrs:', log.respHdrs.length);
console.log('\n=== /tl POSTs ===');
for (const p of log.posts.filter(x=>x.url.includes('/tl')).slice(0,3)) {
  console.log('\n  ', p.url);
  if (p.postData) console.log('   body:', p.postData.slice(0,500));
  if (p.resp) console.log('   resp:', p.resp.slice(0,400));
  if (p.hdrs) console.log('   hdrs:', JSON.stringify(p.hdrs).slice(0,300));
}
console.log('\n=== requests with x-kpsdk-cd/ct ===');
for (const r of log.requests.filter(x=>x.hasCd||x.hasCt).slice(0,6)) console.log(' ', r.method, r.url, 'cd:'+r.hasCd, 'ct:'+r.hasCt);
console.log('\n=== x-kpsdk response headers ===');
for (const h of log.respHdrs.slice(0,4)) console.log(' ', h.status, h.url, JSON.stringify(h.hdrs).slice(0,200));
for (const [u,body] of Object.entries(log.bundles)) writeFileSync('/tmp/opencode/ksd/twitch/ipjs_'+body.length, body);
writeFileSync('/tmp/opencode/ksd/twitch-flow2.json', JSON.stringify({requests:log.requests, posts:log.posts, respHdrs:log.respHdrs},null,2));
await b.close();
