// ── ตัวแก้ไขบนหน้า PDF ใช้ร่วม (ปิดทับ ข้อความ ไฮไลต์ ลายเซ็น รูป) ─────────────────────────
// ย้ายมาจาก src/tools/pdf-edit.js 19/11/2026 เพื่อให้เครื่องมือจัดการหน้า PDF ใช้ตัวเดียวกัน
// (แผน .claude/plans/2026-11-18-merge-edit-into-pages.md เฟส 1) พี่ปอนด์อยากให้ "ครบจบในเครื่องมือเดียว"
// แต่ยังเก็บหน้า แก้ไขและเซ็น ไว้ ทั้งสองหน้าจึงใช้โค้ดนี้ร่วมกัน ห้ามแยกไปแก้ทีละที่
// ‼️ ย้ายแบบคำต่อคำ ไม่เปลี่ยนพฤติกรรม ข้อความ หรือชื่อคลาส (เทส 14 ไฟล์อ้าง .pe-*)
//    ตัวพิสูจน์ tests/browser_pdfedit_golden.py เทียบไฟล์ผลลัพธ์กับรุ่นก่อนย้ายทุกชิ้น
// ‼️ ภาษาไทยไม่ต้องโหลดไลบรารีเพิ่ม
//    pdf-lib ฝังฟอนต์ไทยเองไม่ได้ถ้าไม่มี fontkit ซึ่งเราไม่โหลดเพราะหนัก
//    จึงวาดข้อความลง canvas แล้วฝังเป็น PNG ได้ภาษาไทยครบทุกตัวรวมสระและวรรณยุกต์
import { el, button, field, select } from "./ui.js";
import { uiIcon } from "./icons.js";
import { signaturePad, savedSignatures, saveSignature, removeSignature,
         imageToSignature } from "./signpad.js";
import { tr } from "./i18n.js";
import { decodeImage } from "./imgdecode.js";
import { shownBox, srcRotation, viewSize, viewRectToRaw, placeUpright, placeAt } from "./pdfgeom.js";

export const VIEW_SCALE = 1.6;    // ความละเอียดที่เรนเดอร์หน้ามาให้ดู ยิ่งสูงยิ่งวางตำแหน่งแม่น
/* ‼️ ต้องซูมได้ เพราะข้อความในสัญญาจริงตัวเล็กมาก (พี่ปอนด์ขอเอง 18/09/2026)
   ถ้าเห็นหน้าเต็มพอดีจอ ตัวอักษรจะสูงไม่ถึงสิบพิกเซล ลากคลุมให้พอดีคำแทบเป็นไปไม่ได้
   ระดับซูมคูณกับความกว้างที่แสดง ส่วนกล่องที่วางไว้เก็บเป็นสัดส่วนอยู่แล้วจึงตามไปเอง */
const ZOOMS = [0.75, 1, 1.5, 2, 3];
const PNG_SCALE = 4;       // ความละเอียดของข้อความที่ฝังลงไฟล์ ต้องสูงกว่าจอไม่งั้นเบลอ

/* วาดข้อความลง canvas แล้วคืนเป็น PNG พร้อมขนาดจริงเป็นหน่วยของ PDF
   ‼️ ต้องเผื่อความสูงให้สระบนกับวรรณยุกต์ไทย ไม่งั้นโดนตัดหัว
      ใช้ 1.7 เท่าของขนาดตัวอักษร ซึ่งวัดจากข้อความที่มีของยากครบแล้ว */
export function textToPng(text, { fontSize, color, weight = 400 }) {
  const font = `${weight} ${fontSize * PNG_SCALE}px "FK Sarabun","Sarabun","Noto Sans Thai",sans-serif`;
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + 6;
  const h = Math.ceil(fontSize * PNG_SCALE * 1.7);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(w, 2);
  canvas.height = Math.max(h, 2);
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 3, h / 2);
  return { dataUrl: canvas.toDataURL("image/png"), w: w / PNG_SCALE, h: h / PNG_SCALE };
}

/* ความโปร่งของไฮไลต์ และความทึบของลายเซ็นกับรูป (รอบ 4 ปรับได้ต่อชิ้น)
   ‼️ ค่าเดียวนี้ใช้ทั้งบนจอ (drawOverlay) ภาพย่อ (paintMarks) และไฟล์ (stampMarks) จอกับไฟล์จึงตรงกันเสมอ
   0.38 มาจากการลองพิมพ์ดู ต่ำกว่านี้แทบไม่เห็นแถบ สูงกว่านี้เริ่มกลืนตัวอักษร (ของเก่าที่ไม่มีค่าใช้ 0.38) */
export const HL_ALPHA = 0.38;
export const hlAlpha = (e) => (Number.isFinite(e.alpha) ? e.alpha : HL_ALPHA);
export const stampAlpha = (e) => (Number.isFinite(e.alpha) ? e.alpha : 1);

