// ── เรขาคณิตของหน้า PDF ใช้ร่วมระหว่างเครื่องมือ (ไม่มี DOM ทดสอบด้วย node ได้) ──────────
// ที่มา 19/11/2026 แผนรวมตัวแก้ไขเข้าเครื่องมือจัดการหน้า (.claude/plans/2026-11-18-merge-edit-into-pages.md)
// ‼️ ทุกเครื่องมือที่ "ให้ผู้ใช้ชี้บนภาพที่ pdf.js วาด แล้วเขียนลงไฟล์ด้วย pdf-lib" ต้องผ่านไฟล์นี้
//    ภาพบนจอคือหน้าที่หมุนตาม /Rotate และตัดตาม CropBox แล้ว แต่ pdf-lib เขียนลงหน้าดิบ
//    วัดจริง 19/11/2026 (tests/browser_pdfedit_rotated.py) แก้ไขและเซ็นบน PDF รุ่นที่ไม่ผ่านไฟล์นี้
//    วางรูปบนหน้าหมุน 90 คลาดจากที่เห็น 48% ของหน้า หมุน 180 คลาด 50% และหน้าที่ CropBox เริ่มที่ 30,40 คลาด 3%
//    pdf-sign กับ pdf-crop แก้เรื่องนี้ไว้แล้วคนละที่ ไฟล์นี้รวมสูตรที่พิสูจน์แล้วไว้ที่เดียว
//
// คำศัพท์ในไฟล์นี้
//   หน้าที่เห็น (view)  = ภาพที่ pdf.js วาด หมุนตาม /Rotate แล้ว ตัดตาม CropBox แล้ว สัดส่วนนับจากมุมซ้ายบน
//   หน้าดิบ (raw)      = พิกัดของ pdf-lib ก่อนหมุน นับจากมุมล่างซ้าย หน่วยพอยต์

const PDF = () => globalThis.PDFLib;

/** ‼️ ใบหน้าที่เขียน null ทับค่าที่สืบทอด pdf.js หยุดที่ null แต่ pdf-lib ข้ามไปเอาค่าของ /Pages
 *  (คลังความรู้ ใบหน้า PDF ที่เขียน null ทับค่าที่สืบทอด , ยกมาจาก pdf-crop.js leafNull) */
export function leafNull(p, key, L = PDF()) {
  try { return p.node.get(L.PDFName.of(key), true) === L.PDFNull; } catch { return false; }
}

/** กรอบของหน้าที่ pdf.js แสดงจริง (CropBox ตัดกับ MediaBox ตัดแล้วว่างใช้ MediaBox) เป็นพอยต์ของหน้าดิบ
 *  (คลังความรู้ pdf.js แสดง CropBox ตัดกับ MediaBox , ยกมาจาก pdf-crop.js shownBox) */
export function shownBox(p, L = PDF()) {
  const n = (b) => ({ x0: Math.min(b.x, b.x + b.width), y0: Math.min(b.y, b.y + b.height),
                      x1: Math.max(b.x, b.x + b.width), y1: Math.max(b.y, b.y + b.height) });
  const M = n(p.getMediaBox());
  const C = p.getCropBox && !leafNull(p, "CropBox", L) ? n(p.getCropBox()) : M;
  const x0 = Math.max(M.x0, C.x0), y0 = Math.max(M.y0, C.y0);
  const x1 = Math.min(M.x1, C.x1), y1 = Math.min(M.y1, C.y1);
  if (x1 - x0 > 0 && y1 - y0 > 0) return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  return { x: M.x0, y: M.y0, w: M.x1 - M.x0, h: M.y1 - M.y0 };
}

/** /Rotate ที่ pdf.js ใช้จริง ปัดเป็น 0 90 180 270 (null ที่ใบหน้า = 0 แบบ pdf.js) */
export function srcRotation(p, L = PDF()) {
  if (leafNull(p, "Rotate", L)) return 0;
  const a = (p.getRotation && p.getRotation().angle) || 0;
  return ((Math.round(a / 90) * 90) % 360 + 360) % 360;
}

