/* ตรวจแกนตรรกะของเครื่องมือ รวมหลาย query เป็นตัวเดียว (src/pqcombine.js)
 *
 * ทำไมต้องมี: เครื่องมือนี้เอาโค้ดของผู้ใช้ไปย้ายตำแหน่ง ถ้าย้ายพลาดแม้ตัวอักษรเดียว
 * query จะพังตอน refresh หรือแย่กว่านั้นคือได้ข้อมูลผิดโดยไม่มี error
 * เคสที่เจอจริงกับไฟล์งาน 26/09/2026 และต้องไม่เกิดซ้ำ
 *   ① SQL ที่เขียนหลายบรรทัดในสตริง ถ้าเยื้องบรรทัดตาม ข้อความ SQL เปลี่ยน
 *   ② query อื่นที่ต้องการค่าดิบ ถ้าชี้ไป query ที่ล้างค่าแล้ว ผลเปลี่ยนเงียบ
 * ทุกโค้ดที่สร้าง ต้องผ่านตัวตรวจไวยากรณ์ M ของ Microsoft (@microsoft/powerquery-parser 2.0.0
 * ใน tests/lib) และตัวตรวจต้องจับของพังได้จริงก่อน ถึงจะเชื่อว่ามันผ่าน
 * ตัวอย่างทั้งหมดเป็นชื่อสมมติ ห้ามใส่ชื่อ server หรือข้อมูลบริษัทจริงลงไฟล์นี้
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const PQP = require(join(ROOT, "tests/lib/powerquery-parser.min.cjs"));
const mod = await import(pathToFileURL(join(ROOT, "src/pqcombine.js")).href);
const pqm = await import(pathToFileURL(join(ROOT, "src/pqm.js")).href);
const {
  scanM, indentM, dedentM, linesStartInside, findRefs, parseQueries, mergeQueries,
  insertBlocks, buildFromSources, buildWarnings, detectSources, suggestInline, joinQueries, mId, mText,
} = mod;

let pass = 0;
const fail = [];
const ck = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else fail.push(`${name}\n      ได้    : ${JSON.stringify(got)}\n      ควรได้ : ${JSON.stringify(want)}`);
  console.log(`  ${ok ? "✅" : "❌"} ${name}`);
};
const parses = async (code) => {
  const task = await PQP.TaskUtils.tryLexParse(PQP.DefaultSettings, code);
  return PQP.TaskUtils.isParseStageOk(task);
};

/* ── ของทดสอบ (ชื่อสมมติทั้งหมด) ─────────────────────────────────────── */
// SQL หลายบรรทัดอยู่ในสตริงตรง ๆ แบบที่เจอในไฟล์จริง บรรทัดพวกนี้ห้ามถูกเยื้อง
const SALES_TH = `let
    Source = Sql.Database("srv-a.example", "SalesDB", [Query="SELECT * FROM dbo.Sales WHERE Code NOT IN (
    '',
    'A-1',
    '0'
)"]),
    #"Added Custom" = Table.AddColumn(Source, "Src", each "TH"),
    #"Trimmed Text" = Table.TransformColumns(#"Added Custom",{{"Code", Text.Trim, type text}})
in
    #"Trimmed Text"`;

// สตริงที่มี // /* "" และ #(lf) อยู่ข้างใน ต้องไม่หลงว่าเป็นคอมเมนต์หรือจบสตริง
const SALES_VN = `let
    Source = Sql.Database("srv-b.example", "SalesVN", [Query="select a.Code, ""x"" as Tag -- // not a comment#(lf)from dbo.T a /* keep */ union all select Code, 'y' from dbo.T2"]),
    #"Added Custom1" = Table.AddColumn(Source, "Src", each "VN")
in
    #"Added Custom1"`;

const FLAGS = `let
    Source = #table({"Code", "Flag"}, {{"A-2", "Y"}})
in
    Source`;

