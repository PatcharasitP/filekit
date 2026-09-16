/* binkit — ตรรกะจัดกลุ่มตัวเลขเป็นช่วง (band) ไม่แตะ DOM ไม่ใช้ไลบรารี รันบน node ได้ตรง ๆ
 *
 * ‼️ ทำไมต้องมีไฟล์นี้แยกจาก UI
 *   กฎการจัดกลุ่มคือหัวใจ ถ้าผูกอยู่กับหน้าจอจะเทสไม่ได้ และทุกครั้งที่แก้หน้าตาจะเสี่ยงทำค่าเพี้ยนเงียบ ๆ
 *   แยกออกมาแบบนี้เทสด้วย node ได้ทุกเคส (tests/binkit.test.mjs) และ UI เรียกใช้อย่างเดียว
 *
 * ‼️ กติกาที่ยึดตลอดทั้งไฟล์ (ต้องตรงกับ fnBinNumber.pq ที่ใช้ในงานจริงมาตั้งแต่ 19/08/2026)
 *   • Breaks คือ "ขอบบน" ของแต่ละช่วง และขอบบนรวมเสมอ  ค่า 5 กับ Breaks {0,5,10} อยู่กลุ่ม "1-5"
 *   • Breaks n ตัว = n+1 กลุ่ม  (≤ b0, b0..b1, ..., > bLast)
 *   • คืนคอลัมน์ "เลขเรียง" มาคู่กับป้ายเสมอ เพราะป้ายเป็นข้อความ พอเรียงตามตัวอักษรแล้ว "10-20" มาก่อน "6-10"
 *   • ค่าว่างมีกลุ่มของตัวเองและเลขเรียง = 0 เสมอ (อยู่หัวตารางเสมอ ไม่ปนกับกลุ่มจริง)
 */

// ───────────────────────────────────────────────────────────── อ่านตัวเลข

const THAI_DIGITS = { "๐": "0", "๑": "1", "๒": "2", "๓": "3", "๔": "4", "๕": "5", "๖": "6", "๗": "7", "๘": "8", "๙": "9" };

