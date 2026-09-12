/* ตรวจเครื่องมือสร้างธีม Power BI
 *
 * ‼️ เทสนี้มีอยู่เพื่อกันสองเรื่องที่ผิดแล้วไม่มีใครรู้จนกว่ารายงานจะขึ้นจอจริง
 *   ① ชุดสีที่เราแจกให้คนอื่นใช้ ต้องอ่านออกจริงและคนตาบอดสีแยกออกจริง
 *      ถ้ามีใครเปลี่ยนสีสักตัวด้วยเหตุผลว่า "สวยกว่า" เทสนี้ต้องแดงทันที
 *   ② โครง theme.json ต้องตรงกับที่ PBI_THEME_PLAYBOOK บท TH1 พิสูจน์ไว้
 *      โดยเฉพาะ tableAccent (เป็นสีกริดตารางและ data bar) กับ
 *      fourthLevelElements (เป็นสีตัวอักษรหมวดหมู่ในการ์ด ไม่ใช่สีเส้น)
 *      สองตัวนี้ตั้งผิดแล้วตารางสีจัดทั้งใบหรือคนอ่านหมวดหมู่ในการ์ดไม่ออก
 *
 * ‼️ ข้อ ⑦ เป็นตัวควบคุมเชิงลบ ใส่ชุดสีที่รู้ว่าแย่เข้าไปแล้วเทสต้องจับได้
 *    ไม่งั้นข้อ ① จะผ่านเพราะตัวตรวจไม่ทำงาน ไม่ใช่เพราะสีดี
 *
 * รัน: node tests/theme.test.mjs */
import { textScale, textSizes, buildTheme, mix, derive, PALETTES } from "../src/tools/pbi-theme.js";
import { checkPalette, deltaE00, hexToLab, simulate, CVD_TYPES } from "../src/cvd.js";
import { contrast } from "../src/colorkit.js";

let pass = 0; const fail = [];
const ck = (ok, msg) => { if (ok) { pass++; console.log("  ✅ " + msg); } else { fail.push(msg); console.log("  ❌ " + msg); } };

const MODES = ["normal", ...CVD_TYPES];
const sim = (c, m) => (m === "normal" ? c : simulate(c, m));
/** ΔE ที่ต่ำที่สุดของทุกคู่ในทุกภาวะ รวมสายตาปกติ */
function worstDelta(colors) {
  let w = Infinity;
  for (let i = 0; i < colors.length; i++)
    for (let j = i + 1; j < colors.length; j++)
      for (const m of MODES) w = Math.min(w, deltaE00(hexToLab(sim(colors[i], m)), hexToLab(sim(colors[j], m))));
  return w;
}

/* ── ① ขนาดตัวอักษรที่ผืนผ้าใบมาตรฐาน ต้องเท่ากับค่าตั้งต้นของ Power BI เป๊ะ ─── */
console.log("\n① สเกลตัวอักษรตามขนาดผืนผ้าใบ");
ck(textScale(1920, 1080) === 1, "ที่ 1920x1080 ตัวคูณเป็น 1 พอดี ไม่ขยับค่าตั้งต้นของ Power BI");
{
  const s = textSizes(1920, 1080);
  ck(s.callout === 45 && s.title === 12 && s.header === 12 && s.label === 10,
     `ที่ 1920x1080 ได้ callout 45, title 12, header 12, label 10 (ได้ ${JSON.stringify(s)})`);
}
ck(textScale(2560, 1440) > 1 && textScale(1280, 720) < 1, "ผืนใหญ่ขึ้นตัวอักษรโตขึ้น ผืนเล็กลงตัวอักษรเล็กลง");
ck(Math.abs(textScale(2560, 1440) - 4 / 3) < 1e-9,
   "สเกลด้วยรากที่สองของพื้นที่ 2560x1440 จึงได้ 4/3 ไม่ใช่ 16/9 ที่จะได้ถ้าใช้พื้นที่ตรง ๆ");
ck(textScale(320, 240) === 0.75 && textScale(6000, 6000) === 1.6, "ถูกคุมไว้ที่ 0.75 ถึง 1.6 ไม่หลุดกรอบ");
/* ‼️ schema 2.157 นิยาม fontSize ว่า minimum 8 maximum 60 เกินจากนี้ Power BI ไม่รับไฟล์
   ผืน 6000x6000 เคยคำนวณได้ 72pt แล้วไฟล์ใช้ไม่ได้จริง (tests/theme_schema.py จับได้ 12/09/2026) */
