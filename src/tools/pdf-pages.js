import { loadPdfLib, ENCRYPTED_WARNING, HIDDEN_LAYERS_WARNING, openPdf, passwordBox } from "../pdfopen.js";
import { el, dropzone, statusBar, button, field, downloadButton, stripExt, parsePages, yieldToBrowser, fmtBytes } from "../ui.js";
import { workspace } from "../workspace.js";
import { uiIcon } from "../icons.js";
import { tr, pl } from "../i18n.js";

/* ‼️ ไฟล์ไหนเป็นของใคร บอกด้วย "ตัวอักษร" ไม่ใช่ "สี" (ตัดสินจากการวัดจริง 18/09/2026)
   ลองชุดสี 4 แบบแล้ววัดด้วย src/cvd.js ไม่มีชุดไหนที่ 5 สีขึ้นไปแยกออกครบทั้งสามแบบตาบอดสี
   ชุดที่ดีที่สุดยังเหลือคู่ที่ห่างกันแค่ 4.9 ซึ่งต่ำกว่าเกณฑ์ 10 ของโปรเจกต์
   จึงให้ตัวอักษร A B C เป็นตัวบอกจริง ส่วนสีเป็นแค่ตัวช่วยให้กวาดตาเร็ว
   ชุดสีนี้ค้นครบทุกคู่จากผู้สมัคร 18 สี ได้ระยะห่างตาปกติน้อยสุด 27.3 */
const FILE_COLORS = ["#e8613c", "#0e8ba8", "#2f9e63", "#c9a227", "#b0355f", "#7c3aed"];
const colorOf = (fi) => FILE_COLORS[fi % FILE_COLORS.length];
// A..Z แล้ววนเป็น A2 B2 ถ้าไฟล์เกิน 26 ตัว (ไม่จำกัดจำนวนไฟล์)
const tagOf = (fi) => String.fromCharCode(65 + (fi % 26)) + (fi >= 26 ? String(Math.floor(fi / 26) + 1) : "");

// สไตล์เสริมเฉพาะหน้านี้ — ห้ามแก้ assets/css/tool.css จึงฝังไว้ในโมดูลแทน
const STYLE = `
.pp-left,.pp-right{display:flex;flex-direction:column;gap:10px}
.pp-stats{font-size:12.5px;line-height:1.6;color:var(--text-mute);padding:9px 12px;
  background:var(--bg-soft);border:1px solid var(--line-soft);border-radius:var(--r-sm,10px)}
.pp-stats b{color:var(--text);font-variant-numeric:tabular-nums}
.pg.selected{outline:2px solid var(--ac,var(--brand));outline-offset:2px}
/* แถบสีประจำไฟล์บนการ์ดหน้า กับป้ายตัวอักษรที่เป็นตัวบอกจริง */
.pg{position:relative}
.pg.multi{border-top:3px solid var(--fc,transparent)}
.pg .src{position:absolute;inset-block-start:5px;inset-inline-start:5px;z-index:2;
  min-width:19px;height:19px;padding:0 5px;border-radius:5px;background:var(--fc,#666);
  color:#fff;font-size:11px;font-weight:700;line-height:19px;text-align:center;
  box-shadow:0 1px 3px rgba(0,0,0,.35)}
/* ‼️ ป้าย A B C ไปเกาะกับรายการไฟล์ที่กล่องเลือกไฟล์วาดไว้แล้ว ไม่ทำรายการใหม่
   เคยทำรายการแยกของตัวเอง แล้วชื่อไฟล์ขึ้นสองที่ซ้ำกันบนหน้าจอเดียว รกโดยไม่ได้อะไรเพิ่ม */
/* ‼️ ป้ายต้อง "ลอยทับ" ไม่ใช่แทรกเป็นช่องใหม่ในแถว
   เคยแทรกเป็นช่องปกติ แล้วแถวแคบลงจนขนาดไฟล์ตกบรรทัดเป็น "2.3" กับ "KB" คนละบรรทัด
   และชื่อไฟล์โดนตัดเร็วขึ้นจนอ่านไม่ออกว่าไฟล์ไหน */
.pp-has-tag{position:relative}
.pp-tag{position:absolute;inset-block-start:3px;inset-inline-start:3px;z-index:2;
  min-width:17px;height:17px;padding:0 4px;border-radius:5px;
  background:var(--fc,#666);color:#fff;font-size:10.5px;font-weight:700;line-height:17px;text-align:center;
  box-shadow:0 1px 3px rgba(0,0,0,.3)}
`;

