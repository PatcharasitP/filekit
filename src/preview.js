// ─────────────────────────────────────────────────────────────────────────────
// ดูไฟล์เต็ม ๆ ก่อนลงมือ — โหลดตอนกดดูครั้งแรกเท่านั้น (ไม่ถ่วงหน้าแรก)
// ‼️ ชื่อไฟล์อย่างเดียวไม่พอ โดยเฉพาะภาพที่แคปมาจากคลิปบอร์ดซึ่งชื่อ "image.png" เหมือนกันหมด
//    ต้องเห็นรูปถึงจะรู้ว่าหยิบถูกใบ (พี่ปอนด์ทักเอง 08/09/2026 — "กดดูรูปไม่ได้เหรอ")
// ‼️ 08/09/2026 (รอบ 2 — coverflow): เดิมดูได้ทีละใบ ต้องปิดแล้วเปิดใหม่ถึงดูใบถัดไป
//    ตอนนี้ viewFile(file, allFiles) เปิดเป็น "ชุด" เลื่อนดูได้ทั้งกลุ่ม การ์ดกลางคือ .pv-stage
//    ตัวเดิมเป๊ะ (ซูม/ลาก/PDF ไม่แตะเลย) ข้าง ๆ เป็นการ์ดพรีวิวเบา ๆ ที่โหลดเฉพาะ idx±2 ใบ
//    เอียง 3D ด้วย transform ธรรมดา (ห้าม animation-timeline:view() — เว็บนี้เคยโดน FCP
//    372→700ms มาแล้วจากบทเรียนเก่า) กลไกลอกมาจาก .claude/carousel-lab/coverflow.js ที่วัด
//    fps จริงแล้วว่าลื่นก่อนเอามาต่อ · signature เดิม viewFile(file) ยังใช้ได้ ไม่พัง
// ─────────────────────────────────────────────────────────────────────────────
import { el } from "./dom.js";
import { tr } from "./i18n.js";
import { detectType } from "./filetype.js";
import { fileKindIcon } from "./icons.js";
import { normalizeThaiPUA } from "./thai.js";

