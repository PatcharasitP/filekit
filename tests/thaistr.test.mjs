// ── หน่วยทดสอบ: ความยาวอักขระไทย (grapheme ≠ code unit) + negName/isNegName ──
//
// บั๊กจริงที่จับพลาด (คืนวันที่ 07-08/09): "ไม่".length === 3 ไม่ใช่ 2
// เพราะ "ไม่" = ไ + ม + ่ (สระ+พยัญชนะ+วรรณยุกต์ เป็นอักขระ UTF-16 แยกกันคนละหน่วย)
// โค้ดที่เคย hard-code `k.slice(2)` ตัดคำนำหน้า "ไม่" ออก จะเหลือ "่" (ไม้เอกลอย)
// ติดหัวคำที่เหลือ → คอลัมน์ที่ขึ้นต้นด้วย "ไม่" จับคู่ไม่ติดในจดหมายเวียน
//
// ของจริงที่ทดสอบอยู่ที่ src/docxmerge.js ใช้ `NEG_TH.length` (ไม่ hard-code เลข)
// อยู่แล้ว — เทสชุดนี้คือ "กันไม่ให้กลับไปเป็นแบบเดิม" (regression guard)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { negName, isNegName } from "../src/docxmerge.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

let pass = 0, fail = 0;
const F = [];
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : (fail++, F.push(`${name}\n      ได้    : ${JSON.stringify(got)}\n      ควรได้ : ${JSON.stringify(want)}`));
  console.log(`  ${ok ? "✅" : "❌"} ${name}`);
}
/** เหมือน eq() แต่ "ผ่าน" เมื่อค่า ผิด ไปจากที่คาด — ใช้พิสูจน์ว่าฟังก์ชันบั๊กจำลอง
 *  พังจริงตามที่คาด (ถ้ามันดันถูกโดยบังเอิญ แปลว่า self-test เส้นนี้เขียนผิด ต้องแก้) */
function notEq(name, got, wrongIfEqualTo) {
  const ok = JSON.stringify(got) !== JSON.stringify(wrongIfEqualTo);
  ok ? pass++ : (fail++, F.push(`${name}\n      ได้    : ${JSON.stringify(got)} (ไม่ควรเท่ากับค่านี้)`));
  console.log(`  ${ok ? "✅" : "❌"} ${name}`);
}

console.log("\n━━ ① negName / isNegName ของจริงจาก src/docxmerge.js ━━");
{
  eq('negName("ได้โบนัส") → เติม "ไม่" ข้างหน้า', negName("ได้โบนัส"), "ไม่ได้โบนัส");
  // ‼️ ตัวจับบั๊ก slice(2) โดยตรง — ถ้าโค้ดหลุดกลับไป hard-code เลข 2 บรรทัดนี้จะตกทันที
  //    (ค่าที่จะได้ตอนพัง คือ "่ได้โบนัส" มีไม้เอกลอยหน้าเดี่ยว ๆ)
  eq('negName("ไม่ได้โบนัส") → ตัด "ไม่" ออกครบ 3 หน่วย ไม่เหลือไม้เอกลอย', negName("ไม่ได้โบนัส"), "ได้โบนัส");
  eq('negName("Bonus") → เติม "not" + ขึ้นต้นตัวใหญ่', negName("Bonus"), "notBonus");
  eq('negName("notBonus") → ตัด "not" ออก', negName("notBonus"), "Bonus");
  eq('negName("not_bonus") → ตัด "not_" ออกทั้งตัวคั่น', negName("not_bonus"), "bonus");
  eq('isNegName("notes") → false (ห้าม match คำที่บังเอิญขึ้นต้นด้วย not)', isNegName("notes"), false);
  eq('isNegName("notBonus") → true', isNegName("notBonus"), true);
  eq('isNegName("ไม่ผ่าน") → true', isNegName("ไม่ผ่าน"), true);
}

console.log("\n━━ ② สมมติฐานความยาวอักษรไทย (ยืนยันด้วยค่าจริง ไม่เดา) ━━");
{
  eq('"ไม่".length === 3 (ไ+ม+ไม้เอก คนละหน่วย ไม่ใช่ 2)', "ไม่".length, 3);
  eq('[..."ไม่"] แยกได้ 3 ตัวอักษร', [..."ไม่"], ["ไ", "ม", "่"]);

  // ‼️ คำไทยอื่นที่มีสระ/วรรณยุกต์ซ้อนหลายชั้น — ยืนยันความยาวจริงก่อน แล้วเช็คว่า
  //    การตัดคำนำหน้า "ไม่" ออกจากคำที่ตามหลังคำเหล่านี้ ไม่ทำให้อักขระแหว่ง
  const words = [
    { w: "เพี้ยน", len: 6 },
    { w: "ทั้ง", len: 4 },
    { w: "ผู้", len: 3 },
  ];
  for (const { w, len } of words) {
    eq(`"${w}".length === ${len}`, w.length, len);
    const withPrefix = "ไม่" + w;
    eq(`negName("${withPrefix}") → ได้ "${w}" กลับมาครบ ไม่มีอักขระแหว่ง`, negName(withPrefix), w);
  }
}

