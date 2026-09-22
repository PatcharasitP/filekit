// ─────────────────────────────────────────────────────────────────────────────
// ห้องแก้ไข (แผนเฟส 3): draw.io ตัวเต็มจอ ใช้ปุ่ม "บันทึก และ ออก" กับ "ออก" ของ draw.io เอง ไม่ทำแถบซ้อน
//
// ยิงจริงแล้ว 22/09/2026 (.claude/evidence/flowkit-build-2026-09-22/engine_probe6-7.py)
//   load แบบ xml หรือ xmlpng (data URI ของ .drawio.png) เปิดผังเดิมได้ ข้อความไทยครบ
//   lang=th ได้เมนูไทยทั้งชุด , noSaveBtn=1 ได้ปุ่ม "บันทึก และ ออก" + "ออก"
//   autosave:1 แล้วผู้ใช้แก้ ได้ event autosave พร้อม xml ทุกครั้ง , กดบันทึก ได้ event save พร้อม xml
// ‼️ iframe แยกจากตัววาดพรีวิว (engine.js) เพราะตัวนั้นซ่อนอยู่และวาดใหม่ทุกครั้งที่พิมพ์ จะเอามาเปิดให้แก้ไม่ได้
// ─────────────────────────────────────────────────────────────────────────────
import { tr, IS_EN } from "../../src/i18n.js";
import { DRAWIO, EngineError, pngBlob } from "./engine.js";

const ORIGIN = new URL(DRAWIO, location.href).origin;
/* ‼️ lockdown=1 (ยิงจริง 22/09/2026 , PROVEN.md หัวข้อ 🔐 ส่งออก PDF): เมนู ไฟล์ → ส่งออกเป็น → PDF ของ draw.io ส่งผังทั้งผังไป convert.diagrams.net
   ใส่แล้วไม่มีคำขอออกนอกเครื่องเลย ห้องยังเปิดผัง โหลด Sarabun และบันทึกได้ PNG เท่าเดิมทุกไบต์
   ‼️ ต้องอยู่ในที่อยู่เท่านั้น ส่ง { lockdown: true } ทาง configure ไม่มีผลกับตัวฝัง (โค้ดเขาอ่านจาก urlParams ที่เดียว) */
const PARAMS = `?embed=1&proto=json&spin=1&noSaveBtn=1&lockdown=1&lang=${IS_EN ? "en" : "th"}`;
const STEP_MAX_MS = 15000;

/**
 * @param {{ onSave(r: {png: Blob, xml: string}): void, onAutosave?(xml: string): void, onClose?(): void }} opts
 */
export function createEditor({ onSave, onAutosave = () => {}, onClose = () => {} }) {
  const room = document.getElementById("room");
  let frame = null, booting = null, busy = false;
  const waiters = new Set();

  window.addEventListener("message", (ev) => {
    if (!frame || ev.source !== frame.contentWindow || ev.origin !== ORIGIN || typeof ev.data !== "string") return;
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (!m || typeof m.event !== "string") return;
    for (const w of waiters) if (w.event === m.event) { waiters.delete(w); w.done(m); return; }
    if (m.event === "autosave" && typeof m.xml === "string") onAutosave(m.xml);
    else if (m.event === "save") save();
    else if (m.event === "exit") close();
  });

  const wait = (event, ms = STEP_MAX_MS) => new Promise((resolve, reject) => {
    const w = { event, done: (m) => { clearTimeout(t); resolve(m); } };
    const t = ms ? setTimeout(() => { waiters.delete(w); reject(new EngineError("timeout", event)); }, ms) : 0;
    waiters.add(w);
  });
  const send = (msg) => frame.contentWindow.postMessage(JSON.stringify(msg), ORIGIN);

  function boot() {
    if (booting) return booting;
    frame = document.createElement("iframe");
    frame.className = "editroom-frame";
    frame.title = tr("ห้องแก้ไขผัง draw.io", "draw.io diagram editor");
    booting = wait("init", 60000).catch((e) => { frame.remove(); frame = null; booting = null; throw e; });
    frame.src = DRAWIO + PARAMS;
    room.append(frame);
    return booting;
  }

  /** เปิดห้อง พร้อมผัง (xml ของ draw.io หรือ data URI ของ .drawio.png อย่างใดอย่างหนึ่ง) */
  async function open({ xml, xmlpng }) {
    room.hidden = false;
    document.documentElement.classList.add("in-room");
    room.dataset.state = "loading";
    try {
      await boot();
      const p = wait("load");
      send(xmlpng ? { action: "load", autosave: 1, xmlpng } : { action: "load", autosave: 1, xml });
      await p;
      room.dataset.state = "ready";
      frame.focus();
    } catch (e) {
      room.dataset.state = "error";
      throw e;
    }
  }

  /** ผู้ใช้กด "บันทึก และ ออก": ขอภาพจากห้อง (PNG ฝัง XML เหมือนพรีวิว) แล้วส่งกลับหน้าผัง */
  async function save() {
    if (busy) return;
    busy = true;
    try {
      const p = wait("export");
      send({ action: "export", format: "xmlpng", scale: 2, border: 16, background: "#ffffff" });
      const out = await p;
      const png = pngBlob(out.data);
      onSave({ png, xml: out.xml || "" });
      close();
    } finally { busy = false; }
  }

  function close() {
    room.hidden = true;
    document.documentElement.classList.remove("in-room");
    onClose();
  }

  return { open, close, get isOpen() { return !room.hidden; } };
}
