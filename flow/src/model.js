// ─────────────────────────────────────────────────────────────────────────────
// FlowModel — แกนกลางของ FlowKit (แผน D1)
//
// ทางเข้าทุกทาง (พิมพ์เป็นข้อ, JSON ของ Power Automate, เทมเพลต) แปลงเป็นก้อนนี้ก่อนเสมอ
// แล้วมีตัวส่งออกตัวเดียว (to-mermaid.js) จะเปลี่ยนตัววาดวันหลังก็ไม่ต้องรื้อทางเข้า
//
// { kind: "steps" | "org" | "system" | "timeline",
//   title: "", dir: "auto" | "down" | "right",
//   nodes:  [{ id, text, shape, group }]   shape: step | ask | start | end | period
//   edges:  [{ from, to, label, style }]   style: solid | dashed | plain | both
//   groups: [{ id, title, parent }]
//   warnings: [{ line, text }] }          ของที่ไม่ผิดแต่ควรบอกผู้ใช้
//
// ‼️ id ของกล่องเป็น n1, n2, ... เสมอ ไม่เอาข้อความผู้ใช้ไปทำ id (แผน 3.6)
// ─────────────────────────────────────────────────────────────────────────────

export const KINDS = ["steps", "org", "system", "timeline"];

export function newModel(kind = "steps") {
  return { kind, title: "", dir: "auto", nodes: [], edges: [], groups: [], warnings: [] };
}

/** ข้อความที่ใช้ตัดสินว่า "กล่องเดียวกัน" (ตัดวรรคหัวท้าย ยุบวรรคซ้ำ) แผน 3.1 */
export const sameKey = (s) => String(s).trim().replace(/\s+/g, " ");

/** ตัวช่วยสร้างกราฟ จำกล่องตามข้อความ ข้อความเหมือนกันเป๊ะได้กล่องเดิม */
export function builder(kind) {
  const m = newModel(kind);
  const byText = new Map();
  const groupByTitle = new Map();
  const edgeSeen = new Set();
  return {
    model: m,
    /** หา หรือสร้างกล่องจากข้อความ คืน { id, created } */
    node(text, shape = "step", group = null) {
      const key = sameKey(text);
      const hit = byText.get(key);
      if (hit) return { id: hit.id, created: false, node: hit };
      const n = { id: "n" + (m.nodes.length + 1), text: key, shape, group };
      m.nodes.push(n);
      byText.set(key, n);
      return { id: n.id, created: true, node: n };
    },
    find(text) { return byText.get(sameKey(text)) || null; },
    group(title, parent = null) {
      const key = sameKey(title);
      if (!key) return null;
      const hit = groupByTitle.get(key);
      if (hit) return hit.id;
      const g = { id: "g" + (m.groups.length + 1), title: key, parent };
      m.groups.push(g);
      groupByTitle.set(key, g);
      return g.id;
    },
    /** เส้นซ้ำ (ต้นทาง ปลายทาง ป้าย เหมือนกัน) นับเป็นเส้นเดียว ไม่งั้นบรรจบหลายกิ่งจะได้เส้นซ้อน */
    edge(from, to, label = "", style = "solid") {
      const k = `${from}>${to}>${label}>${style}`;
      if (edgeSeen.has(k)) return;
      edgeSeen.add(k);
      m.edges.push({ from, to, label, style });
    },
    warn(line, text) { m.warnings.push({ line, text }); },
  };
}

/** ข้อผิดพลาดที่ผู้ใช้แก้ได้ บอกเลขบรรทัดกับวิธีแก้เป็นภาษาคน */
export class FlowError extends Error {
  constructor(line, text, hint = "") {
    super(text);
    this.line = line;
    this.hint = hint;
  }
}
