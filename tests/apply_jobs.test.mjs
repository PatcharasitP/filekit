// apply_jobs.test.mjs  อุปกรณ์รวม (thai-suite) ใส่คอลัมน์ใหม่ของหลายงานในรอบเดียว ต้องได้ผังเดียวกับการต่อเครื่องมือทีละตัว
// ที่มา 07/11/2026 เส้นทางเดิมผ่านการ์ดทำต่อ 4 งาน กด 8 ครั้ง ได้ 4 ไฟล์ อุปกรณ์รวมต้องได้ไฟล์เดียวที่เหมือนไฟล์สุดท้ายของเส้นทางเดิม
globalThis.window = globalThis.window || globalThis;
globalThis.document = globalThis.document || { documentElement: { lang: "th" }, createElement: () => ({}) };
const { applyJobs } = await import("../src/sheetpick.js");
let pass = 0; const F = [];
const ck = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : F.push(`${n}\n      ได้    : ${JSON.stringify(got)}\n      ควรได้ : ${JSON.stringify(want)}`); console.log(`  ${ok ? "✅" : "❌"} ${n}`); };

const up = { outName: () => "UP", convert: (v) => (v == null || v === "" ? null : { ok: true, value: String(v).toUpperCase() }) };
const two = { outName: () => ["A1", "A2"], convert: (v) => (v === "x" ? { ok: false, reason: "อ่านไม่ออก" } : { ok: true, value: [v + "1", v + "2"] }), writeFail: true };
const len = { outName: () => "LEN", convert: (v) => ({ ok: true, value: String(v).length }) };
const table = { header: ["a", "b", "c"], rows: [["p", "q", "r"], ["x", "", "s"]] };

const r1 = applyJobs(table, [{ cfg: two, o: {}, c: 0 }, { cfg: up, o: {}, c: 2 }]);
ck("คอลัมน์ใหม่ต่อท้ายคอลัมน์ต้นทางของแต่ละงาน", r1.header, ["a", "A1", "A2", "b", "c", "UP"]);
ck("ค่าในแถวลงตรงตำแหน่ง", r1.rows[0], ["p", "p1", "p2", "q", "r", "R"]);
ck("แปลงไม่ได้ที่ writeFail เขียนเหตุผลลงช่องแรก ช่องที่เหลือว่าง", r1.rows[1].slice(0, 3), ["x", "อ่านไม่ออก", null]);
ck("ตำแหน่งคอลัมน์ใหม่ที่คืนมา", r1.added, [1, 2, 5]);
ck("นับผลต่องาน", r1.stats.map((s) => [s.ok, s.bad, s.skip]), [[1, 1, 0], [2, 0, 0]]);

const r2 = applyJobs(table, [{ cfg: up, o: {}, c: 1 }, { cfg: len, o: {}, c: 1 }]);
ck("สองงานใช้คอลัมน์เดียวกัน เรียงคอลัมน์ใหม่ตามลำดับงาน", r2.header, ["a", "b", "UP", "LEN", "c"]);
ck("ช่องว่างข้ามได้ ไม่นับเป็นผิด", [r2.rows[1][2], r2.stats[0].skip], [null, 1]);

const same = { outName: () => "a", convert: (v) => ({ ok: true, value: v }) };
ck("ชื่อหัวใหม่ซ้ำของเดิม ยังบอกตำแหน่งคอลัมน์ใหม่ถูก", applyJobs(table, [{ cfg: same, o: {}, c: 2 }]).added, [3]);
ck("ไม่แตะตารางต้นฉบับ", table.header, ["a", "b", "c"]);
// ‼️ 08/11/2026 ล่าบั๊ก F4: ไฟล์มีหัว ชื่อ กับ นามสกุล อยู่แล้ว แยกชื่อได้หัว ชื่อ นามสกุล ซ้ำสองคู่ Power Query PivotTable VLOOKUP สับสน
const name3 = { outName: () => ["คำนำหน้า", "ชื่อ", "นามสกุล"], convert: (v) => ({ ok: true, value: ["นาย", v, "ใจดี"] }) };
const tn = { header: ["รหัส", "ชื่อ", "นามสกุล"], rows: [["1", "สมชาย", "ใจดี"]] };
const r3 = applyJobs(tn, [{ cfg: name3, o: {}, c: 1 }]);
ck("หัวผลลัพธ์ไม่ซ้ำหัวเดิม", new Set(r3.header).size, r3.header.length);
ck("หัวที่ชนได้คำต่อท้าย (ใหม่) ส่วนหัวที่ไม่ชนคงเดิม", r3.header, ["รหัส", "ชื่อ", "คำนำหน้า", "ชื่อ (ใหม่)", "นามสกุล (ใหม่)", "นามสกุล"]);
const r4 = applyJobs(tn, [{ cfg: name3, o: {}, c: 1 }, { cfg: name3, o: {}, c: 2 }]);
ck("สองงานได้หัวชุดเดียวกัน ก็ยังไม่ซ้ำกันเอง", new Set(r4.header).size, r4.header.length);

console.log(`\nผ่าน ${pass} ตก ${F.length}`); if (F.length) { F.forEach((f) => console.log("  " + f)); process.exit(1); }
