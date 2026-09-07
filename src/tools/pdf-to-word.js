import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, yieldToBrowser } from "../ui.js";
import { pageLines, lineText } from "../pdftext.js";
import { openPdf, passwordBox } from "../pdfopen.js";
import { ocrPdf, hasTextLayer } from "../ocr.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  const extra = el("div", {});          // ที่วางกล่องรหัสผ่าน / ปุ่มเสนอ OCR
  let file = null;

  const dz = dropzone({
    expect: ["pdf"], expectLabel: "ไฟล์ PDF",
    accept: "application/pdf,.pdf", multiple: false, hint: "ครั้งละ 1 ไฟล์",
    onChange: (f) => { file = f[0] || null; st.clear(); results.innerHTML = ""; extra.innerHTML = ""; },
  });

  const breakMode = select([["page", "ขึ้นหน้าใหม่ตามหน้าเดิม"], ["flow", "ไหลต่อเนื่องเป็นเอกสารเดียว"]], "page");
  const fontSize = select([["11", "11 pt"], ["12", "12 pt"], ["14", "14 pt"], ["16", "16 pt"]], "12");
  const go = button("แปลงเป็น Word", { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [field("การขึ้นหน้า", breakMode), field("ขนาดตัวอักษร", fontSize)]),
    el("div", { class: "actions" }, [go]), st.node, extra, results);
  body.appendChild(el("div", { class: "note" },
    "ได้ไฟล์ DOCX ที่เปิดแก้ไขต่อได้ทันที · คงข้อความและการขึ้นบรรทัด แต่ไม่คงตาราง รูปภาพ และการจัดหน้าซับซ้อน · " +
    "ถ้าเป็นไฟล์สแกน ระบบจะเสนออ่านด้วย OCR ให้เอง · ไฟล์ที่ล็อกรหัสผ่านใส่รหัสได้ในหน้านี้เลย"));

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
    if (!chars) throw new Error("อ่านไม่พบข้อความในไฟล์นี้เลย");
    const blob = await buildDocx(blocks);
    st.progress(null);
    st.ok(`แปลงสำเร็จ ${chars.toLocaleString("th-TH")} ตัวอักษร จาก ${blocks.length} หน้า${note ? " · " + note : ""}`);
    const name = stripExt(file.name) + ".docx";
    results.innerHTML = "";
    results.appendChild(el("div", { class: "result" }, [
      el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, `${blocks.length} หน้า`)]),
      button("ดาวน์โหลด", { icon: "download",  onclick: () => download(blob, name) }),
    ]));
  }

  // เส้นทางที่ 2: ไฟล์สแกน — อ่านด้วย OCR แล้วประกอบเป็น Word ต่อในที่เดียว
  async function runOcr(pdf) {
    extra.innerHTML = "";
    go.disabled = true;
    st.info("กำลังเตรียมตัวอ่าน OCR (ครั้งแรกต้องดาวน์โหลดชุดภาษา อาจใช้เวลาสักครู่)…");
    try {
      const pages = await ocrPdf(pdf, {
        onProgress: (p) => {
          if (p.phase === "page") st.info(`กำลังอ่านหน้า ${p.current}/${p.total} ด้วย OCR…`);
          else if (p.phase === "read") st.progress(p.ratio * 100);
        },
      });
      await finish(pages.map((p) => ({ lines: p.lines })), "อ่านด้วย OCR");
    } catch (e) {
      st.progress(null);
      st.err("อ่านด้วย OCR ไม่สำเร็จ: " + e.message);
    } finally {
      go.disabled = false;
      pdf.destroy();
    }
  }

  async function run() {
    if (!file) return st.err("กรุณาเลือกไฟล์ PDF ก่อน");
    results.innerHTML = ""; extra.innerHTML = "";
    go.disabled = true;
    st.info("กำลังเปิดไฟล์…");
    let pdf = null;
    try {
      pdf = await openPdf(file, passwordBox(extra));

      if (!(await hasTextLayer(pdf))) {
        // ไม่มีชั้นข้อความ = ไฟล์สแกน ให้ผู้ใช้ตัดสินใจก่อนโหลดตัว OCR ที่หนัก
        st.progress(null);
        st.info("ไฟล์นี้ไม่มีชั้นข้อความ (น่าจะเป็นไฟล์สแกนหรือรูปถ่ายเอกสาร)");
        extra.appendChild(el("div", { class: "panel" }, [
          el("div", { class: "note", style: { marginTop: "0" } },
            "ระบบอ่านตัวอักษรจากภาพให้ได้ด้วย OCR รองรับไทย–อังกฤษ · ครั้งแรกต้องดาวน์โหลดชุดภาษาราว 10–30 MB " +
            "และใช้เวลาประมาณ 3–15 วินาทีต่อหน้า · ทุกอย่างทำในเครื่องคุณเอง"),
          el("div", { class: "actions" }, [
            button("อ่านด้วย OCR แล้วแปลงเป็น Word", { onclick: () => runOcr(pdf) }),
            button("ยกเลิก", { ghost: true, onclick: () => { extra.innerHTML = ""; st.clear(); pdf.destroy(); } }),
          ]),
        ]));
        go.disabled = false;
        return;
      }

      st.info("กำลังแปลง…");
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
      st.err("แปลงไม่สำเร็จ: " + e.message);
      pdf?.destroy?.();
    } finally {
      go.disabled = false;
    }
  }
  return wrap;
}
