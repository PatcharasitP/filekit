// ── รวมข้อมูลจาก Excel เข้ากับเทมเพลต Word (Mail Merge) ────────────────────
// ใช้ easy-template-x (MIT) ที่ bundle เองไว้ใน vendor/ แทนการเขียน engine เอง
//
// เหตุผลที่เปลี่ยนมาใช้ไลบรารี ทั้งที่เคยเขียนเองได้แล้ว:
// ตัวที่เขียนเองแทนที่ข้อความล้วนได้ดี แต่ทำ "ตารางวนซ้ำ" ไม่ได้ ซึ่งเป็นสิ่งที่
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
    throw new Error("อ่านเทมเพลตไม่สำเร็จ — ตรวจว่าเป็นไฟล์ .docx จริง และตัวยึดปิดครบทุกอัน (" + e.message + ")");
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
    out.push({ name: nameOf ? nameOf(records[i], i) : `เอกสาร-${i + 1}.docx`, blob });
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
export function buildRecords(rows, { mode = "row", groupBy, loopName, mapping }) {
  const pick = (row) => {
    const o = {};
    for (const [field, col] of Object.entries(mapping)) o[field] = col ? (row[col] ?? "") : "";
    return o;
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
      if (values.size > 1) record[key] = "";
    }
    record[loopName] = items.map(pick);
    record.__rows = items;
    return record;
  });
}
