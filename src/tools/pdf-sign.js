import { el, dropzone, toolShell, statusBar, button, download, stripExt, fmtBytes, yieldToBrowser } from "../ui.js";
import { uiIcon } from "../icons.js";
import { openPdf, passwordBox, loadPdfLib, ENCRYPTED_WARNING } from "../pdfopen.js";
import { signaturePad, savedSignatures, saveSignature, removeSignature, imageToSignature } from "../signpad.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const extra = el("div", {});
  const results = el("div", { class: "results" });

  let file = null, pdf = null, pageCount = 0, current = 1;
  let signature = null;                 // dataURL ของลายเซ็นที่เลือกอยู่
  const placed = [];                    // [{page, rx, ry, rw, dataUrl}] เก็บเป็นสัดส่วนของหน้า

  const dz = dropzone({
    expect: ["pdf"], expectLabel: "ไฟล์ PDF", accept: "application/pdf,.pdf", multiple: false,
    hint: "ครั้งละ 1 ไฟล์",
    onChange: (f) => { file = f[0] || null; openDoc(); },
  });

  // ── ส่วนสร้างลายเซ็น ─────────────────────────────────────────────────────
  const pad = signaturePad({ onChange: () => refreshPad() });
  const padUse = button("ใช้ลายเซ็นนี้", { onclick: useDrawn });
  const padClear = button("ล้าง", { ghost: true, onclick: () => pad.clear() });
  const upInput = el("input", { type: "file", accept: "image/*", hidden: true,
    onchange: async (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) await useImage(f); } });
  const savedBox = el("div", { class: "sign-saved" });

  const signSection = el("div", { class: "panel sign-panel" }, [
    el("h3", { class: "sign-h" }, "ลายเซ็นของคุณ"),
    el("p", { class: "mm-label" }, "วาดในกรอบด้านล่าง (ใช้นิ้วบนมือถือได้) หรืออัปโหลดรูปลายเซ็นที่ถ่าย/สแกนไว้"),
    el("div", { class: "sign-pad-wrap" }, [pad.node]),
    el("div", { class: "actions" }, [padUse, padClear,
      button("อัปโหลดรูปลายเซ็น", { ghost: true, onclick: () => upInput.click() }), upInput]),
    savedBox,
  ]);

  // ── ส่วนแสดงหน้า PDF ─────────────────────────────────────────────────────
  const stage = el("div", { class: "sign-stage" });
  const pageCanvas = el("canvas", { class: "sign-page" });
  const layer = el("div", { class: "sign-layer" });
  stage.append(pageCanvas, layer);

  const prevBtn = button("หน้าก่อน", { ghost: true, onclick: () => gotoPage(current - 1) });
  const nextBtn = button("หน้าถัดไป →", { ghost: true, onclick: () => gotoPage(current + 1) });
  const pageLabel = el("span", { class: "sign-pageno" });
  const viewer = el("div", { class: "panel sign-viewer", hidden: true }, [
    el("div", { class: "sign-bar" }, [prevBtn, pageLabel, nextBtn,
      el("span", { class: "sp", style: { flex: "1" } }),
      button("ลบลายเซ็นในหน้านี้", { ghost: true, danger: true, onclick: clearPage })]),
    el("div", { class: "sign-wrap" }, [stage]),
    el("p", { class: "mm-label sign-hint" }, "คลิก (หรือแตะ) ตรงจุดที่ต้องการวางลายเซ็น · ลากเพื่อย้าย · ใช้แถบเลื่อนปรับขนาด"),
  ]);

  const go = button("บันทึกเป็น PDF ที่เซ็นแล้ว", { onclick: save });
  go.disabled = true;

  body.append(dz.container, extra, signSection, viewer,
    el("div", { class: "actions" }, [go]), st.node, results);
  body.appendChild(el("div", { class: "note" },
    "ลายเซ็นถูกวางเป็นภาพทับบนหน้าเอกสาร เหมือนการเซ็นแล้วสแกน — เหมาะกับเอกสารทั่วไปในองค์กร · " +
    "นี่ไม่ใช่ลายเซ็นดิจิทัลแบบมีใบรับรอง (Digital Signature) ที่ใช้ยืนยันตัวตนทางกฎหมาย · " +
    "ลายเซ็นที่บันทึกไว้เก็บอยู่ในเบราว์เซอร์ของคุณเครื่องเดียว ไม่ถูกส่งไปไหน"));

  renderSaved();
  refreshPad();

  function refreshPad() { padUse.disabled = pad.isEmpty(); }

  function useDrawn() {
    const url = pad.toDataURL();
    if (!url) return st.err("ยังไม่ได้วาดลายเซ็น");
    setSignature(url, true);
    pad.clear();
  }

  async function useImage(f) {
    try {
      st.info("กำลังเตรียมรูปลายเซ็น…");
      setSignature(await imageToSignature(f), true);
      st.clear();
    } catch (e) { st.err("อ่านรูปไม่สำเร็จ: " + e.message); }
  }

  function setSignature(url, persist) {
    signature = url;
    if (persist) saveSignature(url);
    renderSaved();
    st.ok("เลือกลายเซ็นแล้ว — คลิกบนหน้าเอกสารเพื่อวาง");
  }

  function renderSaved() {
    savedBox.innerHTML = "";
    const list = savedSignatures();
    if (!list.length) return;
    savedBox.append(el("p", { class: "mm-label" }, "ลายเซ็นที่เก็บไว้ในเครื่อง (คลิกเพื่อเลือก)"));
    const row = el("div", { class: "sign-thumbs" });
    list.forEach((url) => {
      const item = el("div", { class: "sign-thumb" + (url === signature ? " on" : "") }, [
        el("img", { src: url, alt: "ลายเซ็น", onclick: () => { signature = url; renderSaved(); st.ok("เลือกลายเซ็นแล้ว — คลิกบนหน้าเอกสารเพื่อวาง"); } }),
        el("button", { class: "icon-btn danger", type: "button", title: "ลบออก",
          onclick: (e) => { e.stopPropagation(); removeSignature(url); if (signature === url) signature = null; renderSaved(); } }, [uiIcon("close", "pg-ico")]),
      ]);
      row.appendChild(item);
    });
    savedBox.appendChild(row);
  }

  // ── เปิดเอกสาร ───────────────────────────────────────────────────────────
  async function openDoc() {
    results.innerHTML = ""; extra.innerHTML = "";
    placed.length = 0;
    viewer.hidden = true; go.disabled = true;
    if (!file) return st.clear();
    st.info("กำลังเปิดไฟล์…");
    try {
      pdf?.destroy?.();
      pdf = await openPdf(file, passwordBox(extra));
      pageCount = pdf.numPages;
      current = 1;
      viewer.hidden = false;
      await gotoPage(1);
      st.ok(`เปิดไฟล์แล้ว ${pageCount} หน้า — เลือกลายเซ็นแล้วคลิกบนหน้าเอกสาร`);
    } catch (e) {
      st.err("เปิดไฟล์ไม่สำเร็จ: " + e.message);
    }
  }

  async function gotoPage(n) {
    if (!pdf || n < 1 || n > pageCount) return;
    current = n;
    const page = await pdf.getPage(n);
    // เรนเดอร์ที่ 1.5 เท่าให้คมพอ แต่ไม่กินหน่วยความจำเกินจำเป็น
    const viewport = page.getViewport({ scale: 1.5 });
    pageCanvas.width = Math.floor(viewport.width);
    pageCanvas.height = Math.floor(viewport.height);
    const ctx = pageCanvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    page.cleanup();
    pageLabel.textContent = `หน้า ${current} / ${pageCount}`;
    prevBtn.disabled = current === 1;
    nextBtn.disabled = current === pageCount;
    drawPlaced();
  }

  // ── วางลายเซ็นบนหน้า ─────────────────────────────────────────────────────
  stage.addEventListener("click", (e) => {
    if (e.target.closest(".sign-item")) return;      // คลิกบนลายเซ็นเดิม = ไม่วางใหม่
    if (!signature) return st.err("เลือกหรือวาดลายเซ็นก่อน แล้วค่อยคลิกบนเอกสาร");
    const r = stage.getBoundingClientRect();
    const rx = (e.clientX - r.left) / r.width;
    const ry = (e.clientY - r.top) / r.height;
    placed.push({ page: current, rx, ry, rw: 0.22, dataUrl: signature });
    drawPlaced();
    go.disabled = false;
  });

  function drawPlaced() {
    layer.innerHTML = "";
    placed.forEach((p, idx) => {
      if (p.page !== current) return;
      const item = el("div", { class: "sign-item", style: { left: p.rx * 100 + "%", top: p.ry * 100 + "%", width: p.rw * 100 + "%" } }, [
        el("img", { src: p.dataUrl, alt: "ลายเซ็น", draggable: "false" }),
        el("button", { class: "sign-del", type: "button", title: "เอาออก",
          onclick: (e) => { e.stopPropagation(); placed.splice(idx, 1); drawPlaced(); go.disabled = !placed.length; } }, [uiIcon("close", "pg-ico")]),
        el("input", { class: "sign-size", type: "range", min: "6", max: "60", value: String(Math.round(p.rw * 100)),
          oninput: (e) => { p.rw = +e.target.value / 100; item.style.width = p.rw * 100 + "%"; },
          onclick: (e) => e.stopPropagation() }),
      ]);
      // ลากย้าย
      item.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".sign-del, .sign-size")) return;
        e.preventDefault();
        item.setPointerCapture(e.pointerId);
        const r = stage.getBoundingClientRect();
        const grabX = e.clientX - (r.left + p.rx * r.width);
        const grabY = e.clientY - (r.top + p.ry * r.height);
        const move = (ev) => {
          p.rx = Math.min(1, Math.max(0, (ev.clientX - grabX - r.left) / r.width));
          p.ry = Math.min(1, Math.max(0, (ev.clientY - grabY - r.top) / r.height));
          item.style.left = p.rx * 100 + "%";
          item.style.top = p.ry * 100 + "%";
        };
        const up = () => { item.removeEventListener("pointermove", move); item.removeEventListener("pointerup", up); };
        item.addEventListener("pointermove", move);
        item.addEventListener("pointerup", up);
      });
      layer.appendChild(item);
    });
  }

  function clearPage() {
    for (let i = placed.length - 1; i >= 0; i--) if (placed[i].page === current) placed.splice(i, 1);
    drawPlaced();
    go.disabled = !placed.length;
  }

  // ── บันทึกลงไฟล์จริง ─────────────────────────────────────────────────────
  async function save() {
    if (!placed.length) return st.err("ยังไม่ได้วางลายเซ็นบนเอกสาร");
    go.disabled = true;
    results.innerHTML = "";
    st.info("กำลังบันทึก…");
    try {
      const { doc, encrypted } = await loadPdfLib(file);
      const pages = doc.getPages();
      const cache = new Map();

      for (const p of placed) {
        const page = pages[p.page - 1];
        if (!page) continue;
        if (!cache.has(p.dataUrl)) cache.set(p.dataUrl, await doc.embedPng(p.dataUrl));
        const png = cache.get(p.dataUrl);
        const { width: pw, height: ph } = page.getSize();
        const w = pw * p.rw;
        const h = w * (png.height / png.width);
        // หน้าจอวัด y จากขอบบน แต่ PDF วัดจากขอบล่าง จึงต้องกลับด้านและหักความสูงของภาพ
        page.drawImage(png, { x: pw * p.rx, y: ph - ph * p.ry - h, width: w, height: h });
        await yieldToBrowser();
      }

      const blob = new Blob([await doc.save()], { type: "application/pdf" });
      st.ok(`เซ็นแล้ว ${placed.length} จุด ใน ${new Set(placed.map((p) => p.page)).size} หน้า`);
      if (encrypted) results.appendChild(el("div", { class: "status show err" }, ENCRYPTED_WARNING));
      const name = stripExt(file.name) + "-เซ็นแล้ว.pdf";
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name)]),
        el("span", { class: "r-size" }, fmtBytes(blob.size)),
        button("ดาวน์โหลด", { icon: "download",  onclick: () => download(blob, name) }),
      ]));
    } catch (e) {
      st.err("บันทึกไม่สำเร็จ: " + e.message);
    } finally { go.disabled = false; }
  }

  return wrap;
}
