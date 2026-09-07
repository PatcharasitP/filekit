import { el, dropzone, statusBar, button, field, select, download,
         stripExt, fmtBytes, eachFile, failedBox } from "../ui.js";
import { workspace } from "../workspace.js";
import { uiIcon } from "../icons.js";
import { tr } from "../i18n.js";

// สไตล์เฉพาะของแผงลอยเครื่องมือนี้ — ฝังในโมดูลเพราะห้ามแก้ assets/css/tool.css
// (โมดูลนี้ import ครั้งเดียวต่อเซสชัน จึง <style> ไม่มีทางถูกแทรกซ้ำ)
if (!document.getElementById("rz-style")) {
  const style = el("style", { id: "rz-style" });
  style.textContent = `
.rz-left,.rz-right{display:flex;flex-direction:column;gap:14px}
.rz-count{font-size:11px;color:var(--text-mute);font-weight:600}

.rz-gallery{display:flex;flex-direction:column;gap:6px}
.rz-item{
  display:flex;align-items:center;gap:9px;padding:6px;border-radius:var(--r-sm);
  border:1px solid transparent;background:var(--bg-soft);cursor:pointer;
}
.rz-item:hover{border-color:var(--line)}
.rz-item.active{border-color:var(--ac,var(--brand));background:color-mix(in srgb,var(--ac,var(--brand)) 10%,var(--bg-soft))}
.rz-thumb{width:38px;height:38px;border-radius:8px;object-fit:cover;flex:none;background:var(--card-hi);border:1px solid var(--line-soft)}
.rz-meta{flex:1;min-width:0}
.rz-meta .rz-name{display:block;font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rz-meta .rz-size{display:block;font-size:11px;color:var(--text-mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rz-item .icon-btn{flex:none}

.rz-toolbar-label{font-size:12.5px;color:var(--text-dim);font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.rz-compare{
  position:relative;width:100%;height:min(52vh,480px);min-height:220px;overflow:hidden;
  border-radius:var(--r);border:1px solid var(--line-soft);background:var(--bg-soft);touch-action:none;
}
.rz-layer{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.rz-after{z-index:1}
.rz-before{z-index:2}
.rz-img{max-width:100%;max-height:100%;width:100%;height:100%;object-fit:contain;display:block;
  pointer-events:none;user-select:none;-webkit-user-drag:none}
.rz-handle{
  position:absolute;top:0;bottom:0;left:50%;width:0;transform:translateX(-50%);
  cursor:ew-resize;z-index:4;
}
.rz-handle::before{content:"";position:absolute;top:0;bottom:0;left:0;width:2px;transform:translateX(-1px);
  background:var(--card);box-shadow:0 0 0 1px color-mix(in srgb,var(--text) 25%,transparent)}
.rz-grip{
  position:absolute;top:50%;left:0;transform:translate(-50%,-50%);width:34px;height:34px;border-radius:50%;
  background:var(--card);border:1px solid var(--line);display:grid;place-items:center;box-shadow:var(--sh2);color:var(--text-dim);
}
.rz-grip svg{width:15px;height:15px}
.rz-handle:hover .rz-grip,.rz-handle:focus-visible .rz-grip{color:var(--ac,var(--brand));border-color:var(--ac,var(--brand))}
.rz-compare.dragging{cursor:ew-resize}
.rz-compare.busy{opacity:.55}
.rz-tag{
  position:absolute;top:10px;font-size:11px;font-weight:700;letter-spacing:.04em;padding:4px 10px;border-radius:999px;
  background:color-mix(in srgb,var(--card) 82%,transparent);backdrop-filter:blur(6px);color:var(--text-dim);
  border:1px solid var(--line-soft);pointer-events:none;z-index:3;
}
.rz-tag-l{left:10px}
.rz-tag-r{right:10px}

.rz-stats{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:var(--r-sm);background:var(--bg-soft);border:1px solid var(--line-soft);font-size:12.5px}
.rz-stat-row{display:flex;justify-content:space-between;gap:10px}
.rz-stat-row .lbl{color:var(--text-mute)}
.rz-stat-row .val{font-weight:700;font-variant-numeric:tabular-nums;text-align:right}
.rz-verdict{font-weight:700}
.rz-verdict.ok{color:var(--ok)}
.rz-verdict.warn{color:var(--warn)}
.rz-verdict.err{color:var(--err)}
.rz-kept-note{font-size:11.5px;color:var(--text-mute);line-height:1.6}
`;
  document.head.appendChild(style);
}

