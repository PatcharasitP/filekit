// ── สร้างธีม Power BI (theme.json) ────────────────────────────────────────
//
// ที่มา: พี่ปอนด์ส่ง https://datatraining.io/powerbi-theme-starter (Bas, How to Power BI)
// มาให้ดูพร้อมคลิปสอนทำธีม เปิดเครื่องมือเขาจริงแล้ว 12/09/2026 แนวคิดของเขาคือ
//   ① ถามขนาดผืนผ้าใบก่อน แล้วคำนวณขนาดตัวอักษรให้พอดีกับขนาดนั้น
//   ② ให้เลือกชุดสีสำเร็จที่ตั้งชื่อไว้ ไม่ใช่ให้จิ้มสีเองทีละสี
//   ③ มีพรีวิวรายงานตัวอย่างที่ทาสีตามชุดที่เลือก
//   ④ กด Generate ได้ไฟล์ JSON
//
// ‼️ สิ่งที่ของเราทำได้แต่ของเขาไม่มี และเป็นเหตุผลหลักที่ควรมีเครื่องมือนี้
//    **เตือนเรื่องคอนทราสต์และตาบอดสีตั้งแต่ตอนเลือกสี** ไม่ใช่ไปรู้ทีหลังตอนรายงานขึ้นจอ
//    ฐานความรู้จาก References/Knowledge/PBI_THEME_PLAYBOOK.md (เล่ม 6) พิสูจน์ไว้ 31/08/2026
//      TH1: มีแค่ name ที่บังคับ · fourthLevelElements คือสีตัวอักษรหมวดหมู่ในการ์ด ไม่ใช่สีเส้น
//      TH1: tableAccent เป็นทั้งสีกริดตารางและสี data bar ตั้งเป็นเทา อย่าตั้งสีแบรนด์
//      TH3: เพดานตาบอดสีคือ 5 series, 8 สีที่แยกครบทุกภาวะเป็นไปไม่ได้ทางคณิตศาสตร์
//      TH5: template-overlay ชนะการ encode ทุก property เป็น token
//    ตัวคำนวณอยู่ใน src/cvd.js (เทส 17 ข้อ) ซึ่งคำนวณชุด 8 สีได้ maxSafe = 5
//    ตรงกับที่งานวิจัยฝั่ง python สรุปไว้เป๊ะ เป็นการยืนยันไขว้คนละภาษา
//
// ‼️ ชุดสีสำเร็จในนี้เป็นของกลางทั้งหมด ไม่ใช่ธีมขององค์กรใด
//    ธีมองค์กรจริงใช้วิธี "เปิดไฟล์เข้ามาแก้" ซึ่งอ่านในเครื่องผู้ใช้ล้วน ไม่มีอะไรถูกฝังในเว็บ
//
// ‼️ ไม่ใช้ dropzone() ในเครื่องมือนี้ เพราะ dropzone มี syncActionButtons ที่จะ
//    ปิดปุ่มลงมือทำทุกปุ่มจนกว่าจะมีไฟล์ แต่เครื่องนี้สร้าง JSON ได้ตั้งแต่วินาทีแรก
//    โดยไม่ต้องมีไฟล์เลย ใส่ dropzone แล้วปุ่มคัดลอกจะกดไม่ได้ตลอดกาล

import { workspace } from "../workspace.js";
import { el } from "../dom.js";
import { statusBar, button, field, select, segmented, download } from "../ui.js";
import { paintCode, CODE_TOKEN_CSS } from "../codeview.js";
import { colorPicker, contrast, SWATCHES, COLORKIT_CSS } from "../colorkit.js";
import { checkPalette, simulate, CVD_TYPES } from "../cvd.js";

/* ชื่อภาวะตาบอดสีที่คนอ่านเข้าใจ คงชื่อละตินไว้ในวงเล็บเพราะคนที่รู้จักอยู่แล้วจะค้นต่อได้
   ‼️ ผูกกับคีย์ของ CVD_MATRIX ใน cvd.js โดยตรง เพิ่มภาวะใหม่ที่นั่นต้องมาเพิ่มที่นี่ด้วย */
const CVD_NAME = {
  protanopia: () => tr("ตาบอดสีแดง (protanopia)", "Red blind (protanopia)"),
  deuteranopia: () => tr("ตาบอดสีเขียว (deuteranopia)", "Green blind (deuteranopia)"),
  tritanopia: () => tr("ตาบอดสีน้ำเงิน (tritanopia)", "Blue blind (tritanopia)"),
};
const cvdName = (t) => (CVD_NAME[t] ? CVD_NAME[t]() : t);
import { tr, pl } from "../i18n.js";

