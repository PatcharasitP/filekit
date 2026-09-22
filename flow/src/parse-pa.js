// ─────────────────────────────────────────────────────────────────────────────
// ทางเข้า ② flow ของ Power Automate → FlowModel (แผน SPEC ข้อ 4)
//
// รับได้ 3 แบบ: ก้อนที่กดคัดลอกจากแอ็กชันแบบกล่อง (nodeId + serializedValue) , ก้อนแอ็กชันเดี่ยว (nodeData)
//              และ definition ของทั้ง flow (definition.json ในไฟล์ export , properties.definition , หรือ triggers + actions ตรง ๆ)
//
// ‼️ ของลับไม่ถูกอ่านเลย: อ่านแค่ชื่อแอ็กชัน , type , description , runAfter , ชื่อ flow และโครงซ้อน (actions , else , cases , default)
//    inputs , connection , URL , อีเมล , expression , ค่าที่เอาไปเทียบใน case ไม่มีบรรทัดไหนในไฟล์นี้แตะ
//    ผังที่แชร์ต่อจึงไม่มีทางมีของพวกนี้ , prunePA() ตัดทิ้งตั้งแต่ตอนวาง ของลับจึงไม่ค้างในช่องพิมพ์หรือ sessionStorage ด้วย
//    (tests/flow_pa.test.mjs ค้นทั้ง FlowModel , Mermaid , ข้อความที่ตัดแล้ว ส่วน tests/browser_flowpa.py ค้นใน XML กับ PNG)
// ‼️ ไม่ใช้ builder() ของ model.js เพราะตัวนั้นรวมกล่องที่ข้อความเหมือนกันเป็นกล่องเดียว
//    แอ็กชันคนละตัวที่โน้ตเหมือนกัน (เช่น "ส่งเมล" สองกิ่ง) ต้องเป็นคนละกล่อง
// ─────────────────────────────────────────────────────────────────────────────
import { tr, pl } from "../../src/i18n.js";
import { FlowError, newModel, sameKey } from "./model.js";
import { visibleLen } from "./to-mermaid.js";

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const entries = (o) => (isObj(o) ? Object.entries(o).filter(([, v]) => isObj(v)) : []);
const str = (v) => (typeof v === "string" ? v : "");
/** ผังใหญ่เกินเท่านี้เสนอให้ย่อกลุ่ม (แผน SPEC ข้อ 4 , เกณฑ์เดียวกับผังที่พิมพ์ใน parse.js) */
export const PA_BIG = 25;

const HOW = () => tr("วางได้ 2 แบบ: ก้อนที่คัดลอกจากแอ็กชันแบบกล่องใน Power Automate (เช่น Scope ที่ครอบทั้ง flow) หรือไฟล์ definition.json ของทั้ง flow",
  "Paste either a block copied from a container action in Power Automate (like a Scope around the whole flow) or the flow's definition.json");

/** ชื่อแอ็กชันเป็นคำที่คนอ่าน: Send_an_email_(V2) → Send an email (V2) , BuildEmailTable → Build Email Table */
export function readableName(name) {
  let s = String(name || "").replace(/_/g, " ");
  if (!/\s/.test(s)) s = s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  return sameKey(s);
}

/* ‼️ ป้ายกล่องจากโน้ต (description) ดูจาก flow จริงของพี่ปอนด์ 3 ตัว (W6 22/09/2026 evidence/flowkit-w6-2026-09-22):
 *    ชื่อแอ็กชันแบบ PascalCase อ่านรู้เรื่องอยู่แล้ว ส่วนโน้ตเป็น "บันทึกวิธีแก้" ยาว 90 ถึง 130 ตัว ไม่ใช่ชื่อขั้น
 *    เอาโน้ตทั้งบรรทัดเป็นป้าย กล่องกว้างเกือบ 1,000px และถูกตัดกลางคำ ("วันนี้เ…")
 *    โน้ตสั้น = ตั้งใจให้เป็นชื่อขั้น ใช้ตามเดิม , โน้ตยาว = ชื่อแอ็กชัน (ตัวหนา) กับวลีแรกของโน้ตที่ย่อตรงรอยต่อคำ */
