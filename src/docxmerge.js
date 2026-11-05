// ── รวมข้อมูลจาก Excel เข้ากับเทมเพลต Word (Mail Merge) ────────────────────
// ใช้ easy-template-x (MIT) ที่ bundle เองไว้ใน vendor/ แทนการเขียน engine เอง
//
// เหตุผลที่เปลี่ยนมาใช้ไลบรารี ทั้งที่เคยเขียนเองได้แล้ว:
// ตัวที่เขียนเองแทนที่ข้อความล้วนได้ดี แต่ทำ "ตารางวนซ้ำ"ไม่ได้ ซึ่งเป็นสิ่งที่
// เอกสารจริงต้องใช้เกือบทุกใบ (ใบเสนอราคา ใบเสร็จ ใบส่งของ ล้วนมีรายการหลายบรรทัด)
// การรองรับ loop เองต้องจัดการโครงสร้างแถวตารางใน OOXML ซึ่งเสี่ยงพังกับเทมเพลต
// ที่ซับซ้อน ส่วน easy-template-x เป็น MIT ล้วน ไม่มีฟีเจอร์ที่ต้องจ่ายเงิน
//
// ที่ bundle เองเพราะ:
//   · ไลบรารีเผยแพร่เป็น ESM ที่มี bare import (jszip, xmldom, json5, lodash.get)
//     ซึ่งเบราว์เซอร์แก้เองไม่ได้ถ้าไม่มี bundler
//   · แทน @xmldom/xmldom ด้วย DOMParser ของเบราว์เซอร์ และแทน jszip ด้วยตัวที่
//     FileKit โหลดไว้แล้ว ทำให้ไฟล์เหลือ 33 KB (gzip) จาก 85 KB

import { loadLibs } from "./loader.js";
import { tr } from "./i18n.js";
import { clean as cleanDocx } from "./docxclean.js";

let libPromise = null;
async function lib() {
  if (!libPromise) {
    libPromise = (async () => {
      await loadLibs("jszip");                    // ต้องมาก่อน bundle จะหา globalThis.JSZip
      return import("../vendor/easy-template-x.esm.js");
    })().catch((e) => { libPromise = null; throw e; });
  }
  return libPromise;
}

/** ตัวคั่นแบบ {{...}} ให้ตรงกับที่คนไทยคุ้นและที่เอกสารช่วยเหลือของเราเขียนไว้ */
async function handler() {
  const etx = await lib();
  return new etx.TemplateHandler({
    delimiters: new etx.Delimiters({ tagStart: "{{", tagEnd: "}}" }),
  });
}

/**
 * อ่านตัวยึดทั้งหมดในเทมเพลต
 * คืน { fields, loops } — loops คือตัวยึดที่เป็นบล็อกวนซ้ำ ({{#ชื่อ}} ... {{/ชื่อ}})
 */
export async function readPlaceholders(file) {
  const h = await handler();
  let tags;
  try {
    tags = await h.parseTags(file);
  } catch (e) {
    throw new Error(tr("อ่านเทมเพลตไม่สำเร็จ ตรวจว่าเป็นไฟล์ .docx จริง และตัวยึดปิดครบทุกอัน (" + e.message + ")",
      "Could not read the template. Check that it's really a .docx and every placeholder is closed (" + e.message + ")"));
  }
  const loops = new Set(), fields = new Set();
  for (const t of tags) {
    const name = t.name;
    if (!name) continue;
    // easy-template-x ทำเครื่องหมายบล็อกวนซ้ำไว้ที่ tag ตัวเปิด/ปิด
    if (t.disposition === "Open" || t.disposition === "Close") loops.add(name);
    else fields.add(name);
  }
  return { fields: [...fields], loops: [...loops] };
}

/** สร้างเอกสารหนึ่งชุดจากข้อมูลหนึ่งก้อน */
export async function mergeOne(file, data) {
  const h = await handler();
  return h.process(file, data);
}

