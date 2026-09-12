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

/* ชุดสี ‼️ ของกลางไม่ได้เลือกด้วยสายตา แต่ค้นมาด้วยโปรแกรมแล้ววัดจริงทุกชุด
   เงื่อนไขที่ชุดของกลางต้องผ่านพร้อมกัน
     ① คอนทราสต์ของทุกสีบนพื้นหลังของชุดนั้น >= 3 (สีทึบขนาดใหญ่ ตาม WCAG 1.4.11)
     ② ΔE00 ของทุกคู่ ในทุกภาวะตาบอดสีและในสายตาปกติ >= 15
        (เกณฑ์เตือนของ checkPalette คือ 10 จึงเผื่อไว้อีกครึ่งหนึ่ง)
     ③ เฉดสีในสายตาปกติห่างกัน >= 55 องศา ข้อนี้เป็นเรื่องความงามล้วน
        เพราะตัวหาค่าดีที่สุดเชิงตัวเลขชอบเลือกม่วงสองเฉดในชุดเดียว ซึ่งแยกออกจริง
        แต่คนสายตาปกติเห็นแล้วรู้สึกว่าชุดนี้ไม่ได้ถูกออกแบบมา
   ‼️ จงใจให้ชุดของกลางชุดละ 5 สี ตามเพดานที่ TH3 พิสูจน์ไว้
      วัดชุด Okabe-Ito ซึ่งเป็นชุดมาตรฐานสำหรับคนตาบอดสีโดยเฉพาะแล้ว 12/09/2026
      ครบ 8 สีเมื่อไรก็มีคู่ที่ ΔE เหลือ 8.2 (ส้มกับม่วงชมพู) เป็นการยืนยันเพดานนั้นซ้ำ

   ‼️‼️ kind: "brand" คือสีจริงขององค์กร ซึ่ง **ห้ามแก้ให้ผ่านเกณฑ์**
      สีแบรนด์เป็นข้อกำหนดที่คนทำรายงานเปลี่ยนเองไม่ได้ หน้าที่ของเครื่องมือนี้
      ไม่ใช่ทำให้มันดูผ่าน แต่คือบอกตามตรงว่าจุดไหนมีปัญหาและให้ทางออก
      ชุดแบรนด์จึงไม่ต้องผ่านเงื่อนไข ① ② ③ แต่ต้องถูกแผงตรวจสีรายงานตามจริงเสมอ
   ‼️ ค่าที่วัดได้จริงถูกล็อกไว้ใน tests/theme.test.mjs แก้สีแล้วเทสจะแดงทันที */
