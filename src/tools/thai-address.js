// แยกที่อยู่ไทยที่อยู่รวมกันในช่องเดียว → 4 คอลัมน์: ตำบล/แขวง · อำเภอ/เขต · จังหวัด · รหัสไปรษณีย์
//
// ชุดข้อมูล: vendor/th-address.json
//   ที่มา : kongvut/thai-province-data — https://github.com/kongvut/thai-province-data
//   สัญญาอนุญาต : MIT License
//   เนื้อหา: 77 จังหวัด · 930 อำเภอ/เขต · 7,452 ตำบล/แขวง (ตัด name_en/timestamps ทิ้ง เก็บเฉพาะชื่อไทย+รหัสไปรษณีย์)
//   ‼️ โหลดด้วย fetch() ตอน mount() เท่านั้น — ไม่อยู่ใน libs ของ registry.js จึงไม่ถูก prefetch
//      ตอน hover การ์ดหรือตอนเปิดหน้าแรกเด็ดขาด (กติกาเว็บ: หน้าแรก 0 ไลบรารี/0 ข้อมูลหนัก)
//
// แนวคิดการแยก (ทำงานแบบ "จังหวัด → อำเภอ → ตำบล" หยาบไปละเอียด เพราะจังหวัดมีแค่ 77 ตัว
// ชนกันยาก ส่วนชื่ออำเภอ/ตำบลซ้ำกันข้ามจังหวัดได้เยอะ — พอ scope ในจังหวัดที่รู้แล้วความกำกวมหายเกือบหมด
// เพราะชื่ออำเภอไม่ซ้ำกันเองภายในจังหวัดเดียว และชื่อตำบลไม่ซ้ำกันเองภายในอำเภอเดียว — เช็คกับข้อมูลจริงแล้ว):
//   1) ตัดคำนำหน้า ต./ตำบล/แขวง, อ./อำเภอ/เขต, จ./จังหวัด (รวมกรุงเทพฯ/กทม./Bangkok) ออกมาเป็นชิ้น ๆ
//   2) ถ้าไม่มีคำนำหน้าเลย เดาจากลำดับคำท้ายข้อความ (ตำบล อำเภอ จังหวัด เรียงจากซ้ายไปขวา) แล้วยืนยันกับข้อมูลจริง
//   3) หาจังหวัดก่อนเสมอ (ตรงตัว/สะกดใกล้เคียงแบบไม่กำกวม) จากนั้นหาตำบลทั่วทั้งจังหวัด (แม่นกว่าหาอำเภอก่อน
//      เพราะคนมักละอำเภอ) ถ้าชื่อตำบลไปซ้ำกันหลายอำเภอในจังหวัดเดียวกัน ใช้คำว่าอำเภอที่ให้มาช่วยตัดสิน
//   4) รหัสไปรษณีย์เอาจากข้อมูลจริงของตำบลที่แยกได้เสมอ (ไม่ใช่เดาจากข้อความ) — กันพิมพ์ผิด/หลุดหาย
//   5) ไม่มั่นใจ (จังหวัดหาไม่เจอ, อำเภอไม่ตรงกับจังหวัดที่เจอ) → คืน ok:false บอกเหตุผล ไม่เดามั่ว
//      ไม่มั่นใจบางส่วน (ไม่มีคำนำหน้าเลยต้องเดาลำดับ, ยืนยันตำบลไม่ได้แต่ยังมีอำเภอ/จังหวัด) → ผ่านแบบติดธง "ไม่ชัวร์เต็มร้อย"
import { el } from "../dom.js";
import { columnTool } from "../sheetpick.js";
import { thaiToArabicDigits } from "../thai.js";
import { tr } from "../i18n.js";

const BKK_NAME = "กรุงเทพมหานคร";
const BKK_ALIASES = new Set(["กรุงเทพ", "กรุงเทพฯ", "กรุงเทพมหานคร", "กทม", "กทม."]);
const STOP_WORDS = new Set([
  "หมู่", "หมู่ที่", "ซอย", "ซ.", "ถนน", "ถ.", "แยก", "ตรอก", "หมู่บ้าน",
  "อาคาร", "ชั้น", "ห้อง", "เลขที่", "แขวง", "เขต", "คอนโด", "หอพัก",
]);

