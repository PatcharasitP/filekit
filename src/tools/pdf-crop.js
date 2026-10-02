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
import { openPdf, loadPdfLib, passwordBox, friendlyPdfError } from "../pdfopen.js";
import { el, dropzone, statusBar, button, field, select, downloadButton, keyHints,
         stripExt, yieldToBrowser, fmtBytes } from "../ui.js";
import { workspace } from "../workspace.js";
import { tr, pl } from "../i18n.js";

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
/* ปุ่มพอดีหน้าหรือพอดีความกว้างที่ใช้อยู่ ต้องดูออกว่ากดค้างไว้ */
.cr-fit[aria-pressed="true"]{border-color:var(--text);background:color-mix(in srgb,var(--text) 9%,var(--card))}
/* จอแคบแถบบนพับเป็นหลายแถว เส้นคั่นกลุ่มไปค้างท้ายแถวแบบไม่มีความหมาย จึงซ่อน */
@media (max-width:640px){ .s2-tbar .sep.cr-sep{display:none} }
.cr-note{font-size:12.5px;line-height:1.6;color:var(--text-mute);
  background:var(--bg-soft);border:1px solid var(--line-soft);border-radius:var(--r-sm);padding:9px 12px}
.cr-touch{display:none}
@media (pointer:coarse){ .cr-mouse{display:none} .cr-touch{display:inline} }
.cr-warn{border:1px solid var(--line);border-left:3px solid #b8860b;border-radius:var(--r-sm);
  background:color-mix(in srgb,#b8860b 7%,transparent);padding:10px 12px;font-size:13px;line-height:1.6}
.cr-mixed{margin:0 0 12px;font-size:13px;line-height:1.6;border:1px solid var(--line);
  border-left:3px solid var(--text-mute);border-radius:var(--r-sm);padding:9px 12px}
.cr-mixed[hidden]{display:none}
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

/** กรอบของหน้าที่ pdf.js แสดงบนจอจริง ซึ่งเป็นฐานของสัดส่วนกรอบทั้งหมด
 *  ‼️ pdf.js แสดง CropBox ตัดกับ MediaBox (ตัดแล้วว่างหรือ CropBox ใช้ไม่ได้ ใช้ MediaBox แทน)
 *     แต่ pdf-lib คืน CropBox ดิบ รุ่นเดิมจึงวางกรอบผิดที่กับไฟล์ที่ CropBox ใหญ่กว่า MediaBox
 *     (วัด 02/10/2026: MediaBox 595 x 842 กับ CropBox 612 x 792 ได้ขอบขวาเกินกรอบบนจอ 16 พอยต์)
 *     และ CropBox ขนาด 0 ถูกเขียนกลับเป็น 0 คือไม่ได้ครอบอะไรเลยทั้งที่ขึ้นว่าครอบแล้ว */
function shownBox(p) {
  const n = (b) => ({ x0: Math.min(b.x, b.x + b.width), y0: Math.min(b.y, b.y + b.height),
                      x1: Math.max(b.x, b.x + b.width), y1: Math.max(b.y, b.y + b.height) });
  const M = n(p.getMediaBox());
  const C = p.getCropBox ? n(p.getCropBox()) : M;
  const x0 = Math.max(M.x0, C.x0), y0 = Math.max(M.y0, C.y0);
  const x1 = Math.min(M.x1, C.x1), y1 = Math.min(M.y1, C.y1);
  if (x1 - x0 > 0 && y1 - y0 > 0) return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  return { x: M.x0, y: M.y0, w: M.x1 - M.x0, h: M.y1 - M.y0 };
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
     ‼️ เขียนเฉพาะตอนข้อความเปลี่ยน ไม่งั้นเปลือกหน้าได้ยินว่าผืนงานเปลี่ยนทุกครั้งโดยไม่มีอะไรเปลี่ยนจริง */
  const infoText = el("span", {});
  const infoPos = el("span", { class: "cr-vh" });
  const info = el("div", { class: "grow", role: "status" }, [infoText, infoPos]);
  /* ป้าย % ไม่ต้องพูดเอง (เดิมพูดทุกครั้งที่กล่องเปลี่ยนขนาด เช่นเปิดแผงตัวเลือกบนมือถือ)
     บอกผ่านช่องนี้แทน เฉพาะตอนผู้ใช้ซูมเองและหยุดซูมแล้ว พร้อมคำว่า ซูม */
  const zoomSay = el("div", { class: "cr-vh", role: "status" });
  const wrap = el("div", { class: "cr-wrap", hidden: true }, [
    results,
    el("div", { class: "cr-bar" }, [info, zoomSay]),
    scroller,
    /* ‼️ เขียนเฉพาะคีย์ที่มีอยู่จริงใน handler ด้านล่าง บอกคีย์ที่ไม่มีจริงแย่กว่าไม่บอก */
    keyHints([
      ["← ↑ → ↓", tr("ย้ายกรอบทีละ 1 พอยต์", "Move the frame 1 pt")],
      ["Shift", tr("ทีละ 10 พอยต์", "10 pt at a time")],
      ["Alt + ←", tr("ปรับขนาดกรอบ", "Resize the frame")],
      ["Del", tr("ล้างกรอบ", "Clear the frame")],
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
  const fitPageBtn = button(tr("พอดีหน้า", "Fit page"), { ghost: true, onclick: () => setFit("page") });
  const fitWidthBtn = button(tr("พอดีความกว้าง", "Fit width"), { ghost: true, onclick: () => setFit("width") });
  fitPageBtn.classList.add("cr-fit");
  fitWidthBtn.classList.add("cr-fit");
  const placeBtn = button(tr("วางกรอบ", "Place a frame"), { ghost: true, onclick: placeFrame });
  const resetBtn = button(tr("ล้างกรอบ", "Clear the frame"), { ghost: true, onclick: () => clearFrame(true) });
  /* ปุ่มที่ถูกปิดตอนมีโฟกัสอยู่ ส่งโฟกัสให้ปุ่มคู่ (ดู syncView) */
  const PARTNER = new Map([[prevBtn, [nextBtn, pageIn]], [nextBtn, [prevBtn, pageIn]],
                           [zoomOutBtn, [zoomInBtn]], [zoomInBtn, [zoomOutBtn]]]);

  /* ── แผงขวา ─────────────────────────────────────────────────────────── */
  const applySel = select([
    ["all", tr("ทุกหน้า", "All pages")],
    ["odd", tr("หน้าคี่", "Odd pages")],
    ["even", tr("หน้าคู่", "Even pages")],
    ["one", tr("เฉพาะหน้าที่เห็นอยู่", "Only the page shown")],
  ], "all");
  applySel.addEventListener("change", () => refresh());
  /* ระยะที่ตัดออกจากขอบหน้าแต่ละด้าน เป็นมิลลิเมตร ซิงก์สองทางกับกรอบบนจอ
     คนที่รู้ตัวเลขอยู่แล้ว (เช่น ตัดขอบเย็บเล่ม 15 มม.) พิมพ์ได้เลยไม่ต้องลาก */
  const EDGES = [["top", tr("บน", "Top")], ["bottom", tr("ล่าง", "Bottom")],
                 ["left", tr("ซ้าย", "Left")], ["right", tr("ขวา", "Right")]];
  const LABEL = Object.fromEntries(EDGES);
  /* ‼️ ข้อความบอกว่าทำไมค่าที่พิมพ์ใช้ไม่ได้ เดิมมีแค่ขอบแดง ไม่บอกเลยว่าใส่ได้ถึงเท่าไร */
  const msgId = `cr-mm-msg-${++uid}`;
  const mmMsg = el("p", { class: "cr-mm-msg", id: msgId, "aria-live": "polite" });
  const mmIn = {};
  for (const [k, label] of EDGES) {
    /* ‼️ step 0.1 ตามทศนิยมที่แสดง (เดิม 0.5 แต่เขียนค่าอย่าง 14.9 ลงช่อง ช่องจึงไม่ผ่านกติกาของเบราว์เซอร์เอง) */
    const inp = el("input", { type: "number", min: "0", step: "0.1", inputmode: "decimal", "data-edge": k,
      "aria-label": tr(`ตัดขอบ${label} มิลลิเมตร`, `${label} trim in millimetres`), "aria-describedby": msgId });
    inp.addEventListener("input", () => onMargin(k));
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

  const sep = () => el("div", { class: "sep cr-sep" });
  const ws = workspace(tool, {
    left: { title: tr("ไฟล์", "File"), node: dz.container },
    right: { title: tr("การครอบตัด", "Crop"), node: el("div", {}, [
      field(tr("ใช้กรอบนี้กับ", "Apply the frame to"), applySel),
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
    toolbar: [prevBtn, pageIn, pageOf, nextBtn, sep(),
              zoomOutBtn, zoomLabel, zoomInBtn, fitPageBtn, fitWidthBtn, sep(),
              placeBtn, resetBtn],
    toolbarGroups: [tr("หน้า", "Page"), tr("มุมมอง", "View"), tr("กรอบ", "Frame")],
    footer: [go, st.node],
  });
  ws.wrap.appendChild(el("style", {}, STYLE));

  let file = null, pdf = null, pageCount = 0, cur = 0, openSeq = 0;
  let pw = null;              // รหัสที่ผู้ใช้ใส่ตอนเปิดไฟล์ ใช้ซ้ำตอนบันทึก (ไม่เก็บลงที่ไหน หายเมื่อเปลี่ยนไฟล์)
  let pageSize = null;        // ขนาดหน้าที่เห็นอยู่ เป็นพอยต์ (คิดการหมุนแล้ว)
  let shownPage = null;       // หน้าของ pdf.js ที่แสดงอยู่ (ไว้คืนหน่วยความจำตอนเปลี่ยนหน้า)
  let crop = null;            // { x, y, w, h } สัดส่วน 0 ถึง 1 นับจากมุมซ้ายบนของหน้าที่เห็น
  let zoom = 1;               // 1 = ขนาดจริง
  let fit = "page";           // "page" | "width" | null (ซูมเอง)
  let rendered = 0, renderSeq = 0, task = null, sharpTimer = 0;
  let running = false;        // กำลังบันทึก ห้ามแก้อะไรทั้งนั้น
  let resultSig = "";         // กรอบที่ใช้สร้างแถวผลบันทึกที่ค้างในผืนงาน (เปลี่ยนแล้วแถวนั้นไม่ตรงจอ ต้องทิ้ง)

  async function onFile(fs) {
    file = fs[0] || null;
    const seq = ++openSeq;
    results.replaceChildren(); resultSig = "";
    crop = null; pw = null;
    endGesture(false); touches.clear(); nav = null;   // ท่าที่ค้างจากไฟล์เก่าห้ามติดมา
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
    cur = i;
    const page = await doc.getPage(i + 1);
    if (doc !== pdf || cur !== i) return;      // เปลี่ยนไฟล์หรือกดเปลี่ยนหน้าซ้ำระหว่างรอ อันล่าสุดชนะ
    /* ‼️ คืนภาพที่ถอดรหัสแล้วของหน้าก่อน ไม่งั้นทุกหน้าที่เปิดผ่านค้างในหน่วยความจำจนเปลี่ยนไฟล์
       (pdf.js ล้างเองเฉพาะภาพใหญ่กว่า 10 MB ภาพสแกน 150 dpi ราว 8.7 MB ต่อหน้าจึงค้างทุกหน้า) */
    if (shownPage && shownPage !== page) { try { shownPage.cleanup(); } catch {} }
    shownPage = page;
    const vp = page.getViewport({ scale: 1 }); // คิด /Rotate ให้แล้ว ได้ขนาดตามที่ตาเห็น
    pageSize = { w: vp.width, h: vp.height };
    if (fit) zoom = fitZoom(fit);
    layout();
    draw(); syncView(); refresh();
    rendered = 0;
    await renderPage();
  }

  function goPage(i) {
    if (running || !pdf || !pageCount) return;
    i = Math.min(pageCount - 1, Math.max(0, i));
    if (i === cur && pageSize) { syncView(); return; }
    const doc = pdf;
    showPage(i).catch((e) => { if (doc === pdf) fail(e); });   // ไฟล์เก่าที่ถูกปิดไปแล้วห้ามมาแจ้งข้อผิดพลาดใต้ชื่อไฟล์ใหม่
  }
  function commitPage() {
    const n = parseInt(pageIn.value, 10);
    const i = Number.isFinite(n) ? Math.min(pageCount, Math.max(1, n)) - 1 : cur;
    pageIn.value = String(i + 1);              // พิมพ์เกินจำนวนหน้า ให้เห็นว่าพาไปหน้าไหนจริง
    goPage(i);
  }
  pageIn.addEventListener("change", commitPage);
  pageIn.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); commitPage(); } });

  /* ── ซูม ─────────────────────────────────────────────────────────────
   * ‼️ คิดพอดีหน้าจากขนาดกล่องรวมแถบเลื่อน (offsetWidth) ไม่ใช่ clientWidth
   *    clientWidth หดเมื่อแถบเลื่อนโผล่ ค่าพอดีจะแกว่งไปมาระหว่างมีกับไม่มีแถบเลื่อน */
  const clampZ = (z) => Math.min(ZMAX, Math.max(ZMIN, z));
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
    const pw = pageSize.w * PX_PER_PT, ph = pageSize.h * PX_PER_PT;
    if (mode === "width") {
      const z = W / pw;
      return clampZ(ph * z <= H ? z : (W - scrollbarW()) / pw);   // หน้ายาวกว่าช่อง แถบเลื่อนแนวตั้งจะกินที่
    }
    return clampZ(Math.min(W / pw, H / ph));
  }
  function layout() {
    if (!pageSize) return;
    const w = Math.max(1, Math.floor(pageSize.w * PX_PER_PT * zoom));
    const h = Math.max(1, Math.floor(pageSize.h * PX_PER_PT * zoom));
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
   * เรนเดอร์ลงผืนใหม่แล้วค่อยสลับ ภาพเก่าจึงไม่กระพริบหาย และยกเลิกงานเก่าที่ยังไม่เสร็จทุกครั้ง */
  function wantScale() {
    const dpr = window.devicePixelRatio || 1;
    const cap = Math.sqrt(MAX_PX / (pageSize.w * pageSize.h));
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
    const vp = page.getViewport({ scale });
    const c = el("canvas", {});
    c.width = Math.max(1, Math.floor(vp.width));
    c.height = Math.max(1, Math.floor(vp.height));
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
    const on = !!(crop && pageSize);
    keepBox.hidden = clip.hidden = !on;
    if (!on) return;
    const pos = { left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` };
    Object.assign(keepBox.style, pos);
    Object.assign(shade.style, pos);
  }

  const setText = (n, t) => { if (n.textContent !== t) n.textContent = t; };
  function syncView() {
    const has = !!(pdf && pageSize) && !running;
    const dis = new Map([
      [prevBtn, !has || cur <= 0],
      [nextBtn, !has || cur >= pageCount - 1],
      [zoomOutBtn, !has || zoom <= ZOOMS[0] + 1e-6],
      [zoomInBtn, !has || zoom >= ZMAX - 1e-6],
      [fitPageBtn, !has], [fitWidthBtn, !has], [placeBtn, !has],
    ]);
    pageIn.disabled = !has;
    for (const [b, d] of dis) if (!d) b.disabled = false;
    const off = (x) => (dis.has(x) ? dis.get(x) : x.disabled);
    for (const [b, d] of dis) {
      if (!d) continue;
      /* ‼️ ปุ่มที่เพิ่งกดแล้วกดต่อไม่ได้ (หน้าถัดไปตอนถึงหน้าสุดท้าย ซูมเข้าตอนถึง 400%)
         ถ้าปิดเฉย ๆ โฟกัสหลุดไปทั้งหน้า คนใช้คีย์บอร์ดหาไม่เจอว่าอยู่ตรงไหน จึงส่งโฟกัสให้ปุ่มคู่ก่อนปิด */
      if (document.activeElement === b) {
        const to = (PARTNER.get(b) || []).find((x) => !off(x));
        if (to) to.focus();
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

  /* ‼️ ห้ามแก้กรอบตอนกำลังบันทึก และตอนอยู่หน้าผลลัพธ์ (บั๊กเจอ 02/10/2026)
     หน้าผลลัพธ์บนจอกว้างยังเห็นกรอบอยู่ เดิมลากแก้ได้ แต่ปุ่มดาวน์โหลดยังให้ไฟล์ของกรอบเก่า
     inert กันทั้งเมาส์ นิ้ว และคีย์บอร์ดในคำสั่งเดียว */
  function syncLock() {
    stage.inert = running || ws.wrap.dataset.state === "result";
  }
  new MutationObserver(syncLock).observe(ws.wrap, { attributes: true, attributeFilter: ["data-state"] });

  const mm = (pt) => Math.round(pt * MM_PER_PT);
  const mm1 = (pt) => Math.round(pt * MM_PER_PT * 10) / 10;
  /* ลายเซ็นของสิ่งที่กำหนดไฟล์ผลลัพธ์ (กรอบ, ใช้กับหน้าไหน) */
  const sig = () => (crop ? [crop.x, crop.y, crop.w, crop.h].map((v) => v.toFixed(5)).join(",")
    + "|" + applySel.value + (applySel.value === "one" ? "|" + cur : "") : "");
  function refresh() {
    go.disabled = running || !crop || !pdf;
    resetBtn.disabled = running || !crop;
    applySel.disabled = running;
    syncLock();
    syncInputs(false);
    setMsg("");
    /* แถวผลบันทึกที่ค้างในผืนงานไม่ตรงกับกรอบบนจอแล้ว ทิ้งเลย กดบันทึกใหม่ได้ไฟล์ที่ตรงกว่า */
    if (resultSig && results.firstChild && sig() !== resultSig) { results.replaceChildren(); resultSig = ""; }
    if (!pageSize) { setText(infoText, ""); setText(infoPos, ""); return; }
    const pw = mm(pageSize.w), ph = mm(pageSize.h);
    if (!crop) {
      setText(infoText, tr("ยังไม่มีกรอบ ลากคลุมส่วนที่ต้องการเก็บ หรือกด วางกรอบ",
                           "No frame yet. Drag over the part to keep, or press Place a frame"));
      setText(infoPos, "");
      return;
    }
    const w = mm(crop.w * pageSize.w), h = mm(crop.h * pageSize.h);
    setText(infoText, tr(`กรอบที่เก็บไว้ ${w} x ${h} มม. จากหน้า ${pw} x ${ph} มม.`,
                         `Keeping ${w} x ${h} mm of a ${pw} x ${ph} mm page`));
    const l = mm1(crop.x * pageSize.w), t = mm1(crop.y * pageSize.h);
    setText(infoPos, tr(` ห่างขอบซ้าย ${l} มม. ขอบบน ${t} มม.`, `, ${l} mm from the left and ${t} mm from the top`));
  }

  /* ── ช่องระยะขอบ มม. ──────────────────────────────────────────────── */
  const edgeLen = (k) => (k === "top" || k === "bottom" ? pageSize.h : pageSize.w);
  function marginOf(k) {
    if (k === "left") return crop.x;
    if (k === "top") return crop.y;
    if (k === "right") return 1 - crop.x - crop.w;
    return 1 - crop.y - crop.h;
  }
  /** ‼️ ข้ามช่องที่ผู้ใช้กำลังพิมพ์อยู่ ไม่งั้นพิมพ์ 1 จะโดนเขียนทับเป็น 1.0 ก่อนพิมพ์ตัวถัดไปทัน */
  function syncInputs(force) {
    for (const [k, inp] of Object.entries(mmIn)) {
      inp.disabled = !pageSize || running;
      if (!force && document.activeElement === inp) continue;
      inp.value = crop && pageSize ? String(Math.round(marginOf(k) * edgeLen(k) * MM_PER_PT * 10) / 10) : "";
      inp.removeAttribute("aria-invalid");
    }
  }
  function setMsg(t) { setText(mmMsg, t); }
  /** ระยะมากสุดที่ใส่ได้ คิดจากขอบฝั่งตรงข้ามที่เป็นอยู่ตอนนี้ (กรอบต้องเหลืออย่างน้อย 2%) */
  function maxMm(k) {
    const c = crop || { x: 0, y: 0, w: 1, h: 1 };
    const far = k === "left" ? c.x + c.w : k === "right" ? 1 - c.x : k === "top" ? c.y + c.h : 1 - c.y;
    return Math.max(0, Math.floor((far - MIN) * edgeLen(k) * MM_PER_PT * 10) / 10);
  }
  function badMsg(k, v, back) {
    const tail = back ? tr(" จึงคืนค่าเดิมให้", ", so the old value is back") : "";
    if (!Number.isFinite(v) || v < 0) return tr(`ใส่ได้เฉพาะตัวเลขตั้งแต่ 0 ขึ้นไป${tail}`, `Use a number from 0 up${tail}`);
    return tr(`ขอบ${LABEL[k]}ใส่ได้ไม่เกิน ${maxMm(k)} มม.${tail}`, `${LABEL[k]} can be at most ${maxMm(k)} mm${tail}`);
  }
  function onMargin(k) {
    if (!pageSize) return;
    const inp = mmIn[k];
    const raw = inp.value.trim();
    if (raw === "") { inp.removeAttribute("aria-invalid"); setMsg(""); return; }   // ลบเพื่อพิมพ์ใหม่ ยังไม่ต้องทำอะไร
    const v = Number(raw);
    const c = crop || { x: 0, y: 0, w: 1, h: 1 };   // ยังไม่มีกรอบ เริ่มจากเต็มหน้า
    let L = c.x, T = c.y, R = c.x + c.w, B = c.y + c.h;
    const r = v / MM_PER_PT / edgeLen(k);
    if (k === "left") L = r; else if (k === "right") R = 1 - r; else if (k === "top") T = r; else B = 1 - r;
    const ok = Number.isFinite(v) && v >= 0 && R - L >= MIN - 1e-9 && B - T >= MIN - 1e-9;
    inp.setAttribute("aria-invalid", String(!ok));
    if (!ok) { setMsg(badMsg(k, v, false)); return; }
    crop = { x: L, y: T, w: R - L, h: B - T };
    draw(); refresh();
  }
  function onMarginDone(k) {
    const inp = mmIn[k];
    const bad = inp.getAttribute("aria-invalid") === "true";
    const v = Number(inp.value.trim());
    syncInputs(true);
    if (bad) setMsg(badMsg(k, v, true));       // คืนค่าเดิมเงียบ ๆ ผู้ใช้จะงงว่าทำไมตัวเลขเปลี่ยนเอง
  }

  function placeFrame() {
    if (!pageSize || running) return;
    crop = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
    draw(); refresh();
    keepBox.focus();                           // พร้อมกดลูกศรปรับต่อทันที
  }
  function clearFrame(moveFocus) {
    endGesture(false);
    crop = null;
    draw(); refresh();
    if (moveFocus) placeBtn.focus();           // กรอบหายไปแล้ว โฟกัสต้องมีที่ไป ไม่งั้นหลุดไปทั้งหน้า
  }

  /* ── คีย์บอร์ดที่กรอบ ───────────────────────────────────────────────── */
  keepBox.addEventListener("keydown", (ev) => {
    if (!crop || !pageSize || running) return;
    if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); clearFrame(true); return; }
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
    if (!d) return;
    ev.preventDefault();
    const step = ev.shiftKey ? 10 : 1;        // พอยต์ ตรงกับหน่วยที่ PDF ใช้จริง
    crop = moveOrResize(crop, ev.altKey ? "se" : "move", (d[0] * step) / pageSize.w, (d[1] * step) / pageSize.h);
    draw(); refresh();
  });

  /* ── ท่าลากที่ค้างอยู่ ─────────────────────────────────────────────────
   * ‼️ Esc ระหว่างลาก = ยกเลิกท่านั้น ไม่ใช่ออกจากเครื่องมือ (บั๊กเจอ 02/10/2026)
   *    Esc ของทั้งเว็บพากลับหน้าแรก หน้าเครื่องมือถูกถอดออกกลางท่า ไม่มีวันได้ยิน pointerup
   *    กลับมาอีกทีแค่ชี้เมาส์ผ่าน กรอบก็วิ่งตาม ดักที่ window ขาจับ ซึ่งมาก่อนตัวดักของทั้งเว็บ
   *    ติดตั้งเฉพาะตอนมีท่าค้าง ไม่งั้น Esc ตอนปกติจะไม่พากลับหน้าแรกเหมือนเครื่องมืออื่น */
  let drag = null;      // { id, mode, p0, o }
  let start = null, before = null, drawId = null;
  let pan = null;       // { id } นิ้วเดียวเลื่อนดูตอนหน้าล้นจอ
  const onEsc = (ev) => {
    if (ev.key !== "Escape" || !(drag || start)) return;
    ev.preventDefault();
    ev.stopPropagation();
    endGesture(true);
    draw(); refresh();
  };
  let armed = false;
  function armEsc() { if (!armed) { window.addEventListener("keydown", onEsc, true); armed = true; } }
  function endGesture(restore) {
    if (restore) { if (drag) crop = drag.o; else if (start) crop = before; }
    drag = null; start = null; before = null; pan = null;
    if (armed) { window.removeEventListener("keydown", onEsc, true); armed = false; }
  }

  /* ── ลากกรอบ: ในกรอบ = ย้าย, มือจับ = ปรับขนาด ───────────────────────
   * ‼️ คิดระยะเป็นสัดส่วนของหน้าจากตำแหน่งจริงทุกครั้งที่ขยับ ไม่ใช่ระยะพิกเซลจากตอนกด
   *    เลื่อนหรือซูมกลางท่า (ล้อเมาส์ขณะกดค้าง) กรอบต้องยังติดปลายเมาส์ เดิมหลุดห่างไปตามระยะที่เลื่อน */
  const relRaw = (ev) => {
    const r = stage.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height };
  };
  keepBox.addEventListener("pointerdown", (ev) => {
    if (!crop || ev.button > 0 || nav || pan || running) return;
    ev.preventDefault();
    const h = ev.target.closest(".cr-h");
    drag = { id: ev.pointerId, mode: h ? h.dataset.h : "move", p0: relRaw(ev), o: crop };
    try { keepBox.setPointerCapture(ev.pointerId); } catch {}
    keepBox.focus({ preventScroll: true });
    armEsc();
  });
  keepBox.addEventListener("pointermove", (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    /* ปุ่มปล่อยไปแล้วแต่ไม่ได้ยิน pointerup ถือว่าจบท่าตรงนี้ ไม่งั้นแค่ชี้ผ่าน กรอบก็วิ่งตาม */
    if (ev.buttons === 0) { endGesture(false); draw(); refresh(); return; }
    const p = relRaw(ev);
    crop = moveOrResize(drag.o, drag.mode, p.x - drag.p0.x, p.y - drag.p0.y);
    draw();
  });
  const endMove = (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    endGesture(ev.type === "pointercancel");   // ท่าที่ถูกยกเลิกต้องไม่ทิ้งร่องรอย
    draw(); refresh();
  };
  keepBox.addEventListener("pointerup", endMove);
  keepBox.addEventListener("pointercancel", endMove);

  /* ── ลากนอกกรอบ = วาดกรอบใหม่ ───────────────────────────────────────── */
  const rel = (ev) => {
    const p = relRaw(ev);
    return { x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) };
  };
  layer.addEventListener("pointerdown", (ev) => {
    if (!pdf || !pageSize || ev.button > 0 || nav || pan || running) return;
    ev.preventDefault();
    /* ‼️ กด preventDefault แล้วโฟกัสไม่ย้ายเอง ช่อง มม. ที่โฟกัสค้างอยู่จะถูกข้ามตอนซิงก์ค่า
       แล้วโชว์ระยะของกรอบเก่าค้างไว้ช่องเดียว จึงเอาโฟกัสออกจากช่องก่อนเริ่มวาด */
    const a = document.activeElement;
    if (a && a.matches && a.matches(".cr-mm input")) a.blur();
    start = rel(ev); before = crop; drawId = ev.pointerId;
    try { layer.setPointerCapture(ev.pointerId); } catch {}
    armEsc();
  });
  layer.addEventListener("pointermove", (ev) => {
    if (!start || ev.pointerId !== drawId) return;
    if (ev.buttons === 0) { finishDraw(false); return; }
    const p = rel(ev);
    crop = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y),
             w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
    draw();
  });
  function finishDraw(cancel) {
    /* ‼️ ลากสั้นกว่า 2% มักเป็นการคลิกพลาด คืนกรอบเดิม (รุ่นเดิมลบกรอบทิ้งทั้งกรอบ ต้องวาดใหม่) */
    const drew = !cancel && crop && crop !== before && crop.w >= MIN && crop.h >= MIN;
    if (!drew) crop = before;
    endGesture(false);
    draw();
    if (drew) keepBox.focus({ preventScroll: true });   // วาดเสร็จ กดลูกศรปรับต่อได้เลย (ก่อน refresh ช่อง มม. จะได้ซิงก์ครบ)
    refresh();
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
   *  นิ้วที่สองลงเมื่อไร = ยกเลิกท่าของนิ้วแรก แล้วเป็นซูมกับเลื่อนดู */
  const touches = new Map();
  let nav = null;         // { d0, z0, x, y } ระยะห่างกับซูมตอนเริ่มบีบ และจุดกึ่งกลางสองนิ้วรอบก่อน
  const pair = () => {
    const [a, b] = [...touches.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const startNav = () => { const q = pair(); return { d0: q.d, z0: zoom, x: q.x, y: q.y }; };
  const overflows = () => scroller.scrollWidth > scroller.clientWidth + 4 || scroller.scrollHeight > scroller.clientHeight + 4;
  stage.addEventListener("pointerdown", (ev) => {
    if (ev.pointerType !== "touch" || !pageSize || running) return;
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (touches.size === 1) {
      if (!overflows() || ev.target.closest(".cr-h")) return;
      ev.preventDefault();
      ev.stopPropagation();                    // ไม่ให้ถึงกรอบหรือชั้นวาด
      pan = { id: ev.pointerId };
      try { stage.setPointerCapture(ev.pointerId); } catch {}
      return;
    }
    if (drag || start) { endGesture(true); draw(); refresh(); }
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

  /* ── ลงไฟล์ ──────────────────────────────────────────────────────────── */
  function wantPage(i, mode, shown) {
    if (mode === "one") return i === shown;
    if (mode === "odd") return i % 2 === 0;    // หน้า 1, 3, 5 คือ index 0, 2, 4
    if (mode === "even") return i % 2 === 1;
    return true;
  }
  function setRunning(on) {
    running = on;
    syncView(); refresh();
  }

  async function run() {
    if (running || !file || !crop || !pdf) return;
    /* ‼️ ถ่ายค่าทุกอย่างไว้ตอนกด ห้ามอ่านค่าสดระหว่างทำ (บั๊กเจอ 02/10/2026)
       แถบบนอยู่นอกเขตที่ busy บังไว้ เดิมกดล้างกรอบกลางคันได้ error ดิบ กดหน้าถัดไปได้หน้าที่ไม่ได้เลือก
       และกดบันทึกซ้อนได้อีกรอบ ตอนนี้ปิดการแก้ทั้งหมดด้วย running และใช้ค่าที่ถ่ายไว้เท่านั้น */
    const src = file, seq = openSeq, frame = { ...crop }, shown = cur, mode = applySel.value, total = pageCount;
    const known = pw, at = sig();
    const stale = () => seq !== openSeq;      // ผู้ใช้เปลี่ยนไฟล์ระหว่างบันทึก ห้ามเอาผลไปติดชื่อไฟล์ใหม่
    results.replaceChildren(); resultSig = "";
    setRunning(true);
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
        if (!wantPage(i, mode, shown)) continue;
        const p = pages[i];
        /* ‼️ อิงกรอบที่ pdf.js แสดงของหน้านั้น ไม่ใช่ mediabox เสมอไป
           ไฟล์ที่เคยถูกครอบตัดมาก่อนมี cropbox เล็กกว่า mediabox อยู่แล้ว ดู shownBox */
        const b = shownBox(p);
        /* กรอบบนจอเป็นของหน้าที่หมุนแล้ว แกน y นับจากบนลงล่าง ส่วน PDF นับจากล่างขึ้นบนบนหน้าก่อนหมุน */
        const rot = ((((p.getRotation && p.getRotation().angle) || 0) % 360) + 360) % 360;
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
      resultSig = at;
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
      if (stale()) { st.end(); st.progress(null); }
      setRunning(false);
      ws.setBusy(false);
    }
  }

  syncView();
  refresh();
  return ws.wrap;
}
