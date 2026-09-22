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

console.log("\n━━ ยืดผังระบบ กันป้ายเส้นเบียดกัน (พี่ปอนด์ทัก 22/09/2026) ━━");
{
  const { stretchXY } = await imp("flow/src/engine.js");
  const { STRETCH } = await imp("flow/src/to-mermaid.js");
  const xml = '<UserObject label="กลุ่ม" mermaidId="n:g1" id="2"><mxCell style="x" vertex="1" parent="1"><mxGeometry x="10" y="100" width="300" height="200" as="geometry"/></mxCell></UserObject>'
    + '<UserObject label="ในกลุ่ม" mermaidId="n:n1" id="3"><mxCell style="x" vertex="1" parent="2"><mxGeometry x="20" y="150" width="80" height="40" as="geometry"/></mxCell></UserObject>'
    + '<mxCell edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="5" y="60" as="sourcePoint"/><Array as="points"><mxPoint x="50" y="80"/></Array></mxGeometry></mxCell>'
    + '<mxCell value="ป้าย" vertex="1" connectable="0" parent="4"><mxGeometry x="-0.2" y="12" relative="1" as="geometry"><mxPoint x="3" y="7" as="offset"/></mxGeometry></mxCell>';
  const out = stretchXY(xml, 2, 1.5);
  ck(/mermaidId="n:g1"[^]*?x="20" y="150" width="600" height="300"/.test(out), "กรอบกลุ่มยืดตำแหน่ง กว้าง และสูง กล่องข้างในไม่ล้นกรอบ");
  ck(/mermaidId="n:n1"[^]*?x="40" y="225" width="80" height="40"/.test(out), "กล่องธรรมดายืดแค่ตำแหน่ง ขนาดกล่องเท่าเดิม");
  ck(out.includes('<mxPoint x="10" y="90" as="sourcePoint"/>') && out.includes('<mxPoint x="100" y="120"/>'), "จุดหักของเส้นยืดตามทั้งสองแนว");
  ck(out.includes('<mxGeometry x="-0.2" y="12" relative="1" as="geometry">') && out.includes('<mxPoint x="3" y="7" as="offset"/>'), "ตำแหน่งป้ายบนเส้น (relative กับ offset) ไม่ถูกแตะ");
  /* ‼️ draw.io เขียน height ก่อน width และตัด y ที่เป็น 0 ทิ้ง (เห็นจาก XML จริงของผัง 09-dataflow)
        ตัวยืดที่หา width ตามด้วย height เลยจับกรอบกลุ่มไม่เจอ กล่องล้นกรอบบน contact sheet */
  const real = '<UserObject label="แหล่งข้อมูล" mermaidId="n:g1" id="2"><mxCell style="x" vertex="1" parent="1"><mxGeometry height="124" width="483" x="261.9" as="geometry" /></mxCell></UserObject>';
  ck(/height="186" width="966" x="523.8"/.test(stretchXY(real, 2, 1.5)), "‼️ กรอบกลุ่มแบบที่ draw.io เขียนจริง (height ก่อน width) ก็ยืดกว้างและสูงตาม", stretchXY(real, 2, 1.5).match(/<mxGeometry[^>]*>/)[0]);
  ck(stretchXY(xml) === xml && STRETCH.system.x > 1 && STRETCH.system.y > 1 && !STRETCH.steps,
    "‼️ ผังระบบยืดทั้งสองแนว (ยืดแนวตั้งอย่างเดียว v149 ป้ายยังเบียด) ผังขั้นตอนไม่ยืด");
}