// ตัวอักษรไทยล้วน (พยัญชนะ+สระ+วรรณยุกต์) — ไม่รวมเลขไทย กันชื่อกลืนรหัสไปรษณีย์ที่ติดกันมาไม่มีช่องว่าง
const TH_WORD = "[\\u0E01-\\u0E3A\\u0E40-\\u0E4E]+";
const WORD_AFTER_MARK_RE = new RegExp("^[\\s.]*(" + TH_WORD + ")");
const MARK_RE = new RegExp(
  "(?<bkk>กรุงเทพมหานคร|กรุงเทพฯ|กรุงเทพ|กทม\\.?)" +
    "|(?<prov>จังหวัด|จ\\.)" +
    "|(?<dist>อำเภอ|อ\\.|เขต)" +
    "|(?<sub>ตำบล|ต\\.|แขวง)",
  "g"
);
const POSTCODE_RE = /(?<!\d)\d{5}(?!\d)/g;

/* ── โหลด+ปั้นดัชนีจาก vendor/th-address.json ────────────────────────── */
export function buildGeo(doc) {
  const provinces = doc.p.map(([name, districts]) => {
    const isBkk = name === BKK_NAME;
    const dList = districts.map(([dname, defZip, subs]) => {
      // ชื่ออำเภอของ กทม. ในข้อมูลต้นทางมีคำว่า "เขต" ติดมาด้วย (เช่น "เขตพระนคร")
      // ส่วนจังหวัดอื่นไม่มี "อำเภอ" ติดมา — ตัดออกให้ output เป็นชื่อล้วนสม่ำเสมอทุกจังหวัด
      const bareName = isBkk && dname.startsWith("เขต") ? dname.slice(3) : dname;
      const subs2 = subs.map((s) => (Array.isArray(s) ? { name: s[0], zip: s[1] } : { name: s, zip: defZip }));
      return { name: bareName, defaultZip: defZip, subs: subs2 };
    });
    return { name, districts: dList };
  });

  const provNameIndex = new Map();
  for (const p of provinces) {
    provNameIndex.set(p.name, p);
    p.districtIndex = new Map();
    p.subFlatIndex = new Map();   // ชื่อตำบล -> รายการ {dist,sub} (อาจมีมากกว่า 1 ถ้าชื่อซ้ำข้ามอำเภอ)
    p.subFlatList = [];
    for (const d of p.districts) {
      p.districtIndex.set(d.name, d);
      for (const sub of d.subs) {
        const rec = { dist: d, sub };
        p.subFlatList.push(rec);
        if (!p.subFlatIndex.has(sub.name)) p.subFlatIndex.set(sub.name, []);
        p.subFlatIndex.get(sub.name).push(rec);
      }
    }
  }
  return { provinces, provNameIndex };
}

/* ── fuzzy match พอประมาณ: Levenshtein + เกณฑ์ตามความยาว + ต้องชนะคู่แข่งอันดับ 2 ชัดเจน
   (เจอสองชื่อใกล้เคียงกันพอ ๆ กัน = ไม่กล้าฟันธง ปล่อย null ดีกว่าเดาผิด) ───────────── */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = new Array(n + 1);
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}
const fuzzyThreshold = (len) => (len <= 5 ? 1 : len <= 9 ? 2 : 3);

function fuzzyBest(s, list, nameOf) {
  let best = null, bestD = Infinity, secondD = Infinity;
  for (const it of list) {
    const d = levenshtein(s, nameOf(it));
    if (d < bestD) { secondD = bestD; bestD = d; best = it; }
    else if (d < secondD) secondD = d;
  }
  if (!best) return null;
  const th = fuzzyThreshold(Math.max(s.length, nameOf(best).length));
  return bestD <= th && bestD < secondD ? { item: best, dist: bestD } : null;
}

