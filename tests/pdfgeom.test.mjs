/* ตรวจสูตรเรขาคณิตหน้า PDF (src/pdfgeom.js)
 *
 * ‼️ ทำไมต้องมี: สูตรพวกนี้ตัดสินว่าลายเซ็นกับกรอบครอบไปอยู่ตรงไหนในไฟล์ หมุนผิดทิศหนึ่งที
 *    ลายเซ็นไปโผล่คนละมุมแบบเงียบ ๆ (วัดจริง 19/11/2026 คลาดได้ถึงครึ่งหน้า)
 * ‼️ ตัวตรวจไม่ใช้สูตรในไฟล์ที่ตรวจ เขียนการหมุนตามเข็มของ /Rotate ขึ้นใหม่เองจากนิยาม
 *    (มุมล่างซ้ายของหน้าดิบ หมุน 90 ไปอยู่บนซ้าย 180 ไปบนขวา 270 ไปล่างขวา)
 *    แล้วหมุนมุมทั้งสี่ของภาพตามที่ pdf-lib จะวาดจริง (หมุนทวนเข็มรอบมุมล่างซ้าย) มาเทียบ
 * รัน: node tests/pdfgeom.test.mjs   พิสูจน์แดง: node tests/pdfgeom.test.mjs --break (ใช้สูตรผิดที่ไม่คิด /Rotate ต้องแดง) */
import * as G from "../src/pdfgeom.js";

