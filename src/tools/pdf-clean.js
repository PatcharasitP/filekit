// ── ตรวจ PDF ก่อนส่ง แล้วล้างร่องรอยที่ติดมากับไฟล์ ────────────────────────
// คู่แฝดฝั่ง PDF ของเครื่องมือ "ตรวจเอกสารก่อนส่ง" ที่มีอยู่แล้วสำหรับ Word
//
// ‼️ ทำไมต้องมี: ไฟล์ PDF ที่ส่งออกจาก Word, Excel หรือเครื่องสแกน พกของติดมาด้วยเสมอ
//   โดยที่คนส่งไม่เคยเห็น เช่น ชื่อผู้เขียน ชื่อบริษัท ชื่อเรื่องที่เป็นชื่อไฟล์ต้นฉบับ
//   ("สัญญาจ้าง-ฉบับลับ-ห้ามส่งออก.docx" กลายเป็น Title ของ PDF โดยอัตโนมัติ)
//   บวกคอมเมนต์ที่ลืมลบ ช่องฟอร์มที่ยังกรอกแก้ได้ ไฟล์แนบ และสคริปต์
//
// ‼️ ตรวจก่อนเสมอ แล้วรายงานให้เห็นว่ามีอะไรบ้าง ก่อนจะล้าง
//   ไม่ล้างเงียบ ๆ เพราะบางอย่างผู้ใช้อาจตั้งใจให้มี (เช่นฟอร์มที่ส่งให้คนกรอก)
//
// รวมสิ่งที่เครื่องมือของ Sejda แยกเป็น 3 ตัว (Edit Metadata, Delete Annotations, Flatten)
// ไว้ในที่เดียว เพราะคนที่จะส่งเอกสารออกไปคิดเป็นงานเดียวคือ "ตรวจก่อนส่ง"
import { loadPdfLib, friendlyPdfError } from "../pdfopen.js";
import { el, dropzone, statusBar, button, field, downloadButton,
         stripExt, yieldToBrowser, fmtBytes, failedBox } from "../ui.js";
import { workspace } from "../workspace.js";
import { tr, pl } from "../i18n.js";

const STYLE = `
.pc-report{display:flex;flex-direction:column;gap:10px;width:100%;max-width:560px;margin:auto}
.pc-report[hidden]{display:none}
.pc-file{border:1px solid var(--line);border-radius:var(--r-sm);padding:12px 14px;background:var(--card)}
.pc-file h4{margin:0 0 8px;font-size:15px;line-height:1.45;font-weight:700;word-break:break-word}
.pc-list{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}
.pc-item{display:flex;gap:8px;align-items:flex-start;font-size:13.5px;line-height:1.6}
.pc-dot{flex:none;width:8px;height:8px;border-radius:50%;margin-top:7px;background:var(--text-mute)}
.pc-item.warn .pc-dot{background:#b8860b}
.pc-item.ok .pc-dot{background:#2f6b4f}
.pc-item small{display:block;color:var(--text-mute);font-size:12.5px}
.pc-check{display:flex;align-items:center;gap:9px;min-height:36px;font-size:14px;line-height:1.5;cursor:pointer}
.pc-check input{width:17px;height:17px;flex:none;accent-color:var(--g-pdf)}
.pc-note{font-size:12.5px;line-height:1.6;color:var(--text-mute);
  background:var(--bg-soft);border:1px solid var(--line-soft);border-radius:var(--r-sm);padding:9px 12px}
`;

/* ‼️ อ่านค่าที่อาจไม่มีในไฟล์ให้ปลอดภัย ไลบรารีโยน error ได้ถ้า key ไม่มี */
const safe = (fn, dflt = null) => { try { const v = fn(); return v === undefined ? dflt : v; } catch { return dflt; } };

