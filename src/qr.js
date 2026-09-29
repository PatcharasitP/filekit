// ── สร้าง QR จากข้อความ ────────────────────────────────────────────────────────
// ส่วนคำนวณล้วน ไม่แตะหน้าจอ รับตัวไลบรารี qrcode-generator เข้ามาเป็นพารามิเตอร์
// เพื่อให้ tests/qr.test.mjs ป้อนไลบรารีตัวเดียวกับ vendor/qrcode.js แล้วอ่านกลับด้วย jsQR ได้
//
// ‼️ ค่าเริ่มต้นของไลบรารีเก็บแค่ไบต์ล่างของแต่ละตัวอักษร (charCode & 0xff)
//   ข้อความไทยจึงอ่านกลับได้ขยะ พิสูจน์ 29/09/2026 ด้วย jsQR: ค่าเริ่มต้นเพี้ยน 4 จาก 6 เคส
//   (เพี้ยนทุกเคสที่มีไทย) ตั้ง UTF-8 แล้วตรงครบ 6 เคส จึงต้องตั้งทุกครั้งก่อนสร้าง

/** ระดับกันเสีย ยิ่งสูงยิ่งทนรอยเปื้อนหรือโลโก้ทับ แต่ QR ใหญ่ขึ้น */
export const LEVELS = ["L", "M", "Q", "H"];

export class QrTooLong extends Error {}

/**
 * สร้าง QR คืน { n, dark(r, c) } n คือจำนวนช่องต่อด้าน
 * ข้อความยาวเกินกว่ารุ่นใหญ่สุด (รุ่น 40) จะรับได้ โยน QrTooLong
 */
export function makeQr(lib, text, level = "M") {
  lib.stringToBytes = lib.stringToBytesFuncs["UTF-8"];
  const q = lib(0, LEVELS.includes(level) ? level : "M");
  try {
    q.addData(text, "Byte");
    q.make();
  } catch (e) {
    /* ไลบรารีโยนข้อความ code length overflow เมื่อเกินรุ่น 40 */
    if (/overflow|length/i.test(String(e && e.message || e))) throw new QrTooLong(String(e.message || e));
    throw e;
  }
  const n = q.getModuleCount();
  return { n, dark: (r, c) => q.isDark(r, c) };
}

/**
 * ขนาดช่องละกี่พิกเซลให้ได้ภาพไม่เกิน size ช่องต้องเป็นจำนวนเต็ม ไม่งั้นขอบช่องเบลอ อ่านยาก
 * margin คือขอบว่างรอบ QR นับเป็นช่อง มาตรฐานกำหนด 4
 */
export function layout(n, size, margin = 4) {
  const cells = n + margin * 2;
  const unit = Math.max(1, Math.floor(size / cells));
  return { unit, px: unit * cells, cells };
}

/** วาดลง canvas คืนขนาดจริงที่ได้ */
export function drawQr(canvas, qr, { size = 512, margin = 4, fg = "#000000", bg = "#ffffff" } = {}) {
  const { unit, px } = layout(qr.n, size, margin);
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = fg;
  for (let r = 0; r < qr.n; r++) {
    for (let c = 0; c < qr.n; c++) {
      if (qr.dark(r, c)) ctx.fillRect((c + margin) * unit, (r + margin) * unit, unit, unit);
    }
  }
  return px;
}

/**
 * SVG ขนาดเท่าไรก็คม ใช้กับงานพิมพ์และสไลด์
 * รวมช่องดำที่ติดกันในแถวเป็นเส้นเดียว ไฟล์เล็กกว่าวาดทีละช่องมาก
 */
export function qrToSvg(qr, { margin = 4, fg = "#000000", bg = "#ffffff" } = {}) {
  const cells = qr.n + margin * 2;
  let d = "";
  for (let r = 0; r < qr.n; r++) {
    let c = 0;
    while (c < qr.n) {
      if (!qr.dark(r, c)) { c++; continue; }
      const start = c;
      while (c < qr.n && qr.dark(r, c)) c++;
      d += `M${start + margin} ${r + margin}h${c - start}v1h${start - c}z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cells} ${cells}" shape-rendering="crispEdges">`
    + `<rect width="${cells}" height="${cells}" fill="${bg}"/><path d="${d}" fill="${fg}"/></svg>`;
}
