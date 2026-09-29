// ── PDF เป็น Markdown ─────────────────────────────────────────────────────────
// เคสจริง: เอาเอกสารไปให้ AI อ่านต่อ หรือย้ายเข้า Notion กับ Obsidian ข้อความแบบ TXT ทำให้ย่อหน้าขาดกลางบรรทัด
// และตารางกลายเป็นคำเรียงกัน Markdown เก็บหัวข้อ รายการ และตารางไว้ (ตัวแปลงอยู่ src/pdfmd.js)
//
// ‼️ ตัวอักษรไทยจาก PDF เชื่อไม่ได้ทุกไฟล์ (พิสูจน์ 29/09/2026 ดูโน้ตคลัง ข้อความไทยจาก PDF สระหายได้สองทาง)
//   ไฟล์จาก Word สลับสระอากับสระอำ ไฟล์จาก Chrome บางตัวอักษรไม่มีรหัส หน้าจอจึงเตือนและให้เลือกอ่านด้วย OCR
//   OCR อ่านสระถูกแต่ผิดจุดอื่นและไม่ได้โครงหัวข้อ จึงเป็นทางเลือก ไม่ใช่ค่าเริ่มต้น
import { el, dropzone, toolShell, statusBar, button, download, stripExt, yieldToBrowser } from "../ui.js";
import { markdownRows, rowsToMarkdown, thaiWarnings, normalizeThai } from "../pdfmd.js";
import { openPdf, passwordBox } from "../pdfopen.js";
import { ocrPdf, hasTextLayer } from "../ocr.js";
import { tr, pl } from "../i18n.js";