// ── สไตล์ของโหมด coverflow — ฝังเองเพราะห้ามแก้ assets/css/tool.css ─────────────
// ‼️ ทุกอย่างที่นี่ scope อยู่ใต้ .pv.pv-gallery เท่านั้น (ยกเว้น .pv-card ที่มีแค่ตอน
//    gallery เปิดอยู่จริง) — ตอนดูไฟล์เดียว (list.length===1) ไดอะล็อกต้องเหมือนของเดิม
//    ทุกพิกเซล จึงให้ wrapper ใหม่ทั้งหมด display:contents เป็นค่าเริ่มต้น (ไม่กินเลย์เอาต์)
const STYLE_ID = "pv-gallery-style";
const STYLE = `
  /* แผงดูเนื้อไฟล์ Excel/Word — อ่านได้จริงบนมือถือด้วย จึงให้เลื่อนในกล่องตัวเอง
     ‼️ ต้องกำหนดสีเองให้ครบคู่ ห้ามพึ่ง --text ของหน้า เพราะกล่องนี้ลอยอยู่บนฉากมืดของ
     ตัวดูไฟล์ ซึ่ง --text ตรงนั้นเป็นสีอ่อน วางบนพื้นกระดาษขาวแล้วจางจนอ่านไม่ออก
     (เห็นกับตาตอนทดสอบจริง 09/09/2026) ยึดพื้นขาวตัวอักษรเข้มเหมือนกระดาษ ทั้งสองธีม
     เหมือนที่หน้า PDF ในตัวดูไฟล์เดียวกันนี้ก็เป็นพื้นขาวอยู่แล้ว */
  .pv-doc{ max-width:min(1000px,92vw); max-height:78vh; overflow:auto;
    background:#fff; color:#1b2029;
    padding:14px 16px; border-radius:12px; text-align:left; line-height:1.6; }
  .pv-doc p{ margin:0 0 8px; }
  .pv-doc h3{ margin:12px 0 6px; font-size:1.05rem; }
  .pv-doc-list{ margin:0 0 8px 18px; }
  .pv-doc-note{ color:#5b6472; font-size:12.5px; margin:6px 0; }
  .pv-doc-load{ color:#e8eaee; padding:24px; }
  .pv-sheet{ border-collapse:collapse; font-size:13px; color:#1b2029; }
  .pv-sheet th,.pv-sheet td{ border:1px solid #dcdfe4; padding:4px 8px; text-align:left;
    white-space:nowrap; max-width:280px; overflow:hidden; text-overflow:ellipsis; }
  .pv-sheet th{ background:#eef0f4; font-weight:700; position:sticky; top:0; }
  .pv-scene{ display:contents; }
  .pv.pv-gallery .pv-scene{
    display:block; position:fixed; inset:0; z-index:1;
    perspective:1600px; perspective-origin:50% 55%;
    touch-action:pan-y; pointer-events:none;
  }
  .pv-stage-wrap{ display:contents; }
  .pv.pv-gallery .pv-stage-wrap{
    display:block; position:absolute; left:50%; top:50%;
    width:min(58vw,640px); pointer-events:auto; will-change:transform,opacity;
  }
  .pv-card{
    position:absolute; left:50%; top:50%; width:min(58vw,640px); max-height:64dvh;
    display:flex; align-items:center; justify-content:center;
    will-change:transform,opacity; pointer-events:auto; cursor:pointer; touch-action:none;
  }
  /* ‼️ รูปในการ์ดกลางต้องพอดีการ์ด ไม่ใช่พอดีจอ — tool.css เดิมตั้ง max-width:min(92vw,1200px)
     ซึ่งใหญ่กว่าการ์ด coverflow (640px) รูปจึงล้นออกนอกการ์ด 276px (วัดจริง) */
  /* ‼️ การ์ดกลางต้องใหญ่พอให้อ่านเนื้อในภาพออก — จำกัดแค่ 100% ของการ์ด (640px) ทำให้
     ภาพแคปหน้าจอเล็กจนตัวหนังสืออ่านไม่ออก (เจ้าของทัก "ภาพไม่ค่อยชัด")
     ให้การ์ดกลางกว้างกว่าการ์ดข้างชัดเจน แล้วภาพเต็มการ์ด */
  .pv.pv-gallery:not(.is-zoomed) .pv-stage-wrap{ width:min(86vw,1100px); }
  .pv.pv-gallery:not(.is-zoomed) .pv-stage img,
  .pv.pv-gallery:not(.is-zoomed) .pv-stage canvas{ max-width:100%; max-height:74dvh; }
  .pv-card img{
    max-width:100%; max-height:64dvh; width:auto; height:auto; object-fit:contain;
    display:block; -webkit-user-drag:none; user-select:none; pointer-events:none;
    border-radius:10px; box-shadow:0 30px 70px -20px rgba(0,0,0,.8); background:#fff;
  }
  .pv-card.is-pdf{
    flex-direction:column; gap:10px; padding:28px; border-radius:14px;
    background:rgba(28,32,39,.92); border:1px solid rgba(255,255,255,.14);
    color:#c9cfdb; font-size:12.5px; text-align:center; word-break:break-all;
  }
  .pv-card-ico{ width:46px; height:46px; stroke:#c9cfdb; fill:none; stroke-width:1.6;
    stroke-linecap:round; stroke-linejoin:round; }
  @media (max-width:640px){
    .pv.pv-gallery .pv-stage-wrap, .pv-card{ width:min(78vw,640px); }
  }

  .pv.pv-gallery .pv-cap{ position:fixed; left:0; right:0; bottom:16px; z-index:5;
    padding:0 16px; margin:0; pointer-events:none; }

  .pv-nav{ position:fixed; top:50%; translate:0 -50%; z-index:6; display:none;
    width:44px; height:44px; border-radius:999px; border:1px solid rgba(255,255,255,.3);
    background:rgba(20,24,34,.7); color:#fff; font-size:20px; line-height:1; cursor:pointer;
    align-items:center; justify-content:center; }
  .pv.pv-gallery .pv-nav{ display:flex; }
  .pv-nav:hover{ background:rgba(108,140,255,.22); }
  .pv-nav:disabled{ opacity:.3; cursor:default; }
  .pv-prev{ left:14px; } .pv-next{ right:14px; }
  @media (max-width:640px){
    .pv-nav{ width:36px; height:36px; font-size:16px; }
    .pv-prev{ left:8px; } .pv-next{ right:8px; }
  }

  /* เคอร์เซอร์ "มือจับ" บนพื้นที่ว่างรอบการ์ด บอกว่าลากเปลี่ยนใบได้ — รูปเองยังเป็น
     zoom-in/grab ตามของเดิม (tool.css คุมตรงนั้นอยู่แล้ว ไม่ชนกัน) */
  .pv.pv-gallery:not(.is-zoomed) .pv-stage{ cursor:grab; touch-action:pan-y; }
  .pv.pv-gallery.is-zoomed .pv-stage{ touch-action:pinch-zoom; }
  .pv-x{ z-index:9; }

  @media (prefers-reduced-motion: reduce){
    .pv-stage-wrap, .pv-card{ transition:none; }
  }
`;
function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  document.head.appendChild(el("style", { id: STYLE_ID }, STYLE));
}

let box = null;      // <dialog> ตัวเดียวใช้ซ้ำทั้งเว็บ
let url = null;      // objectURL ของรูปที่กำลังเปิดอยู่กลางจอ (การ์ดหลัก) — ต้องคืนหน่วยความจำตอนปิด/สลับ

/* ‼️ 09/09/2026 พี่ปอนด์ทักเอง: "ไฟล์ควรคลิกดูข้อมูลข้างในได้ไหม" — เดิมดูได้แค่รูปกับ PDF
 * ส่วน Excel/Word คลิกแล้วเงียบ ทั้งที่เป็นชนิดที่คนใช้เยอะสุดในงานเอกสาร และการ "หยิบผิดไฟล์"
 * เกิดบ่อยกว่ารูปด้วยซ้ำ เพราะชื่อไฟล์คล้ายกันหมด (รายงาน-final-2.xlsx)
 * ตัวอ่านของสองชนิดนี้ (xlsx, mammoth) โหลดตอนกดดูเท่านั้น หน้าแรกจึงไม่หนักขึ้นเลย */
const DOC_KINDS = new Set(["xlsx", "csv", "docx"]);

/** ไฟล์ชนิดนี้เปิดดูได้ไหม (รูปเปิดได้เสมอ · PDF เปิดได้เมื่อ pdf.js โหลดอยู่แล้ว
 *  · Excel/CSV/Word เปิดได้เสมอ เพราะดึงตัวอ่านมาให้ตอนกด) */
