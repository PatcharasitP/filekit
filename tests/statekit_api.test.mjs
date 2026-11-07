// เครื่องมือที่ใช้ stateKit ต้องเรียกเฉพาะฟังก์ชันที่ stateKit คืนให้จริง
// ที่มา 07/11/2026 ฟ้าไล่กดทุกปุ่มบนเว็บจริง v218: pq-to-date pq-group-concat pq-pick-date กด "คืนค่าเริ่มต้น" แล้ว error
// "state.clear is not a function" ปุ่มไม่ทำอะไร ผิดมาตั้งแต่ v100 ฟังก์ชันจริงชื่อ forget() เครื่องมืออื่นเรียกถูก
// ใช้: node tests/statekit_api.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0; const fail = [];
const ck = (ok, name) => { if (ok) { pass++; console.log("  ✅ " + name); } else { fail.push(name); console.log("  ❌ " + name); } };

// ฟังก์ชันที่ stateKit คืน อ่านจากบรรทัด return ของตัวจริง ไม่จดมือ (เพิ่มฟังก์ชันใหม่แล้วเทสตามเอง)
const kit = readFileSync(join(ROOT, "src/statekit.js"), "utf8");
const ret = [...kit.matchAll(/return \{([^}]*)\};/g)].map((m) => m[1]).find((b) => /\brestore\b/.test(b) && /\bsave\b/.test(b)) || "";
const API = new Set(ret.split(",").map((s) => s.split(":")[0].trim()).filter(Boolean));
ck(API.has("forget") && API.has("restore") && API.size >= 4, `อ่านรายชื่อฟังก์ชันของ stateKit ได้ (${[...API].join(" ")})`);

let files = 0;
for (const f of readdirSync(join(ROOT, "src/tools")).filter((n) => n.endsWith(".js"))) {
  const src = readFileSync(join(ROOT, "src/tools", f), "utf8");
  const vars = [...src.matchAll(/(\w+)\s*=\s*stateKit\(/g)].map((m) => m[1]);
  if (!vars.length) continue;
  files++;
  for (const v of new Set(vars)) {
    const used = [...src.matchAll(new RegExp(`\\b${v}\\.(\\w+)\\s*\\(`, "g"))].map((m) => m[1]);
    const bad = [...new Set(used.filter((u) => !API.has(u)))];
    ck(!bad.length, `${f}: ${v}.xxx() ที่เรียกมีอยู่จริงใน stateKit` + (bad.length ? ` (ไม่มี: ${bad.join(", ")})` : ""));
  }
}
ck(files >= 10, `เจอเครื่องมือที่ใช้ stateKit ${files} ตัว (ประชากรไม่ว่าง)`);

console.log(`\nผ่าน ${pass} , ตก ${fail.length}`);
process.exit(fail.length ? 1 : 0);
