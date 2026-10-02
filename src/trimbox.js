/* trimbox.js  หากรอบเนื้อหาของหน้า PDF จากพิกเซลที่ pdf.js วาดแล้ว (พื้นขาว หมุนแล้ว) ไม่แตะ DOM
 * ใช้คู่กับ pdf-crop.js (ครอบตัดขอบขาวอัตโนมัติ)  เทส: tests/trimbox.test.mjs
 *
 * ขั้นตอน (สเปกจากผู้ตรวจที่ทดลองกับ MuPDF)  d(พิกเซล) = max(|R-Rp|, |G-Gp|, |B-Bp|)
 *  1 สีกระดาษ = มัธยฐานรายช่องสีของแถบขอบภาพ กว้าง r = max(2, round(1.5% ของด้านสั้น)) px
 *  2 รับว่าเป็นกระดาษเมื่อ แถบขอบ >= 60% มี d <= 24, ความสว่าง >= 180, สีสูงสุดลบต่ำสุด <= 80 ไม่งั้น nowhite
 *  3 m = มัธยฐานของ d ในแถบขอบเฉพาะที่ d <= 40, T = clamp(10 + 4m, 10, 56), เนื้อหา = d > T, noisy = m >= 1
 *  4 เฉพาะหน้า noisy: ก้อนต่อกัน 8 ทิศที่กรอบไม่เกิน max(2 px, 1 mm) + 2 px ทั้งสองแกน = ฝุ่น ทิ้ง
 *    ‼️ + 2 px คือขอบที่เกลี่ยออกข้างละ 1 px (วัดจริง 02/10/2026: pdf.js ย่อสแกน 150 dpi ลงราว 1 px ต่อพอยต์
 *       ฝุ่น 0.5 มม. ได้ก้อน 3x3 px เกิน 1 มม. = 2.83 px สเปกแรกที่ไม่เผื่อจึงเก็บฝุ่นของสแกนจริงไว้หมด)
 *    ก้อนที่อยู่ในแถบขอบกว้าง min(1.5% ของด้านสั้น, 4 mm) ทั้งก้อน = เส้นขอบเครื่องสแกน ทิ้ง
 *    หน้าสะอาดเก็บทุกพิกเซล (จุดฟูลสต็อป เส้นกรอบเวกเตอร์ เป็นของจริง)
 *  5 ไม่เหลือเนื้อหา = blank
 *  6 เว้นขอบ p = max(1.5% ของด้านสั้น, 2.5 px) แล้วตัดเข้าช่วง [0, vpW] กับ [0, vpH]
 *  7 ด้านที่เหลือระยะถึงขอบหน้าน้อยกว่า max(1% ของด้านนั้น, 3 px) ดูดชิดขอบ ดูดครบ 4 ด้าน = full
 *  8 แปลงเป็นสัดส่วนด้วย vpW/vpH (ไม่ใช่ w/h เพราะ canvas ปัดเศษทิ้ง) แล้ว clampFrame ขั้นต่ำ 0.02
 * มัธยฐาน = ค่าตัวล่างเมื่อจำนวนเป็นคู่, แถบขอบข้อ 4 เทียบแบบทศนิยม (x < กว้างแถบ) ไม่ปัดก่อน
 * คืน { status: 'ok'|'blank'|'full'|'nowhite', box, noisy, T, paper }  box มีเฉพาะ ok (สัดส่วน 0..1 จากมุมซ้ายบน)
 * nowhite คืน paper null, T 0, noisy false */

export const TRIM = Object.freeze({
  RING: 0.015, RING_MIN: 2,                                               // แถบขอบที่ใช้หาสีกระดาษ
  PAPER_D: 24, PAPER_SHARE: 0.6, PAPER_LUMA: 180, PAPER_SPREAD: 80,       // เกณฑ์รับว่าเป็นกระดาษ
  NOISE_D: 40, T_BASE: 10, T_K: 4, T_MIN: 10, T_MAX: 56, NOISY_M: 1,      // สัญญาณรบกวน กับเกณฑ์เนื้อหา
  SPECK_PX: 2, SPECK_MM: 1, SPECK_BLUR: 2, EDGE: 0.015, EDGE_MM: 4,       // ฝุ่น กับเส้นขอบเครื่องสแกน
  PAD: 0.015, PAD_MIN: 2.5, SNAP: 0.01, SNAP_MIN: 3, MIN_FRAME: 0.02,     // เว้นขอบ ดูดขอบ ขั้นต่ำ
});

