// ── ตาบอดสี + ระยะห่างของสีแบบที่ตามนุษย์รับรู้จริง ─────────────────────────
//
// ที่มา: PBI_THEME_PLAYBOOK บท TH3 (พิสูจน์ไว้ 31/08/2026) ระบุว่า
//   "เพดานตาบอดสี (คำนวณ CIEDE2000 ทุกภาวะ): 5 series คือ max ที่แยกออกครบ
//    8 สีที่แยกครบทุกภาวะเป็นไปไม่ได้ทางคณิตศาสตร์"
// ไฟล์นี้คือการยกการคำนวณนั้นมาไว้ในเบราว์เซอร์ เพื่อเตือนตอนคนกำลังเลือกสีธีม
// ไม่ใช่ไปรู้ทีหลังตอนรายงานขึ้นจอแล้วคนตาบอดสีอ่านไม่ออก
//
// ‼️ ทำไมต้องเป็น CIEDE2000 ไม่ใช่ระยะห่างใน RGB ตรง ๆ
//    RGB ห่างเท่ากันไม่ได้แปลว่าตาเห็นต่างเท่ากัน เขียวสองเฉดที่ห่างกัน 40 ใน RGB
//    อาจแยกไม่ออกเลย ส่วนน้ำเงินกับม่วงที่ห่างแค่ 20 กลับแยกออกชัด
//    CIEDE2000 เป็นสูตรมาตรฐาน CIE ที่ชดเชยเรื่องนี้ไว้แล้ว
//
// ‼️ การจำลองตาบอดสีใช้เมทริกซ์ Brettel-Viénot-Mollon ซึ่งเป็นวิธีที่อ้างอิงกันทั่วไป
//    เป็นการประมาณ ไม่ใช่การจำลองสายตาของคนจริงทุกคน ใช้เพื่อ "เตือน" ไม่ใช่ตัดสินแทน

