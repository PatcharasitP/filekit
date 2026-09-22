// ─────────────────────────────────────────────────────────────────────────────
// ปุ่ม "ให้ AI ช่วยร่าง" (แผนเฟส 5 ทางเข้า ④ ข้อ 3)
//
// ‼️ เว็บเราไม่เรียก AI เอง จึงยังพูดได้เต็มปากว่าข้อความไม่ออกจากเครื่อง
//    เราแค่สร้าง "คำสั่งสำเร็จรูป" ให้ผู้ใช้ก๊อปไปวางใน AI ตัวไหนก็ได้ แล้วเอาคำตอบกลับมาวาง
// ‼️ ให้ AI ตอบเป็นข้อความตาม SPEC ไม่ใช่ XML: คนอ่านตรวจสิบบรรทัดได้ก่อนกลายเป็นผัง (ชื่อระบบ ทิศลูกศร)
// ‼️ แนบกติกาย่อกับตัวอย่าง 2 ใบเสมอ AI ตอบถูกรูปแบบเพราะเห็นตัวอย่าง ไม่ใช่เพราะเดา
// ─────────────────────────────────────────────────────────────────────────────
import { SAMPLES } from "./samples.js";
import { TEMPLATES } from "./templates.js";

const RULES = {
  th: {
    steps: [
      "หนึ่งบรรทัดคือหนึ่งขั้น เขียนชิดซ้ายเรียงลงมาตามลำดับ",
      "คำถามลงท้ายด้วย ? แล้วใต้คำถามย่อหน้า 2 วรรค เขียนเป็น คำตอบ: ขั้นถัดไป หนึ่งบรรทัดต่อหนึ่งคำตอบ",
      "ขั้นที่ต่อจากคำตอบนั้น ย่อหน้าลึกลงไปอีก 2 วรรคใต้บรรทัดคำตอบ",
      "บรรทัดที่กลับมาชิดซ้าย คือจุดที่ทุกกิ่งมาบรรจบกัน",
      "คำว่า จบ บรรทัดเดียว = ปิดกิ่งนั้น , กลับไป: ข้อความของขั้นเดิมเป๊ะ ๆ = วนกลับ",
      "พร้อมกัน: แล้วย่อหน้างานที่ทำพร้อมกันไว้ข้างใต้ บรรทัดละงาน",
      "ใส่ [ชื่อฝ่าย] หน้าข้อความ ถ้าอยากบอกว่าขั้นนั้นเป็นงานของใคร",
      "บรรทัดแรกเขียน ชื่อ: ชื่อผัง ได้ , ข้อความในแต่ละขั้นสั้น ๆ ไม่เกิน 40 ตัวอักษร",
    ],
    org: [
      "หนึ่งบรรทัดคือหนึ่งคนหรือหนึ่งทีม คนบนสุดชิดซ้าย",
      "คนที่ขึ้นกับบรรทัดข้างบน ให้ย่อหน้าลึกกว่า ชั้นละ 2 วรรค",
      "ใช้ | คั่นเพื่อขึ้นบรรทัดใหม่ในกล่อง เช่น ชื่อ | ตำแหน่ง",
    ],
    system: [
      "หนึ่งบรรทัดคือหนึ่งเส้น เขียนว่า ต้นทาง -> ปลายทาง: สิ่งที่ส่ง",
      "--> คือเส้นประ , <-> คือส่งสองทาง , --- คือเส้นเชื่อมไม่มีหัวลูกศร ต้องเว้นวรรคหน้าและหลังลูกศรเสมอ",
      "ใส่ [ชื่อกลุ่ม] หน้าชื่อระบบครั้งแรกที่เขียนถึง ถ้าอยากจัดระบบเป็นกลุ่ม",
      "ชื่อระบบต้องเขียนเหมือนกันทุกครั้ง ไม่งั้นจะกลายเป็นคนละกล่อง",
    ],
    timeline: [
      "หนึ่งบรรทัดคือหนึ่งช่วงเวลา เขียนว่า ช่วงเวลา: งาน",
      "งานเพิ่มในช่วงเดียวกัน ย่อหน้า 2 วรรคไว้ใต้ช่วงนั้น บรรทัดละงาน",
      "ไม่ควรเกิน 6 ช่วง",
    ],
  },
  en: {
    steps: [
      "One line is one step, written flush left, top to bottom in order",
      "A question ends with ?, and under it each answer is indented 2 spaces as answer: next step, one line per answer",
      "Steps that follow an answer are indented 2 more spaces under that answer line",
      "A line back at the left edge is where all open branches join again",
      "The word stop on its own line ends that branch , back to: exact text of an earlier step loops back",
      "parallel: with the parallel tasks indented under it, one per line",
      "Put [Team name] before a step to show who does it",
      "The first line may be title: Diagram name , keep each step short, under 40 characters",
    ],
    org: [
      "One line is one person or team, the top person flush left",
      "Anyone reporting to the line above is indented 2 more spaces per level",
      "Use | to break a box into lines, like Name | Job title",
    ],
    system: [
      "One line is one arrow, written from -> to: what moves",
      "--> is a dashed arrow , <-> goes both ways , --- is a plain link, always put a space before and after the arrow",
      "Put [Group name] before a system the first time you mention it to group systems",
      "Spell every system name the same way each time, or it becomes a separate box",
    ],
    timeline: [
      "One line is one period, written period: task",
      "More tasks in the same period go on their own lines indented 2 spaces under it",
      "Keep it to 6 periods or fewer",
    ],
  },
};

