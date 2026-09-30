import { normKey, keyOf, lookup, applyFill, colLetter, guessHeaderRow, guessKeyPair, guessPullCols, tableFromAoa, numText } from "../src/lookupkit.js";

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

console.log(`\n${F.length ? "❌" : "✅"} ผ่าน ${pass} ข้อ ${F.length ? `ตก ${F.length} ข้อ` : ""}`);
if (F.length) { console.log("\n" + F.join("\n") + "\n"); process.exit(1); }
