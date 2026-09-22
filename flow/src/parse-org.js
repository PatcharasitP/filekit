// ผัง "องค์กร" (SPEC ข้อ 3.3): ย่อหน้า = ลูก ไม่มีคำถาม ไม่มีลำดับ เส้นไม่มีหัวลูกศร , " | " แยกชื่อกับตำแหน่ง
import { tr } from "../../src/i18n.js";
import { builder } from "./model.js";

export function parseOrg(lines, warnings = []) {
  const b = builder("org");
  b.model.warnings.push(...warnings);
  const stack = [];                   // กล่องล่าสุดของแต่ละชั้น
  let roots = 0;
  for (const line of lines) {
    const hit = b.node(line.text, "step");
    stack.length = line.indent;
    const parent = stack[line.indent - 1];
    if (parent) b.edge(parent, hit.id, "", "plain");
    else if (hit.created) roots++;
    stack[line.indent] = hit.id;
  }
  if (roots > 1) b.warn(lines[0].no, tr(`มีหัวผัง ${roots} คน (บรรทัดที่ชิดซ้าย) ผังจะแยกเป็นหลายต้น`,
    `There are ${roots} people at the top level, the chart splits into separate trees`));
  return b.model;
}
