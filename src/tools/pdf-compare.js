// ── เทียบ PDF สองฉบับ ──────────────────────────────────────────────────────
// เคสจริงที่เครื่องมือนี้แก้: ได้สัญญาฉบับแก้ไขกลับมาจากอีกฝ่าย แล้วต้องหาให้เจอว่า
// เขาแก้ตรงไหนบ้าง ซึ่งเดิมต้องนั่งอ่านเทียบทีละบรรทัดเอง
//
// ‼️ นี่คือเครื่องมือที่ "ไฟล์ไม่ออกจากเครื่อง" มีค่าที่สุดอีกตัวหนึ่ง
//   เพราะร่างสัญญาที่ยังไม่ลงนามคือเอกสารที่ห้ามหลุดที่สุดอยู่แล้ว
//   การอัปโหลดทั้งสองฉบับขึ้นเว็บคนอื่นเพื่อหาว่าต่างกันตรงไหน จึงย้อนแย้งในตัวเอง
//
// ‼️ พิสูจน์ก่อนเขียน (21/09/2026) ว่าทำได้จริง
//   ① ลำดับข้อความที่ pdf.js อ่านออกมานิ่ง ไฟล์เดียวกันสร้างคนละรอบอ่านได้เหมือนกันเป๊ะ
//   ② hasEOL ของ pdf.js แบ่งบรรทัดไทยได้ถูกต้อง
//   ③ Intl.Segmenter ตัดคำไทยได้ดี จึงชี้จุดที่ต่างได้ระดับคำ ไม่ใช่ฟ้องทั้งบรรทัด
import { openPdf, passwordBox, friendlyPdfError } from "../pdfopen.js";
import { el, dropzone, statusBar, button, downloadButton,
         stripExt, yieldToBrowser } from "../ui.js";
import { workspace } from "../workspace.js";
import { diffLines } from "../textdiff.js";
import { tr, pl } from "../i18n.js";

const STYLE = `
.cd-wrap{display:flex;flex-direction:column;gap:10px;height:100%;min-height:0}
.cd-wrap[hidden]{display:none}
.cd-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:13px}
.cd-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;
  border:1px solid var(--line);font-variant-numeric:tabular-nums}
.cd-chip b{font-weight:700}
.cd-chip.ch{border-color:#b8860b;color:#8a6a1c;background:color-mix(in srgb,#b8860b 8%,transparent)}
.cd-chip.ad{border-color:#2f6b4f;color:#2f6b4f;background:color-mix(in srgb,#2f6b4f 8%,transparent)}
.cd-chip.rm{border-color:#8a2d2d;color:#8a2d2d;background:color-mix(in srgb,#8a2d2d 8%,transparent)}
.cd-scroll{flex:1 1 auto;min-height:0;overflow:auto;border:1px solid var(--line);
  border-radius:var(--r-sm);background:var(--card)}
.cd-row{display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid var(--line-soft)}
.cd-row:last-child{border-bottom:0}
.cd-cell{padding:7px 12px;font-size:13.5px;line-height:1.7;word-break:break-word;white-space:pre-wrap;
  border-inline-end:1px solid var(--line-soft);min-height:1.7em}
.cd-cell:last-child{border-inline-end:0}
.cd-row.same{color:var(--text-dim)}
.cd-row.changed .cd-cell{background:color-mix(in srgb,#b8860b 7%,transparent)}
.cd-row.del .cd-cell:first-child{background:color-mix(in srgb,#8a2d2d 9%,transparent)}
.cd-row.add .cd-cell:last-child{background:color-mix(in srgb,#2f6b4f 9%,transparent)}
.cd-w-del{background:color-mix(in srgb,#8a2d2d 24%,transparent);border-radius:3px;
  text-decoration:line-through;text-decoration-thickness:1px}
.cd-w-add{background:color-mix(in srgb,#2f6b4f 26%,transparent);border-radius:3px;font-weight:600}
.cd-page{grid-column:1 / -1;padding:6px 12px;font-size:12px;font-weight:700;color:var(--text-mute);
  background:var(--bg-soft);border-block:1px solid var(--line-soft)}
.cd-only{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--text-mute)}
.cd-only input{width:17px;height:17px;accent-color:var(--g-pdf)}
.cd-note{font-size:12.5px;line-height:1.6;color:var(--text-mute);
  background:var(--bg-soft);border:1px solid var(--line-soft);border-radius:var(--r-sm);padding:9px 12px}
.cd-empty{padding:28px 16px;text-align:center;color:var(--text-mute);font-size:14px;line-height:1.7}
`;

