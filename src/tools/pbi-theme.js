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
//
// ‼️ 13/09/2026 พี่ปอนด์ทักว่า "ของเราไม่สวยเท่าของเขาทั้ง UX UI ทั้ง FONT" สั่งให้โคลนหน้าตา
//    จึงเลิกใช้ workspace 3 แผง เปลี่ยนเป็นการ์ดเรียงลง 6 ส่วนตามโครงของ app.datatraining.io
//    ฟอนต์ system-ui (Segoe UI) เฉพาะเครื่องมือนี้ และทั้งหน้าทาสีตามชุดที่เลือก
//    ค่าที่วัดจากของจริงอยู่ .claude/research/themestarter/t1_dom.json

import { el } from "../dom.js";
import { toolShell, statusBar, field, select, download } from "../ui.js";
import { uiIcon } from "../icons.js";
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
import { stateKit, SHARE_MSG } from "../statekit.js";

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

/* ไอคอนเส้นบาง วาดเองในไฟล์นี้ ไม่ใช้อีโมจิ (กฎ 07/09 อีโมจิ = "ดูเหมือน AI ทำ") */
const ICONS = {
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  monitor: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  type: '<svg viewBox="0 0 24 24"><path d="M5 7V4h14v3M12 4v16M9 20h6"/></svg>',
  palette: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H12a1.5 1.5 0 0 1 0-3h3.5A5.5 5.5 0 0 0 21 8.5 6 6 0 0 0 12 3z"/><circle cx="7.5" cy="10.5" r=".6"/><circle cx="10.5" cy="7" r=".6"/><circle cx="15" cy="7" r=".6"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="3"/></svg>',
  check: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="m14 6-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="m10 6 6 6-6 6"/></svg>',
};

/* ‼️ หน้าตาทั้งหน้าลอกโครงมาจาก app.datatraining.io (วัด computed style จริง 13/09/2026
   ค่าดิบอยู่ .claude/research/themestarter/t1_dom.json) ไม่ได้ก็อปโค้ดเขา
   โทเคนที่วัดได้: ฟอนต์ system-ui (บน Windows = Segoe UI) 14px/1.625 สีตัวอักษร #121212
   พื้นแผงย่อย #F8FAFC ขอบ #E2E8F0 มุมการ์ด 12px มุมแผงย่อย 8px หัวข้อ 18px/28px w500
   ปุ่มหลักสูง 48px มุม 6px ไล่สีจากสีธีม และทั้งหน้าเปลี่ยนสีตามชุดสีที่กำลังสร้าง
   ‼️ โหมดมืดของ FileKit ยังต้องใช้ได้ จึงผูกกับโทเคนกลางแล้วค่อยทับด้วยค่าของเขาเฉพาะโหมดสว่าง */
