#!/usr/bin/env node
/** ksd-clean.mjs — attach to clean-launched Chrome on Vercel, capture the full
 *  KPSDK flow: challenge script, POST + x-kpsdk-* headers, payload bodies. */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
const b = await chromium.connectOverCDP('http://127.0.0.1:9228');
const ctx = b.contexts()[0];
const page = ctx.pages().find(p=>p.url().includes('vercel')) || ctx.pages()[0];
const log = { requests:[], bundles:{}, posts:[], hdrs:[] };
page.on('request', req => {
  const u = req.url();
  const hdrs = req.headers();
  if (/p\.js|c\.js|kasada|kpsdk|chal|\.js/.test(u)) {
    log.requests.push({ method: req.method(), type: req.resourceType(), url: u.slice(0,190) });
  }
  if (hdrs['x-kpsdk-v'] || hdrs['x-kpsdk-ct'] || hdrs['x-kpsdk-cd']) {
    log.posts.push({ url: u.slice(0,140), headers: hdrs, postData: (req.postData()||'').slice(0,4000) });
  }
});
page.on('response', async r => {
  const u = r.url();
  const hdrs = r.headers();
  if (hdrs['x-kpsdk-v'] || hdrs['x-kpsdk-ct']) log.hdrs.push({ url: u.slice(0,100), headers: hdrs });
  if (/p\.js|c\.js/.test(u)) { try { const body=await r.text(); log.bundles[u]=body; } catch(_){} }
});
await page.waitForTimeout(15000);
// also capture fetch bodies via init script on next reload
await page.goto('https://vercel.com/', { waitUntil:'load', timeout:60000 }).catch(()=>{});
await page.waitForTimeout(15000);
console.log('kpsdk POSTs:', log.posts.length, '| kpsdk resp headers:', log.hdrs.length);
for (const p of log.posts.slice(0,5)) { console.log('\n=== POST', p.url); console.log('  hdrs:', JSON.stringify(p.headers).slice(0,500)); console.log('  body:', (p.postData||'').slice(0,400)); }
for (const h of log.hdrs.slice(0,4)) console.log('\n=== RESP hdr', h.url, JSON.stringify(h.headers).slice(0,400));
mkdirSync('/tmp/opencode/ksd/clean',{recursive:true});
for (const [u,body] of Object.entries(log.bundles)) { const n='p_'+(u.split('/').pop().split('?')[0]); writeFileSync('/tmp/opencode/ksd/clean/'+n, body); }
console.log('\nbundles saved:', Object.keys(log.bundles).length);
writeFileSync('/tmp/opencode/ksd/clean-flow.json', JSON.stringify({posts:log.posts,hdrs:log.hdrs,requests:log.requests.slice(0,40)},null,2));
await b.close();
