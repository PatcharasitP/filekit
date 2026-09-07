import { loadPdfLib, ENCRYPTED_WARNING, openPdf, passwordBox } from "../pdfopen.js";
import { el, dropzone, statusBar, button, field, download, stripExt, parsePages, yieldToBrowser } from "../ui.js";
import { workspace } from "../workspace.js";
import { uiIcon } from "../icons.js";

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
  const summary = el("div", { class: "pp-stats" }, "ยังไม่ได้เลือกไฟล์");
  let file = null;
  let items = []; // {index, rotate, dropped, thumb}
  let selected = null; // อ้างถึงสมาชิกใน items ที่กำลังเลือกอยู่ (ไม่ใช่ index กันหลุดตอนลากสลับ)

  const dz = dropzone({
    expect: ["pdf"], expectLabel: "ไฟล์ PDF",
    accept: "application/pdf,.pdf", multiple: false, hint: "ครั้งละ 1 ไฟล์",
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
  const rotateLBtn = button("", { icon: "rotateL", ghost: true, label: "หมุนซ้ายหน้าที่เลือก", onclick: () => rotateSelected(270) });
  const rotateRBtn = button("", { icon: "rotateR", ghost: true, label: "หมุนขวาหน้าที่เลือก", onclick: () => rotateSelected(90) });
  const toggleBtn = button("", { icon: "trash", ghost: true, label: "ลบ/เอากลับหน้าที่เลือก", onclick: toggleSelected });
  const resetBtn = button("รีเซ็ตทั้งหมด", { icon: "undo", ghost: true, onclick: () => { if (file) loadPreview(); } });
  [rotateLBtn, rotateRBtn, toggleBtn, resetBtn].forEach((b) => { b.disabled = true; });

  // ── แผงขวา: เก็บเฉพาะบางหน้าแบบพิมพ์ช่วง ────────────────────────────
  const rangeInput = el("input", { type: "text", placeholder: "เช่น 1-3,5,8-", disabled: true });
  const rangeBtn = button("ใช้ช่วงนี้", { ghost: true, onclick: applyRange });
  rangeBtn.disabled = true;
  const rightNode = el("div", { class: "pp-right" }, [
    field("เก็บเฉพาะหน้า", rangeInput, "อ้างอิงตามลำดับที่แสดงอยู่ตอนนี้ — หน้านอกช่วงจะถูกทำเครื่องหมายลบให้อัตโนมัติ"),
    rangeBtn,
  ]);

  const saveBtn = button("บันทึกเป็นไฟล์ใหม่", { onclick: save });
  saveBtn.disabled = true;

  const ws = workspace(tool, {
    left: { title: "ไฟล์ PDF", node: leftNode },
    center: { node: pagesGrid, empty: "ยังไม่มีไฟล์ — เลือกไฟล์ PDF ก่อนเพื่อดูตัวอย่างหน้า" },
    right: { title: "ตัวเลือก", node: rightNode },
    toolbar: [rotateLBtn, rotateRBtn, toggleBtn, el("div", { class: "sep" }), resetBtn],
    footer: [st.node, saveBtn],
  });
  ws.wrap.prepend(el("style", {}, STYLE));
  ws.body.append(
    results,
    el("div", { class: "note" },
      "คลิกที่หน้าเพื่อเลือก แล้วใช้แถบเครื่องมือด้านบนหมุน/ลบ/เอากลับ — หรือกดปุ่มเล็กบนการ์ดแต่ละใบได้เหมือนเดิม · ลากการ์ดเพื่อสลับลำดับ · พิมพ์ช่วงหน้าในแผงขวาเพื่อเลือกเก็บเฉพาะบางหน้าอย่างรวดเร็ว"),
  );
  ws.showCanvas(false);

  function setLoaded(on) {
    rangeInput.disabled = !on;
    rangeBtn.disabled = !on;
    saveBtn.disabled = !on;
    resetBtn.disabled = !on;
  }

  function updateSummary() {
    if (!items.length) { summary.textContent = "ยังไม่ได้เลือกไฟล์"; return; }
    const keep = items.filter((i) => !i.dropped).length;
    summary.innerHTML = "";
    summary.append(el("div", {}, [
      "ทั้งหมด ", el("b", {}, String(items.length)), " หน้า · เก็บ ",
      el("b", {}, String(keep)), " · ลบ ", el("b", {}, String(items.length - keep)),
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
    st.info("กำลังสร้างภาพตัวอย่าง…");
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
      st.ok(`โหลด ${items.length} หน้าเรียบร้อย — จัดเรียงได้เลย`);
      setLoaded(true);
      ws.showCanvas(true);
      render();
    } catch (e) {
      ws.setBusy(false);
      st.progress(null);
      st.err("เปิดไฟล์ไม่สำเร็จ: " + e.message);
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
        "aria-label": `หน้า ${i + 1}${it.dropped ? " (ทำเครื่องหมายลบไว้)" : ""}`,
        onclick: () => { selectItem(it === selected ? null : it); },
        onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectItem(it === selected ? null : it); } },
      }, [
        el("img", { src: it.thumb, alt: `หน้า ${it.index + 1}`, loading: "lazy",
          style: { transform: `rotate(${it.rotate}deg)` } }),
        el("span", { class: "num" }, String(i + 1)),
        el("div", { class: "tools" }, [
          el("button", { type: "button", title: "หมุนซ้าย", onclick: (e) => { e.stopPropagation(); it.rotate = (it.rotate + 270) % 360; render(); } }, [uiIcon("rotateL", "pg-ico")]),
          el("button", { type: "button", title: "หมุนขวา", onclick: (e) => { e.stopPropagation(); it.rotate = (it.rotate + 90) % 360; render(); } }, [uiIcon("rotateR", "pg-ico")]),
          el("button", { type: "button", title: it.dropped ? "เอากลับ" : "ลบหน้านี้", onclick: (e) => { e.stopPropagation(); it.dropped = !it.dropped; render(); } }, [uiIcon(it.dropped ? "undo" : "trash", "pg-ico")]),
        ]),
      ]);
      pagesGrid.appendChild(card);
    });
    updateSummary();
    st.info(`เหลือ ${items.filter((i) => !i.dropped).length} หน้าจากทั้งหมด ${items.length} หน้า`);
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
    toggleBtn.title = has && selected.dropped ? "เอากลับ" : "ลบหน้านี้";
  }

  function applyRange() {
    if (!items.length) return;
    let pages;
    try { pages = parsePages(rangeInput.value, items.length); }
    catch (e) { st.err(e.message); return; }
    if (!pages.length) { st.err("ไม่พบเลขหน้าที่ถูกต้องในช่วงที่พิมพ์"); return; }
    const keepSet = new Set(pages.map((p) => p - 1));
    items.forEach((it, i) => { it.dropped = !keepSet.has(i); });
    selected = null;
    render();
    st.ok(`ตั้งค่าเก็บเฉพาะหน้า ${rangeInput.value} แล้ว (${pages.length} หน้า) — ตรวจสอบก่อนบันทึก`);
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
    if (!file) return st.err("กรุณาเลือกไฟล์ก่อน");
    if (!keep.length) return st.err("ต้องเหลืออย่างน้อย 1 หน้า");
    results.innerHTML = "";
    saveBtn.disabled = true;
    ws.setBusy(true);
    st.info("กำลังบันทึก…");
    try {
      const { PDFDocument, degrees } = PDFLib;
      const { doc: src, encrypted } = await loadPdfLib(file);
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
      st.ok(`บันทึกแล้ว ${keep.length} หน้า`);
      if (encrypted) results.appendChild(el("div", { class: "status show err" }, ENCRYPTED_WARNING));
      const name = stripExt(file.name) + "-จัดหน้าใหม่.pdf";
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name), el("small", {}, `${keep.length} หน้า`)]),
        button("ดาวน์โหลด", { icon: "download",  onclick: () => download(blob, name) }),
      ]));
    } catch (e) {
      st.err("บันทึกไม่สำเร็จ: " + e.message);
    } finally {
      ws.setBusy(false);
      saveBtn.disabled = false;
    }
  }

  return ws.wrap;
}
