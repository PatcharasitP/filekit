// results_host.test.mjs · กล่อง .results ของเครื่องมือแบบ workspace ต้องอยู่ใน ws.body ไม่ใช่ ws.wrap
// 09/11/2026 เทสมือถือจนได้ไฟล์: pdf-page-numbers วางไว้ที่ ws.wrap ซึ่งอยู่นอกพื้นที่ที่ shell2 ย้ายแถวผลลัพธ์เข้าหน้าผลลัพธ์
// แถวเดิมจึงค้างก้นจอซ้ำกับปุ่มดาวน์โหลดใหญ่ และบน iPhone 15 กับ Pixel 7 การ์ด ทำอะไรต่อดี ทับปุ่มจนกดไม่ได้
// หลักฐาน .claude/evidence/2026-11-09-fk-e2e/pagenum/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "tools");
const files = readdirSync(DIR).filter((f) => f.endsWith(".js"));

test("ประชากร: เจอเครื่องมือที่วาง results ด้วย ws.body อย่างน้อย 5 ตัว (กันตัวตรวจอ่านไม่เจออะไรแล้วผ่านหลอก)", () => {
  const n = files.filter((f) => /ws\.body\.(appendChild|append)\(\s*results\b/.test(readFileSync(join(DIR, f), "utf8"))).length;
  assert.ok(n >= 5, `เจอ ${n} ตัว`);
});

test("ไม่มีเครื่องมือไหนวาง results ไว้ที่ ws.wrap", () => {
  const bad = files.filter((f) => /ws\.wrap\.(appendChild|append)\(\s*results\b/.test(readFileSync(join(DIR, f), "utf8")));
  assert.deepEqual(bad, []);
});
