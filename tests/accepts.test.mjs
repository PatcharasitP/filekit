/* ตรวจว่า accepts ในทะเบียน "ตรงกับของจริง" ที่เครื่องมือแต่ละตัวประกาศไว้ใน expect
 *
 * ทำไมต้องมี: หน้าแรกใช้ accepts เป็นตัวคัดว่า "ไฟล์ที่ลากมานี้ใช้กับเครื่องมือไหนได้บ้าง"
 * โดยไม่ต้องเปิดเครื่องมือ — ถ้าใครไปแก้ expect ในไฟล์เครื่องมือแล้วลืมแก้ทะเบียน
 * หน้าแรกจะเสนอเครื่องมือผิด (หรือไม่เสนอทั้งที่ใช้ได้) แบบเงียบ ๆ ไม่มีอะไรฟ้อง
 *
 * ตรวจแบบอ่านไฟล์ตรง ๆ ไม่ import — ทะเบียนพึ่ง localStorage ของเบราว์เซอร์อยู่ */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const list = (s) => s.split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);

// ตัดทะเบียนเป็นก้อน ๆ ที่ขึ้นต้นด้วย id:"..." แล้วอ่าน accepts ในก้อนนั้น
// (regex ก้อนเดียวยาว ๆ เคยกินข้ามรายการจนตกตัวแรกไป — ตัดตามตำแหน่ง id ชัวร์กว่า)
const reg = readFileSync(join(ROOT, "src/registry.js"), "utf8");
const marks = [...reg.matchAll(/\bid:\s*"([^"]+)"/g)];
const inRegistry = new Map();
marks.forEach((m, i) => {
  const chunk = reg.slice(m.index, i + 1 < marks.length ? marks[i + 1].index : reg.length);
  const a = chunk.match(/accepts:\s*\[([^\]]*)\]/);
  inRegistry.set(m[1], a ? list(a[1]) : null);
});

let pass = 0; const fail = [];
const ck = (ok, msg) => { if (ok) { pass++; console.log("  ✅ " + msg); } else { fail.push(msg); console.log("  ❌ " + msg); } };

const toolFiles = readdirSync(join(ROOT, "src/tools")).filter((f) => f.endsWith(".js"));
ck(toolFiles.length > 0, `หาไฟล์เครื่องมือเจอ (${toolFiles.length} ไฟล์ — ประชากรต้องไม่เป็นศูนย์)`);

for (const f of toolFiles.sort()) {
  const id = f.slice(0, -3);
  const src = readFileSync(join(ROOT, "src/tools", f), "utf8");
  const m = src.match(/expect:\s*\[([^\]]*)\]/);
  const real = m ? list(m[1]) : null;
  const declared = inRegistry.get(id);

  if (!inRegistry.has(id)) { ck(false, `${id} — มีไฟล์เครื่องมือแต่ไม่มีในทะเบียน`); continue; }
  if (!real) { ck(declared === null, `${id} — ไม่ได้ประกาศ expect จึงต้องไม่มี accepts ในทะเบียน`); continue; }
  ck(declared !== null, `${id} — มี expect แล้วต้องมี accepts ในทะเบียนด้วย`);
  if (declared) {
    ck(JSON.stringify(declared) === JSON.stringify(real),
       `${id} — accepts ตรงกับ expect จริง (ทะเบียน ${JSON.stringify(declared)} · จริง ${JSON.stringify(real)})`);
  }
}

console.log(`\nผ่าน ${pass} · ตก ${fail.length}`);
process.exit(fail.length ? 1 : 0);
