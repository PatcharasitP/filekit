/* เทสแกนหายอดที่บวกกันได้ (src/subsetsum.js)
 *
 * ‼️ ข้อที่แข็งแรงที่สุดคือข้อ ⑤: สุ่มชุดเล็ก ๆ แล้วเทียบกับการไล่ทุกชุดย่อยแบบดิบ (2^n)
 *    เพราะจุดที่พังง่ายที่สุดของอัลกอริทึมนี้คือ "การตัดกิ่ง" (prune) ที่เผลอตัดคำตอบจริงทิ้ง
 *    ซึ่งเป็นความผิดแบบเงียบ — โปรแกรมไม่ error แค่คืนคำตอบน้อยกว่าความจริง
 *    ถ้าตัดผิดเมื่อไร จำนวนชุดที่เจอจะน้อยกว่าของดิบทันที เทสจะแดง
 */
import { decimalsOf, toInt, fromInt, groupByValue, search } from "../src/subsetsum.js";

let pass = 0; const fail = [];
const ck = (ok, msg) => { if (ok) { pass++; console.log("  ✅ " + msg); } else { fail.push(msg); console.log("  ❌ " + msg); } };
const eq = (a, b, msg) => ck(JSON.stringify(a) === JSON.stringify(b), `${msg} — ได้ ${JSON.stringify(a)} ควรเป็น ${JSON.stringify(b)}`);

console.log("\n① อ่านตัวเลขเป็นจำนวนเต็ม (ห้ามผ่านทศนิยมลอย)");
eq(decimalsOf("257425.3"), 1, "ทศนิยม 1 ตำแหน่ง");
eq(decimalsOf("1,234"), 0, "ไม่มีทศนิยม");
eq(decimalsOf("-15673.46"), 2, "ค่าลบ 2 ตำแหน่ง");
eq(toInt("257425.3", 2), 25742530, "257425.3 → สตางค์");
eq(toInt("0.1", 2) + toInt("0.2", 2), toInt("0.3", 2), "0.1 + 0.2 = 0.3 เป๊ะ (จุดที่ทศนิยมลอยพัง)");
eq(toInt("-15673.46", 2), -1567346, "ค่าลบ");
eq(toInt("1,234.5", 2), 123450, "มีจุลภาคหลักพัน");
eq(toInt("0.999", 2), 100, "ทศนิยมยาวเกิน ต้องปัด ไม่ใช่ตัดทิ้ง");
eq(toInt("abc", 2), null, "ข้อความที่ไม่ใช่ตัวเลข");
eq(toInt("#N/A", 2), null, "ค่า #N/A ในไฟล์จริง");
eq(fromInt(25742530, 2), "257,425.30", "เขียนกลับพร้อมจุลภาค");
eq(fromInt(-1567346, 2), "-15,673.46", "เขียนกลับค่าลบ");

console.log("\n② ยุบค่าซ้ำเป็นก้อนเดียว");
{
  const g = groupByValue([{ row: 1, v: 100 }, { row: 2, v: 50 }, { row: 3, v: 100 }]);
  eq(g.map((x) => x.v), [100, 50], "เรียงมากไปน้อยและไม่ซ้ำ");
  eq(g[0].rows, [1, 3], "จำได้ว่าค่า 100 มาจากแถวไหนบ้าง");
}