// มัธยฐานตัวล่างจากฮิสโทแกรม นับแค่ค่า 0..top
function hmed(hist, n, top = hist.length - 1) {
  const k = (n - 1) >> 1;
  for (let v = 0, c = 0; v <= top; v++) if ((c += hist[v]) > k) return v;
  return top;
}

// ระยะสีแบบช่องที่ห่างที่สุด
function dist(a, i, r, g, b) {
  let d = a[i] - r; if (d < 0) d = -d;
  let e = a[i + 1] - g; if (e < 0) e = -e; if (e > d) d = e;
  e = a[i + 2] - b; if (e < 0) e = -e;
  return e > d ? e : d;
}

// ดัชนีพิกเซลในแถบขอบกว้าง r (ภาพเล็กกว่า 2r = ทั้งภาพ) แต่ละพิกเซลครั้งเดียว
function ringIndex(w, h, r) {
  const all = w <= 2 * r || h <= 2 * r;
  const out = new Int32Array(all ? w * h : w * h - (w - 2 * r) * (h - 2 * r));
  for (let y = 0, n = 0; y < h; y++) {
    const row = y * w;
    if (all || y < r || y >= h - r) for (let x = 0; x < w; x++) out[n++] = row + x;
    else { for (let x = 0; x < r; x++) out[n++] = row + x; for (let x = w - r; x < w; x++) out[n++] = row + x; }
  }
  return out;
}

