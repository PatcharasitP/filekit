/* เทสตรรกะจัดกลุ่มตัวเลขเป็นช่วง (src/binkit.js)
 *
 * ‼️ สองข้อที่แข็งแรงที่สุดในไฟล์นี้
 *   ข้อ ⑨ — เทียบกับตัวคำนวณดิบที่เขียนคนละวิธี (ไล่ทีละช่วงตรง ๆ) บนข้อมูลสุ่ม 300 รอบ
 *            ถ้าขอบบน "รวม" หรือ "ไม่รวม" เพี้ยนแม้แถวเดียวจะจับได้ทันที เพราะเป็นความผิดแบบเงียบ
 *   ข้อ ⑩ — ล็อกรายตัวแล้วลำดับต้องไม่พัง ทั้งแบบล็อกไปหมวดเดิมและหมวดใหม่
 *            (นี่คือสิ่งที่พี่ปอนด์สั่งไว้ตรง ๆ ว่า "ล็อกแล้วต้องไม่ทำให้ลำดับการเรียงพัง")
 */
import {
  toNum, readValues, decimalsIn, quantile, niceNumber, roundTo,
  roundBreaks, equalBreaks, quantileBreaks, naturalBreaks, suggestBreaks, cleanBreaks,
  autoLabels, binIndexOf, assign, distribution, histogram, genM, genSQL, genDAX,
} from "../src/binkit.js";

let pass = 0; const fail = [];
const ck = (ok, msg) => { if (ok) { pass++; console.log("  ✅ " + msg); } else { fail.push(msg); console.log("  ❌ " + msg); } };
const eq = (a, b, msg) => ck(JSON.stringify(a) === JSON.stringify(b), `${msg} — ได้ ${JSON.stringify(a)} ควรเป็น ${JSON.stringify(b)}`);

console.log("\n① อ่านค่าหนึ่งช่องเป็นตัวเลข");
eq(toNum(12), 12, "ตัวเลขล้วน");
eq(toNum("1,234.50"), 1234.5, "มีจุลภาคหลักพัน");
eq(toNum("(1,234)"), -1234, "วงเล็บแบบงบการเงิน = ติดลบ");
eq(toNum("๑๒๓"), 123, "เลขไทย");
eq(toNum(" 45 "), 45, "มีช่องว่างหน้าหลัง");
eq(toNum("12%"), 12, "มีเครื่องหมายเปอร์เซ็นต์");
eq(toNum("฿2,500"), 2500, "มีสัญลักษณ์เงินบาท");
eq(toNum("-0.5"), -0.5, "ค่าลบทศนิยม");
eq(toNum("1e3"), 1000, "รูปแบบยกกำลัง");
eq(toNum("abc"), null, "ข้อความ");
eq(toNum("#N/A"), null, "ค่าผิดพลาดจาก Excel");
eq(toNum(""), null, "ช่องว่าง");
eq(toNum(null), null, "ค่า null");
eq(toNum(true), null, "ค่า boolean ไม่ใช่ตัวเลข (กัน true กลายเป็น 1 เงียบ ๆ)");
eq(toNum("12-15"), null, "ช่วงที่พิมพ์ติดกันอ่านไม่ออก ต้องไม่เดาเป็น 12");

console.log("\n② อ่านทั้งคอลัมน์ ต้องบอกด้วยว่าอ่านไม่ออกกี่แถว");
{
  const r = readValues([1, "2", "", null, "abc", "3.5", "  ", "#REF!"]);
  eq(r.nums, [1, 2, 3.5], "ได้เฉพาะที่อ่านออก");
  eq(r.blank, 3, "ว่าง 3 แถว");
  eq(r.badRows.map((b) => b.raw), ["abc", "#REF!"], "อ่านไม่ออก 2 แถว และจำค่าดิบไว้บอกผู้ใช้");
  eq(r.total, 8, "นับแถวทั้งหมดไว้");
  eq(decimalsIn(r.nums), 1, "ทศนิยมมากสุด 1 ตำแหน่ง");
  eq(decimalsIn([1, 2, 3]), 0, "จำนวนเต็มล้วน");
}