/* ขนาดตัวอักษรฐานที่ผืนผ้าใบ 1920x1080 เป็นค่าที่ Power BI ใช้เป็นค่าตั้งต้นอยู่แล้ว
   ประกาศแค่ 4 คลาสหลักตาม TH1 อีก 10 คลาสสืบทอดจากสี่ตัวนี้เอง ไม่ต้องเขียนซ้ำ */
const BASE_TEXT = [["callout", 45], ["title", 12], ["header", 12], ["label", 10]];
const REF_AREA = 1920 * 1080;

const CANVAS_PRESETS = [
  ["1280 x 720", 1280, 720], ["1920 x 1080", 1920, 1080],
  ["2560 x 1440", 2560, 1440], ["900 x 1600", 900, 1600],
];

/* ชุดสีของกลาง ‼️ ไม่ได้เลือกด้วยสายตา แต่ค้นมาด้วยโปรแกรมแล้ววัดจริงทุกชุด
   เงื่อนไขที่ทุกชุดต้องผ่านพร้อมกัน
     ① คอนทราสต์ของทุกสีบนพื้นหลังของชุดนั้น >= 3 (สีทึบขนาดใหญ่ ตาม WCAG 1.4.11)
     ② ΔE00 ของทุกคู่ ในทุกภาวะตาบอดสีและในสายตาปกติ >= 15
        (เกณฑ์เตือนของ checkPalette คือ 10 จึงเผื่อไว้อีกครึ่งหนึ่ง)
     ③ เฉดสีในสายตาปกติห่างกัน >= 55 องศา ข้อนี้เป็นเรื่องความงามล้วน
        เพราะตัวหาค่าดีที่สุดเชิงตัวเลขชอบเลือกม่วงสองเฉดในชุดเดียว ซึ่งแยกออกจริง
        แต่คนสายตาปกติเห็นแล้วรู้สึกว่าชุดนี้ไม่ได้ถูกออกแบบมา
   ‼️ จงใจให้ชุดละ 5 สี ไม่ใช่ 8 ตามเพดานที่ TH3 พิสูจน์ไว้
      วัดชุด Okabe-Ito ซึ่งเป็นชุดมาตรฐานสำหรับคนตาบอดสีโดยเฉพาะแล้ว 12/09/2026
      ครบ 8 สีเมื่อไรก็มีคู่ที่ ΔE เหลือ 8.2 (ส้มกับม่วงชมพู) เป็นการยืนยันเพดานนั้นซ้ำ
   ‼️ ค่าที่วัดได้จริงถูกล็อกไว้ใน tests/theme.test.mjs แก้สีแล้วเทสจะแดงทันที */
export const PALETTES = () => [
  { id: "terra", name: tr("ดินเผา", "Terracotta"),
    colors: ["#DD7755", "#556600", "#0099AA", "#3355BB", "#884466"], bg: "#FFFFFF", fg: "#1B2430" },
  { id: "jewel", name: tr("อัญมณี", "Jewel tones"),
    colors: ["#AA1155", "#BB6600", "#005500", "#008888", "#7755CC"], bg: "#FBFAF7", fg: "#221F1B" },
  { id: "night", name: tr("จอมืด", "Dark canvas"),
    colors: ["#FFBB99", "#889933", "#66DDDD", "#2299DD", "#CC7799"], bg: "#1A1D23", fg: "#F2F4F7" },
];

