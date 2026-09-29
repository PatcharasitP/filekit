// ตัวเตรียมข้อมูลของเครื่องมือกราฟ Gantt: อ่านวันที่ เดาคอลัมน์ ทำแถวให้กราฟ (ไม่แตะหน้าจอ เทสด้วย node ได้)
// ‼️ วันที่อ่านผ่าน parseAnyDate ของ thai.js ตัวเดิม ห้ามเขียนตัวแปลงวันที่ขึ้นมาใหม่
import { parseAnyDate, toCE } from "./thai.js";

const pad = (n) => String(n).padStart(2, "0");
const txt = (v) => (v == null ? "" : v instanceof Date ? "" : String(v).trim());

/** วันที่ครบ วัน/เดือน/ปี เป็น ISO ปี ค.ศ. ไม่ครบหรือไม่มีจริง = null (ไม่เดาวันให้) */
export function isoOf(v) {
  const p = parseAnyDate(v);
  if (!p || p.m == null || p.d == null) return null;
  const y = toCE(p.y);
  if (y < 1900 || y > 2200) return null;
  return { iso: `${y}-${pad(p.m)}-${pad(p.d)}`, guessed: !!p.guessedYear };
}

/** 0 ถึง 1 ใช้ตรง ๆ, มากกว่า 1 ถึง 100 ถือเป็นเปอร์เซ็นต์, ติดเครื่องหมาย % เป็นเปอร์เซ็นต์เสมอ
 *  นอกนั้น null (เกิน 100 ไม่ถูกตัดเงียบเป็น 100) */
export function normProgress(v) {
  if (v == null || v === "") return null;
  let n, pct = false;
  if (typeof v === "number") n = v;
  else {
    let t = String(v).replace(/\s/g, "");
    if (t.endsWith("%")) { pct = true; t = t.slice(0, -1); }
    if (!/^\d*\.?\d+$/.test(t)) return null;
    n = Number(t);
  }
  if (!Number.isFinite(n) || n < 0) return null;
  if (pct || n > 1) n /= 100;
  if (n > 1) return null;
  return Math.round(n * 1e6) / 1e6;
}

const HEAD = {
  start: /เริ่ม|start|begin|from|ตั้งแต่/i,
  end: /สิ้นสุด|จบ|เสร็จ|กำหนดส่ง|\bend\b|finish|due|deadline|ถึง/i,
  progress: /คืบหน้า|progress|%|เปอร์เซ็นต์|complete/i,
  group: /เฟส|กลุ่ม|ประเภท|หมวด|phase|group|category|type|owner|ผู้รับผิดชอบ/i,
  task: /ชื่องาน|กิจกรรม|รายการ|งาน|task|activity|item|name/i,
};

/** เดาว่าคอลัมน์ไหนคืออะไร: ดูชื่อหัวก่อน (วันที่กับความคืบหน้าก่อนชื่องาน เพราะ "วันเริ่มงาน" มีคำว่างาน)
 *  ไม่ได้ก็ดูว่าคอลัมน์ไหนเต็มไปด้วยวันที่ */
export function guessGanttColumns(header, rows) {
  const taken = new Set();
  const out = { task: null, start: null, end: null, group: null, progress: null };
  const claim = (key, idx) => { out[key] = idx; taken.add(idx); };
  for (const key of ["start", "end", "progress", "group", "task"]) {
    const i = header.findIndex((h, idx) => !taken.has(idx) && HEAD[key].test(String(h ?? "")));
    if (i >= 0) claim(key, i);
  }
  if (out.start == null || out.end == null) {
    const dateCols = [];
    header.forEach((_, i) => {
      if (taken.has(i)) return;
      const filled = rows.filter((r) => txt(r[i]) !== "" || r[i] instanceof Date);
      if (filled.length && filled.filter((r) => isoOf(r[i])).length / filled.length >= 0.8) dateCols.push(i);
    });
    for (const key of ["start", "end"]) if (out[key] == null && dateCols.length) claim(key, dateCols.shift());
  }
  if (out.task == null) {
    const i = header.findIndex((_, idx) => !taken.has(idx));
    if (i >= 0) claim("task", i);
  }
  return out;
}

/** ทำแถว {Task, Start, End, Group?, Progress?} ให้กราฟ พร้อมรายการแถวที่ข้ามและเหตุผล
 *  line = บรรทัดในไฟล์ (หัวตาราง = 1) วันจบก่อนวันเริ่มถือว่าพิมพ์ผิด ข้ามและบอก ไม่สลับให้เงียบ ๆ */
export function buildGanttRows(table, cols) {
  const rows = [], skipped = [];
  let guessed = 0;
  table.rows.forEach((r, k) => {
    const line = k + 2;
    const task = txt(r[cols.task]);
    if (!task) return skipped.push({ line, reason: "no-task" });
    const s = isoOf(r[cols.start]);
    if (!s) return skipped.push({ line, reason: "bad-start" });
    const e = isoOf(r[cols.end]);
    if (!e) return skipped.push({ line, reason: "bad-end" });
    if (e.iso < s.iso) return skipped.push({ line, reason: "end-before-start" });
    if (s.guessed || e.guessed) guessed++;
    const row = { Task: task, Start: s.iso, End: e.iso };
    const grp = cols.group == null ? "" : txt(r[cols.group]);
    if (grp) row.Group = grp;
    const pr = cols.progress == null ? null : normProgress(r[cols.progress]);
    if (pr != null) row.Progress = pr;
    rows.push(row);
  });
  return { rows, skipped, guessed };
}