/* ── แปลงสี ───────────────────────────────────────────────────────────── */
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function hexToRgb(hex) {
  const h = String(hex || "").trim().replace(/^#/, "");
  const s = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
}
const toHex2 = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
export const rgbToHex = ({ r, g, b }) => "#" + [r, g, b].map((v) => toHex2(v / 255)).join("");

/* sRGB → linear และกลับ (ต้องถอด gamma ก่อนคำนวณทุกอย่างที่เกี่ยวกับแสง) */
const toLin = (u) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
const toSrgb = (u) => (u <= 0.0031308 ? u * 12.92 : 1.055 * clamp01(u) ** (1 / 2.4) - 0.055);

/** sRGB (0-255) → CIE Lab (D65) */
export function rgbToLab({ r, g, b }) {
  const R = toLin(r / 255), G = toLin(g / 255), B = toLin(b / 255);
  // sRGB → XYZ (D65)
  const x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
  const y = (R * 0.2126729 + G * 0.7151522 + B * 0.0721750) / 1.00000;
  const z = (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const fx = f(x), fy = f(y), fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export const hexToLab = (hex) => { const c = hexToRgb(hex); return c ? rgbToLab(c) : null; };

/**
 * ระยะห่างของสีสองสีตามสูตร CIEDE2000
 *
 * ‼️ สูตรนี้คัดลอกโครงมาจากนิยามของ CIE ตรง ๆ ห้ามปรับค่าคงที่เอง
 *    ตรวจความถูกต้องด้วยสมบัติที่ต้องจริงเสมอ (ดู tests/cvd.test.mjs)
 *      ① ระยะของสีกับตัวเองต้องเป็น 0 พอดี
 *      ② สลับที่แล้วต้องได้เท่าเดิม
 *      ③ ต่างกันแค่ความสว่าง 1 หน่วยที่ L=50 ต้องได้ 1.0 พอดี (เพราะ SL=1 ตรงจุดนั้น)
 *      ④ คู่อ้างอิงมาตรฐานของ Sharma: (50,0,0) กับ (50,-1,2) = 2.3669
 * @returns {number} ยิ่งมากยิ่งแยกออกง่าย โดยทั่วไป 1 คือเส้นแบ่งที่ตาเริ่มเห็นต่าง
 */
export function deltaE00(lab1, lab2) {
  const { L: L1, a: a1, b: b1 } = lab1, { L: L2, a: a2, b: b2 } = lab2;
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hp = (b, ap) => { if (b === 0 && ap === 0) return 0; const h = Math.atan2(b, ap) * deg; return h < 0 ? h + 360 : h; };
  const hp1 = hp(b1, ap1), hp2 = hp(b2, ap2);

  const dLp = L2 - L1;
  const dCp = Cp2 - Cp1;
  let dhp = 0;
  if (Cp1 * Cp2 !== 0) {
    const d = hp2 - hp1;
    dhp = d > 180 ? d - 360 : d < -180 ? d + 360 : d;
  }
  const dHp = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dhp / 2) * rad);

  const Lbar = (L1 + L2) / 2;
  const Cpbar = (Cp1 + Cp2) / 2;
  let hpbar;
  if (Cp1 * Cp2 === 0) hpbar = hp1 + hp2;
  else {
    const d = Math.abs(hp1 - hp2);
    hpbar = d > 180 ? (hp1 + hp2 + (hp1 + hp2 < 360 ? 360 : -360)) / 2 : (hp1 + hp2) / 2;
  }

  const T = 1 - 0.17 * Math.cos((hpbar - 30) * rad) + 0.24 * Math.cos(2 * hpbar * rad)
            + 0.32 * Math.cos((3 * hpbar + 6) * rad) - 0.20 * Math.cos((4 * hpbar - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hpbar - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpbar ** 7 / (Cpbar ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lbar - 50) ** 2) / Math.sqrt(20 + (Lbar - 50) ** 2);
  const SC = 1 + 0.045 * Cpbar;
  const SH = 1 + 0.015 * Cpbar * T;
  const RT = -Math.sin(2 * dTheta * rad) * Rc;

  return Math.sqrt(
    (dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH)
  );
}

export const deltaEHex = (h1, h2) => {
  const a = hexToLab(h1), b = hexToLab(h2);
  return a && b ? deltaE00(a, b) : NaN;
};

/* ── จำลองภาวะตาบอดสี ──────────────────────────────────────────────────
   เมทริกซ์ Brettel-Viénot-Mollon ทำงานบนค่า linear ไม่ใช่ค่า sRGB ดิบ
   ‼️ ใส่ค่า sRGB เข้าไปตรง ๆ จะได้สีที่ผิดไปมาก เพราะ gamma ยังไม่ถูกถอด */
const CVD_MATRIX = {
  protanopia:   [[0.170556992, 0.829443014, 0], [0.170556991, 0.829443008, 0], [-0.004517144, 0.004517144, 1]],
  deuteranopia: [[0.33066007, 0.66933993, 0], [0.33066007, 0.66933993, 0], [-0.02785538, 0.02785538, 1]],
  tritanopia:   [[1, 0.1273989, -0.1273989], [0, 0.8739093, 0.1260907], [0, 0.8739093, 0.1260907]],
};
export const CVD_TYPES = Object.keys(CVD_MATRIX);

/** แปลงสีหนึ่งสีให้เป็นสีที่คนภาวะนั้นเห็น */
export function simulate(hex, type) {
  const c = hexToRgb(hex);
  const M = CVD_MATRIX[type];
  if (!c || !M) return hex;
  const v = [toLin(c.r / 255), toLin(c.g / 255), toLin(c.b / 255)];
  const out = M.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
  return "#" + out.map((u) => toHex2(toSrgb(u))).join("");
}

/**
 * ตรวจว่าชุดสีนี้แยกออกจากกันได้กี่สี ในภาวะสายตาที่แย่ที่สุด
 *
 * ‼️ เกณฑ์ที่ใช้: คู่ไหนมีระยะห่าง CIEDE2000 ต่ำกว่า minDelta ถือว่า "แยกไม่ออก"
 *    ค่า 10 มาจากงานวิจัยของเราเอง (TH3) ที่สรุปว่าแดง 4 ระดับต้องห่าง >= 15
 *    จึงตั้ง 10 เป็นเส้นเตือนที่หลวมกว่านั้นเล็กน้อย เพื่อไม่ให้เตือนพร่ำเพรื่อ
 * @returns {{worst:string, pairs:Array, maxSafe:number}}
 *   pairs = คู่ที่แยกไม่ออก พร้อมภาวะและระยะห่าง
 *   maxSafe = จำนวนสีแรกที่ยังแยกออกครบทุกคู่ในทุกภาวะ
 */
export function checkPalette(colors, minDelta = 10) {
  const list = (colors || []).filter((c) => hexToRgb(c));
  const pairs = [];
  let worst = "", worstD = Infinity;

  for (const type of CVD_TYPES) {
    const sim = list.map((c) => hexToLab(simulate(c, type)));
    for (let i = 0; i < sim.length; i++) {
      for (let j = i + 1; j < sim.length; j++) {
        const d = deltaE00(sim[i], sim[j]);
        if (d < worstD) { worstD = d; worst = type; }
        if (d < minDelta) pairs.push({ i, j, type, delta: d, a: list[i], b: list[j] });
      }
    }
  }
  /* ‼️ maxSafe คือ "ใช้ได้กี่สีแรก" ไม่ใช่ "มีกี่สีที่โอเค"
     เพราะคนอ่านกราฟเห็นทุกสีพร้อมกัน สีที่ 6 ชนกับสีที่ 2 ก็พังทั้งชุด */
  let maxSafe = list.length;
  for (const p of pairs) maxSafe = Math.min(maxSafe, p.j);
  return { worst, worstDelta: worstD === Infinity ? null : worstD, pairs, maxSafe };
}