for (const [w, h] of [[320, 240], [1280, 720], [1920, 1080], [2560, 1440], [6000, 6000], [900, 1600]]) {
  const v = Object.values(textSizes(w, h));
  ck(v.every((x) => x >= 8 && x <= 60),
     `ที่ ${w}x${h} ทุกขนาดอยู่ในช่วง 8 ถึง 60 ที่ schema ยอมรับ (ได้ ${v.join(", ")})`);
}
ck(textScale(0, 0) === 0.75 && textScale(NaN, 5) === 0.75, "ขนาดที่เป็นศูนย์หรือไม่ใช่ตัวเลข ไม่ทำให้ได้ NaN");

/* ── ② ผสมสี ────────────────────────────────────────────────────────── */
console.log("\n② ผสมสี");
ck(mix("#000000", "#ffffff", 0).toLowerCase() === "#000000", "สัดส่วน 0 ได้สีแรกกลับมาเป๊ะ");
ck(mix("#000000", "#ffffff", 1).toLowerCase() === "#ffffff", "สัดส่วน 1 ได้สีที่สองกลับมาเป๊ะ");
ck(mix("#000000", "#ffffff", 0.5).toLowerCase() === "#808080", "สัดส่วนครึ่งหนึ่งได้ค่ากลางพอดี");

/* ── ③ โครง theme.json ต้องตรงกับ TH1 ───────────────────────────────── */
console.log("\n③ โครงไฟล์ธีม");
const p0 = PALETTES()[0];
const base = derive({ name: "ทดสอบ", w: 1920, h: 1080, font: "Segoe UI",
  colors: p0.colors.slice(), bg: p0.bg, fg: p0.fg, good: "#1F8A50", neutral: "#6C7A8D", bad: "#C4321F" });
const t = buildTheme(base);
ck(t.name === "ทดสอบ", "name คือคีย์เดียวที่ schema บังคับ ต้องมีเสมอ");
ck(buildTheme({ ...base, name: "" }).name === "FileKit Theme", "ชื่อว่างต้องมีชื่อสำรอง ไม่ใช่ปล่อยคีย์บังคับว่าง");
ck(t.$schema.includes("2.157"), "ชี้ schema 2.157 ตามที่ TH1 ตรวจไว้");
ck(!t.dataColors.includes(t.tableAccent),
   "tableAccent ต้องไม่ใช่สีในชุดข้อมูล (TH1 มันเป็นสีกริดตารางและสี data bar ตั้งสีแบรนด์แล้วตารางสีจัดทั้งใบ)");
ck(t.tableAccent === base.line, "tableAccent ผูกกับสีเส้น");
ck(t.fourthLevelElements === base.fg2 && t.fourthLevelElements !== base.line,
   "fourthLevelElements ผูกกับสีตัวอักษรรอง ไม่ใช่สีเส้น (TH1 มันคือสีตัวอักษรหมวดหมู่ในการ์ด)");
ck(t.firstLevelElements === base.fg && t.thirdLevelElements === base.line, "ลำดับชั้นสีองค์ประกอบผูกถูกตัว");
ck(JSON.parse(JSON.stringify(t)).name === "ทดสอบ", "ทั้งก้อนแปลงเป็น JSON แล้วกลับมาได้ ไม่มีค่าที่ JSON แทนไม่ได้");
ck(Object.keys(t.textClasses).length === 4,
   `ประกาศแค่ 4 คลาสหลัก อีก 10 คลาสสืบทอดเอง (ได้ ${Object.keys(t.textClasses).length})`);
ck(Object.values(t.textClasses).every((c) => c.fontFace === "Segoe UI"), "ฟอนต์ลงครบทุกคลาส");
{
  const big = buildTheme({ ...base, w: 2560, h: 1440 });
  ck(big.textClasses.callout.fontSize > t.textClasses.callout.fontSize, "เปลี่ยนขนาดผืนผ้าใบแล้วขนาดตัวอักษรในไฟล์เปลี่ยนตามจริง");
}

/* ── ④ สีที่สืบทอดมา ต้องอ่านออกเสมอ ────────────────────────────────── */
console.log("\n④ สีที่คำนวณต่อจากพื้นหลังกับตัวอักษร");
for (const p of PALETTES()) {
  const s = derive({ colors: p.colors, bg: p.bg, fg: p.fg });
  const r = contrast(s.fg2, p.bg);
  ck(r >= 4.5, `${p.name}: ตัวอักษรรอง ${s.fg2} บนพื้น ${p.bg} ได้ ${r.toFixed(2)} ผ่านเกณฑ์ 4.5`);
}

