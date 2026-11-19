import { loadPdfLib, ENCRYPTED_WARNING, HIDDEN_LAYERS_WARNING, openPdf, passwordBox } from "../pdfopen.js";
import { el, dropzone, statusBar, button, field, downloadButton, stripExt, parsePages, yieldToBrowser, fmtBytes, keyHints, registerCleanup } from "../ui.js";
import { workspace } from "../workspace.js";
import { uiIcon } from "../icons.js";
import { tr, pl } from "../i18n.js";
import { attachPeek, openViewer } from "../pagezoom.js";
import { shownBox, srcRotation, viewRectToRaw, placeRawContent, viewToBase, baseLayer } from "../pdfgeom.js";
import { createMarkEditor, stampMarks, MARK_STYLE, paintMarks, markBounds } from "../pdfmarks.js";

/* ‼️ ไฟล์ไหนเป็นของใคร บอกด้วย "ตัวอักษร" ไม่ใช่ "สี" (ตัดสินจากการวัดจริง 18/09/2026)
   ลองชุดสี 4 แบบแล้ววัดด้วย src/cvd.js ไม่มีชุดไหนที่ 5 สีขึ้นไปแยกออกครบทั้งสามแบบตาบอดสี
   ชุดที่ดีที่สุดยังเหลือคู่ที่ห่างกันแค่ 4.9 ซึ่งต่ำกว่าเกณฑ์ 10 ของโปรเจกต์
   จึงให้ตัวอักษร A B C เป็นตัวบอกจริง ส่วนสีเป็นแค่ตัวช่วยให้กวาดตาเร็ว
   ชุดสีนี้ค้นครบทุกคู่จากผู้สมัคร 18 สี ได้ระยะห่างตาปกติน้อยสุด 27.3 */
const FILE_COLORS = ["#e8613c", "#0e8ba8", "#2f9e63", "#c9a227", "#b0355f", "#7c3aed"];
const colorOf = (fi) => FILE_COLORS[fi % FILE_COLORS.length];
// A..Z แล้ววนเป็น A2 B2 ถ้าไฟล์เกิน 26 ตัว (ไม่จำกัดจำนวนไฟล์)
const tagOf = (fi) => String.fromCharCode(65 + (fi % 26)) + (fi >= 26 ? String(Math.floor(fi / 26) + 1) : "");

// สไตล์เสริมเฉพาะหน้านี้ — ห้ามแก้ assets/css/tool.css จึงฝังไว้ในโมดูลแทน
const STYLE = `
.pp-left{display:flex;flex-direction:column;gap:10px}
/* ‼️ มีที่มากขึ้นแล้วจากการเลิกใช้แผงขวา จึงตั้งการ์ดขั้นต่ำให้ใหญ่ขึ้นด้วย
   ที่ 210px บนพื้นที่ราว 1060px จะได้ 4 คอลัมน์ การ์ดกว้างราว 255px
   ซึ่งใหญ่กว่าเดิมที่ได้ 3 คอลัมน์ 215px ทั้งที่เห็นหน้าได้มากกว่า */
@media (min-width:1100px){ .pages{ grid-template-columns:repeat(auto-fill,minmax(210px,1fr)) } }
.pp-stats{font-size:12.5px;line-height:1.6;color:var(--text-mute);padding:9px 12px;
  background:var(--bg-soft);border:1px solid var(--line-soft);border-radius:var(--r-sm,10px)}
.pp-stats b{color:var(--text);font-variant-numeric:tabular-nums}
.pg.selected{outline:2px solid var(--ac,var(--brand));outline-offset:2px}
/* แถบสีประจำไฟล์บนการ์ดหน้า กับป้ายตัวอักษรที่เป็นตัวบอกจริง */
.pg{position:relative}
.pg.multi{border-top:3px solid var(--fc,transparent)}
/* ‼️ พื้นป้ายผสมดำ 32% ตัวขาวบนสีไฟล์ตรง ๆ ได้แค่ 2.42 ถึง 3.98:1 (ทอง เขียว ส้ม) ผสมแล้ว 4.87 ขึ้นไปทุกสี (วัด 10/11/2026) */
.pg .src{position:absolute;inset-block-start:5px;inset-inline-start:5px;z-index:2;
  min-width:19px;height:19px;padding:0 5px;border-radius:5px;background:color-mix(in srgb,var(--fc,#666) 68%,#000);
  color:#fff;font-size:11px;font-weight:700;line-height:19px;text-align:center;
  box-shadow:0 1px 3px rgba(0,0,0,.35)}
/* ‼️ ป้าย A B C ไปเกาะกับรายการไฟล์ที่กล่องเลือกไฟล์วาดไว้แล้ว ไม่ทำรายการใหม่
   เคยทำรายการแยกของตัวเอง แล้วชื่อไฟล์ขึ้นสองที่ซ้ำกันบนหน้าจอเดียว รกโดยไม่ได้อะไรเพิ่ม */
/* ‼️ ป้ายต้อง "ลอยทับ" ไม่ใช่แทรกเป็นช่องใหม่ในแถว
   เคยแทรกเป็นช่องปกติ แล้วแถวแคบลงจนขนาดไฟล์ตกบรรทัดเป็น "2.3" กับ "KB" คนละบรรทัด
   และชื่อไฟล์โดนตัดเร็วขึ้นจนอ่านไม่ออกว่าไฟล์ไหน */
.pp-has-tag{position:relative}
.pp-tag{position:absolute;inset-block-start:3px;inset-inline-start:3px;z-index:2;
  min-width:17px;height:17px;padding:0 4px;border-radius:5px;
  background:color-mix(in srgb,var(--fc,#666) 68%,#000);color:#fff;font-size:10.5px;font-weight:700;line-height:17px;text-align:center;
  box-shadow:0 1px 3px rgba(0,0,0,.3)}

/* ── การ์ดหน้า (18/11/2026) ─────────────────────────────────────────────── */
.pp-center{position:relative}
/* ชั้นของที่วางในตัวดูหน้าใหญ่ ขนาดเท่าหน้าฐาน หมุนและเลื่อนด้วย transform จาก pdfgeom baseLayer (เฟส 2) */
.pp-base{position:absolute;left:0;top:0;transform-origin:0 0}
.pp-center .pages{user-select:none;-webkit-user-select:none}
.pp-center .pg{cursor:grab;-webkit-touch-callout:none}
.pp-center .pg:focus-visible{outline:2px solid var(--ac,var(--brand));outline-offset:2px}
/* ‼️ 18/11/2026 ค่ำ พี่ปอนด์: "ตอนเลือกการ์ดแอบตะหงิด" รุ่นแรกย้อมสีทับทั้งหน้ากระดาษ หน้าดูเหมือนกระดาษสีชมพู
   ตอนนี้กระดาษคงสีจริง บอกว่าเลือกด้วยวงขอบกับแสงรอบการ์ด และเลขหน้าเปลี่ยนเป็นป้ายทึบ */
.pp-center .pg.selected{outline:2px solid var(--ac,var(--brand));outline-offset:2px;
  box-shadow:0 0 0 6px color-mix(in srgb,var(--ac,var(--brand)) 16%,transparent),0 10px 22px -12px rgba(15,23,42,.35)}
.pg.selected .pp-foot{background:var(--bg-soft)}
.pg.selected .pp-foot .num{background:color-mix(in srgb,var(--ac,var(--brand)) 82%,#000);color:#fff;
  border-radius:999px;padding:1px 9px}
/* เลขหน้าในไฟล์ผลลัพธ์ แถบบางใต้ภาพ ไม่ทับเนื้อหา */
.pg .pp-foot{display:flex;justify-content:center;padding:3px 0 4px;background:var(--bg-soft);border-top:1px solid var(--line-soft)}
.pg .pp-foot .num{position:static;display:inline-block;background:none;color:var(--text);padding:0;
  font:700 12px/1.35 var(--font);font-variant-numeric:tabular-nums;min-width:2ch;text-align:center}
.pp-center .pg .pg-cropped{top:auto;bottom:30px}
/* ปุ่มบนการ์ด 3 ปุ่ม มุมบนขวา โผล่ตอนชี้ ตอนเลือก หรือตอนโฟกัสด้วยคีย์บอร์ด */
.pp-center .pg .tools{inset:6px 6px auto auto;padding:0;gap:4px;background:none;z-index:3;
  opacity:0;pointer-events:none;transition:opacity .14s ease}
.pp-center .pg .tools button{width:30px;height:30px;border-radius:999px;display:grid;place-items:center;padding:0;
  background:color-mix(in srgb,var(--card,#fff) 94%,transparent);color:var(--text);
  border:1px solid var(--line-soft);box-shadow:0 1px 4px rgba(0,0,0,.2)}
.pp-center .pg .tools button:hover{background:var(--card,#fff)}
.pp-center .pg .tools .pp-del:hover{color:var(--err,#c62828)}
/* ‼️ เครื่องที่มีเมาส์ กดได้ตลอด เมาส์จะไปถึงปุ่มได้ก็ต้องชี้อยู่บนการ์ด ซึ่งปุ่มโผล่แล้ว
   (เครื่องมืออัตโนมัติที่เช็คก่อนเลื่อนเมาส์ก็กดได้ด้วย) ส่วนจอสัมผัสห้ามกดปุ่มที่มองไม่เห็น แตะพลาดแล้วลบหน้าโดยไม่รู้ตัว */
@media (hover:hover){ .pp-center .pg .tools{pointer-events:auto} .pp-center .pg:hover .tools{opacity:1} }
.pp-center .pg:focus-within .tools,.pp-center .pg.selected .tools{opacity:1;pointer-events:auto}
@media (pointer:coarse){ .pp-center .pg .tools button{width:36px;height:36px} }
.pp-is-dragging .pg .tools{opacity:0 !important;pointer-events:none !important}
/* ── แถบเลือกหลายหน้า ลอยที่ขอบล่างของพื้นที่การ์ด ไม่ดันการ์ด ── */
.pp-bulk-dock{position:sticky;bottom:14px;height:0;z-index:20;display:flex;justify-content:center}
.pp-bulk{position:absolute;bottom:0;display:flex;align-items:center;gap:4px;padding:5px 5px 5px 16px;
  border-radius:999px;background:var(--card);border:1px solid var(--line);
  box-shadow:0 12px 32px rgba(15,23,42,.2);animation:pp-up .2s var(--ease-snap,ease)}
.pp-bulk[hidden]{display:none}
.pp-bulk{cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;padding-inline-start:8px}
.pp-bulk.dragging{cursor:grabbing;box-shadow:0 20px 44px rgba(15,23,42,.3)}
.pp-bulk button{cursor:pointer}
.pp-bulk-grip{display:grid;place-items:center;color:var(--text-mute);margin-inline-end:2px}
.pp-bulk-grip .pg-ico{width:16px;height:16px}
.pp-bulk-n{font:700 13px/1.3 var(--font);margin-inline-end:6px;white-space:nowrap;font-variant-numeric:tabular-nums}
.pp-bulk .btn{min-height:34px;white-space:nowrap}
.pp-bulk .btn.has-ico{min-width:38px;padding-inline:10px;justify-content:center}
.pp-help{margin:6px 2px 0;font-size:12px;color:var(--text-mute)}
.pp-help-body{padding:2px 0 0 18px}
.pp-help[open] > .keyhints-t::before{transform:rotate(45deg)}
.pp-help-body .note{margin:3px 0}
.pp-bulk-x{appearance:none;border:0;background:transparent;color:var(--text-dim);width:34px;height:34px;border-radius:999px;
  display:grid;place-items:center;cursor:pointer;margin-inline-start:2px}
.pp-bulk-x:hover{background:var(--bg-soft);color:var(--text)}
.pp-bulk-x:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
.pp-bulk-x .pg-ico{width:18px;height:18px}
/* ‼️ ใช้ transform ไม่ใช่ translate เพราะ translate คือที่เก็บตำแหน่งที่ผู้ใช้ลากแถบไปวาง (19/11/2026)
   รุ่นแรกแอนิเมชันทับค่านั้น ปล่อยเมาส์แล้วแถบเด้งกลับที่เดิมแวบหนึ่ง ดับเบิลคลิกคลิกที่สองตกพื้นหลังแล้วยกเลิกเลือกหมด */
@keyframes pp-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
/* ── ลากย้ายหน้า ── */
html.pp-grabbing,html.pp-grabbing *{cursor:grabbing !important}
.pg.pp-ghost{position:fixed;z-index:1200;margin:0;pointer-events:none;transform-origin:50% 35%;
  transition:scale .2s cubic-bezier(.2,.9,.3,1.35),rotate .14s ease-out,box-shadow .2s ease;
  box-shadow:0 2px 6px rgba(0,0,0,.12)}
.pg.pp-ghost .tools{display:none}
.pg.pp-ghost.lifted{scale:1.07;rotate:var(--tilt,-2.5deg);border-color:var(--brand);
  box-shadow:0 28px 50px -10px rgba(15,23,42,.45),0 10px 20px rgba(15,23,42,.18)}
.pg.pp-ghost.landing{transition:translate .34s cubic-bezier(.34,1.56,.64,1),scale .34s cubic-bezier(.34,1.56,.64,1),
  rotate .28s ease,box-shadow .3s ease}
/* ‼️ 18/11/2026 ค่ำ พี่ปอนด์ชอบเลขตัวโตในช่องวาง "ดีกว่าคำพูดว่าย้ายไปหน้าไหน" ป้ายนี้จึงเหลือให้โปรแกรมอ่านหน้าจอเท่านั้น
   opacity 0 ยังอยู่ในต้นไม้ accessibility (role=status ยังประกาศ) แต่ตาไม่เห็น */
.pp-move-badge{opacity:0}
.pp-move-badge{position:fixed;z-index:1201;pointer-events:none;translate:-50% -100%;white-space:nowrap;
  padding:6px 13px;border-radius:999px;background:color-mix(in srgb,var(--brand) 80%,#000);color:#fff;
  font:700 13px/1.2 var(--font);box-shadow:0 8px 20px rgba(0,0,0,.28)}
.pp-move-badge.same{background:#4a5160}
.pp-move-num{position:fixed;z-index:1202;pointer-events:none;translate:-50% -50%;min-width:46px;height:46px;padding:0 10px;
  border-radius:999px;display:grid;place-items:center;background:color-mix(in srgb,var(--brand) 85%,#000);color:#fff;
  font:800 24px/1 var(--font);font-variant-numeric:tabular-nums;border:3px solid #fff;box-shadow:0 8px 20px rgba(0,0,0,.3)}
.pp-move-num:empty{display:none}
.pp-move-num.same{background:#4a5160}
.pp-move-num.pop{animation:pp-num-pop .32s cubic-bezier(.3,1.7,.5,1)}
@keyframes pp-num-pop{40%{scale:1.3}}
/* ช่องที่จะลง: การ์ดจริงกลายเป็นช่องเรืองแสง บอกเลขหน้าปลายทางตัวใหญ่ */
.pg.pp-slot{border:2px dashed color-mix(in srgb,var(--brand) 70%,transparent);
  background:color-mix(in srgb,var(--brand) 8%,var(--bg-soft));
  box-shadow:0 0 0 4px color-mix(in srgb,var(--brand) 14%,transparent),0 0 22px 2px color-mix(in srgb,var(--brand) 32%,transparent);
  animation:pp-glow 1.3s ease-in-out infinite}
.pg.pp-slot > :not(.pp-slot-mark){visibility:hidden}
.pg.pp-slot::before{display:none}
.pp-slot-mark{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:4px;color:color-mix(in srgb,var(--brand) 85%,var(--text))}
.pp-slot-mark b{font:800 42px/1 var(--font);font-variant-numeric:tabular-nums}
.pp-slot-mark span{font:600 12px/1.3 var(--font)}
@keyframes pp-glow{50%{box-shadow:0 0 0 7px color-mix(in srgb,var(--brand) 9%,transparent),0 0 34px 6px color-mix(in srgb,var(--brand) 45%,transparent)}}
.pp-pop{animation:pp-pop .34s cubic-bezier(.3,1.7,.5,1)}
@keyframes pp-pop{40%{transform:scale(1.5);color:var(--brand)}}
.pg.pp-landed{animation:pp-land .9s ease-out}
@keyframes pp-land{0%{box-shadow:0 0 0 3px var(--brand),0 0 28px 6px color-mix(in srgb,var(--brand) 55%,transparent)}
  100%{box-shadow:0 0 0 0 transparent}}
/* กดลบหรือหมุนโดยยังไม่เลือกหน้า การ์ดกะพริบขอบเบา ๆ บอกว่าต้องเลือกตรงนี้ก่อน */
.pages.pp-nudge .pg:not(.dropped){animation:pp-nudge .6s ease-out}
@keyframes pp-nudge{30%{border-color:var(--ac,var(--brand));box-shadow:0 0 0 3px color-mix(in srgb,var(--ac,var(--brand)) 25%,transparent)}}
@media (prefers-reduced-motion:reduce){
  .pg.pp-slot,.pp-pop,.pages.pp-nudge .pg{animation:none}
  .pg.pp-landed{animation:none;outline:3px solid var(--brand);outline-offset:2px}
  .pg.pp-ghost,.pg.pp-ghost.landing{transition:none}
  .pg.pp-ghost.lifted{rotate:none;scale:none}
  .pp-bulk{animation:none}
}
`;

