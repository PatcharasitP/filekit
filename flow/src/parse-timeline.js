// ผัง "ไทม์ไลน์" (SPEC ข้อ 3.5): ช่วงเวลา: งาน ต่อบรรทัด , งานหลายอย่างในช่วงเดียวย่อหน้าไว้ใต้ช่วงเวลา
// หน้าตาแบบกล่องเรียงซ้ายไปขวา (W3 เคาะแล้ว) กล่องละช่วง บรรทัดแรกตัวหนาเป็นช่วงเวลา
import { tr } from "../../src/i18n.js";
import { builder, FlowError } from "./model.js";
import { splitLabel } from "./parse-common.js";

export function parseTimeline(lines, warnings = []) {
  const b = builder("timeline");
  b.model.warnings.push(...warnings);
  const periods = [];
  for (const line of lines) {
    if (line.indent === 0) {
      const s = splitLabel(line.text);
      if (!s) throw new FlowError(line.no, tr("ไทม์ไลน์ต้องเขียนเป็น ช่วงเวลา: งาน", "Write each timeline line as period: task"),
        tr(`เช่น สัปดาห์ที่ 1: ${line.text}`, `For example: Week 1: ${line.text}`));
      periods.push({ period: s.label, tasks: s.rest ? [s.rest] : [], no: line.no });
    } else {
      if (line.indent > 1) throw new FlowError(line.no, tr("งานในช่วงเวลาย่อหน้าได้ชั้นเดียว", "Tasks under a period go one level deep only"),
        tr("ย่อหน้าหนึ่งชั้นใต้ช่วงเวลา", "Indent them one level under the period"));
      periods[periods.length - 1].tasks.push(line.text);
    }
  }
  let prev = null;
  for (const p of periods) {
    if (!p.tasks.length) b.warn(p.no, tr(`ช่วง "${p.period}" ยังไม่มีงาน`, `"${p.period}" has no tasks yet`));
    const id = b.node([p.period, ...p.tasks].join(" | "), "period").id;
    if (prev) b.edge(prev, id);
    prev = id;
  }
  if (periods.length > 6) b.warn(periods[6].no, tr("เกิน 6 ช่วง ผังแนวนอนจะยาวมาก ลองแบ่งเป็นสองผัง", "More than 6 periods makes a very long row, try splitting it"));
  return b.model;
}
