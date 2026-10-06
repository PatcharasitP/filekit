import * as LK from "../src/lookupkit.js";
const { normKey, keyOf, lookup, applyFill, colLetter, guessHeaderRow, guessKeyPair, guessPullCols, tableFromAoa, numText } = LK;
// ฟังก์ชันรอบ 06/10 ดึงแบบนี้ เพื่อให้รุ่นที่ยังไม่มีฟังก์ชันล้มเป็นข้อ ❌ ทีละข้อ ไม่ใช่ล้มทั้งไฟล์
const missing = (name) => () => `(ยังไม่มี ${name})`;
const looseHead = LK.looseHead || missing("looseHead"), bestDest = LK.bestDest || missing("bestDest");
const addonKeyCells = LK.addonKeyCells || missing("addonKeyCells");

let pass = 0; const F = [];
const ck = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : F.push(`${name}\n      ได้    : ${JSON.stringify(got)}\n      ควรได้ : ${JSON.stringify(want)}`);
  console.log(`  ${ok ? "✅" : "❌"} ${name}`);
};

/* ข้อมูลตัวอย่างมาจากภาพไฟล์ Pending VAT 2026 ของพี่ปอนด์ (30/09/2026)
   คีย์ Mapping = รหัสบริษัท & เลขเอกสาร เช่น 1068 & 2619062802 = "10682619062802" */

console.log("\n━━ ① คีย์ต่างชนิดต้องเป็นคีย์เดียวกัน ━━");
ck("เลข 2619062802 = ข้อความ '2619062802'", normKey(2619062802), normKey("2619062802"));
ck("เว้นวรรคหัวท้ายและช่องว่างพิเศษ (nbsp) ไม่มีผล", normKey("  2619062802 ​"), "2619062802");
ck("ตัวพิมพ์ใหญ่เล็กเท่ากัน (ค่าเริ่มต้น)", normKey("YLA80007A/2"), normKey("yla80007a/2"));
ck("ปิด ignoreCase แล้วต่างกัน", normKey("AB", { ignoreCase: false }) === normKey("ab", { ignoreCase: false }), false);
ck("'0012' ไม่เท่า 12 (รหัสขึ้นต้นศูนย์มีความหมาย)", normKey("0012") === normKey(12), false);
ck("เปิด ignoreZeros แล้ว '0012' = 12", normKey("0012", { ignoreZeros: true }), normKey(12));
ck("เลขทศนิยมลอย 0.1+0.2 ได้ 0.3", numText(0.1 + 0.2), "0.3");
ck("เลขใหญ่ 14 หลักไม่เป็นเลขยกกำลัง", numText(10682619062802), "10682619062802");
ck("วันที่เป็น ISO วัน", normKey(new Date(2026, 3, 9)), "2026-04-09");

console.log("\n━━ ② ช่องว่างและ error ห้ามเป็นคีย์ ━━");
for (const v of [null, undefined, "", "   ", " ", "#N/A", "#REF!", "#VALUE!", "#DIV/0!", NaN])
  ck(`${JSON.stringify(v)} เป็น null`, normKey(v), null);
ck("คีย์รวมที่ว่างทุกช่องเป็น null", keyOf([null, ""], [0, 1]), null);
ck("คีย์รวมต่อกันตรง ๆ เหมือนสูตร A&F", keyOf([1068, 44151, 2619062802], [0, 2]), "10682619062802");
ck("คีย์รวมที่ว่างบางช่องยังเป็นคีย์", keyOf([1068, null], [0, 1]), "1068");

