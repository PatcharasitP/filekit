// ── แก้ไขข้อความบน PDF ─────────────────────────────────────────────────────
// โจทย์จริงจากพี่ปอนด์ 18/09/2026 "ต้องการลบวันที่ใน PDF แล้วพิมพ์อีกวันที่แทน"
// เป็นงานที่เจอบ่อยมากกับสัญญาและเอกสารราชการ ที่ได้ไฟล์มาแล้วต้องแก้นิดเดียว
// แต่ไม่มีไฟล์ต้นฉบับ Word จึงต้องเปิดโปรแกรมแพง ๆ หรือพิมพ์ออกมาแล้วเขียนมือ
//
// ‼️ ทำไมเป็น "ปิดทับแล้วพิมพ์ใหม่" ไม่ใช่แก้ตัวอักษรในไฟล์จริง
//    ข้อความใน PDF ไม่ได้เก็บเป็นบรรทัดให้แก้ได้ แต่เป็นคำสั่งวาดทีละชิ้น
//    พร้อมพิกัดและระยะห่างที่คำนวณไว้แล้ว แก้ตัวอักษรตรง ๆ จึงทำให้ทั้งย่อหน้าเพี้ยน
//    เครื่องมือระดับโลกอย่าง iLovePDF ก็ใช้วิธีวางกล่องทับเหมือนกัน (ดูของจริงแล้ว)
//
// ‼️ 19/11/2026 ตัวแก้ไข (เวที ชั้นวาด เครื่องมือห้าอย่าง ซูม การประทับลงไฟล์) ย้ายไป src/pdfmarks.js
//    เพื่อให้เครื่องมือจัดการหน้า PDF ใช้ตัวเดียวกัน ไฟล์นี้เหลือแค่ เปิดไฟล์ ภาพย่อ เลือกหน้า และบันทึก
//    พี่ปอนด์สั่งให้เก็บหน้านี้ไว้ ผลต้องเท่าเดิมทุกชิ้น (tests/browser_pdfedit_golden.py)
import { loadPdfLib, ENCRYPTED_WARNING, openPdf, passwordBox } from "../pdfopen.js";
import { el, dropzone, statusBar, button, downloadButton,
         stripExt, yieldToBrowser, fmtBytes, keyHints} from "../ui.js";
import { workspace } from "../workspace.js";
import { tr, pl } from "../i18n.js";
import { createMarkEditor, stampMarks, markKeyHints, MARK_STYLE, VIEW_SCALE } from "../pdfmarks.js";