const STYLE = `
.ts{--tsf:"Segoe UI","Leelawadee UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;
  --tp:#3E5C76; --tq:#546D8E; --tsur:var(--bg-soft); --tbd:var(--line); --thov:var(--card-hi);
  --tfg:var(--text); --tmute:var(--text-dim); --tbg:var(--card)}
@media (prefers-color-scheme: light){ :root:not([data-theme="dark"]) .ts{--tsur:#F8FAFC; --tbd:#E2E8F0; --thov:#F1F5F9; --tfg:#121212; --tmute:#5B6472; --tbg:#fff} }
:root[data-theme="light"] .ts{--tsur:#F8FAFC; --tbd:#E2E8F0; --thov:#F1F5F9; --tfg:#121212; --tmute:#5B6472; --tbg:#fff}
/* แถบหัวของเครื่องมือทาสีธีมที่กำลังสร้าง แบบเดียวกับแถบหัวของเขา */
.ts .tool-head{background:linear-gradient(90deg,var(--tp),var(--tq)); border-color:transparent}
.ts{font-family:var(--tsf)}
.ts .panel{font-size:14px; line-height:1.625; color:var(--tfg);
  border-radius:12px; border-color:var(--tbd); padding:24px; display:flex; flex-direction:column; gap:20px}
@media (max-width:640px){ .ts .panel{padding:14px; gap:14px} }
.ts-sec{background:var(--tbg); border:1px solid var(--tbd); border-radius:12px; padding:24px; min-width:0}
@media (max-width:640px){ .ts-sec{padding:16px} }
/* หัวข้อส่วน มีป้ายเลขลำดับแบบที่พี่ปอนด์ชอบ (/08 FAQ ของเว็บเดียวกัน) */
.ts-h{display:flex; align-items:center; gap:10px; margin:0 0 16px; font-size:18px; line-height:28px; font-weight:500; color:var(--tfg)}
.ts-ico{width:20px; height:20px; color:var(--tp); flex:none; display:inline-block}
.ts-ico svg{width:100%; height:100%; display:block; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round}
.ts-h3{display:flex; align-items:center; gap:8px; margin:0 0 12px; font-size:14px; line-height:20px; font-weight:500}
.ts-h3 .ts-ico{width:16px; height:16px}
.ts-p{margin:0 0 10px; font-size:14px; line-height:1.625}
.ts-mute{color:var(--tmute)}
.ts-ul{margin:0 0 12px; padding-inline-start:22px; font-size:14px; line-height:1.625}
.ts-ul li{margin:2px 0}
.ts-cols{display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px}
.ts-cols2{display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px}
@media (max-width:900px){ .ts-cols,.ts-cols2{grid-template-columns:1fr} }
.ts-sub{background:var(--tsur); border-radius:8px; padding:16px; min-width:0}
.ts-sub.big{border-radius:12px; padding:24px}
@media (max-width:640px){ .ts-sub.big{padding:16px} }
.ts-f{display:block; min-width:0}
.ts-f+.ts-f{margin-top:12px}
.ts-lb{display:block; font-size:14px; font-weight:500; line-height:20px; margin-bottom:8px; color:var(--tfg)}
/* ปุ่มขนาดแนะนำ เรียงลงมา ตัวที่เลือกพื้นสีธีมตัวหนังสือขาว */
.ts-dims{display:flex; flex-direction:column; gap:8px}
.ts-dim{font:inherit; font-size:14px; font-weight:500; line-height:20px; padding:8px 12px; border-radius:6px;
  border:1px solid var(--tbd); background:var(--tbg); color:var(--tfg); cursor:pointer; text-align:center; width:100%;
  transition:background var(--t-micro,.1s),color var(--t-micro,.1s)}
.ts-dim:hover{background:var(--thov)}
.ts-dim[aria-pressed="true"]{background:var(--tp); border-color:var(--tp); color:#fff}
/* ช่องเลขไม่มีกรอบ หน่วย px ต่อท้าย และแถบเลื่อนอยู่ใต้ช่องทุกช่อง ตามของเขาเป๊ะ */
.th-num{margin-bottom:14px}
.ts-numrow{display:flex; align-items:baseline; gap:8px}
.ts-numrow input[type=number]{font:inherit; font-size:16px; line-height:24px; width:96px; padding:0; border:0; border-bottom:1px solid transparent;
  border-radius:0; background:transparent; color:var(--tfg); outline:none; -moz-appearance:textfield}
.ts-numrow input[type=number]:focus{border-bottom-color:var(--tp)}
.ts-unit{font-size:12px; line-height:16px; color:var(--tmute)}
.th-num input[type=range]{width:100%; margin:6px 0 0; accent-color:var(--tp); height:18px; cursor:pointer; display:block}
.ts-sizenote{font-size:12px; line-height:16px; color:var(--tmute); margin:2px 0 0}
/* กล่องสัดส่วนผืนผ้าใบ */
.th-cvprev{display:grid; place-items:center; min-height:124px}
.th-cvbox{border:2px solid var(--tbd); border-radius:8px; background:var(--tbg); display:grid; place-items:center}
.th-cvbox span{font-size:12px; line-height:16px; color:var(--tfg); white-space:nowrap}
/* ช่องกรอกแบบของเขา ขาว ขอบบาง มุม 6 */
.ts-in{font:inherit; font-size:14px; line-height:20px; width:100%; padding:8px 12px; border-radius:6px;
  border:1px solid var(--tbd); background:var(--tbg); color:var(--tfg); min-height:38px; box-shadow:0 1px 2px rgba(0,0,0,.04)}
.ts-in:focus{outline:2px solid var(--tp); outline-offset:1px}
/* สายพานชุดสี มีปุ่มกลมสองข้าง */
.ts-caro{position:relative; padding:0 30px}
.ts-track{display:flex; gap:12px; overflow-x:auto; scroll-snap-type:x mandatory; scrollbar-width:none; padding:2px; scroll-behavior:smooth}
.ts-track::-webkit-scrollbar{display:none}
.ts-track .th-sw{flex:0 0 calc(50% - 6px); scroll-snap-align:start}
@media (max-width:640px){ .ts-track .th-sw{flex-basis:100%} }
.th-sw{display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 10px; min-height:36px; min-width:0;
  border:1px solid var(--tbd); border-radius:8px; background:var(--tbg); cursor:pointer;
  font:inherit; font-size:12px; font-weight:500; color:var(--tfg); text-align:start; line-height:16px}
.th-sw:hover{background:var(--thov)}
.th-sw[aria-pressed="true"]{border-color:var(--tp); box-shadow:0 0 0 1px var(--tp)}
.th-swname{min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:flex; align-items:center; gap:6px}
.th-tag{font-size:10px; line-height:14px; padding:0 6px; border-radius:999px; background:var(--tp); color:#fff; flex:none; font-weight:500}
.th-dots{display:flex; gap:3px; flex:none}
.th-dots i{width:16px; height:16px; border-radius:50%}
.ts-arr{position:absolute; top:50%; transform:translateY(-50%); width:42px; height:42px; border-radius:999px; padding:0;
  border:1px solid var(--tbd); background:var(--tbg); color:var(--tfg); cursor:pointer; display:grid; place-items:center;
  box-shadow:0 1px 2px rgba(0,0,0,.05)}
.ts-arr:hover{background:var(--thov)}
.ts-arr.prev{inset-inline-start:-10px} .ts-arr.next{inset-inline-end:-10px}
.ts-arr svg{width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round}
.ts-hint{margin:12px 0 0; font-size:12px; line-height:16px; text-align:center; color:var(--tmute)}
.ts-en .ts-hint{font-style:italic}
.ts-own{display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:14px; padding-top:14px; border-top:1px solid var(--tbd);
  font-size:12px; line-height:16px; color:var(--tmute)}
.ts-link{font:inherit; font-size:12px; font-weight:500; line-height:16px; padding:8px 12px; min-height:36px; border-radius:6px; cursor:pointer;
  border:1px solid var(--tbd); background:var(--tbg); color:var(--tp)}
.ts-link:hover{background:var(--thov)}
/* กล่องยุบ ใช้ทั้ง "ปรับสีเอง" และ "ดูไฟล์" */
.ts-more{grid-column:1/-1; border:1px solid var(--tbd); border-radius:8px; background:var(--tsur); padding:0 16px}
.ts-more>summary{cursor:pointer; padding:12px 0; font-size:14px; font-weight:500; line-height:20px; list-style:none;
  display:flex; align-items:center; justify-content:space-between; gap:10px; color:var(--tfg)}
.ts-more>summary::-webkit-details-marker{display:none}
.ts-more>summary::after{content:""; width:9px; height:9px; border-right:2px solid var(--tmute); border-bottom:2px solid var(--tmute);
  transform:rotate(45deg); margin:-4px 6px 0 0; flex:none; transition:transform var(--t-micro,.1s)}
.ts-more[open]>summary::after{transform:rotate(-135deg); margin-top:4px}
.ts-more[open]>summary{border-bottom:1px solid var(--tbd)}
.ts-pick{display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:12px 16px; padding:14px 0 16px}
.ts-pick .field{min-width:0}
.ts-pickh{grid-column:1/-1; font-size:12px; font-weight:500; line-height:16px; color:var(--tmute); margin:2px 0 -4px}
.ts-pick .ts-pickh:first-child{margin-top:0}
/* ── พรีวิวรายงาน ── โทนเดียวกับภาพหน้าจอ Power BI ของเขา: ตัวบาง สีจาง การ์ดไม่มีเส้นขอบ */
.th-prev{border:1px solid var(--tbd); border-radius:8px; overflow:hidden}
.th-report{display:flex; min-height:300px}
.th-side{flex:0 0 40px; display:flex; flex-direction:column; align-items:center; gap:24px; padding-top:28px}
.th-side i{width:14px; height:14px; border-radius:3px; background:rgba(255,255,255,.55)}
.th-canvas{flex:1; min-width:0; padding:18px 22px 20px; display:flex; flex-direction:column; gap:14px}
.th-rhead{display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:2px 4px 2px}
.th-chips{display:flex; gap:6px; margin-inline-start:auto}
.th-chips span{padding:3px 12px; border-radius:6px; border:1px solid; line-height:1.6}
.th-grid{display:grid; gap:12px; grid-template-columns:repeat(4,1fr) 1.25fr}
.th-cards{grid-column:span 4; display:grid; grid-template-columns:repeat(4,1fr); gap:12px}
.th-vis{grid-column:span 2; border-radius:8px; padding:14px 16px 14px; border:1px solid transparent; box-shadow:var(--tsh,none);
  display:flex; flex-direction:column; gap:10px; min-width:0}
/* ‼️ สองกฎนี้ต้องอยู่ **หลัง** .th-vis เพราะความจำเพาะเท่ากัน ตัวที่เขียนทีหลังชนะ */
.th-tall{grid-column:5; grid-row:1 / span 2}
.th-wide{grid-column:span 3}
/* ‼️ ตัวพิมพ์ใหญ่กับช่องไฟ ใช้ได้กับอังกฤษเท่านั้น ไทยไม่มีตัวพิมพ์ใหญ่และสระจะลอย */
.th-vt{line-height:1.5}
.th-vs{line-height:1.5; margin-top:-7px}
.th-en .th-vt{letter-spacing:.03em; text-transform:uppercase}
@media (max-width:900px){
  .th-grid{grid-template-columns:repeat(2,1fr)}
  .th-cards{grid-column:span 2; grid-template-columns:repeat(2,1fr)}
  .th-tall,.th-wide,.th-vis{grid-column:span 2; grid-row:auto}
}
.th-card{border-radius:8px; padding:14px 14px 12px; min-width:0; border:1px solid transparent; box-shadow:var(--tsh,none);
  display:flex; flex-direction:column; gap:2px; align-items:center}
.th-ct{line-height:1.6; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%}
.th-card b{line-height:1.2; letter-spacing:-.01em}
.th-cd{margin-top:8px; width:100%; display:flex; flex-direction:column; gap:3px}
.th-cdrow{display:flex; align-items:center; gap:6px; line-height:1.6}
.th-cdrow i{font-style:normal; flex:none}
.th-cdrow u{margin-inline-start:auto; text-decoration:none}
.th-cdrow s{text-decoration:none; font-size:7px; line-height:1}
.th-bb{display:flex; flex-direction:column; gap:4px}
.th-bbh{position:relative; display:flex; align-items:center; gap:7px; line-height:1.6}
.th-range{position:absolute; top:50%; width:34px; height:1px}
.th-range i{display:block; height:1px; width:100%; position:relative}
.th-range i::before,.th-range i::after{content:""; position:absolute; top:-3px; width:1px; height:7px; background:inherit}
.th-range i::before{inset-inline-start:0} .th-range i::after{inset-inline-end:0}
.th-bbt{position:relative; height:15px; border-radius:2px; overflow:hidden}
.th-bbt i{position:absolute; inset-block:0; inset-inline-start:0; border-radius:2px}
.th-bbt b{position:absolute; top:50%; transform:translateY(-50%); line-height:1; white-space:nowrap}
.th-tg{display:flex; align-items:center; gap:8px}
.th-tg>span:first-child{flex:0 0 66px; line-height:1.6; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:end}
.th-tgt{position:relative; flex:1; height:11px; border-radius:2px; overflow:hidden; min-width:0}
.th-tgt i{position:absolute; inset-block:0; inset-inline-start:0; border-radius:2px}
.th-tgt u{position:absolute; inset-block:-2px; width:0; border-inline-start:2px dotted; text-decoration:none}
.th-tg>b{flex:0 0 34px; text-align:end; line-height:1.6}
.th-tree{display:grid; grid-template-columns:1fr 1fr; gap:12px; align-items:center}
.th-col{display:flex; flex-direction:column; gap:10px; min-width:0}
.th-tree>.th-col:last-child{position:relative; padding-inline-start:10px}
.th-tree>.th-col:last-child::before{content:""; position:absolute; inset-block:12%; inset-inline-start:0; width:1px; background:var(--tl)}
.th-nd{display:flex; flex-direction:column; gap:1px; min-width:0}
.th-nd i{height:6px; border-radius:2px; margin-bottom:3px}
.th-nd span,.th-nd em{line-height:1.5; font-style:normal; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.th-area{width:100%; height:auto; display:block}
.th-axis{display:flex; justify-content:space-between; line-height:1.6}
.th-cc{display:flex; gap:8px; align-items:stretch; min-height:118px}
.th-ccb{flex:1; display:flex; align-items:flex-end; gap:7px; min-width:0}
.th-ccol{flex:1; display:flex; flex-direction:column; align-items:center; gap:3px; height:100%; justify-content:flex-end; min-width:0}
.th-ccol em{font-style:normal; line-height:1.4; white-space:nowrap}
.th-ccol i{width:100%; max-width:22px; border-radius:2px 2px 0 0}
/* ‼️ line-height 1.4 กับ overflow:hidden ตัดหางตัวอักษร (y, g, p) ทิ้ง ต้องเผื่อความสูง */
.th-ccol span{line-height:1.7; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%}
.th-ccy{flex:0 0 32px; display:flex; flex-direction:column; justify-content:space-between; padding-inline-start:5px; line-height:1.4; text-align:end}
.th-legend{display:flex; flex-wrap:wrap; gap:12px; padding:2px 4px 0}
.th-legend span{display:inline-flex; align-items:center; gap:5px; line-height:1.7}
.th-legend i{width:9px; height:9px; border-radius:2px; flex:none}
/* ── ตรวจสี ── */
.th-warn{border:1px solid var(--tbd); border-inline-start:3px solid var(--err); border-radius:8px; background:var(--tsur);
  padding:10px 14px; font-size:14px; line-height:1.625; color:var(--tfg); margin-bottom:12px}
.th-warn.th-ok{border-inline-start-color:var(--ok)}
.th-tbl{width:100%; border-collapse:collapse; font-size:13px}
.th-tbl th,.th-tbl td{border-bottom:1px solid var(--tbd); padding:8px 10px; text-align:start; line-height:1.6}
.th-tbl th{font-weight:500; color:var(--tmute); font-size:12px}
.th-bad{color:var(--err); font-weight:600} .th-good{color:var(--ok); font-weight:600}
.th-sec{margin:18px 0 10px; font-size:14px; font-weight:500; line-height:20px; color:var(--tfg)}
.th-cvd{display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px}
.th-cvdbox{border:1px solid var(--tbd); border-radius:8px; padding:10px 12px; background:var(--tsur)}
.th-cvdbox b{display:block; font-size:12px; font-weight:500; margin-bottom:8px; line-height:16px; color:var(--tmute)}
.th-row{display:flex; gap:4px}
.th-row i{flex:1; height:24px; border-radius:4px}
/* ── ไฟล์ธีม ── */
.th-code{margin:0 0 16px; padding:14px 16px; border-radius:6px; background:var(--tbg); border:1px solid var(--tbd); overflow:auto;
  max-height:min(58vh,540px); font:12.5px/1.7 ui-monospace,Menlo,Consolas,monospace; color:var(--tfg); white-space:pre}
.ts-json{margin-bottom:16px}
.ts-actions{display:flex; align-items:center; gap:12px; flex-wrap:wrap; justify-content:flex-end}
.ts-actions .ts-hint{margin:0; flex:1 1 200px; text-align:end}
.ts-btn{font:inherit; font-size:16px; line-height:24px; font-weight:500; padding:12px 24px; border-radius:6px; border:0; cursor:pointer;
  display:inline-flex; align-items:center; gap:8px; color:#fff; background:linear-gradient(90deg,var(--tp),var(--tq));
  transition:opacity var(--t-micro,.1s)}
.ts-btn:hover{opacity:.9}
.ts-btn.sec{background:var(--tbg); color:var(--tp); border:1px solid var(--tbd)}
.ts-btn.sec:hover{background:var(--thov); opacity:1}
.ts-btn svg{width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round}
.ts .status-wrap{margin-top:14px}
.ts .status-wrap:has(.status:not(.show)):not(:has(.progress.show)){display:none}
/* ── แถบล่าง: ชื่อเครื่องมือ ปุ่มเริ่มใหม่ และตัวเลขสดที่ใช้คำนวณจริง
   ‼️ เคยเป็นไล่สีธีมเหมือนแถบหัว พี่ปอนด์บอกรก จึงเหลือพื้นเรียบ สีธีมอยู่ที่ปุ่มสร้างไฟล์กับส่วนที่เลือกเท่านั้น */
.ts-foot{display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:12px 16px; border-radius:8px;
  background:var(--tsur); border:1px solid var(--tbd); color:var(--tfg)}
.ts-name{display:flex; align-items:center; gap:8px; font-size:14px; font-weight:500; line-height:20px}
.ts-name .ts-ico{width:18px; height:18px}
.ts-reset{font:inherit; font-size:14px; font-weight:500; line-height:20px; padding:8px 16px; border-radius:6px; cursor:pointer;
  border:1px solid var(--tbd); background:var(--tbg); color:var(--tp); display:inline-flex; align-items:center; gap:6px; margin-inline-start:auto}
.ts-reset:hover{background:var(--thov)}
.ts-reset svg{width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round}
.th-facts{font-size:12px; line-height:16px; color:var(--tmute); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
/* 1 บรรทัดสรุปผลตรวจสีใต้พรีวิว */
.ts-status{margin:12px 0 10px; padding:9px 12px; border-radius:8px; font-size:13px; line-height:1.6;
  border:1px solid var(--tbd); border-inline-start:3px solid var(--ok); background:var(--tsur); color:var(--tfg)}
.ts-status.bad{border-inline-start-color:var(--err)}
.ts-check{margin-top:0}
@media (max-width:640px){ .ts-reset{margin-inline-start:0} .th-facts{white-space:normal} }
.ts .note{margin-top:0}
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
  /* ‼️ ทั้งธีมถูกกำหนดด้วยค่าดิบ 9 ตัวนี้เท่านั้น ที่เหลือ (fg2, line, ขนาดตัวอักษร)
     คำนวณออกมาจากพวกนี้ทั้งหมด จึงเก็บแค่ 9 ตัวนี้พอ ลิงก์จะได้สั้น */
  const START = {
    name: "FileKit Theme", w: 1920, h: 1080, font: "Segoe UI",
    colors: first.colors.slice(), bg: first.bg, fg: first.fg,
    good: "#1F8A50", neutral: "#6C7A8D", bad: "#C4321F",
  };
  const SAVED_KEYS = Object.keys(START);
  const pickSaved = (o) => {
    const out = {};
    for (const k of SAVED_KEYS) if (o[k] !== undefined) out[k] = k === "colors" ? o[k].slice() : o[k];
    return out;
  };
  let store = null;
  const state = derive({ ...START, colors: START.colors.slice() });

  /* ── ชิ้นส่วนย่อยที่ใช้ซ้ำ ─────────────────────────────────────────── */
  const ico = (name) => el("span", { class: "ts-ico", "aria-hidden": "true", html: ICONS[name] });
  /* หัวข้อส่วน: ไอคอน + ชื่อ ‼️ เคยมีป้ายเลขลำดับ /01-/06 ด้วย พี่ปอนด์ดูแล้วบอก "รกมาก" (13/09 เย็น) จึงถอด
     และยุบจาก 6 ส่วนเหลือ 4 (ตัด "นี่คืออะไร" ที่ซ้ำกับหัวเครื่องมือ และรวมผลตรวจสีเข้าใต้พรีวิว) */
  const sec = (title, iconName, kids) => el("section", { class: "ts-sec" }, [
    el("h2", { class: "ts-h" }, [ico(iconName), title]),
    ...kids,
  ]);
  const sub = (kids, big) => el("div", { class: "ts-sub" + (big ? " big" : "") }, kids);
  const h3 = (title, iconName) => el("h3", { class: "ts-h3" }, [iconName ? ico(iconName) : null, title]);
  /* ป้ายที่ครอบช่องกรอกไว้ในตัว จึงผูกกับช่องโดยไม่ต้องใช้ id */
  const fld = (label, control) => el("label", { class: "ts-f" }, [el("span", { class: "ts-lb" }, label), control]);
  const btn = (text, iconName, onclick, secondary) => el("button", {
    class: "ts-btn" + (secondary ? " sec" : ""), type: "button", onclick,
  }, [uiIcon(iconName, "ts-bi"), el("span", {}, text)]);

  /* ── /02 ผืนผ้าใบ ──────────────────────────────────────────────────── */
  const dimBox = el("div", { class: "ts-dims" });
  /* ‼️ ห้ามส่ง value เข้าไปพร้อม min กับ max ใน el() สำหรับ input range
     el() ไล่ตั้ง attribute ตามลำดับ ตอนตั้ง value ช่วงยังเป็น 0 ถึง 100 ค่า 1920 จึงถูกบีบ
     (tests/browser_theme.py ข้อ ⑧.5 จับได้ 12/09/2026) ต้องตั้งช่วงให้เสร็จก่อนแล้วค่อยใส่ค่า */
  const rangeIn = (min, max, val, label) => {
    const n = el("input", { type: "range", min: String(min), max: String(max), step: "10", "aria-label": label });
    n.value = String(val);
    return n;
  };
  const wIn = el("input", { type: "number", min: "320", max: "6000" }); wIn.value = String(state.w);
  const hIn = el("input", { type: "number", min: "240", max: "6000" }); hIn.value = String(state.h);
  const wBar = rangeIn(320, 3840, state.w, tr("เลื่อนปรับความกว้าง", "Drag to set width"));
  const hBar = rangeIn(240, 3840, state.h, tr("เลื่อนปรับความสูง", "Drag to set height"));
  /* ช่องเลขไม่มีกรอบ หน่วย px ต่อท้าย แถบเลื่อนใต้ช่อง ลอกผังจาก datatraining.io (วัดจริง 13/09) */
  const numField = (label, box, bar) => el("div", { class: "th-num" }, [
    el("label", { class: "ts-f" }, [
      el("span", { class: "ts-lb" }, label),
      el("div", { class: "ts-numrow" }, [box, el("span", { class: "ts-unit" }, "px")]),
    ]),
    bar,
  ]);
  const sizeNote = el("p", { class: "ts-sizenote" });
  const cvPrev = el("div", { class: "th-cvprev" });
  const canvasSec = sec(tr("ผืนผ้าใบ", "Canvas"), "monitor", [
    el("div", { class: "ts-cols" }, [
      sub([el("span", { class: "ts-lb" }, tr("ขนาดที่แนะนำ", "Recommended dimensions")), dimBox]),
      sub([numField(tr("สูง", "Height"), hIn, hBar), numField(tr("กว้าง", "Width"), wIn, wBar), sizeNote]),
      sub([el("span", { class: "ts-lb" }, tr("พรีวิวผืนผ้าใบ", "Canvas preview")), cvPrev]),
    ]),
  ]);

  /* ── /03 หน้าตา ────────────────────────────────────────────────────── */
  const nameIn = el("input", { type: "text", class: "ts-in" }); nameIn.value = state.name;
  const fontSel = select([["Segoe UI", "Segoe UI"], ["Arial", "Arial"], ["Tahoma", "Tahoma"],
                          ["Sarabun", "Sarabun"], ["Calibri", "Calibri"]], state.font);
  fontSel.classList.add("ts-in");
  const track = el("div", { class: "ts-track ts-pal" });
  const arrow = (dir) => el("button", {
    class: "ts-arr " + dir, type: "button", html: ICONS[dir === "prev" ? "left" : "right"],
    "aria-label": dir === "prev" ? tr("ชุดสีก่อนหน้า", "Previous palettes") : tr("ชุดสีถัดไป", "Next palettes"),
    onclick: () => { const w = track.clientWidth / 2 + 6; track.scrollBy({ left: dir === "prev" ? -w : w, behavior: "smooth" }); },
  });
  const caro = el("div", { class: "ts-caro" }, [arrow("prev"), track, arrow("next")]);
  const fileIn = el("input", {
    type: "file", accept: ".json,application/json", hidden: true,
    onchange: (e) => { const f = e.target.files[0]; fileIn.value = ""; if (f) readTheme(f); },
  });
  const pickBox = el("div", { class: "ts-pick" });
  const custom = el("details", { class: "ts-more ts-custom" }, [
    el("summary", {}, tr("ปรับสีเองทีละสี", "Fine tune every colour")),
    pickBox,
  ]);
  const lookSec = sec(tr("หน้าตา", "Appearance"), "type", [
    el("div", { class: "ts-cols2" }, [
      sub([
        h3(tr("ตัวอักษร", "Typography"), "type"),
        fld(tr("ชื่อธีม", "Theme name"), nameIn),
        fld(tr("ฟอนต์หลัก", "Primary font"), fontSel),
      ], true),
      sub([
        h3(tr("ชุดสี", "Colours"), "palette"),
        caro,
        el("p", { class: "ts-hint" }, tr("รายงานตัวอย่างด้านล่างจะทาสีตามชุดที่เลือก", "The example report below is painted with the selected palette")),
        el("div", { class: "ts-own" }, [
          el("button", { class: "ts-link", type: "button", onclick: () => fileIn.click() }, tr("เปิดไฟล์ธีม .json ของเดิม", "Open an existing .json theme")),
          fileIn,
          el("span", {}, tr("อ่านในเครื่องคุณ ไม่ถูกส่งไปไหน", "Read on your device, never uploaded")),
        ]),
      ], true),
      custom,
    ]),
  ]);

  /* ── /04 พรีวิวสี ──────────────────────────────────────────────────── */
  const prevBox = el("div", { class: "th-prev" });
  /* ผลตรวจสี (หัวใจของเครื่องมือนี้ ของเขาไม่มี) เหลือ 1 บรรทัดสรุปใต้พรีวิว รายละเอียดพับไว้
     ‼️ เดิมเป็นส่วนใหญ่แยกมีตารางเต็ม พี่ปอนด์บอกรก */
  const checkLine = el("p", { class: "ts-status" });
  const checkBox = el("div", {});
  const checkDet = el("details", { class: "ts-more ts-check" }, [
    el("summary", {}, tr("รายละเอียดการตรวจสี", "Colour check details")),
    checkBox,
  ]);
  const prevSec = sec(tr("พรีวิว", "Preview"), "eye", [
    el("p", { class: "ts-p ts-mute" }, tr("รายงานสมมติที่ทาสีตามธีมที่กำลังสร้าง", "A mock report painted with the theme you are building")),
    prevBox,
    checkLine,
    checkDet,
  ]);
  prevSec.classList.add("th-prevwrap");

  /* ── /06 ไฟล์ธีม ───────────────────────────────────────────────────── */
  const codeEl = el("code", {});
  const codeBox = el("pre", { class: "th-code" }, [codeEl]);
  const jsonDet = el("details", { class: "ts-more ts-json" }, [
    el("summary", {}, tr("ดูไฟล์ theme.json ที่จะได้", "See the theme.json you will get")),
    codeBox,
  ]);
  const actions = el("div", { class: "ts-actions" }, [
    el("p", { class: "ts-hint" }, tr("ไฟล์ถูกสร้างในเครื่องคุณ ไม่มีอะไรถูกส่งออกไป", "Built on your device, nothing is sent anywhere")),
    btn(tr("คัดลอก JSON", "Copy JSON"), "copy", onCopy, true),
    btn(tr("คัดลอกลิงก์ค่านี้", "Copy link to these settings"), "link", onShare, true),
    btn(tr("สร้างไฟล์ธีม", "Generate theme"), "download", onDownload),
  ]);
  const fileSec = sec(tr("ไฟล์ธีม", "Theme file"), "file", [
    el("p", { class: "ts-p ts-mute" },
      tr("ไฟล์มีขนาดตัวอักษร 4 คลาส สีชุดข้อมูล พื้นหลัง ตัวอักษร สีสถานะ และสีกริดตาราง ตรง schema 2.157",
         "Four text classes, data, background, text and status colours, a table grid colour, valid against schema 2.157")),
    jsonDet, actions, st.node]);

  /* ── แถบล่าง ทาสีธีม ────────────────────────────────────────────────── */
  /* ‼️ ของเขาโชว์ "Canvas: 1920x1080 • Area: 2073600 px²" ตลอดเวลา
     พื้นที่คือตัวเลขที่ใช้คิดขนาดตัวอักษรจริง โชว์ตัวตั้งต้นแล้วคนเข้าใจว่าทำไมตัวอักษรเปลี่ยน */
  const facts = el("div", { class: "th-facts" });
  const foot = el("div", { class: "ts-foot" }, [
    el("div", { class: "ts-name" }, [ico("palette"), tr("สร้างธีม Power BI", "Power BI theme builder")]),
    el("button", { class: "ts-reset", type: "button", onclick: onReset }, [uiIcon("undo", "ts-bi"), el("span", {}, tr("เริ่มใหม่", "Reset"))]),
    facts,
  ]);

  /* ── ประกอบหน้า ───────────────────────────────────────────────────── */
  const { wrap, body } = toolShell(tool);
  wrap.classList.add("ts");
  /* ‼️ ประกาศว่าเครื่องมือนี้ใช้ฟอนต์ของตัวเอง (system-ui ตามของเขา) ไม่ใช่ Sarabun ของเว็บ
     tests/browser_font.py จึงไม่นับอักขระในนี้ (Δ ▲ ▼ ²) ว่า "ขาดจากฟอนต์กลาง" */
  wrap.dataset.font = "system-ui";
  if (IS_EN) wrap.classList.add("ts-en");
  wrap.prepend(el("style", { text: STYLE }));
  body.append(canvasSec, lookSec, prevSec, fileSec, foot,
    /* ‼️ ข้อความนี้ถูกจำกัดความยาว ทั้งเว็บมีข้อความไทยเกิน 100 ตัวอักษรได้ไม่เกิน 4 ก้อน */
    el("div", { class: "note" }, tr(
      "เอาไปใช้: Power BI Desktop แท็บ View แล้ว Themes แล้ว Browse for themes แล้วเลือกไฟล์นี้",
      "To use it: Power BI Desktop, View tab, Themes, Browse for themes, then pick this file")));

  /* ‼️ ต้องสร้างหลังช่องกรอกถูกประกาศครบแล้ว และต้องกู้ค่าก่อน build* ทุกตัว
     ไม่งั้นแผงจะถูกวาดด้วยค่าเริ่มต้นแล้วค่อยโดนทับ ซึ่งเห็นเป็นภาพกระพริบ */
  store = stateKit(tool.id, {
    defaults: { ...START },
    collect: () => pickSaved(state),
    apply: (vals) => {
      Object.assign(state, pickSaved(vals));
      derive(state);
      syncInputs();
    },
  });
  store.restore();

  buildPalettes(); buildCanvas(); buildPickers(); drawCanvasPrev();
  for (const c of [nameIn, wIn, hIn]) c.addEventListener("input", readInputs);
  wBar.addEventListener("input", () => { wIn.value = wBar.value; readInputs(); });
  hBar.addEventListener("input", () => { hIn.value = hBar.value; readInputs(); });
  fontSel.addEventListener("change", readInputs);
  render();
  return wrap;

  /* ── ประกอบแผงควบคุม ───────────────────────────────────────────────── */
  function buildPalettes() {
    track.innerHTML = "";
    for (const p of PALETTES()) {
      track.appendChild(el("button", {
        class: "th-sw", type: "button", "aria-pressed": String(p.colors.join() === state.colors.join()),
        onclick: () => {
          state.colors = p.colors.slice(); state.bg = p.bg; state.fg = p.fg;
          /* ชุดของแบรนด์พก good/neutral/bad มาเองจากไฟล์ธีมจริง ชุดของกลางใช้ค่ากลาง */
          for (const k of ["good", "neutral", "bad"]) if (p[k]) state[k] = p[k];
          derive(state);
          buildPalettes(); buildPickers(); render();
          st.ok(tr(`ใช้ชุด ${p.name} แล้ว`, `Using ${p.name}`));
        },
      }, [
        el("span", { class: "th-swname" }, [
          p.name,
          /* ‼️ ชุดของแบรนด์ต้องแยกให้เห็นว่าเราไม่ได้ตรวจผ่านให้ เป็นสีจริงที่เปลี่ยนไม่ได้ */
          p.kind === "brand" ? el("span", { class: "th-tag" }, tr("แบรนด์", "brand")) : null,
        ]),
        el("span", { class: "th-dots", "aria-hidden": "true" },
          p.colors.slice(0, 5).map((c) => el("i", { style: `background:${c}` }))),
      ]));
    }
  }

  function buildCanvas() {
    dimBox.innerHTML = "";
    for (const [label, w, h] of CANVAS_PRESETS) {
      dimBox.appendChild(el("button", {
        class: "ts-dim", type: "button", "aria-pressed": String(state.w === w && state.h === h),
        onclick: () => { wIn.value = w; hIn.value = h; readInputs(); },
      }, label));
    }
  }

  /* ช่องปรับสีทีละสี ยุบไว้ในกล่อง "ปรับสีเอง" เพราะคนส่วนใหญ่เลือกชุดสำเร็จแล้วจบ
     ‼️ ลำดับช่อง: พื้นหลัง ตัวอักษร ค่าดี ค่ากลาง ค่าแย่ (0-4) แล้วค่อยสีข้อมูล (5 เป็นต้นไป)
        tests/browser_theme.py อ้างลำดับนี้ตรง ๆ ย้ายช่องแล้วเทสจะชี้ผิดช่อง */
  function buildPickers() {
    pickBox.innerHTML = "";
    /* ‼️ จานสีสำเร็จต้องตรงกับหน้าที่ของช่องนั้น เสนอสีสดให้ช่อง "พื้นหลัง" คือเชิญให้ตั้งพื้นเป็นส้มจัด */
    const mk = (key, label, swatches) => {
      const pk = colorPicker(state[key], (v) => {
        state[key] = v;
        if (key === "bg" || key === "fg") derive(state);
        render();
      }, { label, swatches });
      return field(label, pk.node);
    };
    pickBox.append(
      el("div", { class: "ts-pickh" }, tr("สีพื้นฐาน", "Base colours")),
      mk("bg", tr("พื้นหลัง", "Background"), SWATCHES.neutral),
      mk("fg", tr("ตัวอักษรหลัก", "Main text"), SWATCHES.neutral),
      mk("good", tr("ค่าดี", "Good"), SWATCHES.accent),
      mk("neutral", tr("ค่ากลาง", "Neutral"), SWATCHES.neutral),
      mk("bad", tr("ค่าแย่", "Bad"), SWATCHES.accent),
      el("div", { class: "ts-pickh" }, tr("สีของชุดข้อมูล", "Data colours")),
    );
    state.colors.forEach((c, i) => {
      const label = tr(`สีที่ ${i + 1}`, `Colour ${i + 1}`);
      const pk = colorPicker(c, (v) => { state.colors[i] = v; buildPalettes(); render(); }, { label });
      pickBox.appendChild(field(label, pk.node));
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

  /* กล่องพรีวิวผืนผ้าใบตามสัดส่วนจริง ย่อให้อยู่ในกรอบ 176x100 เสมอ ด้านที่ยาวกว่าเป็นตัวกำหนด */
  function drawCanvasPrev() {
    const maxW = 176, maxH = 100;
    const k = Math.min(maxW / state.w, maxH / state.h);
    cvPrev.innerHTML = "";
    cvPrev.appendChild(el("div", { class: "th-cvbox",
      style: `width:${Math.max(24, Math.round(state.w * k))}px; height:${Math.max(16, Math.round(state.h * k))}px` },
      [el("span", {}, `${state.w} x ${state.h}`)]));
  }

  /* ── วาดผลลัพธ์ ────────────────────────────────────────────────────── */
  /* ‼️ ไอเดียที่ดีที่สุดของ datatraining.io: ทั้งหน้าเปลี่ยนสีตามธีมที่ผู้ใช้กำลังสร้าง
     แถบหัว แถบล่าง ปุ่มที่เลือก แถบเลื่อน และปุ่มสร้างไฟล์ ใช้สีจากชุดที่เลือก
     ‼️ สีธีมอาจสว่างจนตัวหนังสือขาวอ่านไม่ออก (ชุดจอมืดสีแรกเป็นพีชอ่อน)
        จึงค่อย ๆ ผสมดำจนคอนทราสต์กับขาวถึง 4.5 ก่อนเอาไปทาแถบ เฉดยังเป็นของชุดนั้น
     ส่วน --ac คือสีประจำเครื่องมือของ FileKit เอง ต้องอ่านออกบนพื้นทั้งสองโหมดของเรา */
  function paintTheme() {
    const readable = (hex) => { let c = hex; for (let i = 0; i < 14 && contrast("#ffffff", c) < 4.5; i++) c = mix(c, "#000000", 0.1); return c; };
    /* ปลายไล่สีเป็นเฉดเดียวกันที่อ่อนลง ไม่ผสมกับสีที่ 2 (ลองแล้ว ส้มผสมเขียวมะกอกได้น้ำตาลขุ่น)
       ของเขาก็ไล่จากสีหลักไปสีหลักที่อ่อนกว่า (#3E5C76 ไป #546D8E) */
    const p0 = state.colors[0] || "#3E5C76";
    const tp = readable(p0);
    wrap.style.setProperty("--tp", tp);
    wrap.style.setProperty("--tq", readable(mix(tp, "#ffffff", 0.22)));
    const onLight = (c) => contrast(c, "#f6f5f3"), onDark = (c) => contrast(c, "#101216");
    const ok = state.colors.find((c) => onLight(c) >= 3 && onDark(c) >= 3);
    wrap.style.setProperty("--ac", ok || p0);
  }

  function render() {
    paintTheme();
    drawCanvasPrev();
    const s = textScale(state.w, state.h), sz = textSizes(state.w, state.h);
    facts.textContent = tr(
      `ผืนผ้าใบ ${state.w} x ${state.h}, พื้นที่ ${(state.w * state.h).toLocaleString("th-TH")} px², สี ${state.colors.length} สี`,
      `Canvas ${state.w} x ${state.h}, area ${(state.w * state.h).toLocaleString("en-US")} px², ${state.colors.length} colours`);
    sizeNote.textContent = tr(
      `ตัวอักษรถูกปรับเป็น ${Math.round(s * 100)}% ของขนาดมาตรฐาน ตัวเลขในการ์ด ${sz.callout}pt ป้าย ${sz.label}pt`,
      `Text scaled to ${Math.round(s * 100)}%, card callout ${sz.callout}pt, labels ${sz.label}pt`);
    drawPreview(sz);
    drawCheck();
    codeEl.innerHTML = paintCode(json(), "json");
    store?.save();     // หน่วง 400ms ในตัวแล้ว ลากแถบเลื่อนรัว ๆ ก็ไม่เขียนถี่
  }

  /* ‼️ ต้องเป็น function declaration ไม่ใช่ const ลูกศร เพราะอยู่หลัง return
     const จะไม่มีวันถูกสร้าง render() ที่เรียกก่อน return จึงพังด้วย TDZ (พลาดมาแล้ว 8 ครั้ง) */
  function json() { return JSON.stringify(buildTheme(state), null, 2); }

  /* รายงานจำลอง ทำด้วย CSS กับ SVG ล้วน ไม่มีไลบรารีกราฟ
   *
   * ‼️ ผังและโทนถอดจากภาพหน้าจอ Power BI ที่ datatraining.io ใช้เป็น Color Preview
   *    (ดูของจริงแล้ว 13/09/2026 เขาใช้ภาพนิ่ง 3 ภาพสลับตามชุดสี ไม่ได้วาดสด ของเราวาดสด)
   *    สิ่งที่ทำให้ภาพเขาดูมืออาชีพ วัดแล้วคือ ① ตัวอักษรบาง (น้ำหนัก 300) ② ป้ายเป็นสีเทาจาง
   *    ③ ใช้แค่ 2 สีหลักในกราฟ ไม่ใช่ทุกสีในชุด ④ การ์ดขาวไม่มีเส้นขอบ มีเงาบาง ๆ บนพื้นเทาอ่อน
   *    ⑤ ที่ว่างเยอะ ตัวหนังสือเล็ก
   * ‼️ ขนาดตัวอักษรในพรีวิว **ไม่ใช่** ขนาดจริงหน่วย pt ของธีม นี่คือรายงานย่อส่วน
   *    แต่ยังคง **สัดส่วนระหว่างคลาส** ไว้ครบ ขนาดจริงหน่วย pt บอกไว้ใต้ช่องขนาดผืนผ้าใบแล้ว
   * ‼️ ตัวเลขทุกตัวเป็นข้อมูลสมมติของกลาง ไม่ใช่ข้อมูลงานจริงของใคร
   */
  function drawPreview(sz) {
    const { bg, fg, fg2, line, colors, font, good, bad } = state;
    const S = {
      callout: clamp(24 * (sz.callout / 45), 14, 36),
      title: clamp(13.5 * (sz.title / 12), 10, 20),
      header: clamp(11.5 * (sz.header / 12), 9, 16),
      label: clamp(9.5 * (sz.label / 10), 8, 14),
    };
    const F = (k, extra = "") => `font-family:${font}; font-size:${S[k].toFixed(1)}px; ${extra}`;
    const soft = (hex, amt) => mix(hex, bg, amt);
    /* ใช้แค่สองสีหลักในกราฟ เหมือนรายงานจริงของเขา สีที่เหลือโชว์ในแถบชุดสีด้านล่าง */
    const P = colors[0], Q = colors[1 % colors.length];
    /* พื้นรายงานเทาอ่อนกว่าการ์ดนิดเดียว การ์ดจึงลอยด้วยเงาแทนเส้นขอบ
       บนพื้นมืดเงามองไม่เห็น จึงกลับไปใช้เส้นขอบบาง ๆ แทน */
    const dark = contrast("#ffffff", bg) >= 4.5;
    const canvasBg = mix(bg, fg, 0.035), cardBg = bg, cardBd = dark ? line : "transparent";
    const shadow = dark ? "none" : "0 1px 2px rgba(0,0,0,.04), 0 3px 10px rgba(0,0,0,.06)";
    const track = soft(line, 0.35);
    const panel = (title, subtitle, kids, cls = "") => el("div", { class: "th-vis " + cls,
      style: `background:${cardBg}; border-color:${cardBd}` }, [
      el("div", { class: "th-vt", style: `color:${fg}; ${F("header", "font-weight:600")}` }, title),
      subtitle ? el("div", { class: "th-vs", style: `color:${fg2}; ${F("label", "font-weight:300")}` }, subtitle) : null,
      ...kids,
    ]);

    /* ── การ์ด KPI: ชื่อบน ตัวเลขบางตรงกลาง แล้วสองบรรทัดเทียบ ───────── */
    const kpi = (label, val, rows) => el("div", { class: "th-card", style: `background:${cardBg}; border-color:${cardBd}` }, [
      el("span", { class: "th-ct", style: `color:${fg2}; ${F("label")}` }, label),
      el("b", { style: `color:${fg}; ${F("callout", "font-weight:300")}` }, val),
      el("div", { class: "th-cd" }, rows.map(([k, v, up]) => el("div", { class: "th-cdrow" }, [
        el("i", { style: `color:${fg2}; ${F("label")}` }, k),
        el("u", { style: `color:${fg}; ${F("label")}` }, v),
        el("s", { style: `color:${up ? good : bad}` }, up ? "▲" : "▼"),
      ]))),
    ]);

    /* ── แท่งแนวนอนพร้อมป้ายเงินในแท่ง และเส้นบอกช่วงด้านบน ─────────── */
    const bigBar = (name, delta, pct, money) => el("div", { class: "th-bb" }, [
      el("div", { class: "th-bbh" }, [
        el("span", { style: `color:${fg}; ${F("label")}` }, name),
        el("span", { style: `color:${fg2}; ${F("label")}` }, delta),
        el("span", { class: "th-range", style: `inset-inline-start:${Math.min(92, pct + 6)}%` }, [
          el("i", { style: `background:${soft(fg, 0.55)}` }),
        ]),
      ]),
      el("div", { class: "th-bbt", style: `background:${track}` }, [
        el("i", { style: `width:${pct}%; background:${P}` }),
        el("b", { style: `inset-inline-end:calc(${100 - pct}% + 6px); color:${bg}; ${F("label")}` }, money),
      ]),
    ]);

    /* ── แท่งเทียบเป้าหมาย มีเส้นประเป้าและ % ด้านขวา ────────────────── */
    const tgt = (name, pct) => el("div", { class: "th-tg" }, [
      el("span", { style: `color:${fg2}; ${F("label")}` }, name),
      el("span", { class: "th-tgt", style: `background:${track}` }, [
        el("i", { style: `width:${pct}%; background:${P}` }),
        el("u", { style: `inset-inline-start:82%; border-color:${soft(P, 0.45)}` }),
      ]),
      el("b", { style: `color:${fg}; ${F("label", "font-weight:400")}` }, pct + "%"),
    ]);

    /* ── ผังแยกส่วน สองชั้น แท่งสีบนรางเทา มีเส้นเชื่อม ─────────────── */
    const node = (name, val, w) => el("div", { class: "th-nd" }, [
      el("i", { style: `background:linear-gradient(90deg, ${Q} ${w}%, ${track} ${w}%)` }),
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
      `<path d="${d} L${xy[xy.length - 1][0]},${H} L${xy[0][0]},${H} Z" fill="${P}" opacity=".1"/>` +
      `<path d="${d}" fill="none" stroke="${P}" stroke-width="1.8" stroke-linejoin="round"/>` +
      xy.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.4" fill="${P}"/>`).join("") +
      xy.map(([x, y], i) => `<text x="${x.toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" ` +
        `font-family="${font}" font-size="7.6" fill="${fg2}">${(pts[i] * 1.2).toFixed(0)}K</text>`).join("");

    /* ── แท่งแนวตั้งมีป้ายบนแท่งและแกนค่าด้านขวา ───────────────────── */
    const cols = [[tr("เครื่องเขียน", "Stationery"), 96], [tr("ไฟฟ้า", "Electronics"), 82],
                  [tr("ของใช้บ้าน", "Home"), 48], [tr("เสื้อผ้า", "Apparel"), 26], [tr("อื่น ๆ", "Others"), 16]];
    const colChart = el("div", { class: "th-cc" }, [
      el("div", { class: "th-ccb" }, cols.map(([n, v]) => el("div", { class: "th-ccol" }, [
        el("em", { style: `color:${fg2}; ${F("label")}` }, (v * 17).toLocaleString()),
        el("i", { style: `height:${v}%; background:${Q}` }),
        el("span", { style: `color:${fg2}; ${F("label")}` }, n),
      ]))),
      el("div", { class: "th-ccy", style: `color:${fg2}; ${F("label")}` },
        ["$60K", "$40K", "$20K", "$0K"].map((t) => el("span", {}, t))),
    ]);

    prevBox.innerHTML = "";
    prevBox.appendChild(el("div", { class: "th-report" + (IS_EN ? " th-en" : ""),
      style: `background:${canvasBg}; --tsh:${shadow}` }, [
      /* แถบข้างไล่สี แบบเดียวกับของเขา */
      el("div", { class: "th-side", style: `background:linear-gradient(${P}, ${Q})` },
        [0, 1, 2].map(() => el("i", {}))),
      el("div", { class: "th-canvas" }, [
        el("div", { class: "th-rhead" }, [
          el("div", { style: `color:${fg}; ${F("title", "font-weight:300" + (IS_EN ? "; letter-spacing:.04em" : ""))}` },
            tr("วิเคราะห์ยอดขาย", "SALES ANALYSIS")),
          el("div", { class: "th-chips" }, ["2024", "2025", "2026"].map((y, i) =>
            el("span", { style: `${F("label")}; color:${i === 2 ? fg : soft(fg, 0.5)}; border-color:${i === 2 ? soft(fg, 0.3) : line}` }, y))),
        ]),
        el("div", { class: "th-grid" }, [
          el("div", { class: "th-cards" }, [
            kpi(tr("ยอดขาย", "Sales"), "620K", [["ΔB", "-16.0%", false], ["ΔFC", "-1.0%", false]]),
            kpi(tr("จำนวนชิ้น", "Quantity"), "11K", [["ΔB", "+13.6%", true], ["ΔFC", "+20.5%", true]]),
            kpi(tr("อัตรากำไร", "Profit margin"), "13.7%", [["ΔB", "+25.0%", true], ["ΔFC", "+22.0%", true]]),
            kpi(tr("ส่วนลดเฉลี่ย", "Avg discount"), "15.0%", [["ΔB", "-17.1%", false], ["ΔFC", "-17.4%", false]]),
          ]),
          panel(tr("ผังแยกตามหมวด", "Breakdown"), tr("จำนวนชิ้น ตามหมวด", "quantity by category"), [
            el("div", { class: "th-tree", style: `--tl:${soft(line, 0.1)}` }, [
              el("div", { class: "th-col" }, [node(tr("รวมทั้งหมด", "Total"), "11,052", 100)]),
              el("div", { class: "th-col" }, [node(tr("เครื่องเขียน", "Stationery"), "7,117", 92),
                                              node(tr("เฟอร์นิเจอร์", "Furniture"), "2,234", 34),
                                              node(tr("เทคโนโลยี", "Technology"), "1,701", 24)]),
            ]),
          ], "th-tall"),
          panel(tr("ยอดขาย", "Sales"), tr("ปีนี้เทียบปีก่อน", "CY vs LY"),
            [[tr("ภาคกลาง", "Central"), "+43.6%", 62, "150,983"], [tr("ภาคตะวันออก", "East"), "+16.0%", 82, "184,332"],
             [tr("ภาคใต้", "South"), "+29.8%", 38, "95,405"], [tr("ภาคตะวันตก", "West"), "+32.5%", 74, "189,589"]]
              .map(([n, dl, pc, m]) => bigBar(n, dl, pc, m))),
          panel(tr("เป้าหมายยอดขาย", "Sales target"), tr("ตามทีมขาย", "by sales team"),
            [[tr("ทีมอัลฟา", "Alfa"), 51], [tr("ทีมบราโว", "Bravo"), 45], [tr("ทีมชาร์ลี", "Charlie"), 27],
             [tr("ทีมเดลตา", "Delta"), 39], [tr("ทีมอิคโค", "Echo"), 90]].map(([n, v]) => tgt(n, v))),
          panel(tr("ยอดขาย", "Sales"), tr("แนวโน้มรายเดือน", "development over time"), [
            area,
            el("div", { class: "th-axis", style: `color:${fg2}; ${F("label")}` },
              [tr("ม.ค.", "Jan"), tr("มี.ค.", "Mar"), tr("พ.ค.", "May"), tr("ก.ค.", "Jul"),
               tr("ก.ย.", "Sep"), tr("พ.ย.", "Nov")].map((m) => el("span", {}, m))),
          ], "th-wide"),
          panel(tr("จำนวนที่ขายได้", "Quantity sold"), tr("เทียบยอดขาย", "vs sales"), [colChart]),
        ]),
        /* แถบสีของชุดข้อมูลทั้งหมด ให้เห็นทุกสีพร้อมกันแม้กราฟจะใช้แค่สองสี */
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
    let summaryBad = 0;

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
    summaryBad += failed.length;
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
    const cvdOk = res.maxSafe >= colors.length;
    /* 1 บรรทัดสรุปใต้พรีวิว: เขียวเมื่อผ่านทั้งสองอย่าง ไม่งั้นบอกว่าอะไรตก */
    checkLine.className = "ts-status" + (failed.length || !cvdOk ? " bad" : " ok");
    checkLine.textContent = failed.length || !cvdOk
      ? tr(`ตรวจสีแล้วพบปัญหา: ${failed.length ? `คอนทราสต์ต่ำ ${failed.length} คู่` : ""}${failed.length && !cvdOk ? ", " : ""}${!cvdOk ? `ตาบอดสีแยกได้แค่ ${res.maxSafe} สี` : ""} ดูรายละเอียดด้านล่าง`,
           `Colour check found issues: ${failed.length ? `${failed.length} low contrast ${failed.length === 1 ? "pair" : "pairs"}` : ""}${failed.length && !cvdOk ? ", " : ""}${!cvdOk ? `only ${res.maxSafe} colours stay apart for colour blind viewers` : ""}, see details below`)
      : tr(`ตรวจสีผ่าน: คอนทราสต์ผ่านทุกคู่ และคนตาบอดสีแยกได้ครบ ${colors.length} สี`,
           `Colour check passed: every pair clears the contrast floor and all ${colors.length} colours stay apart for colour blind viewers`);
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
    buildPalettes(); buildPickers(); render();

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

  /** ดันค่าใน state ลงช่องกรอกให้ตรงกัน ใช้ทั้งตอนกู้ค่าและตอนกดเริ่มใหม่ */
  function syncInputs() {
    nameIn.value = state.name; wIn.value = state.w; hIn.value = state.h; fontSel.value = state.font;
    wBar.value = String(Math.min(3840, state.w));
    hBar.value = String(Math.min(3840, state.h));
  }

  async function onShare() {
    const link = store?.shareLink();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      st.ok(link.includes("?s=") ? SHARE_MSG.ok() : SHARE_MSG.plain());
    } catch { st.err(SHARE_MSG.fail()); }
  }

  function onReset() {
    Object.assign(state, pickSaved(START), { colors: START.colors.slice() });
    derive(state);
    syncInputs();
    store?.forget();
    buildPalettes(); buildCanvas(); buildPickers(); render();
    st.ok(tr("กลับไปค่าตั้งต้นแล้ว", "Back to the starting values"));
  }

  function onDownload() {
    const n = state.name.replace(/[\\/:*?"<>|]/g, "-").trim() + ".json";
    download(new Blob([json()], { type: "application/json;charset=utf-8" }), n);
    st.ok(tr(`ดาวน์โหลด ${n} แล้ว`, `Downloaded ${n}`));
  }
}
