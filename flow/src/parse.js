// ─────────────────────────────────────────────────────────────────────────────
// ทางเข้า ① พิมพ์เป็นข้อความ → FlowModel  (ชนิดผังจากหัวไฟล์ ผัง: ... ก่อน ไม่มีค่อยใช้ปุ่มที่เลือกบนจอ)
// ─────────────────────────────────────────────────────────────────────────────
import { tr } from "../../src/i18n.js";
import { FlowError } from "./model.js";
import { prepare } from "./parse-common.js";
import { parseSteps } from "./parse-steps.js";
import { parseOrg } from "./parse-org.js";
import { parseSystem } from "./parse-system.js";
import { parseTimeline } from "./parse-timeline.js";

const PARSERS = { steps: parseSteps, org: parseOrg, system: parseSystem, timeline: parseTimeline };
/** ผังใหญ่เกินเท่านี้ใส่สไลด์เดียวอ่านยาก (D6 , หลุม H3) */
export const BIG_DIAGRAM = 25;

/** @returns {{ model } | { error: FlowError }} ไม่โยนออกไป หน้าเว็บจะได้โชว์ข้อผิดพลาดพร้อมเลขบรรทัดได้เสมอ */
export function parseText(text, uiKind = "steps") {
  try {
    const { head, lines, warnings } = prepare(text);
    if (!lines.length) return { empty: true, kind: head.kind || uiKind };
    const kind = head.kind || uiKind;
    const model = PARSERS[kind](lines, warnings);
    model.kind = kind;
    if (head.title) model.title = head.title;
    if (head.dir) model.dir = head.dir;
    if (model.nodes.length > BIG_DIAGRAM) {
      model.warnings.push({ line: 0, text: tr(`มี ${model.nodes.length} กล่อง เกิน ${BIG_DIAGRAM} ใส่สไลด์เดียวจะอ่านยาก ลองแบ่งเป็นสองผัง`,
        `${model.nodes.length} boxes, more than ${BIG_DIAGRAM} is hard to read on one slide, try splitting it`) });
    }
    return { model };
  } catch (e) {
    if (e instanceof FlowError) return { error: e };
    throw e;
  }
}