/** แปลงค่าหนึ่งช่องเป็นตัวเลข คืน null ถ้าอ่านไม่ออก (รับ 1,234.50 · (1,234) ติดลบแบบบัญชี · เลขไทย · 12% · ฿12) */
export function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/[๐-๙]/g, (d) => THAI_DIGITS[d]);
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }          // (1,234) = ติดลบแบบงบการเงิน
  s = s.replace(/[,\s '`]/g, "").replace(/[฿$€£%]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  if (!/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** อ่านทั้งคอลัมน์ทีเดียว บอกด้วยว่าอ่านไม่ออกกี่แถวและว่างกี่แถว (ห้ามกลืนเงียบ) */
export function readValues(list) {
  const nums = [], badRows = [];
  let blank = 0;
  list.forEach((v, i) => {
    if (v === null || v === undefined || String(v).trim() === "") { blank++; return; }
    const n = toNum(v);
    if (n === null) badRows.push({ row: i, raw: String(v) });
    else nums.push(n);
  });
  return { nums, badRows, blank, total: list.length };
}

/** จำนวนทศนิยมที่มากที่สุดในชุดข้อมูล (ใช้ตัดสินว่าป้ายแบบจำนวนเต็มจะกำกวมไหม) */
export function decimalsIn(nums) {
  let d = 0;
  for (const n of nums) {
    if (!Number.isFinite(n) || Number.isInteger(n)) continue;
    const s = String(n);
    const i = s.indexOf(".");
    if (i >= 0) d = Math.max(d, Math.min(6, s.length - i - 1));
    if (d >= 6) break;
  }
  return d;
}

// ───────────────────────────────────────────────────────────── ตัวช่วยตัวเลข

const asc = (a, b) => a - b;

/** ควอนไทล์แบบ linear interpolation บนชุดที่เรียงแล้ว (p = 0..1) */
export function quantile(sorted, p) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** ปัดให้เป็น "เลขที่คนอ่านแล้วสบายใจ" 1 · 2 · 2.5 · 5 · 10 คูณกำลังสิบ */
export function niceNumber(x, mode = "round") {
  if (!Number.isFinite(x) || x === 0) return 0;
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const exp = Math.floor(Math.log10(a));
  const pow = Math.pow(10, exp);
  const f = a / pow;                                     // 1 ≤ f < 10
  const steps = [1, 2, 2.5, 5, 10];
  let pick;
  if (mode === "up") pick = steps.find((s) => f <= s + 1e-9) ?? 10;
  else if (mode === "down") pick = [...steps].reverse().find((s) => f >= s - 1e-9) ?? 1;
  else {
    pick = steps.reduce((best, s) => (Math.abs(s - f) < Math.abs(best - f) ? s : best), steps[0]);
  }
  return sign * pick * pow;
}

/** ปัดทศนิยมให้พอดีตา ไม่ให้ 0.30000000000000004 โผล่ */
export function roundTo(x, decimals) {
  const p = Math.pow(10, Math.max(0, Math.min(10, decimals)));
  return Math.round((x + Number.EPSILON) * p) / p;
}

// ───────────────────────────────────────────────────────────── 4 วิธีเสนอจุดตัด

/** ① เลขกลม — ขั้นเท่ากันแต่ปัดให้เป็นเลขที่คนจำได้ (0, 5, 10, 20) เหมาะกับรายงานให้คนอ่าน */
export function roundBreaks(nums, k) {
  const s = [...nums].sort(asc);
  const lo = s[0], hi = s[s.length - 1];
  if (!(hi > lo)) return [];
  const step = niceNumber((hi - lo) / k, "up") || 1;
  const start = Math.floor(lo / step) * step;
  const out = [];
  for (let i = 1; i < k; i++) {
    const b = roundTo(start + step * i, 6);
    if (b >= hi) break;                                   // จุดตัดที่เกินค่าสูงสุดไม่มีประโยชน์ กลุ่มจะว่าง
    out.push(b);
  }
  return dedupe(out);
}

/** ② ความกว้างเท่ากัน — ตรงไปตรงมา แต่ข้อมูลเบ้เมื่อไรกลุ่มแรกจะกินเกือบหมด */
export function equalBreaks(nums, k) {
  const s = [...nums].sort(asc);
  const lo = s[0], hi = s[s.length - 1];
  if (!(hi > lo)) return [];
  const w = (hi - lo) / k;
  const out = [];
  for (let i = 1; i < k; i++) out.push(roundTo(lo + w * i, 6));
  return dedupe(out);
}

/** ③ จำนวนเท่ากัน — แบ่งตามอันดับ กลุ่มละเท่า ๆ กัน (quartile / decile) เหมาะกับคำถามว่าใครอยู่ท็อป */
export function quantileBreaks(nums, k) {
  const s = [...nums].sort(asc);
  if (s.length < 2) return [];
  const out = [];
  for (let i = 1; i < k; i++) out.push(roundTo(quantile(s, i / k), 6));
  return dedupe(out).filter((b) => b < s[s.length - 1]);
}

/** ④ ช่องว่างธรรมชาติ — หาจุดที่ข้อมูลขาดเป็นกระจุกจริง ๆ (k-means 1 มิติ เริ่มจากควอนไทล์ จึงได้ผลเดิมทุกครั้ง)
 *
 * ‼️ ทำไมไม่ใช้ Fisher-Jenks ตรง ๆ: ของจริงเป็น O(n²k) ข้อมูลหมื่นแถวค้างทันทีในเบราว์เซอร์
 *    k-means 1 มิติที่ seed ด้วยควอนไทล์ให้ขอบเกือบเท่ากันในเวลาเชิงเส้น และ deterministic (ไม่สุ่ม)
 */
export function naturalBreaks(nums, k) {
  const s = [...nums].sort(asc);
  const uniq = dedupe(s);
  if (uniq.length <= 1) return [];
  if (uniq.length <= k) return uniq.slice(0, uniq.length - 1);          // ค่าไม่ซ้ำน้อยกว่ากลุ่มที่ขอ ตัดทุกค่าเลย
  let centers = [];
  for (let i = 0; i < k; i++) centers.push(quantile(s, (i + 0.5) / k));
  centers = dedupe(centers);
  for (let iter = 0; iter < 40; iter++) {
    const sum = new Array(centers.length).fill(0), cnt = new Array(centers.length).fill(0);
    for (const v of s) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < centers.length; i++) {
        const d = Math.abs(v - centers[i]);
        if (d < bd) { bd = d; bi = i; }
      }
      sum[bi] += v; cnt[bi]++;
    }
    const next = centers.map((c, i) => (cnt[i] ? sum[i] / cnt[i] : c));
    const moved = next.some((c, i) => Math.abs(c - centers[i]) > 1e-9);
    centers = next;
    if (!moved) break;
  }
  centers.sort(asc);
  // ขอบ = ค่าจริงที่อยู่ท้ายสุดของแต่ละกลุ่ม (ใช้ค่าจริงเพื่อให้ขอบเป็นเลขที่มีอยู่ในข้อมูล ไม่ใช่ค่ากลางลอย ๆ)
  const out = [];
  for (let i = 0; i < centers.length - 1; i++) {
    const mid = (centers[i] + centers[i + 1]) / 2;
    let last = null;
    for (const v of uniq) { if (v <= mid) last = v; else break; }
    if (last !== null && last < uniq[uniq.length - 1]) out.push(roundTo(last, 6));
  }
  return dedupe(out);
}

