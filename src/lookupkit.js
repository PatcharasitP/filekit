// ─────────────────────────────────────────────────────────────────────────────
// สมองของเครื่องมือ "ดึงข้อมูลจากอีกไฟล์มาเติม" (excel-lookup) — ไม่มีหน้าจอ ไม่แตะ DOM
// แยกไว้เพื่อให้ node ทดสอบได้ตรง ๆ (tests/lookupkit.test.mjs)
//
// ‼️ ที่มา 30/09/2026: พี่ปอนด์ทำ VLOOKUP ไฟล์ Pending VAT 2026 (คีย์ Mapping = รหัสบริษัท & เลขเอกสาร)
//    เอาข้อมูลใบกำกับภาษีจากไฟล์ของทีมภาษีมาเติม 3 คอลัมน์ แล้วอยากรู้ว่า "ไฟล์รองมีคีย์ซ้ำกี่แถว"
//    VLOOKUP เงียบเรื่องนี้ มันหยิบแถวแรกให้เสมอโดยไม่บอกว่ามีแถวอื่นที่ค่าไม่เหมือนกันอยู่
// ─────────────────────────────────────────────────────────────────────────────

const INVISIBLE = /[ ​‌‍﻿]/g;
// ‼️ เซลล์ที่เป็น error ต้องไม่ถูกนับเป็นคีย์ ไม่งั้นทุกแถวที่ #N/A จะ "จับคู่กันเอง" ทั้งไฟล์
const ERROR_TEXT = /^#(N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NULL!|NUM!|SPILL!|CALC!|GETTING_DATA)$/i;

const pad2 = (n) => String(n).padStart(2, "0");

/** เลขเป็นข้อความโดยไม่มีเลขยกกำลังและไม่มีเศษทศนิยมลอย (0.1+0.2) */
export function numText(n) {
  if (!Number.isFinite(n)) return "";
  if (Number.isInteger(n)) return Math.abs(n) >= 1e21 ? BigInt(n).toString() : String(n);
  return String(Number(n.toPrecision(15)));
}

/** ปรับค่าหนึ่งช่องให้เป็น "คีย์" เทียบกันได้ คืน null ถ้าเป็นช่องว่างหรือ error
 *  ‼️ เลข 2619062802 กับข้อความ "2619062802 " ต้องเป็นคีย์เดียวกัน (ไฟล์สองฝั่งมักเก็บคนละชนิด)
 *     แต่ "0012" กับ 12 ไม่ถือว่าเหมือนกัน เว้นแต่ผู้ใช้เปิด ignoreZeros เพราะรหัสที่ขึ้นต้นด้วย 0 มีความหมาย */
