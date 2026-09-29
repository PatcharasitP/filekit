// สร้าง QR (src/qr.js) กับไลบรารีตัวจริงใน vendor/qrcode.js แล้วอ่านกลับด้วย jsQR (tests/lib/jsQR.cjs, Apache-2.0)
// ‼️ ค่าที่คาดทุกข้อวัดจากการรันจริง 29/09/2026 ไม่ได้คิดเอาเอง
// ‼️ QR_SRC ให้ชี้ไปโมดูลรุ่นที่ทำพังไว้ได้ ใช้ตอนพิสูจน์ว่าเทสแดงเป็น (red_proof)
import { createRequire } from "node:module";
import path from "node:path";
import url from "node:url";
const require = createRequire(import.meta.url);
const here = path.dirname(url.fileURLToPath(import.meta.url));
const lib = require(path.join(here, "../vendor/qrcode.js"));
const jsQR = require(path.join(here, "lib/jsQR.cjs"));
const src = process.env.QR_SRC ? url.pathToFileURL(path.resolve(process.env.QR_SRC)).href : "../src/qr.js";
const { makeQr, layout, qrToSvg, QrTooLong, LEVELS } = await import(src);

let pass = 0; const F = [];
const ck = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : F.push(`${name}\n      ได้    : ${JSON.stringify(got)}\n      ควรได้ : ${JSON.stringify(want)}`);
  console.log(`  ${ok ? "✅" : "❌"} ${name}`);
};
/* วาดตารางช่องเป็นพิกเซลขาวดำ ช่องละ 4 พิกเซล ขอบว่าง 4 ช่อง แล้วให้ jsQR อ่าน */
function read(dark, n) {
  const s = 4, m = 4, W = (n + m * 2) * s, d = new Uint8ClampedArray(W * W * 4).fill(255);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (dark(r, c))
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const i = (((r + m) * s + y) * W + (c + m) * s + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0;
    }
  const res = jsQR(d, W, W);
  return res ? res.data : null;
}
const roundTrip = (text, level) => { const q = makeQr(lib, text, level); return read(q.dark, q.n); };

const TH = "สวัสดีค่ะ ที่นี่ ญี่ปุ่น น้ำ ปั้น";
console.log("\n━━ ① ข้อความไทยอ่านกลับได้ตรงทุกระดับกันเสีย ━━");
for (const L of LEVELS) ck(`ระดับ ${L}`, roundTrip(TH, L), TH);

console.log("\n━━ ② ลิงก์ ข้อความผสม และอีโมจิ ━━");
ck("ลิงก์", roundTrip("https://patcharasitp.github.io/filekit/#/qr-code", "M"), "https://patcharasitp.github.io/filekit/#/qr-code");
ck("Wi-Fi ภาษาไทยปนตัวเลข", roundTrip("Wi-Fi ห้องประชุม 3 ชั้น 12", "Q"), "Wi-Fi ห้องประชุม 3 ชั้น 12");
ck("อีโมจิ (4 ไบต์)", roundTrip("นัดประชุม 📅 10:00", "M"), "นัดประชุม 📅 10:00");
ck("หลายบรรทัด", roundTrip("บรรทัดแรก\nบรรทัดสอง", "M"), "บรรทัดแรก\nบรรทัดสอง");

console.log("\n━━ ③ ความจุ (วัดจริง: อังกฤษ 2,953 ตัว ไทย 984 ตัว ที่ระดับ L) ━━");
ck("อังกฤษ 2,953 ตัวพอดีรุ่นใหญ่สุด 177 ช่อง", makeQr(lib, "a".repeat(2953), "L").n, 177);
const tooLong = (t, L) => { try { makeQr(lib, t, L); return "ใส่ได้"; } catch (e) { return e instanceof QrTooLong ? "ยาวเกิน" : "พังแบบอื่น " + e.message; } };
ck("อังกฤษ 2,954 ตัว บอกว่ายาวเกิน", tooLong("a".repeat(2954), "L"), "ยาวเกิน");
ck("ไทย 984 ตัวใส่ได้", tooLong("ก".repeat(984), "L"), "ใส่ได้");
ck("ไทย 985 ตัว บอกว่ายาวเกิน", tooLong("ก".repeat(985), "L"), "ยาวเกิน");
ck("ข้อความเดิมที่ระดับ H จุได้น้อยกว่า L", tooLong("ก".repeat(984), "H"), "ยาวเกิน");

console.log("\n━━ ④ ระดับกันเสียสูงขึ้น QR ใหญ่ขึ้น (ลิงก์ FileKit วัดจริง L 29, M 29, Q 33, H 37) ━━");
ck("จำนวนช่องต่อด้าน", LEVELS.map((L) => makeQr(lib, "https://patcharasitp.github.io/filekit/", L).n), [29, 29, 33, 37]);

console.log("\n━━ ⑤ ขนาดภาพ ช่องต้องเป็นจำนวนเต็มพิกเซล ━━");
ck("25 ช่อง ขอบ 4 ภาพไม่เกิน 512", layout(25, 512, 4), { unit: 15, px: 495, cells: 33 });
ck("ขอบว่างนับเข้าไปด้วย", layout(25, 512, 2), { unit: 17, px: 493, cells: 29 });

console.log("\n━━ ⑥ SVG ถอดกลับเป็นตารางช่องได้ตรงทุกช่อง และอ่านกลับได้ ━━");
const q = makeQr(lib, TH, "M");
const svg = qrToSvg(q, { margin: 4, fg: "#123456", bg: "#fafafa" });
const grid = Array.from({ length: q.n }, () => new Array(q.n).fill(false));
for (const m of svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-?\d+z/g)) {
  const x = +m[1] - 4, y = +m[2] - 4, w = +m[3];
  for (let i = 0; i < w; i++) grid[y][x + i] = true;
}
let diff = 0, darkN = 0;
for (let r = 0; r < q.n; r++) for (let c = 0; c < q.n; c++) { if (grid[r][c] !== q.dark(r, c)) diff++; if (q.dark(r, c)) darkN++; }
ck("มีช่องดำให้เทียบ (ประชากรไม่ว่าง)", darkN > 100, true);
ck("ช่องที่ไม่ตรงกัน", diff, 0);
ck("อ่านตารางจาก SVG กลับได้ข้อความเดิม", read((r, c) => grid[r][c], q.n), TH);
ck("สีจุดกับสีพื้นตามที่ตั้ง", [svg.includes('fill="#123456"'), svg.includes('fill="#fafafa"')], [true, true]);
ck("viewBox นับขอบว่างด้วย", svg.includes(`viewBox="0 0 ${q.n + 8} ${q.n + 8}"`), true);

console.log("\n" + "━".repeat(52));
console.log(`ผ่าน ${pass} ตก ${F.length}`);
if (F.length) { console.log("\nรายการที่ตก:"); F.forEach((f, i) => console.log(`  ${i + 1}. ${f}`)); process.exit(1); }
