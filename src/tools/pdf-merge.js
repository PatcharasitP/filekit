import { loadPdfLib, ENCRYPTED_WARNING, HIDDEN_LAYERS_WARNING } from "../pdfopen.js";
import { el, dropzone, toolShell, statusBar, button, downloadButton, stripExt, yieldToBrowser, fmtBytes } from "../ui.js";
import { tr, pl } from "../i18n.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });

  const dz = dropzone({
    accept: "application/pdf,.pdf",
    reorder: true,
    hint: tr("หลายไฟล์ได้, ลากสลับลำดับ", "Multiple files, drag to reorder"),
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "PDF files"),
    onChange: () => { st.clear(); results.innerHTML = ""; },
  });

  const go = button(tr("รวมไฟล์", "Merge"), { onclick: run });

  body.append(dz.container, el("div", { class: "actions" }, [go]), st.node, results);
  body.appendChild(el("div", { class: "note" },
    tr("บุ๊กมาร์กและฟอร์มจากไฟล์ต้นทางอาจไม่ถูกคัดลอกมาทั้งหมด",
       "Bookmarks and form fields from source files may not all carry over")));

  async function run() {
    const files = dz.files;
    if (files.length < 2) return st.err(tr("เลือกอย่างน้อย 2 ไฟล์", "Choose at least 2 files"));
    results.innerHTML = "";
    go.disabled = true;
    st.info(tr("กำลังรวมไฟล์…", "Merging files…"));
    try {
      const { PDFDocument } = PDFLib;
      const out = await PDFDocument.create();
      let sawEncrypted = false, sawHiddenLayers = false;
      for (let i = 0; i < files.length; i++) {
        const { doc: src, encrypted, hiddenLayers } = await loadPdfLib(files[i]);
        if (encrypted) sawEncrypted = true;
        if (hiddenLayers) sawHiddenLayers = true;
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
        st.progress(((i + 1) / files.length) * 100, `(${i + 1}/${files.length})`);
        await yieldToBrowser(); // คืนคิวให้จอวาด ไม่ให้ค้างตอนไฟล์เยอะ
      }
      const blob = new Blob([await out.save()], { type: "application/pdf" });
      st.progress(null);
      st.ok(tr(`รวมเสร็จ ${out.getPageCount()} หน้า จาก ${files.length} ไฟล์`, `Done, ${pl(out.getPageCount(), "page", "pages")} from ${pl(files.length, "file", "files")}`));
      if (sawEncrypted) results.appendChild(el("div", { class: "status show err" }, ENCRYPTED_WARNING));
      // ‼️ ชั้นที่ผู้ใช้ซ่อนไว้จะกลายเป็นมองเห็นได้ในไฟล์ผลลัพธ์ ต้องบอกก่อนไฟล์หลุดไป
      if (sawHiddenLayers) results.appendChild(el("div", { class: "note warn" }, HIDDEN_LAYERS_WARNING));
      const name = stripExt(files[0].name) + tr("-รวม.pdf", "-merged.pdf");
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, tr(`${out.getPageCount()} หน้า`, `${pl(out.getPageCount(), "page", "pages")}`))]),
        el("span", { class: "r-size" }, fmtBytes(blob.size)),
        downloadButton(blob, name),
      ]));
    } catch (e) {
      st.progress(null);
      st.err(tr("รวมไฟล์ไม่สำเร็จ: ", "Could not merge files: ") + e.message);
    } finally {
      go.disabled = false;
    }
  }
  return wrap;
}