/* ── ⑤ ‼️ ชุดสีที่เราออกแบบเอง ต้องอ่านออกจริงและคนตาบอดสีแยกออกจริง ───── */
console.log("\n⑤ ชุดสีของกลาง (ชุดที่เราออกแบบเอง จึงต้องผ่านทุกเกณฑ์)");
const NEUTRAL = PALETTES().filter((p) => p.kind === "neutral");
const BRAND = PALETTES().filter((p) => p.kind === "brand");
ck(NEUTRAL.length >= 3, `มีชุดของกลางอย่างน้อย 3 ชุด (มี ${NEUTRAL.length})`);
ck(PALETTES().every((p) => p.kind === "neutral" || p.kind === "brand"),
   "ทุกชุดต้องระบุว่าเป็นของกลางหรือของแบรนด์ ไม่ปล่อยให้กำกวม");
for (const p of NEUTRAL) {
  const low = p.colors.map((c) => contrast(c, p.bg)).filter((x) => x < 3);
  ck(low.length === 0, `${p.name}: ทุกสีบนพื้นหลังได้คอนทราสต์ถึง 3 (ต่ำกว่าเกณฑ์ ${low.length} สี)`);
  const res = checkPalette(p.colors);
  ck(res.maxSafe === p.colors.length,
     `${p.name}: คนตาบอดสีแยกออกครบ ${p.colors.length} สี (วัดได้ ${res.maxSafe})`);
  const w = worstDelta(p.colors);
  ck(w >= 15, `${p.name}: คู่ที่ใกล้กันที่สุดห่าง ΔE ${w.toFixed(2)} ถึงเกณฑ์ 15 ที่ตั้งไว้`);
  ck(p.colors.length === 5, `${p.name}: มี 5 สี ตามเพดานที่ TH3 พิสูจน์ไว้`);
}
ck(new Set(PALETTES().map((p) => p.id)).size === PALETTES().length, "ชุดสีไม่มี id ซ้ำ");

/* ── ⑤.5 ‼️ ชุดสีของแบรนด์ ห้ามถูกแก้ให้ผ่านเกณฑ์ แต่ต้องถูกรายงานตามจริง ────
 *
 * ‼️ ข้อนี้จงใจ assert "ตกเกณฑ์" ไม่ใช่ "ผ่านเกณฑ์" เพราะสีแบรนด์คือข้อกำหนดที่
 *    คนทำรายงานเปลี่ยนเองไม่ได้ ถ้าวันหนึ่งมีคนไปขยับสีให้ผ่าน ๆ ข้อนี้จะแดง
 *    ซึ่งถูกต้องแล้ว เพราะนั่นแปลว่าเราแอบแก้สีของบริษัทคนอื่น
 * ‼️ ค่าที่ล็อกไว้มาจากการวัดจริงเมื่อ 12/09/2026 ไม่ใช่ตัวเลขที่คิดขึ้นเอง */
console.log("\n⑤.5 ชุดสีของแบรนด์ (ต้องคงสีเดิมไว้ และต้องถูกรายงานตามจริง)");
const T = BRAND.find((p) => p.id === "true");
ck(!!T, "มีชุดของ True Corporation อยู่ในรายการ");
if (T) {
  ck(T.colors.join(",") === ["#E4002B","#1A1A2E","#0052CC","#00A550","#F5A623","#9B51E0","#6C7A8D","#17A2B8"].join(","),
     "สีทั้ง 8 ตรงกับไฟล์ธีมต้นฉบับทุกตัว ไม่มีใครไปแก้ให้ผ่านเกณฑ์");
  ck(T.bg === "#F5F7FA" && T.fg === "#1A1A2E", "พื้นหลังกับตัวอักษรตรงกับไฟล์ต้นฉบับ");
  const low = T.colors.filter((c) => contrast(c, T.bg) < 3);
  ck(low.length === 2 && low.includes("#F5A623") && low.includes("#17A2B8"),
     `วัดได้ว่ามี 2 สีที่คอนทราสต์ต่ำกว่าเกณฑ์จริง คือ #F5A623 กับ #17A2B8 (วัดได้ ${low.join(", ")})`);
  ck(Math.abs(contrast("#F5A623", T.bg) - 1.89) < 0.02, `#F5A623 บนพื้นได้ 1.89 (วัดได้ ${contrast("#F5A623", T.bg).toFixed(2)})`);
  const res = checkPalette(T.colors);
  ck(res.maxSafe === 5, `แยกออกได้ 5 สีแรกจาก 8 พอดีกับเพดานที่ TH3 พิสูจน์ไว้ (วัดได้ ${res.maxSafe})`);
  ck(res.worst === "tritanopia", `ภาวะที่แย่ที่สุดคือ tritanopia (วัดได้ ${res.worst})`);
  const gt = worstDelta(["#00A550", "#17A2B8"]);
  ck(gt < 4, `เขียวกับฟ้าของแบรนด์กลืนกันจริง ΔE ${gt.toFixed(2)} ต่ำกว่า 4`);
  /* ‼️ กับดัก TH1 ที่อยู่ในไฟล์ต้นฉบับ: tableAccent เป็นสีแบรนด์แดง ซึ่งเป็นสีกริดตาราง
     และสี data bar ด้วย เครื่องมือของเราต้องไม่ทำตามนั้น ต้องออกเป็นสีเส้นเสมอ */
  const bt = buildTheme(derive({ name: "t", w: 1920, h: 1080, font: "Segoe UI",
    colors: T.colors.slice(), bg: T.bg, fg: T.fg, good: T.good, neutral: T.neutral, bad: T.bad }));
  ck(bt.tableAccent !== "#E4002B" && !bt.dataColors.includes(bt.tableAccent),
     "ไฟล์ที่เราออกไม่เอากับดัก tableAccent เป็นสีแบรนด์แดงของไฟล์ต้นฉบับมาด้วย (TH1)");
  ck(bt.dataColors.length === 8, "สีชุดข้อมูลออกครบทั้ง 8 สี ไม่ถูกตัดทิ้ง");
}

