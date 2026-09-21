// ── เปลี่ยนขนาดกระดาษของ PDF ───────────────────────────────────────────────
// เจอบ่อยกับเอกสารที่ได้มาจากต่างประเทศเป็น Letter แต่เครื่องพิมพ์ไทยใส่ A4
// พิมพ์ออกมาแล้วขอบเบี้ยวหรือเนื้อหาโดนตัด ต้องมานั่งปรับที่หน้าต่างพิมพ์ทุกครั้ง
//
// ‼️ ข้อความยังค้นหาและคัดลอกได้ เพราะวางหน้าเดิมลงกระดาษใหม่ ไม่ได้แปลงเป็นภาพ
//   (พิสูจน์แล้ว 21/09/2026: A4 เป็น Letter 612x792 ข้อความยังค้นได้ครบ)
import { loadPdfLib, friendlyPdfError, passwordBox } from "../pdfopen.js";
import { el, dropzone, statusBar, button, field, select, downloadButton,
         stripExt, yieldToBrowser, fmtBytes } from "../ui.js";
import { workspace } from "../workspace.js";
import { PAPER, imposeSheets } from "../pdfimpose.js";
import { tr, pl } from "../i18n.js";

const STYLE = `
.rs-stage{display:flex;flex-direction:column;gap:16px;margin:auto;width:100%;max-width:460px;text-align:center}
.rs-stage[hidden]{display:none}
.rs-compare{display:flex;gap:20px;align-items:flex-end;justify-content:center}
.rs-paper{position:relative;background:#fff;border:1px solid var(--line);border-radius:3px;box-shadow:var(--sh2)}
.rs-paper.after{border-color:var(--g-pdf);border-width:2px}
.rs-paper span{position:absolute;inset-block-end:-22px;inset-inline:0;text-align:center;
  font-size:12px;color:var(--text-mute);white-space:nowrap}
.rs-paper.after span{color:var(--g-pdf);font-weight:700}
.rs-meta{font-size:13.5px;line-height:1.6;color:var(--text-dim);margin-top:14px}
.rs-meta b{color:var(--text)}
.rs-note{font-size:12.5px;line-height:1.6;color:var(--text-mute);
  background:var(--bg-soft);border:1px solid var(--line-soft);border-radius:var(--r-sm);padding:9px 12px;text-align:start}
`;

