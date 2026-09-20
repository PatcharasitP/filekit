// ตัวช่วย DOM ขั้นพื้นฐาน — แยกไว้ต่างหากเพราะหน้าแรกใช้แค่ส่วนนี้
// (ถ้ารวมไว้ใน ui.js หน้าแรกจะต้องลากโค้ด dropzone/ปุ่ม/ตรวจชนิดไฟล์มาด้วยโดยไม่ได้ใช้)

import { IS_EN } from "./i18n.js";
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ── ธงเลือกโครงหน้าเครื่องมือ ────────────────────────────────────────────
 * v2 คือโครงที่โคลนมาจาก iLovePDF กับ Smallpdf (แผน 20/09/2026 พี่ปอนด์เคาะ 21/09)
 * อยู่ใน dom.js เพราะเป็นโมดูลล่างสุดที่ทั้ง app.js, ui.js และ workspace.js เรียกได้
 * โดยไม่เกิดวงจร import ไขว้กัน
 *
 * ‼️ ค่าเริ่มต้นเปลี่ยนที่บรรทัดเดียวตรงนี้เท่านั้น และ ?ui=1 ยังพาไปโครงเดิมได้เสมอ
 *   ระหว่างช่วงย้าย ของเดิมจึงไม่มีทางหายไปโดยไม่มีทางถอย
 * ‼️ อ่านครั้งเดียวตอนโหลดหน้า ห้ามอ่านสดทุกครั้ง เพราะถ้าค่าเปลี่ยนกลางคัน
 *   หน้าจะมีโครงสองแบบปนกันในหน้าเดียว (บางเครื่องมือ mount ไปแล้ว บางตัวยัง) */
const V2_DEFAULT = true;
let v2 = V2_DEFAULT;
try {
  const q = new URLSearchParams(location.search).get("ui");
  if (q === "1" || q === "2") { v2 = q === "2"; localStorage.setItem("fk:ui", q); }
  else {
    const saved = localStorage.getItem("fk:ui");
    if (saved === "1" || saved === "2") v2 = saved === "2";
  }
} catch { /* โหมดส่วนตัว อ่าน localStorage ไม่ได้ ใช้ค่าเริ่มต้น */ }
/** โครงหน้าเครื่องมือ v2 เปิดอยู่ไหม */
export const useV2 = () => v2;

/* ‼️ ของที่กดได้ ถ้าถอด title ออกแล้วไม่มีชื่ออย่างอื่น โปรแกรมอ่านหน้าจอจะอ่านไม่ออก
   จึงย้าย title ไปเป็น aria-label ให้เฉพาะพวกนี้ ส่วนของที่ไม่ได้กดก็ทิ้งไปเลย */
const NEEDS_NAME = new Set(["button", "a", "input", "select", "textarea", "summary"]);

/** ของชิ้นนี้มีข้อความให้เห็นไหม (ตัวหนังสือตรง ๆ หรือลูกที่มีตัวหนังสือ) */
function hasText(children) {
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    if (typeof c === "object") { if (c.textContent && c.textContent.trim()) return true; }
    else if (String(c).trim()) return true;
  }
  return false;
}

export function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    /* ‼️ ไม่ใส่ tooltip ของเบราว์เซอร์อีกแล้ว (พี่ปอนด์สั่งเอาออกทั้งเว็บ 19/09/2026)
       ป้ายลอยขึ้นมาบังของที่กำลังจะกด หน่วงเป็นวินาทีกว่าจะขึ้น และบนมือถือไม่ขึ้นเลย
       ข้อความที่สำคัญจริงต้องอยู่บนหน้าให้เห็น ไม่ใช่ซ่อนไว้ใต้เมาส์ */
    if (k === "title") {
      /* ‼️ ย้ายเป็น aria-label เฉพาะของที่ไม่มีข้อความให้เห็น (ปุ่มไอคอนล้วน)
         ถ้าของนั้นมีข้อความอยู่แล้ว การใส่ aria-label จะไป "ทับ" ข้อความนั้น
         ชิป "กระชับ" ที่มี title เป็นคำอธิบายยาว ๆ จะกลายเป็นชื่อยาวแทนคำว่ากระชับ
         คนที่ใช้เสียงสั่งงานจะสั่งไม่ได้อีกเลย */
      if (NEEDS_NAME.has(tag) && !attrs["aria-label"] && !attrs["aria-labelledby"] && !hasText(children)) {
        n.setAttribute("aria-label", v);
      }
      continue;
    }
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k === "text") n.textContent = v;
    /* ‼️ Object.assign ตั้งตัวแปร CSS ที่ขึ้นต้นด้วย -- ไม่ได้ (เจอจริง 18/09/2026)
       มันเซ็ตลงไปเงียบ ๆ โดยไม่มี error แต่ค่าไม่ไปถึง element จริง
       ต้องใช้ setProperty เท่านั้น ไม่งั้นสีที่ส่งผ่านตัวแปรจะหายไปแบบไม่มีใครรู้ */
    else if (k === "style" && typeof v === "object") {
      for (const [p, val] of Object.entries(v)) {
        if (p.startsWith("--")) n.style.setProperty(p, val);
        else n.style[p] = val;
      }
    }
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    n.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
  }
  return n;
}

