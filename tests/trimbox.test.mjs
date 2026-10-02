// ตรวจ src/trimbox.js ตัวหากรอบเนื้อหาของหน้า PDF จากพิกเซลที่ pdf.js วาดแล้ว (ใช้กับครอบตัดขอบขาวอัตโนมัติ)
// ภาพทุกภาพสร้างในไฟล์นี้: พื้นกระดาษ สี่เหลี่ยมทึบ เส้น 1 px จุดฝุ่น และสัญญาณรบกวนจาก LCG ที่ตั้ง seed ตายตัว
// ‼️ กรอบที่คาด = ตำแหน่งที่วาดจริง + สูตรเว้นขอบ ดูดขอบ ขั้นต่ำ 0.02 ตามสเปก (ตัวเลขเขียนไว้ใน SPEC ข้างล่าง ไม่ได้อ่านจากโมดูล)
//    สีกระดาษ T และ noisy ที่คาด วัดจากขอบภาพด้วยการเรียงค่า (คนละวิธีกับฮิสโทแกรมในโมดูล) ไม่ได้เดา
// ‼️ TRIMBOX_SRC ชี้ไปโมดูลรุ่นที่ทำพังไว้ได้ ใช้ตอนพิสูจน์ว่าเทสแดงเป็น (red_proof)
// รัน: node tests/trimbox.test.mjs
import path from "node:path";
import url from "node:url";
const src = process.env.TRIMBOX_SRC ? url.pathToFileURL(path.resolve(process.env.TRIMBOX_SRC)).href : "../src/trimbox.js";
const { contentBox, unionBox, clampFrame, TRIM } = await import(src);

/* สเปก (brief 02/10/2026) ใช้คำนวณค่าที่คาด และเทียบกับ TRIM ที่โมดูลส่งออก */
const SPEC = {
  RING: 0.015, RING_MIN: 2,                                               // ขอบภาพที่ใช้หาสีกระดาษ
  PAPER_D: 24, PAPER_SHARE: 0.6, PAPER_LUMA: 180, PAPER_SPREAD: 80,       // เกณฑ์รับว่าเป็นกระดาษ
  NOISE_D: 40, T_BASE: 10, T_K: 4, T_MIN: 10, T_MAX: 56, NOISY_M: 1,      // สัญญาณรบกวน กับเกณฑ์เนื้อหา
  SPECK_PX: 2, SPECK_MM: 1, SPECK_BLUR: 2, EDGE: 0.015, EDGE_MM: 4,       // ฝุ่น กับเส้นขอบเครื่องสแกน
  PAD: 0.015, PAD_MIN: 2.5, SNAP: 0.01, SNAP_MIN: 3, MIN_FRAME: 0.02,     // เว้นขอบ ดูดขอบ ขั้นต่ำ
};
const TOL = 0.5;    // px  brief ยอม 1 px แต่ภาพสังเคราะห์ขอบคมต้องตรงเกือบเป๊ะ ใช้ 0.5 กันเลื่อน 1 px (off-by-one) หลุดผ่าน
const TIGHT = 0.05; // px  ข้อที่ผลต่างจริงต่ำกว่า 1 px (หาร w แทน vpW, เว้นขอบขั้นต่ำ 2.5 กับ 1.8)

let pass = 0; const F = [];
const r4 = (v) => JSON.stringify(v, (k, x) => (typeof x === "number" ? Math.round(x * 1e4) / 1e4 : x));
const rec = (name, good, got, want) => {
  good ? pass++ : F.push(`${name}\n      ได้    : ${got}\n      ควรได้ : ${want}`);
  console.log(`  ${good ? "✅" : "❌"} ${name}`);
};
const ck = (name, got, want) => rec(name, JSON.stringify(got) === JSON.stringify(want), r4(got), r4(want));
const tryf = (f) => { try { return f(); } catch (e) { return "โยน error: " + e.message; } };

/* ขนาดภาพแบบที่ pdf-crop.js วาดจริง: s = min(2, sqrt(500000/(W*H)), 8192/max(W,H)) */
function page(Wpt, Hpt) {
  const s = Math.min(2, Math.sqrt(500000 / (Wpt * Hpt)), 8192 / Math.max(Wpt, Hpt));
  const vpW = Wpt * s, vpH = Hpt * s;
  return { w: Math.floor(vpW), h: Math.floor(vpH), vpW, vpH, pxPerMm: (s * 72) / 25.4 };
}
const A4 = page(595.28, 841.89);                                            // 594 x 840 px, 2.83 px/mm
const SLIP = { w: 120, h: 4000, vpW: 120.6, vpH: 4000.4, pxPerMm: 1.2 };   // ใบเสร็จยาวแคบ (กำหนดค่าตรง)
const ODD = { w: 594, h: 840, vpW: 594.96, vpH: 840.9, pxPerMm: 2.8313 };  // วิวพอร์ตมีเศษเกือบ 1 px

const WHITE = [255, 255, 255], INK = [40, 40, 40], OFF = [236, 229, 210], DUST = [90, 80, 70];
function sheet(g, rgb) {
  const a = new Uint8ClampedArray(g.w * g.h * 4);
  for (let i = 0; i < a.length; i += 4) { a[i] = rgb[0]; a[i + 1] = rgb[1]; a[i + 2] = rgb[2]; a[i + 3] = 255; }
  return { ...g, a };
}
function fill(im, x, y, w, h, rgb) {            // สี่เหลี่ยมทึบ x..x+w-1, y..y+h-1
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const i = (yy * im.w + xx) * 4; im.a[i] = rgb[0]; im.a[i + 1] = rgb[1]; im.a[i + 2] = rgb[2];
  }
}
const frame = (im, rgb, t = 1) => {             // เส้นรอบภาพหนา t px ชิดขอบ
  fill(im, 0, 0, im.w, t, rgb); fill(im, 0, im.h - t, im.w, t, rgb); fill(im, 0, 0, t, im.h, rgb); fill(im, im.w - t, 0, t, im.h, rgb);
};
const lcg = (seed) => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
function noise(im, sigma, seed) {               // เกาส์เซียนแยกทุกช่องสี (Box-Muller) ตัดเข้าช่วง 0..255 เอง
  const rnd = lcg(seed);
  for (let i = 0; i < im.a.length; i += 4) for (let c = 0; c < 3; c++) {
    const u = rnd() || 1e-9, v = rnd();
    im.a[i + c] += sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}
function band(im, width, color) {               // ระบายแถบขอบภาพกว้าง width px ด้วยสีจาก color()
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++)
    if (x < width || y < width || x >= im.w - width || y >= im.h - width) {
      const c = color(), i = (y * im.w + x) * 4; im.a[i] = c[0]; im.a[i + 1] = c[1]; im.a[i + 2] = c[2];
    }
}
function run(im) {
  try { return contentBox(im.a, im.w, im.h, { vpW: im.vpW, vpH: im.vpH, pxPerMm: im.pxPerMm }); }
  catch (e) { return { status: "โยน error: " + e.message, box: null }; }
}