console.log("\n③ ตัวช่วยตัวเลข");
eq(quantile([10, 20, 30, 40], 0.5), 25, "ค่ากลางของ 4 ตัว = กึ่งกลาง 20 กับ 30");
eq(quantile([1, 2, 3, 4, 5], 0.5), 3, "ค่ากลางของ 5 ตัว = ตัวกลางจริง");
eq(quantile([5], 0.9), 5, "มีค่าเดียว");
eq(niceNumber(20, "up"), 20, "20 เป็นเลขกลมอยู่แล้ว");
eq(niceNumber(17, "up"), 20, "17 ปัดขึ้นเป็น 20");
eq(niceNumber(23, "up"), 25, "23 ปัดขึ้นเป็น 25");
eq(niceNumber(0.7, "up"), 1, "ต่ำกว่าหนึ่งก็ต้องได้เลขกลม");
eq(roundTo(0.1 + 0.2, 2), 0.3, "ปัดเศษทศนิยมลอยให้เรียบร้อย");

console.log("\n④ ค่าหนึ่งค่าตกกลุ่มไหน (ขอบบนรวมเสมอ ต้องตรงกับ fnBinNumber ที่ใช้งานจริงอยู่)");
{
  const B = [0, 5, 10, 15, 20];
  eq(binIndexOf(0, B), 0, "ค่า 0 อยู่กลุ่มแรก");
  eq(binIndexOf(3, B), 1, "ค่า 3 อยู่กลุ่มที่สอง");
  eq(binIndexOf(5, B), 1, "ค่า 5 เท่ากับจุดตัด ต้องอยู่กลุ่มล่าง ไม่ใช่กลุ่มบน");
  eq(binIndexOf(6, B), 2, "ค่า 6 ขึ้นกลุ่มถัดไป");
  eq(binIndexOf(15, B), 3, "ค่า 15 เท่ากับจุดตัด อยู่กลุ่มล่าง");
  eq(binIndexOf(21, B), 5, "ค่าเกินจุดตัดสุดท้าย อยู่กลุ่มบนสุด");
  eq(binIndexOf(4.5, B), 1, "ทศนิยมกลางช่วง");
  eq(binIndexOf(-3, B), 0, "ค่าติดลบอยู่กลุ่มแรก");
}

console.log("\n⑤ ป้ายอัตโนมัติ");
eq(autoLabels([0, 5, 10, 15, 20]), ["≤ 0", "1-5", "6-10", "11-15", "16-20", "> 20"],
  "ชุดเดียวกับ Aging SLA ที่ใช้อยู่จริง");
eq(autoLabels([5, 20], { unit: " วัน" }), ["≤ 5 วัน", "6-20 วัน", "> 20 วัน"], "ต่อหน่วยท้ายป้าย");
eq(autoLabels([0, 5], { whole: false }), ["≤ 0", "> 0 ถึง 5", "> 5"],
  "ข้อมูลมีทศนิยมต้องใช้ป้ายแบบช่วงแท้ ไม่งั้น 4.5 อ่านไม่ออกว่าอยู่กลุ่มไหน");
eq(autoLabels([1000, 5000]), ["≤ 1,000", "1,001-5,000", "> 5,000"], "ใส่จุลภาคหลักพันให้อ่านง่าย");
eq(autoLabels([2.5, 7.5], { whole: false, decimals: 1 }), ["≤ 2.5", "> 2.5 ถึง 7.5", "> 7.5"], "ทศนิยมตามที่สั่ง");
eq(autoLabels([5, 20], { lang: "en", whole: false }), ["≤ 5", "> 5 to 20", "> 20"], "โหมดอังกฤษใช้ to ไม่ใช่คำไทย");