export function normKey(v, o = {}) {
  const { ignoreCase = true, ignoreZeros = false } = o;
  if (v == null) return null;
  let s;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    s = `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
  } else if (typeof v === "number") s = numText(v);
  else if (typeof v === "boolean") s = v ? "TRUE" : "FALSE";
  else s = String(v);
  s = s.replace(INVISIBLE, " ").replace(/\s+/g, " ").trim().normalize("NFC");
  if (s === "" || ERROR_TEXT.test(s)) return null;
  if (ignoreZeros && /^\d+$/.test(s)) s = s.replace(/^0+(?=\d)/, "");
  return ignoreCase ? s.toLowerCase() : s;
}

/** คีย์ของแถว = ค่าของคอลัมน์คีย์ต่อกันตรง ๆ ไม่มีตัวคั่น (เหมือนสูตร =A479&F479 ที่พี่ใช้)
 *  คืน null ถ้าทุกช่องคีย์ว่าง */
export function keyOf(row, cols, o = {}) {
  const parts = cols.map((c) => normKey(row[c], o));
  if (parts.every((p) => p == null)) return null;
  return parts.map((p) => p ?? "").join("");
}

/** ดัชนีของไฟล์รอง: คีย์ → รายการลำดับแถว (ไล่ตามลำดับในไฟล์) */
export function buildIndex(rows, cols, o = {}) {
  const map = new Map();
  let blank = 0;
  rows.forEach((r, i) => {
    const k = keyOf(r, cols, o);
    if (k == null) { blank++; return; }
    const list = map.get(k);
    if (list) list.push(i); else map.set(k, [i]);
  });
  return { map, blank };
}

export const isBlank = (v) => v == null || (typeof v === "string" && v.replace(INVISIBLE, " ").trim() === "");

/** ลายเซ็นของค่าไว้เทียบว่าแถวซ้ำ "ให้ค่าเหมือนกันไหม" (เลข 5 กับข้อความ "5" ถือว่าเหมือน) */
function sig(v) {
  if (isBlank(v)) return "";
  if (v instanceof Date) return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
  if (typeof v === "number") return numText(v);
  return String(v).replace(INVISIBLE, " ").replace(/\s+/g, " ").trim();
}
const sameVals = (a, b) => a.every((v, i) => sig(v) === sig(b[i]));

export const DUP_POLICIES = ["first", "last", "blank", "join"];

/**
 * จับคู่ทั้งไฟล์
 *   mainRows/secRows  = แถวข้อมูล (อาร์เรย์ของอาร์เรย์) ไม่รวมหัวตาราง
 *   mainKeyCols/secKeyCols = ลำดับคอลัมน์คีย์ของแต่ละฝั่ง (หลายคอลัมน์ = ต่อกันตรง ๆ จำนวนสองฝั่งไม่ต้องเท่ากัน)
 *   pullCols  = ลำดับคอลัมน์ของไฟล์รองที่จะดึงมา
 *   dup       = ถ้าคีย์เดียวเจอหลายแถวในไฟล์รอง
 *               first/last = เอาแถวแรก/สุดท้าย, blank = ไม่เติมถ้าค่าต่างกัน, join = รวมค่าที่ต่างกันด้วย “; ”
 *
 * status ต่อแถว: nokey (คีย์ว่าง) · none (ไม่เจอ) · one (เจอ 1 แถว) · dupSame (เจอหลายแถว ค่าเหมือนกันหมด)
 *               · dupDiff (เจอหลายแถว และค่าที่จะดึงไม่เหมือนกัน)
 */
export function lookup({ mainRows, mainKeyCols, secRows, secKeyCols, pullCols, keyOpts = {}, dup = "first" }) {
  // ‼️ ไม่บังคับให้สองฝั่งมีจำนวนคอลัมน์คีย์เท่ากัน: ฝั่งหนึ่งอาจมีคอลัมน์ Mapping สำเร็จรูป
  //    อีกฝั่งต้องต่อเองจากหลายคอลัมน์ (รหัสบริษัท+เลขเอกสาร) เพราะคีย์คือข้อความที่ต่อกันแล้ว
  if (!mainKeyCols.length || !secKeyCols.length) throw new Error("ต้องเลือกคอลัมน์คีย์อย่างน้อยฝั่งละ 1 คอลัมน์");
  const { map: idx, blank: secBlank } = buildIndex(secRows, secKeyCols, keyOpts);
  const stats = { total: mainRows.length, nokey: 0, none: 0, one: 0, dupSame: 0, dupDiff: 0, withheld: 0 };
  const mainHits = new Map();     // คีย์ → มีกี่แถวของไฟล์หลักมาใช้คีย์นี้
  const mainKeys = new Set();     // ทุกคีย์ของไฟล์หลัก ไว้หาแถวที่ไฟล์รองมีแต่ไฟล์หลักไม่มี
  const perRow = mainRows.map((r) => {
    const key = keyOf(r, mainKeyCols, keyOpts);
    if (key == null) { stats.nokey++; return { status: "nokey", n: 0, hits: [], vals: null, key: null }; }
    mainKeys.add(key);
    const hits = idx.get(key);
    if (!hits) { stats.none++; return { status: "none", n: 0, hits: [], vals: null, key }; }
    mainHits.set(key, (mainHits.get(key) || 0) + 1);
    const all = hits.map((h) => pullCols.map((c) => (isBlank(secRows[h][c]) ? null : secRows[h][c])));
    const agree = all.every((v) => sameVals(v, all[0]));
    const status = hits.length === 1 ? "one" : agree ? "dupSame" : "dupDiff";
    stats[status]++;
    let vals;
    if (agree || dup === "first") vals = all[0];
    else if (dup === "last") vals = all[all.length - 1];
    else if (dup === "blank") vals = null;
    else vals = pullCols.map((_, j) => {
      const seen = [];
      for (const v of all) if (v[j] != null && !seen.some((x) => sig(x) === sig(v[j]))) seen.push(v[j]);
      return seen.length <= 1 ? (seen[0] ?? null) : seen.map(sig).join("; ");
    });
    const withheld = vals == null;
    if (withheld) stats.withheld++;
    return { status, n: hits.length, hits, vals, key, withheld };
  });

  const secDupKeys = [];
  for (const [key, rows] of idx) {
    if (rows.length < 2) continue;
    const all = rows.map((h) => pullCols.map((c) => (isBlank(secRows[h][c]) ? null : secRows[h][c])));
    secDupKeys.push({ key, rows, agree: all.every((v) => sameVals(v, all[0])), mainHits: mainHits.get(key) || 0 });
  }
  stats.found = stats.one + stats.dupSame + stats.dupDiff;
  stats.secKeys = idx.size;
  stats.secBlankKeys = secBlank;
  stats.secDupKeys = secDupKeys.length;
  stats.secDupKeysHit = secDupKeys.filter((d) => d.mainHits > 0).length;
  // ‼️ (06/10/2026) แถวที่ไฟล์รองมีแต่ไฟล์หลักไม่มี เช่นใบกำกับใหม่ พี่ปอนด์อยากเพิ่มเป็นแถว Addon ท้ายไฟล์หลัก
  //    เก็บทุกแถว (คีย์ซ้ำในไฟล์รองก็ได้ครบทุกแถว เพราะเป็นคนละรายการกัน) คีย์ว่างหรือ error ไม่เอา
  const secOnly = [];
  const secOnlyKeys = new Set();
  for (const [key, rows] of idx) {
    if (mainKeys.has(key)) continue;
    secOnlyKeys.add(key);
    secOnly.push(...rows);
  }
  secOnly.sort((a, b) => a - b);
  stats.secOnly = secOnly.length;
  stats.secOnlyKeys = secOnlyKeys.size;
  return { perRow, stats, secDupKeys, secOnly };
}

/** ค่าคีย์ของแถวใหม่ (Addon) ลงคอลัมน์คีย์ของไฟล์หลัก คืน [[คอลัมน์ไฟล์หลัก, ค่า]] หรือ null ถ้าแยกไม่ได้
 *  จำนวนคอลัมน์เท่ากัน = จับคู่ทีละคอลัมน์ (เก็บค่าเดิม เลขยังเป็นเลข)
 *  ไฟล์หลักมีคอลัมน์เดียว = ต่อค่าของไฟล์รองเป็นข้อความเดียว (เหมือนสูตร A&F)
 *  ไฟล์หลักหลายคอลัมน์แต่ไฟล์รองน้อยกว่า = แยกข้อความที่ต่อกันแล้วกลับไม่ได้ */
export function addonKeyCells(mainKeyCols, secKeyCols, secRow) {
  if (mainKeyCols.length === secKeyCols.length) return mainKeyCols.map((c, i) => [c, secRow[secKeyCols[i]] ?? null]);
  if (mainKeyCols.length !== 1) return null;
  const text = secKeyCols.map((c) => {
    const v = secRow[c];
    if (v == null) return "";
    if (typeof v === "number") return numText(v);
    if (v instanceof Date) return normKey(v) ?? "";
    return String(v).trim();
  }).join("");
  return [[mainKeyCols[0], text]];
}

/**
 * เติมค่าลงตารางของไฟล์หลัก โดยไม่ขยับแถวใด ๆ (เลขแถวใน Excel เดิมยังตรงทุกแถว)
 *   aoa       = ตารางทั้งแผ่นดั้งเดิม (รวมแถวเหนือหัวตาราง)  rowIdx[k] = ตำแหน่งใน aoa ของแถวข้อมูลลำดับ k
 *   dests     = ปลายทางเรียงตาม pullCols: { col: เลขคอลัมน์ในไฟล์หลัก } หรือ { col: null, name: "ชื่อคอลัมน์ใหม่" }
 *   fill      = "empty" เติมเฉพาะช่องที่ยังว่าง (ไม่ทับของเดิม) · "always" ทับเสมอ
 *   status    = ถ้าให้ { label(perRow) → ข้อความ, head: [ชื่อคอลัมน์ผล, ชื่อคอลัมน์จำนวนที่เจอ] } จะต่อคอลัมน์ผลท้ายตาราง
 *   addon     = เพิ่มแถวใหม่ท้ายตาราง (แถวที่ไฟล์รองมีแต่ไฟล์หลักไม่มี)
 *               { at: ตำแหน่งแถวแรกใน aoa, rows: [{ keys: [[คอลัมน์, ค่า]], vals: ค่าเรียงตาม dests }],
 *                 tag: { col } | { col: null, name } พร้อม value = ป้ายเช่น "Addon 10/2026" (null = ไม่ใส่ป้าย),
 *                 label: (row) → ข้อความในคอลัมน์ผล }
 */
export function applyFill({ aoa, headerIdx, rowIdx, width, result, dests, fill = "empty", status = null, addon = null }) {
  const out = aoa.map((r) => r.slice());
  const need = width + dests.filter((d) => d.col == null).length + (status ? 2 : 0) + (addon && addon.tag && addon.tag.col == null ? 1 : 0);
  for (const r of out) while (r.length < need) r.push(null);
  // edits = ทุกช่องที่เปลี่ยนจริง (ตำแหน่งในตาราง เริ่ม 0) ไว้ให้ xlsxpatch แก้เฉพาะช่องเหล่านี้ในไฟล์ต้นฉบับ
  const edits = [];
  const put = (i, c, v) => {
    while (out.length <= i) out.push(new Array(need).fill(null));
    while (out[i].length <= c) out[i].push(null);
    out[i][c] = v; edits.push({ i, c, v });
  };
  let next = width;
  const cols = dests.map((d) => {
    if (d.col != null) return d.col;
    put(headerIdx, next, d.name);
    return next++;
  });
  let statusCols = null;
  if (status) {
    // ‼️ ถ้าไฟล์นี้เคยถูกเติมมาแล้ว (มีคอลัมน์ผลอยู่) ใช้ของเดิม ไม่ต่อซ้ำทุกครั้งที่ทำ
    const at = status.head.map((h) => out[headerIdx].findIndex((x) => normHead(x) === normHead(h)));
    if (at[0] >= 0 && at[1] >= 0) statusCols = at;
    else {
      statusCols = [next, next + 1];
      put(headerIdx, next, status.head[0]);
      put(headerIdx, next + 1, status.head[1]);
      next += 2;
    }
  }
  let tagCol = null;
  if (addon && addon.tag) {
    if (addon.tag.col != null) tagCol = addon.tag.col;
    else {
      // ไฟล์ที่เคยเพิ่ม Addon มาแล้วมีคอลัมน์ป้ายอยู่ ใช้ของเดิม เหมือนคอลัมน์ผล
      const at = out[headerIdx].findIndex((x) => normHead(x) === normHead(addon.tag.name));
      if (at >= 0) tagCol = at;
      else { tagCol = next++; put(headerIdx, tagCol, addon.tag.name); }
    }
  }
  const stat = { filled: 0, keptOld: 0, keptOldDiff: 0, emptyFromSec: 0, cellsByCol: cols.map(() => 0), added: 0 };
  result.perRow.forEach((p, k) => {
    const row = out[rowIdx[k]];
    if (statusCols) { put(rowIdx[k], statusCols[0], status.label(p)); put(rowIdx[k], statusCols[1], p.n); }
    if (!p.vals) return;
    p.vals.forEach((v, j) => {
      if (v == null) { stat.emptyFromSec++; return; }
      const c = cols[j];
      if (fill === "empty" && !isBlank(row[c])) {
        stat.keptOld++;
        if (sig(row[c]) !== sig(v)) stat.keptOldDiff++;
        return;
      }
      put(rowIdx[k], c, v); stat.filled++; stat.cellsByCol[j]++;
    });
  });
  if (addon) {
    addon.rows.forEach((a, n) => {
      const i = addon.at + n;
      for (const [c, v] of a.keys) if (!isBlank(v)) put(i, c, v);
      a.vals.forEach((v, j) => { if (v != null && !isBlank(v)) put(i, cols[j], v); });
      if (statusCols && addon.label) put(i, statusCols[0], addon.label(a));
      if (tagCol != null && !isBlank(addon.tag.value)) put(i, tagCol, addon.tag.value);
      stat.added++;
    });
  }
  return { aoa: out, stat, cols, statusCols, tagCol, edits };
}

// ── ช่วยหน้าจอเดาค่าเริ่มต้น ─────────────────────────────────────────────────

/** A, B, ... Z, AA, AB ... (คนใช้ Excel เรียกคอลัมน์ด้วยตัวอักษร ไม่ใช่เลขลำดับ) */
export function colLetter(i) {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export const normHead = (h) => String(h ?? "").replace(INVISIBLE, " ").replace(/\s+/g, " ").trim().toLowerCase();

/** ชื่อหัวแบบหลวม: ตัดจุด วงเล็บ ขีด เว้นวรรค เหลือแต่ตัวอักษรกับตัวเลข
 *  ‼️ (06/10/2026) พี่ปอนด์ถามว่า "ถ้าสองไฟล์เขียนชื่อต่างกันล่ะ" เช่น Tax Inv. Date (SM) กับ Tax Inv Date SM
 *  ‼️ ต้องเก็บ \p{M} ไว้ด้วย สระบนล่างและวรรณยุกต์ไทยเป็นเครื่องหมายกำกับ ถ้าตัดทิ้ง “วันที่” จะเหลือ “วนท” */
export const looseHead = (h) => normHead(h).replace(/[^\p{L}\p{M}\p{N}]/gu, "");

/** คอลัมน์ของไฟล์หลักที่ชื่อตรงกับ name: ตรงเป๊ะก่อน แล้วค่อยชื่อหลวม ไม่เจอ = -1 */
export function bestDest(name, mainHead) {
  const n = normHead(name);
  if (!n) return -1;
  const exact = mainHead.findIndex((h) => normHead(h) === n);
  if (exact >= 0) return exact;
  const l = looseHead(name);
  return l ? mainHead.findIndex((h) => looseHead(h) === l) : -1;
}

/** เดาแถวหัวตาราง จากแถวบน ๆ ที่มีช่องข้อความมากที่สุด
 *  ‼️ ไฟล์จริงของพี่ปอนด์มีแถว 1 เป็นยอดรวม (ตัวเลข 18, 74,611.95) หัวตารางจริงอยู่แถว 2
 *     ถ้าถือว่าแถวแรกคือหัวตารางเสมอ หัวคอลัมน์จะกลายเป็นตัวเลขทั้งแถว
 *  เลือกแถวแรกสุดที่มีช่องข้อความอย่างน้อย 80% ของแถวที่มากที่สุด กันไปเลือกแถวข้อมูลที่เป็นข้อความล้วน */
export function guessHeaderRow(aoa, scan = 15) {
  const top = aoa.slice(0, scan);
  const score = top.map((r) => r.filter((v) => typeof v === "string" && !isBlank(v) && !/^-?[\d,.\s%]+$/.test(v)).length);
  const best = Math.max(0, ...score);
  if (!best) return 0;
  const i = score.findIndex((s) => s >= best * 0.8);
  return i < 0 ? 0 : i;
}

/** เดาคู่คอลัมน์คีย์จากชื่อหัวที่เหมือนกัน ให้คะแนนชื่อที่ดูเป็นคีย์ (Mapping, Key, เลขที่เอกสาร) สูงกว่า */
export function guessKeyPair(mainHead, secHead) {
  let best = null;
  mainHead.forEach((mh, i) => {
    const n = normHead(mh);
    if (!n) return;
    const j = secHead.findIndex((sh) => normHead(sh) === n);
    if (j < 0) return;
    const score = /mapping|\bmap\b|\bkey\b|คีย์|จับคู่/.test(n) ? 3
      : /doc|invoice|\bno\b|\bid\b|เลขที่|รหัส|หมายเลข/.test(n) ? 2 : 1;
    if (!best || score > best.score) best = { main: i, sec: j, score };
  });
  return best;
}

/** เดาคอลัมน์ที่น่าจะอยากดึงมา = ชื่อตรงกับคอลัมน์ในไฟล์หลักที่ "ว่างเกือบทั้งคอลัมน์" (รอถูกเติม)
 *  ‼️ ไม่ติ๊กคอลัมน์ที่ชื่อตรงแต่ในไฟล์หลักมีข้อมูลเต็มอยู่แล้ว ไม่งั้นไฟล์รองที่เป็นสำเนาไฟล์หลักจะโดนติ๊กทั้งตาราง */
export function guessPullCols(mainHead, mainRows, secHead, skipSecCols = [], emptyRatio = 0.9) {
  const out = [];
  secHead.forEach((sh, j) => {
    if (skipSecCols.includes(j)) return;
    const c = bestDest(sh, mainHead);
    if (c < 0 || !mainRows.length) return;
    const blank = mainRows.filter((r) => isBlank(r[c])).length;
    if (blank / mainRows.length >= emptyRatio) out.push({ sec: j, main: c });
  });
  return out;
}

/** ตัดแถวว่างทั้งแถวออกจากตาราง แต่จำตำแหน่งเดิมไว้ (rowIdx) ให้เลขแถวที่โชว์ตรงกับ Excel */
export function tableFromAoa(aoa, headerIdx) {
  const width = Math.max(0, ...aoa.map((r) => r.length));
  const header = [];
  for (let c = 0; c < width; c++) {
    const h = aoa[headerIdx] ? aoa[headerIdx][c] : null;
    header.push(isBlank(h) ? `(${colLetter(c)})` : String(h).replace(/\s+/g, " ").trim());
  }
  const rows = [], rowIdx = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r || r.every(isBlank)) continue;
    const line = r.slice(0, width);
    while (line.length < width) line.push(null);
    rows.push(line); rowIdx.push(i);
  }
  return { header, rows, rowIdx, width };
}