console.log("\n━━ ③ จับคู่ + นับซ้ำ ━━");
// ไฟล์หลัก: 5 แถว  (คีย์ที่คอลัมน์ 0, คอลัมน์ 1 เป็นค่าเดิมว่างไว้รอเติม)
const main = [
  ["10682619062802", null],    // เจอ 1 แถว
  ["10682619062803", null],    // เจอ 3 แถว ค่าเหมือนกันหมด (ซ้ำแบบไม่มีผล)
  ["10682619063334", null],    // เจอ 2 แถว ค่าต่างกัน
  ["10682619099999", null],    // ไม่เจอ
  [null, null],                // คีย์ว่าง
];
// ไฟล์รอง: คอลัมน์ 0 = คีย์ (บางแถวเก็บเป็นเลข) , 1 = เลขใบกำกับ , 2 = วันที่
const sec = [
  ["10682619062802", "TX-001", "2026-03-27"],
  [10682619062803, "TX-002", "2026-03-27"],
  ["10682619062803 ", "TX-002", "2026-03-27"],
  ["10682619062803", "TX-002", "2026-03-27"],
  ["10682619063334", "TX-010", "2026-03-27"],
  ["10682619063334", "TX-011", "2026-04-01"],
  ["10682619070000", "TX-099", null],   // ไม่มีใครใช้
  ["#N/A", "TX-BAD", null],
  ["#N/A", "TX-BAD2", null],
];
const R = lookup({ mainRows: main, mainKeyCols: [0], secRows: sec, secKeyCols: [0], pullCols: [1, 2] });
ck("สถานะรายแถว", R.perRow.map((p) => p.status), ["one", "dupSame", "dupDiff", "none", "nokey"]);
ck("จำนวนที่เจอรายแถว", R.perRow.map((p) => p.n), [1, 3, 2, 0, 0]);
ck("สถิติรวม", [R.stats.found, R.stats.one, R.stats.dupSame, R.stats.dupDiff, R.stats.none, R.stats.nokey],
  [3, 1, 1, 1, 1, 1]);
ck("ค่าที่ได้ (ซ้ำแบบค่าต่างกัน เอาแถวแรก)", R.perRow.map((p) => p.vals),
  [["TX-001", "2026-03-27"], ["TX-002", "2026-03-27"], ["TX-010", "2026-03-27"], null, null]);
ck("แถวซ้ำอ้างเลขแถวของไฟล์รองที่เจอ", R.perRow[2].hits, [4, 5]);
ck("#N/A สองแถวในไฟล์รองไม่จับคู่กันเอง และไม่ถูกนับเป็นคีย์ซ้ำ", R.secDupKeys.map((d) => d.key),
  ["10682619062803", "10682619063334"]);
ck("คีย์ซ้ำในไฟล์รอง: ค่าเหมือนกันไหม + ถูกไฟล์หลักใช้กี่แถว",
  R.secDupKeys.map((d) => [d.agree, d.mainHits]), [[true, 1], [false, 1]]);
ck("คีย์ว่างในไฟล์รอง นับแยก (#N/A สองแถว)", R.stats.secBlankKeys, 2);
ck("คีย์ไม่ซ้ำในไฟล์รอง", R.stats.secKeys, 4);

console.log("\n━━ ④ นโยบายเมื่อคีย์ซ้ำและค่าต่างกัน ━━");
const pol = (dup) => lookup({ mainRows: main, mainKeyCols: [0], secRows: sec, secKeyCols: [0], pullCols: [1, 2], dup }).perRow[2];
ck("first เอาแถวแรก", pol("first").vals, ["TX-010", "2026-03-27"]);
ck("last เอาแถวสุดท้าย", pol("last").vals, ["TX-011", "2026-04-01"]);
ck("blank ไม่เติมเลย และบอกว่าถูกกันไว้", [pol("blank").vals, pol("blank").withheld], [null, true]);
ck("join รวมค่าที่ต่างกัน", pol("join").vals, ["TX-010; TX-011", "2026-03-27; 2026-04-01"]);
ck("ซ้ำแต่ค่าเหมือนกัน blank ก็ยังเติม (ไม่กำกวม)",
  lookup({ mainRows: main, mainKeyCols: [0], secRows: sec, secKeyCols: [0], pullCols: [1, 2], dup: "blank" }).perRow[1].vals,
  ["TX-002", "2026-03-27"]);

console.log("\n━━ ⑤ ช่องที่ไฟล์รองเว้นว่างไม่ถือว่าซ้ำ-ต่าง ━━");
const R5 = lookup({ mainRows: [["k"]], mainKeyCols: [0],
  secRows: [["k", "A", null], ["k", "A", ""]], secKeyCols: [0], pullCols: [1, 2] });
ck("ว่างกับสตริงว่างเหมือนกัน = ซ้ำเหมือนกัน", R5.perRow[0].status, "dupSame");