const STYLE = `
.th-grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(126px,1fr)); gap:8px}
.th-sw{display:flex; align-items:center; gap:7px; padding:8px 9px; min-height:38px;
  border:1px solid var(--line); border-radius:var(--r-sm); background:var(--bg-soft); cursor:pointer;
  font:inherit; font-size:12px; font-weight:700; color:var(--text); text-align:start; width:100%;
  line-height:1.5}
.th-sw[aria-pressed="true"]{border-color:var(--ac,var(--brand)); box-shadow:inset 0 0 0 1px var(--ac,var(--brand))}
.th-grid-sm{grid-template-columns:repeat(auto-fill,minmax(104px,1fr))}
.th-dots{display:flex; gap:2px; flex:none}
.th-dots i{width:9px; height:15px; border-radius:2px}
.th-sec{margin:16px 0 8px; font-size:11.5px; font-weight:700; letter-spacing:.09em;
  text-transform:uppercase; color:var(--text-mute); line-height:1.5}
.th-note{font-size:12px; color:var(--text-mute); margin:6px 0 0; line-height:1.7}
.th-code{margin:0; padding:14px 16px; border-radius:var(--r-sm); background:var(--bg-soft);
  border:1px solid var(--line); overflow:auto; max-height:min(58vh,540px);
  font:12.5px/1.7 ui-monospace,Menlo,Consolas,monospace; color:var(--text); white-space:pre}
@media (max-width:640px){ .th-code{max-height:70vh} }
.th-tabs{margin-bottom:12px}
.th-warn{border:1px solid var(--line); border-inline-start:3px solid var(--err);
  border-radius:var(--r-sm); background:var(--bg-soft); padding:10px 12px; font-size:12.5px;
  line-height:1.7; color:var(--text); margin-bottom:10px}
.th-warn.th-ok{border-inline-start-color:var(--g-data)}
/* พรีวิวรายงานจำลอง ทำด้วย CSS ล้วน ไม่มีไลบรารีกราฟ */
.th-prev{border:1px solid var(--line); border-radius:var(--r-sm); overflow:hidden}
.th-canvas{padding:16px; display:flex; flex-direction:column; gap:12px}
.th-cards{display:grid; grid-template-columns:repeat(auto-fit,minmax(112px,1fr)); gap:10px}
.th-card{border-radius:8px; padding:10px 12px; border:1px solid rgba(128,128,128,.22)}
.th-card b{display:block; line-height:1.35}
.th-card span{display:block; line-height:1.6; opacity:.8}
.th-bars{display:flex; align-items:flex-end; gap:10px; height:112px; padding-top:6px}
.th-bar{flex:1; border-radius:3px 3px 0 0; min-width:10px}
.th-legend{display:flex; flex-wrap:wrap; gap:10px}
.th-legend span{display:inline-flex; align-items:center; gap:5px; line-height:1.7}
.th-legend i{width:10px; height:10px; border-radius:2px; flex:none}
.th-cvd{display:grid; grid-template-columns:repeat(auto-fit,minmax(148px,1fr)); gap:10px; margin-top:10px}
.th-cvdbox{border:1px solid var(--line); border-radius:var(--r-sm); padding:9px 10px}
.th-cvdbox b{display:block; font-size:11.5px; margin-bottom:6px; line-height:1.6; color:var(--text-dim)}
.th-row{display:flex; gap:3px}
.th-row i{flex:1; height:22px; border-radius:3px}
.th-tbl{width:100%; border-collapse:collapse; font-size:12px}
.th-tbl th,.th-tbl td{border:1px solid var(--line); padding:6px 9px; text-align:start; line-height:1.7}
.th-tbl th{background:var(--bg-soft); font-weight:700}
.th-bad{color:var(--err); font-weight:700} .th-good{color:var(--g-data); font-weight:700}
.th-open{margin-top:2px}
.th-more{border:1px solid var(--line); border-radius:var(--r-sm); padding:0 10px; margin-top:6px}
.th-more>summary{cursor:pointer; padding:9px 2px; font-size:12.5px; font-weight:700;
  line-height:1.6; color:var(--text-dim)}
.th-more[open]>summary{margin-bottom:4px; border-bottom:1px solid var(--line)}
.th-more>*:last-child{margin-bottom:10px}
/* ‼️ ช่องสองช่องเรียงกัน ต้องยุบตัวได้ ไม่งั้นล้นออกนอกแผงขวาจนอ่านตัวเลขไม่ครบ
   (เห็นกับตาตอนเปิดจริงที่ 1600px ช่อง "สูง" ถูกตัดหายไปครึ่งหนึ่ง) */
.th-two{display:flex; gap:8px; margin-top:8px}
.th-two>*{flex:1 1 0; min-width:0}
.th-two input{width:100%; box-sizing:border-box}
` + COLORKIT_CSS + CODE_TOKEN_CSS;

/** ตัวคูณขนาดตัวอักษรที่พอดีกับผืนผ้าใบขนาดนี้
 *
 * ‼️ แนวคิดจาก datatraining.io: ผืนผ้าใบใหญ่ขึ้นแปลว่ามีที่เยอะขึ้นหรือมองจากไกลขึ้น
 *    ตัวอักษรจึงควรโตตาม ไม่ใช่ใช้ขนาดเดียวกับผืนเล็ก
 * ‼️ สเกลด้วยรากที่สองของพื้นที่ ไม่ใช่พื้นที่ตรง ๆ เพราะตัวอักษรเป็นความยาวมิติเดียว
 *    ถ้าใช้พื้นที่ตรง ๆ ผืนใหญ่ขึ้นสองเท่าจะได้ตัวอักษรใหญ่ขึ้นสี่เท่า ซึ่งเกินจริงมาก
 * ‼️ คุมช่วง 0.75 ถึง 1.6 เท่า นอกช่วงนี้ตัวอักษรจะเล็กจนอ่านไม่ออกหรือใหญ่จนกินที่กราฟ
 *    (เป็นการตัดสินใจเชิงออกแบบของเรา ไม่ได้มาจากงานวิจัย)
 */
export function textScale(w, h) {
  const area = Math.max(1, (+w || 0) * (+h || 0));
  return Math.min(1.6, Math.max(0.75, Math.sqrt(area / REF_AREA)));
}

