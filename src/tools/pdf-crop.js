// ── ครอบตัดขอบหน้า PDF ─────────────────────────────────────────────────────
// ใช้กับไฟล์สแกนที่ติดขอบดำหรือขอบกระดาษมาด้วย และสไลด์ที่มีขอบขาวเยอะเกินไป
//
// ‼️ ต้องบอกผู้ใช้ตามจริง: การครอบตัดของ PDF คือการ "ย่อกรอบที่แสดง" (CropBox)
//   เนื้อหานอกกรอบยังอยู่ในไฟล์ แค่ไม่ถูกแสดงและไม่ถูกพิมพ์
//   ถ้าต้องการให้หายจริง ๆ ต้องใช้เครื่องมือลบข้อมูลลับ ซึ่งเขียนลิงก์ไว้ให้บนหน้า
//   (พิสูจน์แล้ว 21/09/2026: cropbox เปลี่ยน แต่ mediabox เท่าเดิม เนื้อหาเดิมยังอ่านได้ด้วยเครื่องมือ)
//
// ‼️ รุ่น 2 (02/10/2026 พี่ปอนด์: "พอจะย้ายดันย้ายไม่ได้ต้องไปวางใหม่ ... ไม่มีเครื่องมือซูม หรือ Fit to Page")
//   รุ่นเดิมลากในกรอบ = วาดกรอบใหม่ทับ และลากสั้นกว่า 2% กรอบหายทั้งกรอบ ต้องวาดใหม่ทุกครั้ง
//   รุ่นนี้วางแล้วแก้ต่อได้ทุกทาง ลากในกรอบ = ย้าย, มือจับ 8 จุด = ปรับขนาด, ลูกศร = ขยับทีละพอยต์,
//   ช่องระยะขอบเป็นมิลลิเมตร และมีแถบมุมมองแบบโปรแกรมอ่าน PDF (เปลี่ยนหน้า ซูม พอดีหน้า พอดีความกว้าง)
//   เทส tests/browser_crop_edit.py พิสูจน์แดงกับรุ่น v187 ก่อนเขียนรุ่นนี้
//
// ‼️ รอบตรวจแย้ง (02/10/2026 รีวิว 4 มุม ผู้ตรวจแย้งยืนยันจริง 45 ข้อ) แก้ที่สำคัญ:
//   ระหว่างบันทึกล็อกการแก้ทั้งหมดและใช้ค่าที่ถ่ายไว้ตอนกด, เปลี่ยนไฟล์หรือกดหยุดกลางคันต้องไม่ได้ไฟล์ผิด,
//   บันทึกรอบสองหลัง "กลับไปแก้" ต้องเห็นปุ่มดาวน์โหลด, ไฟล์ล็อกรหัสบันทึกได้, กรอบอิงกรอบที่ pdf.js แสดงจริง,
//   นิ้วเดียวเลื่อนดูตอนซูม, บีบนิ้วช้าก็ซูม, Esc ระหว่างลากยกเลิกท่าแทนการออกจากเครื่องมือ
//
// ‼️ รุ่น 3 (02/10/2026 พี่ปอนด์เคาะ "เอาตามฟ้าแนะนำได้เลยย") เพิ่ม เลิกทำ ทำซ้ำ, ดูผลหลังตัด, แยกกรอบทีละหน้า,
//   ตัดขอบขาวอัตโนมัติ (src/trimbox.js) และแถบบนแถวเดียวทุกจอ แผนผ่านรอบตรวจแย้ง 4 มุม 61 ข้อก่อนเขียน
//   กติกาแม่: ไฟล์ที่ได้ต้องตรงกับที่เห็นเสมอ ทุกที่ที่ต้องรู้ว่าหน้าไหนถูกตัดด้วยกรอบอะไร
//   (บันทึก ดูผล ปุ่มบันทึก ตัวนับ ลายเซ็นแถวผล) ถาม cropOf() ตัวเดียว
//   เทส tests/browser_crop_tools.py พิสูจน์แดงกับ v188 ก่อนเขียนรุ่นนี้
import { openPdf, loadPdfLib, passwordBox, friendlyPdfError } from "../pdfopen.js";
import { el, dropzone, statusBar, button, field, select, segmented, downloadButton, keyHints,
         stripExt, yieldToBrowser, fmtBytes } from "../ui.js";
import { workspace } from "../workspace.js";
import { tr, pl } from "../i18n.js";
import { contentBox, unionBox, clampFrame } from "../trimbox.js";

/* 100% = ขนาดกระดาษจริงบนจอ แบบโปรแกรมอ่าน PDF ทั่วไป (1 พอยต์ = 1/72 นิ้ว, จอ 96 px ต่อนิ้ว) */
const PX_PER_PT = 96 / 72;
const MM_PER_PT = 25.4 / 72;
const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2, 3, 4];
/* ‼️ ซูมต่ำสุดต้องต่ำพอให้กระดาษใหญ่มาก (A0 บนมือถือ) พอดีจอได้จริง
   รุ่นแรกตั้ง 10% แล้วพอดีหน้าของ A0 บนจอ 390 ล้นล่างไป 86 px ทั้งที่ปุ่มพอดีหน้าขึ้นว่ากดอยู่ */
const ZMIN = 0.02, ZMAX = 4;
const MIN = 0.02;             // กรอบเล็กสุด 2% ของหน้า เท่าเกณฑ์ลากพลาดของรุ่นเดิม
const PAD = 16;               // ช่องว่างรอบหน้ากระดาษ ต้องตรงกับ padding ของ .cr-scroll
/* ‼️ เพดานพิกเซลของภาพหน้า 8 ล้าน (ราว 32 MB) เลือกไว้กันมือถือหน่วยความจำเต็มตอนซูมใหญ่
   เป็นค่าที่เผื่อไว้ ยังไม่ได้วัดว่ามือถือรุ่นไหนรับได้เท่าไร ซูมเกินเพดานแล้วภาพจะนุ่มลงเล็กน้อย */
const MAX_PX = 8e6;
const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
/* ย้อนกลับได้ 100 ก้าว ลูกศรที่กดรัวรวมเป็นก้าวเดียวถ้าเว้นช่วงกันไม่ถึง 500 มิลลิวินาที */
const HIST_MAX = 100, GROUP_MS = 500;
/* ภาพที่ใช้หาขอบขาว ราวครึ่งล้านพิกเซลต่อหน้า สเกลไม่เกิน 2 เท่า ด้านยาวไม่เกิน 8192 พิกเซล
   ‼️ รีวิวหลังทำ T1: แต่ไม่ต่ำกว่า 2 พิกเซลต่อ มม. (กระดาษ A3 ลงมาไม่ถึงพื้นนี้ จึงเท่าเดิม)
      ครึ่งล้านพิกเซลคงที่ หน้า A1 เหลือ 1 พิกเซลต่อ มม. เกณฑ์ฝุ่น 4 พิกเซลกลายเป็น 4 มม. เลขหน้า 12 พอยต์ของสแกนถูกทิ้งเป็นฝุ่น */
const TRIM_PX = 5e5, TRIM_DIM = 8192, TRIM_PXMM = 2;
/* ต้องเหลือที่ว่างอย่างน้อย 8 px ถึงจะคืนปุ่มที่พับไว้ ไม่งั้นปุ่มกระพริบเข้าออกตอนความกว้างอยู่ตรงเส้นพอดี */
const HYST = 8;
const FULL = Object.freeze({ x: 0, y: 0, w: 1, h: 1 });
const ICON_UNDO = '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>';
const ICON_REDO = '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>';
const ICON_EYE = '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>';
let uid = 0;

const STYLE = `
.cr-wrap{display:flex;flex-direction:column;gap:10px;height:100%;min-height:0}
.cr-wrap[hidden]{display:none}
/* ผลบันทึกอยู่บนสุดของผืนงาน ไม่มีผลก็ไม่กินที่ (ดูเหตุผลที่ mount) */
.cr-wrap > .results{margin:0;flex:none}
.cr-wrap > .results:empty{display:none}
.cr-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px;color:var(--text-mute);
  font-variant-numeric:tabular-nums}
.cr-bar .grow{flex:1 1 auto}
.cr-bar .s2-link{white-space:nowrap;font-size:13px}
.cr-vh{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);
  clip-path:inset(50%);white-space:nowrap;border:0}
/* ‼️ กล่องเลื่อนห้ามใช้ justify-content:center (บทเรียนรอบนี้)
   ตอนซูมจนหน้ากว้างกว่ากล่อง ส่วนที่ล้นทางซ้ายจะล้นออกฝั่งติดลบ ซึ่งเลื่อนไปดูไม่ได้เลย
   ให้เวทีจัดกลางด้วย margin:auto แทน ซึ่งกลายเป็น 0 เองตอนหน้าใหญ่กว่ากล่อง จึงเลื่อนดูได้ครบทุกมุม */
.cr-scroll{flex:1 1 auto;min-height:0;overflow:auto;display:flex;align-items:flex-start;padding:16px;
  overscroll-behavior:contain}
/* ตัววัดความกว้างแถบเลื่อนของเครื่องนี้ ใช้ครั้งเดียวแล้วถอดทิ้ง */
.cr-scroll.cr-sbprobe{position:absolute;visibility:hidden;width:100px;height:100px;padding:0;overflow:scroll;flex:none}
/* ‼️ บทเรียนเดียวกับ pdf-edit: เวทีต้อง flex:none ห้ามโดนบีบ และห้าม max-width:100%
   ไม่งั้นชั้นวาดกรอบกับภาพหน้าไม่ตรงกัน พิกัดเพี้ยนทั้งหมด ขนาดเวทีตั้งจาก JS ทั้งกว้างและสูง */
.cr-stage{position:relative;flex:none;margin:auto;line-height:0;background:#fff;box-shadow:var(--sh2);
  touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.cr-stage canvas{display:block;width:100%;height:100%}
.cr-layer{position:absolute;inset:0;cursor:crosshair;touch-action:none}
.cr-layer[hidden]{display:none}
/* เงามืดนอกกรอบต้องถูกตัดที่ขอบหน้า แต่มือจับที่วางชิดขอบหน้าห้ามโดนตัดครึ่ง จึงแยกเป็นสองชั้น
   ‼️ ระยะเงาตั้งจาก JS ให้เท่าด้านยาวของหน้าเสมอ (ดู layout) ค่าคงที่ 9999 px เคยไม่พอกับ A1 ที่ 400%
      หน้าสูง 12714 px ส่วนล่าง 1444 px ไม่มืดทั้งที่จะถูกตัดทิ้ง */
.cr-clip{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.cr-clip[hidden]{display:none}
.cr-shade{position:absolute;box-shadow:0 0 0 9999px rgba(17,17,17,.45)}
.cr-keep{position:absolute;box-sizing:border-box;border:2px solid #fff;cursor:move;touch-action:none;
  box-shadow:0 0 0 1px rgba(0,0,0,.55),inset 0 0 0 1px rgba(0,0,0,.55);--hs:12px}
.cr-keep:focus{outline:none}
/* ‼️ วงโฟกัสสองสี ห้ามใช้สีแบรนด์ (วัด 02/10/2026: สีแบรนด์บนเงามืดได้ความต่าง 1.0:1 มองไม่เห็นเลย)
   กรอบอยู่บนกระดาษเสมอไม่ว่าธีมไหน จึงใช้ขาวคู่ดำ ดำบนเงา 6.2:1 ขาวบนเงา 3:1
   outline โปร่งใสไว้ให้โหมดสีบังคับของ Windows วาดเป็นเส้นให้เอง */
.cr-keep:focus-visible{outline:2px solid transparent;outline-offset:4px;
  box-shadow:0 0 0 1px rgba(0,0,0,.55),inset 0 0 0 1px rgba(0,0,0,.55),0 0 0 4px #fff,0 0 0 6px #111}
.cr-h{position:absolute;width:var(--hs);height:var(--hs);box-sizing:border-box;background:#fff;
  border:1.5px solid #1b1b1b;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,.35)}
/* พื้นที่รับคลิกใหญ่กว่าตัวมือจับที่เห็น */
.cr-h::before{content:"";position:absolute;inset:-8px}
/* กึ่งกลางมือจับอยู่บนเส้นขอบพอดี (เส้นหนา 2px กึ่งกลางเส้นอยู่ห่างขอบด้านใน 1px) */
.cr-h[data-h="nw"],.cr-h[data-h="w"],.cr-h[data-h="sw"]{left:calc(-1px - var(--hs) / 2)}
.cr-h[data-h="n"],.cr-h[data-h="s"]{left:calc(50% - var(--hs) / 2)}
.cr-h[data-h="ne"],.cr-h[data-h="e"],.cr-h[data-h="se"]{left:calc(100% + 1px - var(--hs) / 2)}
.cr-h[data-h="nw"],.cr-h[data-h="n"],.cr-h[data-h="ne"]{top:calc(-1px - var(--hs) / 2)}
.cr-h[data-h="w"],.cr-h[data-h="e"]{top:calc(50% - var(--hs) / 2)}
.cr-h[data-h="sw"],.cr-h[data-h="s"],.cr-h[data-h="se"]{top:calc(100% + 1px - var(--hs) / 2)}
.cr-h[data-h="nw"],.cr-h[data-h="se"]{cursor:nwse-resize}
.cr-h[data-h="ne"],.cr-h[data-h="sw"]{cursor:nesw-resize}
.cr-h[data-h="n"],.cr-h[data-h="s"]{cursor:ns-resize}
.cr-h[data-h="e"],.cr-h[data-h="w"]{cursor:ew-resize}
/* นิ้วใหญ่กว่าเมาส์ มือจับกับพื้นที่รับแตะต้องใหญ่ตาม (18 + 11 + 11 = 40 px) */
@media (pointer:coarse){ .cr-keep{--hs:18px} .cr-h::before{inset:-11px} }
/* แถบมุมมอง */
.cr-ib.btn.ghost{min-width:42px;padding-inline:10px;justify-content:center}
.cr-ib .btn-ico{width:18px;height:18px}
.cr-prev .btn-ico{transform:rotate(90deg)}
.cr-next .btn-ico{transform:rotate(-90deg)}
/* ‼️ เส้นขอบช่องเลขหน้าใช้สีเดียวกับช่องกรอกอื่นของเว็บ (--line ได้แค่ 1.2:1 บนแถบ ต่ำกว่าเกณฑ์ 3:1) */
.cr-pgin{width:3.4em;height:38px;padding:0 4px;text-align:center;font:inherit;font-size:14px;
  border:1px solid var(--text-mute);border-radius:var(--r-sm);background:var(--card);color:var(--text);
  font-variant-numeric:tabular-nums;-moz-appearance:textfield;appearance:textfield}
.cr-pgin::-webkit-inner-spin-button,.cr-pgin::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
.cr-of{font-size:13.5px;color:var(--text-mute);white-space:nowrap;font-variant-numeric:tabular-nums;
  padding-inline:2px 4px}
.cr-zoom{min-width:48px;text-align:center;font-size:13px;font-weight:700;color:var(--text-mute);
  font-variant-numeric:tabular-nums}
/* ปุ่มพอดีหน้า พอดีความกว้าง และดูผลหลังตัดที่ใช้อยู่ ต้องดูออกว่ากดค้างไว้ */
.cr-fit[aria-pressed="true"],.cr-pv-btn[aria-pressed="true"]{border-color:var(--text);
  background:color-mix(in srgb,var(--text) 9%,var(--card))}
/* ── แถบบนแถวเดียว (เฟส 3) ─────────────────────────────────────────────
   ‼️ วัด v188: มือถือแถบบนพับเป็น 3 แถว สูง 147 px กินหน้ากระดาษไปเกือบหนึ่งในห้าของจอ
   ตอนนี้ห้ามขึ้นแถวใหม่ ปุ่มที่ล้นย้ายไปแผงลอยใต้แถบ (ไม่ดันหน้ากระดาษ) ดู refold() */
.s2-tbar.cr-tbar{flex-wrap:nowrap;position:relative;z-index:6}
.cr-tbar > *{flex:none}
.cr-tbar .btn{white-space:nowrap}
.cr-grp{display:inline-flex;align-items:center;gap:4px}
.cr-tbar [hidden],.cr-side [hidden],.cr-bar [hidden]{display:none!important}
.cr-more{font-variant-numeric:tabular-nums}
.cr-fold{position:absolute;top:calc(100% + 4px);inset-inline-end:8px;max-width:calc(100% - 16px);box-sizing:border-box;
  display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px;background:var(--card);
  border:1px solid var(--line);border-radius:12px;box-shadow:var(--sh2);visibility:hidden}
.cr-fold.open{visibility:visible}
.cr-fold:empty{display:none}
/* จอเมาส์ใช้ปุ่มกะทัดรัด ทุกปุ่มอยู่บนแถบได้ตั้งแต่จอ 1280 ขึ้นไป */
@media (pointer:fine){
  .cr-tbar .btn.ghost{padding:5px 11px;font-size:13px;min-height:34px}
  .cr-tbar .cr-ib.btn.ghost{min-width:36px;padding-inline:8px}
  .cr-tbar .cr-pgin{height:34px}
}
/* จอสัมผัสทุกปุ่มบนแถบและในแผงพับ 44 x 44 px ตามที่ Apple แนะนำ */
@media (pointer:coarse){
  .s2-tbar.cr-tbar{padding-inline:8px}
  .cr-tbar .sep{margin-inline:4px}
  .cr-tbar .btn.ghost{min-height:44px;min-width:44px;padding:0 14px}
  .cr-tbar .cr-pgin{height:44px}
}
/* พับหมดแล้วยังไม่พอ (เช่นจอ 320 ตอนดูผล ปุ่มดูผลต้องอยู่บนแถบ) ซ่อนจำนวนหน้า ย่อปุ่มดูผลเหลือไอคอน */
.s2-tbar.cr-tbar.cr-tight{gap:2px;padding-inline:6px}
.cr-tbar.cr-tight .cr-of,.cr-tbar.cr-tight > .cr-pv-btn .cr-pv-txt,.cr-tbar.cr-tight .cr-more-w{display:none}
.cr-tbar.cr-tight .sep{margin-inline:3px}
.cr-tbar.cr-tight > .cr-pv-btn{padding-inline:12px}
.cr-note{font-size:12.5px;line-height:1.6;color:var(--text-mute);
  background:var(--bg-soft);border:1px solid var(--line-soft);border-radius:var(--r-sm);padding:9px 12px}
.cr-touch{display:none}
@media (pointer:coarse){ .cr-mouse{display:none} .cr-touch{display:inline} }
.cr-warn{border:1px solid var(--line);border-left:3px solid #b8860b;border-radius:var(--r-sm);
  background:color-mix(in srgb,#b8860b 7%,transparent);padding:10px 12px;font-size:13px;line-height:1.6}
.cr-mixed{margin:0 0 12px;font-size:13px;line-height:1.6;border:1px solid var(--line);
  border-left:3px solid var(--text-mute);border-radius:var(--r-sm);padding:9px 12px}
.cr-mixed[hidden]{display:none}
/* แผงขวา: รูปแบบกรอบ ขอบเขต ปุ่มตัดขอบขาว และสรุปของโหมดแยกทีละหน้า */
.cr-mode{margin:2px 0 12px}
.cr-mode .cr-lbl{display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:var(--text-dim)}
.cr-mode .seg{display:flex;width:100%;box-sizing:border-box}
.cr-dormant{margin:-4px 0 12px;font-size:12.5px;line-height:1.6;color:var(--text-mute)}
.cr-trims{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 2px}
.cr-each{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin:12px 0 0}
.cr-each-sum{margin:0;font-size:13px;line-height:1.6}
/* ‼️ .field กลางของเว็บมี min-width:170px สองช่องเคียงกันจึงกว้าง 352px เกินแผงขวา (ราว 300px)
   ช่องฝั่งขวาล้นออกนอกแผง (เห็นจากภาพจอ 02/10/2026) ต้องปลด min-width และใช้ minmax(0,1fr) */
.cr-mm{border:0;padding:0;margin:14px 0 12px;min-width:0;display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 12px}
.cr-mm legend{padding:0;margin-bottom:6px;font-size:13px;font-weight:600;color:var(--text-dim)}
.cr-mm .field{margin:0;min-width:0}
.cr-mm input{width:100%;min-width:0;box-sizing:border-box}
/* สีเตือนใช้ --err แบบเดียวกับแถบสถานะของเว็บ (--danger ไม่มีอยู่จริง รุ่นแรกจึงได้สีสำรองตัวเดียวทั้งสองธีม) */
.cr-mm input[aria-invalid="true"]{border-color:var(--err);box-shadow:0 0 0 1px var(--err)}
/* ช่องข้อความต้องอยู่ในหน้าเสมอแม้ว่าง (ช่องที่ประกาศถ้อยคำซ่อนแล้วค่อยโผล่ โปรแกรมอ่านหน้าจอมักไม่อ่าน) ว่างแล้วไม่กินที่ */
.cr-mm-msg{margin:-4px 0 12px;font-size:13px;line-height:1.5;font-weight:600;
  color:color-mix(in srgb,var(--err) 62%,var(--text))}
.cr-mm-msg:empty{margin:0}
`;

