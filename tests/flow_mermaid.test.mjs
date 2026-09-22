/* FlowKit: กติกาการส่งออกเป็น Mermaid ที่ได้จากการยิง draw.io จริง (แผนข้อ 1.3, 3.6, D6)
 * ทุกข้อในไฟล์นี้คือหลุมที่เคยเจอกับตา ถ้าใครแก้ to-mermaid.js แล้วหลุมเปิดกลับมา ข้อที่ตรงกันต้องแดง
 * รัน: node tests/flow_mermaid.test.mjs */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { toMermaid, esc, label, visibleLen, ASK_DIAMOND_MAX, ORG_LEAVES_LR } = await imp("flow/src/to-mermaid.js");
const { newModel } = await imp("flow/src/model.js");
const { parseText } = await imp("flow/src/parse.js");

let pass = 0; const fail = [];
const ck = (ok, msg, detail = "") => {
  if (ok) { pass++; console.log("  ✅ " + msg); }
  else { fail.push(msg); console.log("  ❌ " + msg + (detail ? "\n      " + detail : "")); }
};
const mm = (text, kind = "steps") => { const r = parseText(text, kind); if (r.error) throw new Error(r.error.message); return toMermaid(r.model); };

console.log("\n━━ escape (แผน 3.6 และหลุม H2) ━━");
const ALL = `"<>&#[]{}()`;
ck(esc(ALL) === "#quot;#lt;#gt;#amp;#35;#91;#93;#123;#125;#40;#41;", "แทนอักขระที่ชนไวยากรณ์ครบ 11 ตัว", esc(ALL));
ck(esc("#91;") === "#35;91;", "# ของข้อความผู้ใช้ถูกแทน ไม่ถูกเข้าใจผิดว่าเป็นรหัส");
ck(esc("ย้อน\\กลับ") === "ย้อน\\กลับ", "\\ ไม่ถูกแตะ ใส่ตัวเดียวได้ตัวเดียว");
{
  const out = mm("เริ่ม [เหลี่ยม] {ปีกกา} (กลม)\nจบงานนี้");
  ck(!/\[เหลี่ยม\]|\{ปีกกา\}|\(กลม\)/.test(out) && out.includes("#91;เหลี่ยม#93;"), "‼️ วงเล็บในข้อความถูกแทนทุกแบบ (H2 ข้อความถูกตัดกลางกล่อง)");
}
ck(label("สมชาย | ผู้จัดการ | ฝ่ายขาย") === "<b>สมชาย</b><br/>ผู้จัดการ<br/>ฝ่ายขาย", "\" | \" ขึ้นบรรทัดใหม่ บรรทัดแรกตัวหนา");
ck(label("A < B | C & D") === "<b>A #lt; B</b><br/>C #amp; D", "แท็กของเราไม่ถูก escape แต่ข้อความผู้ใช้ทุกชิ้นถูก escape");