const SALES_ALL = `let
    Source = Table.Combine({sales_th, sales_vn}),
    #"Filtered Rows" = Table.SelectRows(Source, each [Code] <> null),
    Joined = Table.NestedJoin(#"Filtered Rows", {"Code"}, flags, {"Code"}, "flags", JoinKind.LeftOuter),
    #"Cleaned IDs" = Table.TransformColumns(Joined, {{"Code", each Text.Upper(_), type text}})
in
    #"Cleaned IDs"`;

// ตารางที่ต้องใช้รหัสแบบดิบ (ยังไม่ทำตัวใหญ่) ถ้าชี้ไป sales_all ผลเปลี่ยน
const DIM_STORE = `let
    Source = sales_th,
    Cols = Table.SelectColumns(Source, {"Code", "Store"}),
    Dedup = Table.Distinct(Cols, {"Code"})
in
    Dedup`;

const LAST_SALE = `let
    Source = sales_all,
    Grouped = Table.Group(Source, {"Code"}, {{"Last", each List.Max([Date]), type nullable date}})
in
    Grouped`;

// ตัวล่อ: ชื่อ query อยู่ในสตริง คอมเมนต์ ชื่อฟิลด์ และการอ่านฟิลด์ ต้องไม่นับเป็นการอ้าง
const DECOY = `let
    // sales_th in a comment
    Note = "sales_th in a string",
    Rec = [sales_th = 1, Other = 2],
    Field = Table.AddColumn(#table({"sales_th"}, {{1}}), "x", each [sales_th] + 1)
in
    Field`;

const Q = [
  { name: "sales_th", code: SALES_TH },
  { name: "sales_vn", code: SALES_VN },
  { name: "flags", code: FLAGS },
  { name: "sales_all", code: SALES_ALL },
  { name: "dim_store", code: DIM_STORE },
  { name: "last_sale", code: LAST_SALE },
  { name: "decoy", code: DECOY },
];
const NAMES = Q.map((q) => q.name);
const strs = (code) => scanM(code).filter((g) => g.type === "str").map((g) => code.slice(g.start, g.end));

console.log("\n━━ ⓪ ตัวตรวจไวยากรณ์ต้องจับของพังได้ก่อน (ไม่งั้นทุกข้อข้างล่างผ่านหลอก) ━━");
ck("ของจริง sales_th ผ่านตัวตรวจ", await parses(SALES_TH), true);
ck("ลบจุลภาคหนึ่งตัว ตัวตรวจต้องจับได้", await parses(SALES_ALL.replace("sales_vn}),", "sales_vn})")), false);
ck("สตริงไม่ปิด ตัวตรวจต้องจับได้", await parses(SALES_TH.replace(`)"]),`, ")]),")), false);
ck("จุลภาคเกินหน้า in ตัวตรวจต้องจับได้", await parses(FLAGS.replace('"Y"}})', '"Y"}}),')), false);

console.log("\n━━ ① ตัวแบ่งช่วง ต่อกลับต้องได้ต้นฉบับเป๊ะ และแยกสตริงถูก ━━");
for (const q of Q) {
  ck(`ต่อช่วงของ ${q.name} กลับได้ต้นฉบับ`, scanM(q.code).map((g) => q.code.slice(g.start, g.end)).join(""), q.code);
}
ck("สตริงที่มี // ข้างในยังเป็นสตริงก้อนเดียว", strs(SALES_VN).filter((x) => x.includes("-- // not a comment")).length, 1);
ck("ชื่อ #\"...\" เป็นช่วง qid", scanM(SALES_TH).filter((g) => g.type === "qid").length > 0, true);
ck("คอมเมนต์บรรทัดถูกแยก", scanM(DECOY).filter((g) => g.type === "lc").length, 1);

console.log("\n━━ ② เยื้องบรรทัด ห้ามแตะบรรทัดที่อยู่กลางสตริง ━━");
ck("บรรทัดที่เริ่มกลาง SQL ถูกตรวจเจอ 4 บรรทัด", linesStartInside(SALES_TH).filter(Boolean).length, 4);
for (const q of Q) {
  const ind = indentM(q.code, "        ");
  ck(`${q.name}: เยื้องแล้วถอยกลับได้ต้นฉบับทุกตัวอักษร`, dedentM(ind, "        "), q.code);
  ck(`${q.name}: ข้อความในสตริงเหมือนเดิมทุกก้อน`, strs(ind), strs(q.code));
}