export function mount(tool) {
  const st = statusBar();
  const pagesGrid = el("div", { class: "pages" });
  const extra = el("div", {}); // ที่อยู่กล่องขอรหัสผ่านไฟล์ล็อก
  const results = el("div", { class: "results" });
  const summary = el("div", { class: "pp-stats" }, tr("ยังไม่ได้เลือกไฟล์", "No file chosen yet"));
  let files = [];
  let items = []; // {fi, index, rotate, dropped, thumb}
  let selected = null; // อ้างถึงสมาชิกใน items ที่กำลังเลือกอยู่ (ไม่ใช่ index กันหลุดตอนลากสลับ)

  const dz = dropzone({
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "PDF files"),
    accept: "application/pdf,.pdf", multiple: true,
    hint: tr("หลายไฟล์ได้ ทุกหน้ามารวมกันในกระดานเดียว", "Multiple files, all pages on one board"),
    onChange: (f) => {
      files = [...(f || [])];
      results.innerHTML = "";
      if (files.length) loadPreview();
      else { items = []; selected = null; pagesGrid.innerHTML = ""; st.clear(); setLoaded(false); renderFiles(); updateSummary(); ws.showCanvas(false); }
    },
  });

  // ── แผงซ้าย: เลือกไฟล์ + รายชื่อไฟล์ + สรุปจำนวนหน้า ─────────────────
  const leftNode = el("div", { class: "pp-left" }, [dz.container, extra, summary]);

  // ── แถบเครื่องมือลอย: ทำงานกับหน้าที่เลือกอยู่ ──────────────────────
  const rotateLBtn = button("", { icon: "rotateL", ghost: true, label: tr("หมุนซ้าย", "Rotate left"), onclick: () => rotateSelected(270) });
  const rotateRBtn = button("", { icon: "rotateR", ghost: true, label: tr("หมุนขวา", "Rotate right"), onclick: () => rotateSelected(90) });
  const toggleBtn = button("", { icon: "trash", ghost: true, label: tr("ลบ/เอากลับ", "Remove/restore"), onclick: toggleSelected });
  const resetBtn = button(tr("รีเซ็ตทั้งหมด", "Reset all"), { icon: "undo", ghost: true, onclick: () => { if (files.length) loadPreview(); } });
  [rotateLBtn, rotateRBtn, toggleBtn, resetBtn].forEach((b) => { b.disabled = true; });

  // ── แผงขวา: เก็บเฉพาะบางหน้า + วิธีเรียงเมื่อมีหลายไฟล์ ───────────────
  const rangeInput = el("input", { type: "text", placeholder: tr("เช่น 1-3,5,8-", "e.g. 1-3,5,8-"), disabled: true });
  const rangeBtn = button(tr("ใช้ช่วงนี้", "Apply range"), { ghost: true, onclick: applyRange });
  rangeBtn.disabled = true;
  const byFileBtn = button(tr("เรียงทีละไฟล์", "Group by file"), { ghost: true, onclick: () => reorder("byfile") });
  const zipBtn = button(tr("สลับไฟล์ทีละหน้า", "Interleave pages"), { ghost: true, onclick: () => reorder("zip") });
  [byFileBtn, zipBtn].forEach((b) => { b.disabled = true; });
  const sortGroup = el("div", {}, [
    el("h3", {}, tr("วิธีเรียงเมื่อมีหลายไฟล์", "Order across files")),
    el("div", { class: "row" }, [byFileBtn, zipBtn]),
    el("small", {}, tr("เรียงทีละไฟล์ คือไฟล์ A จนหมดแล้วต่อ B", "Group by file puts all of A, then all of B")),
  ]);
  const rightNode = el("div", { class: "pp-right" }, [
    el("div", {}, [
      field(tr("เก็บเฉพาะหน้า", "Keep only these pages"), rangeInput, tr("หน้านอกช่วงจะถูกทำเครื่องหมายลบอัตโนมัติ",
        "Pages outside the range are marked for removal automatically")),
      rangeBtn,
    ]),
    sortGroup,
  ]);

  const saveBtn = button(tr("บันทึก", "Save"), { onclick: save });
  saveBtn.disabled = true;

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์ PDF", "PDF files"), node: leftNode },
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
      tr("ใส่หลายไฟล์ได้ ป้าย A B C บอกว่าหน้านั้นมาจากไฟล์ไหน",
         "Multiple files welcome. The A B C tag shows which file a page came from")),
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
    // ปุ่มเรียงมีความหมายเฉพาะตอนมีมากกว่าหนึ่งไฟล์
    const many = on && files.length > 1;
    byFileBtn.disabled = !many;
    zipBtn.disabled = !many;
    sortGroup.hidden = !many;
  }

  /* ติดป้าย A B C กับแถวไฟล์ที่กล่องเลือกไฟล์วาดไว้แล้ว
     ‼️ กล่องเลือกไฟล์วาดแถวใหม่ทุกครั้งที่ไฟล์เปลี่ยน ป้ายจึงหายไปด้วย
        ต้องติดใหม่หลังทุกครั้งที่รายการเปลี่ยน ไม่ใช่ติดครั้งเดียวตอนเริ่ม */
  function renderFiles() {
    const rows = leftNode.querySelectorAll(".file-row");
    rows.forEach((row, i) => {
      row.querySelector(".pp-tag")?.remove();
      row.classList.remove("pp-has-tag");
      if (files.length < 2) return;   // ไฟล์เดียวไม่ต้องมีป้าย ไม่มีอะไรให้แยก
      row.classList.add("pp-has-tag");
      row.prepend(el("span", { class: "pp-tag", style: { "--fc": colorOf(i) } }, tagOf(i)));
    });
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
    renderFiles();
    updateSummary();
    st.info(tr("กำลังสร้างภาพตัวอย่าง…", "Generating page previews…"));
    ws.setBusy(true);
    try {
      /* ‼️ นับหน้ารวมไว้ก่อนไม่ได้ ต้องเปิดไฟล์ถึงจะรู้ว่ากี่หน้า
         จึงรายงานความคืบหน้าเป็น "ไฟล์ที่เท่าไหร่ หน้าที่เท่าไหร่" แทนเปอร์เซ็นต์รวม */
      for (let fi = 0; fi < files.length; fi++) {
        const pdf = await openPdf(files[fi], passwordBox(extra));
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const viewport = page.getViewport({ scale: 0.35 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
          page.cleanup();
          items.push({ fi, index: p - 1, rotate: 0, dropped: false, thumb: canvas.toDataURL("image/jpeg", 0.7) });
          canvas.width = canvas.height = 0;
          st.progress((p / pdf.numPages) * 100,
            files.length > 1 ? `${tagOf(fi)} (${p}/${pdf.numPages})` : `(${p}/${pdf.numPages})`);
          await yieldToBrowser();
        }
        pdf.destroy();
      }
      ws.setBusy(false);
      st.progress(null);
      st.ok(tr(`โหลดแล้ว ${items.length} หน้า`, `Loaded ${pl(items.length, "page", "pages")}`));
      setLoaded(true);
      ws.showCanvas(true);
      renderFiles();
      render();
    } catch (e) {
      ws.setBusy(false);
      st.progress(null);
      st.err(tr("เปิดไฟล์ไม่ได้: ", "Couldn't open file: ") + e.message);
      updateSummary();
    }
  }

  function render() {
    const many = files.length > 1;
    pagesGrid.innerHTML = "";
    items.forEach((it, i) => {
      const srcLabel = tr(`ไฟล์ ${tagOf(it.fi)}`, `File ${tagOf(it.fi)}`);
      const card = el("div", {
        class: "pg" + (many ? " multi" : "") + (it.dropped ? " dropped" : "") + (it === selected ? " selected" : ""),
        style: many ? { "--fc": colorOf(it.fi) } : null,
        draggable: "true", "data-i": i, tabindex: "0", role: "button",
        "aria-pressed": it === selected ? "true" : "false",
        "aria-label": tr(`หน้า ${i + 1}${many ? " จาก" + srcLabel : ""}${it.dropped ? " (ทำเครื่องหมายลบไว้)" : ""}`,
                         `Page ${i + 1}${many ? " from " + srcLabel : ""}${it.dropped ? " (marked for removal)" : ""}`),
        onclick: () => { selectItem(it === selected ? null : it); },
        onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectItem(it === selected ? null : it); } },
      }, [
        many ? el("span", { class: "src", title: `${srcLabel}: ${files[it.fi].name}` }, tagOf(it.fi)) : null,
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
                `${items.filter((i) => !i.dropped).length}/${pl(items.length, "page", "pages")} left`));
    syncToolbar();
  }

  /* เรียงใหม่ 2 แบบ
     byfile = ไฟล์ A จนหมดแล้วต่อ B ซึ่งเป็นลำดับเดิมตอนโหลดเข้ามา
     zip    = หน้าแรกของทุกไฟล์ก่อน แล้วค่อยหน้าสอง ใช้ตอนสแกนหน้าหน้ากับหลังแยกไฟล์กันมา */
  function reorder(mode) {
    if (items.length < 2) return;
    const byFile = new Map();
    items.forEach((it) => {
      if (!byFile.has(it.fi)) byFile.set(it.fi, []);
      byFile.get(it.fi).push(it);
    });
    const groups = [...byFile.keys()].sort((a, b) => a - b).map((k) => byFile.get(k));
    if (mode === "byfile") {
      items = groups.flat();
      st.ok(tr("เรียงทีละไฟล์แล้ว", "Grouped by file"));
    } else {
      const out = [];
      const longest = Math.max(...groups.map((g) => g.length));
      for (let i = 0; i < longest; i++) for (const g of groups) if (g[i]) out.push(g[i]);
      items = out;
      st.ok(tr("สลับไฟล์ทีละหน้าแล้ว", "Interleaved across files"));
    }
    render();
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
             `Set range ${rangeInput.value} (${pl(pages.length, "page", "pages")})`));
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
    if (!files.length) return st.err(tr("เลือกไฟล์ก่อน", "Choose a file first"));
    if (!keep.length) return st.err(tr("ต้องเหลืออย่างน้อย 1 หน้า", "At least 1 page must remain"));
    results.innerHTML = "";
    saveBtn.disabled = true;
    ws.setBusy(true);
    st.info(tr("กำลังบันทึก…", "Saving…"));
    try {
      const { PDFDocument, degrees } = PDFLib;
      const out = await PDFDocument.create();
      let encrypted = false, hiddenLayers = false;

      /* ‼️ เปิดแต่ละไฟล์ครั้งเดียวแล้วเก็บไว้ ไม่ใช่เปิดใหม่ทุกหน้า
         ไฟล์ 50 หน้าถ้าเปิดซ้ำทุกหน้าคือถอดรหัสไฟล์เดิม 50 รอบ ช้าโดยไม่จำเป็น
         ‼️ และต้อง copyPages ทีละไฟล์เป็นก้อน แต่ใส่ลงเล่มตามลำดับที่ผู้ใช้จัดไว้
         ถ้าคัดลอกทีละหน้าตามลำดับ จะสลับ src ไปมาซึ่ง pdf-lib ทำงานช้ากว่ามาก */
      const srcDocs = new Map();
      for (const fi of new Set(keep.map((k) => k.fi))) {
        const r = await loadPdfLib(files[fi]);
        srcDocs.set(fi, r.doc);
        encrypted = encrypted || r.encrypted;
        hiddenLayers = hiddenLayers || r.hiddenLayers;
      }
      // คัดลอกเป็นก้อนต่อไฟล์ แล้วค่อยเรียงกลับตามตำแหน่งเดิมที่ผู้ใช้จัดไว้
      const copiedAt = new Array(keep.length);
      for (const [fi, doc] of srcDocs) {
        const slots = keep.map((k, i) => (k.fi === fi ? i : -1)).filter((i) => i >= 0);
        const pages = await out.copyPages(doc, slots.map((i) => keep[i].index));
        slots.forEach((slot, j) => { copiedAt[slot] = pages[j]; });
      }
      copiedAt.forEach((page, i) => {
        if (keep[i].rotate) {
          const base = page.getRotation().angle;
          page.setRotation(degrees((base + keep[i].rotate) % 360));
        }
        out.addPage(page);
      });

      const blob = new Blob([await out.save()], { type: "application/pdf" });
      st.ok(tr(`บันทึกแล้ว ${keep.length} หน้า`, `Saved, ${pl(keep.length, "page", "pages")}`));
      if (encrypted) results.appendChild(el("div", { class: "status show err" }, ENCRYPTED_WARNING));
      // ‼️ ชั้นที่ผู้ใช้ซ่อนไว้จะกลายเป็นมองเห็นได้ในไฟล์ผลลัพธ์ ต้องบอกก่อนไฟล์หลุดไป
      if (hiddenLayers) results.appendChild(el("div", { class: "note warn" }, HIDDEN_LAYERS_WARNING));
      // หลายไฟล์ใช้ชื่อกลาง ๆ เพราะเอาชื่อไฟล์แรกมาตั้งจะเข้าใจผิดว่าได้แค่ไฟล์นั้น
      const name = files.length > 1
        ? tr("รวมจัดหน้าใหม่.pdf", "combined-pages.pdf")
        : stripExt(files[0].name) + tr("-จัดหน้าใหม่.pdf", "-edited.pdf");
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, tr(`${keep.length} หน้า`, `${pl(keep.length, "page", "pages")}`))]),
        el("span", { class: "r-size" }, fmtBytes(blob.size)),
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