console.log("\n━━ รูปทรง (D6) ━━");
ck(visibleLen("ได้ไหม?") === 6, "นับความยาวที่ตาเห็น สระกับวรรณยุกต์ไม่นับ");
{
  const short = mm("เริ่ม\nแก้ได้ไหม?\n  ได้: ปิด\n  ไม่ได้: ส่งต่อ");
  const long = mm("เริ่ม\nเจ้าของที่ยอมต่อสัญญาในราคาเดิมไหม?\n  ยอม: ร่างสัญญา\n  ไม่ยอม: หาที่ใหม่");
  ck(/n2\{"แก้ได้ไหม\?"\}/.test(short), `คำถามสั้น (ไม่เกิน ${ASK_DIAMOND_MAX}) เป็นข้าวหลามตัด`);
  ck(/n2\{\{"เจ้าของที่ยอมต่อสัญญาในราคาเดิมไหม\?"\}\}/.test(long), "‼️ คำถามยาวเป็นหกเหลี่ยม (H3 ข้าวหลามตัดโตจนผังสูงเกินสไลด์)");
  ck(/n1\(\["เริ่ม"\]\)/.test(short) && /n3\(\["ปิด"\]\)/.test(short), "กล่องแรกกับกล่องปลายทางเป็นแคปซูล");
}
{
  const org = mm("ประธาน\n  รองประธาน", "org");
  ck(!/\(\[/.test(org), "ผังองค์กรไม่มีแคปซูล (ไม่มีจุดเริ่มกับจุดจบ)");
}

console.log("\n━━ กลุ่ม (หลุม H1) ━━");
{
  const out = mm("[ฝ่ายขาย] รับคำสั่ง\n[คลัง] จัดของ\n[ฝ่ายขาย] แจ้งลูกค้า");
  const blocks = out.split("subgraph").length - 1;
  const dirs = (out.match(/direction TB/g) || []).length;
  ck(blocks === 2 && dirs === 2, "‼️ ทุกกลุ่มมี direction (H1 กลุ่มซ้อนยุบทับกันถ้าไม่มี)", `กลุ่ม ${blocks} direction ${dirs}`);
  const m = newModel("steps");
  m.groups.push({ id: "g1", title: "นอก", parent: null }, { id: "g2", title: "ใน", parent: "g1" });
  m.nodes.push({ id: "n1", text: "ก", shape: "step", group: "g2" }, { id: "n2", text: "ข", shape: "step", group: "g1" });
  const nest = toMermaid(m);
  ck(/subgraph g1[\s\S]*subgraph g2[\s\S]*end[\s\S]*end/.test(nest) && (nest.match(/direction TB/g) || []).length === 2, "กลุ่มซ้อนกลุ่ม ประกาศซ้อนกันถูกชั้น และมี direction ทุกชั้น");
}

console.log("\n━━ ทิศของผัง (D6 หลุม H4 H5) ━━");
ck(mm("ก\nข").startsWith("flowchart TD"), "ผังขั้นตอนบนลงล่าง");
ck(mm("ผัง: ระบบ\nA -> B: ส่ง").startsWith("flowchart TD"), "‼️ ผังระบบบนลงล่าง (H5 ซ้ายไปขวาป้ายเส้นทับกัน)");
{
  const few = "หัวหน้า\n" + Array.from({ length: ORG_LEAVES_LR }, (_, i) => `  ลูกน้อง ${i + 1}`).join("\n");
  const many = "หัวหน้า\n" + Array.from({ length: ORG_LEAVES_LR + 1 }, (_, i) => `  ลูกน้อง ${i + 1}`).join("\n");
  ck(mm(few, "org").startsWith("flowchart TD") && mm(many, "org").startsWith("flowchart LR"), `‼️ ผังองค์กรที่ใบเกิน ${ORG_LEAVES_LR} วางซ้ายไปขวา (H4 กว้างจนอ่านไม่ออก)`);
}
ck(mm("ผัง: ไทม์ไลน์\nวันที่ 1: เริ่ม\nวันที่ 2: จบ").startsWith("flowchart LR"), "ไทม์ไลน์เป็นกล่องเรียงซ้ายไปขวา (W3)");

console.log("\n━━ เส้นกับหน้าตา (P14 , W3) ━━");
{
  const out = mm("ผัง: ระบบ\nA -> B: ทึบ\nB <-> C: สองทิศ\nC --> D: ประ\nD -> E");
  ck(/n1 -->\|"ทึบ"\| n2/.test(out) && /n2 <-->\|"สองทิศ"\| n3/.test(out) && /n3 -\.->\|"ประ"\| n4/.test(out) && /n4 --> n5/.test(out), "เส้นทึบ สองทิศ ประ และเส้นไม่มีป้าย เขียนถูกรูป");
  ck(/n1 --- n2/.test(mm("ก\n  ข", "org")), "เส้นผังองค์กรไม่มีหัวลูกศร");
  const s = mm("เริ่ม\nผ่านไหม?\n  ผ่าน: ปิด\n  ไม่ผ่าน: แก้");
  ck(s.includes("classDef default fill:#ffffff,stroke:#8a8f98") && s.includes("linkStyle default stroke:#8a8f98"), "‼️ ใช้สีของเราเอง ขาวเทา เส้นบาง (ไม่ใช่สีม่วงตั้งต้นของ Mermaid)");
  ck(!/^\s*(class|style) /m.test(s), "‼️ ไม่มีคำสั่ง class หรือ style แยกบรรทัด (draw.io ข้ามทั้งบรรทัดเงียบ ๆ ต้องใช้ ::: แทน)");
  ck(!/"[^"]*"[^|\]})]*$/m.test(s.split("\n").filter((l) => /n\d+[\[({]/.test(l)).join("\n")), "ข้อความทุกกล่องอยู่ในเครื่องหมายคำพูด");
}

console.log("\n━━ เปลี่ยนฟอนต์ใน XML ที่ draw.io คืนมา (flow/src/engine.js) ━━");
{
  globalThis.location ??= { href: "http://127.0.0.1/flow/" };
  const { restyleFont, countVertices } = await imp("flow/src/engine.js");
  const xml = '<mxfile><root><UserObject label="ใช้ fontFamily=Arial ในข้อความ" mermaidBaseStyle="html=1;fontFamily=Trebuchet MS,Verdana;fontSize=16;">'
    + '<mxCell style="rounded=1;fontFamily=Trebuchet MS,Verdana,Arial,sans-serif;fontSize=16;" vertex="1" parent="1"/></UserObject>'
    + '<mxCell style="endArrow=block;" edge="1" parent="1"/><mxCell style="" vertex="1" parent="1"/></root></mxfile>';
  const out = restyleFont(xml);
  const styles = [...out.matchAll(/\s(?:style|mermaidBaseStyle)="([^"]*)"/g)].map((m) => m[1]);
  ck(styles.length === 4 && styles.every((st) => /fontFamily=Sarabun;fontSource=https%3A%2F%2Ffonts\.googleapis\.com/.test(st) && !/Trebuchet/.test(st)),
    "‼️ ทุกสไตล์เป็น Sarabun รวม mermaidBaseStyle (เคยหลุดเป็น Trebuchet เพราะแก้แค่ style)", styles.join(" | "));
  ck(out.includes('label="ใช้ fontFamily=Arial ในข้อความ"'), "ข้อความที่ผู้ใช้พิมพ์ว่า fontFamily=... ไม่ถูกแตะ");
  ck(countVertices(out) === 2, "นับกล่องได้ 2 (เส้นไม่นับ)");
  const { restyleGroups } = await imp("flow/src/engine.js");
  const g = '<UserObject label="ฝ่ายขาย" mermaidId="n:g1" mermaidBaseStyle="x"><mxCell style="verticalAlign=top;fillColor=light-dark(#ffffde,#1f2020);strokeColor=light-dark(#aaaa33,#cccccc);fontColor=light-dark(#333333,#cccccc);" vertex="1"/></UserObject>'
    + '<UserObject label="กล่องธรรมดา" mermaidId="n:n1"><mxCell style="fillColor=default;strokeColor=#8a8f98;" vertex="1"/></UserObject>';
  const gg = restyleGroups(g);
  ck(!/ffffde|aaaa33/.test(gg) && /fillColor=light-dark\(#f6f5f3,#1b1d22\)/.test(gg), "‼️ กรอบกลุ่มเลิกเป็นสีเหลืองของ Mermaid เปลี่ยนเป็นขาวเทาที่ยังสลับธีมได้");
  ck(gg.includes('mermaidId="n:n1"><mxCell style="fillColor=default;strokeColor=#8a8f98;"'), "กล่องธรรมดาไม่ถูกแตะ");
}

console.log("\n━━ ยืดผังระบบแนวตั้ง กันป้ายเส้นเบียดกัน (พี่ปอนด์ทัก 22/09/2026) ━━");
{
  const { stretchY } = await imp("flow/src/engine.js");
  const { STRETCH_Y } = await imp("flow/src/to-mermaid.js");
  const xml = '<UserObject label="กลุ่ม" mermaidId="n:g1" id="2"><mxCell style="x" vertex="1" parent="1"><mxGeometry x="10" y="100" width="300" height="200" as="geometry"/></mxCell></UserObject>'
    + '<UserObject label="ในกลุ่ม" mermaidId="n:n1" id="3"><mxCell style="x" vertex="1" parent="2"><mxGeometry x="20" y="150" width="80" height="40" as="geometry"/></mxCell></UserObject>'
    + '<mxCell edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="5" y="60" as="sourcePoint"/><Array as="points"><mxPoint x="50" y="80"/></Array></mxGeometry></mxCell>'
    + '<mxCell value="ป้าย" vertex="1" connectable="0" parent="4"><mxGeometry x="-0.2" y="12" relative="1" as="geometry"><mxPoint x="3" y="7" as="offset"/></mxGeometry></mxCell>';
  const out = stretchY(xml, 1.5);
  ck(/mermaidId="n:g1"[^]*?y="150" width="300" height="300"/.test(out), "กรอบกลุ่มยืดทั้งตำแหน่งและความสูง กล่องข้างในไม่ล้นกรอบ");
  ck(/mermaidId="n:n1"[^]*?y="225" width="80" height="40"/.test(out), "กล่องธรรมดายืดแค่ตำแหน่ง ความสูงเท่าเดิม");
  ck(out.includes('<mxPoint x="5" y="90" as="sourcePoint"/>') && out.includes('<mxPoint x="50" y="120"/>'), "จุดหักของเส้นยืดตาม");
  ck(out.includes('<mxGeometry x="-0.2" y="12" relative="1" as="geometry">') && out.includes('<mxPoint x="3" y="7" as="offset"/>'), "ตำแหน่งป้ายบนเส้น (relative กับ offset) ไม่ถูกแตะ");
  ck(stretchY(xml, 1) === xml && STRETCH_Y.system > 1 && !STRETCH_Y.steps, "ยืดเฉพาะผังระบบ ผังขั้นตอนไม่ยืด (สูงเกินสไลด์อยู่แล้ว)");
}

console.log(`\n${fail.length ? "❌" : "✅"} ผ่าน ${pass} ข้อ, ตก ${fail.length} ข้อ`);
process.exit(fail.length ? 1 : 0);