const naive = SALES_TH.split("\n").map((l) => "        " + l).join("\n");
ck("เคสล่อ: เยื้องทุกบรรทัดแบบไม่ระวัง ข้อความ SQL เปลี่ยนจริง (พิสูจน์ว่าข้อตรวจสตริงจับได้)", JSON.stringify(strs(naive)) === JSON.stringify(strs(SALES_TH)), false);

console.log("\n━━ ③ หาว่า query ไหนอ้าง query ไหน ━━");
ck("sales_all อ้าง sales_th sales_vn flags", [...findRefs(SALES_ALL, NAMES)].sort(), ["flags", "sales_th", "sales_vn"]);
ck("dim_store อ้าง sales_th", [...findRefs(DIM_STORE, NAMES)], ["sales_th"]);
ck("ชื่อในสตริง คอมเมนต์ ชื่อฟิลด์ และ [ฟิลด์] ไม่นับ", [...findRefs(DECOY, NAMES)], []);
ck("ชื่อขั้นของตัวเองบังชื่อ query", [...findRefs("let sales_th = 1, x = sales_th in x", NAMES)], []);
ck("ชื่อ #\"มีเว้นวรรค\" นับได้", [...findRefs('let s = #"Sales KH" in s', ["Sales KH"])], ["Sales KH"]);
ck("ชื่อไทยนับได้", [...findRefs("let s = ยอดขาย in s", ["ยอดขาย"])], ["ยอดขาย"]);
ck("หาแหล่งข้อมูลเจอ server กับ database", detectSources(SALES_TH).map((s) => s.key), ["Sql.Database srv-a.example;SalesDB"]);
ck("คำว่า Web.Contents( ในสตริงไม่นับเป็นแหล่ง", detectSources('let a = "Web.Contents(1)" in a').length, 0);
ck("ผู้สมัครยุบเริ่มต้น = ตัวที่ query หลักอ้างและดึงแหล่งเอง", suggestInline(Q, "sales_all"), ["sales_th", "sales_vn"]);

console.log("\n━━ ④ อ่านโค้ดหลาย query ที่วางมา ━━");
const pasted = Q.map((q) => `// ${q.name}\n${q.code}`).join("\n\n");
const p1 = parseQueries(pasted);
ck("แบบหัว // ได้ครบ 7 query", p1.queries.map((q) => q.name), NAMES);
ck("แบบหัว // โค้ดตรงต้นฉบับทุกตัว", p1.queries.map((q) => q.code), Q.map((q) => q.code));
ck("คอมเมนต์ // ในตัว let ไม่ถูกตัดเป็น query ใหม่ (decoy ยังเป็นก้อนเดียว)", p1.queries.find((q) => q.name === "decoy").code, DECOY);
const p2 = parseQueries(`// first\n// อธิบายเพิ่ม\nlet a = 1 in a\n\n// second\nlet b = 2 in b`);
ck("คอมเมนต์ต่อจากหัวเป็นของ query เดียวกัน", p2.queries.map((q) => q.name), ["first", "second"]);
ck("คอมเมนต์นั้นอยู่ในโค้ด", p2.queries[0].code.startsWith("// อธิบายเพิ่ม"), true);
const p3 = parseQueries(`section Section1;\n\nshared a = let x = "a;b" in x;\n\nshared #"b c" = 2;\n`);
ck("แบบ section อ่านชื่อและโค้ดถูก (; ในสตริงไม่ตัด)", p3.queries, [{ name: "a", code: 'let x = "a;b" in x' }, { name: "b c", code: "2" }]);
const p4 = parseQueries("let a = 1 in a");
ck("query เดียวไม่มีหัว", [p4.format, p4.queries.length, p4.queries[0].name], ["single", 1, ""]);