console.log("\n━━ ⑥ คีย์รวมหลายคอลัมน์ ━━");
const R6 = lookup({
  mainRows: [[1068, 2619062802], [1019, 2619062802]], mainKeyCols: [0, 1],
  secRows: [["10682619062802", "X"]], secKeyCols: [0], pullCols: [1],
});
ck("รหัสบริษัท+เลขเอกสาร จับคู่กับ Mapping ที่ต่อกันไว้แล้ว", R6.perRow.map((p) => p.status), ["one", "none"]);
let threw = false;
try { lookup({ mainRows: [], mainKeyCols: [], secRows: [], secKeyCols: [0], pullCols: [] }); } catch { threw = true; }
ck("ไม่เลือกคอลัมน์คีย์เลย = error", threw, true);

console.log("\n━━ ⑦ เติมลงไฟล์หลัก แถวไม่ขยับ ━━");
// แผ่นจริง: แถวบนสุดเป็นยอดรวม หัวตารางอยู่แถว 2 (index 1) แถวว่างคั่นกลางหนึ่งแถว
const sheet = [
  [null, null, 18, 74611.95],
  ["Mapping", "Tax Inv. No", "Note", "Amt"],
  ["10682619062802", null, "เดิม", 1],
  [null, null, null, null],
  ["10682619062803", "OLD-1", null, 2],
  ["10682619099999", null, null, 3],
];
const T = tableFromAoa(sheet, 1);
ck("ตัดแถวว่างแต่จำตำแหน่งเดิม", T.rowIdx, [2, 4, 5]);
const RF = lookup({ mainRows: T.rows, mainKeyCols: [0], secRows: sec, secKeyCols: [0], pullCols: [1] });
const label = (p) => ({ one: "เจอ 1", none: "ไม่เจอ" }[p.status] || p.status);
const A = applyFill({ aoa: sheet, headerIdx: 1, rowIdx: T.rowIdx, width: T.width, result: RF,
  dests: [{ col: 1 }], fill: "empty", status: { head: ["ผล", "เจอกี่แถว"], label } });
ck("เติมช่องว่าง (แถว 3) และไม่ทับของเดิม (แถว 5 มี OLD-1)", [A.aoa[2][1], A.aoa[4][1]], ["TX-001", "OLD-1"]);
ck("แถวที่ไม่เจอเว้นว่าง", A.aoa[5][1], null);
ck("ยอดรวมแถวบนสุดไม่ขยับ", A.aoa[0].slice(0, 4), [null, null, 18, 74611.95]);
ck("จำนวนแถวเท่าเดิม", A.aoa.length, sheet.length);
ck("สถิติ: เติม 1 , ไม่ทับ 1 (และค่าไม่ตรงกับของเดิม 1)", [A.stat.filled, A.stat.keptOld, A.stat.keptOldDiff], [1, 1, 1]);
ck("คอลัมน์สถานะต่อท้าย", [A.aoa[1][4], A.aoa[1][5], A.aoa[2][4], A.aoa[2][5], A.aoa[5][4]], ["ผล", "เจอกี่แถว", "เจอ 1", 1, "ไม่เจอ"]);
ck("ต้นฉบับไม่ถูกแก้ (ทำสำเนา)", sheet[2][1], null);
const AA = applyFill({ aoa: sheet, headerIdx: 1, rowIdx: T.rowIdx, width: T.width, result: RF, dests: [{ col: 1 }], fill: "always" });
ck("โหมดทับเสมอ ทับ OLD-1 ด้วยค่าจากไฟล์รอง", AA.aoa[4][1], "TX-002");
const AN = applyFill({ aoa: sheet, headerIdx: 1, rowIdx: T.rowIdx, width: T.width, result: RF, dests: [{ col: null, name: "ใบกำกับใหม่" }] });
ck("ปลายทางเป็นคอลัมน์ใหม่ต่อท้าย", [AN.aoa[1][4], AN.aoa[2][4], AN.cols], ["ใบกำกับใหม่", "TX-001", [4]]);