console.log("\n⑥ สี่วิธีเสนอจุดตัด (คิดคำตอบด้วยมือทุกข้อ)");
{
  const zeroTo100 = Array.from({ length: 101 }, (_, i) => i);
  eq(roundBreaks(zeroTo100, 5), [20, 40, 60, 80], "เลขกลม: ช่วง 0 ถึง 100 ขอ 5 กลุ่ม ได้ขั้นละ 20");
  eq(roundBreaks([0, 17], 2), [10], "เลขกลม: 0 ถึง 17 ขอ 2 กลุ่ม ขั้น 8.5 ปัดขึ้นเป็น 10");
  eq(equalBreaks([0, 100], 4), [25, 50, 75], "กว้างเท่ากัน: แบ่ง 4 ช่วงพอดี");
  eq(quantileBreaks([10, 20, 30, 40], 2), [25], "จำนวนเท่ากัน: ครึ่งบนครึ่งล่างตัดที่ค่ากลาง 25");
  eq(quantileBreaks([1, 1, 1, 1, 100], 2), [1], "จำนวนเท่ากัน: ข้อมูลกองที่ค่าเดียว ขอบก็ต้องเป็นค่านั้น");
  eq(naturalBreaks([1, 2, 3, 100, 101, 102], 2), [3],
    "ช่องว่างธรรมชาติ: ข้อมูล 2 กระจุกห่างกันมาก ต้องตัดตรงรอยต่อจริงคือ 3");
  eq(naturalBreaks([1, 2, 3, 50, 51, 52, 200, 201], 3), [3, 52],
    "ช่องว่างธรรมชาติ: 3 กระจุก ตัด 2 จุดตรงรอยต่อ");
  eq(suggestBreaks([], "round", 5), [], "ไม่มีข้อมูลก็ต้องไม่ระเบิด");
  eq(suggestBreaks([7, 7, 7], "round", 4), [], "ค่าเท่ากันหมด ไม่มีจุดตัดที่มีความหมาย");
  eq(suggestBreaks([1, 2, 3], "natural", 10), [1, 2], "ขอกลุ่มมากกว่าค่าที่มี ต้องตัดเท่าที่มีจริง");
  eq(cleanBreaks(["10", 5, "5", "abc", 20]), [5, 10, 20], "จุดตัดที่พิมพ์เองเรียงและตัดซ้ำให้");
}

console.log("\n⑦ ทุกวิธีต้องคืนจุดตัดที่ 'เรียงแล้ว ไม่ซ้ำ และอยู่ในช่วงข้อมูลจริง'");
{
  const data = [3, 7, 7, 9, 12, 12, 12, 40, 55, 61, 78, 91, 140, 260, 260, 900];
  let bad = 0;
  for (const m of ["round", "quantile", "natural", "equal"]) {
    for (let k = 2; k <= 8; k++) {
      const b = suggestBreaks(data, m, k);
      const sorted = b.every((v, i) => i === 0 || v > b[i - 1]);
      const inside = b.every((v) => v >= Math.min(...data) - 1e-9 && v < Math.max(...data));
      if (!sorted || !inside) { bad++; console.log(`     ${m} k=${k} → ${JSON.stringify(b)}`); }
    }
  }
  ck(bad === 0, `ครบ 4 วิธี × 7 ขนาดกลุ่ม ไม่มีชุดไหนผิดกติกา (ผิด ${bad} ชุด)`);
}

console.log("\n⑧ จัดกลุ่มแล้วต้องได้ป้ายและเลขเรียงคู่กันเสมอ");
{
  const rows = [0, 3, 5, 6, 15, 20, 21, null, 4.5, "abc"].map((v, i) => ({ key: "R" + i, value: v }));
  const a = assign(rows, { breaks: [0, 5, 10, 15, 20] });
  eq(a.rows.map((r) => r.band),
    ["≤ 0", "1-5", "1-5", "6-10", "11-15", "16-20", "> 20", "ไม่มีข้อมูล", "1-5", "ไม่มีข้อมูล"],
    "ป้ายตรงทุกแถว");
  eq(a.rows.map((r) => r.sort), [1, 2, 2, 3, 4, 5, 6, 0, 2, 0], "เลขเรียงตรงทุกแถว ค่าว่างได้ 0");
  eq(a.blankCount, 1, "นับค่าว่าง");
  eq(a.badCount, 1, "นับค่าที่อ่านไม่ออกแยกจากค่าว่าง");
  eq(a.rows[9].num, null, "ค่าที่อ่านไม่ออกเก็บเป็น null ไม่ใช่ 0");

  // หัวใจของเครื่องมือ: ป้ายเป็นข้อความ เรียงตามตัวอักษรแล้วผิด แต่เลขเรียงต้องถูก
  const labs = ["≤ 0", "1-5", "6-10", "11-15", "16-20", "> 20"];
  const byText = [...labs].sort();
  ck(byText.indexOf("11-15") < byText.indexOf("6-10"),
    "ยืนยันปัญหาจริง: เรียงป้ายตามตัวอักษรแล้ว 11-15 มาก่อน 6-10 (นี่คือเหตุผลที่ต้องมีคอลัมน์เลขเรียง)");
  const bySort = labs.map((l, i) => ({ l, s: i + 1 })).sort((x, y) => x.s - y.s).map((x) => x.l);
  eq(bySort, labs, "เรียงด้วยเลขเรียงแล้วได้ลำดับที่ถูกต้อง");
}