console.log("\n━━ ③ self-test: พิสูจน์ว่า assertion ข้างบนจับบั๊ก slice(2) ได้จริง ━━");
{
  // ‼️ ห้ามแก้ src/docxmerge.js — จำลองฟังก์ชันบั๊กแบบเดียวกับที่เคยพังจริง
  //    (hard-code เลข 2 แทนที่จะใช้ "ไม่".length) เขียนแยกไว้ในไฟล์เทสเองล้วน ๆ
  const NEG_TH = "ไม่";
  function negName_buggy(k) {
    if (k.startsWith(NEG_TH)) return k.slice(2); // ← บั๊กจริงที่เคยเกิด
    return k;
  }
  eq(
    'self-test: negName_buggy("ไม่ได้โบนัส") ต้องพังตามที่คาด (ไม้เอกลอยติดหัวคำ)',
    negName_buggy("ไม่ได้โบนัส"),
    "่ได้โบนัส"
  );
  notEq(
    'self-test: negName_buggy ต้องไม่ได้ค่าที่ถูกต้อง (พิสูจน์ว่า assertion ข้อ ① แยกถูก/ผิดออกจากกันได้จริง ไม่ใช่ผ่านหลอก)',
    negName_buggy("ไม่ได้โบนัส"),
    "ได้โบนัส"
  );
  for (const { w } of [{ w: "เพี้ยน" }, { w: "ทั้ง" }, { w: "ผู้" }]) {
    const withPrefix = "ไม่" + w;
    notEq(
      `self-test: negName_buggy("${withPrefix}") ต้องแหว่ง ไม่เท่ากับ "${w}" ที่ถูกต้อง`,
      negName_buggy(withPrefix),
      w
    );
  }
}

console.log("\n━━ ④ สแกน src/**/*.js หา .slice(2)/.substring(2) ที่อยู่บรรทัดเดียวกับสตริงไทย ━━");
{
  // ‼️ นี่คือกฎกันไม่ให้มีใครกลับไป hard-code เลข 2 แบบเดิมที่อื่นในโค้ด (ไม่ใช่แค่ docxmerge.js)
  //    เกณฑ์: บรรทัดมี .slice(2) หรือ .substring(2) ตรง ๆ (ไม่ใช่ .slice(m[0].length) แบบที่ถูกต้อง)
  //    ร่วมกับมีอักขระไทย (U+0E00–U+0E7F) อยู่ในบรรทัดเดียวกัน
  const HARD_CODED_2 = /\.(?:slice|substring)\(\s*2\s*\)/;
  const THAI_CHAR = /[฀-๿]/;

  function scanFile(relPath, absPath) {
    const text = fs.readFileSync(absPath, "utf-8");
    const hits = [];
    text.split("\n").forEach((line, i) => {
      if (HARD_CODED_2.test(line) && THAI_CHAR.test(line)) {
        hits.push(`${relPath}:${i + 1}  ${line.trim()}`);
      }
    });
    return hits;
  }

  const srcDir = path.join(ROOT, "src");
  const jsFiles = fs
    .readdirSync(srcDir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".js"))
    .map((d) => path.join(d.parentPath || d.path, d.name));

  let allHits = [];
  for (const abs of jsFiles) {
    const rel = "src/" + path.relative(srcDir, abs).split(path.sep).join("/");
    allHits = allHits.concat(scanFile(rel, abs));
  }
  eq(`src/**/*.js (${jsFiles.length} ไฟล์) ไม่มี .slice(2)/.substring(2) hard-code คู่กับสตริงไทย`, allHits, []);
  if (allHits.length) console.log("     พบที่:\n" + allHits.map((h) => "       " + h).join("\n"));

  // self-test: พิสูจน์ว่าตัวสแกนเองจับได้จริงถ้ามีของแบบนี้อยู่ — ยิงใส่ "ไฟล์จำลอง" ในหน่วยความจำ
  // (ไม่แตะไฟล์จริงในดิสก์เลย) โดยเรียก logic เดียวกันตรง ๆ กับสตริงจำลอง
  const fakeLineGood = 'if (k.startsWith(NEG_TH)) return k.slice(NEG_TH.length); // ถูกต้อง ไม่ hard-code';
  const fakeLineBad = 'if (k.startsWith("ไม่")) return k.slice(2); // ตัด "ไม่" ออก — นี่คือบั๊ก';
  eq("self-test สแกนเนอร์: บรรทัดที่เขียนถูก (ใช้ .length) ต้องไม่ถูกจับ", HARD_CODED_2.test(fakeLineGood) && THAI_CHAR.test(fakeLineGood), false);
  eq("self-test สแกนเนอร์: บรรทัดที่ hard-code เลข 2 คู่สตริงไทย ต้องถูกจับ", HARD_CODED_2.test(fakeLineBad) && THAI_CHAR.test(fakeLineBad), true);
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`ผ่าน ${pass} · ตก ${fail}`);
if (fail) {
  console.log("\nรายการที่ตก:");
  F.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  process.exit(1);
}
