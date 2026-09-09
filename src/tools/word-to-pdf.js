import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, fmtBytes, yieldToBrowser, segmented } from "../ui.js";
import { loadLibs } from "../loader.js";
import { useThaiFont, warmThaiFont, THAI_FONT, textChunks } from "../thaifont.js";
import { tr } from "../i18n.js";

const PAGE = { a4: "a4", letter: "letter" };

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  let files = [];
  warmThaiFont(); // เริ่มดึงฟอนต์ตั้งแต่เปิดหน้า ผู้ใช้จะไม่ต้องรอตอนกดแปลง

  const dz = dropzone({
    expect: ["docx"], expectLabel: tr("ไฟล์ Word (.docx)", "Word file (.docx)"),
    accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    multiple: true, hint: tr("ไฟล์ .docx, เลือกได้หลายไฟล์", ".docx files, choose multiple"),
    onChange: (f) => { files = f; st.clear(); results.innerHTML = ""; },
  });

  const size = segmented([["a4", "A4"], ["letter", "Letter"]], "a4");
  const fontSize = segmented([["12", "12 pt"], ["14", "14 pt"], ["16", "16 pt"]], "14");
  const go = button(tr("แปลงเป็น PDF", "Convert to PDF"), { onclick: run });

  body.append(dz.container,
    el("div", { class: "row" }, [field(tr("ขนาดกระดาษ", "Paper size"), size), field(tr("ขนาดตัวอักษร", "Font size"), fontSize)]),
    el("div", { class: "actions" }, [go]), st.node, results);
  body.appendChild(el("div", { class: "note" },
    tr("ฝังฟอนต์ไทยอัตโนมัติ คงหัวข้อ/ย่อหน้า/ตัวหนา, ไม่คงตาราง รูปภาพ และการจัดหน้าซับซ้อน",
       "Thai font embedded automatically, keeps headings/paragraphs/bold, tables, images, and complex layouts aren't kept")));
  // แยกเป็นอีกก้อนเพราะข้อความบนหน้าจอก้อนเดียวห้ามยาวเกิน 100 ตัวอักษร (มีเทสจับ)
  body.appendChild(el("div", { class: "note" },
    tr("หัวกระดาษและท้ายกระดาษถูกคัดลอกไปทุกหน้า รวมทั้งเลขหน้าอัตโนมัติ",
       "Headers and footers are carried onto every page, including automatic page numbers")));

  /* แปลง HTML ที่ mammoth ให้มา เป็นบล็อกข้อความ
   * ‼️ เก็บเป็น "ช่วงข้อความพร้อมสไตล์" (runs) ไม่ใช่สตริงเดียว เพราะ textContent ทิ้ง
   *    <strong>/<u> ทั้งหมด ตัวหนาที่หน้าเว็บโฆษณาว่าคงไว้จึงหายจริงทุกครั้ง
   *    (วัดจริง 09/09/2026: PDF ที่ได้ใช้ฟอนต์ Sarabun ตัวธรรมดาอย่างเดียวทั้งหน้า)
   * ‼️ li.textContent ลากข้อความของรายการที่ซ้อนอยู่ข้างในมาด้วย หัวข้อย่อยทุกชั้นจึงถูกยำ
   *    รวมเป็นบรรทัดเดียวติดกันหมด และ table.querySelectorAll("tr") ลากแถวของตารางซ้อน
   *    มาด้วย เนื้อตารางในจึงโผล่ซ้ำสองรอบ */
  function htmlToBlocks(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const blocks = [];

    // เก็บข้อความพร้อมสไตล์ โดยข้ามรายการ/ตารางที่ซ้อนอยู่ข้างใน (พวกนั้นเป็นบล็อกของตัวเอง)
    const inlineRuns = (node, style) => {
      const out = [];
      for (const n of node.childNodes) {
        if (n.nodeType === 3) { if (n.nodeValue) out.push({ text: n.nodeValue, ...style }); continue; }
        if (n.nodeType !== 1) continue;
        const tag = n.tagName.toLowerCase();
        if (tag === "ul" || tag === "ol" || tag === "table") continue;
        out.push(...inlineRuns(n, {
          bold: style.bold || tag === "strong" || tag === "b",
          underline: style.underline || tag === "u" || tag === "ins",
        }));
      }
      return out;
    };

    // ยุบช่องว่างซ้ำ + รวมช่วงที่สไตล์เหมือนกันติดกัน (กันสร้างชิ้นย่อยเป็นร้อยชิ้นโดยไม่จำเป็น)
    const tidy = (runs) => {
      const merged = [];
      for (const r of runs) {
        const text = String(r.text).replace(/\s+/g, " ");
        if (!text) continue;
        const last = merged[merged.length - 1];
        if (last && !!last.bold === !!r.bold && !!last.underline === !!r.underline) last.text += text;
        else merged.push({ text, bold: !!r.bold, underline: !!r.underline });
      }
      if (merged.length) {
        merged[0].text = merged[0].text.replace(/^\s+/, "");
        merged[merged.length - 1].text = merged[merged.length - 1].text.replace(/\s+$/, "");
      }
      return merged.filter((r) => r.text);
    };

    const runsOf = (node) => tidy(inlineRuns(node, {}));
    const plain = (runs) => runs.map((r) => r.text).join("");

    // ข้อความในเซลล์: ตัดตารางซ้อนออกก่อน (มันจะถูกวาดเป็นแถวของตัวเอง) และคั่นย่อหน้าด้วยช่องว่าง
    // ไม่งั้นสองย่อหน้าในเซลล์เดียวจะกลายเป็นคำติดกันจนอ่านไม่ออก
    const cellText = (td) => {
      const clone = td.cloneNode(true);
      for (const t of [...clone.querySelectorAll("table")]) t.remove();
      const ps = [...clone.querySelectorAll("p")];
      const text = ps.length
        ? ps.map((x) => x.textContent.trim()).filter(Boolean).join(" ")
        : clone.textContent;
      return text.replace(/\s+/g, " ").trim();
    };

    const seenTables = new Set();
    const emitTable = (table) => {
      if (seenTables.has(table)) return;
      seenTables.add(table);
      for (const tr of [...table.rows]) {           // rows ให้เฉพาะแถวของตารางนี้ ไม่รวมตารางซ้อน
        const cells = [...tr.children].map(cellText).filter(Boolean);
        if (cells.length) blocks.push({ type: "p", runs: [{ text: cells.join("  |  ") }] });
      }
      for (const nested of [...table.querySelectorAll("table")]) emitTable(nested);
    };

    const emitList = (list, depth) => {
      const ordered = list.tagName.toLowerCase() === "ol";
      let n = 0;
      for (const li of [...list.children]) {
        if (li.tagName.toLowerCase() !== "li") continue;
        n += 1;
        const own = runsOf(li);
        if (own.length || !li.children.length) {
          blocks.push({ type: "li", depth, runs: [{ text: ordered ? `${n}. ` : "• " }, ...own] });
        }
        for (const sub of [...li.children]) {
          const t = sub.tagName.toLowerCase();
          if (t === "ul" || t === "ol") emitList(sub, depth + 1);
          else if (t === "table") emitTable(sub);
        }
      }
    };

    const walk = (node) => {
      for (const child of node.children) {
        const tag = child.tagName.toLowerCase();
        if (/^h[1-6]$/.test(tag)) {
          const runs = runsOf(child);
          if (plain(runs)) blocks.push({ type: "head", level: +tag[1], runs });
        } else if (tag === "p") {
          const runs = runsOf(child);
          if (plain(runs)) blocks.push({ type: "p", runs });
        } else if (tag === "ul" || tag === "ol") {
          emitList(child, 0);
        } else if (tag === "table") {
          emitTable(child);
        } else {
          walk(child);
        }
      }
    };
    walk(doc.body);
    return blocks;
  }

  /** จัดบรรทัดย่อหน้าที่มีตัวหนา/ขีดเส้นใต้สลับกลางประโยค โดยไม่ฉีกคำไทย
   *  คืนอาเรย์ของบรรทัด แต่ละบรรทัดคืออาเรย์ของช่วงข้อความพร้อมสไตล์ */
  function wrapRuns(doc, runs, maxWidth, forceBold) {
    const use = (r) => doc.setFont(THAI_FONT, (forceBold || r.bold) ? "bold" : "normal");
    const lines = [];
    let line = [], width = 0;
    const flush = () => { if (line.length) lines.push(line); line = []; width = 0; };
    for (const run of runs) {
      use(run);
      for (const chunk of textChunks(run.text)) {
        const w = doc.getTextWidth(chunk);
        if (width && width + w > maxWidth) {
          flush();
          use(run);
          if (!chunk.trim()) continue;      // ช่องว่างต้นบรรทัดใหม่ไม่มีประโยชน์
        }
        const last = line[line.length - 1];
        if (last && !!last.bold === !!run.bold && !!last.underline === !!run.underline) last.text += chunk;
        else line.push({ text: chunk, bold: !!run.bold, underline: !!run.underline });
        width += w;
      }
    }
    flush();
    return lines;
  }

  /* ‼️ mammoth ไม่ส่งหัวกระดาษกับท้ายกระดาษมาให้เลย (มันแปลงเฉพาะ body)
   * ของพวกนี้มักมีข้อมูลสำคัญที่สุดในเอกสารราชการไทย เช่น เลขที่หนังสือ ชั้นความลับ ชื่อหน่วยงาน
   * เดิมจึงหายไปทั้งหมดแบบไม่มีอะไรฟ้อง (ยิงจริง 09/09/2026: หัว "เอกสารลับ เลขที่ กค 0123/2569"
   * กับท้าย "ฝ่ายบัญชี บริษัทตัวอย่างจำกัด" หายเกลี้ยงทั้ง 3 หน้า)
   * แก้โดยอ่าน part เองจาก zip แล้ววาดเองทุกหน้า
   * ‼️ ต้องตามลิงก์ผ่าน sectPr และ _rels ไม่ใช่หยิบ header1.xml มาดื้อ ๆ เพราะไฟล์เดียวมีได้หลายหัว
   *    (default / หน้าแรก / หน้าคู่) การหยิบผิดตัวจะได้หัวของหน้าแรกไปแปะทุกหน้า */
  const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const PAGE_TOKEN = "PAGE";   // ที่วางเลขหน้า แทนค่าตอนวาดจริงทีละหน้า

  function partText(doc) {
    const lines = [];
    for (const p of doc.getElementsByTagNameNS(W_NS, "p")) {
      let s = "";
      // เดินตามลำดับจริงในย่อหน้า เพื่อให้เลขหน้าอยู่ตรงตำแหน่งที่ผู้ใช้วางไว้
      const walk = (n) => {
        for (const c of n.childNodes) {
          if (c.nodeType !== 1) continue;
          if (c.namespaceURI === W_NS && c.localName === "t") { s += c.textContent; continue; }
          if (c.namespaceURI === W_NS && c.localName === "instrText") {
            if (/\bPAGE\b/i.test(c.textContent) && !/NUMPAGES/i.test(c.textContent)) s += PAGE_TOKEN;
            continue;
          }
          if (c.namespaceURI === W_NS && c.localName === "fldSimple") {
            const instr = c.getAttributeNS(W_NS, "instr") || "";
            if (/\bPAGE\b/i.test(instr) && !/NUMPAGES/i.test(instr)) { s += PAGE_TOKEN; continue; }
          }
          walk(c);
        }
      };
      walk(p);
      const t = s.replace(/\s+/g, " ").trim();
      if (t) lines.push(t);
    }
    return lines.join("  ");
  }

  /** อ่านหัว/ท้ายกระดาษของ section แรกจากไฟล์ .docx โดยตรง คืน { header, footer, trackChanges } */
  async function readHeaderFooter(file) {
    try {
      const [JSZipLib] = await loadLibs("jszip");
      const zip = await JSZipLib.loadAsync(await file.arrayBuffer());
      const docFile = zip.file("word/document.xml");
      const relsFile = zip.file("word/_rels/document.xml.rels");
      if (!docFile || !relsFile) return { header: "", footer: "", trackChanges: 0 };
      const parser = new DOMParser();
      const main = parser.parseFromString(await docFile.async("string"), "application/xml");
      const rels = parser.parseFromString(await relsFile.async("string"), "application/xml");

      /* ‼️ เตือนอย่างเดียว ห้ามแก้เนื้อหาให้เอง (ยังไม่เคาะเชิงผลิตภัณฑ์ว่าจะยอมรับ/ปฏิเสธทั้งหมด
       * ยังไง) — mammoth (ตัวแปลง html ด้านล่าง) พิมพ์ข้อความที่ยังไม่ยอมรับลง PDF เหมือนเป็น
       * เนื้อหาสุดท้ายอยู่แล้ว ตรงกับที่ Word เองพิมพ์ออกมาทุกประการ พฤติกรรมแปลงจึงคงเดิม
       * 100% ตรงนี้แค่นับให้ผู้ใช้เห็นว่ามีอยู่กี่จุดก่อนที่จะพลาดส่งออกไปโดยไม่รู้ตัว
       * (ยิงจริง 09/09/2026: ข้อความที่ยังไม่ accept ติดไปกับ PDF เหมือนข้อความปกติเป๊ะ) */
      const trackChanges = main.getElementsByTagNameNS(W_NS, "ins").length
                          + main.getElementsByTagNameNS(W_NS, "del").length;

      const targetOf = (id) => {
        for (const r of rels.getElementsByTagName("Relationship")) {
          if (r.getAttribute("Id") === id) return "word/" + (r.getAttribute("Target") || "").replace(/^\.\//, "");
        }
        return null;
      };
      const pick = (kind) => {
        const sect = main.getElementsByTagNameNS(W_NS, "sectPr")[0];
        if (!sect) return null;
        const refs = [...sect.getElementsByTagNameNS(W_NS, kind + "Reference")];
        // เอา default ก่อน ถ้าไม่มีค่อยใช้ตัวแรกที่เจอ (บางไฟล์ตั้งไว้เฉพาะหน้าแรก)
        const ref = refs.find((r) => (r.getAttributeNS(W_NS, "type") || "") === "default") || refs[0];
        const id = ref && ref.getAttributeNS(R_NS, "id");
        return id ? targetOf(id) : null;
      };
      const read = async (kind) => {
        const path = pick(kind);
        const f = path && zip.file(path);
        if (!f) return "";
        return partText(parser.parseFromString(await f.async("string"), "application/xml"));
      };
      return { header: await read("header"), footer: await read("footer"), trackChanges };
    } catch {
      return { header: "", footer: "", trackChanges: 0 };   // อ่านไม่ได้ก็แค่ไม่มีหัวท้าย ไม่ควรทำให้ทั้งไฟล์แปลงไม่ผ่าน
    }
  }

  // หัว/ท้ายกระดาษต้องอยู่บรรทัดเดียว ยาวเกินก็ตัดท้ายแทนที่จะดันเนื้อหาเลื่อน
  function fitOneLine(doc, text, maxWidth) {
    if (doc.getTextWidth(text) <= maxWidth) return text;
    let cut = text;
    while (cut.length > 1 && doc.getTextWidth(cut + "…") > maxWidth) cut = cut.slice(0, -1);
    return cut + "…";
  }

  /** วาดหัว/ท้ายกระดาษลงทุกหน้า หลังจัดเนื้อหาเสร็จแล้ว */
  function stampHeaderFooter(doc, headFoot, W, H, M) {
    const { header, footer } = headFoot;
    if (!header && !footer) return;
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFont(THAI_FONT, "normal");
      doc.setFontSize(9);
      doc.setTextColor(110);
      const put = (raw, y) => {
        const text = raw.split(PAGE_TOKEN).join(String(i));
        if (!text) return;
        doc.text(fitOneLine(doc, text, W - M * 2), W / 2, y, { align: "center" });
      };
      put(header, M * 0.62);
      put(footer, H - M * 0.45);
      doc.setTextColor(0);
    }
  }

  /** แปลงหนึ่งไฟล์ คืน { blob, pages, warnings } */
  async function convertOne(file) {
      const { value: html, messages } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
      const headFoot = await readHeaderFooter(file);
      const blocks = htmlToBlocks(html);
      if (!blocks.length) throw new Error(tr("ไม่พบเนื้อหาข้อความในไฟล์นี้", "No text content was found in this file"));

      st.info(tr("กำลังจัดหน้า PDF…", "Laying out the PDF…"));
      const { jsPDF } = jspdf;
      const doc = new jsPDF({ unit: "pt", format: PAGE[size.value] });
      await useThaiFont(doc, "both");

      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const M = 56;
      const base = +fontSize.value;
      let y = M;

      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const fs = b.type === "head" ? base + (7 - Math.min(b.level, 4)) * 2 : base;
        const isHead = b.type === "head";
        doc.setFontSize(fs);
        const lineH = fs * 1.55;
        const indent = b.type === "li" ? 16 + (b.depth || 0) * 14 : 0;
        const lines = wrapRuns(doc, b.runs, W - M * 2 - indent, isHead);

        if (isHead && y > M) y += lineH * 0.5;
        for (const line of lines) {
          if (y + lineH > H - M) { doc.addPage(); y = M; }
          let x = M + indent;
          for (const seg of line) {
            doc.setFont(THAI_FONT, (isHead || seg.bold) ? "bold" : "normal");
            doc.text(seg.text, x, y + fs);
            const segW = doc.getTextWidth(seg.text);
            // ฟอนต์ที่ฝังไม่มีสไตล์ขีดเส้นใต้ในตัว ต้องลากเส้นเอง (เอียงทำไม่ได้จริง จึงไม่ทำเทียม)
            if (seg.underline) doc.line(x, y + fs + fs * 0.12, x + segW, y + fs + fs * 0.12);
            x += segW;
          }
          y += lineH;
        }
        y += isHead ? lineH * 0.35 : lineH * 0.22;

        if (i % 40 === 0) { st.progress((i / blocks.length) * 100); await yieldToBrowser(); }
      }

      stampHeaderFooter(doc, headFoot, W, H, M);

      return {
        blob: doc.output("blob"),
        pages: doc.getNumberOfPages(),
        warnings: messages.filter((m) => m.type === "warning").length,
        trackChanges: headFoot.trackChanges,
      };
  }

  async function run() {
    if (!files.length) return st.err(tr("กรุณาเลือกไฟล์ .docx ก่อน", "Please choose a .docx file first"));
    results.innerHTML = "";
    go.disabled = true;
    const made = [];
    let failed = 0, warned = 0, tracked = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        st.info(tr(`กำลังแปลง ${files[i].name} (${i + 1}/${files.length})`, `Converting ${files[i].name} (${i + 1}/${files.length})`));
        try {
          const r = await convertOne(files[i]);
          made.push({ name: stripExt(files[i].name) + ".pdf", ...r });
          warned += r.warnings;
          tracked += r.trackChanges;
        } catch (e) {
          failed++;
          results.appendChild(el("div", { class: "status show err" },
            tr(`${files[i].name}: แปลงไม่สำเร็จ: ${e.message}`, `${files[i].name}: could not convert: ${e.message}`)));
        }
        st.progress(((i + 1) / files.length) * 100);
        await yieldToBrowser();
      }
      st.progress(null);
      if (!made.length) { st.err(tr("แปลงไม่สำเร็จสักไฟล์", "Could not convert any files")); return; }

      const pages = made.reduce((a, m) => a + m.pages, 0);
      st.ok(tr(`แปลงสำเร็จ ${made.length} ไฟล์, รวม ${pages} หน้า` +
        (failed ? `, ล้มเหลว ${failed} ไฟล์` : "") +
        (warned ? `, มี ${warned} จุดที่จัดรูปแบบไม่ครบ` : "") +
        (tracked ? `, มีการแก้ไขที่ยังไม่ยอมรับ ${tracked} จุด` : ""),
        `Done, ${made.length} files, ${pages} pages total` +
        (failed ? `, ${failed} failed` : "") +
        (warned ? `, ${warned} spots with incomplete formatting` : "") +
        (tracked ? `, ${tracked} unaccepted tracked change(s)` : "")));

      // เตือนอย่างเดียว ไม่แก้เนื้อหาให้เอง — ข้อความที่ยังไม่ accept ถูกแปลงลง PDF เหมือนข้อความ
      // ปกติ (ตรงกับที่ Word เองพิมพ์ออกมา) ผู้ใช้ต้องรู้ก่อนส่งไฟล์ออก ไม่ใช่รู้ทีหลัง
      if (tracked) results.appendChild(el("div", { class: "note warn" },
        tr(`ไฟล์นี้มีการแก้ไขที่ยังไม่ยอมรับ ${tracked} จุด ข้อความเหล่านั้นจะถูกแปลงลง PDF ด้วย ` +
           `เปิดไฟล์ต้นฉบับด้วย Word แล้วกด “ยอมรับการแก้ไขทั้งหมด” ก่อน ถ้าไม่ต้องการให้ติดไปด้วย`,
           `This file has ${tracked} unaccepted tracked change(s), and that text will be included in the PDF. ` +
           `Open the original in Word and “Accept All Changes” first if you don't want it included`)));

      if (made.length > 1) results.appendChild(el("div", { class: "actions" }, [
        button(tr("ดาวน์โหลด ZIP", "Download ZIP"), { icon: "zip",  onclick: async () => {
          const [JSZipLib] = await loadLibs("jszip");
          const zip = new JSZipLib();
          made.forEach((m) => zip.file(m.name, m.blob));
          download(await zip.generateAsync({ type: "blob" }), tr("เอกสารที่แปลงแล้ว.zip", "converted-documents.zip"));
        } }),
      ]));
      made.forEach((m) => results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, m.name), el("small", {}, tr(`${m.pages} หน้า`, `${m.pages} pages`))]),
        el("span", { class: "r-size" }, fmtBytes(m.blob.size)),
        button("", { icon: "download", label: tr("ดาวน์โหลด", "Download"),  onclick: () => download(m.blob, m.name) }),
      ])));
    } catch (e) {
      st.progress(null);
      st.err(tr("แปลงไม่สำเร็จ: ", "Could not convert: ") + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