/* ขั้น 1 ถึง 3 ของสเปก คำนวณใหม่แบบเรียงค่า: สีกระดาษ เกณฑ์รับกระดาษ m T noisy */
function ringStats(im) {
  const { w, h, a } = im, r = Math.max(SPEC.RING_MIN, Math.round(SPEC.RING * Math.min(w, h)));
  const ch = [[], [], []];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x >= r && y >= r && x < w - r && y < h - r) continue;
    const i = (y * w + x) * 4; ch[0].push(a[i]); ch[1].push(a[i + 1]); ch[2].push(a[i + 2]);
  }
  const med = (v) => Float64Array.from(v).sort()[(v.length - 1) >> 1];      // มัธยฐานตัวล่าง
  const paper = ch.map(med);
  const dist = (R, G, B) => Math.max(Math.abs(R - paper[0]), Math.abs(G - paper[1]), Math.abs(B - paper[2]));
  const dr = ch[0].map((_, k) => dist(ch[0][k], ch[1][k], ch[2][k]));
  const share = dr.filter((d) => d <= SPEC.PAPER_D).length / dr.length;
  const luma = 0.299 * paper[0] + 0.587 * paper[1] + 0.114 * paper[2];
  const spread = Math.max(...paper) - Math.min(...paper);
  const d40 = dr.filter((d) => d <= SPEC.NOISE_D), m = d40.length ? med(d40) : 0;
  const tOf = (mm) => Math.min(SPEC.T_MAX, Math.max(SPEC.T_MIN, SPEC.T_BASE + SPEC.T_K * mm));
  const T = tOf(m), TAll = tOf(med(dr));                                     // TAll = ถ้าลืมกรอง d <= 40
  const accept = share >= SPEC.PAPER_SHARE && luma >= SPEC.PAPER_LUMA && spread <= SPEC.PAPER_SPREAD;
  const d = (x, y) => { const i = (y * w + x) * 4; return dist(a[i], a[i + 1], a[i + 2]); };
  return { paper, share, luma, spread, m, T, TAll, noisy: m >= SPEC.NOISY_M, accept, d };
}

/* ขั้น 6 ถึง 8 ของสเปก: เนื้อหาจริงอยู่ที่ x0..x1, y0..y1 (รวมปลาย) ต้องได้กรอบเท่าไร */
function clampSpec(f, min) {
  const ax = (p, s) => {
    let a = Math.min(1, Math.max(0, p)), b = Math.min(1, Math.max(0, p + s));
    if (b - a < min) { const c = (a + b) / 2; a = Math.min(1 - min, Math.max(0, c - min / 2)); b = a + min; }
    return [a, b - a];
  };
  const [x, w] = ax(f.x, f.w), [y, h] = ax(f.y, f.h);
  return { x, y, w, h };
}
function want(g, x0, y0, x1, y1) {
  const p = Math.max(SPEC.PAD * Math.min(g.w, g.h), SPEC.PAD_MIN);
  let L = Math.max(0, x0 - p), T = Math.max(0, y0 - p), R = Math.min(g.vpW, x1 + 1 + p), B = Math.min(g.vpH, y1 + 1 + p);
  const sx = Math.max(SPEC.SNAP * g.vpW, SPEC.SNAP_MIN), sy = Math.max(SPEC.SNAP * g.vpH, SPEC.SNAP_MIN);
  const snap = [L < sx, T < sy, g.vpW - R < sx, g.vpH - B < sy];
  if (snap[0]) L = 0; if (snap[1]) T = 0; if (snap[2]) R = g.vpW; if (snap[3]) B = g.vpH;
  if (snap.every(Boolean)) return { status: "full", box: null, raw: { p, sx, sy } };
  const box = clampSpec({ x: L / g.vpW, y: T / g.vpH, w: (R - L) / g.vpW, h: (B - T) / g.vpH }, SPEC.MIN_FRAME);
  return { status: "ok", box, raw: { p, sx, sy, L, T, R, B, snap } };
}
const edges = (b, g) => (b ? [b.x * g.vpW, b.y * g.vpH, (b.x + b.w) * g.vpW, (b.y + b.h) * g.vpH] : null);
const pxs = (e) => (e ? "ซ้าย บน ขวา ล่าง (px) " + e.map((v) => v.toFixed(2)).join(", ") : "ไม่มีกรอบ");
function ckBox(name, got, exp, g, tol = TOL) {
  const ge = edges(got && got.box, g), we = edges(exp.box, g);
  const good = !!got && got.status === exp.status &&
    (we ? !!ge && ge.every((v, i) => Math.abs(v - we[i]) <= tol) : got.box === null);
  rec(name, good, `${got && got.status} ${pxs(ge)}`, `${exp.status} ${pxs(we)} (ยอม ${tol} px)`);
}
const inside = (b) => !!b && b.x >= 0 && b.y >= 0 && b.x + b.w <= 1 + 1e-12 && b.y + b.h <= 1 + 1e-12;
const bodyOn = (im, rgb = INK) => fill(im, 150, 200, 300, 400, rgb);   // เนื้อหลัก x 150..449, y 200..599

