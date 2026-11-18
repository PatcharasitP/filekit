/* ดู PDF จากแถวรายการไฟล์ (18/11/2026 พี่ปอนด์ลองบนเว็บจริง)
 *
 * ① openPdfFile   แว่นขยายบนภาพย่อของแถวไฟล์ เปิดตัวดูตัวเดียวกับการ์ดหน้าของ "จัดการหน้า PDF"
 *    (pagezoom.openViewer ซูมได้ เปลี่ยนหน้าได้ มีเลขหน้า) ดูได้ทุกหน้าของไฟล์นั้น
 *    ‼️ พี่ปอนด์: ตัวดู coverflow เดิมที่ไฟล์ข้าง ๆ โผล่เป็นกล่องจาง ๆ "ฟีเจอร์อันนี้ไม่คือ"
 *       ส่วนตัวดูของการ์ดหน้า "ดีมาก ๆ" จึงไม่เขียนตัวดูใหม่ ใช้ของ pagezoom ตรง ๆ
 *    รูปกับเอกสารอื่นยังใช้ตัวดูเดิมใน preview.js (เรียกมาจาก preview.js ตอนเป็น PDF เท่านั้น)
 * ② attachFilePeek  ชี้เมาส์ค้างบนภาพย่อ ภาพหน้าแรกใหญ่ลอยขึ้นข้างแถว เลื่อนเมาส์ออกแล้วหาย
 *    ‼️ attachPeek ของ pagezoom ผูกกับการ์ด .pg ตายตัว ใช้กับแถวไฟล์ไม่ได้ จึงมีตัวเล็กของตัวเอง
 *       แต่ใช้ renderItem กับ shownSize ของ pagezoom ตัวเดียวกัน ภาพจึงออกมาแบบเดียวกัน
 * โหลดตอนใช้เท่านั้น ไม่อยู่ในเส้นทางหน้าแรก */
import { openViewer, renderItem } from "./pagezoom.js";
import { el } from "./dom.js";
import { tr } from "./i18n.js";

async function openDoc(file) {
  if (!window.pdfjsLib) { const { loadLibs } = await import("./loader.js"); await loadLibs("pdfjs"); }
  return window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
}

/** หน้าหนึ่งใบในรูปที่ openViewer ใช้ (ไม่หมุน ไม่ครอบ) ขนาดเป็น pt หลังหมุนตามที่ไฟล์กำหนดแล้ว */
async function pageItem(doc, i) {
  const page = await doc.getPage(i + 1);
  const vp = page.getViewport({ scale: 1 });
  page.cleanup();
  return { index: i, fi: 0, pw: vp.width, ph: vp.height, rotate: 0, crop: null, blank: false, dropped: false };
}

/** เปิดตัวดูทุกหน้าของไฟล์ PDF คืน true ถ้าเปิดได้ (เปิดไม่ได้ เช่นไฟล์เสียหรือมีรหัสผ่าน = false ให้ผู้เรียกใช้ตัวเดิมแทน)
 *  ‼️ วัดขนาดทุกหน้าก่อนเปิด เพราะตัวดูใช้ขนาดหน้าคำนวณ "พอดีจอ" ถ้าใช้ขนาดหน้าแรกกับทุกหน้า หน้าที่ขนาดต่างจะบิดสัดส่วน */
export async function openPdfFile(file) {
  let doc;
  try {
    doc = await openDoc(file);
    const n = doc.numPages;
    const list = new Array(n);
    for (let i = 0; i < n; i += 40) {
      await Promise.all(Array.from({ length: Math.min(40, n - i) }, (_, k) => pageItem(doc, i + k).then((it) => { list[i + k] = it; })));
    }
    openViewer({
      list, start: 0, getDoc: async () => doc,
      label: (it, i, total) => [file.name, tr(`หน้า ${i + 1} จาก ${total}`, `Page ${i + 1} of ${total}`)],
      onClose: () => { try { doc.destroy(); } catch { /* ปิดไปแล้ว */ } },
    });
    return true;
  } catch {
    try { doc?.destroy(); } catch { /* ไม่มีอะไรให้ปิด */ }
    return false;
  }
}