export function mount(tool) {
  const st = statusBar();
  const results = el("div", { class: "results" });

  const paperSel = select([
    ...Object.entries(PAPER).map(([k, v]) => [k, v.label()]),
  ], "a4");
  const orientSel = select([
    ["keep", tr("ตามหน้าเดิม", "Match the original")],
    ["portrait", tr("แนวตั้ง", "Portrait")],
    ["landscape", tr("แนวนอน", "Landscape")],
  ], "keep");
  const fitSel = select([
    ["fit", tr("ย่อให้เห็นครบทั้งหน้า", "Fit the whole page")],
    ["fill", tr("ขยายเต็มกระดาษ (ขอบอาจถูกตัด)", "Fill the paper (edges may be cut)")],
  ], "fit");
  const marginSel = select([
    ["0", tr("ไม่มี", "None")],
    ["28", tr("1 ซม.", "1 cm")],
    ["57", tr("2 ซม. สำหรับเข้าเล่ม", "2 cm, for binding")],
  ], "0");

  const before = el("div", { class: "rs-paper" }, [el("span", {})]);
  const after = el("div", { class: "rs-paper after" }, [el("span", {})]);
  const meta = el("div", { class: "rs-meta" });
  const stage = el("div", { class: "rs-stage", hidden: true }, [
    el("div", { class: "rs-compare" }, [before, after]), meta,
  ]);

  const go = button(tr("เปลี่ยนขนาดแล้วบันทึก", "Resize and save"), { onclick: run });
  go.disabled = true;

  const dz = dropzone({
    accept: "application/pdf,.pdf", multiple: false,
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "a PDF file"),
    hint: tr("ครั้งละ 1 ไฟล์", "One file at a time"),
    onChange: onFile,
  });

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์", "File"), node: dz.container },
    right: { title: tr("ขนาดใหม่", "New size"), node: el("div", {}, [
      field(tr("ขนาดกระดาษ", "Paper size"), paperSel),
      field(tr("แนวกระดาษ", "Orientation"), orientSel),
      field(tr("วิธีจัดเนื้อหา", "How content fits"), fitSel),
      field(tr("เว้นขอบเพิ่ม", "Extra margin"), marginSel),
      el("div", { class: "rs-note" },
         tr("ข้อความยังค้นหาและคัดลอกได้เหมือนเดิม เพราะวางหน้าเดิมลงกระดาษใหม่ ไม่ได้แปลงเป็นภาพ",
            "Text stays searchable and copyable, because the original pages are placed onto new paper rather than turned into images")),
    ]) },
    center: { node: stage, empty: tr("เลือกไฟล์ PDF เพื่อเทียบขนาดก่อนกับหลัง", "Choose a PDF to compare the size before and after") },
    footer: [go, st.node],
  });
  ws.wrap.appendChild(el("style", {}, STYLE));
  ws.body.appendChild(results);

  let file = null, pageCount = 0, srcSize = null;

  async function onFile(fs) {
    file = fs[0] || null;
    results.innerHTML = "";
    st.clear();
    if (!file) { stage.hidden = true; ws.showCanvas(false); go.disabled = true; return; }
    try {
      st.info(tr("กำลังอ่านไฟล์…", "Reading the file…"));
      const { doc } = await loadPdfLib(file, passwordBox(ws.body));
      pageCount = doc.getPageCount();
      const p0 = doc.getPage(0).getSize();
      srcSize = { w: p0.width, h: p0.height };
      stage.hidden = false;
      ws.showCanvas(true);
      go.disabled = false;
      st.clear();
      preview();
    } catch (e) {
      stage.hidden = true; ws.showCanvas(false); go.disabled = true;
      st.err(friendlyPdfError(e, file.name).message);
    }
  }

  for (const c of [paperSel, orientSel, fitSel, marginSel]) c.onchange = preview;

  /** ขนาดกระดาษปลายทาง คิดจากขนาดที่เลือกบวกแนวกระดาษ */
  function target() {
    const p = PAPER[paperSel.value] || PAPER.a4;
    let landscape = orientSel.value === "landscape";
    /* ‼️ "ตามหน้าเดิม" ต้องดูจากหน้าแรกของไฟล์จริง ไม่ใช่เดาว่าเป็นแนวตั้งเสมอ
       ไฟล์สไลด์กับใบรับรองมักเป็นแนวนอน ถ้าบังคับเป็นแนวตั้งจะได้ขอบขาวมหาศาล */
    if (orientSel.value === "keep" && srcSize) landscape = srcSize.w > srcSize.h;
    return { w: landscape ? p.h : p.w, h: landscape ? p.w : p.h };
  }

  function preview() {
    if (!srcSize) return;
    const t = target();
    /* วาดกระดาษสองใบเทียบกันตามสัดส่วนจริง โดยใบที่สูงกว่าสูง 150px */
    const maxH = 150;
    const k = maxH / Math.max(srcSize.h, t.h);
    Object.assign(before.style, { width: srcSize.w * k + "px", height: srcSize.h * k + "px" });
    Object.assign(after.style, { width: t.w * k + "px", height: t.h * k + "px" });
    before.querySelector("span").textContent =
      tr(`เดิม ${Math.round(srcSize.w)} x ${Math.round(srcSize.h)}`,
         `Before ${Math.round(srcSize.w)} x ${Math.round(srcSize.h)}`);
    after.querySelector("span").textContent =
      tr(`ใหม่ ${Math.round(t.w)} x ${Math.round(t.h)}`,
         `After ${Math.round(t.w)} x ${Math.round(t.h)}`);

    const same = Math.abs(t.w - srcSize.w) < 1 && Math.abs(t.h - srcSize.h) < 1;
    meta.replaceChildren(
      el("b", {}, tr(`${pageCount} หน้า`, pl(pageCount, "page", "pages"))),
      el("div", {}, same
        ? tr("ขนาดใหม่เท่ากับขนาดเดิม เลือกขนาดอื่นถ้าต้องการเปลี่ยนจริง",
             "The new size matches the current one, pick another size to actually change it")
        : fitSel.value === "fill"
        ? tr("เนื้อหาจะถูกขยายจนเต็มกระดาษ ส่วนที่ล้นขอบจะถูกตัดออก",
             "Content is enlarged to fill the paper, anything past the edge is cut off")
        : tr("เนื้อหาจะถูกย่อให้เห็นครบทั้งหน้า ไม่มีอะไรหาย",
             "Content is scaled down so the whole page fits, nothing is lost")),
    );
  }

  async function run() {
    if (!file || !pageCount) return;
    results.innerHTML = "";
    go.disabled = true;
    ws.setBusy(true);
    st.begin();
    st.info(tr("กำลังเปลี่ยนขนาด…", "Resizing…"));
    try {
      const { PDFDocument } = PDFLib;
      const { doc: src } = await loadPdfLib(file, passwordBox(ws.body));
      const out = await PDFDocument.create();
      const embedded = await out.embedPages(src.getPages());
      const t = target();
      const margin = +marginSel.value || 0;
      const sheets = Array.from({ length: pageCount }, (_, i) => [i + 1]);
      await imposeSheets(out, embedded, sheets, {
        sheetW: t.w, sheetH: t.h, cols: 1, rows: 1,
        margin, gutter: 0, mode: fitSel.value,
        onSheet: async (i, n) => {
          st.progress((i / n) * 100, `(${i}/${n})`);
          await yieldToBrowser();
        },
      });
      st.end();
      const blob = new Blob([await out.save()], { type: "application/pdf" });
      const label = (PAPER[paperSel.value] || PAPER.a4).label();
      const name = stripExt(file.name) + tr(`-${label}.pdf`, `-${label}.pdf`);
      st.progress(null);
      st.ok(tr(`เปลี่ยนเป็น ${label} แล้ว ${pageCount} หน้า`,
               `Resized to ${label}, ${pl(pageCount, "page", "pages")}`));
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name),
          el("small", {}, tr(`${Math.round(t.w)} x ${Math.round(t.h)} พอยต์, ${fmtBytes(blob.size)}`,
                             `${Math.round(t.w)} x ${Math.round(t.h)} pt, ${fmtBytes(blob.size)}`))]),
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
