import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, fmtBytes, yieldToBrowser } from "../ui.js";

// ระดับการบีบ: scale = ความละเอียดที่เรนเดอร์ · q = คุณภาพ JPEG
const LEVELS = {
  light:  { scale: 2.0, q: 0.86, label: "เบา" },
  medium: { scale: 1.5, q: 0.72, label: "ปานกลาง" },
  strong: { scale: 1.15, q: 0.55, label: "แรง" },
};

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  let file = null;

  const dz = dropzone({
    accept: "application/pdf,.pdf", multiple: false, hint: "ครั้งละ 1 ไฟล์",
    onChange: (f) => {
      file = f[0] || null;
      st.clear(); results.innerHTML = "";
      origin.textContent = file ? `ขนาดต้นฉบับ ${fmtBytes(file.size)}` : "";
    },
  });
  const origin = el("div", { class: "dz-count" });

  const level = select([["light", "เบา — คงความคมไว้มาก"], ["medium", "ปานกลาง — แนะนำ"], ["strong", "แรง — ไฟล์เล็กสุด"]], "medium");
  const go = button("🗜️ บีบอัดไฟล์", { onclick: run });

  body.append(dz.container, origin,
    el("div", { class: "row" }, [field("ระดับการบีบอัด", level)]),
    el("div", { class: "actions" }, [go]), st.node, results);
  body.appendChild(el("div", { class: "note" },
    "วิธีนี้เรนเดอร์แต่ละหน้าเป็นภาพแล้วประกอบกลับเป็น PDF ใหม่ — ได้ผลดีมากกับไฟล์สแกนหรือไฟล์ที่มีรูปเยอะ " +
    "แต่ข้อความในไฟล์จะกลายเป็นภาพ (คัดลอก/ค้นหาข้อความไม่ได้อีก) · " +
    "ถ้าไฟล์เป็นข้อความล้วนอยู่แล้ว การบีบแบบนี้อาจได้ไฟล์ใหญ่ขึ้น ระบบจะเตือนให้ทราบ"));

  async function run() {
    if (!file) return st.err("กรุณาเลือกไฟล์ PDF ก่อน");
    results.innerHTML = "";
    go.disabled = true;
    st.info("กำลังบีบอัด…");
    try {
      const { scale, q } = LEVELS[level.value];
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
      const { PDFDocument } = PDFLib;
      const out = await PDFDocument.create();

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", q));
        canvas.width = canvas.height = 0;

        const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
        const base = page.getViewport({ scale: 1 });
        const newPage = out.addPage([base.width, base.height]);
        newPage.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
        page.cleanup();

        st.progress((p / pdf.numPages) * 100, `(${p}/${pdf.numPages})`);
        await yieldToBrowser();
      }
      pdf.destroy();

      const bytes = await out.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      st.progress(null);

      const diff = 1 - blob.size / file.size;
      const name = `${stripExt(file.name)}-บีบอัด.pdf`;
      if (diff <= 0.02) {
        st.err(`บีบแล้วไม่เล็กลง (${fmtBytes(file.size)} → ${fmtBytes(blob.size)}) — ไฟล์นี้น่าจะเป็นข้อความล้วนอยู่แล้ว แนะนำให้ใช้ไฟล์เดิมต่อไป`);
      } else {
        st.ok(`เล็กลง ${Math.round(diff * 100)}% · ${fmtBytes(file.size)} → ${fmtBytes(blob.size)}`);
      }
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name),
          el("small", {}, `${fmtBytes(file.size)} → ${fmtBytes(blob.size)} · ระดับ${LEVELS[level.value].label}`)]),
        button("⬇ ดาวน์โหลด", { onclick: () => download(blob, name) }),
      ]));
    } catch (e) {
      st.progress(null);
      st.err("บีบอัดไม่สำเร็จ: " + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
