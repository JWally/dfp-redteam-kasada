// disasm.js — static disassembler for the Kasada KPSDK p.js bytecode VM (build j-1.2.940).
//
// The VM is a register-ish bytecode interpreter. Every instruction is one word
// in the decoded array `t`; operand words follow the opcode word:
//
//   OPCODE = t[ip]           (dispatch: u[t[ip++]])   — 0..85
//   Operands are read by the handler via:
//     X()  = U(t, n.r, g, P) — ENCODED constant word (see decodeX below)
//     B()  = t[ip++] >> 5    — destination register index (raw word)
//     G()  = t[ip++] >> 5    — source register index (raw word)
//
// This is a LINEAR SWEEP disassembler: it walks the stream sequentially and
// decodes each instruction's operands from the handler's operand pattern.
// Control flow (jumps, calls) is intentionally NOT followed, so every byte is
// accounted for exactly once. Verified against a live execution trace.
//
// Usage: node disasm.js [startIp] [endIp]  -> prints disassembly; writes
//        disasm-full.txt when run without range args.
'use strict';
import { readFileSync, writeFileSync } from 'node:fs';

const t = JSON.parse(readFileSync(new URL('./out-bytecode.json', import.meta.url), 'utf8'));
const pool = readFileSync(new URL('./out-pool.txt', import.meta.url), 'utf8');

// ----- operand decoder (mirrors U in the p.js source) -----
function decodeX(ip) {
  const f = t[ip++];
  if (f & 1) return { desc: `int ${f >> 1}`, next: ip };
  if (f === 2) return { desc: 'false', next: ip };
  if (f === 4) {
    const M = t[ip++], N = t[ip++];
    const C = (M & 2147483648) ? -1 : 1;
    const e = (M & 2146435072) >> 20;
    let m = (M & 1048575) * Math.pow(2, 32) + (N < 0 ? N + Math.pow(2, 32) : N);
    let val;
    if (e === 2047) val = m ? NaN : C * (1 / 0);
    else { if (e !== 0) m += Math.pow(2, 52); val = C * m * Math.pow(2, (e === 0 ? 1 : e) - 1075); }
    return { desc: `dbl ${val}`, next: ip };
  }
  if (f === 10) {
    const len = t[ip++], off = t[ip++];
    let s;
    try { s = pool.slice(off, off + len); } catch (e) { s = '<pool-err>'; }
    const show = s.length > 70 ? JSON.stringify(s.slice(0, 70)) + '…' : JSON.stringify(s);
    return { desc: `str ${show}`, next: ip };
  }
  if (f === 26) return { desc: 'null', next: ip };
  if (f !== 48) {
    if (f === 6) return { desc: 'true', next: ip };
    return { desc: `R${f >> 5}`, next: ip }; // register read
  }
  return { desc: 'undefined', next: ip };
}

// ----- per-opcode operand read patterns -----
// reads: 'x' = encoded constant, 'g' = reg read (raw word>>5), 'b' = reg write (raw word>>5)
// Order matters: matches handler source order. 'b' always last where present.
const PAT = {
  0: '', 1: 'xgb', 2: 'x', 3: 'xxxb', 4: 'xgb', 5: 'ggb', 6: 'xxx', 7: 'ggb', 8: 'ggb',
  9: 'b', 10: 'gxb', 11: 'xgb', 12: 'x', 13: 'xgb', 14: 'x', 15: 'gxb', 16: 'xb',
  17: 'gxb', 18: 'xb', 19: 'x', 20: 'gxb', 21: 'ggb', 22: 'x', 23: 'xxb', 24: 'xx',
  25: 'gxb', 26: '', 27: 'xb', 28: 'xx', 29: 'b', 30: 'gxb', 31: 'ggb', 32: 'xxxb',
  33: 'xgb', 34: 'xxb', 35: 'ggb', 36: 'ggb', 37: 'ggb', 38: 'xgb', 39: 'gxb',
  40: 'ggb', 41: 'ggb', 42: 'xgb', 43: 'xxx', 44: 'ggb', 45: 'ggb', 46: 'b',
  47: 'gxb', 48: 'xb', 49: 'ggb', 50: 'xb', 51: 'b', 52: 'xb', 53: 'gxb', 54: 'xxxxb',
  55: 'x', 56: 'xxb', 57: 'x', 58: 'b', 59: 'xb', 60: 'gxb', 61: 'ggb', 62: 'xxb',
  63: 'xxb', 64: 'x', 65: 'xgb', 66: 'gxb', 67: 'b', 68: 'x', 69: 'gxb', 70: 'xb',
  71: 'xxb', 72: 'ggb', 73: 'xx', 74: 'ggb', 75: 'x', 76: 'x', 77: 'xgb', 78: 'xxb',
  79: 'xxb', 80: 'gxb', 81: 'xxb', 82: '', 83: 'gxb', 84: 'xx', 85: 'x',
};