export const METHODS = ["round", "quantile", "natural", "equal"];

/** เรียกวิธีไหนก็ได้ผ่านชื่อเดียว — UI ใช้ตัวนี้ตัวเดียว */
export function suggestBreaks(nums, method = "round", k = 5) {
  const clean = nums.filter((n) => Number.isFinite(n));
  if (!clean.length || k < 2) return [];
  switch (method) {
    case "equal": return equalBreaks(clean, k);
    case "quantile": return quantileBreaks(clean, k);
    case "natural": return naturalBreaks(clean, k);
    default: return roundBreaks(clean, k);
  }
}

function dedupe(list) {
  const out = [];
  for (const v of [...list].sort(asc)) if (!out.length || Math.abs(out[out.length - 1] - v) > 1e-9) out.push(v);
  return out;
}

/** ทำความสะอาดจุดตัดที่ผู้ใช้พิมพ์เอง: เรียง ตัดซ้ำ ทิ้งค่าที่ไม่ใช่ตัวเลข */
export function cleanBreaks(list) {
  return dedupe((list || []).map(toNum).filter((n) => n !== null));
}

// ───────────────────────────────────────────────────────────── ป้ายและการจัดกลุ่ม

const fmt = (x, d) => {
  const v = roundTo(x, d);
  return v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: Math.max(0, d) });
};

/** ป้ายอัตโนมัติจากจุดตัด
 *  whole=true  → "1-5"        (ข้อมูลเป็นจำนวนเต็ม อ่านง่ายสุด)
 *  whole=false → "> 0 ถึง 5"  (ข้อมูลมีทศนิยม ต้องบอกให้ชัดว่าขอบอยู่ฝั่งไหน ไม่งั้น 4.5 อ่านไม่ออกว่าอยู่กลุ่มไหน)
 */
export function autoLabels(breaks, opts = {}) {
  const { whole = true, unit = "", decimals = 0, lang = "th" } = opts;
  const to = lang === "en" ? " to " : " ถึง ";
  const n = breaks.length + 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    let t;
    if (i === 0) t = "≤ " + fmt(breaks[0], decimals);
    else if (i === n - 1) t = "> " + fmt(breaks[i - 1], decimals);
    else if (whole) t = fmt(breaks[i - 1] + 1, decimals) + "-" + fmt(breaks[i], decimals);
    else t = "> " + fmt(breaks[i - 1], decimals) + to + fmt(breaks[i], decimals);
    out.push(t + unit);
  }
  return out;
}

/** ค่าหนึ่งค่าตกกลุ่มที่เท่าไร (0 ถึง breaks.length) — ขอบบนรวม */
export function binIndexOf(v, breaks) {
  let i = 0;
  for (const b of breaks) { if (v > b) i++; else break; }
  return i;
}