/** ซ่อน/โชว์ element แน่นอน — บาง class ในไฟล์นี้ตั้ง display ไว้ตรง ๆ (.btn.has-ico, .rz-stats)
 *  ซึ่งเป็น CSS จาก author และชนะกฎ [hidden] ของเบราว์เซอร์เสมอไม่ว่า specificity เท่าไหร่
 *  ทำให้แค่ตั้ง element.hidden=true ไม่ซ่อนจริง ต้องบังคับ display ทับด้วยตรงนี้เลย */
function hideEl(node, on) {
  node.hidden = on;
  node.style.display = on ? "none" : "";
}

export function mount(tool) {
  const st = statusBar();

  // ── แผงซ้าย: เลือกไฟล์ + รายการรูปคลิกเลือกดูได้ ──────────────────────────
  const dz = dropzone({
    accept: "image/*",
    hint: tr("เลือกได้หลายไฟล์ · ย่อและบีบอัดพร้อมกันทั้งชุด", "Choose multiple files · resize and compress the whole batch at once"),
    expect: ["image"], expectLabel: tr("ไฟล์รูปภาพ", "Image files"),
    onChange: onFilesChanged,
  });
  const galCount = el("span", { class: "rz-count" }, "");
  const gallery = el("div", { class: "rz-gallery" });
  const leftBody = el("div", { class: "rz-left" }, [dz.container, gallery]);

  // ── แผงกลาง: พรีวิวเทียบก่อน–หลังแบบเลื่อนดูได้ ──────────────────────────
  const beforeImg = el("img", { class: "rz-img", alt: tr("ภาพต้นฉบับ", "Original image"), draggable: "false" });
  const afterImg = el("img", { class: "rz-img", alt: tr("ภาพหลังประมวลผล", "Processed image"), draggable: "false" });
  const beforeLayer = el("div", { class: "rz-layer rz-before" }, [beforeImg]);
  const afterLayer = el("div", { class: "rz-layer rz-after" }, [afterImg]);
  const handle = el("div", {
    class: "rz-handle", tabindex: "0", role: "slider",
    "aria-label": tr("ลากเพื่อเทียบก่อน–หลัง", "Drag to compare before and after"), "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "50",
  }, [el("span", { class: "rz-grip", "aria-hidden": "true" }, [uiIcon("grip", "grip-svg")])]);
  const tagBefore = el("span", { class: "rz-tag rz-tag-l" }, tr("ก่อน", "Before"));
  const tagAfter = el("span", { class: "rz-tag rz-tag-r" }, tr("หลัง", "After"));
  const compareBox = el("div", { class: "rz-compare" }, [afterLayer, beforeLayer, handle, tagBefore, tagAfter]);
  const previewErr = el("div", { class: "ws-empty" });
  hideEl(previewErr, true);
  const compareWrap = el("div", {}, [compareBox, previewErr]);

  const toolbarLabel = el("div", { class: "rz-toolbar-label" }, tr("เลือกรูปเพื่อดูตัวอย่าง", "Select an image to preview"));
  const resetPosBtn = button(tr("รีเซ็ตตำแหน่งเลื่อน", "Reset slider position"), { ghost: true, onclick: () => setPos(50) });

  // ── แผงขวา: ตัวเลือกทั้งหมด + ตัวเลขขนาดสด ──────────────────────────────
  const modeSel = select([["long", tr("จำกัดด้านที่ยาวที่สุด", "Limit the longest side")], ["width", tr("กำหนดความกว้าง", "Set width")], ["pct", tr("ย่อเป็นเปอร์เซ็นต์", "Scale by percentage")], ["none", tr("ไม่ย่อ (บีบอัดอย่างเดียว)", "Don't resize (compress only)")]], "long");
  const sizeInput = el("input", { type: "number", min: "1", value: "1600" });
  const quality = el("input", { type: "range", min: "40", max: "100", value: "82" });
  const qLabel = el("small", {}, tr("คุณภาพ 82%", "Quality 82%"));
  const fmtSel = select([["keep", tr("คงชนิดเดิม (PNG→PNG)", "Keep original type (PNG→PNG)")], ["jpeg", tr("บังคับเป็น JPG", "Force JPG")], ["webp", tr("บังคับเป็น WEBP", "Force WEBP")]], "jpeg");

  const sizeField = field(tr("ขนาด (พิกเซล หรือ %)", "Size (pixels or %)"), sizeInput);
  const modeField = field(tr("วิธีย่อ", "Resize method"), modeSel);
  const qualityField = el("label", { class: "field" }, [el("span", {}, tr("คุณภาพไฟล์", "File quality")), quality, qLabel]);
  const fmtField = field(tr("ชนิดไฟล์ผลลัพธ์", "Output file type"), fmtSel);

  const statOrig = el("span", { class: "val" });
  const statOut = el("span", { class: "val" });
  const statVerdict = el("div", { class: "rz-verdict" });
  const statKept = el("div", { class: "rz-kept-note" }, tr("จะคงไฟล์ต้นฉบับไว้ — บีบแล้วไฟล์ใหญ่กว่าเดิม", "Original file kept — compressing made it larger"));
  hideEl(statKept, true);
  const statsBox = el("div", { class: "rz-stats" }, [
    el("div", { class: "rz-stat-row" }, [el("span", { class: "lbl" }, tr("ต้นฉบับ", "Original")), statOrig]),
    el("div", { class: "rz-stat-row" }, [el("span", { class: "lbl" }, tr("ผลลัพธ์", "Result")), statOut]),
    statVerdict, statKept,
  ]);
  hideEl(statsBox, true);

  const rightBody = el("div", { class: "rz-right" }, [modeField, sizeField, qualityField, fmtField, statsBox]);

  const syncSize = () => {
    sizeField.style.display = modeSel.value === "none" ? "none" : "";
    sizeInput.value = modeSel.value === "pct" ? "50" : "1600";
  };
  modeSel.addEventListener("change", () => { syncSize(); schedulePreview(0); });
  sizeInput.addEventListener("input", () => schedulePreview());
  quality.addEventListener("input", () => { qLabel.textContent = tr(`คุณภาพ ${quality.value}%`, `Quality ${quality.value}%`); schedulePreview(); });
  fmtSel.addEventListener("change", () => schedulePreview(0));

  // ── แถบล่าง: สถานะ + ปุ่มลงมือ + ดาวน์โหลด ──────────────────────────────
  const go = button(tr("ย่อและบีบอัด", "Resize and compress"), { onclick: run });
  let lastMade = [];
  const zipBtn = button(tr("ดาวน์โหลดทั้งหมดเป็น ZIP", "Download all as ZIP"), { icon: "zip", ghost: true, onclick: async () => {
    const zip = new JSZip();
    lastMade.forEach((m) => zip.file(m.name, m.blob));
    download(await zip.generateAsync({ type: "blob" }), tr("รูปย่อแล้ว.zip", "resized-images.zip"));
  } });
  hideEl(zipBtn, true);
  // ไฟล์เดียวไม่ควรต้องไปหาไอคอนเล็ก ๆ บนรูปย่อ — ให้ปุ่มดาวน์โหลดเด่นอยู่แถบล่างเลย
  const oneBtn = button(tr("ดาวน์โหลดรูปที่ย่อแล้ว", "Download the resized image"), { icon: "download",
    onclick: () => { const m = lastMade[0]; if (m) download(m.blob, m.name); } });
  hideEl(oneBtn, true);

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์รูปภาพ", "Image files"), node: leftBody, hint: tr("คลิกที่รูปในรายการเพื่อดูตัวอย่างก่อน–หลังของไฟล์นั้น", "Click an image in the list to preview its before/after"), aside: galCount },
    center: { node: compareWrap, empty: tr("ยังไม่มีไฟล์ — เลือกรูปก่อนเพื่อดูตัวอย่างก่อน–หลัง", "No files yet — choose an image to see a before/after preview") },
    right: { title: tr("ตัวเลือก", "Options"), node: rightBody },
    toolbar: [toolbarLabel, resetPosBtn],
    footer: [st.node, go, oneBtn, zipBtn],
  });
  ws.showCanvas(false);
  const failedNote = el("div", {});
  ws.body.appendChild(failedNote);
  ws.body.appendChild(el("div", { class: "note" },
    tr("เหมาะกับการเตรียมรูปส่งอีเมล แนบเอกสาร หรืออัปโหลดเว็บที่จำกัดขนาดไฟล์ · รูปต้นฉบับในเครื่องไม่ถูกแก้ไข",
       "Good for preparing images to email, attach to documents, or upload to sites with file size limits · your original image on this device is not modified")));

  // ── ตรรกะย่อขนาด (เหมือนเดิมทุกจุด) ────────────────────────────────────
  function targetSize(w, h) {
    const v = +sizeInput.value || 0;
    if (modeSel.value === "none" || v <= 0) return [w, h];
    if (modeSel.value === "pct") { const s = v / 100; return [Math.round(w * s), Math.round(h * s)]; }
    if (modeSel.value === "width") { const s = v / w; return [v, Math.round(h * s)]; }
    const s = v / Math.max(w, h);
    return s >= 1 ? [w, h] : [Math.round(w * s), Math.round(h * s)]; // ไม่ขยายรูปที่เล็กกว่าเป้าอยู่แล้ว
  }

  /** ประมวลผลไฟล์เดียว — ใช้ร่วมกันทั้งพรีวิวสดและตอนกดประมวลผลจริง กันเลขไม่ตรงกัน */
  async function processOne(f) {
    const bmp = await createImageBitmap(f);
    const bmpW = bmp.width, bmpH = bmp.height;
    const [w, h] = targetSize(bmpW, bmpH);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    const keepPng = fmtSel.value === "keep" && /png$/i.test(f.type);
    const mime = fmtSel.value === "keep" ? (keepPng ? "image/png" : "image/jpeg")
               : fmtSel.value === "webp" ? "image/webp" : "image/jpeg";
    if (mime === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    let blob = await new Promise((r) => canvas.toBlob(r, mime, +quality.value / 100));
    canvas.width = canvas.height = 0;
    let ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    // ภาพกราฟิกสีเรียบมักโตขึ้นเมื่อแปลงเป็น JPG — ถ้าไม่ได้ย่อขนาดและผลลัพธ์
    // ใหญ่กว่าเดิม ให้คืนไฟล์ต้นฉบับไปเลย ดีกว่าส่งไฟล์ที่แย่ลงให้ผู้ใช้
    let kept = false;
    if (blob.size >= f.size && w === bmpW && h === bmpH) {
      blob = f; ext = (f.name.split(".").pop() || ext).toLowerCase(); kept = true;
    }
    return { blob, name: kept ? f.name : tr(`${stripExt(f.name)}-ย่อ.${ext}`, `${stripExt(f.name)}-resized.${ext}`), dim: `${w}×${h}`, kept, w, h, bmpW, bmpH };
  }

  // ── แกลเลอรีซ้าย: thumbnail + คลิกเพื่อเลือก + ดาวน์โหลดรายไฟล์เมื่อพร้อม ──
  const thumbUrls = new Map();     // File -> object URL (ใช้ทั้งเป็น thumbnail และภาพ "ก่อน")
  const resultsByFile = new Map(); // File -> ผลลัพธ์ล่าสุดจากการกดประมวลผลจริง
  let activeIndex = 0;

  function ensureThumb(f) {
    let u = thumbUrls.get(f);
    if (!u) { u = URL.createObjectURL(f); thumbUrls.set(f, u); }
    return u;
  }
  function pruneThumbs(files) {
    const keep = new Set(files);
    for (const [f, u] of thumbUrls) if (!keep.has(f)) { URL.revokeObjectURL(u); thumbUrls.delete(f); }
  }

  function renderGallery() {
    const files = dz.files;
    galCount.textContent = files.length ? tr(`${files.length} ไฟล์`, `${files.length} files`) : "";
    gallery.innerHTML = "";
    files.forEach((f, i) => {
      const r = resultsByFile.get(f);
      const sizeLine = r
        ? (r.kept ? tr("คงไฟล์เดิม (บีบแล้วใหญ่กว่า)", "Kept original (compressing made it larger)") : `${r.dim} · ${fmtBytes(f.size)} → ${fmtBytes(r.blob.size)}`)
        : fmtBytes(f.size);
      gallery.appendChild(el("div", {
        class: "rz-item" + (i === activeIndex ? " active" : ""),
        role: "button", tabindex: "0", "aria-label": tr(`ดูตัวอย่าง ${f.name}`, `Preview ${f.name}`),
        onclick: () => selectIndex(i),
        onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectIndex(i); } },
      }, [
        el("img", { class: "rz-thumb", src: ensureThumb(f), alt: "" }),
        el("div", { class: "rz-meta" }, [
          el("span", { class: "rz-name" }, f.name),
          el("span", { class: "rz-size" }, sizeLine),
        ]),
        r ? el("button", {
          type: "button", class: "icon-btn", title: tr("ดาวน์โหลด", "Download"), "aria-label": tr(`ดาวน์โหลด ${r.name}`, `Download ${r.name}`),
          onclick: (e) => { e.stopPropagation(); download(r.blob, r.name); },
        }, [uiIcon("download", "pg-ico")]) : null,
      ]));
    });
  }

  function selectIndex(i) {
    if (i === activeIndex) return;
    activeIndex = i;
    pos = 50;
    renderGallery();
    schedulePreview(0);
  }

  function onFilesChanged() {
    st.clear();
    resultsByFile.clear();
    lastMade = [];
    hideEl(zipBtn, true);
    failedNote.innerHTML = "";
    pruneThumbs(dz.files);
    if (activeIndex >= dz.files.length) activeIndex = Math.max(0, dz.files.length - 1);
    renderGallery();
    schedulePreview(0);
  }

  // ── ตัวเลื่อนเทียบก่อน–หลัง (เมาส์ + แตะ ผ่าน Pointer Events ตัวเดียวกัน) ──
  let pos = 50;
  function setPos(p) {
    pos = Math.max(0, Math.min(100, p));
    handle.style.left = pos + "%";
    handle.setAttribute("aria-valuenow", String(Math.round(pos)));
    beforeLayer.style.clipPath = `inset(0 ${100 - pos}% 0 0)`;
  }
  function posFromClientX(clientX) {
    const rect = compareBox.getBoundingClientRect();
    if (!rect.width) return pos;
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  }
  let dragging = false;
  function startDrag(e) {
    if (e.button > 0) return;
    dragging = true;
    compareBox.classList.add("dragging");
    setPos(posFromClientX(e.clientX));
    e.preventDefault();
  }
  handle.addEventListener("pointerdown", startDrag);
  compareBox.addEventListener("pointerdown", (e) => { if (e.target !== handle && !handle.contains(e.target)) startDrag(e); });
  window.addEventListener("pointermove", (e) => { if (dragging) setPos(posFromClientX(e.clientX)); });
  window.addEventListener("pointerup", () => { dragging = false; compareBox.classList.remove("dragging"); });
  window.addEventListener("pointercancel", () => { dragging = false; compareBox.classList.remove("dragging"); });
  handle.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 10 : 3;
    if (e.key === "ArrowLeft") { setPos(pos - step); e.preventDefault(); }
    else if (e.key === "ArrowRight") { setPos(pos + step); e.preventDefault(); }
    else if (e.key === "Home") { setPos(0); e.preventDefault(); }
    else if (e.key === "End") { setPos(100); e.preventDefault(); }
  });

  // ── พรีวิวสด: คำนวณเฉพาะไฟล์ที่กำลังดู หน่วง ~200ms กันคำนวณรัวตอนพิมพ์/ลาก ──
  let afterUrl = null;
  let previewSeq = 0;
  let previewTimer = null;
  function schedulePreview(delay = 200) {
    clearTimeout(previewTimer);
    if (delay <= 0) { updatePreview(); return; }
    previewTimer = setTimeout(updatePreview, delay);
  }

  async function updatePreview() {
    const files = dz.files;
    if (!files.length) { ws.showCanvas(false); return; }
    if (activeIndex >= files.length) activeIndex = files.length - 1;
    if (activeIndex < 0) activeIndex = 0;
    const f = files[activeIndex];
    const seq = ++previewSeq;
    if (!compareWrap.hidden) compareBox.classList.add("busy"); // มีพรีวิวอยู่แล้ว ให้หรี่ไว้ระหว่างคำนวณรอบใหม่
    try {
      const r = await processOne(f);
      if (seq !== previewSeq) return;
      if (afterUrl) URL.revokeObjectURL(afterUrl);
      afterUrl = URL.createObjectURL(r.blob);
      beforeImg.src = ensureThumb(f);
      afterImg.src = afterUrl;
      ws.showCanvas(true);
      hideEl(compareBox, false); hideEl(previewErr, true); hideEl(statsBox, false);
      setPos(pos);
      toolbarLabel.textContent = `${f.name} · ${r.bmpW}×${r.bmpH} → ${r.w}×${r.h}`;
      statOrig.textContent = `${r.bmpW}×${r.bmpH} · ${fmtBytes(f.size)}`;
      statOut.textContent = `${r.w}×${r.h} · ${fmtBytes(r.blob.size)}`;
      const diff = f.size ? Math.round((1 - r.blob.size / f.size) * 100) : 0;
      statVerdict.textContent = diff > 0 ? tr(`เล็กลง ${diff}%`, `${diff}% smaller`) : diff < 0 ? tr(`ใหญ่ขึ้น ${-diff}%`, `${-diff}% larger`) : tr("ขนาดเท่าเดิม", "Same size");
      statVerdict.className = "rz-verdict " + (diff > 0 ? "ok" : diff < 0 ? "err" : "warn");
      hideEl(statKept, !r.kept);
    } catch (e) {
      if (seq !== previewSeq) return;
      ws.showCanvas(true);
      hideEl(compareBox, true); hideEl(statsBox, true);
      hideEl(previewErr, false);
      previewErr.textContent = tr("สร้างตัวอย่างไม่ได้ — ไฟล์นี้อาจเสียหาย: ", "Could not create preview — this file may be corrupted: ") + e.message;
      toolbarLabel.textContent = f.name;
    } finally {
      if (seq === previewSeq) compareBox.classList.remove("busy");
    }
  }

  // ── ประมวลผลจริงทั้งชุด + ดาวน์โหลด ─────────────────────────────────────
  async function run() {
    const files = dz.files;
    if (!files.length) return st.err(tr("กรุณาเลือกรูปอย่างน้อย 1 ไฟล์", "Please choose at least 1 image"));
    go.disabled = true; ws.setBusy(true);
    st.info(tr("กำลังประมวลผล…", "Processing…"));
    resultsByFile.clear();
    hideEl(zipBtn, true);
    hideEl(oneBtn, true);
    const made = [];
    let before = 0, after = 0;
    try {
      const failed = await eachFile(files, st, async (f) => {
        const r = await processOne(f);
        resultsByFile.set(f, r);
        made.push(r);
        before += f.size; after += r.blob.size;
      });
      st.progress(null);
      failedNote.innerHTML = "";
      const fb = failedBox(failed); if (fb) failedNote.appendChild(fb);
      if (!made.length) throw new Error(tr("ไม่สำเร็จสักไฟล์ — ตรวจว่าไฟล์เป็นรูปภาพจริงหรือไม่", "Could not process any file — check that they are valid image files"));
      const saved = before ? Math.round((1 - after / before) * 100) : 0;
      const keptCount = made.filter((m) => m.kept).length;
      const verdict = saved > 0 ? tr(`เล็กลง ${saved}%`, `${saved}% smaller`) : saved < 0 ? tr(`ใหญ่ขึ้น ${-saved}%`, `${-saved}% larger`) : tr("ขนาดเท่าเดิม", "Same size");
      const tail = keptCount ? tr(` · ${keptCount} ไฟล์คงต้นฉบับไว้เพราะเล็กกว่าอยู่แล้ว`, ` · ${keptCount} files kept original because they were already smaller`) : "";
      st.ok(tr(`เสร็จ ${made.length} ไฟล์ · ${fmtBytes(before)} → ${fmtBytes(after)} (${verdict})${tail}`,
        `Done — ${made.length} files, ${fmtBytes(before)} → ${fmtBytes(after)} (${verdict})${tail}`));
      lastMade = made;
      hideEl(zipBtn, made.length <= 1);
      hideEl(oneBtn, made.length !== 1);
      renderGallery();
      if (resultsByFile.has(files[activeIndex])) schedulePreview(0);
    } catch (e) {
      st.progress(null);
      st.err(tr("ประมวลผลไม่สำเร็จ: ", "Could not process: ") + e.message);
    } finally { go.disabled = false; ws.setBusy(false); }
  }

  syncSize();
  return ws.wrap;
}
