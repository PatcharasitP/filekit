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

/* ── ซูม ─────────────────────────────────────────────────────────────────
 * แคปหน้าจอมาแล้วต้องซูมอ่านตัวหนังสือเล็ก ๆ ได้ ไม่งั้นดูได้แค่ "ใช่ใบนี้ไหม"
 * scale 0 = พอดีจอ · >0 = เท่าของขนาดจริง · ให้ .pv-stage เลื่อนดูเอง (overflow:auto)
 * มือถือใช้นิ้วหุบ-กางได้ตามปกติเพราะ touch-action:pinch-zoom */
let scale = 0, media = null;
const MIN = 0.1, MAX = 6;

function applyScale(atX, atY) {
  if (!media) return;
  const st = box._stage;
  if (scale <= 0) {
    media.style.width = ""; media.style.maxWidth = ""; media.style.maxHeight = "";
    media.classList.remove("zoomed");
    box.classList.remove("is-zoomed");
    return;
  }
  const natW = media.naturalWidth || media.width;
  const before = { w: media.offsetWidth, h: media.offsetHeight, l: st.scrollLeft, t: st.scrollTop };
  media.style.maxWidth = "none"; media.style.maxHeight = "none";
  media.style.width = Math.round(natW * scale) + "px";
  media.classList.add("zoomed");
  box.classList.add("is-zoomed");
  box._cap.dataset.zoomed = "1";
  // ซูมค้างไว้ตรงจุดที่ผู้ใช้เล็ง ไม่ใช่กระโดดกลับไปมุมบนซ้าย
  const fx = before.w ? (atX ?? st.clientWidth / 2) : 0;
  const fy = before.h ? (atY ?? st.clientHeight / 2) : 0;
  const rx = (before.l + fx) / (before.w || 1);
  const ry = (before.t + fy) / (before.h || 1);
  st.scrollLeft = rx * media.offsetWidth - fx;
  st.scrollTop = ry * media.offsetHeight - fy;
}

function fitScale() {
  if (!media) return 1;
  const natW = media.naturalWidth || media.width;
  return natW ? media.offsetWidth / natW : 1;
}

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
    stage.innerHTML = ""; media = null; scale = 0;
    box.classList.remove("is-zoomed");
  });

  // คลิกที่รูป = สลับ พอดีจอ ↔ ขนาดจริง (ซูมตรงจุดที่คลิก)
  stage.addEventListener("click", (e) => {
    if (!media || !media.contains(e.target)) return;
    e.stopPropagation();
    if (moved > 4) { moved = 0; return; }   // เพิ่งลากเลื่อนอยู่ ไม่ใช่ตั้งใจกดย่อกลับ
    const r = stage.getBoundingClientRect();
    scale = scale > 0 ? 0 : Math.max(fitScale() * 2, 1);
    applyScale(e.clientX - r.left, e.clientY - r.top);
  });
  // ล้อเมาส์ = ซูมทีละขั้น
  stage.addEventListener("wheel", (e) => {
    if (!media) return;
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    const cur = scale > 0 ? scale : fitScale();
    scale = Math.min(MAX, Math.max(MIN, cur * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    applyScale(e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  // ลากเลื่อนดูตอนซูมอยู่
  let drag = null, moved = 0;
  stage.addEventListener("pointerdown", (e) => {
    if (!box.classList.contains("is-zoomed") || !media?.contains(e.target)) return;
    moved = 0;
    drag = { x: e.clientX, y: e.clientY, l: stage.scrollLeft, t: stage.scrollTop };
    stage.classList.add("dragging");
    /* ‼️ ห้ามใช้ setPointerCapture ที่นี่ — พอจับ pointer ไว้ click ที่ตามมาหลังปล่อยเมาส์
       จะถูกยิงไปที่ .pv-stage แทนตัวรูป (จับได้จาก event จริง: click → DIV.pv-stage)
       เงื่อนไข media.contains(e.target) จึงไม่ผ่าน = กดย่อกลับไม่ได้เลยหลังลากครั้งแรก
       ไม่ต้อง capture ก็ลากได้อยู่แล้วเพราะ .pv-stage เต็มจอ */
  });
  stage.addEventListener("pointermove", (e) => {
    if (!drag) return;
    moved = Math.max(moved, Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y));
    stage.scrollLeft = drag.l - (e.clientX - drag.x);
    stage.scrollTop = drag.t - (e.clientY - drag.y);
  });
  /* ‼️ รูปเป็นของที่เบราว์เซอร์ "ลากไปวางที่อื่น" ได้เองตามธรรมชาติ พอกดค้างแล้วขยับ
     มันจะเริ่ม native drag (เงารูปลอยตามเมาส์) แล้วตัด pointer event ของเราทิ้งกลางคัน
     ‼️ ห้ามกันด้วย preventDefault ที่ pointerdown — จะกัน click ที่ใช้ย่อกลับไปด้วย
     ต้องกันเฉพาะ dragstart ตัวเดียว */
  stage.addEventListener("dragstart", (e) => e.preventDefault());

  // ‼️ ต้องคืน pointer capture ทุกครั้ง ไม่งั้น click ที่ตามมาถูกยิงไปที่ .pv-stage แทนตัวรูป
  //    ทำให้เงื่อนไข media.contains(e.target) ไม่ผ่าน = กดย่อกลับไม่ได้เลยหลังลากครั้งแรก
  const endDrag = () => { drag = null; stage.classList.remove("dragging"); };
  addEventListener("pointerup", endDrag);        // ปล่อยเมาส์นอกกรอบก็ยังหลุดโหมดลาก
  addEventListener("pointercancel", endDrag);
  // ปุ่มลัด: + − ซูม · 0 กลับพอดีจอ
  box.addEventListener("keydown", (e) => {
    if (!media) return;
    if (e.key === "+" || e.key === "=") { scale = Math.min(MAX, (scale > 0 ? scale : fitScale()) * 1.3); applyScale(); }
    else if (e.key === "-") { scale = Math.max(MIN, (scale > 0 ? scale : fitScale()) / 1.3); applyScale(); }
    else if (e.key === "0") { scale = 0; applyScale(); }
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
    media = el("img", { src: url, alt: file.name || "", draggable: "false" });
    d._stage.appendChild(media);
    return true;
  }
  // PDF: วาดหน้าแรกใหญ่ ๆ พอให้อ่านออกว่าใช่ฉบับที่ต้องการไหม
  try {
    const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const page = await doc.getPage(1);
    const vp0 = page.getViewport({ scale: 1 });
    const fit = Math.min((innerWidth * 0.86) / vp0.width, (innerHeight * 0.78) / vp0.height);
    // วาดละเอียด 2 เท่าของขนาดที่แสดง เพื่อให้ซูมเข้าไปแล้วยังอ่านออก ไม่แตกเป็นเม็ด
    const viewport = page.getViewport({ scale: Math.max(0.2, fit) * 2 });
    const canvas = el("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    canvas.style.width = Math.round(viewport.width / 2) + "px";
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    doc.destroy?.();
    if (d.open) { media = canvas; d._stage.appendChild(canvas); }   // ผู้ใช้อาจปิดไปแล้วระหว่างวาด
    d._cap.textContent += tr(`  ·  หน้า 1 จาก ${doc.numPages}`, `  ·  page 1 of ${doc.numPages}`);
  } catch (e) {
    console.error(e);
    d._stage.appendChild(el("div", { class: "pv-err" },
      tr("เปิดดูไฟล์นี้ไม่ได้ — อาจเสียหายหรือถูกล็อกไว้", "Could not open this file — it may be damaged or locked")));
  }
  return true;
}
