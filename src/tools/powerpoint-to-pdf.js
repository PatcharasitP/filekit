import { el, dropzone, toolShell, statusBar, button, field, select, downloadButton,
         stripExt, yieldToBrowser, segmented, fmtBytes } from "../ui.js";
import { readPptx } from "../pptx.js";
import { useThaiFont, warmThaiFont, THAI_FONT, splitThaiTextToSize } from "../thaifont.js";
import { tr, pl } from "../i18n.js";

// สัดส่วนหน้าสไลด์ (หน่วย pt) — 16:9 คือค่าเริ่มต้นของ PowerPoint ยุคปัจจุบัน
const SIZES = { "16:9": [960, 540], "4:3": [720, 540] };

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  let file = null;
  let includeHiddenSlides = false;
  warmThaiFont();

  const dz = dropzone({
    expect: ["pptx"], expectLabel: tr("ไฟล์ PowerPoint (.pptx)", "PowerPoint files (.pptx)"),
    accept: ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation",
    multiple: false, hint: tr(".pptx (PowerPoint 2007+)", ".pptx (PowerPoint 2007+)"),
    onChange: (f) => { file = f[0] || null; st.clear(); results.innerHTML = ""; includeHiddenSlides = false; },
  });

  const ratio = segmented([["16:9", "16:9"], ["4:3", "4:3"]], "16:9");
  const theme = select([["light", tr("พื้นขาว ตัวอักษรเข้ม", "Light background, dark text")], ["dark", tr("พื้นเข้ม ตัวอักษรสว่าง", "Dark background, light text")]], "light");
  const withNotes = select([["no", tr("ไม่ใส่โน้ต", "No notes")], ["yes", tr("ใส่โน้ตท้ายสไลด์", "Add notes at bottom")]], "no");
  const go = button(tr("สร้างไฟล์ PDF", "Create PDF"), { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [field(tr("สัดส่วนสไลด์", "Slide ratio"), ratio), field(tr("ธีมสี", "Color theme"), theme), field(tr("โน้ตผู้บรรยาย", "Speaker notes"), withNotes)]),
    el("div", { class: "actions" }, [go]), st.node, results);
  body.appendChild(el("div", { class: "note" },
    tr("สำคัญ: จัดหน้าใหม่จากข้อความ ไม่คงดีไซน์เดิม (ต้องเป๊ะ ใช้ PowerPoint → Save as PDF)",
    "Note: rebuilds layout from text. Design not kept (need it exact? use PowerPoint's Save as PDF)")));

  async function run() {
    if (!file) return st.err(tr("กรุณาเลือกไฟล์ .pptx ก่อน", "Please choose a .pptx file first"));
    results.innerHTML = "";
    go.disabled = true;
    st.info(tr("กำลังอ่านสไลด์…", "Reading slides…"));
    try {
      const { slides, hiddenCount } = await readPptx(file, {
        includeHidden: includeHiddenSlides,
        onProgress: (p) => st.progress((p.current / p.total) * 100, tr(`(${p.current}/${p.total} สไลด์)`, `(${p.current}/${pl(p.total, "slide", "slides")})`)),
      });

      st.info(tr("กำลังจัดหน้า PDF…", "Laying out the PDF…"));
      const [W, H] = SIZES[ratio.value];
      const { jsPDF } = jspdf;
      const doc = new jsPDF({ unit: "pt", format: [W, H], orientation: "landscape" });
      await useThaiFont(doc, "both");

      const dark = theme.value === "dark";
      const bg = dark ? [18, 20, 34] : [255, 255, 255];
      const fg = dark ? [238, 240, 248] : [22, 26, 44];
      const accent = [108, 140, 255];
      const M = 56;

      slides.forEach((s, i) => {
        if (i > 0) doc.addPage([W, H], "landscape");
        doc.setFillColor(...bg);
        doc.rect(0, 0, W, H, "F");

        // แถบสีบาง ๆ ด้านบน ให้ดูเป็นสไลด์ ไม่ใช่หน้ากระดาษเปล่า
        doc.setFillColor(...accent);
        doc.rect(0, 0, W, 6, "F");

        let y = M + 10;
        doc.setFont(THAI_FONT, "bold");
        doc.setFontSize(30);
        doc.setTextColor(...fg);
        const title = s.title || tr(`สไลด์ ${s.no}`, `Slide ${s.no}`);
        for (const line of splitThaiTextToSize(doc, title, W - M * 2)) {
          doc.text(line, M, y); y += 38;
        }

        doc.setDrawColor(...accent);
        doc.setLineWidth(2);
        doc.line(M, y - 14, M + 64, y - 14);
        y += 14;

        doc.setFont(THAI_FONT, "normal");
        doc.setFontSize(18);
        for (const p of s.paras) {
          const indent = p.level * 22;
          const lines = splitThaiTextToSize(doc, "• " + p.text, W - M * 2 - indent);
          for (const line of lines) {
            if (y > H - M) break;   // เนื้อหาเกินหน้า ตัดที่ขอบ (สไลด์คือ 1 หน้าเสมอ)
            doc.text(line, M + indent, y);
            y += 26;
          }
        }

        if (withNotes.value === "yes" && s.notes && y < H - M - 20) {
          doc.setFontSize(12);
          doc.setTextColor(dark ? 150 : 120, dark ? 155 : 125, dark ? 175 : 145);
          for (const line of splitThaiTextToSize(doc, tr("โน้ต: ", "Notes: ") + s.notes, W - M * 2)) {
            if (y > H - M) break;
            doc.text(line, M, y); y += 16;
          }
        }

        // เลขหน้ามุมขวาล่าง
        doc.setFont(THAI_FONT, "normal");
        doc.setFontSize(11);
        doc.setTextColor(dark ? 130 : 150, dark ? 135 : 155, dark ? 155 : 175);
        doc.text(String(s.no), W - M, H - 24, { align: "right" });
      });

      const blob = doc.output("blob");
      st.progress(null);
      // นับของที่แปลงเป็นข้อความไม่ได้ เพื่อบอกผู้ใช้ตรง ๆ แทนที่จะให้หายไปเงียบ ๆ
      const skipped = slides.reduce((n, s) => n + (s.charts || 0) + (s.diagrams || 0), 0);
      st.ok(tr(`สร้าง PDF สำเร็จ ${slides.length} หน้า (1 สไลด์ = 1 หน้า)`, `Done, ${pl(slides.length, "page", "pages")} (1 slide = 1 page)`) + (skipped
        ? tr(` (มีกราฟ/แผนภาพ ${skipped} ชิ้นที่แปลงเป็นข้อความไม่ได้ ตารางถูกแปลงเป็นบรรทัดข้อความให้แล้ว)`,
             ` (${skipped} chart(s)/diagram(s) could not be turned into text; tables were converted into text lines)`)
        : ""));
      const name = stripExt(file.name) + ".pdf";
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, tr(`${slides.length} สไลด์, ${ratio.value}`, `${pl(slides.length, "slide", "slides")}, ${ratio.value}`))]),
        el("span", { class: "r-size" }, fmtBytes(blob.size)),
        downloadButton(blob, name),
      ]));
      // สไลด์ที่ผู้พูดสั่งซ่อนไว้ (show="0") ไม่ควรโผล่ในไฟล์ที่แชร์ออกไปแบบเงียบ ๆ — บอกจำนวน
      // ที่ข้ามไป + ให้ผู้ใช้เลือกเองได้ว่าจะรวมด้วยไหม (ลอก pattern เดียวกับ excel-to-pdf)
      if (hiddenCount && !includeHiddenSlides) results.appendChild(el("div", { class: "note warn" }, [
        el("div", {}, tr(`ข้ามสไลด์ที่ซ่อนไว้ ${hiddenCount} สไลด์ เพราะมักเป็นของที่ตั้งใจไม่ให้แสดง`,
                         `Skipped ${hiddenCount} hidden slide(s) because they are usually meant to stay unshown`)),
        button(tr("แปลงสไลด์ที่ซ่อนด้วย", "Include the hidden slides too"),
               { onclick: () => { includeHiddenSlides = true; run(); } }),
      ]));
      await yieldToBrowser();
    } catch (e) {
      st.progress(null);
      st.err(tr("สร้าง PDF ไม่สำเร็จ: ", "Could not create PDF: ") + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
