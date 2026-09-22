/* FlowKit ทางเข้า ②: flow ของ Power Automate เป็นผัง (แผน SPEC ข้อ 4 , เฟส 4)
 *
 * ‼️ เทียบ "ความหมายของผัง" (กล่อง รูปทรง กรอบ เส้น ป้าย ชนิดเส้น) ไม่เทียบตัวอักษรของ Mermaid
 * ‼️ ของลับต้องไม่หลุดสักชั้น: ป้อน flow ที่มี connection , URL , อีเมล , token , ค่าเทียบใน case แล้วค้นใน FlowModel , Mermaid
 *    และข้อความที่ตัดแล้วซึ่งจะไปอยู่ในช่องพิมพ์กับ sessionStorage (ชั้น XML กับ PNG อยู่ใน tests/browser_flowpa.py)
 *    ตัวค้นพิสูจน์ก่อนว่าเจอของลับในไฟล์ดิบได้จริง (ประชากร > 0) ไม่งั้นค้นไม่เจอก็ไม่ได้แปลว่าไม่รั่ว
 * ‼️ ทุก flow ในเทสเป็นของสมมติ ห้ามเอา flow ของบริษัทมาทำเทส (W6) และ repo นี้เป็นสาธารณะ
 *
 * รัน: node tests/flow_pa.test.mjs  (หรือ --selftest ให้ตัวตรวจจับของผิดที่ใส่ไว้เอง) */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location ??= { href: "http://127.0.0.1/flow/" };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { parsePA, prunePA, readableName, viewOptions, applyView, PA_BIG } = await imp("flow/src/parse-pa.js");
const { toMermaid } = await imp("flow/src/to-mermaid.js");
const { SAMPLES } = await imp("flow/src/samples.js");
const { fixNestedEdges } = await imp("flow/src/engine.js");
const SELFTEST = process.argv.includes("--selftest");
const fx = (f) => readFileSync(join(ROOT, "tests/flow_pa", f), "utf8");

