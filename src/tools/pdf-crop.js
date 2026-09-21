// ── ครอบตัดขอบหน้า PDF ─────────────────────────────────────────────────────
// ใช้กับไฟล์สแกนที่ติดขอบดำหรือขอบกระดาษมาด้วย และสไลด์ที่มีขอบขาวเยอะเกินไป
//
// ‼️ ต้องบอกผู้ใช้ตามจริง: การครอบตัดของ PDF คือการ "ย่อกรอบที่แสดง" (CropBox)
//   เนื้อหานอกกรอบยังอยู่ในไฟล์ แค่ไม่ถูกแสดงและไม่ถูกพิมพ์
//   ถ้าต้องการให้หายจริง ๆ ต้องใช้เครื่องมือลบข้อมูลลับ ซึ่งเขียนลิงก์ไว้ให้บนหน้า
//   (พิสูจน์แล้ว 21/09/2026: cropbox เปลี่ยน แต่ mediabox เท่าเดิม เนื้อหาเดิมยังอ่านได้ด้วยเครื่องมือ)
import { openPdf, loadPdfLib, passwordBox, friendlyPdfError } from "../pdfopen.js";
import { el, dropzone, statusBar, button, field, select, downloadButton,
         stripExt, yieldToBrowser, fmtBytes } from "../ui.js";
import { workspace } from "../workspace.js";
import { tr, pl } from "../i18n.js";

const VIEW_SCALE = 1.5;

const STYLE = `
.cr-wrap{display:flex;flex-direction:column;gap:10px;height:100%;min-height:0}
.cr-wrap[hidden]{display:none}
.cr-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px;color:var(--text-mute)}
.cr-bar .grow{flex:1 1 auto}
.cr-scroll{flex:1 1 auto;min-height:0;overflow:auto;display:flex;justify-content:center;align-items:flex-start;padding:4px}
.cr-stage{position:relative;line-height:0;box-shadow:var(--sh2);border-radius:var(--r-sm);overflow:hidden}
.cr-stage canvas{display:block;width:100%;height:auto}
.cr-layer{position:absolute;inset:0;cursor:crosshair;touch-action:none}
/* พื้นที่ที่จะถูกตัดทิ้ง ทำให้มืดลง ส่วนที่เหลือคือกรอบที่จะเก็บไว้ */
.cr-mask{position:absolute;inset:0;background:rgba(17,17,17,.45);pointer-events:none}
.cr-keep{position:absolute;box-sizing:border-box;border:2px solid #fff;
  box-shadow:0 0 0 9999px rgba(17,17,17,.45);pointer-events:none}
.cr-pages{display:flex;gap:6px;flex-wrap:wrap}
.cr-pg{min-width:36px;min-height:36px;padding:4px 9px;border:1px solid var(--line);border-radius:var(--r-sm);
  background:var(--card);color:var(--text);font-size:13px;cursor:pointer;font-variant-numeric:tabular-nums}
.cr-pg.on{border-color:var(--g-pdf);color:var(--g-pdf);font-weight:700}
.cr-note{font-size:12.5px;line-height:1.6;color:var(--text-mute);
  background:var(--bg-soft);border:1px solid var(--line-soft);border-radius:var(--r-sm);padding:9px 12px}
.cr-warn{border:1px solid var(--line);border-left:3px solid #b8860b;border-radius:var(--r-sm);
  background:color-mix(in srgb,#b8860b 7%,transparent);padding:10px 12px;font-size:13px;line-height:1.6}
`;

