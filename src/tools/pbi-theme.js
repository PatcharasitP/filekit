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
import { tr, pl, IS_EN } from "../i18n.js";

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
/* ── พรีวิวรายงาน ── ถอดผังมาจาก Color Preview ของ datatraining.io
   ‼️ เต็มความกว้างของแผง ไม่อยู่ในคอลัมน์กลางอีกแล้ว การ์ดจึงมีที่พอไม่ตัดคำ */
.th-prevwrap{margin-top:var(--sp4)}
.th-prevhead{display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin-bottom:10px}
.th-prevhead h2{margin:0; font-size:15px; font-weight:800; line-height:1.5; color:var(--text)}
.th-prevhead span{font-size:12px; line-height:1.7; color:var(--text-mute)}
.th-prev{border:1px solid var(--line); border-radius:var(--r); overflow:hidden;
  box-shadow:0 10px 28px -18px rgba(0,0,0,.45)}
.th-report{display:flex; min-height:300px}
/* แถบข้างไล่สี มีจุดไอคอนจาง ๆ แบบของเขา */
.th-side{flex:0 0 34px; display:flex; flex-direction:column; align-items:center; gap:16px; padding-top:18px}
.th-side i{width:13px; height:13px; border-radius:3px; background:rgba(255,255,255,.42)}
.th-canvas{flex:1; min-width:0; padding:16px 18px 18px; display:flex; flex-direction:column; gap:12px}
.th-rhead{display:flex; align-items:center; gap:12px; flex-wrap:wrap}
.th-chips{display:flex; gap:6px; margin-inline-start:auto}
.th-chips span{padding:3px 11px; border-radius:5px; border:1px solid; line-height:1.6}
/* ผังหลัก: การ์ด 4 ใบ + ผังแยกส่วนขวา, สองกราฟกลาง, กราฟเส้นกว้าง + แท่งแนวตั้ง */
.th-grid{display:grid; gap:10px; grid-template-columns:repeat(4,1fr) 1.25fr}
.th-cards{grid-column:span 4; display:grid; grid-template-columns:repeat(4,1fr); gap:10px}
.th-vis{grid-column:span 2; border:1px solid; border-radius:8px; padding:11px 13px;
  display:flex; flex-direction:column; gap:9px; min-width:0}
/* ‼️ สองกฎนี้ต้องอยู่ **หลัง** .th-vis เพราะความจำเพาะเท่ากัน ตัวที่เขียนทีหลังชนะ
   เขียนไว้ก่อนแล้ว grid-column:span 2 ของ .th-vis ทับทิ้ง ผังเลยเพี้ยนทั้งหน้า */
.th-tall{grid-column:5; grid-row:1 / span 2}
.th-wide{grid-column:span 3}
/* ‼️ ขยายช่องไฟกับตัวพิมพ์ใหญ่ ใช้ได้กับอังกฤษเท่านั้น
   ภาษาไทยไม่มีตัวพิมพ์ใหญ่ และการขยายช่องไฟทำให้สระกับวรรณยุกต์ดูลอยออกจากตัว */
.th-vt{line-height:1.5}
.th-en .th-vt{letter-spacing:.04em; text-transform:uppercase}
@media (max-width:900px){
  .th-grid{grid-template-columns:repeat(2,1fr)}
  .th-cards{grid-column:span 2; grid-template-columns:repeat(2,1fr)}
  .th-tall,.th-wide,.th-vis{grid-column:span 2; grid-row:auto}
}
/* การ์ด KPI: ชื่อ ตัวเลข แล้วสองบรรทัดเทียบ */
.th-card{border-radius:8px; padding:11px 13px; border:1px solid; min-width:0;
  display:flex; flex-direction:column; gap:3px}