const NOTE_MAX = 40;
/** วลีแรกของโน้ต: ตัดที่ " (" , " — " , " – " , " · " , " → " , " | " ตัวแรก (ส่วนหลังมักเป็นรายละเอียดวิธีแก้) */
function firstClause(s) {
  const at = s.search(/\s[(—–·→|]/);
  return at > 0 ? s.slice(0, at).trim() : s;
}
/** ย่อให้ไม่เกิน max ตัวที่ตาเห็น ตัดตรงรอยต่อคำไทย (Intl.Segmenter) ไม่ตัดกลางคำ */
function shorten(s, max) {
  if (visibleLen(s) <= max) return s;
  const seg = typeof Intl !== "undefined" && Intl.Segmenter
    ? [...new Intl.Segmenter("th", { granularity: "word" }).segment(s)].map((x) => x.segment) : s.split(/(\s+)/);
  let out = "";
  for (const p of seg) { if (visibleLen(out + p) > max) break; out += p; }
  return (out.replace(/[\s,+:;(\-–—·→]+$/, "") || s.slice(0, max)) + "…";
}
/** ข้อความในกล่อง */
function textOf(name, def) {
  const note = sameKey(str(def.description).split(/\r?\n/)[0]);
  const nm = readableName(name);
  if (!note) return nm || str(def.type) || "?";
  if (visibleLen(note) <= NOTE_MAX) return note;
  const clause = shorten(firstClause(note), NOTE_MAX);
  return nm ? `${nm} | ${clause}` : clause;
}
/** ตัวเริ่ม flow: ปุ่มกดเริ่มเอง key เป็น "manual" ห้วน ๆ ใช้ชื่อที่คนเห็นใน Power Automate แทน */
const triggerText = (name, def) => (!str(def.description) && name === "manual" ? tr("กดเริ่มเอง", "Manually trigger a flow") : textOf(name, def));

/** ชื่อกรอบของกล่องที่มีลูก , Apply to each กับ Do until เติมคำบอกว่าวน (แผน SPEC ข้อ 4) */
function groupTitle(type, text) {
  /* หน้าภาษาไทยเติมคำไทยเสมอ (ชื่อแอ็กชันส่วนใหญ่เป็นอังกฤษ เช่น Apply to each) หน้าอังกฤษเติมเฉพาะชื่อที่ยังไม่บอกว่าวน */
  if (type === "foreach") return tr(/^วนทีละรายการ/, /^(apply to each|for each)/i).test(text) ? text : tr("วนทีละรายการ: ", "For each: ") + text;
  if (type === "until") return tr(/^ทำซ้ำ/, /^(do until|until|repeat)/i).test(text) ? text : tr("ทำซ้ำจนกว่า: ", "Repeat until: ") + text;
  return text;
}

/** runAfter ของหนึ่งแอ็กชันก่อนหน้า → ชนิดเส้น
 *  ok = สำเร็จอย่างเดียว , always = สำเร็จหรือไม่ก็ทำ , fail = พังหรือหมดเวลา , skip = ถูกข้าม */
function statusKind(list) {
  const s = new Set((Array.isArray(list) && list.length ? list : ["Succeeded"]).map((x) => String(x).toLowerCase()));
  const ok = s.has("succeeded"), bad = s.has("failed") || s.has("timedout"), skip = s.has("skipped");
  if (ok) return bad || skip ? "always" : "ok";
  if (bad) return "fail";
  return skip ? "skip" : "ok";
}

/** หาตัวก้อนในสิ่งที่วางมา คืน null ถ้าไม่ใช่ flow ของ Power Automate */
function findRoot(o) {
  if (!isObj(o)) return null;
  if (isObj(o.serializedValue)) return { kind: "block", name: str(o.nodeId), def: o.serializedValue };
  if ("nodeData" in o && str(o.nodeId)) return { kind: "single", name: o.nodeId };
  const p = isObj(o.properties) ? o.properties : {};
  const d = isObj(p.definition) ? p.definition : isObj(o.definition) ? o.definition : (!("type" in o) ? o : null);
  if (d && (isObj(d.actions) || isObj(d.triggers))) return { kind: "flow", def: d, title: sameKey(str(p.displayName) || str(o.displayName)) };
  /* แอ็กชันเปล่า ๆ จาก "ดูโค้ด" (Peek code) มี type กับ runAfter หรือ actions เสมอ , JSON ทั่วไปที่แค่มี type ไม่นับ */
  if (str(o.type) && (isObj(o.runAfter) || isObj(o.actions))) return { kind: "block", name: "", def: o };
  return null;
}

function jsonErrorLine(text, e) {
  const msg = String((e && e.message) || "");
  let m = msg.match(/line (\d+) column \d+/i);
  if (m) return +m[1];
  m = msg.match(/position (\d+)/i);
  if (m) return text.slice(0, +m[1]).split("\n").length;
  return /end of (json|data)|unexpected end/i.test(msg) ? text.split("\n").length : 1;
}

/**
 * @param {string} text JSON ที่วางมา (ทั้งแบบเดิมจาก Power Automate และแบบที่ prunePA ตัดแล้ว)
 * @returns {{ model } | { error: FlowError } | { empty: true, kind: "pa" }}
 */
export function parsePA(text) {
  const src = String(text || "");
  if (!src.trim()) return { empty: true, kind: "pa" };
  let obj;
  try { obj = JSON.parse(src); }
  catch (e) {
    return { error: new FlowError(jsonErrorLine(src, e), tr("ข้อความนี้ยังไม่ใช่ JSON ที่ครบก้อน", "This is not complete JSON yet"),
      tr("คัดลอกจาก Power Automate ใหม่ให้ได้ทั้งก้อน ตั้งแต่ { ตัวแรกจนถึง } ตัวสุดท้าย", "Copy it from Power Automate again, the whole block from the first { to the last }")) };
  }
  const root = findRoot(obj);
  if (!root) return { error: new FlowError(1, tr("JSON นี้ไม่ใช่ flow ของ Power Automate", "This JSON is not a Power Automate flow"), HOW()) };
  const model = build(root, src);
  if (!model.nodes.length) return { error: new FlowError(1, tr("flow นี้ยังไม่มีแอ็กชันให้วาด", "This flow has no actions to draw"), HOW()) };
  return { model };
}

function build(root, src) {
  const m = newModel("pa");
  m.dir = "down";
  /* บรรทัดที่ชื่อแอ็กชันนั้นอยู่ ไว้บอกผู้ใช้ว่าคำเตือนหมายถึงตรงไหน (ชื่อแอ็กชันไม่ซ้ำกันทั้ง flow) */
  const lineOf = (name) => { const i = src.indexOf(JSON.stringify(name) + ":"); return i < 0 ? 0 : src.slice(0, i).split("\n").length; };
  const warn = (line, text) => m.warnings.push({ line, text });
  const node = (text, shape, group) => { const id = "n" + (m.nodes.length + 1); m.nodes.push({ id, text, shape, group }); return id; };
  const group = (title, parent) => { const id = "g" + (m.groups.length + 1); m.groups.push({ id, title, parent }); return id; };
  const seen = new Set();
  const edge = (from, to, label = "", style = "solid") => {
    const k = `${from}>${to}>${label}>${style}`;
    if (from === to || seen.has(k)) return;
    seen.add(k);
    m.edges.push({ from, to, label, style });
  };
  const FAIL = tr("ถ้าพัง", "if it fails"), SKIP = tr("ถ้าถูกข้าม", "if skipped"), ALWAYS = tr("ทุกกรณี", "always");

  /* หนึ่งแอ็กชัน = หนึ่งชิ้น { in: กล่องที่เส้นขาเข้าเสียบ , out: ปลายที่ไปต่อเมื่อสำเร็จ [{id, label}] , fail: กล่องที่เส้น "ถ้าพัง" ออก } */
  function action(name, def, gid) {
    const type = str(def.type).toLowerCase();
    const text = textOf(name, def);
    if (type === "if" || type === "switch") {
      const q = node(text, "ask", gid);
      const out = [];
      if (type === "if") {
        branch(q, def.actions, tr("ใช่", "Yes"), gid, out);
        branch(q, isObj(def.else) ? def.else.actions : null, tr("ไม่ใช่", "No"), gid, out);
      } else {
        for (const [cn, c] of entries(def.cases)) branch(q, c.actions, readableName(cn), gid, out);
        branch(q, isObj(def.default) ? def.default.actions : null, tr("อื่น ๆ", "Default"), gid, out);
      }
      return { in: [q], out, fail: [q] };
    }
    if (entries(def.actions).length) {           // Scope , Apply to each , Do until และกล่องแบบอื่นที่มีลูก
      const g = group(groupTitle(type, text), gid);
      const w = container(def.actions, g);
      /* ‼️ เส้น "ถ้าพัง" ของกรอบออกจากทุกปลายในกรอบ (ยิงจริง engine_probe13 เทียบ 3 แบบ ภาพ shots/pa13-sheet-a.png)
         ออกจากปลายเดียวอ่านผิดความหมาย ("บันทึกว่าไม่มีงาน" พังเท่านั้นถึงไปแจ้งผู้ดูแล)
         ออกจากตัวกรอบ (subgraph id) ความหมายตรงสุดแต่ Mermaid จัดวางเพี้ยน เส้นในกรอบวนเด้งออกนอกกรอบ */
      return { in: w.in, out: w.out, fail: [...new Set(w.out.map((t) => t.id))] };
    }
    const n = node(type === "foreach" || type === "until" ? groupTitle(type, text) : text, type === "terminate" ? "end" : "step", gid);
    return { in: [n], out: [{ id: n }], fail: [n] };
  }

  /** กิ่งของ Condition หรือ Switch: กิ่งว่างไม่มีกล่อง ปลายคือตัวคำถามพร้อมป้ายกิ่ง (ไปบรรจบขั้นถัดไปพร้อมป้าย) */
  function branch(q, actions, label, gid, out) {
    const w = container(actions, gid);
    if (!w.in.length) { out.push({ id: q, label }); return; }
    for (const i of w.in) edge(q, i, label);
    out.push(...w.out);
  }

  /** แอ็กชันหลายตัวในกล่องเดียวกัน เรียงตาม runAfter แล้วต่อเส้น คืน { in: ขั้นแรก ๆ , out: ปลายที่ไม่มีใครต่อเมื่อสำเร็จ } */
  function container(actions, gid) {
    const list = entries(actions);
    if (!list.length) return { in: [], out: [] };
    const names = list.map(([n]) => n), defs = new Map(list), at = new Map(names.map((n, i) => [n, i]));
    const deps = new Map();
    for (const n of names) {
      const ra = isObj(defs.get(n).runAfter) ? defs.get(n).runAfter : {};
      const ds = [];
      for (const [d, st] of Object.entries(ra)) {
        if (d === n) continue;
        if (!at.has(d)) {
          warn(lineOf(n), tr(`"${textOf(n, defs.get(n))}" ตั้งให้ทำต่อจาก ${d} ซึ่งไม่มีในกล่องเดียวกัน จึงวาดเป็นขั้นแรกของกล่องแทน`,
            `"${textOf(n, defs.get(n))}" runs after ${d}, which is not in the same container, so it is drawn as a first step`));
          continue;
        }
        ds.push([d, statusKind(st)]);
      }
      deps.set(n, ds);
    }
    /* เรียงก่อนหลังตาม runAfter (ลำดับประกาศกล่องมีผลกับการจัดวางของ Mermaid) เสมอกันใช้ลำดับเดิมใน JSON */
    const order = [], placed = new Set();
    while (order.length < names.length) {
      const next = names.find((n) => !placed.has(n) && deps.get(n).every(([d]) => placed.has(d)));
      if (!next) {                                 // วนกันเอง (flow จริงสร้างแบบนี้ไม่ได้ แต่ JSON ที่แก้มือทำได้)
        const rest = names.filter((n) => !placed.has(n));
        warn(lineOf(rest[0]), tr(`runAfter ของ ${rest.join(" , ")} วนกันเอง ผังอาจเรียงไม่ตรงกับที่ตั้งใจ`, `The runAfter of ${rest.join(", ")} loops back on itself, the order may look off`));
        for (const n of rest) { order.push(n); placed.add(n); }
        break;
      }
      order.push(next); placed.add(next);
    }
    const piece = new Map();
    for (const n of order) piece.set(n, action(n, defs.get(n), gid));
    const ins = [], continued = new Set();
    for (const n of order) {
      const p = piece.get(n);
      const ds = deps.get(n).filter(([d]) => piece.has(d));
      if (!ds.length) { ins.push(...p.in); continue; }
      for (const [d, kind] of ds) {
        const from = piece.get(d);
        if (kind === "ok" || kind === "always") {
          continued.add(d);
          for (const t of from.out) for (const i of p.in) edge(t.id, i, t.label || (kind === "always" ? ALWAYS : ""));
        } else {
          for (const f of from.fail) for (const i of p.in) edge(f, i, kind === "fail" ? FAIL : SKIP, "dashed");
        }
      }
    }
    return { in: ins, out: order.filter((n) => !continued.has(n)).flatMap((n) => piece.get(n).out) };
  }

  if (root.kind === "flow") {
    const starts = entries(root.def.triggers).map(([tn, t]) => node(triggerText(tn, t), "start", null));
    const w = container(root.def.actions, null);
    for (const s of starts) for (const i of w.in) edge(s, i);
    m.title = root.title;
  } else if (root.kind === "single") {
    node(readableName(root.name) || "?", "step", null);
    warn(0, tr("ก้อนนี้เป็นแอ็กชันเดียว ผังจึงมีกล่องเดียว ลองคัดลอกแอ็กชันแบบกล่อง เช่น Scope ที่ครอบทั้ง flow แทน",
      "This is a single action, so the diagram has one box. Copy a container action instead, like a Scope around the whole flow"));
  } else {
    action(root.name, root.def, null);
    m.title = textOf(root.name, root.def).split(" | ")[0];    // ชื่อไฟล์ใช้บรรทัดแรก (ชื่อแอ็กชันเมื่อโน้ตยาว)
  }
  if (m.nodes.length > PA_BIG) {
    warn(0, m.groups.length
      ? tr(`มี ${m.nodes.length} กล่อง เกิน ${PA_BIG} ใส่สไลด์เดียวจะอ่านยาก เลือกย่อกลุ่ม หรือดูทีละกลุ่ม ที่ตัวเลือกใต้ช่องพิมพ์ได้`,
           `${m.nodes.length} boxes, more than ${PA_BIG} is hard to read on one slide, collapse the groups or show one group with the option under the box`)
      : tr(`มี ${m.nodes.length} กล่อง เกิน ${PA_BIG} ใส่สไลด์เดียวจะอ่านยาก`, `${m.nodes.length} boxes, more than ${PA_BIG} is hard to read on one slide`));
  }
  return m;
}

/* ── ย่อกลุ่ม กับ ดูทีละกลุ่ม (แผน SPEC ข้อ 4: flow ใหญ่เกิน 25 แอ็กชัน) ─────────────────── */

const parentOf = (m, gid) => (m.groups.find((g) => g.id === gid) || {}).parent || null;
function under(m, gid, anc) { for (let g = gid; g; g = parentOf(m, g)) if (g === anc) return true; return false; }
const pathOf = (m, gid) => { const t = []; for (let g = gid; g; g = parentOf(m, g)) t.unshift(m.groups.find((x) => x.id === g).title.split(" | ")[0]); return t.join(" › "); };

/** กลุ่มที่ย่อได้เมื่อกด "ย่อกลุ่ม": ชั้นบนสุด แต่ถ้าทั้ง flow อยู่ในกรอบเดียว (ก้อนที่คัดลอกจาก Scope) ย่อชั้นถัดเข้าไปแทน */
function topGroups(m) {
  let tops = m.groups.filter((g) => !g.parent);
  if (tops.length === 1 && m.nodes.every((n) => n.group && under(m, n.group, tops[0].id))) tops = m.groups.filter((g) => g.parent === tops[0].id);
  return tops;
}

/** ตัวเลือกของผังนี้ [{ value, label }] ไม่มีกลุ่ม = ไม่มีตัวเลือก */
export function viewOptions(m) {
  if (!m.groups.length) return [];
  const opts = [{ value: "all", label: tr("ทั้ง flow", "The whole flow") }];
  if (topGroups(m).length) opts.push({ value: "collapse", label: tr("ย่อแต่ละกลุ่มเหลือกล่องเดียว", "Each group as one box") });
  /* ค่าของตัวเลือกมีทั้ง id และชื่อเต็มของกลุ่ม: แก้ JSON แล้วกลุ่มเลื่อนลำดับ id เดิมจะชี้ผิดกลุ่ม ชื่อไม่ตรงจึงถือว่าหาไม่เจอ */
  for (const g of m.groups) opts.push({ value: `in:${g.id}:${pathOf(m, g.id)}`, label: tr("ข้างใน ", "Inside ") + pathOf(m, g.id) });
  return opts;
}

/** ผังตามตัวเลือก ไม่แก้ก้อนเดิม , ตัวเลือกที่ไม่ตรงกับผังนี้แล้ว = ทั้ง flow */
export function applyView(m, view) {
  if (view === "collapse") return topGroups(m).length ? collapse(m) : m;
  const [, gid, ...path] = String(view || "").split(":");
  const g = String(view || "").startsWith("in:") && m.groups.find((x) => x.id === gid && pathOf(m, x.id) === path.join(":"));
  return g ? focus(m, g) : m;
}

function renumber(m, nodes, edges) {
  const id = new Map(nodes.map((n, i) => [n.id, "n" + (i + 1)]));
  const seen = new Set();
  return { ...m, nodes: nodes.map((n) => ({ ...n, id: id.get(n.id) })),
    edges: edges.map((e) => ({ ...e, from: id.get(e.from), to: id.get(e.to) })).filter((e) => {
      const k = `${e.from}>${e.to}>${e.label}>${e.style}`;
      if (!e.from || !e.to || e.from === e.to || seen.has(k)) return false;
      seen.add(k); return true;
    }) };
}

function collapse(m) {
  const tops = topGroups(m);
  const into = new Map();                          // กล่องเดิม → กล่องที่ย่อแล้ว
  const nodes = [], gone = new Set();
  for (const n of m.nodes) {
    const t = n.group && tops.find((g) => under(m, n.group, g.id));
    if (!t) { nodes.push(n); continue; }
    if (!into.has(t.id)) {
      const count = m.nodes.filter((x) => x.group && under(m, x.group, t.id)).length;
      const c = { id: "c" + t.id, text: `${t.title} | ${tr(`${count} ขั้น`, pl(count, "step", "steps"))}`, shape: "step", group: t.parent };
      into.set(t.id, c); nodes.push(c);
    }
    into.set(n.id, into.get(t.id));
    for (const g of m.groups) if (under(m, g.id, t.id)) gone.add(g.id);
  }
  const map = (id) => (into.has(id) ? into.get(id).id : id);
  return renumber({ ...m, groups: m.groups.filter((g) => !gone.has(g.id)) }, nodes, m.edges.map((e) => ({ ...e, from: map(e.from), to: map(e.to) })));
}

function focus(m, g) {
  const keep = new Set(m.nodes.filter((n) => n.group && under(m, n.group, g.id)).map((n) => n.id));
  const nodes = m.nodes.filter((n) => keep.has(n.id)).map((n) => ({ ...n, group: n.group === g.id ? null : n.group }));
  const groups = m.groups.filter((x) => x.id !== g.id && under(m, x.id, g.id)).map((x) => ({ ...x, parent: x.parent === g.id ? null : x.parent }));
  return renumber({ ...m, title: g.title, groups }, nodes, m.edges.filter((e) => keep.has(e.from) && keep.has(e.to)));
}

/* ── ตัดของลับทิ้งตั้งแต่ตอนวาง ─────────────────────────────────────────────── */

const pruneRunAfter = (ra) => Object.fromEntries(Object.entries(isObj(ra) ? ra : {}).map(([k, v]) => [k, Array.isArray(v) ? v.filter((x) => typeof x === "string") : []]));
const pruneActions = (acts) => Object.fromEntries(entries(acts).map(([k, v]) => [k, pruneAction(v)]));
function pruneAction(def) {
  const o = {};
  if (str(def.type)) o.type = def.type;
  if (str(def.description)) o.description = def.description;
  if ("runAfter" in def) o.runAfter = pruneRunAfter(def.runAfter);
  if (isObj(def.actions)) o.actions = pruneActions(def.actions);
  if (isObj(def.else)) o.else = { actions: pruneActions(def.else.actions) };
  if (isObj(def.cases)) o.cases = Object.fromEntries(entries(def.cases).map(([k, c]) => [k, { actions: pruneActions(c.actions) }]));
  if (isObj(def.default)) o.default = { actions: pruneActions(def.default.actions) };
  return o;
}

/**
 * JSON ที่วางมา เหลือแค่โครงที่ใช้วาด (ชื่อ , type , description , runAfter , ลูก) จัดย่อหน้าให้อ่านได้
 * คืน null ถ้าไม่ใช่ flow ของ Power Automate (ใช้ตัดสินตอนวางด้วยว่าต้องสลับมาหน้า Power Automate ไหม)
 * ‼️ ผลลัพธ์ไม่ใช่ flow ที่เอากลับไปวางใน Power Automate ได้ เพราะค่าในแอ็กชันถูกตัดทิ้งหมด
 */
export function prunePA(text) {
  let o;
  try { o = JSON.parse(String(text || "")); } catch { return null; }
  const r = findRoot(o);
  if (!r) return null;
  let out;
  if (r.kind === "single") out = { nodeId: r.name, nodeData: {} };
  else if (r.kind === "block") out = r.name ? { nodeId: r.name, serializedValue: pruneAction(r.def) } : pruneAction(r.def);
  else {
    const triggers = Object.fromEntries(entries(r.def.triggers).map(([k, t]) => [k, { ...(str(t.type) ? { type: t.type } : {}), ...(str(t.description) ? { description: t.description } : {}) }]));
    out = { ...(r.title ? { displayName: r.title } : {}), definition: { triggers, actions: pruneActions(r.def.actions) } };
  }
  return JSON.stringify(out, null, 2);
}