export const canView = (file) => {
  const k = detectType(file);
  return k === "image" || (k === "pdf" && !!window.pdfjsLib) || DOC_KINDS.has(k);
};

const MAX_ROWS = 200, MAX_COLS = 40;        // พอให้ "รู้ว่าใช่ไฟล์นี้" โดยไม่ค้างกับไฟล์แสนแถว

/** ตารางจาก Excel หรือ CSV — อ่านชีทแรกที่ไม่ได้ซ่อนไว้ */
async function renderSheet(file, d, expectedIdx) {
  const { loadLibs } = await import("./loader.js");
  await loadLibs("xlsx");
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()),
    { type: "array", cellDates: true, raw: false, codepage: 65001 });
  // ‼️ ชีทที่ผู้ใช้ซ่อนไว้ต้องไม่โผล่ในตัวดูไฟล์เหมือนกัน (กฎเดียวกับ excel-to-pdf/excel-csv)
  const visible = wb.SheetNames.filter((n, i) => (wb.Workbook?.Sheets?.[i]?.Hidden || 0) === 0);
  const name = visible[0] || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, defval: "" });
  if (!(d.open && expectedIdx === idx)) return;
  const head = rows[0] || [];
  const body = rows.slice(1, MAX_ROWS + 1);
  const table = el("table", { class: "pv-sheet" }, [
    el("thead", {}, [el("tr", {}, head.slice(0, MAX_COLS).map((c) => el("th", {}, String(c ?? ""))))]),
    el("tbody", {}, body.map((r) => el("tr", {},
      Array.from({ length: Math.min(head.length || r.length, MAX_COLS) },
        (_, i) => el("td", {}, String(r[i] ?? "")))))),
  ]);
  const more = rows.length > MAX_ROWS + 1
    ? el("div", { class: "pv-doc-note" },
        tr(`แสดง ${MAX_ROWS} แถวแรกจากทั้งหมด ${rows.length - 1} แถว`,
           `Showing the first ${MAX_ROWS} of ${rows.length - 1} rows`)) : null;
  const sheets = wb.SheetNames.length > 1
    ? el("div", { class: "pv-doc-note" },
        tr(`ชีทที่แสดง: ${name} (ไฟล์นี้มี ${wb.SheetNames.length} ชีท)`,
           `Showing sheet: ${name} (this file has ${wb.SheetNames.length} sheets)`)) : null;
  d._stage.appendChild(el("div", { class: "pv-doc" }, [sheets, table, more]));
}

/** เนื้อความจากไฟล์ Word — เก็บเฉพาะโครงที่จำเป็น (หัวข้อ ย่อหน้า รายการ ตาราง)
 *  ‼️ ประกอบ DOM เองทีละชิ้นจากข้อความล้วน ไม่ยัด innerHTML ที่ได้จากไฟล์ของผู้ใช้ */
async function renderDoc(file, d, expectedIdx) {
  const { loadLibs } = await import("./loader.js");
  await loadLibs("mammoth");
  const { value: raw } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  // เอกสารฟอนต์ TH รุ่นเก่าเก็บวรรณยุกต์เป็นอักขระเฉพาะฟอนต์ ต้องแปลงก่อนถึงจะอ่านออกในตัวดูไฟล์
  const value = normalizeThaiPUA(raw).text;
  if (!(d.open && expectedIdx === idx)) return;
  const dom = new DOMParser().parseFromString(value, "text/html");
  const out = [];
  for (const node of dom.body.children) {
    const tag = node.tagName.toLowerCase();
    const text = (node.textContent || "").trim();
    if (tag === "table") {
      out.push(el("table", { class: "pv-sheet" },
        [...node.rows].slice(0, MAX_ROWS).map((r) => el("tr", {},
          [...r.cells].slice(0, MAX_COLS).map((c) => el("td", {}, (c.textContent || "").trim()))))));
    } else if (tag === "ul" || tag === "ol") {
      out.push(el("ul", { class: "pv-doc-list" },
        [...node.children].map((li) => el("li", {}, (li.textContent || "").trim()))));
    } else if (text) {
      out.push(el(/^h[1-6]$/.test(tag) ? "h3" : "p", {}, text));
    }
  }
  d._stage.appendChild(el("div", { class: "pv-doc" },
    out.length ? out : [el("p", {}, tr("ไฟล์นี้ไม่มีข้อความให้แสดง", "This file has no text to show"))]));
}

/* ── ซูม (ของเดิม ไม่แตะตรรกะ) ───────────────────────────────────────────
 * แคปหน้าจอมาแล้วต้องซูมอ่านตัวหนังสือเล็ก ๆ ได้ ไม่งั้นดูได้แค่ "ใช่ใบนี้ไหม"
 * scale 0 = พอดีจอ · >0 = เท่าของขนาดจริง · ให้ .pv-stage เลื่อนดูเอง (overflow:auto)
 * มือถือใช้นิ้วหุบ-กางได้ตามปกติเพราะ touch-action:pinch-zoom */
let scale = 0, media = null;
/* ปุ่มที่กดเปิดกล่อง — ใช้คืนโฟกัสตอนปิด
   ‼️ จับตอน "กดจริง" ไม่ใช่ตอน viewFile() ทำงาน เพราะผู้เรียก await import() ก่อน
   กว่าจะถึงตรงนั้น activeElement เปลี่ยนไปแล้ว (วัดเจอ: กลายเป็น body) */
