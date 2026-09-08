import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, parsePages, yieldToBrowser, segmented } from "../ui.js";
import { openPdf, passwordBox } from "../pdfopen.js";
import { tr } from "../i18n.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  const preview = el("div", { class: "preview-text", hidden: true });
  const extra = el("div", {});
  let file = null, worker = null;

  const dz = dropzone({
    accept: "application/pdf,.pdf,image/*", multiple: false,
    hint: tr("รองรับ PDF สแกน และไฟล์รูปภาพ", "Works with scanned PDFs and image files"),
    expect: ["pdf", "image"], expectLabel: tr("ไฟล์ PDF หรือรูปภาพ", "PDF or image files"),
    onChange: (f) => { file = f[0] || null; st.clear(); results.innerHTML = ""; preview.hidden = true; },
  });

  const lang = segmented([["tha+eng", tr("ไทย + อังกฤษ", "Thai + English")], ["tha", tr("ไทย", "Thai")], ["eng", tr("อังกฤษ", "English")]], "tha+eng");
  const rangeInput = el("input", { type: "text", value: "1-", placeholder: tr("เช่น 1-3", "e.g. 1-3") });
  const quality = select([["2", tr("ปกติ (เร็ว)", "Normal (fast)")], ["2.6", tr("ละเอียด (แนะนำ)", "Detailed (recommended)")], ["3.4", tr("ละเอียดสูง (ช้า)", "High detail (slow)")]], "2.6");
  const go = button(tr("เริ่มอ่าน", "Start reading"), { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [field(tr("ภาษาในเอกสาร", "Document language"), lang),
      field(tr("หน้าที่ต้องการ", "Pages to read"), rangeInput, tr("ว่าง = ทุกหน้า, แนะนำทดลองหน้าเดียวก่อน", "Empty = all pages, try one page first")),
      field(tr("ความละเอียดในการอ่าน", "Reading quality"), quality)]),
    el("div", { class: "actions" }, [go]), st.node, extra, results, preview);
  body.appendChild(el("div", { class: "note" },
    tr("ครั้งแรกโหลดชุดภาษา ~10-30MB, อ่านช้าราว 3-15 วิ/หน้า",
    "First run downloads a ~10-30MB language pack, reading takes 3-15s per page")));

  async function pageImages() {
    // คืนรายการ dataURL ของภาพที่จะส่งให้ OCR — รองรับทั้ง PDF และไฟล์รูป
    if (file.type.startsWith("image/")) return [{ label: file.name, url: URL.createObjectURL(file) }];
    const pdf = await openPdf(file, passwordBox(extra));
    const pages = parsePages(rangeInput.value || "1-", pdf.numPages);
    if (!pages.length) throw new Error(tr(`ไฟล์มี ${pdf.numPages} หน้า — ช่วงที่ระบุไม่ตรงหน้าใดเลย`, `File has ${pdf.numPages} pages — range matches none`));
    const out = [];
    for (const p of pages) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: +quality.value });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      page.cleanup();
      out.push({ label: tr(`หน้า ${p}`, `Page ${p}`), url: canvas.toDataURL("image/png") });
      canvas.width = canvas.height = 0;
      await yieldToBrowser();
    }
    pdf.destroy();
    return out;
  }

  async function run() {
    if (!file) return st.err(tr("เลือกไฟล์ก่อน", "Choose a file first"));
    results.innerHTML = ""; preview.hidden = true;
    go.disabled = true;
    st.info(tr("กำลังเตรียมภาพ…", "Preparing images…"));
    try {
      const images = await pageImages();

      st.info(tr("เตรียมตัวอ่าน (ครั้งแรกอาจช้า)…", "Preparing reader (first run may be slow)…"));
      // Tesseract ทำงานใน worker ของตัวเองอยู่แล้ว จอจึงไม่ค้างระหว่างอ่าน
      worker = await Tesseract.createWorker(lang.value, 1, {
        logger: (m) => {
          if (m.status === "recognizing text") st.progress(m.progress * 100, tr(`กำลังอ่าน ${Math.round(m.progress * 100)}%`, `Reading ${Math.round(m.progress * 100)}%`));
          else if (m.status?.includes("loading") || m.status?.includes("initial")) st.info(tr("กำลังเตรียมชุดภาษา… ", "Preparing language pack… ") + m.status);
        },
      });

      const parts = [];
      for (let i = 0; i < images.length; i++) {
        st.info(tr(`กำลังอ่าน ${images[i].label} (${i + 1}/${images.length})`, `Reading ${images[i].label} (${i + 1}/${images.length})`));
        const { data } = await worker.recognize(images[i].url);
        parts.push(`--- ${images[i].label} ---\n${data.text.trim()}`);
        if (images[i].url.startsWith("blob:")) URL.revokeObjectURL(images[i].url);
        await yieldToBrowser();
      }
      await worker.terminate();
      worker = null;

      const text = parts.join("\n\n");
      const chars = text.replace(/\s/g, "").length;
      st.progress(null);
      if (!chars) { st.err(tr("ไม่พบตัวอักษร ลองเพิ่มความละเอียด", "No text found — try higher quality")); return; }
      st.ok(tr(`อ่านสำเร็จ ${chars.toLocaleString("th-TH")} ตัวอักษร จาก ${images.length} หน้า`, `Done — ${chars.toLocaleString("en-US")} characters from ${images.length} pages`));
      preview.hidden = false;
      preview.textContent = text.slice(0, 4000) + (text.length > 4000 ? tr("\n\n… (ตัวอย่าง 4,000 ตัวแรก)", "\n\n… (first 4,000 chars)") : "");

      const name = stripExt(file.name) + "-ocr.txt";
      results.appendChild(el("div", { class: "actions" }, [
        button(tr("ดาวน์โหลด .txt", "Download .txt"), { icon: "download",  onclick: () =>
          download(new Blob(["﻿" + text], { type: "text/plain;charset=utf-8" }), name) }),
        button(tr("คัดลอกทั้งหมด", "Copy all"), { ghost: true, onclick: async () => {
          try { await navigator.clipboard.writeText(text); st.ok(tr("คัดลอกลงคลิปบอร์ดแล้ว", "Copied to clipboard")); }
          catch { st.err(tr("คัดลอกไม่ได้ — ลองใช้ปุ่มดาวน์โหลดแทน", "Couldn't copy — try Download instead")); }
        } }),
      ]));
    } catch (e) {
      st.progress(null);
      st.err(tr("อ่านไม่สำเร็จ: ", "Couldn't read text: ") + e.message);
      if (worker) { try { await worker.terminate(); } catch {} worker = null; }
    } finally { go.disabled = false; }
  }
  return wrap;
}
