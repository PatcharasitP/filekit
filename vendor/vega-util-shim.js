// ── shim ให้ vega-interpreter (ESM ล้วน) หา vega-util เจอโดยไม่ต้องใช้ import map ──
// vega-interpreter 2.x import 3 ตัวนี้จาก "vega-util" ซึ่งเป็น bare specifier ที่เบราว์เซอร์
// resolve เองไม่ได้ · ตอน vendor เราแทน specifier ด้วยไฟล์นี้ แล้วส่งต่อจาก bundle vega
// ตัวเดียวกับที่หน้ากำลังรันอยู่ (vega re-export vega-util ทั้งชุด) จึงไม่มีสำเนาซ้ำและ
// ไม่มีวันหลุดเวอร์ชันจากกัน
const V = globalThis.vega;
if (!V) throw new Error("ต้องโหลด vendor/vega.min.js ก่อน vega-interpreter.esm.js");
export const ascending = V.ascending;
export const isString = V.isString;
export const DisallowedObjectProperties = V.DisallowedObjectProperties;
