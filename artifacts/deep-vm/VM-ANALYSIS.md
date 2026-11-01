# Kasada KPSDK p.js — bytecode VM analysis (build j-1.2.940, 2026-11-01)

This document describes the obfuscated VM in `p.js` (`158,090` bytes) served from the
shared merchant UUID path. The file is **not** a "challenge" — it is the entire KPSDK
client SDK (configure / interrogate / fetch wrapper / logging / cookies) compiled to a
custom register bytecode VM.

## 1. File layout

```
"use strict";(function(){
  var A = function(r,u,a){...}          // base-N decoder
  var F = "<144,472-char base-40 blob>" // encoded bytecode + string pool
  <regenerator-runtime (Babel)>
  <VM interpreter + 86 handlers>
  function m(e){ ... while(true){ i=u[t[e.r[0]++]]; ... } }  // dispatch loop
  m(I)                                   // entry: IP starts at 1
})();
```

## 2. Extraction (node, no browser)

1. `t = A(F, alphabet, 40)` decodes the blob to an integer array of **75,028 words**.
   Alphabet: `>0yS+vGFugCAeizcQh69<pHbaW3xKr15l=RB|OPjfqD8$mJZtoVUTdM~wL4XnY^INk27sE`
2. The string pool is spliced out of the middle:
   `y = t[length-1] ^ (length+4)`;  `K = t.splice(y, t[y+1]+2)`  (6,280 words).
3. `P.x` = decode(K) with per-char transform `x & 0xFFFFFFC0 | (x*41) & 63` → the
   **6,278-char string pool** (`out-pool.txt`). The pool has random junk letters
   interleaved between real strings; strings are referenced by `(len, offset)` slices.
4. Remaining stream (`out-bytecode.json`) = **68,748 words** of instructions + operands.

`harness.js` does this under node (only needs `window`/`self`/`Promise` shims).

## 3. VM architecture

- **State**: `n.r` is the active call frame array: `n.r[0]` = instruction pointer,
  `n.r[1]` = frame object (`{u: window, i: callee, M: localMap, r: prevFrame, c: closureChain,
  Y/T/H: try bookkeeping, s/z: catch targets}`), `n.r[2]` = return slot, `n.r[3..]` = registers.
- **Dispatch**: `op = t[ip++]; handler = u[op]; handler(n, X, B, f, nTable, rTable)`.
  `u` is a `Proxy` over an 86-entry handler array (anti-introspection: `get` for numeric
  indices only; we read it via `for i in 0..85`).
- **Operands** (read by the handler through `X`, `B`, `G`):
  - `X` (encoded constant): `f=t[ip++]`; `f&1` → signed int `f>>1`; `2`→false; `6`→true;
    `4`→64-bit double (2 more words); `10`→string (`len`,`off` → pool slice); `26`→null;
    `48`→undefined; else → register read `n.r[f>>5]`.
  - `B` (dest register write): word `>> 5`.
  - `G` (register read, `rTable[5]`): word `>> 5`.

## 4. Opcode table (0..85)