console.log("\n━━ ⑧ เดาค่าเริ่มต้นให้หน้าจอ ━━");
ck("colLetter 0,25,26,27,701,702", [0, 25, 26, 27, 701, 702].map(colLetter), ["A", "Z", "AA", "AB", "ZZ", "AAA"]);
ck("หัวตารางอยู่แถว 2 เมื่อแถว 1 เป็นยอดรวม", guessHeaderRow(sheet), 1);
ck("ไม่มีแถวชื่อเรื่อง หัวอยู่แถวแรก", guessHeaderRow([["a", "b", "c"], [1, 2, 3], ["x", "y", "z"]]), 0);
ck("แถวข้อมูลที่เป็นข้อความล้วนเท่ากันไม่ชิงเป็นหัว", guessHeaderRow([["ชื่อ", "เมือง", "ประเทศ"], ["สมชาย", "เชียงใหม่", "ไทย"]]), 0);
ck("ชีตว่างได้ 0", guessHeaderRow([]), 0);
const mh = ["Company Code", "Item", "Doc. No.", "Mapping", "Tax Inv. Date (SM)", "Tax Inv. No (SM)", "Send to Tax Team No."];
const sh = ["Doc. No.", "MAPPING ", "Tax Inv. No (SM)", "Tax Inv. Date (SM)", "Send to Tax Team No.", "Company Code"];
ck("คู่คีย์: เลือก Mapping ก่อน Doc. No. เพราะดูเป็นคีย์กว่า", guessKeyPair(mh, sh), { main: 3, sec: 1, score: 3 });
ck("ไม่มีชื่อตรงกันเลย = null", guessKeyPair(["a"], ["b"]), null);
const mainRows = [
  ["1068", 1, "d1", "k1", null, null, null],
  ["1068", 2, "d2", "k2", null, "", null],
  ["1068", 3, "d3", "k3", null, null, null],
];
ck("ติ๊กเฉพาะคอลัมน์ที่ไฟล์หลักว่างรอเติม ไม่ติ๊ก Company Code ที่มีข้อมูลเต็ม",
  guessPullCols(mh, mainRows, sh, [1]).map((x) => [x.sec, x.main]), [[2, 5], [3, 4], [4, 6]]);

/* ── รอบ 06/10/2026 พี่ปอนด์ลองกับไฟล์จริงแล้วขอเพิ่ม ─────────────────────────
   คีย์ต่อได้มากกว่า 2 คอลัมน์, ชื่อหัวสองไฟล์เขียนไม่เหมือนกันเป๊ะ, ช่องที่มีแต่เว้นวรรค,
   แถวที่ไฟล์รองมีแต่ไฟล์หลักไม่มี ให้เพิ่มเป็นแถวใหม่ท้ายไฟล์หลักพร้อมป้าย Addon */

console.log("\n━━ ⑨ ชื่อหัวไม่ตรงเป๊ะ (จุด วงเล็บ เว้นวรรค ตัวพิมพ์) ━━");
ck("Tax Inv. Date (SM) = tax inv date sm", looseHead("Tax Inv. Date (SM)"), looseHead("tax inv date sm"));
ck("สระและวรรณยุกต์ไทยไม่ถูกตัดทิ้ง", looseHead("วันที่ ใบกำกับ"), "วันที่ใบกำกับ");
ck("ชื่อต่างกันจริงยังต่างกัน", looseHead("Tax Inv. Date") === looseHead("Tax Inv. No"), false);
ck("หาปลายทาง: ชื่อหลวมตรงกัน", bestDest("Tax.Inv.No (SM)", mh), 5);
ck("หาปลายทาง: ชื่อตรงเป๊ะมาก่อนชื่อหลวม", bestDest("Doc. No.", ["DocNo", "Doc. No."]), 1);
ck("หาปลายทาง: ไม่มีชื่อใกล้เลย = -1", bestDest("Remark", mh), -1);
ck("เดาคอลัมน์ที่จะดึงก็ใช้ชื่อหลวมด้วย",
  guessPullCols(mh, mainRows, ["Mapping", "tax inv no sm"], [0]).map((x) => [x.sec, x.main]), [[1, 5]]);

console.log("\n━━ ⑩ คีย์ต่อกันได้มากกว่า 2 คอลัมน์ ━━");
const R10 = lookup({ mainRows: [[1068, "A", 5], [1068, "A", 6]], mainKeyCols: [0, 1, 2],
  secRows: [["1068a5", "X"]], secKeyCols: [0], pullCols: [1] });
ck("รหัส+ตัวอักษร+เลข 3 คอลัมน์ ต่อกันแล้วจับคู่ได้", R10.perRow.map((p) => p.status), ["one", "none"]);

