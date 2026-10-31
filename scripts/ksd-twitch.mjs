#!/usr/bin/env node
/** ksd-twitch.mjs — capture the FULL Kasada flow on Twitch: 429/fp response
 *  (x-kpsdk-ct preflight), ips.js VM load, /tl POST (enciphered payload),
 *  and the x-kpsdk-* headers on subsequent requests. Clean-launched Chrome. */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
const b = await chromium.connectOverCDP('http://127.0.0.1:9231');
const ctx = b.contexts()[0];
const page = ctx.pages().find(p=>p.url().includes('twitch')) || ctx.pages()[0];
const log = { requests:[], bundles:{}, posts:[], respHdrs:[] };
page.on('request', req => {
  const u = req.url();
  const hdrs = req.headers();
  if (/kpsdk|kasada|ips\.js|p\.js|twitch/.test(u) && (hdrs['x-kpsdk-v'] || /ips\.js|p\.js|\/tl|\/fp/.test(u))) {
    log.requests.push({ method: req.method(), type: req.resourceType(), url: u.slice(0,200), hdrs: hdrs['x-kpsdk-ct']?'has-ct':hdrs['x-kpsdk-cd']?'has-cd':null });
    if (/\/tl/.test(u)) log.posts.push({ url: u.slice(0,140), postData: (req.postData()||'').slice(0,4000), headers: hdrs });
  }
});
page.on('response', async r => {
  const u = r.url();
  const hdrs = r.headers();
  if (hdrs['x-kpsdk-ct'] || hdrs['x-kpsdk-r'] || hdrs['x-kpsdk-v']) {
    log.respHdrs.push({ url: u.slice(0,120), status: r.status(), headers: Object.fromEntries(Object.entries(hdrs).filter(([k])=>k.includes('kpsdk')||k.includes('set-cookie')||k==='content-type')) });
  }
  if (/ips\.js|p\.js/.test(u)) { try { const body=await r.text(); if (body.length>1000) log.bundles[u]=body; } catch(_){} }
  if (/\/tl/.test(u)) { try { log.posts.push({ url: u.slice(0,120)+' [RESP]', resp: (await r.text()).slice(0,600), headers: Object.fromEntries(Object.entries(hdrs).filter(([k])=>k.includes('kpsdk'))) }); } catch(_){} }
});
// reload fresh to catch the challenge
await page.goto('https://www.twitch.tv/', { waitUntil:'load', timeout:60000 }).catch(()=>{});
await page.waitForTimeout(18000);
// navigate to a directory page (more likely protected)
await page.goto('https://www.twitch.tv/directory', { waitUntil:'load', timeout:60000 }).catch(()=>{});
await page.waitForTimeout(15000);
console.log('kasada requests:', log.requests.length, '| respHdrs:', log.respHdrs.length);
console.log('\n=== x-kpsdk response headers ===');
for (const h of log.respHdrs.slice(0,8)) { console.log(' ', h.status, h.url); console.log('   ', JSON.stringify(h.headers).slice(0,400)); }
console.log('\n=== /tl posts ===');
for (const p of log.posts.slice(0,4)) { console.log('\n  ', p.url); if (p.postData) console.log('   body:', p.postData.slice(0,300)); if (p.resp) console.log('   resp:', p.resp.slice(0,300)); if (p.headers) console.log('   hdrs:', JSON.stringify(p.headers).slice(0,300)); }
mkdirSync('/tmp/opencode/ksd/twitch',{recursive:true});
for (const [u,body] of Object.entries(log.bundles)) { const n=(u.match(/ips\.js|p\.js/)||['x'])[0]+'-'+body.length; writeFileSync('/tmp/opencode/ksd/twitch/'+n, body); }
console.log('\nbundles:', Object.keys(log.bundles).length);
writeFileSync('/tmp/opencode/ksd/twitch-flow.json', JSON.stringify({respHdrs:log.respHdrs, posts:log.posts, requests:log.requests.slice(0,30)},null,2));
await b.close();