/** ภาพหน้าแรกของไฟล์ลอยข้างแถว เฉพาะเครื่องที่มีเมาส์
 *  @param listEl กล่องรายการแถว  @param opts {fileOf(thumbEl) -> File|null, blocked() -> bool}
 *  ‼️ ไม่โหลด pdf.js เพิ่มเพียงเพราะเมาส์ผ่าน ถ้ายังไม่มีไลบรารีอยู่ก็ไม่ลอย (ภาพย่อก็ยังเป็นไอคอนอยู่ด้วยเหตุเดียวกัน) */
export function attachFilePeek(listEl, { fileOf, blocked }) {
  if (!matchMedia("(hover:hover) and (pointer:fine)").matches) return () => {};
  let timer = 0, token = 0, node = null, shownFor = null;
  const cache = new WeakMap();    // ไฟล์ -> { url, ar } เรนเดอร์หน้าแรกครั้งเดียวต่อไฟล์
  const hide = () => {
    clearTimeout(timer);
    token++;
    shownFor = null;
    removeEventListener("scroll", hide, true);
    removeEventListener("keydown", hide, true);
    if (node) { const n = node; node = null; n.classList.remove("on"); setTimeout(() => n.remove(), 160); }
  };
  async function firstPage(file, targetW) {
    const hit = cache.get(file);
    if (hit) return hit;
    const doc = await openDoc(file);
    try {
      const it = await pageItem(doc, 0);
      const c = await renderItem(doc, it, targetW);
      const entry = { url: c.toDataURL("image/jpeg", 0.88), ar: it.pw / it.ph };
      c.width = c.height = 0;
      cache.set(file, entry);
      return entry;
    } finally { try { doc.destroy(); } catch { /* ปิดไปแล้ว */ } }
  }
  async function show(thumb, file) {
    const my = ++token;
    shownFor = thumb;
    try {
      if (!window.pdfjsLib || blocked()) return;
      const row = thumb.closest(".file-row") || thumb;
      const r = row.getBoundingClientRect();
      const roomR = innerWidth - r.right - 16, roomL = r.left - 16;
      const wMax = Math.min(460, Math.max(roomR, roomL) - 12);
      if (wMax < 200) return;                       // ไม่มีที่ข้างแถว ไม่ลอยทับแถวตัวเอง
      const entry = await firstPage(file, Math.round(wMax * Math.min(2, devicePixelRatio || 1)));
      if (my !== token || blocked()) return;
      const w = Math.min(wMax, (innerHeight - 24) * entry.ar), h = w / entry.ar;
      const left = roomR >= roomL ? r.right + 12 : r.left - 12 - w;
      const top = Math.max(12, Math.min(innerHeight - h - 12, r.top + r.height / 2 - h / 2));
      if (node) node.remove();
      node = el("div", { class: "fr-peek", "aria-hidden": "true",
        style: { left: `${Math.round(left)}px`, top: `${Math.round(top)}px`, width: `${Math.round(w)}px` } },
        [el("img", { src: entry.url, alt: "" })]);
      document.body.appendChild(node);
      addEventListener("scroll", hide, true);
      addEventListener("keydown", hide, true);
      requestAnimationFrame(() => node && node.classList.add("on"));
    } catch { hide(); }
  }
  /* ‼️ "ชี้ค้าง" = เมาส์นิ่งบนภาพย่อ 400 ms ไม่ใช่แค่ผ่านเข้ามา (เหตุผลเดียวกับการ์ดหน้า คนที่กำลังจะคลิกไม่ควรเจอภาพลอยบัง) */
  const arm = (e) => {
    if (e.pointerType && e.pointerType !== "mouse") return;
    const t = e.target.closest?.(".file-row .thumb");
    if (!t) { if (shownFor || timer) hide(); return; }
    if (t === shownFor) return;
    clearTimeout(timer);
    if (shownFor) hide();
    const file = fileOf(t);
    if (!file) return;
    timer = setTimeout(() => show(t, file), 400);
  };
  listEl.addEventListener("pointerover", arm);
  listEl.addEventListener("pointermove", arm);
  listEl.addEventListener("pointerleave", hide);
  listEl.addEventListener("pointerdown", hide, true);
  return hide;
}
