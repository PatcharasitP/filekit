import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, yieldToBrowser } from "../ui.js";
import { pageLines, lineText } from "../pdftext.js";
import { openPdf, passwordBox } from "../pdfopen.js";
import { ocrPdf, hasTextLayer } from "../ocr.js";
import { tr } from "../i18n.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  const extra = el("div", {});
  const preview = el("div", { class: "preview-text", hidden: true });
  let file = null;

  const dz = dropzone({
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "PDF file"),
    accept: "application/pdf,.pdf", multiple: false, hint: tr("ครั้งละ 1 ไฟล์", "One file at a time"),
    onChange: (f) => { file = f[0] || null; st.clear(); results.innerHTML = ""; extra.innerHTML = ""; preview.hidden = true; },
  });

  const layout = select([["lines", tr("จัดบรรทัดตามตำแหน่งจริง (แนะนำ)", "Line up by real position (recommended)")], ["raw", tr("ต่อกันตามลำดับในไฟล์", "Join in file order")]], "lines");
  const marker = select([["yes", tr("ใส่ตัวคั่นหน้า", "Add page markers")], ["no", tr("ไม่ใส่", "No markers")]], "yes");
  const go = button(tr("ดึงข้อความ", "Extract text"), { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [field(tr("การจัดวางข้อความ", "Text layout"), layout), field(tr("ตัวคั่นหน้า", "Page markers"), marker)]),
    el("div", { class: "actions" }, [go]), st.node, extra, results, preview);
  body.appendChild(el("div", { class: "note" },
    tr("ถ้าไฟล์เป็นสแกนหรือรูปถ่ายเอกสาร ระบบจะเสนออ่านด้วย OCR ให้เอง · ไฟล์ที่ล็อกรหัสผ่านใส่รหัสได้ในหน้านี้",
       "If the file is a scan or a photo of a document, we'll offer to read it with OCR · Password-protected files can be unlocked right here")));

  function present(pages, note) {
    // ‼️ นับเฉพาะ "เนื้อความจริง"ไม่รวมตัวคั่นหน้า มิฉะนั้นไฟล์สแกนที่อ่านไม่ได้เลย
    // จะถูกรายงานว่า "สำเร็จ 11 ตัวอักษร"ทั้งที่ผู้ใช้ได้ไฟล์เปล่า
    const bodyChars = pages.reduce((a, p) => a + p.text.replace(/\s/g, "").length, 0);
    if (!bodyChars) throw new Error(tr("อ่านไม่พบข้อความในไฟล์นี้เลย", "No text was found in this file"));

    const text = pages
      .map((p) => (marker.value === "yes" ? tr(`--- หน้า ${p.page} ---\n${p.text}`, `--- Page ${p.page} ---\n${p.text}`) : p.text))
      .join("\n\n");
    st.progress(null);
    st.ok(tr(`ดึงข้อความสำเร็จ ${bodyChars.toLocaleString("th-TH")} ตัวอักษร จาก ${pages.length} หน้า${note ? " · " + note : ""}`,
             `Done — ${bodyChars.toLocaleString("en-US")} characters from ${pages.length} pages${note ? " · " + note : ""}`));
    preview.hidden = false;
    preview.textContent = text.slice(0, 4000) + (text.length > 4000 ? tr("\n\n… (แสดงตัวอย่าง 4,000 ตัวอักษรแรก)", "\n\n… (showing the first 4,000 characters)") : "");
    const name = stripExt(file.name) + ".txt";
    results.innerHTML = "";
    results.appendChild(el("div", { class: "actions" }, [
      button(tr("ดาวน์โหลด .txt", "Download .txt"), { icon: "download",  onclick: () =>
        download(new Blob(["﻿" + text], { type: "text/plain;charset=utf-8" }), name) }),
      button(tr("คัดลอกทั้งหมด", "Copy all"), { ghost: true, onclick: async () => {
        try { await navigator.clipboard.writeText(text); st.ok(tr("คัดลอกลงคลิปบอร์ดแล้ว", "Copied to clipboard")); }
        catch { st.err(tr("เบราว์เซอร์ไม่อนุญาตให้คัดลอก — ใช้ปุ่มดาวน์โหลดแทนได้", "This browser doesn't allow copying — use the download button instead")); }
      } }),
    ]));
  }

  async function runOcr(pdf) {
    extra.innerHTML = "";
    go.disabled = true;
    st.info(tr("กำลังเตรียมตัวอ่าน OCR (ครั้งแรกต้องดาวน์โหลดชุดภาษา)…", "Getting OCR ready (first time needs to download the language pack)…"));
    try {
      const pages = await ocrPdf(pdf, {
        onProgress: (p) => {
          if (p.phase === "page") st.info(tr(`กำลังอ่านหน้า ${p.current}/${p.total} ด้วย OCR…`, `Reading page ${p.current}/${p.total} with OCR…`));
          else if (p.phase === "read") st.progress(p.ratio * 100);
        },
      });
      present(pages.map((p) => ({ page: p.page, text: p.text })), tr("อ่านด้วย OCR", "read with OCR"));
    } catch (e) {
      st.progress(null); st.err(tr("อ่านด้วย OCR ไม่สำเร็จ: ", "OCR reading failed: ") + e.message);
    } finally { go.disabled = false; pdf.destroy(); }
  }

  async function run() {
    if (!file) return st.err(tr("กรุณาเลือกไฟล์ PDF ก่อน", "Please choose a PDF file first"));
    results.innerHTML = ""; extra.innerHTML = ""; preview.hidden = true;
    go.disabled = true;
    st.info(tr("กำลังเปิดไฟล์…", "Opening the file…"));
    let pdf = null;
    try {
      pdf = await openPdf(file, passwordBox(extra));
      if (!(await hasTextLayer(pdf))) {
        st.progress(null);
        st.info(tr("ไฟล์นี้ไม่มีชั้นข้อความ (น่าจะเป็นไฟล์สแกนหรือรูปถ่ายเอกสาร)", "This file has no text layer (it's probably a scan or a photo of a document)"));
        extra.appendChild(el("div", { class: "panel" }, [
          el("div", { class: "note", style: { marginTop: "0" } },
            tr("ระบบอ่านตัวอักษรจากภาพให้ได้ด้วย OCR รองรับไทย–อังกฤษ · ครั้งแรกต้องดาวน์โหลดชุดภาษาราว 10–30 MB · ทำในเครื่องคุณเอง",
               "We can read text from the image with OCR — Thai and English supported · First time needs to download a ~10–30 MB language pack · Everything runs on your device")),
          el("div", { class: "actions" }, [
            button(tr("อ่านด้วย OCR", "Read with OCR"), { onclick: () => runOcr(pdf) }),
            button(tr("ยกเลิก", "Cancel"), { ghost: true, onclick: () => { extra.innerHTML = ""; st.clear(); pdf.destroy(); } }),
          ]),
        ]));
        go.disabled = false;
        return;
      }

      st.info(tr("กำลังอ่านข้อความ…", "Reading text…"));
      const pages = [];
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        let text;
        if (layout.value === "raw") {
          const content = await page.getTextContent();
          text = content.items.map((i) => i.str).join(" ");
        } else {
          text = (await pageLines(page)).map(lineText).join("\n");
        }
        page.cleanup();
        pages.push({ page: p, text });
        st.progress((p / pdf.numPages) * 100, `(${p}/${pdf.numPages})`);
        await yieldToBrowser();
      }
      present(pages);
      pdf.destroy();
    } catch (e) {
      st.progress(null);
      st.err(tr("อ่านไฟล์ไม่สำเร็จ: ", "Could not read the file: ") + e.message);
      pdf?.destroy?.();
    } finally { go.disabled = false; }
  }
  return wrap;
}