let openerEl = null;
addEventListener("pointerdown", (e) => {
  const t = e.target instanceof Element ? e.target.closest("button,[tabindex],a") : null;
  if (t && !t.closest("dialog.pv")) openerEl = t;
}, true);
const MIN = 0.1, MAX = 6;

function applyScale(atX, atY) {
  if (!media) return;
  const st = box._stage;
  if (scale <= 0) {
    media.style.width = ""; media.style.maxWidth = ""; media.style.maxHeight = "";
    media.classList.remove("zoomed");
    box.classList.remove("is-zoomed");
    return;
  }
  const natW = media.naturalWidth || media.width;
  const before = { w: media.offsetWidth, h: media.offsetHeight, l: st.scrollLeft, t: st.scrollTop };
  media.style.maxWidth = "none"; media.style.maxHeight = "none";
  media.style.width = Math.round(natW * scale) + "px";
  media.classList.add("zoomed");
  box.classList.add("is-zoomed");
  box._cap.dataset.zoomed = "1";
  // ซูมค้างไว้ตรงจุดที่ผู้ใช้เล็ง ไม่ใช่กระโดดกลับไปมุมบนซ้าย
  const fx = before.w ? (atX ?? st.clientWidth / 2) : 0;
  const fy = before.h ? (atY ?? st.clientHeight / 2) : 0;
  const rx = (before.l + fx) / (before.w || 1);
  const ry = (before.t + fy) / (before.h || 1);
  st.scrollLeft = rx * media.offsetWidth - fx;
  st.scrollTop = ry * media.offsetHeight - fy;
}

function fitScale() {
  if (!media) return 1;
  const natW = media.naturalWidth || media.width;
  return natW ? media.offsetWidth / natW : 1;
}

/* ── coverflow: ดูหลายไฟล์ในชุดเดียวกัน ──────────────────────────────────
 * list = ไฟล์ที่ "ดูได้" ทั้งหมดในชุด (กรองด้วย canView แล้ว) เรียงตามลำดับที่ผู้เรียกส่งมา
 * idx = ใบที่อยู่ใน .pv-stage ตอนนี้ (การ์ดกลาง — ตัวเดียวที่ซูม/ลากได้)
 * position/target = ตำแหน่งทศนิยม/ปลายทาง ไว้ไหลนุ่มระหว่างเลื่อน (0.22 ต่อเฟรม แบบเดียวกับ
 * carousel-lab/coverflow.js ที่วัด fps จริงแล้วว่าลื่น)
 * โหลดจริง (createObjectURL) เฉพาะ idx±LOAD_RADIUS ใบ ที่เหลือไม่มี element ในหน้าเลย
 * (ไม่ใช่แค่ซ่อนด้วย CSS) — สลับ index ค่อยสร้าง/ทำลาย ไม่ต้องมีการ์ดเป็นร้อยพร้อมกัน */
const LOAD_RADIUS = 2;
const reduceMQ = matchMedia("(prefers-reduced-motion: reduce)");
let list = [], idx = 0, target = 0, position = 0;
let dragging = false, settling = false, raf = null;
let mounted = new Map();     // index -> { wrap, url }  การ์ดข้าง ๆ ที่กำลังโหลดอยู่ตอนนี้
let lastWindowCenter = null; // กันเรียก mount/unmount ซ้ำทุกเฟรม (บทเรียน forced-reflow ใน NOTES.md)
let swipeDrag = null, moved = 0;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clampIdx = (i) => clamp(i, 0, list.length - 1);

function unmountCard(i) {
  const m = mounted.get(i);
  if (!m) return;
  if (m.url) URL.revokeObjectURL(m.url);
  m.wrap.remove();
  mounted.delete(i);
}
function mountCard(i) {
  if (i === idx || mounted.has(i) || i < 0 || i >= list.length) return;
  const f = list[i];
  const jump = () => { if (moved > 4) { moved = 0; return; } goTo(i); };
  if (detectType(f) === "pdf") {
    // PDF ข้าง ๆ ไม่เรียก pdf.js เพื่อวาด (แพงและไม่จำเป็น — จุดประสงค์แค่ "รู้ว่ามีไฟล์นี้อยู่
    // ตรงนี้" ตัวที่ต้องเห็นเนื้อจริงคือใบกลางซึ่งใช้ pdf.js เต็มรูปแบบเหมือนเดิมอยู่แล้ว
    const wrap = el("div", { class: "pv-card is-pdf", onclick: jump },
      [fileKindIcon("pdf", "pv-card-ico"), el("span", {}, f.name || "PDF")]);
    box._scene.appendChild(wrap);
    mounted.set(i, { wrap, url: null });
    return;
  }
  const objUrl = URL.createObjectURL(f);
  const wrap = el("div", { class: "pv-card", onclick: jump },
    [el("img", { src: objUrl, alt: f.name || "" })]);
  box._scene.appendChild(wrap);
  mounted.set(i, { wrap, url: objUrl });
}
function ensureWindow(center) {
  if (!list.length) return;
  const r = clampIdx(Math.round(center));
  if (lastWindowCenter === r) return;   // ตำแหน่งกลมเท่าเดิม — ไม่ต้องทำอะไรซ้ำ
  lastWindowCenter = r;
  const lo = clampIdx(r - LOAD_RADIUS), hi = clampIdx(r + LOAD_RADIUS);
  for (const i of [...mounted.keys()]) if (i < lo || i > hi) unmountCard(i);
  for (let i = lo; i <= hi; i++) if (i !== idx) mountCard(i);
}

