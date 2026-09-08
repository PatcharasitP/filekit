// ตัวช่วย DOM ขั้นพื้นฐาน — แยกไว้ต่างหากเพราะหน้าแรกใช้แค่ส่วนนี้
// (ถ้ารวมไว้ใน ui.js หน้าแรกจะต้องลากโค้ด dropzone/ปุ่ม/ตรวจชนิดไฟล์มาด้วยโดยไม่ได้ใช้)

import { IS_EN } from "./i18n.js";
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k === "text") n.textContent = v;
    else if (k === "style" && typeof v === "object") Object.assign(n.style, v);
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