let pass = 0; const fail = [];
const ck = (ok, msg, detail = "") => {
  if (ok) { pass++; console.log("  ✅ " + msg); }
  else { fail.push(msg); console.log("  ❌ " + msg + (detail ? "\n      " + detail : "")); }
};
const model = (t) => { const r = parsePA(t); if (!r.model) throw new Error((r.error && r.error.message) || "empty"); return r.model; };
/** ผังเป็นชุดข้อความที่เทียบได้ ไม่ขึ้นกับเลข id */
function shape(m) {
  const txt = new Map(m.nodes.map((n) => [n.id, n.text]));
  const gt = new Map(m.groups.map((g) => [g.id, g.title]));
  return {
    nodes: m.nodes.map((n) => `${n.text} [${n.shape}]${n.group ? " ใน " + gt.get(n.group) : ""}`).sort(),
    groups: m.groups.map((g) => `${g.title}${g.parent ? " ใน " + gt.get(g.parent) : ""}`).sort(),
    edges: m.edges.map((e) => `${txt.get(e.from)} ${e.style === "dashed" ? "-.->" : "-->"} ${txt.get(e.to)}${e.label ? " |" + e.label + "|" : ""}`).sort(),
  };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const diff = (got, want) => `ขาด ${JSON.stringify(want.filter((x) => !got.includes(x)))} เกิน ${JSON.stringify(got.filter((x) => !want.includes(x)))}`;

/* ของลับในไฟล์ secrets.json ทุกชนิดที่ flow จริงมี: connection , URL ของ HTTP , อีเมล , token , รหัสผ่านในเนื้อเมล , ค่าเทียบ , id ภายใน */
const SECRETS = ["SECRET", "example.com", "contoso", "logic.azure.com", "Bearer", "hunter2", "sig=", "@", "https://", "shared_", "shared-office365",
  "connectionName", "operationMetadataId", "5d0c7c1e", "SE Asia Standard Time"];
const leaks = (hay) => SECRETS.filter((s) => String(hay).includes(s));

if (SELFTEST) {
  console.log("\n━━ selftest: ตัวตรวจต้องจับของผิดได้ ━━");
  const raw = fx("secrets.json");
  ck(leaks(raw).length === SECRETS.length, `ตัวค้นของลับเจอของลับครบ ${SECRETS.length} ชนิดในไฟล์ดิบ (ประชากร > 0)`, JSON.stringify(SECRETS.filter((s) => !raw.includes(s))));
  const m = model(raw);
  m.nodes[1].text = JSON.parse(raw).properties.definition.actions.Call_webhook.inputs.uri;   // จำลองตัวอ่านที่เผลออ่าน inputs
  ck(leaks(JSON.stringify(m)).length > 0 && leaks(toMermaid(m)).length > 0, "ตัวค้นจับ URL ที่รั่วเข้ากล่องได้ ทั้งใน FlowModel และ Mermaid");
  const g = shape(model(fx("14-pa-flow.json")));
  const bad = { ...g, edges: g.edges.map((e) => e.replace("|ถ้าพัง|", "")) };
  ck(!same(bad, g), "ตัวเทียบผังจับเส้นที่ป้ายหายได้");
  const flat = { ...g, groups: g.groups.map((x) => x.replace(/ ใน .*/, "")) };
  ck(!same(flat, g), "ตัวเทียบผังจับกรอบที่หลุดออกจากกรอบแม่ได้");
  const x = nestedXml();
  ck(/entryY=1/.test(x.split("E5")[1]) && fixNestedEdges(x).includes("entryY=1") === false, "ตัวอย่าง XML มีจุดเสียบผิดจริงก่อนแก้ (ตัวตรวจข้อ fixNestedEdges มีของให้จับ)");
  finish();
}

console.log("\n━━ ① ผังตัวอย่าง 14-pa-flow ต้องได้ความหมายเดียวกับ .mmd ที่ยิง draw.io พิสูจน์แล้ว (แผนข้อ 5) ━━");
{
  const got = shape(model(fx("14-pa-flow.json")));
  const want = {
    nodes: ["อ่านรายการจากตาราง [step] ใน ส่งเมลแจ้งเตือนรายวัน", "กรองเฉพาะที่ครบกำหนด [step] ใน ส่งเมลแจ้งเตือนรายวัน", "มีรายการไหม [ask] ใน ส่งเมลแจ้งเตือนรายวัน",
      "ประกอบเนื้อเมล [step] ใน วนทีละรายการ", "ส่งเมล [step] ใน วนทีละรายการ", "บันทึกว่าไม่มีรายการ [step] ใน ส่งเมลแจ้งเตือนรายวัน",
      "แจ้งผู้ดูแลว่า flow พัง [step] ใน ส่งเมลแจ้งเตือนรายวัน"].sort(),
    groups: ["ส่งเมลแจ้งเตือนรายวัน", "วนทีละรายการ ใน ส่งเมลแจ้งเตือนรายวัน"].sort(),
    edges: ["อ่านรายการจากตาราง --> กรองเฉพาะที่ครบกำหนด", "กรองเฉพาะที่ครบกำหนด --> มีรายการไหม", "มีรายการไหม --> ประกอบเนื้อเมล |ใช่|",
      "ประกอบเนื้อเมล --> ส่งเมล", "มีรายการไหม --> บันทึกว่าไม่มีรายการ |ไม่ใช่|", "มีรายการไหม -.-> แจ้งผู้ดูแลว่า flow พัง |ถ้าพัง|"].sort(),
  };
  ck(same(got.nodes, want.nodes), "กล่องครบ 7 กล่อง รูปทรงถูก อยู่ในกรอบที่ถูก", diff(got.nodes, want.nodes));
  ck(same(got.groups, want.groups), "กรอบวนซ้อนอยู่ในกรอบ Scope (ไม่หลุดออกมาเป็นกรอบลอย)", diff(got.groups, want.groups));
  ck(same(got.edges, want.edges), "เส้นครบ 6 เส้น ป้ายใช่ ไม่ใช่ และเส้นประ ถ้าพัง จาก Condition", diff(got.edges, want.edges));
  ck(model(fx("14-pa-flow.json")).title === "ส่งเมลแจ้งเตือนรายวัน", "ชื่อผัง (ใช้ตั้งชื่อไฟล์) มาจาก description ของก้อนที่คัดลอก");
}

console.log("\n━━ ② โครงแบบต่าง ๆ ของ Power Automate ━━");
{
  const s = shape(model(fx("trycatch.json")));
  ck(s.nodes.includes("ทุกวัน 8 โมงเช้า [start]") && s.nodes.includes("จบแบบล้มเหลว [end] ใน ถ้ามีขั้นไหนพัง"), "ตัวเริ่ม flow เป็นจุดเริ่ม Terminate เป็นจุดจบ");
  ck(s.edges.includes("ทุกวัน 8 โมงเช้า --> อ่านรายการจากตาราง"), "ตัวเริ่ม flow ต่อเข้าขั้นแรกในกรอบ Try (ขั้นที่ runAfter ว่าง)");
  ck(s.edges.includes("ส่งเมลถึงผู้รับผิดชอบ -.-> แจ้งผู้ดูแลว่า flow พัง |ถ้าพัง|") && s.edges.includes("บันทึกว่าวันนี้ไม่มีงาน -.-> แจ้งผู้ดูแลว่า flow พัง |ถ้าพัง|"),
    "‼️ Catch ที่รอ Try พัง ได้เส้นประ ถ้าพัง จากทุกปลายของ Try (ปลายเดียวอ่านผิดความหมาย engine_probe13)", JSON.stringify(s.edges.filter((e) => e.includes("-.->"))));
  ck(s.groups.includes("วนทีละรายการ: For each item ใน ส่งเมลเตือนงานที่ครบกำหนด"), "Apply to each เป็นกรอบ ชื่อขึ้นต้นว่า วนทีละรายการ: แล้วตามด้วยชื่อแอ็กชัน");
}
{
  const s = shape(model(fx("switch.json")));
  ck(s.edges.includes("งานประเภทไหน --> มอบงานให้ช่าง |Repair|") && s.edges.includes("งานประเภทไหน --> ส่งจัดซื้อ |Purchase|"), "Switch แตกกิ่งตามชื่อ case");
  ck(s.edges.includes("งานประเภทไหน --> ติดธงว่าไม่รู้จักประเภท |อื่น ๆ|"), "กิ่ง default ได้ป้าย อื่น ๆ");
  ck(s.edges.includes("งานประเภทไหน --> ทำเครื่องหมายว่าจัดการแล้ว |Question|"), "case ที่ไม่มีแอ็กชัน ลากจากคำถามไปขั้นถัดไปพร้อมป้ายของ case");
  ck(["มอบงานให้ช่าง", "ส่งจัดซื้อ", "ติดธงว่าไม่รู้จักประเภท"].every((t) => s.edges.includes(`${t} --> ทำเครื่องหมายว่าจัดการแล้ว`)), "ทุกกิ่งมาบรรจบที่ขั้นหลัง Switch");
  ck(s.groups.length === 1 && s.groups[0] === "วนทีละรายการ: For each request", "ก้อนที่คัดลอกจาก Apply to each ได้กรอบวนหนึ่งกรอบ (หน้าไทยเติมคำไทยนำหน้าเสมอ)");
  ck(s.nodes.includes("Read type [step] ใน วนทีละรายการ: For each request"), "แอ็กชันที่ไม่มี description ใช้ชื่อแอ็กชันแปลง _ เป็นวรรค");
}
{
  const m = model(fx("nested3.json")); const s = shape(m);
  ck(same(s.groups, ["งานหลัก", "วนทีละรายการ: ทีละไฟล์ ใน งานหลัก", "อ่านและตรวจไฟล์ ใน วนทีละรายการ: ทีละไฟล์", "ทำซ้ำจนกว่า: ระบบปลายทางซิงก์ครบ ใน งานหลัก"].sort()),
    "กรอบซ้อน 3 ชั้น (Scope ใน Apply to each ใน Scope) กับ Do until ได้พ่อแม่ถูกทุกกรอบ", JSON.stringify(s.groups));
  ck(s.edges.includes("ดึงรายชื่อไฟล์ --> อ่านไฟล์"), "เส้นเข้ากรอบซ้อนลงไปถึงขั้นแรกในกรอบชั้นในสุด");
  ck(s.edges.includes("ตรวจรูปแบบ --> ย้ายไฟล์ไปโฟลเดอร์เสร็จแล้ว") && s.edges.includes("ย้ายไฟล์ไปโฟลเดอร์เสร็จแล้ว --> ถามสถานะการซิงก์") && s.edges.includes("รอ 1 นาที --> ส่งรายงานสรุป"),
    "ขั้นหลังกรอบต่อจากขั้นสุดท้ายในกรอบ ทุกชั้น");
  ck(m.title === "ประมวลผลไฟล์รายเดือน", "ชื่อผังมาจาก displayName ของ flow");
}
{
  const s = shape(model(fx("parallel.json")));
  ck(s.edges.includes("Get details --> Notify team") && s.edges.includes("Get details --> Create task"), "สองแอ็กชันที่รอตัวเดียวกัน แยกเป็นสองสายขนาน");
  ck(s.edges.includes("Notify team --> Update status") && s.edges.includes("Create task --> Update status"), "แอ็กชันที่รอสองตัว สองสายมาบรรจบ");
  ck(s.edges.includes("Update status --> Write log |ทุกกรณี|"), "runAfter ครบทุกสถานะ = เส้นทึบป้าย ทุกกรณี (ไม่ใช่ ถ้าพัง)");
  ck(s.edges.includes("Update status -.-> Retry later |ถ้าถูกข้าม|"), "runAfter Skipped อย่างเดียว = เส้นประป้าย ถ้าถูกข้าม");
  ck(s.nodes.includes("When a row is added [start]"), "ชื่อตัวเริ่ม flow แปลง _ เป็นวรรค");
}
{
  const s = shape(model(fx("secrets.json")));
  ck(s.edges.includes("Check status --> Route |ใช่|") && s.edges.includes("Check status --> Log failure |ไม่ใช่|") && s.edges.includes("Log failure --> Route"),
    "Condition ที่กิ่ง ใช่ ว่าง ลากจากคำถามไปขั้นถัดไปพร้อมป้าย ใช่");
  ck(model(fx("secrets.json")).title === "แจ้งเตือนสัญญาใกล้หมด", "ไฟล์ export ทั้ง flow (properties.definition) ได้ชื่อผังจาก displayName");
}
{
  const peek = model(JSON.stringify({ type: "Scope", description: "ก้อนจากดูโค้ด", runAfter: {}, actions: { A: { type: "Compose", runAfter: {} } } }));
  ck(peek.groups.length === 1 && peek.groups[0].title === "ก้อนจากดูโค้ด" && peek.nodes.length === 1, "แอ็กชันเปล่าจาก ดูโค้ด (Peek code) ไม่มีชื่อก้อนก็อ่านได้");
  const one = parsePA(JSON.stringify({ nodeId: "Send_an_email_(V2)", nodeData: { anything: "x" } }));
  ck(one.model && one.model.nodes.length === 1 && one.model.nodes[0].text === "Send an email (V2)" && one.model.warnings.length === 1,
    "ก้อนแอ็กชันเดี่ยว (nodeData) ได้กล่องเดียวพร้อมคำแนะนำให้คัดลอกแอ็กชันแบบกล่อง");
  const empty = model(JSON.stringify({ definition: { triggers: {}, actions: { S: { type: "Scope", runAfter: {}, actions: {} } } } }));
  ck(empty.nodes.length === 1 && empty.nodes[0].text === "S" && !empty.groups.length, "Scope ที่ยังว่างเป็นกล่องธรรมดา (กรอบว่างไม่มีที่ให้เส้นเสียบ)");
  const twins = model(JSON.stringify({ definition: { actions: {
    A: { type: "Compose", description: "ส่งเมล", runAfter: {} }, B: { type: "Compose", description: "ส่งเมล", runAfter: { A: ["Succeeded"] } } } } }));
  ck(twins.nodes.length === 2 && twins.edges.length === 1, "‼️ แอ็กชันคนละตัวที่โน้ตเหมือนกันเป็นคนละกล่อง (ผังที่พิมพ์รวมข้อความซ้ำเป็นกล่องเดียว แต่ flow ไม่ใช่)");
  const note = model(JSON.stringify({ definition: { actions: { A: { type: "Compose", description: "บรรทัดแรก\nรายละเอียดยาว ๆ", runAfter: {} },
    B: { type: "Compose", description: "ก".repeat(120), runAfter: {} } } } }));
  ck(note.nodes[0].text === "บรรทัดแรก" && note.nodes[1].text.length === 80 && note.nodes[1].text.endsWith("…"), "โน้ตหลายบรรทัดใช้บรรทัดแรก โน้ตยาวเกิน 80 ตัวตัดท้าย");
}
ck(readableName("Send_an_email_(V2)") === "Send an email (V2)" && readableName("BuildEmailTable") === "Build Email Table"
  && readableName("GetPBIData") === "Get PBI Data" && readableName("ส่งเมล_รายวัน") === "ส่งเมล รายวัน" && readableName("Compose_2") === "Compose 2",
  "ชื่อแอ็กชันอ่านได้: _ เป็นวรรค , PascalCase แยกคำ (กติกาตั้งชื่อ flow ของพี่ปอนด์) , ตัวย่อพิมพ์ใหญ่ติดกันไม่ถูกหั่น");

console.log("\n━━ ③ ของที่ผู้ใช้ต้องรู้: ข้อผิดพลาดกับคำเตือน ━━");
{
  const cut = fx("trycatch.json").slice(0, 400);
  const r = parsePA(cut);
  ck(r.error && r.error.line === cut.split("\n").length, "JSON ขาดท้าย (ก๊อปมาไม่ครบ) บอกบรรทัดสุดท้าย", r.error && `บรรทัด ${r.error.line} ${r.error.message}`);
  const comma = '{\n  "definition": {\n    "actions": {\n      "A": { "type": "Compose" }\n      "B": { "type": "Compose" }\n    }\n  }\n}';
  const r2 = parsePA(comma);
  ck(r2.error && r2.error.line === 5 && r2.error.hint, "ลืมจุลภาค บอกบรรทัดที่ผิดพร้อมวิธีแก้", r2.error && `บรรทัด ${r2.error.line}`);
  const r3 = parsePA('{ "name": "ไม่ใช่ flow", "type": "person" }');
  ck(r3.error && /ไม่ใช่ flow/.test(r3.error.message) && r3.error.hint, "JSON ทั่วไปที่ไม่ใช่ flow บอกตรง ๆ พร้อมบอกว่าวางอะไรได้");
  ck(parsePA("   \n ").empty === true, "ช่องว่าง = ยังไม่มีผัง ไม่ใช่ข้อผิดพลาด");
  ck(parsePA('{ "definition": { "triggers": {}, "actions": {} } }').error, "flow ที่ไม่มีแอ็กชันเลย บอกว่าไม่มีอะไรให้วาด");
  const dangling = '{\n  "definition": {\n    "actions": {\n      "A": { "type": "Compose", "runAfter": {} },\n      "B": { "type": "Compose", "runAfter": { "Ghost": ["Succeeded"] } }\n    }\n  }\n}';
  const r4 = parsePA(dangling);
  ck(r4.model && r4.model.nodes.length === 2 && r4.model.warnings.length === 1 && r4.model.warnings[0].line === 5 && /Ghost/.test(r4.model.warnings[0].text),
    "‼️ runAfter ชี้แอ็กชันที่ไม่มี: ยังวาดได้ แต่เตือนพร้อมบรรทัดและชื่อที่หาไม่เจอ", JSON.stringify(r4.model && r4.model.warnings));
  const loop = parsePA(JSON.stringify({ definition: { actions: { A: { type: "Compose", runAfter: { B: ["Succeeded"] } }, B: { type: "Compose", runAfter: { A: ["Succeeded"] } } } } }));
  ck(loop.model && loop.model.nodes.length === 2 && loop.model.warnings.some((w) => /วนกันเอง/.test(w.text)), "runAfter วนกันเอง (JSON ที่แก้มือ) ไม่ค้าง วาดครบพร้อมเตือน");
}

console.log("\n━━ ④ ‼️ ของลับต้องไม่หลุดสักชั้น ━━");
{
  const raw = fx("secrets.json");
  ck(leaks(raw).length === SECRETS.length, `ไฟล์ทดสอบมีของลับครบ ${SECRETS.length} ชนิดจริง (ตัวค้นมีของให้เจอ)`);
  const m = model(raw);
  ck(leaks(JSON.stringify(m)).length === 0, "FlowModel ไม่มีของลับ", JSON.stringify(leaks(JSON.stringify(m))));
  ck(leaks(toMermaid(m)).length === 0, "Mermaid ที่ส่งเข้า draw.io ไม่มีของลับ", JSON.stringify(leaks(toMermaid(m))));
  const pruned = prunePA(raw);
  ck(leaks(pruned).length === 0, "‼️ ข้อความที่ลงช่องพิมพ์ (และ sessionStorage) ถูกตัดของลับทิ้งตั้งแต่ตอนวาง", JSON.stringify(leaks(pruned)));
  const ALLOWED = new Set(["nodeId", "serializedValue", "nodeData", "displayName", "definition", "triggers", "actions", "type", "description",
    "runAfter", "else", "cases", "default"]);
  const keys = [];
  (function walk(o, inNames) {
    if (!o || typeof o !== "object" || Array.isArray(o)) return;
    for (const [k, v] of Object.entries(o)) {
      if (!inNames) keys.push(k);
      /* ใต้ actions , triggers , cases , runAfter คีย์คือชื่อแอ็กชัน ไม่ใช่ชื่อช่อง */
      walk(v, !inNames && ["actions", "triggers", "cases", "runAfter"].includes(k));
    }
  })(JSON.parse(pruned), false);
  ck(keys.every((k) => ALLOWED.has(k)), "ข้อความที่ตัดแล้วเหลือแค่ช่องที่ใช้วาด (inputs , expression , metadata , connection ไม่เหลือ)", JSON.stringify([...new Set(keys.filter((k) => !ALLOWED.has(k)))]));
  ck(same(shape(model(pruned)), shape(m)), "วาดจากข้อความที่ตัดแล้ว ได้ผังเดียวกับวาดจากของดิบทุกเส้น");
  for (const f of ["14-pa-flow.json", "trycatch.json", "switch.json", "nested3.json", "parallel.json"]) {
    const t = fx(f);
    ck(same(shape(model(prunePA(t))), shape(model(t))), `${f} ตัดแล้ววาดได้ผังเดิม`);
  }
  ck(prunePA("ลูกค้าแจ้งเรื่อง\nปิดงาน") === null && prunePA('{"type":"person"}') === null && prunePA("{ ไม่ครบ") === null,
    "ข้อความธรรมดา , JSON ทั่วไป , JSON ไม่ครบ ไม่ถูกนับเป็น flow (วางแล้วไม่ถูกดึงไปหน้า Power Automate)");
}

console.log("\n━━ ⑤ flow ใหญ่: ย่อกลุ่ม กับ ดูทีละกลุ่ม ━━");
{
  const m = model(fx("trycatch.json"));
  const opts = viewOptions(m).map((o) => o.value);
  ck(opts[0] === "all" && opts.includes("collapse") && opts.filter((v) => v.startsWith("in:")).length === 3, "ตัวเลือกครบ: ทั้ง flow , ย่อกลุ่ม , ข้างในทีละกรอบ (3 กรอบ)", JSON.stringify(opts));
  const c = shape(applyView(m, "collapse"));
  ck(same(c.nodes, ["ทุกวัน 8 โมงเช้า [start]", "ส่งเมลเตือนงานที่ครบกำหนด | 6 ขั้น [step]", "ถ้ามีขั้นไหนพัง | 2 ขั้น [step]"].sort()), "ย่อแล้วกรอบละกล่อง บอกจำนวนขั้นข้างใน", JSON.stringify(c.nodes));
  ck(same(c.edges, ["ทุกวัน 8 โมงเช้า --> ส่งเมลเตือนงานที่ครบกำหนด | 6 ขั้น", "ส่งเมลเตือนงานที่ครบกำหนด | 6 ขั้น -.-> ถ้ามีขั้นไหนพัง | 2 ขั้น |ถ้าพัง|"].sort()),
    "เส้นที่ข้ามกรอบย้ายไปต่อกับกล่องที่ย่อ เส้นซ้ำรวมเป็นเส้นเดียว", JSON.stringify(c.edges));
  ck(!applyView(m, "collapse").groups.length && m.groups.length === 3, "ย่อแล้วไม่มีกรอบเหลือ และไม่แก้ผังเดิม");
  const loopOpt = opts.find((v) => v.includes("For each item"));
  const f = applyView(m, loopOpt); const fs = shape(f);
  ck(same(fs.nodes, ["ประกอบเนื้อเมล [step]", "ส่งเมลถึงผู้รับผิดชอบ [step]"]) && same(fs.edges, ["ประกอบเนื้อเมล --> ส่งเมลถึงผู้รับผิดชอบ"]) && f.title === "วนทีละรายการ: For each item",
    "ดูข้างในกรอบวน: เหลือแค่ของข้างใน ชื่อผังเป็นชื่อกรอบ (ใช้ตั้งชื่อไฟล์)", JSON.stringify(fs));
  const t = applyView(m, opts.find((v) => v.startsWith("in:g1:")));
  ck(t.nodes.length === 6 && t.groups.length === 1 && t.groups[0].parent === null, "ดูข้างในกรอบ Try: กรอบวนข้างในขึ้นมาเป็นกรอบชั้นบน ไม่มีเส้นลอยออกนอกกรอบ");
  ck(applyView(m, "in:g1:ชื่อที่ไม่มีแล้ว") === m && applyView(m, "collapse").nodes.length === 3, "ตัวเลือกเก่าที่ไม่ตรงกับผังแล้ว (แก้ JSON จนกรอบหาย) กลับไปดูทั้ง flow");
  ck(viewOptions(model(fx("parallel.json"))).length === 0, "flow ที่ไม่มีกรอบ ไม่มีตัวเลือกให้งง");
  const block = applyView(model(fx("14-pa-flow.json")), "collapse");
  ck(block.nodes.length === 6 && block.groups.length === 1 && block.nodes.some((n) => n.text === "วนทีละรายการ | 2 ขั้น"),
    "ก้อนที่คัดลอกจาก Scope (ทั้ง flow อยู่ในกรอบเดียว) ย่อกรอบชั้นถัดเข้าไป ไม่ใช่ยุบทั้งผังเหลือกล่องเดียว");
  const acts = {}; let prev = null;
  for (let s = 1; s <= 4; s++) {
    const inner = {}; let p = null;
    for (let i = 1; i <= 8; i++) { const k = `Step_${s}_${i}`; inner[k] = { type: "Compose", runAfter: p ? { [p]: ["Succeeded"] } : {} }; p = k; }
    acts[`Stage_${s}`] = { type: "Scope", runAfter: prev ? { [prev]: ["Succeeded"] } : {}, actions: inner }; prev = `Stage_${s}`;
  }
  const big = model(JSON.stringify({ definition: { actions: acts } }));
  ck(big.nodes.length === 32 && big.warnings.some((w) => w.text.includes(String(PA_BIG)) && /ย่อกลุ่ม/.test(w.text)), "flow เกิน 25 กล่อง เตือนพร้อมชี้ว่าย่อกลุ่มได้");
  const bc = applyView(big, "collapse");
  ck(bc.nodes.length === 4 && bc.edges.length === 3, "ย่อแล้วเหลือ 4 กล่องต่อกันเป็นสาย ใส่สไลด์เดียวได้", `${bc.nodes.length} กล่อง ${bc.edges.length} เส้น`);
}

console.log("\n━━ ⑥ Mermaid ของผัง Power Automate ━━");
{
  const out = toMermaid(model(fx("trycatch.json")));
  ck(/n1\(\["ทุกวัน 8 โมงเช้า"\]\)/.test(out) && /\(\["จบแบบล้มเหลว"\]\)/.test(out), "ตัวเริ่ม flow กับ Terminate เป็นแคปซูล");
  ck(!/\(\["ประกอบเนื้อเมล"\]\)|\(\["ส่งเมลถึงผู้รับผิดชอบ"\]\)/.test(out), "‼️ ขั้นสุดท้ายในกรอบวนไม่เป็นแคปซูล (ไม่ใช่จุดจบของ flow)");
  ck((out.match(/direction TB/g) || []).length === 3 && /subgraph g2[^]*?end[^]*?end/.test(out), "ทุกกรอบมี direction TB (หลุม H1) กรอบวนซ้อนอยู่ในกรอบ Try");
  ck(/-\.->\|"ถ้าพัง"\|/.test(out) && /flowchart TD/.test(out), "เส้น ถ้าพัง เป็นเส้นประ ผังบนลงล่าง");
}

console.log("\n━━ ⑦ ตัวอย่างในช่องพิมพ์ทั้งสองภาษา ━━");
for (const lang of ["th", "en"]) {
  const r = parsePA(SAMPLES[lang].pa);
  ck(r.model && r.model.nodes.length === 9 && r.model.groups.length === 3 && !r.model.warnings.length, `ตัวอย่างภาษา ${lang} อ่านผ่าน 9 กล่อง 3 กรอบ ไม่มีคำเตือน`);
  ck(prunePA(SAMPLES[lang].pa) === SAMPLES[lang].pa, `ตัวอย่างภาษา ${lang} เป็นรูปแบบเดียวกับที่ตัดแล้วเป๊ะ (วางซ้ำแล้วไม่เปลี่ยน)`);
}

console.log("\n━━ ⑧ แก้จุดเสียบเส้นของกรอบซ้อน (flow/src/engine.js) ━━");
{
  const x = nestedXml();
  const out = fixNestedEdges(x);
  /* สไตล์อยู่ที่ mxCell ข้างใน UserObject ที่ถือ id (อ่านผิดชั้นแล้วได้ค่าว่าง ข้อข้างล่างจะผ่านหลอก จึงคืนคำว่าไม่เจอแทน) */
  const style = (id) => (out.match(new RegExp(`id="${id}">\\s*<mxCell\\b[^>]*?style="([^"]*)"`)) || [])[1] ?? "(ไม่เจอ)";
  ck(style("E5").includes("curved=1") && !/entry|exit/.test(style("E5")), "‼️ เส้นในกรอบซ้อน (กรอบวนใน Try) ล้างจุดเสียบที่ draw.io คำนวณผิด", style("E5"));
  ck(style("E6").includes("curved=1") && !/entry|exit/.test(style("E6")), "‼️ เส้นจากกรอบชั้นแรกดิ่งเข้ากล่องในกรอบชั้นที่สาม ล้างจุดเสียบด้วย (ผัง nested3)", style("E6"));
  ck(style("E7").includes("exitX=0.5;exitY=1;entryX=0.5;entryY=0") && style("E5").includes("curved=1"), "เส้นในกรอบชั้นเดียวไม่ถูกแตะ สไตล์อื่นของเส้นอยู่ครบ", style("E7"));
  const flat = nestedXml(true);
  ck(fixNestedEdges(flat) === flat && flat.includes("entryY=1"),
    "ผังไม่มีกรอบซ้อน (ผังที่พิมพ์ทุกชนิด) ได้ XML เดิมทุกตัวอักษร แม้มีจุดเสียบแปลก ๆ ก็ไม่แตะ");
}

function nestedXml(flat = false) {
  /* โครงเดียวกับที่ draw.io คืนมาจริง: กรอบเป็น UserObject mermaidId="n:g" ห่อ mxCell , เส้นเป็น mxCell edge="1" ที่ parent คือกรอบที่ครอบ */
  const grp = (id, gid, parent) => `<UserObject label="${gid}" mermaidId="n:${gid}" id="${id}"><mxCell style="verticalAlign=top;" vertex="1" parent="${parent}"><mxGeometry x="10" y="10" width="200" height="200" as="geometry"/></mxCell></UserObject>`;
  const box = (id, nid, parent) => `<UserObject label="${nid}" mermaidId="n:${nid}" id="${id}"><mxCell style="rounded=0;" vertex="1" parent="${parent}"><mxGeometry x="20" y="40" width="80" height="40" as="geometry"/></mxCell></UserObject>`;
  const edge = (id, parent, s, t, st) => `<UserObject label="" mermaidId="e:${s}-${t}" id="${id}"><mxCell style="curved=1;endArrow=block;${st}" edge="1" parent="${parent}" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry"/></mxCell></UserObject>`;
  /* flat = กรอบทุกกรอบอยู่ชั้นบนสุด (แบบผังที่พิมพ์) เส้นชุดเดียวกัน */
  const up = (p) => (flat ? "1" : p);
  return `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${grp("G1", "g1", "1")}${grp("G2", "g2", up("G1"))}${grp("G3", "g3", up("G2"))}`
    + `${box("A", "n1", "G1")}${box("B", "n2", "G2")}${box("C", "n3", "G2")}${box("D", "n4", "G3")}${box("F", "n5", "G1")}`
    + `${edge("E5", "G2", "B", "C", "exitX=0.46;exitY=1;entryX=0.45;entryY=1;")}${edge("E6", up("G1"), "A", "D", "exitX=0.5;exitY=1;entryX=0.79;entryY=1;")}`
    + `${edge("E7", "G1", "A", "F", "exitX=0.5;exitY=1;entryX=0.5;entryY=0;")}</root></mxGraphModel>`;
}

function finish() {
  console.log(`\n${fail.length ? "❌" : "✅"} ผ่าน ${pass} ข้อ, ตก ${fail.length} ข้อ`);
  process.exit(fail.length ? 1 : 0);
}
finish();
