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
export async function mergeAll(file, records, { nameOf, onProgress, fastFields = null } = {}) {
  const h = await handler();
  const out = [];
  /* fastFields = ตัวยึดทั้งหมดเมื่อเทมเพลตไม่มีบล็อกวนซ้ำ ใช้ตัวต่อข้อความเดียวกับทางข้อมูลใหญ่ (compileFast)
   * เร็วกว่า และค่าหลายบรรทัดขึ้นบรรทัดตรงตำแหน่งตัวยึด ทางไลบรารีต่อบรรทัดสองไว้ท้ายก้อน (ยิงจริง 07/11/2026) */
  if (fastFields) {
    const fast = await compileFast(file, fastFields);
    const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    for (let i = 0; i < records.length; i++) {
      const blob = fast.needsSlow(records[i]) ? await h.process(fast.tpl, records[i]) : new Blob([fast.render(records[i])], { type: DOCX });
      out.push({ name: nameOf ? nameOf(records[i], i) : tr(`เอกสาร-${i + 1}.docx`, `Document-${i + 1}.docx`), blob });
      onProgress?.({ done: i + 1, total: records.length });
      if (i % 200 === 199) await new Promise((r) => setTimeout(r, 0)); // ให้แถบความคืบหน้าขยับ
    }
    return out;
  }
  /* ‼️ easy-template-x คัดลอก docProps/core.xml ของเทมเพลตไปทุกไฟล์ที่สร้าง — ชื่อผู้เขียน
   * เทมเพลตจึงติดไปกับเอกสารทุกใบที่แจกจ่ายออก (ยิงจริง 09/09/2026: ทุกไฟล์ที่ merge ออกมา
   * มี dc:creator เดิมของเทมเพลตอยู่) ใช้ตัวล้าง metadata เดียวกับ word-clean ไม่เขียนซ้ำ
   * เฉพาะ metadata เท่านั้น — เนื้อหาที่ merge เข้าไปจริงไม่แตะ
   * ล้างที่เทมเพลตครั้งเดียวก่อนวน ทุกใบได้ core.xml ที่ล้างแล้วเหมือนกัน (06/11/2026 เดิมล้างทีละใบ
   * แตกและบีบไฟล์ซ้ำอีกรอบต่อใบ 2,800 ใบช้าเกินจำเป็น พี่ปอนด์ จดหมายเวียนรอเป็นชั่วโมง) */
  const { blob: tpl } = await cleanDocx(file, { comments: false, trackChanges: false, metadata: true, rsid: false });
  for (let i = 0; i < records.length; i++) {
    const blob = await h.process(tpl, records[i]);
    out.push({ name: nameOf ? nameOf(records[i], i) : tr(`เอกสาร-${i + 1}.docx`, `Document-${i + 1}.docx`), blob });
    onProgress?.({ done: i + 1, total: records.length });
  }
  return out;
}

/* ── ทางเร็วสำหรับข้อมูลใหญ่ (07/11/2026 พี่ปอนด์ท้าให้รองรับหลายแสนถึงล้านแถว) ──────────────
 * วัดจริงก่อนทำ: ทางเดิมใช้ราว 4.1 มิลลิวินาทีต่อฉบับ (แตกแพ็ก แปลง XML ทั้งเอกสาร แล้วบีบใหม่ทุกฉบับ)
 * ล้านฉบับคือราว 70 นาที และผลทุกฉบับค้างในหน่วยความจำ
 * ทางเร็ว: ให้ easy-template-x ทำงานครั้งเดียวด้วยตัวแทนที่ไม่ซ้ำ (QZXFK<เลข>QZX) แล้วตัดไฟล์ที่มีตัวแทนเป็นชิ้น
 * แต่ละฉบับแค่ต่อชิ้นกับค่าที่หลีกอักขระ XML แล้ว ไฟล์อื่นในแพ็กบีบครั้งเดียวใช้ไบต์ซ้ำ
 * ใช้ได้เฉพาะเทมเพลตที่มีแต่ตัวยึดธรรมดา (ไม่มีบล็อกวนซ้ำหรือเงื่อนไข) ค่าที่มีขึ้นบรรทัดต้องใช้ทางเดิม
 * เพราะ easy-template-x แตกเป็นหลายบรรทัดด้วย w:br (needsSlow บอก) ค่าว่างได้ w:t ว่าง (ทางเดิมลบ w:t ทิ้ง หน้าตาเหมือนกัน) */