const PREVIEW = 6000;

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  const extra = el("div", {});
  const preview = el("pre", { class: "preview-text", hidden: true, style: { whiteSpace: "pre-wrap" } });
  let file = null;
  /* ‼️ เก็บไฟล์ที่เปิดไว้ให้ปุ่มอ่านใหม่ด้วย OCR ใช้ต่อ แล้วค่อยปิดตอนแปลงไฟล์ถัดไป */
  let lastPdf = null;

  const dz = dropzone({
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "PDF file"),
    accept: "application/pdf,.pdf", multiple: false, hint: tr("ครั้งละ 1 ไฟล์", "One file at a time"),
    onChange: (f) => { file = f[0] || null; st.clear(); results.innerHTML = ""; extra.innerHTML = ""; preview.hidden = true; },
  });
  const go = button(tr("แปลงเป็น Markdown", "Convert to Markdown"), { onclick: run });

  body.append(dz.container, el("div", { class: "actions" }, [go]), st.node, extra, results, preview);
  body.appendChild(el("div", { class: "note" },
    tr("เดาหัวข้อจากขนาดและความหนาของตัวอักษร ตารางจากแนวคอลัมน์ ไฟล์สแกนอ่านด้วย OCR ได้",
       "Headings are guessed from font size and weight, tables from column alignment. Scans can use OCR")));

  function present(md, summary) {
    st.progress(null);
    st.ok(summary);
    preview.hidden = false;
    preview.textContent = md.slice(0, PREVIEW) + (md.length > PREVIEW
      ? tr(`\n\n… (แสดง ${PREVIEW.toLocaleString("th-TH")} ตัวอักษรแรก ไฟล์ที่ดาวน์โหลดได้ครบ)`, `\n\n… (first ${pl(PREVIEW.toLocaleString("en-US"), "character", "characters")}, the download has everything)`)
      : "");
    results.innerHTML = "";
    results.appendChild(el("div", { class: "actions" }, [
      /* ‼️ ไม่ใส่ BOM ต่างจาก .txt เพราะตัวอ่าน Markdown บางตัวเห็น BOM เป็นตัวอักษรหน้าหัวข้อแรก หัวข้อจึงไม่ขึ้น */
      button(tr("ดาวน์โหลด .md", "Download .md"), { icon: "download", onclick: () =>
        download(new Blob([md], { type: "text/markdown;charset=utf-8" }), stripExt(file.name) + ".md") }),
      button(tr("คัดลอกทั้งหมด", "Copy all"), { ghost: true, onclick: async () => {
        try { await navigator.clipboard.writeText(md); st.ok(tr("คัดลอกลงคลิปบอร์ดแล้ว", "Copied to clipboard")); }
        catch { st.err(tr("คัดลอกไม่ได้ ใช้ดาวน์โหลดแทน", "Can't copy, use download")); }
      } }),
    ]));
  }

  function warnPanel(codes, pdf, nul) {
    const lines = [];
    if (codes.includes("nul")) lines.push(tr(
      `มีตัวอักษร ${nul.toLocaleString("th-TH")} ตัวที่ไฟล์ไม่ได้เก็บรหัสไว้ สระหรือวรรณยุกต์บางตัวจึงหายไป`,
      `${pl(nul.toLocaleString("en-US"), "character has", "characters have")} no code in this file, so some Thai vowels or tone marks are missing`));
    if (codes.includes("word-sara-am")) lines.push(tr(
      "ไฟล์นี้บันทึกจาก Word ซึ่งมักสลับสระอากับสระอำ เช่น การ กลายเป็น กำร ตรวจคำที่มีสระสองตัวนี้ก่อนใช้",
      "Saved from Word, which often swaps the Thai vowels า and ำ. Check words with them before use"));
    extra.appendChild(el("div", { class: "panel", role: "alert" }, [
      ...lines.map((t) => el("div", { class: "note", style: { marginTop: "0" } }, t)),
      el("div", { class: "note" }, tr("OCR อ่านสระถูกกว่า แต่อาจผิดคำอื่น และไม่ได้หัวข้อกับตาราง",
                                      "OCR gets these vowels right but may misread other words and loses headings and tables")),
      el("div", { class: "actions" }, [
        button(tr("อ่านใหม่ด้วย OCR", "Read again with OCR"), { ghost: true, onclick: () => runOcr(pdf) }),
      ]),
    ]));
  }

  async function runOcr(pdf) {
    extra.innerHTML = "";
    go.disabled = true;
    st.info(tr("กำลังเตรียม OCR…", "Preparing OCR…"));
    try {
      const pages = await ocrPdf(pdf, {
        onProgress: (p) => {
          if (p.phase === "page") st.info(tr(`กำลังอ่านหน้า ${p.current}/${p.total} ด้วย OCR…`, `Reading page ${p.current}/${p.total} with OCR…`));
          else if (p.phase === "read") st.progress(p.ratio * 100);
        },
      });
      const md = pages.map((p) => normalizeThai(p.text).trim()).filter(Boolean).join("\n\n");
      if (!md) throw new Error(tr("อ่านไม่พบข้อความ", "No text was found"));
      present(md, tr(`อ่านด้วย OCR แล้ว ${pages.length} หน้า ได้ข้อความทีละบรรทัด ไม่มีหัวข้อหรือตาราง`,
                     `Read ${pl(pages.length, "page", "pages")} with OCR, plain lines without headings or tables`));
    } catch (e) {
      st.progress(null); st.err(tr("อ่านด้วย OCR ไม่สำเร็จ: ", "OCR reading failed: ") + e.message);
    } finally { go.disabled = false; }
  }

  async function run() {
    if (!file) return st.err(tr("กรุณาเลือกไฟล์ PDF ก่อน", "Please choose a PDF file first"));
    results.innerHTML = ""; extra.innerHTML = ""; preview.hidden = true;
    go.disabled = true;
    st.info(tr("กำลังเปิดไฟล์…", "Opening the file…"));
    lastPdf?.destroy?.();
    let pdf = null;
    try {
      pdf = lastPdf = await openPdf(file, passwordBox(extra));
      if (!(await hasTextLayer(pdf))) {
        st.progress(null);
        st.info(tr("ไม่มีชั้นข้อความ (อาจเป็นไฟล์สแกน)", "No text layer (probably a scan)"));
        extra.appendChild(el("div", { class: "panel" }, [
          el("div", { class: "note", style: { marginTop: "0" } },
            tr("อ่านด้วย OCR ได้ทั้งไทย-อังกฤษ, ครั้งแรกโหลดชุดภาษา ~10 ถึง 30 MB",
               "OCR reads Thai and English, first time downloads a ~10 to 30 MB language pack")),
          el("div", { class: "actions" }, [button(tr("อ่านด้วย OCR", "Read with OCR"), { onclick: () => runOcr(pdf) })]),
        ]));
        return;
      }
      st.info(tr("กำลังอ่านโครงเอกสาร…", "Reading the document structure…"));
      const pages = [];
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        pages.push(await markdownRows(page));
        page.cleanup();
        st.progress((p / pdf.numPages) * 100, `(${p}/${pdf.numPages})`);
        await yieldToBrowser();
      }
      const { md, nul, stats } = rowsToMarkdown(pages);
      if (!md) throw new Error(tr("อ่านไม่พบข้อความในไฟล์นี้เลย", "No text was found in this file"));
      let producer = "";
      try { producer = (await pdf.getMetadata())?.info?.Producer || ""; } catch { /* ไม่มี metadata */ }
      present(md, tr(
        `แปลงแล้ว ${pdf.numPages} หน้า ได้หัวข้อ ${stats.headings} ตาราง ${stats.tables} รายการ ${stats.lists} ย่อหน้า ${stats.paragraphs}`,
        `Converted ${pl(pdf.numPages, "page", "pages")}: ${pl(stats.headings, "heading", "headings")}, ${pl(stats.tables, "table", "tables")}, ${pl(stats.lists, "list", "lists")}, ${pl(stats.paragraphs, "paragraph", "paragraphs")}`));
      const codes = thaiWarnings({ nul, producer, text: md });
      if (codes.length) warnPanel(codes, pdf, nul);
    } catch (e) {
      st.progress(null);
      st.err(tr("อ่านไฟล์ไม่สำเร็จ: ", "Could not read the file: ") + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
