/* FlowKit: พิมพ์เป็นข้อความ แล้วได้ผังที่ถูกความหมาย (SPEC ข้อ 3 ของแผน FlowKit)
 *
 * ‼️ เทียบ "ความหมายของผัง" ไม่เทียบตัวอักษรของ Mermaid
 *    ชุดคำตอบใน tests/flow_golden/*.mmd เขียนมือและยิงผ่าน draw.io จริงมาแล้ว (แผนข้อ 5)
 *    แต่หน้าตา (แคปซูล หกเหลี่ยม สี ทิศ) มาทีหลังตามกติกา D6 ถ้าเทียบตัวอักษรจะแดงทุกใบโดยไม่มีอะไรผิด
 *    จึงอ่าน .mmd กลับเป็นกราฟ แล้วเทียบ: ข้อความทุกกล่อง, กล่องไหนเป็นคำถาม, ทุกเส้น (ต้น ปลาย ป้าย ชนิด), กลุ่ม
 * ‼️ ถ้าผิดจะรู้ได้ยังไง: โหมด --selftest แก้คำตอบทีละจุด (ป้ายเส้น, ปลายเส้น, กลุ่ม, ชนิดกล่อง) แล้วต้องแดงทุกจุด
 *
 * รัน: node tests/flow_parse.test.mjs  (หรือ --selftest) */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const G = join(ROOT, "tests/flow_golden");
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { parseText } = await imp("flow/src/parse.js");
const { toMermaid } = await imp("flow/src/to-mermaid.js");
const SELFTEST = process.argv.includes("--selftest");

let pass = 0; const fail = [];
const ck = (ok, msg, detail = "") => {
  if (ok) { pass++; console.log("  ✅ " + msg); }
  else { fail.push(msg); console.log("  ❌ " + msg + (detail ? "\n      " + detail : "")); }
};