console.log("\n━━ ⑪ แถวที่มีในไฟล์รองแต่ไม่มีในไฟล์หลัก ━━");
ck("ไฟล์รองแถว 7 (10682619070000) ไม่มีในไฟล์หลัก (#N/A ไม่นับ)", R.secOnly, [6]);
ck("นับแถวและนับคีย์", [R.stats.secOnly, R.stats.secOnlyKeys], [1, 1]);
const R11 = lookup({ mainRows: [["k1"]], mainKeyCols: [0], secRows: [["k1", "a"], ["x", "b"], ["x", "c"], [null, "d"]], secKeyCols: [0], pullCols: [1] });
ck("คีย์เดียวกันสองแถวในไฟล์รอง ได้ทั้งสองแถว คีย์ว่างไม่เอา", [R11.secOnly, R11.stats.secOnlyKeys], [[1, 2], 1]);

console.log("\n━━ ⑫ คีย์ของแถวใหม่ลงคอลัมน์ไหน ━━");
ck("คีย์เดียวต่อคีย์เดียว เก็บค่าเดิม (เลขยังเป็นเลข)", addonKeyCells([0], [0], [10682619070000, "TX"]), [[0, 10682619070000]]);
ck("จำนวนเท่ากัน จับคู่ทีละคอลัมน์", addonKeyCells([0, 5], [1, 2], ["x", 1068, 2619]), [[0, 1068], [5, 2619]]);
ck("ไฟล์หลักคีย์เดียว ไฟล์รองหลายคอลัมน์ = ต่อกันเป็นข้อความ", addonKeyCells([6], [0, 1], [1068, 2619062802]), [[6, "10682619062802"]]);
ck("ไฟล์หลักหลายคอลัมน์ ไฟล์รองคอลัมน์เดียว แยกไม่ได้ = null", addonKeyCells([0, 1], [0], ["10682619"]), null);

console.log("\n━━ ⑬ เพิ่มแถวใหม่ท้ายไฟล์หลัก (Addon) ━━");
const addon = {
  at: 6,
  rows: [{ keys: [[0, "10682619070000"]], vals: ["TX-099"] }, { keys: [[0, "10682619070001"]], vals: [null] }],
  tag: { col: null, name: "Addon", value: "Addon 10/2026" },
  label: () => "เพิ่มจากไฟล์รอง",
};
const AD = applyFill({ aoa: sheet, headerIdx: 1, rowIdx: T.rowIdx, width: T.width, result: RF,
  dests: [{ col: 1 }], fill: "empty", status: { head: ["ผล", "เจอกี่แถว"], label }, addon });
ck("แถวใหม่ต่อท้าย 2 แถว", AD.aoa.length, sheet.length + 2);
ck("แถวใหม่แรก: คีย์ ค่าที่ดึง ผล ป้าย", [AD.aoa[6][0], AD.aoa[6][1], AD.aoa[6][4], AD.aoa[6][5], AD.aoa[6][6]],
  ["10682619070000", "TX-099", "เพิ่มจากไฟล์รอง", null, "Addon 10/2026"]);
ck("ค่าว่างจากไฟล์รองไม่ถูกเขียน", AD.aoa[7][1], null);
ck("หัวคอลัมน์ป้ายต่อหลังคอลัมน์ผล", AD.aoa[1].slice(4, 7), ["ผล", "เจอกี่แถว", "Addon"]);
ck("แถวเดิมไม่ได้ป้าย", AD.aoa[2][6], null);
ck("สถิติเพิ่ม 2 แถว", AD.stat.added, 2);
ck("ทุกช่องของแถวใหม่อยู่ในรายการแก้ (คีย์ 2 + ค่า 1 + ผล 2 + ป้าย 2)", AD.edits.filter((e) => e.i >= 6).length, 7);
const AD2 = applyFill({ aoa: sheet, headerIdx: 1, rowIdx: T.rowIdx, width: T.width, result: RF, dests: [{ col: 1 }],
  addon: { ...addon, tag: { col: 2, value: "Addon 06/10/2026" } } });