export function mount(tool) {
  const st = statusBar();
  const results = el("div", { class: "results" });

  const viewCanvas = el("canvas", {});
  const layer = el("div", { class: "cr-layer" });
  const keepBox = el("div", { class: "cr-keep", hidden: true });
  const stage = el("div", { class: "cr-stage" }, [viewCanvas, layer, keepBox]);
  const scroller = el("div", { class: "cr-scroll" }, [stage]);
  const pagesBar = el("div", { class: "cr-pages" });
  const info = el("div", { class: "grow" });
  const resetBtn = button(tr("ล้างกรอบ", "Clear the frame"), { ghost: true, onclick: () => { crop = null; draw(); refresh(); } });
  const wrap = el("div", { class: "cr-wrap", hidden: true }, [
    el("div", { class: "cr-bar" }, [info, resetBtn]),
    scroller, pagesBar,
    el("div", { class: "cr-note" },
       tr("ลากคลุมส่วนที่ต้องการเก็บไว้ ส่วนที่มืดลงคือส่วนที่จะถูกตัดออกจากการแสดงผล",
          "Drag over the part you want to keep. The darkened area is what gets cropped away")),
  ]);

  const applySel = select([
    ["all", tr("ทุกหน้า", "All pages")],
    ["odd", tr("หน้าคี่", "Odd pages")],
    ["even", tr("หน้าคู่", "Even pages")],
    ["one", tr("เฉพาะหน้าที่เห็นอยู่", "Only the page shown")],
  ], "all");

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
    right: { title: tr("การครอบตัด", "Crop"), node: el("div", {}, [
      field(tr("ใช้กรอบนี้กับ", "Apply the frame to"), applySel),
      el("div", { class: "cr-warn" },
         tr("เนื้อหานอกกรอบยังอยู่ในไฟล์ แค่ไม่แสดงและไม่พิมพ์ ถ้าต้องการให้หายจริงใช้ตัวลบข้อมูลลับ",
            "Content outside the frame stays in the file, just not shown or printed. To remove it, use the redaction tool")),
    ]) },
    center: { node: wrap, empty: tr("เลือกไฟล์ PDF แล้วลากคลุมส่วนที่ต้องการเก็บ", "Choose a PDF, then drag over the part you want to keep") },
    footer: [go, st.node],
  });
  ws.wrap.appendChild(el("style", {}, STYLE));
  ws.body.appendChild(results);

  let file = null, pdf = null, pageCount = 0, cur = 0, pageSize = null;
  let crop = null;      // { x, y, w, h } สัดส่วน 0 ถึง 1 นับจากมุมซ้ายบนของหน้า

  async function onFile(fs) {
    file = fs[0] || null;
    results.innerHTML = "";
    crop = null;
    st.clear();
    if (pdf) { try { pdf.destroy(); } catch {} pdf = null; }
    if (!file) { wrap.hidden = true; ws.showCanvas(false); go.disabled = true; return; }
    try {
      st.info(tr("กำลังเปิดไฟล์…", "Opening the file…"));
      pdf = await openPdf(file, passwordBox(ws.body));
      pageCount = pdf.numPages;
      cur = 0;
      wrap.hidden = false;
      ws.showCanvas(true);
      await showPage(0);
      st.clear();
    } catch (e) {
      wrap.hidden = true; ws.showCanvas(false); go.disabled = true;
      st.err(friendlyPdfError(e, file.name).message);
    }
  }

  async function showPage(i) {
    if (!pdf || i < 0 || i >= pageCount) return;
    cur = i;
    const page = await pdf.getPage(i + 1);
    const vp = page.getViewport({ scale: VIEW_SCALE });
    viewCanvas.width = Math.floor(vp.width);
    viewCanvas.height = Math.floor(vp.height);
    await page.render({ canvasContext: viewCanvas.getContext("2d"), viewport: vp }).promise;
    const base = page.getViewport({ scale: 1 });
    pageSize = { w: base.width, h: base.height };
    page.cleanup();
    const room = Math.max(240, (scroller.clientWidth || 700) - 20);
    stage.style.width = Math.min(vp.width, room) + "px";
    draw();
    refresh();
  }

  function draw() {
    if (!crop) { keepBox.hidden = true; return; }
    keepBox.hidden = false;
    Object.assign(keepBox.style, {
      left: crop.x * 100 + "%", top: crop.y * 100 + "%",
      width: crop.w * 100 + "%", height: crop.h * 100 + "%",
    });
  }

  function refresh() {
    go.disabled = !crop;
    resetBtn.disabled = !crop;
    if (!pageSize) return;
    info.textContent = crop
      ? tr(`กรอบที่เก็บไว้ ${Math.round(crop.w * pageSize.w)} x ${Math.round(crop.h * pageSize.h)} พอยต์ จากหน้าขนาด ${Math.round(pageSize.w)} x ${Math.round(pageSize.h)}`,
           `Keeping ${Math.round(crop.w * pageSize.w)} x ${Math.round(crop.h * pageSize.h)} pt of a ${Math.round(pageSize.w)} x ${Math.round(pageSize.h)} page`)
      : tr("ยังไม่มีกรอบ ลากคลุมส่วนที่ต้องการเก็บไว้", "No frame yet, drag over the part you want to keep");
    pagesBar.replaceChildren(...Array.from({ length: pageCount }, (_, i) =>
      el("button", { class: "cr-pg" + (i === cur ? " on" : ""), type: "button",
        onclick: () => showPage(i),
        "aria-label": tr(`ไปหน้า ${i + 1}`, `Go to page ${i + 1}`) }, String(i + 1))));
  }

  const rel = (ev) => {
    const r = layer.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)),
             y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)) };
  };
  let start = null;
  layer.addEventListener("pointerdown", (ev) => {
    if (!pdf) return;
    ev.preventDefault();
    start = rel(ev);
    layer.setPointerCapture(ev.pointerId);
  });
  layer.addEventListener("pointermove", (ev) => {
    if (!start) return;
    const p = rel(ev);
    crop = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y),
             w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
    draw();
  });
  const endDrag = () => {
    if (!start) return;
    start = null;
    if (crop && (crop.w < 0.02 || crop.h < 0.02)) crop = null;   // ลากสั้นเกินไปมักเป็นการคลิกพลาด
    draw();
    refresh();
  };
  layer.addEventListener("pointerup", endDrag);
  layer.addEventListener("pointercancel", endDrag);

  function wantPage(i) {
    const v = applySel.value;
    if (v === "one") return i === cur;
    if (v === "odd") return i % 2 === 0;      // หน้า 1, 3, 5 คือ index 0, 2, 4
    if (v === "even") return i % 2 === 1;
    return true;
  }

  async function run() {
    if (!file || !crop) return;
    results.innerHTML = "";
    go.disabled = true;
    ws.setBusy(true);
    st.begin();
    st.info(tr("กำลังครอบตัด…", "Cropping…"));
    try {
      const { doc } = await loadPdfLib(file);
      const pages = doc.getPages();
      let done = 0;
      for (let i = 0; i < pages.length; i++) {
        if (st.cancelled) break;
        if (!wantPage(i)) continue;
        const p = pages[i];
        /* ‼️ ต้องอิงกรอบเดิมของหน้านั้น ไม่ใช่ mediabox เสมอไป
           ไฟล์ที่เคยถูกครอบตัดมาก่อนมี cropbox เล็กกว่า mediabox อยู่แล้ว
           ถ้าคิดจาก mediabox กรอบใหม่จะเลื่อนไปคนละที่กับที่ผู้ใช้เห็นบนจอ */
        const cb = p.getCropBox ? p.getCropBox() : null;
        const bx = cb ? cb.x : 0, by = cb ? cb.y : 0;
        const bw = cb ? cb.width : p.getWidth(), bh = cb ? cb.height : p.getHeight();
        /* แกน y ของ PDF นับจากล่างขึ้นบน ส่วนกรอบที่ผู้ใช้ลากนับจากบนลงล่าง ต้องกลับแกน */
        const x = bx + crop.x * bw;
        const y = by + (1 - crop.y - crop.h) * bh;
        p.setCropBox(x, y, crop.w * bw, crop.h * bh);
        done++;
        st.progress(((i + 1) / pages.length) * 100, `(${i + 1}/${pages.length})`);
        await yieldToBrowser();
      }
      st.end();
      const blob = new Blob([await doc.save()], { type: "application/pdf" });
      const name = stripExt(file.name) + tr("-ครอบตัด.pdf", "-cropped.pdf");
      st.progress(null);
      st.ok(tr(`ครอบตัด ${done} หน้าเรียบร้อย`, `Cropped ${pl(done, "page", "pages")}`));
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name),
          el("small", {}, tr(`ครอบตัด ${done} จาก ${pageCount} หน้า, ${fmtBytes(blob.size)}`,
                             `${done} of ${pl(pageCount, "page", "pages")} cropped, ${fmtBytes(blob.size)}`))]),
        downloadButton(blob, name),
      ]));
    } catch (e) {
      st.end();
      st.progress(null);
      st.err(friendlyPdfError(e, file && file.name).message);
    } finally {
      go.disabled = false;
      ws.setBusy(false);
    }
  }

  return ws.wrap;
}
