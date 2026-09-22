// ─────────────────────────────────────────────────────────────────────────────
// ผัง "ขั้นตอน" (SPEC ข้อ 3.2)
//
//   ขั้นที่ต่อกัน เขียนชิดซ้ายเท่ากัน , ลงท้ายด้วย ? = คำถาม
//   ใต้คำถาม ย่อหนึ่งชั้น = กิ่ง เขียนว่า  คำตอบ: ขั้นถัดไป   (ขั้นต่อเนื่องของกิ่ง ย่ออีกชั้น)
//   กลับมาชิดระดับเดิม = ทุกกิ่งที่ยังเปิดอยู่มาบรรจบที่นี่
//   จบ = ปิดกิ่ง , กลับไป: ข้อความ = วนกลับ , พร้อมกัน: = งานขนาน , [ฝ่าย] ข้อความ = กลุ่ม
//
// ‼️ v1 ของแผนให้ย่อหน้าลึกลงทุกขั้น กระบวนการ 15 ขั้นเลยย่อ 15 ชั้น ใช้จริงไม่ได้
//    v2 ย่อหน้าเฉพาะตอนแตกกิ่ง เหมือนเขียนรายการข้อ ๆ ธรรมดา (ออกแบบจากการเขียนผังจริง 13 ใบ)
//
// "ปลายเปิด" (tails) คือกล่องที่รอต่อเส้นไปขั้นถัดไป พร้อมป้ายที่ติดไปกับเส้นแรก
// ─────────────────────────────────────────────────────────────────────────────
import { tr } from "../../src/i18n.js";
import { builder, FlowError } from "./model.js";
import { subtree, splitGroup, splitLabel, closest } from "./parse-common.js";

const END = /^(จบ|จบงาน)$/;
const LOOP = /^(กลับไป|ไปที่|back to|go to)\s*[:：]\s*(.+)$/i;
const PARALLEL = /^(พร้อมกัน|ทำพร้อมกัน|parallel)\s*[:：]$/i;
const isAsk = (t) => /[?？]$/.test(t);