/* ‼️ ขอบเขตนี้ไม่ใช่การเดา อ่านจากไฟล์ schema ฉบับจริงของ Microsoft
   References/Themes/schema/reportThemeSchema-2.157.json นิยาม fontSize ว่า
   { "type": "number", "minimum": 8, "maximum": 60 }
   เกินจากนี้ Power BI ไม่รับไฟล์ · เจอจริงตอน 6000x6000 คำนวณได้ 72pt
   (tests/theme_schema.py จับได้ 12/09/2026 ก่อนของจะออกไปถึงมือคนใช้) */
const FONT_MIN = 8, FONT_MAX = 60;

/** ขนาดจริงของทั้ง 4 คลาส ที่ผืนผ้าใบขนาดนี้ บีบให้อยู่ในช่วงที่ schema ยอมรับเสมอ */
export function textSizes(w, h) {
  const s = textScale(w, h);
  const out = {};
  for (const [key, base] of BASE_TEXT) {
    out[key] = Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(base * s)));
  }
  return out;
}

/** สร้างก้อน theme.json
 *
 * ‼️ ประกาศเฉพาะสิ่งที่เราตั้งใจคุมจริง ตาม TH1 มีแค่ name ที่บังคับ
 *    ไม่ยัด visualStyles ทั้งดุ้น เพราะ TH5 สรุปแล้วว่า template-overlay ชนะ
 *    การ encode ทุก property เป็น token เสี่ยงพังโดยไม่ได้อะไรเพิ่ม
 * ‼️ tableAccent ตั้งเป็นสีเส้น ไม่ใช่สีแบรนด์ (TH1) เพราะมันเป็นทั้งสีกริดตาราง
 *    และสีตั้งต้นของ data bar ตั้งเป็นสีแบรนด์แล้วตารางจะมีสีจัดทั้งใบ
 * ‼️ fourthLevelElements คือสีตัวอักษรหมวดหมู่ในการ์ด (TH1) ตั้งจางไปคนอ่านไม่ออก
 *    จึงผูกกับสีตัวอักษรรอง ไม่ใช่สีเส้น
 */
export function buildTheme(o) {
  const sizes = textSizes(o.w, o.h);
  const textClasses = {};
  for (const [key] of BASE_TEXT) textClasses[key] = { fontSize: sizes[key], fontFace: o.font };
  return {
    $schema: "https://raw.githubusercontent.com/microsoft/powerbi-desktop-samples/main/Report%20Theme%20JSON%20Schema/reportThemeSchema-2.157.json",
    name: o.name || "FileKit Theme",
    dataColors: o.colors.slice(),
    background: o.bg,
    secondaryBackground: o.bg2,
    foreground: o.fg,
    firstLevelElements: o.fg,
    secondLevelElements: o.fg2,
    thirdLevelElements: o.line,
    fourthLevelElements: o.fg2,
    tableAccent: o.line,
    good: o.good, neutral: o.neutral, bad: o.bad,
    maximum: o.good, minimum: o.bad, null: o.line,
    textClasses,
  };
}