/**
 * จัดกลุ่มทั้งชุด พร้อมรองรับ "ล็อกรายตัว"
 *
 * rows      : [{ key, value }]  key = รหัสรายการ (ใช้จับคู่กับรายการล็อก) value = ค่าดิบ
 * breaks    : จุดตัด
 * labels    : ป้ายของแต่ละช่วง (ยาว breaks.length + 1)
 * overrides : { "SKA1029": "เฝ้าระวัง", ... } ล็อกรายตัว ชนะจุดตัดเสมอ
 * extraOrder: ลำดับของหมวดพิเศษที่ไม่ได้อยู่ในชุดช่วง (ถ้าไม่ส่ง จะไล่ตามที่พบครั้งแรก)
 *
 * ‼️ จุดที่พลาดกันบ่อย: ล็อกรายตัวแล้วลำดับพัง
 *    ถ้าล็อกไปหมวดที่มีอยู่แล้ว ต้องได้เลขเรียงของหมวดนั้น (ไม่ใช่เลขใหม่)
 *    ถ้าล็อกไปหมวดใหม่ ต้องได้เลขต่อท้ายชุดเดิม และหมวดใหม่เดียวกันทุกแถวต้องได้เลขเดียวกันเสมอ
 */
export function assign(rows, cfg = {}) {
  const {
    breaks = [], labels = null, nullLabel = "ไม่มีข้อมูล",
    overrides = {}, extraOrder = null, unit = "", whole = true, decimals = 0, lang = "th",
  } = cfg;
  const labs = labels && labels.length === breaks.length + 1
    ? labels.slice()
    : autoLabels(breaks, { whole, unit, decimals, lang });

  // หมวดพิเศษ = ป้ายที่โผล่มาจากการล็อกรายตัว แต่ไม่มีในชุดช่วง
  const extras = [];
  const addExtra = (lab) => { if (lab !== nullLabel && !labs.includes(lab) && !extras.includes(lab)) extras.push(lab); };
  if (Array.isArray(extraOrder)) extraOrder.forEach(addExtra);
  for (const k of Object.keys(overrides)) addExtra(String(overrides[k]));

  const sortOf = (lab) => {
    const i = labs.indexOf(lab);
    if (i >= 0) return i + 1;
    const j = extras.indexOf(lab);
    if (j >= 0) return labs.length + j + 1;
    return 0;
  };

  let lockedCount = 0, blankCount = 0, badCount = 0;
  const out = rows.map((r) => {
    const key = r.key === null || r.key === undefined ? "" : String(r.key);
    const lock = Object.prototype.hasOwnProperty.call(overrides, key) ? String(overrides[key]) : null;
    if (lock !== null) {
      lockedCount++;
      return { ...r, band: lock, sort: sortOf(lock), locked: true, num: toNum(r.value) };
    }
    const n = toNum(r.value);
    if (n === null) {
      if (r.value === null || r.value === undefined || String(r.value).trim() === "") blankCount++;
      else badCount++;
      return { ...r, band: nullLabel, sort: 0, locked: false, num: null };
    }
    const i = binIndexOf(n, breaks);
    return { ...r, band: labs[i], sort: i + 1, locked: false, num: n };
  });

  return { rows: out, labels: labs, extras, lockedCount, blankCount, badCount };
}

/** สรุปการกระจายต่อกลุ่ม — ไว้ให้คนดูก่อนตัดสินใจว่าจุดตัดนี้ใช้ได้ไหม (กลุ่มไหนบวม กลุ่มไหนว่าง) */
export function distribution(assigned) {
  const { rows, labels, extras } = assigned;
  const order = [...labels, ...extras];
  const map = new Map();
  for (const lab of order) map.set(lab, { label: lab, count: 0, min: null, max: null, locked: 0, sort: 0 });
  let nullRow = null;
  for (const r of rows) {
    let e = map.get(r.band);
    if (!e) {
      if (!nullRow) nullRow = { label: r.band, count: 0, min: null, max: null, locked: 0, sort: 0 };
      e = nullRow;
    }
    e.count++;
    e.sort = r.sort;
    if (r.locked) e.locked++;
    if (r.num !== null) {
      e.min = e.min === null ? r.num : Math.min(e.min, r.num);
      e.max = e.max === null ? r.num : Math.max(e.max, r.num);
    }
  }
  const total = rows.length || 1;
  const list = order.map((lab) => map.get(lab));
  if (nullRow && nullRow.count) list.push(nullRow);
  return list.map((e) => ({ ...e, pct: roundTo((e.count / total) * 100, 1) }));
}