console.log("\n③ เคสที่คำนวณด้วยมือได้ ต้องได้คำตอบตรงตามนั้น");
{
  const g = groupByValue([10, 20, 30, 40, 55].map((v, i) => ({ row: i + 1, v })));
  const r = search(g, 65, { maxCount: 4, maxResults: 50, timeMs: 0 });
  const sets = r.results.map((x) => x.picks.flatMap((p) => Array(p.times).fill(p.g.v)).sort((a, b) => a - b));
  // 65 = 10+55 = 10+20+35(ไม่มี) = 20+ 45(ไม่มี) = 10+20+30+5(ไม่มี)  → เหลือ 10+55 กับ 25+40(ไม่มี)
  eq(sets, [[10, 55]], "มีชุดเดียวคือ 10 + 55");
  eq(r.results[0].sum, 65, "ผลรวมตรงเป้า");
  eq(r.results[0].diff, 0, "ส่วนต่างเป็นศูนย์");
}
{
  const g = groupByValue([1, 2, 3].map((v, i) => ({ row: i + 1, v })));
  const r = search(g, 100, { maxCount: 3, timeMs: 0 });
  eq(r.results.length, 0, "ไม่มีทางรวมได้ = ต้องคืนศูนย์ชุด ไม่ใช่เดาให้");
  ck(r.exhausted === true, "ค้นจนหมดจริง (ไม่ได้หมดเวลาแล้วบอกว่าไม่มี)");
}

console.log("\n④ เงื่อนไขที่ผู้ใช้ปรับได้");
{
  const items = [5, 10, 15, 20, 25, 30].map((v, i) => ({ row: i + 1, v }));
  const g = groupByValue(items);
  const r2 = search(g, 45, { maxCount: 2, timeMs: 0, maxResults: 99 });
  const s2 = r2.results.map((x) => x.picks.flatMap((p) => Array(p.times).fill(p.g.v)).sort((a, b) => a - b));
  eq(s2, [[15, 30], [20, 25]], "จำกัดไม่เกิน 2 รายการ ได้เฉพาะคู่");
  const r3 = search(g, 45, { minCount: 3, maxCount: 3, timeMs: 0, maxResults: 99 });
  const s3 = r3.results.map((x) => x.picks.flatMap((p) => Array(p.times).fill(p.g.v)).sort((a, b) => a - b));
  eq(s3, [[5, 10, 30], [5, 15, 25], [10, 15, 20]], "บังคับ 3 รายการพอดี");
  // ค่าคลาดเคลื่อน ±2 : 44, 45, 46, 47 ควรเข้าเกณฑ์ด้วย
  const r4 = search(g, 46, { maxCount: 2, tol: 2, timeMs: 0, maxResults: 99 });
  ck(r4.results.some((x) => x.sum === 45), "ค่าคลาดเคลื่อน ±2 ทำให้ 45 เข้าเกณฑ์กับเป้า 46");
  ck(r4.results.every((x) => Math.abs(x.diff) <= 2), "ไม่มีชุดไหนเกินค่าคลาดเคลื่อนที่ตั้งไว้");
}
{
  // ค่าเดียวกันหลายแถว: 50 มี 3 แถว ต้องใช้ซ้ำได้ตามจำนวนแถวที่มีจริงเท่านั้น
  const g = groupByValue([{ row: 1, v: 50 }, { row: 2, v: 50 }, { row: 3, v: 50 }, { row: 4, v: 30 }]);
  const a = search(g, 150, { maxCount: 4, timeMs: 0 });
  eq(a.results.length, 1, "50 สามแถว รวมกันเป็น 150 ได้");
  const b = search(g, 200, { maxCount: 4, timeMs: 0 });
  eq(b.results.length, 0, "ไม่มีแถวที่สี่ให้ใช้ จึงทำ 200 ไม่ได้");
  const c = search(g, 150, { maxCount: 4, timeMs: 0, reuseValue: false });
  eq(c.results.length, 0, "ปิดการใช้ค่าซ้ำ = 50 ใช้ได้ครั้งเดียว ทำ 150 ไม่ได้");
}

