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
    const blob = await h.process(file, records[i]);
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