// ข้อความจริงจากการคัดลอก 8 query ใน Power Query Editor ของ Desktop 2.157 (26/09/2026 ชื่อ server สมมติ)
// ไฟล์นี้เขียนด้วย PowerShell จึงมี BOM นำหน้า ถ้าตัวอ่านไม่ตัด BOM query แรกจะไม่มีชื่อ (บั๊กที่เจอจริง)
const clip = readFileSync(join(ROOT, "tests/fixtures/pq_clipboard_desktop.txt"), "utf8");
ck("ไฟล์คลิปบอร์ดจริงขึ้นต้นด้วย BOM (ของทดสอบยังเป็นของจริง)", clip.charCodeAt(0), 0xfeff);
const pc = parseQueries(clip);
ck("คลิปบอร์ดจริงจาก Desktop อ่านได้ 8 query ชื่อตรงทุกตัว", pc.queries.map((q) => q.name),
   ["A_blocks", "B_function", "C_table", "Server_P1", "Database_P1", "P_params", "Server_P2", "Database_P2"]);
ck("ตัด BOM ออกแล้วอ่านได้เหมือนกัน", parseQueries(clip.slice(1)).queries.map((q) => q.name), pc.queries.map((q) => q.name));
ck("P_params อ้าง parameter ครบ 4 ตัว", [...findRefs(pc.queries.find((q) => q.name === "P_params").code, pc.queries.map((q) => q.name))].sort(),
   ["Database_P1", "Database_P2", "Server_P1", "Server_P2"]);
for (const q of pc.queries) ck(`คลิปบอร์ดจริง ${q.name} ผ่านตัวตรวจไวยากรณ์`, await parses(q.code), true);

console.log("\n━━ ⑤ ยุบ 3 เหลือ 1 แบบคัดลอกบล็อกให้ตัวที่อ้างอยู่ (ค่าเริ่มต้น) ━━");
const r = mergeQueries(Q, { main: "sales_all", inline: ["sales_th", "sales_vn"], dependents: "copy" });
ck("ย้ายเข้าไป 2 ก้อน ตามลำดับที่อ้าง", r.moved, ["sales_th", "sales_vn"]);
ck("query หลักใหม่ผ่านตัวตรวจไวยากรณ์", await parses(r.main.code), true);
const bodyOf = (code, name, next) => {
  const a = code.indexOf(`    ${mId(name)} =\n`) + `    ${mId(name)} =\n`.length;
  const b = next ? code.indexOf(",\n\n", a) : code.indexOf(",\n\n", a);
  return dedentM(code.slice(a, b), "        ");
};
ck("บล็อก sales_th ในตัวใหม่ตรงต้นฉบับทุกตัวอักษร", bodyOf(r.main.code, "sales_th"), SALES_TH);
ck("บล็อก sales_vn ในตัวใหม่ตรงต้นฉบับทุกตัวอักษร", bodyOf(r.main.code, "sales_vn"), SALES_VN);
ck("ขั้นเดิมของ query หลักอยู่ครบต่อท้าย", r.main.code.endsWith(SALES_ALL.slice("let".length)), true);
ck("ข้อความ SQL ทุกก้อนยังอยู่ครบ", strs(SALES_TH).concat(strs(SALES_VN)).every((x) => r.main.code.includes(x)), true);
ck("query หลักไม่อ้าง sales_th sales_vn ภายนอกแล้ว", [...findRefs(r.main.code, NAMES)].sort(), ["flags"]);
ck("dim_store ถูกแก้ (คัดลอกบล็อกเข้าไป)", r.changed.map((c) => c.name), ["dim_store"]);
const dim = r.changed[0].code;
ck("dim_store ใหม่ผ่านตัวตรวจไวยากรณ์", await parses(dim), true);
ck("dim_store ยังอ่านจากบล็อกดิบ ไม่ได้ชี้ไป query ที่ล้างค่าแล้ว", [...findRefs(dim, NAMES)], []);
ck("ขั้นเดิมของ dim_store อยู่ครบ", dim.endsWith(DIM_STORE.slice("let".length)), true);
ck("last_sale ไม่ถูกแตะ (อ้าง query หลักซึ่งชื่อเดิม)", r.changed.some((c) => c.name === "last_sale"), false);
ck("ลบ sales_th กับ sales_vn ได้ทั้งคู่", r.deletable, ["sales_th", "sales_vn"]);
ck("นับแหล่งใน query หลักได้ 2 (ต้องเตือนเรื่อง privacy)", r.sourceCount, 2);