console.log("\n━━ ⓪ ตัวเลขใน TRIM ตรงกับสเปก ━━");
for (const [k, v] of Object.entries(SPEC)) ck(`TRIM.${k} = ${v}`, TRIM && TRIM[k], v);

console.log("\n━━ ① หน้าขาวล้วน กับบล็อกดำ 50x50 ━━");
{
  const im = sheet(A4, WHITE), r = run(im), rs = ringStats(im);
  ck("หน้าขาวล้วน ได้ blank ไม่มีกรอบ", [r.status, r.box], ["blank", null]);
  ck("สีกระดาษ T noisy ตรงกับที่วัดจากขอบภาพ (ขาว 255, T 10, ไม่ noisy)", [r.paper, r.T, r.noisy], [rs.paper, rs.T, rs.noisy]);
}
{
  const im = sheet(A4, WHITE); fill(im, 200, 300, 50, 50, [0, 0, 0]);
  const r = run(im), rs = ringStats(im);
  ckBox("บล็อกดำ 50x50 ที่ (200,300) ได้กรอบ = บล็อก + เว้นขอบ", r, want(im, 200, 300, 249, 349), im);
  ck("สีกระดาษ T noisy ตรงกับที่วัดจากขอบภาพ", [r.paper, r.T, r.noisy], [rs.paper, rs.T, rs.noisy]);
}

console.log("\n━━ ② หน้าสะอาด เส้นบาง 1 px ต้องอยู่ในกรอบเต็มความยาว ━━");
{
  const im = sheet(A4, WHITE); fill(im, 40, 100, 521, 1, INK); bodyOn(im);     // เส้นนอน x 40..560 ที่ y 100
  const r = run(im);
  ckBox("เส้นนอน 1 px x 40..560 กรอบกว้างครอบทั้งเส้น", r, want(im, 40, 100, 560, 599), im);
  ck("หน้าสะอาด ไม่ noisy", r.noisy, false);
}
{
  const im = sheet(A4, WHITE); fill(im, 500, 150, 1, 600, INK); bodyOn(im);    // เส้นตั้ง y 150..749 ที่ x 500
  ckBox("เส้นตั้ง 1 px y 150..749 กรอบสูงครอบทั้งเส้น", run(im), want(im, 150, 150, 500, 749), im);
}

console.log("\n━━ ③ หน้าสะอาดเก็บทุกพิกเซล: ขีด 2x9 ใกล้ขอบล่าง จุด 2x2 กรอบเส้นรอบหน้า ━━");
{
  const im = sheet(A4, WHITE); bodyOn(im); fill(im, 300, 800, 2, 9, INK);       // ขีดที่ y 800..808
  const exp = want(im, 150, 200, 449, 808);
  rec("ประชากร: ขอบล่างที่คาดไม่ถูกดูดชิดขอบ (ขีดอยู่นอกโซนดูด)", exp.box && !exp.raw.snap[3], r4(exp.raw.snap), "ด้านล่างไม่ดูด");
  ckBox("ขีด 2x9 เดี่ยวใกล้ขอบล่างอยู่ในกรอบ", run(im), exp, im);
}
{
  const im = sheet(A4, WHITE); bodyOn(im); fill(im, 520, 700, 2, 2, INK);       // จุดฟูลสต็อปห่างเนื้อหลัก
  ckBox("จุด 2x2 ห่างเนื้อหลักอยู่ในกรอบ", run(im), want(im, 150, 200, 521, 701), im);
}
{
  const im = sheet(A4, WHITE); bodyOn(im); frame(im, [120, 120, 120]);          // เส้นกรอบหน้าแบบเวกเตอร์
  ckBox("กรอบเส้น 1 px รอบหน้าบนหน้าสะอาด นับเป็นเนื้อหา ได้ full", run(im), want(im, 0, 0, im.w - 1, im.h - 1), im);
}