/* ── ⑥ เพดาน 5 สี ยืนยันจากแหล่งอิสระ ───────────────────────────────── */
console.log("\n⑥ เพดานจำนวนสี");
{
  /* ชุด Okabe-Ito (Okabe & Ito 2008) ออกแบบมาเพื่อคนตาบอดสีโดยเฉพาะ
     ถ้าแม้แต่ชุดนี้ยังมีคู่ที่กลืนกันตอนใช้ครบ 8 สี แปลว่าเพดานที่ TH3 บอกไว้เป็นจริง
     ‼️ ข้อนี้ไม่ได้ตรวจโค้ดของเรา แต่ตรวจว่าเครื่องวัดของเราให้ผลตรงกับความรู้ที่มีอยู่ */
  const OKABE_ITO = ["#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7", "#000000"];
  const w8 = worstDelta(OKABE_ITO);
  ck(w8 < 10, `ชุดมาตรฐาน Okabe-Ito ครบ 8 สี ยังมีคู่ที่ห่างแค่ ΔE ${w8.toFixed(1)} ยืนยันว่า 8 สีแยกครบไม่ได้จริง`);
  ck(checkPalette(OKABE_ITO).maxSafe < 8, "ตัวตรวจของเราจับได้ว่าชุด 8 สีนี้ใช้ได้ไม่ครบทุกสี");
}

/* ── ⑦ ‼️ ตัวควบคุมเชิงลบ ต้องพิสูจน์ได้ว่าเทสข้อ ⑤ แดงเป็น ───────────── */
console.log("\n⑦ ตัวควบคุมเชิงลบ ตัวตรวจต้องจับของแย่ได้");
{
  /* ชุดนี้คือชุดที่เคยร่างไว้ตอนแรกด้วยสายตาล้วนโดยไม่ได้วัด วัดแล้วได้ maxSafe 3 จาก 5
     ถ้าวันหนึ่งข้อนี้กลายเป็นผ่าน แปลว่าตัวตรวจพังแล้ว ไม่ใช่ชุดสีดีขึ้น */
  const ร่างที่ไม่ได้วัด = ["#0B5FA5", "#E08A1E", "#12897E", "#A63D7C", "#5B6B7C"];
  ck(checkPalette(ร่างที่ไม่ได้วัด).maxSafe < 5, "ชุดที่เลือกด้วยสายตาล้วน ถูกจับได้ว่าแยกไม่ครบ");
  ck(contrast("#E08A1E", "#FFFFFF") < 3, "สีส้มที่คอนทราสต์ 2.68 บนพื้นขาว ถูกจับได้ว่าต่ำกว่าเกณฑ์");
  /* สองสีที่ต่างกันในสายตาปกติแต่กลืนกันสนิทในภาวะตาบอดสีแดงเขียว */
  const แดงเขียว = ["#C83737", "#7A8C1E"];
  ck(checkPalette(แดงเขียว).maxSafe < 2, "แดงกับเขียวมะกอก ถูกจับได้ว่ากลืนกันสำหรับคนตาบอดสีแดงเขียว");
}

console.log(`\nผ่าน ${pass} ตก ${fail.length}`);
if (fail.length) { for (const f of fail) console.log("  ❌ " + f); process.exit(1); }
