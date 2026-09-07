import { el, statusBar, button, dropzone, download, stripExt, fmtBytes, yieldToBrowser } from "../ui.js";
import { uiIcon } from "../icons.js";
import { workspace } from "../workspace.js";
import { openPdf, passwordBox, loadPdfLib, ENCRYPTED_WARNING } from "../pdfopen.js";
import { signaturePad, savedSignatures, saveSignature, removeSignature, imageToSignature } from "../signpad.js";
import { tr } from "../i18n.js";

// ── สไตล์เฉพาะของหน้านี้ — ฝังเองเพราะห้ามแก้ assets/css/tool.css ─────────────
// (ฉีดครั้งเดียวด้วย id กันซ้ำ เผื่อผู้ใช้กด "ลองใหม่" แล้ว mount() ถูกเรียกซ้ำ)
const STYLE_ID = "ps-style";
const STYLE = `
  .ps-pglist{display:flex;flex-direction:column;gap:6px}
  .ps-pgrow{
    display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;
    padding:8px 12px;border-radius:var(--r-sm);border:1px solid var(--line-soft);
    background:var(--bg-soft);color:var(--text);font-size:13.5px;cursor:pointer;
    text-align:left;font-family:inherit;transition:border-color .15s,background .15s;
  }
  .ps-pgrow:hover{border-color:var(--brand)}
  .ps-pgrow.on{
    border-color:var(--brand);color:var(--brand);font-weight:700;
    background:color-mix(in srgb,var(--brand) 12%,var(--bg-soft));
  }
  .ps-pgbadge{
    min-width:20px;height:20px;padding:0 6px;border-radius:999px;display:inline-flex;
    align-items:center;justify-content:center;background:var(--brand);color:var(--btn-fg);
    font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;
  }
  .ps-empty-note{font-size:13px;color:var(--text-mute);padding:8px 2px}
  .ps-sep{height:1px;background:var(--line-soft);margin:16px 0}
  .ps-sizerow{display:flex;align-items:center;gap:10px}
  .ps-sizerow input[type=range]{flex:1;accent-color:var(--brand)}
  .ps-sizerow input[type=range]:disabled{opacity:.4}
  .ps-sizeval{font-size:12.5px;color:var(--text-dim);min-width:36px;text-align:right;font-variant-numeric:tabular-nums}
`;
function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  document.head.appendChild(el("style", { id: STYLE_ID }, STYLE));
}