console.log("\n━━ ④ หน้าสแกนสีนวล (236,229,210) มีสัญญาณรบกวน: ฝุ่น 2x2 ถูกทิ้ง ขีด 2x9 กับเส้น 1 px อยู่ ━━");
const CORNER_DUST = [[20, 20], [570, 20], [20, 815], [570, 815]];
{
  const im = sheet(A4, OFF); bodyOn(im);
  fill(im, 60, 650, 471, 1, [60, 60, 60]);      // เส้นบรรทัด 1 px x 60..530 กว้างกว่าเนื้อหลัก
  fill(im, 500, 700, 2, 9, INK);                // ขีด 2x9 ที่ y 700..708
  for (const [x, y] of CORNER_DUST) fill(im, x, y, 2, 2, DUST);
  noise(im, 4, 11);
  const r = run(im), rs = ringStats(im);
  ck("สีกระดาษ T noisy ตรงกับที่วัดจากขอบภาพ", [r.paper, r.T, r.noisy], [rs.paper, rs.T, rs.noisy]);
  rec("ประชากร: ภาพมีสัญญาณรบกวนจริง (m >= 1)", rs.noisy, `m ${rs.m}`, "m >= 1");
  const seen = CORNER_DUST.filter(([x, y]) => rs.d(x, y) > rs.T && rs.d(x + 1, y + 1) > rs.T).length;
  rec("ประชากร: ฝุ่นทั้ง 4 จุดเข้มเกิน T จริง (ตัวกรองต้องเป็นคนทิ้ง ไม่ใช่เกณฑ์สี)", seen === 4, `${seen} จุด`, "4 จุด");
  ckBox("กรอบ = เนื้อหลัก + เส้น 1 px + ขีด 2x9 (ไม่รวมฝุ่นมุมหน้า)", r, want(im, 60, 200, 530, 708), im);
}
{
  /* ‼️ วัดจริง 02/10/2026 (tests/browser_crop_tools.py ไฟล์สแกน JPEG 150 dpi กับภาพที่ pdf.js วาดให้จริง)
     pdf.js ย่อภาพสแกนลงราว 1 px ต่อพอยต์ ฝุ่น 0.5 มม. เกลี่ยเป็นก้อน 3x3 px ขอบนุ่ม (d กลางก้อน 94 ถึง 133)
     ซึ่งเกิน 1 มม. = 2.83 px ไป 1 px สเปกแรกจึงเก็บฝุ่นทั้ง 5 จุดไว้ในกรอบ ต้องเผื่อขอบที่เกลี่ยออกข้างละ 1 px
     ส่วนเลขหน้า 9 พอยต์ (สูงราว 7 px) และก้อน 5x5 (1.8 มม.) ยังเป็นของจริง ต้องอยู่ */
  const im = sheet(A4, OFF); bodyOn(im);
  const soft = (x, y) => { fill(im, x, y, 3, 3, [150, 145, 130]); fill(im, x + 1, y + 1, 1, 1, DUST); };
  for (const [x, y] of CORNER_DUST) soft(x, y);
  fill(im, 300, 760, 2, 7, INK);                // เลขหน้า 2x7 ที่ y 760..766
  fill(im, 520, 640, 5, 5, INK);                // ก้อน 5x5 ที่ x 520..524 (ไม่ใช่ฝุ่น ใหญ่กว่า 1 มม. + ขอบเกลี่ย)
  noise(im, 4, 18);
  const r = run(im), rs = ringStats(im);
  rec("ประชากร: หน้า noisy และฝุ่น 3x3 ขอบนุ่มเข้มเกิน T ทั้งก้อน", rs.noisy && CORNER_DUST.every(([x, y]) => rs.d(x, y) > rs.T && rs.d(x + 2, y + 2) > rs.T),
    `m ${rs.m} T ${rs.T}`, "noisy และขอบก้อนเกิน T");
  ckBox("ฝุ่น 3x3 ขอบนุ่มถูกทิ้ง เลขหน้า 2x7 กับก้อน 5x5 อยู่ในกรอบ", r, want(im, 150, 200, 524, 766), im);
}
{
  const im = sheet(A4, OFF);
  for (const [x, y] of [...CORNER_DUST, [300, 420], [100, 600], [450, 150]]) fill(im, x, y, 2, 2, DUST);
  noise(im, 4, 12);
  const r = run(im);
  ck("หน้ามีแต่ฝุ่น ได้ blank", [r.status, r.box, r.noisy], ["blank", null, true]);
}
{
  const im = sheet(A4, OFF); bodyOn(im);
  for (const [x, y] of CORNER_DUST) fill(im, x, y, 2, 2, DUST);
  const r = run(im);
  ck("หน้าสีนวลไม่มีสัญญาณรบกวน ไม่ noisy", r.noisy, false);
  ckBox("หน้าสะอาดเก็บจุด 2x2 ทุกจุด (ตัวกรองฝุ่นทำงานเฉพาะหน้า noisy)", r, want(im, 20, 20, 571, 816), im);
}
{
  const im = sheet(A4, OFF); bodyOn(im); noise(im, 10, 13);
  const r = run(im), rs = ringStats(im), raw = SPEC.T_BASE + SPEC.T_K * rs.m;
  rec("ประชากร: สัญญาณรบกวนแรงจน 10 + 4m เกิน 56", raw > SPEC.T_MAX, `m ${rs.m} ได้ ${raw}`, "> 56");
  ck("สัญญาณรบกวนแรง T ตันที่ 56 ตรงกับที่วัด", [r.T, r.noisy], [rs.T, true]);
  ckBox("สัญญาณรบกวนแรง กรอบยังเท่าเนื้อหลัก", r, want(im, 150, 200, 449, 599), im);
}
for (const [sigma, seed, m, noisy] of [[1, 14, 1, true], [0.3, 15, 0, false]]) {   // m ที่คาดวัดจากภาพจริง 02/10
  const im = sheet(A4, OFF); bodyOn(im);
  for (const [x, y] of CORNER_DUST) fill(im, x, y, 2, 2, DUST);
  noise(im, sigma, seed);
  const r = run(im), rs = ringStats(im);
  rec(`ประชากร: สัญญาณรบกวน sigma ${sigma} ได้ m = ${m} (ขอบเขต noisy คือ m >= 1)`, rs.m === m, `m ${rs.m}`, `m ${m}`);
  ck(`sigma ${sigma} T noisy ตรงกับที่วัด`, [r.T, r.noisy], [rs.T, noisy]);
  ckBox(noisy ? `sigma ${sigma} (m = 1) นับเป็น noisy ฝุ่นมุมหน้าถูกทิ้ง` : `sigma ${sigma} (m = 0) นับเป็นหน้าสะอาด ฝุ่นอยู่ครบ`,
    r, noisy ? want(im, 150, 200, 449, 599) : want(im, 20, 20, 571, 816), im);
}
{
  const im = sheet(A4, OFF); bodyOn(im);
  const YEL = [255, 240, 0]; fill(im, 480, 640, 40, 20, YEL);               // แถบไฮไลต์เหลือง x 480..519, y 640..659
  noise(im, 4, 16);
  const r = run(im), rs = ringStats(im);
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2], dl = Math.abs(lum(YEL) - lum(rs.paper));
  rec("ประชากร: เหลืองต่างจากกระดาษด้วยความสว่างน้อยกว่า T (วัดแบบความสว่างจะหลุด)", dl < rs.T && rs.d(490, 650) > rs.T,
    `ต่างความสว่าง ${dl.toFixed(1)} d ${rs.d(490, 650)} T ${rs.T}`, "ความสว่าง < T < d");
  ckBox("ไฮไลต์เหลืองบนหน้าสแกนนับเป็นเนื้อหา (ระยะสีแบบช่องที่ห่างที่สุด)", r, want(im, 150, 200, 519, 659), im);
}

