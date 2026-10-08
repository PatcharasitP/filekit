// ทุกไฟล์เทสในโฟลเดอร์ tests ต้องถูกตัวรันชุดเต็มเรียก หรืออยู่ในรายการยกเว้นที่บอกเหตุผล (08/10/2026)
// ‼️ ที่มา: tests/pdf_middot.py กับ tests/theme_schema.py เป็นเทสจริงที่ผ่าน แต่ชื่อไม่ขึ้นต้นด้วย browser_
//    runp.sh all กับ run.sh all เลยไม่เคยเรียก ถ้าวันหนึ่งมันแดงจะไม่มีใครเห็น (งานรอ 03/10/2026)
// ตรวจ
//   ① ทุกไฟล์ .py และ .test.mjs ใน tests/ ถูก runp.sh all เรียก หรืออยู่ใน HELPERS
//   ② ทุกไฟล์ .py ที่ runp.sh all เรียก run.sh all ก็เรียกด้วย (สองตัวรันต้องรู้จักชุดเดียวกัน)
//   ③ ไฟล์ใน HELPERS ต้องมีอยู่จริง (กันรายการยกเว้นค้างหลังลบไฟล์)
//   ④ ตัวควบคุมเชิงลบ: ใส่ชื่อเทสปลอมเข้าไปในรายการไฟล์ ตัวตรวจต้องจับได้
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const T = join(ROOT, "tests");

// ไม่ใช่เทส: ตัวช่วยหรือเครื่องมือที่รันมือครั้งเดียว
const HELPERS = {
  "fkui.py": "ตัวช่วยกลางของเทสเบราว์เซอร์ ถูก import",
  "gzip_server.py": "เซิร์ฟเวอร์บีบอัดให้ browser_perf",
  "pick.py": "ตัวเลือกชุดเทสจากไฟล์ที่แก้ เทสของมันคือ pick.test.mjs",
  "pdflib_swap.py": "เครื่องมือเทียบผลก่อนและหลังสลับ pdf-lib รันมือครั้งเดียว 21/09/2026",
};

let pass = 0; const fail = [];
const ck = (ok, msg, detail) => {
  if (ok) { pass++; console.log("  ✅ " + msg); }
  else { fail.push(msg); console.log("  ❌ " + msg + (detail ? "  → " + JSON.stringify(detail) : "")); }
};

// ดึงบรรทัด ls ในบล็อก all ของตัวรัน แล้วแปลง glob เป็น regex
function allPatterns(runner) {
  const src = readFileSync(join(T, runner), "utf8");
  const block = src.slice(src.indexOf('if [ "${1:-}" = "all" ]'), src.indexOf("fi", src.indexOf('if [ "${1:-}" = "all" ]')));
  const globs = [...block.matchAll(/tests\/([\w.*-]+)/g)].map((m) => m[1]);
  if (/\bcontract\b/.test(block.replace(/css_contract/g, ""))) globs.push("contract.sh");
  return globs.map((g) => new RegExp("^" + g.replace(/\./g, "\\.").replace(/\*/g, "[^/]*") + "$"));
}
const covered = (pats, f) => pats.some((re) => re.test(f));
const isTestFile = (f) => /\.py$/.test(f) || /\.test\.mjs$/.test(f);

function uncovered(files, pats) {
  return files.filter((f) => isTestFile(f) && !HELPERS[f] && !covered(pats, f));
}

const files = readdirSync(T);
const pp = allPatterns("runp.sh"), rp = allPatterns("run.sh");
const miss = uncovered(files, pp);
ck(miss.length === 0 && pp.length > 0, `① ไฟล์เทสทุกไฟล์ถูก runp.sh all เรียก (รูปแบบ ${pp.length} ตัว)`, miss);
const pyRun = files.filter((f) => f.endsWith(".py") && !HELPERS[f] && covered(pp, f));
const missRun = pyRun.filter((f) => !covered(rp, f));
ck(missRun.length === 0 && pyRun.length > 0, `② run.sh all เรียกเทส python ชุดเดียวกับ runp.sh (${pyRun.length} ไฟล์)`, missRun);
const gone = Object.keys(HELPERS).filter((f) => !existsSync(join(T, f)));
ck(gone.length === 0, "③ ไฟล์ในรายการยกเว้นมีอยู่จริงทุกไฟล์", gone);
const fake = uncovered([...files, "zz_new_check.py", "zz_new.test.mjs"], pp);
ck(fake.includes("zz_new_check.py") && !fake.includes("zz_new.test.mjs"),
   "④ ตัวควบคุมเชิงลบ: เทส python ชื่อใหม่ที่ไม่มีใครเรียกต้องถูกจับ ส่วน .test.mjs ถูก glob ครอบอยู่แล้ว", fake);

console.log(`\n${fail.length ? "❌ ตก " + fail.length + " ข้อ" : "✅ ผ่านครบ " + pass + " ข้อ"}`);
process.exit(fail.length ? 1 : 0);