ck("ป้ายลงคอลัมน์ที่มีอยู่แล้ว ไม่ต่อคอลัมน์ใหม่", [AD2.aoa[6][2], AD2.aoa[1].length], ["Addon 06/10/2026", 4]);
const sheetA = sheet.map((r, i) => [...r, i === 1 ? "Addon" : null]);
const AD3 = applyFill({ aoa: sheetA, headerIdx: 1, rowIdx: T.rowIdx, width: 5, result: RF, dests: [{ col: 1 }], addon });
ck("ไฟล์ที่เคยมีคอลัมน์ Addon แล้ว ใช้คอลัมน์เดิม ไม่เขียนหัวคอลัมน์ใหม่", [AD3.aoa[6][4], AD3.edits.filter((e) => e.i === 1).length], ["Addon 10/2026", 0]);
const AD4 = applyFill({ aoa: sheet, headerIdx: 1, rowIdx: T.rowIdx, width: T.width, result: RF, dests: [{ col: 1 }], addon: { ...addon, tag: null } });
ck("ไม่ใส่ป้ายก็ได้", [AD4.aoa[6][0], AD4.aoa[1].length], ["10682619070000", 4]);

console.log("\n━━ ⑭ ช่องที่มีแต่เว้นวรรค (กด Spacebar ค้างไว้) นับเป็นช่องว่าง ━━");
const sp = [["Mapping", "No"], ["10682619062802", "   "], ["10682619062803", " "]];
const TS = tableFromAoa(sp, 0);
const RS = lookup({ mainRows: TS.rows, mainKeyCols: [0], secRows: sec, secKeyCols: [0], pullCols: [1] });
const AS = applyFill({ aoa: sp, headerIdx: 0, rowIdx: TS.rowIdx, width: TS.width, result: RS, dests: [{ col: 1 }], fill: "empty" });
ck("เว้นวรรคธรรมดาและเว้นวรรคแบบ nbsp ถูกเติมทับ", [AS.aoa[1][1], AS.aoa[2][1], AS.stat.filled, AS.stat.keptOld], ["TX-001", "TX-002", 2, 0]);

// ‼️ 07/10/2026 เห็นในภาพเว็บจริง: รวมวันที่ได้ 2026-04-02; 2026-04-09 ต้องเป็นแบบที่คนไทยอ่าน (เหมือนช่องอื่นบนจอ)
const RJ = lookup({ mainRows: [["k"]], mainKeyCols: [0], secRows: [["k", new Date(2026, 3, 2), 1068], ["k", new Date(2026, 3, 9), 1069]],
  secKeyCols: [0], pullCols: [1, 2], dup: "join" });
ck("รวมวันที่เป็น วว/ดด/ปปปป และเลขไม่มีทศนิยมลอย", RJ.perRow[0].vals, ["02/04/2026; 09/04/2026", "1068; 1069"]);

console.log("\n━━ ⑮ คอลัมน์ เติมแล้ว (Yes/No) กับ ค่ามาจากแถวในไฟล์รอง ━━");
/* ‼️ 06/10/2026 พี่ปอนด์: อยากรู้ว่าแถวไหนถูกเติม แบบ yes no และค่ามาจากแถวไหนของไฟล์รอง
   Yes = แถวนี้ได้ค่าจากไฟล์รองอย่างน้อย 1 ช่อง (เขียนรอบนี้ หรือของเดิมเท่ากับค่าจากไฟล์รองอยู่แล้ว) */
