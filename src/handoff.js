// ‼️ สัญญาไฟล์กลาง: FlowKit (repo flowkit อีกเว็บในโดเมนเดียวกัน) import ไฟล์นี้ตรง ๆ ผ่าน ../FlowKit/src/shared.js
//    export ที่ FlowKit ใช้ห้ามเปลี่ยนความหมายหรือตัดทิ้ง (เพิ่มได้ , จะตัดต้องให้ FlowKit ย้ายก่อน) แก้แล้วรัน tests/runp.sh contract
// ─────────────────────────────────────────────────────────────────────────────
// ส่งไฟล์ข้ามหน้าในบ้านเดียวกัน (FlowKit flow/ → FileKit หน้าแรก) แผน FlowKit D5
//
// ‼️ stashFiles() ของ ui.js เก็บในหน่วยความจำของหน้าเดียวกัน ข้ามไป URL อื่นไม่ได้ (P8)
//    จึงฝากใน IndexedDB ของ origin เดียวกันแทน พิสูจน์แล้วเฟส 0 ข้อ ค (Chromium กับ Firefox):
//    ไฟล์ 5 MB ชื่อไทยข้ามได้ sha256 ตรง ยังเป็น File อยู่ อ่านแล้วลบเหลือ 0
// ‼️ อ่านแล้วลบทันที และหมดอายุใน 5 นาที ไฟล์ของคนก่อนจะไม่ไปโผล่ในเครื่องมือของคนถัดไป
// ‼️ ธงใน sessionStorage บอกหน้าแรกว่ามีของรอรับ หน้าแรกโหลดไฟล์นี้เฉพาะตอนเห็นธง (หน้าแรกปกติไม่เสียอะไร)
// ─────────────────────────────────────────────────────────────────────────────

export const FLAG = "fk:handoff";
export const TTL_MS = 5 * 60 * 1000;
const DB = "fk-handoff", STORE = "box", KEY = "pending";

function open() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function run(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/** ฝากไฟล์ไว้ให้เครื่องมือ `tool` ของ FileKit หยิบไปใช้ (ผู้เรียกพาหน้าไปที่ ../#/tool เอง) */
export async function send(files, tool) {
  const db = await open();
  try { await run(db, "readwrite", (s) => s.put({ files: [...files], tool, at: Date.now() }, KEY)); }
  finally { db.close(); }
  try { sessionStorage.setItem(FLAG, tool); } catch { /* โหมดส่วนตัวบางตัว หน้าแรกจะไม่รู้ว่ามีของรอ ผู้ใช้เลือกไฟล์เองได้ */ }
}

/** หยิบของที่ฝากไว้ (อ่านแล้วลบ) คืน { files, tool } หรือ null ถ้าไม่มีหรือหมดอายุ */
export async function receive(now = Date.now()) {
  try { sessionStorage.removeItem(FLAG); } catch { /* โหมดส่วนตัว */ }
  const db = await open();
  try {
    const rec = await run(db, "readonly", (s) => s.get(KEY));
    await run(db, "readwrite", (s) => s.delete(KEY));
    if (!rec || !Array.isArray(rec.files) || !rec.files.length || now - rec.at > TTL_MS) return null;
    return { files: rec.files, tool: rec.tool };
  } finally { db.close(); }
}