console.log("\n⑤ เทียบกับการไล่ทุกชุดย่อยแบบดิบ (จุดที่จับ prune ผิดได้)");
{
  // สุ่มด้วยเมล็ดคงที่ เพื่อให้ผลเทสซ้ำได้เหมือนเดิมทุกครั้ง
  let seed = 20260915;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let rounds = 0, mismatches = 0;
  for (let round = 0; round < 60; round++) {
    const n = 8 + Math.floor(rnd() * 5);
    const hasNeg = round % 3 === 0;         // หนึ่งในสามรอบใส่ค่าติดลบด้วย
    const vals = Array.from({ length: n }, () => {
      const m = Math.floor(rnd() * 200) + 1;
      return hasNeg && rnd() < 0.3 ? -m : m;
    });
    const target = Math.floor(rnd() * 400) - (hasNeg ? 100 : 0);
    const maxCount = 2 + Math.floor(rnd() * 4);
    const tol = round % 5 === 0 ? Math.floor(rnd() * 5) : 0;

    // ดิบ: ไล่ทุกชุดย่อย 2^n แล้วนับชุดที่เข้าเกณฑ์ (ค่าซ้ำที่คนละแถว = คนละชุดของ "ค่า" หรือไม่?
    // แกนของเราคืนคำตอบเป็น "ชุดของค่า" จึงต้องยุบชุดที่ค่าเหมือนกันก่อนเทียบ)
    const brute = new Set();
    for (let mask = 1; mask < (1 << n); mask++) {
      let s = 0, c = 0; const picked = [];
      for (let i = 0; i < n; i++) if (mask & (1 << i)) { s += vals[i]; c++; picked.push(vals[i]); }
      if (c <= maxCount && Math.abs(s - target) <= tol) brute.add(picked.sort((a, b) => a - b).join(","));
    }
    const g = groupByValue(vals.map((v, i) => ({ row: i + 1, v })));
    const r = search(g, target, { maxCount, tol, timeMs: 0, maxResults: 100000 });
    const mine = new Set(r.results.map((x) => x.picks.flatMap((p) => Array(p.times).fill(p.g.v)).sort((a, b) => a - b).join(",")));

    rounds++;
    const missing = [...brute].filter((k) => !mine.has(k));
    const extra = [...mine].filter((k) => !brute.has(k));
    if (missing.length || extra.length) {
      mismatches++;
      console.log(`     รอบ ${round}: เป้า ${target} maxCount ${maxCount} tol ${tol} ค่า [${vals}]`);
      if (missing.length) console.log(`       ตกหล่น ${missing.length} ชุด เช่น ${missing.slice(0, 3).join(" | ")}`);
      if (extra.length) console.log(`       เกินมา ${extra.length} ชุด เช่น ${extra.slice(0, 3).join(" | ")}`);
    }
  }
  ck(rounds === 60, `ทดสอบครบ 60 รอบ (ประชากรต้องไม่เป็นศูนย์ — ได้ ${rounds})`);
  ck(mismatches === 0, `ผลตรงกับการไล่ดิบทุกรอบ (ไม่ตรง ${mismatches} รอบ)`);
}

console.log("\n⑥ ต้องหยุดตามเวลาที่กำหนด ไม่ค้างยาว");
{
  // ทุกค่าหารด้วย 7 ลงตัว เป้าหมายไม่ลงตัว = ไม่มีคำตอบ แต่ต้นไม้ค้นหาใหญ่มาก
  // จึงเป็นเคสที่ "ต้องไล่จนหมดเวลา" ของจริง ไม่ใช่เคสที่ตัดทิ้งได้ตั้งแต่ราก
  const vals = Array.from({ length: 400 }, (_, i) => (i + 1) * 7);
  const g = groupByValue(vals.map((v, i) => ({ row: i + 1, v })));
  const t0 = Date.now();
  const r = search(g, 28007, { maxCount: 12, timeMs: 300, maxResults: 1e9 });
  const ms = Date.now() - t0;
  ck(ms < 1500, `หยุดภายในเวลาที่ตั้งไว้ (ใช้จริง ${ms} ms)`);
  ck(r.stopped === true && r.exhausted === false, "บอกตรง ๆ ว่ายังค้นไม่หมด");
}

console.log(`\nสรุป: ผ่าน ${pass} ข้อ, ตก ${fail.length} ข้อ`);
if (fail.length) { fail.forEach((f) => console.log("  ❌ " + f)); process.exit(1); }