export const PALETTES = () => [
  { id: "terra", kind: "neutral", name: tr("ดินเผา", "Terracotta"),
    colors: ["#DD7755", "#556600", "#0099AA", "#3355BB", "#884466"], bg: "#FFFFFF", fg: "#1B2430" },
  { id: "jewel", kind: "neutral", name: tr("อัญมณี", "Jewel tones"),
    colors: ["#AA1155", "#BB6600", "#005500", "#008888", "#7755CC"], bg: "#FBFAF7", fg: "#221F1B" },
  { id: "night", kind: "neutral", name: tr("จอมืด", "Dark canvas"),
    colors: ["#FFBB99", "#889933", "#66DDDD", "#2299DD", "#CC7799"], bg: "#1A1D23", fg: "#F2F4F7" },

  /* สีแบรนด์จริงของ True Corporation คัดมาจาก References/Themes/TrueCorp_PowerBI_Theme.json
     ‼️ ลอกมาเฉพาะ "สี" ไม่เอาก้อน visualStyles 16 KB ในไฟล์ต้นฉบับมาด้วย
        เพราะเครื่องมือนี้ไม่ได้ออก visualStyles อยู่แล้ว (ดูเหตุผลที่ buildTheme)
     ‼️ ผลที่วัดได้จริงด้วย src/cvd.js เมื่อ 12/09/2026 ซึ่งเครื่องมือจะแสดงให้ผู้ใช้เห็นเอง
        คอนทราสต์บนพื้น #F5F7FA: #F5A623 ได้ 1.89 และ #17A2B8 ได้ 2.84 ทั้งคู่ต่ำกว่าเกณฑ์ 3
        ตาบอดสี: แยกออกแค่ 5 สีแรกจาก 8 คู่ที่แย่สุดคือเขียว #00A550 กับฟ้า #17A2B8
                 เหลือ ΔE 3.12 ในภาวะ tritanopia ซึ่งแทบเป็นสีเดียวกัน
        ชุดย่อย 5 สีที่ดีที่สุดในนี้คือสีที่ 1, 2, 3, 4, 7 ได้ ΔE ต่ำสุด 10.52 */
  { id: "true", kind: "brand", name: tr("True Corporation", "True Corporation"),
    colors: ["#E4002B", "#1A1A2E", "#0052CC", "#00A550", "#F5A623", "#9B51E0", "#6C7A8D", "#17A2B8"],
    bg: "#F5F7FA", fg: "#1A1A2E", good: "#00A550", neutral: "#6C7A8D", bad: "#E4002B" },
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
.th-dots i{width:9px; height:15px; border-radius:2px; flex:0 1 9px; min-width:4px}
.th-swname{min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.th-brandhead{grid-column:1/-1; margin:10px 0 0; font-size:11.5px; line-height:1.7; color:var(--text-mute)}
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
.th-rhead{display:flex; align-items:center; gap:12px; flex-wrap:wrap}
.th-chips{display:flex; gap:5px; margin-inline-start:auto}
.th-chips span{padding:2px 9px; border-radius:999px; border:1px solid; line-height:1.6}
.th-delta{display:block; line-height:1.6}
.th-cols{display:grid; grid-template-columns:repeat(auto-fit,minmax(208px,1fr)); gap:10px}
.th-vis{border:1px solid; border-radius:8px; padding:10px 12px; display:flex; flex-direction:column; gap:8px; min-width:0}
.th-bars2{display:flex; flex-direction:column; gap:6px}
.th-brow{display:flex; align-items:center; gap:8px}
.th-blab{flex:0 0 62px; line-height:1.6; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.th-btrack{position:relative; flex:1; height:13px; border-radius:3px; overflow:hidden; min-width:0}
.th-btrack i{position:absolute; inset-block:0; inset-inline-start:0; border-radius:3px}
.th-btrack u{position:absolute; inset-block:-1px; width:2px; text-decoration:none}
.th-bval{flex:0 0 34px; text-align:end; line-height:1.6}
.th-spark{width:100%; height:78px; display:block}
.th-axis{display:flex; justify-content:space-between; line-height:1.6}
.th-ptbl{width:100%; border-collapse:collapse}
.th-ptbl td{border-bottom:1px solid; padding:4px 2px; line-height:1.7}
.th-ptbl td:last-child{width:58%}
.th-dbar{position:relative; display:flex; align-items:center; gap:6px}
.th-dbar i{height:12px; border-radius:2px; opacity:.8; flex:none}

.th-cards{display:grid; grid-template-columns:repeat(auto-fit,minmax(98px,1fr)); gap:10px}
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
.th-list{margin:0; padding-inline-start:18px; font-size:12px; line-height:1.8; color:var(--text-dim)}
.th-list li{margin-bottom:2px}
.th-facts{font-size:11.5px; color:var(--text-mute); line-height:1.7; margin-inline-start:auto;
  text-align:end; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
@media (max-width:640px){ .th-facts{display:none} }
/* ช่องตัวเลขคู่แถบเลื่อน ลอกจาก datatraining.io */
.th-num{margin-top:8px}
.th-num input[type=range]{width:100%; margin-top:2px; accent-color:var(--ac,var(--brand)); height:20px}
.th-cvwrap{display:flex; align-items:center; gap:10px; margin-top:12px; padding:10px 12px;
  border:1px solid var(--line); border-radius:var(--r-sm); background:var(--bg-soft)}
.th-cvlabel{font-size:11.5px; color:var(--text-mute); line-height:1.6; flex:none}
.th-cvprev{flex:1; display:grid; place-items:center; min-height:96px}
.th-cvbox{border:1.5px solid var(--ac,var(--brand)); border-radius:3px; display:grid; place-items:center;
  background:var(--card)}
.th-cvbox span{font-size:10px; color:var(--text-dim); line-height:1.4; white-space:nowrap}
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
    /* ‼️ ของ datatraining.io มีการ์ด "What is it?" บอกล่วงหน้าว่าไฟล์ที่ได้มีอะไรบ้าง
       ซึ่งลดความลังเลก่อนกดจริง ของเราย่อเหลือรายการสั้น ๆ เพราะหัวเครื่องมือกับ
       คำถามที่เจอบ่อยเล่าเรื่องที่เหลือไว้แล้ว จะเขียนซ้ำก็รกเปล่า ๆ */
    el("h3", { class: "th-sec" }, tr("ไฟล์ที่ได้มีอะไรบ้าง", "What you get")),
    el("ul", { class: "th-list" }, [
      tr("ขนาดตัวอักษร 4 คลาสหลัก คำนวณจากขนาดผืนผ้าใบ", "Four core text classes sized from your canvas"),
      tr("สีชุดข้อมูล พื้นหลัง ตัวอักษร และสีบอกสถานะ", "Data colours, background, text and status colours"),
      tr("สีกริดตารางที่ไม่ไปทับสีแบรนด์", "A table grid colour that does not hijack your brand colour"),
      tr("ตรงตาม schema 2.157 ที่ Power BI ใช้จริง", "Valid against the schema 2.157 Power BI actually uses"),
    ].map((t) => el("li", {}, t))),
  ]);

  /* ── แผงขวา: ปรับแต่ง ──────────────────────────────────────────────── */
  const nameIn = el("input", { type: "text", value: state.name });
  /* ‼️ ช่องตัวเลขคู่กับแถบเลื่อน ลอกมาจาก datatraining.io ซึ่งทำแบบนี้ทุกช่อง
     พิมพ์เลขเป๊ะ ๆ ได้ และลากหาค่าคร่าว ๆ ได้ในที่เดียวกัน ไม่ต้องเลือกอย่างใดอย่างหนึ่ง
     ‼️ ผูกสองทาง ลากแถบแล้วเลขเปลี่ยน พิมพ์เลขแล้วแถบเลื่อนตาม */
  const wIn = el("input", { type: "number", value: String(state.w), min: "320", max: "6000" });
  const hIn = el("input", { type: "number", value: String(state.h), min: "240", max: "6000" });
  /* ‼️ ห้ามส่ง value เข้าไปพร้อม min กับ max ใน el()
     el() ไล่ตั้ง attribute ตามลำดับที่เขียน ตอนที่ตั้ง value ช่วงของ input range
     ยังเป็นค่าตั้งต้น 0 ถึง 100 อยู่ ค่า 1920 จึงถูกบีบเหลือ 100 แล้วพอ min มาทีหลัง
     ก็ถูกดันไปเป็น min แทน ผลคือแถบเลื่อนไปกองซ้ายสุดทั้งที่ตัวเลขข้าง ๆ เป็น 1920
     (tests/browser_theme.py ข้อ ⑧.5 จับได้ 12/09/2026) ต้องตั้งช่วงให้เสร็จก่อนแล้วค่อยใส่ค่า */
  const rangeIn = (min, max, val, label) => {
    const n = el("input", { type: "range", min: String(min), max: String(max), step: "10", "aria-label": label });
    n.value = String(val);
    return n;
  };
  const wBar = rangeIn(320, 3840, state.w, tr("เลื่อนปรับความกว้าง", "Drag to set width"));
  const hBar = rangeIn(240, 3840, state.h, tr("เลื่อนปรับความสูง", "Drag to set height"));
  const sizeField = (label, box, bar) => el("div", { class: "th-num" }, [
    field(label, box), bar,
  ]);
  /* กล่องพรีวิวผืนผ้าใบตามสัดส่วนจริง ของเขามีแล้วเห็นภาพดีมาก
     ‼️ ย่อให้อยู่ในกรอบ 132x92 เสมอ ด้านที่ยาวกว่าเป็นตัวกำหนด */
  const cvPrev = el("div", { class: "th-cvprev" });
  function drawCanvasPrev() {
    const maxW = 132, maxH = 92;
    const k = Math.min(maxW / state.w, maxH / state.h);
    cvPrev.innerHTML = "";
    cvPrev.appendChild(el("div", { class: "th-cvbox",
      style: `width:${Math.max(18, Math.round(state.w * k))}px; height:${Math.max(14, Math.round(state.h * k))}px` },
      [el("span", {}, `${state.w} x ${state.h}`)]));
  }
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
    sizeField(tr("กว้าง", "Width"), wIn, wBar),
    sizeField(tr("สูง", "Height"), hIn, hBar),
    el("div", { class: "th-cvwrap" }, [
      el("span", { class: "th-cvlabel" }, tr("สัดส่วนจริง", "True proportion")),
      cvPrev,
    ]),
    sizeNote,
    field(tr("ฟอนต์หลัก", "Primary font"), fontSel),
    el("h3", { class: "th-sec" }, tr("สีพื้นฐาน", "Base colours")),
    baseBox,
    el("h3", { class: "th-sec" }, tr("สีของชุดข้อมูล", "Data colours")),
    dataBox,
  ]);

  /* ── ตรงกลาง ───────────────────────────────────────────────────────── */
  /* ‼️ ของเขาโชว์ "Canvas: 1920x1080 • Area: 2073600 px²" ที่แถบล่างตลอดเวลา
     ซึ่งพื้นที่คือตัวเลขที่เขาใช้คิดขนาดตัวอักษรจริง การโชว์ตัวตั้งต้นของการคำนวณ
     ทำให้คนเข้าใจว่าทำไมตัวอักษรถึงเปลี่ยน ไม่ใช่เดาว่าเครื่องมือทำอะไรอยู่ */
  const facts = el("div", { class: "th-facts" });

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
      /* ‼️ ของ datatraining.io มีปุ่ม Reset ที่แถบล่างตลอดเวลา ซึ่งจำเป็นกับเครื่องมือ
         ที่มีตัวเลือกเยอะ เพราะปรับไปหลายจุดแล้วอยากกลับไปตั้งต้น ไม่ต้องรีเฟรชหน้า */
      button(tr("เริ่มใหม่", "Reset"), { icon: "undo", ghost: true, onclick: onReset }),
      facts,
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

  buildPalettes(); buildCanvas(); buildBase(); buildData(); drawCanvasPrev();
  for (const c of [nameIn, wIn, hIn]) c.addEventListener("input", readInputs);
  wBar.addEventListener("input", () => { wIn.value = wBar.value; readInputs(); });
  hBar.addEventListener("input", () => { hIn.value = hBar.value; readInputs(); });
  fontSel.addEventListener("change", readInputs);
  tabs.addEventListener("change", render);
  render();
  return ws.wrap;

  /* ── ประกอบแผงควบคุม ───────────────────────────────────────────────── */
  function buildPalettes() {
    palBox.innerHTML = "";
    for (const p of PALETTES()) {
      /* ‼️ ชุดของแบรนด์ต้องแยกให้เห็นว่าเราไม่ได้ตรวจผ่านให้ เป็นสีจริงที่เปลี่ยนไม่ได้ */
      if (p.kind === "brand" && !palBox.querySelector(".th-brandhead")) {
        palBox.appendChild(el("p", { class: "th-brandhead" },
          tr("ชุดของแบรนด์ ใช้สีจริงตามที่องค์กรกำหนด กดแล้วดูแท็บตรวจสีได้เลย",
             "Brand palettes use the colours the organisation set, check the Colour check tab")));
      }
      palBox.appendChild(el("button", {
        class: "th-sw", type: "button", "aria-pressed": String(p.colors.join() === state.colors.join()),
        onclick: () => {
          state.colors = p.colors.slice(); state.bg = p.bg; state.fg = p.fg;
          /* ชุดของแบรนด์พก good/neutral/bad มาเองจากไฟล์ธีมจริง ชุดของกลางใช้ค่ากลาง */
          for (const k of ["good", "neutral", "bad"]) if (p[k]) state[k] = p[k];
          derive(state);
          buildPalettes(); buildBase(); buildData(); render();
          st.ok(tr(`ใช้ชุด ${p.name} แล้ว`, `Using ${p.name}`));
        },
      }, [
        el("span", { class: "th-dots", "aria-hidden": "true" },
          p.colors.map((c) => el("i", { style: `background:${c}` }))),
        el("span", { class: "th-swname" }, p.name),
      ]));
    }
  }

  function buildCanvas() {
    cvBox.innerHTML = "";
    for (const [label, w, h] of CANVAS_PRESETS) {
      cvBox.appendChild(el("button", {
        class: "th-sw", type: "button", "aria-pressed": String(state.w === w && state.h === h),
        onclick: () => { wIn.value = w; hIn.value = h; readInputs(); },
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
    wBar.value = String(Math.min(3840, state.w));
    hBar.value = String(Math.min(3840, state.h));
    buildCanvas(); render();
  }

  /* ── วาดผลลัพธ์ ────────────────────────────────────────────────────── */
  /* ‼️ ไอเดียที่ดีที่สุดของ datatraining.io: ทั้งหน้าเปลี่ยนสีตามธีมที่ผู้ใช้กำลังสร้าง
     ของเขาเปลี่ยนทั้งแถบหัวและแถบล่างเป็นสีของชุดที่เลือก ทำให้เห็นผลในขนาดที่ใหญ่กว่า
     กล่องพรีวิวเล็ก ๆ · ของเราใช้ตัวแปร --ac ที่ FileKit มีอยู่แล้วเป็นสีประจำเครื่องมือ
     จึงเปลี่ยนแค่ตัวเดียวแล้วชิป ปุ่มที่เลือก และเส้นเน้นทั้งหน้าเปลี่ยนตามทันที
     ‼️ ต้องเลือกสีที่คอนทราสต์พอบนพื้นของ FileKit เอง ไม่ใช่บนพื้นของธีมที่กำลังทำ
        สีแรกของชุดอาจสว่างจนอ่านไม่ออกบนพื้นขาวของเรา จึงไล่หาตัวแรกที่ผ่าน 3:1 ทั้งสองโหมด */
  function paintAccent() {
    const onLight = (c) => contrast(c, "#f6f5f3");
    const onDark = (c) => contrast(c, "#101216");
    const ok = state.colors.find((c) => onLight(c) >= 3 && onDark(c) >= 3);
    ws.wrap.style.setProperty("--ac", ok || state.colors[0] || "var(--brand)");
  }

  function render() {
    paintAccent();
    const v = tabs.value;
    prevBox.hidden = v !== "prev";
    checkBox.hidden = v !== "check";
    codeBox.hidden = v !== "json";
    drawCanvasPrev();
    const s = textScale(state.w, state.h), sz = textSizes(state.w, state.h);
    facts.textContent = tr(
      `ผืนผ้าใบ ${state.w} x ${state.h}, พื้นที่ ${(state.w * state.h).toLocaleString("th-TH")} px², สี ${state.colors.length} สี`,
      `Canvas ${state.w} x ${state.h}, area ${(state.w * state.h).toLocaleString("en-US")} px², ${state.colors.length} colours`);
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

  /* รายงานจำลอง ทำด้วย CSS ล้วน ไม่มีไลบรารีกราฟ
   *
   * ‼️ ของเดิมมีแค่การ์ด 3 ใบกับแท่ง 7 แท่ง ซึ่งน้อยเกินกว่าจะเห็นผลจริงของชุดสี
   *    ของ datatraining.io มีแถบข้าง การ์ด KPI ที่มีบรรทัดเทียบ กราฟแท่งแนวนอนพร้อมหมุดเป้าหมาย
   *    กราฟเส้นมีป้ายตัวเลข และตาราง ทำให้เห็นว่าสีทำงานยังไงในทุกบริบทที่รายงานจริงมี
   * ‼️ ตัวเลขทุกตัวเป็นข้อมูลสมมติของกลาง ไม่ใช่ข้อมูลงานจริงของใคร
   * ‼️ ทุกชิ้นใช้สีจาก state ตรง ๆ ไม่มีสีตายตัว เพราะจุดประสงค์คือเห็นผลของธีม
   */
  function drawPreview(sz) {
    const { bg, fg, fg2, bg2, line, colors, font, good, bad } = state;
    const px = (pt) => Math.round(pt * 1.333);     // pt เป็น px โดยประมาณ ใช้ในพรีวิวเท่านั้น
    const F = (size, extra = "") => `font-family:${font}; font-size:${px(size)}px; ${extra}`;
    const c = (i) => colors[i % colors.length];

    const kpi = (label, val, delta, up) => el("div", { class: "th-card", style: `background:${bg2}; border-color:${line}` }, [
      el("span", { style: `color:${fg2}; ${F(sz.label)}` }, label),
      el("b", { style: `color:${fg}; ${F(sz.callout * 0.42, "font-weight:700")}` }, val),
      el("span", { class: "th-delta", style: `color:${up ? good : bad}; ${F(sz.label)}` },
        (up ? "\u25B2 " : "\u25BC ") + delta),
    ]);

    /* กราฟแท่งแนวนอนพร้อมหมุดเป้าหมาย แบบที่รายงานจริงใช้กันมากที่สุด */
    const barRow = (name, pct, target, i) => el("div", { class: "th-brow" }, [
      el("span", { class: "th-blab", style: `color:${fg2}; ${F(sz.label)}` }, name),
      el("span", { class: "th-btrack", style: `background:${mix(line, bg, 0.45)}` }, [
        el("i", { style: `width:${pct}%; background:${c(i)}` }),
        el("u", { style: `inset-inline-start:${target}%; background:${fg}` }),
      ]),
      el("span", { class: "th-bval", style: `color:${fg}; ${F(sz.label, "font-weight:700")}` }, pct + "%"),
    ]);

    /* กราฟเส้นมีป้ายตัวเลข วาดด้วย SVG เพราะเส้นเฉียงทำด้วย CSS ไม่ได้ */
    const pts = [22, 31, 27, 44, 39, 58, 52, 71, 66, 84, 78, 96];
    const w = 300, h = 78, stepX = w / (pts.length - 1);
    const path = pts.map((v, i) => `${i ? "L" : "M"}${(i * stepX).toFixed(1)},${(h - (v / 100) * h).toFixed(1)}`).join(" ");
    /* ‼️ el() ใช้ document.createElement ซึ่งสร้าง SVG ไม่ได้ ต้องใช้ createElementNS
       ถ้าใช้ el("svg", ...) จะได้ก้อนที่ไม่เรนเดอร์อะไรเลยและไม่มี error ให้เห็น
       (เจอกับตาตอนดูพรีวิวจริง 12/09/2026 กราฟเส้นหายไปทั้งกล่อง) */
    const spark = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    spark.setAttribute("viewBox", `0 0 ${w} ${h}`);
    spark.setAttribute("preserveAspectRatio", "none");
    spark.setAttribute("aria-hidden", "true");
    spark.setAttribute("class", "th-spark");
    spark.innerHTML =
      `<path d="${path} L${w},${h} L0,${h} Z" fill="${c(0)}" opacity=".14"/>` +
      `<path d="${path}" fill="none" stroke="${c(0)}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>` +
      pts.map((v, i) => `<circle cx="${(i * stepX).toFixed(1)}" cy="${(h - (v / 100) * h).toFixed(1)}" r="2.6" fill="${c(0)}"/>`).join("");

    /* ตารางเล็ก ๆ เพื่อให้เห็นสีเส้นกริดกับ data bar ซึ่งมาจาก tableAccent (TH1) */
    const tblRow = (n, v, pct, i) => el("tr", {}, [
      el("td", { style: `color:${fg}; border-color:${line}; ${F(sz.label)}` }, n),
      el("td", { style: `border-color:${line}; ${F(sz.label)}` }, [
        el("span", { class: "th-dbar" }, [
          el("i", { style: `width:${pct}%; background:${mix(line, bg, 0)}` }),
          el("b", { style: `color:${fg}; ${F(sz.label, "font-weight:700")}` }, v),
        ]),
      ]),
    ]);

    prevBox.innerHTML = "";
    prevBox.appendChild(el("div", { class: "th-canvas", style: `background:${bg}` }, [
      /* หัวรายงาน กับชิปตัวกรอง */
      el("div", { class: "th-rhead" }, [
        el("div", { style: `color:${fg}; ${F(sz.title, "font-weight:700")}` }, tr("ยอดขายรายภาค", "Sales by region")),
        el("div", { class: "th-chips" }, ["2024", "2025", "2026"].map((y, i) =>
          el("span", { style: `${F(sz.label)}; color:${i === 2 ? bg : fg2}; background:${i === 2 ? c(3) : "transparent"}; border-color:${line}` }, y))),
      ]),
      /* การ์ด KPI */
      el("div", { class: "th-cards" }, [
        kpi(tr("ยอดรวม", "Total"), "12.4M", "8.2%", true),
        kpi(tr("จำนวนออร์เดอร์", "Orders"), "5,120", "3.1%", true),
        kpi(tr("กำไรขั้นต้น", "Gross margin"), "31.4%", "1.8%", false),
        kpi(tr("ลูกค้าใหม่", "New customers"), "1,284", "12.0%", true),
      ]),
      /* สองคอลัมน์ กราฟแท่ง กับ กราฟเส้น */
      el("div", { class: "th-cols" }, [
        el("div", { class: "th-vis", style: `background:${bg2}; border-color:${line}` }, [
          el("div", { style: `color:${fg}; ${F(sz.header, "font-weight:700")}` }, tr("เทียบเป้าหมาย", "Against target")),
          el("div", { class: "th-bars2" },
            [[tr("เหนือ", "North"), 78, 70], [tr("กลาง", "Central"), 92, 70], [tr("ใต้", "South"), 54, 70],
             [tr("ตะวันออก", "East"), 66, 70], [tr("ตะวันตก", "West"), 41, 70]]
              .map(([n, v, t], i) => barRow(n, v, t, i))),
        ]),
        el("div", { class: "th-vis", style: `background:${bg2}; border-color:${line}` }, [
          el("div", { style: `color:${fg}; ${F(sz.header, "font-weight:700")}` }, tr("แนวโน้มรายเดือน", "Monthly trend")),
          spark,
          el("div", { class: "th-axis", style: `color:${fg2}; ${F(sz.label)}` },
            [tr("ม.ค.", "Jan"), tr("เม.ย.", "Apr"), tr("ก.ค.", "Jul"), tr("ต.ค.", "Oct"), tr("ธ.ค.", "Dec")]
              .map((m) => el("span", {}, m))),
        ]),
      ]),
      /* ตาราง กับ แท่งของทุกชุดข้อมูล */
      el("div", { class: "th-cols" }, [
        el("div", { class: "th-vis", style: `background:${bg2}; border-color:${line}` }, [
          el("div", { style: `color:${fg}; ${F(sz.header, "font-weight:700")}` }, tr("สินค้าขายดี", "Top products")),
          el("table", { class: "th-ptbl" }, [el("tbody", {},
            [[tr("สินค้า ก", "Product A"), "4,820", 100], [tr("สินค้า ข", "Product B"), "3,140", 65],
             [tr("สินค้า ค", "Product C"), "2,010", 42], [tr("สินค้า ง", "Product D"), "980", 20]]
              .map(([n, v, pct], i) => tblRow(n, v, pct, i)))]),
        ]),
        el("div", { class: "th-vis", style: `background:${bg2}; border-color:${line}` }, [
          el("div", { style: `color:${fg}; ${F(sz.header, "font-weight:700")}` },
            tr(`ชุดข้อมูลทั้ง ${colors.length} สี`, `All ${colors.length} series`)),
          el("div", { class: "th-bars" }, colors.map((col, i) =>
            el("div", { class: "th-bar", style: `height:${[62, 88, 45, 74, 96, 58, 81, 69][i % 8]}%; background:${col}` }))),
          el("div", { class: "th-legend", style: `color:${fg2}; ${F(sz.label)}` },
            colors.map((col, i) => el("span", {}, [el("i", { style: `background:${col}` }),
              tr(`ชุดที่ ${i + 1}`, `Series ${i + 1}`)]))),
        ]),
      ]),
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

  function onReset() {
    const p = PALETTES()[0];
    Object.assign(state, { name: "FileKit Theme", w: 1920, h: 1080, font: "Segoe UI",
      colors: p.colors.slice(), bg: p.bg, fg: p.fg,
      good: "#1F8A50", neutral: "#6C7A8D", bad: "#C4321F" });
    derive(state);
    nameIn.value = state.name; wIn.value = state.w; hIn.value = state.h; fontSel.value = state.font;
    wBar.value = String(state.w); hBar.value = String(state.h);
    tabs.value = "prev";
    buildPalettes(); buildCanvas(); buildBase(); buildData(); render();
    st.ok(tr("กลับไปค่าตั้งต้นแล้ว", "Back to the starting values"));
  }

  function onDownload() {
    const n = state.name.replace(/[\\/:*?"<>|]/g, "-").trim() + ".json";
    download(new Blob([json()], { type: "application/json;charset=utf-8" }), n);
    st.ok(tr(`ดาวน์โหลด ${n} แล้ว`, `Downloaded ${n}`));
  }
}