/** ทำทั้งชุด: เทมเพลตหนึ่งไฟล์ + ข้อมูลหลายก้อน → เอกสารหลายไฟล์ */
export async function mergeAll(file, records, { nameOf, onProgress } = {}) {
  const h = await handler();
  const out = [];
  for (let i = 0; i < records.length; i++) {
    let blob = await h.process(file, records[i]);
    /* ‼️ easy-template-x คัดลอก docProps/core.xml ของเทมเพลตไปทุกไฟล์ที่สร้าง — ชื่อผู้เขียน
     * เทมเพลตจึงติดไปกับเอกสารทุกใบที่แจกจ่ายออก (ยิงจริง 09/09/2026: ทุกไฟล์ที่ merge ออกมา
     * มี dc:creator เดิมของเทมเพลตอยู่) ใช้ตัวล้าง metadata เดียวกับ word-clean ไม่เขียนซ้ำ
     * เฉพาะ metadata เท่านั้น — เนื้อหาที่ merge เข้าไปจริงไม่แตะ */
    ({ blob } = await cleanDocx(blob, { comments: false, trackChanges: false, metadata: true, rsid: false }));
    out.push({ name: nameOf ? nameOf(records[i], i) : tr(`เอกสาร-${i + 1}.docx`, `Document-${i + 1}.docx`), blob });
    onProgress?.({ done: i + 1, total: records.length });
  }
  return out;
}

/**
 * จัดข้อมูลตารางแบนจาก Excel ให้เป็นก้อนตามเอกสาร
 * โหมด "row"   : หนึ่งแถว = หนึ่งเอกสาร
 * โหมด "group" : แถวที่มีค่าในคอลัมน์ groupBy เหมือนกัน = เอกสารเดียว
 *                คอลัมน์ที่ค่าเหมือนกันทั้งกลุ่มกลายเป็นตัวยึดธรรมดา
 *                ส่วนรายการที่ต่างกันไปอยู่ในบล็อกวนซ้ำตามชื่อ loop ที่เทมเพลตใช้
 */
// ค่าที่คนไทยใช้แทน "จริง/เท็จ"ใน Excel — ต้องแปลงเป็น boolean จริงก่อนส่งเข้าเทมเพลต
// ‼️ ถ้าไม่แปลง คำว่า "FALSE"จะเป็นสตริงที่ไม่ว่าง = ถือว่าจริง → เงื่อนไขแสดงตลอด
// ‼️ ห้ามใส่ "1"/"0" — คอลัมน์อย่าง "ลำดับ"หรือ "จำนวน"ที่มีค่า 1 จะกลายเป็น true
// แล้วพิมพ์ออกมาเป็นคำว่า true ในเอกสาร (เจอจริงตอนทำตัวอย่างใบเสนอราคา)
const TRUE_WORDS = new Set(["true", "yes", "y", "ใช่", "จริง", "มี", "ผ่าน", "อนุมัติ", "✓", "✔"]);
const FALSE_WORDS = new Set(["false", "no", "n", "ไม่ใช่", "เท็จ", "ไม่มี", "ไม่ผ่าน", "ไม่อนุมัติ", "✗", "✘"]);

/** คืน true/false ถ้าค่านั้นสื่อความหมายจริง-เท็จ · คืน null ถ้าเป็นข้อความธรรมดา */
export function asBoolean(v) {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (TRUE_WORDS.has(s)) return true;
  if (FALSE_WORDS.has(s)) return false;
  return null;
}

/**
 * เตรียมข้อมูลหนึ่งระเบียนให้เทมเพลตใช้ได้
 * · ค่าที่สื่อจริง-เท็จ ถูกแปลงเป็น boolean เพื่อให้ {{#เงื่อนไข}} ทำงานถูก
 * · สร้างตัวกลับด้าน "ไม่<ชื่อ>"ให้อัตโนมัติ เพราะไลบรารีไม่รองรับ {{^เงื่อนไข}}
 *   ผู้ใช้จึงเขียน {{#ไม่ผ่านทดลองงาน}}…{{/ไม่ผ่านทดลองงาน}} ได้เลยโดยไม่ต้องเพิ่มคอลัมน์
 */
/**
 * ชื่อของ "เงื่อนไขตรงข้าม" — ไทยใช้คำนำหน้า "ไม่" อังกฤษใช้ "not"
 *
 * ‼️ ต้องรองรับทั้งสองภาษาเสมอ ห้ามผูกกับภาษาที่ผู้ใช้เลือกบนหน้าจอ
 *    เพราะชื่อคอลัมน์มาจากไฟล์ Excel ของผู้ใช้ จะเป็นภาษาอะไรก็ได้ ไม่เกี่ยวกับ UI
 * ‼️ ฝั่งอังกฤษ "not" ต้องตามด้วยตัวพิมพ์ใหญ่หรือตัวคั่นเท่านั้น
 *    ไม่งั้นคอลัมน์ชื่อ "notes" จะถูกตีความว่าเป็นเงื่อนไขตรงข้ามของ "es"
 * ‼️ ตรรกะนี้ต้องตรงกับที่ src/tools/word-mailmerge.js ใช้ตอนจับคู่คอลัมน์ — จึง export ให้ใช้ร่วมกัน
 */
