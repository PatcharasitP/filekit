/* ตรวจตัวสร้างสูตร DAX ของเครื่องมือ "รายละเอียดหลายคอลัมน์ในช่องเดียวของ Matrix"
 *
 * ‼️ เทสนี้มีอยู่เพื่อกันเรื่องเดียวเป็นหลัก: ข้อมูลหายเงียบ ๆ
 *
 * เทคนิคต้นทางจาก SQLBI ใช้ FILTER ( { ...คอลัมน์... }, [Value] <> "" ) ตัดค่าว่างทิ้ง
 * แต่เอกสาร DAX ระบุว่า ตัวดำเนินการเปรียบเทียบทุกตัวยกเว้น == มองว่า
 * BLANK เท่ากับ 0, "", DATE(1899,12,30) และ FALSE
 * (https://learn.microsoft.com/dax/dax-operator-reference)
 * แปลว่าถ้าปล่อยคอลัมน์ตัวเลข วันที่ หรือจริง/เท็จ เข้าไปดิบ ๆ
 *   ยอด 0 จะหาย  วันที่ 30/12/1899 จะหาย  ค่า FALSE จะหาย
 * โดยไม่มี error ให้เห็นเลย ผู้ใช้เห็นแค่ตารางที่ข้อมูลไม่ครบ
 *
 * ทางแก้ของเครื่องมือคือแปลงทุกฟิลด์เป็นข้อความก่อนเสมอ
 * เทสนี้จึงยืนยันว่า "ทุกชนิดที่เสี่ยง ต้องไม่ถูกส่งเข้าไปดิบ ๆ"
 *
 * รัน: node tests/matrixdax.test.mjs */
import { fieldExpr, buildMeasure, previewCell } from "../src/tools/pbi-matrix-details.js";

let pass = 0; const fail = [];
const ck = (ok, msg) => { if (ok) { pass++; console.log("  ✅ " + msg); } else { fail.push(msg); console.log("  ❌ " + msg); } };

const T = "Sales";
const col = (name, type, extra = {}) => ({ name, type, fmt: null, label: "", idx: 0, ...extra });

/* ── ① ชนิดที่เสี่ยง ต้องถูกแปลงเป็นข้อความเสมอ ────────────────────────── */
const RISKY = [
  ["int64", "#,0"], ["number", "#,0.00"], ["currency", "#,0.00"],
  ["percentage", "0.0%"], ["date", "dd/MM/yyyy"], ["datetime", "dd/MM/yyyy HH:mm"], ["time", "HH:mm"],
];
for (const [type, fmt] of RISKY) {
  const out = fieldExpr(col("Qty", type, { fmt }), T);
  ck(out.startsWith("FORMAT ("), `① ชนิด ${type} ต้องห่อด้วย FORMAT ไม่ปล่อยดิบ (ได้ ${out.slice(0, 34)})`);
  ck(out !== `${T}[Qty]`, `① ชนิด ${type} ต้องไม่เป็นการอ้างคอลัมน์ดิบ`);
}
{
  const out = fieldExpr(col("Paid", "logical"), T);
  ck(out.startsWith("IF (") && !out.includes("FORMAT"),
     `① จริง/เท็จ ต้องแปลงเป็นคำด้วย IF ไม่ใช่ FORMAT (ได้ ${out.slice(0, 30)})`);
}
/* ข้อความไม่ต้องห่อ เพราะ FORMAT ทำงานที่ formula engine เสียแรงเปล่า */
ck(fieldExpr(col("Name", "text"), T) === `${T}[Name]`, "① ข้อความต้องไม่ถูกห่อ FORMAT ให้เปลืองแรง");

