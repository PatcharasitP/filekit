import { loadPdfLib, ENCRYPTED_WARNING } from "../pdfopen.js";
import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, yieldToBrowser, segmented } from "../ui.js";

// วาดข้อความลายน้ำลง canvas โปร่งใสแล้วฝังเป็นภาพ PNG
// ทำแบบนี้เพื่อให้ "ข้อความไทยใช้ได้ทันที"โดยไม่ต้องฝังฟอนต์เข้า PDF
function textToPng(text, { fontSize = 96, color = "#ff0000", weight = 700 }) {
  const pad = 24;
  const probe = document.createElement("canvas").getContext("2d");
  const font = `${weight} ${fontSize}px "Sarabun","Noto Sans Thai",sans-serif`;
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + pad * 2;
  const h = Math.ceil(fontSize * 1.6) + pad;

  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, pad, h / 2);
  return { dataUrl: canvas.toDataURL("image/png"), w, h };
}

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  let file = null;

  const dz = dropzone({
    expect: ["pdf"], expectLabel: "ไฟล์ PDF",
    accept: "application/pdf,.pdf", multiple: false, hint: "ครั้งละ 1 ไฟล์",
    onChange: (f) => { file = f[0] || null; st.clear(); results.innerHTML = ""; },
  });

  const textInput = el("input", { type: "text", value: "เอกสารลับ ห้ามเผยแพร่", placeholder: "ข้อความลายน้ำ" });
  const posSel = select([["diagonal", "ทแยงกลางหน้า"], ["center", "กลางหน้า แนวนอน"], ["footer", "ท้ายหน้า"], ["tile", "ปูเต็มหน้า"]], "diagonal");
  const colorInput = el("input", { type: "color", value: "#ff3b5c" });
  const opacity = el("input", { type: "range", min: "5", max: "60", value: "18" });
  const oLabel = el("small", {}, "ความเข้ม 18%");
  opacity.addEventListener("input", () => { oLabel.textContent = `ความเข้ม ${opacity.value}%`; });
  const sizeSel = segmented([["small", "เล็ก"], ["medium", "กลาง"], ["large", "ใหญ่"]], "medium");

  const go = button("ใส่ลายน้ำ", { onclick: run });
  body.append(dz.container,
    el("div", { class: "row" }, [
      field("ข้อความลายน้ำ", textInput),
      field("ตำแหน่ง", posSel),
      field("สี", colorInput),
      el("label", { class: "field" }, [el("span", {}, "ความเข้ม"), opacity, oLabel]),
      field("ขนาด", sizeSel),
    ]),
    el("div", { class: "actions" }, [go]), st.node, results);
  body.appendChild(el("div", { class: "note" },
    "ลายน้ำเป็นภาพวางทับบนเนื้อหาเดิม ไม่แก้ไขข้อความในไฟล์ต้นฉบับ · รองรับข้อความไทยเต็มรูปแบบ · " +
    "หมายเหตุ: ลายน้ำแบบนี้ป้องกันการคัดลอกภาพหน้าจอไม่ได้ ใช้เพื่อระบุสถานะเอกสารเป็นหลัก"));

  async function run() {
    if (!file) return st.err("กรุณาเลือกไฟล์ PDF ก่อน");
    const text = textInput.value.trim();
    if (!text) return st.err("กรุณาพิมพ์ข้อความลายน้ำ");
    results.innerHTML = "";
    go.disabled = true;
    st.info("กำลังใส่ลายน้ำ…");
    try {
      const { PDFDocument, degrees } = PDFLib;
      const { doc, encrypted } = await loadPdfLib(file);
      const { dataUrl, w, h } = textToPng(text, { color: colorInput.value });
      const png = await doc.embedPng(dataUrl);
      const alpha = +opacity.value / 100;
      const pages = doc.getPages();

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const { width: pw, height: ph } = page.getSize();
        const scaleBase = { small: 0.35, medium: 0.55, large: 0.78 }[sizeSel.value];

        if (posSel.value === "tile") {
          const s = (pw * 0.32) / w;
          const tw = w * s, th = h * s;
          for (let x = -tw; x < pw + tw; x += tw * 1.25) {
            for (let y = 0; y < ph + th; y += th * 3) {
              page.drawImage(png, { x, y, width: tw, height: th, opacity: alpha, rotate: degrees(30) });
            }
          }
        } else if (posSel.value === "diagonal") {
          const s = (pw * scaleBase * 1.5) / w;
          const tw = w * s, th = h * s;
          // pdf-lib หมุนรอบมุมล่างซ้ายของภาพ ไม่ใช่จุดกึ่งกลาง จึงต้องคำนวณย้อน
          // ว่าต้องวางมุมนั้นไว้ตรงไหน จุดกึ่งกลางภาพหลังหมุนจึงจะตกกลางหน้าพอดี
          const rad = (35 * Math.PI) / 180;
          const cx = (tw / 2) * Math.cos(rad) - (th / 2) * Math.sin(rad);
          const cy = (tw / 2) * Math.sin(rad) + (th / 2) * Math.cos(rad);
          page.drawImage(png, {
            x: pw / 2 - cx, y: ph / 2 - cy,
            width: tw, height: th, opacity: alpha, rotate: degrees(35),
          });
        } else if (posSel.value === "center") {
          const s = (pw * scaleBase) / w;
          page.drawImage(png, { x: (pw - w * s) / 2, y: (ph - h * s) / 2, width: w * s, height: h * s, opacity: alpha });
        } else {
          const s = (pw * scaleBase * 0.55) / w;
          page.drawImage(png, { x: (pw - w * s) / 2, y: 24, width: w * s, height: h * s, opacity: alpha });
        }
        if (i % 20 === 0) { st.progress(((i + 1) / pages.length) * 100, `(${i + 1}/${pages.length})`); await yieldToBrowser(); }
      }

      const blob = new Blob([await doc.save()], { type: "application/pdf" });
      st.progress(null);
      st.ok(`ใส่ลายน้ำครบ ${pages.length} หน้า`);
      if (encrypted) results.appendChild(el("div", { class: "status show err" }, ENCRYPTED_WARNING));
      const name = stripExt(file.name) + "-ลายน้ำ.pdf";
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, `${pages.length} หน้า`)]),
        button("ดาวน์โหลด", { icon: "download",  onclick: () => download(blob, name) }),
      ]));
    } catch (e) {
      st.progress(null);
      st.err("ใส่ลายน้ำไม่สำเร็จ: " + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
