import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, parsePages, yieldToBrowser, segmented } from "../ui.js";
import { openPdf, passwordBox } from "../pdfopen.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  const preview = el("div", { class: "preview-text", hidden: true });
  const extra = el("div", {});
  let file = null, worker = null;

  const dz = dropzone({
    accept: "application/pdf,.pdf,image/*", multiple: false,
    hint: "รองรับ PDF สแกน และไฟล์รูปภาพ",
    expect: ["pdf", "image"], expectLabel: "ไฟล์ PDF หรือรูปภาพ",
    onChange: (f) => { file = f[0] || null; st.clear(); results.innerHTML = ""; preview.hidden = true; },
  });

  const lang = segmented([["tha+eng", "ไทย + อังกฤษ"], ["tha", "ไทย"], ["eng", "อังกฤษ"]], "tha+eng");
  const rangeInput = el("input", { type: "text", value: "1-", placeholder: "เช่น 1-3" });
  const quality = select([["2", "ปกติ (เร็ว)"], ["2.6", "ละเอียด (แนะนำ)"], ["3.4", "ละเอียดสูง (ช้า)"]], "2.6");
  const go = button("เริ่มอ่านข้อความ", { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [field("ภาษาในเอกสาร", lang),
      field("หน้าที่ต้องการ", rangeInput, "ว่าง = ทุกหน้า · แนะนำทดลองหน้าเดียวก่อน"),
      field("ความละเอียดในการอ่าน", quality)]),
    el("div", { class: "actions" }, [go]), st.node, extra, results, preview);
  body.appendChild(el("div", { class: "note" },
    "ครั้งแรกของแต่ละภาษาจะต้องดาวน์โหลดชุดข้อมูลการอ่าน (ภาษาไทยประมาณ 10-30 MB) เบราว์เซอร์จะเก็บไว้ใช้ซ้ำครั้งต่อไป · " +
    "การอ่านใช้เวลาราว 3-15 วินาทีต่อหน้าขึ้นกับเครื่อง · ทั้งหมดทำงานในเครื่องคุณเอง ไม่มีการส่งไฟล์ออกไปไหน"));

  async function pageImages() {
    // คืนรายการ dataURL ของภาพที่จะส่งให้ OCR — รองรับทั้ง PDF และไฟล์รูป
    if (file.type.startsWith("image/")) return [{ label: file.name, url: URL.createObjectURL(file) }];
    const pdf = await openPdf(file, passwordBox(extra));
    const pages = parsePages(rangeInput.value || "1-", pdf.numPages);
    if (!pages.length) throw new Error(`ไฟล์นี้มี ${pdf.numPages} หน้า — ช่วงที่ระบุไม่ตรงกับหน้าใดเลย`);
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
      out.push({ label: `หน้า ${p}`, url: canvas.toDataURL("image/png") });
      canvas.width = canvas.height = 0;
      await yieldToBrowser();
    }
    pdf.destroy();
    return out;
  }

  async function run() {
    if (!file) return st.err("กรุณาเลือกไฟล์ก่อน");
    results.innerHTML = ""; preview.hidden = true;
    go.disabled = true;
    st.info("กำลังเตรียมภาพ…");
    try {
      const images = await pageImages();

      st.info("กำลังเตรียมตัวอ่าน (ครั้งแรกอาจใช้เวลาดาวน์โหลดชุดภาษา)…");
      // Tesseract ทำงานใน worker ของตัวเองอยู่แล้ว จอจึงไม่ค้างระหว่างอ่าน
      worker = await Tesseract.createWorker(lang.value, 1, {
        logger: (m) => {
          if (m.status === "recognizing text") st.progress(m.progress * 100, `กำลังอ่าน ${Math.round(m.progress * 100)}%`);
          else if (m.status?.includes("loading") || m.status?.includes("initial")) st.info("กำลังเตรียมชุดภาษา… " + m.status);
        },
      });

      const parts = [];
      for (let i = 0; i < images.length; i++) {
        st.info(`กำลังอ่าน ${images[i].label} (${i + 1}/${images.length})`);
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
      if (!chars) { st.err("อ่านไม่พบตัวอักษร — ลองเพิ่มความละเอียด หรือตรวจว่าภาพชัดพอ"); return; }
      st.ok(`อ่านสำเร็จ ${chars.toLocaleString("th-TH")} ตัวอักษร จาก ${images.length} หน้า`);
      preview.hidden = false;
      preview.textContent = text.slice(0, 4000) + (text.length > 4000 ? "\n\n… (แสดงตัวอย่าง 4,000 ตัวอักษรแรก)" : "");

      const name = stripExt(file.name) + "-ocr.txt";
      results.appendChild(el("div", { class: "actions" }, [
        button("ดาวน์โหลด .txt", { icon: "download",  onclick: () =>
          download(new Blob(["﻿" + text], { type: "text/plain;charset=utf-8" }), name) }),
        button("คัดลอกทั้งหมด", { ghost: true, onclick: async () => {
          try { await navigator.clipboard.writeText(text); st.ok("คัดลอกลงคลิปบอร์ดแล้ว"); }
          catch { st.err("เบราว์เซอร์ไม่อนุญาตให้คัดลอก — ใช้ปุ่มดาวน์โหลดแทนได้"); }
        } }),
      ]));
    } catch (e) {
      st.progress(null);
      st.err("อ่านข้อความไม่สำเร็จ: " + e.message);
      if (worker) { try { await worker.terminate(); } catch {} worker = null; }
    } finally { go.disabled = false; }
  }
  return wrap;
}