ck("แถวที่ใช้: first เอาแถวแรก", pol("first").used, [4]);
ck("แถวที่ใช้: last เอาแถวสุดท้าย", pol("last").used, [5]);
ck("แถวที่ใช้: blank ค่าต่างกันไม่ได้ใช้แถวไหนเลย", pol("blank").used, []);
ck("แถวที่ใช้: join ใช้ทุกแถวที่มีค่า", pol("join").used, [4, 5]);
ck("แถวที่ใช้: ซ้ำค่าเหมือนกันนับแถวแรก, ไม่เจอว่าง", [R.perRow[1].used, R.perRow[3].used], [[1], []]);
const ST4 = { head: ["ผล", "เจอกี่แถว", "เติมแล้ว", "จากแถว"], label, src: (p) => p.used.map((h) => h + 1).join(", ") };
const AY = applyFill({ aoa: sheet, headerIdx: 1, rowIdx: T.rowIdx, width: T.width, result: RF, dests: [{ col: 1 }], fill: "empty", status: ST4 });
ck("หัวคอลัมน์ผล 4 คอลัมน์", AY.aoa[1].slice(4, 8), ["ผล", "เจอกี่แถว", "เติมแล้ว", "จากแถว"]);
ck("แถวที่เติมได้ Yes จากแถว 1", AY.aoa[2].slice(6, 8), ["Yes", "1"]);
ck("แถวที่ไม่ทับของเดิม (ค่าไม่ตรง) ได้ No แต่ยังบอกแถวที่เจอ", AY.aoa[4].slice(6, 8), ["No", "2"]);
ck("แถวที่ไม่เจอได้ No และไม่มีเลขแถว", AY.aoa[5].slice(6, 8), ["No", null]);
const sheetSame = sheet.map((r, i) => (i === 4 ? ["10682619062803", "TX-002", null, 2] : r));
const AY2 = applyFill({ aoa: sheetSame, headerIdx: 1, rowIdx: T.rowIdx, width: T.width, result: RF, dests: [{ col: 1 }], fill: "empty", status: ST4 });
ck("ของเดิมเท่ากับค่าจากไฟล์รองอยู่แล้ว (เติมรอบก่อน) ยังได้ Yes", AY2.aoa[4][6], "Yes");
const sheetOld2 = sheet.map((r, i) => (i === 1 ? [...r, "ผล", "เจอกี่แถว"] : [...r, null, null]));
const AY3 = applyFill({ aoa: sheetOld2, headerIdx: 1, rowIdx: T.rowIdx, width: 6, result: RF, dests: [{ col: 1 }], status: ST4 });
ck("ไฟล์ที่เคยมีคอลัมน์ผล 2 คอลัมน์ ใช้ของเดิม ต่อเฉพาะ 2 คอลัมน์ใหม่", AY3.aoa[1].slice(4, 8), ["ผล", "เจอกี่แถว", "เติมแล้ว", "จากแถว"]);
const AY4 = applyFill({ aoa: sheet, headerIdx: 1, rowIdx: T.rowIdx, width: T.width, result: RF, dests: [{ col: 1 }], status: ST4,
  addon: { ...addon, tag: null, src: () => "16" } });
ck("แถว Addon ได้ Yes และเลขแถวไฟล์รองที่มา", AY4.aoa[6].slice(4, 8), ["เพิ่มจากไฟล์รอง", null, "Yes", "16"]);

console.log("\n━━ ⑯ คอลัมน์ผลเลือกได้ทีละตัว: ไม่ใส่ / คอลัมน์ใหม่ / คอลัมน์ที่มีอยู่แล้ว ━━");
/* ‼️ 07/10/2026 พี่ปอนด์: ถ้าไม่อยากเพิ่ม หรือมีคอลัมน์นั้นอยู่แล้ว (ชื่อไม่เหมือน) ล่ะ
   dest ต่อคอลัมน์: "new" = ใหม่ท้ายตาราง (ชื่อเดียวกันมีอยู่แล้วใช้ของเดิม) , "none" = ไม่ใส่ , เลข = ลงคอลัมน์นั้น */
const AP = applyFill({ aoa: sheet, headerIdx: 1, rowIdx: T.rowIdx, width: T.width, result: RF, dests: [{ col: 1 }],
  status: { ...ST4, dest: ["none", "none", "new", "none"] } });
ck("เลือกเอาแค่ เติมแล้ว: ต่อคอลัมน์เดียว", [AP.aoa[1].slice(4), AP.statusCols], [["เติมแล้ว"], [null, null, 4, null]]);
ck("แถวได้แค่ Yes/No ไม่มีคอลัมน์อื่นงอก", [AP.aoa[2].slice(4), AP.aoa[5].slice(4)], [["Yes"], ["No"]]);
const AQ = applyFill({ aoa: sheet, headerIdx: 1, rowIdx: T.rowIdx, width: T.width, result: RF, dests: [{ col: 1 }],
  status: { ...ST4, dest: ["none", "none", 2, "none"] } });
ck("ลง Yes/No ในคอลัมน์ที่มีอยู่แล้ว (C Note) ไม่ต่อคอลัมน์ใหม่ ไม่เขียนหัว", [AQ.aoa[1].length, AQ.aoa[1][2], AQ.aoa[2][2], AQ.aoa[5][2]], [4, "Note", "Yes", "No"]);
const AN0 = applyFill({ aoa: sheet, headerIdx: 1, rowIdx: T.rowIdx, width: T.width, result: RF, dests: [{ col: 1 }],
  status: { ...ST4, dest: ["none", "none", "none", "none"] } });