console.log("\n⑨ เทียบกับตัวคำนวณดิบที่เขียนคนละวิธี บนข้อมูลสุ่ม 300 รอบ");
{
  // ตัวดิบ: ไล่ทีละช่วงตรง ๆ ตามนิยาม ไม่ใช้ List.Count เหมือนของจริง
  const refIndex = (v, B) => {
    if (v <= B[0]) return 0;
    for (let i = 1; i < B.length; i++) if (v > B[i - 1] && v <= B[i]) return i;
    return B.length;
  };
  let mismatch = 0, rounds = 0, seed = 20260916;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let r = 0; r < 300; r++) {
    const n = 5 + Math.floor(rnd() * 40);
    const vals = Array.from({ length: n }, () => roundTo(rnd() * 200 - 20, rnd() < 0.5 ? 0 : 2));
    const k = 2 + Math.floor(rnd() * 6);
    const m = ["round", "quantile", "natural", "equal"][Math.floor(rnd() * 4)];
    const B = suggestBreaks(vals, m, k);
    if (!B.length) continue;
    rounds++;
    const a = assign(vals.map((v, i) => ({ key: "K" + i, value: v })), { breaks: B });
    for (let i = 0; i < vals.length; i++) {
      const want = refIndex(vals[i], B);
      if (a.rows[i].sort !== want + 1) {
        mismatch++;
        if (mismatch <= 3) console.log(`     รอบ ${r}: ค่า ${vals[i]} จุดตัด ${JSON.stringify(B)} ได้กลุ่ม ${a.rows[i].sort - 1} ควรเป็น ${want}`);
      }
    }
  }
  ck(rounds > 250, `ประชากรทดสอบต้องไม่เป็นศูนย์ (ทดสอบจริง ${rounds} รอบ)`);
  ck(mismatch === 0, `ทุกแถวตรงกับตัวคำนวณดิบ (ไม่ตรง ${mismatch} แถว)`);
}

console.log("\n⑩ ล็อกรายตัว (manual) — ต้องชนะจุดตัด และต้องไม่ทำให้ลำดับพัง");
{
  const rows = [
    { key: "SKA1029", value: 2 },     // ตัวเลขน้อย แต่สั่งล็อกไปกลุ่มบนสุด
    { key: "AYA1017", value: 30 },
    { key: "CBI1006", value: 3 },
    { key: "NMA1024", value: 99 },    // สั่งล็อกไปหมวดใหม่ที่ไม่มีในชุดช่วง
    { key: "HYI1035", value: 7 },
    { key: "PKT1002", value: null },  // ค่าว่าง แต่ถูกล็อกไว้ ต้องได้หมวดที่ล็อก ไม่ใช่ "ไม่มีข้อมูล"
  ];
  const breaks = [5, 20];                       // ป้าย: ≤ 5 · 6-20 · > 20
  const overrides = { SKA1029: "> 20", NMA1024: "เฝ้าระวัง", PKT1002: "เฝ้าระวัง" };
  const a = assign(rows, { breaks, overrides });

  eq(a.labels, ["≤ 5", "6-20", "> 20"], "ชุดป้ายปกติ 3 กลุ่ม");
  eq(a.extras, ["เฝ้าระวัง"], "หมวดพิเศษที่เกิดจากการล็อก");
  eq(a.rows.map((r) => r.band), ["> 20", "> 20", "≤ 5", "เฝ้าระวัง", "6-20", "เฝ้าระวัง"], "ป้ายถูกทุกแถว");
  eq(a.rows[0].sort, 3, "ล็อกไปหมวดที่มีอยู่แล้ว ต้องได้เลขเรียงของหมวดนั้น (3) ไม่ใช่เลขใหม่");
  eq(a.rows[1].sort, 3, "แถวที่ตกกลุ่มเดียวกันตามตัวเลขจริง ได้เลขเดียวกับแถวที่ถูกล็อก");
  eq(a.rows[3].sort, 4, "หมวดใหม่ต่อท้ายชุดเดิม");
  eq(a.rows[5].sort, 4, "อีกแถวที่ล็อกหมวดใหม่เดียวกัน ต้องได้เลขเดียวกันเสมอ");
  eq(a.rows[5].band, "เฝ้าระวัง", "ค่าว่างที่ถูกล็อก ต้องอยู่หมวดที่ล็อก ไม่ตกไปกลุ่มไม่มีข้อมูล");
  eq(a.lockedCount, 3, "นับจำนวนที่ถูกล็อกไว้บอกผู้ใช้");
  eq(a.rows.filter((r) => r.locked).map((r) => r.key), ["SKA1029", "NMA1024", "PKT1002"], "บอกได้ว่าแถวไหนถูกล็อก");

  // ลำดับรวมต้องยังเรียงได้ถูกต้อง ไม่มีเลขซ้ำข้ามหมวด และไม่มีหมวดไหนได้ 0 นอกจากค่าว่าง
  const pairs = [...new Map(a.rows.map((r) => [r.band, r.sort])).entries()];
  eq(pairs.sort((x, y) => x[1] - y[1]).map((p) => p[0]), ["≤ 5", "6-20", "> 20", "เฝ้าระวัง"],
    "เรียงด้วยเลขเรียงแล้วได้ลำดับที่ตั้งใจ หมวดพิเศษอยู่ท้ายสุด");
  ck(new Set(pairs.map((p) => p[1])).size === pairs.length, "ไม่มีสองหมวดที่ใช้เลขเรียงเดียวกัน");

  // สั่งลำดับหมวดพิเศษเองได้
  const b = assign(rows, { breaks, overrides, extraOrder: ["เฝ้าระวัง", "ยกเว้น"] });
  eq(b.extras, ["เฝ้าระวัง", "ยกเว้น"], "หมวดที่ประกาศไว้ล่วงหน้าติดมาด้วยแม้ยังไม่มีแถวไหนใช้");
}