/** ไอคอนเส้นแบบเดียวกับชุดไอคอนของเว็บ (คลาส .btn-ico ได้เส้นหนาและสีตามปุ่มเอง) */
function lineIcon(d) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("class", "btn-ico");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = d;
  return s;
}

/** ย้ายหรือปรับขนาดกรอบจากสถานะตั้งต้น o ด้วยระยะ dx, dy (สัดส่วนของหน้า)
 *  h = "move" หรือชื่อมือจับ ห้ามหลุดหน้า ห้ามเล็กกว่า MIN และขอบห้ามข้ามกันจนกรอบกลับด้าน */
function moveOrResize(o, h, dx, dy) {
  if (h === "move") {
    return { x: Math.min(1 - o.w, Math.max(0, o.x + dx)), y: Math.min(1 - o.h, Math.max(0, o.y + dy)), w: o.w, h: o.h };
  }
  let L = o.x, R = o.x + o.w, T = o.y, B = o.y + o.h;
  if (h.includes("w")) L = Math.min(R - MIN, Math.max(0, L + dx));
  if (h.includes("e")) R = Math.max(L + MIN, Math.min(1, R + dx));
  if (h.includes("n")) T = Math.min(B - MIN, Math.max(0, T + dy));
  if (h.includes("s")) B = Math.max(T + MIN, Math.min(1, B + dy));
  return { x: L, y: T, w: R - L, h: B - T };
}

/** กรอบบนจอ (หน้าที่หมุนตาม /Rotate แล้ว นับจากมุมซ้ายบน) -> สัดส่วนบนหน้าก่อนหมุน นับจากมุมล่างซ้ายแบบ PDF
 *  ‼️ รุ่นเดิมคิดเหมือนหน้าไม่เคยหมุน (บั๊กเจอ 02/10/2026 ด้วย tests/browser_crop_edit.py)
 *     ครอบมุมซ้ายบนของหน้าที่หมุน 90, 180, 270 บนจอ ไฟล์ออกมาเป็นมุมซ้ายบน "ก่อนหมุน" ทุกครั้ง
 *     ไฟล์สแกนจากมือถือหมุนหน้าด้วย /Rotate บ่อย จึงตัดผิดที่แบบเงียบ ๆ
 *  /Rotate คือองศาที่หมุนตามเข็มนาฬิกาตอนแสดง (ข้อกำหนด PDF) */
function toUnrotated(c, rot) {
  if (rot === 90) return { x: c.y, y: c.x, w: c.h, h: c.w };
  if (rot === 180) return { x: 1 - c.x - c.w, y: c.y, w: c.w, h: c.h };
  if (rot === 270) return { x: 1 - c.y - c.h, y: 1 - c.x - c.w, w: c.h, h: c.w };
  return { x: c.x, y: 1 - c.y - c.h, w: c.w, h: c.h };
}

/** ‼️ รีวิวหลังทำ S5: ใบหน้าที่เขียนค่า null ไว้เอง (เช่น /Rotate null ที่สคริปต์ล้างค่าทิ้ง) pdf.js หยุดสืบทอดตรงนั้น
 *     หน้าไม่หมุน และ CropBox null ใช้ MediaBox แต่ pdf-lib ข้าม null ไปเอาค่าของ /Pages ด้านบน
 *     ไฟล์ที่บันทึกจึงตัดคนละแบบกับที่เห็นบนจอ (วัดจริง: เห็น 307 x 342 ได้ 239 x 441) ต้องเชื่อแบบที่ pdf.js แสดง
 *     PDFLib.PDFNull เป็นตัวเดียวทั้งไลบรารี เทียบด้วย === ได้ get(ชื่อ, true) คือขอค่า null คืนมาด้วย */
function leafNull(p, key) {
  try { return p.node.get(PDFLib.PDFName.of(key), true) === PDFLib.PDFNull; } catch { return false; }
}

/** กรอบของหน้าที่ pdf.js แสดงบนจอจริง ซึ่งเป็นฐานของสัดส่วนกรอบทั้งหมด
 *  ‼️ pdf.js แสดง CropBox ตัดกับ MediaBox (ตัดแล้วว่างหรือ CropBox ใช้ไม่ได้ ใช้ MediaBox แทน)
 *     แต่ pdf-lib คืน CropBox ดิบ รุ่นเดิมจึงวางกรอบผิดที่กับไฟล์ที่ CropBox ใหญ่กว่า MediaBox
 *     (วัด 02/10/2026: MediaBox 595 x 842 กับ CropBox 612 x 792 ได้ขอบขวาเกินกรอบบนจอ 16 พอยต์)
 *     และ CropBox ขนาด 0 ถูกเขียนกลับเป็น 0 คือไม่ได้ครอบอะไรเลยทั้งที่ขึ้นว่าครอบแล้ว */
function shownBox(p) {
  const n = (b) => ({ x0: Math.min(b.x, b.x + b.width), y0: Math.min(b.y, b.y + b.height),
                      x1: Math.max(b.x, b.x + b.width), y1: Math.max(b.y, b.y + b.height) });
  const M = n(p.getMediaBox());
  const C = p.getCropBox && !leafNull(p, "CropBox") ? n(p.getCropBox()) : M;
  const x0 = Math.max(M.x0, C.x0), y0 = Math.max(M.y0, C.y0);
  const x1 = Math.min(M.x1, C.x1), y1 = Math.min(M.y1, C.y1);
  if (x1 - x0 > 0 && y1 - y0 > 0) return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  return { x: M.x0, y: M.y0, w: M.x1 - M.x0, h: M.y1 - M.y0 };
}

/* ── สถานะกรอบ ─────────────────────────────────────────────────────────
 * S = { mode, scope, base, own, one } ไม่แก้ในที่ สร้างก้อนใหม่ทุกครั้ง ประวัติจึงเก็บก้อนเก่าได้ตรง ๆ
 *   mode  "single" = กรอบเดียวใช้ตามขอบเขต, "each" = แยกทีละหน้า
 *   scope all | odd | even | one (one = หน้าที่เห็นอยู่ตอนบันทึก แบบรุ่นเดิม)
 *   base  กรอบของโหมดกรอบเดียว { x, y, w, h } สัดส่วนจากมุมซ้ายบนของหน้าที่แสดง หรือ null
 *   own   Map(หน้า -> กรอบ หรือ null = ไม่ตัด) เฉพาะหน้าที่ตั้งแยกไว้ หน้าที่ไม่มีในนี้ใช้ผลของกรอบเดียว
 *   one   หน้าที่ขอบเขต one ผูกไว้ตอนเข้าโหมดแยก (โหมดแยกไม่มีคำว่า หน้าที่เห็นอยู่)
 * ‼️ รอบตรวจแย้ง: เข้าโหมดแยกต้องได้ไฟล์เท่าเดิมทุกหน้า หน้าที่ไม่มีใน own จึงคิดจากกรอบเดียวตามขอบเขตเดิม
 *    ไม่ใช่คัดลอกกรอบไปทุกหน้า (คัดลอกแล้วหน้าคู่ที่เดิมไม่ถูกตัดจะโดนตัดเงียบ ๆ) */
function inScope(scope, i, shown) {
  if (scope === "one") return i === shown;
  if (scope === "odd") return i % 2 === 0;    // หน้า 1, 3, 5 คือ index 0, 2, 4
  if (scope === "even") return i % 2 === 1;
  return true;
}
/** กรอบที่จะเขียนลงหน้า i จริง (null = ไม่ตัด) ตัวเดียวที่บอกว่าไฟล์ออกมาเป็นอย่างไร */
function cropOf(s, i, shown) {
  if (s.mode === "each" && s.own.has(i)) return s.own.get(i);
  return inScope(s.scope, i, s.mode === "each" ? s.one : shown) ? s.base : null;
}
const sameFrame = (a, b) => a === b || (!!a && !!b && Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9
  && Math.abs(a.w - b.w) < 1e-9 && Math.abs(a.h - b.h) < 1e-9);
const fkey = (f) => (f ? [f.x, f.y, f.w, f.h].map((v) => v.toFixed(6)).join(",") : "-");
/** ลายนิ้วมือของสถานะ ใช้ดูว่าก้าวที่รวมกลุ่มไว้จบแล้วเท่าเดิมหรือไม่ */
function keyOf(s) {
  const own = [...s.own].sort((a, b) => a[0] - b[0]).map(([i, f]) => `${i}:${fkey(f)}`).join(";");
  return [s.mode, s.scope, s.mode === "each" ? s.one : "", fkey(s.base), own].join("|");
}