/** กรอบสัดส่วนบนหน้าที่เห็น (บนซ้าย) -> สัดส่วนบนหน้าดิบ (ล่างซ้าย)
 *  (คลังความรู้ ครอบตัดหน้า PDF ที่หมุนไว้ , ยกมาจาก pdf-crop.js toUnrotated ห้ามแก้สูตรโดยไม่มีเทส) */
export function toUnrotated(c, rot) {
  if (rot === 90) return { x: c.y, y: c.x, w: c.h, h: c.w };
  if (rot === 180) return { x: 1 - c.x - c.w, y: c.y, w: c.w, h: c.h };
  if (rot === 270) return { x: 1 - c.y - c.h, y: 1 - c.x - c.w, w: c.h, h: c.w };
  return { x: c.x, y: 1 - c.y - c.h, w: c.w, h: c.h };
}

/** ขนาดหน้าที่เห็นเป็นพอยต์ (สลับกว้างสูงเมื่อหมุน 90 270) */
export function viewSize(box, rot) {
  return rot % 180 ? { w: box.h, h: box.w } : { w: box.w, h: box.h };
}

/** กรอบสัดส่วนบนหน้าที่เห็น -> กรอบพอยต์บนหน้าดิบ { x, y, w, h } (ใช้กับ drawRectangle และ setCropBox) */
export function viewRectToRaw(r, rot, box) {
  const u = toUnrotated(r, rot);
  return { x: box.x + u.x * box.w, y: box.y + u.y * box.h, w: u.w * box.w, h: u.h * box.h };
}

/** จุดสัดส่วนบนหน้าที่เห็น (บนซ้าย) -> จุดพอยต์บนหน้าดิบ */
export function viewPtToRaw(u, v, rot, box) {
  const r = viewRectToRaw({ x: u, y: v, w: 0, h: 0 }, rot, box);
  return { x: r.x, y: r.y };
}

/** วางภาพ "ตั้งตรงตามที่ตาเห็น" ลงกรอบสัดส่วน r ของหน้าที่เห็น
 *  คืนค่าสำหรับ drawImage { x, y, width, height, rotate (องศาทวนเข็มแบบ pdf-lib) }
 *  ‼️ ภาพหมุนรอบมุมล่างซ้ายของตัวเอง มุมนั้นต้องตรงกับมุมล่างซ้ายของกรอบบนหน้าที่เห็น
 *     แล้วหมุนทวนเข็มเท่ากับ /Rotate เพื่อหักล้างการหมุนตามเข็มตอนแสดง (วิธีเดียวกับ pdf-sign.js ที่ยิงจริง 09/09/2026) */
export function placeUpright(r, rot, box) {
  const vs = viewSize(box, rot);
  const at = viewPtToRaw(r.x, r.y + r.h, rot, box);
  return { x: at.x, y: at.y, width: r.w * vs.w, height: r.h * vs.h, rotate: rot };
}

/** วาดเนื้อหาของหน้าดิบ (เช่น embedPage) ให้ออกมาหน้าตาเหมือนหน้าที่เห็น ลงกรอบพอยต์ d = { x, y, w, h } (ล่างซ้าย)
 *  บนหน้าใหม่ที่ไม่หมุน คืน { x, y, rotate } ให้ drawPage (width height ใช้ขนาดเนื้อหาหลังย่อขยาย ก่อนหมุน)
 *  ‼️ เนื้อหาหมุนตามเข็มเท่า /Rotate (rotate ติดลบในแบบ pdf-lib) มุมล่างซ้ายของเนื้อหาดิบไปอยู่
 *     0: ล่างซ้าย , 90: บนซ้าย , 180: บนขวา , 270: ล่างขวา ของกรอบ d */
export function placeRawContent(d, rot) {
  if (rot === 90) return { x: d.x, y: d.y + d.h, rotate: -90 };
  if (rot === 180) return { x: d.x + d.w, y: d.y + d.h, rotate: -180 };
  if (rot === 270) return { x: d.x + d.w, y: d.y, rotate: -270 };
  return { x: d.x, y: d.y, rotate: 0 };
}