console.log("\n⑪ สรุปการกระจาย ต้องนับครบทุกแถว ไม่มีแถวหาย");
{
  const vals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, null, "x"];
  const a = assign(vals.map((v, i) => ({ key: i, value: v })), { breaks: [3, 7] });
  const d = distribution(a);
  eq(d.map((x) => [x.label, x.count]),
    [["≤ 3", 3], ["4-7", 4], ["> 7", 3], ["ไม่มีข้อมูล", 2]], "นับแต่ละกลุ่มถูก");
  eq(d.reduce((s, x) => s + x.count, 0), 12, "ผลรวมทุกกลุ่มเท่ากับจำนวนแถวทั้งหมด");
  eq(d[0].pct, 25, "ร้อยละของกลุ่มแรก");
  eq([d[0].min, d[0].max], [1, 3], "ค่าจริงต่ำสุดและสูงสุดในกลุ่ม");
  eq(d[3].min, null, "กลุ่มไม่มีข้อมูลไม่มีค่าต่ำสุด");
}

console.log("\n⑫ ฮิสโตแกรม");
{
  const h = histogram([1, 1, 2, 2, 2, 3, 10], 4);
  eq(h.bins.length, 4, "ได้จำนวนช่องตามที่ขอ");
  eq(h.bins.reduce((s, b) => s + b.count, 0), 7, "นับครบทุกค่า");
  eq(h.max, 10, "ค่าสูงสุดถูก");
  eq(h.bins[3].count, 1, "ค่าสูงสุดตกช่องสุดท้าย ไม่ล้นออกไป");
  const flat = histogram([5, 5, 5], 10);
  eq(flat.bins.length, 1, "ค่าเท่ากันหมด เหลือช่องเดียว ไม่หารศูนย์");
}

