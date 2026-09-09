import { openPdf, passwordBox } from "../pdfopen.js";
import { hasTextLayer } from "../ocr.js";
import { workspace } from "../workspace.js";
import { el, statusBar, button, field, select, downloadButton, dropzone,
         stripExt, fmtBytes, yieldToBrowser } from "../ui.js";
import { tr } from "../i18n.js";

// ระดับการบีบ: scale = ความละเอียดที่เรนเดอร์ · q = คุณภาพ JPEG
// ‼️ ห่อ label ด้วย tr() ตอนเรียกใช้เท่านั้น (ไม่ใช่ const ระดับบนสุด) กัน LEVELS แช่ภาษาตอนโหลดโมดูล
function levelDefs() {
  return {
    light:  { scale: 2.0, q: 0.86, label: tr("เบา", "Light") },
    medium: { scale: 1.5, q: 0.72, label: tr("ปานกลาง", "Medium") },
    strong: { scale: 1.15, q: 0.55, label: tr("แรง", "Strong") },
  };
}

// ความละเอียดของภาพ "ก่อน" ในตัวเปรียบเทียบ — คงที่ ไม่ขึ้นกับระดับที่เลือก
// เข้ารหัส PNG (ไม่สูญเสีย) เพื่อให้เป็นตัวแทน "ต้นฉบับ" ที่แท้จริง ไม่ปนอาร์ติแฟกต์ของเราเอง
const PREVIEW_BEFORE_SCALE = 2.2;

// ‼️ ฝัง <style> ในโมดูลนี้ตรง ๆ — ห้ามแก้ assets/css/tool.css (มีคนอื่นทำงานไฟล์นั้นพร้อมกัน)
const STYLE = `
.cmp-left,.cmp-right{display:flex;flex-direction:column;gap:9px}
.cmp-stats{display:flex;flex-direction:column;gap:8px;padding:12px 14px;margin-top:2px;
  background:var(--bg-soft);border:1px solid var(--line-soft);border-radius:var(--r-sm)}
.cmp-stat{display:flex;align-items:center;justify-content:space-between;font-size:13px;gap:10px}
.cmp-stat-k{color:var(--text-mute)}
.cmp-stat-v{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.cmp-stat-v.cmp-stat-good{color:var(--ok)}
.cmp-stat-v.cmp-stat-bad{color:var(--err)}

.cmp-toolbar-hint{font-size:12px;color:var(--text-mute);white-space:nowrap}

.cmp-slider{width:100%;height:100%;display:flex;align-items:center;justify-content:center}
.cmp-frame{
  position:relative;width:100%;margin:auto;overflow:hidden;border-radius:var(--r-sm);
  background:var(--bg-soft);border:1px solid var(--line-soft);
  aspect-ratio:1/1.414;max-height:min(64vh,640px);
  touch-action:none;cursor:ew-resize;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;
  --cmp-p:50%;
}
.cmp-frame:focus-visible{outline:2.5px solid var(--brand);outline-offset:2px}
.cmp-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;
  pointer-events:none;-webkit-user-drag:none;user-drag:none}
.cmp-frame.cmp-loading .cmp-img{opacity:.55;transition:opacity .15s}
.cmp-after-wrap{position:absolute;inset:0;clip-path:inset(0 0 0 var(--cmp-p));pointer-events:none}
.cmp-handle{position:absolute;top:0;bottom:0;left:var(--cmp-p);transform:translateX(-50%);
  display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:2}
.cmp-handle-line{position:absolute;top:0;bottom:0;width:2px;background:var(--card);
  box-shadow:0 0 0 1px var(--line)}
.cmp-handle-grip{width:32px;height:32px;border-radius:50%;background:var(--card);
  display:flex;align-items:center;justify-content:center;gap:5px;
  box-shadow:var(--sh2);border:1px solid var(--line-soft)}
.cmp-handle-grip::before,.cmp-handle-grip::after{content:"";width:0;height:0;
  border-top:4.5px solid transparent;border-bottom:4.5px solid transparent}
.cmp-handle-grip::before{border-right:6px solid var(--text-dim)}
.cmp-handle-grip::after{border-left:6px solid var(--text-dim)}
.cmp-tag{position:absolute;bottom:10px;z-index:2;pointer-events:none;
  background:color-mix(in srgb,var(--bg) 72%,transparent);color:var(--text);
  font-size:11.5px;font-weight:700;letter-spacing:.04em;padding:4px 10px;border-radius:999px;
  border:1px solid var(--line-soft);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.cmp-tag-before{left:10px}
.cmp-tag-after{right:10px}

.ws-footer .results{margin-top:0;flex:1 1 100%}
`;