/* ── ตัวอ่าน Mermaid ขนาดจิ๋ว (เฉพาะรูปแบบที่ชุดคำตอบใช้) ─────────────────── */
const UNESC = { quot: '"', lt: "<", gt: ">", amp: "&", "35": "#", "91": "[", "93": "]", "123": "{", "125": "}", "40": "(", "41": ")" };
const unesc = (s) => s.replace(/#(quot|lt|gt|amp|\d+);/g, (m, k) => UNESC[k] ?? m)
  .replace(/^<b>(.*?)<\/b><br\/>/, "$1 | ").replace(/<br\/>/g, " | ");
function readMermaid(src) {
  const nodes = new Map(), edges = [], groupOf = new Map();
  const stack = [];
  const NODE = /^(n\d+)(\(\["|\{\{"|\{"|\["|\(")(.*?)("\]\)|"\}\}|"\}|"\]|"\))$/;
  const ARROW = /^(n\d+)\s+(<-->|-\.->|-->|---)(?:\|"(.*?)"\|)?\s+(n\d+)(.*)$/;
  const STYLE = { "-->": "solid", "-.->": "dashed", "---": "plain", "<-->": "both" };
  for (const raw of src.split("\n")) {
    const line = raw.trim();
    if (!line || /^(flowchart|graph|direction|classDef|class|linkStyle)\b/.test(line)) continue;
    const sg = line.match(/^subgraph\s+(g\d+)\["(.*)"\]$/);
    if (sg) { stack.push(unesc(sg[2])); continue; }
    if (line === "end") { stack.pop(); continue; }
    const nd = line.match(NODE);
    if (nd) {
      nodes.set(nd[1], { text: unesc(nd[3]), ask: nd[2] === '{"' || nd[2] === '{{"' });
      if (stack.length) groupOf.set(nd[1], stack[stack.length - 1]);
      continue;
    }
    let rest = line;
    let m = rest.match(ARROW);
    if (!m) throw new Error("อ่านบรรทัดนี้ในชุดคำตอบไม่ออก: " + line);
    while (m) {            // รองรับเส้นต่อกันในบรรทัดเดียว n1 --> n2 --> n3
      edges.push({ from: m[1], to: m[4], label: m[3] ? unesc(m[3]) : "", style: STYLE[m[2]] });
      rest = (m[4] + m[5]).trim();
      m = m[5].trim() ? rest.match(ARROW) : null;
    }
  }
  return { nodes, edges, groupOf };
}
/** กราฟในรูปที่เทียบกันได้ (ไม่ขึ้นกับ id) */
function shapeOfGraph(nodes, edges, groupOf) {
  const t = (id) => nodes.get(id).text;
  return {
    boxes: [...nodes.values()].map((n) => n.text).sort(),
    asks: [...nodes.values()].filter((n) => n.ask).map((n) => n.text).sort(),
    edges: edges.map((e) => `${t(e.from)} =${e.style}[${e.label}]=> ${t(e.to)}`).sort(),
    groups: [...groupOf.entries()].map(([id, g]) => `${t(id)} @ ${g}`).sort(),
  };
}
function fromModel(m) {
  const nodes = new Map(m.nodes.map((n) => [n.id, { text: n.text, ask: n.shape === "ask" }]));
  const gt = new Map(m.groups.map((g) => [g.id, g.title]));
  const groupOf = new Map(m.nodes.filter((n) => n.group).map((n) => [n.id, gt.get(n.group)]));
  return shapeOfGraph(nodes, m.edges, groupOf);
}
function diff(want, got) {
  const out = [];
  for (const k of ["boxes", "asks", "edges", "groups"]) {
    const a = new Set(want[k]), b = new Set(got[k]);
    for (const x of a) if (!b.has(x)) out.push(`${k} ขาด: ${x}`);
    for (const x of b) if (!a.has(x)) out.push(`${k} เกิน: ${x}`);
  }
  return out;
}
const kindOfFile = (name) => (/org/.test(name) ? "org" : /system|dataflow/.test(name) ? "system" : /timeline/.test(name) ? "timeline" : "steps");

/* ── โหมดพิสูจน์ตัวตรวจ ───────────────────────────────────────────────────── */
if (SELFTEST) {
  console.log("\n━━ พิสูจน์ตัวตรวจ: แก้คำตอบทีละจุดแล้วต้องจับได้ทุกจุด ━━");
  const src = readFileSync(join(G, "02-renewal.mmd"), "utf8");
  const txt = readFileSync(join(G, "02-renewal.txt"), "utf8");
  const got = fromModel(parseText(txt, "steps").model);
  const base = readMermaid(src);
  ck(diff(shapeOfGraph(base.nodes, base.edges, base.groupOf), got).length === 0, "คำตอบเดิมต้องตรง (ไม่งั้นข้อข้างล่างพิสูจน์อะไรไม่ได้)");
  const MUT = [
    ["ป้ายเส้นผิด", (s) => s.replace('-->|"ไม่ต่อ"|', '-->|"ไม่ต่อสัญญา"|')],
    ["ปลายเส้นผิด", (s) => s.replace("n8 -->|\"ไม่อนุมัติ\"| n5", "n8 -->|\"ไม่อนุมัติ\"| n4")],
    ["ชนิดเส้นผิด", (s) => s.replace("n1 --> n2", "n1 -.-> n2")],
    ["คำถามกลายเป็นขั้นธรรมดา", (s) => s.replace('n6{"ค่าเช่าขึ้นเกิน 10% ไหม?"}', 'n6["ค่าเช่าขึ้นเกิน 10% ไหม?"]')],
    ["ข้อความกล่องผิดตัวเดียว", (s) => s.replace("ลงนามสัญญา", "ลงนามสัญญ")],
    ["เส้นหายไปหนึ่งเส้น", (s) => s.replace("  n9 --> n10\n", "")],
  ];
  for (const [name, f] of MUT) {
    const m = readMermaid(f(src));
    ck(diff(shapeOfGraph(m.nodes, m.edges, m.groupOf), got).length > 0, `จับได้: ${name}`);
  }
  const gsrc = readFileSync(join(G, "05-swimlane.mmd"), "utf8");
  const ggot = fromModel(parseText(readFileSync(join(G, "05-swimlane.txt"), "utf8"), "steps").model);
  const gm = readMermaid(gsrc.replace('    n3{"จำเป็นไหม?"}\n', "").replace('    n4["รับแจ้งปฏิเสธ"]', '    n4["รับแจ้งปฏิเสธ"]\n    n3{"จำเป็นไหม?"}'));
  ck(diff(shapeOfGraph(gm.nodes, gm.edges, gm.groupOf), ggot).length > 0, "จับได้: กล่องอยู่ผิดกลุ่ม");
  console.log(`\n${fail.length ? "❌" : "✅"} ผ่าน ${pass} ข้อ, ตก ${fail.length} ข้อ`);
  process.exit(fail.length ? 1 : 0);
}

/* ── ① ชุดคำตอบ 13 ใบ ─────────────────────────────────────────────────────── */
console.log("\n━━ ① พิมพ์แล้วได้ผังตรงกับชุดคำตอบที่ยิง draw.io มาแล้ว ━━");
const goldens = readdirSync(G).filter((f) => f.endsWith(".txt")).sort();
ck(goldens.length >= 13, `อ่านชุดคำตอบได้ ${goldens.length} ใบ (ต้องไม่น้อยกว่า 13)`);
for (const f of goldens) {
  const name = f.replace(/\.txt$/, "");
  const res = parseText(readFileSync(join(G, f), "utf8"), kindOfFile(name));
  if (res.error) { ck(false, `${name} อ่านได้`, `บรรทัด ${res.error.line}: ${res.error.message}`); continue; }
  const want = readMermaid(readFileSync(join(G, name + ".mmd"), "utf8"));
  const d = diff(shapeOfGraph(want.nodes, want.edges, want.groupOf), fromModel(res.model));
  ck(d.length === 0, `${name} ได้กล่อง ${res.model.nodes.length} เส้น ${res.model.edges.length} ตรงกับคำตอบ`, d.slice(0, 6).join("\n      "));
  /* ส่งออกได้เสมอ และไม่มีข้อความของผู้ใช้หลุดออกมาแบบไม่ห่อ (ทุกกล่องอยู่ใน "...") */
  const mmd = toMermaid(res.model);
  const back = readMermaid(mmd);
  ck(back.nodes.size === res.model.nodes.length && back.edges.length === res.model.edges.length,
     `${name} ส่งออกเป็น Mermaid แล้วอ่านกลับได้ครบ`);
}

/* ── ② ข้อผิดพลาดต้องบอกเลขบรรทัดกับวิธีแก้เป็นภาษาคน ───────────────────── */
console.log("\n━━ ② ข้อผิดพลาดบอกบรรทัดกับวิธีแก้ ━━");
const ERR = [
  ["บรรทัดแรกย่อหน้า", "  เริ่มงาน\nจบงานนี้", 1, "ชิดซ้าย"],
  ["ย่อหน้ากระโดดสองชั้น", "เริ่ม\nได้ไหม?\n      ได้: ต่อ", 3, "ทีละ 2 วรรค"],
  ["คำถามไม่มีคำตอบ", "เริ่ม\nได้ไหม?\nจบงานนี้", 2, "คำตอบ: ขั้นถัดไป"],
  ["ใต้คำถามไม่มีโคลอน", "เริ่ม\nได้ไหม?\n  ปิดงาน", 3, "ได้: ปิดงาน"],
  ["กลับไปหากล่องที่ไม่มี พร้อมเสนอชื่อใกล้เคียง", "ตรวจเอกสาร\nครบไหม?\n  ไม่ครบ: กลับไป: ตรวจเอกสร\n  ครบ: ส่งต่อ", 3, "ตรวจเอกสาร"],
  ["ย่อหน้าใต้ขั้นธรรมดา ขึ้นต้นด้วย ถ้า", "เริ่ม\nถ้าลูกค้าตอบรับ\n  ส่งใบเสนอราคา", 3, "ลงท้ายด้วย ?"],
  ["มีขั้นใต้คำว่า จบ", "เริ่ม\nผ่านไหม?\n  ไม่ผ่าน: แจ้งกลับ\n    จบ\n      ส่งอีเมล\n  ผ่าน: ปิดงาน", 5, "จบ"],
  ["ขั้นใต้กิ่งที่วนกลับไปแล้ว", "เริ่ม\nผ่านไหม?\n  ไม่ผ่าน: กลับไป: เริ่ม\n    ส่งอีเมล\n  ผ่าน: ปิดงาน", 4, "ย้ายขั้นเหล่านี้"],
  ["ชนิดผังที่ไม่รู้จัก", "ผัง: วงกลม\nเริ่ม", 1, "ขั้นตอน, องค์กร"],
  ["ผังระบบห้ามย่อหน้า", "ผัง: ระบบ\nA -> B\n  C -> D", 3, "ชิดซ้าย"],
  ["ผังระบบประกาศกลุ่มซ้ำไม่ตรงกัน", "ผัง: ระบบ\n[ต้นทาง] Excel -> Power Query\n[ปลายทาง] Excel -> รายงาน", 3, "ครั้งแรก"],
  ["ไทม์ไลน์ไม่มีโคลอน", "ผัง: ไทม์ไลน์\nสัปดาห์แรกเริ่มงาน", 2, "ช่วงเวลา: งาน"],
];
for (const [name, text, line, hintHas] of ERR) {
  const r = parseText(text, "steps");
  const e = r.error;
  ck(!!e && e.line === line && (e.hint + e.message).includes(hintHas),
     `${name} (บรรทัด ${line})`, e ? `ได้บรรทัด ${e.line}: ${e.message} / ${e.hint}` : "ไม่มีข้อผิดพลาดเลย");
}

/* ── ③ เคสขอบ ─────────────────────────────────────────────────────────────── */
console.log("\n━━ ③ เคสขอบ ━━");
const g = (t, k = "steps") => parseText(t, k).model;
ck(parseText("", "steps").empty === true && parseText("\n  \n// หมายเหตุ\n", "steps").empty === true, "ข้อความว่างกับมีแต่หมายเหตุ ไม่นับเป็นข้อผิดพลาด");
{
  const a = g("เริ่ม\r\nได้ไหม?\r\n  ได้: ปิด\r\n  ไม่ได้: แก้\r\n"), b = g("﻿เริ่ม\nได้ไหม?\n\tได้: ปิด\n\tไม่ได้: แก้  \n");
  ck(JSON.stringify(fromModel(a)) === JSON.stringify(fromModel(b)), "CRLF, BOM, tab, วรรคท้ายบรรทัด ได้ผังเดียวกัน");
}
{
  const m = g("1. รับเรื่อง\n2) ตรวจสอบ\n- บันทึก\n• แจ้งผล\n→ ปิดงาน\n๑. ทบทวน");
  ck(m.nodes.map((n) => n.text).join(",") === "รับเรื่อง,ตรวจสอบ,บันทึก,แจ้งผล,ปิดงาน,ทบทวน" && m.edges.length === 5, "ตัดเลขข้อกับสัญลักษณ์รายการที่ก๊อปมาวางทิ้ง");
  const n = g("ลด -30% ทุกรายการ\n1.5 เท่าของงบ");
  ck(n.nodes[0].text === "ลด -30% ทุกรายการ" && n.nodes[1].text === "1.5 เท่าของงบ", "ไม่ตัดขีดหรือเลขที่เป็นเนื้อความ");
}
{
  const m = g("เริ่ม\nผ่านไหม?\n   ผ่าน: ปิดงาน\n   ไม่ผ่าน: แก้ไข");
  ck(m.warnings.some((w) => /เลขคี่/.test(w.text)) && m.edges.length === 3, "ย่อหน้าเลขคี่ปัดลงพร้อมเตือน");
}
{
  const m = g("เริ่ม\nผ่านไหม?\n  ผ่าน: ปิดงาน");
  ck(m.warnings.some((w) => /คำตอบเดียว/.test(w.text)), "คำถามที่มีคำตอบเดียวถูกเตือน");
  const big = g(Array.from({ length: 27 }, (_, i) => `ขั้นที่ ${i + 1}`).join("\n"));
  ck(big.warnings.some((w) => /เกิน 25/.test(w.text)), "ผังเกิน 25 กล่องถูกเตือนให้แบ่งผัง");
}
{
  const m = g("เริ่ม\nต้องแก้ไหม?\n  ต้อง: แก้ไข\n  ไม่ต้อง:\nส่งงาน");
  const e = m.edges.map((x) => `${m.nodes.find((n) => n.id === x.from).text}>${x.label}>${m.nodes.find((n) => n.id === x.to).text}`);
  ck(e.includes("ต้องแก้ไหม?>ไม่ต้อง>ส่งงาน") && e.includes("แก้ไข>>ส่งงาน"), "คำตอบที่ไม่มีขั้น (ไม่ต้อง:) พาไปจุดบรรจบพร้อมป้าย");
}
{
  const m = g("สมชาย ใจดี | ผู้จัดการฝ่ายขาย\n  สมหญิง | หัวหน้าทีม", "org");
  const mmd = toMermaid(m);
  ck(mmd.includes("<b>สมชาย ใจดี</b><br/>ผู้จัดการฝ่ายขาย") && m.edges[0].style === "plain", "ผังองค์กร: ชื่อกับตำแหน่งแยกบรรทัด ชื่อตัวหนา เส้นไม่มีหัวลูกศร");
}
{
  const m = g("ผัง: ระบบ\nA -> B -> C: ส่งต่อ\nC <-> D\nE --> A: เตือน", "steps");
  const e = m.edges.map((x) => `${x.style}:${x.label}`).join(",");
  ck(m.kind === "system" && e === "solid:,solid:ส่งต่อ,both:,dashed:เตือน", "ผังระบบ: ลูกศรต่อกันในบรรทัดเดียว สองทิศ เส้นประ ป้าย และหัวไฟล์ ผัง: เลือกชนิดให้เอง");
  const k = g("ผัง: ระบบ\nชื่อไฟล์ A->B ติดกัน", "steps");
  ck(k.nodes.length === 1 && k.edges.length === 0, "ผังระบบ: ลูกศรที่ไม่มีวรรคสองข้างเป็นเนื้อความ ไม่ใช่เส้น");
}
{
  const m = g("ทิศ: ซ้ายไปขวา\nชื่อ: ขั้นตอนทดลอง\nเริ่ม\nจบงานนี้");
  ck(m.dir === "right" && m.title === "ขั้นตอนทดลอง" && toMermaid(m).startsWith("flowchart LR"), "หัวไฟล์ ทิศ: กับ ชื่อ: มีผล");
}
{
  const m = g("[ฝ่ายขาย] รับคำสั่งซื้อ\nตรวจสต็อก\n[] ส่งต่อทันที");
  const gid = (t) => m.nodes.find((n) => n.text === t).group;
  ck(gid("รับคำสั่งซื้อ") && gid("ตรวจสต็อก") === gid("รับคำสั่งซื้อ") && !gid("ส่งต่อทันที"), "กลุ่มสืบทอดจากบรรทัดก่อน และ [] ออกจากกลุ่ม");
}
{
  const m = g("ขั้นแรก\nพร้อมกัน:\n  ทางซ้าย\n    ซ้ายต่อ\n  ทางขวา\nรวมกัน");
  const txt = (id) => m.nodes.find((n) => n.id === id).text;
  const e = m.edges.map((x) => `${txt(x.from)}>${txt(x.to)}`).sort().join(",");
  ck(e === "ขั้นแรก>ทางขวา,ขั้นแรก>ทางซ้าย,ซ้ายต่อ>รวมกัน,ทางขวา>รวมกัน,ทางซ้าย>ซ้ายต่อ", "งานขนานที่สายหนึ่งมีหลายขั้น แล้วมารวมกัน");
}

console.log(`\n${fail.length ? "❌" : "✅"} ผ่าน ${pass} ข้อ, ตก ${fail.length} ข้อ`);
process.exit(fail.length ? 1 : 0);
