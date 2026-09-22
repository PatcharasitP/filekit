// ─────────────────────────────────────────────────────────────────────────────
// ส่วนหน้าที่ทุกชนิดผังใช้ร่วม (SPEC ข้อ 3.1): หัวไฟล์ ย่อหน้า ของที่ตัดทิ้งหน้าบรรทัด
// ─────────────────────────────────────────────────────────────────────────────
import { tr } from "../../src/i18n.js";
import { FlowError } from "./model.js";

const KIND_WORDS = {
  "ขั้นตอน": "steps", "กระบวนการ": "steps", "steps": "steps", "process": "steps", "flow": "steps",
  "องค์กร": "org", "org": "org", "orgchart": "org",
  "ระบบ": "system", "system": "system", "systems": "system",
  "ไทม์ไลน์": "timeline", "timeline": "timeline",
};
const DIR_WORDS = {
  "บนลงล่าง": "down", "down": "down", "td": "down", "tb": "down",
  "ซ้ายไปขวา": "right", "right": "right", "lr": "right",
};

/* ‼️ ตัดสัญลักษณ์รายการหน้าบรรทัดทิ้ง ก๊อปรายการหัวข้อจาก Word หรือแชทมาวางได้เลย (SPEC 3.1)
 *    ต้องตามด้วยวรรคเสมอ ไม่งั้น "-30%" หรือ "1.5 เท่า" ที่เป็นเนื้อความจะถูกตัดไปด้วย */
const BULLET = /^(?:→|->|>|-|•|\*|\d{1,3}[.)]|[๐-๙]{1,3}[.)])\s+/;

/**
 * แยกข้อความเป็นบรรทัดที่พร้อมใช้ + หัวไฟล์
 * @returns {{ head: {kind?, dir?, title?}, lines: {no, indent, text}[], warnings: {line, text}[] }}
 */
export function prepare(raw) {
  const warnings = [];
  const head = {};
  const lines = [];
  const src = String(raw || "").replace(/^﻿/, "").split(/\r\n|\r|\n/);
  let inHead = true;
  let prevIndent = -1;
  src.forEach((line0, idx) => {
    const no = idx + 1;
    // tab = หนึ่งชั้น ปนกับวรรคได้ แปลงเป็นสองวรรคก่อนนับ
    const line = line0.replace(/\t/g, "  ").replace(/\s+$/, "");
    const body = line.trimStart();
    if (!body || body.startsWith("//")) return;
    if (inHead) {
      const h = body.match(/^(ผัง|type|ทิศ|dir|direction|ชื่อ|title)\s*[:：]\s*(.*)$/i);
      if (h) {
        const key = h[1].toLowerCase(), val = h[2].trim();
        if (key === "ผัง" || key === "type") {
          const k = KIND_WORDS[val.toLowerCase()];
          if (!k) throw new FlowError(no, tr(`ไม่รู้จักชนิดผัง "${val}"`, `Unknown diagram type "${val}"`),
            tr("ใช้ได้ 4 แบบ: ขั้นตอน, องค์กร, ระบบ, ไทม์ไลน์", "Use one of: steps, org, system, timeline"));
          head.kind = k;
        } else if (key === "ทิศ" || key === "dir" || key === "direction") {
          const d = DIR_WORDS[val.toLowerCase()];
          if (!d) throw new FlowError(no, tr(`ไม่รู้จักทิศ "${val}"`, `Unknown direction "${val}"`),
            tr("ใช้ บนลงล่าง หรือ ซ้ายไปขวา", "Use down or right"));
          head.dir = d;
        } else head.title = val;
        return;
      }
      inHead = false;
    }
    const spaces = line.length - body.length;
    if (spaces % 2) warnings.push({ line: no, text: tr(`ย่อหน้า ${spaces} วรรคเป็นเลขคี่ ปัดลงเป็น ${spaces - 1} วรรค`,
      `Odd indent of ${spaces} spaces, rounded down to ${spaces - 1}`) });
    const indent = Math.floor(spaces / 2);
    if (indent > prevIndent + 1) {
      throw new FlowError(no, prevIndent < 0
        ? tr("บรรทัดแรกต้องชิดซ้าย", "The first line must not be indented")
        : tr(`ย่อหน้าลึกกว่าบรรทัดก่อนเกินหนึ่งชั้น`, `Indented more than one level deeper than the line above`),
        tr("ย่อหน้าทีละ 2 วรรค (หรือ tab เดียว) ต่อชั้น", "Indent one level at a time: 2 spaces or one tab"));
    }
    prevIndent = indent;
    lines.push({ no, indent, text: body.replace(BULLET, "").trim() });
  });
  return { head, lines, warnings };
}

/** ลูกหลานของบรรทัด i (ทุกบรรทัดถัดไปที่ย่อหน้าลึกกว่า) */
export function subtree(lines, i) {
  const base = lines[i].indent;
  let j = i + 1;
  while (j < lines.length && lines[j].indent > base) j++;
  return lines.slice(i + 1, j);
}

/** ตัด [กลุ่ม] หน้าข้อความ คืน { group: string|null|undefined, text }  undefined = ไม่ได้ระบุ (สืบทอด) , "" = ออกจากกลุ่ม */
export function splitGroup(text) {
  const m = String(text).match(/^\[([^\]]*)\]\s*(.*)$/);
  if (!m) return { group: undefined, text: String(text).trim() };
  return { group: m[1].trim(), text: m[2].trim() };
}

/** ตัดป้ายกิ่งที่ ": " ตัวแรก หรือ ":" ท้ายบรรทัด (SPEC 3.2) คืน null ถ้าไม่มีป้าย
 *  ‼️ "10:30" ไม่ถูกตัด เพราะไม่มีวรรคหลังโคลอน (พิสูจน์กับผังตัวอย่าง 03-three-gates) */
export function splitLabel(text) {
  const t = String(text);
  const end = t.match(/^(.+?)\s*[:：]$/);
  if (end) return { label: end[1].trim(), rest: "" };
  const m = t.match(/^(.+?)\s*[:：]\s+(.*)$/);
  if (!m) return null;
  return { label: m[1].trim(), rest: m[2].trim() };
}

/** ชื่อที่ใกล้เคียงที่สุด ใช้เสนอตอนพิมพ์ชื่อกล่องผิด */
export function closest(word, pool) {
  const a = String(word);
  let best = null, bestD = Infinity;
  for (const b of pool) {
    const d = editDistance(a, b);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best && bestD <= Math.max(2, Math.ceil(a.length / 3)) ? best : null;
}
function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
