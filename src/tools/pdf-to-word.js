import { el, dropzone, toolShell, statusBar, button, field, select, downloadButton,
         stripExt, yieldToBrowser } from "../ui.js";
import { pageLines, lineText } from "../pdftext.js";
import { openPdf, passwordBox } from "../pdfopen.js";
import { ocrPdf, hasTextLayer } from "../ocr.js";
import { tr } from "../i18n.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  const extra = el("div", {});          // ที่วางกล่องรหัสผ่าน / ปุ่มเสนอ OCR
  let file = null;

  const dz = dropzone({
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "PDF file"),
    accept: "application/pdf,.pdf", multiple: false, hint: tr("ครั้งละ 1 ไฟล์", "One file at a time"),
    onChange: (f) => { file = f[0] || null; st.clear(); results.innerHTML = ""; extra.innerHTML = ""; },
  });

  const breakMode = select([["page", tr("ขึ้นหน้าใหม่ตามหน้าเดิม", "New page for each original page")], ["flow", tr("ไหลต่อเนื่องเป็นเอกสารเดียว", "Flow continuously as one document")]], "page");
  const fontSize = select([["11", "11 pt"], ["12", "12 pt"], ["14", "14 pt"], ["16", "16 pt"]], "12");
  const go = button(tr("แปลงเป็น Word", "Convert to Word"), { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [field(tr("การขึ้นหน้า", "Page breaks"), breakMode), field(tr("ขนาดตัวอักษร", "Font size"), fontSize)]),
    el("div", { class: "actions" }, [go]), st.node, extra, results);
  body.appendChild(el("div", { class: "note" },
    tr("ได้ไฟล์ DOCX แก้ไขต่อได้, ไม่คงตาราง รูปภาพ และการจัดหน้าซับซ้อน",
       "You get an editable DOCX, tables, images, and complex layouts aren't kept")));

  function buildDocx(blocks) {
    const { Document, Packer, Paragraph, TextRun } = docx;
    const size = +fontSize.value * 2; // docx นับขนาดเป็นครึ่ง pt
    const children = [];
    blocks.forEach((b, i) => {
      b.lines.forEach((t) => children.push(new Paragraph({
        children: [new TextRun({ text: t, size, font: "Sarabun" })],
        spacing: { after: 60 },
      })));
      if (breakMode.value === "page" && i < blocks.length - 1)
        children.push(new Paragraph({ children: [], pageBreakBefore: true }));
    });
    return Packer.toBlob(new Document({ sections: [{ properties: {}, children }] }));
  }

  async function finish(blocks, note) {
    const chars = blocks.reduce((a, b) => a + b.lines.join("").length, 0);
    if (!chars) throw new Error(tr("อ่านไม่พบข้อความในไฟล์นี้เลย", "No text was found in this file"));
    const blob = await buildDocx(blocks);
    st.progress(null);
    st.ok(tr(`แปลงสำเร็จ ${chars.toLocaleString("th-TH")} ตัวอักษร จาก ${blocks.length} หน้า${note ? ", " + note : ""}`,
             `Done — ${chars.toLocaleString("en-US")} characters from ${blocks.length} pages${note ? ", " + note : ""}`));
    const name = stripExt(file.name) + ".docx";
    results.innerHTML = "";
    results.appendChild(el("div", { class: "result" }, [
      el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, tr(`${blocks.length} หน้า`, `${blocks.length} pages`))]),
      downloadButton(blob, name),
    ]));
  }

  // เส้นทางที่ 2: ไฟล์สแกน — อ่านด้วย OCR แล้วประกอบเป็น Word ต่อในที่เดียว
  async function runOcr(pdf) {
    extra.innerHTML = "";
    go.disabled = true;
    st.info(tr("กำลังเตรียม OCR…", "Preparing OCR…"));
    try {
      const pages = await ocrPdf(pdf, {
        onProgress: (p) => {
          if (p.phase === "page") st.info(tr(`กำลังอ่านหน้า ${p.current}/${p.total} ด้วย OCR…`, `Reading page ${p.current}/${p.total} with OCR…`));
          else if (p.phase === "read") st.progress(p.ratio * 100);
        },
      });
      await finish(pages.map((p) => ({ lines: p.lines })), tr("อ่านด้วย OCR", "read with OCR"));
    } catch (e) {
      st.progress(null);
      st.err(tr("อ่านด้วย OCR ไม่สำเร็จ: ", "OCR reading failed: ") + e.message);
    } finally {
      go.disabled = false;
      pdf.destroy();
    }
  }

  async function run() {
    if (!file) return st.err(tr("กรุณาเลือกไฟล์ PDF ก่อน", "Please choose a PDF file first"));
    results.innerHTML = ""; extra.innerHTML = "";
    go.disabled = true;
    st.info(tr("กำลังเปิดไฟล์…", "Opening the file…"));
    let pdf = null;
    try {
      pdf = await openPdf(file, passwordBox(extra));

      if (!(await hasTextLayer(pdf))) {
        // ไม่มีชั้นข้อความ = ไฟล์สแกน ให้ผู้ใช้ตัดสินใจก่อนโหลดตัว OCR ที่หนัก
        st.progress(null);
        st.info(tr("ไม่มีชั้นข้อความ (อาจเป็นไฟล์สแกน)", "No text layer (probably a scan)"));
        extra.appendChild(el("div", { class: "panel" }, [
          el("div", { class: "note", style: { marginTop: "0" } },
            tr("OCR อ่านไทย-อังกฤษได้, ครั้งแรกโหลดชุดภาษา ~10–30 MB ใช้เวลา ~3–15 วิ/หน้า",
               "OCR reads Thai and English, first time downloads a ~10–30 MB pack, ~3–15 sec/page")),
          el("div", { class: "actions" }, [
            button(tr("อ่านด้วย OCR", "Read with OCR"), { onclick: () => runOcr(pdf) }),
            button(tr("ยกเลิก", "Cancel"), { ghost: true, onclick: () => { extra.innerHTML = ""; st.clear(); pdf.destroy(); } }),
          ]),
        ]));
        go.disabled = false;
        return;
      }

      st.info(tr("กำลังแปลง…", "Converting…"));
      const blocks = [];
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const rows = await pageLines(page);
        page.cleanup();
        blocks.push({ lines: rows.map(lineText).filter((t) => t !== "") });
        st.progress((p / pdf.numPages) * 100, `(${p}/${pdf.numPages})`);
        await yieldToBrowser();
      }
      await finish(blocks);
      pdf.destroy();
    } catch (e) {
      st.progress(null);
      st.err(tr("แปลงไม่สำเร็จ: ", "Could not convert: ") + e.message);
      pdf?.destroy?.();
    } finally {
      go.disabled = false;
    }
  }
  return wrap;
}
