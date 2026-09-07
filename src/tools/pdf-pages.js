import { loadPdfLib, ENCRYPTED_WARNING, openPdf, passwordBox } from "../pdfopen.js";
import { el, dropzone, toolShell, statusBar, button, download, stripExt, yieldToBrowser } from "../ui.js";
import { uiIcon } from "../icons.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const grid = el("div", { class: "pages" });
  const results = el("div", { class: "results" });
  const extra = el("div", {});
  let file = null;
  let items = []; // {index, rotate, dropped, thumb}

  const dz = dropzone({
    expect: ["pdf"], expectLabel: "ไฟล์ PDF",
    accept: "application/pdf,.pdf", multiple: false, hint: "ครั้งละ 1 ไฟล์",
    onChange: (f) => { file = f[0] || null; results.innerHTML = ""; if (file) loadPreview(); else { grid.innerHTML = ""; st.clear(); } },
  });

  const actions = el("div", { class: "actions" }, [
    button("💾 บันทึกเป็นไฟล์ใหม่", { onclick: save }),
    button("รีเซ็ตทั้งหมด", { icon: "undo", ghost: true, onclick: () => { if (file) loadPreview(); } }),
  ]);
  actions.style.display = "none";

  body.append(dz.container, st.node, extra, grid, actions, results);
  body.appendChild(el("div", { class: "note" },
    "คลิก 🗑 เพื่อทำเครื่องหมายลบหน้า (กดซ้ำเพื่อเอากลับ) · ปุ่มลูกศรโค้งหมุนทีละ 90° · ลากการ์ดเพื่อสลับลำดับ แล้วกดบันทึก"));

  async function loadPreview() {
    grid.innerHTML = "";
    results.innerHTML = "";
    actions.style.display = "none";
    st.info("กำลังสร้างภาพตัวอย่าง…");
    try {
      const pdf = await openPdf(file, passwordBox(extra));
      items = [];
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
      st.progress(null);
      st.ok(`โหลด ${items.length} หน้าเรียบร้อย — จัดเรียงได้เลย`);
      actions.style.display = "flex";
      render();
    } catch (e) {
      st.progress(null);
      st.err("เปิดไฟล์ไม่สำเร็จ: " + e.message);
    }
  }

  function render() {
    grid.innerHTML = "";
    items.forEach((it, i) => {
      const card = el("div", {
        class: "pg" + (it.dropped ? " dropped" : ""), draggable: "true", "data-i": i,
      }, [
        el("img", { src: it.thumb, alt: `หน้า ${it.index + 1}`, loading: "lazy",
          style: { transform: `rotate(${it.rotate}deg)` } }),
        el("span", { class: "num" }, String(i + 1)),
        el("div", { class: "tools" }, [
          el("button", { type: "button", title: "หมุนซ้าย", onclick: (e) => { e.stopPropagation(); it.rotate = (it.rotate + 270) % 360; render(); } }, [uiIcon("rotateL", "pg-ico")]),
          el("button", { type: "button", title: "หมุนขวา", onclick: (e) => { e.stopPropagation(); it.rotate = (it.rotate + 90) % 360; render(); } }, [uiIcon("rotateR", "pg-ico")]),
          el("button", { type: "button", title: it.dropped ? "เอากลับ" : "ลบหน้านี้", onclick: (e) => { e.stopPropagation(); it.dropped = !it.dropped; render(); } }, it.dropped ? [uiIcon("undo", "pg-ico")] : "🗑"),
        ]),
      ]);
      grid.appendChild(card);
    });
    const keep = items.filter((i) => !i.dropped).length;
    st.info(`เหลือ ${keep} หน้าจากทั้งหมด ${items.length} หน้า`);
  }

  let dragging = null;
  grid.addEventListener("dragstart", (e) => {
    dragging = e.target.closest(".pg");
    dragging?.classList.add("dragging");
  });
  grid.addEventListener("dragend", () => {
    grid.querySelectorAll(".pg").forEach((n) => n.classList.remove("dragging", "over"));
    dragging = null;
  });
  grid.addEventListener("dragover", (e) => {
    e.preventDefault();
    const over = e.target.closest(".pg");
    if (!over || over === dragging) return;
    grid.querySelectorAll(".pg").forEach((n) => n.classList.remove("over"));
    over.classList.add("over");
  });
  grid.addEventListener("drop", (e) => {
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
    }
  }
  return wrap;
}