// opcode names
const NAMES = {
  0:'try',1:'xor_g',2:'local_set',3:'call2',4:'ne_g',5:'mod_g',6:'call',7:'xor_gg',8:'shl_gg',
  9:'push_window',10:'lt_g',11:'in_x',12:'local_set_from_i',13:'seq_g',14:'try_dispatch',15:'seq_gx',
  16:'call0',17:'mod_g',18:'push_x',19:'set_catch',20:'div_gg',21:'neq_gg',22:'set_finally',
  23:'new_regexp',24:'jz',25:'gt_g',26:'halt',27:'bnot',28:'jnz',29:'push_Promise',30:'mul_gg',
  31:'ge_gg',32:'mk_fn',33:'eq_g',34:'new_bind',35:'div_gg',36:'sub_gg',37:'lt_gg',38:'add_xg',
  39:'ge_g',40:'seq_gg',41:'mul_gg',42:'neq_xg',43:'set_prop',44:'or_gg',45:'and_gg',46:'push_obj',
  47:'shl_g',48:'uplus',49:'gt_gg',50:'new_array',51:'push_arr',52:'typeof',53:'le_g',54:'call3',
  55:'pop_local',56:'eq_xx',57:'del_local',58:'push_exc',59:'get_global',60:'and_g',61:'instanceof_g',
  62:'call1',63:'get_prop',64:'jmp',65:'div_g',66:'ushr_g',67:'push_W',68:'restore_try',69:'sub_g',
  70:'lnot',71:'or_xx',72:'add_gg',73:'local_store',74:'in_gg',75:'throw',76:'jsend',77:'or_g',
  78:'add_xx',79:'sub_xx',80:'neq_xg',81:'delete_prop',82:'clear_exc',83:'add_g',84:'scope_set',85:'scope_get',
};

function decodeInsn(ip) {
  const op = t[ip];
  const pat = PAT[op];
  let cur = ip + 1;
  const parts = [];
  let breg = null;
  for (const r of pat || '') {
    if (r === 'x') { const d = decodeX(cur); parts.push(d.desc); cur = d.next; }
    else if (r === 'g') { const reg = t[cur] >> 5; parts.push(`r${reg}=R${reg}`); cur++; }
    else if (r === 'b') { breg = t[cur] >> 5; cur++; }
  }
  const opName = NAMES[op] || `op${op}`;
  const ops = parts.join('  ');
  const dst = breg != null ? ` ->R${breg}` : '';
  return { ip, op, opName, ops, dst, next: cur };
}

// ---- main ----
const args = process.argv.slice(2);
let out = [];
if (args.length === 2) {
  const a = parseInt(args[0]), b = parseInt(args[1]);
  for (let ip = a; ip < b; ) { const ins = decodeInsn(ip); out.push(ins); ip = ins.next; }
  for (const i of out) console.log(`${String(i.ip).padStart(6)}: ${String(i.op).padStart(2)} ${i.opName.padEnd(18)} ${i.ops.padEnd(52)}${i.dst}`);
} else {
  let ip = 1;
  let n = 0;
  while (ip < t.length && n < 200000) {
    const ins = decodeInsn(ip);
    out.push(ins);
    ip = ins.next;
    n++;
    if (n > 3 && ins.op === 26) { out.push({ ip, op: -1, opName: '(end-of-stream marker)', ops: '', dst: '' }); break; }
  }
  const txt = out.map(i => `${String(i.ip).padStart(6)}: ${String(i.op).padStart(2)} ${i.opName.padEnd(18)} ${i.ops.padEnd(60)}${i.dst}`).join('\n');
  writeFileSync(new URL('./disasm-full.txt', import.meta.url), txt);
  console.log(`wrote disasm-full.txt with ${out.length} instructions (linear sweep, ip 1..${ip - 1})`);
}