export function mount(tool) {
  const styleEl = el("style", { text: STYLE });

  const st = statusBar();
  const results = el("div", { class: "results" });
  const extra = el("div", {});           // จุดแทรกกล่องขอรหัสผ่าน (passwordBox)
  let file = null;
  let pdfDoc = null;                     // เอกสาร pdf.js ที่เปิดค้างไว้ ใช้ร่วมกันทั้งพรีวิวและการบีบอัดจริง
  let docPromise = null;
  let previewToken = 0;                  // กันผลพรีวิวเก่าที่มาช้ามาทับของใหม่ (สลับไฟล์เร็ว ๆ)
  let beforeURL = null, afterURL = null; // object URL ของภาพพรีวิว — ต้อง revoke ของเก่าเสมอกันรั่ว

  /* ── ซ้าย: เลือกไฟล์ ───────────────────────────────────────────────── */
  const dz = dropzone({
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "PDF files"),
    accept: "application/pdf,.pdf", multiple: false, hint: tr("ครั้งละ 1 ไฟล์", "One file at a time"),
    onChange: onFileChange,
  });

  /* ── ขวา: ระดับการบีบ + ตัวเลขสรุป ─────────────────────────────────── */
  const level = select([["light", tr("เบา (คมชัดสุด)", "Light (sharpest)")], ["medium", tr("ปานกลาง (แนะนำ)", "Medium (recommended)")], ["strong", tr("แรง (ไฟล์เล็กสุด)", "Strong (smallest file)")]], "medium");
  level.addEventListener("change", () => renderAfterPreview());

  const statOrigin = el("span", { class: "cmp-stat-v" }, "-");
  const statNew = el("span", { class: "cmp-stat-v" }, "-");
  const statDiff = el("span", { class: "cmp-stat-v" }, "-");
  const statsBox = el("div", { class: "cmp-stats" }, [
    statRow(tr("ขนาดเดิม", "Original size"), statOrigin),
    statRow(tr("ขนาดใหม่", "New size"), statNew),
    statRow(tr("ลดขนาดไป", "Reduced by"), statDiff),
  ]);

  /* ── กลาง: พรีวิวเทียบก่อน–หลัง แบบลากเส้นได้ ─────────────────────── */
  const beforeImg = el("img", { class: "cmp-img cmp-before", alt: tr("ตัวอย่างก่อนบีบอัด", "Preview before compression"), draggable: "false" });
  const afterImg = el("img", { class: "cmp-img cmp-after", alt: tr("ตัวอย่างหลังบีบอัด", "Preview after compression"), draggable: "false" });
  const afterWrap = el("div", { class: "cmp-after-wrap" }, [afterImg]);
  const handle = el("div", { class: "cmp-handle" }, [
    el("div", { class: "cmp-handle-line" }),
    el("div", { class: "cmp-handle-grip" }),
  ]);
  const frame = el("div", {
    class: "cmp-frame", tabindex: "0", role: "slider",
    "aria-label": tr("ลากเพื่อเทียบภาพก่อนและหลังบีบอัด", "Drag to compare the image before and after compression"), "aria-orientation": "horizontal",
    "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "50",
  }, [
    beforeImg, afterWrap, handle,
    el("div", { class: "cmp-tag cmp-tag-before" }, tr("ก่อน", "Before")),
    el("div", { class: "cmp-tag cmp-tag-after" }, tr("หลัง", "After")),
  ]);
  const sliderWrap = el("div", { class: "cmp-slider" }, [frame]);
  wireSlider();

  const go = button(tr("บีบอัดไฟล์", "Compress file"), { onclick: () => run() });

  const ws = workspace(tool, {
    left: {
      title: tr("ไฟล์", "File"), node: el("div", { class: "cmp-left" }, [dz.container, extra]),
      hint: tr("ลากมาวาง หรือคลิกเลือก", "Drag or click to choose"),
    },
    center: {
      title: tr("พรีวิวเทียบก่อนกับหลัง", "Before and after preview"), node: sliderWrap,
      empty: tr("ยังไม่มีไฟล์ เลือก PDF เพื่อเทียบก่อนกับหลัง", "No file yet. Choose a PDF to compare"),
    },
    right: {
      title: tr("ตัวเลือก", "Options"),
      node: el("div", { class: "cmp-right" }, [field(tr("ระดับการบีบอัด", "Compression level"), level), statsBox]),
    },
    toolbar: [
      el("span", { class: "cmp-toolbar-hint" }, tr("หน้าแรก, ลากเทียบได้", "Page 1, drag to compare")),
      el("span", { class: "sep", "aria-hidden": "true" }),
      button(tr("รีเซ็ตตำแหน่ง", "Reset position"), { ghost: true, icon: "undo", onclick: () => setHandlePos(50) }),
    ],
    footer: [go, st.node, results],
    // ‼️ บอกให้ครบว่าเสียอะไรบ้าง ไม่ใช่แค่เรื่องข้อความ — วิธีนี้วาดทุกหน้าใหม่เป็นภาพ
    //    ช่องกรอกฟอร์ม ไฮไลต์ และโน้ตติดหน้าจึงหายไปทั้งหมดด้วย (ยิงจริงยืนยันแล้ว 09/09/2026)
    note: tr("แปลงแต่ละหน้าเป็นภาพ ข้อความจะคัดลอก/ค้นหาไม่ได้ ฟอร์ม ไฮไลต์ และโน้ตจะหายไป",
      "Each page becomes an image. Text can't be copied or searched, and form fields, highlights, and notes are lost"),
  });
  ws.wrap.prepend(styleEl);

  /* ── ตัวเลื่อนเทียบก่อน–หลัง: ใช้เมาส์ลาก / แตะบนมือถือ / ลูกศรคีย์บอร์ด ── */
  function wireSlider() {
    let dragging = false;
    const pctFromClientX = (x) => {
      const rect = frame.getBoundingClientRect();
      if (!rect.width) return 50;
      return Math.max(0, Math.min(100, ((x - rect.left) / rect.width) * 100));
    };
    frame.addEventListener("pointerdown", (e) => {
      if (!file) return;
      dragging = true;
      try { frame.setPointerCapture(e.pointerId); } catch { /* ยังลากต่อได้แม้จับพอยน์เตอร์ไม่สำเร็จ */ }
      setHandlePos(pctFromClientX(e.clientX));
      e.preventDefault();
    });
    frame.addEventListener("pointermove", (e) => { if (dragging) setHandlePos(pctFromClientX(e.clientX)); });
    const endDrag = (e) => {
      dragging = false;
      try { frame.releasePointerCapture(e.pointerId); } catch { /* ปล่อยไปได้เลยถ้าไม่ได้จับอยู่ */ }
    };
    frame.addEventListener("pointerup", endDrag);
    frame.addEventListener("pointercancel", endDrag);
    frame.addEventListener("keydown", (e) => {
      const cur = +frame.getAttribute("aria-valuenow") || 50;
      if (e.key === "ArrowLeft") { setHandlePos(cur - 3); e.preventDefault(); }
      else if (e.key === "ArrowRight") { setHandlePos(cur + 3); e.preventDefault(); }
      else if (e.key === "Home") { setHandlePos(0); e.preventDefault(); }
      else if (e.key === "End") { setHandlePos(100); e.preventDefault(); }
    });
  }
  function setHandlePos(pct) {
    const p = Math.max(0, Math.min(100, pct));
    frame.style.setProperty("--cmp-p", p + "%");
    frame.setAttribute("aria-valuenow", String(Math.round(p)));
  }

  function statRow(label, valueNode) {
    return el("div", { class: "cmp-stat" }, [el("span", { class: "cmp-stat-k" }, label), valueNode]);
  }
  function resetStats() {
    statOrigin.textContent = "-"; statNew.textContent = "-";
    statDiff.textContent = "-"; statDiff.className = "cmp-stat-v";
  }

  /* ── เปิดเอกสาร pdf.js ครั้งเดียวต่อไฟล์ (ขอรหัสผ่านครั้งเดียว) แล้วใช้ร่วมกัน
         ทั้งพรีวิวหน้าแรกและตอนบีบอัดจริงทุกหน้า ── */
  function getDoc() {
    if (pdfDoc) return Promise.resolve(pdfDoc);
    if (docPromise) return docPromise;
    docPromise = openPdf(file, passwordBox(extra))
      .then((doc) => { pdfDoc = doc; return doc; })
      .catch((e) => { docPromise = null; throw e; });
    return docPromise;
  }

  function onFileChange(f) {
    file = f[0] || null;
    previewToken++;
    const token = previewToken;
    st.clear();
    results.innerHTML = "";
    resetStats();
    revokePreviewUrls();
    if (pdfDoc) { try { pdfDoc.destroy(); } catch { /* เอกสารเดิมถูกทิ้งไปแล้วก็ไม่เป็นไร */ } pdfDoc = null; }
    docPromise = null;
    ws.showCanvas(false);
    if (!file) return;
    statOrigin.textContent = fmtBytes(file.size);
    loadPreview(token);
  }

  async function loadPreview(token) {
    try {
      const doc = await getDoc();
      if (token !== previewToken) return;
      await buildBeforeImage(doc, token);
      if (token !== previewToken) return;
      await renderAfterPreview(token);
      if (token !== previewToken) return;
      setHandlePos(50);
      ws.showCanvas(true);
    } catch (e) {
      if (token !== previewToken) return;
      st.err(tr("เปิดพรีวิวไม่ได้: ", "Couldn't open preview: ") + e.message);
    }
  }

  async function buildBeforeImage(doc, token) {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    frame.style.aspectRatio = `${base.width} / ${base.height}`;
    const blob = await renderPageToBlob(page, PREVIEW_BEFORE_SCALE, null);
    page.cleanup();
    if (token !== previewToken) return;
    setImgSrc(beforeImg, blob, "before");
  }

  async function renderAfterPreview(tokenArg) {
    const token = tokenArg ?? previewToken;
    if (!pdfDoc || !file) return;
    frame.classList.add("cmp-loading");
    try {
      const page = await pdfDoc.getPage(1);
      const { scale, q } = levelDefs()[level.value];
      const blob = await renderPageToBlob(page, scale, q);
      page.cleanup();
      if (token !== previewToken) return;
      setImgSrc(afterImg, blob, "after");
    } catch (e) {
      if (token === previewToken) st.err(tr("สร้างพรีวิวไม่ได้: ", "Couldn't generate preview: ") + e.message);
    } finally {
      frame.classList.remove("cmp-loading");
    }
  }

  async function renderPageToBlob(page, scale, quality) {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise((r) => canvas.toBlob(r, quality ? "image/jpeg" : "image/png", quality || undefined));
    canvas.width = canvas.height = 0;
    return blob;
  }

  function setImgSrc(imgEl, blob, which) {
    const url = URL.createObjectURL(blob);
    imgEl.src = url;
    if (which === "before") { if (beforeURL) URL.revokeObjectURL(beforeURL); beforeURL = url; }
    else { if (afterURL) URL.revokeObjectURL(afterURL); afterURL = url; }
  }
  function revokePreviewUrls() {
    if (beforeURL) { URL.revokeObjectURL(beforeURL); beforeURL = null; }
    if (afterURL) { URL.revokeObjectURL(afterURL); afterURL = null; }
    beforeImg.removeAttribute("src");
    afterImg.removeAttribute("src");
  }

  /* ── บีบอัดจริงทุกหน้า (เหมือนเดิมทุกประการ ต่างแค่ใช้เอกสารที่เปิดไว้แล้วร่วมกับพรีวิว) ── */
  async function run(allowRaster = false) {
    if (!file) return st.err(tr("เลือกไฟล์ PDF ก่อน", "Choose a PDF file first"));
    results.innerHTML = "";
    go.disabled = true;
    level.disabled = true;               // กันชนกับ getPage()/render() ของพรีวิวขณะกำลังบีบอัด
    ws.setBusy(true);
    st.info(tr("กำลังบีบอัด…", "Compressing…"));
    try {
      const { scale, q } = levelDefs()[level.value];
      const doc = await getDoc();
      const hadText = await hasTextLayer(doc);
      const { PDFDocument } = PDFLib;

      /* ‼️ ไฟล์ที่ยังค้นหาข้อความได้ ต้องลอง "บีบแบบไม่เสียข้อความ" ก่อนเสมอ
       * การวาดทุกหน้าใหม่เป็นภาพกับไฟล์ข้อความล้วนให้ผลแย่สองต่อ: ไฟล์มักใหญ่ขึ้น
       * (วัดจริงพบบวม 26-267%) และเสียชั้นข้อความไปฟรี ๆ ค้นหา/คัดลอก/อ่านด้วย
       * โปรแกรมอ่านหน้าจอไม่ได้อีกเลย · การบันทึกใหม่ผ่าน pdf-lib แบบรวม object stream
       * เก็บข้อความไว้ครบและมักเล็กลงจริงกับไฟล์ที่ยังไม่เคยถูกบีบโครงสร้างมาก่อน
       * (จับได้จาก tests/browser_chain.py โซ่ Word → PDF → รวม → บีบอัด แล้วไทยหายเกลี้ยง) */
      let losslessBlob = null;
      if (hadText) {
        try {
          const keepDoc = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()),
                                                 { ignoreEncryption: true, updateMetadata: false });
          const kept = await keepDoc.save({ useObjectStreams: true });
          if (kept.byteLength < file.size * 0.98)
            losslessBlob = new Blob([kept], { type: "application/pdf" });
        } catch { /* โหลดด้วย pdf-lib ไม่ได้ (เช่นไฟล์ใส่รหัส) ก็ไปทางวาดใหม่ตามเดิม */ }
      }

      /* ‼️ ถ้าเป็นไฟล์ที่ยังค้นหาข้อความได้ และบีบแบบไม่เสียข้อความแล้วไม่เล็กลง
       * ห้ามไปวาดใหม่เป็นภาพให้เองเงียบ ๆ — นั่นคือทำลายของที่ผู้ใช้มีอยู่เพื่อแลกกับ
       * ขนาดที่มักไม่ได้เล็กลงจริงด้วยซ้ำ · หยุดแล้วให้ผู้ใช้เลือกเองว่าจะยอมแลกไหม */
      if (hadText && !losslessBlob && !allowRaster) {
        st.progress(null);
        st.err(tr("บีบให้เล็กลงโดยไม่ทำให้ข้อความหายไม่ได้ ไฟล์นี้บีบโครงสร้างมาดีแล้ว",
                  "Can't shrink this without losing the text. Its structure is already well packed"));
        results.appendChild(el("div", { class: "note warn" }, [
          el("div", {}, tr("ถ้ายอมให้ข้อความค้นหา/คัดลอกไม่ได้ ยังบีบต่อได้ด้วยการวาดทุกหน้าใหม่เป็นภาพ",
                           "If you accept losing searchable text, it can still be compressed by redrawing every page as an image")),
          button(tr("บีบต่อโดยยอมให้ข้อความหาย", "Compress anyway, losing the text"),
                 { onclick: () => run(true) }),
        ]));
        return;
      }

      const out = await PDFDocument.create();

      for (let p = 1; !losslessBlob && p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
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

        st.progress((p / doc.numPages) * 100, `(${p}/${doc.numPages})`);
        await yieldToBrowser();
      }
      // ‼️ ไม่ doc.destroy() ที่นี่ — เอกสารนี้ใช้ร่วมกับพรีวิวตัวเลื่อน ต้องอยู่ต่อให้เปลี่ยนระดับ/บีบซ้ำได้อีก
      //    (จะถูกปิดตอนเลือกไฟล์ใหม่แทน ผ่าน onFileChange)

      const blob = losslessBlob || new Blob([await out.save()], { type: "application/pdf" });
      const keptText = !!losslessBlob;
      st.progress(null);

      const diff = 1 - blob.size / file.size;
      const name = `${stripExt(file.name)}${tr("-บีบอัด.pdf", "-compressed.pdf")}`;

      statOrigin.textContent = fmtBytes(file.size);
      statNew.textContent = fmtBytes(blob.size);
      statDiff.textContent = `${diff >= 0 ? "-" : "+"}${Math.abs(Math.round(diff * 100))}%`;
      statDiff.className = "cmp-stat-v " + (diff > 0.02 ? "cmp-stat-good" : "cmp-stat-bad");

      if (diff <= 0.02) {
        // ตรวจของจริงก่อนบอกสาเหตุ — เดาว่า "ข้อความล้วน"ทั้งที่เป็นไฟล์ภาพ
        // จะพาผู้ใช้ไปผิดทาง (ไฟล์ภาพที่บีบมาดีแล้วควรได้คำแนะนำคนละแบบ)
        const textual = hadText;
        st.err(
          tr(`ไม่เล็กลง (${fmtBytes(file.size)} → ${fmtBytes(blob.size)}): `,
             `Didn't shrink (${fmtBytes(file.size)} → ${fmtBytes(blob.size)}): `) +
          (textual
            ? tr("เป็นข้อความล้วน แปลงภาพไม่ช่วย ใช้ไฟล์เดิม",
                 "Text-only, converting won't help. Keep the original.")
            : tr("บีบมาดีแล้ว ลองระดับ “แรง” หรือใช้ไฟล์เดิม",
                 "Already well compressed, try \"Strong\" or keep it."))
        );
      } else {
        /* ‼️ เครื่องมือนี้บีบอัดด้วยการ "วาดทุกหน้าใหม่เป็นภาพ" ซึ่งทำให้ชั้นข้อความหายไปทั้งไฟล์
         * ค้นหาคำในไฟล์ไม่ได้ ลากคลุมคัดลอกไม่ได้ อ่านด้วยโปรแกรมอ่านหน้าจอไม่ได้อีกต่อไป
         * เดิมบอกเรื่องนี้เฉพาะตอน "ไม่เล็กลง" เท่านั้น พอมันเล็กลงจริงก็เงียบไปเลย
         * ทั้งที่นั่นแหละคือตอนที่ผู้ใช้เสียของไปโดยไม่รู้ตัว (จับได้จาก tests/browser_chain.py
         *  โซ่ Word → PDF → รวม → บีบอัด แล้วข้อความไทยหายเกลี้ยงตอนจบ) */
        const note = keptText
          ? tr(" (บีบโดยไม่วาดใหม่ ข้อความยังค้นหาและคัดลอกได้เหมือนเดิม)",
               " (compressed without redrawing, so text is still searchable and copyable)")
          : hadText
          ? tr(" (ไฟล์นี้เคยค้นหาข้อความได้ หลังบีบอัดจะกลายเป็นภาพ ค้นหาหรือคัดลอกข้อความไม่ได้แล้ว ถ้าต้องใช้ข้อความ ให้เก็บไฟล์เดิมไว้ด้วย)",
               " (this file had searchable text; compressing turns every page into an image, so text can no longer be searched or copied. Keep the original if you need the text.)")
          : "";
        st.ok(tr(`เล็กลง ${Math.round(diff * 100)}%, ${fmtBytes(file.size)} → ${fmtBytes(blob.size)}`,
                 `Reduced by ${Math.round(diff * 100)}%, ${fmtBytes(file.size)} → ${fmtBytes(blob.size)}`) + note);
      }
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name),
          el("small", {}, tr(`${fmtBytes(file.size)} → ${fmtBytes(blob.size)}, ระดับ${levelDefs()[level.value].label}`,
                              `${fmtBytes(file.size)} → ${fmtBytes(blob.size)}, ${levelDefs()[level.value].label} level`))]),
        downloadButton(blob, name),
      ]));
    } catch (e) {
      st.progress(null);
      st.err(tr("บีบอัดไม่ได้: ", "Couldn't compress: ") + e.message);
    } finally {
      go.disabled = false;
      level.disabled = false;
      ws.setBusy(false);
    }
  }

  return ws.wrap;
}
