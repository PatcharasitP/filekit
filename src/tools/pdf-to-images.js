import { openPdf, passwordBox } from "../pdfopen.js";
import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, parsePages, fmtBytes, yieldToBrowser } from "../ui.js";
import { tr } from "../i18n.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  const extra = el("div", {});
  let file = null;

  const dz = dropzone({
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "PDF file"),
    accept: "application/pdf,.pdf", multiple: false, hint: tr("ครั้งละ 1 ไฟล์", "One file at a time"),
    onChange: (f) => { file = f[0] || null; st.clear(); results.innerHTML = ""; },
  });

  const fmt = select([["png", tr("PNG (คมชัด ไฟล์ใหญ่)", "PNG (sharp, larger file)")], ["jpeg", tr("JPG (ไฟล์เล็กกว่า)", "JPG (smaller file)")]], "png");
  const dpi = select([["1.5", tr("ปกติ (~110 DPI)", "Normal (~110 DPI)")], ["2", tr("สูง (~150 DPI) แนะนำ", "High (~150 DPI) recommended")], ["3", tr("สูงมาก (~220 DPI)", "Very high (~220 DPI)")], ["4", tr("สูงสุด (~300 DPI)", "Maximum (~300 DPI)")]], "2");
  const rangeInput = el("input", { type: "text", value: "1-", placeholder: tr("เช่น 1-5,8", "e.g. 1-5,8") });
  const go = button(tr("แปลงเป็นรูป", "Convert to images"), { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [field(tr("ชนิดรูป", "Image type"), fmt), field(tr("ความละเอียด", "Resolution"), dpi),
      field(tr("หน้าที่ต้องการ", "Pages"), rangeInput, tr("ว่างไว้ = ทุกหน้า", "Leave blank = all pages"))]),
    el("div", { class: "actions" }, [go]), st.node, extra, results);

  async function run() {
    if (!file) return st.err(tr("กรุณาเลือกไฟล์ PDF ก่อน", "Please choose a PDF file first"));
    results.innerHTML = "";
    go.disabled = true;
    st.info(tr("กำลังเปิดไฟล์…", "Opening the file…"));
    try {
      const pdf = await openPdf(file, passwordBox(extra));
      const pages = parsePages(rangeInput.value || "1-", pdf.numPages);
      if (!pages.length) throw new Error(tr(`ไฟล์นี้มี ${pdf.numPages} หน้า — ช่วงที่ระบุไม่ตรงกับหน้าใดเลย`, `This file has ${pdf.numPages} pages — the range you entered does not match any of them`));

      const scale = +dpi.value;
      const mime = fmt.value === "png" ? "image/png" : "image/jpeg";
      const ext = fmt.value === "png" ? "png" : "jpg";
      const base = stripExt(file.name);
      const made = [];

      for (let i = 0; i < pages.length; i++) {
        const page = await pdf.getPage(pages[i]);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d");
        if (mime === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise((r) => canvas.toBlob(r, mime, 0.92));
        canvas.width = canvas.height = 0;
        page.cleanup();
        made.push({ name: tr(`${base}-หน้า${String(pages[i]).padStart(2, "0")}.${ext}`, `${base}-page${String(pages[i]).padStart(2, "0")}.${ext}`), blob });
        st.progress(((i + 1) / pages.length) * 100, `(${i + 1}/${pages.length})`);
        await yieldToBrowser();
      }
      pdf.destroy();

      st.progress(null);
      st.ok(tr(`แปลงเสร็จ ${made.length} รูป`, `Done — ${made.length} images`));
      if (made.length > 1) results.appendChild(el("div", { class: "actions" }, [
        button(tr("ดาวน์โหลดทั้งหมดเป็น ZIP", "Download all as ZIP"), { icon: "zip",  onclick: async () => {
          st.info(tr("กำลังบีบเป็น ZIP…", "Zipping files…"));
          const zip = new JSZip();
          made.forEach((m) => zip.file(m.name, m.blob));
          download(await zip.generateAsync({ type: "blob" }), tr(base + "-รูปภาพ.zip", base + "-images.zip"));
          st.ok(tr("ดาวน์โหลด ZIP แล้ว", "ZIP downloaded"));
        } }),
      ]));
      made.forEach((m) => results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, m.name)]),
        el("span", { class: "r-size" }, fmtBytes(m.blob.size)),
        button("", { icon: "download", label: tr("ดาวน์โหลด", "Download"),  onclick: () => download(m.blob, m.name) }),
      ])));
    } catch (e) {
      st.progress(null);
      st.err(tr("แปลงไม่สำเร็จ: ", "Could not convert: ") + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