/* ── ② ป้ายกำกับต้องไม่ทำให้แถวว่างเหลือป้ายลอย ────────────────────────── */
{
  const t = fieldExpr(col("Name", "text", { label: "ลูกค้า: " }), T);
  ck(t.includes(`${T}[Name] <> ""`), "② ป้ายบนข้อความ ใช้เช็ค <> \"\" ซึ่งครอบทั้ง BLANK และสตริงว่าง");
  const n = fieldExpr(col("Qty", "int64", { fmt: "#,0", label: "จำนวน: " }), T);
  ck(n.includes("NOT ISBLANK"), "② ป้ายบนตัวเลข ต้องใช้ NOT ISBLANK ไม่ใช่ <> \"\" (นั่นคือกับดักเดิม)");
  ck(!n.includes(`${T}[Qty] <> ""`), "② ป้ายบนตัวเลข ต้องไม่มีการเทียบกับสตริงว่างหลงเหลือ");
}

/* ── ③ การอ้างชื่อและการหนีอักขระ ───────────────────────────────────── */
ck(buildMeasure(base({ table: "ยอดขาย" })).includes("'ยอดขาย'"),
   "③ ชื่อตารางที่ไม่ใช่อักษรอังกฤษล้วน ต้องใส่เครื่องหมายคำพูดเดี่ยว");
ck(buildMeasure(base({ table: "Sales Order" })).includes("'Sales Order'"),
   "③ ชื่อตารางที่มีเว้นวรรค ต้องใส่เครื่องหมายคำพูดเดี่ยว");
ck(!buildMeasure(base({ table: "Sales" })).includes("'Sales'"),
   "③ ชื่อตารางอังกฤษล้วนไม่ต้องใส่เครื่องหมายคำพูด");
{
  const out = fieldExpr(col("N", "text", { label: 'เขาว่า "ดี" ' }), T);
  ck(out.includes('""ดี""'), "③ เครื่องหมายคำพูดในป้าย ต้องถูกเบิ้ลตามกฎ DAX ไม่งั้นสูตรพัง");
}

/* ── ④ โครงสูตรต้องมีตัวกันของ SQLBI ครบ ────────────────────────────── */
{
  const m = buildMeasure(base({}));
  ck(m.includes(`ISINSCOPE ( ${T}[Order Number] )`), "④ ต้องมี ISINSCOPE กับคอลัมน์หัวแถว กันไม่ให้ข้อความไปโผล่แถวผลรวม");
  ck(m.includes('[Value] <> ""'), "④ ต้องมีตัวกรองค่าว่างของ SQLBI อยู่ครบ");
  ck(m.startsWith("Details =\n"), "④ ต้องขึ้นต้นด้วยชื่อ measure");
  ck(m.includes("UNICHAR ( 10 )"), "④ ตัวคั่นแถวแบบขึ้นบรรทัดใหม่ ต้องใช้ UNICHAR(10)");
}
ck(buildMeasure(base({ strategy: "summarize" })).includes("SUMMARIZE ("), "④ วิธี SUMMARIZE ต้องออกมาเป็น SUMMARIZE จริง");
ck(buildMeasure(base({ strategy: "values" })).includes("VALUES ("), "④ วิธีค่าไม่ซ้ำ ต้องออกมาเป็น VALUES จริง");
/* ‼️ วิธีค่าไม่ซ้ำก็ต้องแปลงชนิดเหมือนกัน เคยพลาดได้ง่ายเพราะเขียนแยกทาง */
ck(buildMeasure(base({ strategy: "values" })).includes("FORMAT ( VALUES ("),
   "④ วิธีค่าไม่ซ้ำ ต้องห่อ FORMAT ให้ชนิดที่เสี่ยงด้วย ไม่ใช่แปลงเฉพาะทางหลัก");

