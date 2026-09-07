import { loadPdfLib, ENCRYPTED_WARNING } from "../pdfopen.js";
import { el, dropzone, statusBar, button, field, select, download,
         stripExt, yieldToBrowser, segmented } from "../ui.js";
import { workspace } from "../workspace.js";

// วาดข้อความลายน้ำลง canvas โปร่งใสแล้วฝังเป็นภาพ PNG
// ทำแบบนี้เพื่อให้ "ข้อความไทยใช้ได้ทันที"โดยไม่ต้องฝังฟอนต์เข้า PDF
const WM_FONT = 96, WM_PAD = 24;
function textToPng(text, { fontSize = WM_FONT, color = "#ff0000", weight = 700 }) {
  const pad = WM_PAD;
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

// สัดส่วนขนาดลายน้ำเทียบความกว้างหน้า — ตัวเดียวกันใช้ทั้งตอนสร้างไฟล์จริง (run)
// และตอนวาดพรีวิว (drawPreview) กันสองที่นี้เพี้ยนไปคนละทาง
const SIZE_SCALE = { small: 0.35, medium: 0.55, large: 0.78 };

// ── คำนวณ font-size ของพรีวิวให้ "กว้างพอดี" กับสัดส่วนหน้าเป้าหมาย เหมือนของจริงเป๊ะ ──
// ของจริง (run): แปลงข้อความเป็น PNG กว้าง w = ความกว้างตัวอักษร@96px + ขอบ 48px แล้วย่อภาพนั้น
// ให้กว้างเท่า targetWidth เสมอ (ไม่ว่าข้อความสั้นยาวแค่ไหน) — ผลคือ "ข้อความยาว = ตัวเล็กลงอัตโนมัติ"
// พรีวิวนี้จำลองด้วยสูตรเดียวกัน: วัดความกว้างข้อความที่ 96px จริงด้วย canvas แล้วคำนวณย้อนหา
// font-size ที่ทำให้ภาพ (ตัวอักษร+ขอบ) กว้างเท่า targetWidth พอดี กันข้อความยาวล้นกระดาษ
const measureCtx = document.createElement("canvas").getContext("2d");
function fontSizeForWidth(text, targetWidth) {
  measureCtx.font = `700 ${WM_FONT}px "Sarabun","Noto Sans Thai",sans-serif`;
  const w96 = measureCtx.measureText(text).width + WM_PAD * 2;
  return Math.max(6, (WM_FONT * targetWidth) / w96);
}

// สไตล์เฉพาะเครื่องมือนี้ — ฝังในโมดูลเพราะแก้ assets/css/tool.css ไม่ได้ (มีคนอื่นทำงานอยู่)
// #fff/สีดำโปร่งแสงของ "กระดาษจำลอง" ตั้งใจไม่ผูกกับธีม เหมือน .sign-stage/.pg canvas เดิม
// ที่ใช้ background:#fff ตรง ๆ เพราะกระดาษจริงเป็นสีขาวเสมอไม่ว่าเว็บจะธีมมืดหรือสว่าง
const STYLE = `
.wmp-toolbar-note{font-size:12px;color:var(--text-mute);line-height:1.5}
.wmp-stage{display:flex;flex-direction:column;gap:10px;align-items:center;margin:auto;width:100%;max-width:420px}
.wmp-stage[hidden]{display:none}
.wmp-meta{font-size:12px;color:var(--text-mute);text-align:center;min-height:1.4em}
.wmp-page{
  position:relative;width:100%;aspect-ratio:210/297;background:#fff;
  border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden;box-shadow:var(--sh2);
}
.wmp-content{position:absolute;inset:0;padding:9% 11%;display:flex;flex-direction:column;gap:6%}
.wmp-line{height:2.6%;min-height:3px;border-radius:2px;background:rgba(0,0,0,.12)}
.wmp-title{width:52%;height:4.2%;min-height:5px;margin-bottom:2%;background:rgba(0,0,0,.32)}
.wmp-wm-layer{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.wmp-wm-text{position:absolute;left:50%;font-weight:700;font-family:inherit;white-space:nowrap;line-height:1.15}
.wmp-wm-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  padding:12%;text-align:center;font-size:12.5px;color:rgba(0,0,0,.38);font-weight:500}
.wmp-wm-tile{position:absolute;inset:-25%;display:flex;flex-wrap:wrap;align-content:space-evenly;justify-content:space-evenly}
.wmp-wm-tile .wmp-wm-text{position:static}
`;

export function mount(tool) {
  let file = null;
  let meta = null; // { pages, w, h } จาก pdf-lib ของไฟล์ที่เลือกอยู่

  const results = el("div", { class: "results" });

  // ── ตัวเลือกทั้งหมด (แผงขวา) — ความสามารถเดิมทุกตัว ──────────────────
  const textInput = el("input", { type: "text", value: "เอกสารลับ ห้ามเผยแพร่", placeholder: "ข้อความลายน้ำ" });
  const posSel = select([["diagonal", "ทแยงกลางหน้า"], ["center", "กลางหน้า แนวนอน"], ["footer", "ท้ายหน้า"], ["tile", "ปูเต็มหน้า"]], "diagonal");
  const colorInput = el("input", { type: "color", value: "#ff3b5c" });
  const opacity = el("input", { type: "range", min: "5", max: "60", value: "18" });
  const oLabel = el("small", {}, "ความเข้ม 18%");
  const sizeSel = segmented([["small", "เล็ก"], ["medium", "กลาง"], ["large", "ใหญ่"]], "medium");

  const rightBox = el("div", {}, [
    field("ข้อความลายน้ำ", textInput),
    field("ตำแหน่ง", posSel),
    field("สี", colorInput),
    el("label", { class: "field" }, [el("span", {}, "ความเข้ม"), opacity, oLabel]),
    field("ขนาด", sizeSel),
  ]);

  // ── พรีวิวกระดาษจำลอง (แผงกลาง) ──────────────────────────────────────
  // ไม่มี pdfjs ในเครื่องมือนี้ (ดู registry.js libs) จึงไม่เรนเดอร์เนื้อหาไฟล์จริง
  // แต่ยังอ่านจำนวนหน้า/ขนาดหน้าจริงได้ด้วย pdf-lib (ไม่ต้องแก้ registry) ให้สัดส่วนกระดาษตรงของจริง
  const wmLayer = el("div", { class: "wmp-wm-layer" });
  const contentMock = el("div", { class: "wmp-content" }, [
    el("div", { class: "wmp-line wmp-title" }),
    ...Array.from({ length: 12 }, (_, i) =>
      el("div", { class: "wmp-line", style: { width: ["96%", "100%", "88%", "62%"][i % 4] } })),
  ]);
  const paper = el("div", { class: "wmp-page" }, [contentMock, wmLayer]);
  const metaLine = el("div", { class: "wmp-meta" });
  const stage = el("div", { class: "wmp-stage" }, [metaLine, paper]);

  function drawPreview() {
    wmLayer.innerHTML = "";
    const text = textInput.value.trim();
    if (!text) {
      wmLayer.appendChild(el("div", { class: "wmp-wm-empty" }, "พิมพ์ข้อความลายน้ำเพื่อดูตัวอย่าง"));
      return;
    }
    const pw = paper.clientWidth || 300;
    const color = colorInput.value;
    const alpha = +opacity.value / 100;
    const pos = posSel.value;
    const scale = SIZE_SCALE[sizeSel.value];

    if (pos === "tile") {
      // ของจริงในโหมด "ปูเต็มหน้า" ใช้ความกว้างเป้าหมายคงที่ 0.32×pw เสมอ ไม่ผูกกับตัวเลือก
      // "ขนาด" เลย (ดูฟังก์ชัน run) — พรีวิวจึงทำตามของจริงเพื่อไม่ให้เข้าใจผิดว่าปรับได้ในโหมดนี้
      const fs = fontSizeForWidth(text, pw * 0.32);
      const grid = el("div", { class: "wmp-wm-tile", style: { transform: "rotate(30deg)", opacity: alpha, color } });
      for (let i = 0; i < 28; i++) grid.appendChild(el("span", { class: "wmp-wm-text", style: { fontSize: fs + "px" } }, text));
      wmLayer.appendChild(grid);
      return;
    }

    // ความกว้างเป้าหมายตรงตามสัดส่วนที่ run() ใช้จริงทุกตำแหน่ง (scaleBase ×1.5 / ×1 / ×0.55)
    const mult = pos === "diagonal" ? 1.5 : pos === "footer" ? 0.55 : 1;
    const fs = fontSizeForWidth(text, pw * scale * mult);
    const span = el("span", { class: "wmp-wm-text", style: { color, opacity: alpha, fontSize: fs + "px" } }, text);
    if (pos === "diagonal") {
      span.style.top = "50%";
      span.style.transform = "translate(-50%,-50%) rotate(-35deg)";
    } else if (pos === "footer") {
      span.style.bottom = "6%";
      span.style.transform = "translateX(-50%)";
    } else {
      span.style.top = "50%";
      span.style.transform = "translate(-50%,-50%)";
    }
    wmLayer.appendChild(span);
  }

  if (typeof ResizeObserver !== "undefined") new ResizeObserver(drawPreview).observe(paper);
  [textInput, colorInput, opacity].forEach((n) => n.addEventListener("input", drawPreview));
  opacity.addEventListener("input", () => { oLabel.textContent = `ความเข้ม ${opacity.value}%`; });
  posSel.addEventListener("change", drawPreview);
  sizeSel.addEventListener("change", drawPreview);

  // ── แผงซ้าย: เลือกไฟล์ + รายการไฟล์ ───────────────────────────────────
  const dz = dropzone({
    expect: ["pdf"], expectLabel: "ไฟล์ PDF",
    accept: "application/pdf,.pdf", multiple: false, hint: "ครั้งละ 1 ไฟล์",
    onChange: (f) => onFileChange(f[0] || null),
  });

  async function onFileChange(f) {
    file = f;
    st.clear(); results.innerHTML = "";
    if (!file) { meta = null; ws.showCanvas(false); return; }
    ws.setBusy(true);
    try {
      const { doc } = await loadPdfLib(file);
      const first = doc.getPage(0);
      const { width, height } = first.getSize();
      meta = { pages: doc.getPageCount(), w: width, h: height };
      paper.style.aspectRatio = `${width} / ${height}`;
      metaLine.textContent = `ตัวอย่างหน้าแรก (ทั้งไฟล์มี ${meta.pages} หน้า · ${Math.round(width)}×${Math.round(height)} pt)`;
      ws.showCanvas(true);
      drawPreview();
    } catch (e) {
      meta = null;
      ws.showCanvas(false);
      st.err("เปิดไฟล์เพื่อดูตัวอย่างไม่สำเร็จ: " + e.message);
    } finally { ws.setBusy(false); }
  }

  // ── แถบล่าง: ปุ่มสร้าง + สถานะ ─────────────────────────────────────────
  const go = button("ใส่ลายน้ำ", { onclick: run });
  const st = statusBar();

  const ws = workspace(tool, {
    left: { title: "ไฟล์ PDF", node: dz.container },
    center: { node: stage, empty: "ยังไม่มีไฟล์ — เลือกไฟล์ PDF ก่อนเพื่อดูตัวอย่างลายน้ำ" },
    right: { title: "ตัวเลือกลายน้ำ", node: rightBox },
    toolbar: [el("div", { class: "wmp-toolbar-note" }, "พรีวิวจำลอง — ตำแหน่ง สี ความเข้ม ขนาด ตรงกับค่าที่ตั้งจริง (ไม่ใช่เนื้อหาไฟล์จริง)")],
    footer: [go, st.node],
    note: "ลายน้ำเป็นภาพวางทับบนเนื้อหาเดิม ไม่แก้ไขข้อความในไฟล์ต้นฉบับ · รองรับข้อความไทยเต็มรูปแบบ · " +
      "หมายเหตุ: ลายน้ำแบบนี้ป้องกันการคัดลอกภาพหน้าจอไม่ได้ ใช้เพื่อระบุสถานะเอกสารเป็นหลัก",
  });
  ws.showCanvas(false);
  ws.wrap.prepend(el("style", {}, STYLE));
  ws.body.appendChild(results);
  drawPreview();

  async function run() {
    if (!file) return st.err("กรุณาเลือกไฟล์ PDF ก่อน");
    const text = textInput.value.trim();
    if (!text) return st.err("กรุณาพิมพ์ข้อความลายน้ำ");
    results.innerHTML = "";
    go.disabled = true;
    ws.setBusy(true);
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
        const scaleBase = SIZE_SCALE[sizeSel.value];

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
        button("ดาวน์โหลด", { icon: "download", onclick: () => download(blob, name) }),
      ]));
    } catch (e) {
      st.progress(null);
      st.err("ใส่ลายน้ำไม่สำเร็จ: " + e.message);
    } finally { go.disabled = false; ws.setBusy(false); }
  }
  return ws.wrap;
}
