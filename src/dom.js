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
    out.push(f.name ? f : renameBlank(f));
  };
  for (const f of e.clipboardData?.files || []) push(f);
  for (const it of e.clipboardData?.items || []) {
    if (it.kind === "file") push(it.getAsFile());
  }
  return out;
}

/** รูปที่วางมาจากคลิปบอร์ดมักไม่มีชื่อไฟล์ — ตั้งให้เองจะได้ดาวน์โหลดผลลัพธ์แล้วอ่านออก */
function renameBlank(f) {
  const ext = (f.type.split("/")[1] || "png").replace("jpeg", "jpg");
  const d = new Date();
  const two = (n) => String(n).padStart(2, "0");
  const name = `วางจากคลิปบอร์ด-${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}.${ext}`;
  try { return new File([f], name, { type: f.type }); } catch { return f; }
}
