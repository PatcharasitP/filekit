import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, yieldToBrowser } from "../ui.js";
import { readPptx } from "../pptx.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  const preview = el("div", { class: "preview-text", hidden: true });
  let file = null;

  const dz = dropzone({
    expect: ["pptx"], expectLabel: "ไฟล์ PowerPoint (.pptx)",
    accept: ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation",
    multiple: false, hint: "รองรับไฟล์ .pptx (PowerPoint 2007 ขึ้นไป)",
    onChange: (f) => { file = f[0] || null; st.clear(); results.innerHTML = ""; preview.hidden = true; },
  });

  const withNotes = select([["yes", "รวมโน้ตผู้บรรยายด้วย"], ["no", "เอาเฉพาะเนื้อสไลด์"]], "yes");
  const layout = select([["heading", "หัวสไลด์เป็นหัวข้อ (แนะนำ)"], ["plain", "ข้อความล้วนต่อกัน"]], "heading");
  const breakMode = select([["page", "ขึ้นหน้าใหม่ทุกสไลด์"], ["flow", "ไหลต่อเนื่อง"]], "flow");
  const go = button("📝 แปลงเป็น Word", { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [field("โน้ตผู้บรรยาย", withNotes), field("รูปแบบเอกสาร", layout), field("การขึ้นหน้า", breakMode)]),
    el("div", { class: "actions" }, [go]), st.node, results, preview);
  body.appendChild(el("div", { class: "note" },
    "ดึงข้อความทุกกล่องในสไลด์ หัวเรื่อง ระดับหัวข้อย่อย และโน้ตผู้บรรยาย ออกมาเป็นเอกสาร Word ที่แก้ไขต่อได้ · " +
    "เหมาะกับการทำสรุปการประชุม เอกสารประกอบการอบรม หรือส่งเนื้อหาให้คนที่ไม่ได้เปิด PowerPoint · " +
    "‼️ ไม่คงรูปภาพ สี และการจัดวางของสไลด์ (ถ้าต้องการหน้าตาเดิม ให้ใช้ PowerPoint → PDF แทน)"));

  async function run() {
    if (!file) return st.err("กรุณาเลือกไฟล์ .pptx ก่อน");
    results.innerHTML = ""; preview.hidden = true;
    go.disabled = true;
    st.info("กำลังอ่านสไลด์…");
    try {
      const { slides } = await readPptx(file, {
        onProgress: (p) => st.progress((p.current / p.total) * 100, `(${p.current}/${p.total} สไลด์)`),
      });

      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;
      const children = [];
      const previewLines = [];
      let words = 0;

      slides.forEach((s, idx) => {
        const heading = s.title || `สไลด์ ${s.no}`;
        words += heading.length;
        if (layout.value === "heading") {
          children.push(new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: heading, bold: true, size: 30, font: "Sarabun" })],
            spacing: { before: 240, after: 120 },
          }));
        } else {
          children.push(new Paragraph({
            children: [new TextRun({ text: heading, bold: true, size: 26, font: "Sarabun" })],
            spacing: { before: 200, after: 80 },
          }));
        }
        previewLines.push(`▌ ${heading}`);

        s.paras.forEach((p) => {
          words += p.text.length;
          children.push(new Paragraph({
            children: [new TextRun({ text: p.text, size: 24, font: "Sarabun" })],
            bullet: { level: Math.min(p.level, 4) },
            spacing: { after: 60 },
          }));
          previewLines.push(`${"  ".repeat(p.level + 1)}• ${p.text}`);
        });

        if (withNotes.value === "yes" && s.notes) {
          words += s.notes.length;
          children.push(new Paragraph({
            children: [new TextRun({ text: (/^โน้ต/.test(s.notes) ? s.notes : "โน้ตผู้บรรยาย: " + s.notes), italics: true, size: 22, font: "Sarabun", color: "666666" })],
            spacing: { after: 120 },
          }));
          previewLines.push(`    ✎ ${s.notes}`);
        }

        if (breakMode.value === "page" && idx < slides.length - 1)
          children.push(new Paragraph({ children: [], pageBreakBefore: true }));
      });

      if (!words) throw new Error("ไม่พบข้อความในสไลด์ — ไฟล์นี้อาจมีแต่รูปภาพ ลองใช้ PowerPoint → PDF แทน");

      const blob = await Packer.toBlob(new Document({ sections: [{ properties: {}, children }] }));
      st.progress(null);
      st.ok(`แปลงสำเร็จ ${slides.length} สไลด์ · ${words.toLocaleString("th-TH")} ตัวอักษร`);
      preview.hidden = false;
      preview.textContent = previewLines.join("\n").slice(0, 4000);

      const name = stripExt(file.name) + ".docx";
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, `${slides.length} สไลด์`)]),
        button("⬇ ดาวน์โหลด", { onclick: () => download(blob, name) }),
      ]));
      await yieldToBrowser();
    } catch (e) {
      st.progress(null);
      st.err("แปลงไม่สำเร็จ: " + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