| op | name | operand pattern | op | name | operand pattern |
|---|---|---|---|---|---|
| 0 | try | — | 43 | set_prop | X X X |
| 1 | xor | X G B | 44 | or | G G B |
| 2 | local_set | X | 45 | and | G G B |
| 3 | call2 | X X X B | 46 | push_obj {} | B |
| 4 | ne | X G B | 47 | shl | G X B |
| 5 | mod | G G B | 48 | uplus | X B |
| 6 | call | X X X | 49 | gt | G G B |
| 7 | xor | G G B | 50 | new_array | X B |
| 8 | shl | G G B | 51 | push_arr [] | B |
| 9 | push_window | B | 52 | typeof | X B |
| 10 | lt | G X B | 53 | le | G X B |
| 11 | in | X G B | 54 | call3 | X X X X B |
| 12 | local_set_from_i | X | 55 | pop_local | X |
| 13 | seq | X G B | 56 | eq | X X B |
| 14 | try_dispatch | X | 57 | del_local | X |
| 15 | seq | G X B | 58 | push_exc | B |
| 16 | call0 | X B | 59 | get_global window[k] | X B |
| 17 | mod | G X B | 60 | and | G X B |
| 18 | push_x | X B | 61 | instanceof | G G B |
| 19 | set_catch | X | 62 | call1 | X X B |
| 20 | div | G X B | 63 | get_prop | X X B |
| 21 | neq | G G B | 64 | jmp | X |
| 22 | set_finally | X | 65 | div | X G B |
| 23 | new_regexp | X X B | 66 | ushr | G X B |
| 24 | jz | X X | 67 | push_W | B |
| 25 | gt | G X B | 68 | restore_try | X |
| 26 | **halt** | — | 69 | sub | G X B |
| 27 | bnot | X B | 70 | lnot | X B |
| 28 | jnz | X X | 71 | or | X X B |
| 29 | push_Promise | B | 72 | add | G G B |
| 30 | mul | G X B | 73 | local_store | X X |
| 31 | ge | G G B | 74 | in | G G B |
| 32 | mk_fn (closure) | X X X B | 75 | throw | X |
| 33 | eq | X G B | 76 | jsend | X |
| 34 | new_bind | X X B | 77 | or | X G B |
| 35 | div | G G B | 78 | add | X X B |
| 36 | sub | G G B | 79 | sub | X X B |
| 37 | lt | G G B | 80 | neq | G X B |
| 38 | add | X G B | 81 | delete_prop | X X B |
| 39 | ge | G X B | 82 | clear_exc | — |
| 40 | seq | G G B | 83 | add | G X B |
| 41 | mul | G G B | 84 | scope_set | X X |
| 42 | neq | X G B | 85 | scope_get | X |

Pattern legend: `X`=encoded constant, `G`=register read, `B`=dest register write.

Semantic notes:
- **Functions** are created by op 32 (mk_fn) as JS closures over a VM frame; calling them
  is op 6 (fast path: builds a new frame array and dispatches into the function body).
- **Locals** live in `frame.M` (a Map, indexed by slot int); op 84/85 walk the closure
  chain (`frame.c`) — the VM has block scoping + closures.
- **Calls into host JS** (e.g. `fetch`, `Object.create`, `Math.*`) are plain JS calls from
  the handlers — the bytecode reaches them via `get_global`/`get_prop`.

## 5. What the bytecode program is

Linear disassembly of the 68,748-word stream yields **22,729 instructions**
(`disasm-full.txt`, verified: 1,182/1,182 executed instructions matched exactly against a
live trace). The entry program:
1. Clears locals, defines the SDK's ~377 functions (each `mk_fn` = one SDK function).
2. Builds the config object: version `j-1.2.940`, UUID path `/149e9513-…/2d206a39-…`,
   two SHA-256-ish constants, endpoint map `{/r, /fp, /mfc, /lg}`, header names
   (`x-kpsdk-ct/-v/-r/-c/-h/-fc/-cd`), log levels, state machine
   (`kpsdk-load/pending/ready`, `Interrogation*` events).
3. Installs `window.KPSDK` with `configure()` / `isReady()` (and `interrogate()`), guarded
   by `if (!window.hasOwnProperty("KPSDK"))`.

The SDK fetch wrapper, the interrogation engine, and cookie handling are all present in
the bytecode — but on this deployment the interrogation output is never transmitted, and
`window.KPSDK.configure()` is what drives the flow (we drove it manually in a browser to
confirm).

## 6. Why devirtualization is unnecessary (for these merchants)

- No `/tl` POST exists in the live flow; the server clears the ct on the `ips.js`
  response alone.
- `x-kpsdk-cd` (PoW answers) and `x-kpsdk-h` (signature) are presence-checked only.
- A fresh ct is minted by one GET of `ips.js` (see `README.md`).

If you still want a faithful non-browser VM re-execution (e.g. for other Kasada customers
that do verify `/tl`), the pieces needed are all here: bytecode (`out-bytecode.json`),
handler table (`out-handlers.txt`), string pool (`out-pool.txt`), disassembler
(`disasm.js`), and a node harness that runs the VM against a shimmed `window`/`document`
(`harness.js` + the `build-hooked*.js` browser pipeline). The `/tl` enciphering transform
would then be found by tracing the interrogation function's `fetch`/XHR call — on this
build it never runs, so there is nothing to reverse here.