console.log("\n━━ ผังองค์กรเส้นหักฉากมุมมน (พี่ปอนด์เลือกแบบ ค) 22/09/2026) ━━");
{
  const { elbowEdges } = await imp("flow/src/engine.js");
  const { edgeElbow } = await imp("flow/src/to-mermaid.js");
  /* หน้าตาแบบที่ draw.io แปลงจาก Mermaid จริง: เส้นโค้งออกหลายจุด มีจุดหัก และเส้นหนึ่งออกข้างกล่อง (exitX=1) */
  const xml = '<root><mxCell id="0"/><mxCell id="1" parent="0"/>'
    + '<UserObject label="หัวหน้า" mermaidId="n:A" id="2"><mxCell style="rounded=0;whiteSpace=wrap;" vertex="1" parent="1"><mxGeometry x="100" width="120" height="50" as="geometry"/></mxCell></UserObject>'
    + '<UserObject label="ลูกทีม" mermaidId="n:B" id="3"><mxCell style="rounded=0;" vertex="1" parent="1"><mxGeometry x="40" y="120" width="120" height="50" as="geometry"/></mxCell></UserObject>'
    + '<mxCell id="4" style="curved=1;startArrow=none;endArrow=none;strokeColor=#8a8f98;exitX=0.09;exitY=1;entryX=0.5;entryY=0;fontFamily=Sarabun;" edge="1" parent="1" source="2" target="3"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="200" y="87"/></Array></mxGeometry></mxCell>'
    + '<mxCell id="5" style="curved=1;endArrow=none;exitX=1;exitY=0.81;entryX=0.5;entryY=0;" edge="1" parent="1" source="2" target="3"><mxGeometry relative="1" as="geometry"><Array as="points" /></mxGeometry></mxCell>'
    + '<mxCell id="6" style="endArrow=none;" edge="1" parent="1" source="2" target="3"/>'
    + '<mxCell id="7" value="" style="text;rounded=1;" vertex="1" parent="1"><mxGeometry width="10" height="10" as="geometry"><Array as="points"><mxPoint x="1" y="1"/></Array></mxGeometry></mxCell></root>';
  const v = elbowEdges(xml, "v");
  const es = [...v.matchAll(/<mxCell id="([456])" style="([^"]*)"/g)].map((m) => m[2]);
  ck(es.length === 3 && es.every((s) => s.endsWith("edgeStyle=elbowEdgeStyle;elbow=vertical;rounded=1;exitX=0.5;exitY=1;entryX=0.5;entryY=0;")),
    "‼️ ทุกเส้นเป็นหักฉากแนวตั้งมุมมน ออกกลางก้นกล่อง เข้ากลางหัวกล่อง (รวมเส้นที่เดิมออกข้างกล่อง)", es.join(" | "));
  ck(!/curved=1|exitX=0\.09|exitX=1;|exitY=0\.81/.test(es.join(";")), "จุดออกเดิมของ Mermaid กับเส้นโค้งถูกล้างหมด ไม่ซ้อนกับของใหม่", es.join(" | "));
  ck(es[0].startsWith("startArrow=none;endArrow=none;strokeColor=#8a8f98;fontFamily=Sarabun;") && es[2].startsWith("endArrow=none;"),
    "สไตล์อื่นของเส้นยังอยู่ครบ (สีเส้น ไม่มีหัวลูกศร ฟอนต์)", es[0]);
  const e45 = v.split('<mxCell id="6"')[0].split('<mxCell id="4"')[1];
  ck(!/x="200" y="87"/.test(e45) && (e45.match(/<Array as="points"><mxPoint x="160" y="85"\/><\/Array>/g) || []).length === 2,
    "‼️ จุดหักเก่าของ Mermaid ถูกล้าง เหลือจุดหักร่วมจุดเดียวกึ่งกลางช่องว่างใต้หัวหน้า (ถ้าเหลือจุดเก่า เส้นหักฉากจะอ้อมไปตามจุดเดิม)", e45);
  /* ‼️ ลูกน้องกล่องสูงไม่เท่ากัน (ชื่อ | ตำแหน่ง สองบรรทัด) Dagre จัดกึ่งกลางแถว หัวกล่องจึงไม่เท่ากัน เส้นแนวนอนเคยแตกเป็นขั้นบันได (bus-mixed.png 22/09/2026) */
  const box = (id, x, y, w, h) => `<UserObject label="${id}" mermaidId="n:${id}" id="${id}"><mxCell style="rounded=0;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell></UserObject>`;
  const edge = (id, s2, t) => `<mxCell id="${id}" style="curved=1;endArrow=none;" edge="1" parent="1" source="${s2}" target="${t}"><mxGeometry relative="1" as="geometry" /></mxCell>`;
  const mixed = "<root>" + box("P", 100, 0, 100, 40) + box("C1", 20, 100, 120, 60) + box("C2", 180, 110, 120, 40) + edge("e1", "P", "C1") + edge("e2", "P", "C2") + "</root>";
  const mv = elbowEdges(mixed, "v");
  ck((mv.match(/<mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="150" y="70"\/><\/Array><\/mxGeometry>/g) || []).length === 2,
    "‼️ ลูกน้องกล่องสูงไม่เท่ากัน ทุกเส้นใช้จุดหักเดียวกัน (เส้นแนวนอนระดับเดียว ไม่เป็นขั้นบันได)", mv.match(/<mxPoint[^>]*>/g));
  const mh = elbowEdges(mixed.replace('x="20" y="100"', 'x="150" y="0"').replace('x="180" y="110"', 'x="170" y="60"').replace('x="100" y="0" width="100"', 'x="0" y="20" width="80"'), "h");
  ck((mh.match(/<mxPoint x="115" y="40"\/>/g) || []).length === 2, "ผังซ้ายไปขวา ลูกน้องกล่องกว้างไม่เท่ากัน ทุกเส้นใช้เส้นตั้งร่วมเส้นเดียว", mh.match(/<mxPoint[^>]*>/g));
  ck(v.includes('style="rounded=0;whiteSpace=wrap;"') && v.includes('style="rounded=0;"') && v.includes('<mxCell id="7" value="" style="text;rounded=1;" vertex="1" parent="1"><mxGeometry width="10" height="10" as="geometry"><Array as="points"><mxPoint x="1" y="1"/></Array>'),
    "‼️ กล่องไม่ถูกแตะเลย รวมกล่องที่อยู่ถัดจากเส้นแบบปิดในแท็กเดียว (กันกินเลยไปถึง </mxCell> ของกล่องถัดไป)");
  const h = elbowEdges(xml, "h");
  ck([...h.matchAll(/edgeStyle=elbowEdgeStyle;elbow=horizontal;rounded=1;exitX=1;exitY=0\.5;entryX=0;entryY=0\.5;/g)].length === 3, "ผังซ้ายไปขวา ออกกลางขอบขวา เข้ากลางขอบซ้าย");
  ck(elbowEdges(xml, null) === xml && elbowEdges(xml, "x") === xml, "ไม่ได้สั่ง (ผังชนิดอื่น) ได้ XML เดิมทุกตัวอักษร");
  /* ‼️ ตัวจัดวางใหม่ (mxHierarchicalLayout) เติม noEdgeStyle=1;orthogonal=1 ปิดเส้นหักฉากทิ้ง เส้นกลายเป็นเส้นเฉียง (relayout-sheet.png 22/09/2026) */
  const laid = elbowEdges(xml.replace('style="endArrow=none;"', 'style="edgeStyle=elbowEdgeStyle;elbow=vertical;noEdgeStyle=1;orthogonal=1;endArrow=none;"'), "v");
  ck(!/noEdgeStyle|orthogonal=/.test(laid) && /<mxCell id="6" style="endArrow=none;edgeStyle=elbowEdgeStyle;elbow=vertical;rounded=1;/.test(laid),
    "‼️ ใส่เส้นหักฉากซ้ำหลังจัดวางใหม่ ล้าง noEdgeStyle ที่ตัวจัดวางเติมไว้ด้วย", laid.match(/<mxCell id="6"[^>]*>/)[0]);
  const org = (lines) => parseText(lines.join("\n"), "org").model;
  const small = org(["ผู้อำนวยการ", "  ฝ่ายขาย", "    ทีมเหนือ", "  ฝ่ายบัญชี"]);
  const wide = org(["ผู้อำนวยการ", ...Array.from({ length: 9 }, (_, i) => `  ทีม ${i + 1}`)]);
  const right = parseText("ทิศ: ซ้ายไปขวา\nผู้อำนวยการ\n  ฝ่ายขาย", "org").model;
  ck(edgeElbow(small) === "v" && toMermaid(small).startsWith("flowchart TD") && edgeElbow(wide) === "h" && toMermaid(wide).startsWith("flowchart LR"),
    "ผังองค์กรบนลงล่างได้ v , ใบเกิน 8 (วางซ้ายไปขวา) ได้ h ตรงกับทิศของผังจริง");
  ck(right && toMermaid(right).startsWith("flowchart LR") && edgeElbow(right) === "h", "สั่ง ทิศ: ซ้ายไปขวา เองทั้งที่ใบน้อย เส้นหักตามทิศที่สั่ง", right && toMermaid(right).split("\n")[0]);
  ck(["steps", "system", "timeline"].every((k) => edgeElbow(parseText("ก -> ข: ส่ง\nค", k).model || { kind: k }) === null),
    "ผังขั้นตอน ระบบ ไทม์ไลน์ ไม่โดนเส้นหักฉาก (คงเส้นโค้งเดิม)");
}

console.log(`\n${fail.length ? "❌" : "✅"} ผ่าน ${pass} ข้อ, ตก ${fail.length} ข้อ`);
process.exit(fail.length ? 1 : 0);
