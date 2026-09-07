import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, yieldToBrowser } from "../ui.js";
import { pageLines, lineText } from "../pdftext.js";
import { openPdf, passwordBox } from "../pdfopen.js";
import { ocrPdf, hasTextLayer } from "../ocr.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  const extra = el("div", {});
  const preview = el("div", { class: "preview-text", hidden: true });
  let file = null;

  const dz = dropzone({
    expect: ["pdf"], expectLabel: "ไฟล์ PDF",
    accept: "application/pdf,.pdf", multiple: false, hint: "ครั้งละ 1 ไฟล์",
    onChange: (f) => { file = f[0] || null; st.clear(); results.innerHTML = ""; extra.innerHTML = ""; preview.hidden = true; },
  });

  const layout = select([["lines", "จัดบรรทัดตามตำแหน่งจริง (แนะนำ)"], ["raw", "ต่อกันตามลำดับในไฟล์"]], "lines");
  const marker = select([["yes", "ใส่ตัวคั่นหน้า"], ["no", "ไม่ใส่"]], "yes");
  const go = button("ดึงข้อความ", { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [field("การจัดวางข้อความ", layout), field("ตัวคั่นหน้า", marker)]),
    el("div", { class: "actions" }, [go]), st.node, extra, results, preview);
  body.appendChild(el("div", { class: "note" },
    "ถ้าไฟล์เป็นสแกนหรือรูปถ่ายเอกสาร ระบบจะเสนออ่านด้วย OCR ให้เอง · ไฟล์ที่ล็อกรหัสผ่านใส่รหัสได้ในหน้านี้"));

  function present(pages, note) {
    // ‼️ นับเฉพาะ "เนื้อความจริง"ไม่รวมตัวคั่นหน้า มิฉะนั้นไฟล์สแกนที่อ่านไม่ได้เลย
    // จะถูกรายงานว่า "สำเร็จ 11 ตัวอักษร"ทั้งที่ผู้ใช้ได้ไฟล์เปล่า
    const bodyChars = pages.reduce((a, p) => a + p.text.replace(/\s/g, "").length, 0);
    if (!bodyChars) throw new Error("อ่านไม่พบข้อความในไฟล์นี้เลย");

    const text = pages
      .map((p) => (marker.value === "yes" ? `--- หน้า ${p.page} ---\n${p.text}` : p.text))
      .join("\n\n");
    st.progress(null);
    st.ok(`ดึงข้อความสำเร็จ ${bodyChars.toLocaleString("th-TH")} ตัวอักษร จาก ${pages.length} หน้า${note ? " · " + note : ""}`);
    preview.hidden = false;
    preview.textContent = text.slice(0, 4000) + (text.length > 4000 ? "\n\n… (แสดงตัวอย่าง 4,000 ตัวอักษรแรก)" : "");
    const name = stripExt(file.name) + ".txt";
    results.innerHTML = "";
    results.appendChild(el("div", { class: "actions" }, [
      button("ดาวน์โหลด .txt", { icon: "download",  onclick: () =>
        download(new Blob(["﻿" + text], { type: "text/plain;charset=utf-8" }), name) }),
      button("คัดลอกทั้งหมด", { ghost: true, onclick: async () => {
        try { await navigator.clipboard.writeText(text); st.ok("คัดลอกลงคลิปบอร์ดแล้ว"); }
        catch { st.err("เบราว์เซอร์ไม่อนุญาตให้คัดลอก — ใช้ปุ่มดาวน์โหลดแทนได้"); }
      } }),
    ]));
  }

  async function runOcr(pdf) {
    extra.innerHTML = "";
    go.disabled = true;
    st.info("กำลังเตรียมตัวอ่าน OCR (ครั้งแรกต้องดาวน์โหลดชุดภาษา)…");
    try {
      const pages = await ocrPdf(pdf, {
        onProgress: (p) => {
          if (p.phase === "page") st.info(`กำลังอ่านหน้า ${p.current}/${p.total} ด้วย OCR…`);
          else if (p.phase === "read") st.progress(p.ratio * 100);
        },
      });
      present(pages.map((p) => ({ page: p.page, text: p.text })), "อ่านด้วย OCR");
    } catch (e) {
      st.progress(null); st.err("อ่านด้วย OCR ไม่สำเร็จ: " + e.message);
    } finally { go.disabled = false; pdf.destroy(); }
  }

  async function run() {
    if (!file) return st.err("กรุณาเลือกไฟล์ PDF ก่อน");
    results.innerHTML = ""; extra.innerHTML = ""; preview.hidden = true;
    go.disabled = true;
    st.info("กำลังเปิดไฟล์…");
    let pdf = null;
    try {
      pdf = await openPdf(file, passwordBox(extra));
      if (!(await hasTextLayer(pdf))) {
        st.progress(null);
        st.info("ไฟล์นี้ไม่มีชั้นข้อความ (น่าจะเป็นไฟล์สแกนหรือรูปถ่ายเอกสาร)");
        extra.appendChild(el("div", { class: "panel" }, [
          el("div", { class: "note", style: { marginTop: "0" } },
            "ระบบอ่านตัวอักษรจากภาพให้ได้ด้วย OCR รองรับไทย–อังกฤษ · ครั้งแรกต้องดาวน์โหลดชุดภาษาราว 10–30 MB · ทำในเครื่องคุณเอง"),
          el("div", { class: "actions" }, [
            button("อ่านด้วย OCR", { onclick: () => runOcr(pdf) }),
            button("ยกเลิก", { ghost: true, onclick: () => { extra.innerHTML = ""; st.clear(); pdf.destroy(); } }),
          ]),
        ]));
        go.disabled = false;
        return;
      }

      st.info("กำลังอ่านข้อความ…");
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
      st.err("อ่านไฟล์ไม่สำเร็จ: " + e.message);
      pdf?.destroy?.();
    } finally { go.disabled = false; }
  }
  return wrap;
}