export function mount(tool) {
  const st = statusBar();
  const extra = el("div", {});
  const results = el("div", { class: "results" });
  const thumbs = el("div", { class: "pe-thumbs" });

  let file = null;
  let pdf = null;            // เอกสารที่เปิดค้างไว้ ใช้เรนเดอร์หน้าที่เลือก
  let pageCount = 0;
  let cur = 0;               // หน้าที่กำลังแก้ เริ่มนับ 0
  let edits = [];            // {page, kind, x,y,w,h, ...} ลำดับที่วาง ใช้ย้อนล่าสุดข้ามหน้าได้
  let thumbData = [];

  // ── ตัวแก้ไข (ใช้ร่วมกับเครื่องมือจัดการหน้า) ──────────────────────────────
  const ed = createMarkEditor({
    st,
    ready: () => !!pdf,
    list: () => edits.filter((e) => e.page === cur),
    add: (m) => { m.page = cur; edits.push(m); },
    remove: (m) => { edits = edits.filter((x) => x !== m); },
    undo: undoLast,
    clearPage,
    thumbs: () => renderThumbs(),
    sync: () => syncButtons(),
  });
  const { placeMidBtn, undoBtn, clearBtn } = ed.buttons;

  const dz = dropzone({
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "PDF file"),
    accept: "application/pdf,.pdf", multiple: false, hint: tr("ครั้งละ 1 ไฟล์", "One file at a time"),
    onChange: (f) => {
      file = f[0] || null;
      results.innerHTML = "";
      edits = [];
      if (file) openFile();
      else resetAll();
    },
  });

  const saveBtn = button(tr("บันทึก", "Save"), { onclick: save });
  saveBtn.disabled = true;
  let saving = false;

  const leftNode = el("div", { class: "pe-left" }, [
    dz.container, extra,
    el("div", {}, [el("h3", {}, tr("หน้าในไฟล์", "Pages")), thumbs]),
  ]);

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์ PDF", "PDF file"), node: leftNode },
    center: { node: ed.scroller, empty: tr("ยังไม่มีไฟล์ เลือก PDF เพื่อเริ่มแก้ไข", "No file yet. Choose a PDF to start") },
    right: { title: tr("ตัวเลือก", "Options"), node: ed.panel },
    toolbar: ed.toolbar,
    toolbarGroups: [tr("มุมมอง", "View"), tr("สิ่งที่วางไว้", "Placed items")],
    footer: [st.node, saveBtn],
  });
  ws.wrap.prepend(el("style", {}, MARK_STYLE));
  ws.body.append(results,
    /* ‼️ เขียนเฉพาะคีย์ที่มีอยู่จริงในโค้ด ไล่อ่าน handler ทีละตัวก่อนเขียน
       บอกคีย์ที่ไม่มีจริง แย่กว่าไม่บอกเลย เพราะคนกดแล้วคิดว่าเว็บพัง */
    keyHints(markKeyHints()),
    el("div", { class: "note" },
      tr("ปิดทับ, พิมพ์ข้อความใหม่, ไฮไลต์, เซ็นชื่อ และวางรูป ทำได้ในรอบเดียวแล้วบันทึกครั้งเดียว",
         "Cover, add text, highlight, sign and place images all in one pass, then save once")),
    el("div", { class: "note" },
      tr("ข้อความเดิมยังอยู่ในไฟล์ ถ้าเป็นความลับให้ใช้วิธีอื่น",
         "The original text remains in the file. Do not rely on this to hide secrets")),
  );
  ws.showCanvas(false);
  ed.setMode("cover");

  function resetAll() {
    pdf?.destroy?.();
    pdf = null; pageCount = 0; cur = 0; edits = []; thumbData = [];
    thumbs.innerHTML = "";
    ed.hide();
    st.clear();
    saveBtn.disabled = true;
    undoBtn.disabled = true;
    clearBtn.disabled = true;
    ws.showCanvas(false);
  }

  async function openFile() {
    resetAllKeepFile();
    st.info(tr("กำลังเปิดไฟล์…", "Opening file…"));
    ws.setBusy(true);
    try {
      pdf = await openPdf(file, passwordBox(extra));
      pageCount = pdf.numPages;
      for (let p = 1; p <= pageCount; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 0.2 });
        const c = document.createElement("canvas");
        c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
        await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        page.cleanup();
        thumbData.push(c.toDataURL("image/jpeg", 0.6));
        c.width = c.height = 0;
        st.progress((p / pageCount) * 100, `(${p}/${pageCount})`);
        await yieldToBrowser();
      }
      st.progress(null);
      renderThumbs();
      await showPage(0);
      ws.setBusy(false);
      ws.showCanvas(true);
      syncButtons();
      st.ok(tr(`เปิดแล้ว ${pageCount} หน้า`, `Opened ${pl(pageCount, "page", "pages")}`));
      ed.setMode(ed.mode());
    } catch (e) {
      ws.setBusy(false);
      st.progress(null);
      st.err(tr("เปิดไฟล์ไม่ได้: ", "Couldn't open file: ") + e.message);
    }
  }
  function resetAllKeepFile() {
    pdf?.destroy?.();
    pdf = null; thumbData = []; thumbs.innerHTML = "";
    ed.hide(); ws.showCanvas(false);
  }

  function renderThumbs() {
    thumbs.innerHTML = "";
    thumbData.forEach((src, i) => {
      const n = edits.filter((e) => e.page === i).length;
      const b = el("button", {
        class: "pe-thumb" + (i === cur ? " on" : ""), type: "button",
        "aria-label": tr(`ไปหน้า ${i + 1}`, `Go to page ${i + 1}`),
        "aria-pressed": String(i === cur),
        onclick: () => showPage(i),
      }, [
        el("img", { src, alt: tr(`หน้า ${i + 1}`, `Page ${i + 1}`), loading: "lazy" }),
        el("b", {}, String(i + 1)),
        n ? el("span", { class: "dot", title: tr(`แก้ไว้ ${n} จุด`, `${n} edits`) }) : null,
      ]);
      thumbs.appendChild(b);
    });
  }

  async function showPage(i) {
    if (!pdf || i < 0 || i >= pageCount) return;
    cur = i;
    const page = await pdf.getPage(i + 1);
    const vp = page.getViewport({ scale: VIEW_SCALE });
    ed.viewCanvas.width = Math.floor(vp.width);
    ed.viewCanvas.height = Math.floor(vp.height);
    await page.render({ canvasContext: ed.viewCanvas.getContext("2d"), viewport: vp }).promise;
    const base = page.getViewport({ scale: 1 });
    page.cleanup();
    ed.shown(vp.width, { w: base.width, h: base.height });
    renderThumbs();
    ed.draw();
  }

  /* keepStatus: หลังกดบันทึกห้ามเขียน แก้ไว้ N จุด ทับข้อความผล
     เดิมทับทุกครั้ง ตอนล้มข้อความแดงหายไปเลย ผู้ใช้ไม่รู้ว่าไม่ได้ไฟล์ (รีวิว 08/11/2026 tests/browser_pdfedit_save_status.py) */
  function syncButtons(keepStatus = false) {
    const n = edits.length;
    placeMidBtn.disabled = !pdf;
    undoBtn.disabled = !n;
    clearBtn.disabled = !edits.some((e) => e.page === cur);
    // บันทึกได้เฉพาะเมื่อมีของแก้ เดิมเปิดตั้งแต่โหลดไฟล์ กดแล้วขึ้นแดง ยังไม่ได้แก้อะไรเลย (ไล่กดมือถือ 07/11/2026 tests/browser_pdfedit_save_ready.py)
    saveBtn.disabled = saving || !pdf || !n;
    saveBtn.dataset.why = saving ? "" : !pdf ? tr("เลือกไฟล์ PDF ก่อน", "Choose a PDF first") : !n ? tr("ปิดทับ พิมพ์ข้อความ หรือวางลายเซ็นอย่างน้อยหนึ่งจุดก่อน", "Add at least one cover, text, or signature first") : "";
    if (!keepStatus) st.info(n ? tr(`แก้ไว้ ${n} จุด`, `${n} edit${n > 1 ? "s" : ""} pending`) : "");
  }
  function undoLast() { edits.pop(); ed.draw(); renderThumbs(); }
  function clearPage() { edits = edits.filter((e) => e.page !== cur); ed.draw(); renderThumbs(); }

  async function save() {
    if (!file) return st.err(tr("เลือกไฟล์ก่อน", "Choose a file first"));
    if (!edits.length) return st.err(tr("ยังไม่ได้แก้อะไรเลย", "No edits yet"));
    results.innerHTML = "";
    saving = true;
    saveBtn.disabled = true;
    ws.setBusy(true);
    st.info(tr("กำลังบันทึก…", "Saving…"));
    try {
      const { doc, encrypted } = await loadPdfLib(file);
      const pages = doc.getPages();
      const cache = new Map();          // ลายเซ็นเดียวกันที่วางหลายจุด ฝังลงไฟล์ครั้งเดียว
      /* ประทับทีละหน้า ตามลำดับที่วาง (ของที่วางทีหลังทับของที่วางก่อน เหมือนบนจอ) */
      for (let i = 0; i < pages.length; i++) {
        const mine = edits.filter((e) => e.page === i);
        if (!mine.length) continue;
        await stampMarks(doc, pages[i], mine, cache);
        await yieldToBrowser();
      }
      const blob = new Blob([await doc.save()], { type: "application/pdf" });
      if (encrypted) results.appendChild(el("div", { class: "status show err" }, ENCRYPTED_WARNING));
      const name = stripExt(file.name) + tr("-แก้ไขแล้ว.pdf", "-edited.pdf");
      st.ok(tr(`บันทึกแล้ว แก้ไป ${edits.length} จุด`, `Saved with ${edits.length} edit${edits.length > 1 ? "s" : ""}`));
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name),
          el("small", {}, tr(`${pageCount} หน้า`, `${pl(pageCount, "page", "pages")}`))]),
        el("span", { class: "r-size" }, fmtBytes(blob.size)),
        downloadButton(blob, name),
      ]));
    } catch (e) {
      st.err(tr("บันทึกไม่ได้: ", "Couldn't save: ") + e.message);
    } finally {
      ws.setBusy(false);
      saving = false;
      syncButtons(true);
    }
  }

  return ws.wrap;
}
