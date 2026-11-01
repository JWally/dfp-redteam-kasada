# dfp-redteam-kasada — Kasada KPSDK (Twitch / Nike / FootLocker)

Kwf ("KPSDK") client-side anti-bot assessment. Full details in the writeups:
`KASADA_MERCHANT_PASS_2026_10_31.md` (first pass) and
`KASADA_DEEP_CT_MINT_2026_11_01.md` (deep pass + VM devirtualization).

---

## What we observed (the shipped payload)

**The client ships a plaintext proof-of-work + a server-issued session token.**

| Item | What it is | Observed? |
|---|---|---|
| `x-kpsdk-cd` | per-request PoW answer — **plaintext JSON** on the wire | 🟢 captured |
| `x-kpsdk-ct` | session token — cleared ct comes back in the **`ips.js` response header** | 🟢 captured |
| `x-kpsdk-h` | per-request signature (presence-checked) | 🟢 captured |
| `x-kpsdk-v` | version pin (`j-1.2.940`) | 🟢 captured |
| server reply | `v4.local.<encrypted>` token | 🟢 captured (encrypted) |

**Key finding:** the bytecode VM and the `/tl` handshake are **not verified** on
this deployment. `x-kpsdk-cd` is presence-checked — garbage/empty/absurd
answers all return 200 + a fresh token (see `KASADA_MERCHANT_PASS`, modify
test). The real gate reduces to a single GET.

## The minted-client harness

`scripts/mint-ct.mjs` — mints a fresh `x-kpsdk-ct` **without running the VM**,
then (with `--verify`) uses it against the real protected endpoint and collects
the server's response token:

```bash
node scripts/mint-ct.mjs --verify
```

### Recorded run — minted client accepted (2026-11-01)

```
[fp]   429 preflight ct=08rGnB7VgVnKMYRwFsoQOMJc… r=1-AA
[ips]  200 cleared ct=0a7BhqlB6o3b8X98D5PRmdO7… (len=163) r=1-AA
MINTED ct = 0a7BhqlB6o3b8X98D5PRmdO7xEMPJEBPaVT9nt2orbAIW4qQCoXDuIlQf4MjDKiA4ZAjuFAV7IGviC6DI3aWvy27Zxc00wd6ezZH0Fb1KUSdY3SV6Fsc6vJkVkKsWosdpfm4WYJzNxDMVHPi1bgzYZoVeaOisp0tz2W
[use]  200 token=v4.local v4.local.y9KQUQQ6X0qloZ7…
[rot]  server rotated ct to 09lEujrKg4bvRpIowVGN8POY…
VERIFY: minted ct accepted on protected endpoint
```

Full-token capture (untruncated, same flow):

```
MINTED x-kpsdk-ct (full): 09TPewGhUZnu7geeKYfa6hG9CLyXhFOftcVcBa0K1xJtndZiA34OKvYntoDyJw8r0Zl7zSceAEZDOwgxHRgjg7FlyryUTaAjpkkCmoIA3sbmJg8hVOezGtiQLdRnrrJbeAJvrDO7NsYdZVGkfXPK7WibpBP7wAr132w
PROTECTED ENDPOINT: HTTP 200   (POST gql.twitch.tv/integrity)
SERVER-ISSUED MINTED-CLIENT TOKEN (full): v4.local.lY3KxgDmCHZ_PGEcNLQ8CKtn8ekcg7nCJcrLXP7SnsP3FRSQJmHPW81wMeJ_sjFm2_onpJ9iCGFpGoZ5AFFX5C_-jnM-My2g9SBgy8W1sHBwTM34NKCeC3qtgqTWXllONjqrGDyMKuloDbcL2dcslN08-ex6CTbqqX-lPglqxMAorVe0vJysQfl1UVFvI5PMAJknv_A9qYxlzihne8df4mQjVBV32pkY9llURZ1Z-Phbpo5h4dpQBBHdxmpK5p60JVIskb2oi3fXzNeSA04_N0KebXlhhvl9KAq9SLB7zvE4pTRNwwRjBqyTgW-W46xS4A2NaUOsMlsnTpglKY-quc8tOhDgmQIulEOME_XkJY9B_DYvcAvF8Yg_UHl3IAokhSGhj_l-EZ1c5iuq3Q65Pt6cUIGoZ7Vrj0Qu61aseE3tRp_oA9gi4jA
```

**Proof:** a server-issued `v4.local` token was returned for a client that never
ran the VM — the minted client was accepted end-to-end on the protected
endpoint. The VM devirtualization itself (86-opcode ISA, 68,748-word bytecode
stream, verified disassembler) is in `artifacts/deep-vm/`.

## Status

- 🟢 Read payload: `x-kpsdk-cd` plaintext JSON + ct from `ips.js` header
- 🟢 Tamper with payload: garbage/empty/absurd `cd` accepted (presence-checked)
- 🟢 Mint token: fresh `ct` minted with one GET; verified on 3 merchants

## Files

- `scripts/mint-ct.mjs` — the mint harness
- `scripts/ksd-twitch.mjs`, `krk-*` merchant probes, `ksd-disasm.js` — auxiliary
- `artifacts/deep-vm/` — VM devirtualization (bytecode, handlers, disassembly)
- writeups: `KASADA_MERCHANT_PASS_2026_10_31.md`, `KASADA_DEEP_CT_MINT_2026_11_01.md`
