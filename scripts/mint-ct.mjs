#!/usr/bin/env node
// mint-ct.mjs — mint a fresh Kasada `x-kpsdk-ct` WITHOUT running the VM.
// Works against the shared merchant build j-1.2.940 (Twitch / Nike / FootLocker).
//
// Key finding: a plain GET of the public ips.js asset returns a FRESH CLEARED
// ct in the `x-kpsdk-ct` response header. The bytecode VM and /tl handshake
// are not verified by this deployment; x-kpsdk-cd and x-kpsdk-h are
// presence-checked only.
//
// Flow:
//   0. (optional) GET /fp?x-kpsdk-v=... -> observe 429 + preflight ct + difficulty
//   1. GET <origin>/<uuid>/<uuid>/ips.js -> x-kpsdk-ct (fresh, cleared)
//   2. (--verify) POST gql.twitch.tv/integrity with minted ct -> v4.local token
//
// Usage: node mint-ct.mjs [--verify]
'use strict';

const MERCHANT = {
  twitch: {
    origin: 'https://k.twitchcdn.net',
    uuid1: '149e9513-01fa-4fb0-aad4-566afd725d1b',
    uuid2: '2d206a39-8ed7-437e-a3be-862e0f06eea3',
    version: 'j-1.2.940',
    protected: {
      url: 'https://gql.twitch.tv/integrity',
      method: 'POST',
      clientId: 'kimne78kx3ncx6brgo4mv6wki5h1ko',
      origin: 'https://www.twitch.tv',
      referer: 'https://www.twitch.tv/',
      body: 'null',
    },
  },
};

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

// x-kpsdk-cd / x-kpsdk-h are presence-checked on this endpoint: any JSON +
// any token-shaped value works (confirmed 2026-10-31 by modify-test, reconfirmed).
const CD = JSON.stringify({
  workTime: Date.now(), id: 'a1ea1d56b8f21d46a70ee2f1e543059b',
  answers: [2, 4], duration: 36, d: 45,
  st: Date.now() - 10000, rst: Date.now() - 10000,
});
const H = '01F47DxTPakzMm2tqdC3JSScDjKyQ=';

async function mint(m) {
  // step 0: observe the challenge (informational)
  const fpUrl = `${m.origin}/${m.uuid1}/${m.uuid2}/fp?x-kpsdk-v=${m.version}`;
  const fp = await fetch(fpUrl, { headers: { 'user-agent': UA, referer: m.protected.referer } });
  const preflight = fp.headers.get('x-kpsdk-ct');
  const difficulty = fp.headers.get('x-kpsdk-r');
  console.log(`[fp]   ${fp.status} preflight ct=${preflight ? preflight.slice(0, 24) + '…' : 'none'} r=${difficulty}`);

  // step 1: mint cleared ct
  const ipsUrl = `${m.origin}/${m.uuid1}/${m.uuid2}/ips.js`;
  const r = await fetch(ipsUrl, { headers: { 'user-agent': UA, referer: m.protected.referer, accept: '*/*' } });
  const ct = r.headers.get('x-kpsdk-ct');
  const st = r.headers.get('x-kpsdk-r');
  console.log(`[ips]  ${r.status} cleared ct=${ct ? ct.slice(0, 24) + '…' : 'NONE'} (len=${ct ? ct.length : 0}) r=${st}`);
  if (!ct) throw new Error('mint failed: no x-kpsdk-ct on ips.js response');
  return { ct, preflight, difficulty };
}

async function verify(m, ct) {
  const hdrs = {
    'user-agent': UA,
    accept: '*/*',
    referer: m.protected.referer,
    origin: m.protected.origin,
    'client-id': m.protected.clientId,
    'content-type': 'text/plain;charset=UTF-8',
    'x-kpsdk-ct': ct,
    'x-kpsdk-v': m.version,
    'x-kpsdk-cd': CD,
    'x-kpsdk-h': H,
  };
  const r = await fetch(m.protected.url, { method: m.protected.method, headers: hdrs, body: m.protected.body });
  const body = await r.text();
  const token = (body.match(/"token":"([^"]+)"/) || [])[1];
  const rotated = r.headers.get('x-kpsdk-ct');
  console.log(`[use]  ${r.status} token=${token ? 'v4.local ' + token.slice(0, 24) + '…' : body.slice(0, 120)}`);
  console.log(`[rot]  server rotated ct to ${rotated ? rotated.slice(0, 24) + '…' : 'none'}`);
  return r.status === 200;
}

const verifyFlag = process.argv.includes('--verify');
const m = MERCHANT.twitch;
const { ct } = await mint(m);
console.log(`MINTED ct = ${ct}`);
if (verifyFlag) {
  const ok = await verify(m, ct);
  console.log(ok ? 'VERIFY: minted ct accepted on protected endpoint' : 'VERIFY: FAILED');
}