export function mount(tool) {
  injectStyle();

  const st = statusBar();
  const extra = el("div", {});
  const results = el("div", { class: "results" });

  let file = null, pdf = null, pageCount = 0, current = 1;
  let signature = null;                 // dataURL ของลายเซ็นที่เลือกอยู่ (ยังไม่ได้วาง)
  let selected = -1;                    // index ใน placed[] ของลายเซ็นที่เลือกอยู่บนหน้า (สำหรับลบ/ปรับขนาด)
  const placed = [];                    // [{page, rx, ry, rw, dataUrl}] เก็บเป็นสัดส่วนของหน้า

  // ── แผงซ้าย: เลือกไฟล์ + รายการหน้า ────────────────────────────────────────
  const dz = dropzone({
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "PDF files"), accept: "application/pdf,.pdf", multiple: false,
    hint: tr("ครั้งละ 1 ไฟล์", "One file at a time"),
    onChange: (f) => { file = f[0] || null; openDoc(); },
  });
  const pageList = el("div", { class: "ps-pglist" });
  const leftNode = el("div", {}, [dz.container, extra, pageList]);

  // ── แผงขวา: สร้างลายเซ็น + คลังลายเซ็น + ตัวปรับขนาด ────────────────────────
  const pad = signaturePad({ onChange: () => refreshPad() });
  const padUse = button(tr("ใช้ลายเซ็นนี้", "Use this signature"), { onclick: useDrawn });
  const padClear = button(tr("ล้าง", "Clear"), { ghost: true, onclick: () => pad.clear() });
  const upInput = el("input", { type: "file", accept: "image/*", hidden: true,
    onchange: async (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) await useImage(f); } });
  const savedBox = el("div", { class: "sign-saved" });

  const sizeSlider = el("input", { type: "range", min: "6", max: "60", value: "22",
    oninput: () => {
      if (selected < 0) return;
      placed[selected].rw = +sizeSlider.value / 100;
      refresh();
    } });
  const sizeVal = el("span", { class: "ps-sizeval" }, "—");
  const sizeBox = el("div", {}, [
    el("p", { class: "mm-label" }, tr("คลิกลายเซ็นที่วางไว้บนหน้าเอกสารเพื่อเลือก แล้วปรับขนาดที่นี่", "Click a signature placed on the page to select it, then adjust its size here")),
    el("div", { class: "ps-sizerow" }, [sizeSlider, sizeVal]),
  ]);

  const rightNode = el("div", {}, [
    el("p", { class: "mm-label" }, tr("วาดในกรอบด้านล่าง (ใช้นิ้วบนมือถือได้) หรืออัปโหลดรูปลายเซ็นที่ถ่าย/สแกนไว้", "Draw in the box below (works with your finger on mobile), or upload a photo/scan of your signature")),
    el("div", { class: "sign-pad-wrap" }, [pad.node]),
    el("div", { class: "actions" }, [padUse, padClear,
      button(tr("อัปโหลดรูปลายเซ็น", "Upload a signature image"), { ghost: true, onclick: () => upInput.click() }), upInput]),
    savedBox,
    el("div", { class: "ps-sep" }),
    el("h3", { class: "sign-h" }, tr("ขนาดลายเซ็นที่วางแล้ว", "Size of the placed signature")),
    sizeBox,
  ]);

  // ── ตรงกลาง: หน้ากระดาษ PDF ──────────────────────────────────────────────
  const pageCanvas = el("canvas", { class: "sign-page" });
  const layer = el("div", { class: "sign-layer" });
  const stage = el("div", { class: "sign-stage" }, [pageCanvas, layer]);
  const centerNode = el("div", { class: "sign-wrap" }, [stage]);

  // ── แถบเครื่องมือลอยเหนือผืนงาน ───────────────────────────────────────────
  const prevBtn = button(tr("หน้าก่อน", "Previous page"), { ghost: true, onclick: () => gotoPage(current - 1) });
  const nextBtn = button(tr("หน้าถัดไป →", "Next page →"), { ghost: true, onclick: () => gotoPage(current + 1) });
  const pageLabel = el("span", { class: "sign-pageno" });
  const delSelBtn = button(tr("ลบลายเซ็นที่เลือก", "Remove selected signature"), { ghost: true, danger: true, icon: "trash", onclick: deleteSelected });
  const clearPageBtn = button(tr("ล้างหน้านี้", "Clear this page"), { ghost: true, danger: true, onclick: clearPage });

  const go = button(tr("บันทึกเป็น PDF ที่เซ็นแล้ว", "Save as a signed PDF"), { onclick: save });
  go.disabled = true;

  const ws = workspace(tool, {
    left: { title: tr("เอกสาร PDF", "PDF document"), node: leftNode, hint: tr("เลือกไฟล์แล้วคลิกเลขหน้าในรายการเพื่อกระโดดไปดู", "Choose a file, then click a page number in the list to jump to it") },
    center: { node: centerNode, empty: tr("ยังไม่มีไฟล์ PDF — เลือกไฟล์ทางแผงซ้ายก่อนเพื่อดูตัวอย่างและวางลายเซ็น", "No PDF file yet — choose a file on the left to preview it and place your signature") },
    right: { title: tr("ลายเซ็นของคุณ", "Your signature"), node: rightNode },
    toolbar: [prevBtn, pageLabel, nextBtn, el("span", { class: "sep" }), delSelBtn, clearPageBtn],
    footer: [go, st.node],
  });
  const { wrap, body, setBusy, showCanvas } = ws;
  body.append(results);
  body.appendChild(el("div", { class: "note" },
    tr("ลายเซ็นถูกวางเป็นภาพทับบนหน้าเอกสาร เหมือนการเซ็นแล้วสแกน — เหมาะกับเอกสารทั่วไปในองค์กร · " +
    "นี่ไม่ใช่ลายเซ็นดิจิทัลแบบมีใบรับรอง (Digital Signature) ที่ใช้ยืนยันตัวตนทางกฎหมาย · " +
    "ลายเซ็นที่บันทึกไว้เก็บอยู่ในเบราว์เซอร์ของคุณเครื่องเดียว ไม่ถูกส่งไปไหน",
    "Your signature is placed as an image over the page, like a signed and scanned document — good for everyday office paperwork · " +
    "This is not a certificate-based Digital Signature used for legal identity verification · " +
    "Saved signatures stay in your browser only — they are never sent anywhere")));

  renderSaved();
  refreshPad();
  showCanvas(false);
  refresh();

  function refreshPad() { padUse.disabled = pad.isEmpty(); }

  function useDrawn() {
    const url = pad.toDataURL();
    if (!url) return st.err(tr("ยังไม่ได้วาดลายเซ็น", "You have not drawn a signature yet"));
    setSignature(url, true);
    pad.clear();
  }

  async function useImage(f) {
    try {
      st.info(tr("กำลังเตรียมรูปลายเซ็น…", "Preparing signature image…"));
      setSignature(await imageToSignature(f), true);
      st.clear();
    } catch (e) { st.err(tr("อ่านรูปไม่สำเร็จ: ", "Could not read the image: ") + e.message); }
  }

  function setSignature(url, persist) {
    signature = url;
    if (persist) saveSignature(url);
    renderSaved();
    st.ok(tr("เลือกลายเซ็นแล้ว — คลิกบนหน้าเอกสารเพื่อวาง", "Signature selected — click on the page to place it"));
  }

  function renderSaved() {
    savedBox.innerHTML = "";
    const list = savedSignatures();
    if (!list.length) return;
    savedBox.append(el("p", { class: "mm-label" }, tr("ลายเซ็นที่เก็บไว้ในเครื่อง (คลิกเพื่อเลือก)", "Signatures saved on this device (click to select)")));
    const row = el("div", { class: "sign-thumbs" });
    list.forEach((url) => {
      const item = el("div", { class: "sign-thumb" + (url === signature ? " on" : "") }, [
        el("img", { src: url, alt: tr("ลายเซ็น", "Signature"), onclick: () => { signature = url; renderSaved(); st.ok(tr("เลือกลายเซ็นแล้ว — คลิกบนหน้าเอกสารเพื่อวาง", "Signature selected — click on the page to place it")); } }),
        el("button", { class: "icon-btn danger", type: "button", title: tr("ลบออก", "Remove"),
          onclick: (e) => { e.stopPropagation(); removeSignature(url); if (signature === url) signature = null; renderSaved(); } }, [uiIcon("close", "pg-ico")]),
      ]);
      row.appendChild(item);
    });
    savedBox.appendChild(row);
  }

  // ── เปิดเอกสาร ───────────────────────────────────────────────────────────
  async function openDoc() {
    results.innerHTML = ""; extra.innerHTML = "";
    placed.length = 0; selected = -1;
    pageCount = 0; current = 1;
    showCanvas(false);
    if (!file) { pdf = null; refresh(); return st.clear(); }
    st.info(tr("กำลังเปิดไฟล์…", "Opening file…"));
    try {
      pdf?.destroy?.();
      pdf = await openPdf(file, passwordBox(extra));
      pageCount = pdf.numPages;
      current = 1;
      showCanvas(true);
      await gotoPage(1);
      st.ok(tr(`เปิดไฟล์แล้ว ${pageCount} หน้า — เลือกลายเซ็นแล้วคลิกบนหน้าเอกสาร`, `File opened — ${pageCount} pages — choose a signature, then click on the page`));
    } catch (e) {
      pdf = null; pageCount = 0;
      showCanvas(false);
      refresh();
      st.err(tr("เปิดไฟล์ไม่สำเร็จ: ", "Could not open the file: ") + e.message);
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
    selected = -1;
    refresh();
  }

  // ── วางลายเซ็นบนหน้า ─────────────────────────────────────────────────────
  stage.addEventListener("click", (e) => {
    if (e.target.closest(".sign-item")) return;      // คลิกบนลายเซ็นเดิม = เลือก ไม่วางใหม่
    if (!signature) return st.err(tr("เลือกหรือวาดลายเซ็นก่อน แล้วค่อยคลิกบนเอกสาร", "Choose or draw a signature first, then click on the document"));
    const r = stage.getBoundingClientRect();
    const rx = (e.clientX - r.left) / r.width;
    const ry = (e.clientY - r.top) / r.height;
    placed.push({ page: current, rx, ry, rw: 0.22, dataUrl: signature });
    selected = placed.length - 1;
    refresh();
  });

  function drawPlaced() {
    layer.innerHTML = "";
    placed.forEach((p, idx) => {
      if (p.page !== current) return;
      const item = el("div", {
        class: "sign-item" + (idx === selected ? " selected" : ""),
        style: { left: p.rx * 100 + "%", top: p.ry * 100 + "%", width: p.rw * 100 + "%",
          boxShadow: idx === selected ? "0 0 0 3px var(--brand)" : "none", borderRadius: "3px" },
      }, [el("img", { src: p.dataUrl, alt: tr("ลายเซ็น", "Signature"), draggable: "false" })]);
      // คลิกเฉย ๆ (ไม่ลาก) = เลือก · ลาก = ย้ายตำแหน่ง
      item.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        item.setPointerCapture(e.pointerId);
        const startX = e.clientX, startY = e.clientY;
        let moved = false;
        const r = stage.getBoundingClientRect();
        const grabX = e.clientX - (r.left + p.rx * r.width);
        const grabY = e.clientY - (r.top + p.ry * r.height);
        const move = (ev) => {
          if (Math.abs(ev.clientX - startX) > 3 || Math.abs(ev.clientY - startY) > 3) moved = true;
          p.rx = Math.min(1, Math.max(0, (ev.clientX - grabX - r.left) / r.width));
          p.ry = Math.min(1, Math.max(0, (ev.clientY - grabY - r.top) / r.height));
          item.style.left = p.rx * 100 + "%";
          item.style.top = p.ry * 100 + "%";
        };
        const up = () => {
          item.removeEventListener("pointermove", move);
          item.removeEventListener("pointerup", up);
          if (!moved) { selected = idx; refresh(); }
        };
        item.addEventListener("pointermove", move);
        item.addEventListener("pointerup", up);
      });
      layer.appendChild(item);
    });
  }

  function deleteSelected() {
    if (selected < 0) return;
    placed.splice(selected, 1);
    selected = -1;
    refresh();
  }

  function clearPage() {
    for (let i = placed.length - 1; i >= 0; i--) if (placed[i].page === current) placed.splice(i, 1);
    selected = -1;
    refresh();
  }

  function renderPageList() {
    pageList.innerHTML = "";
    if (!pageCount) { pageList.appendChild(el("p", { class: "ps-empty-note" }, tr("ยังไม่มีไฟล์ — เลือกไฟล์ PDF ก่อน", "No file yet — choose a PDF file first"))); return; }
    for (let n = 1; n <= pageCount; n++) {
      const count = placed.filter((p) => p.page === n).length;
      pageList.appendChild(el("button", {
        class: "ps-pgrow" + (n === current ? " on" : ""), type: "button", onclick: () => gotoPage(n),
      }, [
        el("span", {}, tr(`หน้า ${n}`, `Page ${n}`)),
        count ? el("span", { class: "ps-pgbadge" }, String(count)) : null,
      ]));
    }
  }

  /** อัปเดตทุกอย่างที่ขึ้นกับ placed/selected/current ให้ตรงกันเสมอ — จุดเดียว กันลืมซิงก์ */
  function refresh() {
    drawPlaced();
    renderPageList();
    prevBtn.disabled = !pdf || current === 1;
    nextBtn.disabled = !pdf || current === pageCount;
    pageLabel.textContent = pdf ? tr(`หน้า ${current} / ${pageCount}`, `Page ${current} / ${pageCount}`) : "";
    delSelBtn.disabled = selected < 0;
    clearPageBtn.disabled = !pdf || !placed.some((p) => p.page === current);
    go.disabled = !placed.length;
    const has = selected >= 0;
    sizeSlider.disabled = !has;
    if (has) sizeSlider.value = String(Math.round(placed[selected].rw * 100));
    sizeVal.textContent = has ? Math.round(placed[selected].rw * 100) + "%" : "—";
  }

  // ── บันทึกลงไฟล์จริง ─────────────────────────────────────────────────────
  async function save() {
    if (!placed.length) return st.err(tr("ยังไม่ได้วางลายเซ็นบนเอกสาร", "You have not placed any signature on the document yet"));
    go.disabled = true;
    setBusy(true);
    results.innerHTML = "";
    st.info(tr("กำลังบันทึก…", "Saving…"));
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
      st.ok(tr(`เซ็นแล้ว ${placed.length} จุด ใน ${new Set(placed.map((p) => p.page)).size} หน้า`,
               `Signed ${placed.length} spots across ${new Set(placed.map((p) => p.page)).size} pages`));
      if (encrypted) results.appendChild(el("div", { class: "status show err" }, ENCRYPTED_WARNING));
      const name = stripExt(file.name) + tr("-เซ็นแล้ว.pdf", "-signed.pdf");
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name)]),
        el("span", { class: "r-size" }, fmtBytes(blob.size)),
        button(tr("ดาวน์โหลด", "Download"), { icon: "download", onclick: () => download(blob, name) }),
      ]));
    } catch (e) {
      st.err(tr("บันทึกไม่สำเร็จ: ", "Could not save: ") + e.message);
    } finally { go.disabled = !placed.length; setBusy(false); }
  }

  return wrap;
}