/** ผสมสองสีตามสัดส่วน ใช้ปั้นสีรองกับสีเส้นจากสีหลักที่ผู้ใช้เลือก */
export function mix(a, b, ratio) {
  const p = (h) => { const s = String(h).replace("#", ""); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
  const m = (x, y) => Math.round(x + (y - x) * ratio).toString(16).padStart(2, "0");
  return `#${m(r1, r2)}${m(g1, g2)}${m(b1, b2)}`;
}

/** สีที่สืบทอดมาจากพื้นหลังกับตัวอักษร ไม่ให้ตั้งเอง เพราะตั้งผิดแล้วอ่านไม่ออกทันที */
export function derive(s) {
  s.fg2 = mix(s.fg, s.bg, 0.30);
  s.line = mix(s.fg, s.bg, 0.78);
  s.bg2 = mix(s.bg, s.fg, 0.05);
  return s;
}

export function mount(tool) {
  const st = statusBar();
  const first = PALETTES()[0];
  const state = derive({
    name: "FileKit Theme", w: 1920, h: 1080, font: "Segoe UI",
    colors: first.colors.slice(), bg: first.bg, fg: first.fg,
    good: "#1F8A50", neutral: "#6C7A8D", bad: "#C4321F",
  });

  /* ── แผงซ้าย: จุดเริ่มต้น ───────────────────────────────────────────── */
  const palBox = el("div", { class: "th-grid" });
  const fileIn = el("input", {
    type: "file", accept: ".json,application/json", hidden: true,
    onchange: (e) => { const f = e.target.files[0]; fileIn.value = ""; if (f) readTheme(f); },
  });
  const left = el("div", {}, [
    el("h3", { class: "th-sec", style: "margin-top:0" }, tr("ชุดสีของกลาง", "Neutral palettes")),
    palBox,
    el("h3", { class: "th-sec" }, tr("หรือเริ่มจากธีมเดิม", "Or start from your own")),
    el("div", { class: "th-open" }, [
      button(tr("เปิดไฟล์ธีม .json", "Open a .json theme"), { icon: "upload", ghost: true, onclick: () => fileIn.click() }),
      fileIn,
    ]),
    el("p", { class: "th-note" },
      tr("ไฟล์ถูกอ่านในเครื่องคุณ ไม่ถูกส่งไปที่ไหน ธีมขององค์กรจึงเอามาแก้ตรงนี้ได้",
         "The file is read on your device and never uploaded, so a company theme is safe to edit here")),
  ]);

  /* ── แผงขวา: ปรับแต่ง ──────────────────────────────────────────────── */
  const nameIn = el("input", { type: "text", value: state.name });
  const wIn = el("input", { type: "number", value: String(state.w), min: "320", max: "6000" });
  const hIn = el("input", { type: "number", value: String(state.h), min: "240", max: "6000" });
  const fontSel = select([["Segoe UI", "Segoe UI"], ["Arial", "Arial"], ["Tahoma", "Tahoma"],
                          ["Sarabun", "Sarabun"], ["Calibri", "Calibri"]], state.font);
  const sizeNote = el("p", { class: "th-note" });
  const cvBox = el("div", { class: "th-grid th-grid-sm" });
  const baseBox = el("div", {});
  const dataBox = el("div", {});
  const right = el("div", {}, [
    field(tr("ชื่อธีม", "Theme name"), nameIn),
    el("h3", { class: "th-sec" }, tr("ขนาดผืนผ้าใบ", "Canvas size")),
    cvBox,
    el("div", { class: "th-two" }, [
      field(tr("กว้าง", "Width"), wIn), field(tr("สูง", "Height"), hIn),
    ]),
    sizeNote,
    field(tr("ฟอนต์หลัก", "Primary font"), fontSel),
    el("h3", { class: "th-sec" }, tr("สีพื้นฐาน", "Base colours")),
    baseBox,
    el("h3", { class: "th-sec" }, tr("สีของชุดข้อมูล", "Data colours")),
    dataBox,
  ]);

  /* ── ตรงกลาง ───────────────────────────────────────────────────────── */
  const tabs = segmented([
    ["prev", tr("พรีวิวรายงาน", "Report preview")],
    ["check", tr("ตรวจสี", "Colour check")],
    ["json", tr("ไฟล์ธีม", "Theme file")],
  ], "prev");
  tabs.classList.add("th-tabs");
  const prevBox = el("div", { class: "th-prev" });
  const checkBox = el("div", {});
  const codeEl = el("code", {});
  const codeBox = el("pre", { class: "th-code" }, [codeEl]);
  const center = el("div", {}, [tabs, prevBox, checkBox, codeBox]);

  const ws = workspace(tool, {
    left: { title: tr("เริ่มจาก", "Start from"), node: left },
    center: { title: tr("ผลลัพธ์", "Result"), node: center },
    right: { title: tr("ปรับแต่ง", "Customise"), node: right },
    footer: [
      button(tr("คัดลอก JSON", "Copy JSON"), { icon: "copy", onclick: onCopy }),
      button(tr("ดาวน์โหลด .json", "Download .json"), { icon: "download", ghost: true, onclick: onDownload }),
      st.node,
    ],
    /* ‼️ ข้อความนี้ถูกจำกัดความยาว ทั้งเว็บมีข้อความไทยเกิน 100 ตัวอักษรได้ไม่เกิน 4 ก้อน
       (tests/browser_layout.py) เขียนยาวกว่านี้เทสจะแดง */
    note: tr(
      "เอาไปใช้: Power BI Desktop แท็บ View แล้ว Themes แล้ว Browse for themes แล้วเลือกไฟล์นี้",
      "To use it: Power BI Desktop, View tab, Themes, Browse for themes, then pick this file"
    ),
  });
  ws.wrap.prepend(el("style", { text: STYLE }));
  ws.showCanvas(true);

  buildPalettes(); buildCanvas(); buildBase(); buildData();
  for (const c of [nameIn, wIn, hIn]) c.addEventListener("input", readInputs);
  fontSel.addEventListener("change", readInputs);
  tabs.addEventListener("change", render);
  render();
  return ws.wrap;

  /* ── ประกอบแผงควบคุม ───────────────────────────────────────────────── */
  function buildPalettes() {
    palBox.innerHTML = "";
    for (const p of PALETTES()) {
      palBox.appendChild(el("button", {
        class: "th-sw", type: "button", "aria-pressed": String(p.colors.join() === state.colors.join()),
        onclick: () => {
          state.colors = p.colors.slice(); state.bg = p.bg; state.fg = p.fg; derive(state);
          buildPalettes(); buildBase(); buildData(); render();
          st.ok(tr(`ใช้ชุด ${p.name} แล้ว`, `Using ${p.name}`));
        },
      }, [
        el("span", { class: "th-dots", "aria-hidden": "true" },
          p.colors.map((c) => el("i", { style: `background:${c}` }))),
        p.name,
      ]));
    }
  }

  function buildCanvas() {
    cvBox.innerHTML = "";
    for (const [label, w, h] of CANVAS_PRESETS) {
      cvBox.appendChild(el("button", {
        class: "th-sw", type: "button", "aria-pressed": String(state.w === w && state.h === h),
        onclick: () => { state.w = w; state.h = h; wIn.value = w; hIn.value = h; buildCanvas(); render(); },
      }, label));
    }
  }

  function buildBase() {
    baseBox.innerHTML = "";
    /* ‼️ จานสีสำเร็จต้องตรงกับหน้าที่ของช่องนั้น ไม่ใช่ใช้ชุดเดียวกันหมด
       เสนอสีแบรนด์สดใสให้ช่อง "พื้นหลัง" คือเชิญให้ตั้งพื้นรายงานเป็นสีส้มจัด */
    const mk = (key, label, swatches) => {
      const pk = colorPicker(state[key], (v) => {
        state[key] = v;
        if (key === "bg" || key === "fg") derive(state);
        render();
      }, { label, swatches });
      return field(label, pk.node);
    };
    baseBox.append(
      mk("bg", tr("พื้นหลัง", "Background"), SWATCHES.neutral),
      mk("fg", tr("ตัวอักษรหลัก", "Main text"), SWATCHES.neutral),
    );
    /* ‼️ สามสีนี้คนแก้นาน ๆ ครั้ง แต่กินที่แผงขวาไปเกือบสามร้อยพิกเซล
       ยุบไว้ก่อนตามหลักที่วิจัยไว้ 11/09 ว่าแผงตั้งค่ายาว ๆ ต้องยุบของที่ไม่ค่อยใช้ได้ */
    baseBox.appendChild(el("details", { class: "th-more" }, [
      el("summary", {}, tr("สีบอกสถานะ ดี กลาง แย่", "Status colours: good, neutral, bad")),
      mk("good", tr("ค่าดี", "Good"), SWATCHES.accent),
      mk("neutral", tr("ค่ากลาง", "Neutral"), SWATCHES.neutral),
      mk("bad", tr("ค่าแย่", "Bad"), SWATCHES.accent),
    ]));
  }

  function buildData() {
    dataBox.innerHTML = "";
    state.colors.forEach((c, i) => {
      const label = tr(`สีที่ ${i + 1}`, `Colour ${i + 1}`);
      const pk = colorPicker(c, (v) => { state.colors[i] = v; buildPalettes(); render(); }, { label });
      dataBox.appendChild(field(label, pk.node));
    });
  }

  function readInputs() {
    state.name = nameIn.value.trim() || "FileKit Theme";
    state.w = Math.max(320, Math.min(6000, +wIn.value || 1920));
    state.h = Math.max(240, Math.min(6000, +hIn.value || 1080));
    state.font = fontSel.value;
    buildCanvas(); render();
  }

  /* ── วาดผลลัพธ์ ────────────────────────────────────────────────────── */
  function render() {
    const v = tabs.value;
    prevBox.hidden = v !== "prev";
    checkBox.hidden = v !== "check";
    codeBox.hidden = v !== "json";
    const s = textScale(state.w, state.h), sz = textSizes(state.w, state.h);
    sizeNote.textContent = tr(
      `ตัวอักษรถูกปรับเป็น ${Math.round(s * 100)}% ของขนาดมาตรฐาน ตัวเลขในการ์ด ${sz.callout}pt ป้าย ${sz.label}pt`,
      `Text scaled to ${Math.round(s * 100)}%, card callout ${sz.callout}pt, labels ${sz.label}pt`);
    if (v === "prev") drawPreview(sz);
    else if (v === "check") drawCheck();
    else codeEl.innerHTML = paintCode(json(), "json");
  }

  /* ‼️ ต้องเป็น function declaration ไม่ใช่ const ลูกศร เพราะบรรทัดนี้อยู่หลัง return ws.wrap
     ตัวแปร const จะไม่มีวันถูกสร้าง render() ที่เรียกก่อน return จึงพังด้วย TDZ
     (พลาดเรื่องนี้เป็นครั้งที่ 8 ในโปรเจกต์นี้ จับได้ด้วยการเปิดเบราว์เซอร์ดูจริงเท่านั้น
      node --check กับการ import เฉย ๆ ไม่เจอ เพราะบั๊กเกิดตอนรัน mount() เท่านั้น) */
  function json() { return JSON.stringify(buildTheme(state), null, 2); }

  function drawPreview(sz) {
    const { bg, fg, fg2, bg2, colors, font } = state;
    const px = (pt) => Math.round(pt * 1.333);     // pt เป็น px โดยประมาณ ใช้ในพรีวิวเท่านั้น
    const card = (label, val) => el("div", { class: "th-card", style: `background:${bg2}` }, [
      el("b", { style: `color:${fg}; font-size:${Math.round(px(sz.callout) * 0.45)}px; font-family:${font}` }, val),
      el("span", { style: `color:${fg2}; font-size:${px(sz.label)}px; font-family:${font}` }, label),
    ]);
    const bars = [62, 88, 45, 74, 96, 58, 81];
    prevBox.innerHTML = "";
    prevBox.appendChild(el("div", { class: "th-canvas", style: `background:${bg}` }, [
      el("div", { style: `color:${fg}; font-weight:700; line-height:1.5; font-size:${px(sz.title)}px; font-family:${font}` },
        tr("ยอดขายรายภาค", "Sales by region")),
      el("div", { class: "th-cards" }, [
        card(tr("ยอดรวม", "Total"), "12.4M"),
        card(tr("เทียบปีก่อน", "vs last year"), "+8.2%"),
        card(tr("ลูกค้าใหม่", "New customers"), "1,284"),
      ]),
      el("div", { class: "th-bars" }, bars.map((h, i) =>
        el("div", { class: "th-bar", style: `height:${h}%; background:${colors[i % colors.length]}` }))),
      el("div", { class: "th-legend", style: `color:${fg2}; font-size:${px(sz.label)}px; font-family:${font}` },
        colors.map((c, i) => el("span", {}, [el("i", { style: `background:${c}` }),
          tr(`ชุดที่ ${i + 1}`, `Series ${i + 1}`)]))),
    ]));
  }

  /* ‼️ หัวใจของเครื่องมือนี้ ให้เห็นปัญหาตั้งแต่ตอนเลือกสี ไม่ใช่ไปรู้ทีหลังตอนรายงานขึ้นจอ */
  function drawCheck() {
    const { bg, fg, fg2, colors } = state;
    checkBox.innerHTML = "";

    /* ① คอนทราสต์ เกณฑ์ WCAG: ตัวอักษรปกติ 4.5 ส่วนแท่งกราฟกับสีทึบใหญ่ ๆ ใช้ 3 */
    const pairs = [
      [tr("ตัวอักษรหลักบนพื้นหลัง", "Main text on background"), fg, bg, 4.5],
      [tr("ตัวอักษรรองบนพื้นหลัง", "Secondary text on background"), fg2, bg, 4.5],
      ...colors.map((c, i) => [tr(`สีที่ ${i + 1} บนพื้นหลัง`, `Colour ${i + 1} on background`), c, bg, 3]),
    ];
    const scored = pairs.map(([label, a, b, floor]) => {
      const r = contrast(a, b);
      return { label, r, ok: r !== null && r >= floor, floor };
    });
    const failed = scored.filter((x) => !x.ok);
    checkBox.appendChild(el("div", { class: "th-warn" + (failed.length ? "" : " th-ok") },
      failed.length
        ? tr(`มี ${failed.length} คู่ที่คอนทราสต์ต่ำกว่าเกณฑ์ จะอ่านยากบนจอจริงและบนโปรเจกเตอร์`,
             `${pl(failed.length, "pair", "pairs")} below the contrast floor, hard to read on a real screen`)
        : tr("คอนทราสต์ผ่านเกณฑ์ทุกคู่", "Every pair clears the contrast floor")));
    checkBox.appendChild(el("table", { class: "th-tbl" }, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, tr("คู่สี", "Pair")), el("th", {}, tr("วัดได้", "Measured")),
        el("th", {}, tr("เกณฑ์", "Floor")), el("th", {}, tr("ผล", "Result")),
      ])]),
      el("tbody", {}, scored.map((x) => el("tr", {}, [
        el("td", {}, x.label),
        el("td", { class: x.ok ? "th-good" : "th-bad" }, x.r === null ? "?" : `${x.r.toFixed(2)}:1`),
        el("td", {}, `${x.floor}:1`),
        el("td", {}, x.ok ? tr("ผ่าน", "Pass") : tr("ต่ำไป", "Too low")),
      ]))),
    ]));

    /* ② ตาบอดสี */
    const res = checkPalette(colors);
    checkBox.appendChild(el("h3", { class: "th-sec" }, tr("คนตาบอดสีเห็นแบบนี้", "How colour blind viewers see it")));
    checkBox.appendChild(el("div", { class: "th-warn" + (res.maxSafe >= colors.length ? " th-ok" : "") },
      res.maxSafe >= colors.length
        ? tr(`ชุดนี้แยกออกครบทั้ง ${colors.length} สี ในทุกภาวะที่ตรวจ`,
             `All ${colors.length} colours stay apart in every condition checked`)
        : tr(`แยกออกแค่ ${res.maxSafe} สีแรก สีถัดจากนั้นกลืนกันในภาวะ${cvdName(res.worst)} ให้ใส่ป้ายกำกับช่วย หรือลดจำนวนชุดข้อมูลลง`,
             `Only the first ${res.maxSafe} stay apart, the rest merge under ${cvdName(res.worst)}, add labels or use fewer series`)));
    checkBox.appendChild(el("div", { class: "th-cvd" }, [
      el("div", { class: "th-cvdbox" }, [
        el("b", {}, tr("สายตาปกติ", "Normal vision")),
        el("div", { class: "th-row" }, colors.map((c) => el("i", { style: `background:${c}` }))),
      ]),
      ...CVD_TYPES.map((t) => el("div", { class: "th-cvdbox" }, [
        el("b", {}, cvdName(t)),
        el("div", { class: "th-row" }, colors.map((c) => el("i", { style: `background:${simulate(c, t)}` }))),
      ])),
    ]));
  }

  /* ── อ่านธีมเดิมที่ผู้ใช้เปิดเข้ามา ──────────────────────────────────── */
  async function readTheme(f) {
    let j;
    try { j = JSON.parse(await f.text()); }
    catch { st.err(tr("อ่านไฟล์นี้ไม่ได้ อาจไม่ใช่ JSON ที่ถูกต้อง", "Could not read that file, it may not be valid JSON")); return; }
    if (!j || typeof j !== "object" || Array.isArray(j)) {
      st.err(tr("ไฟล์นี้ไม่ใช่ธีม Power BI", "That file is not a Power BI theme")); return;
    }
    /* ‼️ รับเฉพาะคีย์ที่เรารู้จักและเป็นสีจริง ไม่กลืนทั้งไฟล์เข้ามา
       ธีมจริงมักมี visualStyles ก้อนใหญ่ที่เราไม่ได้แก้ ถ้ากลืนมาแล้วเขียนกลับจะเพี้ยน
       จึงบอกผู้ใช้ตรง ๆ ว่าอ่านอะไรมาบ้าง ไม่ให้เข้าใจผิดว่าธีมเดิมถูกรักษาไว้ครบ */
    const hex = (v) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null);
    let took = 0;
    const dc = Array.isArray(j.dataColors) ? j.dataColors.filter(hex) : [];
    if (dc.length) { state.colors = dc.slice(0, 8); took++; }
    for (const [key, src] of [["bg", "background"], ["fg", "foreground"],
                              ["good", "good"], ["neutral", "neutral"], ["bad", "bad"]]) {
      const v = hex(j[src]); if (v) { state[key] = v; took++; }
    }
    if (typeof j.name === "string" && j.name.trim()) { state.name = j.name.trim(); nameIn.value = state.name; }
    derive(state);
    buildPalettes(); buildBase(); buildData(); render();

    if (!took) {
      st.info(tr(`เปิด ${f.name} แล้วแต่ไม่เจอสีที่อ่านได้ ไฟล์นี้อาจคุมสีผ่าน visualStyles อย่างเดียว`,
                 `Opened ${f.name} but found no readable colours, it may set colours through visualStyles only`));
      return;
    }
    const extra = j.visualStyles
      ? tr(" ส่วน visualStyles ในไฟล์เดิมไม่ถูกนำมาด้วย", ", visualStyles from the original was not carried over")
      : "";
    st.ok(tr(`อ่าน ${state.name} แล้ว ได้ค่าสีมา ${took} รายการ ปรับต่อได้เลย${extra}`,
             `Loaded ${state.name}, ${pl(took, "colour value", "colour values")} taken, edit away${extra}`));
  }

  async function onCopy() {
    try { await navigator.clipboard.writeText(json()); st.ok(tr("คัดลอกแล้ว", "Copied")); }
    catch { st.err(tr("คัดลอกไม่สำเร็จ กดดาวน์โหลดแทนได้", "Could not copy, download instead")); }
  }

  function onDownload() {
    const n = state.name.replace(/[\\/:*?"<>|]/g, "-").trim() + ".json";
    download(new Blob([json()], { type: "application/json;charset=utf-8" }), n);
    st.ok(tr(`ดาวน์โหลด ${n} แล้ว`, `Downloaded ${n}`));
  }
}
