// ─────────────────────────────────────────────────────────────────────────────
// ดูไฟล์เต็ม ๆ ก่อนลงมือ — โหลดตอนกดดูครั้งแรกเท่านั้น (ไม่ถ่วงหน้าแรก)
// ‼️ ชื่อไฟล์อย่างเดียวไม่พอ โดยเฉพาะภาพที่แคปมาจากคลิปบอร์ดซึ่งชื่อ "image.png" เหมือนกันหมด
//    ต้องเห็นรูปถึงจะรู้ว่าหยิบถูกใบ (พี่ปอนด์ทักเอง 08/09/2026 — "กดดูรูปไม่ได้เหรอ")
// ─────────────────────────────────────────────────────────────────────────────
import { el } from "./dom.js";
import { tr } from "./i18n.js";
import { detectType } from "./filetype.js";

let box = null;      // <dialog> ตัวเดียวใช้ซ้ำทั้งเว็บ
let url = null;      // objectURL ของรูปที่กำลังเปิดอยู่ — ต้องคืนหน่วยความจำตอนปิด

/** ไฟล์ชนิดนี้เปิดดูได้ไหม (รูปเปิดได้เสมอ · PDF เปิดได้เมื่อ pdf.js โหลดอยู่แล้ว) */
export const canView = (file) =>
  detectType(file) === "image" || (detectType(file) === "pdf" && !!window.pdfjsLib);

function ensureBox() {
  if (box) return box;
  const stage = el("div", { class: "pv-stage" });
  const cap = el("div", { class: "pv-cap" });
  const close = el("button", {
    class: "pv-x", type: "button", "aria-label": tr("ปิด", "Close"),
    onclick: () => box.close(),
  }, "✕");
  box = el("dialog", { class: "pv" }, [close, stage, cap]);
  // คลิกนอกภาพ = ปิด (พฤติกรรมที่คนคาดหวังจากภาพเต็มจอ)
  box.addEventListener("click", (e) => { if (e.target === box) box.close(); });
  box.addEventListener("close", () => {
    if (url) { URL.revokeObjectURL(url); url = null; }
    stage.innerHTML = "";
  });
  document.body.appendChild(box);
  box._stage = stage; box._cap = cap;
  return box;
}

/** เปิดดูไฟล์เต็มจอ — คืน true ถ้าเปิดให้ได้จริง */
export async function viewFile(file) {
  if (!canView(file)) return false;
  const d = ensureBox();
  d._cap.textContent = file.name || tr("รูปจากคลิปบอร์ด", "Image from clipboard");
  d._stage.innerHTML = "";
  d.showModal();

  if (detectType(file) === "image") {
    url = URL.createObjectURL(file);
    d._stage.appendChild(el("img", { src: url, alt: file.name || "" }));
    return true;
  }
  // PDF: วาดหน้าแรกใหญ่ ๆ พอให้อ่านออกว่าใช่ฉบับที่ต้องการไหม
  try {
    const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const page = await doc.getPage(1);
    const vp0 = page.getViewport({ scale: 1 });
    const scale = Math.min((innerWidth * 0.86) / vp0.width, (innerHeight * 0.78) / vp0.height);
    const viewport = page.getViewport({ scale: Math.max(0.2, scale) });
    const canvas = el("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    doc.destroy?.();
    if (d.open) d._stage.appendChild(canvas);      // ผู้ใช้อาจปิดไปแล้วระหว่างวาด
    d._cap.textContent += tr(`  ·  หน้า 1 จาก ${doc.numPages}`, `  ·  page 1 of ${doc.numPages}`);
  } catch (e) {
    console.error(e);
    d._stage.appendChild(el("div", { class: "pv-err" },
      tr("เปิดดูไฟล์นี้ไม่ได้ — อาจเสียหายหรือถูกล็อกไว้", "Could not open this file — it may be damaged or locked")));
  }
  return true;
}