console.log("\n⑬ โค้ดที่ก๊อปไปใช้ต่อ ต้องใส่ค่าจริงและหนีอักขระถูก");
{
  const code = genM({
    column: "ระยะทาง (กม.)", keyColumn: "SITE_CODE",
    breaks: [5, 20], labels: ["≤ 5", "6-20", "> 20"],
    overrides: { SKA1029: "เฝ้าระวัง" }, extras: ["เฝ้าระวัง"],
  });
  ck(code.includes("Breaks = {5, 20}"), "จุดตัดลงในโค้ดจริง");
  ck(code.includes('Labels = {"≤ 5", "6-20", "> 20", "เฝ้าระวัง"}'), "ป้ายรวมหมวดพิเศษ เรียงตรงกับเลขเรียง");
  ck(code.includes('#"SKA1029" = "เฝ้าระวัง"'), "รายการล็อกอยู่ในโค้ด");
  ck(code.includes('Record.FieldOrDefault(_, "SITE_CODE", "")'), "อ้างคอลัมน์คีย์ที่เลือกไว้");
  ck(code.includes('"ระยะทาง (กม.) Band"') && code.includes('"ระยะทาง (กม.) Band Sort"'), "ตั้งชื่อคอลัมน์ผลลัพธ์จากชื่อคอลัมน์จริง");
  ck(code.includes("v > b"), "ใช้กติกาขอบบนรวมเหมือนกันทุกที่");

  const q = genM({ column: 'ค่า"พิเศษ"', breaks: [1], labels: ['a"b', "c"] });
  ck(q.includes('"a""b"'), "ป้ายที่มีอัญประกาศถูกหนีเป็นสองตัวตามไวยากรณ์ M");

  const noKey = genM({ column: "x", breaks: [1], labels: ["a", "b"], overrides: { A: "z" } });
  ck(noKey.includes("lock = null,"), "ล็อกรายตัวโดยไม่เลือกคอลัมน์คีย์ ต้องไม่สร้างโค้ดที่อ้างคอลัมน์ลอย ๆ");

  const sql = genSQL({ column: "DISTANCE_KM", keyColumn: "SITE_CODE", breaks: [5, 20], labels: ["≤ 5", "6-20", "> 20"], overrides: { SKA1029: "เฝ้าระวัง" }, extras: ["เฝ้าระวัง"] });
  ck(sql.includes("WHEN [DISTANCE_KM] <= 5 THEN N'≤ 5'"), "SQL ใช้ <= ตรงกับกติกาขอบบนรวม");
  ck(sql.includes("WHEN [SITE_CODE] = N'SKA1029' THEN N'เฝ้าระวัง'"), "SQL มีรายการล็อก");
  ck(sql.indexOf("[SITE_CODE] = N'SKA1029'") < sql.indexOf("[DISTANCE_KM] IS NULL"), "รายการล็อกต้องมาก่อนเงื่อนไขช่วง ไม่งั้นไม่มีผล");
  ck(sql.includes("THEN 4"), "หมวดพิเศษได้เลขเรียงต่อท้ายเหมือนฝั่ง Power Query");

  const dax = genDAX({ column: "ระยะทาง", table: "PAIR", breaks: [5, 20], labels: ["≤ 5", "6-20", "> 20"] });
  ck(dax.includes("v <= 5, \"≤ 5\","), "DAX ใช้ <= เหมือนกัน");
  ck(dax.includes("ISBLANK(v), 0,"), "DAX ให้ค่าว่างเป็นเลขเรียง 0 เหมือนกันทุกภาษา");
}

console.log("\n⑭ พิสูจน์ว่าเทสชุดนี้แดงเป็น (ถ้ากติกาขอบเปลี่ยน ต้องจับได้)");
{
  // จำลองความผิดที่อันตรายที่สุด: ขอบบน "ไม่รวม" (v >= b แทน v > b)
  const wrongIndex = (v, B) => { let i = 0; for (const b of B) { if (v >= b) i++; else break; } return i; };
  const B = [0, 5, 10];
  const same = [0, 3, 5, 6, 10, 11].every((v) => wrongIndex(v, B) === binIndexOf(v, B));
  ck(!same, "ตัวคำนวณแบบขอบไม่รวมให้ผลต่างจากของจริง แปลว่าเทสข้อ ④ และ ⑨ จับความผิดนี้ได้แน่");
  const a = assign([{ key: "k", value: 5 }], { breaks: [0, 5, 10] });
  ck(a.rows[0].band === "1-5" && wrongIndex(5, B) + 1 !== a.rows[0].sort, "ค่าที่เท่ากับจุดตัดพอดีคือจุดที่แยกของถูกกับของผิดออกจากกัน");
}

console.log(`\nสรุป: ผ่าน ${pass} ข้อ, ตก ${fail.length} ข้อ`);
if (fail.length) { fail.forEach((f) => console.log("  ❌ " + f)); process.exit(1); }
