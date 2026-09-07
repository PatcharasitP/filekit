import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, fmtBytes, yieldToBrowser, segmented } from "../ui.js";
import { loadLibs } from "../loader.js";
import { useThaiFont, warmThaiFont, THAI_FONT } from "../thaifont.js";
import { tr } from "../i18n.js";

const PAGE = { a4: "a4", letter: "letter" };

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  let files = [];
  warmThaiFont(); // เริ่มดึงฟอนต์ตั้งแต่เปิดหน้า ผู้ใช้จะไม่ต้องรอตอนกดแปลง

  const dz = dropzone({
    expect: ["docx"], expectLabel: tr("ไฟล์ Word (.docx)", "Word file (.docx)"),
    accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    multiple: true, hint: tr("รองรับไฟล์ .docx (Word 2007 ขึ้นไป) · เลือกได้หลายไฟล์พร้อมกัน", "Supports .docx files (Word 2007 and later) · Choose multiple files at once"),
    onChange: (f) => { files = f; st.clear(); results.innerHTML = ""; },
  });

  const size = segmented([["a4", "A4"], ["letter", "Letter"]], "a4");
  const fontSize = segmented([["12", "12 pt"], ["14", "14 pt"], ["16", "16 pt"]], "14");
  const go = button(tr("แปลงเป็น PDF", "Convert to PDF"), { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [field(tr("ขนาดกระดาษ", "Paper size"), size), field(tr("ขนาดตัวอักษร", "Font size"), fontSize)]),
    el("div", { class: "actions" }, [go]), st.node, results);
  body.appendChild(el("div", { class: "note" },
    tr("รองรับภาษาไทยเต็มรูปแบบ (ฝังฟอนต์ Sarabun ให้อัตโนมัติ) · คงหัวข้อ ย่อหน้า ตัวหนา และรายการ · แปลงได้ทีละหลายไฟล์ · " +
       "ยังไม่คงตาราง รูปภาพ และการจัดหน้าซับซ้อนจากไฟล์ต้นฉบับ",
       "Full Thai language support (Sarabun font embedded automatically) · Keeps headings, paragraphs, bold text, and lists · Convert several files at once · " +
       "Tables, images, and complex layouts from the original file are not kept yet")));

  // แปลง HTML ที่ mammoth ให้มา เป็นบล็อกข้อความพร้อมระดับความสำคัญ
  function htmlToBlocks(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const blocks = [];
    const walk = (node, depth = 0) => {
      for (const child of node.children) {
        const tag = child.tagName.toLowerCase();
        if (/^h[1-6]$/.test(tag)) {
          blocks.push({ type: "head", level: +tag[1], text: child.textContent.trim() });
        } else if (tag === "p") {
          const t = child.textContent.trim();
          if (t) blocks.push({ type: "p", text: t });
        } else if (tag === "ul" || tag === "ol") {
          [...child.children].forEach((li, i) => {
            const t = li.textContent.trim();
            if (t) blocks.push({ type: "li", text: (tag === "ol" ? `${i + 1}. ` : "• ") + t, depth });
          });
        } else if (tag === "table") {
          [...child.querySelectorAll("tr")].forEach((tr) => {
            const cells = [...tr.children].map((td) => td.textContent.trim()).filter(Boolean);
            if (cells.length) blocks.push({ type: "p", text: cells.join("  |  ") });
          });
        } else {
          walk(child, depth + 1);
        }
      }
    };
    walk(doc.body);
    return blocks;
  }

  /** แปลงหนึ่งไฟล์ คืน { blob, pages, warnings } */
  async function convertOne(file) {
      const { value: html, messages } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
      const blocks = htmlToBlocks(html);
      if (!blocks.length) throw new Error(tr("ไม่พบเนื้อหาข้อความในไฟล์นี้", "No text content was found in this file"));

      st.info(tr("กำลังจัดหน้า PDF…", "Laying out the PDF…"));
      const { jsPDF } = jspdf;
      const doc = new jsPDF({ unit: "pt", format: PAGE[size.value] });
      await useThaiFont(doc, "both");

      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const M = 56;
      const base = +fontSize.value;
      let y = M;

      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const fs = b.type === "head" ? base + (7 - Math.min(b.level, 4)) * 2 : base;
        doc.setFont(THAI_FONT, b.type === "head" ? "bold" : "normal");
        doc.setFontSize(fs);
        const lineH = fs * 1.55;
        const indent = b.type === "li" ? 16 : 0;
        const lines = doc.splitTextToSize(b.text, W - M * 2 - indent);

        if (b.type === "head" && y > M) y += lineH * 0.5;
        for (const line of lines) {
          if (y + lineH > H - M) { doc.addPage(); y = M; }
          doc.text(line, M + indent, y + fs);
          y += lineH;
        }
        y += b.type === "head" ? lineH * 0.35 : lineH * 0.22;

        if (i % 40 === 0) { st.progress((i / blocks.length) * 100); await yieldToBrowser(); }
      }

      return {
        blob: doc.output("blob"),
        pages: doc.getNumberOfPages(),
        warnings: messages.filter((m) => m.type === "warning").length,
      };
  }

  async function run() {
    if (!files.length) return st.err(tr("กรุณาเลือกไฟล์ .docx ก่อน", "Please choose a .docx file first"));
    results.innerHTML = "";
    go.disabled = true;
    const made = [];
    let failed = 0, warned = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        st.info(tr(`กำลังแปลง ${files[i].name} (${i + 1}/${files.length})`, `Converting ${files[i].name} (${i + 1}/${files.length})`));
        try {
          const r = await convertOne(files[i]);
          made.push({ name: stripExt(files[i].name) + ".pdf", ...r });
          warned += r.warnings;
        } catch (e) {
          failed++;
          results.appendChild(el("div", { class: "status show err" },
            tr(`${files[i].name} — แปลงไม่สำเร็จ: ${e.message}`, `${files[i].name} — could not convert: ${e.message}`)));
        }
        st.progress(((i + 1) / files.length) * 100);
        await yieldToBrowser();
      }
      st.progress(null);
      if (!made.length) { st.err(tr("แปลงไม่สำเร็จสักไฟล์", "Could not convert any files")); return; }

      const pages = made.reduce((a, m) => a + m.pages, 0);
      st.ok(tr(`แปลงสำเร็จ ${made.length} ไฟล์ · รวม ${pages} หน้า` +
        (failed ? ` · ล้มเหลว ${failed} ไฟล์` : "") +
        (warned ? ` · มี ${warned} จุดที่จัดรูปแบบไม่ครบ` : ""),
        `Done — ${made.length} files · ${pages} pages total` +
        (failed ? ` · ${failed} failed` : "") +
        (warned ? ` · ${warned} spots with incomplete formatting` : "")));

      if (made.length > 1) results.appendChild(el("div", { class: "actions" }, [
        button(tr("ดาวน์โหลดทั้งหมดเป็น ZIP", "Download all as ZIP"), { icon: "zip",  onclick: async () => {
          const [JSZipLib] = await loadLibs("jszip");
          const zip = new JSZipLib();
          made.forEach((m) => zip.file(m.name, m.blob));
          download(await zip.generateAsync({ type: "blob" }), tr("เอกสารที่แปลงแล้ว.zip", "converted-documents.zip"));
        } }),
      ]));
      made.forEach((m) => results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, m.name), el("small", {}, tr(`${m.pages} หน้า`, `${m.pages} pages`))]),
        el("span", { class: "r-size" }, fmtBytes(m.blob.size)),
        button("", { icon: "download", label: tr("ดาวน์โหลด", "Download"),  onclick: () => download(m.blob, m.name) }),
      ])));
    } catch (e) {
      st.progress(null);
      st.err(tr("แปลงไม่สำเร็จ: ", "Could not convert: ") + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
