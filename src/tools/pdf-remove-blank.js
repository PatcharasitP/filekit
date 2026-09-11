// ── ลบหน้าว่างออกจาก PDF ───────────────────────────────────────────────────
// สแกนเอกสารสองหน้าด้วยเครื่องถ่ายเอกสาร แล้วได้ไฟล์ที่หน้าคู่เป็นกระดาษเปล่าหมด
// เป็นเรื่องปกติมากในออฟฟิศไทย (เครื่องสแกนตั้งโหมด 2 หน้าไว้ แต่ต้นฉบับพิมพ์หน้าเดียว)
// เดิมต้องเปิดโปรแกรมแล้วไล่ลบทีละหน้า 40 หน้าก็ 40 ครั้ง
//
// ‼️ "หน้าว่าง" จากการสแกนไม่ใช่สีขาวบริสุทธิ์ — มีจุดรบกวน เงาขอบกระดาษ และแถบดำ
//    ริมขอบจากฝาเครื่องสแกน จึงวัดแบบ "นับพิกเซลที่เข้มกว่าเกณฑ์ เฉพาะพื้นที่ตรงกลาง"
//    ไม่ใช่เทียบกับสีขาวตรง ๆ · และให้ผู้ใช้กดสลับเองได้ทุกหน้าเสมอ
//    เพราะเครื่องเดาผิดได้ และการลบหน้าเอกสารทิ้งเป็นเรื่องที่ผิดแล้วเจ็บ
import { openPdf, passwordBox, loadPdfLib } from "../pdfopen.js";
import { el, dropzone, statusBar, button, field, select, downloadButton,
         stripExt, yieldToBrowser, fmtBytes } from "../ui.js";
import { workspace } from "../workspace.js";
import { tr } from "../i18n.js";

/* ความละเอียดตอนตรวจ — ต่ำพอให้เร็ว (ไฟล์ 100 หน้าไม่ค้าง) แต่พอเห็นตัวอักษรเล็ก */
const SCAN_SCALE = 0.45;
/* พิกเซลที่เข้มกว่านี้นับเป็น "หมึก" — กระดาษสแกนจริงอยู่ราว 235 ถึง 250 ไม่ใช่ 255 */
const INK_LEVEL = 205;
/* เว้นขอบรอบนอกไม่นับ — เงาขอบกระดาษกับแถบดำจากฝาเครื่องสแกนอยู่ตรงนี้ทั้งหมด */
const EDGE_SKIP = 0.045;

/* เกณฑ์สัดส่วนหมึกที่ถือว่า "ยังว่างอยู่" — ให้เลือกได้เพราะเอกสารแต่ละแบบไม่เหมือนกัน */
const LEVELS = {
  loose:  { pct: 0.0008, label: () => tr("ผ่อนปรน (เหลือหน้าที่มีรอยจาง ๆ ไว้)", "Lenient (keeps pages with faint marks)") },
  normal: { pct: 0.0025, label: () => tr("ปกติ แนะนำ", "Normal, recommended") },
  strict: { pct: 0.0080, label: () => tr("เข้มงวด (ลบหน้าที่มีแค่เลขหน้าหรือเส้นบาง)", "Strict (also removes pages with just a number or a thin line)") },
};

const STYLE = `
.rb-ink{position:absolute;inset-block-end:5px;inset-inline-start:5px;background:rgba(0,0,0,.65);
  color:#fff;font-size:10.5px;padding:1px 6px;border-radius:99px;font-variant-numeric:tabular-nums}
.pg.rb-blank{opacity:.42;border-style:dashed}
.pg.rb-blank .rb-tag{background:var(--err,#c62828)}
.rb-tag{position:absolute;inset-block-start:5px;inset-inline-end:5px;background:var(--ok,#2e7d32);
  color:#fff;font-size:10.5px;padding:1px 7px;border-radius:99px}
`;

