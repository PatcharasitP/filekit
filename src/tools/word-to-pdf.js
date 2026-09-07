import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, fmtBytes, yieldToBrowser, segmented } from "../ui.js";
import { loadLibs } from "../loader.js";
import { useThaiFont, warmThaiFont, THAI_FONT } from "../thaifont.js";

const PAGE = { a4: "a4", letter: "letter" };

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  let files = [];
  warmThaiFont(); // เริ่มดึงฟอนต์ตั้งแต่เปิดหน้า ผู้ใช้จะไม่ต้องรอตอนกดแปลง

  const dz = dropzone({
    expect: ["docx"], expectLabel: "ไฟล์ Word (.docx)",
    accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    multiple: true, hint: "รองรับไฟล์ .docx (Word 2007 ขึ้นไป) · เลือกได้หลายไฟล์พร้อมกัน",
    onChange: (f) => { files = f; st.clear(); results.innerHTML = ""; },
  });

  const size = segmented([["a4", "A4"], ["letter", "Letter"]], "a4");
  const fontSize = segmented([["12", "12 pt"], ["14", "14 pt"], ["16", "16 pt"]], "14");
  const go = button("📘 แปลงเป็น PDF", { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [field("ขนาดกระดาษ", size), field("ขนาดตัวอักษร", fontSize)]),
    el("div", { class: "actions" }, [go]), st.node, results);
  body.appendChild(el("div", { class: "note" },
    "รองรับภาษาไทยเต็มรูปแบบ (ฝังฟอนต์ Sarabun ให้อัตโนมัติ) · คงหัวข้อ ย่อหน้า ตัวหนา และรายการ · แปลงได้ทีละหลายไฟล์ · " +
    "ยังไม่คงตาราง รูปภาพ และการจัดหน้าซับซ้อนจากไฟล์ต้นฉบับ"));

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
      if (!blocks.length) throw new Error("ไม่พบเนื้อหาข้อความในไฟล์นี้");

      st.info("กำลังจัดหน้า PDF…");
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
    if (!files.length) return st.err("กรุณาเลือกไฟล์ .docx ก่อน");
    results.innerHTML = "";
    go.disabled = true;
    const made = [];
    let failed = 0, warned = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        st.info(`กำลังแปลง ${files[i].name} (${i + 1}/${files.length})`);
        try {
          const r = await convertOne(files[i]);
          made.push({ name: stripExt(files[i].name) + ".pdf", ...r });
          warned += r.warnings;
        } catch (e) {
          failed++;
          results.appendChild(el("div", { class: "status show err" },
            `${files[i].name} — แปลงไม่สำเร็จ: ${e.message}`));
        }
        st.progress(((i + 1) / files.length) * 100);
        await yieldToBrowser();
      }
      st.progress(null);
      if (!made.length) { st.err("แปลงไม่สำเร็จสักไฟล์"); return; }

      const pages = made.reduce((a, m) => a + m.pages, 0);
      st.ok(`แปลงสำเร็จ ${made.length} ไฟล์ · รวม ${pages} หน้า` +
        (failed ? ` · ล้มเหลว ${failed} ไฟล์` : "") +
        (warned ? ` · มี ${warned} จุดที่จัดรูปแบบไม่ครบ` : ""));

      if (made.length > 1) results.appendChild(el("div", { class: "actions" }, [
        button("ดาวน์โหลดทั้งหมดเป็น ZIP", { icon: "zip",  onclick: async () => {
          const [JSZipLib] = await loadLibs("jszip");
          const zip = new JSZipLib();
          made.forEach((m) => zip.file(m.name, m.blob));
          download(await zip.generateAsync({ type: "blob" }), "เอกสารที่แปลงแล้ว.zip");
        } }),
      ]));
      made.forEach((m) => results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, m.name), el("small", {}, `${m.pages} หน้า`)]),
        el("span", { class: "r-size" }, fmtBytes(m.blob.size)),
        button("", { icon: "download", label: "ดาวน์โหลด",  onclick: () => download(m.blob, m.name) }),
      ])));
    } catch (e) {
      st.progress(null);
      st.err("แปลงไม่สำเร็จ: " + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
