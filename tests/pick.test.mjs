// เทส tests/pick.py ตัวเลือกชุดเทสจากไฟล์ที่แก้ (กติกาพี่ปอนด์เคาะ 26/09/2026)
// ‼️ เคสทั้งหมดเป็น commit จริงในประวัติของรีโปนี้ ไม่ได้แต่งไฟล์ขึ้นเอง
//    ตัวเลือกที่จัดไฟล์กลางผิดเป็น "เฉพาะที่เกี่ยว" อันตรายกว่าไม่มีตัวเลือก เพราะชุดที่ควรรันจะถูกข้ามเงียบ ๆ
//    ข้อ "ต้องเป็นชุดเต็ม" จึงสำคัญเท่ากับข้อ "ต้องเลือกเฉพาะที่เกี่ยว"
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const pick = (...args) => {
  const r = spawnSync("python3", [join(ROOT, "tests/pick.py"), ...args], { cwd: ROOT, encoding: "utf8" });
  return (r.stdout || "").trim();
};
const has = (c) => spawnSync("git", ["cat-file", "-e", c + "^{commit}"], { cwd: ROOT }).status === 0;

let pass = 0; const fail = [];
const ck = (ok, msg) => { if (ok) { pass++; console.log("  ✅ " + msg); } else { fail.push(msg); console.log("  ❌ " + msg); } };

const CASES = [
  // [commit, ชุดเต็มไหม, ชุดที่ต้องอยู่ในรายการ, คำอธิบาย]
  ["93c8844", true, [], "v173 แก้ src/app.js (ไฟล์กลาง) = ชุดเต็ม"],
  ["d50c0dc", true, [], "v172 แก้ src/registry.js และ sw.js เกินเลขเวอร์ชัน = ชุดเต็ม"],
  ["4ea3fc2", true, [], "v169 เครื่องมือใหม่ แตะ index.html กับ tests/lib = ชุดเต็ม"],
  ["568a77c", true, [], "v168 แก้ src/preview.js (ใช้ทุกเครื่องมือที่ดูไฟล์) = ชุดเต็ม"],
  ["2cc69ed", false, ["browser_findability", "browser_ux", "browser_perfbudget", "browser_smoke", "search.test.mjs"], "v174 แก้คำค้นสำรองคำเดียว = เฉพาะชุดค้นหา"],
  ["5318587", false, ["browser_pqcombine", "browser_smoke", "pqcombine.test.mjs"], "v171 แก้เครื่องมือ pq-combine ตัวเดียว = ชุดของมัน"],
  ["1be46af", false, ["browser_pqcombine"], "v170 แก้ pqcombine.js ที่เครื่องมือตัวเดียวใช้ + ไฟล์ทดสอบ = ชุดของมัน"],
  ["b364e63", false, ["browser_golink"], "v166 แก้หน้าลิงก์ย่อ go/ = ชุด golink"],
  ["d621174", false, ["browser_perfbudget"], "แก้เทสงบหน้าแรกอย่างเดียว = รันเทสนั้น"],
];

const known = CASES.filter(([c]) => has(c));
ck(known.length >= 6, `มี commit จริงให้เทสพอ (${known.length}/${CASES.length} ประชากรต้องไม่เป็นศูนย์)`);
for (const [c, full, must, why] of known) {
  const out = pick("--range", `${c}~1`, c);
  if (full) ck(out === "all", `${why} (ได้ ${out === "all" ? "ชุดเต็ม" : out.split(" ").length + " ชุด"})`);
  else {
    const got = out.split(/\s+/);
    const miss = must.filter((m) => !got.includes(m));
    ck(out !== "all" && !miss.length, `${why} (ได้ ${out === "all" ? "ชุดเต็ม" : got.length + " ชุด"}${miss.length ? " ขาด " + miss.join(", ") : ""})`);
    ck(got.includes("css_contract") && got.some((g) => g.endsWith(".test.mjs")), `${c} แบบเฉพาะที่เกี่ยวยังมีเทส node ทั้งหมดกับ css_contract`);
  }
}
// ข้อกำหนดแยกจากตัวเลือก: ไฟล์กลางแต่ละตัวแก้ตัวเดียวก็ต้องได้ชุดเต็ม (ตัดออกจากรายการในตัวเลือกแล้วข้อนี้ต้องแดง)
for (const f of ["src/app.js", "src/ui.js", "src/shell2.js", "src/dom.js", "src/workspace.js", "src/registry.js",
                 "src/i18n.js", "src/handoff.js", "src/inapp.js", "src/preview.js", "index.html", "sw.js",
                 "assets/css/tool2.css", "vendor/pdf-lib.min.js", "tests/runp.sh", "tests/pick.py"]) {
  ck(pick("--files", f) === "all", `แก้ ${f} ตัวเดียว = ชุดเต็ม`);
}
{
  const one = pick("--files", "src/tools/pdf-merge.js").split(/\s+/);
  // ‼️ เพดานคือจำนวนชุดทั้งหมดจริง ไม่ใช่เลขที่เดาไว้ (เคยตั้ง 60 เอง แล้วของจริงได้ 60 พอดีเพราะ pdf-merge ถูกพูดถึงในเทสเยอะ)
  const full = readdirSync(join(ROOT, "tests")).filter((f) => /^browser_.*\.py$/.test(f) || f.endsWith(".test.mjs")).length + 2;
  ck(!one.includes("all") && one.includes("browser_smoke") && one.length < full, `แก้เครื่องมือ pdf-merge ตัวเดียว = เฉพาะที่เกี่ยว (${one.length} จาก ${full} ชุด)`);
  const doc = pick("--files", "README.md").split(/\s+/);
  ck(!doc.includes("all") && !doc.includes("browser_smoke"), "แก้ README อย่างเดียว = เทส node ไม่ต้องเปิดเบราว์เซอร์ทุกเครื่องมือ");
  ck(pick("--files", "lab/new-idea.html") === "all", "ไฟล์ที่ตัวเลือกไม่รู้จัก = ชุดเต็ม (ไม่แน่ใจต้องรันครบ)");
}
if (has("d621174")) ck(!pick("--range", "d621174~1", "d621174").split(/\s+/).includes("browser_smoke"), "แก้แค่เทส ไม่ต้องเปิดทุกเครื่องมือ (ไม่มี browser_smoke)");
if (has("2cc69ed")) ck(pick("--check-sw", "2cc69ed~1", "2cc69ed") === "true", "sw.js ที่แก้แค่เลขเวอร์ชัน ไม่นับเป็นไฟล์กลาง");
if (has("d50c0dc")) ck(pick("--check-sw", "d50c0dc~1", "d50c0dc") === "false", "sw.js ที่แก้รายการ precache นับเป็นไฟล์กลาง");

console.log(`\nผ่าน ${pass} , ตก ${fail.length}`);
process.exit(fail.length ? 1 : 0);
