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
@media (hover:none){ .pe-box.sel .pe-grip{opacity:1} }
/* ‼️ กล่องปิดทับมักเป็นสีขาวเพื่อกลืนกับกระดาษ ซึ่งแปลว่าบนจอก็มองไม่เห็นเหมือนกัน
   จึงมีเส้นประบาง ๆ รอบนอก (outline ไม่กินเนื้อกล่อง) ให้รู้ว่าปิดไปตรงไหน เส้นนี้อยู่แค่บนจอ ไม่ลงไฟล์ */
.pe-box.cover,.pe-box.highlight{outline:1px dashed color-mix(in srgb,var(--brand) 45%,transparent);outline-offset:0}
.pe-box.text:hover,.pe-box.stamp:hover{outline:1px dashed color-mix(in srgb,var(--brand) 45%,transparent)}
.pe-box.sel{outline:1.5px solid var(--brand);outline-offset:1px}
.pe-box.text{display:flex;align-items:center;white-space:pre;overflow:visible;
  font-family:"FK Sarabun","Sarabun","Noto Sans Thai",sans-serif;line-height:1.2}
/* ช่องพิมพ์ข้อความบนหน้า (ลากกรอบหรือคลิกด้วยเครื่องมือข้อความ ดับเบิลคลิกข้อความเพื่อแก้) */
.pe-edit{position:absolute;box-sizing:border-box;white-space:pre;outline:1.5px solid var(--brand);outline-offset:2px;
  font-family:"FK Sarabun","Sarabun","Noto Sans Thai",sans-serif;line-height:1.2;min-width:2em;
  background:color-mix(in srgb,#fff 70%,transparent);cursor:text;caret-color:var(--brand)}
.pe-ghost{position:absolute;box-sizing:border-box;pointer-events:none}
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
.pe-sign .sign-canvas{border:1px dashed var(--line);border-radius:var(--r-sm,10px);background:#fff;touch-action:none}
.pe-saved{display:flex;flex-wrap:wrap;gap:8px}
.pe-saved figure{position:relative;margin:0;border:1px solid var(--line);border-radius:8px;
  padding:4px 6px;background:#fff;cursor:pointer;line-height:0}
.pe-saved figure.on{border-color:var(--brand);box-shadow:0 0 0 2px color-mix(in srgb,var(--brand) 25%,transparent)}
.pe-saved img{height:34px;width:auto;display:block}
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
  const stampSize = el("input", { type: "range", min: "5", max: "60", value: "22", step: "1" });
  const stampSizeVal = el("span", { class: "pe-zoom" }, "22%");
  stampSize.addEventListener("input", () => { stampSizeVal.textContent = stampSize.value + "%"; });

  let stampUrl = null;            // PNG พื้นโปร่งของลายเซ็นหรือรูปที่เลือกอยู่
  const pad = signaturePad({ onChange: () => { padUse.disabled = pad.isEmpty(); } });
  const padUse = button(tr("ใช้ลายเซ็นนี้", "Use this signature"), { onclick: () => {
    const url = pad.toDataURL();
    if (!url) return st.err(tr("ยังไม่ได้วาดลายเซ็น", "Nothing drawn yet"));
    saveSignature(url); pad.clear(); padUse.disabled = true;
    pickStamp(url); renderSaved();
  } });
  padUse.disabled = true;
  const padClear = button(tr("ล้างกระดาน", "Clear pad"), { ghost: true, onclick: () => { pad.clear(); padUse.disabled = true; } });
  const signUpInput = el("input", { type: "file", accept: "image/*", hidden: true,
    onchange: async (ev) => {
      const f = ev.target.files[0]; ev.target.value = "";
      if (!f) return;
      try {
        st.info(tr("กำลังเตรียมรูปลายเซ็น…", "Preparing the signature image…"));
        const url = await imageToSignature(f);
        saveSignature(url); pickStamp(url); renderSaved(); st.clear();
      } catch (e) { st.err(tr("อ่านรูปไม่ได้: ", "Couldn't read the image: ") + e.message); }
    } });
  const signUpBtn = button(tr("อัปโหลดรูปลายเซ็น", "Upload a signature image"),
    { ghost: true, icon: "upload", onclick: () => signUpInput.click() });
  const savedBox = el("div", { class: "pe-saved" });

  const imgInput = el("input", { type: "file", accept: "image/*", hidden: true,
    onchange: async (ev) => {
      const f = ev.target.files[0]; ev.target.value = "";
      if (!f) return;
      try {
        st.info(tr("กำลังเตรียมรูป…", "Preparing the image…"));
        /* ‼️ รูปทั่วไปไม่ถอดพื้นขาว ต่างจากลายเซ็น เพราะโลโก้หรือตราที่มีพื้นขาวจงใจ
           ถ้าไปถอดให้ จะได้รูปโหว่เป็นรูโดยที่ผู้ใช้ไม่ได้สั่ง */
        pickStamp(await fileToPng(f)); st.clear();
        st.ok(tr("เลือกรูปแล้ว ลากกรอบบนหน้าให้รูปลงพอดีกรอบ หรือคลิกเพื่อวาง", "Image ready. Drag a box on the page to fit it, or click to place it"));
      } catch (e) { st.err(tr("อ่านรูปไม่ได้: ", "Couldn't read the image: ") + e.message); }
    } });
  const imgBtn = button(tr("เลือกไฟล์รูป", "Choose an image"), { icon: "upload", onclick: () => imgInput.click() });
  const imgPreview = el("div", { class: "pe-saved" });

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

  function pickStamp(url) {
    stampUrl = url;
    renderSaved();
    imgPreview.replaceChildren(url && mode === "image"
      ? el("figure", { class: "on" }, [el("img", { src: url, alt: tr("รูปที่เลือก", "Chosen image") })]) : null);
  }

  function renderSaved() {
    const list = savedSignatures();
    savedBox.replaceChildren(...(list.length ? list : []).map((url) => {
      const fig = el("figure", { class: url === stampUrl ? "on" : "", role: "button", tabindex: "0",
        "aria-label": tr("ใช้ลายเซ็นนี้", "Use this signature"),
        onclick: () => pickStamp(url),
        onkeydown: (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pickStamp(url); } } }, [
        el("img", { src: url, alt: tr("ลายเซ็นที่บันทึกไว้", "Saved signature") }),
        el("button", { class: "x", type: "button", "aria-label": tr("ลบลายเซ็นนี้", "Delete this signature"),
          onclick: (ev) => { ev.stopPropagation(); removeSignature(url);
            if (stampUrl === url) stampUrl = null; renderSaved(); } }, "\u2715"),
      ]);
      return fig;
    }));
    if (!list.length) savedBox.replaceChildren(el("div", { class: "pe-hint" },
      tr("ยังไม่มีลายเซ็นที่บันทึกไว้ วาดในกรอบด้านบนหรืออัปโหลดรูปได้",
         "No saved signatures yet. Draw in the box above or upload an image")));
  }

  function segmentedModes() {
    const wrap = el("div", { class: "row" });
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
      mk("sign", tr("ลายเซ็น", "Signature"), "check"),
      mk("image", tr("รูป", "Image"), "stack"),
    );
    return wrap;
  }
  let mode = "cover";
  const MODE_HINT = () => ({
    cover: tr("ลากคลุมข้อความที่ต้องการลบ", "Drag over the text you want to remove"),
    text: tr("ลากกรอบหรือคลิกบนหน้า แล้วพิมพ์ได้เลย กด Enter เมื่อเสร็จ", "Drag a box or click on the page, then type. Press Enter when done"),
    highlight: tr("ลากคลุมข้อความที่อยากเน้น ตัวหนังสือใต้แถบยังอ่านออก",
                  "Drag over the text you want to mark. The text underneath stays readable"),
    sign: tr("เลือกหรือวาดลายเซ็นด้านขวา แล้วลากกรอบบนหน้า ลายเซ็นจะลงพอดีกรอบ หรือคลิกเพื่อวางขนาดปกติ",
             "Pick or draw your signature, then drag a box on the page to fit it, or click to place it"),
    image: tr("เลือกไฟล์รูปด้านขวา แล้วลากกรอบบนหน้า รูปจะลงพอดีกรอบ หรือคลิกเพื่อวางขนาดปกติ",
              "Choose an image, then drag a box on the page to fit it, or click to place it"),
  }[mode] || "");
  function setMode(v) {
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
    st.info(MODE_HINT());
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

  /* กลุ่มตัวเลือกของแต่ละเครื่องมือ · setMode() เป็นคนเปิดปิดให้ */
  const grp = (modes, children) => ({ modes, node: el("div", { class: "pe-grp" }, children) });
  const groups = [
    grp(["text"], [
      el("h3", {}, tr("ข้อความที่จะใส่", "Text to add")),
      field(tr("ข้อความ", "Text"), textInput,
        tr("ลากกรอบบนหน้าแล้วพิมพ์ในกรอบได้เลย ดับเบิลคลิกข้อความเพื่อแก้", "Drag a box on the page and type in it. Double click a text to edit it")),
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
      el("h3", {}, tr("ลายเซ็นของคุณ", "Your signature")),
      el("div", { class: "pe-sign" }, [pad.node, el("div", { class: "row" }, [padUse, padClear]), signUpBtn, signUpInput]),
      el("h3", {}, tr("ที่บันทึกไว้", "Saved")),
      savedBox,
      el("div", { class: "pe-hint" },
        tr("เป็นภาพวางทับหน้าเอกสาร ไม่ใช่ลายเซ็นดิจิทัลที่มีใบรับรองทางกฎหมาย",
           "This is an image on top of the page, not a certificate-based digital signature")),
    ]),
    grp(["image"], [
      el("h3", {}, tr("รูปที่จะวาง", "Image to place")),
      el("div", { class: "row" }, [imgBtn, imgInput]),
      imgPreview,
    ]),
    /* ‼️ แถบปรับความกว้างใช้ร่วมกันทั้งลายเซ็นและรูป จึงต้องเป็น "กลุ่มของตัวเอง"
       ที่โชว์สองโหมด ห้ามเอา node ตัวเดียวไปใส่สองกลุ่ม เพราะ element หนึ่งตัว
       อยู่ได้ที่เดียวใน DOM กลุ่มหลังจะดึงมันออกจากกลุ่มแรกเงียบ ๆ
       (จับได้จากการไล่สายพ่อแม่: แถบเลื่อนไปโผล่ในกลุ่มที่ถูกซ่อน จึงกว้าง 0) */
    grp(["sign", "image"], [
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
  const kindMode = (e) => (e.kind === "stamp" ? (e.what === "sign" ? "sign" : "image") : e.kind);
  const toolKind = (m) => (m === "sign" || m === "image" ? "stamp" : m);
  const psz = () => (host.size ? host.size() : pageSize);
  function selectMark(e) {
    selected = e;
    if (!e) { drawOverlay(); return; }
    if (mode !== kindMode(e)) setMode(kindMode(e));
    if (e.kind === "cover") coverColor.value = e.color;
    if (e.kind === "highlight") { hlColor.value = e.color; hlPct.input.value = String(Math.round(hlAlpha(e) * 100)); }
    if (e.kind === "text") {
      if (!SIZES.includes(+e.size)) sizeSel.append(el("option", { value: String(e.size) }, String(e.size)));
      sizeSel.value = String(e.size); weightSel.value = String(e.weight || 400); textColor.value = e.color;
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
    const shown = list.filter((m) => !(editing && editing.mark === m));
    boxes.forEach((n, i) => n.classList.toggle("sel", shown[i] === e));
    st.info(tr("เลือกแล้ว เปลี่ยนค่าในแผงได้เลย ลากเพื่อย้าย ลากจุดที่มุมเพื่อย่อขยาย",
               "Selected. Change it in the panel, drag to move, drag a corner to resize"));
  }
  /** ค่าในแผงเปลี่ยน แล้วชิ้นที่เลือกอยู่เป็นชนิดเดียวกัน ให้ชิ้นนั้นเปลี่ยนตาม */
  const live = (kinds, apply) => () => {
    if (!selected || !kinds.includes(selected.kind) || !host.list().includes(selected)) return;
    apply(selected);
    drawOverlay(); host.thumbs();
  };
  coverColor.addEventListener("input", live(["cover"], (e) => { e.color = coverColor.value; }));
  hlColor.addEventListener("input", live(["highlight"], (e) => { e.color = hlColor.value; }));
  hlPct.input.addEventListener("input", live(["highlight"], (e) => { e.alpha = +hlPct.input.value / 100; }));
  textColor.addEventListener("input", live(["text"], (e) => { e.color = textColor.value; }));
  sizeSel.addEventListener("change", live(["text"], (e) => { e.size = +sizeSel.value; }));
  weightSel.addEventListener("change", live(["text"], (e) => { e.weight = +weightSel.value; }));
  stampPct.input.addEventListener("input", live(["stamp"], (e) => { e.alpha = +stampPct.input.value / 100; }));
  stampSize.addEventListener("input", live(["stamp"], (e) => {
    const c = e.x + e.rw / 2;                       // ย่อขยายรอบกึ่งกลางเดิม
    e.rw = +stampSize.value / 100; e.x = c - e.rw / 2;
  }));

  function drawOverlay() {
    layer.innerHTML = "";
    if (selected && !host.list().includes(selected)) selected = null;
    host.list().forEach((e) => {
      if (editing && editing.mark === e) return;                    // กำลังแก้ในที่ ช่องพิมพ์แสดงแทน
      const boxy = e.kind === "cover" || e.kind === "highlight";   // ของที่มีความกว้างความสูงของตัวเอง
      const box = el("div", {
        class: `pe-box ${e.kind}${e === selected ? " sel" : ""}`,
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
        e.kind === "text" ? e.text : null,
        e.kind === "stamp" ? el("img", { src: e.url, alt: "", style: { opacity: String(stampAlpha(e)) } }) : null,
        /* จุดจับ 4 มุม ‼️ มุมขวาล่างต้องมาก่อน เทสเก่าและคนที่ใช้คีย์บอร์ดหยิบ .pe-grip ตัวแรก */
        ...(boxy || e.kind === "stamp" ? ["se", "sw", "ne", "nw"].map((c) =>
          el("div", { class: `pe-grip ${c}`, "data-corner": c, title: tr("ลากเพื่อปรับขนาด", "Drag to resize") })) : []),
        el("button", {
          class: "rm", type: "button", title: tr("เอาออก", "Remove"),
          "aria-label": tr("เอาการแก้นี้ออก", "Remove this edit"),
          onclick: (ev) => { ev.stopPropagation(); host.remove(e); drawOverlay(); host.sync(); host.thumbs(); },
        }, "✕"),
      ]);
      const what = { cover: tr("กล่องปิดทับ", "Cover box"), highlight: tr("แถบไฮไลต์", "Highlight band"),
                     text: tr("ข้อความ", "Text"), stamp: e.what === "sign" ? tr("ลายเซ็น", "Signature") : tr("รูป", "Image"),
                   }[e.kind] || tr("สิ่งที่วางไว้", "Placed item");
      const say = () => box.setAttribute("aria-label", tr(
        `${what} ตำแหน่ง ${Math.round(e.x * 100)}% จากซ้าย ${Math.round(e.y * 100)}% จากบน กดลูกศรเพื่อขยับ กด Delete เพื่อเอาออก`,
        `${what} at ${Math.round(e.x * 100)}% from left, ${Math.round(e.y * 100)}% from top. Arrow keys move it, Delete removes it`));
      say();
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
            e.x = Math.min(1, Math.max(0, e.x + d[0]));
            e.y = Math.min(1, Math.max(0, e.y + d[1]));
          }
          drawOverlay();
          const again = [...layer.querySelectorAll(".pe-box")][host.list().indexOf(e)];
          if (again) again.focus();
          return;
        }
        if (ev.key === "Enter" && e.kind === "text") { ev.preventDefault(); openEditor(e); return; }
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
    if (editing) { layer.appendChild(editing.node); styleEditor(); }
    host.sync();
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
      // กำลังพิมพ์อยู่ คลิกที่อื่น = วางข้อความที่พิมพ์ก่อน คลิกนี้ใช้แค่นั้น (ชั้นถูกวาดใหม่ กล่องนี้หลุดไปแล้ว)
      if (editing) { commitEditor(); return; }
      const g = ev.target.closest(".pe-grip");
      mode0 = g ? "resize" : "move";
      corner = g ? g.dataset.corner : null;
      toolAtDown = mode;
      from = rel(ev);
      orig = { x: e.x, y: e.y, w: e.w, h: e.h, rw: e.rw };
      node.classList.add("moving");
      node.setPointerCapture(ev.pointerId);
    });
    node.addEventListener("pointermove", (ev) => {
      if (!mode0) return;
      const p = rel(ev);
      const dx = p.x - from.x, dy = p.y - from.y;
      if (mode0 === "move") {
        e.x = Math.max(0, Math.min(1, orig.x + dx));
        e.y = Math.max(0, Math.min(1, orig.y + dy));
      } else if (e.kind === "stamp") {
        /* ภาพรักษาสัดส่วนเสมอ ย่อขยายรอบกึ่งกลางตามระยะจากกึ่งกลางถึงนิ้ว (เป็นพอยต์ หน้าหมุนแบบไหนก็ใช้ได้) */
        const S = psz(), cx = orig.x + orig.rw / 2, cy = orig.y;
        const d0 = Math.hypot((from.x - cx) * S.w, (from.y - cy) * S.h) || 1;
        const d1 = Math.hypot((p.x - cx) * S.w, (p.y - cy) * S.h);
        e.rw = Math.max(0.03, Math.min(1, orig.rw * d1 / d0));
        e.x = cx - e.rw / 2;
      } else {
        const MIN = 0.004;
        let { x, y, w, h } = orig;
        if (corner === "se" || corner === "ne") w = Math.max(MIN, orig.w + dx);
        if (corner === "sw" || corner === "nw") { w = Math.max(MIN, orig.w - dx); x = orig.x + orig.w - w; }
        if (corner === "se" || corner === "sw") h = Math.max(MIN, orig.h + dy);
        if (corner === "ne" || corner === "nw") { h = Math.max(MIN, orig.h - dy); y = orig.y + orig.h - h; }
        Object.assign(e, { x, y, w, h });
      }
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
        selected = null;
        drawOverlay();
        const at = from;
        if (toolAtDown === "text") textAt(at, null, ev); else placeStamp(at);
        return;
      }
      if (!moved) { e.x = orig.x; e.y = orig.y; }
      /* ดับเบิลคลิกข้อความ = แก้ในที่ นับเองจากเวลาคลิกสองครั้งบนชิ้นเดียวกัน ใช้ได้ทั้งเมาส์และนิ้ว */
      const now = performance.now();
      if (!moved && e.kind === "text" && lastTap.e === e && now - lastTap.t < 450) {
        lastTap = { e: null, t: 0 };
        openEditor(e);
        return;
      }
      lastTap = moved ? { e: null, t: 0 } : { e, t: now };
      selectMark(e);
      if (moved) { host.thumbs(); st.ok(was === "resize" ? tr("ปรับขนาดแล้ว", "Resized") : tr("ย้ายแล้ว", "Moved")); }
      const again = [...layer.querySelectorAll(".pe-box")][host.list().indexOf(e)];
      if (again) again.focus({ preventScroll: true });
    };
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
  }

  /* ── ช่องพิมพ์ข้อความบนหน้า (รอบ 4 พี่ปอนด์: "อยากลากมาวางมากกว่า" ไม่ต้องพิมพ์ในแผงก่อน) ──
     ลากกรอบหรือคลิกด้วยเครื่องมือข้อความ = ช่องพิมพ์โผล่ตรงนั้น Enter หรือคลิกที่อื่น = วาง Esc = ยกเลิก
     ดับเบิลคลิกข้อความที่วางแล้ว = แก้ในที่ ช่องพิมพ์ใช้ตำแหน่งและขนาดตัวอักษรเดียวกับของที่จะวางจริง (geo) */
  let editing = null;          // { node, mark (ของเดิมที่กำลังแก้ หรือ null), tmp }
  function styleEditor() {
    if (!editing) return;
    const t = editing.tmp, g = geo(t), n = editing.node;
    Object.assign(n.style, { left: g.left, top: g.top, transform: g.transform || "", transformOrigin: g.transformOrigin || "",
      fontSize: `${t.size * pxPerPt()}px`, color: t.color, fontWeight: String(t.weight) });
  }
  function openEditor(mark, at, size) {
    if (editing) commitEditor();
    const up = mark ? (mark.up || 0) : (host.up ? host.up() : 0);
    const tmp = mark ? { ...mark } : { kind: "text", x: at.x, y: at.y, size: size || +sizeSel.value,
      color: textColor.value, weight: +weightSel.value, text: "", ...(up ? { up } : {}) };
    const node = el("div", { class: "pe-edit", contenteditable: "true", spellcheck: "false", role: "textbox",
      "aria-label": tr("พิมพ์ข้อความ กด Enter เพื่อวาง", "Type the text, press Enter to place it") },
      mark ? mark.text : "");
    editing = { node, mark, tmp };
    node.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    node.addEventListener("dblclick", (ev) => ev.stopPropagation());
    node.addEventListener("keydown", (ev) => {
      ev.stopPropagation();                         // Delete ลูกศร Esc ในช่องพิมพ์เป็นของช่องพิมพ์ ไม่ใช่ของหน้า
      if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); commitEditor(); }
      else if (ev.key === "Escape") { ev.preventDefault(); cancelEditor(); }
    });
    node.addEventListener("blur", () => { if (editing && editing.node === node) commitEditor(); });
    if (mark) selected = mark;
    drawOverlay();
    node.focus();
    const r = document.createRange(); r.selectNodeContents(node); r.collapse(false);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    st.info(tr("พิมพ์ได้เลย กด Enter เพื่อวาง กด Esc เพื่อยกเลิก", "Type now. Enter places it, Esc cancels"));
  }
  function commitEditor() {
    if (!editing) return;
    const { node, mark, tmp } = editing;
    const text = node.innerText.replace(/\s*\n\s*/g, " ").trim();
    editing = null;
    node.remove();
    if (mark) {
      if (text) mark.text = text; else host.remove(mark);
    } else if (text) {
      const m = { ...tmp, text };
      host.add(m);
      selected = m;
    }
    drawOverlay(); host.thumbs(); host.sync();
    if (text) st.ok(mark ? tr("แก้ข้อความแล้ว", "Text updated") : tr("วางข้อความแล้ว", "Text placed"));
  }
  function cancelEditor() {
    if (!editing) return;
    const n = editing.node;
    editing = null;
    n.remove();
    drawOverlay();
    st.info(MODE_HINT());
  }
  /** เครื่องมือข้อความที่จุดหนึ่ง: มีข้อความในแผง = วางทันทีแบบเดิม , ไม่มี = เปิดช่องพิมพ์ตรงนั้น */
  function textAt(p, size) {
    if (textInput.value.trim() && !size) return placeText(p);
    openEditor(null, p, size);
  }

  // ── ลากกรอบบนหน้า ใช้ท่าเดียวทุกเครื่องมือ (รอบ 4 พี่ปอนด์: "แบบคลุมมาวาง จะได้แพทเทิร์นเดียวกัน") ──
  let start = null, ghost = null;
  const rel = point;
  const isDrag = () => mode === "cover" || mode === "highlight";
  layer.addEventListener("pointerdown", (ev) => {
    if (!host.ready() || ev.target.closest(".rm") || ev.target.closest(".pe-edit")) return;
    if (editing) commitEditor();
    if (selected) { selected = null; drawOverlay(); }
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
    const x = Math.min(s0.x, p.x), y = Math.min(s0.y, p.y);
    const w = Math.abs(p.x - s0.x), h = Math.abs(p.y - s0.y);
    // กรอบบนจอเป็นพิกเซล ใช้คิดขนาดตัวอักษรและภาพ (ตามที่ตาเห็น หน้าหมุนแบบไหนก็ตรง)
    const cb = { l: Math.min(start.cx, ev.clientX), t: Math.min(start.cy, ev.clientY),
                 w: Math.abs(ev.clientX - start.cx), h: Math.abs(ev.clientY - start.cy) };
    ghost?.remove(); ghost = null;
    const click = w < 0.006 && h < 0.006;
    const at0 = s0;
    start = null;
    if (mode === "text") {
      if (click) return textAt(at0);
      /* ขนาดตัวอักษรจากความสูงกรอบ (บรรทัดสูงราว 1.5 เท่าของขนาดตัวอักษร) ปัดเข้าขนาดในรายการ */
      const hPt = cb.h / pxPerPt();
      const size = cb.h < 10 ? 0 : SIZES.reduce((a, b) => (Math.abs(b - hPt / 1.5) < Math.abs(a - hPt / 1.5) ? b : a));
      if (size) sizeSel.value = String(size);
      return textAt(point({ clientX: cb.l, clientY: cb.t + cb.h / 2 }), size || +sizeSel.value);
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

  const natural = new Map();          // url -> สัดส่วนสูงต่อกว้างของภาพ
  const aspectOf = (url) => {
    if (!natural.has(url)) natural.set(url, new Promise((ok) => {
      const im = new Image();
      im.onload = () => ok(im.naturalHeight / im.naturalWidth || 1);
      im.onerror = () => ok(1);
      im.src = url;
    }));
    return natural.get(url);
  };
  const stampMsg = () => tr("วางแล้ว ลากเพื่อย้าย ลากจุดที่มุมเพื่อย่อขยาย", "Placed. Drag to move, drag a corner to resize");
  const noStamp = () => st.err(mode === "sign"
    ? tr("เลือกหรือวาดลายเซ็นด้านขวาก่อน", "Pick or draw a signature on the right first")
    : tr("เลือกไฟล์รูปด้านขวาก่อน", "Choose an image on the right first"));
  /** วางลายเซ็นหรือรูปให้พอดีกรอบที่ลาก (กรอบเป็นพิกเซลบนจอ) รักษาสัดส่วนภาพ อยู่กึ่งกลางกรอบ */
  async function placeStampBox(cb) {
    if (!stampUrl) return noStamp();
    const url = stampUrl, what = mode === "sign" ? "sign" : "image";
    const ar = await aspectOf(url);
    const ppp = pxPerPt();
    const wPt = Math.min(cb.w / ppp, (cb.h / ppp) / ar);
    const rw = Math.max(0.01, wPt / psz().w);
    const c = point({ clientX: cb.l + cb.w / 2, clientY: cb.t + cb.h / 2 });
    const up = host.up ? host.up() : 0;
    const m = { kind: "stamp", x: c.x - rw / 2, y: c.y, rw, url, what,
                ...(+stampPct.input.value < 100 ? { alpha: +stampPct.input.value / 100 } : {}), ...(up ? { up } : {}) };
    host.add(m);
    drawOverlay(); host.thumbs();
    st.ok(stampMsg());
  }

  /** วางลายเซ็นหรือรูปที่จุดที่คลิก (จุดคลิก = กึ่งกลางของภาพ) */
  function placeStamp(p) {
    if (!stampUrl) return noStamp();
    const rw = (+stampSize.value || 22) / 100;
    const up = host.up ? host.up() : 0;
    /* up ไม่ใช่ 0 = หน้าถูกหมุนอยู่ ความกว้างของภาพวิ่งคนละแกนกับหน้าฐาน ห้ามบีบ x ด้วยเกณฑ์ขอบซ้าย
       กึ่งกลางภาพคือ x + rw/2 เสมอ (ดู geo) */
    host.add({ kind: "stamp", x: up ? p.x - rw / 2 : Math.max(0, p.x - rw / 2), y: p.y, rw, url: stampUrl,
                 what: mode === "sign" ? "sign" : "image",
                 ...(+stampPct.input.value < 100 ? { alpha: +stampPct.input.value / 100 } : {}), ...(up ? { up } : {}) });
    drawOverlay(); host.thumbs();
    st.ok(stampMsg());
  }

  function placeText(p) {
    const text = textInput.value.trim();
    if (!text) { st.err(tr("พิมพ์ข้อความด้านขวาก่อน", "Type the text on the right first")); return; }
    const up = host.up ? host.up() : 0;
    host.add({ kind: "text", x: p.x, y: p.y, text,
                 size: +sizeSel.value, color: textColor.value, weight: +weightSel.value, ...(up ? { up } : {}) });
    drawOverlay(); host.thumbs();
    st.ok(tr("วางข้อความแล้ว", "Text placed"));
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