const cleanTok = (s) => String(s || "").replace(/^[\s,./]+|[\s,./]+$/g, "").trim();

function lookupName(raw, list, nameOf, indexMap) {
  const s = cleanTok(raw);
  if (!s) return null;
  if (indexMap && indexMap.has(s)) return { item: indexMap.get(s), fuzzy: false };
  const best = fuzzyBest(s, list, nameOf);
  return best ? { item: best.item, fuzzy: true } : null;
}

function findProvince(raw, geo) {
  const s = cleanTok(raw);
  if (!s) return null;
  if (BKK_ALIASES.has(s) || /^bangkok$/i.test(s))
    return { item: geo.provNameIndex.get(BKK_NAME), fuzzy: false };
  return lookupName(s, geo.provinces, (p) => p.name, geo.provNameIndex);
}

function findDistrict(prov, raw) {
  let s = cleanTok(raw);
  if (!s) return null;
  // "อ.เมือง" ไม่บอกชื่อจังหวัดต่อท้าย (คนมักละไว้เพราะข้างหลังมี จ. อยู่แล้ว) — เติมชื่อจังหวัดให้เอง
  if (s === "เมือง") s = "เมือง" + prov.name;
  return lookupName(s, prov.districts, (d) => d.name, prov.districtIndex);
}

/** หาตำบลทั่วทั้งจังหวัด (ไม่ต้องรู้อำเภอก่อน) — ถ้าชื่อซ้ำหลายอำเภอในจังหวัดเดียวกันจะคืน {ambiguous:[...]} */
function findSubAcrossProvince(prov, raw) {
  const s = cleanTok(raw);
  if (!s) return null;
  const exact = prov.subFlatIndex.get(s);
  if (exact) return exact.length === 1 ? { item: exact[0], fuzzy: false } : { ambiguous: exact };
  const best = fuzzyBest(s, prov.subFlatList, (x) => x.sub.name);
  return best ? { item: best.item, fuzzy: true } : null;
}

/* ── ตัดข้อความเป็นชิ้น ๆ ด้วยคำนำหน้า ต./อ./จ. (รองรับทั้งแบบมีจุด/เต็ม/ติดกัน/เว้นวรรค) ── */
function extractSegments(text) {
  const segs = { sub: null, dist: null, prov: null };
  let any = false, m;
  MARK_RE.lastIndex = 0;
  while ((m = MARK_RE.exec(text))) {
    any = true;
    let type, value;
    if (m.groups.bkk) { type = "prov"; value = BKK_NAME; }
    else {
      type = m.groups.prov ? "prov" : m.groups.dist ? "dist" : "sub";
      const rest = text.slice(m.index + m[0].length);
      const vm = rest.match(WORD_AFTER_MARK_RE);
      value = vm ? vm[1] : null;
    }
    if (value && !segs[type]) segs[type] = value;   // เก็บค่าแรกที่เจอของแต่ละประเภทเท่านั้น
  }
  return { segs, hasMarkers: any };
}

/** ไม่มีคำนำหน้าเลย → เดาจากคำ ตำบล/อำเภอ/จังหวัด เรียงติดกันท้ายข้อความ (รูปแบบที่พบบ่อยที่สุด) */
function fallbackTokens(text) {
  const stripped = text.replace(POSTCODE_RE, " ");
  return stripped
    .split(/[\s,]+/)
    .map(cleanTok)
    .filter(Boolean)
    .filter((t) => !/^[0-9/.\-]+$/.test(t))
    .filter((t) => !STOP_WORDS.has(t));
}

function isProvinceToken(tok, geo) {
  const s = cleanTok(tok);
  if (!s) return false;
  if (BKK_ALIASES.has(s) || /^bangkok$/i.test(s)) return true;
  return geo.provNameIndex.has(s);   // เฉพาะ "ตรงตัว" เท่านั้น — โหมดเดาลำดับคำห้าม fuzzy กันจับมั่ว
}