ck("ไม่ใส่ทั้งหมด = ไม่มีคอลัมน์ผลเลย", [AN0.aoa[1].length, AN0.edits.filter((e) => e.c >= 4).length], [4, 0]);

console.log("\n━━ ⑯b คอลัมน์ ค่ามาจากแถว ต้องไม่ค้างค่าจากรอบก่อน ━━");
// ‼️ 07/10/2026 ภาพไฟล์จริง: บันทึกรอบก่อนด้วยโหมดรวมค่า แล้วรอบนี้โหมดไม่เติม แถวที่ไม่ได้ใช้แถวไหนเลยยังค้างเลขแถวเก่า
const sheetStale = sheet.map((r, i) => (i === 1 ? [...r, "ผล", "เจอกี่แถว", "เติมแล้ว", "จากแถว"] : i === 5 ? [...r, "x", 9, "Yes", "7, 8"] : [...r, null, null, null, null]));
const AS1 = applyFill({ aoa: sheetStale, headerIdx: 1, rowIdx: T.rowIdx, width: 8, result: RF, dests: [{ col: 1 }], status: ST4 });
ck("แถวไม่เจอที่เคยมีเลขแถวค้าง ถูกล้างเป็นว่าง (และ เติมแล้ว เป็น No)", [AS1.aoa[5][6], AS1.aoa[5][7]], ["No", null]);
ck("การล้างอยู่ในรายการแก้ (ส่งไปลบช่องในไฟล์จริง)", AS1.edits.some((e) => e.i === 5 && e.c === 7 && e.v === null), true);
ck("แถวที่ช่องว่างอยู่แล้วไม่สร้างรายการแก้เปล่า ๆ", AS1.edits.filter((e) => e.c === 7 && e.v === null).length, 1);

console.log("\n━━ ⑰ เตือนเจอน้อยผิดปกติ เทียบกับฝั่งที่เล็กกว่า ━━");
/* ‼️ 07/10/2026 ไฟล์จริงพี่ปอนด์ 23,213 แถว กับไฟล์รอง 13 คีย์ เจอ 8 แต่ขึ้นเตือน "เจอแค่ 8 จาก 23,213"
   ทั้งที่เจอเกินครึ่งของที่หาได้ ต้องเทียบกับฝั่งที่เล็กกว่า และโชว์ตัวอย่างคีย์เฉพาะตอนหน้าตาต่างกันจริง */
const lowMatch = LK.lowMatch || missing("lowMatch");
ck("ไฟล์รองเล็ก เจอเกินครึ่ง = ไม่เตือน", lowMatch({ mainKeys: 23213, secKeys: 13, matchedKeys: 8 }, ["10682619122441"], ["10682619062802"]), null);
ck("เลือกคีย์ผิดคอลัมน์ หน้าตาต่างกัน (10 กับ 14 หลัก) = เตือนพร้อมตัวอย่าง",
  lowMatch({ mainKeys: 18, secKeys: 13, matchedKeys: 0 }, ["2619062802"], ["10682619062802"]), { samples: true });
ck("หน้าตาเหมือนกันแต่ไม่ค่อยตรง = เตือนโดยไม่ต้องมีตัวอย่าง",
  lowMatch({ mainKeys: 500, secKeys: 400, matchedKeys: 3 }, ["10682619122441"], ["10682619062802"]), { samples: false });
ck("คีย์น้อยกว่า 10 ไม่ตัดสิน", lowMatch({ mainKeys: 5, secKeys: 5, matchedKeys: 0 }, ["a"], ["1"]), null);
ck("สถิติคีย์ไม่ซ้ำของสองฝั่ง และคีย์ที่จับคู่ได้", [R.stats.mainKeys, R.stats.secKeys, R.stats.matchedKeys], [4, 4, 3]);

console.log(`\n${F.length ? "❌" : "✅"} ผ่าน ${pass} ข้อ ${F.length ? `ตก ${F.length} ข้อ` : ""}`);
if (F.length) { console.log("\n" + F.join("\n") + "\n"); process.exit(1); }