const rgba = (hex, a) => { const c = hexToRgb01(hex); return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`; };

export const hexToRgb01 = (hex) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
};

export const MARK_STYLE = `
/* ช่องสีเป็นวงมีขอบเทาพร้อมรหัสสี (ฟ้าเคาะ 19/11/2026 , รอบ 4 พี่ปอนด์ "ไม่เอาคำว่าขาว เอาเป็นรหัสสีมาเลย")
   สีขาวบนแผงขาวเดิมดูเหมือนช่องว่าง ไม่รู้ว่ากดเลือกสีได้
   ‼️ ขอบต้องต่างจากพื้นแผงชัด วัดคอนทราสต์ใน tests/browser_pdfpages_edit.py */
.pe-swatch{display:flex;align-items:center;gap:10px;min-height:40px}
.field .pe-swatch input[type=color]{width:38px;height:38px;flex:none;padding:0;border-radius:50%;
  border:1.5px solid #6b7280;background:transparent;overflow:hidden;cursor:pointer}
.field .pe-swatch input[type=color]::-webkit-color-swatch-wrapper{padding:0}
.field .pe-swatch input[type=color]::-webkit-color-swatch{border:none;border-radius:50%}
.field .pe-swatch input[type=color]::-moz-color-swatch{border:none;border-radius:50%}
.pe-swatch-name{font-size:.9rem;color:var(--text,#111);font-variant-numeric:tabular-nums;letter-spacing:.02em}
.pe-left,.pe-right{display:flex;flex-direction:column;gap:10px}
.pe-thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:7px;
  max-height:330px;overflow:auto;padding:2px}
.pe-thumb{position:relative;border:2px solid var(--line-soft);border-radius:7px;overflow:hidden;
  cursor:pointer;background:#fff;padding:0;line-height:0}
.pe-thumb img{width:100%;height:auto;display:block}
.pe-thumb.on{border-color:var(--brand)}
.pe-thumb b{position:absolute;inset-block-end:2px;inset-inline-end:3px;font-size:10px;
  background:rgba(0,0,0,.6);color:#fff;border-radius:4px;padding:0 4px;line-height:15px;font-weight:700}
.pe-thumb .dot{position:absolute;inset-block-start:3px;inset-inline-start:3px;width:8px;height:8px;
  border-radius:50%;background:var(--brand);box-shadow:0 0 0 2px #fff}

/* เวทีแก้ไข หน้ากระดาษกับชั้นวาดทับต้องซ้อนกันพอดีเป๊ะ ไม่งั้นตำแหน่งเพี้ยน */
/* ‼️ เวทีต้องสูงเท่าหน้ากระดาษเป๊ะ ห้ามถูกบีบ (เจอจริง 18/09/2026)
   กล่องกลางเป็น flex column ที่มีเพดานความสูง เวทีจึงโดนหดจาก 954 เหลือ 631
   แต่ภาพข้างในยังสูง 954 ตามเดิม ผลคือชั้นวาดทับซึ่งอิงขนาดเวที เตี้ยกว่าภาพ 34%
   พิกัดที่คำนวณจากชั้นนั้นจึงเพี้ยนทั้งหมด ข้อความที่วางออกมาใหญ่กว่าที่เห็นบนจอ 53%
   flex:none บอกว่าอย่าหด แล้วปล่อยให้กล่องกลางเลื่อนแทน */
/* ‼️ ห้ามใส่ max-width:100% ที่เวที (เจอจริง 18/09/2026)
   เคยใส่ไว้ ผลคือกดซูมแล้วป้ายเปลี่ยนเป็น 200% แต่ภาพไม่ขยายสักนิด
   เพราะโดนเพดานความกว้างของกล่องแม่กดไว้ ซึ่งดูเผิน ๆ เหมือนปุ่มซูมเสีย
   ให้เวทีกว้างได้ตามที่สั่ง แล้วให้กล่องแม่เลื่อนแนวนอนแทน */
.pe-stage{position:relative;margin:0 auto;line-height:0;flex:none;
  box-shadow:var(--sh2);border-radius:4px;background:#fff}
/* ‼️ ต้อง align-items:start ไม่งั้นเวทีโดนยืดให้สูงเท่ากล่องเลื่อน
   ซึ่งเตี้ยกว่าหน้ากระดาษจริง แล้วชั้นวาดทับก็เตี้ยตาม พิกัดเพี้ยนเหมือนเดิมอีกรอบ
   เป็นกับดักเดียวกับที่เจอตอนแก้ flex:none ครั้งแรก แค่ย้ายมาอยู่ที่กล่องใหม่ */
/* ‼️ ห้าม justify-content:center (บั๊กเจอ 02/10/2026 ตอนทำตัวครอบตัด)
   ซูมจนหน้ากว้างกว่ากล่อง ส่วนที่ล้นทางซ้ายล้นออกฝั่งติดลบ เลื่อนไปดูไม่ได้เลย
   วัดจริงที่ 300%: หน้ากว้าง 2022px ในกล่อง 1020px ขอบซ้ายของหน้าหายไป 501px แก้หรือปิดทับตรงนั้นไม่ได้
   เวทีจัดกลางด้วย margin:0 auto อยู่แล้ว ซึ่งกลายเป็น 0 เองตอนหน้าใหญ่กว่ากล่อง */
.pe-scroll{overflow:auto;padding:10px;display:flex;align-items:flex-start}
.pe-stage canvas{display:block;width:100%;height:auto}
.pe-layer{position:absolute;inset:0;cursor:crosshair}
.pe-layer.text-mode{cursor:text}
.pe-box{position:absolute;box-sizing:border-box;cursor:move;touch-action:none}
.pe-box.moving{opacity:.75}
/* ── หน้าตาของที่วาง (รอบ 4 19/11/2026 พี่ปอนด์: "อยากให้มียืดขยาย แต่ไอฟ้า ๆ มันไม่ค่อยสวย") ──
   จุดจับกลมพื้นขาวขอบบางสีเน้นที่ 4 มุม เส้นกรอบเลือกบางเรียบ ปุ่มลบเล็กลอยเหนือมุม
   ‼️ ของบนจอต้องหน้าตาเหมือนในไฟล์ (พี่ปอนด์: "ตอนทำก็ไม่ควรเห็นเป็นทึบ ๆ คนใช้งงนะ")
      สีพื้นและความโปร่งมาจากค่าของชิ้นนั้นตรง ๆ ห้ามแต่งสีทับ เส้นประเป็น outline อยู่นอกเนื้อของ
      ไม่ใช้ mix-blend-mode เพราะในตัวดูของอยู่ในชั้นที่หมุนด้วย transform ซึ่งแยกการผสมสีออกจากภาพหน้า
      ไฮไลต์จึงทึบบนจอ (images/50.png) ทั้งที่ในไฟล์โปร่ง ใช้ความโปร่งธรรมดาค่าเดียวกับตอนเขียนไฟล์แทน */
.pe-grip{position:absolute;width:12px;height:12px;border-radius:50%;background:#fff;
  border:1.5px solid var(--brand);box-shadow:0 1px 3px rgba(15,23,42,.28);box-sizing:border-box;
  opacity:0;transition:opacity .12s;z-index:2;touch-action:none}
.pe-grip.se{inset-block-end:-6px;inset-inline-end:-6px;cursor:nwse-resize}
.pe-grip.sw{inset-block-end:-6px;inset-inline-start:-6px;cursor:nesw-resize}
.pe-grip.ne{inset-block-start:-6px;inset-inline-end:-6px;cursor:nesw-resize}
.pe-grip.nw{inset-block-start:-6px;inset-inline-start:-6px;cursor:nwse-resize}
.pe-box:hover .pe-grip,.pe-box.sel .pe-grip,.pe-box:focus-visible .pe-grip{opacity:1}
/* ข้อความตัวเล็ก จุดจับที่ขอบพอดีจะทับตัวอักษร (เห็นในภาพเทสรอบ 5 มือถือ) จึงดันจุดจับและกรอบออกนอกตัวอักษรอีกนิด */
.pe-box.text{outline-offset:3px}
.pe-box.text .pe-grip.se{inset-block-end:-11px;inset-inline-end:-11px}
.pe-box.text .pe-grip.sw{inset-block-end:-11px;inset-inline-start:-11px}
.pe-box.text .pe-grip.ne{inset-block-start:-11px;inset-inline-end:-11px}
.pe-box.text .pe-grip.nw{inset-block-start:-11px;inset-inline-start:-11px}
.pe-box.text .rm{inset-block-start:-30px;inset-inline-end:-8px}
@media (hover:none){ .pe-box.sel .pe-grip{opacity:1} }
/* ‼️ กล่องปิดทับมักเป็นสีขาวเพื่อกลืนกับกระดาษ ซึ่งแปลว่าบนจอก็มองไม่เห็นเหมือนกัน
   จึงมีเส้นประบาง ๆ รอบนอก (outline ไม่กินเนื้อกล่อง) ให้รู้ว่าปิดไปตรงไหน เส้นนี้อยู่แค่บนจอ ไม่ลงไฟล์ */
.pe-box.cover,.pe-box.highlight{outline:1px dashed color-mix(in srgb,var(--brand) 45%,transparent);outline-offset:0}
.pe-box.text:hover,.pe-box.stamp:hover{outline:1px dashed color-mix(in srgb,var(--brand) 45%,transparent)}
.pe-box.sel{outline:1.5px solid var(--brand);outline-offset:1px}
.pe-box.text.sel,.pe-box.text:hover{outline-offset:4px}
.pe-box.text{display:flex;align-items:center;white-space:pre;overflow:visible;
  font-family:"FK Sarabun","Sarabun","Noto Sans Thai",sans-serif;line-height:1.2}
.pe-ghost{position:absolute;box-sizing:border-box;pointer-events:none}
/* ข้อความที่กำลังพิมพ์ = ชิ้นจริงบนหน้า มีปุ่มลบกับจุดจับครบ (รอบ 5) ตอนว่างโชว์คำแนะนำจาง ๆ ให้รู้ว่าพิมพ์ตรงนี้ */
.pe-box.text.editing{background:color-mix(in srgb,#fff 72%,transparent);cursor:text}
.pe-txt.pe-edit{display:inline-block;position:relative;min-width:6em;min-height:1.2em;outline:none;
  white-space:pre;cursor:text;caret-color:var(--brand)}
.pe-txt.pe-edit:empty::before{content:attr(data-ph);position:absolute;inset-inline-start:0;opacity:.4;pointer-events:none}
.pe-pad{position:relative}
.pe-padclear{position:absolute;inset-block-start:6px;inset-inline-end:6px;width:32px;height:32px;padding:6px;
  border-radius:8px;border:1px solid var(--line,#d0d5dd);background:var(--card,#fff);color:var(--text,#111);
  cursor:pointer;display:grid;place-items:center}
.pe-padclear svg{width:18px;height:18px}
.pe-padclear:disabled{opacity:.35;cursor:default}
.pe-saved figure{touch-action:none;cursor:grab}
.pe-float{position:fixed;left:0;top:0;width:110px;pointer-events:none;opacity:.7;z-index:2000}
.pe-ghost.frame{outline:1.5px dashed var(--brand);background:color-mix(in srgb,var(--brand) 6%,transparent)}
/* ‼️ ปุ่มเอาออกโผล่เฉพาะตอนชี้ เลือก หรือโฟกัส (18/09/2026 เดิมโผล่ตลอด วางของใกล้กันปุ่มซ้อนกันจนบังงาน)
   ลอยเหนือมุมขวาบน ไม่ทับจุดจับมุม */
.pe-box .rm{position:absolute;inset-block-start:-24px;inset-inline-end:-2px;width:16px;height:16px;
  border-radius:50%;border:1px solid #fff;background:var(--danger,#c0392b);color:#fff;font-size:9px;
  line-height:14px;text-align:center;cursor:pointer;padding:0;box-shadow:0 1px 2px rgba(0,0,0,.25);
  opacity:0;transition:opacity .12s;z-index:3}
.pe-box:hover .rm,.pe-box.sel .rm,.pe-box .rm:focus-visible{opacity:1}
@media (hover:none){ .pe-box.sel .rm{opacity:1} }
.pe-zoom{font-size:12.5px;font-weight:700;min-width:46px;text-align:center;
  color:var(--text-mute);font-variant-numeric:tabular-nums}
/* ── ของที่วางทับได้ นอกจากกล่องปิดทับกับข้อความ (เฟส 6 รวมเครื่องมือ 21/09/2026) ──
   ‼️ ไฮไลต์ต้อง "โปร่ง" จริงทั้งบนจอและในไฟล์ ไม่งั้นมันคือกล่องปิดทับที่เปลี่ยนสี
      ซึ่งจะกลืนข้อความข้างใต้หายไป = ตรงข้ามกับสิ่งที่คำว่าไฮไลต์สัญญาไว้ */
.pe-box.stamp{line-height:0}
.pe-box.stamp img{width:100%;height:auto;display:block;pointer-events:none}
.pe-sign{display:flex;flex-direction:column;gap:8px}
.pe-right .row.pe-modes,.row.pe-modes{display:grid;grid-template-columns:1fr 1fr;gap:var(--sp3,12px) var(--sp2,8px);align-items:stretch}
/* แถวห่าง 12px เพราะปุ่มที่เลือกอยู่ลอยขึ้น 2px ระยะที่ตาเห็นจึงยังเกิน 8px */
.pe-modes > .btn{width:100%;min-width:0;justify-content:center;white-space:nowrap;padding-inline:10px;margin:0}
.pe-sign .sign-canvas{border:1px dashed var(--line);border-radius:var(--r-sm,10px);background:#fff;touch-action:none}
.pe-saved{display:flex;flex-wrap:wrap;gap:8px}
.pe-saved figure{position:relative;margin:0;border:1px solid var(--line);border-radius:8px;
  padding:4px 6px;background:#fff;cursor:pointer;line-height:0}
.pe-saved figure.on{border-color:var(--brand);box-shadow:0 0 0 2px color-mix(in srgb,var(--brand) 25%,transparent)}
.pe-saved img{height:34px;width:auto;display:block;
  background:repeating-conic-gradient(#e9ecf1 0 25%,#fff 0 50%) 0 0/8px 8px}
/* ลายตารางหลังภาพย่อ ให้เห็นว่าส่วนไหนโปร่ง (สวิตช์ลบพื้นขาว รอบ 6) */
.pe-up{display:flex;flex-direction:column;gap:var(--sp1,4px)}
.pe-uprow{display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp2,8px) var(--sp3,12px)}
.pe-switch{display:inline-flex;align-items:center;gap:var(--sp2,8px);font-size:13.5px;cursor:pointer}
.pe-switch-in{appearance:none;width:34px;height:20px;border-radius:999px;background:var(--line,#c9ced6);
  position:relative;cursor:pointer;margin:0;transition:background .15s;flex:none}
.pe-switch-in::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;
  background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
.pe-switch-in:checked{background:var(--brand)}
.pe-switch-in:checked::after{transform:translateX(14px)}
.pe-switch-in:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.pe-upname{font-size:12.5px;color:var(--text-mute,#667);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pe-oneline{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12.5px}
.pe-saved .x{position:absolute;inset-block-start:-7px;inset-inline-end:-7px;width:17px;height:17px;
  border-radius:50%;border:0;background:var(--danger,#c0392b);color:#fff;font-size:10px;line-height:17px;
  padding:0;cursor:pointer}
.pe-grp[hidden]{display:none}
/* ‼️ แถบเลื่อนปรับขนาดกว้าง 0 จนมองไม่เห็นและลากไม่ได้ (จับค่าจริง 21/09/2026 ได้ w=0)
   input[type=range] ไม่มีความกว้างในตัวเอง พอถูกวางใน flex row ที่ไม่ได้บอกความกว้าง
   มันจึงยุบเหลือศูนย์ แล้วดูเหมือน "ไม่มีช่องนี้" มากกว่าดูเหมือนของพัง
   แก้ที่ field ให้ยืดเต็มแถว แล้วตัวแถบเลื่อนกว้างเต็ม field */
.pe-right .row{align-items:end}
.pe-right .row > .field{flex:1 1 auto;min-width:0}
.pe-right input[type=range]{width:100%;min-width:120px}
.pe-val{font-size:12.5px;font-weight:700;min-width:42px;text-align:end;color:var(--text-mute);font-variant-numeric:tabular-nums}
.pe-hint{font-size:12.5px;line-height:1.6;color:var(--text-mute);padding:9px 12px;
  background:var(--bg-soft);border:1px solid var(--line-soft);border-radius:var(--r-sm,10px)}
`;

/** ประทับของทุกชิ้นของหน้าหนึ่งลงหน้า pdf-lib
 *  marks = [{ kind, x, y, w, h, rw, text, size, color, weight, url }] สัดส่วนของหน้าที่เห็น (pdf.js)
 *  cache = Map ที่ใช้ร่วมทั้งเอกสาร ภาพเดียวกันฝังครั้งเดียว (รุ่นเดิมฝังลายเซ็นเดิมซ้ำทุกครั้งที่วาง)
 *  ‼️ ตำแหน่งเป็นสัดส่วนของ "หน้าที่เห็น" ซึ่ง pdf.js หมุนตาม /Rotate และตัดตาม CropBox แล้ว
 *     รุ่นเดิมคูณกับ getSize() ตรง ๆ หน้าหมุน 90 ลายเซ็นคลาดจากที่เห็น 48% ของหน้า หน้าที่ CropBox ไม่เริ่มที่ 0 คลาด 3%
 *     (วัดจริง 19/11/2026 tests/browser_pdfedit_rotated.py) หน้าปกติได้ตัวเลขเท่าสูตรเดิม (tests/pdfgeom.test.mjs ข้อ ⑤) */
export async function stampMarks(doc, page, marks, cache = new Map()) {
  const { rgb, degrees } = PDFLib;
  const embed = async (url) => {
    if (!cache.has(url)) cache.set(url, await doc.embedPng(url));
    return cache.get(url);
  };
  const rot = srcRotation(page), box = shownBox(page), vs = viewSize(box, rot);
  for (const e of marks) {
    if (e.kind === "cover" || e.kind === "highlight") {
      const c = hexToRgb01(e.color);
      const q = viewRectToRaw({ x: e.x, y: e.y, w: e.w, h: e.h }, rot, box);
      page.drawRectangle({
        x: q.x, y: q.y, width: q.w, height: q.h,
        color: rgb(c.r, c.g, c.b),
        /* ‼️ ไฮไลต์ต้องโปร่งจริงในไฟล์ด้วย ไม่ใช่แค่บนจอ
           ถ้าทึบ ตัวหนังสือใต้แถบจะหายไปเลย ซึ่งไม่ใช่สิ่งที่คำว่าไฮไลต์หมายถึง
           0.38 มาจากการลองพิมพ์ดู ต่ำกว่านี้แทบไม่เห็นแถบ สูงกว่านี้เริ่มกลืนตัวอักษร */
        opacity: e.kind === "highlight" ? hlAlpha(e) : 1,
      });
      continue;
    }
    /* ภาพ PNG พื้นโปร่ง วางโดยให้จุดที่ผู้ใช้คลิกเป็นกึ่งกลางแนวตั้ง
       ความสูงคำนวณจากสัดส่วนจริงของภาพ ไม่ใช่เดา ไม่งั้นลายเซ็นจะแบนหรือยืด */
    let png, w, h;
    if (e.kind === "stamp") {
      png = await embed(e.url);
      w = e.rw * vs.w;
      h = (png.height / png.width) * w;
    } else {
      const t = textToPng(e.text, { fontSize: e.size, color: e.color, weight: e.weight });
      png = await embed(t.dataUrl);
      w = t.w; h = t.h;
    }
    /* ของที่วางบนหน้าที่หมุนอยู่ (up) หมุนรอบจุดยึดของตัวเอง ข้อความยึดกึ่งกลางขอบซ้าย ภาพยึดกึ่งกลาง
       up 0 ใช้สูตรเดิมของ pdf-edit ทุกตัว ผลไฟล์ปกติจึงไม่เปลี่ยน (tests/browser_pdfedit_golden.py) */
    const at = e.up
      ? (e.kind === "stamp"
        ? placeAt((e.x + e.rw / 2) * vs.w, e.y * vs.h, w, h, 0.5, 0.5, e.up, rot, box)
        : placeAt(e.x * vs.w, e.y * vs.h, w, h, 0, 0.5, e.up, rot, box))
      : placeUpright({ x: e.x, y: e.y - h / 2 / vs.h, w: w / vs.w, h: h / vs.h }, rot, box);
    page.drawImage(png, { x: at.x, y: at.y, width: at.width, height: at.height,
                          ...(at.rotate ? { rotate: degrees(at.rotate) } : {}),
                          ...(e.kind === "stamp" && stampAlpha(e) < 1 ? { opacity: stampAlpha(e) } : {}) });
  }
}

/** คีย์ลัดของตัวแก้ไข ‼️ เขียนเฉพาะคีย์ที่มีอยู่จริงในโค้ด บอกคีย์ที่ไม่มีจริง แย่กว่าไม่บอกเลย */
export const markKeyHints = () => [
  ["Del", tr("ลบสิ่งที่เลือก", "Delete selected")],
  ["\u2190 \u2191 \u2192 \u2193", tr("ขยับทีละนิด", "Nudge")],
  ["Shift + \u2190", tr("ขยับทีละมาก", "Move further")],
  ["Alt + \u2190", tr("ย่อขยายกล่องปิดทับ", "Resize the cover box")],
];

/**
 * สร้างตัวแก้ไข 1 ชุด
 * @param host {
 *   st            แถบสถานะของเครื่องมือ
 *   ready()       มีเอกสารเปิดอยู่ไหม
 *   list()        ของที่วางบนหน้าที่เห็นอยู่ (ตัวจริง ห้ามคัดลอก)
 *   add(m)        เพิ่มของลงหน้าที่เห็นอยู่ , remove(m) เอาออก
 *   undo() clearPage()  เจ้าของกองย้อนคือ host
 *   thumbs() sync()     ให้ host วาดภาพย่อใหม่ และปรับปุ่ม
 * }
 */
export function createMarkEditor(host) {
  const { st } = host;
  let pageSize = null;       // ขนาดหน้าที่เห็นเป็นหน่วย PDF ใช้คิดขนาดตัวอักษรบนจอ
  let zoom = 1;            // ระดับซูมปัจจุบัน ดูค่าที่ใช้ได้ที่ ZOOMS
  let fitWidth = 0;        // ความกว้างที่ทำให้หน้าพอดีกล่องกลาง ใช้เป็นฐานของซูม 1 เท่า
  const stage = el("div", { class: "pe-stage", hidden: true });
  const viewCanvas = el("canvas", {});
  const layer = el("div", { class: "pe-layer" });
  stage.append(viewCanvas, layer);
  const scroller = el("div", { class: "pe-scroll" }, [stage]);

  const modeSeg = segmentedModes();
  const textInput = el("input", { type: "text", placeholder: tr("ไม่ต้องใส่ก็ได้ พิมพ์บนหน้าได้เลย", "Optional, you can type on the page") });
  const SIZES = [8, 10, 12, 14, 16, 18, 22, 28, 36, 48, 72];
  const sizeSel = select(SIZES.map((n) => [String(n), String(n)]), "14");
  const weightSel = select([["400", tr("ปกติ", "Regular")], ["700", tr("หนา", "Bold")]], "400");
  const textColor = el("input", { type: "color", value: "#000000" });
  const coverColor = el("input", { type: "color", value: "#ffffff" });
  const hlColor = el("input", { type: "color", value: "#ffe14d" });
  /** วงสีพร้อมรหัสสีตัวพิมพ์ใหญ่ เช่น #FFFFFF (รอบ 4 พี่ปอนด์ไม่เอาชื่อสี) */
  const swatchSyncs = [];
  const swatch = (input) => {
    const name = el("span", { class: "pe-swatch-name" });
    const sync = () => { name.textContent = input.value.toUpperCase(); };
    input.addEventListener("input", sync);
    input.addEventListener("change", sync);
    swatchSyncs.push(sync);
    sync();
    return el("span", { class: "pe-swatch" }, [input, name]);
  };
  /** แถบเลื่อนเปอร์เซ็นต์พร้อมตัวเลข */
  const pct = (min, max, val) => {
    const input = el("input", { type: "range", min: String(min), max: String(max), value: String(val), step: "1" });
    const out = el("span", { class: "pe-val" }, `${val}%`);
    const sync = () => { out.textContent = `${input.value}%`; };
    input.addEventListener("input", sync);
    return { input, out, sync };
  };
  const hlPct = pct(15, 80, Math.round(HL_ALPHA * 100));       // ความเข้มไฮไลต์
  const stampPct = pct(20, 100, 100);                          // ความทึบลายเซ็นกับรูป
  /* ‼️ ความกว้างของลายเซ็นกับรูป เก็บเป็นสัดส่วนของหน้า ไม่ใช่พิกเซล
     หน้ากระดาษบนจอย่อขยายได้ ถ้าเก็บเป็นพิกเซลของจอ ขนาดที่ได้ในไฟล์จะไม่ตรงกับที่เห็น */
  /* ‼️ ค่าเริ่มต้น 20% ของความกว้างหน้า (รอบ 5 พี่ปอนด์: "มันดูใหญ่เกินไปไหม" รุ่นก่อน 22% และค้างค่าที่ลากไว้ 40%) */
  const stampSize = el("input", { type: "range", min: "5", max: "60", value: "20", step: "1" });
  const stampSizeVal = el("span", { class: "pe-zoom" }, "20%");
  stampSize.addEventListener("input", () => { stampSizeVal.textContent = stampSize.value + "%"; });

  let stampUrl = null;            // PNG พื้นโปร่งของลายเซ็นหรือรูปที่เลือกอยู่
  const pad = signaturePad({ onChange: () => { padUse.disabled = pad.isEmpty(); padClear.disabled = pad.isEmpty(); } });
  const padUse = button(tr("ใช้ลายเซ็นนี้", "Use this signature"), { onclick: () => {
    const url = pad.toDataURL();
    if (!url) return st.err(tr("ยังไม่ได้วาดลายเซ็น", "Nothing drawn yet"));
    keep(url); pad.clear();
    pickStamp(url); renderSaved();
  } });
  padUse.disabled = true;
  /* ‼️ ปุ่มลบเส้นเป็นไอคอนถังขยะที่มุมขวาบนของกระดานเอง แบบช่องเซ็นทั่วไป (รอบ 5 พี่ปอนด์: "ล้างกระดาน
     ควรเป็นสัญลักษณ์แทนไหม อธิบายแล้วงง") ปิดไว้ตอนกระดานว่าง ไม่ให้กดแล้วเงียบ */
  const padClear = el("button", { class: "pe-padclear", type: "button", disabled: "",
    title: tr("ลบเส้นที่วาด", "Erase the drawing"), "aria-label": tr("ลบเส้นที่วาด", "Erase the drawing"),
    onclick: () => { pad.clear(); } }, [uiIcon("trash")]);
  /* ── ลายเซ็นกับรูปรวมเป็นเครื่องมือเดียว (รอบ 6 พี่ปอนด์: "รูปกับลายเซ็นคล้ายกันมาก รวมกันอันเดียวดีไหม") ──
     อัปโหลดปุ่มเดียวรับทั้งรูปทั่วไปและรูปลายเซ็นสแกน สวิตช์ลบพื้นขาวปิดไว้ก่อน
     ‼️ เดิมปุ่มอัปโหลดลายเซ็นถอดพื้นขาวเสมอ ส่วนปุ่มรูปไม่ถอดเลย เพราะโลโก้ที่มีพื้นขาวจงใจจะเป็นรู
        รวมแล้วจึงให้คนเลือกเอง และเห็นผลในภาพย่อก่อนวาง สลับสวิตช์หลังอัปโหลดก็ทำรูปล่าสุดใหม่ให้
     ของที่วาดและที่อัปโหลดอยู่ช่อง "ที่บันทึกไว้" ช่องเดียว เก็บในที่เก็บเดิมของลายเซ็น (filekit-signatures)
     ของเดิมของผู้ใช้จึงอยู่ครบโดยไม่ต้องย้าย รูปใหญ่จนที่เก็บของเบราว์เซอร์ไม่พอ ยังอยู่ในช่องจนปิดหน้า */
  const sessionOnly = [];                 // อัปโหลดแล้วเก็บลงเครื่องไม่ได้ (ใหญ่เกินที่เก็บ) ใช้ได้จนปิดหน้า
  const uploaded = new Set();             // ชิ้นที่มาจากการอัปโหลด (ป้ายบอกว่าเป็นรูป ไม่ใช่ลายเซ็น)
  let lastUpload = null;                  // { file, url } รูปล่าสุด ไว้ทำใหม่ตอนสลับสวิตช์
  const allSaved = () => [...new Set([...sessionOnly, ...savedSignatures()])];
  function keep(url) {
    saveSignature(url);
    if (!savedSignatures().includes(url)) sessionOnly.unshift(url);
  }
  function forget(url) {
    removeSignature(url);
    const i = sessionOnly.indexOf(url); if (i >= 0) sessionOnly.splice(i, 1);
  }
  const whiteOff = el("input", { type: "checkbox", class: "pe-switch-in" });
  const whiteSwitch = el("label", { class: "pe-switch" }, [whiteOff, el("span", {}, tr("ลบพื้นขาว", "Remove white background"))]);
  const upName = el("span", { class: "pe-upname", hidden: true });
  async function prepUpload(file) {
    const url = whiteOff.checked ? await imageToSignature(file) : await fileToPng(file);
    return shrink(url, 1600);
  }
  const upInput = el("input", { type: "file", accept: "image/*", hidden: true,
    onchange: async (ev) => {
      const f = ev.target.files[0]; ev.target.value = "";
      if (!f) return;
      try {
        st.info(tr("กำลังเตรียมรูป…", "Preparing the image…"));
        const url = await prepUpload(f);
        lastUpload = { file: f, url };
        uploaded.add(url); keep(url);
        upName.textContent = f.name || ""; upName.hidden = !f.name;
        pickStamp(url); st.clear();
        st.ok(tr("เพิ่มในที่บันทึกไว้แล้ว ลากมาวางบนหน้า หรือลากกรอบบนหน้าให้รูปลงพอดีกรอบ",
                 "Added to Saved. Drag it onto the page, or drag a box on the page to fit it"));
      } catch (e) { st.err(tr("อ่านรูปไม่ได้: ", "Couldn't read the image: ") + e.message); }
    } });
  whiteOff.addEventListener("change", async () => {
    if (!lastUpload) return;
    try {
      const old = lastUpload.url, url = await prepUpload(lastUpload.file);
      forget(old); uploaded.delete(old);
      lastUpload.url = url; uploaded.add(url); keep(url);
      if (stampUrl === old || !stampUrl) pickStamp(url); else renderSaved();
    } catch (e) { st.err(tr("อ่านรูปไม่ได้: ", "Couldn't read the image: ") + e.message); }
  });
  const upBtn = button(tr("อัปโหลดรูป", "Upload an image"), { ghost: true, icon: "upload", onclick: () => upInput.click() });
  const savedBox = el("div", { class: "pe-saved" });

  /** ย่อรูปที่ด้านยาวเกิน max ให้เหลือ max พิกเซล (เก็บลงเครื่องได้ ไฟล์ไม่บวม) */
  function shrink(url, max) {
    return new Promise((ok) => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
        if (k >= 1) return ok(url);
        const c = document.createElement("canvas");
        c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        ok(c.toDataURL("image/png"));
      };
      im.onerror = () => ok(url);
      im.src = url;
    });
  }

  /** แปลงไฟล์รูปอะไรก็ได้เป็น PNG (pdf-lib ฝังได้แน่นอนทั้ง PNG และ JPEG แต่ PNG เก็บความโปร่งไว้) */
  async function fileToPng(file) {
    // ‼️ ผ่าน decodeImage ไม่ใช่ createImageBitmap ตรง ๆ ไม่งั้นรูป HEIC จากไอโฟนอ่านไม่ได้บน Chrome และ Android
    const bmp = await decodeImage(file);
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    c.getContext("2d").drawImage(bmp, 0, 0);
    bmp.close?.();
    return c.toDataURL("image/png");
  }

  /* ‼️ รอบ 6 เอาช่องตัวอย่างรูปแยกออก เดิม replaceChildren(null) พิมพ์คำว่า null ใต้ปุ่มเลือกไฟล์รูป
     (จับจริงบน v248: กดใช้ลายเซ็นนี้แล้วสลับไปเครื่องมือรูป ช่องนั้นขึ้น "null") ตอนนี้ทุกชิ้นอยู่ช่องที่บันทึกไว้ */
  function pickStamp(url) {
    stampUrl = url;
    renderSaved();
  }
  const whatOf = (url) => (uploaded.has(url) ? "image" : "sign");

  function renderSaved() {
    const list = allSaved();
    savedBox.replaceChildren(...list.map((url) => {
      const fig = el("figure", { class: url === stampUrl ? "on" : "", role: "button", tabindex: "0",
        "aria-label": tr("ใช้ชิ้นนี้ ลากไปปล่อยบนหน้าเพื่อวางได้", "Use this one, or drag it onto the page"),
        title: tr("คลิกเพื่อเลือก หรือลากไปปล่อยบนหน้า", "Click to pick, or drag onto the page"),
        onkeydown: (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pickStamp(url); } } }, [
        el("img", { src: url, alt: tr("ที่บันทึกไว้", "Saved item") }),
        el("button", { class: "x", type: "button", "aria-label": tr("ลบชิ้นนี้ออกจากที่บันทึกไว้", "Remove this from Saved"),
          onclick: (ev) => { ev.stopPropagation(); forget(url);
            if (stampUrl === url) stampUrl = null; renderSaved(); } }, "\u2715"),
      ]);
      dragToPage(fig, url, whatOf(url), () => pickStamp(url));
      return fig;
    }));
    if (!list.length) savedBox.replaceChildren(el("div", { class: "pe-hint" },
      tr("ยังไม่มี วาดลายเซ็นในกรอบด้านบน หรืออัปโหลดรูป",
         "Nothing yet. Draw a signature above, or upload an image")));
  }

  function segmentedModes() {
    /* รอบ 6 เหลือ 4 เครื่องมือ เรียงตาราง 2x2 ทั้งตัวดูและหน้าแก้ไขและเซ็น */
    const wrap = el("div", { class: "row pe-modes" });
    const mk = (v, label, icon) => {
      const b = button(label, { icon, ghost: true, onclick: () => setMode(v) });
      b.dataset.mode = v;
      return b;
    };
    /* ‼️ เฟส 6 (21/09/2026) รวมงาน "วางของทับหน้า PDF" มาไว้ที่เดียว
       เดิมแยกเป็นสองเครื่องมือ (แก้ข้อความ กับ เซ็นชื่อ) ซึ่งเป็นงานเดียวกันในสายตาผู้ใช้
       คนที่ต้องแก้วันที่แล้วเซ็นด้วย ต้องบันทึกไฟล์แล้วเปิดอีกเครื่องมือหนึ่ง แล้วอัปโหลดใหม่
       = สองรอบสำหรับงานเดียว และไฟล์ผ่านการบันทึกซ้ำโดยไม่จำเป็น */
    wrap.append(
      mk("cover", tr("ปิดทับ", "Cover"), "trash"),
      mk("text", tr("ข้อความ", "Text"), "edit"),
      mk("highlight", tr("ไฮไลต์", "Highlight"), "rows"),
      mk("sign", tr("ลายเซ็นและรูป", "Signature and image"), "stack"),
    );
    return wrap;
  }
  let mode = "cover";
  const MODE_HINT = () => ({
    cover: tr("ลากคลุมข้อความที่ต้องการลบ", "Drag over the text you want to remove"),
    text: tr("ลากกรอบหรือคลิกบนหน้า แล้วพิมพ์ได้เลย กด Enter เมื่อเสร็จ", "Drag a box or click on the page, then type. Press Enter when done"),
    highlight: tr("ลากคลุมข้อความที่อยากเน้น ตัวหนังสือใต้แถบยังอ่านออก",
                  "Drag over the text you want to mark. The text underneath stays readable"),
    sign: tr("วาดลายเซ็นหรืออัปโหลดรูปด้านขวา ลากจากที่บันทึกไว้มาวางบนหน้า หรือเลือกแล้วลากกรอบบนหน้า",
             "Draw a signature or upload an image, then drag it from Saved onto the page, or pick it and drag a box"),
  }[mode] || "");
  function setMode(v) {
    if (v === "image") v = "sign";      // เครื่องมือรูปเดิมรวมเข้าลายเซ็นแล้ว (รอบ 6) ที่เรียกชื่อเดิมยังเปิดได้
    mode = v;
    layer.classList.toggle("text-mode", v === "text");
    modeSeg.querySelectorAll("button").forEach((b) => {
      const on = b.dataset.mode === v;
      b.classList.toggle("ghost", !on);
      b.setAttribute("aria-pressed", String(on));
    });
    /* ‼️ โชว์เฉพาะตัวเลือกของเครื่องมือที่เลือกอยู่ ไม่ใช่กองทุกกลุ่มไว้ตลอด
       ห้าเครื่องมือรวมกันมีตัวเลือกสิบกว่าช่อง ถ้าโชว์หมดพร้อมกันแผงจะกลายเป็นกำแพง
       และคนจะหาไม่เจอว่าช่องไหนเป็นของเครื่องมือที่กำลังใช้ */
    for (const g of groups) g.node.hidden = !g.modes.includes(v);
    /* ‼️ เปิดแผงลายเซ็นแล้วกระดานต้องอยู่ในจอโดยไม่ต้องเลื่อน (รอบ 5 พี่ปอนด์กดล้างแล้ว "ไม่มีอะไรเกิดขึ้น"
       เพราะกระดานอยู่เหนือส่วนที่เห็นของแผง) เลื่อนเฉพาะกล่องแผงที่เลื่อนได้ ไม่เลื่อนทั้งหน้าเว็บ */
    /* ‼️ วาดช่องที่บันทึกไว้ใหม่ทุกครั้งที่เปิดเครื่องมือนี้ (รอบ 6 จับได้: v248 ไม่เคยวาดตอนเปิดหน้า
       ของที่บันทึกไว้จากครั้งก่อนจึงไม่โผล่จนกว่าจะวาดหรืออัปโหลดชิ้นใหม่) */
    if (v === "sign") { renderSaved(); requestAnimationFrame(() => revealInPanel(pad.node.parentElement)); }
    if (v !== "text" && selected && selected.kind === "text") setSelected(null);
    st.info(MODE_HINT());
  }

  function revealInPanel(node) {
    let box = node.parentElement;
    while (box && !(box.scrollHeight > box.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
    if (!box || box === document.scrollingElement || box === document.body) return;
    const r = node.getBoundingClientRect(), b = box.getBoundingClientRect();
    const vis = { top: Math.max(b.top, 0), bottom: Math.min(b.bottom, innerHeight) };
    if (r.top < vis.top) box.scrollTop -= vis.top - r.top + 8;
    else if (r.bottom > vis.bottom) box.scrollTop += Math.min(r.bottom - vis.bottom + 8, r.top - vis.top - 8);
  }

  const zoomOutBtn = button("-", { ghost: true, label: tr("ซูมออก", "Zoom out"), onclick: () => stepZoom(-1) });
  const zoomLabel = el("span", { class: "pe-zoom" }, "100%");
  const zoomInBtn = button("+", { ghost: true, label: tr("ซูมเข้า", "Zoom in"), onclick: () => stepZoom(1) });
  const fitBtn = button(tr("พอดีหน้า", "Fit"), { ghost: true, onclick: () => setZoom(1) });

  /* ความกว้างพอดีกล่องกลาง
     ‼️ ตอนเปิดไฟล์ครั้งแรกกล่องกลางยังไม่โผล่ (สลับหน้าเป็นหน้าทำงานทีหลัง) กว้าง 0 จึงตกไปค่าสำรอง 700
        จอ 360 ได้หน้ากว้าง 674 ล้นจอ (ล่าบั๊ก F8 08/11/2026 tests/browser_pdfedit_save_ready.py)
        จึงคำนวณใหม่ทุกครั้งที่กล่องกลางเปลี่ยนขนาด ซูมที่ผู้ใช้ตั้งไว้คงสัดส่วนเดิมเทียบกับพอดีหน้า */
  let pageViewW = 0;
  const fitFor = () => Math.max(240, Math.min(pageViewW, (scroller.clientWidth || 700) - 26));
  new ResizeObserver(() => {
    if (!pageViewW || !scroller.clientWidth) return;
    const f = fitFor();
    if (Math.abs(f - fitWidth) > 1) { fitWidth = f; applyZoom(); }
  }).observe(scroller);

  function stepZoom(dir) {
    const i = ZOOMS.indexOf(zoom);
    const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? 1 : i) + dir))];
    setZoom(next);
  }
  function setZoom(z) {
    zoom = z;
    applyZoom();
    st.ok(tr(`ซูม ${Math.round(z * 100)}%`, `Zoom ${Math.round(z * 100)}%`));
  }
  /* ‼️ ซูมต้องเปลี่ยนแค่ "ความกว้างที่แสดง" ไม่ใช่เรนเดอร์ภาพใหม่
     เรนเดอร์ใหม่ทุกครั้งที่กดซูมจะหน่วงเป็นวินาทีกับไฟล์ที่มีรูปเยอะ
     ภาพที่เรนเดอร์ไว้ละเอียดกว่าจออยู่แล้ว ขยายด้วย CSS จึงยังคมพอ */
  function applyZoom() {
    if (!fitWidth) return;
    /* ซูมรอบกึ่งกลางที่มองอยู่ในแนวนอน ไม่งั้นพอเลิก justify-content:center แล้ว
       กดซูมเข้าทีไรภาพจะไปค้างที่ขอบซ้ายของหน้าแทนตรงกลางที่ดูอยู่ */
    const sr = scroller.getBoundingClientRect(), r0 = stage.getBoundingClientRect();
    const cx = sr.left + scroller.clientWidth / 2;
    const fx = r0.width ? (cx - r0.left) / r0.width : 0.5;
    stage.style.width = `${Math.round(fitWidth * zoom)}px`;
    const r1 = stage.getBoundingClientRect();
    if (r1.width) scroller.scrollLeft += r1.left + fx * r1.width - cx;
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    zoomOutBtn.disabled = zoom <= ZOOMS[0];
    zoomInBtn.disabled = zoom >= ZOOMS[ZOOMS.length - 1];
    drawOverlay();
  }

  /* ‼️ ทางเลือกที่ไม่ต้องลากเลย (WCAG 2.5.7) วางกลางหน้าก่อนแล้วค่อยกดลูกศรขยับ
     เดิมวางกล่องปิดทับได้ทางเดียวคือลากคลุมพื้นที่ คนที่ลากไม่ได้จึงใช้เครื่องมือนี้ไม่ได้เลย */
  const placeMidBtn = button(tr("วางกลางหน้า", "Place in the middle"), { icon: "plus", ghost: true,
    onclick: () => {
      if (!host.ready()) return st.err(tr("เลือกไฟล์ก่อน", "Choose a file first"));
      if (mode === "text") { textAt({ x: 0.4, y: 0.45 }); if (editing) return; }
      else if (mode === "sign" || mode === "image") placeStamp({ x: 0.5, y: 0.5 });
      else {
        const hl = mode === "highlight";
        host.add({ kind: hl ? "highlight" : "cover", x: 0.35, y: 0.45, w: 0.3, h: 0.06,
                     color: hl ? hlColor.value : coverColor.value });
        drawOverlay(); host.thumbs(); host.sync();
      }
      const boxes = layer.querySelectorAll(".pe-box");
      if (boxes.length) boxes[boxes.length - 1].focus();
      st.ok(tr("วางแล้ว กดปุ่มลูกศรเพื่อขยับ กด Alt ค้างพร้อมลูกศรเพื่อปรับขนาด",
               "Placed. Arrow keys move it, hold Alt with the arrows to resize"));
    } });
  const undoBtn = button(tr("ย้อนล่าสุด", "Undo last"), { icon: "undo", ghost: true, onclick: () => host.undo() });
  const clearBtn = button(tr("ล้างหน้านี้", "Clear page"), { icon: "trash", ghost: true, onclick: () => host.clearPage() });
  [placeMidBtn, undoBtn, clearBtn].forEach((b) => { b.disabled = true; });

  const textField = field(tr("ข้อความ", "Text"), textInput,
    tr("ลากกรอบบนหน้าแล้วพิมพ์ในกรอบได้เลย ดับเบิลคลิกข้อความเพื่อแก้", "Drag a box on the page and type in it. Double click a text to edit it"));
  /* กลุ่มตัวเลือกของแต่ละเครื่องมือ · setMode() เป็นคนเปิดปิดให้ */
  const grp = (modes, children) => ({ modes, node: el("div", { class: "pe-grp" }, children) });
  const groups = [
    grp(["text"], [
      el("h3", {}, tr("ข้อความที่จะใส่", "Text to add")),
      textField,
      el("div", { class: "row" }, [
        field(tr("ขนาด", "Size"), sizeSel),
        field(tr("น้ำหนัก", "Weight"), weightSel),
        field(tr("สีตัวอักษร", "Text colour"), swatch(textColor)),
      ]),
    ]),
    grp(["cover"], [
      el("h3", {}, tr("สีที่ใช้ปิดทับ", "Cover colour")),
      field(tr("สี", "Colour"), swatch(coverColor),
        tr("ปกติใช้สีขาวให้กลืนกับกระดาษ", "White usually blends with the paper")),
      el("div", { class: "pe-hint" },
        tr("ปิดทับคือวางสี่เหลี่ยมทับข้อความเดิม ตัวอักษรเดิมยังอยู่ในไฟล์",
           "Cover puts a rectangle over the old text. The original text stays in the file")),
    ]),
    grp(["highlight"], [
      el("h3", {}, tr("สีไฮไลต์", "Highlight colour")),
      field(tr("สี", "Colour"), swatch(hlColor)),
      el("div", { class: "row" }, [field(tr("ความเข้ม", "Strength"), hlPct.input), hlPct.out]),
      el("div", { class: "pe-hint" },
        tr("แถบไฮไลต์โปร่งแสง ตัวหนังสือใต้แถบยังอ่านออกและยังค้นหาเจอ",
           "The band is translucent, so the text underneath stays readable and searchable")),
    ]),
    grp(["sign"], [
      el("h3", {}, tr("ลายเซ็นและรูป", "Signature and image")),
      el("div", { class: "pe-sign" }, [el("div", { class: "pe-pad" }, [pad.node, padClear]),
        el("div", { class: "row" }, [padUse]),
        el("div", { class: "pe-up" }, [el("div", { class: "pe-uprow" }, [upBtn, whiteSwitch]), upName, upInput])]),
      el("h3", {}, tr("ที่บันทึกไว้", "Saved")),
      savedBox,
      el("div", { class: "pe-hint pe-oneline" },
        tr("ภาพวางทับ ไม่ใช่ลายเซ็นดิจิทัลที่มีใบรับรอง", "An image on the page, not a certified digital signature")),
      el("div", { class: "row" }, [field(tr("ความกว้างบนหน้า", "Width on the page"), stampSize), stampSizeVal]),
      el("div", { class: "row" }, [field(tr("ความทึบ", "Opacity"), stampPct.input), stampPct.out]),
    ]),
  ];
  const rightNode = el("div", { class: "pe-right" }, [
    el("div", {}, [el("h3", {}, tr("เครื่องมือ", "Tool")), modeSeg]),
    ...groups.map((g) => g.node),
  ]);

  /* วาดกล่องที่แก้ไว้ทับบนหน้า
     ‼️ ใช้หน่วยเปอร์เซ็นต์ ไม่ใช่พิกเซล เพราะเวทีย่อขยายตามความกว้างจอ
        ถ้าเก็บเป็นพิกเซลของจอ พอจอเปลี่ยนขนาดกล่องจะเลื่อนไปคนละที่ */
  /* ── จุดที่ host ปรับได้ (เฟส 2 19/11/2026 ตัวดูหน้าใหญ่ของจัดการหน้า PDF ใช้ตัวแก้ไขนี้ร่วม) ──
     ตัวดูวางชั้นนี้ไว้ในกระดาษที่ถูกหมุนและครอบด้วย CSS ทั้งแผ่น ของเก็บเป็นสัดส่วนของ "หน้าฐาน"
     getBoundingClientRect ของชั้นที่หมุนอยู่คืนกรอบตั้งฉากของจอ ใช้แปลงจุดคลิกไม่ได้ host จึงส่งตัวแปลงมาเอง
     ไม่ส่งมา = แบบเดิมของ pdf-edit ทุกประการ */
  const layerRel = (ev) => {
    const r = layer.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height };
  };
  const point = (ev) => (host.point ? host.point(ev) : layerRel(ev));
  const pxPerPt = () => (host.pxPerPt ? host.pxPerPt() : stage.clientHeight / pageSize.h);
  /** ตำแหน่ง ขนาด และการหมุนบนจอของของหนึ่งชิ้น
   *  up = องศาที่หน้าถูกหมุนตามเข็มตอนวาง ของจึงหมุนทวนเข็มเท่านั้นในหน้าฐาน เพื่อให้ตั้งตรงตอนวาง
   *  ข้อความ: จุดยึดคือกึ่งกลางขอบซ้าย หมุนรอบจุดนั้น , ภาพ: จุดยึดคือกึ่งกลางภาพ (x + rw/2, y) */
  function geo(e) {
    const boxy = e.kind === "cover" || e.kind === "highlight";
    const up = boxy ? 0 : (e.up || 0);
    const g = {
      left: `${(up && e.kind === "stamp" ? e.x + e.rw / 2 : e.x) * 100}%`, top: `${e.y * 100}%`,
      width: boxy ? `${e.w * 100}%` : (e.kind === "stamp" ? `${e.rw * 100}%` : "auto"),
      height: boxy ? `${e.h * 100}%` : "auto",
    };
    if (boxy) return g;
    if (!up) return { ...g, transform: "translateY(-50%)" };
    return e.kind === "stamp"
      ? { ...g, transform: `translate(-50%,-50%) rotate(${-up}deg)`, transformOrigin: "50% 50%" }
      : { ...g, transform: `translateY(-50%) rotate(${-up}deg)`, transformOrigin: "0 50%" };
  }

  /* ── ของที่เลือกอยู่ (รอบ 4 19/11/2026 พี่ปอนด์: "ควรแก้สีได้ด้วย ควรมีการตั้งค่าที่มากกว่านี้") ──
     คลิกของบนหน้า = เลือก แผงเปลี่ยนเป็นค่าของชิ้นนั้น เปลี่ยนค่าในแผงแล้วชิ้นที่เลือกเปลี่ยนทันที
     ค่าในแผงยังเป็นค่าเริ่มต้นของชิ้นถัดไปด้วย เหมือนโปรแกรมวาดทั่วไป */
  let selected = null;
  const kindMode = (e) => (e.kind === "stamp" ? "sign" : e.kind);
  const toolKind = (m) => (m === "sign" || m === "image" ? "stamp" : m);
  const psz = () => (host.size ? host.size() : pageSize);

  /* ── ช่องข้อความในแผง (รอบ 5 พี่ปอนด์: "ข้อความที่พิมให้มันมาอยู่ในนี้ด้วย จะได้แก้ไขได้ 2 ที่") ──
     เลือกข้อความบนหน้าอยู่ = ช่องนี้คือข้อความของชิ้นนั้น แก้ที่ไหนอีกที่เปลี่ยนตามทันที
     ไม่ได้เลือก = ช่องเดิม (ใส่ไว้แล้วคลิกบนหน้าเพื่อวางทันที) */
  const textLabel = textField.querySelector("span");
  function syncTextField() {
    const on = selected && selected.kind === "text";
    textLabel.textContent = on ? tr("ข้อความของชิ้นนี้", "Text of this item") : tr("ข้อความ", "Text");
    textInput.placeholder = on ? "" : tr("ไม่ต้องใส่ก็ได้ พิมพ์บนหน้าได้เลย", "Optional, you can type on the page");
    if (on) { if (textInput.value !== selected.text) textInput.value = selected.text; }
    else if (textInput.dataset.bound === "1") textInput.value = "";
    textInput.dataset.bound = on ? "1" : "";
  }
  function setSelected(e) {
    selected = e;
    syncTextField();
  }
  function selectMark(e) {
    setSelected(e);
    if (!e) { drawOverlay(); return; }
    if (mode !== kindMode(e)) setMode(kindMode(e));
    if (e.kind === "cover") coverColor.value = e.color;
    if (e.kind === "highlight") { hlColor.value = e.color; hlPct.input.value = String(Math.round(hlAlpha(e) * 100)); }
    if (e.kind === "text") {
      showSize(e.size); weightSel.value = String(e.weight || 400); textColor.value = e.color;
    }
    if (e.kind === "stamp") {
      stampPct.input.value = String(Math.round(stampAlpha(e) * 100));
      stampSize.value = String(Math.round(Math.min(60, Math.max(5, e.rw * 100))));
      stampSizeVal.textContent = `${Math.round(e.rw * 100)}%`;
    }
    swatchSyncs.forEach((f) => f()); hlPct.sync(); stampPct.sync();
    /* ‼️ แค่สลับคลาส ห้ามวาดชั้นใหม่ทั้งชั้น คลิกที่สองของการดับเบิลคลิกต้องลงกล่องเดิม
       วาดใหม่ = กล่องใหม่ เบราว์เซอร์ไม่นับเป็นดับเบิลคลิก (เจอจริงในเทสรอบ 4) */
    const list = host.list(), boxes = [...layer.querySelectorAll(".pe-box")];
    boxes.forEach((n, i) => n.classList.toggle("sel", list[i] === e));
    st.info(tr("เลือกแล้ว เปลี่ยนค่าในแผงได้เลย ลากเพื่อย้าย ลากจุดที่มุมเพื่อย่อขยาย",
               "Selected. Change it in the panel, drag to move, drag a corner to resize"));
  }
  /** ขนาดตัวอักษรในช่องขนาด ค่าที่ไม่มีในรายการ (มาจากการลากจุดจับ) เพิ่มเข้าไปแล้วเรียงใหม่ */
  function showSize(size) {
    const v = String(size);
    if (![...sizeSel.options].some((o) => o.value === v)) {
      const opts = [...sizeSel.options].map((o) => +o.value).concat(+size).sort((a, b) => a - b);
      sizeSel.replaceChildren(...opts.map((n) => el("option", { value: String(n) }, String(n))));
    }
    sizeSel.value = v;
  }
  /** ค่าในแผงเปลี่ยน แล้วชิ้นที่เลือกอยู่เป็นชนิดเดียวกัน ให้ชิ้นนั้นเปลี่ยนตาม */
  const live = (kinds, apply) => () => {
    if (!selected || !kinds.includes(selected.kind) || !host.list().includes(selected)) return;
    apply(selected);
    keepIn(selected);
    drawOverlay(); host.thumbs();
  };
  coverColor.addEventListener("input", live(["cover"], (e) => { e.color = coverColor.value; }));
  hlColor.addEventListener("input", live(["highlight"], (e) => { e.color = hlColor.value; }));
  hlPct.input.addEventListener("input", live(["highlight"], (e) => { e.alpha = +hlPct.input.value / 100; }));
  textColor.addEventListener("input", live(["text"], (e) => { e.color = textColor.value; }));
  sizeSel.addEventListener("change", live(["text"], (e) => { resizeText(e, +sizeSel.value); }));
  weightSel.addEventListener("change", live(["text"], (e) => { e.weight = +weightSel.value; }));
  textInput.addEventListener("input", live(["text"], (e) => { e.text = textInput.value; }));
  stampPct.input.addEventListener("input", live(["stamp"], (e) => { e.alpha = +stampPct.input.value / 100; }));
  stampSize.addEventListener("input", live(["stamp"], (e) => {
    const c = e.x + e.rw / 2;                       // ย่อขยายรอบกึ่งกลางเดิม
    e.rw = +stampSize.value / 100; e.x = c - e.rw / 2;
  }));

  /* ── ขนาดจริงของของแต่ละชิ้น และบังคับให้อยู่ในหน้า (รอบ 5 ภาพลายเซ็นล้นขอบขวาของกระดาษ) ──
     ทุกการวาง ลาก ย่อขยาย หรือเปลี่ยนค่า เลื่อนของกลับเข้าหน้าทั้งชิ้น ของที่ใหญ่กว่าหน้าอยู่กึ่งกลาง
     ภาพต้องรู้สัดส่วนจริงก่อน จึงจำสัดส่วนไว้ตอนโหลดภาพ (aspectOf) */
  const arSync = new Map();
  const natural = new Map();          // url -> สัดส่วนสูงต่อกว้างของภาพ
  const aspectOf = (url) => {
    if (!natural.has(url)) natural.set(url, new Promise((ok) => {
      const im = new Image();
      im.onload = () => { const r = im.naturalHeight / im.naturalWidth || 1; arSync.set(url, r); ok(r); };
      im.onerror = () => { arSync.set(url, 1); ok(1); };
      im.src = url;
    }));
    return natural.get(url);
  };
  const probe = document.createElement("canvas").getContext("2d");
  /* ‼️ วัดแบบเดียวกับ textToPng ทุกตัว (ฟอนต์ 4 เท่าแล้วหาร) วัดที่ขนาดจริงตรง ๆ ได้แคบกว่าภาพในไฟล์ราว 3%
     เทสรอบ 5 จับได้: ข้อความชิดขอบขวาล้นหน้าในไฟล์ 3.5 พอยต์ ทั้งที่บนจอเลื่อนเข้าแล้ว */
  const textWidthPt = (e) => {
    probe.font = `${e.weight || 400} ${e.size * PNG_SCALE}px "FK Sarabun","Sarabun","Noto Sans Thai",sans-serif`;
    return (Math.ceil(probe.measureText(e.text || " ").width) + 6) / PNG_SCALE;
  };
  /** ทิศเส้นฐานของข้อความในหน้าฐาน (หมุนทวนเข็มตามที่ตาเห็น up องศา แกน y ชี้ลง) */
  const dirOf = (e) => { const t = (-(e.up || 0) * Math.PI) / 180; return { x: Math.cos(t), y: Math.sin(t) }; };
  /** กรอบของชิ้นเป็นสัดส่วนของหน้าฐาน { x0, y0, x1, y1 } */
  function boundsOf(e) {
    if (e.kind === "cover" || e.kind === "highlight") return { x0: e.x, y0: e.y, x1: e.x + e.w, y1: e.y + e.h };
    const S = psz();
    let ax, ay, pts;
    if (e.kind === "text") {
      const w = textWidthPt(e), h = e.size * 1.7;
      ax = e.x * S.w; ay = e.y * S.h;
      pts = [[0, -h / 2], [w, -h / 2], [0, h / 2], [w, h / 2]];
    } else {
      const w = e.rw * S.w, h = (arSync.get(e.url) ?? 1) * w;
      ax = (e.x + e.rw / 2) * S.w; ay = e.y * S.h;
      pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]];
    }
    const t = (-(e.up || 0) * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [px, py] of pts) {
      const X = (ax + px * c - py * s) / S.w, Y = (ay + px * s + py * c) / S.h;
      x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y);
    }
    return { x0, y0, x1, y1 };
  }
  function keepIn(e) {
    if (!e || !psz()) return;
    if (e.kind === "cover" || e.kind === "highlight") {
      e.w = Math.min(e.w, 1); e.h = Math.min(e.h, 1);
      e.x = Math.max(0, Math.min(1 - e.w, e.x)); e.y = Math.max(0, Math.min(1 - e.h, e.y));
      return;
    }
    if (e.kind === "stamp") e.rw = Math.min(e.rw, 1);
    const b = boundsOf(e);
    const shift = (lo, hi) => (hi - lo > 1 ? 0.5 - (lo + hi) / 2 : lo < 0 ? -lo : hi > 1 ? 1 - hi : 0);
    e.x += shift(b.x0, b.x1); e.y += shift(b.y0, b.y1);
  }
  /** เปลี่ยนขนาดตัวอักษร โดยกึ่งกลางของข้อความอยู่ที่เดิม */
  function resizeText(e, size) {
    const S = psz(), d = dirOf(e), w0 = textWidthPt(e);
    const cx = e.x * S.w + d.x * w0 / 2, cy = e.y * S.h + d.y * w0 / 2;
    e.size = size;
    const w1 = textWidthPt(e);
    e.x = (cx - d.x * w1 / 2) / S.w; e.y = (cy - d.y * w1 / 2) / S.h;
  }

  let rebuilding = false;
  function drawOverlay() {
    rebuilding = true;
    layer.innerHTML = "";
    if (selected && !host.list().includes(selected)) setSelected(null);
    host.list().forEach((e) => {
      const boxy = e.kind === "cover" || e.kind === "highlight";   // ของที่มีความกว้างความสูงของตัวเอง
      const isEditing = editing && editing.mark === e;
      const box = el("div", {
        class: `pe-box ${e.kind}${e === selected || isEditing ? " sel" : ""}${isEditing ? " editing" : ""}`,
        /* ‼️ ต้องโฟกัสได้ ไม่งั้นคนใช้คีย์บอร์ดแก้ของที่วางไปแล้วไม่ได้เลย (WCAG 2.5.7) */
        tabindex: "0", role: "group",
        style: {
          ...geo(e),
          /* ‼️ ความโปร่งค่าเดียวกับตอนเขียนไฟล์ (hlAlpha stampAlpha) จอกับไฟล์จึงหน้าตาเดียวกัน
             ใส่ที่สีพื้นเท่านั้น ห้ามใช้ opacity ของกล่อง ไม่งั้นจุดจับกับปุ่มลบจางตามไปด้วย (เห็นในภาพเทสรอบ 4) */
          background: e.kind === "highlight" ? rgba(e.color, hlAlpha(e)) : (boxy ? e.color : "transparent"),
          /* ‼️ จุดคลิกคือ "กึ่งกลาง" ของสิ่งที่วาง ทั้งภาพและข้อความ
             เพราะตอนบันทึกลงไฟล์ save() วางโดยให้จุดคลิกเป็นกึ่งกลางแนวตั้ง (y - h/2)
             ถ้าบนจอวางโดยเอาขอบบนไว้ที่จุดคลิก ของบนจอกับในไฟล์จะคลาดกันครึ่งบรรทัด
             วัดจริง 21/09/2026: บนจอกึ่งกลางอยู่ที่ 0.5100 แต่ในไฟล์อยู่ที่ 0.5000
             = เพี้ยน 1.4% ของหน้า หรือราว 12 พอยต์บน A4 ซึ่งพอให้วางทับวันที่เดิมไม่ลง
             ‼️ นี่คือเครื่องมือที่ขายว่า "วางตรงไหนได้ตรงนั้น" จึงห้ามคลาดแม้แต่นิด
             (ตำแหน่ง ขนาด และการหมุน อยู่ใน geo() ใช้ร่วมกับตอนลากย้าย) */
          color: e.kind === "text" ? e.color : null,
          fontSize: e.kind === "text" ? `${e.size * pxPerPt()}px` : null,
          fontWeight: e.kind === "text" ? e.weight : null,
        },
      }, [
        e.kind === "text" ? textSpan(e, isEditing) : null,
        e.kind === "stamp" ? el("img", { src: e.url, alt: "", draggable: "false", style: { opacity: String(stampAlpha(e)) } }) : null,
        /* จุดจับ 4 มุม ทุกชนิดหน้าตาเดียวกัน (รอบ 5 ข้อความก็มี ลากแล้วตัวอักษรย่อขยาย)
           ‼️ มุมขวาล่างต้องมาก่อน เทสเก่าและคนที่ใช้คีย์บอร์ดหยิบ .pe-grip ตัวแรก */
        ...["se", "sw", "ne", "nw"].map((c) =>
          el("div", { class: `pe-grip ${c}`, "data-corner": c, title: tr("ลากเพื่อปรับขนาด", "Drag to resize") })),
        el("button", {
          class: "rm", type: "button", title: tr("เอาออก", "Remove"),
          "aria-label": tr("เอาการแก้นี้ออก", "Remove this edit"),
          onpointerdown: (ev) => ev.stopPropagation(),
          onclick: (ev) => {
            ev.stopPropagation();
            if (editing && editing.mark === e) editing = null;
            host.remove(e); drawOverlay(); host.sync(); host.thumbs();
          },
        }, "✕"),
      ]);
      const what = { cover: tr("กล่องปิดทับ", "Cover box"), highlight: tr("แถบไฮไลต์", "Highlight band"),
                     text: tr("ข้อความ", "Text"), stamp: e.what === "sign" ? tr("ลายเซ็น", "Signature") : tr("รูป", "Image"),
                   }[e.kind] || tr("สิ่งที่วางไว้", "Placed item");
      box.setAttribute("aria-label", tr(
        `${what} ตำแหน่ง ${Math.round(e.x * 100)}% จากซ้าย ${Math.round(e.y * 100)}% จากบน กดลูกศรเพื่อขยับ กด Delete เพื่อเอาออก`,
        `${what} at ${Math.round(e.x * 100)}% from left, ${Math.round(e.y * 100)}% from top. Arrow keys move it, Delete removes it`));
      /* ‼️ ขยับทีละก้าวด้วยลูกศร แม่นกว่าการลากเพราะไม่มีทางพลาด
         ก้าวเล็ก 0.4% ของหน้า ก้าวใหญ่กด Shift = 5 เท่า
         กล่องปิดทับยังปรับขนาดด้วย Alt+ลูกศร ได้ด้วย เพราะลากมุมอย่างเดียวก็ตกเกณฑ์เหมือนกัน */
      box.addEventListener("keydown", (ev) => {
        const step = ev.shiftKey ? 0.02 : 0.004;
        let d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0],
                  ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
        /* ลูกศรคือทิศบนจอ หน้าที่หมุนอยู่ต้องแปลงเป็นทิศบนหน้าฐานก่อน (host บอก) */
        if (d && host.nudge) d = host.nudge(d);
        if (d) {
          ev.preventDefault();
          if (ev.altKey && (e.kind === "cover" || e.kind === "highlight")) {
            e.w = Math.min(1, Math.max(0.01, e.w + d[0]));
            e.h = Math.min(1, Math.max(0.01, e.h + d[1]));
          } else if (ev.altKey && e.kind === "stamp") {
            /* ภาพรักษาสัดส่วนเสมอ จึงปรับได้แค่ความกว้าง ลูกศรขึ้นลงก็ให้ผลเดียวกับซ้ายขวา */
            e.rw = Math.min(1, Math.max(0.03, e.rw + (d[0] || -d[1])));
          } else {
            e.x += d[0]; e.y += d[1];
          }
          keepIn(e);
          drawOverlay();
          const again = [...layer.querySelectorAll(".pe-box")][host.list().indexOf(e)];
          if (again) again.focus();
          return;
        }
        if (ev.key === "Enter" && e.kind === "text") { ev.preventDefault(); startEdit(e, false); return; }
        if (ev.key === "Delete" || ev.key === "Backspace") {
          ev.preventDefault();
          host.remove(e);
          drawOverlay(); host.sync(); host.thumbs();
        }
      });
      if (e.kind === "text") box.addEventListener("dblclick", (ev) => { ev.stopPropagation(); ev.preventDefault(); });
      bindMove(box, e);
      layer.appendChild(box);
    });
    rebuilding = false;
    if (editing) {
      const n = layer.querySelector(".pe-txt.pe-edit");
      if (n && document.activeElement !== n) {
        n.focus({ preventScroll: true });
        const r = document.createRange(); r.selectNodeContents(n); r.collapse(false);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      }
    }
    host.sync();
  }

  /* ── ข้อความ: ตัวกล่องเองเป็นที่พิมพ์ (รอบ 5) ──
     พี่ปอนด์: "ข้อความอ่ะอยากให้มันกดปิดได้ อยากลดขนาดเพิ่มขนาดเองได้เลยตรง" รุ่นก่อนช่องพิมพ์เป็นกรอบเปล่าลอยแยก
     ไม่มีปุ่มลบไม่มีจุดจับ ตอนนี้ข้อความที่กำลังพิมพ์คือชิ้นจริงบนหน้า มีปุ่มลบและจุดจับครบเหมือนลายเซ็น
     ช่องพิมพ์เป็น span ข้างในกล่อง จุดจับกับปุ่มลบเป็นพี่น้อง ไม่ปนกับตัวอักษร */
  let editing = null;          // { mark, isNew, orig }
  let inkTimer = 0;
  const inkSoon = () => { clearTimeout(inkTimer); inkTimer = setTimeout(() => host.thumbs(), 250); };
  function textSpan(e, isEditing) {
    const span = el("span", { class: `pe-txt${isEditing ? " pe-edit" : ""}` }, e.text);
    if (!isEditing) return span;
    span.contentEditable = "true";
    span.spellcheck = false;
    span.setAttribute("role", "textbox");
    span.setAttribute("aria-label", tr("พิมพ์ข้อความ กด Enter เมื่อเสร็จ", "Type the text, press Enter when done"));
    span.dataset.ph = tr("พิมพ์ข้อความ", "Type here");
    span.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    span.addEventListener("dblclick", (ev) => ev.stopPropagation());
    span.addEventListener("input", () => {
      e.text = span.innerText.replace(/\s*\n\s*/g, " ");
      if (selected === e && document.activeElement !== textInput) textInput.value = e.text;
      inkSoon();
    });
    span.addEventListener("keydown", (ev) => {
      ev.stopPropagation();                         // Delete ลูกศร Esc ในช่องพิมพ์เป็นของช่องพิมพ์ ไม่ใช่ของหน้า
      if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); finishEdit(false); }
      else if (ev.key === "Escape") { ev.preventDefault(); finishEdit(true); }
    });
    span.addEventListener("blur", (ev) => {
      if (rebuilding || !editing || editing.mark !== e) return;
      // ไปพิมพ์ต่อในช่องข้อความของแผง = ยังเป็นชิ้นเดิม ข้อความว่างก็ยังไม่ทิ้ง
      finishEdit(false, ev.relatedTarget === textInput);
    });
    return span;
  }
  function startEdit(mark, isNew) {
    if (editing && editing.mark !== mark) finishEdit(false);
    editing = { mark, isNew, orig: mark.text };
    selectMark(mark);
    drawOverlay();
    st.info(tr("พิมพ์ได้เลย กด Enter เมื่อเสร็จ กด Esc เพื่อยกเลิก แก้ข้อความในแผงด้านขวาก็ได้",
               "Type now. Enter when done, Esc cancels. You can also edit it in the panel"));
  }
  function finishEdit(cancel, keepEmpty = false) {
    if (!editing) return;
    const { mark, isNew, orig } = editing;
    editing = null;
    if (cancel) { if (isNew) host.remove(mark); else mark.text = orig; }
    else {
      mark.text = (mark.text || "").trim();
      if (!mark.text && !keepEmpty) host.remove(mark);
    }
    if (host.list().includes(mark)) keepIn(mark);
    drawOverlay(); host.thumbs(); host.sync();
    if (!cancel && mark.text) st.ok(isNew ? tr("วางข้อความแล้ว", "Text placed") : tr("แก้ข้อความแล้ว", "Text updated"));
    else if (cancel) st.info(MODE_HINT());
  }
  /** ข้อความชิ้นใหม่ที่จุดหนึ่ง (กึ่งกลางขอบซ้าย) แล้วพิมพ์บนหน้าได้ทันที */
  function newTextAt(p, size) {
    const up = host.up ? host.up() : 0;
    const m = { kind: "text", x: p.x, y: p.y, text: "", size: size || +sizeSel.value,
                color: textColor.value, weight: +weightSel.value, ...(up ? { up } : {}) };
    host.add(m);
    startEdit(m, true);
  }
  /** เครื่องมือข้อความที่จุดหนึ่ง: มีข้อความในแผง (ไม่ได้เลือกชิ้นไหน) = วางทันทีแบบเดิม , ไม่มี = พิมพ์บนหน้า */
  function textAt(p, size) {
    if (textInput.value.trim() && !size && !(selected && selected.kind === "text")) return placeText(p);
    newTextAt(p, size);
  }

  /* ลากย้ายของที่วางไปแล้ว และลากจุดที่มุมเพื่อปรับขนาด
     ‼️ เดิมวางแล้วแก้ไม่ได้เลย ต้องลบทิ้งแล้วทำใหม่ ซึ่งกับงานจริงที่ต้องขยับทีละนิด
        ให้พอดีคำ คือทรมานมาก
     ‼️ ต้องหยุดไม่ให้เหตุการณ์ไหลไปถึงชั้นวาด ไม่งั้นการลากย้ายจะกลายเป็นสร้างกล่องใหม่ทับ */
  let lastTap = { e: null, t: 0 };
  function bindMove(node, e) {
    let mode0 = null, corner = null, from = null, orig = null, toolAtDown = null;
    const rel = point;
    node.addEventListener("pointerdown", (ev) => {
      if (ev.target.closest(".rm")) return;
      ev.stopPropagation();
      ev.preventDefault();
      // กำลังพิมพ์ชิ้นอื่นอยู่ คลิกชิ้นนี้ = จบการพิมพ์ก่อน คลิกนี้ใช้แค่นั้น (ชั้นถูกวาดใหม่ กล่องนี้หลุดไปแล้ว)
      if (editing && editing.mark !== e) { finishEdit(false); return; }
      const g = ev.target.closest(".pe-grip");
      mode0 = g ? "resize" : "move";
      corner = g ? g.dataset.corner : null;
      toolAtDown = mode;
      from = rel(ev);
      orig = { x: e.x, y: e.y, w: e.w, h: e.h, rw: e.rw, size: e.size, cy: ev.clientY, r: node.getBoundingClientRect() };
      node.classList.add("moving");
      node.setPointerCapture(ev.pointerId);
    });
    node.addEventListener("pointermove", (ev) => {
      if (!mode0) return;
      const p = rel(ev);
      const dx = p.x - from.x, dy = p.y - from.y;
      const S = psz();
      if (mode0 === "move") {
        e.x = orig.x + dx; e.y = orig.y + dy;
      } else if (e.kind === "stamp") {
        /* ภาพรักษาสัดส่วนเสมอ ย่อขยายรอบกึ่งกลางตามระยะจากกึ่งกลางถึงนิ้ว (เป็นพอยต์ หน้าหมุนแบบไหนก็ใช้ได้) */
        const cx = orig.x + orig.rw / 2, cy = orig.y;
        const d0 = Math.hypot((from.x - cx) * S.w, (from.y - cy) * S.h) || 1;
        const d1 = Math.hypot((p.x - cx) * S.w, (p.y - cy) * S.h);
        e.rw = Math.max(0.03, Math.min(1, orig.rw * d1 / d0));
        e.x = cx - e.rw / 2;
      } else if (e.kind === "text") {
        /* ข้อความย่อขยายตามความสูงกล่องบนจอ ขนาดตัวอักษรเป็นจำนวนเต็ม (รอบ 5 พี่ปอนด์: "อยากลดขนาดเพิ่มขนาดเองได้เลยตรง")
           ค่า "ขนาด" ในแผงเปลี่ยนตาม มุมฝั่งตรงข้ามกับจุดจับอยู่ที่เดิม เหมือนยืดกล่องทั่วไป
           คิดบนจอเพราะข้อความตั้งตรงบนจอเสมอ หน้าหมุนแบบไหนก็ตรง แล้วแปลงจุดยึดกลับเป็นหน้าฐานด้วย point() */
        const r0 = orig.r, south = corner === "se" || corner === "sw", east = corner === "se" || corner === "ne";
        const dh = (south ? 1 : -1) * (ev.clientY - orig.cy);
        const k = Math.max(0.2, (r0.height + dh) / r0.height);
        const size = Math.max(6, Math.min(144, Math.round(orig.size * k)));
        if (size !== e.size) {
          const kk = size / orig.size, W1 = r0.width * kk, H1 = r0.height * kk;
          const left = east ? r0.left : r0.right - W1;
          const mid = south ? r0.top + H1 / 2 : r0.bottom - H1 / 2;
          const at = rel({ clientX: left, clientY: mid });
          e.x = at.x; e.y = at.y; e.size = size;
          showSize(size);
          node.style.fontSize = `${size * pxPerPt()}px`;
        }
      } else {
        const MIN = 0.004;
        let { x, y, w, h } = orig;
        if (corner === "se" || corner === "ne") w = Math.max(MIN, orig.w + dx);
        if (corner === "sw" || corner === "nw") { w = Math.max(MIN, orig.w - dx); x = orig.x + orig.w - w; }
        if (corner === "se" || corner === "sw") h = Math.max(MIN, orig.h + dy);
        if (corner === "ne" || corner === "nw") { h = Math.max(MIN, orig.h - dy); y = orig.y + orig.h - h; }
        x = Math.max(0, x); y = Math.max(0, y); w = Math.min(w, 1 - x); h = Math.min(h, 1 - y);
        Object.assign(e, { x, y, w, h });
      }
      if (mode0 === "move" || e.kind !== "cover" && e.kind !== "highlight") keepIn(e);
      const g = geo(e);
      node.style.left = g.left; node.style.top = g.top;
      if (e.kind === "cover" || e.kind === "highlight") {
        node.style.width = g.width;
        node.style.height = g.height;
      } else if (e.kind === "stamp") {
        node.style.width = g.width;
      }
    });
    /* ‼️ คลิกทับของที่วางไปแล้ว ต้องวางชิ้นใหม่ได้ (เจอจริงตอนทำเทสเฟส 6 21/09/2026)
     * งานหลักของเครื่องมือนี้คือ "ปิดทับวันที่เดิม แล้วพิมพ์วันที่ใหม่ตรงนั้น"
     * ซึ่งแปลว่าต้องคลิกลงบนกล่องปิดทับที่เพิ่งวางไป
     * แยกด้วยระยะที่ลาก: ขยับน้อยกว่า 0.6% ของหน้า = ตั้งใจคลิก ไม่ใช่ตั้งใจลาก
     * รอบ 4: คลิกของชนิดเดียวกับเครื่องมือที่ถืออยู่ (หรือถือปิดทับ ไฮไลต์) = เลือกชิ้นนั้นมาแก้
     *        คลิกของต่างชนิดตอนถือข้อความ ลายเซ็น รูป = วางชิ้นใหม่ทับเหมือนเดิม */
    const end = (ev) => {
      if (!mode0) return;
      const moved = from && ev && (() => {
        const p = rel(ev);
        return Math.abs(p.x - from.x) > 0.006 || Math.abs(p.y - from.y) > 0.006;
      })();
      const was = mode0;
      mode0 = null;
      node.classList.remove("moving");
      if (!moved && was === "move" && (toolAtDown === "text" || toolAtDown === "sign" || toolAtDown === "image")
          && toolKind(toolAtDown) !== e.kind) {
        // คืนตำแหน่งเดิมก่อน เผื่อขยับไปนิดหน่อยระหว่างคลิก
        e.x = orig.x; e.y = orig.y;
        setSelected(null);
        drawOverlay();
        const at = from;
        if (toolAtDown === "text") textAt(at); else placeStamp(at);
        return;
      }
      if (!moved && was === "move") { e.x = orig.x; e.y = orig.y; }
      /* ดับเบิลคลิกข้อความ = แก้ในที่ นับเองจากเวลาคลิกสองครั้งบนชิ้นเดียวกัน ใช้ได้ทั้งเมาส์และนิ้ว */
      const now = performance.now();
      if (!moved && e.kind === "text" && lastTap.e === e && now - lastTap.t < 450) {
        lastTap = { e: null, t: 0 };
        startEdit(e, false);
        return;
      }
      lastTap = moved ? { e: null, t: 0 } : { e, t: now };
      if (editing && editing.mark === e) { if (moved) { drawOverlay(); host.thumbs(); } return; }
      selectMark(e);
      if (moved) { host.thumbs(); st.ok(was === "resize" ? tr("ปรับขนาดแล้ว", "Resized") : tr("ย้ายแล้ว", "Moved")); }
      const again = [...layer.querySelectorAll(".pe-box")][host.list().indexOf(e)];
      if (again) again.focus({ preventScroll: true });
    };
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
  }

  // ── ลากกรอบบนหน้า ใช้ท่าเดียวทุกเครื่องมือ (รอบ 4 พี่ปอนด์: "แบบคลุมมาวาง จะได้แพทเทิร์นเดียวกัน") ──
  let start = null, ghost = null;
  const rel = point;
  const isDrag = () => mode === "cover" || mode === "highlight";
  layer.addEventListener("pointerdown", (ev) => {
    if (!host.ready() || ev.target.closest(".rm") || ev.target.closest(".pe-edit")) return;
    if (editing) { finishEdit(false); return; }        // คลิกที่ว่างตอนพิมพ์ = จบการพิมพ์ ไม่วางชิ้นใหม่ซ้อน
    if (selected) { setSelected(null); drawOverlay(); }
    start = { p: rel(ev), cx: ev.clientX, cy: ev.clientY };
    ghost = isDrag()
      ? el("div", { class: `pe-ghost ${mode}`,
          style: { background: mode === "highlight" ? hlColor.value : coverColor.value,
                   opacity: mode === "highlight" ? String(+hlPct.input.value / 100) : "1",
                   outline: "1px dashed var(--brand)" } })
      : el("div", { class: "pe-ghost frame" });
    layer.appendChild(ghost);
    layer.setPointerCapture(ev.pointerId);
  });
  layer.addEventListener("pointermove", (ev) => {
    if (!start || !ghost) return;
    const p = rel(ev), s0 = start.p;
    const x = Math.min(s0.x, p.x), y = Math.min(s0.y, p.y);
    ghost.style.left = `${x * 100}%`; ghost.style.top = `${y * 100}%`;
    ghost.style.width = `${Math.abs(p.x - s0.x) * 100}%`;
    ghost.style.height = `${Math.abs(p.y - s0.y) * 100}%`;
  });
  layer.addEventListener("pointerup", (ev) => {
    if (!start) return;
    const p = rel(ev), s0 = start.p;
    const x = Math.max(0, Math.min(s0.x, p.x)), y = Math.max(0, Math.min(s0.y, p.y));
    const w = Math.min(1, Math.max(s0.x, p.x)) - x, h = Math.min(1, Math.max(s0.y, p.y)) - y;
    // กรอบบนจอเป็นพิกเซล ใช้คิดขนาดตัวอักษรและภาพ (ตามที่ตาเห็น หน้าหมุนแบบไหนก็ตรง)
    const cb = { l: Math.min(start.cx, ev.clientX), t: Math.min(start.cy, ev.clientY),
                 w: Math.abs(ev.clientX - start.cx), h: Math.abs(ev.clientY - start.cy) };
    ghost?.remove(); ghost = null;
    const click = Math.abs(p.x - s0.x) < 0.006 && Math.abs(p.y - s0.y) < 0.006;
    const at0 = s0;
    start = null;
    if (mode === "text") {
      if (click) return textAt(at0);
      /* ขนาดตัวอักษรจากความสูงกรอบ (บรรทัดสูงราว 1.5 เท่าของขนาดตัวอักษร) ปัดเข้าขนาดในรายการ */
      const hPt = cb.h / pxPerPt();
      const size = cb.h < 10 ? 0 : SIZES.reduce((a, b) => (Math.abs(b - hPt / 1.5) < Math.abs(a - hPt / 1.5) ? b : a));
      if (size) showSize(size);
      return newTextAt(point({ clientX: cb.l, clientY: cb.t + cb.h / 2 }), size || +sizeSel.value);
    }
    if (mode === "sign" || mode === "image") {
      if (click) return placeStamp(at0);
      return placeStampBox(cb);
    }
    // กันคลิกพลาดกลายเป็นกล่องจิ๋วที่มองไม่เห็นแต่ค้างอยู่ในไฟล์
    if (w < 0.004 || h < 0.004) { drawOverlay(); return; }
    const hl = mode === "highlight";
    const m = { kind: hl ? "highlight" : "cover", x, y, w, h, color: hl ? hlColor.value : coverColor.value,
                ...(hl ? { alpha: +hlPct.input.value / 100 } : {}) };
    host.add(m);
    drawOverlay(); host.thumbs();
    st.ok(hl ? tr("ไฮไลต์แล้ว 1 จุด", "Highlighted one spot")
             : tr("ปิดทับแล้ว 1 จุด", "Covered one spot"));
  });

  const stampMsg = () => tr("วางแล้ว ลากเพื่อย้าย ลากจุดที่มุมเพื่อย่อขยาย", "Placed. Drag to move, drag a corner to resize");
  const noStamp = () => st.err(tr("วาดลายเซ็น อัปโหลดรูป หรือเลือกจากที่บันทึกไว้ด้านขวาก่อน",
                                   "Draw a signature, upload an image, or pick one from Saved first"));
  const alphaNow = () => (+stampPct.input.value < 100 ? { alpha: +stampPct.input.value / 100 } : {});
  /** วางลายเซ็นหรือรูปให้พอดีกรอบที่ลาก (กรอบเป็นพิกเซลบนจอ) รักษาสัดส่วนภาพ อยู่กึ่งกลางกรอบ */
  async function placeStampBox(cb) {
    if (!stampUrl) return noStamp();
    const url = stampUrl, what = whatOf(url);
    const ar = await aspectOf(url);
    const ppp = pxPerPt();
    const wPt = Math.min(cb.w / ppp, (cb.h / ppp) / ar);
    const rw = Math.max(0.01, wPt / psz().w);
    const c = point({ clientX: cb.l + cb.w / 2, clientY: cb.t + cb.h / 2 });
    const up = host.up ? host.up() : 0;
    const m = { kind: "stamp", x: c.x - rw / 2, y: c.y, rw, url, what, ...alphaNow(), ...(up ? { up } : {}) };
    keepIn(m);
    host.add(m);
    drawOverlay(); host.thumbs();
    st.ok(stampMsg());
  }

  /** วางลายเซ็นหรือรูปที่จุดที่คลิก (จุดคลิก = กึ่งกลางของภาพ) ทั้งชิ้นต้องอยู่ในหน้า */
  async function placeStamp(p, url = stampUrl, what = whatOf(url)) {
    if (!url) return noStamp();
    await aspectOf(url);
    const rw = (+stampSize.value || 20) / 100;
    const up = host.up ? host.up() : 0;
    const m = { kind: "stamp", x: p.x - rw / 2, y: p.y, rw, url, what, ...alphaNow(), ...(up ? { up } : {}) };
    keepIn(m);
    host.add(m);
    drawOverlay(); host.thumbs();
    st.ok(stampMsg());
  }

  function placeText(p) {
    const text = textInput.value.trim();
    if (!text) { st.err(tr("พิมพ์ข้อความด้านขวาก่อน", "Type the text on the right first")); return; }
    const up = host.up ? host.up() : 0;
    const m = { kind: "text", x: p.x, y: p.y, text,
                size: +sizeSel.value, color: textColor.value, weight: +weightSel.value, ...(up ? { up } : {}) };
    keepIn(m);
    host.add(m);
    drawOverlay(); host.thumbs();
    st.ok(tr("วางข้อความแล้ว", "Text placed"));
  }

  /* ── ลากลายเซ็นหรือรูปจากแผงไปปล่อยบนหน้า (รอบ 5 พี่ปอนด์: "เหมือนมันจะจับลากมาวางไม่มา") ──
     ภาพในแผงเคยลากได้แบบภาพของเบราว์เซอร์ (เห็นภาพจางติดเมาส์) แต่ไม่มีใครรับ ปล่อยแล้วไม่เกิดอะไร
     ใช้ pointer events ของเราเอง จอสัมผัสก็ใช้ได้ ขยับไม่ถึง 6 px = คลิกเลือกแบบเดิม
     ปล่อยบนหน้า = วางกึ่งกลางที่จุดปล่อย ขนาดตามความกว้างในแผง ปล่อยนอกหน้า = ไม่วาง */
  function dragToPage(node, url, what, onClick) {
    node.addEventListener("dragstart", (ev) => ev.preventDefault());
    node.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0 || ev.target.closest(".x")) return;
      const x0 = ev.clientX, y0 = ev.clientY;
      let float = null;
      const move = (m) => {
        if (!float && Math.hypot(m.clientX - x0, m.clientY - y0) < 6) return;
        m.preventDefault();
        if (!float) {
          float = el("img", { src: url, alt: "", class: "pe-float" });
          document.body.appendChild(float);
        }
        float.style.transform = `translate(${m.clientX}px,${m.clientY}px) translate(-50%,-50%)`;
      };
      const up = async (u) => {
        removeEventListener("pointermove", move, true);
        removeEventListener("pointerup", up, true);
        removeEventListener("pointercancel", up, true);
        if (!float) { onClick(); return; }
        float.remove();
        if (u.type === "pointercancel") return;
        const hit = document.elementFromPoint(u.clientX, u.clientY);
        if (!hit || !(hit === layer || layer.contains(hit)) || !host.ready()) {
          st.info(tr("ปล่อยบนหน้ากระดาษเพื่อวาง", "Drop it on the page to place it"));
          return;
        }
        if (editing) finishEdit(false);
        if (mode !== "sign") setMode("sign");
        stampUrl = url; renderSaved();
        await placeStamp(point(u), url, what);
      };
      addEventListener("pointermove", move, true);
      addEventListener("pointerup", up, true);
      addEventListener("pointercancel", up, true);
    });
  }

  return {
    stage, scroller, layer, viewCanvas, panel: rightNode, modeSeg,
    toolbar: [zoomOutBtn, zoomLabel, zoomInBtn, fitBtn, el("div", { class: "sep" }), placeMidBtn, undoBtn, clearBtn],
    buttons: { placeMidBtn, undoBtn, clearBtn },
    draw: drawOverlay, setMode, mode: () => mode,
    /** host เรนเดอร์หน้าลง viewCanvas เสร็จแล้ว แจ้งขนาดภาพ (px) กับขนาดหน้าที่เห็น (pt) */
    shown(viewW, size) {
      pageSize = size;
      stage.hidden = false;
      /* ‼️ ฐานของซูมคือ "กว้างเท่ากล่องกลาง" ไม่ใช่เลขตายตัว
         เดิมตรึงไว้ที่ 900px ซึ่งบนจอแคบก็ล้น บนจอกว้างก็ไม่ได้ใช้ที่ที่มี */
      pageViewW = viewW;
      fitWidth = fitFor();
      applyZoom();
    },
    hide() { stage.hidden = true; },
  };
}

/* ── วาดของที่วางลงภาพ และหากรอบของที่วาง (เฟส 2 19/11/2026 จัดการหน้า PDF) ───────────────────
   ใช้กับภาพย่อบนการ์ด (ปิดตัวดูแล้วการ์ดต้องเห็นของที่วางทันที) และกับการครอบขอบขาว
   ‼️ ภาพย่อคือหน้าฐาน การ์ดหมุนและครอบภาพนี้ด้วย CSS อยู่แล้ว วาดลงภาพนี้ทีเดียวจึงตรงทุกแบบของการ์ด */
const imgCache = new Map();
function loadImage(url) {
  if (!imgCache.has(url)) imgCache.set(url, new Promise((ok, bad) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => bad(new Error("image"));
    im.src = url;
  }));
  return imgCache.get(url);
}
const FONT = (weight, px) => `${weight} ${px}px "FK Sarabun","Sarabun","Noto Sans Thai",sans-serif`;

/** วาดของลง canvas ขนาด W x H px ที่เป็นภาพของหน้าฐาน base = { w, h } พอยต์ */
export async function paintMarks(ctx, W, H, marks, base) {
  const k = W / base.w;                    // px ต่อพอยต์
  for (const e of marks) {
    ctx.save();
    const rad = (-(e.up || 0) * Math.PI) / 180;
    if (e.kind === "cover" || e.kind === "highlight") {
      ctx.globalAlpha = e.kind === "highlight" ? hlAlpha(e) : 1;
      ctx.fillStyle = e.color;
      ctx.fillRect(e.x * W, e.y * H, e.w * W, e.h * H);
    } else if (e.kind === "text") {
      ctx.translate(e.x * W, e.y * H);
      ctx.rotate(rad);
      ctx.font = FONT(e.weight || 400, e.size * k);
      ctx.fillStyle = e.color;
      ctx.textBaseline = "middle";
      ctx.fillText(e.text, 0.75 * k, 0);    // ขอบซ้ายเผื่อเท่า textToPng (3 px ที่ 4 เท่า = 0.75 พอยต์)
    } else if (e.kind === "stamp") {
      try {
        const im = await loadImage(e.url);
        const w = e.rw * W, h = (im.naturalHeight / im.naturalWidth) * w;
        ctx.globalAlpha = stampAlpha(e);
        ctx.translate((e.x + e.rw / 2) * W, e.y * H);
        ctx.rotate(rad);
        ctx.drawImage(im, -w / 2, -h / 2, w, h);
      } catch { /* ภาพเสีย ข้ามไป ไฟล์จริงยังประทับจาก url เดิม */ }
    }
    ctx.restore();
  }
}

/** กรอบรวมของที่วางทุกชิ้น เป็นสัดส่วนของหน้าฐาน { x, y, w, h } ไม่มีของคืน null
 *  ใช้ตอนครอบขอบขาว ภาพย่อไม่มีของที่วาง ตัวหาขอบจึงมองไม่เห็นลายเซ็นในที่ว่าง ถ้าไม่รวมกรอบนี้ ลายเซ็นโดนตัดหาย */
export async function markBounds(marks, base) {
  if (!marks || !marks.length) return null;
  const probe = document.createElement("canvas").getContext("2d");
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (px, py) => { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); };
  for (const e of marks) {
    if (e.kind === "cover" || e.kind === "highlight") { add(e.x * base.w, e.y * base.h); add((e.x + e.w) * base.w, (e.y + e.h) * base.h); continue; }
    // ขนาดเป็นพอยต์ จุดยึด และมุมทั้งสี่เทียบจุดยึด (ยังไม่หมุน แกน y ชี้ลง)
    let ax, ay, pts;
    if (e.kind === "text") {
      probe.font = FONT(e.weight || 400, e.size);
      const w = probe.measureText(e.text).width + 1.5, h = e.size * 1.7;
      ax = e.x * base.w; ay = e.y * base.h;
      pts = [[0, -h / 2], [w, -h / 2], [0, h / 2], [w, h / 2]];
    } else {
      let ar = 1;
      try { const im = await loadImage(e.url); ar = im.naturalHeight / im.naturalWidth; } catch { /* ใช้สี่เหลี่ยมจัตุรัสแทน */ }
      const w = e.rw * base.w, h = ar * w;
      ax = (e.x + e.rw / 2) * base.w; ay = e.y * base.h;
      pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]];
    }
    const t = (-(e.up || 0) * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    for (const [px, py] of pts) add(ax + px * c - py * s, ay + px * s + py * c);
  }
  return { x: x0 / base.w, y: y0 / base.h, w: (x1 - x0) / base.w, h: (y1 - y0) / base.h };
}