.th-ct{line-height:1.6; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
.th-card b{line-height:1.25; letter-spacing:-.01em}
.th-cd{margin-top:5px; display:flex; flex-direction:column; gap:2px}
.th-cdrow{display:flex; align-items:center; gap:6px; line-height:1.6}
.th-cdrow i{font-style:normal; flex:none}
.th-cdrow u{margin-inline-start:auto; text-decoration:none}
.th-cdrow s{text-decoration:none; font-size:7px; line-height:1}
/* แท่งแนวนอนพร้อมป้ายเงินในแท่ง */
.th-bb{display:flex; flex-direction:column; gap:3px}
.th-bbh{position:relative; display:flex; align-items:center; gap:7px; line-height:1.6}
.th-range{position:absolute; top:50%; width:34px; height:1px}
.th-range i{display:block; height:1px; width:100%; position:relative}
.th-range i::before,.th-range i::after{content:""; position:absolute; top:-3px; width:1px; height:7px; background:inherit}
.th-range i::before{inset-inline-start:0} .th-range i::after{inset-inline-end:0}
.th-bbt{position:relative; height:15px; border-radius:3px; overflow:hidden}
.th-bbt i{position:absolute; inset-block:0; inset-inline-start:0; border-radius:3px}
.th-bbt b{position:absolute; top:50%; transform:translateY(-50%); line-height:1; white-space:nowrap}
/* แท่งเทียบเป้าหมาย */
.th-tg{display:flex; align-items:center; gap:8px}
.th-tg>span:first-child{flex:0 0 66px; line-height:1.6; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.th-tgt{position:relative; flex:1; height:11px; border-radius:2px; overflow:hidden; min-width:0}
.th-tgt i{position:absolute; inset-block:0; inset-inline-start:0; border-radius:2px}
.th-tgt u{position:absolute; inset-block:-2px; width:0; border-inline-start:1px dashed; text-decoration:none}
.th-tg>b{flex:0 0 34px; text-align:end; line-height:1.6}
/* ผังแยกส่วน */
.th-tree{display:grid; grid-template-columns:1fr 1fr; gap:12px; align-items:center}
.th-col{display:flex; flex-direction:column; gap:9px; min-width:0}
/* เส้นเชื่อมบาง ๆ ระหว่างชั้น ให้อ่านออกว่าชั้นขวาแตกมาจากชั้นซ้าย */
.th-tree>.th-col:last-child{position:relative; padding-inline-start:10px}
.th-tree>.th-col:last-child::before{content:""; position:absolute; inset-block:12%; inset-inline-start:0;
  width:1px; background:var(--tl)}
.th-nd{display:flex; flex-direction:column; gap:1px; min-width:0}
.th-nd i{height:5px; border-radius:2px; margin-bottom:3px}
.th-nd span,.th-nd em{line-height:1.5; font-style:normal; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
/* กราฟพื้นที่ */
.th-area{width:100%; height:auto; display:block}
.th-axis{display:flex; justify-content:space-between; line-height:1.6}
/* แท่งแนวตั้งพร้อมแกนค่า */
.th-cc{display:flex; gap:8px; align-items:stretch; min-height:118px}
.th-ccb{flex:1; display:flex; align-items:flex-end; gap:7px; min-width:0}
.th-ccol{flex:1; display:flex; flex-direction:column; align-items:center; gap:3px; height:100%;
  justify-content:flex-end; min-width:0}
.th-ccol em{font-style:normal; line-height:1.4; white-space:nowrap}
.th-ccol i{width:100%; max-width:26px; border-radius:2px 2px 0 0}
/* ‼️ line-height 1.4 กับ overflow:hidden ตัดหางตัวอักษรที่ยื่นลงล่าง (y, g, p) ทิ้ง
   เห็นเป็น "Stationerv" แทน "Stationery" ต้องเผื่อความสูงให้หาง */
.th-ccol span{line-height:1.7; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%}
.th-ccy{flex:0 0 30px; display:flex; flex-direction:column; justify-content:space-between;
  border-inline-start:1px solid; padding-inline-start:5px; line-height:1.4; text-align:end}
.th-legend{display:flex; flex-wrap:wrap; gap:10px; padding-top:2px}
.th-legend span{display:inline-flex; align-items:center; gap:5px; line-height:1.7}
.th-legend i{width:9px; height:9px; border-radius:2px; flex:none}
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

/** บีบค่าให้อยู่ในช่วงที่กำหนด ใช้กันตัวอักษรในพรีวิวล้นการ์ด */
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

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

  /* ‼️ พรีวิวรายงานถูกย้ายออกจากแท็บตรงกลาง ไปเป็นแถบเต็มความกว้างใต้แผงทั้งสาม
     ที่มา: พี่ปอนด์เทียบกับ datatraining.io แล้วบอกว่าพรีวิวของเขาสวยและมืออาชีพกว่า
     วัดแล้วเจอต้นเหตุจริง คอลัมน์กลางของเรากว้าง 494px การ์ด KPI จึงเหลือใบละ 108px
     ชื่อ "จำนวนออร์เดอร์" เลยตัดคำกลางคำเป็น "จำนวนออร์เด" ขึ้นบรรทัดใหม่ "อร์"
     ของเขาวาง Color Preview เป็น section เต็มความกว้างแยกจากแผงตั้งค่า การ์ดจึงมีที่พอ
     ย้ายมาแล้วได้ความกว้าง ~1060px การ์ดใบละ ~250px เท่าของเขา */
  const tabs = segmented([
    ["check", tr("ตรวจสี", "Colour check")],
    ["json", tr("ไฟล์ธีม", "Theme file")],
  ], "check");
  tabs.classList.add("th-tabs");
  const checkBox = el("div", {});
  const codeEl = el("code", {});
  const codeBox = el("pre", { class: "th-code" }, [codeEl]);
  const center = el("div", {}, [tabs, checkBox, codeBox]);

  const prevBox = el("div", { class: "th-prev" });
  const prevSection = el("section", { class: "th-prevwrap" }, [
    el("div", { class: "th-prevhead" }, [
      el("h2", {}, tr("พรีวิวรายงาน", "Report preview")),
      el("span", {}, tr("รายงานสมมติที่ทาสีตามธีมที่กำลังสร้าง", "A mock report painted with the theme you are building")),
    ]),
    prevBox,
  ]);

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
  ws.body.insertBefore(prevSection, ws.body.querySelector(".ws-footer"));
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
    drawPreview(sz);                       // อยู่นอกแท็บแล้ว วาดทุกครั้ง
    if (v === "check") drawCheck();
    else codeEl.innerHTML = paintCode(json(), "json");
  }

  /* ‼️ ต้องเป็น function declaration ไม่ใช่ const ลูกศร เพราะบรรทัดนี้อยู่หลัง return ws.wrap
     ตัวแปร const จะไม่มีวันถูกสร้าง render() ที่เรียกก่อน return จึงพังด้วย TDZ
     (พลาดเรื่องนี้เป็นครั้งที่ 8 ในโปรเจกต์นี้ จับได้ด้วยการเปิดเบราว์เซอร์ดูจริงเท่านั้น
      node --check กับการ import เฉย ๆ ไม่เจอ เพราะบั๊กเกิดตอนรัน mount() เท่านั้น) */
  function json() { return JSON.stringify(buildTheme(state), null, 2); }

  /* รายงานจำลอง ทำด้วย CSS กับ SVG ล้วน ไม่มีไลบรารีกราฟ
   *
   * ‼️ ผังนี้ถอดมาจาก Color Preview ของ datatraining.io ตามที่พี่ปอนด์สั่ง
   *    (เปิดของจริงดูแล้ว 13/09/2026) ของเขามี แถบข้างไล่สี, หัวรายงานตัวพิมพ์ใหญ่,
   *    การ์ด KPI ที่มีสองบรรทัดเทียบ, แท่งแนวนอนมีป้ายเงินในแท่ง, แท่งเทียบเป้าหมาย,
   *    ผังแยกส่วน, กราฟพื้นที่มีป้ายทุกจุด และกราฟแท่งแนวตั้งมีแกนค่า
   *
   * ‼️ ขนาดตัวอักษรในพรีวิว **ไม่ใช่** ขนาดจริงหน่วย pt ของธีม
   *    เพราะนี่คือรายงานย่อส่วน ถ้าเรนเดอร์ตาม pt จริง ตัวเลขจะล้นการ์ด
   *    (ของเดิมทำแบบนั้นแล้วคำว่า "จำนวนออร์เดอร์" ตัดกลางคำ พี่ปอนด์ทักมา)
   *    แต่ยังคง **สัดส่วนระหว่างคลาส** ไว้ครบ ถ้าธีมตั้ง callout ใหญ่ขึ้น
   *    ตัวเลขในพรีวิวก็ใหญ่ขึ้นตามสัดส่วนเดิม ขนาดจริงหน่วย pt บอกไว้ใต้ช่องขนาดผืนผ้าใบแล้ว
   * ‼️ ตัวเลขทุกตัวเป็นข้อมูลสมมติของกลาง ไม่ใช่ข้อมูลงานจริงของใคร
   */
  function drawPreview(sz) {
    const { bg, fg, fg2, bg2, line, colors, font, good, bad } = state;
    /* สัดส่วนอิงค่าตั้งต้นของ Power BI (callout 45, title 12, header 12, label 10)
       แล้วคูณกับขนาดฐานของพรีวิวซึ่งเลือกให้พอดีกับความกว้าง ~1060px */
    const S = {
      callout: clamp(26 * (sz.callout / 45), 15, 40),
      title: clamp(15 * (sz.title / 12), 11, 22),
      header: clamp(11 * (sz.header / 12), 9, 16),
      label: clamp(10.5 * (sz.label / 10), 8.5, 15),
    };
    const F = (k, extra = "") => `font-family:${font}; font-size:${S[k].toFixed(1)}px; ${extra}`;
    const c = (i) => colors[i % colors.length];
    const soft = (hex, amt) => mix(hex, bg, amt);
    const panel = (title, kids, cls = "") => el("div", { class: "th-vis " + cls,
      style: `background:${bg2}; border-color:${line}` }, [
      el("div", { class: "th-vt", style: `color:${soft(fg, .18)}; ${F("header", "font-weight:700")}` }, title),
      ...kids,
    ]);

    /* ── การ์ด KPI: ชื่อบน ตัวเลขกลาง แล้วสองบรรทัดเทียบแบบของเขา ─────── */
    const kpi = (label, val, rows) => el("div", { class: "th-card", style: `background:${bg2}; border-color:${line}` }, [
      el("span", { class: "th-ct", style: `color:${fg2}; ${F("label")}` }, label),
      el("b", { style: `color:${fg}; ${F("callout", "font-weight:600")}` }, val),
      el("div", { class: "th-cd" }, rows.map(([k, v, up]) => el("div", { class: "th-cdrow" }, [
        el("i", { style: `color:${fg2}; ${F("label")}` }, k),
        el("u", { style: `color:${up ? good : bad}; ${F("label", "font-weight:700")}` }, v),
        el("s", { style: `color:${up ? good : bad}` }, up ? "▲" : "▼"),
      ]))),
    ]);

    /* ── แท่งแนวนอนพร้อมป้ายเงินในแท่ง และเส้นบอกช่วงด้านบน ─────────── */
    const bigBar = (name, delta, pct, money, i) => el("div", { class: "th-bb" }, [
      el("div", { class: "th-bbh" }, [
        el("span", { style: `color:${fg}; ${F("label", "font-weight:600")}` }, name),
        el("span", { style: `color:${good}; ${F("label")}` }, delta),
        el("span", { class: "th-range", style: `inset-inline-start:${Math.min(92, pct + 6)}%` }, [
          el("i", { style: `background:${soft(fg, .55)}` }),
        ]),
      ]),
      el("div", { class: "th-bbt", style: `background:${soft(line, .3)}` }, [
        el("i", { style: `width:${pct}%; background:${c(i)}` }),
        el("b", { style: `inset-inline-end:calc(${100 - pct}% + 6px); color:${bg}; ${F("label", "font-weight:700")}` }, money),
      ]),
    ]);

    /* ── แท่งเทียบเป้าหมาย มีเส้นประเป้าและ % ด้านขวา ────────────────── */
    const tgt = (name, pct, i) => el("div", { class: "th-tg" }, [
      el("span", { style: `color:${fg2}; ${F("label")}` }, name),
      el("span", { class: "th-tgt", style: `background:${soft(line, .3)}` }, [
        el("i", { style: `width:${pct}%; background:${c(i)}` }),
        el("u", { style: `inset-inline-start:82%; border-color:${soft(fg, .5)}` }),
      ]),
      el("b", { style: `color:${fg}; ${F("label", "font-weight:700")}` }, pct + "%"),
    ]);

    /* ── ผังแยกส่วน สองชั้น มีเส้นเชื่อม ───────────────────────────── */
    const node = (name, val, w) => el("div", { class: "th-nd" }, [
      el("i", { style: `width:${w}%; background:${c(2)}` }),
      el("span", { style: `color:${fg}; ${F("label", "font-weight:600")}` }, name),
      el("em", { style: `color:${fg2}; ${F("label")}` }, val),
    ]);

    /* ── กราฟพื้นที่ มีจุดและป้ายตัวเลขทุกเดือน ───────────────────── */
    const pts = [19, 24, 52, 40, 58, 41, 39, 32, 76, 61, 81, 98];
    const W = 560, H = 96, PX = 16, PY = 16;
    const mx = Math.max(...pts), sx = (W - PX * 2) / (pts.length - 1);
    const xy = pts.map((v, i) => [PX + i * sx, PY + (H - PY * 2) * (1 - v / mx)]);
    const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const area = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    area.setAttribute("viewBox", `0 0 ${W} ${H + 14}`);
    area.setAttribute("class", "th-area");
    area.setAttribute("aria-hidden", "true");
    area.innerHTML =
      `<path d="${d} L${xy[xy.length - 1][0]},${H} L${xy[0][0]},${H} Z" fill="${c(0)}" opacity=".13"/>` +
      `<path d="${d}" fill="none" stroke="${c(0)}" stroke-width="1.6" stroke-linejoin="round"/>` +
      xy.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2" fill="${c(0)}"/>`).join("") +
      xy.map(([x, y], i) => `<text x="${x.toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" ` +
        `font-family="${font}" font-size="7.6" fill="${fg2}">${(pts[i] * 1.2).toFixed(0)}K</text>`).join("");

    /* ── แท่งแนวตั้งมีป้ายบนแท่งและแกนค่าด้านขวา ───────────────────── */
    const cols = [[tr("เครื่องเขียน", "Stationery"), 96], [tr("ไฟฟ้า", "Electronics"), 82],
                  [tr("ของใช้บ้าน", "Home"), 48], [tr("เสื้อผ้า", "Apparel"), 26], [tr("อื่น ๆ", "Others"), 16]];
    const colChart = el("div", { class: "th-cc" }, [
      el("div", { class: "th-ccb" }, cols.map(([n, v], i) => el("div", { class: "th-ccol" }, [
        el("em", { style: `color:${fg2}; ${F("label")}` }, (v * 17).toLocaleString()),
        el("i", { style: `height:${v}%; background:${c(3)}` }),
        el("span", { style: `color:${fg2}; ${F("label")}` }, n),
      ]))),
      el("div", { class: "th-ccy", style: `color:${fg2}; ${F("label")}; border-color:${soft(line, .3)}` },
        ["$60K", "$40K", "$20K", "$0K"].map((t) => el("span", {}, t))),
    ]);

    prevBox.innerHTML = "";
    prevBox.appendChild(el("div", { class: "th-report" + (IS_EN ? " th-en" : ""), style: `background:${bg}` }, [
      /* แถบข้างไล่สี แบบเดียวกับของเขา */
      el("div", { class: "th-side", style: `background:linear-gradient(${c(3)}, ${c(2)})` },
        [0, 1, 2].map(() => el("i", {}))),
      el("div", { class: "th-canvas" }, [
        el("div", { class: "th-rhead" }, [
          el("div", { style: `color:${fg}; ${F("title", "font-weight:700" + (IS_EN ? "; letter-spacing:.06em" : ""))}` },
            tr("วิเคราะห์ยอดขาย", "SALES ANALYSIS")),
          el("div", { class: "th-chips" }, ["2024", "2025", "2026"].map((y, i) =>
            el("span", { style: `${F("label")}; color:${i === 2 ? fg : soft(fg, .45)}; border-color:${i === 2 ? fg : line}` }, y))),
        ]),
        el("div", { class: "th-grid" }, [
          el("div", { class: "th-cards" }, [
            kpi(tr("ยอดขาย", "Sales"), "620K", [["ΔB", "-16.0%", false], ["ΔFC", "-1.0%", false]]),
            kpi(tr("จำนวนชิ้น", "Quantity"), "11K", [["ΔB", "+13.6%", true], ["ΔFC", "+20.5%", true]]),
            kpi(tr("อัตรากำไร", "Profit margin"), "13.7%", [["ΔB", "+25.0%", true], ["ΔFC", "+22.0%", true]]),
            kpi(tr("ส่วนลดเฉลี่ย", "Avg discount"), "15.0%", [["ΔB", "-17.1%", false], ["ΔFC", "-17.4%", false]]),
          ]),
          panel(tr("ผังแยกตามหมวด", "Breakdown by category"), [
            el("div", { class: "th-tree", style: `--tl:${soft(line, .1)}` }, [
              el("div", { class: "th-col" }, [node(tr("รวมทั้งหมด", "Total"), "11,052", 100)]),
              el("div", { class: "th-col" }, [node(tr("เครื่องเขียน", "Stationery"), "7,117", 92),
                                              node(tr("เฟอร์นิเจอร์", "Furniture"), "2,234", 34),
                                              node(tr("เทคโนโลยี", "Technology"), "1,701", 24)]),
            ]),
          ], "th-tall"),
          panel(tr("ยอดขาย เทียบปีก่อน", "Sales, vs last year"),
            [[tr("ภาคกลาง", "Central"), "+43.6%", 62, "150,983"], [tr("ภาคตะวันออก", "East"), "+16.0%", 82, "184,332"],
             [tr("ภาคใต้", "South"), "+29.8%", 38, "95,405"], [tr("ภาคตะวันตก", "West"), "+32.5%", 74, "189,589"]]
              .map(([n, dl, pc, m], i) => bigBar(n, dl, pc, m, i))),
          panel(tr("เทียบเป้าหมายรายทีม", "Against target, by team"),
            [[tr("ทีมอัลฟา", "Alfa"), 51], [tr("ทีมบราโว", "Bravo"), 45], [tr("ทีมชาร์ลี", "Charlie"), 27],
             [tr("ทีมเดลตา", "Delta"), 39], [tr("ทีมอิคโค", "Echo"), 90]].map(([n, v], i) => tgt(n, v, i))),
          panel(tr("ยอดขายรายเดือน", "Sales over time"), [
            area,
            el("div", { class: "th-axis", style: `color:${fg2}; ${F("label")}` },
              [tr("ม.ค.", "Jan"), tr("มี.ค.", "Mar"), tr("พ.ค.", "May"), tr("ก.ค.", "Jul"),
               tr("ก.ย.", "Sep"), tr("พ.ย.", "Nov")].map((m) => el("span", {}, m))),
          ], "th-wide"),
          panel(tr("จำนวนที่ขายได้", "Quantity sold"), [colChart]),
        ]),
        /* แถบสีของชุดข้อมูลทั้งหมด ให้เห็นทุกสีพร้อมกันแม้กราฟจะใช้ไม่ครบ */
        el("div", { class: "th-legend", style: `color:${fg2}; ${F("label")}` },
          colors.map((col, i) => el("span", {}, [el("i", { style: `background:${col}` }),
            tr(`ชุดที่ ${i + 1}`, `Series ${i + 1}`)]))),
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
