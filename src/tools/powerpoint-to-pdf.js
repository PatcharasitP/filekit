import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, yieldToBrowser, segmented } from "../ui.js";
import { readPptx } from "../pptx.js";
import { useThaiFont, warmThaiFont, THAI_FONT } from "../thaifont.js";

// สัดส่วนหน้าสไลด์ (หน่วย pt) — 16:9 คือค่าเริ่มต้นของ PowerPoint ยุคปัจจุบัน
const SIZES = { "16:9": [960, 540], "4:3": [720, 540] };

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  let file = null;
  warmThaiFont();

  const dz = dropzone({
    expect: ["pptx"], expectLabel: "ไฟล์ PowerPoint (.pptx)",
    accept: ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation",
    multiple: false, hint: "รองรับไฟล์ .pptx (PowerPoint 2007 ขึ้นไป)",
    onChange: (f) => { file = f[0] || null; st.clear(); results.innerHTML = ""; },
  });

  const ratio = segmented([["16:9", "16:9"], ["4:3", "4:3"]], "16:9");
  const theme = select([["light", "พื้นขาว ตัวอักษรเข้ม"], ["dark", "พื้นเข้ม ตัวอักษรสว่าง"]], "light");
  const withNotes = select([["no", "ไม่ใส่โน้ต"], ["yes", "ใส่โน้ตผู้บรรยายท้ายสไลด์"]], "no");
  const go = button("สร้างไฟล์ PDF", { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [field("สัดส่วนสไลด์", ratio), field("ธีมสี", theme), field("โน้ตผู้บรรยาย", withNotes)]),
    el("div", { class: "actions" }, [go]), st.node, results);
  body.appendChild(el("div", { class: "note" },
    "สำคัญ: เครื่องมือนี้จัดหน้าสไลด์ขึ้นใหม่จากข้อความในไฟล์ ไม่ได้คัดลอกหน้าตาเดิม — " +
    "สี ฟอนต์ รูปภาพ กราฟ และตำแหน่งของต้นฉบับจะไม่ถูกคงไว้ (การคงดีไซน์เป๊ะต้องใช้ PowerPoint เปิดแล้วสั่ง Save as PDF) · " +
    "เหมาะกับการทำเอกสารอ่านเนื้อหา แจกในที่ประชุม หรือส่งให้คนที่ไม่มี PowerPoint"));

  async function run() {
    if (!file) return st.err("กรุณาเลือกไฟล์ .pptx ก่อน");
    results.innerHTML = "";
    go.disabled = true;
    st.info("กำลังอ่านสไลด์…");
    try {
      const { slides } = await readPptx(file, {
        onProgress: (p) => st.progress((p.current / p.total) * 100, `(${p.current}/${p.total} สไลด์)`),
      });

      st.info("กำลังจัดหน้า PDF…");
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
        const title = s.title || `สไลด์ ${s.no}`;
        for (const line of doc.splitTextToSize(title, W - M * 2)) {
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
          const lines = doc.splitTextToSize(("• " + p.text), W - M * 2 - indent);
          for (const line of lines) {
            if (y > H - M) break;   // เนื้อหาเกินหน้า ตัดที่ขอบ (สไลด์คือ 1 หน้าเสมอ)
            doc.text(line, M + indent, y);
            y += 26;
          }
        }

        if (withNotes.value === "yes" && s.notes && y < H - M - 20) {
          doc.setFontSize(12);
          doc.setTextColor(dark ? 150 : 120, dark ? 155 : 125, dark ? 175 : 145);
          for (const line of doc.splitTextToSize("โน้ต: " + s.notes, W - M * 2)) {
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
      st.ok(`สร้าง PDF สำเร็จ ${slides.length} หน้า (1 สไลด์ = 1 หน้า)`);
      const name = stripExt(file.name) + ".pdf";
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, `${slides.length} สไลด์ · ${ratio.value}`)]),
        button("ดาวน์โหลด", { icon: "download",  onclick: () => download(blob, name) }),
      ]));
      await yieldToBrowser();
    } catch (e) {
      st.progress(null);
      st.err("สร้าง PDF ไม่สำเร็จ: " + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