/** ฮิสโตแกรมสำหรับวาดรูปการกระจาย (ช่องกว้างเท่ากัน ไม่เกี่ยวกับจุดตัดที่เลือก) */
export function histogram(nums, binCount = 40) {
  const clean = nums.filter((n) => Number.isFinite(n));
  if (!clean.length) return { bins: [], min: 0, max: 0, max_count: 0 };
  const min = Math.min(...clean), max = Math.max(...clean);
  if (min === max) return { bins: [{ x0: min, x1: min, count: clean.length }], min, max, max_count: clean.length };
  const k = Math.max(4, Math.min(120, binCount));
  const w = (max - min) / k;
  const bins = Array.from({ length: k }, (_, i) => ({ x0: min + w * i, x1: min + w * (i + 1), count: 0 }));
  for (const v of clean) {
    let i = Math.floor((v - min) / w);
    if (i >= k) i = k - 1;
    if (i < 0) i = 0;
    bins[i].count++;
  }
  return { bins, min, max, max_count: Math.max(...bins.map((b) => b.count)) };
}

// ───────────────────────────────────────────────────────────── โค้ดที่ก๊อปไปใช้ต่อ

const mText = (s) => '"' + String(s).replace(/"/g, '""') + '"';
const mName = (s) => '#"' + String(s).replace(/"/g, '""') + '"';
const mNum = (n) => String(roundTo(n, 6));

/**
 * โค้ด Power Query แบบยืนได้ด้วยตัวเอง (ไม่ต้องมีฟังก์ชันอื่นในไฟล์)
 * วางใน Advanced Editor แล้วเปลี่ยนบรรทัด Source เป็นตารางจริงได้เลย
 */
export function genM(cfg = {}) {
  const {
    column = "ตัวเลข", keyColumn = null, breaks = [], labels = [],
    nullLabel = "ไม่มีข้อมูล", overrides = {}, extras = [],
    bandColumn = null, sortColumn = null, sourceStep = "Source",
  } = cfg;
  const bandCol = bandColumn || column + " Band";
  const sortCol = sortColumn || column + " Band Sort";
  const overKeys = Object.keys(overrides);
  const allLabels = [...labels, ...extras];

  const L = [];
  L.push("let");
  L.push(`    ${sourceStep} = Excel.CurrentWorkbook(){[Name="Table1"]}[Content],   // เปลี่ยนบรรทัดนี้เป็นตารางของพี่เอง`);
  L.push("");
  L.push("    // จุดตัด = ขอบบนของแต่ละช่วง และขอบบนรวมเสมอ (ค่าเท่ากับจุดตัด อยู่ในช่วงนั้น)");
  L.push(`    Breaks = {${breaks.map(mNum).join(", ")}},`);
  L.push(`    Labels = {${allLabels.map(mText).join(", ")}},`);
  if (overKeys.length) {
    L.push("");
    L.push("    // ล็อกรายตัว: รายการที่ระบุจะอยู่หมวดนี้เสมอ ไม่สนใจว่าตัวเลขจะตกช่วงไหน");
    L.push("    Overrides = [");
    overKeys.forEach((k, i) => L.push(`        ${mName(k)} = ${mText(overrides[k])}${i < overKeys.length - 1 ? "," : ""}`));
    L.push("    ],");
  }
  L.push("");
  L.push("    IdxOf = (v as number) as number => List.Count(List.Select(Breaks, (b) => v > b)),");
  L.push("    SortOf = (lab as text) as number =>");
  L.push("        let p = List.PositionOf(Labels, lab) in if p < 0 then 0 else p + 1,");
  L.push("");
  L.push(`    AddBand = Table.AddColumn(${sourceStep}, ${mText(bandCol)}, each`);
  L.push("        let");
  if (overKeys.length && keyColumn) {
    L.push(`            key  = Text.From(Record.FieldOrDefault(_, ${mText(keyColumn)}, "")),`);
    L.push("            lock = Record.FieldOrDefault(Overrides, key, null),");
  } else {
    L.push("            lock = null,");
  }
  L.push(`            v    = Record.FieldOrDefault(_, ${mText(column)}, null),`);
  L.push("            n    = if v = null then null else try Number.From(v) otherwise null");
  L.push("        in");
  L.push("            if lock <> null then lock");
  L.push(`            else if n = null then ${mText(nullLabel)}`);
  L.push("            else Labels{IdxOf(n)}, type text),");
  L.push("");
  L.push(`    AddSort = Table.AddColumn(AddBand, ${mText(sortCol)}, each`);
  L.push(`        SortOf(Record.Field(_, ${mText(bandCol)})), Int64.Type)`);
  L.push("in");
  L.push("    AddSort");
  return L.join("\n");
}

/** SQL Server: CASE WHEN ที่ให้ทั้งป้ายและเลขเรียง (ทำงานเดียวกับโค้ด M ทุกประการ) */
export function genSQL(cfg = {}) {
  const {
    column = "value", keyColumn = null, breaks = [], labels = [],
    nullLabel = "ไม่มีข้อมูล", overrides = {}, extras = [],
    bandColumn = null, sortColumn = null, table = "dbo.YourTable",
  } = cfg;
  const bandCol = bandColumn || "Band";
  const sortCol = sortColumn || "BandSort";
  const allLabels = [...labels, ...extras];
  const q = (s) => "N'" + String(s).replace(/'/g, "''") + "'";
  const br = (s) => "[" + String(s).replace(/]/g, "]]") + "]";
  const overKeys = Object.keys(overrides);

  const caseBand = [], caseSort = [];
  if (overKeys.length && keyColumn) {
    for (const k of overKeys) {
      const lab = String(overrides[k]);
      const si = allLabels.indexOf(lab);
      caseBand.push(`        WHEN ${br(keyColumn)} = ${q(k)} THEN ${q(lab)}`);
      caseSort.push(`        WHEN ${br(keyColumn)} = ${q(k)} THEN ${si >= 0 ? si + 1 : 0}`);
    }
  }
  caseBand.push(`        WHEN ${br(column)} IS NULL THEN ${q(nullLabel)}`);
  caseSort.push(`        WHEN ${br(column)} IS NULL THEN 0`);
  breaks.forEach((b, i) => {
    caseBand.push(`        WHEN ${br(column)} <= ${mNum(b)} THEN ${q(labels[i] ?? "")}`);
    caseSort.push(`        WHEN ${br(column)} <= ${mNum(b)} THEN ${i + 1}`);
  });
  caseBand.push(`        ELSE ${q(labels[labels.length - 1] ?? "")}`);
  caseSort.push(`        ELSE ${labels.length}`);

  return [
    "SELECT *,",
    "    CASE",
    ...caseBand,
    `    END AS ${br(bandCol)},`,
    "    CASE",
    ...caseSort,
    `    END AS ${br(sortCol)}`,
    `FROM ${table};`,
  ].join("\n");
}

/** DAX: คอลัมน์คำนวณคู่ (ป้าย + เลขเรียง) สำหรับคนที่อยากทำในโมเดลแทน Power Query */
export function genDAX(cfg = {}) {
  const { column = "ตัวเลข", table = "Table", breaks = [], labels = [], nullLabel = "ไม่มีข้อมูล" } = cfg;
  const ref = `'${table}'[${column}]`;
  const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  const band = [
    "Band =",
    `VAR v = ${ref}`,
    "RETURN",
    `    SWITCH(`,
    "        TRUE(),",
    `        ISBLANK(v), ${q(nullLabel)},`,
    ...breaks.map((b, i) => `        v <= ${mNum(b)}, ${q(labels[i] ?? "")},`),
    `        ${q(labels[labels.length - 1] ?? "")}`,
    "    )",
  ].join("\n");
  const sort = [
    "Band Sort =",
    `VAR v = ${ref}`,
    "RETURN",
    "    SWITCH(",
    "        TRUE(),",
    "        ISBLANK(v), 0,",
    ...breaks.map((b, i) => `        v <= ${mNum(b)}, ${i + 1},`),
    `        ${breaks.length + 1}`,
    "    )",
  ].join("\n");
  return band + "\n\n" + sort;
}
