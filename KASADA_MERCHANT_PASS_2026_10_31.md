# Kasada KPSDK — merchant deployment pass (2026-10-31)

**Subject:** Kasada's KPSDK as deployed on **Twitch.tv, Nike.com, and
FootLocker.com** — plaintext payload capture + modification testing.
**Method:** public-site analysis + clean-launch real Chrome (Kasada detects
headless/attached automation), full network capture, header-level
modification tests. Real API calls only against public endpoints of the
targets; no auth, no account data.

> **TL;DR — payload captured in plaintext, and the proof-of-work is
> presence-checked, not verified, on at least one protected path.** The
> `x-kpsdk-cd` per-request header is **readable JSON**; replaying it with
> garbage/wrong/empty values still returns HTTP 200 + a fresh encrypted
> session token on `gql.twitch.tv/integrity`. The real gate is the
> `x-kpsdk-ct` session token + IP/TLS binding, not the PoW answers.

---

## 1. The handshake (all three deployments share infra)

The KPSDK flow (documented publicly + confirmed live):

```
protected request → 429/200 + x-kpsdk-r (difficulty) + preflight x-kpsdk-ct
  → client loads ips.js/p.js (per-tenant path: <uuid1>/<uuid2>/p.js, the
    UUIDs match across Twitch/Nike/FootLocker — shared version build)
  → VM runs (bytecode interpreter) → POST /tl (enciphered payload)
  → returns cleared x-kpsdk-ct + x-kpsdk-st
  → every protected request carries x-kpsdk-ct + per-request x-kpsdk-cd
```

| Header | Role | On the wire |
|---|---|---|
| `x-kpsdk-ct` | session token (220-char) | opaque (server-minted) |
| `x-kpsdk-cd` | per-request proof-of-work | **PLAINTEXT JSON** |
| `x-kpsdk-h` | signature | base64 (`01F47D…=`) |
| `x-kpsdk-r` | difficulty/response | `1-Bw4CYF0` style |
| `x-kpsdk-v` | version pin | `j-1.2.940` |

Version **j-1.2.940** on all three (Twitch, Nike, FootLocker) — same build.

## 2. The payload (captured plaintext)

**`x-kpsdk-cd` (per-request client data):**
```json
{"workTime":1793465238911,"id":"a1ea1d56b8f21d46a70ee2f1e543059b",
 "answers":[2,4],"duration":36,"d":45,"st":1793454917296,"rst":1793454917341}
```
- `d` = difficulty (45 bits), `answers` = the PoW result, `st` = server
  timestamp, `rst` = received-server-timestamp, `workTime`/`duration` =
  timing (used to catch scripted/sub-second solves).

**Server response** — encrypted **`v4.local.<…>`** token (STROBE/secretbox
style) + `request_id` + `expiration` (~21h).

## 3. The modification test (Twitch)

Replayed a captured `x-kpsdk-ct/h` against `gql.twitch.tv/integrity` with
modified `cd`:

| cd variant | Result |
|---|---|
| exact replay | **200 + fresh `v4.local` token** |
| modified (wrong answers, forged id, duration 0) | **200 + fresh token** |
| garbage (not JSON) | **200 + fresh token** |
| empty | **200 + fresh token** |
| absurd answers [99,99,99] | **200 + fresh token** |
| wrong `st` (bad server timestamp) | **200 + fresh token** |

**Conclusion:** the PoW answers are not validated on this endpoint — the
`cd` header is presence-checked. The real gate is the `ct` token + IP/TLS.

## 4. FootLocker (ct-only protection)

FootLocker's KPSDK config: `method:'*', path:'/api/*'` (broader than Nike).
Observed `x-kpsdk-ct` on `/api/*` and `/zgw/*` calls, **no `x-kpsdk-cd`**
(GETs don't carry per-request proofs here). Modification test on
`/api/content/en/header.details.json`: **real ct, garbage ct, and NO ct all
return 200 with full content** — not enforced on that public content path
(configured for checkout/order endpoints).

## 5. Nike (same infra, narrower surface)

KPSDK protects `api.nike.com` checkout paths
(`Order/*/InitiatePayment`, `InitiateExpressPayment`, `confirmation`, `Order/*`)
per the `KPSDK.configure` block. Public API calls (search/carts/privacy) ran
without kpsdk headers. p.js = 158,783 B (same shared build as Twitch's
158,090 B).

## 6. What this means

- **Kasada's client-side cost (PoW + VM + fingerprint) is real engineering**
  — but on at least one protected path the proof itself is not verified; the
  binding is the server-minted `ct` + transport.
- **The hard part for an attacker is minting a `ct` without the VM**
  (per-tenant rotation + signature `h`), not the `cd`.
- Same fail-open/texture as the rest of the project: the client's output is
  checked for *presence* more than *validity* on several real endpoints, and
  a clean-launch browser is indistinguishable from a user at every Kasada
  check we exercised.

## 7. Honest boundaries

- We captured real handshakes + payloads and ran modification tests against
  public endpoints (Twitch integrity, FootLocker content API). We did NOT
  mint a fresh `ct` server-side, decrypt the `v4.local` token, or touch any
  account.
- The VM bytecode (ips.js/p.js, ~158 KB) was not devirtualized — the
  findings are at the protocol/payload layer.

## 8. Artifacts

| File | What |
|---|---|
| `scripts/ksd-*.mjs` | Twitch capture + modify probes |
| `scripts/nike-ksd.mjs`, `scripts/fl-ksd.mjs` | Nike/FootLocker probes |
| `artifacts/kasada-findings.json` | consolidated finding |
| `artifacts/integrity-full.json` | Twitch cd/ct/h/v + v4.local response |
| `artifacts/live-capture.json` | the captured session tokens |
| `artifacts/flow.json`, `ct-capture.json`, `modify-test.json` | FootLocker evidence |