export function parseSteps(lines, warnings = []) {
  const b = builder("steps");
  b.model.warnings.push(...warnings);
  let curGroup = null;                // กลุ่มสืบทอดจากบรรทัดก่อนหน้า (ตามลำดับในเอกสาร)

  /** กล่องจากข้อความหนึ่งชิ้น (อาจมี [กลุ่ม] นำหน้า) */
  function nodeFrom(text, lineNo, shape) {
    const g = splitGroup(text);
    if (g.group !== undefined) curGroup = g.group || null;
    if (!g.text) throw new FlowError(lineNo, tr("มีแต่ชื่อกลุ่ม ไม่มีข้อความของขั้น", "A group with no step text"),
      tr("เขียนต่อท้ายวงเล็บ เช่น [ฝ่ายบัญชี] ตรวจเอกสาร", "Write the step after the brackets, like [Finance] Check the papers"));
    if (g.text.length > 60) b.warn(lineNo, tr("ข้อความยาวเกิน 60 ตัวอักษร กล่องจะใหญ่จนอ่านยาก", "Longer than 60 characters, the box gets hard to read"));
    const gid = curGroup ? b.group(curGroup) : null;
    return b.node(g.text, shape || (isAsk(g.text) ? "ask" : "step"), gid);
  }
  const connect = (tails, id) => { for (const t of tails) b.edge(t.id, id, t.label || ""); };

  /** ขั้นเดียว (ข้อความ + ลูกของมัน) ต่อจากปลายเปิด คืนปลายเปิดใหม่ */
  function step(text, line, kids, tails) {
    if (END.test(text)) {
      if (kids.length) throw new FlowError(kids[0].no, tr("ใต้คำว่า จบ ต้องไม่มีขั้นต่อ", "Nothing can follow end"),
        tr("ลบบรรทัดที่อยู่ใต้ จบ หรือย้ายไปไว้ก่อนหน้า", "Remove the lines under end, or move them above it"));
      return [];
    }
    const loop = text.match(LOOP);
    if (loop) {
      const target = b.find(loop[2]);
      if (!target) {
        const near = closest(loop[2], b.model.nodes.map((n) => n.text));
        throw new FlowError(line.no, tr(`ไม่มีกล่องชื่อ "${loop[2]}" ให้กลับไป`, `No box called "${loop[2]}" to go back to`),
          near ? tr(`หมายถึง "${near}" หรือเปล่า`, `Did you mean "${near}"?`)
               : tr("กลับไปได้เฉพาะกล่องที่เขียนไว้ก่อนหน้าแล้ว พิมพ์ให้ตรงทุกตัวอักษร", "You can only go back to a box written above, spelled exactly the same"));
      }
      connect(tails, target.id);
      return [];                       // หลังอ้างกล่องเดิม กิ่งนั้นจบ (เส้นที่ออกจากกล่องเดิมมีอยู่แล้ว)
    }
    if (PARALLEL.test(text)) return parallel(line, kids, tails);
    if (!tails.length && b.model.nodes.length) {
      b.warn(line.no, tr("ขั้นนี้ไม่มีเส้นเข้า เพราะขั้นก่อนหน้าจบหรือวนกลับไปแล้ว", "This step has no way in, the step before it ended or went back"));
    }
    const hit = nodeFrom(text, line.no);
    connect(tails, hit.id);
    if (!hit.created) {
      /* ข้อความเหมือนกล่องเดิมเป๊ะ = กล่องเดิม (บรรจบหรือวนกลับ) แล้วกิ่งนี้จบ SPEC 3.1 */
      if (kids.length) throw new FlowError(kids[0].no, tr(`"${hit.node.text}" มีอยู่แล้วข้างบน จึงมีขั้นต่อของตัวเองแล้ว`, `"${hit.node.text}" already exists above, with its own next steps`),
        tr("ถ้าตั้งใจให้เป็นขั้นใหม่ ให้เปลี่ยนข้อความให้ต่างจากเดิม", "If this is a new step, give it different wording"));
      return [];
    }
    if (hit.node.shape === "ask") return branches(hit.id, line, kids);
    if (kids.length) {
      const hint = /^ถ้า/.test(text) || /^if\b/i.test(text)
        ? tr("ลองเขียนเป็นคำถามลงท้ายด้วย ? แล้วใส่คำตอบไว้ข้างใต้ เช่น แก้ได้ไหม?", "Try writing it as a question ending in ?, with the answers underneath")
        : tr("ย่อหน้าใช้เฉพาะใต้คำถาม (ลงท้ายด้วย ?) หรือใต้ พร้อมกัน: ขั้นที่ต่อกันให้เขียนชิดระดับเดียวกัน",
             "Indent only under a question (ending in ?) or under parallel:. Steps that follow each other stay at the same level");
      throw new FlowError(kids[0].no, tr("บรรทัดนี้ย่อหน้า แต่บรรทัดข้างบนไม่ใช่คำถาม", "This line is indented, but the line above is not a question"), hint);
    }
    return hit.created ? [{ id: hit.id }] : [];
  }

  /** ลำดับขั้นในชั้นเดียวกัน (บรรทัดชิดระดับเดียวกันต่อกันเป็นลำดับ) */
  function seq(block, tails) {
    for (let i = 0; i < block.length;) {
      const line = block[i];
      const kids = subtree(block, i);
      tails = step(line.text, line, kids, tails);
      i += 1 + kids.length;
    }
    return tails;
  }

  /** กิ่งของคำถาม: ลูกชั้นถัดไปทุกบรรทัดต้องเป็น คำตอบ: ขั้นถัดไป */
  function branches(askId, line, kids) {
    if (!kids.length) {
      throw new FlowError(line.no, tr("คำถามนี้ยังไม่มีคำตอบข้างใต้", "This question has no answers under it"),
        tr("ย่อหน้าบรรทัดถัดไปแล้วเขียน คำตอบ: ขั้นถัดไป เช่น ได้: ปิดงาน", "Indent the next lines as answer: next step, like Yes: Close the case"));
    }
    const open = [];
    let count = 0;
    for (let i = 0; i < kids.length;) {
      const bl = kids[i];
      const sub = subtree(kids, i);
      i += 1 + sub.length;
      const s = splitLabel(bl.text);
      if (!s) {
        throw new FlowError(bl.no, tr("ใต้คำถามต้องเขียนเป็น คำตอบ: ขั้นถัดไป", "Under a question, write answer: next step"),
          tr(`เช่น ได้: ${bl.text}`, `For example: Yes: ${bl.text}`));
      }
      count++;
      const from = [{ id: askId, label: s.label }];
      let t;
      if (!s.rest) t = seq(sub, from);                          // ต่อ:  แล้วขั้นทั้งหมดอยู่ชั้นถัดไป
      else if (isAsk(splitGroup(s.rest).text) && !END.test(s.rest) && !LOOP.test(s.rest)) {
        const q = nodeFrom(s.rest, bl.no);                      // คำตอบพาไปคำถามถัดไปเลย
        connect(from, q.id);
        if (q.created) t = branches(q.id, bl, sub);
        else if (sub.length) throw new FlowError(sub[0].no, tr(`"${q.node.text}" มีอยู่แล้วข้างบน จึงมีคำตอบของตัวเองแล้ว`, `"${q.node.text}" already exists above, with its own answers`),
          tr("ถ้าเป็นคำถามใหม่ ให้เปลี่ยนข้อความให้ต่างจากเดิม", "If this is a new question, give it different wording"));
        else t = [];
      } else {
        t = step(s.rest, bl, [], from);                         // ขั้นแรกของกิ่งอยู่บรรทัดเดียวกับคำตอบ
        if (sub.length) {
          if (!t.length) {
            throw new FlowError(sub[0].no, tr("กิ่งนี้จบหรือวนกลับไปแล้ว ขั้นข้างใต้จึงไม่มีทางเข้า", "This branch already ended or went back, the steps under it have no way in"),
              tr("ย้ายขั้นเหล่านี้ขึ้นไปก่อน จบ หรือ กลับไป:", "Move these steps above end or back to"));
          }
          t = seq(sub, t);
        }
      }
      open.push(...t);
    }
    if (count === 1) b.warn(line.no, tr("คำถามนี้มีคำตอบเดียว ถ้าไม่ได้ตั้งใจ ให้เพิ่มคำตอบอีกทาง", "This question has only one answer, add the other way if that was not on purpose"));
    return open;
  }

  /** พร้อมกัน: ลูกแต่ละบรรทัดคือสายขนาน (ลูกของสายนั้นคือขั้นต่อเนื่องในสาย) */
  function parallel(line, kids, tails) {
    if (!kids.length) throw new FlowError(line.no, tr("พร้อมกัน: ต้องมีงานข้างใต้อย่างน้อยสองบรรทัด", "parallel: needs at least two lines under it"),
      tr("ย่อหน้าแต่ละงานไว้ใต้ พร้อมกัน:", "Indent each task under parallel:"));
    const open = [];
    for (let i = 0; i < kids.length;) {
      const sub = subtree(kids, i);
      let t = step(kids[i].text, kids[i], [], tails);
      if (sub.length) t = seq(sub, t);
      open.push(...t);
      i += 1 + sub.length;
    }
    return open;
  }

  seq(lines, []);
  return b.model;
}
