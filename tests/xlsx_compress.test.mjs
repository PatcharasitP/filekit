// ไฟล์ Excel ที่เว็บเขียนออกต้องบีบอัด (08/11/2026 ล่าบั๊ก F3)
// ที่มา: thai-suite ข้อมูล 50,000 แถว ได้ไฟล์ 55,657,452 ไบต์ ชีทข้างในเป็นแบบไม่บีบ (stored)
//        ต้นฉบับเดียวกันบีบแล้วเหลือ 1.47 MB ส่งอีเมลไม่ได้ เปิดช้า
//        SheetJS ไม่บีบให้เองถ้าไม่ส่ง compression: true ทุกจุดที่เรียก XLSX.write จึงต้องส่งเอง
// ① ไล่ทุกจุดที่เรียก XLSX.write ใน src ต้องมี compression: true ในวงเล็บเดียวกัน
// ② เขียนไฟล์จริงด้วย SheetJS ชุดเดียวกับเว็บ แบบที่ส่งค่านี้ ต้องได้ชีทบีบ (method 8) และเล็กกว่าแบบไม่ส่ง
// ใช้: node tests/xlsx_compress.test.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let pass = 0; const F = [];
const ck = (name, ok, d = "") => { ok ? pass++ : F.push(`${name}  [${d}]`); console.log(`  ${ok ? "✅" : "❌"} ${name}${ok ? "" : "  [" + d + "]"}`); };

// ① สแกนโค้ด
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); f.isDirectory() ? walk(p) : p.endsWith(".js") && files.push(p); } })(path.join(ROOT, "src"));
const calls = [];
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  for (let i = s.indexOf("XLSX.write("); i >= 0; i = s.indexOf("XLSX.write(", i + 1)) {
    let depth = 0, j = i + "XLSX.write".length;
    for (; j < s.length; j++) { if (s[j] === "(") depth++; else if (s[j] === ")" && --depth === 0) break; }
    calls.push({ at: path.relative(ROOT, f) + ":" + s.slice(0, i).split("\n").length, args: s.slice(i, j + 1) });
  }
}
ck("ประชากร: เจอจุดเรียก XLSX.write ในโค้ดอย่างน้อย 9 จุด", calls.length >= 9, calls.length);
const miss = calls.filter((c) => !/compression\s*:\s*true/.test(c.args)).map((c) => c.at);
ck("ทุกจุดที่เขียน xlsx ส่ง compression: true", miss.length === 0, miss.join(" "));

// ② ไฟล์จริง
const ctx = { console }; ctx.window = ctx; ctx.self = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "vendor/xlsx.full.min.js"), "utf8"), ctx);
const XLSX = ctx.XLSX;
const aoa = [["ชื่อ", "ที่อยู่", "ยอด"], ...Array.from({ length: 5000 }, (_, i) => ["นายสมชาย ใจดี " + i, "55/7 ถนนสุขุมวิท แขวงคลองเตยเหนือ เขตวัฒนา กรุงเทพมหานคร 10110", i * 1.5])];
const book = () => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "S"); return wb; };
const plain = new Uint8Array(XLSX.write(book(), { bookType: "xlsx", type: "array" }));
const packed = new Uint8Array(XLSX.write(book(), { bookType: "xlsx", type: "array", compression: true }));
// วิธีบีบของชีทแรก อ่านจาก local file header ของ zip (ลายเซ็น PK\x03\x04 , method อยู่ที่ไบต์ 8-9)
function methodOf(u8, name) {
  for (let i = 0; i + 30 < u8.length; i++) {
    if (u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 3 && u8[i + 3] === 4) {
      const n = u8[i + 26] | (u8[i + 27] << 8);
      const fn = Buffer.from(u8.subarray(i + 30, i + 30 + n)).toString();
      if (fn === name) return u8[i + 8] | (u8[i + 9] << 8);
    }
  }
  return null;
}
ck("ประชากร: ไม่ส่งค่า ชีทเป็นแบบไม่บีบ (method 0) ตามที่วัดเจอ", methodOf(plain, "xl/worksheets/sheet1.xml") === 0, methodOf(plain, "xl/worksheets/sheet1.xml"));
ck("ส่ง compression: true ชีทบีบแบบ deflate (method 8)", methodOf(packed, "xl/worksheets/sheet1.xml") === 8, methodOf(packed, "xl/worksheets/sheet1.xml"));
ck("ไฟล์ที่บีบเล็กกว่าไม่ถึงหนึ่งในสามของแบบไม่บีบ", packed.length * 3 < plain.length, `${packed.length} กับ ${plain.length}`);
const back = XLSX.read(packed, { type: "array" });
const rows = XLSX.utils.sheet_to_json(back.Sheets.S, { header: 1 });
ck("ไฟล์ที่บีบอ่านกลับได้ครบทุกแถว", rows.length === aoa.length && rows[5000][0] === aoa[5000][0], rows.length);

console.log("\n" + "━".repeat(52));
console.log(`ผ่าน ${pass} · ตก ${F.length}`);
if (F.length) process.exit(1);