function normalizeText(raw) {
  return thaiToArabicDigits(String(raw))
    .replace(/[\u200b\ufeff\r]/g, "")
    .replace(/[，、]/g, ",")   // เว้นวรรค/จุลภาคจีน-ญี่ปุ่นที่หลุดมาบางไฟล์ → จุลภาคปกติ
    .trim();
}

/* ── ตัวหลัก: 1 ที่อยู่ → {ok,value:[ตำบล,อำเภอ,จังหวัด,รหัสไปรษณีย์],warn?,reason?} ────── */
export function parseAddress(raw, geo) {
  const text = normalizeText(raw);
  const { segs, hasMarkers } = extractSegments(text);
  let provSeg = segs.prov, distSeg = segs.dist, subSeg = segs.sub;
  let warn = false;

  if (!hasMarkers) {
    warn = true;   // ไม่มีคำนำหน้าให้ยึด ต้องเดาลำดับคำ — ติดธงให้ตรวจซ้ำเสมอแม้จะแยกได้
    const toks = fallbackTokens(text);
    let pIdx = -1;
    for (let i = toks.length - 1; i >= 0; i--) {
      if (isProvinceToken(toks[i], geo)) { pIdx = i; break; }
    }
    if (pIdx === -1)
      return { ok: false, reason: tr("ไม่มีคำนำหน้า ต./อ./จ. และหาชื่อจังหวัดในข้อความไม่เจอ",
                                      "No ต./อ./จ. markers, and no recognizable province name in the text") };
    provSeg = toks[pIdx];
    distSeg = pIdx >= 1 ? toks[pIdx - 1] : null;
    subSeg = pIdx >= 2 ? toks[pIdx - 2] : null;
  } else if (!provSeg) {
    // มีคำนำหน้า ต./อ./เขต ให้ตำบล/อำเภอ แต่ไม่มี "จ./จังหวัด/กรุงเทพ" (เช่นพิมพ์ "Bangkok" เป็นอังกฤษ
    // ปนกับ เขต/แขวง ภาษาไทย) — ลองหาชื่อจังหวัดจากคำในข้อความแทน (ตรงตัวเท่านั้น กัน fuzzy จับมั่ว)
    const toks = fallbackTokens(text);
    for (let i = toks.length - 1; i >= 0; i--) {
      if (isProvinceToken(toks[i], geo)) { provSeg = toks[i]; warn = true; break; }
    }
  }

  const provHit = findProvince(provSeg, geo);
  if (!provHit)
    return { ok: false, reason: tr(`ไม่รู้จักจังหวัด "${cleanTok(provSeg)}"`, `Unrecognized province "${cleanTok(provSeg)}"`) };
  const prov = provHit.item;
  warn = warn || provHit.fuzzy;

  let dist = null, sub = null;

  if (subSeg) {
    const subHit = findSubAcrossProvince(prov, subSeg);
    if (subHit && subHit.item) {
      dist = subHit.item.dist; sub = subHit.item.sub;
      warn = warn || subHit.fuzzy;
      if (distSeg) {
        const declared = findDistrict(prov, distSeg);
        if (declared && declared.item !== dist) warn = true;   // อำเภอที่พิมพ์มาขัดกับอำเภอของตำบลที่เจอ — เชื่อตำบล (เจาะจงกว่า) แต่เตือน
      }
    } else if (subHit && subHit.ambiguous) {
      // ชื่อตำบลนี้ซ้ำกันหลายอำเภอในจังหวัดเดียวกัน ต้องใช้อำเภอช่วยตัด
      if (distSeg) {
        const dHit = findDistrict(prov, distSeg);
        if (dHit) {
          const match = subHit.ambiguous.find((x) => x.dist === dHit.item);
          if (match) { dist = match.dist; sub = match.sub; warn = warn || dHit.fuzzy; }
        }
      }
    }
  }

  if (!dist && distSeg) {
    const dHit = findDistrict(prov, distSeg);
    if (dHit) { dist = dHit.item; warn = warn || dHit.fuzzy; }
  }

  if (!dist)
    return { ok: false, reason: tr("ระบุจังหวัดได้ แต่หาอำเภอ/เขตที่ตรงกันไม่เจอ — ข้อมูลไม่พอให้มั่นใจ",
                                    "Found the province but no matching district/khet — not enough to be confident") };
  if (!sub) warn = true;   // มีจังหวัด+อำเภอ แต่ยืนยันตำบลไม่ได้ — ให้ผ่านแบบติดธง ไม่ทิ้งทั้งแถว

  const zip = sub ? sub.zip : dist.defaultZip;
  return {
    ok: true,
    warn,
    value: [sub ? sub.name : null, dist.name, prov.name, zip != null ? String(zip) : null],
  };
}