function cardTransform(node, d) {
  const ad = Math.abs(d);
  if (ad > 4.2) { node.style.display = "none"; return; }
  node.style.display = "";
  const reduce = reduceMQ.matches;
  const tx = d * 46;                                    // % ของความกว้างเวทีต่อการ์ด
  const rot = reduce ? 0 : clamp(d * -34, -56, 56);
  const tz = reduce ? 0 : -ad * 140;
  const sc = Math.max(0.55, 1 - ad * 0.16);
  const op = Math.max(0, 1 - ad * 0.32);
  node.style.transform =
    `translate(-50%,-50%) translateX(${tx}%) translateZ(${tz}px) rotateY(${rot}deg) scale(${sc})`;
  node.style.opacity = String(op);
  node.style.zIndex = String(1000 - Math.round(ad * 10));
}
function renderFrame() {
  // ‼️ ต้อง ensureWindow ก่อนวนใส่ transform เสมอ — ตอนเปิดครั้งแรก (viewFile เรียก renderFrame()
  //    ครั้งเดียวโดยไม่ผ่าน loop()) ถ้าวนใส่ transform ก่อน mounted จะยังว่างอยู่ การ์ดข้าง ๆ ที่เพิ่ง
  //    ถูกสร้างจาก ensureWindow จะไม่ได้ transform เลยในเฟรมนั้น (ค้างตำแหน่งเริ่มต้น ทับการ์ดกลาง
  //    พี่ปอนด์เจอเองจาก screenshot จริง — การ์ดข้าง ๆ ไม่เอียง ไม่เลื่อน ทับกลางเป๊ะ)
  ensureWindow(position);
  cardTransform(box._stageWrap, idx - position);
  for (const [i, m] of mounted) cardTransform(m.wrap, i - position);
}

function settleStep() {
  if (reduceMQ.matches) { position = target; settling = false; return; }
  // ‼️ วัดจริง: 0.22 + เกณฑ์จบ 0.002 ใช้เวลา 1,100-1,300ms ต่อใบ ซึ่งหนืดเกินไป
  //    (เกณฑ์ที่คนรู้สึกว่า "ตอบสนองทันที" คือ 200-400ms) เร่งขึ้นและจบให้ไวขึ้น
  position += (target - position) * 0.42;
  if (Math.abs(target - position) < 0.01) { position = target; settling = false; }
}
function loop() {
  if (settling) {
    settleStep();
    if (!settling) finishSettle();   // ยิงแบบไม่รอ (async) — swap เนื้อการ์ดกลางทีหลังได้
  }
  renderFrame();
  if (dragging || settling) raf = requestAnimationFrame(loop);
  else raf = null;
}
function kick() { if (!raf) raf = requestAnimationFrame(loop); }

function updateNavButtons() {
  if (!box._prev) return;
  box._prev.disabled = idx <= 0;
  box._next.disabled = idx >= list.length - 1;
}
function updateCaption(extra) {
  const f = list[idx];
  let base = f?.name || tr("รูปจากคลิปบอร์ด", "Image from clipboard");
  if (list.length > 1) base = `${idx + 1} / ${list.length}\u2002\u2002${base}`;
  box._cap.textContent = base + (extra || "");
}

/** โหลดไฟล์ index ที่กำหนดเข้า .pv-stage (การ์ดกลาง) — ของเดิมเป๊ะ (image/pdf) แค่พารามิเตอร์ไซซ์
 * expectedIdx กันเคสสลับไปมาเร็ว ๆ ระหว่างที่ยังวาด PDF ไม่เสร็จ (ของเดิมกันด้วย d.open อย่างเดียว
 * พอมีหลายไฟล์ต้องเช็คด้วยว่ายัง "ใช่ใบนี้" อยู่ ไม่ใช่แค่ยังเปิด dialog อยู่) */
