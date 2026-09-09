import { el, dropzone, toolShell, statusBar, button, field, select, downloadButton,
         stripExt, yieldToBrowser } from "../ui.js";
import { pageLines, guessColumns, rowToCells } from "../pdftext.js";
import { openPdf, passwordBox } from "../pdfopen.js";
import { ocrPdf, hasTextLayer } from "../ocr.js";
import { tr } from "../i18n.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  const preview = el("div", { class: "preview-text", hidden: true });
  const extra = el("div", {});
  let file = null;

  const dz = dropzone({
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "PDF file"),
    accept: "application/pdf,.pdf", multiple: false, hint: tr("ครั้งละ 1 ไฟล์", "One file at a time"),
    onChange: (f) => { file = f[0] || null; st.clear(); results.innerHTML = ""; extra.innerHTML = ""; preview.hidden = true; },
  });

  const sheetMode = select([["per-page", tr("แยกชีทตามหน้า", "Separate sheet per page")], ["single", tr("รวมทุกหน้าในชีทเดียว", "Combine all pages into one sheet")]], "per-page");
  const strict = select([["3", tr("ปกติ (≥3 บรรทัด)", "Normal (≥3 lines)")], ["2", tr("ยืดหยุ่น (≥2 บรรทัด)", "Flexible (≥2 lines)")], ["5", tr("เข้มงวด (≥5 บรรทัด)", "Strict (≥5 lines)")]], "3");
  const go = button(tr("แปลงเป็น Excel", "Convert to Excel"), { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [field(tr("การจัดชีท", "Sheet layout"), sheetMode), field(tr("ความเข้มในการจับคอลัมน์", "Column-detection strictness"), strict, tr("ถ้าคอลัมน์เพี้ยน ลองสลับค่านี้", "If columns look wrong, try changing this"))]),
    el("div", { class: "actions" }, [go]), st.node, extra, results, preview);
  body.appendChild(el("div", { class: "note" },
    tr("เดาคอลัมน์จากข้อความจริง, เซลล์ผสานอาจเพี้ยน, ใช้ได้เฉพาะไฟล์มีชั้นข้อความ",
       "Guesses columns from real text, merged cells may look off, text-layer files only")));

  async function runOcr(pdf) {
    extra.innerHTML = "";
    go.disabled = true;
    st.info(tr("กำลังเตรียมตัวอ่าน OCR…", "Getting OCR ready…"));
    try {
      const pages = await ocrPdf(pdf, {
        onProgress: (p) => {
          if (p.phase === "page") st.info(tr(`กำลังอ่านหน้า ${p.current}/${p.total} ด้วย OCR…`, `Reading page ${p.current}/${p.total} with OCR…`));
          else if (p.phase === "read") st.progress(p.ratio * 100);
        },
      });
      const wb = XLSX.utils.book_new();
      let rows = 0;
      for (const pg of pages) {
        const aoa = pg.lines.map((l) => l.split(/\s{2,}|\t+/).map((c) => c.trim()));
        if (!aoa.length) continue;
        rows += aoa.length;
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), tr(`หน้า ${pg.page}`, `Page ${pg.page}`));
      }
      if (!wb.SheetNames.length) throw new Error(tr("อ่านไม่พบข้อความในไฟล์นี้เลย", "No text was found in this file"));
      const blob = new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })],
        { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      st.progress(null);
      st.ok(tr(`อ่านด้วย OCR สำเร็จ ${rows.toLocaleString("th-TH")} แถว, ${wb.SheetNames.length} ชีท`,
               `OCR done, ${rows.toLocaleString("en-US")} rows, ${wb.SheetNames.length} sheets`));
      const name = stripExt(file.name) + ".xlsx";
      results.innerHTML = "";
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, tr("ควรตรวจทาน (OCR)", "OCR (please review)"))]),
        downloadButton(blob, name),
      ]));
    } catch (e) {
      st.progress(null); st.err(tr("อ่านด้วย OCR ไม่สำเร็จ: ", "OCR reading failed: ") + e.message);
    } finally { go.disabled = false; pdf.destroy(); }
  }

  async function run() {
    if (!file) return st.err(tr("กรุณาเลือกไฟล์ PDF ก่อน", "Please choose a PDF file first"));
    results.innerHTML = ""; extra.innerHTML = ""; preview.hidden = true;
    go.disabled = true;
    st.info(tr("กำลังเปิดไฟล์…", "Opening the file…"));
    try {
      const pdf = await openPdf(file, passwordBox(extra));
      if (!(await hasTextLayer(pdf))) {
        st.progress(null);
        st.info(tr("ไฟล์นี้ไม่มีชั้นข้อความ (น่าจะเป็นไฟล์สแกน)", "This file has no text layer (it's probably a scan)"));
        extra.appendChild(el("div", { class: "panel" }, [
          el("div", { class: "note", style: { marginTop: "0" } },
            tr("OCR อ่านตัวเลข/ข้อความแล้วจัดเป็นแถว, โหลดชุดภาษาครั้งแรก ~10-30 MB, อาจต้องจัดคอลัมน์เพิ่มเอง",
               "OCR reads numbers and text into rows, first time downloads ~10-30 MB, columns may need manual tidying")),
          el("div", { class: "actions" }, [
            button(tr("อ่านด้วย OCR", "Read with OCR"), { onclick: () => runOcr(pdf) }),
            button(tr("ยกเลิก", "Cancel"), { ghost: true, onclick: () => { extra.innerHTML = ""; st.clear(); pdf.destroy(); } }),
          ]),
        ]));
        go.disabled = false;
        return;
      }
      st.info(tr("กำลังอ่านตาราง…", "Reading the table…"));
      const wb = XLSX.utils.book_new();
      const all = [];
      let totalRows = 0;

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const rows = await pageLines(page);
        page.cleanup();
        const cols = guessColumns(rows, +strict.value);
        const aoa = rows
          .map((r) => (cols.length > 1 ? rowToCells(r, cols) : [r.items.map((i) => i.str).join(" ")]))
          .filter((cells) => cells.some((c) => c !== ""));
        totalRows += aoa.length;

        if (sheetMode.value === "per-page") {
          if (aoa.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), tr(`หน้า ${p}`, `Page ${p}`));
        } else {
          if (p > 1 && aoa.length) all.push([]);
          all.push(...aoa);
        }
        st.progress((p / pdf.numPages) * 100, `(${p}/${pdf.numPages})`);
        await yieldToBrowser();
      }
      pdf.destroy();

      if (sheetMode.value === "single") {
        if (!all.length) throw new Error(tr("อ่านไม่พบข้อความในไฟล์นี้เลย", "No text was found in this file"));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(all), tr("ข้อมูล", "Data"));
      }
      if (!wb.SheetNames.length) throw new Error(tr("อ่านไม่พบข้อความในไฟล์นี้เลย", "No text was found in this file"));

      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      st.progress(null);
      st.ok(tr(`แปลงสำเร็จ ${totalRows.toLocaleString("th-TH")} แถว, ${wb.SheetNames.length} ชีท`,
               `Done, ${totalRows.toLocaleString("en-US")} rows, ${wb.SheetNames.length} sheets`));

      const sample = (sheetMode.value === "single" ? all : XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })).slice(0, 12);
      preview.hidden = false;
      preview.textContent = sample.map((r) => r.join(" | ")).join("\n") || tr("(ไม่มีข้อมูลตัวอย่าง)", "(no sample data)");

      const name = stripExt(file.name) + ".xlsx";
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, tr(`${wb.SheetNames.length} ชีท`, `${wb.SheetNames.length} sheets`))]),
        downloadButton(blob, name),
      ]));
    } catch (e) {
      st.progress(null);
      st.err(tr("แปลงไม่สำเร็จ: ", "Could not convert: ") + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