console.log("\n━━ ⑤ หน้าสแกน: เส้นขอบเครื่องสแกนถูกทิ้ง แต่ของจริงที่ชนขอบยังอยู่ ━━");
{
  const im = sheet(A4, OFF); bodyOn(im); frame(im, [150, 145, 130]); noise(im, 4, 21);
  const r = run(im), rs = ringStats(im);
  const probes = [[0, 400], [im.w - 1, 400], [300, 0], [300, im.h - 1]];
  const seen = probes.filter(([x, y]) => rs.d(x, y) > rs.T).length;
  rec("ประชากร: เส้นขอบเข้มเกิน T จริงทั้ง 4 ด้าน", seen === 4, `${seen} ด้าน`, "4 ด้าน");
  ck("สีกระดาษ T noisy ตรงกับที่วัดจากขอบภาพ", [r.paper, r.T, r.noisy], [rs.paper, rs.T, rs.noisy]);
  ckBox("เส้น 1 px รอบหน้าถูกทิ้ง กรอบ = เนื้อหลัก + เว้นขอบ", r, want(im, 150, 200, 449, 599), im);
}
{
  const im = sheet(A4, OFF); bodyOn(im);
  const blk = Math.round(12 * im.pxPerMm);      // 12 mm
  fill(im, 250, 0, blk, blk, INK); noise(im, 4, 22);
  const eb = Math.min(SPEC.EDGE * Math.min(im.w, im.h), SPEC.EDGE_MM * im.pxPerMm);
  rec("ประชากร: บล็อก 12 mm ยื่นเลยแถบขอบ", blk > eb + 1, `${blk} px เทียบแถบ ${eb.toFixed(2)} px`, "ยื่นเลยแถบ");
  const r = run(im);
  ckBox(`บล็อก 12 mm (${blk} px) ชนขอบบนยังอยู่ กรอบถึงขอบบน`, r, want(im, 150, 0, 449, 599), im);
  ck("ขอบบนของกรอบ = 0", r.box && r.box.y, 0);
}
{
  const im = sheet(A4, OFF); bodyOn(im); fill(im, 0, 0, 3, im.h, [70, 70, 70]); noise(im, 4, 23);
  ckBox("เงาดำ 3 px ตลอดขอบซ้ายถูกทิ้ง", run(im), want(im, 150, 200, 449, 599), im);
}
{
  const im = sheet(A4, OFF); bodyOn(im); fill(im, 0, 0, 4, im.h, [60, 60, 60]); fill(im, im.w - 4, 0, 4, im.h, [60, 60, 60]);
  noise(im, 4, 24);
  const r = run(im), rs = ringStats(im);
  rec("ประชากร: แถบดำซ้ายขวากินขอบภาพมากพอให้ T ต่างกันถ้าไม่กรอง d <= 40", rs.accept && rs.TAll !== rs.T,
    `T ${rs.T} ถ้าไม่กรอง ${rs.TAll} share ${rs.share.toFixed(3)}`, "รับกระดาษ และ T สองแบบต่างกัน");
  ck("แถบดำซ้ายขวา T คิดจากเฉพาะ d <= 40", [r.T, r.noisy], [rs.T, true]);
  ckBox("แถบดำ 4 px ซ้ายขวาถูกทิ้ง กรอบ = เนื้อหลัก", r, want(im, 150, 200, 449, 599), im);
}

console.log("\n━━ ⑥ รับว่าเป็นกระดาษไหม ━━");
const isolate = (name, rs, which) => {           // ยืนยันว่าเคสนี้ผิดกฎแค่ข้อเดียวตามที่ตั้งใจ
  const bad = { share: rs.share < SPEC.PAPER_SHARE, luma: rs.luma < SPEC.PAPER_LUMA, spread: rs.spread > SPEC.PAPER_SPREAD };
  const list = Object.keys(bad).filter((k) => bad[k]);
  rec(`ประชากร: ${name} ผิดกฎข้อ ${which} ข้อเดียว`, list.join() === which,
    `ผิด [${list}] share ${rs.share.toFixed(3)} luma ${rs.luma.toFixed(1)} spread ${rs.spread}`, `ผิด [${which}]`);
};
{
  const im = sheet(A4, [20, 30, 90]); bodyOn(im, WHITE);
  isolate("พื้นกรมท่า", ringStats(im), "luma");
  const r = run(im);
  ck("สไลด์พื้นกรมท่า (20,30,90) ได้ nowhite ไม่มีกรอบ", [r.status, r.box], ["nowhite", null]);
}
{
  const im = sheet(A4, WHITE); bodyOn(im); frame(im, [0, 0, 0], 15);
  ck("ขอบดำเครื่องสแกน 15 px ได้ nowhite", run(im).status, "nowhite");
}
{
  const im = sheet(A4, WHITE); bodyOn(im); const rnd = lcg(7);
  band(im, 12, () => [(rnd() * 256) | 0, (rnd() * 256) | 0, (rnd() * 256) | 0]);
  ck("ขอบภาพสีสุ่มทั้งช่วง ได้ nowhite", run(im).status, "nowhite");
}
{
  const im = sheet(A4, WHITE); bodyOn(im); const rnd = lcg(8);
  band(im, 12, () => [175 + ((rnd() * 81) | 0), 175 + ((rnd() * 81) | 0), 175 + ((rnd() * 81) | 0)]);
  isolate("ขอบสีอ่อนสุ่ม", ringStats(im), "share");
  ck("ขอบภาพสีอ่อนสุ่ม (สว่างพอแต่ไม่สม่ำเสมอ) ได้ nowhite", run(im).status, "nowhite");
}
{
  const im = sheet(A4, [255, 230, 0]); bodyOn(im);
  isolate("พื้นเหลืองสด", ringStats(im), "spread");
  ck("พื้นเหลืองสด (255,230,0) ได้ nowhite", run(im).status, "nowhite");
}
for (const [name, rgb] of [["กระดาษเก่า (220,200,150)", [220, 200, 150]], ["กระดาษนวล (236,229,210)", OFF]]) {
  const im = sheet(A4, rgb); bodyOn(im);
  const r = run(im), rs = ringStats(im);
  rec(`ประชากร: ${name} ผ่านเกณฑ์ทุกข้อ`, rs.accept, `luma ${rs.luma.toFixed(1)} spread ${rs.spread}`, "ผ่าน");
  ck(`${name} สีกระดาษ T noisy`, [r.paper, r.T, r.noisy], [rgb, rs.T, false]);
  ckBox(`${name} ได้ ok กรอบ = เนื้อหลัก`, r, want(im, 150, 200, 449, 599), im);
}
{
  const im = sheet(A4, WHITE); fill(im, 60, 60, 474, 720, [200, 60, 60]);    // ภาพสีเต็มหน้าเกินครึ่ง
  const share = (474 * 720) / (im.w * im.h);
  rec("ประชากร: บล็อกภาพกินพื้นที่เกินครึ่งหน้า", share > 0.5, share.toFixed(3), "> 0.5");
  const r = run(im);
  ck("บล็อกภาพใหญ่ สีกระดาษยังมาจากขอบ = ขาว", r.paper, WHITE);
  ckBox("บล็อกภาพใหญ่ ได้ ok กรอบ = บล็อก + เว้นขอบ", r, want(im, 60, 60, 533, 779), im);
}