/* ── ④.5 หัวแถวหลายชั้น ต้องผูก ISINSCOPE กับชั้นในสุดเสมอ ───────────────
   ‼️ เคสที่พี่ปอนด์ทัก 11/09/2026: Matrix จริงมักมีหลายชั้น และคอลัมน์รหัส
      ซ้ำได้หลายแถว ถ้าผูกกับชั้นนอก ข้อความจะไปโผล่ที่แถวสรุปของชั้นนั้น
      แล้วเอาข้อมูลคนละรายการมากองรวมกัน */
{
  const m = buildMeasure(base({ anchors: ["Customer", "Order Number", "Line"] }));
  ck(m.includes("ISINSCOPE ( Sales[Line] )"),
     "④.5 หัวแถว 3 ชั้น ต้องผูก ISINSCOPE กับชั้นในสุด (Line)");
  ck(!m.includes("ISINSCOPE ( Sales[Customer] )") && !m.includes("ISINSCOPE ( Sales[Order Number] )"),
     "④.5 ต้องไม่ผูกกับชั้นนอก แม้แต่ชั้นเดียว");
  ck((m.match(/ISINSCOPE/g) || []).length === 1, "④.5 ต้องมี ISINSCOPE ตัวเดียว ไม่ใช่ซ้อนกันทุกชั้น");
  ck(m.includes("Customer > Order Number > Line"),
     "④.5 ต้องเขียนลำดับชั้นไว้ในคอมเมนต์ ให้คนอ่านสูตรรู้ว่าตั้งใจอะไร");
  /* สลับลำดับแล้วตัวที่ผูกต้องเปลี่ยนตาม ไม่ใช่จำตัวเดิม */
  const m2 = buildMeasure(base({ anchors: ["Line", "Customer"] }));
  ck(m2.includes("ISINSCOPE ( Sales[Customer] )"), "④.5 สลับลำดับชั้นแล้ว ตัวที่ผูกต้องเปลี่ยนตาม");
}
{
  const one = buildMeasure(base({ anchors: ["Order Number"] }));
  ck(!one.includes("--"), "④.5 หัวแถวชั้นเดียว ไม่ต้องมีคอมเมนต์ลำดับชั้นให้รก");
}

/* ── ⑤ พรีวิวต้องเดินตามวิธีที่เลือกจริง ไม่งั้นโกหกผู้ใช้ ──────────────── */
{
  const cols = [col("P", "text"), col("Q", "text")];
  cols[0].idx = 0; cols[1].idx = 1;
  const rows = [["ก", "1"], ["ก", "1"], ["ข", "2"]];
  const rowsOut = previewCell(rows, cols, ", ", "\n", "rows").text;
  const sumOut = previewCell(rows, cols, ", ", "\n", "summarize").text;
  ck(rowsOut.split("\n").length === 3, `⑤ วิธีไล่ทีละแถว ต้องได้ 3 บรรทัด (ได้ ${rowsOut.split("\n").length})`);
  ck(sumOut.split("\n").length === 2, `⑤ วิธี SUMMARIZE ต้องตัดซ้ำเหลือ 2 บรรทัด (ได้ ${sumOut.split("\n").length})`);
  const v = previewCell(rows, cols, ", ", "\n", "values");
  ck(v.multi.includes("P") && v.multi.includes("Q"),
     "⑤ วิธีค่าไม่ซ้ำ ต้องรายงานฟิลด์ที่มีหลายค่า ซึ่งของจริงจะ error");
  ck(previewCell([["ก", "1"]], cols, ", ", "\n", "values").multi.length === 0,
     "⑤ กลุ่มที่มีค่าเดียวต่อฟิลด์ ต้องไม่ถูกเตือนผิด ๆ");
}

/* ── ⑥ ค่าว่างต้องหายไป แต่ศูนย์ต้องอยู่ (หัวใจของทั้งเทส) ──────────────── */
{
  const c = [{ name: "Q", type: "int64", fmt: "#,0", label: "", idx: 0 }];
  ck(previewCell([[0]], c, ", ", "\n", "rows").text === "0",
     "⑥ ยอด 0 ต้องยังอยู่ในผลลัพธ์ ไม่ถูกกรองทิ้ง");
  ck(previewCell([[""]], c, ", ", "\n", "rows").text === "",
     "⑥ ช่องว่างต้องถูกกรองทิ้งตามเดิม");
}

function base(over) {
  return {
    measure: "Details", table: "Sales", anchors: ["Order Number"],
    cols: [col("Name", "text"), col("Qty", "int64", { fmt: "#,0" })],
    strategy: "rows", fieldSep: ", ", rowSep: "newline", ...over,
  };
}

console.log(`\n${fail.length ? "❌" : "✅"} ผ่าน ${pass} ข้อ, ตก ${fail.length} ข้อ`);
process.exit(fail.length ? 1 : 0);