let pass = 0; const fail = [];
const ck = (ok, msg) => { if (ok) { pass++; console.log("  ✅ " + msg); } else { fail.push(msg); console.log("  ❌ " + msg); } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

/* สูตรผิดแบบที่ pdf-edit ใช้ก่อนแก้ (ไม่คิด /Rotate ไม่คิดจุดเริ่ม CropBox) ไว้พิสูจน์ว่าตัวตรวจแดงเป็น */
const placeUpright = process.argv.includes("--break")
  ? (r, rot, box) => ({ x: r.x * box.w, y: box.h - (r.y + r.h) * box.h, width: r.w * box.w, height: r.h * box.h, rotate: 0 })
  : G.placeUpright;
const viewRectToRaw = process.argv.includes("--break")
  ? (r, rot, box) => ({ x: r.x * box.w, y: (1 - r.y - r.h) * box.h, w: r.w * box.w, h: r.h * box.h })
  : G.viewRectToRaw;

/** นิยามอิสระ: จุดพอยต์บนหน้าดิบ -> สัดส่วนบนหน้าที่เห็น (บนซ้าย) */
function rawToView(px, py, rot, box) {
  const fx = (px - box.x) / box.w, fy = (py - box.y) / box.h;
  if (rot === 90) return { u: fy, v: fx };
  if (rot === 180) return { u: 1 - fx, v: fy };
  if (rot === 270) return { u: 1 - fy, v: 1 - fx };
  return { u: fx, v: 1 - fy };
}
/** หมุนจุด (ox, oy) ในกรอบของภาพเอง ทวนเข็ม deg องศา รอบมุมล่างซ้าย แล้วเลื่อนไปที่ (x, y) แบบ pdf-lib */
function rotAbout(ox, oy, deg, x, y) {
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  return { x: x + ox * c - oy * s, y: y + ox * s + oy * c };
}

const BOXES = [{ x: 0, y: 0, w: 595, h: 842 }, { x: 30, y: 40, w: 530, h: 760 }];
const R = { x: 0.2, y: 0.3, w: 0.25, h: 0.1 };

for (const box of BOXES) for (const rot of [0, 90, 180, 270]) {
  const tag = `หมุน ${rot} กรอบเริ่ม ${box.x},${box.y}`;
  // ① กรอบสี่เหลี่ยม: มุมทั้งสี่ของกรอบดิบกลับมาเป็นกรอบเดิมบนหน้าที่เห็น
  const q = viewRectToRaw(R, rot, box);
  const pts = [[q.x, q.y], [q.x + q.w, q.y], [q.x, q.y + q.h], [q.x + q.w, q.y + q.h]].map(([a, b]) => rawToView(a, b, rot, box));
  const us = pts.map((p) => p.u), vs = pts.map((p) => p.v);
  ck(near(Math.min(...us), R.x) && near(Math.max(...us), R.x + R.w) && near(Math.min(...vs), R.y) && near(Math.max(...vs), R.y + R.h),
    `① ${tag}: กรอบปิดทับไปอยู่ตรงกรอบที่เห็น`);
  // ② ภาพตั้งตรง: มุมล่างซ้ายของภาพอยู่ล่างซ้ายของกรอบ ขวาไปขวา บนไปบน
  const im = placeUpright(R, rot, box);
  const own = (ox, oy) => { const p = rotAbout(ox, oy, im.rotate, im.x, im.y); return rawToView(p.x, p.y, rot, box); };
  const bl = own(0, 0), br = own(im.width, 0), tl = own(0, im.height);
  ck(near(bl.u, R.x) && near(bl.v, R.y + R.h), `② ${tag}: มุมล่างซ้ายของภาพตรงมุมล่างซ้ายของกรอบที่เห็น`);
  ck(near(br.u, R.x + R.w) && near(br.v, R.y + R.h), `② ${tag}: ขอบล่างของภาพวิ่งไปทางขวาตามที่เห็น (ภาพไม่ตะแคง)`);
  ck(near(tl.u, R.x) && near(tl.v, R.y), `② ${tag}: ขอบซ้ายของภาพวิ่งขึ้นบนตามที่เห็น (ภาพไม่กลับหัว)`);
}

// ③ วาดเนื้อหาหน้าดิบลงหน้าใหม่ให้หน้าตาเหมือนหน้าที่เห็น (โหมดครอบแบบหน้าเท่ากัน)
for (const rot of [0, 90, 180, 270]) {
  const W = 300, H = 200;                                    // ขนาดเนื้อหาดิบหลังย่อขยาย
  const d = rot % 180 ? { x: 50, y: 70, w: H, h: W } : { x: 50, y: 70, w: W, h: H };
  const p = G.placeRawContent(d, rot);
  const view = (fx, fy) => { const q = rotAbout(fx * W, fy * H, p.rotate, p.x, p.y); return { u: (q.x - d.x) / d.w, v: 1 - (q.y - d.y) / d.h }; };
  const unit = { x: 0, y: 0, w: 1, h: 1 };
  const ok = [[0, 0], [1, 0], [0, 1], [0.3, 0.7]].every(([fx, fy]) => {
    const got = view(fx, fy), want = rawToView(unit.x + fx, unit.y + fy, rot, unit);
    return near(got.u, want.u) && near(got.v, want.v);
  });
  ck(ok, `③ หมุน ${rot}: เนื้อหาที่ฝังลงหน้าใหม่หน้าตาเหมือนหน้าที่เห็น และอยู่ในกรอบ`);
}

// ④ สูตรที่ยกมาต้องเท่ากับของเดิมใน pdf-crop.js ทุกมุม (ห้ามเผลอแก้สูตรที่พิสูจน์แล้ว)
{
  const want = { 0: { x: 0.2, y: 0.6, w: 0.25, h: 0.1 }, 90: { x: 0.3, y: 0.2, w: 0.1, h: 0.25 },
                 180: { x: 0.55, y: 0.3, w: 0.25, h: 0.1 }, 270: { x: 0.6, y: 0.55, w: 0.1, h: 0.25 } };
  for (const rot of [0, 90, 180, 270]) {
    const g = G.toUnrotated(R, rot), w = want[rot];
    ck(near(g.x, w.x) && near(g.y, w.y) && near(g.w, w.w) && near(g.h, w.h), `④ toUnrotated ${rot} เท่าสูตรของ pdf-crop`);
  }
}

// ⑤ หน้าไม่หมุนที่ CropBox เริ่มที่ 0,0 ต้องได้ตัวเลขเท่าสูตรเดิมของ pdf-edit ทุกตัว (ห้ามเปลี่ยนผลของไฟล์ปกติ)
{
  const box = { x: 0, y: 0, w: 595, h: 842 }, e = { x: 0.31, y: 0.42 }, w = 120, h = 30;
  const im = placeUpright({ x: e.x, y: e.y - h / 2 / 842, w: w / 595, h: h / 842 }, 0, box);
  ck(near(im.x, e.x * 595, 1e-6) && near(im.y, 842 - e.y * 842 - h / 2, 1e-6) && near(im.width, w, 1e-6) && near(im.height, h, 1e-6),
    "⑤ หน้าปกติ ตำแหน่งภาพเท่าสูตรเดิม x = e.x*pw , y = ph - e.y*ph - h/2");
}

// ⑥ หน้าฐานกับหน้าที่เห็น: ไปกลับได้ตรง และตรงกับการแปลง CSS ที่ใช้วางชั้นของบนกระดาษจริง (คิดแยกจากนิยามของ CSS)
{
  const crops = [null, { x: 0.1, y: 0.2, w: 0.6, h: 0.5 }];
  for (const crop of crops) for (const R of [0, 90, 180, 270]) {
    const tag = `หมุน ${R} ${crop ? "ครอบ" : "ไม่ครอบ"}`;
    const pts = [[0.2, 0.3], [0.7, 0.6], [0.15, 0.65]].map(([x, y]) => crop ? [crop.x + x * crop.w, crop.y + y * crop.h] : [x, y]);
    const back = pts.every(([x, y]) => { const v = G.baseToView(x, y, R, crop); const b = G.viewToBase(v.u, v.v, R, crop); return near(b.x, x) && near(b.y, y); });
    ck(back, `⑥ ${tag}: หน้าฐานไปหน้าที่เห็นแล้วกลับมาที่เดิม`);
    // CSS: translate(tx,ty) rotate(R) translate(ox,oy) กับจุด (x*Bw, y*Bh) แกน y ชี้ลง rotate บวกตามเข็ม
    const W = 300, H = 420, L = G.baseLayer(R, crop, W, H);
    const t = (L.r * Math.PI) / 180, co = Math.cos(t), si = Math.sin(t);
    const css = (x, y) => { const px = x * L.Bw + L.ox, py = y * L.Bh + L.oy;
      return { u: (L.tx + px * co - py * si) / W, v: (L.ty + px * si + py * co) / H }; };
    const same = pts.every(([x, y]) => { const a = css(x, y), b = G.baseToView(x, y, R, crop); return near(a.u, b.u) && near(a.v, b.v); });
    ck(same, `⑥ ${tag}: ชั้นของบนจอ (CSS) ตรงกับสูตร`);
    const c = crop || { x: 0, y: 0, w: 1, h: 1 };
    const corners = [[c.x, c.y], [c.x + c.w, c.y], [c.x, c.y + c.h], [c.x + c.w, c.y + c.h]].map(([x, y]) => css(x, y));
    ck(near(Math.min(...corners.map((p) => p.u)), 0) && near(Math.max(...corners.map((p) => p.u)), 1)
      && near(Math.min(...corners.map((p) => p.v)), 0) && near(Math.max(...corners.map((p) => p.v)), 1),
      `⑥ ${tag}: ส่วนที่ครอบเต็มกระดาษพอดี`);
  }
}

// ⑦ วางภาพหมุนตามที่ตาเห็น: จุดยึดตรง , ขอบล่างของภาพวิ่งไปทางที่หมุนทวนเข็ม up องศา , up 0 เท่าสูตรเดิม
for (const box of BOXES) for (const rot of [0, 90, 180, 270]) for (const up of [0, 90, 180, 270]) {
  const vs = G.viewSize(box, rot), w = 90, h = 30, ax = 0.4 * vs.w, ay = 0.35 * vs.h;
  const p = G.placeAt(ax, ay, w, h, 0.5, 0.5, up, rot, box);
  const own = (ox, oy) => { const q = rotAbout(ox, oy, p.rotate, p.x, p.y); const v = rawToView(q.x, q.y, rot, box); return { x: v.u * vs.w, y: v.v * vs.h }; };
  const ctr = own(w / 2, h / 2), right = own(w, h / 2);
  const t = (up * Math.PI) / 180;
  const dir = { x: Math.cos(t), y: -Math.sin(t) };            // ทวนเข็มตามที่ตาเห็น แกน y ชี้ลง
  const got = { x: (right.x - ctr.x) / (w / 2), y: (right.y - ctr.y) / (w / 2) };
  ck(near(ctr.x, ax, 1e-6) && near(ctr.y, ay, 1e-6) && near(got.x, dir.x, 1e-6) && near(got.y, dir.y, 1e-6),
    `⑦ กรอบ ${box.x} หน้าหมุน ${rot} ของหมุน ${up}: กึ่งกลางตรงจุดคลิก และหันตามที่ตาเห็น`);
}
{
  const box = BOXES[1], vs = G.viewSize(box, 90), w = 80, h = 20;
  const a = G.placeAt(0.3 * vs.w, 0.4 * vs.h, w, h, 0, 0.5, 0, 90, box);
  const b = G.placeUpright({ x: 0.3, y: 0.4 - h / 2 / vs.h, w: w / vs.w, h: h / vs.h }, 90, box);
  ck(near(a.x, b.x, 1e-6) && near(a.y, b.y, 1e-6) && a.rotate === b.rotate, "⑦ up 0 ได้เท่าสูตรเดิมที่ pdf-edit ใช้");
}

console.log(`\nผ่าน ${pass} , ตก ${fail.length}`);
process.exit(fail.length ? 1 : 0);