console.log("\n━━ ⑥ แบบไม่แตะตัวที่อ้างอยู่ ━━");
const k = mergeQueries(Q, { main: "sales_all", inline: ["sales_th", "sales_vn"], dependents: "keep" });
ck("ไม่มีตัวไหนถูกแก้", k.changed.length, 0);
ck("sales_th ต้องเก็บไว้ (dim_store ยังอ้าง)", k.mustKeep, ["sales_th"]);
ck("ลบได้แค่ sales_vn", k.deletable, ["sales_vn"]);

console.log("\n━━ ⑦ เคสขอบ ━━");
ck("ยุบตัวที่อ้าง query หลักกลับ = วงกลม ต้องปฏิเสธ",
   mergeQueries([...Q, { name: "loop", code: "let a = sales_all in a" }], { main: "sales_all", inline: ["loop"] }).error, "cycle");
ck("ไม่ได้เลือกอะไรเลย = ปฏิเสธ", mergeQueries(Q, { main: "sales_all", inline: [] }).error, "empty");
ck("ไม่มี query หลัก = ปฏิเสธ", mergeQueries(Q, { main: "nope", inline: ["sales_th"] }).error, "main");
const wrapped = insertBlocks("Table.Combine({sales_th, flags})", [{ name: "sales_th", code: SALES_TH }]);
ck("query ที่ไม่ขึ้นต้นด้วย let ถูกครอบให้ และผ่านตัวตรวจ", await parses(wrapped), true);
const fnq = insertBlocks("(x as text) => Table.SelectRows(sales_th, each [Code] = x)", [{ name: "sales_th", code: SALES_TH }]);
ck("query ที่เป็นฟังก์ชันถูกครอบให้ และผ่านตัวตรวจ", await parses(fnq), true);
const lead = insertBlocks("// คอมเมนต์นำ\nlet\n    a = sales_th\nin\n    a", [{ name: "sales_th", code: SALES_TH }]);
ck("คอมเมนต์นำหน้า let ยังอยู่ และผ่านตัวตรวจ", [lead.startsWith("// คอมเมนต์นำ\nlet\n"), await parses(lead)], [true, true]);
const spaced = mergeQueries([{ name: "Sales KH", code: FLAGS }, { name: "all", code: 'let s = Table.Combine({#"Sales KH"}) in s' }],
                            { main: "all", inline: ["Sales KH"] });
ck("ชื่อมีเว้นวรรคใช้ #\"...\" เป็นชื่อบล็อก และผ่านตัวตรวจ", [spaced.main.code.includes('#"Sales KH" =\n'), await parses(spaced.main.code)], [true, true]);
ck("ผลรวมเป็นข้อความเดียวอ่านกลับเข้าเครื่องมือได้ครบ",
   parseQueries(joinQueries([r.main, ...r.changed])).queries.map((q) => q.name), ["sales_all", "dim_store"]);

