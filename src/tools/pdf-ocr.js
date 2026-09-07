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
  const go = button(tr("เริ่มอ่านข้อความ", "Start reading text"), { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [field(tr("ภาษาในเอกสาร", "Document language"), lang),
      field(tr("หน้าที่ต้องการ", "Pages to read"), rangeInput, tr("ว่าง = ทุกหน้า · แนะนำทดลองหน้าเดียวก่อน", "Empty = all pages · try one page first")),
      field(tr("ความละเอียดในการอ่าน", "Reading quality"), quality)]),
    el("div", { class: "actions" }, [go]), st.node, extra, results, preview);
  body.appendChild(el("div", { class: "note" },
    tr("ครั้งแรกของแต่ละภาษาจะต้องดาวน์โหลดชุดข้อมูลการอ่าน (ภาษาไทยประมาณ 10-30 MB) เบราว์เซอร์จะเก็บไว้ใช้ซ้ำครั้งต่อไป · " +
    "การอ่านใช้เวลาราว 3-15 วินาทีต่อหน้าขึ้นกับเครื่อง · ทั้งหมดทำงานในเครื่องคุณเอง ไม่มีการส่งไฟล์ออกไปไหน",
    "The first time you use a language, it downloads a reading data pack (Thai is about 10-30 MB) — your browser keeps it for next time · " +
    "Reading takes about 3-15 seconds per page depending on your device · everything runs on your device — no files are sent anywhere")));

  async function pageImages() {
    // คืนรายการ dataURL ของภาพที่จะส่งให้ OCR — รองรับทั้ง PDF และไฟล์รูป
    if (file.type.startsWith("image/")) return [{ label: file.name, url: URL.createObjectURL(file) }];
    const pdf = await openPdf(file, passwordBox(extra));
    const pages = parsePages(rangeInput.value || "1-", pdf.numPages);
    if (!pages.length) throw new Error(tr(`ไฟล์นี้มี ${pdf.numPages} หน้า — ช่วงที่ระบุไม่ตรงกับหน้าใดเลย`, `This file has ${pdf.numPages} pages — the range you entered does not match any page`));
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
    if (!file) return st.err(tr("กรุณาเลือกไฟล์ก่อน", "Please choose a file first"));
    results.innerHTML = ""; preview.hidden = true;
    go.disabled = true;
    st.info(tr("กำลังเตรียมภาพ…", "Preparing images…"));
    try {
      const images = await pageImages();

      st.info(tr("กำลังเตรียมตัวอ่าน (ครั้งแรกอาจใช้เวลาดาวน์โหลดชุดภาษา)…", "Preparing the reader (the first time may take a while to download the language pack)…"));
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
      if (!chars) { st.err(tr("อ่านไม่พบตัวอักษร — ลองเพิ่มความละเอียด หรือตรวจว่าภาพชัดพอ", "No text found — try higher quality, or check that the image is clear enough")); return; }
      st.ok(tr(`อ่านสำเร็จ ${chars.toLocaleString("th-TH")} ตัวอักษร จาก ${images.length} หน้า`, `Done — ${chars.toLocaleString("en-US")} characters from ${images.length} pages`));
      preview.hidden = false;
      preview.textContent = text.slice(0, 4000) + (text.length > 4000 ? tr("\n\n… (แสดงตัวอย่าง 4,000 ตัวอักษรแรก)", "\n\n… (showing the first 4,000 characters)") : "");

      const name = stripExt(file.name) + "-ocr.txt";
      results.appendChild(el("div", { class: "actions" }, [
        button(tr("ดาวน์โหลด .txt", "Download .txt"), { icon: "download",  onclick: () =>
          download(new Blob(["﻿" + text], { type: "text/plain;charset=utf-8" }), name) }),
        button(tr("คัดลอกทั้งหมด", "Copy all"), { ghost: true, onclick: async () => {
          try { await navigator.clipboard.writeText(text); st.ok(tr("คัดลอกลงคลิปบอร์ดแล้ว", "Copied to clipboard")); }
          catch { st.err(tr("เบราว์เซอร์ไม่อนุญาตให้คัดลอก — ใช้ปุ่มดาวน์โหลดแทนได้", "Your browser did not allow copying — try the Download button instead")); }
        } }),
      ]));
    } catch (e) {
      st.progress(null);
      st.err(tr("อ่านข้อความไม่สำเร็จ: ", "Could not read the text: ") + e.message);
      if (worker) { try { await worker.terminate(); } catch {} worker = null; }
    } finally { go.disabled = false; }
  }
  return wrap;
}