export function mount(tool) {
  const st = statusBar();
  const pagesGrid = el("div", { class: "pages" });
  const extra = el("div", {}); // ที่อยู่กล่องขอรหัสผ่านไฟล์ล็อก
  const results = el("div", { class: "results" });
  const summary = el("div", { class: "pp-stats" }, tr("ยังไม่ได้เลือกไฟล์", "No file chosen yet"));
  let files = [];
  let items = []; // {fi, index, rotate, dropped, thumb}
  /* ‼️ เลือกได้หลายหน้า (18/11/2026 พี่ปอนด์ว่าปุ่มบนแถบซ้ำกับปุ่มบนการ์ด เลยย้ายไปเป็นแถบเลือกหลายหน้า)
     เก็บตัว item ไม่ใช่ index กันหลุดตอนลากสลับ · anchor = ใบที่คลิกล่าสุด ใช้เป็นจุดแทรกกับจุดตั้งต้นของ Shift+คลิก */
  const sel = new Set();
  let anchor = null;
  const selList = () => items.filter((it) => sel.has(it));          // เรียงตามลำดับบนจอ
  const clearSel = () => { sel.clear(); anchor = null; };
  const insertPoint = () => (anchor && sel.has(anchor) ? anchor : selList().pop() || null);

  const dz = dropzone({
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "PDF files"),
    accept: "application/pdf,.pdf", multiple: true, reorder: true,
    onPickFile: (f) => pickFile(f),
    /* ‼️ เอาไฟล์ออก งานของไฟล์ที่เหลือยังอยู่ครบ (แผนเฟส 3 ข้อ 3 ดู removeFiles ข้างล่าง)
       ที่หายคือหน้าของไฟล์ที่เอาออกเท่านั้น ถ้าหน้าพวกนั้นมีของที่วางไว้ ถามก่อน ตอบไม่ ไฟล์ยังอยู่ */
    beforeRemove: (file) => {
      const fi = files.indexOf(file);
      if (!items.some((x) => !x.blank && x.fi === fi && x.marks && x.marks.length)) return true;
      return confirm(tr("ไฟล์นี้มีปิดทับ ข้อความ หรือลายเซ็นที่วางไว้บนหน้า เอาออกแล้วของพวกนั้นจะหายไปด้วย ต้องการเอาออกไหม",
                        "This file has covers, text or signatures placed on its pages. Removing it removes them too. Remove it anyway?"));
    },
    hint: tr("หลายไฟล์ได้ ลากสลับลำดับไฟล์ได้", "Multiple files, drag to reorder"),
    onChange: (f) => {
      const next = [...(f || [])];
      results.innerHTML = "";
      /* ‼️ สลับลำดับไฟล์ ไม่ต้องเรนเดอร์ภาพใหม่ (18/09/2026)
         กล่องเลือกไฟล์แจ้ง onChange ทุกครั้งที่ลากสลับ ถ้าเรนเดอร์ใหม่ทุกครั้ง
         ไฟล์ 14 หน้า 3.7 MB จะรอหลายวินาทีต่อการลากหนึ่งครั้ง ซึ่งใช้งานไม่ไหว
         ถ้าเป็นชุดไฟล์เดิมแค่สลับที่ ให้ย้ายภาพที่มีอยู่แล้วตามไป พร้อมแก้เลขไฟล์ต้นทาง */
      const sameSet = next.length === files.length && next.length > 0
        && next.every((x) => files.includes(x));
      if (sameSet && items.length) {
        const order = next.map((x) => files.indexOf(x));   // ตำแหน่งใหม่ -> ตำแหน่งเดิม
        const remap = new Map(order.map((oldIdx, newIdx) => [oldIdx, newIdx]));
        items.forEach((it) => { it.fi = remap.get(it.fi); });
        items.sort((a, b) => (a.fi - b.fi) || (a.index - b.index));
        files = next;
        renderFiles();
        render();
        st.ok(tr("สลับลำดับไฟล์แล้ว หน้าเรียงตามไฟล์ใหม่", "Files reordered, pages regrouped"));
        return;
      }
      /* ‼️ เพิ่มไฟล์เข้ามาใหม่ โดยไฟล์เดิมยังอยู่ครบและเรียงเหมือนเดิม
         ต้องเก็บงานที่จัดไว้ทั้งหมด (หน้าที่ลบ การหมุน การครอบ หน้าว่าง) แล้วอ่านเฉพาะไฟล์ใหม่
         เดิมเรียก loadPreview() ซึ่งล้าง items ทิ้งหมด คนจัด 26 หน้าแล้วเพิ่มไฟล์ = เสียงานทั้งชุด
         และแทรกต่อจากหน้าที่เลือกอยู่ ได้ "เพิ่มเอกสารตรงนี้" ไปในตัว */
      const added = files.length > 0 && next.length > files.length
        && files.every((f, i) => next[i] === f);
      if (added && items.length) {
        const from = files.length;
        files = next;
        loadPreview({ fromFile: from, insertAfter: insertPoint() });
        return;
      }
      const shrunk = next.length > 0 && next.length < files.length && next.every((x) => files.includes(x));
      if (shrunk && items.length) { removeFiles(next); return; }
      files = next;
      if (files.length) loadPreview();
      else { items = []; clearSel(); closeDocs(); pagesGrid.innerHTML = ""; st.clear(); setLoaded(false); renderFiles(); updateSummary(); ws.showCanvas(false); }
    },
  });

  // ── แผงซ้าย: เลือกไฟล์ + รายชื่อไฟล์ + สรุปจำนวนหน้า ─────────────────
  const leftNode = el("div", { class: "pp-left" }, [dz.container, extra, summary]);
  /* ── แผงขวา: ตัวเลือกทั้งหมด (ย้ายกลับมาขวา 20/09/2026 ตามที่พี่ปอนด์ทัก) ──
   * ‼️ เคยย้ายไปต่อท้ายแผงซ้ายเมื่อ 8efcdbe เพราะแผงขวากิน 340px
   *   แล้วการ์ดเหลือ 3 คอลัมน์ 215px ทั้งที่งานของเครื่องมือนี้คือดูภาพแล้วลากสลับ
   * ‼️ เหตุผลนั้นหมดไปแล้ว เพราะตอนนี้แผงข้างพับเก็บเป็นแถบไอคอนได้
   *   กดครั้งเดียวได้ความกว้างคืนครบ จึงไม่ต้องแลกผังที่ถูกต้องกับพื้นที่อีกต่อไป
   * ‼️ และผังที่ถูกต้องคือ ไฟล์เข้าอยู่ซ้าย ตัวเลือกอยู่ขวา ตามแบบ Power BI
   *   ซึ่งเครื่องมืออีก 23 ตัวในเว็บนี้ทำแบบนั้นอยู่แล้ว เหลือตัวนี้ตัวเดียวที่ผิดแบบ
   *   ความสม่ำเสมอสำคัญกว่าการปรับจูนรายตัว เพราะคนใช้หลายเครื่องมือในวันเดียวกัน */
  const rightNode = el("div", {});

  /* ── แถบเลือกหลายหน้า (18/11/2026) ──────────────────────────────────────
     ‼️ พี่ปอนด์: แถบบนมี หมุนซ้าย หมุนขวา ลบ ซ้ำกับปุ่มบนการ์ดทุกใบ "มันงงไหมหล่ะ มีมันซ้ำซ้อนเกิน"
     กลุ่มนั้นบนแถบบนจึงถอดออก การ์ดเหลือ หมุน กับ ลบ ของตัวเอง
     ส่วนงานกับหลายหน้าพร้อมกันย้ายมาอยู่แถบนี้ ซึ่งโผล่เฉพาะตอนเลือกตั้งแต่ 2 หน้า ไม่เลือกก็ไม่มี
     ลอยที่ขอบล่างของพื้นที่การ์ด ไม่ดันการ์ดเลื่อน (ดันแล้วคนที่กำลัง Ctrl+คลิกจะคลิกพลาดใบ) */
  const bulkCount = el("span", { class: "pp-bulk-n", "aria-live": "polite" });
  const bulkBar = el("div", { class: "pp-bulk", role: "toolbar", hidden: true,
    "aria-label": tr("ทำกับหน้าที่เลือก", "Act on selected pages") }, [
    el("span", { class: "pp-bulk-grip", "aria-hidden": "true" }, [uiIcon("grip", "pg-ico")]),
    bulkCount,
    /* ‼️ 19/11/2026 พี่ปอนด์: "ไม่ต้องเขียนอธิบายหรอ หมุน หรือ ลบ สัญลักษณ์มันก็บอกอยู่" เหลือไอคอน ชื่อเต็มอยู่ใน aria-label */
    button("", { ghost: true, icon: "rotateR",
      label: tr("หมุนหน้าที่เลือกตามเข็ม 90 องศา", "Rotate the selected pages 90 degrees clockwise"),
      onclick: () => rotateSelected(90) }),
    button("", { ghost: true, icon: "trash",
      label: tr("ลบหน้าที่เลือก", "Delete the selected pages"), onclick: dropSelected }),
    /* ‼️ 18/11/2026 ค่ำ พี่ปอนด์: "ยกเลิกเลือก แปลกไหม แค่เป็นปุ่มปิดก็เข้าใจแล้ว" ไอคอนกากบาท ชื่อเต็มอยู่ใน aria-label กับ title */
    el("button", { class: "pp-bulk-x", type: "button", "aria-label": tr("ยกเลิกเลือก", "Clear selection"),
      title: tr("ยกเลิกเลือก (Esc)", "Clear selection (Esc)"), onclick: () => { clearSel(); render(); } }, [uiIcon("close", "pg-ico")]),
  ]);
  const bulkDock = el("div", { class: "pp-bulk-dock" }, [bulkBar]);
  /* ── ลากแถบเลือกหลายหน้าไปวางตรงไหนก็ได้ (19/11/2026 พี่ปอนด์: "จับมันย้ายไปมาได้ก็ดีนะ" "ลากเล่นอ่ะ")
     แถบลอยทับท้ายการ์ด คนที่อยากเห็นการ์ดเต็ม ๆ จับย้ายเองได้ จำตำแหน่งไว้ในเครื่อง ดับเบิลคลิกกลับที่เดิม
     ‼️ จับได้ทั้งแถบยกเว้นปุ่ม กดปุ่มยังเป็นการกดปุ่ม , ห้ามหลุดนอกจอ (เหลือขอบ 8px) */
  const BULK_KEY = "filekit-pdfpages-bulk-pos";
  let bulkPos = { x: 0, y: 0 };
  try { const v = JSON.parse(localStorage.getItem(BULK_KEY) || "null"); if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) bulkPos = v; } catch { /* โหมดส่วนตัว */ }
  const applyBulkPos = () => { bulkBar.style.translate = `${bulkPos.x}px ${bulkPos.y}px`; };
  const saveBulkPos = () => { try { localStorage.setItem(BULK_KEY, JSON.stringify(bulkPos)); } catch { /* โหมดส่วนตัว */ } };
  applyBulkPos();
  bulkBar.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, ox = bulkPos.x, oy = bulkPos.y;
    const r0 = bulkBar.getBoundingClientRect();
    try { bulkBar.setPointerCapture(e.pointerId); } catch { /* ไม่รองรับ */ }
    bulkBar.classList.add("dragging");
    /* ‼️ กรอบที่ลากได้ = พื้นที่การ์ดที่เห็นบนจอ ไม่ใช่ทั้งหน้าต่าง
       รุ่นแรกให้ลากได้ทั้งจอ แถบมุดลงใต้แถบหัวเว็บ กดอะไรบนแถบไม่ได้อีก (เทสจับได้ header intercepts pointer events) */
    const B = bulkBounds();
    const move = (ev) => {
      const dx = Math.max(B.left - r0.left, Math.min(B.right - r0.right, ev.clientX - sx));
      const dy = Math.max(B.top - r0.top, Math.min(B.bottom - r0.bottom, ev.clientY - sy));
      bulkPos = { x: ox + dx, y: oy + dy };
      applyBulkPos();
    };
    const up = () => {
      bulkBar.removeEventListener("pointermove", move);
      bulkBar.removeEventListener("pointerup", up);
      bulkBar.removeEventListener("pointercancel", up);
      bulkBar.classList.remove("dragging");
      saveBulkPos();
    };
    bulkBar.addEventListener("pointermove", move);
    bulkBar.addEventListener("pointerup", up);
    bulkBar.addEventListener("pointercancel", up);
  });
  function bulkBounds() {
    const host = (bulkDock.closest(".s2-stage, .ws-stage, .ws-body") || ws.body).getBoundingClientRect();
    return { left: Math.max(8, host.left + 8), top: Math.max(8, host.top + 8),
             right: Math.min(innerWidth, host.right) - 8, bottom: Math.min(innerHeight, host.bottom) - 8 };
  }
  bulkBar.addEventListener("dblclick", (e) => {
    if (e.target.closest("button")) return;
    bulkPos = { x: 0, y: 0 }; applyBulkPos(); saveBulkPos();
  });
  const undoDelBtn = button(tr("ย้อนการลบ", "Undo delete"), { ghost: true, icon: "undo",
    label: tr("เอาหน้าที่เพิ่งลบกลับมา", "Bring back the page you just deleted"), onclick: undoDelete });
  undoDelBtn.disabled = true;
  const cropBtn = button(tr("ครอบขอบขาว", "Trim white edge"), { ghost: true,
    label: tr("ครอบขอบขาวของหน้าที่เลือก", "Trim the white edge of the selected page"), onclick: () => autoCrop(false) });
  const cropAllBtn = button(tr("ครอบทุกหน้า", "Trim every page"), { ghost: true, onclick: () => autoCrop(true) });
  const blankBtn = button(tr("+ หน้าว่าง", "+ Blank page"), { ghost: true,
    label: tr("เพิ่มหน้าว่างต่อจากหน้าที่เลือก", "Add a blank page after the selected one"), onclick: addBlank });
  /* ‼️ 19/11/2026 พี่ปอนด์: "ไม่อยากให้เราลิงก์ไปเครื่องมืออื่นเลย อยากทำให้มันแก้ไขได้ตั้งแต่หน้านี้เลย ... ครบจบในเครื่องมือเดียว"
     เดิมปุ่มนี้พาไปเครื่องมือแก้ไขและเซ็น พาไปได้แค่ไฟล์ต้นฉบับ งานที่จัดไว้ (ลำดับ หมุน ครอบ ลบ หลายไฟล์) หายหมด
     ตอนนี้เปิดตัวดูหน้าใหญ่ที่หน้าที่เลือก (ไม่ได้เลือก = หน้าแรกที่เก็บ) พร้อมกางแผงแก้ไข ไม่ออกจากหน้านี้ */
  const editTextBtn = button(tr("แก้ข้อความบนหน้า", "Edit text on a page"), { ghost: true,
    label: tr("เปิดหน้าใหญ่พร้อมเครื่องมือแก้ไข ปิดทับ ข้อความ ลายเซ็น", "Open the page large with the edit tools: cover, text, signature"),
    onclick: () => {
      const keep = items.filter((x) => !x.dropped);
      if (!keep.length) return;
      const pick = anchor && sel.has(anchor) && !anchor.dropped ? anchor : (selList().find((x) => !x.dropped) || keep[0]);
      openZoom(pick, true);
    } });
  /* ‼️ รีเซ็ตเมื่อมีของที่วางบนหน้าแล้ว ถามก่อน (ฟ้าเคาะ 19/11/2026) ลายเซ็นกับข้อความที่วางไว้หายทั้งหมดและย้อนไม่ได้
     ไม่มีของที่วาง ทำเหมือนเดิมทันที */
  const resetBtn = button(tr("รีเซ็ตทั้งหมด", "Reset all"), { icon: "undo", ghost: true, onclick: () => {
    if (!files.length) return;
    if (items.some((x) => x.marks && x.marks.length)
        && !confirm(tr("รีเซ็ตแล้ว ปิดทับ ข้อความ และลายเซ็นที่วางบนหน้าจะหายทั้งหมด ต้องการรีเซ็ตไหม",
                       "Resetting removes every cover, text and signature you placed. Reset anyway?"))) return;
    loadPreview();
  } });
  [cropBtn, cropAllBtn, blankBtn, editTextBtn, resetBtn].forEach((b) => { b.disabled = true; });

  // ── แผงขวา: เก็บเฉพาะบางหน้า + วิธีเรียงเมื่อมีหลายไฟล์ ───────────────
  const rangeInput = el("input", { type: "text", placeholder: tr("เช่น 1-3,5,8-", "e.g. 1-3,5,8-"), disabled: true });
  const rangeBtn = button(tr("ใช้ช่วงนี้", "Apply range"), { ghost: true, onclick: applyRange });
  rangeBtn.disabled = true;
  const byFileBtn = button(tr("เรียงทีละไฟล์", "Group by file"), { ghost: true, onclick: () => reorder("byfile") });
  const zipBtn = button(tr("สลับไฟล์ทีละหน้า", "Interleave pages"), { ghost: true, onclick: () => reorder("zip") });
  [byFileBtn, zipBtn].forEach((b) => { b.disabled = true; });
  /* ── ครอบแล้วเอาหน้ากระดาษแบบไหน ──────────────────────────────────────
     ‼️ สองอย่างนี้ขัดกันเชิงเรขาคณิต เลือกได้อย่างเดียว
        เนื้อหาที่ครอบมักกว้างเต็มหน้าอยู่แล้ว เหลือขาวแค่ด้านบนล่าง
        จะให้ "หน้าเท่ากัน" และ "ไม่มีที่ว่าง" พร้อมกันต้องยืดบิดหรือตัดข้างทิ้ง
     ค่าตั้งต้นคือหน้าเท่ากัน เพราะไฟล์ที่หน้าหลายขนาดปนกัน สั่งพิมพ์แล้วเครื่องย่อขยายมั่ว */
  let cropMode = "same";
  /* ‼️ 18/11/2026 ค่ำ พี่ปอนด์: "อันนี้เหมือนมาจัดการเขา เขาควรอิสระได้สิ" บางคนอยากได้หน้า 1 เต็มกระดาษ หน้า 2 หดพอดีเนื้อหา
     ข้อขัดกันเชิงเรขาคณิตยังจริงอยู่ แต่ขัดกัน "ในหน้าเดียว" ไม่ใช่ทั้งไฟล์ แต่ละหน้าเลือกเองได้
     เลือกหน้าไว้แล้วกด = ใช้กับหน้าที่เลือก , ไม่ได้เลือก = ใช้ทุกหน้า (ล้างที่ตั้งรายหน้าทิ้ง) */
  const modeOf = (it) => it.cropMode || cropMode;
  const sameBtn = button(tr("หน้าเท่ากันทุกหน้า", "Same page size"), { ghost: true,
    onclick: () => setCropMode("same") });
  const tightBtn = button(tr("ตัดหน้าให้พอดีเนื้อหา", "Page hugs the content"), { ghost: true,
    onclick: () => setCropMode("tight") });
  function syncCropBtns() {
    let m = cropMode;
    if (sel.size) { const ms = new Set([...sel].map(modeOf)); m = ms.size === 1 ? [...ms][0] : null; }
    sameBtn.classList.toggle("on", m === "same");
    tightBtn.classList.toggle("on", m === "tight");
  }
  function setCropMode(m) {
    if (sel.size) {
      sel.forEach((it) => { it.cropMode = m; });
      st.info(m === "same"
        ? tr(`${sel.size} หน้าที่เลือกจะเต็มกระดาษขนาดเดิม`, `The ${pl(sel.size, "selected page", "selected pages")} keep the full paper size`)
        : tr(`${sel.size} หน้าที่เลือกจะหดพอดีเนื้อหา`, `The ${pl(sel.size, "selected page", "selected pages")} shrink to the content`));
      render();
      return;
    }
    cropMode = m;
    items.forEach((it) => { delete it.cropMode; });
    st.info(m === "same"
      ? tr("ทุกหน้าจะได้ขนาดเท่ากัน เนื้อหาที่ครอบจัดกลางหน้า เหลือขอบขาวบ้าง",
           "Every page keeps the same size, trimmed content sits centred with some white margin")
      : tr("หน้ากระดาษจะหดพอดีเนื้อหา ไม่เหลือขอบขาว แต่ไฟล์จะมีหน้าหลายขนาดปนกัน",
           "The paper shrinks to the content, no white margin, but the file ends up with mixed page sizes"));
    render();
  }
  const cropGroup = el("div", {}, [
    el("h3", {}, tr("ครอบแล้วเอาหน้ากระดาษแบบไหน", "After trimming, what happens to the paper")),
    el("div", { class: "row" }, [sameBtn, tightBtn]),
    el("small", {}, tr("เลือกหน้าไว้ก่อนแล้วกด = ใช้เฉพาะหน้านั้น , ไม่ได้เลือก = ใช้ทุกหน้า",
                       "Select pages first to apply to them only, or nothing selected to apply to all")),
  ]);

  const sortGroup = el("div", {}, [
    el("h3", {}, tr("วิธีเรียงเมื่อมีหลายไฟล์", "Order across files")),
    el("div", { class: "row" }, [byFileBtn, zipBtn]),
    el("small", {}, tr("เรียงทีละไฟล์ คือไฟล์ A จนหมดแล้วต่อ B", "Group by file puts all of A, then all of B")),
  ]);
  /* ‼️ ตัวเลือกอยู่แผงซ้าย ไม่ใช่แผงขวา (18/09/2026)
     เดิมมีแผงขวากว้าง 340px เพื่อใส่ของแค่ช่องเดียวกับปุ่มสามปุ่ม
     แต่งานของเครื่องมือนี้คือ "ดูภาพแล้วลากสลับ" พื้นที่ภาพจึงสำคัญที่สุด
     วัดจริงแล้วแผงขวากินไป 340px ทำให้กริดเหลือ 708px ได้แค่ 3 คอลัมน์
     ย้ายมาต่อท้ายแผงซ้ายซึ่งยังมีที่ว่าง แล้วคืนพื้นที่ให้ภาพทั้งหมด */
  /* ‼️ 19/11/2026 ถอดชิปเลือกเร็ว (หน้าคี่ หน้าคู่ ครึ่งแรก ครึ่งหลัง ตัดหน้าปก) พี่ปอนด์: "เอาออกเหอะจริง"
     ถามมาก่อนแล้วว่า "มันจะมีคนมาใช้ด้วยเหรอ" งานหลักของเครื่องมือนี้คือดูภาพแล้วลาก ลบ หมุน
     คนที่อยากเก็บบางช่วงยังพิมพ์ช่วงหน้าในช่องข้างล่างได้ */
  rightNode.append(
    el("div", {}, [
      el("h3", {}, tr("อยากเก็บหน้าไหนไว้บ้าง", "Which pages do you want to keep")),
      field("", rangeInput, ""),
      rangeBtn,
    ]),
    sortGroup,
    cropGroup,
  );

  const saveBtn = button(tr("บันทึก", "Save"), { onclick: save });
  saveBtn.disabled = true;

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์ PDF", "PDF files"), node: leftNode },
    /* ‼️ เปิดมาพับไว้ เพราะงานหลักของเครื่องมือนี้คือดูภาพหน้าแล้วลากสลับ
       วัดจริง แผงขวากาง = 3 คอลัมน์ การ์ด 215px · พับไว้ = 4 คอลัมน์ การ์ด 249px
       ตัวเลือกยังอยู่ครบในแถบไอคอนขวา กดครั้งเดียวกางออกมา และจำที่ผู้ใช้เลือกไว้ */
    right: { title: tr("ตัวเลือก", "Options"), node: rightNode, folded: true },
    center: { node: el("div", { class: "pp-center" }, [pagesGrid, bulkDock]), empty: tr("ยังไม่มีไฟล์ เลือก PDF เพื่อดูตัวอย่าง", "No file yet. Choose a PDF to preview") },
    toolbar: [cropBtn, cropAllBtn, blankBtn, el("div", { class: "sep" }),
              undoDelBtn, editTextBtn, resetBtn],
    /* ‼️ ชื่อกลุ่มตอบคำถามที่ปุ่มตอบเองไม่ได้ คือ "ทำกับอะไร"
       ครอบขอบขาว อยู่กลุ่มทั้งเล่ม ส่วนหมุนกับลบ อยู่กลุ่มหน้าที่เลือก
       ก่อนมีชื่อกลุ่ม สองอย่างนี้หน้าตาเหมือนกันหมด ต้องกดลองเองถึงจะรู้ */
    toolbarGroups: [tr("ครอบและเพิ่มหน้า", "Trim and add"), tr("อื่น ๆ", "More")],
    footer: [st.node, saveBtn],
  });
  ws.wrap.prepend(el("style", {}, STYLE + MARK_STYLE));

  /* ‼️ คีย์ลัดระดับหน้า (พี่ปอนด์ทัก 20/09/2026 ว่า "ปุ่มพวกคีย์ลัดยังไม่เห็นนะ")
     ผูกที่ ws.body ไม่ใช่ document เพราะเครื่องมืออื่นก็ผูกของตัวเองไว้เหมือนกัน
     ผูกที่ document จะได้คีย์ลัดข้ามเครื่องมือกันมั่วเมื่อผู้ใช้สลับไปมา
     ‼️ ต้องไม่ทำงานตอนกำลังพิมพ์อยู่ในช่อง ไม่งั้น Ctrl+Z ในช่องพิมพ์ช่วงหน้าจะถูกขโมย */
  /* ‼️ ผูกที่ document แต่รับเฉพาะตอนเครื่องมือนี้อยู่บนจอ (แก้ 18/11/2026 พี่ปอนด์ว่า "ไม่เห็นกดได้เลย")
     รุ่นเดิมผูกที่ ws.body คีย์จึงทำงานเฉพาะตอนโฟกัสอยู่บนการ์ด
     คลิกพื้นที่ว่างหรือยังไม่ได้คลิกอะไร โฟกัสอยู่ที่ <body> อีเวนต์ไม่เคยวิ่งลงมาถึง ws.body จึงเงียบสนิท
     ‼️ ไม่ยุ่งกับคีย์ตอนพิมพ์ในช่อง ตอนอยู่ในกล่องอื่นที่ลอยทับ (ตัวดูหน้า เมนู) และตอนโฟกัสอยู่ที่ส่วนอื่นของเว็บ
     ‼️ Mac ใช้ Cmd+Z , โน้ตบุ๊กหลายรุ่นไม่มีปุ่ม Delete แยก ต้องรับ Backspace ด้วย */
  const IS_MAC = /Mac|iPhone|iPad/i.test(navigator.userAgentData?.platform || navigator.platform || "");
  /* คนที่เดินด้วย Tab หรือลูกศร = ใช้คีย์บอร์ด , คลิกหรือแตะ = ใช้เมาส์
     ‼️ ไม่ใช้ :focus-visible เพราะหลังกดปุ่มบนการ์ด render() คืนโฟกัสให้การ์ดด้วย focus() ซึ่ง Chrome นับเป็น focus-visible */
  let navByKey = false;
  const onNavKey = (e) => { if (e.key === "Tab" || e.key.startsWith("Arrow")) navByKey = true; };
  const onNavPointer = () => { navByKey = false; };
  document.addEventListener("keydown", onNavKey, true);
  document.addEventListener("pointerdown", onNavPointer, true);
  const onDocKey = (e) => {
    if (!ws.wrap.isConnected) return;
    if (e.defaultPrevented || e.isComposing) return;
    const t = e.target;
    const free = t === document.body || t === document.documentElement || ws.wrap.contains(t);
    if (!free) return;
    if (t.closest?.("input, textarea, select, [contenteditable=''], [contenteditable='true'], dialog, [role=dialog]")) return;
    if (!items.length) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (removed.length) undoDelete();
      else st.info(tr("ยังไม่มีหน้าที่ลบ ไม่มีอะไรให้ย้อน", "Nothing deleted yet, nothing to undo"));
      return;
    }
    if (mod || e.altKey) return;
    // ปุ่มบนการ์ด (หมุน ลบ แว่นขยาย) ให้ Enter กับ Space ทำหน้าที่ของปุ่มเอง
    const onBtn = t.closest?.("button, a");
    const k = e.key;
    if (k === "Delete" || k === "Backspace") {
      if (onBtn && k === "Backspace") return;
      e.preventDefault();
      if (sel.size) dropSelected();
      else needPick(tr("ลบ", "delete"));
    } else if (k === "[" || k === "]") {
      e.preventDefault();
      if (sel.size) rotateSelected(k === "]" ? 90 : 270);
      else needPick(tr("หมุน", "rotate"));
    } else if (k.startsWith("Arrow")) {
      arrowMove(e, t);
    }
  };
  /* ── ลูกศรสี่ทิศ (18/11/2026 ค่ำ พี่ปอนด์ขอ) ซ้ายขวา = ใบก่อน ใบถัดไป , ขึ้นลง = ใบที่อยู่ตรงกันในแถวบนแถวล่าง
     Shift+ลูกศร = ขยายช่วงที่เลือกจากใบตั้งต้น แบบเดียวกับ Shift+คลิก
     ‼️ ยังไม่ได้เลือกอะไรและโฟกัสไม่อยู่บนการ์ด ลูกศรขึ้นลงปล่อยให้เลื่อนหน้าเว็บตามปกติ ไม่แย่งไป */
  function arrowMove(e, t) {
    const cards = [...pagesGrid.querySelectorAll(".pg:not(.dropped)")];
    if (!cards.length) return;
    const k = e.key;
    const onCard = t.closest?.(".pg");
    const anchorCard = anchor ? pagesGrid.querySelector(`.pg[data-i="${items.indexOf(anchor)}"]`) : null;
    const cur = onCard || (sel.size ? (anchorCard || pagesGrid.querySelector(".pg.selected")) : null);
    if (!cur && (k === "ArrowUp" || k === "ArrowDown")) return;
    e.preventDefault();
    const i = cur ? cards.indexOf(cur) : -1;
    let n = i;
    if (i < 0) n = 0;
    else if (k === "ArrowLeft") n = i - 1;
    else if (k === "ArrowRight") n = i + 1;
    else {
      /* ‼️ 19/11/2026 พี่ปอนด์ (คลิป): แถวละ 3 ใบ อยู่หน้า 3 กดลง รุ่นแรกไปหน้า 5 (ใบแถวล่างที่ใกล้แนวที่สุด)
         "หน้า 3 ลงมามันต้องไปอยู่หน้า 4 สิ" ใต้ใบมีใบ = ไปใบนั้น , ใต้ใบไม่มีใบ = ไปหน้าถัดไปตามลำดับ
         แถวสุดท้ายกดลง อยู่ที่เดิม , ขึ้นไปใบที่อยู่เหนือตรง ๆ เสมอ (แถวบนเต็มทุกช่อง) */
      const cols = Math.max(1, cards.filter((c) => Math.abs(c.offsetTop - cards[0].offsetTop) <= 2).length);
      const lastRow = Math.floor((cards.length - 1) / cols);
      if (k === "ArrowUp") n = i - cols >= 0 ? i - cols : i;
      else if (Math.floor(i / cols) >= lastRow) n = i;
      else n = i + cols < cards.length ? i + cols : i + 1;
    }
    n = Math.max(0, Math.min(cards.length - 1, n));
    const idx = cards[n].dataset.i;
    const it = items[+idx];
    if (e.shiftKey && anchor) selectItem(it, "range");
    else { sel.clear(); sel.add(it); anchor = it; render(); }
    const card = pagesGrid.querySelector(`.pg[data-i="${idx}"]`);
    card?.focus({ preventScroll: true });
    card?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  /* ‼️ คลิกที่ว่างในพื้นที่การ์ด = ยกเลิกเลือก (พี่ปอนด์: "คลิกที่ส่วนอื่นโล่ง ๆ มันก็ควรหายไป")
     นับเฉพาะพื้นที่การ์ดกับพื้นโล่งใต้การ์ด ไม่นับแถบเครื่องมือ (ครอบขอบขาว ทำกับหน้าที่เลือก) และแผงขวา */
  ws.body.addEventListener("click", (e) => {
    if (!sel.size || dragJustEnded()) return;
    if (e.target.closest("button, a, input, select, textarea, label, summary, details, .pg, .pp-bulk, [role=dialog]")) return;
    clearSel(); render();
  });
  document.addEventListener("keydown", onDocKey);
  /* ‼️ Esc = ยกเลิกเลือก ต้องดักชั้น capture
     app.js มีตัวรับ Esc ระดับทั้งเว็บที่ "พาออกจากเครื่องมือกลับหน้าแรก" ผูกไว้ก่อนเรา จึงได้อีเวนต์ก่อน
     รุ่นแรกฟ้าใส่ไว้ใน onDocKey ผลคือกด Esc แล้วหลุดออกจากเครื่องมือ หน้าที่จัดไว้หายหมด (เทส cropmix จับได้ 19/11/2026)
     ดักเฉพาะตอนมีหน้าที่เลือกอยู่ ไม่มีอะไรเลือก Esc ทำงานแบบเดิมของเว็บ */
  const onEscKey = (e) => {
    if (e.key !== "Escape" || !sel.size || !ws.wrap.isConnected || e.isComposing) return;
    const t = e.target;
    if (!(t === document.body || t === document.documentElement || ws.wrap.contains(t))) return;
    if (t.closest?.("input, textarea, select, [contenteditable=''], [contenteditable='true'], dialog, [role=dialog]")) return;
    if (document.querySelector(".pz[role=dialog]")) return;     // ตัวดูหน้าใหญ่เปิดอยู่ ให้มันปิดตัวเองก่อน
    e.preventDefault();
    e.stopPropagation();
    clearSel(); render();
  };
  document.addEventListener("keydown", onEscKey, true);
  function needPick(what) {
    st.info(tr(`คลิกเลือกหน้าก่อน แล้วค่อยกด${what}`, `Click a page to select it first, then ${what}`));
    pagesGrid.classList.remove("pp-nudge");
    void pagesGrid.offsetWidth;                // เริ่มแอนิเมชันใหม่ทุกครั้ง
    pagesGrid.classList.add("pp-nudge");
  }
  const HELP_KEY = "filekit-pdfpages-help-open";
  const helpBody = el("div", { class: "pp-help-body" });
  const helpBox = el("details", { class: "pp-help" }, [el("summary", { class: "keyhints-t" }, tr("วิธีใช้", "How to use")), helpBody]);
  try { helpBox.open = localStorage.getItem(HELP_KEY) === "1"; } catch { /* โหมดส่วนตัว */ }
  helpBox.addEventListener("toggle", () => { try { localStorage.setItem(HELP_KEY, helpBox.open ? "1" : "0"); } catch { /* โหมดส่วนตัว */ } });
  registerCleanup(ws.wrap, { dispose: () => {
    document.removeEventListener("keydown", onDocKey);
    document.removeEventListener("keydown", onEscKey, true);
    document.removeEventListener("keydown", onNavKey, true);
    document.removeEventListener("pointerdown", onNavPointer, true);
    closeDocs(); hidePeek();
  } });
  ws.body.append(
    results,
    /* ปุ่มที่บอกต้องตรงกับคีย์บอร์ดที่คนนั่งกดอยู่ Mac ไม่มีคำว่า Ctrl กับ Del บนแป้น */
    keyHints([
      [IS_MAC ? ["delete ⌫"] : ["Del", "Backspace"], tr("ลบหน้าที่เลือก", "Delete selected page")],
      [IS_MAC ? "⌘Z" : "Ctrl+Z", tr("ย้อนการลบ", "Undo delete")],
      ["[ ]", tr("หมุนซ้าย ขวา", "Rotate left, right")],
      ["← → ↑ ↓", tr("เลื่อนไปหน้าข้าง ๆ", "Move to the next page")],
      ["Enter", tr("เลือก ยกเลิกเลือก", "Select, deselect")],
      [IS_MAC ? tr("⌘+คลิก", "⌘+click") : tr("Ctrl+คลิก", "Ctrl+click"), tr("เลือกหลายหน้า", "Select several pages")],
      /* 19/11/2026 พี่ปอนด์: "เอาเป็นคีย์นี้แทน Shift+คลิก" แถวคีย์ลัดบอกแค่ Ctrl+Shift+คลิก (Shift+คลิกเฉย ๆ ยังใช้ได้ แต่ไม่โชว์ให้รก) */
      [IS_MAC ? tr("⌘+Shift+คลิก", "⌘+Shift+click") : tr("Ctrl+Shift+คลิก", "Ctrl+Shift+click"), tr("เลือกเป็นช่วง ช่วงเดิมไม่หาย", "Select a range, keep the rest")],
      ["Esc", tr("ยกเลิกเลือก", "Clear selection")],
    ]),
    helpBox,
  );
  /* ‼️ 18/11/2026 ค่ำ พี่ปอนด์: ข้อความอธิบายใต้การ์ด "ถ้าเขาอยากรู้ก็มากดอ่านเอง ทำเป็นหัวข้อสั้น ๆ"
     พับไว้ตั้งแต่เปิด เหลือแค่หัวข้อ วิธีใช้ แบบเดียวกับแถวคีย์ลัด จำในเครื่องว่าเคยกางไว้
     ‼️ ลิงก์ไปเครื่องมือแก้ข้อความย้ายเข้าไปในนี้ได้ เพราะแถบเครื่องมือมีปุ่ม แก้ข้อความบนหน้า ให้เห็นอยู่แล้ว */
  helpBody.append(
    el("div", { class: "note s2-only-wide" },
      // ‼️ เครื่องมือนี้สร้างไฟล์ใหม่แล้วคัดลอกหน้าที่เก็บเข้าไป สารบัญ/บุ๊กมาร์กของไฟล์เดิม
      //    จึงไม่ติดมาด้วย แม้ผู้ใช้จะไม่ได้แก้อะไรเลย · บอกไว้ตรง ๆ เหมือนที่ pdf-merge บอก
      tr("คลิกหน้าเพื่อเลือก ลากเพื่อสลับลำดับ ชี้ค้างดูภาพใหญ่ หรือพิมพ์ช่วงหน้าด้านขวาเพื่อเก็บบางหน้า",
         "Click to select, drag to move, hover to see it larger, or type a range on the right to keep pages")),
    // ‼️ จอแคบไม่มีแผงขวาและไม่มีเมาส์ (เทสเตอร์ B4 09/11/2026 , tests/browser_side_wording.py)
    el("div", { class: "note s2-only-narrow" },
      tr("แตะหน้าเพื่อเลือก กดค้างแล้วลากเพื่อสลับลำดับ หรือกดปุ่ม ตัวเลือก เพื่อพิมพ์ช่วงหน้าที่จะเก็บ",
         "Tap to select, press and hold then drag to move, or tap Options to type a range to keep")),
    // แยกเป็นอีกก้อนเพราะข้อความบนหน้าจอก้อนเดียวห้ามยาวเกิน 100 ตัวอักษร (มีเทสจับ)
    el("div", { class: "note" },
      tr("ใส่หลายไฟล์ได้ ป้าย A B C บอกว่าหน้านั้นมาจากไฟล์ไหน",
         "Multiple files welcome. The A B C tag shows which file a page came from")),
    // พี่ปอนด์อยากให้จุดหกจุดกดได้ (19/11/2026) el() ถอด title ทิ้งทุกที่ จึงบอกไว้ตรงนี้แทน
    el("div", { class: "note" },
      tr("คลิกแถวไฟล์ด้านขวา เลือกทุกหน้าของไฟล์นั้น ลากแถวเพื่อสลับลำดับไฟล์",
         "Click a file row on the right to select all its pages, drag it to reorder files")),
    el("div", { class: "note" },
      tr("ไฟล์ที่ได้จะไม่มีสารบัญ/บุ๊กมาร์กของไฟล์เดิมติดมา",
         "The result will not carry over the original bookmarks")),
    /* ‼️ พี่ปอนด์เปิดหน้านี้แล้วถามว่า "ไหนถ้าพี่จะลบพวกข้อความ" (18/09/2026)
       เดิมชี้ไปเครื่องมือแก้ไขและเซ็นอีกตัว 19/11/2026 พี่ปอนด์ไม่อยากให้ลิงก์ออกไปเครื่องมืออื่นแล้ว
       แก้ได้ในตัวดูหน้าใหญ่ของเครื่องมือนี้เลย จึงบอกทางเข้าแทนลิงก์ */
    el("div", { class: "note" },
      tr("แก้ข้อความ ปิดทับ หรือเซ็นบนหน้า กดปุ่ม แก้ข้อความบนหน้า ด้านบน",
         "To cover text, type or sign on a page, press Edit text on a page above")),
  );
  ws.showCanvas(false);

  function setLoaded(on) {
    rangeInput.disabled = !on;
    rangeBtn.disabled = !on;
    saveBtn.disabled = !on;
    resetBtn.disabled = !on;
    // ปุ่มเรียงมีความหมายเฉพาะตอนมีมากกว่าหนึ่งไฟล์
    const many = on && files.length > 1;
    byFileBtn.disabled = !many;
    zipBtn.disabled = !many;
    sortGroup.hidden = !many;
  }

  /* ติดป้าย A B C กับแถวไฟล์ที่กล่องเลือกไฟล์วาดไว้แล้ว
     ‼️ กล่องเลือกไฟล์วาดแถวใหม่ทุกครั้งที่ไฟล์เปลี่ยน ป้ายจึงหายไปด้วย
        ต้องติดใหม่หลังทุกครั้งที่รายการเปลี่ยน ไม่ใช่ติดครั้งเดียวตอนเริ่ม */
  function renderFiles() {
    const rows = leftNode.querySelectorAll(".file-row");
    rows.forEach((row) => {
      const i = +row.dataset.i;              // ‼️ เลขไฟล์จริง ไม่ใช่ลำดับแถว แถวของไฟล์ที่ซ่อนไม่ถูกวาด
      row.querySelector(".pp-tag")?.remove();
      row.classList.remove("pp-has-tag");
      if (files.length < 2) return;   // ไฟล์เดียวไม่ต้องมีป้าย ไม่มีอะไรให้แยก
      row.classList.add("pp-has-tag");
      row.prepend(el("span", { class: "pp-tag", style: { "--fc": colorOf(i) } }, tagOf(i)));
    });
  }

  /* ‼️ ไฟล์ที่ทุกหน้าถูกลบ ต้องหายจากรายการไฟล์ (18/11/2026 พี่ปอนด์ลบหน้าเดียวของ C แล้วการ์ด C ยังค้าง)
     ซ่อน ไม่ใช่เอาไฟล์ออก และคำนวณจากสภาพหน้าทุกครั้ง ไม่จดแยก
     ผลคือทุกทางที่หน้ากลับมา (Ctrl+Z ปุ่มย้อนการลบ ช่วงหน้า ชิป รีเซ็ต) คืนแถวไฟล์ที่เดิมเองโดยไม่ต้องเขียนเพิ่ม
     เลขไฟล์ A B C ไม่เลื่อน ป้ายบนการ์ดที่ย้อนกลับมาจึงยังตรงกับแถวไฟล์ */
  let hiddenNow = new Set();
  function syncEmptyFiles() {
    let empty = new Set(files.filter((f, fi) => {
      const mine = items.filter((it) => !it.blank && it.fi === fi);
      return mine.length > 0 && mine.every((it) => it.dropped);
    }));
    /* ‼️ ทุกไฟล์ว่างหมด (หรือมีไฟล์เดียว) ไม่ซ่อน ไม่งั้นรายการไฟล์โล่งทั้งที่เครื่องมือยังถือไฟล์อยู่
       คนจะไม่รู้ว่าต้องเพิ่มไฟล์ใหม่หรือกดย้อน ปล่อยแถวไว้ให้เห็นว่ายังมีไฟล์ */
    if (empty.size >= files.length) empty = new Set();
    const same = empty.size === hiddenNow.size && [...empty].every((f) => hiddenNow.has(f));
    if (same) return [];
    const fresh = [...empty].filter((f) => !hiddenNow.has(f));
    hiddenNow = empty;
    dz.hide(empty);
    renderFiles();
    return fresh;
  }

  function updateSummary() {
    if (!items.length) { summary.textContent = tr("ยังไม่ได้เลือกไฟล์", "No file chosen yet"); return; }
    const keep = items.filter((i) => !i.dropped).length;
    summary.innerHTML = "";
    summary.append(el("div", {}, [
      tr("ทั้งหมด ", "Total "), el("b", {}, String(items.length)), tr(" หน้า, เก็บ ", " pages, keep "),
      el("b", {}, String(keep)), tr(", ลบ ", ", remove "), el("b", {}, String(items.length - keep)),
    ]));
  }

  /** @param opts {fromFile} อ่านเฉพาะไฟล์ตั้งแต่ตำแหน่งนี้ไป (ไม่ล้างของเดิม)
   *              {insertAfter} แทรกหน้าใหม่ต่อจากรายการนี้ ไม่ใส่ = ต่อท้าย */
  /* เอกสาร pdf.js ที่เปิดค้างไว้ ต่อไฟล์ ให้ภาพลอยกับตัวดูหน้าเรนเดอร์ความละเอียดสูงได้
     ‼️ ปิดทุกครั้งที่โหลดใหม่ทั้งชุดและตอนออกจากเครื่องมือ ไม่งั้นโหลดซ้ำแล้วหน่วยความจำไต่ (tests/browser_leak.py ข้อ 5) */
  const docs = new Map();
  function closeDocs() { for (const d of docs.values()) { try { d.destroy(); } catch { /* ปิดไปแล้ว */ } } docs.clear(); }
  const getDoc = async (fi) => docs.get(files[fi]) || null;

  async function loadPreview(opts = {}) {
    const startFile = opts.fromFile || 0;
    const keepOld = startFile > 0;
    const fresh = [];
    results.innerHTML = "";
    if (!keepOld) {
      pagesGrid.innerHTML = "";
      items = [];
      markLog = [];
      clearSel();
      closeDocs();
      setLoaded(false);
      ws.showCanvas(false);
    }
    renderFiles();
    updateSummary();
    st.info(tr("กำลังสร้างภาพตัวอย่าง…", "Generating page previews…"));
    ws.setBusy(true);
    try {
      /* ‼️ นับหน้ารวมไว้ก่อนไม่ได้ ต้องเปิดไฟล์ถึงจะรู้ว่ากี่หน้า
         จึงรายงานความคืบหน้าเป็น "ไฟล์ที่เท่าไหร่ หน้าที่เท่าไหร่" แทนเปอร์เซ็นต์รวม */
      for (let fi = startFile; fi < files.length; fi++) {
        const pdf = await openPdf(files[fi], passwordBox(extra));
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const viewport = page.getViewport({ scale: 0.35 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
          page.cleanup();
          /* ‼️ เก็บขนาดหน้าจริง (pt) ไว้ด้วย ใช้ตอนสร้างหน้าว่างให้ขนาดเท่าหน้าข้าง ๆ
             viewport ที่ scale 0.35 จึงต้องหารกลับ ไม่งั้นได้หน้าว่างเล็กกว่าเพื่อน 3 เท่า */
          const base = page.getViewport({ scale: 1 });
          (keepOld ? fresh : items).push({ fi, index: p - 1, rotate: 0, dropped: false, crop: null,
            pw: Math.round(base.width), ph: Math.round(base.height),
            bw: base.width, bh: base.height, marks: [],          // ขนาดหน้าฐานไม่ปัด กับของที่วาง (เฟส 2)
            thumb: canvas.toDataURL("image/jpeg", 0.7) });
          canvas.width = canvas.height = 0;
          st.progress((p / pdf.numPages) * 100,
            files.length > 1 ? `${tagOf(fi)} (${p}/${pdf.numPages})` : `(${p}/${pdf.numPages})`);
          await yieldToBrowser();
        }
        docs.set(files[fi], pdf);          // เก็บไว้ให้ภาพลอยกับตัวดูหน้าเรนเดอร์ใหม่ได้ ไม่ต้องถามรหัสผ่านซ้ำ
      }
      /* ‼️ แทรกหน้าใหม่ต่อจากหน้าที่ผู้ใช้เลือกไว้ตอนกดเพิ่มไฟล์ ไม่ใช่ต่อท้ายเสมอ
         หาตำแหน่งด้วย indexOf ตอนนี้ ไม่ใช่จำเลขไว้ตั้งแต่ต้น เพราะระหว่างอ่านไฟล์
         (ซึ่งกินเวลาหลายวินาที) ผู้ใช้อาจลากสลับหน้าไปแล้ว เลขเดิมจะชี้ผิดที่ */
      if (keepOld && fresh.length) {
        const at = opts.insertAfter ? items.indexOf(opts.insertAfter) + 1 : items.length;
        items.splice(at > 0 ? at : items.length, 0, ...fresh);
        clearSel();
      }
      ws.setBusy(false);
      st.progress(null);
      st.ok(keepOld
        ? tr(`แทรกอีก ${fresh.length} หน้าแล้ว รวม ${items.length} หน้า`,
             `Inserted ${pl(fresh.length, "page", "pages")}, ${items.length} total`)
        : tr(`โหลดแล้ว ${items.length} หน้า`, `Loaded ${pl(items.length, "page", "pages")}`));
      setLoaded(true);
      ws.showCanvas(true);
      renderFiles();
      render();
    } catch (e) {
      ws.setBusy(false);
      st.progress(null);
      st.err(tr("เปิดไฟล์ไม่ได้: ", "Couldn't open file: ") + e.message);
      updateSummary();
    }
  }

  function render() {
    /* ‼️ render() วาดการ์ดใหม่ทั้งตะแกรงทุกครั้ง ทุกการกระทำจึงทำโฟกัสหลุดไปที่ <body>
       เจอตอนทดสอบคีย์ลัดหมุนหน้า กด ] ได้ครั้งเดียวแล้วเงียบ เพราะหมุนเสร็จโฟกัสหาย
       ‼️ แก้ที่นี่ที่เดียว ไม่ไล่แปะทีละฟังก์ชัน เพราะทุกอย่างลงเอยที่ render() หมด
          (เลือก หมุน ลบ ย้อน ครอบ ลากสลับ เลือกช่วง) แปะทีละที่เดี๋ยวก็ลืมสักอัน
       ‼️ ถ้าใบเดิมถูกลบไป ให้ไปใบถัดไป ถ้าไม่มีก็ใบสุดท้าย คนลบรัว ๆ จะได้ไม่สะดุด
       ‼️ ไม่แตะโฟกัสเลยถ้าตอนนั้นไม่ได้อยู่บนการ์ด เช่นกำลังพิมพ์อยู่ในช่องช่วงหน้า */
    const hadFocus = document.activeElement?.closest?.(".pg");
    const focusAt = hadFocus ? +hadFocus.dataset.i : null;
    const many = files.length > 1;
    pagesGrid.innerHTML = "";
    let outNo = 0;                       // เลขหน้าในไฟล์ผลลัพธ์ นับเฉพาะหน้าที่เก็บ
    items.forEach((it, i) => {
      const srcLabel = tr(`ไฟล์ ${tagOf(it.fi)}`, `File ${tagOf(it.fi)}`);
      const no = it.dropped ? 0 : ++outNo;
      const on = sel.has(it);
      const card = el("div", {
        class: "pg" + (many ? " multi" : "") + (it.dropped ? " dropped" : "") + (on ? " selected" : ""),
        style: many ? { "--fc": colorOf(it.fi) } : null,
        "data-i": i, tabindex: "0", role: "button",
        "aria-pressed": on ? "true" : "false",
        "aria-label": tr(`หน้า ${no || i + 1}${many ? " จาก" + srcLabel : ""}${it.dropped ? " (ทำเครื่องหมายลบไว้)" : ""}`,
                         `Page ${no || i + 1}${many ? " from " + srcLabel : ""}${it.dropped ? " (marked for removal)" : ""}`),
        /* คลิก = เลือกใบนี้ใบเดียว (คลิกซ้ำ = ยกเลิก) , Ctrl/⌘+คลิก = เพิ่มหรือถอนจากชุด , Shift+คลิก = เลือกเป็นช่วง
           ‼️ จอสัมผัสไม่มีปุ่ม Ctrl พอมีใบที่เลือกอยู่แล้ว แตะใบอื่น = เพิ่มเข้าชุด */
        onclick: (e) => {
          if (dragJustEnded()) return;
          const touchy = lastPointerType === "touch" || lastPointerType === "pen";
          // Ctrl+Shift+คลิก = เพิ่มอีกช่วง หน้าที่เลือกไว้ยังอยู่ (พี่ปอนด์ขอ 19/11/2026 แบบ Explorer กับ Excel)
          if (e.shiftKey && anchor && (e.ctrlKey || e.metaKey)) selectItem(it, "addrange");
          else if (e.shiftKey && anchor) selectItem(it, "range");
          else if (e.ctrlKey || e.metaKey || (touchy && sel.size && !(sel.size === 1 && on))) selectItem(it, "toggle");
          else selectItem(it, "only");
        },
        /* ‼️ พี่ปอนด์กด Delete แล้วไม่มีอะไรเกิดขึ้น เพราะของเดิมรับแค่ Enter กับ Space
           ปุ่ม Delete คือสิ่งที่ทุกคนลองเป็นอย่างแรกกับของที่เลือกไว้ ต้องทำงาน
           Backspace ด้วย เพราะบนแม็คคีย์บอร์ดหลายรุ่นไม่มีปุ่ม Delete แยก */
        onkeydown: (e) => {
          if (e.target !== card) return;      // Enter บนปุ่มในการ์ด ให้ปุ่มทำงานเอง
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectItem(it, e.ctrlKey || e.metaKey ? "toggle" : "only"); return; }
          /* ‼️ ลบ "สิ่งที่ตาเห็นว่าเลือกอยู่" (ขอบไฮไลต์) ไม่ใช่ใบที่โฟกัสแฝงอยู่หลังคลิกปุ่มบนการ์ด
             รุ่นเดิมตัวฟังของการ์ดลบใบที่โฟกัส แล้วตัวฟังของหน้าลบใบที่เลือกซ้ำอีกใบ กด Del ครั้งเดียวหายสองหน้า
             ยกเว้นคนใช้คีย์บอร์ดที่ Tab มาถึงใบนี้ (มีวงโฟกัสให้เห็น) ลบใบนี้ตามที่เขาเห็น */
          if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            if (sel.size && !(navByKey && !sel.has(it))) dropSelected();
            else dropItem(it);
          }
        },
      }, [
        many && !it.blank ? el("span", { class: "src", title: `${srcLabel}: ${files[it.fi].name}` }, tagOf(it.fi)) : null,
        /* หน้าว่างไม่มีภาพย่อ วาดเป็นกระดาษเปล่าพร้อมป้ายบอก จะได้ไม่คิดว่าโหลดไม่ขึ้น */
        it.blank
          ? el("div", { class: "pg-blank", style: { aspectRatio: `${it.pw} / ${it.ph}`,
              ...(it.inkThumb ? { backgroundImage: `url("${it.inkThumb}")`, backgroundSize: "100% 100%" } : {}) } },
               tr("หน้าว่าง", "Blank page"))
          : it.crop
            /* ‼️ กล่องครอบ สัดส่วนเท่ากรอบที่เก็บไว้จริง แล้วขยายภาพให้เฉพาะส่วนนั้นเต็มกล่อง
               เดิมใช้ clip-path ซึ่งตัดภาพแต่ไม่หดกล่อง การ์ดเลยเหลือที่ว่างข้างล่าง
               = พรีวิวไม่ตรงกับไฟล์จริงที่ครอบไปแล้ว (พี่ปอนด์ทักเอง 18/09/2026)
               ‼️ หมุนที่กล่อง ไม่ใช่ที่ภาพ ไม่งั้นภาพจะหมุนอยู่ในกรอบที่ไม่หมุนตาม */
            ? (() => {
                /* หน้ากระดาษยังขนาดเดิม แต่เนื้อหาที่ครอบถูกขยายจัดกลาง (รักษาสัดส่วน)
                   ตรงกับที่ไฟล์จริงทำด้วย embedPage + drawPage ทุกประการ */
                const pageAR = it.pw / it.ph;
                const cropAR = (it.pw * it.crop.w) / (it.ph * it.crop.h);
                /* โหมด "พอดีเนื้อหา" การ์ดหดตามกรอบที่ครอบ ไม่มีกระดาษขาวเหลือ
                   ต้องให้พรีวิวต่างกันตามโหมด ไม่งั้นพรีวิวโกหกอีกแบบหนึ่ง */
                if (modeOf(it) === "tight") {
                  return el("div", { class: "pg-page",
                    style: { aspectRatio: `${it.pw * it.crop.w} / ${it.ph * it.crop.h}`,
                             transform: `rotate(${it.rotate}deg)` } }, [
                    el("div", { class: "pg-crop", style: { inset: "0" } }, [
                      el("img", { src: it.inkThumb || it.thumb, loading: "lazy", draggable: "false",
                        alt: tr(`หน้า ${it.index + 1} (ครอบแล้ว)`, `Page ${it.index + 1}, trimmed`),
                        style: { width: `${100 / it.crop.w}%`, height: `${100 / it.crop.h}%`,
                                 insetInlineStart: `${-(it.crop.x / it.crop.w) * 100}%`,
                                 top: `${-(it.crop.y / it.crop.h) * 100}%` } }),
                    ]),
                  ]);
                }
                // ขยายให้พอดีด้านที่ตึงกว่า อีกด้านเหลือขอบเท่า ๆ กันสองข้าง
                const fitW = cropAR >= pageAR;              // เนื้อหาแบนกว่าหน้า -> ชนซ้ายขวา
                const vw = fitW ? 100 : (cropAR / pageAR) * 100;   // กว้างของกรอบเนื้อหา (% ของการ์ด)
                const vh = fitW ? (pageAR / cropAR) * 100 : 100;
                return el("div", { class: "pg-page",
                  style: { aspectRatio: `${it.pw} / ${it.ph}`, transform: `rotate(${it.rotate}deg)` } }, [
                  el("div", { class: "pg-crop",
                    style: { width: `${vw}%`, height: `${vh}%`,
                             insetInlineStart: `${(100 - vw) / 2}%`, top: `${(100 - vh) / 2}%` } }, [
                    el("img", { src: it.inkThumb || it.thumb, loading: "lazy", draggable: "false",
                      alt: tr(`หน้า ${it.index + 1} (ครอบแล้ว)`, `Page ${it.index + 1}, trimmed`),
                      style: { width: `${100 / it.crop.w}%`, height: `${100 / it.crop.h}%`,
                               insetInlineStart: `${-(it.crop.x / it.crop.w) * 100}%`,
                               top: `${-(it.crop.y / it.crop.h) * 100}%` } }),
                  ]),
                ]);
              })()
            : el("img", { src: it.inkThumb || it.thumb, alt: tr(`หน้า ${it.index + 1}`, `Page ${it.index + 1}`), loading: "lazy", draggable: "false",
              style: { transform: `rotate(${it.rotate}deg)` } }),
        /* เลขหน้าในไฟล์ผลลัพธ์ อยู่ใต้ภาพ ไม่ทับเนื้อหา และไม่ชนป้ายไฟล์ A B C ที่มุมบนซ้าย
           (เดิมอยู่มุมบนซ้ายเหมือนกัน ป้ายไฟล์ทับจนมองไม่เห็นเลข) ระหว่างลากเลขนี้เปลี่ยนสด */
        el("div", { class: "pp-foot" }, [el("span", { class: "num" }, String(no || ""))]),
        it.crop ? el("span", { class: "pg-cropped", title: tr("ครอบขอบขาวไว้", "White edge trimmed") },
                     tr("ครอบแล้ว", "trimmed")) : null,
        /* ‼️ เหลือ 3 ปุ่ม (18/11/2026) พี่ปอนด์ชี้ปุ่มหมุนซ้ายขวาว่า "อันเดียว พอมั้ง"
           หมุนตามเข็มทีละ 90 กดซ้ำวนครบรอบ หมุนทวนยังมีคีย์ [ ให้คนที่ต้องการ
           โผล่ตอนชี้หรือเลือกการ์ด ไม่โชว์ค้างทุกใบ */
        el("div", { class: "tools" }, [
          it.blank ? null : el("button", { type: "button", class: "pp-zoom",
            title: tr(`ดูหน้า ${no} ขนาดใหญ่`, `View page ${no} larger`),
            "aria-label": tr(`ดูหน้า ${no} ขนาดใหญ่`, `View page ${no} larger`),
            onclick: (e) => { e.stopPropagation(); openZoom(it); } }, [uiIcon("search", "pg-ico")]),
          el("button", { type: "button", class: "pp-rot",
            title: tr(`หมุนขวา ตามเข็มนาฬิกา (หน้า ${no})`, `Rotate right, clockwise (page ${no})`),
            "aria-label": tr(`หมุนหน้า ${no} ไปทางขวา`, `Rotate page ${no} right`),
            onclick: (e) => { e.stopPropagation(); it.rotate = (it.rotate + 90) % 360; render(); } }, [uiIcon("rotateR", "pg-ico")]),
          el("button", { type: "button", class: "pp-del",
            title: tr(`ลบหน้านี้ (หน้า ${no})`, `Delete page ${no}`),
            "aria-label": tr(`ลบหน้า ${no}`, `Delete page ${no}`),
            onclick: (e) => { e.stopPropagation(); dropItem(it); } }, [uiIcon("trash", "pg-ico")]),
        ]),
      ]);
      if (it === flashItem) { card.classList.add("pp-landed"); setTimeout(() => card.classList.remove("pp-landed"), 950); }
      pagesGrid.appendChild(card);
    });
    flashItem = null;
    if (focusAt !== null) {
      const same = pagesGrid.querySelector(`.pg[data-i="${focusAt}"]:not(.dropped)`);
      const cards = [...pagesGrid.querySelectorAll(".pg:not(.dropped)")];
      const go = same || cards.find((c) => +c.dataset.i > focusAt) || cards[cards.length - 1];
      if (go) go.focus();
    }
    updateSummary();
    st.info(tr(`เหลือ ${items.filter((i) => !i.dropped).length}/${items.length} หน้า`,
                `${items.filter((i) => !i.dropped).length}/${pl(items.length, "page", "pages")} left`));
    syncToolbar();
    syncBulk();
    syncCropBtns();
    lastVanished = syncEmptyFiles();
  }
  let flashItem = null;          // ใบที่เพิ่งวางจากการลาก ให้กะพริบไฮไลต์สั้น ๆ หลังวาดใหม่
  let lastVanished = [];         // ไฟล์ที่เพิ่งหายจากรายการเพราะไม่เหลือหน้า (บอกผู้ใช้ทันที)

  function syncBulk() {
    const n = sel.size;
    const wasHidden = bulkBar.hidden;
    bulkBar.hidden = n < 2;
    // หน้าต่างหดหลังลากแถบไปไว้ขอบ แถบอาจหลุดนอกจอ โผล่ใหม่เมื่อไหร่เช็กแล้วดึงกลับที่เดิม
    if (wasHidden && !bulkBar.hidden) {
      const r = bulkBar.getBoundingClientRect();
      const B = bulkBounds();
      if (r.left < B.left - 1 || r.top < B.top - 1 || r.right > B.right + 1 || r.bottom > B.bottom + 1) { bulkPos = { x: 0, y: 0 }; applyBulkPos(); }
    }
    bulkCount.textContent = tr(`เลือก ${n} หน้า`, `${pl(n, "page", "pages")} selected`);
  }
  /** บอกว่าไฟล์ไหนหายจากรายการ ต่อท้ายข้อความหลังลบ */
  function vanishNote() {
    if (!lastVanished.length) return "";
    const tags = lastVanished.map((f) => tagOf(files.indexOf(f))).join(", ");
    const undoKey = IS_MAC ? "⌘Z" : "Ctrl+Z";
    return files.length > 1
      ? tr(` ไฟล์ ${tags} ไม่เหลือหน้าแล้ว เอาออกจากรายการ กด ${undoKey} เพื่อเอากลับ`,
           ` File ${tags} has no pages left, removed from the list. Press ${undoKey} to bring it back`)
      : "";
  }

  /* เรียงใหม่ 2 แบบ
     byfile = ไฟล์ A จนหมดแล้วต่อ B ซึ่งเป็นลำดับเดิมตอนโหลดเข้ามา
     zip    = หน้าแรกของทุกไฟล์ก่อน แล้วค่อยหน้าสอง ใช้ตอนสแกนหน้าหน้ากับหลังแยกไฟล์กันมา */
  function reorder(mode) {
    if (items.length < 2) return;
    const byFile = new Map();
    items.forEach((it) => {
      if (!byFile.has(it.fi)) byFile.set(it.fi, []);
      byFile.get(it.fi).push(it);
    });
    const groups = [...byFile.keys()].sort((a, b) => a - b).map((k) => byFile.get(k));
    if (mode === "byfile") {
      items = groups.flat();
      st.ok(tr("เรียงทีละไฟล์แล้ว", "Grouped by file"));
    } else {
      const out = [];
      const longest = Math.max(...groups.map((g) => g.length));
      for (let i = 0; i < longest; i++) for (const g of groups) if (g[i]) out.push(g[i]);
      items = out;
      st.ok(tr("สลับไฟล์ทีละหน้าแล้ว", "Interleaved across files"));
    }
    render();
  }

  /* ── ครอบตัดขอบขาว ───────────────────────────────────────────────────
     อ่านพิกเซลจากภาพย่อที่เรนเดอร์ไว้แล้ว หากรอบที่ยังมีเนื้อหาอยู่
     ‼️ ใช้ภาพย่อ ไม่เรนเดอร์ใหม่ เพราะภาพย่อมีอยู่แล้วและเร็วกว่ามาก
        ความละเอียดต่ำพอ (scale 0.35) แต่หาขอบกระดาษได้แม่นพอสำหรับงานนี้
     ‼️ เผื่อขอบไว้ 1.5% ของด้าน ไม่งั้นตัวอักษรริมสุดจะถูกเฉือนหัวท้าย */
  const WHITE = 244;          // สว่างกว่านี้ถือว่าเป็นพื้นกระดาษเปล่า
  const MIN_TRIM = 0.06;      // ตัดได้น้อยกว่านี้ ถือว่าหน้านี้เต็มอยู่แล้ว ไม่ต้องยุ่ง

  function findContentBox(img) {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    if (!c.width || !c.height) return null;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    let d;
    try { d = ctx.getImageData(0, 0, c.width, c.height).data; }
    catch { return null; }                       // ภาพข้ามโดเมน อ่านพิกเซลไม่ได้
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (d[i] > WHITE && d[i + 1] > WHITE && d[i + 2] > WHITE) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return null;                     // ทั้งหน้าเป็นสีขาว ไม่มีอะไรให้ครอบ

    /* ‼️ หัวใจของวิธีนี้: เก็บ "ขอบที่แคบที่สุด" ไว้เท่ากันทุกด้าน แล้วตัดเฉพาะส่วนที่เกิน
       เอกสารทั่วไปมีขอบกระดาษเป็นเรื่องปกติ ถ้าตัดขอบขาวจนหมดตัวหนังสือจะชิดขอบ
       หน้าปกติขอบ 40/40/40/42 -> ขอบแคบสุด 40 -> กรอบขยายกลับเต็มหน้า = ไม่ครอบ
       หน้าสแกนสั้นขอบ 40/40/40/442 -> เหลือขอบล่าง 40 ตัดส่วนเกินออก 400 */
    const pad = Math.min(x0, y0, c.width - 1 - x1, c.height - 1 - y1);
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(c.width - 1, x1 + pad); y1 = Math.min(c.height - 1, y1 + pad);
    const box = { x: x0 / c.width, y: y0 / c.height,
                  w: (x1 - x0 + 1) / c.width, h: (y1 - y0 + 1) / c.height };
    // ตัดได้น้อยกว่า MIN_TRIM ของทั้งสองด้าน ถือว่าหน้านี้เต็มอยู่แล้ว
    const trimmed = (1 - box.w) + (1 - box.h);
    return trimmed < MIN_TRIM ? null : box;
  }

  /** ‼️ ภาพย่อเป็น data URL ต้องรอ decode ให้เสร็จก่อนอ่านพิกเซล
      img.complete เป็น false เสมอตอนเพิ่งตั้ง src ถ้าไม่รอจะได้ null ทุกหน้าโดยไม่มี error */
  function loadImg(src) {
    return new Promise((ok) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => ok(null);
      img.src = src;
    });
  }

  /** ครอบตัดหน้าที่เลือก หรือทุกหน้าที่ยังไม่ถูกลบ */
  async function autoCrop(all) {
    const targets = all ? items.filter((i) => !i.dropped && !i.blank)
                        : selList().filter((i) => !i.blank);
    if (!targets.length) return st.err(tr("เลือกหน้าก่อน", "Pick a page first"));
    let done = 0, already = 0;
    for (const it of targets) {
      if (it.crop) { it.crop = null; continue; }   // กดซ้ำ = เอาการครอบออก
      const img = await loadImg(it.thumb);
      let box = img ? findContentBox(img) : null;
      /* ‼️ ภาพย่อไม่มีของที่วาง ตัวหาขอบจึงมองไม่เห็นลายเซ็นที่วางในที่ว่าง (แผนข้อ 1.4)
         กรอบครอบต้องคลุมของที่วางทุกชิ้นเสมอ ไม่งั้นลายเซ็นท้ายหน้าโดนตัดหายเงียบ ๆ */
      const mb = box ? await markBounds(it.marks, { w: it.bw || it.pw, h: it.bh || it.ph }) : null;
      if (box && mb) {
        const pad = 0.01;
        const x0 = Math.max(0, Math.min(box.x, mb.x - pad)), y0 = Math.max(0, Math.min(box.y, mb.y - pad));
        const x1 = Math.min(1, Math.max(box.x + box.w, mb.x + mb.w + pad)), y1 = Math.min(1, Math.max(box.y + box.h, mb.y + mb.h + pad));
        box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }
      if (box) { it.crop = box; done++; } else already++;
    }
    render();
    if (done) st.ok(tr(`ครอบขอบขาวแล้ว ${done} หน้า`, `Trimmed ${pl(done, "page", "pages")}`));
    else if (already) st.info(tr("หน้านี้เต็มกระดาษอยู่แล้ว ไม่มีขอบขาวให้ตัด",
                                 "This page already fills the paper, no white edge to trim"));
    else st.ok(tr("เอาการครอบออกแล้ว", "Crop removed"));
  }

  /* ── หน้าว่าง ─────────────────────────────────────────────────────────
     ขนาดเท่าหน้าที่เลือกอยู่ ถ้าไม่ได้เลือกใช้ขนาดหน้าแรก ไม่มีเลยใช้ A4 */
  function addBlank() {
    const after = insertPoint();
    const ref = after || items.find((i) => !i.blank) || null;
    const blank = { blank: true, rotate: 0, dropped: false, crop: null,
                    pw: ref ? ref.pw : 595, ph: ref ? ref.ph : 842, marks: [] };
    blank.bw = blank.pw; blank.bh = blank.ph;
    const at = after ? items.indexOf(after) + 1 : items.length;
    items.splice(at, 0, blank);
    sel.clear(); sel.add(blank); anchor = blank;
    render();
    st.ok(tr(`เพิ่มหน้าว่างที่ตำแหน่ง ${at + 1}`, `Blank page added at position ${at + 1}`));
  }

  /** mode: only = ใบนี้ใบเดียว (ถ้าเป็นใบเดียวที่เลือกอยู่แล้ว = ยกเลิก) , toggle = เพิ่มหรือถอน , range = จาก anchor ถึงใบนี้
   *  ‼️ render() วาดการ์ดใหม่ทั้งตะแกรง แล้วคืนโฟกัสให้ใบที่โฟกัสอยู่เอง (ดูหัว render) คีย์ลัดจึงยังทำงานต่อ */
  function selectItem(it, mode = "only") {
    if (!it) { clearSel(); render(); return; }
    if (mode === "toggle") {
      if (sel.has(it)) { sel.delete(it); if (anchor === it) anchor = selList()[0] || null; }
      else { sel.add(it); anchor = it; }
    } else if (mode === "range" || mode === "addrange") {
      const a = items.indexOf(anchor), b = items.indexOf(it);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      if (mode === "range") sel.clear();
      items.slice(lo, hi + 1).forEach((x) => { if (!x.dropped) sel.add(x); });
    } else {
      const only = sel.size === 1 && sel.has(it);
      sel.clear();
      if (!only) { sel.add(it); anchor = it; } else anchor = null;
    }
    render();
  }

  function rotateSelected(delta) {
    if (!sel.size) return needPick(tr("หมุน", "rotate"));
    sel.forEach((it) => { it.rotate = (it.rotate + delta) % 360; });
    render();
  }

  /* ‼️ กองซ้อนไว้ย้อนการลบทีละครั้ง เก็บเป็นชุด (ลบหลายหน้าพร้อมกัน = ย้อนทีเดียวกลับมาทั้งชุด)
     ไม่ได้เก็บแค่ "ตัวล่าสุด" เพราะคนกดลบรัว ๆ แล้วเผลอเกินไปหนึ่งหน้าเป็นเรื่องปกติ
     ‼️ ชิปเลือกเร็วกับช่องพิมพ์ช่วงหน้าเป็นการ "เลือกใหม่ทั้งชุด" จึงล้างกองนี้ทิ้ง
     ไม่งั้นย้อนกลับแล้วจะได้สภาพลูกผสมที่อธิบายให้ผู้ใช้ไม่ได้ */
  let removed = [];

  function dropSelected() {
    const batch = selList().filter((it) => !it.dropped);
    if (!batch.length) return needPick(tr("ลบ", "delete"));
    dropBatch(batch);
  }
  const dropItem = (it) => { if (!it.dropped) dropBatch([it]); };

  function dropBatch(batch) {
    /* ‼️ render() ย้ายโฟกัสไปใบถัดไปให้เอง คนลบด้วยคีย์บอร์ดจะได้ไม่ต้อง Tab ใหม่จากต้นหน้า */
    batch.forEach((it) => { it.dropped = true; sel.delete(it); });
    if (anchor && anchor.dropped) anchor = null;
    removed.push(batch);
    render();
    const left = items.filter((x) => !x.dropped).length;
    st.info(tr(`ลบ ${batch.length} หน้าแล้ว เหลือ ${left} หน้า`, `Deleted ${pl(batch.length, "page", "pages")}, ${left} left`) + vanishNote());
  }

  function undoDelete() {
    const batch = removed.pop();
    if (!batch) return;
    batch.forEach((it) => { it.dropped = false; });
    sel.clear();
    batch.forEach((it) => sel.add(it));
    anchor = batch[0];
    const back = [...hiddenNow];
    render();
    const revived = back.filter((f) => !hiddenNow.has(f)).map((f) => tagOf(files.indexOf(f)));
    st.ok(tr(`เอาหน้าที่ลบกลับมาแล้ว ${batch.length} หน้า`, `Brought back ${pl(batch.length, "page", "pages")}`)
      + (revived.length ? tr(` ไฟล์ ${revived.join(", ")} กลับมาในรายการ`, `, file ${revived.join(", ")} is back in the list`) : ""));
  }

  function syncToolbar() {
    const pick = selList();
    cropBtn.disabled = !pick.some((x) => !x.blank);
    cropAllBtn.disabled = !items.length;
    blankBtn.disabled = !items.length;
    editTextBtn.disabled = !files.length;
    undoDelBtn.disabled = removed.length === 0;
  }

  function applyRange() {
    if (!items.length) return;
    let pages;
    try { pages = parsePages(rangeInput.value, items.length); }
    catch (e) { st.err(e.message); return; }
    if (!pages.length) { st.err(tr("ไม่พบเลขหน้าที่ถูกต้องในช่วงที่พิมพ์", "No valid page numbers found in what you typed")); return; }
    const keepSet = new Set(pages.map((p) => p - 1));
    items.forEach((it, i) => { it.dropped = !keepSet.has(i); });
    removed = [];                 // เลือกใหม่ทั้งชุด เหมือนชิปเลือกเร็ว
    clearSel();
    render();
    st.ok(tr(`ตั้งช่วง ${rangeInput.value} (${pages.length} หน้า)`,
             `Set range ${rangeInput.value} (${pl(pages.length, "page", "pages")})`));
  }

  /* ── เอาไฟล์ออกบางไฟล์ เก็บงานของไฟล์ที่เหลือ (เฟส 3 19/11/2026 แผนข้อ 3) ─────────────────────────
     เดิมอ่านทุกไฟล์ใหม่หมด (loadPreview) ลำดับ หมุน ครอบ หน้าว่าง และของที่วางบนหน้าทุกไฟล์หายทั้งชุด
     ตอนนี้ตัดเฉพาะหน้าของไฟล์ที่ออก แล้วแก้เลขไฟล์ (fi) ของที่เหลือ เอกสาร pdf.js ผูกกับตัวไฟล์ จึงไม่ต้องเปิดใหม่ */
  function removeFiles(next) {
    const gone = files.filter((f) => !next.includes(f));
    const remap = new Map(files.map((f, i) => [i, next.indexOf(f)]));
    const keep = (it) => it.blank || remap.get(it.fi) >= 0;
    const out = new Set(items.filter((it) => !keep(it)));
    items = items.filter(keep);
    items.forEach((it) => { if (!it.blank) it.fi = remap.get(it.fi); });
    for (const f of gone) { const d = docs.get(f); if (d) { try { d.destroy(); } catch { /* ปิดไปแล้ว */ } docs.delete(f); } }
    out.forEach((it) => sel.delete(it));
    if (anchor && out.has(anchor)) anchor = null;
    markLog = markLog.filter((r) => !out.has(r.it));
    for (let i = removed.length - 1; i >= 0; i--) {
      removed[i] = removed[i].filter((it) => !out.has(it));
      if (!removed[i].length) removed.splice(i, 1);
    }
    files = next;
    hiddenNow = new Set([...hiddenNow].filter((f) => next.includes(f)));
    dz.hide(hiddenNow);
    renderFiles();
    render();
    updateSummary();
    st.ok(tr(`เอาไฟล์ออกแล้ว หน้าที่จัดไว้ของไฟล์ที่เหลือยังอยู่ครบ`, `File removed. Your work on the other files is kept`));
  }

  /* ── ดูหน้าใหญ่ (18/11/2026 พี่ปอนด์: ภาพย่อเล็กจนมองไม่เห็น) ───────────────────────────── */
  let viewer = null;
  const hidePeek = attachPeek(pagesGrid, {
    itemOf: (card) => (card.classList.contains("dropped") ? null : items[+card.dataset.i]),
    getDoc,
    blocked: () => !!drag || !!pending || !!viewer,
    /* ภาพลอยต้องเห็นของที่วางเหมือนการ์ดและไฟล์ (แผนเฟส 3 ข้อ 1) วาดลงหน้าฐานก่อนครอบหมุน */
    paint: (it) => (it.marks && it.marks.length
      ? (ctx, W, H) => paintMarks(ctx, W, H, it.marks, { w: it.bw || it.pw, h: it.bh || it.ph }) : null),
    inkKey: (it) => it.inkRev || 0,
    blankPic: (it) => it.inkThumb || null,
  });
  /* คลิกแถวไฟล์ = เลือกทุกหน้าของไฟล์นั้นในตะแกรง แล้วเลื่อนไปหาหน้าแรกของไฟล์ (18/11/2026 พี่ปอนด์ถามว่าจุดหกจุดกดได้ไหม)
     จะได้ลบหรือหมุนทั้งไฟล์ทีเดียวด้วยแถบเลือกหลายหน้า หน้าที่ลบไว้แล้วไม่ถูกเลือกกลับมา */
  function pickFile(file) {
    const fi = files.indexOf(file);
    const mine = items.filter((it) => !it.blank && it.fi === fi && !it.dropped);
    if (fi < 0 || !mine.length) return;
    sel.clear();
    mine.forEach((it) => sel.add(it));
    anchor = mine[0];
    render();
    pagesGrid.querySelector(`.pg[data-i="${items.indexOf(mine[0])}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: calm() ? "auto" : "smooth" });
  }
  /* ── แก้ไขบนหน้า ในตัวดูหน้าใหญ่ (เฟส 2 19/11/2026 แผน .claude/plans/2026-11-18-merge-edit-into-pages.md ข้อ 2.0) ──
     ตัวแก้ไขตัวเดียวกับเครื่องมือแก้ไขและเซ็นบน PDF (src/pdfmarks.js) ของที่วางเก็บใน item.marks
     จึงตามหน้าไปเองเมื่อลากสลับ ลบ ย้อน หรือสลับลำดับไฟล์ พิกัดเป็นสัดส่วนของหน้าฐาน (พื้นที่เดียวกับ item.crop)
     ‼️ หน้าที่หมุนหรือครอบ ชั้นของที่วางถูกหมุนครอบด้วย CSS ทั้งแผ่นแบบเดียวกับการ์ด (pdfgeom baseLayer)
        จุดคลิกจึงต้องแปลงกลับด้วยสูตร (viewToBase) ใช้ getBoundingClientRect ของชั้นที่หมุนอยู่ไม่ได้ */
  const est = statusBar();                 // แถบสถานะในแผงแก้ไข แถบล่างของหน้าถูกตัวดูบังอยู่
  let edIt = null;                         // หน้าที่เปิดอยู่ในตัวดู
  let markLog = [];                        // ลำดับที่วางทั้งเอกสาร ย้อนล่าสุดข้ามหน้าได้ แบบเครื่องมือแก้ไขและเซ็น
  let baseH = 0, drawnKey = "";
  const R = (it) => (it.blank ? 0 : it.rotate % 360);   // หน้าว่างในตัวดูแสดงแบบไม่หมุน
  const ed = createMarkEditor({
    st: est,
    ready: () => !!edIt,
    list: () => (edIt ? edIt.marks : []),
    add: (m) => { edIt.marks.push(m); markLog.push({ it: edIt, m }); },
    remove: (m) => { edIt.marks = edIt.marks.filter((x) => x !== m); markLog = markLog.filter((r) => r.m !== m); },
    undo: () => {
      const r = markLog.pop();
      if (!r) return;
      r.it.marks = r.it.marks.filter((x) => x !== r.m);
      ed.draw(); inkLater(r.it);
    },
    clearPage: () => {
      if (!edIt) return;
      const gone = new Set(edIt.marks);
      edIt.marks = [];
      markLog = markLog.filter((r) => !gone.has(r.m));
      ed.draw(); inkLater(edIt);
    },
    thumbs: () => { if (edIt) inkLater(edIt); },
    sync: () => {
      const b = ed.buttons;
      b.placeMidBtn.disabled = !edIt;
      b.undoBtn.disabled = !markLog.length;
      b.clearBtn.disabled = !(edIt && edIt.marks.length);
    },
    point: (ev) => {
      const r = baseEl.parentElement.getBoundingClientRect();     // กระดาษในตัวดู ไม่หมุน
      return viewToBase((ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height, R(edIt), edIt.crop);
    },
    nudge: ([dx, dy]) => {
      const a = viewToBase(0.5, 0.5, R(edIt), edIt.crop), b = viewToBase(0.5 + dx, 0.5 + dy, R(edIt), edIt.crop);
      return [b.x - a.x, b.y - a.y];
    },
    up: () => (edIt ? R(edIt) : 0),
    pxPerPt: () => baseH / (edIt.bh || edIt.ph),
    size: () => ({ w: edIt.bw || edIt.pw, h: edIt.bh || edIt.ph }),
  });
  const baseEl = el("div", { class: "pp-base" }, [ed.layer]);
  /* รอบ 4 (19/11/2026) เอาแถบภาพย่อบนสุดของแผงออก พี่ปอนด์: "มันไม่ค่อยสวย แปลก ๆ" (images/44.png 45.png)
     ภาพย่อหน้าขาวดูเป็นกล่องว่าง และมีปุ่มเลื่อนของเบราว์เซอร์โผล่ ตัวดูมีก่อนหน้า ถัดไป และเลขหน้าอยู่แล้ว */
  const edPanel = el("div", { role: "region", "aria-label": tr("เครื่องมือแก้ไขบนหน้า", "Edit tools for the page") }, [
    est.node,
    ed.panel,
    el("div", { class: "pz-edit-row" }, [ed.buttons.placeMidBtn, ed.buttons.undoBtn, ed.buttons.clearBtn]),
  ]);                                      // คำเตือนว่าข้อความเดิมยังอยู่ใต้กล่องปิดทับ มีในแผงของตัวแก้ไขแล้ว ไม่ซ้ำ
  ed.setMode("cover");
  est.clear();

  /** ภาพย่อที่มีของที่วาง (การ์ดหมุนและครอบภาพนี้ด้วย CSS อยู่แล้ว วาดลงภาพฐานทีเดียวจึงตรงทุกแบบ) */
  const inkJobs = new Map();
  function inkLater(it) {
    const job = (inkJobs.get(it) || 0) + 1;
    inkJobs.set(it, job);
    (async () => {
      it.inkRev = (it.inkRev || 0) + 1;              // ภาพลอยที่จำไว้ของหน้านี้ใช้ไม่ได้แล้ว
      if (!it.marks.length) { it.inkThumb = null; render(); return; }
      let c;
      if (it.blank) {
        c = document.createElement("canvas");
        c.width = Math.round(it.pw * 0.35); c.height = Math.round(it.ph * 0.35);
        const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
      } else {
        const img = await loadImg(it.thumb);
        if (!img) return;
        c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
      }
      await paintMarks(c.getContext("2d"), c.width, c.height, it.marks, { w: it.bw || it.pw, h: it.bh || it.ph });
      if (inkJobs.get(it) !== job) return;          // วางชิ้นใหม่ระหว่างวาด ใช้ผลรอบล่าสุด
      it.inkThumb = c.toDataURL("image/jpeg", 0.8);
      c.width = c.height = 0;
      render();
    })();
  }

  /** เปิดดูเต็มจอ เลื่อนดูได้เฉพาะหน้าที่เก็บ ตามลำดับในไฟล์ผลลัพธ์ , editing = เปิดมาพร้อมกางแผงแก้ไข */
  function openZoom(it, editing = false) {
    hidePeek();
    const list = items.filter((x) => !x.dropped);
    const many = files.length > 1;
    edIt = it;
    drawnKey = "";
    est.clear();
    viewer = openViewer({
      list, start: list.indexOf(it), getDoc,
      label: (x, i, n) => [tr(`หน้า ${i + 1} จาก ${n}`, `Page ${i + 1} of ${n}`),
        x.blank ? tr("หน้าว่าง", "Blank page")
          : (many ? tr(`ไฟล์ ${tagOf(x.fi)} หน้า ${x.index + 1}`, `File ${tagOf(x.fi)} page ${x.index + 1}`)
                  : tr(`หน้าเดิม ${x.index + 1}`, `Original page ${x.index + 1}`))],
      edit: {
        panel: edPanel, layer: baseEl, open: editing,
        /* Ctrl+Z ในตัวดู = ย้อนของที่วางล่าสุด ไม่ใช่ย้อนการลบหน้าของตะแกรงข้างหลัง (แผนเฟส 2 ข้อ 7) */
        key: (e) => {
          if (!((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z")) return false;
          if (!ed.buttons.undoBtn.disabled) ed.buttons.undoBtn.click();
          return true;
        },
        onPage: (x) => { edIt = x; drawnKey = ""; },
        onToggle: (on) => { if (on) est.info(tr("เลือกเครื่องมือ แล้วคลิกหรือลากบนหน้า", "Pick a tool, then click or drag on the page")); },
        sync: (x, W, H) => {
          const L = baseLayer(R(x), x.blank ? null : x.crop, W, H);
          baseEl.style.width = `${L.Bw}px`;
          baseEl.style.height = `${L.Bh}px`;
          baseEl.style.transform = L.css;
          baseH = L.Bh;
          const key = `${Math.round(L.Bw)}x${Math.round(L.Bh)}`;
          if (key !== drawnKey) { drawnKey = key; ed.draw(); }   // ขนาดตัวอักษรบนจอขึ้นกับขนาดกระดาษ
        },
      },
      onClose: () => { viewer = null; edIt = null; ed.layer.replaceChildren(); },
    });
  }

  /* ── ลากย้ายหน้า (18/11/2026 จุดขายที่พี่ปอนด์ขอให้ทำเต็มที่) ────────────────────────────
     พี่ปอนด์: ลากแล้วคนดูไม่ออกว่าจะไปลงตรงไหน
     ‼️ ใช้ pointer events ของเราเอง ไม่ใช้ HTML5 draggable
        ① HTML5 ลาก <img> ในการ์ด Chrome ใส่ชนิด "Files" มาด้วย ม่าน "ปล่อยไฟล์ได้เลย" ของกล่องรับไฟล์จึงขึ้นทั้งที่ลากภายใน
           (จับได้จริง ดู tests/browser_pdfpages_drag.py) ไม่มี native drag = ไม่มีทางขึ้นม่านโดยโครงสร้าง
        ② HTML5 ลากไม่ได้บนนิ้วหลายเครื่อง และจัดภาพตอนลากเองไม่ได้ (ภาพลากเป็นภาพจางของเบราว์เซอร์)
     ภาพที่ได้: การ์ดยกลอยตามนิ้ว เอียงตามแรงเหวี่ยง การ์ดอื่นเลื่อนหลบเปิดช่อง (FLIP) ช่องที่จะลงเรืองแสงพร้อมเลขหน้า
     ทุกการ์ดเปลี่ยนเลขสด ปล่อยแล้วเด้งเข้าช่องแบบสปริงแล้วกะพริบ
     ‼️ ช่องวางคำนวณจากตำแหน่ง "ตอนเริ่มลาก" (slots) ไม่ใช่ตำแหน่งปัจจุบัน
        ตำแหน่งปัจจุบันขยับตามช่องว่างที่เปิด ถ้าใช้คำนวณ ช่องจะสลับไปมาใต้เมาส์ที่อยู่นิ่ง */
  let lastPointerType = "mouse";
  let dragEndedAt = 0;
  const dragJustEnded = () => performance.now() - dragEndedAt < 300;
  const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  let pending = null, drag = null;

  pagesGrid.addEventListener("pointerdown", (e) => {
    lastPointerType = e.pointerType || "mouse";
    if (drag || pending || (e.pointerType === "mouse" && e.button !== 0)) return;
    const card = e.target.closest(".pg");
    if (!card || card.classList.contains("dropped") || e.target.closest(".tools")) return;
    const p = { x: e.clientX, y: e.clientY, id: e.pointerId, card, type: e.pointerType };
    pending = p;
    /* นิ้ว: กดค้าง 280 ms ถึงเริ่มลาก ปัดเร็ว ๆ ยังเลื่อนหน้าจอได้ตามปกติ */
    if (e.pointerType !== "mouse") p.timer = setTimeout(() => { if (pending === p) beginDrag(p, p.x, p.y); }, 280);
  });
  const onMove = (e) => {
    if (pending && e.pointerId === pending.id) {
      const d = Math.hypot(e.clientX - pending.x, e.clientY - pending.y);
      if (pending.type === "mouse" ? d > 6 : false) beginDrag(pending, e.clientX, e.clientY);
      else if (pending.type !== "mouse" && d > 10) { clearTimeout(pending.timer); pending = null; }   // ปัดเลื่อนจอ ไม่ใช่ลาก
    }
    if (drag && e.pointerId === drag.id) { e.preventDefault(); moveDrag(e.clientX, e.clientY); }
  };
  const onUp = (e) => {
    if (pending && e.pointerId === pending.id) { clearTimeout(pending.timer); pending = null; }
    if (drag && e.pointerId === drag.id) endDrag(e.type === "pointercancel");
  };
  addEventListener("pointermove", onMove, { passive: false });
  addEventListener("pointerup", onUp);
  addEventListener("pointercancel", onUp);
  // ‼️ ต้องมีตัวกันเลื่อนจอแบบ non-passive อยู่ที่ตะแกรงตั้งแต่ก่อนแตะ Chrome จึงยอมให้ยกเลิกการเลื่อนกลางทาง
  pagesGrid.addEventListener("touchmove", (e) => { if (drag) e.preventDefault(); }, { passive: false });
  pagesGrid.addEventListener("contextmenu", (e) => { if (drag || pending?.type === "touch") e.preventDefault(); });
  const onDragKey = (e) => { if (drag && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); endDrag(true); } };
  addEventListener("keydown", onDragKey, true);
  registerCleanup(ws.wrap, { dispose: () => {
    removeEventListener("pointermove", onMove); removeEventListener("pointerup", onUp);
    removeEventListener("pointercancel", onUp); removeEventListener("keydown", onDragKey, true);
  } });

  const visCards = () => [...pagesGrid.querySelectorAll(".pg:not(.dropped)")];
  function scrollerOf(node) {
    for (let n = node.parentElement; n && n !== document.body; n = n.parentElement) {
      const oy = getComputedStyle(n).overflowY;
      if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 1) return n;
    }
    return document.scrollingElement || document.documentElement;
  }

  function beginDrag(p, x, y) {
    pending = null;
    clearTimeout(p.timer);
    const card = p.card;
    if (!card.isConnected) return;
    const cards = visCards();
    const from = cards.indexOf(card);
    if (from < 0 || cards.length < 2) return;
    hidePeek();
    cards.forEach((c) => c.getAnimations().forEach((a) => a.cancel()));
    const g = pagesGrid.getBoundingClientRect();
    const r = card.getBoundingClientRect();
    const slots = cards.map((c) => { const q = c.getBoundingClientRect();
      return { x: q.left - g.left, y: q.top - g.top, w: q.width, h: q.height }; });
    // การ์ดลอย = สำเนาของการ์ดจริง ลอยอยู่ชั้นบนสุด ตามนิ้วทุกพิกเซล
    const ghost = card.cloneNode(true);
    ghost.classList.add("pp-ghost");
    ghost.classList.remove("selected", "pp-landed");
    ghost.removeAttribute("tabindex");
    ghost.setAttribute("aria-hidden", "true");
    Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    // ป้าย "ย้ายไปเป็นหน้า N" ลอยเหนือการ์ด อยู่นอกการ์ดเพราะการ์ดตัดขอบ (overflow hidden) และนิ้วบังตัวการ์ด
    const badge = el("div", { class: "pp-move-badge", role: "status" });
    /* ‼️ 19/11/2026 พี่ปอนด์: ลากนิดเดียว การ์ดที่ยกบังช่องวาง "จะไม่เห็นเลข 2 แอบเสียดายอยู่นะ"
       วงเลขหน้าปลายทางติดมุมขวาบนของการ์ดที่ลาก ลอยชั้นบนสุด ไม่มีอะไรบังได้ ช่องวางยังมีเลขตัวโตเหมือนเดิม */
    const bubble = el("div", { class: "pp-move-num", "aria-hidden": "true" });
    document.body.append(ghost, badge, bubble);
    // การ์ดจริงกลายเป็น "ช่องที่จะลง" เรืองแสง พร้อมเลขหน้าปลายทางตัวใหญ่
    const mark = el("div", { class: "pp-slot-mark", "aria-hidden": "true" }, [el("b"), el("span", {}, tr("วางตรงนี้", "Drop here"))]);
    card.appendChild(mark);
    card.classList.add("pp-slot");
    pagesGrid.classList.add("pp-is-dragging");
    document.documentElement.classList.add("pp-grabbing");
    drag = { id: p.id, type: p.type, card, ghost, badge, bubble, mark, from, at: from, slots, r0: r,
             off: { x: x - r.left, y: y - r.top }, x, y, lx: x, tilt: 0, scroller: scrollerOf(pagesGrid), raf: 0 };
    if (!calm()) requestAnimationFrame(() => ghost.classList.add("lifted"));
    else ghost.classList.add("lifted");
    if (navigator.vibrate && p.type === "touch") { try { navigator.vibrate(12); } catch { /* ไม่รองรับ */ } }
    renumber(true);
    moveDrag(x, y);
    drag.raf = requestAnimationFrame(autoScroll);
  }

  function moveDrag(x, y) {
    const d = drag;
    d.x = x; d.y = y;
    const vx = x - d.lx;
    d.lx = x;
    // เอียงตามแรงเหวี่ยงแนวนอน แล้วค่อยคืนกลับ ให้รู้สึกว่าถือของจริงอยู่
    d.tilt = calm() ? 0 : Math.max(-9, Math.min(9, d.tilt * 0.7 + vx * 0.35));
    d.ghost.style.translate = `${x - d.off.x - d.r0.left}px ${y - d.off.y - d.r0.top}px`;
    d.ghost.style.setProperty("--tilt", `${(-2.5 + d.tilt).toFixed(2)}deg`);
    d.badge.style.left = `${x - d.off.x + d.r0.width / 2}px`;
    d.badge.style.top = `${y - d.off.y - 10}px`;
    d.bubble.style.left = `${x - d.off.x + d.r0.width - 4}px`;
    d.bubble.style.top = `${y - d.off.y + 4}px`;
    const g = pagesGrid.getBoundingClientRect();
    const px = x - g.left, py = y - g.top;
    // ช่องที่ชี้อยู่ ถ้าไม่ได้ชี้ช่องไหนเลย (ช่องว่างระหว่างการ์ด นอกตะแกรง) เอาช่องที่ใกล้ที่สุด
    let best = 0, bestD = Infinity;
    d.slots.forEach((s, i) => {
      const dx = px < s.x ? s.x - px : px > s.x + s.w ? px - s.x - s.w : 0;
      const dy = py < s.y ? s.y - py : py > s.y + s.h ? py - s.y - s.h : 0;
      const dist = dx * dx + dy * dy * 1.5;
      if (dist < bestD) { bestD = dist; best = i; }
    });
    if (best !== d.at) moveSlot(best);
  }

  /* FLIP: จดตำแหน่งเดิม ย้ายช่องใน DOM จดตำแหน่งใหม่ แล้วเล่นจากเดิมไปใหม่
     ‼️ อ่านตำแหน่งเดิม "ก่อน" ยกเลิกแอนิเมชันที่ค้างอยู่ การ์ดที่กำลังเลื่อนจะเลื่อนต่อจากจุดที่เห็นจริง ไม่กระตุกกลับ */
  function moveSlot(to) {
    const d = drag;
    const cards = visCards();
    const before = new Map(cards.map((c) => [c, c.getBoundingClientRect()]));
    cards.forEach((c) => c.getAnimations().forEach((a) => a.cancel()));
    const others = cards.filter((c) => c !== d.card);
    if (to >= others.length) others[others.length - 1].after(d.card);
    else others[to].before(d.card);
    d.at = to;
    if (!calm()) {
      visCards().forEach((c) => {
        const a = before.get(c), b = c.getBoundingClientRect();
        const dx = a.left - b.left, dy = a.top - b.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }],
                  { duration: 280, easing: "cubic-bezier(.2,.9,.25,1.12)" });
      });
    }
    renumber(false);
  }

  /** เลขหน้าบนทุกการ์ดตามตำแหน่งตอนนี้ ใบไหนเลขเปลี่ยนเด้งให้เห็น */
  function renumber(first) {
    const d = drag;
    visCards().forEach((c, i) => {
      const n = c.querySelector(".pp-foot .num");
      if (!n || n.textContent === String(i + 1)) return;
      n.textContent = String(i + 1);
      if (!first && !calm()) { n.classList.remove("pp-pop"); void n.offsetWidth; n.classList.add("pp-pop"); }
    });
    const N = d.at + 1;
    d.mark.firstChild.textContent = String(N);
    const gn = d.ghost.querySelector(".pp-foot .num");
    if (gn) gn.textContent = String(N);
    d.badge.textContent = d.at === d.from ? tr(`หน้า ${N} ที่เดิม`, `Page ${N}, unchanged`)
                                          : tr(`ย้ายไปเป็นหน้า ${N}`, `Move to page ${N}`);
    d.badge.classList.toggle("same", d.at === d.from);
    if (d.bubble.textContent !== String(N)) {
      d.bubble.textContent = String(N);
      if (!first && !calm()) { d.bubble.classList.remove("pop"); void d.bubble.offsetWidth; d.bubble.classList.add("pop"); }
    }
    d.bubble.classList.toggle("same", d.at === d.from);
  }

  /* ลากถึงขอบจอ เลื่อนจอให้เอง ยิ่งชิดขอบยิ่งเร็ว ไม่งั้นย้ายหน้าไปไกล ๆ ในไฟล์ยาวไม่ได้ */
  function autoScroll() {
    const d = drag;
    if (!d) return;
    const sc = d.scroller;
    const docLike = sc === document.scrollingElement || sc === document.documentElement;
    const top = docLike ? 0 : sc.getBoundingClientRect().top;
    const bottom = docLike ? innerHeight : sc.getBoundingClientRect().bottom;
    const edge = 70;
    let v = 0;
    if (d.y < top + edge) v = -Math.ceil(((top + edge - d.y) / edge) * 18);
    else if (d.y > bottom - edge) v = Math.ceil(((d.y - (bottom - edge)) / edge) * 18);
    if (v) {
      const was = sc.scrollTop;
      sc.scrollTop += v;
      if (sc.scrollTop !== was) moveDrag(d.x, d.y);
    }
    d.raf = requestAnimationFrame(autoScroll);
  }

  function endDrag(cancel) {
    const d = drag;
    if (!d || d.ending) return;
    d.ending = true;
    cancelAnimationFrame(d.raf);
    if (cancel && d.at !== d.from) moveSlot(d.from);
    const target = d.card.getBoundingClientRect();
    d.badge.remove();
    d.bubble.remove();
    const finish = () => {
      d.ghost.remove();
      d.mark.remove();
      d.card.classList.remove("pp-slot");
      pagesGrid.classList.remove("pp-is-dragging");
      document.documentElement.classList.remove("pp-grabbing");
      drag = null;
      dragEndedAt = performance.now();
      if (cancel || d.at === d.from) {
        render();
        if (!cancel) st.info(tr(`หน้า ${d.from + 1} อยู่ที่เดิม`, `Page ${d.from + 1} stays where it was`));
        return;
      }
      // ลำดับใหม่อ่านจาก DOM ตรง ๆ รวมการ์ดที่ลบไว้ (ซ่อนอยู่) ให้อยู่ตำแหน่งเดิมของมัน
      const moved = items[+d.card.dataset.i];
      items = [...pagesGrid.querySelectorAll(".pg")].map((c) => items[+c.dataset.i]);
      flashItem = moved;
      render();
      st.ok(tr(`ย้ายไปเป็นหน้า ${d.at + 1} แล้ว`, `Moved to page ${d.at + 1}`));
    };
    // เด้งเข้าช่องแบบสปริง: ภาพลอยบินไปทับช่อง คืนขนาดและมุมเอียง แล้วค่อยวาดจริง
    if (calm()) { finish(); return; }
    const gs = d.ghost.style;
    d.ghost.classList.remove("lifted");
    d.ghost.classList.add("landing");
    gs.setProperty("--tilt", "0deg");
    gs.translate = `${target.left - d.r0.left}px ${target.top - d.r0.top}px`;
    let done = false;
    const once = () => { if (!done) { done = true; finish(); } };
    d.ghost.addEventListener("transitionend", (e) => { if (e.propertyName === "translate") once(); });
    setTimeout(once, 380);
  }

  async function save() {
    const keep = items.filter((i) => !i.dropped);
    if (!files.length && !keep.some((k) => k.blank)) return st.err(tr("เลือกไฟล์ก่อน", "Choose a file first"));
    if (!keep.length) return st.err(tr("ต้องเหลืออย่างน้อย 1 หน้า", "At least 1 page must remain"));
    results.innerHTML = "";
    saveBtn.disabled = true;
    ws.setBusy(true);
    st.info(tr("กำลังบันทึก…", "Saving…"));
    try {
      const { PDFDocument, degrees } = PDFLib;
      const out = await PDFDocument.create();
      let encrypted = false, hiddenLayers = false;

      /* ‼️ เปิดแต่ละไฟล์ครั้งเดียวแล้วเก็บไว้ ไม่ใช่เปิดใหม่ทุกหน้า
         ไฟล์ 50 หน้าถ้าเปิดซ้ำทุกหน้าคือถอดรหัสไฟล์เดิม 50 รอบ ช้าโดยไม่จำเป็น
         ‼️ และต้อง copyPages ทีละไฟล์เป็นก้อน แต่ใส่ลงเล่มตามลำดับที่ผู้ใช้จัดไว้
         ถ้าคัดลอกทีละหน้าตามลำดับ จะสลับ src ไปมาซึ่ง pdf-lib ทำงานช้ากว่ามาก */
      const srcDocs = new Map();
      // ‼️ หน้าว่างไม่ได้มาจากไฟล์ไหน ต้องกันออกก่อน ไม่งั้น fi เป็น undefined แล้ว files[undefined] พัง
      for (const fi of new Set(keep.filter((k) => !k.blank).map((k) => k.fi))) {
        const r = await loadPdfLib(files[fi]);
        srcDocs.set(fi, r.doc);
        encrypted = encrypted || r.encrypted;
        hiddenLayers = hiddenLayers || r.hiddenLayers;
      }
      /* ── ประทับของที่วางลงหน้าต้นฉบับก่อน แล้วท่อเดิม (คัดลอก ครอบ หมุน) ทำต่อ (แผนข้อ 4.1) ──
         ของเก็บเป็นสัดส่วนของหน้าฐาน = หน้าต้นฉบับตามที่ pdf.js เห็น จึงแปลงครั้งเดียวด้วย /Rotate กับ CropBox ของต้นฉบับ
         แล้วถูกครอบและหมุนไปพร้อมเนื้อหาเดิม ตรงกับการ์ดและตัวดูที่หมุนครอบทั้งแผ่น
         (วัด 19/11/2026 วาดลงหน้าต้นฉบับแล้ว copyPages กับ embedPage พาไปด้วย .claude/evidence/2026-11-19-ped-merge-edit/phase0/u3_copy_embed.txt)
         ‼️ ใช้ได้เพราะหนึ่งหน้าต้นฉบับมีการ์ดเดียว ถ้าวันหนึ่งมีทำสำเนาหน้า ต้องเปลี่ยนไปประทับที่หน้าผลลัพธ์ */
      const inkCache = new Map(), outInk = new Map();
      for (const it of keep) {
        if (it.blank || !it.marks || !it.marks.length) continue;
        const d = srcDocs.get(it.fi);
        if (!inkCache.has(it.fi)) inkCache.set(it.fi, new Map());
        await stampMarks(d, d.getPage(it.index), it.marks, inkCache.get(it.fi));
      }
      // คัดลอกเป็นก้อนต่อไฟล์ แล้วค่อยเรียงกลับตามตำแหน่งเดิมที่ผู้ใช้จัดไว้
      const copiedAt = new Array(keep.length);
      for (const [fi, doc] of srcDocs) {
        /* ‼️ โหมด "หน้าเท่ากัน" ไม่คัดลอกหน้าที่ครอบมา เพราะจะฝังด้วย embedPage แทน
           แต่โหมด "พอดีเนื้อหา" ต้องคัดลอกมาปกติ เพราะใช้ setCropBox กับหน้าที่คัดลอกแล้ว */
        const slots = keep.map((k, i) =>
          (!k.blank && !(modeOf(k) === "same" && k.crop) && k.fi === fi ? i : -1)).filter((i) => i >= 0);
        const pages = await out.copyPages(doc, slots.map((i) => keep[i].index));
        slots.forEach((slot, j) => { copiedAt[slot] = pages[j]; });
      }
      /* ‼️ ต้องวนด้วย index ห้ามใช้ forEach
         ช่องของหน้าว่างไม่เคยถูกกำหนดค่า = เป็น "รู" ในอาร์เรย์ ซึ่ง forEach ข้ามทิ้งเงียบ ๆ
         ผลคือหน้าว่างหายไปจากไฟล์โดยไม่มี error และหน้าจอยังโชว์การ์ดครบ (เจอจริง 18/09/2026) */
      for (let i = 0; i < keep.length; i++) {
        const page = copiedAt[i];
        const it = keep[i];
        /* หน้าว่าง สร้างใหม่ตรงนี้ ‼️ หมุนตามที่กดด้วย รุ่นเดิม continue ก่อนถึงคำสั่งหมุน
           กดหมุนหน้าว่างแล้วบันทึก ได้หน้าไม่หมุน (วัด 19/11/2026 tests/browser_pdfpages_rotated.py) */
        if (it.blank) {
          const bp = out.addPage([it.pw, it.ph]);
          // ประทับก่อนหมุน ของบนหน้าว่างเก็บในพิกัดหน้าที่ยังไม่หมุน
          if (it.marks && it.marks.length) await stampMarks(out, bp, it.marks, outInk);
          if (it.rotate) bp.setRotation(degrees(it.rotate % 360));
          continue;
        }
        /* ‼️ กรอบครอบเป็นสัดส่วนของภาพย่อ ซึ่ง pdf.js หมุนตาม /Rotate และตัดตาม CropBox ของไฟล์ต้นฉบับแล้ว
           รุ่นเดิมคูณกับ MediaBox ก่อนหมุนตรง ๆ ไฟล์สแกนจากมือถือที่หมุนหน้าไว้จึงครอบผิดมุม (วัด 19/11/2026)
           แปลงผ่าน src/pdfgeom.js ตัวเดียวกับเครื่องมือครอบตัดขอบ PDF ที่พิสูจน์แล้ว
           อ่านเรขาคณิตจากหน้าต้นฉบับ ไม่ใช่หน้าที่คัดลอก เพราะ copyPages สืบทอดค่าข้าม /Rotate null */
        const src = srcDocs.get(it.fi).getPage(it.index);
        const rot = srcRotation(src), box = shownBox(src);
        const turn = (pg) => {
          if (it.rotate || srcRotation(pg) !== rot) pg.setRotation(degrees((rot + it.rotate) % 360));
        };

        /* ── หน้าที่ครอบ: ตัดเนื้อหาแล้วขยายให้เต็มหน้ากระดาษขนาดเดิม ─────────
           ‼️ ทำแบบนี้ทุกหน้าในไฟล์จึงมีขนาดเท่ากัน ซึ่งสำคัญตอนสั่งพิมพ์
              ถ้าใช้ setCropBox หน้ากระดาษจะเล็กลงตามเนื้อหา แล้วเครื่องพิมพ์จะย่อขยายมั่ว
           ‼️ พิกัด PDF นับจากมุมล่างซ้าย ส่วนค่าที่เก็บไว้นับจากมุมบนซ้ายแบบภาพ ต้องกลับแกน y
           ‼️ ขยายแบบรักษาสัดส่วน แล้วจัดกลางหน้า ไม่ยืดบิด ไม่งั้นตัวหนังสือเพี้ยน */
        if (it.crop && modeOf(it) === "tight") {
          /* หน้ากระดาษหดพอดีเนื้อหา ใช้ setCropBox ซึ่งไม่แตะพิกเซลเลย ไม่เสียคุณภาพ */
          const q = viewRectToRaw(it.crop, rot, box);
          page.setCropBox(q.x, q.y, q.w, q.h);
          turn(page);
          out.addPage(page);
          continue;
        }
        if (it.crop) {
          const q = viewRectToRaw(it.crop, rot, box);
          const emb = await out.embedPage(src, { left: q.x, bottom: q.y, right: q.x + q.w, top: q.y + q.h });
          const np = out.addPage([it.pw, it.ph]);
          /* เนื้อหาที่ฝังเป็นหน้าดิบก่อนหมุน ต้องหมุนตาม /Rotate ของต้นฉบับตอนวาด ให้หน้าตาเหมือนการ์ด
             ขนาดที่เห็นจึงสลับกว้างสูงเมื่อต้นฉบับหมุน 90 หรือ 270 */
          const sideways = rot % 180 !== 0;
          const cw = sideways ? emb.height : emb.width, ch = sideways ? emb.width : emb.height;
          const k = Math.min(it.pw / cw, it.ph / ch);
          const dw = cw * k, dh = ch * k;
          const at = placeRawContent({ x: (it.pw - dw) / 2, y: (it.ph - dh) / 2, w: dw, h: dh }, rot);
          np.drawPage(emb, { x: at.x, y: at.y, width: emb.width * k, height: emb.height * k,
                             ...(at.rotate ? { rotate: degrees(at.rotate) } : {}) });
          if (it.rotate) np.setRotation(degrees(it.rotate % 360));
          continue;
        }
        turn(page);
        out.addPage(page);
      }

      const blob = new Blob([await out.save()], { type: "application/pdf" });
      st.ok(tr(`บันทึกแล้ว ${keep.length} หน้า`, `Saved, ${pl(keep.length, "page", "pages")}`));
      if (encrypted) results.appendChild(el("div", { class: "status show err" }, ENCRYPTED_WARNING));
      // ‼️ ชั้นที่ผู้ใช้ซ่อนไว้จะกลายเป็นมองเห็นได้ในไฟล์ผลลัพธ์ ต้องบอกก่อนไฟล์หลุดไป
      if (hiddenLayers) results.appendChild(el("div", { class: "note warn" }, HIDDEN_LAYERS_WARNING));
      // หลายไฟล์ใช้ชื่อกลาง ๆ เพราะเอาชื่อไฟล์แรกมาตั้งจะเข้าใจผิดว่าได้แค่ไฟล์นั้น
      // ‼️ นับเฉพาะไฟล์ที่ยังมีหน้าเหลือ ใส่ A B แต่ลบ B หมด ไฟล์ที่ได้คือของ A ล้วน ตั้งชื่อตาม A
      const live = [...new Set(keep.filter((k) => !k.blank).map((k) => k.fi))];
      const name = live.length !== 1
        ? tr("รวมจัดหน้าใหม่.pdf", "combined-pages.pdf")
        : stripExt(files[live[0]].name) + tr("-จัดหน้าใหม่.pdf", "-edited.pdf");
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, tr(`${keep.length} หน้า`, `${pl(keep.length, "page", "pages")}`))]),
        el("span", { class: "r-size" }, fmtBytes(blob.size)),
        downloadButton(blob, name),
      ]));
    } catch (e) {
      st.err(tr("บันทึกไม่ได้: ", "Couldn't save: ") + e.message);
    } finally {
      ws.setBusy(false);
      saveBtn.disabled = false;
    }
  }

  setCropMode("same");

  return ws.wrap;
}
