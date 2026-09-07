import { loadPdfLib, ENCRYPTED_WARNING } from "../pdfopen.js";
import { el, dropzone, toolShell, statusBar, button, download, stripExt, yieldToBrowser } from "../ui.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });

  const dz = dropzone({
    accept: "application/pdf,.pdf",
    reorder: true,
    hint: "เลือกได้หลายไฟล์ · ลากแถวเพื่อสลับลำดับก่อนรวม",
    expect: ["pdf"], expectLabel: "ไฟล์ PDF",
    onChange: () => { st.clear(); results.innerHTML = ""; },
  });

  const go = button("🔗 รวมเป็นไฟล์เดียว", { onclick: run });

  body.append(dz.container, el("div", { class: "actions" }, [go]), st.node, results);
  body.appendChild(el("div", { class: "note" },
    "ลำดับหน้าในไฟล์ผลลัพธ์จะเรียงตามลำดับไฟล์ด้านบน · บุ๊กมาร์กและฟอร์มของไฟล์ต้นทางอาจไม่ถูกคัดลอกมาทั้งหมด"));

  async function run() {
    const files = dz.files;
    if (files.length < 2) return st.err("ต้องเลือกอย่างน้อย 2 ไฟล์จึงจะรวมได้");
    results.innerHTML = "";
    go.disabled = true;
    st.info("กำลังรวมไฟล์…");
    try {
      const { PDFDocument } = PDFLib;
      const out = await PDFDocument.create();
      let sawEncrypted = false;
      for (let i = 0; i < files.length; i++) {
        const { doc: src, encrypted } = await loadPdfLib(files[i]);
        if (encrypted) sawEncrypted = true;
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
        st.progress(((i + 1) / files.length) * 100, `(${i + 1}/${files.length})`);
        await yieldToBrowser(); // คืนคิวให้จอวาด ไม่ให้ค้างตอนไฟล์เยอะ
      }
      const blob = new Blob([await out.save()], { type: "application/pdf" });
      st.progress(null);
      st.ok(`รวมเสร็จ ${out.getPageCount()} หน้า จาก ${files.length} ไฟล์`);
      if (sawEncrypted) results.appendChild(el("div", { class: "status show err" }, ENCRYPTED_WARNING));
      const name = stripExt(files[0].name) + "-รวม.pdf";
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, `${out.getPageCount()} หน้า`)]),
        button("⬇ ดาวน์โหลด", { onclick: () => download(blob, name) }),
      ]));
    } catch (e) {
      st.progress(null);
      st.err("รวมไฟล์ไม่สำเร็จ: " + e.message);
    } finally {
      go.disabled = false;
    }
  }
  return wrap;
}
