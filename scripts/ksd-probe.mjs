#!/usr/bin/env node
/** ksd-probe.mjs — load Vercel (Kasada-protected), capture the KPSDK flow:
 *  p.js/c.js load, the POST with x-kpsdk-* headers, and the payload. */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
const b = await chromium.launch({ headless:true });
const ctx = await b.newContext({ viewport:{width:1280,height:900} });
const page = await ctx.newPage();
const log = { requests:[], bundles:{}, posts:[] };
page.on('request', req => {
  const u = req.url();
  if (/p\.js|c\.js|kasada|kpsdk|challenge|vchal|\.js/.test(u) && /vercel|kasada/.test(u)) {
    log.requests.push({ method: req.method(), type: req.resourceType(), url: u.slice(0,200) });
  }
  // capture any POST with kpsdk headers
  if (/POST/.test(req.method()) && (u.includes('kpsdk') || req.headers()['x-kpsdk-v'])) {
    log.posts.push({ url: u.slice(0,150), headers: req.headers(), postData: (req.postData()||'').slice(0,3000) });
  }
});
page.on('response', async r => {
  const u = r.url();
  if (/p\.js|c\.js|kasada/.test(u) && /\.js($|\?)/.test(u)) {
    try { const body = await r.text(); if (body.length > 5000) log.bundles[u] = body; } catch(_){}
  }
  // capture kpsdk response headers on any request
  const hdrs = r.headers();
  if (hdrs['x-kpsdk-v'] || hdrs['x-kpsdk-ct']) {
    log.posts.push({ url: u.slice(0,100)+' [HDR]', headers: hdrs });
  }
});
await page.goto('https://vercel.com/', { waitUntil:'load', timeout:60000 }).catch(()=>{});
await page.waitForTimeout(15000);
console.log('requests:', log.requests.length);
const hosts = {};
for (const r of log.requests) { try { hosts[new URL(r.url).host]=(hosts[new URL(r.url).host]||0)+1; } catch(_){} }
console.log('hosts:', JSON.stringify(hosts,null,1));
console.log('\n=== KPSDK POSTs / header marks ===');
for (const p of log.posts.slice(0,6)) { console.log('\n  ', p.url); if (p.headers) console.log('   hdrs:', JSON.stringify(p.headers).slice(0,400)); if (p.postData) console.log('   body:', p.postData.slice(0,400)); }
console.log('\n=== saved bundles ===');
for (const [u,body] of Object.entries(log.bundles)) { const n=u.split('/').pop().split('?')[0]; writeFileSync('/tmp/opencode/ksd/'+n, body); console.log('  ', n, Math.round(body.length/1024)+'KB'); }
writeFileSync('/tmp/opencode/ksd/probe1.json', JSON.stringify({posts:log.posts.slice(0,10), requests:log.requests.slice(0,40)},null,2));
await b.close();