const KIND_WORD = {
  th: { steps: "ขั้นตอน", org: "องค์กร", system: "ระบบ", timeline: "ไทม์ไลน์" },
  en: { steps: "process", org: "org chart", system: "systems", timeline: "timeline" },
};

/** ตัวอย่าง 2 ใบของชนิดผังนั้น (ตัวอย่างในช่องพิมพ์ + เทมเพลตชนิดเดียวกัน) */
function examples(kind, lang) {
  const tpl = TEMPLATES.find((t) => t.kind === kind && t.text[lang] !== SAMPLES[lang][kind]);
  return [SAMPLES[lang][kind], tpl ? tpl.text[lang] : ""].filter(Boolean);
}

/** คำสั่งสำเร็จรูปสำหรับวางใน AI ตัวไหนก็ได้ */
export function buildPrompt(kind, description, lang = "th") {
  const k = RULES[lang][kind] ? kind : "steps";
  const ex = examples(k, lang);
  const desc = String(description || "").trim();
  if (lang === "en") {
    return [
      `Please turn the work described at the end into a ${KIND_WORD.en[k]} diagram written in FlowKit text format.`,
      "Reply with the FlowKit text only: no explanation, no code block, no headings.",
      "",
      "Rules:",
      ...RULES.en[k].map((r) => "- " + r),
      "",
      ...ex.flatMap((t, i) => [`Example ${i + 1}:`, t, ""]),
      "The work to draw:",
      desc || "(describe the work here)",
    ].join("\n");
  }
  return [
    `ช่วยเขียนผัง${KIND_WORD.th[k]} จากงานที่เล่าไว้ท้ายข้อความนี้ เป็น "ข้อความรูปแบบ FlowKit"`,
    "ตอบเป็นข้อความรูปแบบ FlowKit อย่างเดียว ไม่ต้องอธิบาย ไม่ใส่กรอบโค้ด ไม่ใส่หัวข้อ",
    "",
    "กติกา:",
    ...RULES.th[k].map((r) => "- " + r),
    "",
    ...ex.flatMap((t, i) => [`ตัวอย่างที่ ${i + 1}:`, t, ""]),
    "งานที่อยากได้เป็นผัง:",
    desc || "(เล่างานของคุณตรงนี้)",
  ].join("\n");
}

/** คำตอบจาก AI มักห่อด้วยกรอบโค้ด ``` หรือมีบรรทัดเกริ่น ตัดทิ้งให้เหลือข้อความผังล้วน */
export function cleanAnswer(text) {
  let t = String(text || "").replace(/\r\n?/g, "\n");
  const fence = t.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
  if (fence) t = fence[1];
  return t.replace(/^\s*\n/, "").replace(/\s+$/, "");
}
