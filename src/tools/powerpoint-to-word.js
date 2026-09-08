import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, yieldToBrowser } from "../ui.js";
import { readPptx } from "../pptx.js";
import { tr } from "../i18n.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  const preview = el("div", { class: "preview-text", hidden: true });
  let file = null;

  const dz = dropzone({
    expect: ["pptx"], expectLabel: tr("ไฟล์ PowerPoint (.pptx)", "PowerPoint files (.pptx)"),
    accept: ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation",
    multiple: false, hint: tr(".pptx (PowerPoint 2007+)", ".pptx (PowerPoint 2007+)"),
    onChange: (f) => { file = f[0] || null; st.clear(); results.innerHTML = ""; preview.hidden = true; },
  });

  const withNotes = select([["yes", tr("รวมโน้ตผู้บรรยายด้วย", "Include speaker notes")], ["no", tr("เอาเฉพาะเนื้อสไลด์", "Slide content only")]], "yes");
  const layout = select([["heading", tr("หัวสไลด์เป็นหัวข้อ (แนะนำ)", "Slide titles as headings (recommended)")], ["plain", tr("ข้อความล้วนต่อกัน", "Plain running text")]], "heading");
  const breakMode = select([["page", tr("ขึ้นหน้าใหม่ทุกสไลด์", "New page per slide")], ["flow", tr("ไหลต่อเนื่อง", "Continuous flow")]], "flow");
  const go = button(tr("แปลงเป็น Word", "Convert to Word"), { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [field(tr("โน้ตผู้บรรยาย", "Speaker notes"), withNotes), field(tr("รูปแบบเอกสาร", "Document format"), layout), field(tr("การขึ้นหน้า", "Page breaks"), breakMode)]),
    el("div", { class: "actions" }, [go]), st.node, results, preview);
  body.appendChild(el("div", { class: "note" },
    tr("ดึงข้อความเป็น Word แก้ไขได้ — ไม่คงรูป/สี/เลย์เอาต์ (อยากได้เดิม ใช้ PowerPoint→PDF)",
    "Pulls text into an editable Word doc — images/colors/layout not kept (exact look? use PowerPoint → PDF)")));

  async function run() {
    if (!file) return st.err(tr("กรุณาเลือกไฟล์ .pptx ก่อน", "Please choose a .pptx file first"));
    results.innerHTML = ""; preview.hidden = true;
    go.disabled = true;
    st.info(tr("กำลังอ่านสไลด์…", "Reading slides…"));
    try {
      const { slides } = await readPptx(file, {
        onProgress: (p) => st.progress((p.current / p.total) * 100, tr(`(${p.current}/${p.total} สไลด์)`, `(${p.current}/${p.total} slides)`)),
      });

      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;
      const children = [];
      const previewLines = [];
      let words = 0;

      slides.forEach((s, idx) => {
        const heading = s.title || tr(`สไลด์ ${s.no}`, `Slide ${s.no}`);
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
        previewLines.push(`— ${heading}`);

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
            children: [new TextRun({ text: (/^โน้ต/.test(s.notes) ? s.notes : tr("โน้ตผู้บรรยาย: ", "Speaker notes: ") + s.notes), italics: true, size: 22, font: "Sarabun", color: "666666" })],
            spacing: { after: 120 },
          }));
          previewLines.push(`    ✎ ${s.notes}`);
        }

        if (breakMode.value === "page" && idx < slides.length - 1)
          children.push(new Paragraph({ children: [], pageBreakBefore: true }));
      });

      if (!words) throw new Error(tr("ไม่พบข้อความ — ไฟล์นี้อาจมีแต่รูป ลองใช้ PowerPoint → PDF แทน", "No text found — this file may be images only. Try PowerPoint → PDF instead"));

      const blob = await Packer.toBlob(new Document({ sections: [{ properties: {}, children }] }));
      st.progress(null);
      st.ok(tr(`แปลงสำเร็จ ${slides.length} สไลด์, ${words.toLocaleString("th-TH")} ตัวอักษร`,
        `Done — ${slides.length} slides, ${words.toLocaleString("en-US")} characters`));
      preview.hidden = false;
      preview.textContent = previewLines.join("\n").slice(0, 4000);

      const name = stripExt(file.name) + ".docx";
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, tr(`${slides.length} สไลด์`, `${slides.length} slides`))]),
        button(tr("ดาวน์โหลด", "Download"), { icon: "download",  onclick: () => download(blob, name) }),
      ]));
      await yieldToBrowser();
    } catch (e) {
      st.progress(null);
      st.err(tr("แปลงไม่สำเร็จ: ", "Could not convert: ") + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