export function mount(tool) {
  const st = statusBar();
  const results = el("div", { class: "results" });
  const report = el("div", { class: "pc-report", hidden: true });

  const mkCheck = (label, checked, hint) => {
    const input = el("input", { type: "checkbox", checked: checked || null });
    return { input, node: el("label", { class: "pc-check" }, [input, el("span", {}, label)]), hint };
  };
  const opts = {
    metadata: mkCheck(tr("ล้างชื่อเรื่อง ผู้เขียน และโปรแกรมที่สร้าง", "Clear title, author and creating app"), true),
    annots: mkCheck(tr("ลบคอมเมนต์และไฮไลต์", "Remove comments and highlights"), true),
    forms: mkCheck(tr("ทำช่องฟอร์มให้แบน (กรอกแก้ไม่ได้อีก)", "Flatten form fields (no longer editable)"), true),
    attach: mkCheck(tr("ลบไฟล์ที่แนบมาในเอกสาร", "Remove files attached inside the document"), true),
    scripts: mkCheck(tr("ลบสคริปต์ที่ฝังในไฟล์", "Remove scripts embedded in the file"), true),
  };
  const newTitle = el("input", { type: "text", placeholder: tr("เว้นว่าง = ไม่ใส่ชื่อเรื่อง", "Leave empty for no title") });

  const go = button(tr("ล้างแล้วบันทึก", "Clean and save"), { onclick: run });
  go.disabled = true;

  const dz = dropzone({
    accept: "application/pdf,.pdf", multiple: true,
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "a PDF file"),
    hint: tr("ตรวจให้ก่อน ยังไม่แก้จนกว่าจะกดล้าง", "Scanned first, nothing changes until you press Clean"),
    onChange: onFiles,
  });

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์", "Files"), node: dz.container },
    right: { title: tr("สิ่งที่จะล้าง", "What to clean"), node: el("div", {}, [
      ...Object.values(opts).map((o) => o.node),
      field(tr("ตั้งชื่อเรื่องใหม่", "New title"), newTitle,
            tr("ใช้แทนชื่อเดิมที่ถูกล้างไป ถ้าต้องการ", "Replaces the cleared title, if you want one")),
      el("div", { class: "pc-note" },
         tr("ไฟล์ต้นฉบับไม่ถูกแตะต้อง ได้ไฟล์ใหม่ออกมาแทน",
            "Your original files are untouched, new ones are created instead")),
    ]) },
    center: { node: report, empty: tr("เลือกไฟล์ PDF แล้วฟ้าจะตรวจให้ว่าไฟล์พกอะไรติดมาบ้าง",
                                      "Choose PDF files and you will see what they are carrying") },
    footer: [go, st.node],
  });
  ws.wrap.appendChild(el("style", {}, STYLE));
  ws.body.appendChild(results);

  let files = [], scans = [];

  /** ตรวจว่าไฟล์นี้พกอะไรมาบ้าง — อ่านอย่างเดียว ไม่แก้อะไรทั้งสิ้น
   * ‼️ ห้ามใช้ loadPdfLib() ตรงนี้ เพราะตัวโหลดกลางล้างข้อมูลกำกับไฟล์ให้ตั้งแต่ตอนเปิด
   *   (ซึ่งถูกแล้วสำหรับเครื่องมืออื่นที่ไม่ได้ยุ่งกับ metadata แต่ผิดสำหรับตัวที่มีหน้าที่ตรวจ)
   *   ถ้าใช้ จะรายงานว่า "สะอาดอยู่แล้ว" ทุกไฟล์ ทั้งที่ของยังอยู่ครบ (เจอจริง 21/09/2026) */
  async function inspect(file) {
    const { PDFDocument } = PDFLib;
    const doc = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()),
                                       { ignoreEncryption: false, updateMetadata: false });
    const meta = {
      title: safe(() => doc.getTitle(), "") || "",
      author: safe(() => doc.getAuthor(), "") || "",
      subject: safe(() => doc.getSubject(), "") || "",
      keywords: safe(() => doc.getKeywords(), "") || "",
      creator: safe(() => doc.getCreator(), "") || "",
      producer: safe(() => doc.getProducer(), "") || "",
    };
    /* ‼️ ต้องไม่นับกล่องป็อปอัปที่มากับคอมเมนต์ ไม่งั้นรายงานจะเป็นสองเท่าของที่ผู้ใช้ใส่
       (วัดจริง: ใส่คอมเมนต์ 3 อัน ไลบรารีเห็น 6 รายการ เพราะแต่ละอันมี Popup คู่มาด้วย)
       คนอ่านรายงานจะงงว่า "ฉันใส่ 3 ทำไมบอก 6" แล้วเลิกเชื่อรายงานทั้งใบ */
    const { PDFName: N } = PDFLib;
    let annots = 0;
    for (const p of doc.getPages()) {
      const arr = safe(() => p.node.get(N.of("Annots")), null);
      const n = arr ? safe(() => arr.size(), 0) : 0;
      for (let i = 0; i < n; i++) {
        const sub = safe(() => {
          const ref = arr.get(i);
          const dict = doc.context.lookup(ref);
          return String(dict && dict.get && dict.get(N.of("Subtype")));
        }, "");
        if (sub !== "/Popup") annots++;
      }
    }
    const fields = safe(() => doc.getForm().getFields().length, 0);
    const attachments = safe(() => doc.getAttachments().length, 0);
    const scripts = safe(() => doc.getDocumentJavaScripts().length, 0);
    return { doc, meta, annots, fields, attachments, scripts, pages: doc.getPageCount() };
  }

  async function onFiles(fs) {
    files = fs.slice();
    results.innerHTML = "";
    scans = [];
    st.clear();
    if (!files.length) { report.hidden = true; ws.showCanvas(false); go.disabled = true; return; }
    st.info(tr("กำลังตรวจไฟล์…", "Scanning the files…"));
    const failed = [];
    for (const f of files) {
      try { scans.push({ file: f, info: await inspect(f) }); }
      catch (e) { failed.push({ name: f.name, reason: friendlyPdfError(e, f.name).message }); }
      await yieldToBrowser();
    }
    report.hidden = false;
    ws.showCanvas(true);
    render(failed);
    go.disabled = !scans.length;
    st.clear();
  }

  function render(failed) {
    report.replaceChildren();
    let dirty = 0;
    for (const { file, info } of scans) {
      const items = [];
      const metaHits = Object.entries(info.meta).filter(([, v]) => v && String(v).trim());
      if (metaHits.length) {
        items.push({ level: "warn",
          text: tr(`ข้อมูลกำกับไฟล์ ${metaHits.length} รายการ`, `${metaHits.length} metadata entries`),
          sub: metaHits.map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`).join("  ") });
      }
      if (info.annots) items.push({ level: "warn",
        text: tr(`คอมเมนต์หรือไฮไลต์ ${info.annots} รายการ`, `${info.annots} comments or highlights`) });
      if (info.fields) items.push({ level: "warn",
        text: tr(`ช่องฟอร์ม ${info.fields} ช่อง ที่ยังกรอกแก้ได้`, `${info.fields} form fields that can still be edited`) });
      if (info.attachments) items.push({ level: "warn",
        text: tr(`ไฟล์แนบในเอกสาร ${info.attachments} ไฟล์`, `${info.attachments} files attached inside`) });
      if (info.scripts) items.push({ level: "warn",
        text: tr(`สคริปต์ฝังในไฟล์ ${info.scripts} ชุด`, `${info.scripts} embedded scripts`) });
      if (items.length) dirty++;
      else items.push({ level: "ok", text: tr("สะอาดอยู่แล้ว ไม่พบร่องรอยที่ต้องล้าง", "Already clean, nothing found") });

      report.appendChild(el("div", { class: "pc-file" }, [
        el("h4", {}, file.name),
        el("ul", { class: "pc-list" }, items.map((it) => el("li", { class: "pc-item " + it.level }, [
          el("span", { class: "pc-dot", "aria-hidden": "true" }),
          el("div", {}, [it.text, it.sub ? el("small", {}, it.sub) : null]),
        ]))),
      ]));
    }
    if (failed && failed.length) report.appendChild(failedBox(failed));
    /* ‼️ ผลตรวจโผล่มาเองหลังอ่านไฟล์เสร็จ ต้องประกาศให้โปรแกรมอ่านหน้าจอได้ยินด้วย
       (กติกาเดียวกับที่ word-clean ใช้อยู่) */
    report.prepend(el("div", { class: "status show " + (dirty ? "err" : "ok"), role: "status", "aria-live": "polite" },
      dirty
        ? tr(`พบร่องรอยที่ควรล้างใน ${dirty} จาก ${scans.length} ไฟล์`,
             `Found traces to clean in ${dirty} of ${pl(scans.length, "file", "files")}`)
        : tr(`ตรวจแล้ว ${scans.length} ไฟล์ ไม่พบร่องรอยที่ต้องล้าง`,
             `Checked ${pl(scans.length, "file", "files")}, nothing to clean`)));
  }

  async function run() {
    if (!scans.length) return;
    results.innerHTML = "";
    go.disabled = true;
    ws.setBusy(true);
    st.begin();
    const failed = [];
    let done = 0;
    try {
      for (const { file } of scans) {
        if (st.cancelled) break;
        try {
          /* ‼️ โหลดใหม่ทุกครั้ง ไม่ใช้เอกสารที่ค้างจากตอนตรวจ
             เพราะผู้ใช้อาจกดล้างหลายรอบด้วยตัวเลือกต่างกัน ของที่แก้ไปแล้วจะทับกัน */
          const { doc } = await loadPdfLib(file);
          if (opts.metadata.input.checked) {
            doc.setTitle(newTitle.value || "");
            doc.setAuthor(""); doc.setSubject(""); doc.setKeywords([]);
            doc.setCreator(""); doc.setProducer("");
          } else if (newTitle.value) {
            doc.setTitle(newTitle.value);
          }
          if (opts.annots.input.checked) {
            const { PDFName } = PDFLib;
            for (const p of doc.getPages()) safe(() => p.node.delete(PDFName.of("Annots")));
          }
          if (opts.forms.input.checked) safe(() => doc.getForm().flatten());
          if (opts.attach.input.checked) {
            const { PDFName } = PDFLib;
            safe(() => doc.catalog.get(PDFName.of("Names"))
                          && doc.catalog.get(PDFName.of("Names")).delete(PDFName.of("EmbeddedFiles")));
          }
          if (opts.scripts.input.checked) {
            const { PDFName } = PDFLib;
            safe(() => doc.catalog.get(PDFName.of("Names"))
                          && doc.catalog.get(PDFName.of("Names")).delete(PDFName.of("JavaScript")));
            safe(() => doc.catalog.delete(PDFName.of("OpenAction")));
            safe(() => doc.catalog.delete(PDFName.of("AA")));
          }
          const blob = new Blob([await doc.save()], { type: "application/pdf" });
          const name = stripExt(file.name) + tr("-ล้างแล้ว.pdf", "-cleaned.pdf");
          results.appendChild(el("div", { class: "result" }, [
            el("div", { class: "r-name" }, [el("strong", {}, name),
              el("small", {}, tr(`${fmtBytes(file.size)} → ${fmtBytes(blob.size)}`,
                                 `${fmtBytes(file.size)} → ${fmtBytes(blob.size)}`))]),
            downloadButton(blob, name),
          ]));
          done++;
        } catch (e) {
          failed.push({ name: file.name, reason: friendlyPdfError(e, file.name).message });
        }
        const seen = done + failed.length;
        st.progress((seen / scans.length) * 100, `(${seen}/${scans.length})`);
        await yieldToBrowser();
      }
      st.end();
      st.progress(null);
      if (failed.length) results.appendChild(failedBox(failed));
      if (!done) st.err(tr("ล้างไม่สำเร็จสักไฟล์", "Couldn't clean any file"));
      else st.ok(tr(`ล้างเรียบร้อย ${done} ไฟล์`, `Cleaned ${pl(done, "file", "files")}`));
    } catch (e) {
      st.end();
      st.progress(null);
      st.err(friendlyPdfError(e, files[0] && files[0].name).message);
    } finally {
      go.disabled = false;
      ws.setBusy(false);
    }
  }

  return ws.wrap;
}