export function mount(tool) {
  let geo = null, geoErr = null, refreshFn = null, noteEl = null;

  function setNote() {
    if (!noteEl) return;
    noteEl.textContent = geoErr
      ? tr("โหลดฐานข้อมูลที่อยู่ไม่สำเร็จ — ลองรีเฟรชหน้านี้ใหม่", "Could not load the address database — try refreshing this page")
      : geo
      ? tr("พร้อมใช้ — ฐานข้อมูล 77 จังหวัดทั่วประเทศ", "Ready — database covers all 77 provinces")
      : tr("กำลังโหลดฐานข้อมูลที่อยู่ไทย…", "Loading the Thai address database…");
  }

  // ‼️ โหลด vendor/th-address.json เฉพาะตอนเปิดเครื่องมือนี้เท่านั้น — ห้ามอยู่ใน libs ของ registry.js
  fetch("vendor/th-address.json")
    .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then((doc) => { geo = buildGeo(doc); })
    .catch((e) => { geoErr = e; })
    .finally(() => { setNote(); if (refreshFn) refreshFn(); });

  return columnTool(tool, {
    accept: ".xlsx,.xls,.csv", expect: ["xlsx", "csv"], expectLabel: tr("ไฟล์ Excel หรือ CSV", "an Excel or CSV file"),
    hint: tr("ไฟล์เดียว .xlsx .xls .csv — เลือกคอลัมน์ที่อยู่ที่ยังไม่ได้แยก",
             "One .xlsx .xls .csv file — pick the column with an unsplit address"),
    suffix: tr("-แยกที่อยู่แล้ว", "-address-split"), writeFail: true,
    guessColumn: (h) => /ที่อยู่|address/i.test(h),
    labels: {
      ok: tr("แยกได้", "Split"),
      warn: tr("ไม่ชัวร์เต็มร้อย — ควรตรวจซ้ำ", "Not fully certain — double-check"),
      bad: tr("แยกไม่ได้", "Could not split"),
    },

    options(refresh) {
      refreshFn = refresh;
      noteEl = el("div", { class: "note" }, "");
      setNote();
      return { node: noteEl, read: () => ({}) };
    },

    outName: () => [tr("ตำบล/แขวง", "Subdistrict"), tr("อำเภอ/เขต", "District"),
                    tr("จังหวัด", "Province"), tr("รหัสไปรษณีย์", "Postcode")],

    convert(v, o) {
      if (v == null || String(v).trim() === "") return null;
      if (geoErr) return { ok: false, reason: tr("โหลดฐานข้อมูลที่อยู่ไม่สำเร็จ", "Could not load the address database") };
      if (!geo) return { ok: false, reason: tr("กำลังโหลดฐานข้อมูล… ลองใหม่อีกครั้งสักครู่", "Loading data… try again shortly") };
      return parseAddress(v, geo);
    },

    note: tr("มีคำนำหน้า (ต./อ./จ.) หรือไม่มีก็อ่านได้, รหัสไปรษณีย์เอาจากฐานข้อมูล แก้พิมพ์ผิดให้, ไม่มั่นใจจะบอก ไม่เดา",
             "Works with or without ต./อ./จ. prefixes, Postcode comes from the database, fixing typos, Says so when unsure"),
  });
}