console.log("\n━━ ⑦ ดูดชิดขอบ, full, จุดเดียวขยายถึงขั้นต่ำ 0.02 ━━");
{
  const im = sheet(A4, WHITE); bodyOn(im); fill(im, 1, 400, 4, 4, INK);       // ห่างขอบซ้าย 1 px
  const r = run(im);
  ckBox("เนื้อหาห่างขอบซ้าย 1 px กรอบชิดขอบซ้าย", r, want(im, 1, 200, 449, 599), im);
  ck("ขอบซ้ายของกรอบ = 0", r.box && r.box.x, 0);
}
{
  const im = sheet(A4, WHITE); bodyOn(im);
  fill(im, 577, 300, 4, 4, INK);                // ขวาสุด x 580: ขอบขวาหลังเว้นเหลือระยะน้อยกว่าเกณฑ์ดูด
  fill(im, 300, 821, 4, 4, INK);                // ล่างสุด y 824: เหลือ 7 px อยู่ระหว่าง 1% ของกว้าง (5.95) กับ 1% ของสูง (8.41)
  const exp = want(im, 150, 200, 580, 824), q = exp.raw;
  const mr = im.vpW - (581 + q.p), mb = im.vpH - (825 + q.p);
  rec("ประชากร: ก่อนดูด ขวากับล่างยังเหลือระยะ แต่น้อยกว่าเกณฑ์ของแกนตัวเอง (ล่างเกิน 1% ของกว้าง)",
    mr > 0 && mr < q.sx && mb > SPEC.SNAP * im.vpW && mb < q.sy,
    `ขวา ${mr.toFixed(2)}/${q.sx.toFixed(2)} ล่าง ${mb.toFixed(2)}/${q.sy.toFixed(2)}`, "0 < ระยะ < เกณฑ์");
  const r = run(im);
  ckBox("ขอบขวากับล่างในโซนดูด ดูดชิดขอบหน้า", r, exp, im);
  ck("ขวาและล่างของกรอบ = 1 พอดี", r.box && [+(r.box.x + r.box.w).toFixed(12), +(r.box.y + r.box.h).toFixed(12)], [1, 1]);
}
{
  const im = sheet(A4, WHITE); bodyOn(im);
  fill(im, 574, 300, 4, 4, INK); fill(im, 300, 816, 4, 4, INK);              // เลยโซนดูดออกมานิดเดียว
  const exp = want(im, 150, 200, 577, 819), q = exp.raw;
  const mr = im.vpW - (578 + q.p), mb = im.vpH - (820 + q.p);
  rec("ประชากร: คู่เทียบ ระยะที่เหลือเกินเกณฑ์ของแกนตัวเอง (ขวายังต่ำกว่า 1% ของสูง)", mr > q.sx && mr < SPEC.SNAP * im.vpH && mb > q.sy,
    `ขวา ${mr.toFixed(2)}/${q.sx.toFixed(2)} ล่าง ${mb.toFixed(2)}/${q.sy.toFixed(2)}`, "ระยะ > เกณฑ์");
  ckBox("นอกโซนดูด ไม่ดูด กรอบ = เนื้อหา + เว้นขอบ", run(im), exp, im);
}
{
  const im = sheet(A4, WHITE); bodyOn(im);
  fill(im, 0, 400, 6, 6, INK); fill(im, im.w - 6, 400, 6, 6, INK); fill(im, 300, 0, 6, 6, INK); fill(im, 300, im.h - 6, 6, 6, INK);
  const r = run(im);
  ck("เนื้อหาแตะขอบทั้ง 4 ด้าน ได้ full ไม่มีกรอบ", [r.status, r.box], ["full", null]);
}
{
  const im = sheet(A4, WHITE); fill(im, 300, 420, 1, 1, INK);
  const r = run(im), b = r.box;
  ckBox("จุดเดียว 1 px กลางหน้า A4 ได้ ok", r, want(im, 300, 420, 300, 420), im);
  rec("จุดเดียว กรอบกว้างและสูงอย่างน้อย 0.02 และอยู่ในหน้า", !!b && b.w >= 0.02 - 1e-12 && b.h >= 0.02 - 1e-12 && inside(b), r4(b), "w,h >= 0.02");
}
{
  const im = sheet(A4, WHITE); fill(im, 0, 0, 1, 1, INK);                     // จุดเดียวที่มุมซ้ายบน: ด้านซ้ายบนถูกตัดที่ขอบหน้า
  const r = run(im), b = r.box, exp = want(im, 0, 0, 0, 0), q = exp.raw;
  rec("ประชากร: มุมหน้า ก่อนขยายทั้งกว้างและสูงไม่ถึง 0.02", (q.R - q.L) / im.vpW < 0.02 && (q.B - q.T) / im.vpH < 0.02,
    `${((q.R - q.L) / im.vpW).toFixed(4)} x ${((q.B - q.T) / im.vpH).toFixed(4)}`, "< 0.02 ทั้งคู่");
  ckBox("จุดเดียวที่มุมซ้ายบน ขยายถึง 0.02 ทั้งสองแกน", r, exp, im);
  ck("จุดที่มุม กรอบ = 0, 0, 0.02, 0.02 อยู่ในหน้า", b && [b.x, b.y, +b.w.toFixed(12), +b.h.toFixed(12), inside(b)], [0, 0, 0.02, 0.02, true]);
}
{
  const im = sheet(SLIP, WHITE); fill(im, 60, 2000, 1, 1, INK);
  const r = run(im), b = r.box, exp = want(im, 60, 2000, 60, 2000);
  rec("ประชากร: หน้ายาวแกนตั้งต้องถูกขยาย (ก่อนขยายสูงไม่ถึง 0.02)", (exp.raw.B - exp.raw.T) / im.vpH < 0.02,
    ((exp.raw.B - exp.raw.T) / im.vpH).toFixed(4), "< 0.02");
  ckBox("จุดเดียวบนหน้ายาว ขยายรอบจุดกลางถึง 0.02", r, exp, im);
  rec("จุดเดียวบนหน้ายาว สูง 0.02 อยู่ในหน้า และครอบจุด", !!b && Math.abs(b.h - 0.02) < 1e-9 && inside(b) &&
    b.y * im.vpH <= 2000 && (b.y + b.h) * im.vpH >= 2001, r4(b), "h 0.02 ครอบ y 2000");
}
{
  const im = sheet(SLIP, WHITE); fill(im, 60, 3990, 1, 1, INK);
  const r = run(im), b = r.box;
  ckBox("จุดเดียวชิดก้นหน้ายาว ขยายแล้วเลื่อนเข้าในหน้า", r, want(im, 60, 3990, 60, 3990), im);
  rec("จุดชิดก้น กรอบสูง 0.02 ก้นกรอบ = 1 ไม่ล้น", !!b && Math.abs(b.h - 0.02) < 1e-9 && Math.abs(b.y + b.h - 1) < 1e-9 && inside(b),
    r4(b), "y 0.98 h 0.02");
}