async function loadIntoStage(file, expectedIdx) {
  const d = box;
  d._stage.innerHTML = "";
  media = null; scale = 0; d.classList.remove("is-zoomed");
  if (url) { URL.revokeObjectURL(url); url = null; }
  updateCaption();

  const kind = detectType(file);
  if (kind === "image") {
    url = URL.createObjectURL(file);
    media = el("img", { src: url, alt: file.name || "" });
    d._stage.appendChild(media);
    return;
  }
  if (DOC_KINDS.has(kind)) {
    d._stage.appendChild(el("div", { class: "pv-doc-load" }, tr("กำลังเปิดไฟล์…", "Opening…")));
    try {
      const render = kind === "docx" ? renderDoc : renderSheet;
      d._stage.innerHTML = "";
      await render(file, d, expectedIdx);
    } catch (e) {
      console.error(e);
      if (d.open && expectedIdx === idx) {
        d._stage.innerHTML = "";
        d._stage.appendChild(el("div", { class: "pv-err" },
          tr("เปิดดูไฟล์นี้ไม่ได้ อาจเสียหายหรือถูกล็อกไว้", "Could not open this file, it may be damaged or locked")));
      }
    }
    return;
  }
  // PDF: วาดหน้าแรกใหญ่ ๆ พอให้อ่านออกว่าใช่ฉบับที่ต้องการไหม
  try {
    const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const page = await doc.getPage(1);
    const vp0 = page.getViewport({ scale: 1 });
    const fit = Math.min((innerWidth * 0.86) / vp0.width, (innerHeight * 0.78) / vp0.height);
    // วาดละเอียด 2 เท่าของขนาดที่แสดง เพื่อให้ซูมเข้าไปแล้วยังอ่านออก ไม่แตกเป็นเม็ด
    const viewport = page.getViewport({ scale: Math.max(0.2, fit) * 2 });
    const canvas = el("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    canvas.style.width = Math.round(viewport.width / 2) + "px";
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    doc.destroy?.();
    if (d.open && expectedIdx === idx) {   // ผู้ใช้อาจปิด/เลื่อนไปใบอื่นแล้วระหว่างวาด
      media = canvas; d._stage.appendChild(canvas);
      updateCaption(tr(`\u2002\u2002หน้า 1 จาก ${doc.numPages}`, `\u2002\u2002page 1 of ${doc.numPages}`));
    }
  } catch (e) {
    console.error(e);
    if (d.open && expectedIdx === idx) {
      d._stage.appendChild(el("div", { class: "pv-err" },
        tr("เปิดดูไฟล์นี้ไม่ได้ อาจเสียหายหรือถูกล็อกไว้", "Could not open this file, it may be damaged or locked")));
    }
  }
}

/** เลื่อนไปดูไฟล์ index ที่กำหนด (คลิกลูกศร/คีย์บอร์ด/ล้อเมาส์/ปัด/คลิกการ์ดข้าง ๆ เรียกจุดนี้หมด) */
function goTo(newIdx) {
  if (list.length < 2) return;
  if (box.classList.contains("is-zoomed")) { scale = 0; applyScale(); }   // ซูมค้างอยู่ต้องคืนก่อนเลื่อน
  target = clampIdx(newIdx);
  settling = true;
  kick();
}
/** ไหลถึงปลายทางแล้ว — ถ้าเปลี่ยนใบจริง สลับเนื้อการ์ดกลาง (การ์ดข้าง ๆ ที่เคยพรีวิวไว้ก็ปลด
 * ออกจากพูล เพราะย้ายไปเป็นเนื้อจริงใน .pv-stage แทนแล้ว) */
async function finishSettle() {
  position = target;
  if (idx !== target) {
    const newIdx = target;
    unmountCard(newIdx);
    idx = newIdx;
    lastWindowCenter = null;
    updateNavButtons();
    ensureWindow(position);          // อัปเดตการ์ดข้าง ๆ ทันที ไม่ต้องรอโหลดการ์ดกลางเสร็จ (PDF อาจช้า)
    await loadIntoStage(list[newIdx], newIdx);
  } else {
    ensureWindow(position);
  }
}

function resetGallery() {
  if (raf) { cancelAnimationFrame(raf); raf = null; }
  dragging = false; settling = false; swipeDrag = null; moved = 0;
  for (const i of [...mounted.keys()]) unmountCard(i);
  mounted.clear();
  lastWindowCenter = null;
  list = []; idx = 0; target = 0; position = 0;
}

function ensureBox() {
  if (box) return box;
  injectStyle();
  const stage = el("div", { class: "pv-stage" });
  const stageWrap = el("div", { class: "pv-stage-wrap" }, [stage]);
  const scene = el("div", { class: "pv-scene" }, [stageWrap]);
  const cap = el("div", { class: "pv-cap" });
  const prevBtn = el("button", { class: "pv-nav pv-prev", type: "button",
    "aria-label": tr("รูปก่อนหน้า", "Previous"),
    onclick: (e) => { e.stopPropagation(); goTo((settling ? target : idx) - 1); } }, "‹");
  const nextBtn = el("button", { class: "pv-nav pv-next", type: "button",
    "aria-label": tr("รูปถัดไป", "Next"),
    onclick: (e) => { e.stopPropagation(); goTo((settling ? target : idx) + 1); } }, "›");
  const close = el("button", {
    class: "pv-x", type: "button", "aria-label": tr("ปิด", "Close"),
    onclick: () => box.close(),
  }, "✕");
  box = el("dialog", { class: "pv" }, [close, scene, prevBtn, nextBtn, cap]);
  // คลิกนอกภาพ = ปิด (พฤติกรรมที่คนคาดหวังจากภาพเต็มจอ) — .pv-scene เป็น pointer-events:none
  // เอง (เว้นแต่ตัวการ์ด/สเตจ) คลิกพื้นที่ว่างจึงทะลุมาเจอ box ตรงนี้ได้เหมือนของเดิมทุกโหมด
  box.addEventListener("click", (e) => { if (e.target === box) box.close(); });
  box.addEventListener("close", () => {
    // ‼️ คืนโฟกัสกลับปุ่มที่เปิดกล่องนี้ ไม่งั้นคนใช้คีย์บอร์ดต้อง Tab ใหม่ตั้งแต่ต้นหน้า
    //    (จับได้จาก tests/browser_a11y.py — activeElement กลายเป็น <body>)
    const back = openerEl;
    openerEl = null;
    if (back && back.isConnected) queueMicrotask(() => back.focus());
    if (url) { URL.revokeObjectURL(url); url = null; }
    stage.innerHTML = ""; media = null; scale = 0;
    box.classList.remove("is-zoomed", "pv-gallery");
    resetGallery();
  });

  // คลิกที่รูปกลาง = สลับ พอดีจอ ↔ ขนาดจริง (ซูมตรงจุดที่คลิก) — ของเดิม ไม่แตะ
  // ‼️ ไม่มี "กดที่รูปเพื่อซูม" แล้ว — คลิกบนรูปต้องปล่อยให้เป็นการเริ่มลากไฟล์ออกไปข้างนอก
  //    ซูมใช้ล้อเมาส์ (และนิ้วหุบ-กางบนมือถือ) ซึ่งไม่ชนกับการลาก
  // ล้อเมาส์: แนวนอน (แทร็คแพด 2 นิ้ว/shift+wheel) = เลื่อนใบ ตอนไม่ได้ซูมอยู่ · แนวตั้ง = ซูมของเดิม
  stage.addEventListener("wheel", (e) => {
    if (!media) return;
    const horiz = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (horiz && list.length > 1 && !box.classList.contains("is-zoomed")) {
      e.preventDefault();
      goTo((settling ? target : idx) + (e.deltaX > 0 ? 1 : -1));
      return;
    }
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    const cur = scale > 0 ? scale : fitScale();
    scale = Math.min(MAX, Math.max(MIN, cur * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    applyScale(e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  // ลากเลื่อนดูตอนซูมอยู่ (ของเดิม ไม่แตะ)
  let drag = null;
  stage.addEventListener("pointerdown", (e) => {
    if (!box.classList.contains("is-zoomed") || !media?.contains(e.target)) return;
    moved = 0;
    drag = { x: e.clientX, y: e.clientY, l: stage.scrollLeft, t: stage.scrollTop };
    stage.classList.add("dragging");
    /* ‼️ ห้ามใช้ setPointerCapture ที่นี่ — พอจับ pointer ไว้ click ที่ตามมาหลังปล่อยเมาส์
       จะถูกยิงไปที่ .pv-stage แทนตัวรูป (จับได้จาก event จริง: click → DIV.pv-stage)
       เงื่อนไข media.contains(e.target) จึงไม่ผ่าน = กดย่อกลับไม่ได้เลยหลังลากครั้งแรก
       ไม่ต้อง capture ก็ลากได้อยู่แล้วเพราะ .pv-stage เต็มจอ */
  });
  stage.addEventListener("pointermove", (e) => {
    if (!drag) return;
    moved = Math.max(moved, Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y));
    stage.scrollLeft = drag.l - (e.clientX - drag.x);
    stage.scrollTop = drag.t - (e.clientY - drag.y);
  });
  /* ‼️ รูปเป็นของที่เบราว์เซอร์ "ลากไปวางที่อื่น" ได้เองตามธรรมชาติ พอกดค้างแล้วขยับ
     มันจะเริ่ม native drag (เงารูปลอยตามเมาส์) แล้วตัด pointer event ของเราทิ้งกลางคัน
     ‼️ ห้ามกันด้วย preventDefault ที่ pointerdown — จะกัน click ที่ใช้ย่อกลับไปด้วย
     ต้องกันเฉพาะ dragstart ตัวเดียว */
  // ‼️ ห้ามกัน dragstart — เจ้าของเว็บใช้การ "ลากรูปออกไปวางในแท็บ/โฟลเดอร์อื่น" เป็นประจำ
  //    ซึ่งเป็นความสามารถที่เบราว์เซอร์ให้มาฟรี ๆ · ซูมใช้ล้อเมาส์แทนได้ (ไม่ต้องกดที่รูป)
  // ‼️ ต้องคืน pointer capture ทุกครั้ง ไม่งั้น click ที่ตามมาถูกยิงไปที่ .pv-stage แทนตัวรูป
  const endDrag = () => { drag = null; stage.classList.remove("dragging"); };
  addEventListener("pointerup", endDrag);        // ปล่อยเมาส์นอกกรอบก็ยังหลุดโหมดลาก
  addEventListener("pointercancel", endDrag);

  // ── coverflow: ปัดนิ้ว/ลากเมาส์เพื่อเลื่อนดูใบอื่น — ใช้งานเฉพาะตอนไม่ได้ซูมอยู่ + มีหลายไฟล์
  // (ปิด swipe ตอนซูมค้าง ไม่ให้ชนกับลากแพนของเดิมด้านบน) ฟังที่ box เพราะการ์ดข้าง ๆ อยู่
  // นอกขอบ .pv-stage ไปแล้ว ต้องรับ pointerdown จากทั้งการ์ดกลางและการ์ดข้าง ๆ ได้พร้อมกัน
  box.addEventListener("pointerdown", (e) => {
    if (list.length < 2 || box.classList.contains("is-zoomed")) return;
    if (!e.target.closest(".pv-stage, .pv-card")) return;
    swipeDrag = { x: e.clientX, pos: position };
    dragging = true; settling = false; moved = 0;
    stage.classList.add("dragging");
    kick();
  });
  box.addEventListener("pointermove", (e) => {
    if (!swipeDrag) return;
    const dx = e.clientX - swipeDrag.x;
    moved = Math.max(moved, Math.abs(dx));
    // ‼️ ใช้ innerWidth (ค่าที่รู้อยู่แล้ว) ไม่เรียก getBoundingClientRect()/clientWidth ทุกเฟรม
    //    บทเรียนจาก carousel-lab: เรียกแล้วบังคับ forced reflow ทุกเฟรม = fps ตกฮวบ (ดู NOTES.md)
    const w = innerWidth || 1;
    position = clamp(swipeDrag.pos - (dx / w) * 3.4, 0, list.length - 1);
    kick();
  });
  const endSwipe = () => {
    if (!swipeDrag) return;
    swipeDrag = null; dragging = false;
    stage.classList.remove("dragging");
    target = clampIdx(Math.round(position));
    settling = true;
    kick();
  };
  addEventListener("pointerup", endSwipe);
  addEventListener("pointercancel", endSwipe);

  // ปุ่มลัด: + − ซูม · 0 กลับพอดีจอ (ของเดิม) · ← → เลื่อนใบ (ใหม่ — ปิดตอนซูมอยู่ ให้ลากดูแทน)
  // ‼️ ฟังที่ document ไม่ใช่ box — จับได้จริง (Playwright cold-verify 08/09): ปุ่ม ‹/› ที่ชนขอบชุด
  //    ถูกตั้ง disabled ตอน updateNavButtons() พอดีตอนนั้นถ้าโฟกัสค้างอยู่บนปุ่มที่เพิ่งกด เบราว์เซอร์
  //    จะเด้งโฟกัสหลุดออกจาก dialog ไปเอง (ปุ่ม disabled รับโฟกัสไม่ได้) ทำให้ keydown ที่ box ไม่มีวันได้ยิน
  //    อีกเลย (ต่างจาก Esc ที่เบราว์เซอร์ดักให้ dialog เองไม่ผ่าน focus) — ฟังที่ document + เช็ค box.open
  //    เองแทน ไม่พึ่ง focus เลย กันบั๊กนี้ตายตัว
  document.addEventListener("keydown", (e) => {
    if (!box.open) return;
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && list.length > 1 &&
        !box.classList.contains("is-zoomed")) {
      e.preventDefault();
      goTo((settling ? target : idx) + (e.key === "ArrowRight" ? 1 : -1));
      return;
    }
    if (!media) return;
    if (e.key === "+" || e.key === "=") { scale = Math.min(MAX, (scale > 0 ? scale : fitScale()) * 1.3); applyScale(); }
    else if (e.key === "-") { scale = Math.max(MIN, (scale > 0 ? scale : fitScale()) / 1.3); applyScale(); }
    else if (e.key === "0") { scale = 0; applyScale(); }
  });

  document.body.appendChild(box);
  box._stage = stage; box._cap = cap; box._scene = scene; box._stageWrap = stageWrap;
  box._prev = prevBtn; box._next = nextBtn;
  return box;
}

/** เปิดดูไฟล์เต็มจอ — คืน true ถ้าเปิดให้ได้จริง
 * @param {File} file ไฟล์ที่จะเปิดดู (ต้องผ่าน canView)
 * @param {File[]} [allFiles] ไฟล์ชุดเดียวกัน (เช่นทุกไฟล์ในกล่องวาง/รายการที่ผู้ใช้กำลังดูอยู่)
 *   ต้องเป็น array ที่มี `file` อยู่จริง (อ้างอิงตัวเดียวกัน) — ไม่ใส่/ใส่ผิดชนิด = ทำงานเหมือนของเดิม
 *   คือดูได้ทีละใบ (backward compatible เต็มร้อย) ใส่แล้วมีไฟล์ที่ดูได้ >1 ใบ = เปิดเป็น
 *   coverflow เลื่อนดูใบอื่นในชุดได้ทันที ไม่ต้องปิดแล้วเปิดใหม่ */
export async function viewFile(file, allFiles) {

  if (!canView(file)) return false;
  const pool = Array.isArray(allFiles) && allFiles.length ? allFiles : [file];
  const newList = pool.filter(canView);
  if (!newList.includes(file)) newList.unshift(file);   // กันเคส allFiles ไม่มี file อยู่จริง (ไม่ควรเกิด)

  const d = ensureBox();
  resetGallery();               // เผื่อเปิดซ้ำโดยยังไม่ผ่าน close event (กันสถานะค้างจากรอบก่อน)
  list = newList;
  idx = target = Math.max(0, list.indexOf(file));
  position = idx;
  d.classList.toggle("pv-gallery", list.length > 1);
  // ‼️ จับปุ่มต้นทางก่อน showModal — พอเปิด dialog แล้วโฟกัสถูกย้ายเข้ากล่องทันที
  //    (ตัวดัก pointerdown ด้านบนไม่ทันครั้งแรก เพราะโมดูลนี้เพิ่งถูก import ตอนคลิก)
  if (document.activeElement instanceof HTMLElement && !document.activeElement.closest('dialog.pv'))
    openerEl = document.activeElement;
  /* ‼️ Safari รู้จัก <dialog>.showModal() ตั้งแต่รุ่น 15.4 (มีนาคม 2022) เท่านั้น
   * รุ่นก่อนหน้านั้น showModal เป็น undefined เรียกแล้วโยน TypeError ทันที
   * ผลคือกดภาพย่อแล้วตัวดูรูปไม่เปิดเลย และ error หลุดไปคอนโซลด้วย
   * เปิดแบบธรรมดาแทนได้ (ยังเห็นภาพและปิดด้วยปุ่มกากบาทได้ แค่ไม่กันโฟกัสให้)
   * เครื่องนี้ทดสอบ WebKit จริงไม่ได้ (ลง system library ไม่ได้เพราะต้องใช้ sudo)
   * จึงกันไว้ตามเอกสารรองรับของ Safari แทนการยืนยันด้วยการรันจริง */
  if (typeof d.showModal === "function") d.showModal();
  else d.setAttribute("open", "");

  await loadIntoStage(list[idx], idx);
  renderFrame();
  updateNavButtons();
  return true;
}
