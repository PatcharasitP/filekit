// ─────────────────────────────────────────────────────────────────────────────
// ผัง "ระบบ" (SPEC ข้อ 3.4): หนึ่งบรรทัด = หนึ่งเส้น
//   A -> B: ป้าย   (เส้นทึบ) , A <-> B (สองทิศ) , A --> B (เส้นประ) , รับ → ↔ ⇢ ด้วย
//   [กลุ่ม] ชื่อ = ใส่กล่องในกลุ่ม ประกาศครั้งแรกที่เจอกล่องนั้นพอ ประกาศซ้ำไม่ตรงกัน = error
//   ‼️ ลูกศรต้องมีวรรคสองข้าง กันชนกับข้อความอย่าง A->B ที่เป็นชื่อของจริง
// ─────────────────────────────────────────────────────────────────────────────
import { tr } from "../../src/i18n.js";
import { builder, FlowError, sameKey } from "./model.js";
import { splitGroup } from "./parse-common.js";

const ARROWS = [[" <-> ", "both"], [" ↔ ", "both"], [" --> ", "dashed"], [" ⇢ ", "dashed"], [" -> ", "solid"], [" → ", "solid"]];

function nextArrow(s) {
  let best = null;
  for (const [tok, style] of ARROWS) {
    const at = s.indexOf(tok);
    if (at >= 0 && (!best || at < best.at || (at === best.at && tok.length > best.tok.length))) best = { at, tok, style };
  }
  return best;
}

export function parseSystem(lines, warnings = []) {
  const b = builder("system");
  b.model.warnings.push(...warnings);
  const declared = new Map();          // ข้อความกล่อง -> ชื่อกลุ่มที่ประกาศไว้
  function box(raw, lineNo) {
    const g = splitGroup(raw);
    if (!g.text) throw new FlowError(lineNo, tr("มีลูกศรแต่ไม่มีชื่อกล่องข้างหนึ่ง", "An arrow is missing a box on one side"),
      tr("เขียนชื่อทั้งสองข้าง เช่น ไฟล์ Excel -> Power Query", "Name both ends, like Excel file -> Power Query"));
    const key = sameKey(g.text);
    if (g.group !== undefined) {
      const was = declared.get(key);
      if (was !== undefined && was !== g.group) {
        throw new FlowError(lineNo, tr(`"${key}" ถูกใส่กลุ่มไว้แล้วเป็น [${was}]`, `"${key}" is already in group [${was}]`),
          tr("ประกาศกลุ่มแค่ครั้งแรกที่เจอกล่องนั้นพอ บรรทัดหลังเขียนชื่อเฉย ๆ", "Give the group only the first time a box appears"));
      }
      declared.set(key, g.group);
    }
    const existing = b.find(key);
    if (existing) {
      if (g.group && !existing.group) existing.group = b.group(g.group);
      return existing.id;
    }
    return b.node(key, "step", g.group ? b.group(g.group) : null).id;
  }
  for (const line of lines) {
    if (line.indent) throw new FlowError(line.no, tr("ผังระบบไม่ใช้ย่อหน้า", "System diagrams do not use indentation"),
      tr("เขียนทุกบรรทัดชิดซ้าย หนึ่งบรรทัดต่อหนึ่งเส้น", "Keep every line at the left edge, one line per connection"));
    let rest = line.text;
    let a = nextArrow(rest);
    if (!a) { box(rest, line.no); continue; }            // บรรทัดที่ไม่มีลูกศร = ประกาศกล่องเดี่ยว
    let from = box(rest.slice(0, a.at), line.no);
    rest = rest.slice(a.at + a.tok.length);
    while (a) {
      const next = nextArrow(rest);
      const seg = next ? rest.slice(0, next.at) : rest;
      let target = seg, lbl = "";
      if (!next) {
        const c = seg.match(/^(.+?)\s*[:：]\s+(.*)$/);      // ป้ายเส้นคือส่วนหลัง ": " ตัวแรกที่อยู่หลังลูกศร
        if (c) { target = c[1]; lbl = c[2].trim(); }
      }
      const to = box(target, line.no);
      b.edge(from, to, lbl, a.style);
      from = to;
      if (!next) break;
      rest = rest.slice(next.at + next.tok.length);
      a = next;
    }
  }
  return b.model;
}