export function mount(tool) {
  const pagesGrid = el("div", { class: "pages" });
  const st = statusBar();
  const results = el("div", { class: "results" });
  const extra = el("div", {});

  const levelSel = select(Object.entries(LEVELS).map(([k, v]) => [k, v.label()]), "normal");
  const summary = el("div", { class: "stats" });

  let file = null;
  let items = [];       // [{ n, ink, blank, canvas }]

  const dz = dropzone({
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "a PDF file"),
    accept: "application/pdf,.pdf", multiple: false,
    hint: tr("ครั้งละ 1 ไฟล์", "One file at a time"),
    onChange: onFile,
  });

  const go = button(tr("บันทึกไฟล์ที่ตัดหน้าว่างออกแล้ว", "Save without the blank pages"), { onclick: run });

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์", "File"), node: dz.container },
    right: { title: tr("ตัวเลือก", "Options"), node: el("div", {}, [
      field(tr("ความเข้มงวดในการตัดสิน", "How strict"), levelSel,
            tr("เปลี่ยนแล้วดูผลได้ทันที ไม่ต้องอ่านไฟล์ใหม่", "Change it and see the result at once, no re-reading")),
      summary,
      el("div", { class: "note" },
         tr("กดที่หน้าไหนก็ได้เพื่อสลับเก็บหรือลบเอง เครื่องเดาผิดได้เสมอ",
            "Click any page to keep or drop it yourself. The guess can be wrong")),
    ]) },
    center: { node: pagesGrid, empty: tr("ยังไม่มีไฟล์ เลือก PDF เพื่อดูตัวอย่าง", "No file yet. Choose a PDF to preview") },
    footer: [go, st.node],
  });
  ws.wrap.appendChild(el("style", {}, STYLE));
  ws.wrap.appendChild(extra);
  ws.wrap.appendChild(results);

  levelSel.onchange = () => { applyLevel(); render(); };

  /** สัดส่วนพิกเซลที่เป็นหมึก เฉพาะพื้นที่ตรงกลาง (เว้นขอบ) */
  function inkRatio(canvas) {
    const w = canvas.width, h = canvas.height;
    const x0 = Math.floor(w * EDGE_SKIP), x1 = Math.ceil(w * (1 - EDGE_SKIP));
    const y0 = Math.floor(h * EDGE_SKIP), y1 = Math.ceil(h * (1 - EDGE_SKIP));
    const d = canvas.getContext("2d").getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let ink = 0;
    const total = (x1 - x0) * (y1 - y0);
    for (let i = 0; i < d.length; i += 4) {
      // ‼️ พิกเซลโปร่งใสต้องนับเป็นกระดาษขาว ไม่ใช่หมึก — หน้าที่ไม่ได้ทาพื้นจะ alpha=0
      //    ถ้าไม่กันไว้ หน้าว่างสนิทจะถูกนับเป็นหมึก 100% แล้วไม่มีหน้าไหนถูกตัดเลย
      if (d[i + 3] < 8) continue;
      if ((d[i] + d[i + 1] + d[i + 2]) / 3 < INK_LEVEL) ink++;
    }
    return total ? ink / total : 0;
  }

  function applyLevel() {
    const cut = LEVELS[levelSel.value].pct;
    for (const it of items) it.blank = it.ink < cut;
  }

  async function onFile() {
    file = dz.files[0] || null;
    items = [];
    pagesGrid.innerHTML = "";
    summary.innerHTML = "";
    results.innerHTML = "";
    st.clear();
    if (!file) { ws.showCanvas(false); return; }
    try {
      st.info(tr("กำลังอ่านและตรวจทีละหน้า…", "Reading and checking each page…"));
      st.begin();
      const pdf = await openPdf(file, passwordBox(extra));
      for (let n = 1; n <= pdf.numPages; n++) {
        if (st.cancelled) break;
        const page = await pdf.getPage(n);
        const vp = page.getViewport({ scale: SCAN_SCALE });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(vp.width));
        canvas.height = Math.max(1, Math.floor(vp.height));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        page.cleanup();
        items.push({ n, ink: inkRatio(canvas), blank: false, canvas });
        st.progress((n / pdf.numPages) * 100, `(${n}/${pdf.numPages})`);
        await yieldToBrowser();
      }
      st.end();
      st.progress(null);
      if (!items.length) throw new Error(tr("ไม่พบหน้าในไฟล์นี้", "No pages found in this file"));
      applyLevel();
      ws.showCanvas(true);
      render();
    } catch (e) {
      st.end();
      st.progress(null);
      items = [];
      ws.showCanvas(false);
      st.err(tr("อ่านไฟล์ไม่สำเร็จ: ", "Could not read the file: ") + e.message);
    }
  }

  function render() {
    pagesGrid.innerHTML = "";
    for (const it of items) {
      const card = el("div", {
        class: "pg" + (it.blank ? " rb-blank" : ""),
        role: "button", tabindex: "0",
        "aria-pressed": String(!it.blank),
        "aria-label": it.blank
          ? tr(`หน้า ${it.n} จะถูกตัดออก กดเพื่อเก็บไว้`, `Page ${it.n} will be dropped. Click to keep it`)
          : tr(`หน้า ${it.n} จะถูกเก็บไว้ กดเพื่อตัดออก`, `Page ${it.n} will be kept. Click to drop it`),
        onclick: () => { it.blank = !it.blank; render(); },
        onkeydown: (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); it.blank = !it.blank; render(); }
        },
      }, [
        it.canvas,
        el("span", { class: "num" }, String(it.n)),
        el("span", { class: "rb-tag" }, it.blank ? tr("ตัดออก", "Drop") : tr("เก็บไว้", "Keep")),
        el("span", { class: "rb-ink" }, `${(it.ink * 100).toFixed(2)}%`),
      ]);
      pagesGrid.appendChild(card);
    }
    const drop = items.filter((i) => i.blank).length;
    const keep = items.length - drop;
    summary.innerHTML = "";
    const chip = (cls, text) => summary.appendChild(el("span", { class: "stat " + cls }, text));
    chip("ok", tr(`เก็บไว้ ${keep} หน้า`, `${keep} pages kept`));
    chip(drop ? "bad" : "dim", tr(`ตัดออก ${drop} หน้า`, `${drop} dropped`));
    go.disabled = !drop || !keep;
    if (!drop) st.info(tr("ไม่เจอหน้าว่างเลยที่ความเข้มงวดนี้ ลองเลือกเข้มงวดขึ้น",
                          "No blank page found at this setting. Try a stricter one"));
    else if (!keep) st.err(tr("ตั้งค่านี้ตัดออกทุกหน้า ลองเลือกผ่อนปรนลง",
                              "This setting drops every page. Try a more lenient one"));
    else st.clear();
  }

  async function run() {
    if (!file || !items.length) return st.err(tr("เลือกไฟล์ PDF ก่อน", "Choose a PDF file first"));
    const keep = items.filter((i) => !i.blank).map((i) => i.n);
    if (!keep.length) return st.err(tr("ต้องเหลืออย่างน้อย 1 หน้า", "At least one page must be kept"));
    results.innerHTML = "";
    go.disabled = true;
    ws.setBusy(true);
    st.info(tr("กำลังบันทึกไฟล์…", "Saving the file…"));
    try {
      const { PDFDocument } = PDFLib;
      const { doc } = await loadPdfLib(file);
      const out = await PDFDocument.create();
      // ‼️ copyPages รับดัชนีฐาน 0 ส่วนเลขหน้าที่โชว์ให้ผู้ใช้เป็นฐาน 1
      const copied = await out.copyPages(doc, keep.map((n) => n - 1));
      copied.forEach((p) => out.addPage(p));
      const blob = new Blob([await out.save()], { type: "application/pdf" });
      const name = stripExt(file.name) + tr("-ตัดหน้าว่าง.pdf", "-no-blanks.pdf");
      const dropped = items.length - keep.length;
      st.ok(tr(`ตัดหน้าว่างออก ${dropped} หน้า เหลือ ${keep.length} หน้า`,
               `Dropped ${dropped} blank pages, ${keep.length} left`));
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name),
          el("small", {}, tr(`${keep.length} หน้า จากเดิม ${items.length} หน้า`,
                             `${keep.length} pages, down from ${items.length}`))]),
        el("span", { class: "r-size" }, fmtBytes(blob.size)),
        downloadButton(blob, name),
      ]));
    } catch (e) {
      st.err(tr("บันทึกไม่สำเร็จ: ", "Could not save: ") + e.message);
    } finally {
      go.disabled = false;
      ws.setBusy(false);
    }
  }

  return ws.wrap;
}
