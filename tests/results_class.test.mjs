// results_class.test.mjs  เครื่องมือที่วางแถบปุ่ม .actions (ZIP หรือดาวน์โหลดรวม) ลงกล่องผลลัพธ์ กล่องนั้นต้องมี class results
// ที่มา 07/11/2026 image-bg-remove สร้าง results = el("div", {}) แล้ว results.prepend(el("div", { class: "actions" }, [ZIP]))
// shell2 ย้ายเฉพาะ ".results > .actions" ไปแผงขวา ปุ่ม ZIP จึงค้างใต้ผืนงานที่ถูกบัง กดไม่ได้ (tests/browser_bgremove_zip.py)
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = process.env.FK_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "src/tools");
let pass = 0, fail = 0;
const bad = [];
let users = 0;
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".js"))) {
  const src = readFileSync(path.join(DIR, f), "utf8");
  // ตัวแปรที่ได้ .actions ใส่เข้าไป: X.prepend(el("div", { class: "actions" ... หรือ X.appendChild(el("div", { class: "actions"
  const re = /(\w+)\.(?:prepend|appendChild|append)\(el\("div", \{ class: "actions"/g;
  for (const m of src.matchAll(re)) {
    const v = m[1];
    const decl = src.match(new RegExp(`const ${v} = el\\("div", (\\{[^}]*\\})`));
    if (!decl) continue; // ไม่ได้ประกาศด้วย el ในไฟล์นี้ (เช่นตัวแปรภายใน) ไม่ใช่กล่องผลลัพธ์ระดับเครื่องมือ
    if (!/results/.test(v)) continue;
    users++;
    if (!/class: "[^"]*\bresults\b/.test(decl[1])) bad.push(`${f}: const ${v} = el("div", ${decl[1]})`);
  }
}
const ok = (name, cond, d = "") => { if (cond) { pass++; console.log("  ✅ " + name); } else { fail++; console.log("  ❌ " + name + (d ? "\n      " + d : "")); } };
console.log("━━ กล่องผลลัพธ์ที่มีแถบปุ่ม .actions ต้องมี class results ━━");
ok(`ตัวตรวจเจอเครื่องมือที่ใช้แบบนี้จริง (เจอ ${users} จุด)`, users >= 3, "ประชากรเป็น 0 แปลว่ารูปแบบที่ค้นไม่ตรงโค้ดแล้ว ตัวตรวจตาบอด");
ok("ทุกกล่องผลลัพธ์ที่มีแถบปุ่มมี class results", bad.length === 0, bad.join("\n      "));
console.log(`\nผ่าน ${pass} , ตก ${fail}`);
process.exit(fail ? 1 : 0);