export function contentBox(rgba, w, h, opt = {}) {
  const P = TRIM, N = w * h;
  const out = (status, more) => Object.assign({ status, box: null, noisy: false, T: 0, paper: null }, more);
  if (!(N > 0)) return out("blank");
  if (!rgba || rgba.length < N * 4) throw new RangeError("trimbox: rgba must hold w*h*4 bytes");
  const vpW = opt.vpW > 0 ? opt.vpW : w, vpH = opt.vpH > 0 ? opt.vpH : h;
  const ppm = opt.pxPerMm > 0 ? opt.pxPerMm : 72 / 25.4;
  const mn = Math.min(w, h);

  // 1 สีกระดาษจากแถบขอบ
  const ring = ringIndex(w, h, Math.max(P.RING_MIN, Math.round(P.RING * mn))), n = ring.length;
  const hr = new Uint32Array(256), hg = new Uint32Array(256), hb = new Uint32Array(256), hd = new Uint32Array(256);
  for (let k = 0; k < n; k++) { const i = ring[k] << 2; hr[rgba[i]]++; hg[rgba[i + 1]]++; hb[rgba[i + 2]]++; }
  const pr = hmed(hr, n), pg = hmed(hg, n), pb = hmed(hb, n);

  // 2 รับว่าเป็นกระดาษไหม
  for (let k = 0; k < n; k++) hd[dist(rgba, ring[k] << 2, pr, pg, pb)]++;
  let near = 0, n40 = 0;
  for (let v = 0; v <= P.NOISE_D; v++) { n40 += hd[v]; if (v <= P.PAPER_D) near += hd[v]; }
  const luma = 0.299 * pr + 0.587 * pg + 0.114 * pb, spread = Math.max(pr, pg, pb) - Math.min(pr, pg, pb);
  if (near < P.PAPER_SHARE * n || luma < P.PAPER_LUMA || spread > P.PAPER_SPREAD) return out("nowhite");
  const paper = [pr, pg, pb];

  // 3 สัญญาณรบกวน แล้วหาเนื้อหา (d > T)
  const m = hmed(hd, n40, P.NOISE_D);
  const T = Math.min(P.T_MAX, Math.max(P.T_MIN, P.T_BASE + P.T_K * m)), noisy = m >= P.NOISY_M;
  const mask = noisy ? new Uint8Array(N) : null;
  let x0 = w, y0 = h, x1 = -1, y1 = -1, cnt = 0;
  for (let y = 0, k = 0; y < h; y++) {
    for (let x = 0; x < w; x++, k++) {
      if (dist(rgba, k << 2, pr, pg, pb) <= T) continue;
      cnt++; if (mask) mask[k] = 1;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y;
    }
  }

  // 4 หน้า noisy: ไล่ก้อนด้วยกองซ้อนเอง (ไม่เรียกซ้ำ) ทิ้งฝุ่นกับเส้นขอบสแกน
  if (noisy && cnt) {
    const sp = Math.max(P.SPECK_PX, P.SPECK_MM * ppm) + P.SPECK_BLUR, eb = Math.min(P.EDGE * mn, P.EDGE_MM * ppm);
    const st = new Int32Array(cnt);
    x0 = w; y0 = h; x1 = -1; y1 = -1;
    for (let s = 0; s < N; s++) {
      if (mask[s] !== 1) continue;
      let top = 0, cx0 = w, cy0 = h, cx1 = -1, cy1 = -1, inner = false;
      st[top++] = s; mask[s] = 2;
      while (top) {
        const k = st[--top], y = (k / w) | 0, x = k - y * w;
        if (x < cx0) cx0 = x; if (x > cx1) cx1 = x; if (y < cy0) cy0 = y; if (y > cy1) cy1 = y;
        if (!inner && x >= eb && y >= eb && w - 1 - x >= eb && h - 1 - y >= eb) inner = true;
        for (let dy = y > 0 ? -1 : 0, ey = y < h - 1 ? 1 : 0; dy <= ey; dy++)
          for (let dx = x > 0 ? -1 : 0, ex = x < w - 1 ? 1 : 0; dx <= ex; dx++) {
            const j = k + dy * w + dx;
            if (mask[j] === 1) { mask[j] = 2; st[top++] = j; }
          }
      }
      if (!inner || (cx1 - cx0 + 1 <= sp && cy1 - cy0 + 1 <= sp)) continue;
      if (cx0 < x0) x0 = cx0; if (cx1 > x1) x1 = cx1; if (cy0 < y0) y0 = cy0; if (cy1 > y1) y1 = cy1;
    }
  }
  if (x1 < 0) return out("blank", { noisy, T, paper });

  // 6 เว้นขอบ  7 ดูดชิดขอบ  8 แปลงเป็นสัดส่วนของหน้าที่เห็น
  const p = Math.max(P.PAD * mn, P.PAD_MIN);
  let L = Math.max(0, x0 - p), Tp = Math.max(0, y0 - p), R = Math.min(vpW, x1 + 1 + p), B = Math.min(vpH, y1 + 1 + p);
  const sx = Math.max(P.SNAP * vpW, P.SNAP_MIN), sy = Math.max(P.SNAP * vpH, P.SNAP_MIN);
  let snapped = 0;
  if (L < sx) { L = 0; snapped++; }
  if (Tp < sy) { Tp = 0; snapped++; }
  if (vpW - R < sx) { R = vpW; snapped++; }
  if (vpH - B < sy) { B = vpH; snapped++; }
  if (snapped === 4) return out("full", { noisy, T, paper });
  const box = clampFrame({ x: L / vpW, y: Tp / vpH, w: (R - L) / vpW, h: (B - Tp) / vpH }, P.MIN_FRAME);
  return out("ok", { box, noisy, T, paper });
}

// รวมกรอบสัดส่วนสองกรอบ ตัวไหนเป็น null คืนอีกตัว (สำเนา)
export function unionBox(a, b) {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

// แกนเดียว: ตัดเข้า 0..1 ถ้าสั้นกว่า min ขยายรอบจุดกลาง ชนขอบแล้วเลื่อนเข้าใน
function axis(p, s, min) {
  if (s < 0) { p += s; s = -s; }
  const a = Math.min(1, Math.max(0, p)), b = Math.min(1, Math.max(0, p + s));
  if (b - a >= min) return [a, b - a];
  return [Math.min(1 - min, Math.max(0, (a + b) / 2 - min / 2)), min];
}

// กรอบสัดส่วนอยู่ในหน้า และกว้าง สูง อย่างน้อย min ต่อแกน (ไม่แก้กรอบที่ส่งเข้ามา)
export function clampFrame(f, min = TRIM.MIN_FRAME) {
  if (!f) return null;
  const lo = Math.min(1, Math.max(0, min)), [x, w] = axis(f.x, f.w, lo), [y, h] = axis(f.y, f.h, lo);
  return { x, y, w, h };
}