const NEG_EN = /^not(?=[A-Z])|^not[ _-]/;
const NEG_TH = "ไม่";              // ‼️ ยาว 3 หน่วยใน JS ไม่ใช่ 2 (ไ + ม + ไม้เอก) ห้ามใส่เลขตรง ๆ
export const isNegName = (k) => k.startsWith(NEG_TH) || NEG_EN.test(k);
export function negName(k) {
  if (k.startsWith(NEG_TH)) return k.slice(NEG_TH.length);
  const m = k.match(NEG_EN);
  if (m) return k.slice(m[0].length);
  return /^[\u0E00-\u0E7F]/.test(k) ? NEG_TH + k : "not" + k.charAt(0).toUpperCase() + k.slice(1);
}

export function normalizeRecord(o) {
  const out = { ...o };
  for (const [k, v] of Object.entries(o)) {
    const b = asBoolean(v);
    if (b === null) continue;
    out[k] = b;
    const negKey = negName(k);
    if (!(negKey in out)) out[negKey] = !b;
  }
  return out;
}

export function buildRecords(rows, { mode = "row", groupBy, loopName, mapping }) {
  const pick = (row) => {
    const o = {};
    for (const [field, col] of Object.entries(mapping)) o[field] = col ? (row[col] ?? "") : "";
    return normalizeRecord(o);
  };

  if (mode === "row" || !groupBy || !loopName) return rows.map(pick);

  const groups = new Map();
  for (const row of rows) {
    const key = String(row[groupBy] ?? "");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  return [...groups.values()].map((items) => {
    const first = pick(items[0]);
    const record = { ...first };
    // ค่าที่ไม่เหมือนกันทุกแถวในกลุ่ม ไม่ควรใช้เป็นค่าระดับเอกสาร (กันหยิบค่าแถวแรกมาแทนทั้งกลุ่มแบบผิด ๆ)
    for (const key of Object.keys(first)) {
      const values = new Set(items.map((r) => String(pick(r)[key] ?? "")));
      if (values.size > 1) record[key] = typeof first[key] === "boolean" ? false : "";
    }
    record[loopName] = items.map(pick);
    record.__rows = items;
    return record;
  });
}

// ── โหมดฉลาก: หลายแถวของ Excel ต่อหนึ่งหน้า ได้ไฟล์ Word เดียว ──────────────
// พี่ปอนด์ 05/11/2026 ทำฉลากชื่อที่อยู่ ตาราง 2x6 ต่อหน้า อยากให้เติมจาก Excel ทีละช่องแล้วเพิ่มหน้าเอง
// วิธี: หาตารางแรกที่มีตัวยึด ช่องที่มีตัวยึดคือช่องฉลาก (มีช่องเดียว = คัดลอกแพทเทินไปทุกช่องที่กว้างเท่ากัน)
//      คัดเนื้อหน้าเดียวซ้ำเท่าจำนวนหน้า ครอบแต่ละช่องด้วยบล็อกวนซ้ำ {{#fkL_หน้า_ช่อง}} … {{/…}}
//      แล้วส่งให้ easy-template-x เติมทีเดียว ช่องที่ไม่มีข้อมูลได้รายการว่าง เนื้อหาทั้งช่องหายไป
// ‼️ คั่นหน้าด้วยตัวแบ่ง section (คัด sectPr ของเอกสารไปไว้ที่ย่อหน้าท้ายของแต่ละหน้า) ไม่ใช่ w:br page
//    ตัวขึ้นหน้าใหม่แบบ br ทิ้งย่อหน้าว่างไว้หัวหน้าถัดไป ตารางที่เต็มหน้าพอดีจะดันแถวล่างตกไปอีกหน้า
const WNS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const kids = (n, name) => [...n.childNodes].filter((c) => c.nodeType === 1 && (!name || c.localName === name));
const textOf = (n) => [...n.getElementsByTagNameNS(WNS, "t")].map((t) => t.textContent).join("");
const tagSet = (s) => [...s.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((m) => m[1]).sort().join("|");
function cellsOf(tbl) { return kids(tbl, "tr").flatMap((tr) => kids(tr, "tc")); }
function widthOf(tc) {
  const pr = kids(tc, "tcPr")[0];
  const w = pr && kids(pr, "tcW")[0];
  return w ? w.getAttribute("w:w") || "" : "";
}
function findLabelTable(doc) {
  for (const tbl of doc.getElementsByTagNameNS(WNS, "tbl")) {
    const cells = cellsOf(tbl);
    const withTags = cells.filter((tc) => textOf(tc).includes("{{"));
    if (withTags.length) {
      if (withTags.length >= 2) return { cells, slots: withTags, copied: 0, auto: new Set(withTags.map((tc) => tagSet(textOf(tc)))).size === 1 };
      // ตารางที่ทำเองใน Word ช่องกว้างไม่เท่ากันเป๊ะ (5386 กับ 5329 ต่างกัน 1%) ยอมคลาด 5% ยังกันช่องเว้นระยะแคบ ๆ ระหว่างฉลากไม่ให้นับ
      const w = Number(widthOf(withTags[0])) || 0;
      const near = (tc) => { const x = Number(widthOf(tc)) || 0; return w ? Math.abs(x - w) <= w * 0.05 : !x; };
      const slots = cells.filter(near);
      return { cells, slots, copied: slots.length - 1, auto: false };
    }
  }
  return null;
}
async function openDoc(file) {
  const [JSZip] = await loadLibs("jszip");
  const zip = await JSZip.loadAsync(file);
  const doc = new DOMParser().parseFromString(await zip.file("word/document.xml").async("string"), "application/xml");
  return { zip, doc };
}
async function saveDoc(zip, doc) {
  zip.file("word/document.xml", new XMLSerializer().serializeToString(doc));
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

/** ดูว่าเทมเพลตทำฉลากได้ไหม คืน { slots: จำนวนช่องต่อหน้า, copied: ช่องที่จะคัดลอกแพทเทินไปให้, auto: ตัวยึดซ้ำครบหลายช่องจึงน่าจะตั้งใจทำฉลาก } หรือ null */
export async function inspectLabels(file) {
  try {
    const { doc } = await openDoc(file);
    const info = findLabelTable(doc);
    return info && info.slots.length >= 2 ? { slots: info.slots.length, copied: info.copied, auto: info.auto } : null;
  } catch { return null; }
}

function run(doc, text) {
  const r = doc.createElementNS(WNS, "w:r"), t = doc.createElementNS(WNS, "w:t");
  t.setAttribute("xml:space", "preserve"); t.textContent = text; r.appendChild(t);
  return r;
}

/** เติมข้อมูลลงช่องฉลากทีละช่องตามลำดับแถว เต็มหน้าแล้วขึ้นหน้าใหม่ คืน { blob, pages, perPage } */
export async function mergeLabels(file, records, { onProgress } = {}) {
  if (!records.length) throw new Error(tr("ไม่มีแถวข้อมูลให้ทำฉลาก", "No data rows to make labels"));
  const { zip, doc } = await openDoc(file);
  const info = findLabelTable(doc);
  if (!info || info.slots.length < 2) throw new Error(tr("ไม่พบตารางฉลาก ต้องมีตารางที่ช่องแรกมีตัวยึด เช่น {{ชื่อ}}", "No label table found. Put placeholders like {{Name}} in the first table cell"));
  const { slots } = info;
  if (info.copied) {                                   // ตัวยึดแค่ช่องแรก คัดลอกแพทเทินไปทุกช่อง (ทับข้อความเก่าในช่อง)
    const src = kids(slots[0]).filter((c) => c.localName !== "tcPr");
    for (const tc of slots.slice(1)) {
      kids(tc).filter((c) => c.localName !== "tcPr").forEach((c) => tc.removeChild(c));
      src.forEach((c) => tc.appendChild(c.cloneNode(true)));
    }
  }
  fixLayout(slots[0].parentNode.parentNode);
  slots.forEach((tc, k) => tc.setAttribute("fk-slot", String(k + 1)));
  const body = doc.getElementsByTagNameNS(WNS, "body")[0];
  const finalSect = kids(body, "sectPr").pop() || null;
  const content = kids(body).filter((c) => c !== finalSect);
  content.forEach((c) => body.removeChild(c));
  const per = slots.length, pages = Math.ceil(records.length / per);
  const data = {};
  for (let pg = 1; pg <= pages; pg++) {
    const clones = content.map((c) => c.cloneNode(true));
    clones.forEach((c) => body.insertBefore(c, finalSect));
    const mine = clones.flatMap((c) => [...(c.localName === "tc" ? [c] : []), ...c.getElementsByTagNameNS(WNS, "tc")]).filter((tc) => tc.hasAttribute("fk-slot"));
    for (const tc of mine) {
      const k = Number(tc.getAttribute("fk-slot")); tc.removeAttribute("fk-slot");
      const key = `fkL_${pg}_${k}`, rec = records[(pg - 1) * per + k - 1];
      data[key] = rec ? [rec] : [];
      if (rec) tc.setAttribute("fk-rec", String((pg - 1) * per + k - 1));   // ไว้หาช่องของแถวนี้หลังเติม เพื่อย่อตัวอักษรช่องที่ล้น
      const ps = kids(tc, "p");
      if (!ps.length) tc.appendChild(doc.createElementNS(WNS, "w:p")), ps.push(kids(tc, "p")[0]);
      const first = ps[0], last = ps[ps.length - 1];
      const pPr = kids(first, "pPr")[0];
      first.insertBefore(run(doc, `{{#${key}}}`), pPr ? pPr.nextSibling : first.firstChild);
      last.appendChild(run(doc, `{{/${key}}}`));
    }
    if (pg < pages && finalSect) {                     // ตัวแบ่ง section ที่ย่อหน้าท้ายของหน้า ค่าตั้งต้นของ section คือขึ้นหน้าใหม่
      let tail = clones[clones.length - 1];
      if (tail.localName !== "p") { tail = doc.createElementNS(WNS, "w:p"); body.insertBefore(tail, finalSect); }
      let pPr = kids(tail, "pPr")[0];
      if (!pPr) { pPr = doc.createElementNS(WNS, "w:pPr"); tail.insertBefore(pPr, tail.firstChild); }
      kids(pPr, "sectPr").forEach((s) => pPr.removeChild(s));
      const sect = finalSect.cloneNode(true);
      kids(sect, "type").forEach((t) => t.setAttribute("w:val", "nextPage"));
      pPr.appendChild(sect);
    }
    onProgress?.({ done: pg, total: pages + 1 });
  }
  const h = await handler();
  let blob = await h.process(await saveDoc(zip, doc), data);
  // กันไว้: ช่องตารางที่ไม่เหลือ w:p เลย Word ฟ้องว่าไฟล์เสีย (เทส 05/11/2026 easy-template-x ยังเหลือย่อหน้าไว้ให้เสมอ
  // ถอดบรรทัดนี้แล้วเทสยังเขียว จึงยังไม่เคยเห็นเกิดจริง แต่ราคาถูกและพังแล้วเปิดไฟล์ไม่ได้ทั้งชุด)
  const out = await openDoc(blob);
  for (const tc of out.doc.getElementsByTagNameNS(WNS, "tc")) if (!kids(tc, "p").length) tc.appendChild(out.doc.createElementNS(WNS, "w:p"));
  const overflow = await fitCells(out);
  blob = await saveDoc(out.zip, out.doc);
  ({ blob } = await cleanDocx(blob, { comments: false, trackChanges: false, metadata: true, rsid: false }));
  onProgress?.({ done: pages + 1, total: pages + 1 });
  return { blob, pages, perPage: per, overflow };
}

// ── ย่อตัวอักษรช่องฉลากที่ข้อความยาวเกินความสูงแถว ─────────────────────────
// พี่ปอนด์ 05/11/2026 "ที่อยู่ยาวมาก ๆ มันจะเลยความกว้างไหม" Word ตัดบรรทัดให้เอง ไม่เลยความกว้าง แต่เลยความสูง
// แถว Exactly ข้อความเกินถูกตัดหายเงียบ แถว At least แถวยืดจนตารางดันฉลากที่เหลือเลื่อนไม่ตรงสติกเกอร์ (Word COM จริง)
// วิธี: ประเมินบรรทัดของแต่ละช่องหลังเติม ถ้าเกินความสูงแถว ย่อทุก run ในช่องลงทีละ 5% ไม่ต่ำกว่า 10pt
// ค่าสำรองตอนเบราว์เซอร์ไม่มีฟอนต์ วัดจาก Word จริงที่ไม่มี TH Sarabun New เลยแทนด้วย Cordia New: ระยะบรรทัดของฟอนต์ 1.2 เท่า ตัวที่กินที่กว้าง 0.36 เท่า
const COMBINING = /[ัิ-ฺ็-๎]/g;           // สระบนล่างวรรณยุกต์ไม่กินที่ในบรรทัด
const NARROW = /^(th |angsana|cordia|browallia|eucrosia|freesia|iris|jasmine|kodchiang|lily|dillenia)/i;
const MIN_HALF_PT = 20;                                            // 10pt
let mctx = null;
const fontSeen = new Map();
function canvasCtx() { if (!mctx) mctx = document.createElement("canvas").getContext("2d"); return mctx; }
function hasFont(name) {
  if (!name) return false;
  if (!fontSeen.has(name)) {
    const c = canvasCtx(), probe = "กขคงabcdefgh 0123456789";
    const w = (f) => { c.font = f; return c.measureText(probe).width; };
    fontSeen.set(name, w(`40px "${name}", monospace`) !== w("40px monospace") || w(`40px "${name}", serif`) !== w("40px serif"));
  }
  return fontSeen.get(name);
}
function widthPt(text, font, pt) {
  if (hasFont(font)) { const c = canvasCtx(); c.font = `${pt}pt "${font}"`; return c.measureText(text).width * 0.75; }
  return text.replace(COMBINING, "").length * pt * (NARROW.test(font || "") ? 0.36 : 0.5);
}
function lineFactor(font) {
  if (hasFont(font)) {
    const c = canvasCtx(); c.font = `100px "${font}"`;
    const m = c.measureText("กขค Ag");
    // canvas ให้ระยะบรรทัดต่ำกว่าที่ Word ใช้ (Cordia New: canvas 1.14 , Word 1.2 วัด 05/11/2026) เผื่อ 10% ยอมย่อเกินดีกว่าล้น
    if (m.fontBoundingBoxAscent) return ((m.fontBoundingBoxAscent + m.fontBoundingBoxDescent) / 100) * 1.1;
  }
  return NARROW.test(font || "") ? 1.2 : 1.25;    // 1.2 วัดจาก Word (Cordia New ที่ Word ใช้แทนเมื่อไม่มีฟอนต์) 13.85pt ที่ 10pt หารระยะบรรทัด 1.15 ของเอกสาร , 1.25 ยังไม่ได้วัด
}
const num = (el, attr = "w:val") => (el ? Number(el.getAttribute(attr)) : NaN);
function first(n, path) {                       // ไล่ลูกตามชื่อ เช่น first(r, ["rPr","sz"])
  let cur = n;
  for (const name of path) { cur = cur && kids(cur, name)[0]; }
  return cur || null;
}
async function docDefaults(zip) {
  const d = { half: 22, font: "", before: 0, after: 0, line: 240, rule: "auto" };
  const f = zip.file("word/styles.xml");
  if (!f) return d;
  const st = new DOMParser().parseFromString(await f.async("string"), "application/xml");
  const dd = st.getElementsByTagNameNS(WNS, "docDefaults")[0];
  const normal = [...st.getElementsByTagNameNS(WNS, "style")].find((s) => s.getAttribute("w:type") === "paragraph" && s.getAttribute("w:default") === "1");
  for (const src of [dd && first(dd, ["rPrDefault", "rPr"]), normal && first(normal, ["rPr"])]) {
    if (!src) continue;
    const sz = num(first(src, ["szCs"])) || num(first(src, ["sz"]));
    if (sz) d.half = sz;
    const rf = first(src, ["rFonts"]);
    if (rf) d.font = rf.getAttribute("w:cs") || rf.getAttribute("w:ascii") || d.font;
  }
  for (const src of [dd && first(dd, ["pPrDefault", "pPr"]), normal && first(normal, ["pPr"])]) {
    const sp = src && first(src, ["spacing"]);
    if (!sp) continue;
    if (sp.hasAttribute("w:before")) d.before = num(sp, "w:before");
    if (sp.hasAttribute("w:after")) d.after = num(sp, "w:after");
    if (sp.hasAttribute("w:line")) { d.line = num(sp, "w:line"); d.rule = sp.getAttribute("w:lineRule") || "auto"; }
  }
  return d;
}
/** ความสูงที่ข้อความในช่องต้องใช้ (pt) เมื่อขนาดตัวอักษรคูณ f */
function cellNeed(tc, usable, def, f) {
  let total = 0;
  for (const p of kids(tc, "p")) {
    const sp = first(p, ["pPr", "spacing"]);
    const before = sp && sp.hasAttribute("w:before") ? num(sp, "w:before") : def.before;
    const after = sp && sp.hasAttribute("w:after") ? num(sp, "w:after") : def.after;
    const line = sp && sp.hasAttribute("w:line") ? num(sp, "w:line") : def.line;
    const rule = sp && sp.hasAttribute("w:line") ? (sp.getAttribute("w:lineRule") || "auto") : def.rule;
    let width = 0, maxPt = 0, font = def.font;
    const toks = [];                                                     // คำทีละคำไว้จำลองตัดบรรทัด [กว้าง, ตัดกลางคำได้ไหม]
    for (const r of p.getElementsByTagNameNS(WNS, "r")) {
      const text = [...r.getElementsByTagNameNS(WNS, "t")].map((t) => t.textContent).join("");
      const half = num(first(r, ["rPr", "szCs"])) || num(first(r, ["rPr", "sz"])) || def.half;
      const pt = scaled(half, f) / 2;
      const rf = first(r, ["rPr", "rFonts"]);
      const rfont = (rf && (rf.getAttribute("w:cs") || rf.getAttribute("w:ascii"))) || def.font;
      if (text) {
        width += widthPt(text, rfont, pt); font = rfont;
        for (const w of text.split(/(?<= )/)) if (w) toks.push([widthPt(w, rfont, pt), /[\u0E00-\u0E7F]/.test(w)]);
      }
      maxPt = Math.max(maxPt, pt);
    }
    if (!maxPt) maxPt = scaled(num(first(p, ["pPr", "rPr", "szCs"])) || num(first(p, ["pPr", "rPr", "sz"])) || def.half, f) / 2;
    // ‼️ คำที่ไม่มีอักษรไทยและไม่มีเว้นวรรค (Site ยาว PTN0038,RYG0010,...) Word ไม่ตัดต่อท้ายบรรทัดเดิม แต่ขึ้นบรรทัดใหม่ก่อน
    //    บรรทัด "Site :" จึงเสียที่ว่างเกือบทั้งบรรทัด ค่าเฉลี่ย 93% นับไม่ถึง ล้นครึ่งบรรทัดโดยไม่เตือน (Word จริง real30/word/zoom5c-1.png)
    //    จำลองตัดทีละคำ คำไทยตัดกลางคำได้ (Word ตัดตามพจนานุกรม) แล้วใช้ค่าที่มากกว่าระหว่างสองวิธี
    let sim = 1, cur = 0;
    for (const [w, thai] of toks) {
      if (cur + w <= usable) { cur += w; continue; }
      if (thai) { const left = cur + w - usable; sim += Math.ceil(left / usable); cur = left % usable || usable; continue; }
      if (w <= usable) { sim++; cur = w; continue; }
      if (cur > 0) sim++;
      sim += Math.ceil(w / usable) - 1; cur = w % usable || usable;
    }
    const lines = Math.max(1, sim, Math.ceil(width / (usable * 0.93)));         // ตัดบรรทัดตามคำ บรรทัดจริงเต็มเฉลี่ย 93% (Word จริง 05/11/2026: 373 ตัว 14pt 7 บรรทัด 10pt 5 บรรทัด , 186 ตัว 14pt 4 บรรทัด)
    const lh = rule === "auto" ? maxPt * lineFactor(font) * (line / 240) : Math.max(line / 20, rule === "atLeast" ? maxPt * lineFactor(font) : 0);
    total += before / 20 + after / 20 + lines * lh;
  }
  return total;
}
function scaled(half, f) { return half <= MIN_HALF_PT ? half : Math.max(MIN_HALF_PT, Math.round(half * f)); }
function setSizes(tc, f, def) {
  const doc = tc.ownerDocument;
  const targets = [...tc.getElementsByTagNameNS(WNS, "r")];
  // เครื่องหมายท้ายย่อหน้าแตะเฉพาะที่ตั้งขนาดไว้เดิม ไม่สร้างใหม่ (ช่องที่เดิมไม่ได้ตั้ง ใช้ค่าตั้งต้นของเอกสารต่อ)
  for (const p of kids(tc, "p")) { const pPr = kids(p, "pPr")[0]; if (pPr && kids(pPr, "rPr").length) targets.push(pPr); }
  for (const r of targets) {
    let rPr = kids(r, "rPr")[0];
    if (!rPr) { rPr = doc.createElementNS(WNS, "w:rPr"); r.localName === "r" ? r.insertBefore(rPr, r.firstChild) : r.appendChild(rPr); }
    const half = num(first(rPr, ["szCs"])) || num(first(rPr, ["sz"])) || def.half;
    const v = String(scaled(half, f));
    for (const name of ["sz", "szCs"]) {
      let e = kids(rPr, name)[0];
      if (!e) { e = doc.createElementNS(WNS, "w:" + name); rPr.appendChild(e); }
      e.setAttribute("w:val", v);
    }
  }
}
/** ย่อช่องที่ล้น คืนเลขแถวข้อมูล (นับจาก 0) ที่ย่อถึง 10pt แล้วยังเกิน */
async function fitCells({ zip, doc }) {
  const def = await docDefaults(zip);
  const over = [];
  for (const tc of [...doc.getElementsByTagNameNS(WNS, "tc")]) {
    if (!tc.hasAttribute("fk-rec")) continue;
    const rec = Number(tc.getAttribute("fk-rec")); tc.removeAttribute("fk-rec");
    const tr = tc.parentNode, h = first(tr, ["trPr", "trHeight"]);
    const avail = num(h) / 20;                                            // ไม่ได้ตั้งความสูงแถว = แถวยืดได้ ไม่ต้องย่อ
    const w = Number(widthOf(tc)) / 20;
    if (!avail || !w) continue;
    const mar = first(tc, ["tcPr", "tcMar"]);
    const side = mar ? (num(first(mar, ["left"]), "w:w") || 108) + (num(first(mar, ["right"]), "w:w") || 108) : 216;
    const usable = w - side / 20;
    let f = 1;
    while (cellNeed(tc, usable, def, f) > avail && f > 0.3) f -= 0.05;
    if (f < 1) setSizes(tc, Math.max(f, 0.3), def);
    if (cellNeed(tc, usable, def, Math.max(f, 0.3)) > avail) over.push(rec);
  }
  return over;
}

// ── ล็อกความกว้างคอลัมน์ตารางฉลาก ────────────────────────────────────────────
// พี่ปอนด์ใช้จริง 05/11/2026 (2,885 แถว) ช่องที่มี Site ยาวติดกันไม่มีเว้นวรรค (PTN0038,RYG0010,...) Word ปรับคอลัมน์ตามเนื้อหา (AutoFit)
// ขยายคอลัมน์นั้นจนเกือบเต็มหน้า อีกคอลัมน์ถูกบีบตกบรรทัดทีละคำหรือตกขอบกระดาษ ทั้งหน้าเพี้ยน และได้ 306 หน้าแทน 241
// Word จริงยืนยัน: ใส่ w:tblLayout fixed แล้วทุกแถวกว้างตามเทมเพลต ข้อความยาวตัดบรรทัดอยู่ในช่องของตัวเอง (autofit/ กับ autofit2/)
// ลำดับลูกใน tblPr ตาม schema: tblLayout อยู่ก่อน tblCellMar tblLook tblCaption tblDescription tblPrChange
function fixLayout(tbl) {
  if (!tbl || tbl.localName !== "tbl") return;
  const doc = tbl.ownerDocument;
  let pr = kids(tbl, "tblPr")[0];
  if (!pr) { pr = doc.createElementNS(WNS, "w:tblPr"); tbl.insertBefore(pr, tbl.firstChild); }
  let lay = kids(pr, "tblLayout")[0];
  if (!lay) {
    lay = doc.createElementNS(WNS, "w:tblLayout");
    const after = kids(pr).find((c) => ["tblCellMar", "tblLook", "tblCaption", "tblDescription", "tblPrChange"].includes(c.localName));
    pr.insertBefore(lay, after || null);
  }
  lay.setAttribute("w:type", "fixed");
  // พี่ปอนด์ใช้จริง 05/11/2026 เทมเพลตแถว At least ที่อยู่ยาวเป็นสิบที่ แถวยืดล้นไปอีกหน้า ฉลากทุกช่องหลังจากนั้นเลื่อนไม่ตรงสติกเกอร์
  // แถวที่ตั้งความสูงไว้บังคับเป็น Exactly ตำแหน่งฉลากต้องตรงกระดาษก่อน ข้อความที่ยังเกินหลังย่อถึง 10pt เครื่องมือเตือนแถว Excel ให้ไปแก้
  for (const tr of kids(tbl, "tr")) {
    const h = kids(kids(tr, "trPr")[0] || tr, "trHeight")[0];
    if (h && Number(h.getAttribute("w:val")) > 0) h.setAttribute("w:hRule", "exact");
  }
}
