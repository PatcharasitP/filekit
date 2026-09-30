import { coverageLegend } from "../src/geokit.js";

let pass = 0; const F = [];
const ck = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : F.push(`${name}\n      ได้    : ${JSON.stringify(got)}\n      ควรได้ : ${JSON.stringify(want)}`);
  console.log(`  ${ok ? "✅" : "❌"} ${name}`);
};
const roles = (o) => coverageLegend(o).map((x) => x.role);

/* ชุดข้อมูล: จุดเดิม 3 จุด (0 อยู่ในวง 1 2 อยู่นอกวง) จุดใหม่ 2 จุด (3 อยู่ในวง มีต้นทาง, 4 อยู่นอกวง) */
const points = [
  { kind: "old" }, { kind: "old" }, { kind: "old" },
  { kind: "new", from: { lat: 1, lon: 1 } }, { kind: "new", from: { lat: 1, lon: 1 } },
];
const base = { points, covered: new Set([0, 3]), outMode: "dim", showNew: true, showLink: true, showCount: true };

console.log("\n━━ ① ค่าเริ่มต้น: ทุกชั้นเปิด ━━");
ck("ครบทุกรายการตามที่วาด", roles(base), ["center", "ring", "old", "new", "faded", "link", "count"]);

console.log("\n━━ ② ชั้นที่ปิด ต้องไม่โผล่ในคำอธิบาย ━━");
ck("ปิดจุดใหม่: ไม่มี new และไม่มี link (เส้นเชื่อมต้องมีจุดใหม่)", roles({ ...base, showNew: false }), ["center", "ring", "old", "faded", "count"]);
ck("ปิดเส้นเชื่อม", roles({ ...base, showLink: false }), ["center", "ring", "old", "new", "faded", "count"]);
ck("ปิดตัวเลข", roles({ ...base, showCount: false }), ["center", "ring", "old", "new", "faded", "link"]);
ck("จุดนอกวงโหมดซ่อน ไม่มีรายการจาง", roles({ ...base, outMode: "hide" }), ["center", "ring", "old", "new", "link", "count"]);
ck("จุดนอกวงโหมดเต็ม ไม่มีรายการจาง (วาดสีเต็มเหมือนในวง)", roles({ ...base, outMode: "full" }), ["center", "ring", "old", "new", "link", "count"]);

console.log("\n━━ ③ ข้อมูลไม่ครบ ━━");
ck("ไม่มีจุดใหม่เลย: ไม่มี new และไม่มี link", roles({ ...base, points: points.slice(0, 3), covered: new Set([0]) }), ["center", "ring", "old", "faded", "count"]);
ck("ทุกจุดอยู่ในวง: ไม่มีรายการจาง", roles({ ...base, covered: new Set([0, 1, 2, 3, 4]) }), ["center", "ring", "old", "new", "link", "count"]);
ck("จุดใหม่ที่อยู่นอกวงอย่างเดียว: ไม่มีเส้นเชื่อม (เส้นวาดเฉพาะจุดในวง)", roles({ ...base, covered: new Set([0]) }), ["center", "ring", "old", "new", "faded", "count"]);
ck("จุดใหม่ที่ไม่มีต้นทาง: ไม่มีเส้นเชื่อม", roles({ ...base, points: [{ kind: "old" }, { kind: "new" }], covered: new Set([0, 1]) }), ["center", "ring", "old", "new", "count"]);
ck("จุดที่เหลือนอกวงเป็นจุดใหม่ที่ถูกซ่อน: ไม่มีรายการจาง", roles({ ...base, showNew: false, points: [{ kind: "old" }, { kind: "new" }], covered: new Set([0]) }), ["center", "ring", "old", "count"]);

console.log(`\n${F.length ? "❌" : "✅"} ผ่าน ${pass} ข้อ ${F.length ? `ตก ${F.length} ข้อ` : ""}`);
if (F.length) { console.log("\n" + F.join("\n") + "\n"); process.exit(1); }
