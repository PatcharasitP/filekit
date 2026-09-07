// ระบบสองภาษา ไทย/อังกฤษ — ตั้งใจให้เล็กและ "โง่" ที่สุดเท่าที่จะทำได้
//
// ‼️ กติกาข้อเดียวที่ทำให้ทั้งระบบไม่มีบั๊ก: **สลับภาษา = โหลดหน้าใหม่**
//    เพราะบทเรียนจากระบบก่อนหน้า (dashboard.html 12,000 บรรทัด) คือ
//    คำแปลที่อยู่ใน `const` ระดับบนสุดจะถูกประเมินตอน parse แล้วแช่ภาษาเดิมถาวร
//    → หน้าจอแปลครึ่ง ๆ หาสาเหตุยากมาก · พอ reload แล้ว LANG เป็นค่าคงที่ตลอดชีวิตหน้า
//    ทุก const ทุก template จึงได้ภาษาที่ถูกต้องเสมอโดยไม่ต้องระวังอะไรเลย
//
// ‼️ ห้ามตั้งชื่อฟังก์ชันแปลว่า t() — โค้ดทั่วไปมี `const t = ...` เยอะมาก
//    ฟังก์ชันที่มี local t แล้วเรียก t() ในตัวเอง = TDZ พังทั้งฟังก์ชัน (เคยเจอจริง 20 จุด)

const KEY = "fk-lang";

function read() {
  try { return localStorage.getItem(KEY) === "en" ? "en" : "th"; } catch (e) { return "th"; }
}

/** ภาษาปัจจุบัน — คงที่ตลอดอายุของหน้า (ดูเหตุผลด้านบน) */
export const LANG = read();
export const IS_EN = LANG === "en";

/** tr("ข้อความไทย", "English text") — ไม่มีไฟล์ dictionary ไม่มี key ให้หลุด
 *  คำแปลอยู่ติดกับต้นฉบับในโค้ด แก้ที่เดียวเห็นทั้งคู่ · ไม่ส่ง en มา = ใช้ไทยทั้งสองภาษา */
export function tr(th, en) { return IS_EN && en != null ? en : th; }

/** สลับภาษาแล้วโหลดใหม่ทันที */
export function setLang(v) {
  try { localStorage.setItem(KEY, v === "en" ? "en" : "th"); } catch (e) {}
  location.reload();
}

/** แปลข้อความที่เขียนตายอยู่ใน HTML
 *  ใส่คำแปลไว้ที่ตัว element เอง:
 *    data-en      = ข้อความในปุ่ม/หัวข้อ (แทน textContent)
 *    data-en-ph   = placeholder
 *    data-en-al   = aria-label + title
 *    data-en-html = เนื้อหาที่มีแท็กข้างใน (ใช้เท่าที่จำเป็น ข้อความมาจากไฟล์เราเองเท่านั้น)
 *  ‼️ แปลเฉพาะสิ่งที่ตาเห็น ห้ามแตะ value/id/data-* ที่โค้ดใช้เป็นกุญแจ */
export function applyStatic(root = document) {
  if (!IS_EN) return;
  for (const n of root.querySelectorAll("[data-en]")) n.textContent = n.dataset.en;
  for (const n of root.querySelectorAll("[data-en-html]")) n.innerHTML = n.dataset.enHtml;
  for (const n of root.querySelectorAll("[data-en-ph]")) n.setAttribute("placeholder", n.dataset.enPh);
  for (const n of root.querySelectorAll("[data-en-al]")) {
    n.setAttribute("aria-label", n.dataset.enAl);
    if (n.hasAttribute("title")) n.setAttribute("title", n.dataset.enAl);
  }
  document.documentElement.lang = "en";
}
