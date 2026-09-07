import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, yieldToBrowser } from "../ui.js";
import { pageLines, lineText } from "../pdftext.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  let file = null;

  const dz = dropzone({
    accept: "application/pdf,.pdf", multiple: false, hint: "ครั้งละ 1 ไฟล์",
    onChange: (f) => { file = f[0] || null; st.clear(); results.innerHTML = ""; },
  });

  const breakMode = select([["page", "ขึ้นหน้าใหม่ตามหน้าเดิม"], ["flow", "ไหลต่อเนื่องเป็นเอกสารเดียว"]], "page");
  const fontSize = select([["11", "11 pt"], ["12", "12 pt"], ["14", "14 pt"], ["16", "16 pt"]], "12");
  const go = button("📝 แปลงเป็น Word", { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [field("การขึ้นหน้า", breakMode), field("ขนาดตัวอักษร", fontSize)]),
    el("div", { class: "actions" }, [go]), st.node, results);
  body.appendChild(el("div", { class: "note" },
    "ได้ไฟล์ DOCX ที่เปิดแก้ไขต่อได้ทันที · ระบบคงข้อความและการขึ้นบรรทัดไว้ แต่ไม่คงตาราง รูปภาพ และการจัดหน้าแบบซับซ้อน · " +
    "ใช้กับ PDF ที่มีชั้นข้อความเท่านั้น"));

  async function run() {
    if (!file) return st.err("กรุณาเลือกไฟล์ PDF ก่อน");
    results.innerHTML = "";
    go.disabled = true;
    st.info("กำลังแปลง…");
    try {
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      const { Document, Packer, Paragraph, TextRun } = docx;
      const size = +fontSize.value * 2; // docx นับขนาดเป็นครึ่ง pt
      const children = [];
      let chars = 0;

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const rows = await pageLines(page);
        page.cleanup();
        for (const r of rows) {
          const t = lineText(r);
          chars += t.length;
          children.push(new Paragraph({
            children: [new TextRun({ text: t, size, font: "Sarabun" })],
            spacing: { after: 60 },
          }));
        }
        if (breakMode.value === "page" && p < pdf.numPages) {
          children.push(new Paragraph({ children: [], pageBreakBefore: true }));
        }
        st.progress((p / pdf.numPages) * 100, `(${p}/${pdf.numPages})`);
        await yieldToBrowser();
      }
      pdf.destroy();

      if (!chars) throw new Error("ไม่พบชั้นข้อความในไฟล์ — ถ้าเป็นไฟล์สแกน ให้ใช้เครื่องมือ OCR ก่อน");

      const doc = new Document({ sections: [{ properties: {}, children }] });
      const blob = await Packer.toBlob(doc);
      st.progress(null);
      st.ok(`แปลงสำเร็จ ${chars.toLocaleString("th-TH")} ตัวอักษร จาก ${pdf.numPages} หน้า`);
      const name = stripExt(file.name) + ".docx";
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name)]),
        button("⬇ ดาวน์โหลด", { onclick: () => download(blob, name) }),
      ]));
    } catch (e) {
      st.progress(null);
      st.err("แปลงไม่สำเร็จ: " + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