export function mount(tool) {
  const st = statusBar();
  /* ‼️ แถวผลบันทึกต้องอยู่บนสุดของผืนงาน ไม่ใช่ต่อท้าย body (บั๊กเจอ 02/10/2026)
     หลังกด "กลับไปแก้" เปลือกหน้าไม่สลับไปหน้าผลลัพธ์อีกจนกว่าไฟล์จะเปลี่ยน (เป็นแบบนี้ทั้งเว็บ)
     บันทึกรอบสองจึงค้างอยู่ในผืนงาน รุ่นแรกต่อท้าย body แถวไปตกใต้หน้ากระดาษที่สูงเต็มกล่อง
     สถานะขึ้นว่าครอบเสร็จ แต่ไม่มีปุ่มดาวน์โหลดให้เห็นเลย ไว้บนสุดจึงเห็นทันที
     บันทึกครั้งแรกเปลือกหน้ายังย้ายแถวไปแผงผลลัพธ์ได้เหมือนเดิม เพราะหาแถวจากทั้งกล่อง */
  const results = el("div", { class: "results" });
  const fail = (e) => st.err(friendlyPdfError(e, file && file.name).message);
  const n = ++uid;

  /* ── ผืนงาน ─────────────────────────────────────────────────────────── */
  let viewCanvas = el("canvas", {});
  const layer = el("div", { class: "cr-layer" });
  const shade = el("div", { class: "cr-shade" });
  const clip = el("div", { class: "cr-clip", "aria-hidden": "true", hidden: true }, [shade]);
  /* ‼️ กรอบต้องโฟกัสได้ ไม่งั้นคนใช้คีย์บอร์ดแก้กรอบไม่ได้เลย (WCAG 2.5.7 ทางที่ไม่ต้องลาก)
     ‼️ role application ไม่ใช่ group เพราะ NVDA กับ JAWS อยู่โหมดอ่านกับ group ลูกศรจึงไม่ถึงกรอบ
     ชื่อคงที่ ส่วนขนาดกับตำแหน่งบอกผ่านแถบสถานะเมื่อเปลี่ยนจริง จะได้ไม่พูดซ้ำสองทาง */
  const keepBox = el("div", { class: "cr-keep", hidden: true, tabindex: "0", role: "application",
    "aria-roledescription": tr("กรอบครอบตัด", "crop frame"),
    "aria-label": tr("กรอบที่จะเก็บ ลูกศรย้าย Alt กับลูกศรปรับขนาด Delete ล้าง",
                     "Frame to keep. Arrows move it, Alt with arrows resizes, Delete clears") },
    HANDLES.map((h) => el("span", { class: "cr-h", "data-h": h, "aria-hidden": "true" })));
  const stage = el("div", { class: "cr-stage" }, [viewCanvas, layer, clip, keepBox]);
  const scroller = el("div", { class: "cr-scroll" }, [stage]);
  /* แถบสถานะของกรอบ ส่วนที่ตาเห็นคือขนาด ส่วนตำแหน่งให้โปรแกรมอ่านหน้าจอ (ตาเห็นจากช่อง มม. อยู่แล้ว)
     ‼️ เขียนเฉพาะตอนข้อความเปลี่ยน ไม่งั้นเปลือกหน้าได้ยินว่าผืนงานเปลี่ยนทุกครั้งโดยไม่มีอะไรเปลี่ยนจริง
     infoSay บอกหน้าที่เลิกทำพาไป (โหมดแยกทีละหน้า เลิกทำแล้วพาไปหน้าที่เปลี่ยน คนไม่เห็นจอต้องรู้ด้วยว่าย้ายหน้า) */
  const infoSay = el("span", { class: "cr-vh" });
  const infoText = el("span", {});
  const infoPos = el("span", { class: "cr-vh" });
  const info = el("div", { class: "grow", role: "status" }, [infoSay, infoText, infoPos]);
  /* ป้าย % ไม่ต้องพูดเอง (เดิมพูดทุกครั้งที่กล่องเปลี่ยนขนาด เช่นเปิดแผงตัวเลือกบนมือถือ)
     บอกผ่านช่องนี้แทน เฉพาะตอนผู้ใช้ซูมเองและหยุดซูมแล้ว พร้อมคำว่า ซูม */
  const zoomSay = el("div", { class: "cr-vh", role: "status" });
  /* ‼️ ปุ่มตัดขอบขาวตัวเล็กข้างข้อความ ตอนยังไม่มีกรอบเลย (มือถือแผงตัวเลือกพับอยู่ ปุ่มในแผงหาไม่เจอ) */
  const quickTrim = el("button", { type: "button", class: "s2-link cr-trim-quick", hidden: true,
    onclick: () => trim("main") }, tr("ตัดขอบขาวอัตโนมัติ", "Trim white margins"));
  /* ‼️ รีวิวหลังทำ X7: ชื่ออังกฤษห้ามซ้ำกับปุ่ม Back to editing ของหน้าผลลัพธ์ ซึ่งทำคนละอย่าง (คนสั่งด้วยเสียงเรียกผิดปุ่ม) */
  const pvExit = el("button", { type: "button", class: "s2-link cr-pv-exit", hidden: true,
    onclick: () => setPreview(false) }, tr("แก้กรอบต่อ", "Exit preview"));
  const wrap = el("div", { class: "cr-wrap", hidden: true }, [
    results,
    el("div", { class: "cr-bar" }, [info, quickTrim, pvExit, zoomSay]),
    scroller,
    /* ‼️ เขียนเฉพาะคีย์ที่มีอยู่จริงใน handler ด้านล่าง บอกคีย์ที่ไม่มีจริงแย่กว่าไม่บอก */
    keyHints([
      ["← ↑ → ↓", tr("ย้ายกรอบทีละ 1 พอยต์", "Move the frame 1 pt")],
      ["Shift", tr("ทีละ 10 พอยต์", "10 pt at a time")],
      ["Alt + ←", tr("ปรับขนาดกรอบ", "Resize the frame")],
      ["Del", tr("ล้างกรอบ", "Clear the frame")],
      ["Ctrl + Z", tr("เลิกทำ", "Undo")],
      ["Ctrl + Shift + Z", tr("ทำซ้ำ", "Redo")],
      [tr("Ctrl + ล้อเมาส์", "Ctrl + wheel"), tr("ซูม", "Zoom")],
    ]),
    el("div", { class: "cr-note" }, [
      el("span", { class: "cr-mouse" }, tr("ลากในกรอบเพื่อย้าย ลากจุดขาวเพื่อปรับขนาด ลากนอกกรอบเพื่อวาดใหม่ ส่วนที่มืดจะถูกตัดออก",
        "Drag inside to move, drag a handle to resize, drag outside to redraw. The dark part is cropped")),
      el("span", { class: "cr-touch" }, tr("ลากในกรอบเพื่อย้าย ลากจุดขาวปรับขนาด สองนิ้วซูม หน้าล้นจอใช้นิ้วเดียวเลื่อนดู ส่วนที่มืดจะถูกตัดออก",
        "Drag inside to move, a handle to resize, two fingers to zoom. Zoomed in, one finger pans. Dark parts are cropped")),
    ]),
  ]);

  /* ── แถบมุมมอง ──────────────────────────────────────────────────────── */
  const prevBtn = button("", { icon: "chev", ghost: true, label: tr("หน้าก่อนหน้า", "Previous page"), onclick: () => goPage(cur - 1) });
  const nextBtn = button("", { icon: "chev", ghost: true, label: tr("หน้าถัดไป", "Next page"), onclick: () => goPage(cur + 1) });
  prevBtn.classList.add("cr-ib", "cr-prev");
  nextBtn.classList.add("cr-ib", "cr-next");
  const pageIn = el("input", { class: "cr-pgin", type: "number", min: "1", step: "1", value: "1",
    inputmode: "numeric", "aria-label": tr("เลขหน้า", "Page number") });
  const pageOf = el("span", { class: "cr-of", "aria-hidden": "true" }, "/ 1");
  /* ‼️ ปุ่มที่ต้องอยู่ด้วยกันห่อเป็นก้อน แถบพับทีละก้อน ไม่งั้นได้ซูมเข้าค้างบนแถบโดยไม่มีซูมออก */
  const pageGrp = el("span", { class: "cr-grp cr-pg" }, [prevBtn, pageIn, pageOf, nextBtn]);
  /* ‼️ ปุ่มซูมใช้ไอคอนเส้น ห้ามใช้ตัวอักษร − (U+2212) หรือ ‹ › เพราะฟอนต์ของเว็บไม่มี
     จะถูกวาดด้วยฟอนต์อื่นปนเข้ามา (tests/browser_font.py จับได้ 02/10/2026)
     ไม่เพิ่มลง icons.js เพราะไฟล์นั้นโหลดกับหน้าแรกที่งบ JS ตึงมาก */
  const zoomOutBtn = button("", { ghost: true, label: tr("ซูมออก", "Zoom out"), onclick: () => stepZoom(-1) });
  const zoomInBtn = button("", { ghost: true, label: tr("ซูมเข้า", "Zoom in"), onclick: () => stepZoom(1) });
  zoomOutBtn.append(lineIcon('<path d="M5.5 12h13"/>'));
  zoomInBtn.append(lineIcon('<path d="M12 5.5v13M5.5 12h13"/>'));
  zoomOutBtn.classList.add("cr-ib", "has-ico");
  zoomInBtn.classList.add("cr-ib", "has-ico");
  const zoomLabel = el("span", { class: "cr-zoom" }, "100%");
  const zoomGrp = el("span", { class: "cr-grp cr-zm" }, [zoomOutBtn, zoomLabel, zoomInBtn]);
  const fitPageBtn = button(tr("พอดีหน้า", "Fit page"), { ghost: true, onclick: () => setFit("page") });
  const fitWidthBtn = button(tr("พอดีความกว้าง", "Fit width"), { ghost: true, onclick: () => setFit("width") });
  fitPageBtn.classList.add("cr-fit");
  fitWidthBtn.classList.add("cr-fit");
  /* ปุ่มสลับ ชื่อคงที่ บอกว่ากดอยู่ด้วย aria-pressed (ชื่อที่เปลี่ยนตามสถานะ คนสั่งด้วยเสียงจะเรียกไม่ถูก)
     ‼️ ใส่ชื่อซ้ำไว้ที่ aria-label เพราะตอนที่แคบมากข้อความถูกซ่อนเหลือไอคอน ชื่อต้องไม่หายตาม */
  const pvBtn = button("", { ghost: true, label: tr("ดูผลหลังตัด", "Preview result"), onclick: () => setPreview(!preview) });
  pvBtn.classList.add("cr-pv-btn", "has-ico");
  pvBtn.setAttribute("aria-pressed", "false");
  pvBtn.append(lineIcon(ICON_EYE), el("span", { class: "cr-pv-txt" }, tr("ดูผลหลังตัด", "Preview result")));
  /* ชื่อตาม Word ภาษาไทย (เลิกทำ ทำซ้ำ) คนคุ้นมือที่สุด */
  const undoBtn = button("", { ghost: true, label: tr("เลิกทำ", "Undo"), onclick: () => step(-1) });
  const redoBtn = button("", { ghost: true, label: tr("ทำซ้ำ", "Redo"), onclick: () => step(1) });
  undoBtn.append(lineIcon(ICON_UNDO));
  redoBtn.append(lineIcon(ICON_REDO));
  for (const b of [undoBtn, redoBtn]) b.classList.add("cr-ib", "has-ico");
  const placeBtn = button(tr("วางกรอบ", "Place a frame"), { ghost: true, onclick: placeFrame });
  const resetBtn = button(tr("ล้างกรอบ", "Clear the frame"), { ghost: true, onclick: () => clearFrame(true) });
  /* ปุ่มกางแผงพับ ข้อความบอกจำนวนปุ่มที่ซ่อนอยู่ตรง ๆ (บทเรียน 20/09 ปุ่มเคยบอก อีก 2 ปุ่ม แต่กางแล้วไม่มีอะไร) */
  /* ‼️ รีวิวหลังทำ F6 X6: ตอนแถบแคบมากซ่อนคำท้าย ภาษาอังกฤษเดิมเหลือแค่ตัวเลขโดด ๆ จึงมี + นำหน้าแทนคำว่า อีก */
  const moreNum = el("span", {}, "0");
  const moreBtn = el("button", { type: "button", class: "btn ghost cr-more", hidden: true,
    "aria-expanded": "false", "aria-controls": `cr-fold-${n}` },
    [tr("อีก ", "+"), moreNum, el("span", { class: "cr-more-w" }, tr(" ปุ่ม", " more"))]);
  const foldPanel = el("div", { class: "cr-fold", id: `cr-fold-${n}`, role: "group",
    "aria-label": tr("ปุ่มที่พับไว้", "More buttons"), hidden: true });
  const sepA = el("div", { class: "sep cr-sep" }), sepB = el("div", { class: "sep cr-sep" });
  /* ปุ่มที่ถูกปิดตอนมีโฟกัสอยู่ ส่งโฟกัสให้ปุ่มคู่ (ดู syncView) */
  const PARTNER = new Map([[prevBtn, [nextBtn, pageIn]], [nextBtn, [prevBtn, pageIn]],
                           [zoomOutBtn, [zoomInBtn]], [zoomInBtn, [zoomOutBtn]],
                           [undoBtn, [redoBtn]], [redoBtn, [undoBtn]]]);

  /* ── แผงขวา ─────────────────────────────────────────────────────────── */
  /* ‼️ ปุ่มแบ่งช่องเป็น radio จริง ลูกศรสลับได้และยิง change ทุกครั้งที่กด
     การสลับจึงต้องเป็นแค่การสลับ ห้ามเขียนกรอบใหม่ (รอบตรวจแย้ง UX-01) */
  const modeSeg = segmented([["single", tr("กรอบเดียว", "One frame")], ["each", tr("แยกทีละหน้า", "Per page")]], "single");
  modeSeg.setAttribute("aria-labelledby", `cr-mode-${n}`);
  modeSeg.addEventListener("change", () => setMode(modeSeg.value));
  const modeBox = el("div", { class: "cr-mode" }, [
    el("span", { class: "cr-lbl", id: `cr-mode-${n}` }, tr("รูปแบบกรอบ", "Frame mode")), modeSeg]);
  const dormant = el("p", { class: "cr-dormant", hidden: true });
  const applySel = select([
    ["all", tr("ทุกหน้า", "All pages")],
    ["odd", tr("หน้าคี่", "Odd pages")],
    ["even", tr("หน้าคู่", "Even pages")],
    ["one", tr("เฉพาะหน้าที่เห็นอยู่", "Only the page shown")],
  ], "all");
  applySel.addEventListener("change", () => setScope(applySel.value));
  const scopeBox = el("div", { class: "cr-scope" }, [field(tr("ใช้กรอบนี้กับ", "Apply the frame to"), applySel)]);
  const trimBtn = button(tr("ตัดขอบขาวอัตโนมัติ", "Trim white margins"), { ghost: true, onclick: () => trim("main") });
  trimBtn.classList.add("cr-trim");
  const trimPageBtn = button(tr("ตัดขอบขาวเฉพาะหน้านี้", "Trim this page only"), { ghost: true, onclick: () => trim("page") });
  trimPageBtn.classList.add("cr-trim-page");
  trimPageBtn.hidden = true;
  const eachSum = el("p", { class: "cr-each-sum" });
  const copyAllBtn = button(tr("คัดลอกกรอบนี้ไปทุกหน้า", "Copy this frame to all pages"), { ghost: true, onclick: copyAll });
  copyAllBtn.classList.add("cr-copy-all");
  /* สแกนหนังสือเย็บเล่ม ขอบซ้ายขวาสลับกันระหว่างหน้าคี่กับหน้าคู่ คัดลอกไปเฉพาะหน้าฝั่งเดียวกัน */
  const copyParBtn = button("", { ghost: true, onclick: copyPar });
  copyParBtn.classList.add("cr-copy-par");
  const eachBox = el("div", { class: "cr-each", hidden: true }, [eachSum, copyAllBtn, copyParBtn]);
  /* ระยะที่ตัดออกจากขอบหน้าแต่ละด้าน เป็นมิลลิเมตร ซิงก์สองทางกับกรอบบนจอ
     คนที่รู้ตัวเลขอยู่แล้ว (เช่น ตัดขอบเย็บเล่ม 15 มม.) พิมพ์ได้เลยไม่ต้องลาก */
  const EDGES = [["top", tr("บน", "Top")], ["bottom", tr("ล่าง", "Bottom")],
                 ["left", tr("ซ้าย", "Left")], ["right", tr("ขวา", "Right")]];
  const LABEL = Object.fromEntries(EDGES);
  /* ‼️ ข้อความบอกว่าทำไมค่าที่พิมพ์ใช้ไม่ได้ เดิมมีแค่ขอบแดง ไม่บอกเลยว่าใส่ได้ถึงเท่าไร */
  const msgId = `cr-mm-msg-${n}`;
  const mmMsg = el("p", { class: "cr-mm-msg", id: msgId, "aria-live": "polite" });
  const mmIn = {};
  for (const [k, label] of EDGES) {
    /* ‼️ step 0.1 ตามทศนิยมที่แสดง (เดิม 0.5 แต่เขียนค่าอย่าง 14.9 ลงช่อง ช่องจึงไม่ผ่านกติกาของเบราว์เซอร์เอง) */
    const inp = el("input", { type: "number", min: "0", step: "0.1", inputmode: "decimal", "data-edge": k,
      "aria-label": tr(`ตัดขอบ${label} มิลลิเมตร`, `${label} trim in millimetres`), "aria-describedby": msgId });
    inp.addEventListener("input", (ev) => onMargin(k, ev));
    inp.addEventListener("change", () => onMarginDone(k));   // ออกจากช่องแล้วคืนค่าจริง ถ้าพิมพ์ค่าที่ใช้ไม่ได้ค้างไว้
    mmIn[k] = inp;
  }
  /* ‼️ กรอบเก็บเป็นสัดส่วนของแต่ละหน้า ไฟล์ที่มีหน้าหลายขนาดหรือหลายแนว ระยะ มม. จะต่างกันไปตามหน้า
     ต้องบอกตรง ๆ เมื่อเจอ (ตรวจสูงสุด 300 หน้าแรกหลังเปิดไฟล์ ไม่ถ่วงการเปิด) */
  const mixedNote = el("p", { class: "cr-mixed", hidden: true },
    tr("ไฟล์นี้มีหน้าหลายขนาด กรอบใช้เป็นสัดส่วนของแต่ละหน้า ระยะ มม. ด้านบนเป็นของหน้าที่เห็นอยู่",
       "Pages here differ in size. The frame scales per page, the mm values are for the page shown"));

  const go = button(tr("ครอบตัดแล้วบันทึก", "Crop and save"), { onclick: run });
  go.disabled = true;

  const dz = dropzone({
    accept: "application/pdf,.pdf", multiple: false,
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "a PDF file"),
    hint: tr("ครั้งละ 1 ไฟล์", "One file at a time"),
    onChange: onFile,
  });

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์", "File"), node: dz.container },
    right: { title: tr("การครอบตัด", "Crop"), node: el("div", { class: "cr-side" }, [
      modeBox,
      dormant,
      scopeBox,
      el("div", { class: "cr-trims" }, [trimBtn, trimPageBtn]),
      eachBox,
      el("fieldset", { class: "cr-mm" }, [
        el("legend", {}, tr("ระยะที่ตัดออกจากขอบ (มม.)", "Trim from each edge (mm)")),
        ...EDGES.map(([k, label]) => field(label, mmIn[k])),
      ]),
      mmMsg,
      mixedNote,
      el("div", { class: "cr-warn" },
         tr("เนื้อหานอกกรอบยังอยู่ในไฟล์ แค่ไม่แสดงและไม่พิมพ์ ถ้าต้องการให้หายจริงใช้ตัวลบข้อมูลลับ",
            "Content outside the frame stays in the file, just not shown or printed. To remove it, use the redaction tool")),
    ]) },
    center: { node: wrap, empty: tr("เลือกไฟล์ PDF แล้วลากคลุมส่วนที่ต้องการเก็บ", "Choose a PDF, then drag over the part you want to keep") },
    toolbar: [pageGrp, sepA, zoomGrp, fitPageBtn, fitWidthBtn, pvBtn, sepB,
              undoBtn, redoBtn, placeBtn, resetBtn, moreBtn, foldPanel],
    toolbarGroups: [tr("หน้า", "Page"), tr("มุมมอง", "View"), tr("กรอบ", "Frame")],
    footer: [go, st.node],
  });
  ws.wrap.appendChild(el("style", {}, STYLE));

  let file = null, pdf = null, pageCount = 0, cur = 0, openSeq = 0;
  let pw = null;              // รหัสที่ผู้ใช้ใส่ตอนเปิดไฟล์ ใช้ซ้ำตอนบันทึก (ไม่เก็บลงที่ไหน หายเมื่อเปลี่ยนไฟล์)
  /* ‼️ ขนาดหน้าที่เห็นอยู่ เป็นพอยต์ (คิดการหมุนแล้ว) กับเลขหน้า i ของขนาดนั้น ตั้งพร้อมกันหลังรอ getPage
     การแก้กรอบทุกทางลงที่หน้า pageSize.i ไม่ใช่ cur (รอบตรวจแย้งเฟส 3)
     cur เปลี่ยนตั้งแต่ก่อนรอหน้าใหม่ ระหว่างนั้นกรอบบนจอยังเป็นของหน้าเก่า แก้ตาม cur จะไปลงหน้าที่ยังไม่เห็น */
  let pageSize = null;
  let shownPage = null;       // หน้าของ pdf.js ที่แสดงอยู่ (ไว้คืนหน่วยความจำตอนเปลี่ยนหน้า)
  let S = { mode: "single", scope: "all", base: null, own: new Map(), one: 0 };
  /* ‼️ ท่าลากเป็นร่าง ลงสถานะตอนจบท่าครั้งเดียว ยกเลิกแล้วทิ้งร่างได้เลย ไม่ต้องคืนค่าเก่า
     ประวัติจึงได้หนึ่งก้าวต่อหนึ่งท่า และลากที่ถูกยกเลิกไม่ทิ้งร่องรอย */
  let draft = null;           // { page, frame }
  let zoom = 1;               // 1 = ขนาดจริง
  let fit = "page";           // "page" | "width" | null (ซูมเอง)
  let rendered = 0, renderSeq = 0, task = null, sharpTimer = 0;
  /* ‼️ งานที่ล็อกการแก้ทั้งหมด null | "save" | "scan" (เดิมมีแค่ running ของการบันทึก)
     หาขอบขาวใช้ล็อกเดียวกับบันทึก เพราะทั้งคู่ถ่ายสถานะไว้ตอนเริ่ม ถ้าแก้ระหว่างทาง ผลที่ได้จะไม่ตรงกับที่เห็น */
  let job = null, jobSeq = 0, trimTask = null;
  let preview = false, pvKeep = null;   // pvKeep = ซูมกับโหมดพอดีก่อนเข้าดูผล ออกแล้วคืนให้
  let resultFor = null;       // { s, shown } สถานะที่ใช้สร้างแถวผลบันทึกที่ค้างในผืนงาน
  let ver = 0, undoNote = null;
  let mmPage = -1;            // หน้าที่ช่อง มม. เขียนค่าไว้ล่าสุด (ดู syncInputs)
  const hist = { undo: [], redo: [], group: null, timer: 0 };
  /* ท่านิ้วกับเมาส์ (รายละเอียดอยู่ที่หัวข้อท่าลาก) ประกาศไว้ตรงนี้เพราะ locked() กับ onFile ใช้ */
  let drag = null;            // { id, mode, p0, o }
  let start = null, drawId = null, origin = null;
  let pan = null;             // { id } นิ้วเดียวเลื่อนดูตอนหน้าล้นจอ
  const touches = new Map();
  let nav = null;             // { d0, z0, x, y } ระยะห่างกับซูมตอนเริ่มบีบ และจุดกึ่งกลางสองนิ้วรอบก่อน
  let folded = new Set(), foldOpen = false, foldDeferred = false;

  const resultState = () => ws.wrap.dataset.state === "result";
  /** แก้กรอบไม่ได้ตอนนี้: มีงานอยู่ อยู่หน้าผลลัพธ์ หรือกำลังดูผลหลังตัด */
  const editLocked = () => !!job || resultState() || preview;
  /** เลิกทำไม่ได้ตอนนี้: แบบเดียวกับข้างบน บวกตอนมีท่าลากค้าง */
  const locked = () => editLocked() || !!(drag || start);
  /** กรอบที่เห็นบนหน้านี้ กรอบเดียวแสดงทุกหน้าเพื่อให้แก้ได้ ส่วนโหมดแยกแสดงกรอบที่หน้านี้จะได้จริง */
  function frameShown() {
    if (!pageSize) return null;
    const i = pageSize.i;
    if (draft && draft.page === i) return draft.frame;
    return S.mode === "single" ? S.base : cropOf(S, i, i);
  }
  function anyCrop() {
    if (!pdf || !pageSize) return false;
    for (let i = 0; i < pageCount; i++) if (cropOf(S, i, pageSize.i)) return true;
    return false;
  }
  function countCropped() {
    let c = 0;
    if (pdf && pageSize) for (let i = 0; i < pageCount; i++) if (cropOf(S, i, pageSize.i)) c++;
    return c;
  }

  async function onFile(fs) {
    file = fs[0] || null;
    const seq = ++openSeq;
    /* ‼️ งานที่ค้างของไฟล์เก่า (บันทึก หาขอบ) ห้ามกลับมาแตะอะไรของไฟล์ใหม่ ตัดสายตรงนี้ทีเดียว */
    jobSeq++;
    if (job) { job = null; ws.setBusy(false); st.end(); st.progress(null); }
    if (trimTask) { try { trimTask.cancel(); } catch {} trimTask = null; }
    results.replaceChildren(); resultFor = null;
    endGesture(); touches.clear(); nav = null;   // ท่าที่ค้างจากไฟล์เก่าห้ามติดมา
    /* ประวัติไม่ข้ามไฟล์ เลขหน้าของไฟล์เก่าไม่มีความหมายกับไฟล์ใหม่ เก็บไว้แค่รูปแบบกรอบกับขอบเขตที่เลือก */
    S = { mode: S.mode, scope: S.scope, base: null, own: new Map(), one: 0 };
    clearTimeout(hist.timer);
    hist.undo = []; hist.redo = []; hist.group = null; hist.timer = 0;
    undoNote = null; ver++;
    if (preview) { preview = false; pvKeep = null; stage.classList.remove("cr-pv"); pvBtn.setAttribute("aria-pressed", "false"); }
    closeFold(false);
    syncEsc();
    pw = null;
    mixedNote.hidden = true;
    setMsg("");
    st.clear();
    renderSeq++;              // งานวาดของไฟล์เก่าที่ค้างอยู่ต้องไม่กลับมาวาดทับ
    clearTimeout(sharpTimer);
    if (task) { try { task.cancel(); } catch {} task = null; }
    if (pdf) { try { pdf.destroy(); } catch {} pdf = null; }
    shownPage = null; pageCount = 0; pageSize = null;
    draw(); syncView(); refresh();   // กรอบกับปุ่มของไฟล์เก่าต้องหายทันที ไม่ค้างระหว่างรอเปิดไฟล์ใหม่
    if (!file) { wrap.hidden = true; ws.showCanvas(false); return; }
    let doc = null;
    try {
      st.info(tr("กำลังเปิดไฟล์…", "Opening the file…"));
      const ask = passwordBox(ws.body);
      doc = await openPdf(file, async (wrong) => {
        const p = await ask(wrong);
        if (seq === openSeq) pw = p;
        return p;
      });
      if (seq !== openSeq) { try { doc.destroy(); } catch {} return; }   // ผู้ใช้เปลี่ยนไฟล์ระหว่างรอ
      pdf = doc;
      pageCount = pdf.numPages;
      wrap.hidden = false;
      ws.showCanvas(true);
      fit = "page";
      cur = 0;
      await showPage(0);
      if (seq !== openSeq) return;   // ไฟล์ใหม่มาแล้ว ห้ามล้างข้อความของไฟล์ใหม่
      st.clear();
      checkMixed(doc, seq);
    } catch (e) {
      if (seq !== openSeq) return;
      if (doc) { try { doc.destroy(); } catch {} }   // ‼️ เปิดได้แต่วาดไม่ได้ ต้องคืน worker ด้วย ไม่งั้นค้างทั้งตัว
      wrap.hidden = true; ws.showCanvas(false);
      pdf = null; shownPage = null; pageCount = 0; pageSize = null;
      draw(); syncView(); refresh();
      fail(e);
    }
  }

  async function checkMixed(doc, seq) {
    try {
      const n = Math.min(doc.numPages, 300);
      let w0 = 0, h0 = 0;
      for (let i = 1; i <= n; i++) {
        const vp = (await doc.getPage(i)).getViewport({ scale: 1 });
        if (seq !== openSeq) return;
        if (i === 1) { w0 = vp.width; h0 = vp.height; continue; }
        if (Math.abs(vp.width - w0) > 1 || Math.abs(vp.height - h0) > 1) { mixedNote.hidden = false; return; }
      }
    } catch { /* ตรวจไม่ได้ก็แค่ไม่เตือน ไม่ใช่เหตุให้เครื่องมือพัง */ }
  }

  async function showPage(i) {
    const doc = pdf;
    if (!doc || i < 0 || i >= pageCount) return;
    const moved = !!pageSize;                  // มีหน้าแสดงอยู่แล้ว = เปลี่ยนหน้า ไม่ใช่เปิดไฟล์ใหม่
    cur = i;
    const page = await doc.getPage(i + 1);
    if (doc !== pdf || cur !== i) return;      // เปลี่ยนไฟล์หรือกดเปลี่ยนหน้าซ้ำระหว่างรอ อันล่าสุดชนะ
    /* ‼️ คืนภาพที่ถอดรหัสแล้วของหน้าก่อน ไม่งั้นทุกหน้าที่เปิดผ่านค้างในหน่วยความจำจนเปลี่ยนไฟล์
       (pdf.js ล้างเองเฉพาะภาพใหญ่กว่า 10 MB ภาพสแกน 150 dpi ราว 8.7 MB ต่อหน้าจึงค้างทุกหน้า) */
    if (shownPage && shownPage !== page) { try { shownPage.cleanup(); } catch {} }
    shownPage = page;
    const vp = page.getViewport({ scale: 1 }); // คิด /Rotate ให้แล้ว ได้ขนาดตามที่ตาเห็น
    pageSize = { w: vp.width, h: vp.height, i };
    /* ‼️ รีวิวหลังทำ S3: ข้อความ ย้อนการแก้ที่หน้า N แล้ว เป็นของจังหวะที่ย้อนเท่านั้น ออกจากหน้านั้นแล้วกลับมาห้ามพูดซ้ำ */
    if (undoNote && undoNote.page !== i) undoNote = null;
    /* ช่องเลขหน้าที่มีโฟกัสถูกข้ามตอนซิงก์ (กันเขียนทับเลขที่กำลังพิมพ์) แต่หน้าเปลี่ยนแล้วต้องตรงหน้าจริง (รีวิวหลังทำ F7) */
    pageIn.value = String(i + 1);
    if (fit) zoom = fitZoom(fit);
    /* ตอนดูผล หน้าใหม่ตัดคนละส่วนกับหน้าเก่า ภาพเก่าที่ยืดเต็มเวทีจะเพี้ยนรูปจนกว่าภาพใหม่จะมา จึงซ่อนไว้ก่อน */
    if (preview) viewCanvas.style.visibility = "hidden";
    layout();
    /* ‼️ รีวิวหลังทำ F1: เลิกทำในโหมดแยกพาไปหน้าอื่นแบบรอโหลด กรอบที่มีโฟกัสหายตอนหน้าใหม่มาถึง ไม่ใช่ตอนกด
       จึงกู้โฟกัสที่นี่ด้วย (ผู้ตรวจวัด: หน้าใหม่ไม่มีกรอบ ได้ BODY ราว 0.8 วินาทีหลังกด) */
    if (moved) afterChange();
    else { draw(); syncView(); refresh(); }
    rendered = 0;
    await renderPage();
  }

  function goPage(i) {
    if (job || !pdf || !pageCount) return;
    i = Math.min(pageCount - 1, Math.max(0, i));
    if (i === cur && pageSize) { syncView(); return; }
    /* ‼️ จบท่าค้างเฉพาะตอนเปลี่ยนหน้าจริง (บั๊กเจอ 02/10/2026 จากเทสเฟส 3)
       กดเลขหน้าแล้ว Enter ช่องเลขหน้ายิง change ซ้ำตอนเสียโฟกัส ซึ่งเกิดตอนกดมือจับพอดี
       เดิมเรียก settle() ก่อนเช็กหน้าเดิม ท่าลากเพิ่งเริ่มจึงถูกจบทันที ลากมือจับแล้วกรอบไม่ขยับเลย */
    settle();
    const doc = pdf;
    showPage(i).catch((e) => { if (doc === pdf) fail(e); });   // ไฟล์เก่าที่ถูกปิดไปแล้วห้ามมาแจ้งข้อผิดพลาดใต้ชื่อไฟล์ใหม่
  }
  function commitPage() {
    const v = parseInt(pageIn.value, 10);
    const i = Number.isFinite(v) ? Math.min(pageCount, Math.max(1, v)) - 1 : cur;
    pageIn.value = String(i + 1);              // พิมพ์เกินจำนวนหน้า ให้เห็นว่าพาไปหน้าไหนจริง
    goPage(i);
  }
  pageIn.addEventListener("change", commitPage);
  pageIn.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); commitPage(); } });

  /* ── ซูม ─────────────────────────────────────────────────────────────
   * ‼️ คิดพอดีหน้าจากขนาดกล่องรวมแถบเลื่อน (offsetWidth) ไม่ใช่ clientWidth
   *    clientWidth หดเมื่อแถบเลื่อนโผล่ ค่าพอดีจะแกว่งไปมาระหว่างมีกับไม่มีแถบเลื่อน
   * ตอนดูผลหลังตัด เวทีคือส่วนที่เหลือหลังตัด ทุกอย่างคิดจาก viewBox() แทนทั้งหน้า */
  const clampZ = (z) => Math.min(ZMAX, Math.max(ZMIN, z));
  /** ส่วนของหน้าที่อยู่บนเวที (สัดส่วน) ปกติทั้งหน้า ตอนดูผลเหลือเฉพาะกรอบที่หน้านี้จะได้จริง */
  function viewBox() {
    const f = preview && pageSize ? cropOf(S, pageSize.i, pageSize.i) : null;
    return f || FULL;
  }
  /* ‼️ ความกว้างแถบเลื่อนต้องวัดจากเครื่องจริง ห้ามเดาเป็นค่าคงที่
     รุ่นแรกเผื่อไว้ 16 px แต่ Windows แบบเดิมกว้าง 17 px พอดีความกว้างจึงมีแถบเลื่อนแนวนอนโผล่มา 1 px
     มือถือกับ Mac แถบเลื่อนซ้อนทับ วัดได้ 0 ไม่ต้องเผื่อเลย */
  let sbw = -1;
  function scrollbarW() {
    if (sbw >= 0) return sbw;
    const p = el("div", { class: "cr-scroll cr-sbprobe", "aria-hidden": "true" });
    scroller.appendChild(p);
    const ow = p.offsetWidth, cw = p.clientWidth;
    p.remove();
    if (ow > 0) sbw = ow - cw;                 // กล่องยังซ่อนอยู่วัดไม่ได้ ไว้วัดรอบหน้า
    return Math.max(0, ow - cw);
  }
  function fitZoom(mode) {
    const W = scroller.offsetWidth - 2 * PAD, H = scroller.offsetHeight - 2 * PAD;
    if (!pageSize || W <= 0 || H <= 0) return zoom;
    const vb = viewBox();
    const pw = pageSize.w * vb.w * PX_PER_PT, ph = pageSize.h * vb.h * PX_PER_PT;
    if (mode === "width") {
      const z = W / pw;
      return clampZ(ph * z <= H ? z : (W - scrollbarW()) / pw);   // หน้ายาวกว่าช่อง แถบเลื่อนแนวตั้งจะกินที่
    }
    return clampZ(Math.min(W / pw, H / ph));
  }
  function layout() {
    if (!pageSize) return;
    const vb = viewBox();
    const w = Math.max(1, Math.floor(pageSize.w * vb.w * PX_PER_PT * zoom));
    const h = Math.max(1, Math.floor(pageSize.h * vb.h * PX_PER_PT * zoom));
    stage.style.width = w + "px";
    stage.style.height = h + "px";
    shade.style.boxShadow = `0 0 0 ${Math.max(w, h)}px rgba(17,17,17,.45)`;   // เงาต้องยาวกว่าด้านยาวของหน้าเสมอ
  }
  /** เปลี่ยนซูมโดยให้จุดของหน้าที่อยู่ใต้ anchor (พิกัดจอ) ยังอยู่ที่เดิม ไม่ส่ง = กึ่งกลางกล่อง */
  function setZoom(z, anchor) {
    if (!pageSize) return;
    const sr = scroller.getBoundingClientRect();
    const ax = anchor ? anchor.x : sr.left + scroller.clientWidth / 2;
    const ay = anchor ? anchor.y : sr.top + scroller.clientHeight / 2;
    const r0 = stage.getBoundingClientRect();
    const fx = (ax - r0.left) / r0.width, fy = (ay - r0.top) / r0.height;
    zoom = clampZ(z);
    layout();
    const r1 = stage.getBoundingClientRect();
    scroller.scrollLeft += r1.left + fx * r1.width - ax;
    scroller.scrollTop += r1.top + fy * r1.height - ay;
    syncView();
    scheduleSharp();
  }
  /* ขั้นถัดไปคือค่าในรายการที่มากกว่าซูมตอนนี้ แบบเดียวกับโปรแกรมอ่าน PDF ของ Chrome
     (รีวิวเสนอให้ข้ามขั้นที่ใกล้เกิน 5% ผู้ตรวจแย้งตีตกเพราะเป็นแบบที่ตั้งใจ จึงคงไว้) */
  function stepZoom(dir) {
    const next = dir > 0 ? ZOOMS.find((z) => z > zoom * 1.001)
                         : [...ZOOMS].reverse().find((z) => z < zoom / 1.001);
    if (next == null) return;
    fit = null;
    setZoom(next);
    sayZoom();
  }
  function setFit(mode) {
    fit = mode;
    setZoom(fitZoom(mode));
    sayZoom();
  }
  let saidZoom = "", sayTimer = 0;
  function sayZoom() {
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => {
      const p = Math.round(zoom * 100);
      const t = tr(`ซูม ${p}%`, `Zoom ${p}%`);
      if (t !== saidZoom) zoomSay.textContent = saidZoom = t;
    }, 400);
  }
  /* กล่องเปลี่ยนขนาด (หมุนจอ, ย่อหน้าต่าง, พับแผง) ตอนอยู่ในโหมดพอดี ต้องพอดีใหม่ตาม */
  new ResizeObserver(() => {
    if (!pdf || !pageSize || !fit) return;
    const z = fitZoom(fit);
    if (Math.abs(z - zoom) < 0.001) return;
    zoom = z;
    layout(); syncView(); scheduleSharp();
  }).observe(scroller);

  /* Ctrl หรือ Cmd กับล้อเมาส์ = ซูมรอบจุดที่ชี้ (บีบนิ้วบนทัชแพดก็ส่งมาแบบนี้)
     ‼️ ต้อง passive:false ไม่งั้น preventDefault ไม่มีผล เบราว์เซอร์จะซูมทั้งหน้าเว็บแทน */
  scroller.addEventListener("wheel", (ev) => {
    if (!pageSize || !(ev.ctrlKey || ev.metaKey)) return;
    ev.preventDefault();
    const dy = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaMode === 2 ? ev.deltaY * 400 : ev.deltaY;
    fit = null;
    setZoom(zoom * Math.exp(-dy * 0.0015), { x: ev.clientX, y: ev.clientY });
    sayZoom();
  }, { passive: false });

  /* ── วาดภาพหน้าให้คมตามซูม ─────────────────────────────────────────────
   * ซูมเปลี่ยนแค่ขนาดเวทีทันที (ลื่น) แล้วค่อยเรนเดอร์ภาพใหม่หลังหยุดซูม 180 มิลลิวินาที
   * เรนเดอร์ลงผืนใหม่แล้วค่อยสลับ ภาพเก่าจึงไม่กระพริบหาย และยกเลิกงานเก่าที่ยังไม่เสร็จทุกครั้ง
   * ‼️ ตอนดูผลหลังตัด วาดเฉพาะส่วนในกรอบด้วย offset ของ viewport (ผืนเท่าส่วนที่เหลือ)
   *    ไม่ใช่วาดทั้งหน้าแล้วตัดทีหลัง ส่วนเล็กจึงซูมได้คมโดยไม่ชนเพดานพิกเซลของทั้งหน้า */
  function wantScale() {
    const dpr = window.devicePixelRatio || 1;
    const vb = viewBox();
    const cap = Math.sqrt(MAX_PX / (pageSize.w * vb.w * pageSize.h * vb.h));
    return Math.max(Math.min(1, cap), Math.min(cap, zoom * PX_PER_PT * dpr));
  }
  function scheduleSharp() {
    clearTimeout(sharpTimer);
    sharpTimer = setTimeout(() => {
      const doc = pdf;
      if (doc && pageSize && wantScale() > rendered * 1.15) renderPage().catch((e) => { if (doc === pdf) fail(e); });
    }, 180);
  }
  async function renderPage() {
    const page = shownPage;
    if (!pdf || !pageSize || !page) return;
    const seq = ++renderSeq;
    if (task) { try { task.cancel(); } catch {} task = null; }
    const scale = wantScale();
    const vb = viewBox();
    const full = page.getViewport({ scale });
    const vp = vb === FULL ? full
      : page.getViewport({ scale, offsetX: -vb.x * full.width, offsetY: -vb.y * full.height });
    const c = el("canvas", {});
    c.width = Math.max(1, Math.floor(vb.w * full.width));
    c.height = Math.max(1, Math.floor(vb.h * full.height));
    const t = page.render({ canvasContext: c.getContext("2d"), viewport: vp });
    task = t;
    try {
      await t.promise;
    } catch (e) {
      c.width = c.height = 0;       // ผืนที่วาดไม่เสร็จ คืนหน่วยความจำทันที
      if (e && e.name === "RenderingCancelledException") return;
      throw e;
    } finally {
      if (task === t) task = null;
    }
    if (seq !== renderSeq || page !== shownPage) { c.width = c.height = 0; return; }
    const old = viewCanvas;
    old.replaceWith(c);
    viewCanvas = c;
    old.width = old.height = 0;     // คืนหน่วยความจำของภาพเก่าทันที ไม่ต้องรอเก็บขยะ
    rendered = scale;
  }

  /* ── สถานะบนจอ ───────────────────────────────────────────────────────── */
  function draw() {
    const f = frameShown();
    const on = !!(f && pageSize) && !preview;
    keepBox.hidden = clip.hidden = !on;
    layer.hidden = preview;
    if (!on) return;
    const pos = { left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` };
    Object.assign(keepBox.style, pos);
    Object.assign(shade.style, pos);
  }

  const setText = (node, t) => { if (node.textContent !== t) node.textContent = t; };
  /** ของที่ตาเห็นและกดได้ตอนนี้ (ปุ่มในแผงพับที่ปิดอยู่ กดไม่ได้และโฟกัสไม่ได้) */
  const reachable = (x) => !!x && !x.disabled && !x.closest("[hidden]") && (foldOpen || !foldPanel.contains(x))
    && x.getClientRects().length > 0;
  function focusFirst(list) {
    for (const x of list) {
      if (!reachable(x)) continue;
      x.focus({ preventScroll: true });
      if (document.activeElement === x) return true;
    }
    return false;
  }
  /** ‼️ รีวิวหลังทำ (F1 F2 F3 T3): ของที่มีโฟกัสหาย ถูกปิด ถูกซ่อน หรือถูกพับไประหว่างคำสั่ง โฟกัสห้ามหลุดไปทั้งหน้า
   *  วัดจริง: เลิกทำกรอบที่โฟกัสอยู่, กด แก้กรอบต่อ, กดตัดขอบขาวจากลิงก์หรือจากแผ่นตัวเลือกบนมือถือ ได้ BODY ทุกทาง
   *  had = ของที่มีโฟกัสก่อนคำสั่ง ถ้าคำสั่งส่งโฟกัสไปที่ใหม่เองแล้ว (เช่นวางกรอบ) ไม่แตะ
   *  ไม่งั้นคืนของเดิมถ้ายังกดได้ แล้วไล่ กรอบ ปุ่มวางกรอบ ปุ่ม อีก N ปุ่ม ช่องเลขหน้า */
  function keepFocus(had) {
    if (!had || had === document.body || (had.isConnected && !ws.wrap.contains(had))) return;
    const a = document.activeElement;
    if (a && a !== document.body && a !== had) return;
    if (a === had && reachable(had)) return;
    focusFirst([had, keepBox, placeBtn, moreBtn, pageIn, nextBtn, prevBtn]);
  }
  function syncView() {
    const has = !!(pdf && pageSize) && !job;
    /* ไฟล์หน้าเดียวไม่มีหน้าให้เปลี่ยน ซ่อนทั้งก้อน ที่บนแถบเหลือให้ปุ่มอื่น */
    pageGrp.hidden = pageCount <= 1;
    const dis = new Map([
      [prevBtn, !has || cur <= 0],
      [nextBtn, !has || cur >= pageCount - 1],
      [zoomOutBtn, !has || zoom <= ZOOMS[0] + 1e-6],
      [zoomInBtn, !has || zoom >= ZMAX - 1e-6],
      [fitPageBtn, !has], [fitWidthBtn, !has],
      [pvBtn, !has || (!preview && !anyCrop())],
      [undoBtn, !has || locked() || !hist.undo.length],
      [redoBtn, !has || locked() || !hist.redo.length],
      [placeBtn, !has || preview],
    ]);
    pageIn.disabled = !has;
    for (const [b, d] of dis) if (!d) b.disabled = false;
    const off = (x) => (dis.has(x) ? dis.get(x) : x.disabled);
    for (const [b, d] of dis) {
      if (!d) continue;
      /* ‼️ ปุ่มที่เพิ่งกดแล้วกดต่อไม่ได้ (หน้าถัดไปตอนถึงหน้าสุดท้าย ซูมเข้าตอนถึง 400% เลิกทำจนสุด)
         ถ้าปิดเฉย ๆ โฟกัสหลุดไปทั้งหน้า คนใช้คีย์บอร์ดหาไม่เจอว่าอยู่ตรงไหน จึงส่งโฟกัสให้ปุ่มคู่ก่อนปิด
         ‼️ เฟส 3 ปุ่มคู่อาจถูกพับอยู่ในแผงที่ปิด ซึ่งโฟกัสไม่ได้ ต้องข้ามไปปุ่ม อีก N ปุ่ม แทน
         ‼️ รีวิวหลังทำ F2: เดิมข้ามไปเฉพาะตอนตัวปุ่มเองอยู่ในแผง เลิกทำบนแถบที่ปุ่มคู่ (ทำซ้ำ) ถูกพับ โฟกัสหลุดไป BODY */
      if (document.activeElement === b) {
        const to = (PARTNER.get(b) || []).find((x) => !off(x) && reachable(x));
        const folded = foldPanel.contains(b) || (PARTNER.get(b) || []).some((x) => foldPanel.contains(x));
        /* ไม่มีปุ่มคู่ (ดูผลหลังตัดที่ปิดเพราะกรอบเดียวถูกเลิกทำ) ไป วางกรอบ ก่อนช่องเลขหน้า
           ให้ตรงกับทางเดียวกันอีกสองทาง คือกด Delete ที่กรอบ และเลิกทำตอนโฟกัสอยู่ที่ ล้างกรอบ (รีวิวหลังทำ F2) */
        if (to) to.focus();
        else if (folded && !moreBtn.hidden) moreBtn.focus();
        else focusFirst([keepBox, placeBtn, pageIn].filter((x) => x !== b));
      }
      b.disabled = true;
    }
    pageIn.max = String(Math.max(1, pageCount));
    if (document.activeElement !== pageIn) pageIn.value = String(cur + 1);
    setText(pageOf, `/ ${Math.max(1, pageCount)}`);
    pageIn.setAttribute("aria-label", tr(`เลขหน้า จาก ${Math.max(1, pageCount)} หน้า`, `Page number, of ${Math.max(1, pageCount)}`));
    fitPageBtn.setAttribute("aria-pressed", String(fit === "page"));
    fitWidthBtn.setAttribute("aria-pressed", String(fit === "width"));
    setText(zoomLabel, `${Math.round(zoom * 100)}%`);
  }

  /* ‼️ ห้ามแก้กรอบตอนกำลังบันทึกหรือหาขอบ และตอนอยู่หน้าผลลัพธ์ (บั๊กเจอ 02/10/2026)
     หน้าผลลัพธ์บนจอกว้างยังเห็นกรอบอยู่ เดิมลากแก้ได้ แต่ปุ่มดาวน์โหลดยังให้ไฟล์ของกรอบเก่า
     inert กันทั้งเมาส์ นิ้ว และคีย์บอร์ดในคำสั่งเดียว
     ‼️ ดูผลหลังตัดห้ามใช้ inert (รอบตรวจแย้งเฟส 3) เพราะ inert ปิดสองนิ้วซูมไปด้วย ตอนดูผลกันที่ตัวรับแต่ละตัวแทน */
  function syncLock() {
    stage.inert = !!job || resultState();
  }
  /* ‼️ รีวิวหลังทำ X7: หน้าผลลัพธ์แก้กรอบไม่ได้ ลิงก์ แก้กรอบต่อ จึงห้ามโผล่ (กดแล้วแค่ปิดดูผล กรอบยังแก้ไม่ได้)
     และ กลับไปแก้ ของเปลือกหน้าต้องพาถึงกรอบที่แก้ได้ในก้าวเดียว ไม่ใช่ค้างในโหมดดูผล
     ปุ่มที่กดหายไปกับแผงผลลัพธ์ โฟกัสจึงส่งต่อให้กรอบ */
  let lastState = ws.wrap.dataset.state;
  new MutationObserver(() => {
    const from = lastState;
    lastState = ws.wrap.dataset.state;
    syncLock(); syncView();
    pvExit.hidden = !preview || resultState();
    if (from !== "result" || lastState !== "work") return;
    const a = document.activeElement;
    const lost = !a || a === document.body || (ws.wrap.contains(a) && !reachable(a));
    if (preview) setPreview(false);
    if (lost) focusFirst([keepBox, placeBtn, moreBtn, pageIn, nextBtn, prevBtn]);
  }).observe(ws.wrap, { attributes: true, attributeFilter: ["data-state"] });

  const mm = (pt) => Math.round(pt * MM_PER_PT);
  const mm1 = (pt) => Math.round(pt * MM_PER_PT * 10) / 10;
  /** แถวผลบันทึกที่ค้างยังตรงกับสถานะตอนนี้ไหม (ขอบเขต หน้าที่เห็นอยู่ ผลขึ้นกับหน้าที่เห็นตอนบันทึกด้วย) */
  const sameOutput = (r) => !!r && r.s === S && (S.mode !== "single" || S.scope !== "one" || r.shown === (pageSize ? pageSize.i : -1));
  function trimLabel() {
    /* ‼️ รีวิวหลังทำ X9: ไฟล์หน้าเดียวเช็กก่อนโหมด เดิมโหมดแยกได้ ทุกหน้า แยกกัน คู่กับ เฉพาะหน้านี้ สองปุ่มทำอย่างเดียวกัน */
    if (pageCount <= 1) return tr("ตัดขอบขาวอัตโนมัติ", "Trim white margins");
    if (S.mode === "each") return tr("ตัดขอบขาวทุกหน้า แยกกัน", "Trim each page separately");
    return { all: tr("ตัดขอบขาวอัตโนมัติ ทุกหน้า", "Trim white margins, all pages"),
             odd: tr("ตัดขอบขาวอัตโนมัติ หน้าคี่", "Trim white margins, odd pages"),
             even: tr("ตัดขอบขาวอัตโนมัติ หน้าคู่", "Trim white margins, even pages"),
             one: tr("ตัดขอบขาวอัตโนมัติ หน้านี้", "Trim white margins, this page") }[S.scope];
  }
  function refresh() {
    const has = !!(pdf && pageSize);
    const any = has && anyCrop();
    const f = frameShown();
    const busy = !!job;
    const each = S.mode === "each";
    /* ‼️ ปุ่มบันทึกปิดเมื่อไม่มีหน้าไหนถูกตัดจริง (เดิมไฟล์ 1 หน้าเลือกหน้าคู่ กดได้แล้วขึ้น ครอบตัด 0 หน้าเรียบร้อย) */
    go.disabled = busy || !any;
    resetBtn.disabled = busy || preview || !f;
    applySel.disabled = busy || preview;
    for (const r of modeSeg.querySelectorAll("input")) r.disabled = busy || preview;
    if (applySel.value !== S.scope) applySel.value = S.scope;
    if (modeSeg.value !== S.mode) modeSeg.value = S.mode;
    scopeBox.hidden = each;
    eachBox.hidden = !each;
    /* ‼️ รีวิวหลังทำ X9: ไฟล์หน้าเดียวไม่มีหน้าอื่นให้ตัดแยกหรือคัดลอกไป ซ่อนปุ่มที่ซ้ำกับปุ่มหลัก */
    trimPageBtn.hidden = !each || pageCount <= 1;
    copyAllBtn.hidden = pageCount <= 1;
    setText(trimBtn, trimLabel());
    trimBtn.disabled = trimPageBtn.disabled = busy || preview || !has;
    copyAllBtn.disabled = copyParBtn.disabled = busy || preview || !f;
    copyParBtn.hidden = pageCount < 3;
    if (has) setText(copyParBtn, pageSize.i % 2 === 0 ? tr("คัดลอกไปหน้าคี่ทุกหน้า", "Copy to all odd pages")
                                                     : tr("คัดลอกไปหน้าคู่ทุกหน้า", "Copy to all even pages"));
    /* ‼️ รีวิวหลังทำ X4 กับ K4: own นับทั้งหน้าที่มีกรอบเองและหน้าที่สั่งไม่ตัด เดิมเขียนว่า มีกรอบแยกเก็บไว้ ซึ่งไม่จริงกับหน้าที่ไม่ตัด
       ส่วนสรุปเดิม ตั้งแยก N ไม่ตัด M จากทั้งหมด P นับหน้าเดียวกันซ้ำสองช่อง บวกกันไม่ได้ คนอ่านงง
       ตอนนี้ ตัด กับ ไม่ตัด รวมกันได้ทั้งไฟล์ แล้วบอกแยกว่าตั้งเองไว้กี่หน้า */
    const nOwn = S.own.size;
    dormant.hidden = each || !nOwn;
    if (nOwn) setText(dormant, tr(`ตั้งแยกไว้ ${nOwn} หน้า จะใช้เมื่อเลือก แยกทีละหน้า`,
                                  `${pl(nOwn, "page has", "pages have")} Per page settings, used when Per page is on`));
    if (each && has) {
      const cut = countCropped();
      setText(eachSum, tr(`ตัด ${cut} หน้า ไม่ตัด ${pageCount - cut} หน้า ตั้งแยกไว้ ${nOwn} หน้า`,
                          `${cut} cropped, ${pageCount - cut} not cropped, ${nOwn} set separately`));
    }
    quickTrim.hidden = !has || any || preview || busy;
    pvExit.hidden = !preview || resultState();
    syncLock();
    syncInputs(false);
    setMsg("");
    /* แถวผลบันทึกที่ค้างในผืนงานไม่ตรงกับกรอบบนจอแล้ว ทิ้งเลย กดบันทึกใหม่ได้ไฟล์ที่ตรงกว่า */
    if (resultFor && results.firstChild && !sameOutput(resultFor)) { results.replaceChildren(); resultFor = null; }
    if (!has) { setText(infoSay, ""); setText(infoText, ""); setText(infoPos, ""); return; }
    const i = pageSize.i;
    setText(infoSay, undoNote && undoNote.ver === ver && undoNote.page === i ? undoNote.text : "");
    const pw = mm(pageSize.w), ph = mm(pageSize.h);
    if (preview) {
      const c = cropOf(S, i, i);
      setText(infoText, c ? tr(`ผลหลังตัด ${mm(c.w * pageSize.w)} x ${mm(c.h * pageSize.h)} มม.`,
                               `After cropping: ${mm(c.w * pageSize.w)} x ${mm(c.h * pageSize.h)} mm`)
                          : tr("หน้านี้ไม่ถูกตัด เห็นทั้งหน้าเหมือนเดิม", "This page is not cropped and stays whole"));
      setText(infoPos, "");
      return;
    }
    if (!f) {
      /* ‼️ ชี้ไปที่ปุ่ม วางกรอบ เฉพาะตอนปุ่มอยู่บนแถบให้เห็น (มือถือพับปุ่มนี้เก็บ ชี้ไปของที่มองไม่เห็นแย่กว่าไม่ชี้) */
      setText(infoText, each ? tr("หน้านี้ไม่ตัด ลากคลุมส่วนที่ต้องการเก็บถ้าจะตัดหน้านี้", "This page is not cropped. Drag over the part to keep to crop it")
        : folded.has(placeBtn) ? tr("ยังไม่มีกรอบ ลากคลุมส่วนที่ต้องการเก็บ", "No frame yet. Drag over the part to keep")
        : tr("ยังไม่มีกรอบ ลากคลุมส่วนที่ต้องการเก็บ หรือกด วางกรอบ", "No frame yet. Drag over the part to keep, or press Place a frame"));
      setText(infoPos, "");
      return;
    }
    const w = mm(f.w * pageSize.w), h = mm(f.h * pageSize.h);
    let t;
    if (each) {
      /* ‼️ รีวิวหลังทำ S4: คำว่า เดียวกับหน้าอื่น ใช้เฉพาะตอนมีหน้าอื่นใช้กรอบนี้จริง
         (ขอบเขต เฉพาะหน้าที่เห็นอยู่ หรือไฟล์ 2 หน้ากับหน้าคี่ ไม่มีหน้าอื่นเลย เดิมก็ยังเขียนว่าใช้ร่วมกัน) */
      let shared = false;
      for (let j = 0; j < pageCount && !shared; j++) shared = j !== i && !S.own.has(j) && inScope(S.scope, j, S.one);
      t = S.own.has(i) ? tr(`หน้านี้มีกรอบของตัวเอง ${w} x ${h} มม.`, `This page has its own ${w} x ${h} mm frame`)
        : shared ? tr(`หน้านี้ใช้กรอบเดียวกับหน้าอื่น ${w} x ${h} มม. แก้แล้วเป็นของหน้านี้หน้าเดียว`,
                      `Shared ${w} x ${h} mm frame. Editing makes it this page's own`)
        : tr(`หน้านี้ใช้กรอบที่ตั้งตอนเลือก กรอบเดียว ${w} x ${h} มม. แก้แล้วเป็นของหน้านี้หน้าเดียว`,
             `Uses the One frame setting, ${w} x ${h} mm. Editing makes it this page's own`);
    } else if (S.scope === "even" && pageCount < 2) {
      t = tr("ไม่มีหน้าคู่ในไฟล์นี้ เลือก ใช้กรอบนี้กับ เป็นแบบอื่น", "This file has no even pages. Pick another option under Apply the frame to");
    } else if (!inScope(S.scope, i, i)) {
      const name = S.scope === "odd" ? tr("หน้าคี่", "odd pages") : tr("หน้าคู่", "even pages");
      t = tr(`กรอบ ${w} x ${h} มม. ใช้กับ${name} หน้านี้จึงไม่ถูกตัด`, `The ${w} x ${h} mm frame is for ${name}, so this page is not cropped`);
    } else {
      t = tr(`กรอบที่เก็บไว้ ${w} x ${h} มม. จากหน้า ${pw} x ${ph} มม.`, `Keeping ${w} x ${h} mm of a ${pw} x ${ph} mm page`);
    }
    setText(infoText, t);
    const l = mm1(f.x * pageSize.w), tp = mm1(f.y * pageSize.h);
    setText(infoPos, tr(` ห่างขอบซ้าย ${l} มม. ขอบบน ${tp} มม.`, `, ${l} mm from the left and ${tp} mm from the top`));
  }
  /** หลังสถานะเปลี่ยน วาดใหม่ทุกส่วนที่ขึ้นกับสถานะ (กรอบหรือปุ่มที่มีโฟกัสอาจหายไปกับสถานะใหม่ ดู keepFocus) */
  function afterChange() { const had = document.activeElement; draw(); syncView(); refresh(); keepFocus(had); }

  /* ── ประวัติ เลิกทำ ทำซ้ำ ──────────────────────────────────────────────
   * ‼️ บันทึกก่อนเปลี่ยน (push-before) เป็นกลุ่มตาม {ชนิด, หน้า} รอบตรวจแย้ง S6 AK-10 AK-11
   *   ลูกศรรัว ๆ รวมเป็นก้าวเดียว กลุ่มปิดเมื่อเงียบ 500 มิลลิวินาที (ตัวจับเวลาแค่ปิดกลุ่ม ไม่เขียนสถานะ)
   *   ช่อง มม. หนึ่งรอบโฟกัสเป็นหนึ่งก้าวแม้พิมพ์ช้า ปิดกลุ่มตอน change
   *   คลิกโดยไม่ขยับหรือลากพลาดไม่นับเป็นก้าว กลุ่มที่จบแล้วเท่าเดิม (สลับโหมดไปกลับ) ก็ไม่นับ */
  function closeGroup() {
    clearTimeout(hist.timer);
    hist.timer = 0;
    const g = hist.group;
    hist.group = null;
    if (!g) return;
    const top = hist.undo[hist.undo.length - 1];
    if (top === g.snap && keyOf(top) === keyOf(S)) hist.undo.pop();
  }
  function remember(kind, page, timed) {
    const g = hist.group;
    if (kind && g && g.kind === kind && g.page === page) {
      if (timed) armGroup();
      return;
    }
    closeGroup();
    hist.undo.push(S);
    if (hist.undo.length > HIST_MAX) hist.undo.shift();
    hist.redo.length = 0;
    if (kind) { hist.group = { kind, page, snap: S }; if (timed) armGroup(); }
  }
  function armGroup() {
    clearTimeout(hist.timer);
    hist.timer = setTimeout(() => { closeGroup(); syncView(); }, GROUP_MS);
  }
  /** ตั้งสถานะใหม่ทั้งก้อนพร้อมบันทึกก้าวย้อนกลับ */
  function commit(next, kind = null, page = -1, timed = false) {
    if (next === S) return false;
    remember(kind, page, timed);
    S = next;
    ver++;
    afterChange();
    return true;
  }
  /** ตั้งกรอบของหน้า i (กรอบเดียว = กรอบของทุกหน้า) ไม่เปลี่ยนจริง = ไม่บันทึกก้าว */
  function setFrameAt(i, f, kind = null, timed = false) {
    const was = S.mode === "single" ? S.base : cropOf(S, i, i);
    if (sameFrame(was, f)) return false;
    if (S.mode === "single") return commit({ ...S, base: f }, kind, i, timed);
    const own = new Map(S.own);
    own.set(i, f);
    return commit({ ...S, own }, kind, i, timed);
  }
  /** หน้าเดียวที่ต่างกันระหว่างสองสถานะของโหมดแยก (-1 = ไม่ใช่โหมดแยก หรือเปลี่ยนหลายหน้า) */
  function changedPage(a, b) {
    if (a.mode !== "each" || b.mode !== "each" || a.scope !== b.scope || a.one !== b.one || !sameFrame(a.base, b.base)) return -1;
    let hit = -1;
    for (const i of new Set([...a.own.keys(), ...b.own.keys()])) {
      if (a.own.has(i) === b.own.has(i) && sameFrame(cropOf(a, i, i), cropOf(b, i, i))) continue;
      if (hit >= 0) return -1;
      hit = i;
    }
    return hit;
  }
  function step(dir) {
    if (!pdf || !pageSize || locked()) return;
    closeGroup();
    const from = dir < 0 ? hist.undo : hist.redo, to = dir < 0 ? hist.redo : hist.undo;
    if (!from.length) return;
    const prev = S;
    S = from.pop();
    to.push(prev);
    if (to.length > HIST_MAX) to.shift();
    ver++;
    /* ‼️ โหมดแยกทีละหน้า เลิกทำการแก้ของหน้าอื่นแล้วจอไม่เปลี่ยนเลย คนจะคิดว่าเลิกทำไม่ทำงาน (UX-15e)
       จึงพาไปหน้าที่เปลี่ยน และบอกเลขหน้าผ่านแถบสถานะ */
    const pg = changedPage(prev, S);
    undoNote = pg < 0 ? null : { ver, page: pg, text: dir < 0 ? tr(`ย้อนการแก้ที่หน้า ${pg + 1} แล้ว `, `Undid a change on page ${pg + 1}. `)
                                                               : tr(`ทำซ้ำการแก้ที่หน้า ${pg + 1} แล้ว `, `Redid a change on page ${pg + 1}. `) };
    afterChange();
    if (pg >= 0 && pg !== pageSize.i) goPage(pg);
    else if (S.mode === "single" && S.scope === "one" && prev.mode === "each" && prev.scope === "one" && prev.one !== pageSize.i) {
      goPage(prev.one);                        // ย้อนหรือทำซ้ำการออกจากโหมดแยก ผลต้องอยู่หน้าเดิม (ดู setMode)
    }
  }
  /* ‼️ ตัวรับคีย์อยู่ที่ document ไม่ใช่ที่เครื่องมือ (รอบตรวจแย้ง AK-01)
     คลิกพื้นเทาหรือกดปุ่มบน Safari แล้วโฟกัสไปอยู่ที่ body ตัวรับที่ผูกกับเครื่องมือจะไม่ได้ยินเลย
     ด่าน: เครื่องมือยังต่ออยู่ (หน้าเครื่องมือถูกเก็บไว้ในแคชตอนออกไปหน้าอื่น), เป้าเป็น body หรืออยู่ในเครื่องมือ,
     ไม่ได้พิมพ์ในช่อง (Ctrl+Z ในช่องเป็นของช่องเอง), ไม่มีกล่องโต้ตอบหรือกล่องรหัสค้าง, ไม่ล็อก
     ‼️ ยกเว้นช่อง มม. ที่ผูกกับกรอบ ใช้ประวัติของเครื่องมือ (วัดจริง 02/10/2026: ปล่อยให้ Chrome ย้อนเอง
        Ctrl+Z ในช่องล่างไปย้อนช่องบนทีละตัวเลขแล้วย้ายโฟกัสไปช่องบน กรอบกระโดดไปค่าที่ไม่เคยตั้งใจ)
        กดในช่อง มม. จึงย้อนทั้งรอบที่พิมพ์ในก้าวเดียว เหมือนกดที่ไหนก็ได้ในเครื่องมือ แล้วเขียนค่าจริงคืนทุกช่อง
     ‼️ แป้นไทยกด Ctrl กับปุ่ม Z ได้ key เป็น ผ จึงดู code ด้วย ส่วน Cmd+Y บน Mac เป็นประวัติของเบราว์เซอร์ ห้ามแย่ง
     ‼️ รีวิวหลังทำ F7: ช่องเลขหน้าใช้ประวัติของเครื่องมือเหมือนช่อง มม. (เดิมปล่อยให้ Chrome ย้อนเอง
        ประวัติพิมพ์ร่วมทั้งหน้าพาโฟกัสกระโดดไปช่อง มม. แล้วไม่มีอะไรถูกย้อน ต้องกดซ้ำในช่องนั้นอีกที) */
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || "");
  const typing = (t) => !!t && t.nodeType === 1 && (t.isContentEditable || t.tagName === "TEXTAREA"
    || (t.tagName === "INPUT" && !/^(radio|checkbox|button|submit|reset|range|color|file)$/i.test(t.type)));
  function onUndoKey(ev) {
    if (!ws.wrap.isConnected || !(ev.ctrlKey || ev.metaKey) || ev.altKey || ev.isComposing) return;
    const t = ev.target;
    if (!(t === document.body || t === document.documentElement || ws.wrap.contains(t))) return;
    const inMm = !!(t && t.matches && t.matches(".cr-mm input"));
    const inBox = inMm || t === pageIn;
    if ((typing(t) && !inBox) || document.querySelector("dialog[open], .pw-box")) return;
    const k = /^[a-z]$/i.test(ev.key) ? ev.key.toLowerCase() : ev.code === "KeyZ" ? "z" : ev.code === "KeyY" ? "y" : "";
    let dir = 0;
    if (k === "z") dir = ev.shiftKey ? 1 : -1;
    else if (k === "y" && ev.ctrlKey && !ev.metaKey && !ev.shiftKey && !isMac) dir = 1;
    if (!dir) return;
    if (inBox) ev.preventDefault();            // ห้ามให้ Chrome ย้อนตัวเลขทีละตัวเอง แม้ตอนที่เครื่องมือย้อนไม่ได้
    if (!pdf || locked()) return;
    ev.preventDefault();
    step(dir);
    if (inMm) syncInputs(true);                // ช่องที่มีโฟกัสถูกข้ามตอนซิงก์ปกติ ต้องเขียนค่าที่ย้อนแล้วให้เห็นด้วย
    if (t === pageIn) pageIn.value = String(cur + 1);   // เลขที่พิมพ์ค้างไว้ยังไม่ได้กด Enter ทิ้งไปพร้อมการย้อน
  }
  document.addEventListener("keydown", onUndoKey);

  /* ── ช่องระยะขอบ มม. ──────────────────────────────────────────────── */
  const edgeLen = (k) => (k === "top" || k === "bottom" ? pageSize.h : pageSize.w);
  function marginOf(f, k) {
    if (k === "left") return f.x;
    if (k === "top") return f.y;
    if (k === "right") return 1 - f.x - f.w;
    return 1 - f.y - f.h;
  }
  /** ‼️ ข้ามช่องที่ผู้ใช้กำลังพิมพ์อยู่ ไม่งั้นพิมพ์ 1 จะโดนเขียนทับเป็น 1.0 ก่อนพิมพ์ตัวถัดไปทัน */
  function syncInputs(force) {
    const f = frameShown();
    /* ‼️ รีวิวหลังทำ S1: เลิกทำในช่อง มม. ที่พาไปหน้าอื่น เดิมซิงก์ก่อนหน้าใหม่มาถึง แล้วรอบหลังข้ามช่องที่มีโฟกัส
       ช่องนั้นค้างค่าของหน้าเก่า (ซ้าย 50 ทั้งที่หน้าใหม่ 10.5) กดลูกศรต่อ กรอบหน้าใหม่กระโดดไปราว 40 มม.
       หน้าเปลี่ยนเมื่อไร เขียนทุกช่องรวมช่องที่มีโฟกัส (เปลี่ยนหน้าระหว่างพิมพ์ทำได้ทางเดียวคือเลิกทำในช่องนั้นเอง) */
    const moved = !!pageSize && pageSize.i !== mmPage;
    mmPage = pageSize ? pageSize.i : -1;
    for (const [k, inp] of Object.entries(mmIn)) {
      inp.disabled = !pageSize || !!job || preview;
      if (!force && !moved && document.activeElement === inp) continue;
      inp.value = f && pageSize ? String(Math.round(marginOf(f, k) * edgeLen(k) * MM_PER_PT * 10) / 10) : "";
      inp.removeAttribute("aria-invalid");
    }
  }
  function setMsg(t) { setText(mmMsg, t); }
  /** ระยะมากสุดที่ใส่ได้ คิดจากขอบฝั่งตรงข้ามที่เป็นอยู่ตอนนี้ (กรอบต้องเหลืออย่างน้อย 2%) */
  function maxMm(k) {
    const c = frameShown() || FULL;
    const far = k === "left" ? c.x + c.w : k === "right" ? 1 - c.x : k === "top" ? c.y + c.h : 1 - c.y;
    return Math.max(0, Math.floor((far - MIN) * edgeLen(k) * MM_PER_PT * 10) / 10);
  }
  function badMsg(k, v, back) {
    const tail = back ? tr(" จึงคืนค่าเดิมให้", ", so the old value is back") : "";
    if (!Number.isFinite(v) || v < 0) return tr(`ใส่ได้เฉพาะตัวเลขตั้งแต่ 0 ขึ้นไป${tail}`, `Use a number from 0 up${tail}`);
    return tr(`ขอบ${LABEL[k]}ใส่ได้ไม่เกิน ${maxMm(k)} มม.${tail}`, `${LABEL[k]} can be at most ${maxMm(k)} mm${tail}`);
  }
  function onMargin(k, ev) {
    if (!pageSize || editLocked()) return;
    /* ‼️ วัดจริง 02/10/2026: Chrome ใช้ประวัติการพิมพ์ร่วมกันทั้งหน้า กด Ctrl+Z ในช่องอื่น (เช่นช่องเลขหน้า)
       Chrome ไปย้อนตัวเลขในช่อง มม. ทีละตัว แล้วย้ายโฟกัสมาช่องนั้นเอง ได้ค่าครึ่งทางที่ผู้ใช้ไม่เคยตั้งใจ (15 กลายเป็น 1)
       ช่อง มม. ใช้ประวัติของเครื่องมือแทน (ดู onUndoKey) การย้อนของเบราว์เซอร์ที่หลุดมาจึงไม่นับ คืนค่าจริงให้ช่อง */
    if (ev && /^history/.test(ev.inputType || "")) { syncInputs(true); return; }
    const inp = mmIn[k];
    const raw = inp.value.trim();
    if (raw === "") { inp.removeAttribute("aria-invalid"); setMsg(""); return; }   // ลบเพื่อพิมพ์ใหม่ ยังไม่ต้องทำอะไร
    const v = Number(raw);
    const c = frameShown() || FULL;   // ยังไม่มีกรอบ เริ่มจากเต็มหน้า
    let L = c.x, T = c.y, R = c.x + c.w, B = c.y + c.h;
    const r = v / MM_PER_PT / edgeLen(k);
    if (k === "left") L = r; else if (k === "right") R = 1 - r; else if (k === "top") T = r; else B = 1 - r;
    const ok = Number.isFinite(v) && v >= 0 && R - L >= MIN - 1e-9 && B - T >= MIN - 1e-9;
    inp.setAttribute("aria-invalid", String(!ok));
    if (!ok) { setMsg(badMsg(k, v, false)); return; }
    setFrameAt(pageSize.i, { x: L, y: T, w: R - L, h: B - T }, "mm");
  }
  function onMarginDone(k) {
    const inp = mmIn[k];
    const bad = inp.getAttribute("aria-invalid") === "true";
    const v = Number(inp.value.trim());
    if (hist.group && hist.group.kind === "mm") { closeGroup(); syncView(); }   // จบรอบโฟกัส = จบหนึ่งก้าว
    syncInputs(true);
    /* คืนค่าเดิมเงียบ ๆ ผู้ใช้จะงงว่าทำไมตัวเลขเปลี่ยนเอง
       ‼️ รีวิวหลังทำ S2: ใส่ไฟล์ใหม่ตอนค่าผิดค้างอยู่ ช่องเสียโฟกัสหลังหน้าเก่าถูกล้างแล้ว ไม่มีหน้าให้คิดเพดาน (TypeError) */
    if (bad && pageSize) setMsg(badMsg(k, v, true));
  }

  function placeFrame() {
    if (!pageSize || editLocked()) return;
    settle();
    setFrameAt(pageSize.i, { x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
    keepBox.focus();                           // พร้อมกดลูกศรปรับต่อทันที
  }
  function clearFrame(moveFocus) {
    if (!pageSize || editLocked()) return;
    endGesture();
    setFrameAt(pageSize.i, null);
    draw(); refresh();
    /* กรอบหายไปแล้ว โฟกัสต้องมีที่ไป ไม่งั้นหลุดไปทั้งหน้า (ปุ่มวางกรอบอาจถูกพับอยู่ ไปปุ่ม อีก N ปุ่ม แทน) */
    if (moveFocus) focusFirst([placeBtn, moreBtn, pageIn]);
  }

  /* ── โหมด ขอบเขต และคัดลอกกรอบ ───────────────────────────────────────── */
  function setMode(m) {
    if ((m !== "single" && m !== "each") || m === S.mode) return;
    if (!pdf || editLocked()) { modeSeg.value = S.mode; return; }
    settle();
    const next = { ...S, mode: m };
    if (m === "each" && S.scope === "one" && pageSize) next.one = pageSize.i;   // ผูก หน้าที่เห็นอยู่ ไว้กับหน้านี้
    commit(next, "mode", -1, true);
    /* ‼️ รีวิวหลังทำ S6: กลับเป็นกรอบเดียวที่ขอบเขต หน้าที่เห็นอยู่ ผลจะตามหน้าที่เปิดอยู่ตอนนั้น
       อยู่หน้า 4 แล้วกด กรอบเดียว กรอบย้ายจากหน้า 2 ไปหน้า 4 เงียบ ๆ จึงพากลับไปหน้าที่ผูกไว้ ไฟล์ได้ผลเท่าเดิม */
    if (m === "single" && S.scope === "one" && pageSize && S.one !== pageSize.i) goPage(S.one);
  }
  function setScope(v) {
    if (v === S.scope) return;
    if (!pdf) { S = { ...S, scope: v }; refresh(); return; }
    if (editLocked()) { applySel.value = S.scope; return; }
    settle();
    commit({ ...S, scope: v }, "scope", -1, true);
  }
  function copyAll() {
    if (!pageSize || editLocked() || S.mode !== "each") return;
    settle();
    const f = frameShown();
    if (!f) return;
    let changed = 0;
    for (let i = 0; i < pageCount; i++) if (!sameFrame(cropOf(S, i, i), f)) changed++;
    if (!changed) { st.info(tr("ทุกหน้าใช้กรอบนี้อยู่แล้ว", "Every page already uses this frame")); return; }
    commit({ ...S, base: f, own: new Map(), scope: "all" });
    st.info(tr(`คัดลอกกรอบนี้ไปแล้ว ${changed} หน้า`, `Copied this frame to ${pl(changed, "page", "pages")}`));
  }
  function copyPar() {
    if (!pageSize || editLocked() || S.mode !== "each") return;
    settle();
    const f = frameShown();
    if (!f) return;
    const own = new Map(S.own);
    let changed = 0;
    for (let i = pageSize.i % 2; i < pageCount; i += 2) {
      if (!sameFrame(cropOf(S, i, i), f)) changed++;
      own.set(i, f);
    }
    /* ‼️ รีวิวหลังทำ X8: เดิมใช้ข้อความของคัดลอกไปทุกหน้า บอกว่าทุกหน้าใช้กรอบนี้แล้ว ทั้งที่หน้าฝั่งตรงข้ามยังต่างกันได้ */
    if (!changed) {
      st.info(pageSize.i % 2 === 0 ? tr("หน้าคี่ทุกหน้าใช้กรอบนี้อยู่แล้ว", "All odd pages already use this frame")
                                   : tr("หน้าคู่ทุกหน้าใช้กรอบนี้อยู่แล้ว", "All even pages already use this frame"));
      return;
    }
    commit({ ...S, own });
    st.info(tr(`คัดลอกกรอบนี้ไปแล้ว ${changed} หน้า`, `Copied this frame to ${pl(changed, "page", "pages")}`));
  }

  /* ── ดูผลหลังตัด ─────────────────────────────────────────────────────── */
  function setPreview(on) {
    on = !!on;
    if (on === preview) return;
    if (on && (!pdf || !pageSize || job || resultState() || !anyCrop())) return;
    settle();
    const had = document.activeElement;      // ลิงก์ แก้กรอบต่อ ที่เพิ่งกดถูกซ่อนตอนออก (รีวิวหลังทำ F3)
    if (on) { pvKeep = { fit, zoom }; fit = "page"; }
    else if (pvKeep) { fit = pvKeep.fit; zoom = pvKeep.zoom; }
    preview = on;
    if (!on) pvKeep = null;
    pvBtn.setAttribute("aria-pressed", String(on));
    stage.classList.toggle("cr-pv", on);
    if (fit) zoom = fitZoom(fit);
    viewCanvas.style.visibility = "hidden";   // ภาพเก่าเป็นคนละส่วนกับที่จะแสดง ยืดแล้วเพี้ยนรูป รอภาพใหม่
    layout(); draw(); syncView(); refresh(); syncEsc(); scheduleFold();
    keepFocus(had);
    const doc = pdf;
    rendered = 0;
    renderPage().catch((e) => { if (doc === pdf) fail(e); });
  }

  /* ── ตัดขอบขาวอัตโนมัติ ─────────────────────────────────────────────────
   * ‼️ รอบตรวจแย้งเฟส 3: กรอบเดียวที่ใช้หลายหน้า = รวมกล่องของทุกหน้าในขอบเขต ไม่ใช่กล่องของหน้าที่เห็น
   *    (ใช้กล่องของหน้าเดียวกับทุกหน้า เนื้อหาหน้าอื่นที่ยาวกว่าโดนตัดเงียบ ๆ)
   *   หน้าว่างไม่นำมาคิด หน้าที่เนื้อหาชนขอบ ขอบไม่ขาว หรืออ่านไม่ได้ ทำให้กรอบเดียวตัดไม่ได้ ต้องหยุดแล้วบอกเลขหน้า
   *   ไล่หน้าที่เห็นก่อน แล้วหน้าแรก หน้าสุดท้าย (เจอปัญหาเร็ว) รวมแล้วชนขอบครบสี่ด้านก็หยุดได้เลย
   *   งานนี้ล็อกแบบเดียวกับบันทึก กดหยุด = กรอบเดิม ลงสถานะครั้งเดียวตอนจบ (เลิกทำทีเดียวกลับหมด) */
  /* ‼️ รีวิวหลังทำ X5: ข้อความผลต่อกันหลายท่อน รายชื่อหน้าจึงยกมาแค่ 3 หน้า ข้อความทั้งก้อนจะได้ไม่ยาวเกินอ่าน */
  const pagesText = (arr) => (arr.length <= 3 ? arr.map((i) => i + 1).join(", ")
    : arr.slice(0, 3).map((i) => i + 1).join(", ") + tr(` และอีก ${arr.length - 3} หน้า`, ` and ${arr.length - 3} more`));
  const allEdges = (u) => u.x <= 1e-6 && u.y <= 1e-6 && u.x + u.w >= 1 - 1e-6 && u.y + u.h >= 1 - 1e-6;
  async function analyse(doc, i, tc, ctx, stale) {
    let page = null;
    try {
      page = await doc.getPage(i + 1);
      if (stale() || st.cancelled) return { status: "cancelled" };
      const v1 = page.getViewport({ scale: 1 });
      const s = Math.min(2, Math.max(Math.sqrt(TRIM_PX / (v1.width * v1.height)), (TRIM_PXMM * 25.4) / 72),
                         TRIM_DIM / Math.max(v1.width, v1.height));
      const v = page.getViewport({ scale: s });
      const w = Math.max(1, Math.floor(v.width)), h = Math.max(1, Math.floor(v.height));
      tc.width = w; tc.height = h;             // ตั้งขนาดใหม่ = ล้างผืนไปในตัว
      /* ‼️ ค่าเริ่มต้นของ pdf.js (พื้นขาว วาดตรายางกับหมายเหตุที่เห็นบนจอด้วย) ของที่ผู้ใช้เห็นต้องไม่ถูกตัด */
      const t = page.render({ canvasContext: ctx, viewport: v });
      trimTask = t;
      /* กดหยุดต้องหยุดหน้าที่กำลังวาดด้วย ไม่ใช่รอให้วาดจบ (หน้าสแกนใหญ่วาดนานเป็นวินาที) */
      const poll = setInterval(() => { if (st.cancelled || stale()) { try { t.cancel(); } catch {} } }, 60);
      try { await t.promise; } finally { clearInterval(poll); if (trimTask === t) trimTask = null; }
      if (stale() || st.cancelled) return { status: "cancelled" };
      const img = ctx.getImageData(0, 0, w, h);
      return contentBox(img.data, w, h, { vpW: v.width, vpH: v.height, pxPerMm: (s * 72) / 25.4 });
    } catch (e) {
      if (e && e.name === "RenderingCancelledException") return { status: "cancelled" };
      return { status: "unreadable" };
    } finally {
      /* ‼️ คืนหน่วยความจำของทุกหน้าที่วิเคราะห์ ยกเว้นหน้าที่แสดงอยู่ ห้าม pdf.cleanup() (ล้างหน้าที่แสดงด้วย) */
      if (page && page !== shownPage) { try { page.cleanup(); } catch {} }
    }
  }
  async function trim(which) {
    if (!pdf || !pageSize || job || preview || resultState()) return;
    settle();
    closeFold(false);
    const doc = pdf, seq = openSeq, s0 = S, shown = pageSize.i, total = pageCount;
    const each = which !== "page" && S.mode === "each";
    const list = which === "page" ? [shown] : [...Array(total).keys()].filter((i) => each || inScope(S.scope, i, shown));
    if (!list.length) { st.info(tr("ไม่มีหน้าในขอบเขตที่เลือก", "No pages in the chosen range")); return; }
    const inList = new Set(list);
    const order = [...new Set([shown, list[0], list[list.length - 1], ...list])].filter((i) => inList.has(i));
    const back = document.activeElement;
    const myJob = ++jobSeq;
    const stale = () => seq !== openSeq || myJob !== jobSeq;
    job = "scan";
    ws.setBusy(true);
    st.begin();
    st.info(tr("กำลังหาขอบขาว…", "Finding white margins…"));
    syncView(); refresh();
    const tc = document.createElement("canvas");
    const ctx = tc.getContext("2d", { willReadFrequently: true });
    const res = new Map();
    let union = null, stopAt = null, done = 0;
    try {
      for (const i of order) {
        if (st.cancelled || stale()) break;
        const r = await analyse(doc, i, tc, ctx, stale);
        if (stale()) return;                   // เปลี่ยนไฟล์ระหว่างทาง เงียบไปเลย ไฟล์ใหม่ไม่เกี่ยว
        if (st.cancelled || r.status === "cancelled") break;
        res.set(i, r);
        done++;
        if (!each && which !== "page") {
          if (r.status === "ok") {
            union = unionBox(union, r.box);
            if (allEdges(union)) { stopAt = { why: "edges" }; break; }
          } else if (r.status !== "blank") { stopAt = { why: r.status, page: i }; break; }
        }
        st.progress((done / order.length) * 100, `(${done}/${order.length})`);
        await yieldToBrowser();
      }
      if (stale()) return;
      st.end();
      st.progress(null);
      if (st.cancelled) { st.info(tr("หยุดตามที่สั่งแล้ว กรอบเหมือนเดิม", "Stopped as asked. The frame is unchanged")); return; }
      if (S !== s0) return;                    // กันไว้ก่อน ระหว่างหาขอบแก้อะไรไม่ได้อยู่แล้ว
      const blanks = order.filter((i) => res.get(i) && res.get(i).status === "blank").sort((a, b) => a - b);
      /* ‼️ รีวิวหลังทำ X5: ท่อนภาษาอังกฤษต้องจบประโยคเอง เดิมต่อกันเป็น press Undo Blank pages left out ไม่มีจุดคั่น */
      const blankNote = blanks.length ? tr(`หน้าว่าง ${pagesText(blanks)} ไม่นำมาคิด`,
        `${blanks.length === 1 ? "Blank page" : "Blank pages"} left out: ${pagesText(blanks)}.`) : "";
      const unchanged = tr("ไม่พบขอบขาวให้ตัด กรอบยังเป็นแบบเดิม", "No white margins to trim. The frame is unchanged");
      /* เหตุที่ตัดไม่ได้ บอกเลขหน้าเสมอเมื่อไม่ใช่หน้าที่เห็นอยู่ คนจะได้ไปดูถูกหน้า */
      const one = list.length === 1;
      const whyText = (why, p) => {
        if (why === "blank") return p === shown ? tr("หน้านี้ว่างเปล่า ไม่มีอะไรให้ตัด", "This page is blank, nothing to trim")
          : tr(`หน้า ${p + 1} ว่างเปล่า ไม่มีอะไรให้ตัด`, `Page ${p + 1} is blank, nothing to trim`);
        if (why === "full") return one ? unchanged
          : tr(`หน้า ${p + 1} มีเนื้อหาถึงขอบกระดาษ กรอบเดียวจึงตัดไม่ได้ ลองเลือก แยกทีละหน้า`, `Page ${p + 1} has content up to the edge, so one frame can't be trimmed. Try Per page`);
        if (why === "nowhite") {
          if (one && p === shown) return tr("ขอบหน้านี้ไม่ใช่สีขาว จึงตัดอัตโนมัติไม่ได้ ลากกรอบเองได้", "This page's edges aren't white, so it can't be trimmed automatically. Drag a frame instead");
          return one ? tr(`ขอบหน้า ${p + 1} ไม่ใช่สีขาว จึงตัดอัตโนมัติไม่ได้ ลากกรอบเองได้`, `Page ${p + 1} has no white edges, so it can't be trimmed automatically. Drag a frame instead`)
            : tr(`ขอบหน้า ${p + 1} ไม่ใช่สีขาว กรอบเดียวจึงตัดอัตโนมัติไม่ได้ ลองเลือก แยกทีละหน้า`, `Page ${p + 1} has no white edges, so one frame can't be trimmed. Try Per page`);
        }
        return tr(`อ่านหน้า ${p + 1} ไม่ได้ จึงตัดอัตโนมัติไม่ได้ กรอบยังเป็นแบบเดิม`, `Couldn't read page ${p + 1}, so nothing was trimmed. The frame is unchanged`);
      };
      if (which === "page") {
        const r = res.get(shown);
        if (!r) return;
        if (r.status !== "ok") { st.info(whyText(r.status, shown)); return; }
        setFrameAt(shown, clampFrame(r.box));
        st.ok(tr("ตัดขอบขาวหน้านี้แล้ว ปรับกรอบต่อได้", "Trimmed this page. Adjust the frame if needed"));
        return;
      }
      if (each) {
        /* ทุกหน้าได้ค่าชัดเจน กรอบของตัวเอง หรือไม่ตัด (ไม่มีหน้าไหนค้างอิงกรอบเดียวแบบเงียบ ๆ)
           ‼️ รีวิวหลังทำ T2: หน้าที่หาขอบไม่ได้ (ขอบไม่ขาว อ่านไม่ออก) คงค่าเดิมพร้อมบอกเลขหน้า เดิมถอดกรอบทิ้งเงียบ ๆ
              นับหน้าที่ถูกแทนจากกรอบที่ใช้จริงก่อนหน้า รวมกรอบที่มาจาก กรอบเดียว ด้วย (เดิมนับเฉพาะกรอบที่ตั้งแยก
              กรอบเดียวกันจึงได้ข้อความต่างกันตามว่าวางมาทางไหน) */
        /* นับแยกสามแบบ หน้าที่ตัดขอบขาวได้, หน้าที่ผลคือไม่ตัด, หน้าที่คงค่าเดิม (ถ้านับหน้าที่คงไว้เป็น ตัดขอบขาวแล้ว
           ข้อความจะบอกว่าตัดครบทุกหน้า ทั้งที่ท่อนถัดไปบอกว่าหน้านั้นหาขอบไม่ได้) */
        const own = new Map(), kept = [];
        let trimmed = 0, uncut = 0, replaced = 0;
        for (let i = 0; i < total; i++) {
          const r = res.get(i), was = cropOf(s0, i, i);
          let f = null;
          if (r && r.status === "ok") { f = clampFrame(r.box); trimmed++; }
          else if (!r || r.status === "nowhite" || r.status === "unreadable") { f = was; kept.push(i); }
          own.set(i, f);
          if (!f) uncut++;
          if (was && !sameFrame(was, f)) replaced++;
        }
        const next = { ...s0, own };
        if (keyOf(next) !== keyOf(s0)) commit(next);
        st.ok([
          tr(`ตัดขอบขาวแล้ว ${trimmed} หน้า ไม่ตัด ${uncut} หน้า`, `Trimmed ${pl(trimmed, "page", "pages")}, ${uncut} left whole.`),
          replaced ? tr(`แทนกรอบเดิม ${replaced} หน้า`, `Replaced ${pl(replaced, "earlier frame", "earlier frames")}.`) : "",
          kept.length ? tr(`หน้า ${pagesText(kept)} หาขอบไม่ได้ คงไว้แบบเดิม`,
                           `${kept.length === 1 ? "Page" : "Pages"} ${pagesText(kept)} had no clear edges and stayed as before.`) : "",
          blankNote,
        ].filter(Boolean).join(" "));
        return;
      }
      if (stopAt && stopAt.why !== "edges") { st.info(whyText(stopAt.why, stopAt.page)); return; }
      if (!union) {
        /* ‼️ รีวิวหลังทำ X9: หน้าเดียวที่ว่าง เดิมขึ้นว่า หน้าที่เลือกว่างเปล่าทั้งหมด และไม่บอกเลขหน้า */
        st.info(one ? whyText("blank", list[0]) : tr("หน้าที่เลือกว่างเปล่าทั้งหมด กรอบยังเป็นแบบเดิม", "The chosen pages are all blank. The frame is unchanged"));
        return;
      }
      if (stopAt || allEdges(union)) { st.info(unchanged); return; }
      const f = clampFrame(union);
      if (!sameFrame(s0.base, f)) commit({ ...s0, base: f });
      /* ข้อความหน้าว่างอยู่กลาง ไม่ต่อท้ายคำว่า เลิกทำ (ภาษาไทยไม่มีจุดคั่น ต่อท้ายแล้วอ่านเป็น กด เลิกทำ หน้าว่าง) */
      st.ok([tr("ตัดขอบขาวให้แล้ว", "White margins trimmed."), blankNote,
             tr("ปรับกรอบต่อได้ หรือกด เลิกทำ", "Adjust the frame or press Undo.")].filter(Boolean).join(" "));
    } catch (e) {
      if (stale()) return;
      st.end();
      st.progress(null);
      fail(e);
    } finally {
      tc.width = tc.height = 0;
      if (myJob === jobSeq) {
        job = null;
        ws.setBusy(false);
        syncView(); refresh();
        /* มือถือ: ปุ่มอยู่ในแผ่นตัวเลือกที่บังหน้ากระดาษ ปิดให้เห็นผลทันที ข้อความผลอยู่แถบล่างที่ยังเห็น
           ‼️ รีวิวหลังทำ T3: ปิดเฉพาะตอนกรอบเปลี่ยนจริง ตัดไม่ได้หรือกดหยุด แผ่นต้องค้างไว้ให้อ่านเหตุแล้วลองใหม่
              ปุ่มที่กดอาจหายไปแล้ว (ลิงก์ตัดขอบขาวซ่อนเมื่อมีกรอบ ปุ่มในแผ่นที่ปิด) โฟกัสเดิมหลุดไป BODY ส่งต่อให้กรอบ */
        if (S !== s0 && ws.setSheet) ws.setSheet(false);
        keepFocus(back);
      }
    }
  }

  /* ── คีย์บอร์ดที่กรอบ ───────────────────────────────────────────────── */
  keepBox.addEventListener("keydown", (ev) => {
    const f = frameShown();
    if (!f || !pageSize || editLocked()) return;
    if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); clearFrame(true); return; }
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
    if (!d) return;
    ev.preventDefault();
    const stp = ev.shiftKey ? 10 : 1;          // พอยต์ ตรงกับหน่วยที่ PDF ใช้จริง
    setFrameAt(pageSize.i, moveOrResize(f, ev.altKey ? "se" : "move", (d[0] * stp) / pageSize.w, (d[1] * stp) / pageSize.h),
               "arrow", true);
  });

  /* ── ท่าลากที่ค้างอยู่ ─────────────────────────────────────────────────
   * ‼️ Esc ระหว่างลาก = ยกเลิกท่านั้น ไม่ใช่ออกจากเครื่องมือ (บั๊กเจอ 02/10/2026)
   *    Esc ของทั้งเว็บพากลับหน้าแรก หน้าเครื่องมือถูกถอดออกกลางท่า ไม่มีวันได้ยิน pointerup
   *    กลับมาอีกทีแค่ชี้เมาส์ผ่าน กรอบก็วิ่งตาม ดักที่ window ขาจับ ซึ่งมาก่อนตัวดักของทั้งเว็บ
   *    ติดตั้งเฉพาะตอนมีของให้ Esc ปิด (ท่าค้าง แผงพับที่กาง ดูผลหลังตัด) ไม่งั้น Esc ตอนปกติจะไม่พากลับหน้าแรก
   *    ลำดับ: ท่าค้างก่อน แล้วแผงพับ แล้วดูผล (ปิดของที่อยู่บนสุดก่อน) */
  let escOn = false;
  function onEscCap(ev) {
    if (ev.key !== "Escape" || !ws.wrap.isConnected) return;
    if (drag || start) {
      ev.preventDefault(); ev.stopPropagation();
      endGesture(); draw(); refresh();
      return;
    }
    /* แผ่นตัวเลือกบนมือถือหรือเมนูรวมเครื่องมือเปิดอยู่ (อยู่บนสุด) ให้เปลือกหน้าปิดของมันก่อน
       ‼️ รีวิวหลังทำ F5: เดิมเช็กเฉพาะตอนดูผล แผงพับที่กางค้างใต้เมนูถูกปิดก่อน แล้วดึงโฟกัสออกจากเมนูที่ยังเปิดอยู่ */
    const menuPanel = document.getElementById("toolmenupanel");
    if ((foldOpen || preview) && (document.querySelector(".s2-side.open") || (menuPanel && !menuPanel.hidden))) return;
    if (foldOpen) {
      ev.preventDefault(); ev.stopPropagation();
      closeFold(false);                        // คืนโฟกัสให้ อีก N ปุ่ม เฉพาะตอนโฟกัสอยู่ในแผง (closeFold ดูให้) ไม่ดึงจากที่อื่น
      return;
    }
    if (preview) {
      ev.preventDefault(); ev.stopPropagation();
      setPreview(false);
    }
  }
  function syncEsc() {
    const want = !!(drag || start || foldOpen || preview);
    if (want && !escOn) { window.addEventListener("keydown", onEscCap, true); escOn = true; }
    else if (!want && escOn) { window.removeEventListener("keydown", onEscCap, true); escOn = false; }
  }
  /** ทิ้งท่าที่ค้าง (ร่างหายไปด้วย สถานะไม่เปลี่ยน) */
  function endGesture() {
    drag = null; start = null; drawId = null; origin = null; pan = null; draft = null;
    syncEsc();
  }
  /** ‼️ ก่อนเปลี่ยนหน้า เลิกทำ สลับโหมด ดูผล หาขอบ คัดลอก หรือบันทึก ท่าที่ค้างต้องจบก่อน (เหมือนปล่อยเมาส์ตรงนั้น)
   *    ไม่งั้นร่างของหน้าเก่าไปลงหน้าใหม่ หรือหลุดจากสิ่งที่บันทึก */
  function settle() {
    if (drag) commitDrag();
    else if (start) finishDraw(false);
  }

  /* ── ลากกรอบ: ในกรอบ = ย้าย, มือจับ = ปรับขนาด ───────────────────────
   * ‼️ คิดระยะเป็นสัดส่วนของหน้าจากตำแหน่งจริงทุกครั้งที่ขยับ ไม่ใช่ระยะพิกเซลจากตอนกด
   *    เลื่อนหรือซูมกลางท่า (ล้อเมาส์ขณะกดค้าง) กรอบต้องยังติดปลายเมาส์ เดิมหลุดห่างไปตามระยะที่เลื่อน */
  const relRaw = (ev) => {
    const r = stage.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height };
  };
  keepBox.addEventListener("pointerdown", (ev) => {
    const f = frameShown();
    if (!f || ev.button > 0 || nav || pan || editLocked()) return;
    ev.preventDefault();
    const h = ev.target.closest(".cr-h");
    drag = { id: ev.pointerId, mode: h ? h.dataset.h : "move", p0: relRaw(ev), o: f };
    draft = { page: pageSize.i, frame: f };
    try { keepBox.setPointerCapture(ev.pointerId); } catch {}
    keepBox.focus({ preventScroll: true });
    syncEsc();
  });
  keepBox.addEventListener("pointermove", (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    /* ปุ่มปล่อยไปแล้วแต่ไม่ได้ยิน pointerup ถือว่าจบท่าตรงนี้ ไม่งั้นแค่ชี้ผ่าน กรอบก็วิ่งตาม */
    if (ev.buttons === 0) { commitDrag(); return; }
    const p = relRaw(ev);
    draft.frame = moveOrResize(drag.o, drag.mode, p.x - drag.p0.x, p.y - drag.p0.y);
    draw();
  });
  function commitDrag() {
    const d = draft;
    endGesture();
    if (d) setFrameAt(d.page, d.frame);        // ไม่ขยับเลย = ไม่มีก้าวใหม่
    draw(); syncView(); refresh();
  }
  const endMove = (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    if (ev.type === "pointercancel") { endGesture(); draw(); refresh(); return; }   // ท่าที่ถูกยกเลิกต้องไม่ทิ้งร่องรอย
    commitDrag();
  };
  keepBox.addEventListener("pointerup", endMove);
  keepBox.addEventListener("pointercancel", endMove);

  /* ── ลากนอกกรอบ = วาดกรอบใหม่ ───────────────────────────────────────── */
  const rel = (ev) => {
    const p = relRaw(ev);
    return { x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) };
  };
  layer.addEventListener("pointerdown", (ev) => {
    if (!pdf || !pageSize || ev.button > 0 || nav || pan || editLocked()) return;
    ev.preventDefault();
    /* ‼️ กด preventDefault แล้วโฟกัสไม่ย้ายเอง ช่อง มม. ที่โฟกัสค้างอยู่จะถูกข้ามตอนซิงก์ค่า
       แล้วโชว์ระยะของกรอบเก่าค้างไว้ช่องเดียว จึงเอาโฟกัสออกจากช่องก่อนเริ่มวาด */
    const a = document.activeElement;
    if (a && a.matches && a.matches(".cr-mm input")) a.blur();
    start = rel(ev); drawId = ev.pointerId;
    origin = frameShown();
    draft = { page: pageSize.i, frame: origin };
    try { layer.setPointerCapture(ev.pointerId); } catch {}
    syncEsc();
  });
  layer.addEventListener("pointermove", (ev) => {
    if (!start || ev.pointerId !== drawId) return;
    if (ev.buttons === 0) { finishDraw(false); return; }
    const p = rel(ev);
    draft.frame = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y),
                    w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
    draw();
  });
  function finishDraw(cancel) {
    /* ‼️ ลากสั้นกว่า 2% มักเป็นการคลิกพลาด คืนกรอบเดิม (รุ่นเดิมลบกรอบทิ้งทั้งกรอบ ต้องวาดใหม่) */
    const d = draft, f = d && d.frame;
    const drew = !cancel && !!f && f !== origin && f.w >= MIN && f.h >= MIN;
    endGesture();
    if (drew) setFrameAt(d.page, f);
    draw();
    if (drew) keepBox.focus({ preventScroll: true });   // วาดเสร็จ กดลูกศรปรับต่อได้เลย
    syncView(); refresh();
  }
  const endDraw = (ev) => {
    if (!start || ev.pointerId !== drawId) return;
    finishDraw(ev.type === "pointercancel");
  };
  layer.addEventListener("pointerup", endDraw);
  layer.addEventListener("pointercancel", endDraw);

  /* ── นิ้วบนหน้ากระดาษ ─────────────────────────────────────────────────
   * ‼️ หน้ากระดาษต้อง touch-action:none ไม่งั้นนิ้วเดียวลากกรอบไม่ได้ (เบราว์เซอร์เอาไปเลื่อนจอ)
   *    ผลข้างเคียงคือบีบนิ้วกับเลื่อนจอของเบราว์เซอร์ใช้ไม่ได้บนหน้ากระดาษ จึงต้องทำเอง
   *    (วัดจริง 02/10/2026 ในโหมดจำลองมือถือ: ไม่มี touch-action:none เบราว์เซอร์เลื่อนจอแล้วส่ง pointercancel)
   *  หน้าพอดีจอ: นิ้วเดียว = เหมือนเมาส์ทุกอย่าง
   *  ‼️ หน้าล้นจอ (ซูมอยู่): นิ้วเดียว = เลื่อนดู ยกเว้นจับมือจับ (รอบตรวจแย้ง 02/10/2026)
   *    เดิมนิ้วเดียวย้ายกรอบเสมอ ตอนซูมกรอบใหญ่กว่าจอ ปัดนิ้วเพื่อดูส่วนอื่นกลายเป็นเลื่อนกรอบไปโดยไม่เห็นขอบ
   *  นิ้วที่สองลงเมื่อไร = ยกเลิกท่าของนิ้วแรก แล้วเป็นซูมกับเลื่อนดู
   *  ‼️ ตอนดูผลหลังตัดยังซูมและเลื่อนดูได้ (ไม่ใช้ inert) ชั้นวาดกับกรอบซ่อนอยู่ จึงแก้อะไรไม่ได้อยู่แล้ว */
  const pair = () => {
    const [a, b] = [...touches.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const startNav = () => { const q = pair(); return { d0: q.d, z0: zoom, x: q.x, y: q.y }; };
  const overflows = () => scroller.scrollWidth > scroller.clientWidth + 4 || scroller.scrollHeight > scroller.clientHeight + 4;
  stage.addEventListener("pointerdown", (ev) => {
    if (ev.pointerType !== "touch" || !pageSize || job) return;
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (touches.size === 1) {
      if (!overflows() || ev.target.closest(".cr-h")) return;
      ev.preventDefault();
      ev.stopPropagation();                    // ไม่ให้ถึงกรอบหรือชั้นวาด
      pan = { id: ev.pointerId };
      try { stage.setPointerCapture(ev.pointerId); } catch {}
      return;
    }
    if (drag || start) { endGesture(); draw(); refresh(); }   // นิ้วที่สองลง ท่าของนิ้วแรกเป็นโมฆะ
    pan = null;
    ev.stopPropagation();                      // นิ้วที่สองขึ้นไปห้ามไปเริ่มท่าที่กรอบหรือชั้นวาด
    nav = touches.size === 2 ? startNav() : null;   // นิ้วที่สามลง พักไว้ก่อน
    try { stage.setPointerCapture(ev.pointerId); } catch {}
  }, true);
  stage.addEventListener("pointermove", (ev) => {
    const p = touches.get(ev.pointerId);
    if (!p) return;
    const dx = ev.clientX - p.x, dy = ev.clientY - p.y;
    p.x = ev.clientX; p.y = ev.clientY;
    if (pan && pan.id === ev.pointerId) {
      scroller.scrollLeft -= dx;
      scroller.scrollTop -= dy;
      return;
    }
    if (!nav || touches.size !== 2) return;
    const q = pair();
    /* ‼️ ซูมเทียบกับตอนเริ่มบีบ ไม่ใช่เทียบรอบก่อน (บั๊กเจอ 02/10/2026)
       เดิมเปลี่ยนน้อยกว่า 0.2% ต่อรอบถูกทิ้งแล้วตั้งฐานใหม่ทุกรอบ บีบช้า ๆ บนจอ 120 Hz จึงไม่ซูมเลย */
    const want = nav.d0 > 0 && q.d > 0 ? nav.z0 * (q.d / nav.d0) : zoom;
    if (Math.abs(want / zoom - 1) > 0.002) {
      fit = null;
      setZoom(want, { x: nav.x, y: nav.y });
      if (Math.abs(zoom - want) > 1e-6) { nav.z0 = zoom; nav.d0 = q.d; }   // ชนเพดานซูม เริ่มนับใหม่ บีบกลับจะได้ตอบทันที
      sayZoom();
    }
    scroller.scrollLeft -= q.x - nav.x;
    scroller.scrollTop -= q.y - nav.y;
    nav.x = q.x; nav.y = q.y;
  });
  const lift = (ev) => {
    if (!touches.delete(ev.pointerId)) return;
    if (pan && pan.id === ev.pointerId) pan = null;
    nav = touches.size === 2 ? startNav() : null;   // เหลือสองนิ้วเริ่มนับใหม่จากตำแหน่งจริง ไม่งั้นซูมกระโดด
  };
  stage.addEventListener("pointerup", lift);
  stage.addEventListener("pointercancel", lift);

  /* ── แถบบนแถวเดียว ───────────────────────────────────────────────────
   * ‼️ รอบตรวจแย้งเฟส 3: พับแบบย้ายปุ่มตัวจริงไปแผงลอยใต้แถบ ห้ามโคลน (ปุ่มโคลนไม่ได้รับ disabled, ข้อความ,
   *    aria-pressed ที่เครื่องมือเปลี่ยนทีหลัง) และแผงลอยทับหน้ากระดาษ ไม่ดันหน้าลง (ดันแล้วพอดีหน้าคิดใหม่ ซูมกระโดด)
   *   ลำดับพับ (ตัวแรกพับก่อน): พอดีความกว้าง, ล้างกรอบ, กลุ่มซูม, ทำซ้ำ, วางกรอบ, พอดีหน้า, ดูผลหลังตัด, เลิกทำ
   *   กลุ่มเปลี่ยนหน้าไม่พับ ปุ่มที่มีโฟกัสไม่ย้าย ปุ่มดูผลที่กดค้างอยู่บนแถบเสมอ (คนต้องเห็นทางออก)
   *   วัดจากของจริงบนจอทุกครั้ง (ฟอนต์ ภาษา และขนาดปุ่มต่างกันตามเครื่อง ห้ามเดาความกว้าง) */
  const UNITS = [
    { n: pageGrp, rank: 0 }, { n: sepA, sep: true },
    { n: zoomGrp, rank: 3 }, { n: fitPageBtn, rank: 6 }, { n: fitWidthBtn, rank: 1 }, { n: pvBtn, rank: 7 },
    { n: sepB, sep: true },
    { n: undoBtn, rank: 8 }, { n: redoBtn, rank: 4 }, { n: placeBtn, rank: 5 }, { n: resetBtn, rank: 2 },
  ];
  const FOLD_ORDER = UNITS.filter((u) => u.rank).sort((a, b) => a.rank - b.rank).map((u) => u.n);
  const tbar = pageGrp.parentElement && pageGrp.parentElement.classList.contains("s2-tbar") ? pageGrp.parentElement : null;
  const isSep = (x) => x === sepA || x === sepB;
  function placeUnits(F, tight) {
    tbar.classList.toggle("cr-tight", tight);
    /* ย้ายของที่ต้องพับลงแผงก่อน แถบจะเหลือเฉพาะของที่อยู่ต่อ เรียงตามลำดับเดิมอยู่แล้ว ไม่ต้องย้ายซ้ำ */
    let k = 0;
    for (const u of UNITS) {
      if (!F.has(u.n)) continue;
      if (foldPanel.children[k] !== u.n) foldPanel.insertBefore(u.n, foldPanel.children[k] || null);
      k++;
    }
    const bar = UNITS.filter((u) => !F.has(u.n)).map((u) => u.n).concat([moreBtn, foldPanel]);
    bar.forEach((x, j) => { if (tbar.children[j] !== x) tbar.insertBefore(x, tbar.children[j] || null); });
    /* เส้นคั่นโชว์เฉพาะระหว่างของที่เห็นทั้งสองฝั่ง ไม่อยู่หัวแถว ท้ายแถว หรือติดกัน */
    const tok = bar.filter((x) => x !== moreBtn && x !== foldPanel && (isSep(x) || !x.hidden));
    for (const s of [sepA, sepB]) {
      const j = tok.indexOf(s);
      s.hidden = !(j > 0 && !isSep(tok[j - 1]) && tok.slice(j + 1).some((x) => !isSep(x)));
    }
    let cnt = 0;
    for (const x of F) cnt += x.matches("button, input") ? 1 : x.querySelectorAll("button, input").length;
    moreBtn.hidden = !F.size;
    setText(moreNum, String(cnt));
    moreBtn.setAttribute("aria-label", tr(`อีก ${cnt} ปุ่ม`, pl(cnt, "more button", "more buttons")));
  }
  function needWidth() {
    const gap = parseFloat(getComputedStyle(tbar).columnGap) || 0;
    let w = 0, cnt = 0;
    for (const x of tbar.children) {
      if (x === foldPanel || x.hidden) continue;
      const r = x.getBoundingClientRect();
      if (!r.width) continue;
      const cs = getComputedStyle(x);
      w += r.width + (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0);
      cnt++;
    }
    return w + gap * Math.max(0, cnt - 1);
  }
  function availWidth() {
    const cs = getComputedStyle(tbar);
    return tbar.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  }
  function refold() {
    if (!tbar || !tbar.isConnected || !tbar.offsetParent || !tbar.clientWidth) return;
    const act = document.activeElement;
    /* คนกำลังเลือกของในแผงที่กางอยู่ ห้ามจัดแผงใหม่ใต้นิ้ว รอให้แผงปิดก่อน */
    if (foldOpen && foldPanel.contains(act)) { foldDeferred = true; return; }
    foldDeferred = false;
    const pinned = (u) => (u === pvBtn && preview) || (!!act && u.contains(act) && !foldPanel.contains(u));
    const order = FOLD_ORDER.filter((u) => !pinned(u));
    const curSize = (tbar.classList.contains("cr-tight") ? 100 : 0) + folded.size;
    let pick = null;
    for (const tight of [false, true]) {
      for (let k = 0; k <= order.length && !pick; k++) {
        const F = new Set(order.slice(0, k));
        placeUnits(F, tight);
        const size = (tight ? 100 : 0) + k;
        if (availWidth() - needWidth() >= (size < curSize ? HYST : 0)) pick = { F, tight };
      }
      if (pick) break;
    }
    if (!pick) { pick = { F: new Set(order), tight: true }; placeUnits(pick.F, true); }
    /* ‼️ รีวิวหลังทำ F4: ของที่ค้างบนแถบเพราะมีโฟกัสหรือกดค้าง ทำให้แถบแน่นกว่าที่ควร
       เดิมจำให้จัดใหม่เฉพาะตอนวางไม่พอ ออกจากดูผลบนมือถือแล้วแถบค้างแบบย่อ (ซ่อน / 4 กับคำว่า ปุ่ม) จนกว่าจอจะเปลี่ยนขนาด
       ตอนนี้มีของค้างเมื่อไรก็จำไว้ โฟกัสออกจากแถบเมื่อไร ตัวรับ focusout จัดใหม่ให้ */
    foldDeferred = order.length < FOLD_ORDER.length;
    const placeWas = folded.has(placeBtn);
    folded = pick.F;
    /* ย้ายปุ่มข้ามกล่องทำให้โฟกัสหลุด ถ้าปุ่มที่มีโฟกัสถูกย้าย (เช่นปุ่มดูผลที่เพิ่งกดในแผง) ส่งโฟกัสคืน */
    if (act && act !== document.activeElement && act.isConnected && reachable(act)) act.focus({ preventScroll: true });
    /* ‼️ รีวิวหลังทำ F2: ไฟล์หน้าเดียวที่ยังไม่มีประวัติ ทั้งสี่ตัวเดิมกดไม่ได้หรือซ่อนหมด โฟกัสหลุดไป BODY ต่อท้ายด้วยของที่มีเสมอ */
    else if (act === moreBtn && moreBtn.hidden) focusFirst([undoBtn, keepBox, placeBtn, pageIn, prevBtn, nextBtn, fitPageBtn]);
    if (!folded.size && foldOpen) closeFold(false);
    if (folded.has(placeBtn) !== placeWas) refresh();
  }
  let foldQueued = false;
  function scheduleFold() {
    if (!tbar || foldQueued) return;
    foldQueued = true;
    requestAnimationFrame(() => { foldQueued = false; refold(); });
  }
  function openFold() {
    if (!folded.size || foldOpen) return;
    foldOpen = true;
    foldPanel.classList.add("open");
    moreBtn.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", onOutside, true);
    syncEsc();
  }
  function closeFold(focusMore) {
    if (!foldOpen) return;
    const had = foldPanel.contains(document.activeElement);
    foldOpen = false;
    foldPanel.classList.remove("open");
    moreBtn.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onOutside, true);
    syncEsc();
    if ((focusMore || had) && !moreBtn.hidden) moreBtn.focus({ preventScroll: true });
    if (foldDeferred) scheduleFold();
  }
  /* แตะนอกแผง (ไม่นับปุ่ม อีก N ปุ่ม ซึ่งสลับเปิดปิดเอง) = ปิด */
  const onOutside = (ev) => {
    const t = ev.target;
    if (!foldPanel.contains(t) && !moreBtn.contains(t)) closeFold(false);
  };
  moreBtn.addEventListener("click", () => (foldOpen ? closeFold(true) : openFold()));
  /* กดคำสั่งในแผงแล้วแผงปิด โฟกัสกลับปุ่ม อีก N ปุ่ม ยกเว้นซูมเข้าออกที่มักกดหลายครั้งติดกัน
     ‼️ ภาพจอรอบ 1 (02/10/2026): คำสั่งที่ส่งโฟกัสไปที่อื่นเอง (วางกรอบ ส่งไปที่กรอบให้กดลูกศรต่อได้) ห้ามดึงกลับ */
  foldPanel.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b || b === zoomInBtn || b === zoomOutBtn) return;
    const a = document.activeElement;
    closeFold(!a || a === document.body || foldPanel.contains(a));
  });
  let ro = null;
  const onFonts = () => scheduleFold();
  if (tbar) {
    tbar.classList.add("cr-tbar");
    foldPanel.hidden = false;
    /* ‼️ ResizeObserver เรียก refold ตรง ๆ (ก่อนวาดจอ) ไม่งั้นเห็นแถบล้นแวบหนึ่งก่อนพับ
       การพับไม่เปลี่ยนขนาดของแถบหรือกลุ่มเปลี่ยนหน้า จึงไม่วนเรียกตัวเอง */
    ro = new ResizeObserver(() => refold());
    ro.observe(tbar);
    ro.observe(pageGrp);
    new MutationObserver(() => refold()).observe(pageGrp, { attributes: true, attributeFilter: ["hidden"] });
    tbar.addEventListener("focusout", () => { if (foldDeferred) scheduleFold(); });
    if (document.fonts) {
      document.fonts.ready.then(onFonts);
      document.fonts.addEventListener("loadingdone", onFonts);
    }
  }
  ws.wrap.addEventListener("fk:dispose", () => {
    document.removeEventListener("keydown", onUndoKey);
    document.removeEventListener("pointerdown", onOutside, true);
    window.removeEventListener("keydown", onEscCap, true);
    escOn = false;
    if (ro) ro.disconnect();
    if (document.fonts) document.fonts.removeEventListener("loadingdone", onFonts);
    clearTimeout(hist.timer);
  });

  /* ── ลงไฟล์ ──────────────────────────────────────────────────────────── */
  async function run() {
    if (job || !file || !pdf || !pageSize) return;
    settle();
    if (!anyCrop()) return;
    /* ‼️ ถ่ายค่าทุกอย่างไว้ตอนกด ห้ามอ่านค่าสดระหว่างทำ (บั๊กเจอ 02/10/2026)
       แถบบนอยู่นอกเขตที่ busy บังไว้ เดิมกดล้างกรอบกลางคันได้ error ดิบ กดหน้าถัดไปได้หน้าที่ไม่ได้เลือก
       และกดบันทึกซ้อนได้อีกรอบ ตอนนี้ปิดการแก้ทั้งหมดด้วย job และใช้สถานะที่ถ่ายไว้เท่านั้น */
    const src = file, seq = openSeq, snap = S, shown = pageSize.i, total = pageCount, known = pw;
    const myJob = ++jobSeq;
    const stale = () => seq !== openSeq || myJob !== jobSeq;   // ผู้ใช้เปลี่ยนไฟล์ระหว่างบันทึก ห้ามเอาผลไปติดชื่อไฟล์ใหม่
    results.replaceChildren(); resultFor = null;
    job = "save";
    syncView(); refresh();
    ws.setBusy(true);
    st.begin();
    st.info(tr("กำลังครอบตัด…", "Cropping…"));
    try {
      /* ‼️ ไฟล์ล็อกรหัส: ใช้รหัสที่ใส่ตอนเปิดซ้ำ ไม่ถามสองรอบ (เดิมเปิดดูได้แต่บันทึกไม่ได้เลย) */
      const ask = passwordBox(ws.body);
      const { doc } = await loadPdfLib(src, (wrong) => (!wrong && known != null ? Promise.resolve(known) : ask(wrong)));
      if (stale()) return;
      const pages = doc.getPages();
      let done = 0;
      for (let i = 0; i < pages.length; i++) {
        if (st.cancelled || stale()) break;
        const frame = cropOf(snap, i, shown);
        if (!frame) continue;
        const p = pages[i];
        /* ‼️ อิงกรอบที่ pdf.js แสดงของหน้านั้น ไม่ใช่ mediabox เสมอไป
           ไฟล์ที่เคยถูกครอบตัดมาก่อนมี cropbox เล็กกว่า mediabox อยู่แล้ว ดู shownBox */
        const b = shownBox(p);
        /* กรอบบนจอเป็นของหน้าที่หมุนแล้ว แกน y นับจากบนลงล่าง ส่วน PDF นับจากล่างขึ้นบนบนหน้าก่อนหมุน */
        const rot = leafNull(p, "Rotate") ? 0 : ((((p.getRotation && p.getRotation().angle) || 0) % 360) + 360) % 360;
        const r = toUnrotated(frame, rot);
        p.setCropBox(b.x + r.x * b.w, b.y + r.y * b.h, r.w * b.w, r.h * b.h);
        done++;
        st.progress(((i + 1) / pages.length) * 100, `(${i + 1}/${pages.length})`);
        await yieldToBrowser();
      }
      if (stale()) return;
      st.end();
      st.progress(null);
      /* ‼️ กดหยุด = ไม่ได้ไฟล์ (เดิมได้ไฟล์ที่ตัดไปครึ่งเดียวพร้อมข้อความว่าเรียบร้อย) */
      if (st.cancelled) { st.info(tr("หยุดตามที่สั่งแล้ว ยังไม่ได้สร้างไฟล์", "Stopped as asked, no file was made")); return; }
      const blob = new Blob([await doc.save()], { type: "application/pdf" });
      if (stale()) return;
      const name = stripExt(src.name) + tr("-ครอบตัด.pdf", "-cropped.pdf");
      st.ok(tr(`ครอบตัด ${done} หน้าเรียบร้อย`, `Cropped ${pl(done, "page", "pages")}`));
      resultFor = { s: snap, shown };
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name),
          el("small", {}, tr(`ครอบตัด ${done} จาก ${total} หน้า, ${fmtBytes(blob.size)}`,
                             `${done} of ${pl(total, "page", "pages")} cropped, ${fmtBytes(blob.size)}`))]),
        downloadButton(blob, name),
      ]));
    } catch (e) {
      if (stale()) return;
      st.end();
      st.progress(null);
      fail(e);
    } finally {
      if (myJob === jobSeq) {
        job = null;
        ws.setBusy(false);
        syncView(); refresh();
      }
    }
  }

  syncView();
  refresh();
  return ws.wrap;
}