console.log("\n━━ ⑧ เว้นขอบขั้นต่ำ 2.5 px: ใบเสร็จแคบ 120 x 4000 ตัวอักษรเริ่ม x=1 ต้องไม่ถูกตัด ━━");
const slipText = (im) => {
  for (let y = 40; y + 12 <= 3960; y += 40) { fill(im, 1, y, 2, 12, INK); fill(im, 8, y, 30, 12, INK); fill(im, 45, y + 2, 56, 10, INK); }
};
for (const [name, noisy] of [["ใบเสร็จสะอาด", false], ["ใบเสร็จสแกนมีสัญญาณรบกวน", true]]) {
  const im = sheet(SLIP, noisy ? [242, 240, 235] : WHITE); slipText(im);
  if (noisy) {                                  // ฝุ่น 2x2 ทางขวาของตัวอักษร หน้านี้ 1 mm = 1.2 px จึงต้องพึ่งขั้นต่ำ 2 px
    fill(im, 110, 1000, 2, 2, DUST); fill(im, 110, 2000, 2, 2, DUST); noise(im, 3, 31);
    const rs = ringStats(im);
    rec("ประชากร: ฝุ่น 2x2 เข้มเกิน T และ 1 mm ของหน้านี้สั้นกว่า 2 px", rs.d(110, 1000) > rs.T && rs.d(111, 2001) > rs.T &&
      SPEC.SPECK_MM * im.pxPerMm < SPEC.SPECK_PX, `d ${rs.d(110, 1000)}, ${rs.d(111, 2001)} T ${rs.T} 1 mm = ${im.pxPerMm} px`, "d > T, 1 mm < 2 px");
  }
  const r = run(im), b = r.box, exp = want(im, 1, 40, 100, 3931);
  ck(`${name} noisy`, r.noisy, noisy);
  ckBox(`${name} กรอบ = ตัวอักษร + เว้นขอบ${noisy ? " (ฝุ่น 2x2 ทางขวาถูกทิ้ง)" : ""}`, r, exp, im);
  rec(`${name} ขอบซ้ายไม่ตัดขีดที่ x=1 (กรอบเริ่มที่ 0)`, !!b && b.x * im.vpW <= 1 && b.x === 0, r4(b), "x = 0");
  const right = b ? (b.x + b.w) * im.vpW : NaN, wr = exp.raw.R;
  rec(`${name} ขอบขวา = 101 + 2.5 px (เว้นขั้นต่ำ ไม่ใช่ 1.5% = 1.8 px)`, Math.abs(right - wr) <= TIGHT,
    right.toFixed(3), `${wr.toFixed(3)} (ยอม ${TIGHT})`);
}

console.log("\n━━ ⑨ สัดส่วนต้องหารด้วย vpW/vpH ไม่ใช่ w/h (594 กับ 594.96) ━━");
{
  const im = sheet(ODD, WHITE); bodyOn(im);
  const exp = want(im, 150, 200, 449, 599);
  const gap = exp.raw.R * (im.vpW - im.w) / im.w;
  rec("ประชากร: ถ้าหาร w แทน vpW ขอบขวาจะเพี้ยนเกิน 0.5 px", gap > 0.5, gap.toFixed(3) + " px", "> 0.5 px");
  ckBox("ขอบทั้งสี่ตรงกับ px / vpW (ยอม 0.05 px)", run(im), exp, im, TIGHT);
}
{
  const im = sheet(ODD, WHITE); bodyOn(im); fill(im, 400, 600, im.w - 400, im.h - 600, INK);   // แตะขอบขวาและล่าง
  const r = run(im);
  ckBox("เนื้อหาแตะขอบขวาและล่าง ขอบกรอบ = vpW และ vpH", r, want(im, 150, 200, im.w - 1, im.h - 1), im, TIGHT);
  ck("ขวาและล่างของกรอบ = 1 พอดี (ไม่ใช่ 594/594.96)", r.box && [+(r.box.x + r.box.w).toFixed(12), +(r.box.y + r.box.h).toFixed(12)], [1, 1]);
}

