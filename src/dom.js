// ตัวช่วย DOM ขั้นพื้นฐาน — แยกไว้ต่างหากเพราะหน้าแรกใช้แค่ส่วนนี้
// (ถ้ารวมไว้ใน ui.js หน้าแรกจะต้องลากโค้ด dropzone/ปุ่ม/ตรวจชนิดไฟล์มาด้วยโดยไม่ได้ใช้)

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
