import { isoOf, normProgress, guessGanttColumns, buildGanttRows } from "../src/ganttkit.js";

let pass = 0; const F = [];
const ck = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : F.push(`${name}\n      ได้    : ${JSON.stringify(got)}\n      ควรได้ : ${JSON.stringify(want)}`);
  console.log(`  ${ok ? "✅" : "❌"} ${name}`);
};

/* ‼️ ค่าที่คาดทุกตัวมาจากการรัน parseAnyDate ของเดิมจริง 30/09/2026 (ไม่ได้คิดในหัว)
     "01/07/2569" → y 2569 m 7 d 1 · "1 ก.ค. 69" → y 2569 guessedYear true · เลขซีเรียล 46204 → 2026-07-01
     "31/04/2569" และ "30/02/2568" → null · 2569 และ "07/2569" → ไม่มีวัน (m หรือ d เป็น null) */

console.log("\n━━ ① วันที่ทุกแบบต้องออกเป็น ISO ปี ค.ศ. ━━");
const SAME = ["2026-07-01", "01/07/2569", "1 ก.ค. 2569", "๑/๗/๒๕๖๙", 46204, new Date(2026, 6, 1)];
for (const v of SAME) ck(`${v instanceof Date ? "Date" : JSON.stringify(v)} เป็น 2026-07-01`, isoOf(v)?.iso, "2026-07-01");
ck("ปี 2 หลักเดาเป็น พ.ศ. และติดธง guessed", isoOf("1 ก.ค. 69"), { iso: "2026-07-01", guessed: true });
ck("ปีเต็มไม่ติดธง", isoOf("01/07/2569")?.guessed, false);

console.log("\n━━ ② ของที่ใช้เป็นวันเริ่ม/วันจบไม่ได้ ต้องได้ null ━━");
for (const v of ["31/04/2569", "30/02/2568", "abc", "", null, 2569, "07/2569"])
  ck(`${JSON.stringify(v)} เป็น null`, isoOf(v), null);

console.log("\n━━ ③ ความคืบหน้า ━━");
ck("0.45 เป็น 0.45", normProgress(0.45), 0.45);
ck("45 เป็น 0.45", normProgress(45), 0.45);
ck("'45%' เป็น 0.45", normProgress("45%"), 0.45);
ck("' 30 % ' เป็น 0.3", normProgress(" 30 % "), 0.3);
ck("1 คือเต็ม 100%", normProgress(1), 1);
ck("100 คือเต็ม 100%", normProgress(100), 1);
ck("0 ยังเป็น 0 ไม่หายเป็น null", normProgress(0), 0);
ck("ว่างเป็น null", normProgress(""), null);
ck("null เป็น null", normProgress(null), null);
ck("ข้อความมั่ว เป็น null", normProgress("เสร็จแล้ว"), null);
ck("เกิน 100 เป็น null ไม่ถูกตัดเงียบ", normProgress(250), null);
ck("ติดลบ เป็น null", normProgress(-5), null);

console.log("\n━━ ④ เดาคอลัมน์ ━━");
ck("หัวไทยตรงตัว", guessGanttColumns(["ชื่องาน", "เริ่ม", "สิ้นสุด", "เฟส", "% คืบหน้า"], []),
  { task: 0, start: 1, end: 2, group: 3, progress: 4 });
ck("หัวอังกฤษ", guessGanttColumns(["Task", "Start", "End", "Phase", "Progress"], []),
  { task: 0, start: 1, end: 2, group: 3, progress: 4 });
ck("‘วันเริ่มงาน’ ต้องเป็นวันเริ่ม ไม่ใช่ชื่องาน (คำว่างานอยู่ในทั้งสามหัว)",
  guessGanttColumns(["ชื่องาน", "วันเริ่มงาน", "วันสิ้นสุดงาน"], []),
  { task: 0, start: 1, end: 2, group: null, progress: null });
ck("‘ชื่องาน’ อยู่ท้ายสุด ก็ยังไม่ถูกแย่งไปเป็นวันเริ่มงาน (ลำดับคอลัมน์ไม่ตัดสินผล)",
  guessGanttColumns(["วันเริ่มงาน", "วันสิ้นสุดงาน", "ชื่องาน"], []),
  { task: 2, start: 0, end: 1, group: null, progress: null });
const noHint =[["ฐานราก", "01/07/2569", "20/07/2569"], ["เสา", "15/07/2569", "10/08/2569"]];
ck("หัวไม่บอกอะไร ใช้ดูว่าคอลัมน์ไหนเป็นวันที่", guessGanttColumns(["A", "B", "C"], noHint),
  { task: 0, start: 1, end: 2, group: null, progress: null });

console.log("\n━━ ⑤ สร้างแถวสำหรับกราฟ ━━");
const header = ["งาน", "เริ่ม", "จบ", "เฟส", "คืบหน้า"];
const table = {
  header,
  rows: [
    ["ฐานราก", "01/07/2569", "20/07/2569", "โครงสร้าง", 1],
    ["เสา คาน", "15/07/2569", "10/08/2569", "โครงสร้าง", "60%"],
    ["งานวันเดียว", "05/08/2569", "05/08/2569", "", ""],
    ["", "01/08/2569", "02/08/2569", "ผนัง", 0],
    ["วันจบก่อนวันเริ่ม", "20/08/2569", "10/08/2569", "ผนัง", 0.2],
    ["วันที่พิมพ์ผิด", "31/04/2569", "10/05/2569", "ผนัง", 0.2],
    ["ไม่มีวันจบ", "01/09/2569", null, "ผนัง", 0.2],
  ],
};
const cols = guessGanttColumns(header, table.rows);
const out = buildGanttRows(table, cols);
ck("แถวที่ใช้ได้ 3 แถว (ประชากรไม่ว่าง)", out.rows.length, 3);
ck("แถวแรก", out.rows[0], { Task: "ฐานราก", Start: "2026-07-01", End: "2026-07-20", Group: "โครงสร้าง", Progress: 1 });
ck("60% เป็น 0.6", out.rows[1].Progress, 0.6);
ck("งานวันเดียว (เริ่ม=จบ) ยังอยู่ และไม่มี Group กับ Progress", out.rows[2], { Task: "งานวันเดียว", Start: "2026-08-05", End: "2026-08-05" });
ck("แถวที่ข้าม พร้อมเลขบรรทัดในไฟล์ (หัว = บรรทัด 1) และเหตุผล", out.skipped, [
  { line: 5, reason: "no-task" },
  { line: 6, reason: "end-before-start" },
  { line: 7, reason: "bad-start" },
  { line: 8, reason: "bad-end" },
]);
ck("ไม่มีปีเดา จึงไม่ติดธง", out.guessed, 0);
const g = buildGanttRows({ header, rows: [["ก", "1 ก.ค. 69", "5 ก.ค. 69", "", ""]] }, cols);
ck("ปี 2 หลักนับเป็นแถวที่เดา", g.guessed, 1);
ck("ไม่มีคอลัมน์กลุ่ม ก็ไม่ใส่ Group", buildGanttRows(table, { ...cols, group: null, progress: null }).rows[0],
  { Task: "ฐานราก", Start: "2026-07-01", End: "2026-07-20" });

console.log(`\n${F.length ? "❌" : "✅"} ganttkit: ผ่าน ${pass} ข้อ${F.length ? `, ตก ${F.length} ข้อ\n\n` + F.join("\n") : ""}`);
process.exit(F.length ? 1 : 0);