console.log("\n━━ ⑩ unionBox กับ clampFrame ━━");
{
  const A = { x: 0.1, y: 0.2, w: 0.3, h: 0.1 }, B = { x: 0.3, y: 0.1, w: 0.5, h: 0.2 };
  const nearBox = (g, e) => !!g && typeof g === "object" && ["x", "y", "w", "h"].every((k) => Math.abs(g[k] - e[k]) <= 1e-9);
  const ckNear = (name, got, exp) => rec(name, nearBox(got, exp), r4(got), r4(exp));
  ck("unionBox(null, b) = b", tryf(() => unionBox(null, B)), B);
  ck("unionBox(a, null) = a", tryf(() => unionBox(A, null)), A);
  ck("unionBox(null, null) = null", tryf(() => unionBox(null, null)), null);
  ckNear("unionBox สองกรอบ ได้กรอบที่ครอบทั้งคู่", tryf(() => unionBox(A, B)), { x: 0.1, y: 0.1, w: 0.7, h: 0.2 });
  ckNear("unionBox กรอบเล็กอยู่ในกรอบใหญ่ ได้กรอบใหญ่", tryf(() => unionBox({ x: 0.2, y: 0.2, w: 0.1, h: 0.1 }, { x: 0.1, y: 0.1, w: 0.5, h: 0.5 })), { x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
  ckNear("clampFrame ตัดส่วนที่ล้นซ้าย", tryf(() => clampFrame({ x: -0.1, y: 0.5, w: 0.3, h: 0.2 })), { x: 0, y: 0.5, w: 0.2, h: 0.2 });
  ckNear("clampFrame ตัดส่วนที่ล้นขวาและล่าง", tryf(() => clampFrame({ x: 0.9, y: 0.95, w: 0.5, h: 0.5 })), { x: 0.9, y: 0.95, w: 0.1, h: 0.05 });
  ckNear("clampFrame ขยายรอบจุดกลางให้ถึง 0.02", tryf(() => clampFrame({ x: 0.5, y: 0.3, w: 0.004, h: 0.01 })), { x: 0.492, y: 0.295, w: 0.02, h: 0.02 });
  ckNear("clampFrame ขยายแล้วล้นขอบ เลื่อนเข้าในหน้า", tryf(() => clampFrame({ x: 0.995, y: 0.001, w: 0.004, h: 0.002 })), { x: 0.98, y: 0, w: 0.02, h: 0.02 });
  ckNear("clampFrame ขั้นต่ำกำหนดเองได้ (0.1)", tryf(() => clampFrame({ x: 0.5, y: 0.5, w: 0.01, h: 0.01 }, 0.1)), { x: 0.455, y: 0.455, w: 0.1, h: 0.1 });
  ckNear("clampFrame เต็มหน้าไม่เปลี่ยน", tryf(() => clampFrame({ x: 0, y: 0, w: 1, h: 1 })), { x: 0, y: 0, w: 1, h: 1 });
  const f = { x: -0.2, y: 0.5, w: 0.1, h: 0.001 }, copy = { ...f };
  tryf(() => clampFrame(f));
  ck("clampFrame ไม่แก้กรอบที่ส่งเข้าไป", f, copy);
}

console.log("\n━━ ⏱️ ความเร็ว: A4 0.5 MP สีนวล มีสัญญาณรบกวน ตัวอักษรเต็มหน้า ฝุ่นรอบ ๆ ━━");
{
  const im = sheet(A4, OFF);
  let x1 = 0, y1 = 0, glyphs = 0;
  for (let y = 60; y + 9 <= 780; y += 14) for (let x = 50; x + 5 <= 545; x += 7) {
    fill(im, x, y, 5, 9, INK); x1 = Math.max(x1, x + 4); y1 = Math.max(y1, y + 8); glyphs++;
  }
  const rnd = lcg(99); let dust = 0;            // ฝุ่นบนตาราง 16 px ขยับสุ่ม 0..5 ห่างกันเสมอ ห่างบล็อกตัวอักษรอย่างน้อย 3 px
  for (let gy = 12; gy < im.h - 20; gy += 16) for (let gx = 12; gx < im.w - 20; gx += 16) {
    const x = gx + ((rnd() * 6) | 0), y = gy + ((rnd() * 6) | 0);
    if (x >= 46 && x <= x1 + 3 && y >= 56 && y <= y1 + 3) continue;
    fill(im, x, y, 2, 2, DUST); dust++;
  }
  noise(im, 4, 5);
  const t = []; let r;
  for (let k = 0; k < 9; k++) { const t0 = performance.now(); r = run(im); t.push(performance.now() - t0); }
  const ts = t.slice(2).sort((a, b) => a - b), med = ts[ts.length >> 1];
  console.log(`  ⏱️ ${im.w}x${im.h} (${((im.w * im.h) / 1e6).toFixed(3)} MP) ตัวอักษร ${glyphs} ฝุ่น ${dust}: เวลากลาง ${med.toFixed(1)} ms ต่ำสุด ${ts[0].toFixed(1)} สูงสุด ${ts[ts.length - 1].toFixed(1)} ms (${ts.length} รอบหลังอุ่นเครื่อง 2 รอบ)`);
  rec("ประชากร: มีตัวอักษรและฝุ่นจริง", glyphs > 0 && dust > 0, `ตัวอักษร ${glyphs} ฝุ่น ${dust}`, "มากกว่า 0 ทั้งคู่");
  ckBox("กรอบ = บล็อกตัวอักษร ฝุ่นถูกทิ้งหมด", r, want(im, 50, 60, x1, y1), im);
  rec("เวลากลางต่ำกว่า 100 ms", med < 100, `${med.toFixed(1)} ms`, "< 100 ms");
}

console.log("\n" + "━".repeat(52));
console.log(`ผ่าน ${pass} ตก ${F.length}`);
if (F.length) { console.log("\nรายการที่ตก:"); F.forEach((f, i) => console.log(`  ${i + 1}. ${f}`)); process.exit(1); }