console.log("\n━━ ⑧ สร้าง query ใหม่จากรายการแหล่ง ทุกตัวเลือกต้องผ่านตัวตรวจ ━━");
const SRC = [
  { label: "Sales TH", server: "srv-a.example", database: "SalesDB", sql: "SELECT Code, Amount\nFROM dbo.Sales\nWHERE Note <> 'x \"y\"' AND Tag = '#(lf)'" },
  { label: "Sales VN", server: "10.0.0.5", database: "SalesVN", sql: "select * from dbo.T" },
  { label: "Sales TH", server: "srv-c", database: "Db3", sql: "select 1 as Code" },
];
let combos = 0;
for (const pattern of ["blocks", "function"]) {
  for (const labelColumn of ["Source", ""]) {
    for (const params of [false, true]) {
      for (const keyColumns of [[], ["Code", "รหัสสาขา"]]) {
        const out = buildFromSources({ sources: SRC, pattern, labelColumn, params, keyColumns });
        const ok = await parses(out.code) && (await Promise.all(out.params.map((p) => parses(p.code)))).every(Boolean);
        combos++;
        if (!ok) ck(`${pattern} label=${!!labelColumn} params=${params} keys=${keyColumns.length} ผ่านตัวตรวจ`, false, true);
        else pass++;
      }
    }
  }
}
console.log(`  ✅ ${combos} ชุดตัวเลือกผ่านตัวตรวจไวยากรณ์ทั้งหมด`);
const b = buildFromSources({ sources: SRC, pattern: "blocks" });
ck("ชื่อป้ายซ้ำได้ชื่อบล็อกไม่ซ้ำ", b.labels, ["Sales TH", "Sales VN", "Sales TH 2"]);
ck("SQL หลายบรรทัดกลายเป็น #(lf) และ \" ซ้อน และ #( ถูก escape",
   b.code.includes('"SELECT Code, Amount#(lf)FROM dbo.Sales#(lf)WHERE Note <> \'x ""y""\' AND Tag = \'#(#)(lf)\'"'), true);
ck("ต่อทุกแหล่งด้วย Table.Combine", b.code.includes('Combined = Table.Combine({#"Sales TH", #"Sales VN", #"Sales TH 2"})'), true);
ck("server ตรง ๆ อยู่ในบล็อก", b.code.includes('Sql.Database("10.0.0.5", "SalesVN", [Query = "select * from dbo.T"])'), true);
const bp = buildFromSources({ sources: SRC, pattern: "blocks", params: true });
ck("แบบ parameter ใช้ชื่อ parameter แทน", bp.code.includes("Sql.Database(Server_2, Database_2,"), true);
ck("ได้ parameter ครบ 6 ตัว", bp.params.map((p) => p.name), ["Server_1", "Database_1", "Server_2", "Database_2", "Server_3", "Database_3"]);
ck("parameter มีหน้าตาที่ Power BI รู้จัก", bp.params[0].code, '"srv-a.example" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]');
const bf = buildFromSources({ sources: SRC, pattern: "function" });
ck("แบบฟังก์ชัน เพิ่มแหล่ง = เพิ่มหนึ่งบรรทัด", bf.code.split("\n").filter((l) => l.includes("= LoadSql(")).length, 3);
ck("ไม่ใส่คอลัมน์ป้าย ไม่มีขั้น Labeled", buildFromSources({ sources: SRC, labelColumn: "" }).code.includes("Labeled"), false);
ck("เตือนแหล่งที่ยังไม่ครบ", buildWarnings([{ label: "a", server: "", database: "d", sql: "" }]).map((w) => w.code), ["noServer", "noSql"]);
ck("เตือน privacy เมื่อมีหลาย server", buildWarnings(SRC).some((w) => w.code === "privacy"), true);
ck("แหล่งเดียวไม่เตือน privacy", buildWarnings([SRC[0]]).some((w) => w.code === "privacy"), false);

console.log("\n━━ ⑨ ตัวช่วยเขียน M ต้องตรงกับตัวที่เว็บใช้อยู่แล้ว (src/pqm.js) ไม่ให้แยกทางกัน ━━");
for (const s of ['ธรรมดา', 'มี "คำพูด"', "ขึ้น\nบรรทัด", "win\r\nline", "tab\tx", "#(lf) จริง", '#("x")']) {
  ck(`mText ตรง escapeMText: ${JSON.stringify(s)}`, mText(s), `"${pqm.escapeMText(s)}"`);
}
ck("ชื่อธรรมดาไม่ครอบ", mId("sales_th"), "sales_th");
ck("คำสงวนต้องครอบ", mId("type"), '#"type"');
ck("ชื่อไทยต้องครอบ", mId("ยอดขาย"), '#"ยอดขาย"');

console.log(`\nผ่าน ${pass}, ตก ${fail.length}`);
fail.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
process.exit(fail.length ? 1 : 0);
