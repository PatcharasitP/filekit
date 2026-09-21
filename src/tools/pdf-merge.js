import { loadPdfLib, ENCRYPTED_WARNING, HIDDEN_LAYERS_WARNING } from "../pdfopen.js";
import { el, dropzone, toolShell, statusBar, button, downloadButton, stripExt, yieldToBrowser, fmtBytes, field, select } from "../ui.js";
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

  /* ‼️ โหมดสลับหน้า สำหรับคนที่สแกนสองหน้าด้วยเครื่องป้อนกระดาษที่สแกนได้ทีละด้าน
   * วิธีที่คนทำกันจริงคือสแกนด้านหน้าทั้งปึกเป็นไฟล์หนึ่ง แล้วพลิกทั้งปึกสแกนอีกรอบเป็นไฟล์สอง
   * ผลคือได้ไฟล์หน้าคี่ 1,3,5,7 กับไฟล์หน้าคู่ ซึ่ง **มักเรียงกลับหลัง** เป็น 8,6,4,2
   * เพราะการพลิกปึกทำให้แผ่นสุดท้ายขึ้นมาอยู่บนสุด
   * ถ้าเอามาต่อกันตรง ๆ จะได้ 1,3,5,7,8,6,4,2 ซึ่งอ่านไม่ได้เลย */
  const modeSel = select([
    ["join", tr("ต่อกันตามลำดับไฟล์", "One after another")],
    ["alt", tr("สลับหน้าจาก 2 ไฟล์ (สแกนหน้า-หลังแยกกัน)", "Interleave two files (front and back scanned separately)")],
  ], "join");
  const backSel = select([
    ["reverse", tr("เรียงกลับหลัง (พลิกทั้งปึกแล้วสแกน)", "Reversed, the whole stack was flipped")],
    ["forward", tr("เรียงตามปกติ", "In normal order")],
  ], "reverse");
  const backField = field(tr("ไฟล์ที่สอง (ด้านหลัง) เรียงยังไง", "How is the second file ordered"), backSel);
  backField.hidden = true;
  const altNote = el("div", { class: "note", hidden: true },
    tr("ไฟล์แรกคือด้านหน้า (หน้า 1, 3, 5) ไฟล์ที่สองคือด้านหลัง ผลลัพธ์จะเรียงเป็น 1, 2, 3, 4 ให้อัตโนมัติ",
       "The first file is the front sides (pages 1, 3, 5) and the second is the backs. The result is ordered 1, 2, 3, 4 for you"));
  modeSel.onchange = () => {
    const alt = modeSel.value === "alt";
    backField.hidden = !alt;
    altNote.hidden = !alt;
    go.textContent = alt ? tr("สลับหน้าแล้วรวม", "Interleave and merge") : tr("รวมไฟล์", "Merge");
  };

  const go = button(tr("รวมไฟล์", "Merge"), { onclick: run });

  body.append(dz.container,
    field(tr("วิธีรวม", "How to merge"), modeSel), backField, altNote,
    el("div", { class: "actions" }, [go]), st.node, results);
  body.appendChild(el("div", { class: "note" },
    tr("บุ๊กมาร์กและฟอร์มจากไฟล์ต้นทางอาจไม่ถูกคัดลอกมาทั้งหมด",
       "Bookmarks and form fields from source files may not all carry over")));

  async function run() {
    const files = dz.files;
    if (files.length < 2) return st.err(tr("เลือกอย่างน้อย 2 ไฟล์", "Choose at least 2 files"));
    if (modeSel.value === "alt" && files.length !== 2)
      return st.err(tr("โหมดสลับหน้าใช้กับ 2 ไฟล์เท่านั้น คือด้านหน้ากับด้านหลัง",
                       "Interleaving works with exactly two files, the fronts and the backs"));
    results.innerHTML = "";
    go.disabled = true;
    st.info(tr("กำลังรวมไฟล์…", "Merging files…"));
    try {
      const { PDFDocument } = PDFLib;
      const out = await PDFDocument.create();
      let sawEncrypted = false, sawHiddenLayers = false;

      if (modeSel.value === "alt") {
        /* สลับหน้าจาก 2 ไฟล์: หน้าแรกของไฟล์หน้า, หน้าแรกของไฟล์หลัง, หน้าสองของไฟล์หน้า, ...
           ‼️ ไฟล์ด้านหลังมักเรียงกลับ จึงกลับลำดับก่อนสลับ (ค่าเริ่มต้นคือกลับ เพราะเป็นเคสที่เจอบ่อยกว่า) */
        const a = await loadPdfLib(files[0]);
        const b = await loadPdfLib(files[1]);
        if (a.encrypted || b.encrypted) sawEncrypted = true;
        if (a.hiddenLayers || b.hiddenLayers) sawHiddenLayers = true;
        const ai = a.doc.getPageIndices();
        const bi = b.doc.getPageIndices();
        if (backSel.value === "reverse") bi.reverse();
        const copiedA = await out.copyPages(a.doc, ai);
        const copiedB = await out.copyPages(b.doc, bi);
        const n = Math.max(copiedA.length, copiedB.length);
        for (let i = 0; i < n; i++) {
          if (copiedA[i]) out.addPage(copiedA[i]);
          if (copiedB[i]) out.addPage(copiedB[i]);
          st.progress(((i + 1) / n) * 100, `(${i + 1}/${n})`);
          await yieldToBrowser();
        }
      } else {
      for (let i = 0; i < files.length; i++) {
        const { doc: src, encrypted, hiddenLayers } = await loadPdfLib(files[i]);
        if (encrypted) sawEncrypted = true;
        if (hiddenLayers) sawHiddenLayers = true;
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
        st.progress(((i + 1) / files.length) * 100, `(${i + 1}/${files.length})`);
        await yieldToBrowser(); // คืนคิวให้จอวาด ไม่ให้ค้างตอนไฟล์เยอะ
      }
      }
      const blob = new Blob([await out.save()], { type: "application/pdf" });
      st.progress(null);
      st.ok(tr(`รวมเสร็จ ${out.getPageCount()} หน้า จาก ${files.length} ไฟล์`, `Done, ${pl(out.getPageCount(), "page", "pages")} from ${pl(files.length, "file", "files")}`));
      if (sawEncrypted) results.appendChild(el("div", { class: "status show err" }, ENCRYPTED_WARNING));
      // ‼️ ชั้นที่ผู้ใช้ซ่อนไว้จะกลายเป็นมองเห็นได้ในไฟล์ผลลัพธ์ ต้องบอกก่อนไฟล์หลุดไป
      if (sawHiddenLayers) results.appendChild(el("div", { class: "note warn" }, HIDDEN_LAYERS_WARNING));
      const name = stripExt(files[0].name) + (modeSel.value === "alt"
        ? tr("-สลับหน้าแล้ว.pdf", "-interleaved.pdf") : tr("-รวม.pdf", "-merged.pdf"));
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
