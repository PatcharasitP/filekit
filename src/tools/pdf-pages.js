import { loadPdfLib, ENCRYPTED_WARNING, HIDDEN_LAYERS_WARNING, openPdf, passwordBox } from "../pdfopen.js";
import { el, dropzone, statusBar, button, field, downloadButton, stripExt, parsePages, yieldToBrowser } from "../ui.js";
import { workspace } from "../workspace.js";
import { uiIcon } from "../icons.js";
import { tr } from "../i18n.js";

// สไตล์เสริมเฉพาะหน้านี้ — ห้ามแก้ assets/css/tool.css จึงฝังไว้ในโมดูลแทน
const STYLE = `
.pp-left,.pp-right{display:flex;flex-direction:column;gap:10px}
.pp-stats{font-size:12.5px;line-height:1.6;color:var(--text-mute);padding:9px 12px;
  background:var(--bg-soft);border:1px solid var(--line-soft);border-radius:var(--r-sm,10px)}
.pp-stats b{color:var(--text);font-variant-numeric:tabular-nums}
.pg.selected{outline:2px solid var(--ac,var(--brand));outline-offset:2px}
`;

export function mount(tool) {
  const st = statusBar();
  const pagesGrid = el("div", { class: "pages" });
  const extra = el("div", {}); // ที่อยู่กล่องขอรหัสผ่านไฟล์ล็อก
  const results = el("div", { class: "results" });
  const summary = el("div", { class: "pp-stats" }, tr("ยังไม่ได้เลือกไฟล์", "No file chosen yet"));
  let file = null;
  let items = []; // {index, rotate, dropped, thumb}
  let selected = null; // อ้างถึงสมาชิกใน items ที่กำลังเลือกอยู่ (ไม่ใช่ index กันหลุดตอนลากสลับ)

  const dz = dropzone({
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "PDF files"),
    accept: "application/pdf,.pdf", multiple: false, hint: tr("ครั้งละ 1 ไฟล์", "One file at a time"),
    onChange: (f) => {
      file = f[0] || null;
      results.innerHTML = "";
      if (file) loadPreview();
      else { items = []; selected = null; pagesGrid.innerHTML = ""; st.clear(); setLoaded(false); updateSummary(); ws.showCanvas(false); }
    },
  });

  // ── แผงซ้าย: เลือกไฟล์ + สรุปจำนวนหน้า ─────────────────────────────
  const leftNode = el("div", { class: "pp-left" }, [dz.container, extra, summary]);

  // ── แถบเครื่องมือลอย: ทำงานกับหน้าที่เลือกอยู่ ──────────────────────
  const rotateLBtn = button("", { icon: "rotateL", ghost: true, label: tr("หมุนซ้าย", "Rotate left"), onclick: () => rotateSelected(270) });
  const rotateRBtn = button("", { icon: "rotateR", ghost: true, label: tr("หมุนขวา", "Rotate right"), onclick: () => rotateSelected(90) });
  const toggleBtn = button("", { icon: "trash", ghost: true, label: tr("ลบ/เอากลับ", "Remove/restore"), onclick: toggleSelected });
  const resetBtn = button(tr("รีเซ็ตทั้งหมด", "Reset all"), { icon: "undo", ghost: true, onclick: () => { if (file) loadPreview(); } });
  [rotateLBtn, rotateRBtn, toggleBtn, resetBtn].forEach((b) => { b.disabled = true; });

  // ── แผงขวา: เก็บเฉพาะบางหน้าแบบพิมพ์ช่วง ────────────────────────────
  const rangeInput = el("input", { type: "text", placeholder: tr("เช่น 1-3,5,8-", "e.g. 1-3,5,8-"), disabled: true });
  const rangeBtn = button(tr("ใช้ช่วงนี้", "Apply range"), { ghost: true, onclick: applyRange });
  rangeBtn.disabled = true;
  const rightNode = el("div", { class: "pp-right" }, [
    field(tr("เก็บเฉพาะหน้า", "Keep only these pages"), rangeInput, tr("หน้านอกช่วงจะถูกทำเครื่องหมายลบอัตโนมัติ",
      "Pages outside the range are marked for removal automatically")),
    rangeBtn,
  ]);

  const saveBtn = button(tr("บันทึก", "Save"), { onclick: save });
  saveBtn.disabled = true;

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์ PDF", "PDF file"), node: leftNode },
    center: { node: pagesGrid, empty: tr("ยังไม่มีไฟล์ เลือก PDF เพื่อดูตัวอย่าง", "No file yet. Choose a PDF to preview") },
    right: { title: tr("ตัวเลือก", "Options"), node: rightNode },
    toolbar: [rotateLBtn, rotateRBtn, toggleBtn, el("div", { class: "sep" }), resetBtn],
    footer: [st.node, saveBtn],
  });
  ws.wrap.prepend(el("style", {}, STYLE));
  ws.body.append(
    results,
    el("div", { class: "note" },
      // ‼️ เครื่องมือนี้สร้างไฟล์ใหม่แล้วคัดลอกหน้าที่เก็บเข้าไป สารบัญ/บุ๊กมาร์กของไฟล์เดิม
      //    จึงไม่ติดมาด้วย แม้ผู้ใช้จะไม่ได้แก้อะไรเลย · บอกไว้ตรง ๆ เหมือนที่ pdf-merge บอก
      tr("คลิกหน้าเพื่อเลือก ลากเพื่อสลับลำดับ หรือพิมพ์ช่วงหน้าด้านขวาเพื่อเก็บเฉพาะบางหน้า",
         "Click a page to select, drag to reorder, or type a range on the right to keep pages")),
    // แยกเป็นอีกก้อนเพราะข้อความบนหน้าจอก้อนเดียวห้ามยาวเกิน 100 ตัวอักษร (มีเทสจับ)
    el("div", { class: "note" },
      tr("ไฟล์ที่ได้จะไม่มีสารบัญ/บุ๊กมาร์กของไฟล์เดิมติดมา",
         "The result will not carry over the original bookmarks")),
  );
  ws.showCanvas(false);

  function setLoaded(on) {
    rangeInput.disabled = !on;
    rangeBtn.disabled = !on;
    saveBtn.disabled = !on;
    resetBtn.disabled = !on;
  }

  function updateSummary() {
    if (!items.length) { summary.textContent = tr("ยังไม่ได้เลือกไฟล์", "No file chosen yet"); return; }
    const keep = items.filter((i) => !i.dropped).length;
    summary.innerHTML = "";
    summary.append(el("div", {}, [
      tr("ทั้งหมด ", "Total "), el("b", {}, String(items.length)), tr(" หน้า, เก็บ ", " pages, keep "),
      el("b", {}, String(keep)), tr(", ลบ ", ", remove "), el("b", {}, String(items.length - keep)),
    ]));
  }

  async function loadPreview() {
    pagesGrid.innerHTML = "";
    results.innerHTML = "";
    items = [];
    selected = null;
    setLoaded(false);
    ws.showCanvas(false);
    updateSummary();
    st.info(tr("กำลังสร้างภาพตัวอย่าง…", "Generating page previews…"));
    try {
      const pdf = await openPdf(file, passwordBox(extra));
      ws.setBusy(true);
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: 0.35 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        page.cleanup();
        items.push({ index: p - 1, rotate: 0, dropped: false, thumb: canvas.toDataURL("image/jpeg", 0.7) });
        canvas.width = canvas.height = 0;
        st.progress((p / pdf.numPages) * 100, `(${p}/${pdf.numPages})`);
        await yieldToBrowser();
      }
      pdf.destroy();
      ws.setBusy(false);
      st.progress(null);
      st.ok(tr(`โหลดแล้ว ${items.length} หน้า`, `Loaded ${items.length} pages`));
      setLoaded(true);
      ws.showCanvas(true);
      render();
    } catch (e) {
      ws.setBusy(false);
      st.progress(null);
      st.err(tr("เปิดไฟล์ไม่ได้: ", "Couldn't open file: ") + e.message);
      updateSummary();
    }
  }

  function render() {
    pagesGrid.innerHTML = "";
    items.forEach((it, i) => {
      const card = el("div", {
        class: "pg" + (it.dropped ? " dropped" : "") + (it === selected ? " selected" : ""),
        draggable: "true", "data-i": i, tabindex: "0", role: "button",
        "aria-pressed": it === selected ? "true" : "false",
        "aria-label": tr(`หน้า ${i + 1}${it.dropped ? " (ทำเครื่องหมายลบไว้)" : ""}`, `Page ${i + 1}${it.dropped ? " (marked for removal)" : ""}`),
        onclick: () => { selectItem(it === selected ? null : it); },
        onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectItem(it === selected ? null : it); } },
      }, [
        el("img", { src: it.thumb, alt: tr(`หน้า ${it.index + 1}`, `Page ${it.index + 1}`), loading: "lazy",
          style: { transform: `rotate(${it.rotate}deg)` } }),
        el("span", { class: "num" }, String(i + 1)),
        el("div", { class: "tools" }, [
          el("button", { type: "button",
            title: tr(`หมุนซ้าย (หน้า ${i + 1})`, `Rotate left (page ${i + 1})`),
            "aria-label": tr(`หมุนหน้า ${i + 1} ไปทางซ้าย`, `Rotate page ${i + 1} left`),
            onclick: (e) => { e.stopPropagation(); it.rotate = (it.rotate + 270) % 360; render(); } }, [uiIcon("rotateL", "pg-ico")]),
          el("button", { type: "button",
            title: tr(`หมุนขวา (หน้า ${i + 1})`, `Rotate right (page ${i + 1})`),
            "aria-label": tr(`หมุนหน้า ${i + 1} ไปทางขวา`, `Rotate page ${i + 1} right`),
            onclick: (e) => { e.stopPropagation(); it.rotate = (it.rotate + 90) % 360; render(); } }, [uiIcon("rotateR", "pg-ico")]),
          el("button", { type: "button",
            title: it.dropped ? tr(`เอากลับ (หน้า ${i + 1})`, `Restore page ${i + 1}`) : tr(`ลบหน้านี้ (หน้า ${i + 1})`, `Remove page ${i + 1}`),
            "aria-label": it.dropped ? tr(`เอาหน้า ${i + 1} กลับ`, `Restore page ${i + 1}`) : tr(`ลบหน้า ${i + 1}`, `Delete page ${i + 1}`),
            onclick: (e) => { e.stopPropagation(); it.dropped = !it.dropped; render(); } }, [uiIcon(it.dropped ? "undo" : "trash", "pg-ico")]),
        ]),
      ]);
      pagesGrid.appendChild(card);
    });
    updateSummary();
    st.info(tr(`เหลือ ${items.filter((i) => !i.dropped).length}/${items.length} หน้า`,
                `${items.filter((i) => !i.dropped).length}/${items.length} pages left`));
    syncToolbar();
  }

  function selectItem(it) {
    selected = it;
    render();
  }

  function rotateSelected(delta) {
    if (!selected) return;
    selected.rotate = (selected.rotate + delta) % 360;
    render();
  }

  function toggleSelected() {
    if (!selected) return;
    selected.dropped = !selected.dropped;
    render();
  }

  function syncToolbar() {
    const has = !!selected;
    rotateLBtn.disabled = !has;
    rotateRBtn.disabled = !has;
    toggleBtn.disabled = !has;
    toggleBtn.replaceChildren(uiIcon(has && selected.dropped ? "undo" : "trash", "btn-ico"));
    toggleBtn.title = has && selected.dropped ? tr("เอากลับ", "Restore") : tr("ลบหน้านี้", "Remove this page");
  }

  function applyRange() {
    if (!items.length) return;
    let pages;
    try { pages = parsePages(rangeInput.value, items.length); }
    catch (e) { st.err(e.message); return; }
    if (!pages.length) { st.err(tr("ไม่พบเลขหน้าที่ถูกต้องในช่วงที่พิมพ์", "No valid page numbers found in what you typed")); return; }
    const keepSet = new Set(pages.map((p) => p - 1));
    items.forEach((it, i) => { it.dropped = !keepSet.has(i); });
    selected = null;
    render();
    st.ok(tr(`ตั้งช่วง ${rangeInput.value} (${pages.length} หน้า)`,
             `Set range ${rangeInput.value} (${pages.length} pages)`));
  }

  let dragging = null;
  pagesGrid.addEventListener("dragstart", (e) => {
    dragging = e.target.closest(".pg");
    dragging?.classList.add("dragging");
  });
  pagesGrid.addEventListener("dragend", () => {
    pagesGrid.querySelectorAll(".pg").forEach((n) => n.classList.remove("dragging", "over"));
    dragging = null;
  });
  pagesGrid.addEventListener("dragover", (e) => {
    e.preventDefault();
    const over = e.target.closest(".pg");
    if (!over || over === dragging) return;
    pagesGrid.querySelectorAll(".pg").forEach((n) => n.classList.remove("over"));
    over.classList.add("over");
  });
  pagesGrid.addEventListener("drop", (e) => {
    e.preventDefault();
    const over = e.target.closest(".pg");
    if (!over || !dragging) return;
    const from = +dragging.dataset.i, to = +over.dataset.i;
    items.splice(to, 0, items.splice(from, 1)[0]);
    render();
  });

  async function save() {
    const keep = items.filter((i) => !i.dropped);
    if (!file) return st.err(tr("เลือกไฟล์ก่อน", "Choose a file first"));
    if (!keep.length) return st.err(tr("ต้องเหลืออย่างน้อย 1 หน้า", "At least 1 page must remain"));
    results.innerHTML = "";
    saveBtn.disabled = true;
    ws.setBusy(true);
    st.info(tr("กำลังบันทึก…", "Saving…"));
    try {
      const { PDFDocument, degrees } = PDFLib;
      const { doc: src, encrypted, hiddenLayers } = await loadPdfLib(file);
      const out = await PDFDocument.create();
      const copied = await out.copyPages(src, keep.map((k) => k.index));
      copied.forEach((page, i) => {
        if (keep[i].rotate) {
          const base = page.getRotation().angle;
          page.setRotation(degrees((base + keep[i].rotate) % 360));
        }
        out.addPage(page);
      });
      const blob = new Blob([await out.save()], { type: "application/pdf" });
      st.ok(tr(`บันทึกแล้ว ${keep.length} หน้า`, `Saved, ${keep.length} pages`));
      if (encrypted) results.appendChild(el("div", { class: "status show err" }, ENCRYPTED_WARNING));
      // ‼️ ชั้นที่ผู้ใช้ซ่อนไว้จะกลายเป็นมองเห็นได้ในไฟล์ผลลัพธ์ ต้องบอกก่อนไฟล์หลุดไป
      if (hiddenLayers) results.appendChild(el("div", { class: "note warn" }, HIDDEN_LAYERS_WARNING));
      const name = stripExt(file.name) + tr("-จัดหน้าใหม่.pdf", "-edited.pdf");
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, tr(`${keep.length} หน้า`, `${keep.length} pages`))]),
        downloadButton(blob, name),
      ]));
    } catch (e) {
      st.err(tr("บันทึกไม่ได้: ", "Couldn't save: ") + e.message);
    } finally {
      ws.setBusy(false);
      saveBtn.disabled = false;
    }
  }

  return ws.wrap;
}