const MARK_RE = /QZXFK(\d+)QZX/;
const xmlEsc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const valStr = (v) => (v == null ? "" : v.toString()); // แบบเดียวกับ stringValue ของ easy-template-x
export async function compileFast(file, fields) {
  const h = await handler();
  const zw = await import("./zipwrite.js");
  const { blob: tpl } = await cleanDocx(file, { comments: false, trackChanges: false, metadata: true, rsid: false });
  const marks = Object.fromEntries(fields.map((f, i) => [f, `QZXFK${i}QZX`]));
  const once = await h.process(tpl, marks);
  const zip = await globalThis.JSZip.loadAsync(once);
  const dec = new TextDecoder(), enc = new TextEncoder();
  const parts = [];
  let seen = 0;
  for (const name of Object.keys(zip.files)) {
    const f = zip.files[name];
    if (f.dir) continue;
    const bytes = await f.async("uint8array");
    if (/\.(xml|rels)$/i.test(name)) {
      const text = dec.decode(bytes);
      if (MARK_RE.test(text)) {
        const segs = text.split(/QZXFK(\d+)QZX/);
        // ตัวแทนแต่ละตัวอยู่ในข้อความ (ในแท็ก w:t) หรือไม่ ดูจากแท็กสุดท้ายก่อนหน้า ตัวที่อยู่ในข้อความใส่ขึ้นบรรทัดตรงตำแหน่งได้
        // ‼️ ทางเดิม (easy-template-x) ต่อบรรทัดที่สองไว้ท้ายก้อนข้อความ ข้อความหลังตัวยึดในบรรทัดเดียวกันจึงขึ้นก่อนบรรทัดสอง
        //    (ยิงจริง 07/11/2026 "หมายเหตุ {{x}} จบ" ได้ "หมายเหตุ บรรทัดแรก จบ" แล้วค่อย "บรรทัดสอง")
        const inText = [];
        let ctx = false;
        for (let i = 0; i < segs.length; i += 2) {
          const lt = segs[i].lastIndexOf("<");
          if (lt >= 0) ctx = /^<w:t(\s[^>]*)?>[^<]*$/.test(segs[i].slice(lt));
          if (i + 1 < segs.length) inText.push(ctx);
        }
        seen += inText.length; parts.push({ name, segs, inText }); continue;
      }
    }
    parts.push(await zw.deflateEntry(name, bytes));
  }
  const BR = '</w:t><w:br/><w:t xml:space="preserve">';
  return {
    tpl, // แม่แบบที่ล้างชื่อผู้เขียนแล้ว ค่าหลายบรรทัดที่ตัวแทนไม่ได้อยู่ในข้อความ (เช่นในค่าลิงก์) ใช้ตัวนี้กับทางเดิม
    marks: seen,
    needsSlow: (rec) => parts.some((p) => p.segs && p.inText.some((t, j) => !t && valStr(rec[fields[+p.segs[2 * j + 1]]]).includes("\n"))),
    render(rec) {
      return zw.makeZip(parts.map((p) => {
        if (!p.segs) return p;
        const out = p.segs.map((s, i) => {
          if (!(i % 2)) return s;
          const v = valStr(rec[fields[+s]]);
          return p.inText[(i - 1) / 2] && v.includes("\n") ? v.split("\n").map(xmlEsc).join(BR) : xmlEsc(v);
        });
        return zw.storeEntry(p.name, enc.encode(out.join("")));
      }));
    },
  };
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
/** look = { font, half, fields: { ชื่อฟิลด์: { half, minHalf } } } ฟอนต์เดียวทั้งฉลาก ขนาดเท่ากันหมด ตั้งขนาดรายฟิลด์และฟิลด์ที่ย่อเองได้
 *  ไม่ส่ง look = ฟอนต์และขนาดตามแม่แบบ ย่อทั้งช่องตามสัดส่วนแบบเดิม */
export async function mergeLabels(file, records, { onProgress, growFrom = 0, look = null } = {}) {
  if (!records.length) throw new Error(tr("ไม่มีแถวข้อมูลให้ทำฉลาก", "No data rows to make labels"));
  const { zip, doc } = await openDoc(file);
  const info = findLabelTable(doc);
  if (!info || info.slots.length < 2) throw new Error(tr("ไม่พบตารางฉลาก ต้องมีตารางที่ช่องแรกมีตัวยึด เช่น {{ชื่อ}}", "No label table found. Put placeholders like {{Name}} in the first table cell"));
  const { slots } = info;
  if (info.copied) {                                   // ตัวยึดแค่ช่องแรก คัดลอกแพทเทินไปทุกช่อง (ทับข้อความเก่าในช่อง)
    // รีวิวข้อ 1: ต้นแบบคือช่องที่มีตัวยึดจริง ไม่ใช่ช่องแรกของตาราง (ตัวยึดอยู่ช่องที่สอง เดิมได้ฉลากเปล่าทั้งไฟล์)
    const tpl = slots.find((tc) => textOf(tc).includes("{{"));
    const src = kids(tpl).filter((c) => c.localName !== "tcPr");
    for (const tc of slots.filter((x) => x !== tpl)) {
      kids(tc).filter((c) => c.localName !== "tcPr").forEach((c) => tc.removeChild(c));
      src.forEach((c) => tc.appendChild(c.cloneNode(true)));
    }
  }
  // พี่ปอนด์ 05/11/2026 ดึก ตั้งขนาดตัวอักษรรายฟิลด์ได้ ย่อหน้าที่มีตัวยึดจำไว้ว่าเป็นของฟิลด์ไหน (ตัวเติมข้อมูลเก็บแอตทริบิวต์ที่ติดไว้ เห็นจาก fk-rec)
  if (look) for (const tc of slots) for (const p of kids(tc, "p")) { const m = textOf(p).match(/\{\{\s*([^{}#/]+?)\s*\}\}/); if (m) p.setAttribute("fk-field", m[1]); }
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
    // หน้าท้ายที่รวมแถวยาว (พี่ปอนด์ 05/11/2026 "ขยายไปเลยความยาวกล่อง แล้วย้ายไปอยู่ล่างสุดรวม ๆ") แถวสูงตามข้อความ ไม่ย่อจิ๋ว ไม่ตัด
    // At least แทน Exactly ฉลากหนึ่งช่องไม่แยกข้ามหน้า (cantSplit) หน้าพวกนี้ไม่ตรงกระดาษสติกเกอร์อยู่แล้ว
    if (growFrom && pg >= growFrom) {
      for (const tc of mine) if (tc.hasAttribute("fk-rec")) tc.setAttribute("fk-grow", "1");
      // แถวที่ไม่มีฉลากเลยตัดทิ้ง กล่องที่สูงขึ้นรวมกับกล่องว่างดันย่อหน้าท้ายไปเป็นหน้าว่าง (Word จริง word2/grow-5.png 05/11/2026)
      for (const tr of clones.flatMap((c) => [...c.getElementsByTagNameNS(WNS, "tr")])) {
        const cells = kids(tr, "tc");
        if (cells.some((tc) => mine.includes(tc)) && !cells.some((tc) => tc.hasAttribute("fk-rec")) && kids(tr.parentNode, "tr").length > 1) tr.parentNode.removeChild(tr);
      }
      for (const tr of clones.flatMap((c) => [...c.getElementsByTagNameNS(WNS, "tr")])) {
        let trPr = kids(tr, "trPr")[0];
        if (!trPr) { trPr = doc.createElementNS(WNS, "w:trPr"); tr.insertBefore(trPr, kids(tr, "tblPrEx")[0]?.nextSibling || tr.firstChild); }
        kids(trPr, "trHeight").forEach((x) => x.setAttribute("w:hRule", "atLeast"));
        if (!kids(trPr, "cantSplit").length) trPr.insertBefore(doc.createElementNS(WNS, "w:cantSplit"), trPr.firstChild);
      }
    }
    onProgress?.({ done: pg, total: pages + 1 });
  }
  const h = await handler();
  let blob = await h.process(await saveDoc(zip, doc), data);
  // กันไว้: ช่องตารางที่ไม่เหลือ w:p เลย Word ฟ้องว่าไฟล์เสีย (เทส 05/11/2026 easy-template-x ยังเหลือย่อหน้าไว้ให้เสมอ
  // ถอดบรรทัดนี้แล้วเทสยังเขียว จึงยังไม่เคยเห็นเกิดจริง แต่ราคาถูกและพังแล้วเปิดไฟล์ไม่ได้ทั้งชุด)
  const out = await openDoc(blob);
  for (const tc of out.doc.getElementsByTagNameNS(WNS, "tc")) if (!kids(tc, "p").length) tc.appendChild(out.doc.createElementNS(WNS, "w:p"));
  const { over: overflow, need } = await fitCells(out, look);
  blob = await saveDoc(out.zip, out.doc);
  ({ blob } = await cleanDocx(blob, { comments: false, trackChanges: false, metadata: true, rsid: false }));
  onProgress?.({ done: pages + 1, total: pages + 1 });
  return { blob, pages, perPage: per, overflow, need };
}

// ── ย่อตัวอักษรช่องฉลากที่ข้อความยาวเกินความสูงแถว ─────────────────────────
// พี่ปอนด์ 05/11/2026 "ที่อยู่ยาวมาก ๆ มันจะเลยความกว้างไหม" Word ตัดบรรทัดให้เอง ไม่เลยความกว้าง แต่เลยความสูง
// แถว Exactly ข้อความเกินถูกตัดหายเงียบ แถว At least แถวยืดจนตารางดันฉลากที่เหลือเลื่อนไม่ตรงสติกเกอร์ (Word COM จริง)
// วิธี: ประเมินบรรทัดของแต่ละช่องหลังเติม ถ้าเกินความสูงแถว ย่อทุก run ในช่องลงทีละ 5% ปกติไม่ต่ำกว่า 10pt ยาวผิดปกติย่อต่อถึง 3pt
// ค่าสำรองตอนเบราว์เซอร์ไม่มีฟอนต์ วัดจาก Word จริงที่ไม่มี TH Sarabun New เลยแทนด้วย Cordia New: ระยะบรรทัดของฟอนต์ 1.2 เท่า ตัวที่กินที่กว้าง 0.36 เท่า
const COMBINING = /[ัิ-ฺ็-๎]/g;           // สระบนล่างวรรณยุกต์ไม่กินที่ในบรรทัด
const NARROW = /^(th |angsana|cordia|browallia|eucrosia|freesia|iris|jasmine|kodchiang|lily|dillenia)/i;
const MIN_HALF_PT = 20;                                            // 10pt ขนาดเล็กสุดของช่องปกติ
const TINY_HALF_PT = 6;                                            // 3pt ช่องที่ยาวมาก ย่อต่อจนพอดี (พี่ปอนด์ 05/11/2026 "ไม่เอาตัด ... มันควรเล็กสิถ้ามันเยอะ")
let floorHalf = MIN_HALF_PT;
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
// วัดจาก Word จริง 05/11/2026 ช่องตาราง Table Grid กว้าง 4749 twip ระยะบรรทัดเดียว (.claude/evidence/2026-11-05-label-look/word/measure2.out)
// ระยะบรรทัดต่อขนาดตัวอักษร Leelawadee UI 13.32pt ที่ 10pt , Tahoma 12.05 , Cordia New 19.42 ที่ 14pt (1.387)
// ความกว้างเฉลี่ยต่อตัว (em ไม่นับสระบนล่าง) Leelawadee UI 0.48 ถึง 0.55 , Tahoma 0.53 ถึง 0.58 , Cordia New 0.38 ถึง 0.41 ปัดขึ้น ยอมนับว่ายาวเกินดีกว่าล้นกล่อง
// ‼️ ค่าเดิม 1.2 ของ Cordia ได้จากการหาร 13.85 ด้วยระยะบรรทัด 1.15 ของเอกสาร แต่ช่อง Table Grid ใช้ 1.0 จริง สองค่าผิดคู่กันเลยหักลบกันพอดี
const WORD_LINE = { "leelawadee ui": 1.34, tahoma: 1.21, "cordia new": 1.39 };
const WORD_EM = { "leelawadee ui": 0.55, tahoma: 0.6, "cordia new": 0.41 };
function widthPt(text, font, pt) {
  // ฟอนต์ไทยตัวเล็กที่เครื่องไม่มี (TH Sarabun New ไม่มากับ Windows) Word เอา Cordia New มาวางแทน วัดด้วย Cordia New ตรงกับ Word
  // (373 ตัว 10pt Word 5 บรรทัด Cordia 5 บรรทัด , 186 ตัว 3 กับ 3 , .claude/evidence/2026-11-05-label-look/calib/sarabun.out)
  if (!hasFont(font) && NARROW.test(font || "") && hasFont("Cordia New")) font = "Cordia New";
  if (hasFont(font)) { const c = canvasCtx(); c.font = `${pt}pt "${font}"`; return c.measureText(text).width * 0.75; }
  return text.replace(COMBINING, "").length * pt * (WORD_EM[(font || "").toLowerCase()] || (NARROW.test(font || "") ? 0.41 : 0.5));
}
function lineFactor(font) {
  const known = WORD_LINE[(font || "").toLowerCase()];
  if (known) return known;                        // canvas ให้ Cordia 1.14 (คูณเผื่อ 1.1 ได้ 1.25) ต่ำกว่า Word 1.39 ใช้ค่าที่วัดจาก Word ก่อนเสมอ
  if (hasFont(font)) {
    const c = canvasCtx(); c.font = `100px "${font}"`;
    const m = c.measureText("กขค Ag");
    // canvas ให้ระยะบรรทัดต่ำกว่าที่ Word ใช้ (Cordia New: canvas 1.14 , Word 1.2 วัด 05/11/2026) เผื่อ 10% ยอมย่อเกินดีกว่าล้น
    if (m.fontBoundingBoxAscent) return ((m.fontBoundingBoxAscent + m.fontBoundingBoxDescent) / 100) * 1.1;
  }
  return NARROW.test(font || "") ? 1.39 : 1.34;    // ฟอนต์ที่ไม่รู้จัก ใช้ค่าของ Cordia New (ฟอนต์ไทยตัวเล็ก Word ใช้แทนเมื่อไม่มีฟอนต์) กับ Leelawadee UI
}
const num = (el, attr = "w:val") => (el ? Number(el.getAttribute(attr)) : NaN);
function first(n, path) {                       // ไล่ลูกตามชื่อ เช่น first(r, ["rPr","sz"])
  let cur = n;
  for (const name of path) { cur = cur && kids(cur, name)[0]; }
  return cur || null;
}
/** ชื่อฟอนต์ของข้อความไทยจาก rFonts ทั้งแบบระบุชื่อและแบบฟอนต์ธีม */
function fontOf(rf, d) {
  return rf.getAttribute("w:cs") || d.theme[rf.getAttribute("w:cstheme")] || rf.getAttribute("w:ascii") || d.theme[rf.getAttribute("w:asciiTheme")] || "";
}
async function docDefaults(zip) {
  const d = { half: 22, font: "", before: 0, after: 0, line: 240, rule: "auto", theme: {} };
  // ฟอนต์ธีม (Word ขึ้นว่า Cordia New (Body CS)) rFonts มีแค่ w:cstheme ไม่มีชื่อฟอนต์ เดิมได้ชื่อว่าง ประเมินกว้างเกินจริงราว 40%
  const th = zip.file("word/theme/theme1.xml");
  if (th) {
    const t = new DOMParser().parseFromString(await th.async("string"), "application/xml");
    const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
    for (const [tag, kind] of [["majorFont", "major"], ["minorFont", "minor"]]) {
      const box = t.getElementsByTagNameNS(A, tag)[0];
      if (!box) continue;
      const pick = (n) => kids(box).find((c) => c.localName === n)?.getAttribute("typeface") || "";
      const thai = kids(box).find((c) => c.localName === "font" && c.getAttribute("script") === "Thai")?.getAttribute("typeface") || "";
      d.theme[kind + "Bidi"] = pick("cs") || thai;
      d.theme[kind + "HAnsi"] = d.theme[kind + "Ascii"] = pick("latin");
    }
  }
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
    if (rf) d.font = fontOf(rf, d) || d.font;
  }
  const spacing = (dst, src) => {
    const sp = src && first(src, ["spacing"]);
    if (!sp) return dst;
    if (sp.hasAttribute("w:before")) dst.before = num(sp, "w:before");
    if (sp.hasAttribute("w:after")) dst.after = num(sp, "w:after");
    if (sp.hasAttribute("w:line")) { dst.line = num(sp, "w:line"); dst.rule = sp.getAttribute("w:lineRule") || "auto"; }
    return dst;
  };
  spacing(d, dd && first(dd, ["pPrDefault", "pPr"]));
  // ‼️ สไตล์ตาราง (Table Grid ของ Word ตั้งหลังย่อหน้า 0 ระยะบรรทัด 1.0) ทับค่าตั้งต้นของเอกสารในช่องตาราง แต่แพ้สไตล์ Normal ที่ตั้งเอง
  // พี่ปอนด์ใช้จริง 05/11/2026 ดึก แม่แบบ P_FERN 2,885 แถว เดิมนับหลังย่อหน้า 8pt กับบรรทัด 1.08 ของเอกสาร ช่องละ 4 ย่อหน้าเกินราว 40pt
  // แถวปกติถูกนับว่ายาวเกินแล้วย้ายไปท้าย 1,069 แถว ("ไปเลือกย้ายอันแปลก ๆ ไปอยู่ด้านหลัง")
  const styles = [...st.getElementsByTagNameNS(WNS, "style")];
  const byId = new Map(styles.map((x) => [x.getAttribute("w:styleId"), x]));
  d.tableSpacing = (id) => {
    const chain = [];
    for (let x = byId.get(id), n = 0; x && n < 10; x = byId.get(first(x, ["basedOn"])?.getAttribute("w:val")), n++) chain.unshift(x);
    const out = { before: d.before, after: d.after, line: d.line, rule: d.rule };
    for (const x of chain) spacing(out, first(x, ["pPr"]));
    return spacing(out, normal && first(normal, ["pPr"]));
  };
  spacing(d, normal && first(normal, ["pPr"]));
  return d;
}
/** บรรทัดของข้อความช่วงหนึ่ง (ระหว่างตัวขึ้นบรรทัด) */
function segLines(seg, usable) {
  // ‼️ คำที่ไม่มีอักษรไทยและไม่มีเว้นวรรค (Site ยาว PTN0038,RYG0010,...) Word ไม่ตัดต่อท้ายบรรทัดเดิม แต่ขึ้นบรรทัดใหม่ก่อน
  //    บรรทัด "Site :" จึงเสียที่ว่างเกือบทั้งบรรทัด ค่าเฉลี่ย 93% นับไม่ถึง ล้นครึ่งบรรทัดโดยไม่เตือน (Word จริง real30/word/zoom5c-1.png)
  //    จำลองตัดทีละคำ คำไทยตัดกลางคำได้ (Word ตัดตามพจนานุกรม) แล้วใช้ค่าที่มากกว่าระหว่างสองวิธี
  let sim = 1, cur = 0;
  for (const [w, thai] of seg.toks) {
    if (cur + w <= usable) { cur += w; continue; }
    // ‼️ คำไทยระหว่างเว้นวรรคที่ยาวไม่ถึงบรรทัด Word ยกทั้งคำขึ้นบรรทัดใหม่ (กรุงเทพมหานคร ไม่ถูกตัดกลางคำ) ตัดกลางคำเฉพาะคำที่ยาวเกินบรรทัด
    //    เดิมตัดคำไทยได้ทุกตำแหน่ง นับบรรทัดน้อยกว่า Word 99 จาก 2,872 ย่อหน้า (ที่อยู่จริงของพี่ปอนด์ 05/11/2026) กล่องที่นับว่าพอดีล้นจริง
    //    แก้แล้วนับน้อยกว่า Word 0 ย่อหน้าครบ 3 ฟอนต์ (.claude/evidence/2026-11-05-label-look/calib/est3.log)
    if (thai && w > usable) { const left = cur + w - usable; sim += Math.ceil(left / usable); cur = left % usable || usable; continue; }
    if (w <= usable) { sim++; cur = w; continue; }
    if (cur > 0) sim++;
    sim += Math.ceil(w / usable) - 1; cur = w % usable || usable;
  }
  // ตัวกันอีกชั้นจากความกว้างรวม เผื่อ 2% (เทียบ Word 2,872 ย่อหน้า: 1.0 นับเกิน 13 , 0.98 นับเกิน 96 ไม่มีนับขาด เผื่อเครื่องอื่นวัดฟอนต์ต่างเล็กน้อย)
  return Math.max(1, sim, Math.ceil(seg.width / (usable * 0.98)));
}
/** ความสูงที่ย่อหน้าหนึ่งต้องใช้ (pt) เมื่อขนาดตัวอักษรคูณ f */
function paraNeed(p, usable, def, f, info = null) {
  const sp = first(p, ["pPr", "spacing"]);
  const before = sp && sp.hasAttribute("w:before") ? num(sp, "w:before") : def.before;
  const after = sp && sp.hasAttribute("w:after") ? num(sp, "w:after") : def.after;
  const line = sp && sp.hasAttribute("w:line") ? num(sp, "w:line") : def.line;
  const rule = sp && sp.hasAttribute("w:line") ? (sp.getAttribute("w:lineRule") || "auto") : def.rule;
  let maxPt = 0, font = def.font, lines = 0;
  let seg = { width: 0, toks: [] }, glue = false;
  // รีวิว 05/11/2026 ข้อ 2: ค่าใน Excel ที่กด Alt+Enter easy-template-x แตกเป็น w:br เดิมไม่นับเลย ข้อความถูกตัดเงียบในแถว Exactly
  const close = () => { lines += segLines(seg, usable); seg = { width: 0, toks: [] }; glue = false; };
  for (const r of p.getElementsByTagNameNS(WNS, "r")) {
    const half = num(first(r, ["rPr", "szCs"])) || num(first(r, ["rPr", "sz"])) || def.half;
    const pt = scaled(half, f) / 2;
    const rf = first(r, ["rPr", "rFonts"]);
    const rfont = (rf && fontOf(rf, def)) || def.font;
    for (const c of kids(r)) {
      if (c.localName === "t" && c.textContent) {
        const text = c.textContent;
        seg.width += widthPt(text, rfont, pt); font = rfont;
        for (const w of text.split(/(?<=[ ​])/)) {   // ตัดได้หลังเว้นวรรคและหลัง ZW (softBreaks)
          if (!w) continue;
          const tok = [widthPt(w, rfont, pt), /[฀-๿]/.test(w)];
          if (glue && seg.toks.length) seg.toks[seg.toks.length - 1][0] += tok[0]; else seg.toks.push(tok);
          glue = false;
        }
      } else if (c.localName === "noBreakHyphen") {        // ขีดห้ามตัด คำก่อนและหลังขีดเป็นคำเดียวกัน
        const hw = widthPt("-", rfont, pt); seg.width += hw;
        if (seg.toks.length) seg.toks[seg.toks.length - 1][0] += hw; else seg.toks.push([hw, false]);
        glue = true;
      } else if ((c.localName === "br" && c.getAttribute("w:type") !== "page") || c.localName === "cr") close();
    }
    maxPt = Math.max(maxPt, pt);
  }
  close();
  if (info) info.lines = lines;
  if (!maxPt) maxPt = scaled(num(first(p, ["pPr", "rPr", "szCs"])) || num(first(p, ["pPr", "rPr", "sz"])) || def.half, f) / 2;
  const lh = rule === "auto" ? maxPt * lineFactor(font) * (line / 240) : Math.max(line / 20, rule === "atLeast" ? maxPt * lineFactor(font) : 0);
  return before / 20 + after / 20 + lines * lh;
}
/** ความสูงที่ข้อความในช่องต้องใช้ (pt) เมื่อขนาดตัวอักษรคูณ f */
function cellNeed(tc, usable, def, f) {
  return kids(tc, "p").reduce((sum, p) => sum + paraNeed(p, usable, def, f), 0);
}
function scaled(half, f) { return half <= floorHalf ? half : Math.max(floorHalf, Math.round(half * f)); }
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
/** ย่อช่องที่ล้น คืนเลขแถวข้อมูล (นับจาก 0) ที่ต้องย่อเล็กกว่า 10pt ถึงจะพอดี */
/** ความกว้างช่อง (twip) จากเส้นตาราง tblGrid ตามตำแหน่งคอลัมน์จริง
 *  พี่ปอนด์ใช้จริง 05/11/2026 เลือกย้ายแถวยาวไปหน้าท้ายแล้วไม่ย้าย ฉลากไม่ถูกย่อเลย หรือแถวปกติไปปนท้าย
 *  เทมเพลตที่ tcW เป็น auto หรือไม่มี tcW เดิมได้ 0 ข้ามทั้งไฟล์ , แบบ pct (ห้าสิบเท่าของร้อยละ) เดิมอ่านเป็น twip ช่องแคบผิดจริง
 *  จำลองบนเว็บจริง v207 ครบสามแบบ .claude/evidence/2026-11-05-filekit-end/live207-*.log */
function colWidth(tc) {
  const tr = tc.parentNode, tbl = tr && tr.parentNode;
  const grid = tbl && kids(tbl, "tblGrid")[0];
  const cols = grid ? kids(grid, "gridCol").map((g) => num(g, "w:w")) : [];
  let idx = num(first(tr, ["trPr", "gridBefore"])) || 0;
  for (const c of kids(tr, "tc")) {
    const span = num(first(c, ["tcPr", "gridSpan"])) || 1;
    if (c === tc) {
      const sum = cols.slice(idx, idx + span).reduce((a, b) => a + b, 0);
      if (sum && cols.length >= idx + span) return sum;
      break;
    }
    idx += span;
  }
  const w = first(tc, ["tcPr", "tcW"]);
  const type = w && (w.getAttribute("w:type") || "dxa");
  return type === "dxa" ? num(w, "w:w") : 0;
}
const THEME_ATTRS = ["w:asciiTheme", "w:hAnsiTheme", "w:cstheme", "w:eastAsiaTheme", "w:hint"];
function rPrOf(r) {
  let rPr = kids(r, "rPr")[0];
  if (!rPr) { rPr = r.ownerDocument.createElementNS(WNS, "w:rPr"); r.localName === "r" ? r.insertBefore(rPr, r.firstChild) : r.appendChild(rPr); }
  return rPr;
}
/** run ทุกตัวของย่อหน้า รวมเครื่องหมายท้ายย่อหน้า (pPr/rPr) ที่ตั้งไว้เดิม */
function runsOf(p) {
  const out = [...p.getElementsByTagNameNS(WNS, "r")];
  const pPr = kids(p, "pPr")[0];
  if (pPr && kids(pPr, "rPr").length) out.push(pPr);
  return out;
}
function setHalf(p, half) {
  for (const r of runsOf(p)) {
    const rPr = rPrOf(r);
    for (const name of ["sz", "szCs"]) {
      let e = kids(rPr, name)[0];
      if (!e) { e = rPr.ownerDocument.createElementNS(WNS, "w:" + name); rPr.appendChild(e); }
      e.setAttribute("w:val", String(half));
    }
  }
}
/** ฟอนต์เดียวทั้งฉลาก ไทยและอังกฤษ (ascii hAnsi cs eastAsia) ถอดฟอนต์ธีมที่ทับชื่อฟอนต์ออก */
function setFont(p, font) {
  for (const r of runsOf(p)) {
    const rPr = rPrOf(r);
    let rf = kids(rPr, "rFonts")[0];
    if (!rf) { rf = rPr.ownerDocument.createElementNS(WNS, "w:rFonts"); const st = kids(rPr, "rStyle")[0]; rPr.insertBefore(rf, st ? st.nextSibling : rPr.firstChild); }
    THEME_ATTRS.forEach((a) => rf.removeAttribute(a));
    for (const a of ["w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"]) rf.setAttribute(a, font);
  }
}
// พี่ปอนด์ใช้จริง 06/11/2026 (ภาพ 141 ถึง 143) Site ยาวหลายรหัส ย่อหน้าชิดขวาตามแม่แบบ บรรทัดแรกเต็มความกว้าง "Site :" ถูกดันไปซ้าย
// "ไม่ควรขยับตำแหน่งของข้อความ ... ทุกกรณีต้องยึดตามความเป็นจริง ... ถ้ามันยาวก็ไปเพิ่มบรรทัดใหม่เอา"
const ZW = "​";
/** จุลภาคที่ไม่มีเว้นวรรคตาม (PTN0038,RYG0010) ใส่ตัวเว้นวรรคกว้างศูนย์ให้ Word ตัดบรรทัดระหว่างรหัสได้ ไม่ตัดกลางรหัส ตาไม่เห็น
 *  ตัวเลขเงิน 1,234 ไม่แตะ (ตามด้วยตัวเลข) */
function softBreaks(p) {
  for (const t of [...p.getElementsByTagNameNS(WNS, "t")]) {
    const s = t.textContent, v = s.replace(/,(?=[^\s\d​])/g, "," + ZW);
    if (v !== s) t.textContent = v;
    // ขีดในรหัส RM-BKK5298/K Word ตัดบรรทัดหลังขีดได้ ได้ "RM-" ค้างท้ายบรรทัด (Word จริง 2026-11-06-label-site/p-226.png)
    // ขีดระหว่างตัวอักษรอังกฤษเปลี่ยนเป็นขีดห้ามตัดของ Word หน้าตาเหมือนเดิม ตัวเลข 24-26 ไม่แตะ
    const parts = t.textContent.split(/(?<=[A-Za-z])-(?=[A-Za-z])/);
    if (parts.length < 2) continue;
    const doc = t.ownerDocument; let at = t;
    t.textContent = parts[0];
    for (const part of parts.slice(1)) {
      const nb = doc.createElementNS(WNS, "w:noBreakHyphen"), nt = doc.createElementNS(WNS, "w:t");
      nt.setAttribute("xml:space", "preserve"); nt.textContent = part;
      at.parentNode.insertBefore(nb, at.nextSibling); nb.parentNode.insertBefore(nt, nb.nextSibling); at = nt;
    }
  }
}
/** ย่อหน้าชิดขวาหรือกึ่งกลางที่ยาวเกินบรรทัด ขึ้นบรรทัดใหม่หลังจุลภาคตัวแรก บรรทัดแรก (Site : รหัสแรก) อยู่ตำแหน่งเดียวกับฉลากปกติ ที่เหลือต่อบรรทัดล่าง */
function keepHead(p, usable, d) {
  const jc = first(p, ["pPr", "jc"]), al = jc ? jc.getAttribute("w:val") : "";
  if (!["right", "end", "center"].includes(al) || p.getElementsByTagNameNS(WNS, "br").length) return false;
  const info = {}; paraNeed(p, usable, d, 1, info);
  if (!(info.lines > 1)) return false;
  for (const t of [...p.getElementsByTagNameNS(WNS, "t")]) {
    const s = t.textContent, i = s.indexOf(",");
    if (i < 0) continue;
    const doc = t.ownerDocument, br = doc.createElementNS(WNS, "w:br"), rest = doc.createElementNS(WNS, "w:t");
    t.textContent = s.slice(0, i + 1);
    rest.setAttribute("xml:space", "preserve"); rest.textContent = s.slice(i + 1).replace(/^[\s​]+/, "");
    t.parentNode.insertBefore(br, t.nextSibling); br.parentNode.insertBefore(rest, br.nextSibling);
    return true;
  }
  return false;
}
const halfOfP = (p, dflt) => { for (const r of runsOf(p)) { const v = num(first(r, ["rPr", "sz"])); if (v) return v; } return dflt; };

async function fitCells({ zip, doc }, look = null) {
  const def = await docDefaults(zip);
  const over = [], need = {};
  const defOf = new Map();
  // ค่าเว้นย่อหน้าของช่องตามสไตล์ตารางที่ตารางนั้นใช้ (Table Grid ไม่เว้นหลังย่อหน้า)
  const cellDef = (tc) => {
    const tbl = tc.parentNode && tc.parentNode.parentNode;
    if (!defOf.has(tbl)) {
      const id = tbl && first(tbl, ["tblPr", "tblStyle"])?.getAttribute("w:val");
      defOf.set(tbl, id && def.tableSpacing ? { ...def, ...def.tableSpacing(id) } : def);
    }
    return defOf.get(tbl);
  };
  for (const tc of [...doc.getElementsByTagNameNS(WNS, "tc")]) {
    if (!tc.hasAttribute("fk-rec")) continue;
    const rec = Number(tc.getAttribute("fk-rec")); tc.removeAttribute("fk-rec");
    const grow = tc.hasAttribute("fk-grow"); tc.removeAttribute("fk-grow");
    const d = cellDef(tc);
    const fieldOf = (p) => (look && look.fields && look.fields[p.getAttribute("fk-field")]) || null;
    if (look) {
      // พี่ปอนด์ 05/11/2026 ดึก "เอาสักฟอนต์นึงที่รองรับภาษาไทยและอังกฤษ ขนาดตัวอักษรเท่ากันให้หมด ... ฟิลด์ไหนจะให้ dynamic มีขนาดเท่าไร ถ้าไม่เลือกก็เท่ากันหมด"
      // เดิมใช้ฟอนต์ตามแม่แบบ ชื่อกับที่อยู่ Cordia New 14 แต่บรรทัด Site เป็น Calibri 11 ตัวใหญ่กว่ากันชัด
      for (const p of kids(tc, "p")) { if (look.font) setFont(p, look.font); setHalf(p, fieldOf(p)?.half || look.half); }
    }
    for (const p of kids(tc, "p")) softBreaks(p);
    const tr = tc.parentNode, h = first(tr, ["trPr", "trHeight"]);
    const avail = num(h) / 20;                                            // ไม่ได้ตั้งความสูงแถว = แถวยืดได้ ไม่ต้องย่อ
    const w = colWidth(tc) / 20;
    if (!avail || !w) continue;
    const mar = first(tc, ["tcPr", "tcMar"]);
    const side = mar ? (num(first(mar, ["left"]), "w:w") || 108) + (num(first(mar, ["right"]), "w:w") || 108) : 216;
    const usable = w - side / 20;
    for (const p of kids(tc, "p")) keepHead(p, usable, d);
    const shrink = (floor) => { floorHalf = floor; let f = 1; while (cellNeed(tc, usable, d, f) > avail && f > 0.05) f -= 0.05; return Math.max(f, 0.05); };
    let long;
    if (look) {
      // ขนาดคงที่ทุกบรรทัด ย่อเฉพาะฟิลด์ที่เลือกให้ย่อได้ ทีละครึ่ง pt ไม่ต่ำกว่าขนาดเล็กสุดที่ตั้งไว้ของฟิลด์นั้น
      const dyn = kids(tc, "p").filter((p) => fieldOf(p)?.minHalf);
      floorHalf = 1;
      let n = cellNeed(tc, usable, d, 1);
      while (n > avail) {
        let moved = false;
        for (const p of dyn) { const cur = halfOfP(p, look.half); if (cur > fieldOf(p).minHalf) { setHalf(p, cur - 1); moved = true; } }
        if (!moved) break;
        n = cellNeed(tc, usable, d, 1);
      }
      long = n > avail;
      if (long) need[rec] = n;
      // ไว้ที่เดิมตามลำดับ Excel แถวที่ยังยาวเกินย่อทั้งช่องตามสัดส่วนถึง 3pt ให้พอดีกล่อง ไม่ตัดข้อความ , หน้าท้ายกล่องสูงตามข้อความ ไม่ย่อ
      if (long && !grow) { const f = shrink(TINY_HALF_PT); if (f < 1) setSizes(tc, f, d); }
    } else {
      // ลดทุก run ในช่องพร้อมกันตามสัดส่วนเดิม (บรรทัด Site เล็กลงด้วย) ทีละ 5% ปกติไม่ต่ำกว่า 10pt
      // ถึง 10pt แล้วยังไม่พอดี = แถวยาวผิดปกติ ย่อต่อถึง 3pt จนพอดีช่อง ไม่ตัดข้อความทิ้ง แล้วนับเป็นแถวที่ยาวเกิน (เตือนและย้ายไปท้ายได้)
      // เดิม 05/11/2026 v208 ตัดท้ายใส่ … พี่ปอนด์ "ไม่เอาตัด อันนี้แก้แล้วแย่กว่าเดิม" และ Site ตัวใหญ่ข้างที่อยู่ตัวจิ๋ว
      let f = shrink(MIN_HALF_PT);
      const n = cellNeed(tc, usable, d, f);
      long = n > avail;
      if (long) { need[rec] = n; if (!grow) f = shrink(TINY_HALF_PT); } // หน้าท้ายแถวยาว ย่อถึง 10pt แล้วให้กล่องสูงขึ้นเอง
      if (f < 1) setSizes(tc, f, d);
    }
    if (long) over.push(rec);
    floorHalf = MIN_HALF_PT;
  }
  for (const p of [...doc.getElementsByTagNameNS(WNS, "p")]) p.removeAttribute("fk-field");
  return { over, need };
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
