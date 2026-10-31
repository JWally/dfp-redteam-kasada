#!/usr/bin/env node
/** ksd-modify.mjs — test whether Kasada's x-kpsdk-cd proof is actually
 *  VERIFIED or just presence-checked. Capture a real cd, then replay with
 *  modifications against gql.twitch.tv/integrity (user-agent + cookie from
 *  the live session). Read-only experiment on a public endpoint. */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const b = await chromium.connectOverCDP('http://127.0.0.1:9231');
const ctx = b.contexts()[0];
const page = ctx.pages().find(p=>p.url().includes('twitch.tv/')) || ctx.pages()[0];

// grab a live capture first
let live = null;
page.on('request', req => {
  const u=req.url();
  if(/integrity/.test(u)){
    const h=req.headers();
    if (h['x-kpsdk-cd'] && !live) live = { ct:h['x-kpsdk-ct'], cd:h['x-kpsdk-cd'], h:h['x-kpsdk-h'], v:h['x-kpsdk-v'], devId:h['x-device-id'], csid:h['client-session-id'], crid:h['client-request-id'] };
  }
});
await page.reload({waitUntil:'load',timeout:60000}).catch(()=>{});
await page.waitForTimeout(9000);
// also get cookies
const cookies = await ctx.cookies().catch(()=>[]);
writeFileSync('/tmp/opencode/ksd/live-capture.json', JSON.stringify({live, cookies: cookies.filter(c=>/KP_|twitch/i.test(c.name)).map(c=>({name:c.name,value:c.value.slice(0,60)}))},null,2));
console.log('live capture:', live ? JSON.stringify({ct:live.ct?.slice(0,30), cd:live.cd, v:live.v}) : 'none');
await b.close();
