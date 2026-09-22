// ─────────────────────────────────────────────────────────────────────────────
// FlowModel เป็นข้อความ Mermaid ให้ draw.io จัดวาง (จุดเดียวในทั้งระบบที่รู้จัก Mermaid)
//
// ทุกกติกาในไฟล์นี้มาจากการยิงจริงกับ draw.io ตัวฝัง (แผน FlowKit ข้อ 1.3, 3.6, D6)
// ไม่ใช่รสนิยม และไม่ใช่สิ่งที่เอกสารของ Mermaid เขียนไว้
// ─────────────────────────────────────────────────────────────────────────────

/* ── escape (แผน 3.6 พิสูจน์ครบแล้ว) ────────────────────────────────────────
 * ห่อทุกชิ้นด้วย "..." แล้วแทนอักขระที่ชนไวยากรณ์ด้วยรหัส
 * ‼️ วงเล็บทุกแบบต้องแทนด้วย แม้ห่อด้วยเครื่องหมายคำพูดแล้ว (หลุม H2)
 *    ไม่งั้นข้อความ "[เหลี่ยม] {ปีกกา}" ถูกตัดกลางกล่องที่ ] โดยไม่มีอะไรฟ้อง
 * ‼️ \ ไม่ต้องแทน ใส่ตัวเดียวได้ตัวเดียว
 * แทนทีเดียวด้วย regex ตัวเดียว อักขระแต่ละตัวจึงไม่ถูกแทนซ้ำสองรอบ (# ของรหัสไม่ถูกแทนเป็น #35;) */
