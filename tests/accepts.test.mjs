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

/* ‼️ ตัวเลขจำนวนเครื่องมือที่เขียนค้างไว้ในหน้า HTML
   เพิ่มเครื่องมือจาก 27 เป็น 29 แล้วลืมแก้ในหน้า → ผู้ใช้เห็น "27" แวบหนึ่งก่อน JS แก้เป็น 29
   และ meta ตอนแชร์ลิงก์ (og:description / JSON-LD) ยังโฆษณาเลขเก่าค้างอยู่
   (พี่ปอนด์เห็นเองตอน Ctrl+Shift+R 08/09/2026) */
const html = readFileSync(join(ROOT, "index.html"), "utf8");
// ‼️ นับจากไฟล์เครื่องมือจริง ไม่ใช่ regex id: ในทะเบียน — ทะเบียนมี id ของ "หมวด" ปนอยู่ด้วย
//    (เขียนครั้งแรกด้วย regex แล้วได้ 37 = 29 เครื่องมือ + 8 หมวด → เทสฟ้องผิดจุด)
const toolCount = toolFiles.length;
ck(toolCount > 0, `นับเครื่องมือได้ (${toolCount} ตัว — ประชากรต้องไม่เป็นศูนย์)`);

const factN = html.match(/id="fact-n"[^>]*>(\d+)</);
ck(!!factN && +factN[1] === toolCount,
   `ตัวเลขบนฉากเปิด (id="fact-n") ต้องเท่ากับจำนวนเครื่องมือจริง (หน้าเขียน ${factN ? factN[1] : "ไม่เจอ"} · จริง ${toolCount})`);

for (const [what, re] of [
  ["og:description", /property="og:description"[^>]*content="(\d+)/],
  ["og:image:alt", /property="og:image:alt"[^>]*content="[^"]*?(\d+) เครื่องมือ/],
  ["JSON-LD description", /"description":"(\d+) เครื่องมือ/],
]) {
  const m = html.match(re);
  ck(!!m && +m[1] === toolCount, `${what} ต้องบอกจำนวนเครื่องมือให้ตรง (หน้าเขียน ${m ? m[1] : "ไม่เจอ"} · จริง ${toolCount})`);
}

console.log(`\nผ่าน ${pass} · ตก ${fail.length}`);
process.exit(fail.length ? 1 : 0);