export function mount(tool) {
  const st = statusBar();
  const results = el("div", { class: "results" });

  const chipSame = el("span", { class: "cd-chip" });
  const chipCh = el("span", { class: "cd-chip ch" });
  const chipAdd = el("span", { class: "cd-chip ad" });
  const chipRm = el("span", { class: "cd-chip rm" });
  const onlyDiff = el("input", { type: "checkbox" });
  const head = el("div", { class: "cd-head" }, [
    chipCh, chipAdd, chipRm, chipSame,
    el("label", { class: "cd-only" }, [onlyDiff, el("span", {}, tr("แสดงเฉพาะบรรทัดที่ต่าง", "Show only the lines that differ"))]),
  ]);
  const table = el("div", { class: "cd-scroll" });
  const wrap = el("div", { class: "cd-wrap", hidden: true }, [head, table]);

  const go = button(tr("เทียบสองฉบับ", "Compare the two"), { onclick: run });
  go.disabled = true;

  const dz = dropzone({
    accept: "application/pdf,.pdf", multiple: true, reorder: true,
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "a PDF file"),
    hint: tr("ใส่ 2 ไฟล์ ฉบับเดิมก่อน ฉบับใหม่ทีหลัง", "Two files, the older one first"),
    onChange: onFiles,
  });

  const ws = workspace(tool, {
    left: { title: tr("สองฉบับที่จะเทียบ", "The two versions"), node: dz.container,
            hint: tr("ลากสลับลำดับได้", "Drag to reorder") },
    right: { title: tr("วิธีอ่านผล", "How to read the result"), node: el("div", {}, [
      el("div", { class: "cd-note" },
         tr("ซ้ายคือฉบับเดิม ขวาคือฉบับใหม่ เหลือง=แก้ไข แดง=หายไป เขียว=เพิ่มเข้ามา",
            "The left is the older file and the right is the newer one. Yellow rows were edited, red text was removed and green text was added")),
      el("div", { class: "cd-note" },
         tr("เทียบจากชั้นข้อความในไฟล์ ไฟล์สแกนที่ยังไม่ผ่าน OCR จะไม่มีข้อความให้เทียบ ให้ทำ OCR ก่อน",
            "This compares the text layer. A scan that has not been through OCR has no text to compare, so run OCR first")),
    ]) },
    center: { node: wrap, empty: tr("ใส่ไฟล์ PDF 2 ฉบับเพื่อหาว่าแก้ตรงไหนบ้าง",
                                    "Add two PDF files to find what changed between them") },
    footer: [go, st.node],
  });
  ws.wrap.appendChild(el("style", {}, STYLE));
  ws.body.appendChild(results);

  let files = [], lastRows = null;

  function onFiles(fs) {
    files = fs.slice();
    results.innerHTML = "";
    st.clear();
    go.disabled = files.length !== 2;
    if (files.length && files.length !== 2)
      st.info(tr(`ต้องใช้ 2 ไฟล์ ตอนนี้มี ${files.length}`, `Two files are needed, you have ${files.length}`));
  }

  onlyDiff.addEventListener("change", () => { if (lastRows) render(lastRows); });

  /** อ่านข้อความทุกหน้า แบ่งเป็นบรรทัดด้วย hasEOL ของ pdf.js */
  async function readLines(file) {
    const doc = await openPdf(file, passwordBox(ws.body));
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const lines = [];
      let cur = "";
      for (const it of tc.items) {
        cur += it.str;
        if (it.hasEOL) { lines.push(cur.trim()); cur = ""; }
      }
      if (cur.trim()) lines.push(cur.trim());
      pages.push(lines.filter((l) => l !== ""));
      page.cleanup();
      await yieldToBrowser();
    }
    try { doc.destroy(); } catch { /* ปิดไปแล้วก็ไม่เป็นไร */ }
    return pages;
  }

  function renderParts(parts, side) {
    /* side "a" = แสดงของเดิม (คำที่ถูกลบไฮไลต์แดง) · "b" = ฉบับใหม่ (คำที่เพิ่มไฮไลต์เขียว) */
    if (!parts) return null;
    const out = [];
    for (const p of parts) {
      const text = p.items.join("");
      if (p.type === "same") out.push(text);
      else if (p.type === "del" && side === "a") out.push(el("span", { class: "cd-w-del" }, text));
      else if (p.type === "add" && side === "b") out.push(el("span", { class: "cd-w-add" }, text));
    }
    return out;
  }

  function render(data) {
    const { pageRows, stats } = data;
    chipCh.replaceChildren(el("b", {}, String(stats.changed)), tr(" บรรทัดที่แก้", " edited"));
    chipAdd.replaceChildren(el("b", {}, String(stats.added)), tr(" เพิ่มเข้ามา", " added"));
    chipRm.replaceChildren(el("b", {}, String(stats.removed)), tr(" หายไป", " removed"));
    chipSame.replaceChildren(el("b", {}, String(stats.same)), tr(" เหมือนเดิม", " unchanged"));

    table.replaceChildren();
    const only = onlyDiff.checked;
    let shown = 0;
    for (const { page, rows } of pageRows) {
      const visible = only ? rows.filter((r) => r.type !== "same") : rows;
      if (!visible.length) continue;
      table.appendChild(el("div", { class: "cd-row" }, [
        el("div", { class: "cd-page" }, tr(`หน้า ${page}`, `Page ${page}`)),
      ]));
      for (const r of visible) {
        shown++;
        const left = r.type === "changed" ? renderParts(r.parts, "a") : (r.a ?? "");
        const right = r.type === "changed" ? renderParts(r.parts, "b") : (r.b ?? "");
        table.appendChild(el("div", { class: "cd-row " + r.type }, [
          el("div", { class: "cd-cell" }, left),
          el("div", { class: "cd-cell" }, right),
        ]));
      }
    }
    if (!shown) {
      table.appendChild(el("div", { class: "cd-empty" },
        only ? tr("ไม่พบความต่างเลย สองฉบับนี้ข้อความเหมือนกันทุกบรรทัด",
                  "No differences found, the text is identical line by line")
             : tr("ไม่มีข้อความให้เทียบ ไฟล์อาจเป็นไฟล์สแกนที่ยังไม่ผ่าน OCR",
                  "No text to compare, these may be scans that have not been through OCR")));
    }
  }

  /** ไฟล์สรุปผลแบบข้อความ เอาไปแนบอีเมลหรือเก็บเป็นหลักฐานได้ */
  function buildReport(pageRows, stats, nameA, nameB) {
    const L = [];
    L.push(tr("ผลเทียบเอกสารสองฉบับ", "Comparison of two documents"));
    L.push(tr(`ฉบับเดิม: ${nameA}`, `Older: ${nameA}`));
    L.push(tr(`ฉบับใหม่: ${nameB}`, `Newer: ${nameB}`));
    L.push(tr(`แก้ไข ${stats.changed} บรรทัด, เพิ่ม ${stats.added}, หายไป ${stats.removed}, เหมือนเดิม ${stats.same}`,
              `${stats.changed} edited, ${stats.added} added, ${stats.removed} removed, ${stats.same} unchanged`));
    L.push("");
    for (const { page, rows } of pageRows) {
      const diffs = rows.filter((r) => r.type !== "same");
      if (!diffs.length) continue;
      L.push(tr(`── หน้า ${page} ──`, `── Page ${page} ──`));
      for (const r of diffs) {
        if (r.type === "changed") { L.push(tr(`  เดิม : ${r.a}`, `  was : ${r.a}`)); L.push(tr(`  ใหม่ : ${r.b}`, `  now : ${r.b}`)); }
        else if (r.type === "del") L.push(tr(`  หายไป: ${r.a}`, `  removed: ${r.a}`));
        else L.push(tr(`  เพิ่ม : ${r.b}`, `  added  : ${r.b}`));
      }
      L.push("");
    }
    /* ‼️ ใส่ BOM ให้ไฟล์ข้อความไทยเสมอ ไม่งั้นเปิดใน Excel หรือ Notepad แล้วเป็นภาษาต่างดาว */
    return new Blob(["﻿" + L.join("\n")], { type: "text/plain;charset=utf-8" });
  }

  async function run() {
    if (files.length !== 2) return st.err(tr("ต้องใช้ไฟล์ 2 ฉบับ", "Two files are needed"));
    results.innerHTML = "";
    go.disabled = true;
    ws.setBusy(true);
    st.info(tr("กำลังอ่านข้อความจากทั้งสองฉบับ…", "Reading the text from both files…"));
    try {
      const pagesA = await readLines(files[0]);
      const pagesB = await readLines(files[1]);
      st.info(tr("กำลังเทียบ…", "Comparing…"));

      const total = Math.max(pagesA.length, pagesB.length);
      const pageRows = [];
      const stats = { same: 0, changed: 0, added: 0, removed: 0, tooBig: false };
      for (let i = 0; i < total; i++) {
        const r = diffLines(pagesA[i] || [], pagesB[i] || []);
        pageRows.push({ page: i + 1, rows: r.rows });
        for (const k of ["same", "changed", "added", "removed"]) stats[k] += r.stats[k];
        if (r.stats.tooBig) stats.tooBig = true;
        st.progress(((i + 1) / total) * 100, `(${i + 1}/${total})`);
        await yieldToBrowser();
      }

      lastRows = { pageRows, stats };
      wrap.hidden = false;
      ws.showCanvas(true);
      render(lastRows);
      st.progress(null);

      const diffCount = stats.changed + stats.added + stats.removed;
      if (!diffCount) st.ok(tr("ไม่พบความต่างเลย ข้อความเหมือนกันทุกบรรทัด",
                               "No differences found, the text is identical line by line"));
      else st.ok(tr(`พบความต่าง ${diffCount} จุด` + (stats.tooBig ? " (เอกสารยาวมาก เทียบแบบหยาบทีละบรรทัด)" : ""),
                    `Found ${pl(diffCount, "difference", "differences")}` + (stats.tooBig ? " (very long document, compared line by line only)" : "")));

      if (diffCount) {
        const blob = buildReport(pageRows, stats, files[0].name, files[1].name);
        const name = stripExt(files[1].name) + tr("-ผลเทียบ.txt", "-comparison.txt");
        results.appendChild(el("div", { class: "result" }, [
          el("div", { class: "r-name" }, [el("strong", {}, name),
            el("small", {}, tr("สรุปผลเป็นไฟล์ข้อความ เอาไปแนบอีเมลได้", "A text summary you can attach to an email"))]),
          downloadButton(blob, name),
        ]));
      }
    } catch (e) {
      st.progress(null);
      st.err(friendlyPdfError(e, files[0] && files[0].name).message);
    } finally {
      go.disabled = files.length !== 2;
      ws.setBusy(false);
    }
  }

  return ws.wrap;
}