const ESC = {
  '"': "#quot;", "<": "#lt;", ">": "#gt;", "&": "#amp;", "#": "#35;",
  "[": "#91;", "]": "#93;", "{": "#123;", "}": "#125;", "(": "#40;", ")": "#41;",
};
export const esc = (s) => String(s).replace(/[#"<>&[\]{}()]/g, (c) => ESC[c]);

/** ข้อความในกล่อง: " | " = ขึ้นบรรทัดใหม่ บรรทัดแรกตัวหนา (แผน 3.1) แท็ก HTML เป็นของเราเอง ส่วนของผู้ใช้ escape ทุกชิ้น */
export function label(text) {
  const parts = String(text).split(" | ").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return esc(parts[0] ?? "");
  return `<b>${esc(parts[0])}</b><br/>` + parts.slice(1).map(esc).join("<br/>");
}

/* ความยาวที่ตามองเห็น (สระบนล่างกับวรรณยุกต์ไทยไม่กินที่) ใช้ตัดสินรูปทรงของคำถาม */
const THAI_MARK = /[ัิ-ฺ็-๎]/g;
export const visibleLen = (s) => String(s).replace(THAI_MARK, "").length;

/** คำถามไม่เกินเท่านี้ = ข้าวหลามตัด ยาวกว่า = หกเหลี่ยม (หลุม H3: ข้าวหลามตัดโตตามคำถาม ผังสูงเกินสไลด์) */
export const ASK_DIAMOND_MAX = 18;
/** ผังองค์กรที่มีใบเกินเท่านี้ วางซ้ายไปขวา (หลุม H4: 15 กล่องบนลงล่างกว้าง 2,931px อ่านไม่ออก) */
export const ORG_LEAVES_LR = 8;

function shapeOf(node, isStartOrEnd) {
  const t = `"${label(node.text)}"`;
  if (node.shape === "ask") return visibleLen(node.text) <= ASK_DIAMOND_MAX ? `{${t}}` : `{{${t}}}`;
  if (isStartOrEnd) return `([${t}])`;
  return `[${t}]`;
}

function direction(m) {
  if (m.dir === "down") return "TD";
  if (m.dir === "right") return "LR";
  if (m.kind === "timeline") return "LR";
  if (m.kind === "org") {
    const hasChild = new Set(m.edges.map((e) => e.from));
    const leaves = m.nodes.filter((n) => !hasChild.has(n.id)).length;
    return leaves > ORG_LEAVES_LR ? "LR" : "TD";
  }
  return "TD";    // ขั้นตอนกับระบบ บนลงล่างเสมอ (ขั้นตอนซ้ายไปขวาได้ 4,293px , ระบบซ้ายไปขวาป้ายทับกัน H5)
}

const ARROW = { solid: "-->", dashed: "-.->", plain: "---", both: "<-->" };

export function toMermaid(m) {
  const out = [`flowchart ${direction(m)}`];
  const outgoing = new Set(m.edges.map((e) => e.from));
  const first = m.nodes[0] ? m.nodes[0].id : null;
  /* กล่องแรกกับกล่องที่ไม่มีเส้นออกเป็นแคปซูล เห็นจุดเริ่มกับจุดจบทันที (D6) เฉพาะผังขั้นตอน */
  const capsule = (n) => m.kind === "steps" && n.shape !== "ask" && (n.id === first || !outgoing.has(n.id));

  const byGroup = new Map();
  for (const n of m.nodes) if (n.group) (byGroup.get(n.group) || byGroup.set(n.group, []).get(n.group)).push(n);
  const childGroups = new Map();
  for (const g of m.groups) if (g.parent) (childGroups.get(g.parent) || childGroups.set(g.parent, []).get(g.parent)).push(g);
  const groupById = new Map(m.groups.map((g) => [g.id, g]));
  const rootOf = (gid) => { let g = groupById.get(gid); while (g && g.parent) g = groupById.get(g.parent); return g; };

  const emitted = new Set();
  const emitGroup = (g, pad) => {
    if (emitted.has(g.id)) return;
    emitted.add(g.id);
    out.push(`${pad}subgraph ${g.id}["${label(g.title)}"]`);
    out.push(`${pad}  direction TB`);          // ‼️ ทุกกลุ่มต้องมี direction ไม่งั้นกลุ่มซ้อนยุบทับกัน (หลุม H1)
    for (const c of childGroups.get(g.id) || []) emitGroup(c, pad + "  ");
    for (const n of byGroup.get(g.id) || []) out.push(`${pad}  ${n.id}${shapeOf(n, capsule(n))}`);
    out.push(`${pad}end`);
  };
  /* ประกาศกลุ่มตรงจุดที่เจอกล่องแรกของกลุ่ม ลำดับการประกาศมีผลกับการจัดวางของ Mermaid */
  for (const n of m.nodes) {
    if (n.group) { const r = rootOf(n.group); if (r) emitGroup(r, "  "); continue; }
    out.push(`  ${n.id}${shapeOf(n, capsule(n))}`);
  }
  for (const g of m.groups) if (!g.parent) emitGroup(g, "  ");   // กลุ่มว่าง (ไม่มีกล่อง) ก็ยังต้องมี

  for (const e of m.edges) {
    const a = ARROW[e.style] || ARROW.solid;
    out.push(e.label ? `  ${e.from} ${a}|"${esc(e.label)}"| ${e.to}` : `  ${e.from} ${a} ${e.to}`);
  }

  /* หน้าตาของเราเอง ห้ามใช้สีม่วงตั้งต้นของ Mermaid (P14 , W3 เคาะแล้ว: ขาวเทา เส้นบาง) */
  out.push("  classDef default fill:#ffffff,stroke:#8a8f98,stroke-width:1px,color:#14161c");
  const asks = m.nodes.filter((n) => n.shape === "ask").map((n) => n.id);
  if (asks.length) {
    out.push("  classDef q fill:#f4f3f0,stroke:#8a8f98,stroke-width:1px,color:#14161c");
    out.push(`  class ${asks.join(",")} q`);
  }
  if (m.edges.length) out.push("  linkStyle default stroke:#8a8f98,stroke-width:1px");
  return out.join("\n") + "\n";
}