/* ── ผ้าคลุมทั้งจอตอนลากไฟล์เข้ามา ────────────────────────────────────
 * ใช้ร่วมกันทั้งหน้าแรกและหน้าเครื่องมือ · มีชิ้นเดียวทั้งเว็บ สร้างตอนถูกใช้ครั้งแรก
 * ‼️ ต้อง pointer-events:none (อยู่ใน tool.css) ไม่งั้นมันจะกิน dragleave/drop ของหน้าเอง */
let dropVeil = null;
export function showVeil(on, label) {
  if (!dropVeil) {
    dropVeil = el("div", { class: "dropveil", "aria-hidden": "true" }, [el("div", { class: "dropveil-in" })]);
    document.body.appendChild(dropVeil);
  }
  if (label) dropVeil.firstChild.textContent = label;
  dropVeil.classList.toggle("on", !!on);
}

/* ── อ่านไฟล์จากคลิปบอร์ด ────────────────────────────────────────────────
 * ‼️ ภาพที่แคปด้วย Win+Shift+S / Print Screen มาถึงเบราว์เซอร์เป็น "รูปดิบ" ไม่ใช่ไฟล์
 *    บางเบราว์เซอร์จึงไม่ใส่ไว้ใน clipboardData.files เลย (ว่างเปล่า) แต่ไปอยู่ใน items แทน
 *    อ่านแค่ .files อย่างเดียว = วางแล้วเงียบ ไม่มีอะไรเกิดขึ้น (พี่ปอนด์เจอกับตัว 08/09/2026)
 * อ่านทั้งสองทาง แล้วตัดไฟล์ซ้ำออกด้วยชื่อ+ขนาด · รูปที่ไม่มีชื่อจะตั้งชื่อให้เองตามเวลา */
export function filesFromClipboard(e) {
  const out = [];
  const seen = new Set();
  const push = (f) => {
    if (!f || !f.size) return;
    const key = `${f.name}|${f.size}|${f.type}`;
    if (seen.has(key)) return;
    seen.add(key);
    // ชื่อว่าง หรือเป็นชื่อโหลของเบราว์เซอร์ (image.png) = ตั้งใหม่ให้
    out.push(GENERIC_NAME.test(f.name || "") ? autoName(f) : f);
  };
  for (const f of e.clipboardData?.files || []) push(f);
  for (const it of e.clipboardData?.items || []) {
    if (it.kind === "file") push(it.getAsFile());
  }
  return out;
}

/* ‼️ เบราว์เซอร์ตั้งชื่อภาพจากคลิปบอร์ดว่า "image.png" ทุกใบเหมือนกันหมด
 *    วางหลายใบแล้วแยกไม่ออกว่าใบไหนคือใบไหน และผลลัพธ์ที่ดาวน์โหลดออกไปก็ชนกันเอง
 *    (พี่ปอนด์ทักเอง 08/09/2026) → ตั้งชื่อตามเวลาที่วาง ไม่ซ้ำและบอกได้ว่าแคปตอนไหน
 *    ‼️ เปลี่ยนเฉพาะชื่อ "โหล" ที่เบราว์เซอร์ตั้งเอง — ไฟล์จริงที่ก๊อปจาก File Explorer
 *    มีชื่อของมันอยู่แล้ว ห้ามไปแตะ */
const GENERIC_NAME = /^(image|screenshot|unknown)?\.?(png|jpe?g|webp|gif|bmp|avif)?$/i;
let lastStamp = "", sameSec = 0;
function autoName(f) {
  const ext = (f.type.split("/")[1] || "png").replace("jpeg", "jpg").replace("svg+xml", "svg");
  const d = new Date();
  const two = (n) => String(n).padStart(2, "0");
  const stamp = `${two(d.getHours())}.${two(d.getMinutes())}.${two(d.getSeconds())}`;
  sameSec = stamp === lastStamp ? sameSec + 1 : 0;   // แคปรัว ๆ ในวินาทีเดียวกันก็ยังไม่ชนกัน
  lastStamp = stamp;
  // ‼️ สั้นที่สุดเท่าที่ยังบอกได้ว่าอะไร-เมื่อไร — ชื่อยาวถูกตัดกลางคำในแถวไฟล์แคบ ๆ
  // เหลือแค่เวลา — สั้นที่สุดเท่าที่ยังไม่ซ้ำกัน และไม่ถูกตัดกลางคำในแถวไฟล์แคบ ๆ
  const name = `${stamp}${sameSec ? "-" + (sameSec + 1) : ""}.${ext}`;
  const th = name, en = name;
  try { return new File([f], IS_EN ? en : th, { type: f.type }); } catch { return f; }
}
