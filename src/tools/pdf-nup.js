// ── หลายหน้าต่อแผ่น และหนังสือเล่มเล็ก ─────────────────────────────────────
// งานที่คนไทยทำบ่อยแต่ต้องไปพึ่งหน้าต่างพิมพ์ของโปรแกรมอื่นทุกครั้ง
//   · ประหยัดกระดาษ เอกสาร 40 หน้าเหลือ 10 แผ่น
//   · ทำเอกสารแจกในที่ประชุม 2 หน้าต่อแผ่น อ่านยังสบายตา
//   · พับครึ่งเย็บกลางเป็นเล่มเล็ก สำหรับคู่มือหรือสูจิบัตร
//
// ‼️ ข้อความยังค้นหาและคัดลอกได้เหมือนเดิม เพราะวางหน้าเดิมลงกระดาษใหม่
//   ไม่ได้เรนเดอร์เป็นภาพ (พิสูจน์แล้ว 21/09/2026)
import { loadPdfLib, friendlyPdfError } from "../pdfopen.js";
import { el, dropzone, statusBar, button, field, select, downloadButton,
         stripExt, yieldToBrowser, fmtBytes } from "../ui.js";
import { workspace } from "../workspace.js";
import { PAPER, GRIDS, bookletSheets, chunkPages, imposeSheets } from "../pdfimpose.js";
import { tr, pl } from "../i18n.js";

const STYLE = `
.nu-stage{display:flex;flex-direction:column;gap:14px;margin:auto;width:100%;max-width:460px;text-align:center}
.nu-stage[hidden]{display:none}
.nu-sheet{position:relative;margin:0 auto;background:#fff;border:1px solid var(--line);
  border-radius:4px;box-shadow:var(--sh2);display:grid;gap:4px;padding:6px}
.nu-cell{background:color-mix(in srgb,var(--g-pdf) 12%,#fff);border:1px solid color-mix(in srgb,var(--g-pdf) 30%,transparent);
  border-radius:2px;display:grid;place-items:center;font-size:11px;font-weight:700;color:var(--g-pdf);
  min-height:22px;font-variant-numeric:tabular-nums}
.nu-cell.blank{background:var(--bg-soft);border-style:dashed;color:var(--text-mute);font-weight:400}
.nu-meta{font-size:13.5px;line-height:1.6;color:var(--text-dim)}
.nu-meta b{color:var(--text)}
.nu-fold{font-size:12.5px;line-height:1.6;color:var(--text-mute);
  background:var(--bg-soft);border:1px solid var(--line-soft);border-radius:var(--r-sm);padding:9px 12px;text-align:start}
`;

export function mount(tool) {
  const st = statusBar();
  const results = el("div", { class: "results" });

  const modeSel = select([
    ["2", tr("2 หน้าต่อแผ่น", "2 pages per sheet")],
    ["4", tr("4 หน้าต่อแผ่น", "4 pages per sheet")],
    ["6", tr("6 หน้าต่อแผ่น", "6 pages per sheet")],
    ["9", tr("9 หน้าต่อแผ่น", "9 pages per sheet")],
    ["booklet", tr("หนังสือเล่มเล็ก พับครึ่งเย็บกลาง", "Booklet, folded and stapled in the middle")],
  ], "2");
  const paperSel = select(Object.entries(PAPER).map(([k, v]) => [k, v.label()]), "a4");
  const marginSel = select([
    ["0", tr("ไม่มีขอบ", "No margin")],
    ["14", tr("ขอบบาง", "Thin margin")],
    ["28", tr("ขอบปกติ (1 ซม.)", "Normal margin (1 cm)")],
    ["42", tr("ขอบกว้าง สำหรับเข้าเล่ม", "Wide margin, for binding")],
  ], "14");

  const sheetBox = el("div", { class: "nu-sheet" });
  const meta = el("div", { class: "nu-meta" });
  const foldNote = el("div", { class: "nu-fold", hidden: true });
  const stage = el("div", { class: "nu-stage", hidden: true }, [sheetBox, meta, foldNote]);

  const go = button(tr("จัดหน้าแล้วบันทึก", "Arrange and save"), { onclick: run });
  go.disabled = true;

  const dz = dropzone({
    accept: "application/pdf,.pdf", multiple: false,
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "a PDF file"),
    hint: tr("ครั้งละ 1 ไฟล์", "One file at a time"),
    onChange: onFile,
  });

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์", "File"), node: dz.container },
    right: { title: tr("การจัดหน้า", "Layout"), node: el("div", {}, [
      field(tr("รูปแบบ", "Layout"), modeSel),
      field(tr("ขนาดกระดาษ", "Paper size"), paperSel),
      field(tr("ขอบกระดาษ", "Margin"), marginSel),
      el("div", { class: "nu-fold" },
         tr("ข้อความยังค้นหาและคัดลอกได้เหมือนเดิม เพราะวางหน้าเดิมลงกระดาษใหม่ ไม่ได้แปลงเป็นภาพ",
            "Text stays searchable and copyable, because the original pages are placed onto new paper rather than turned into images")),
    ]) },
    center: { node: stage, empty: tr("เลือกไฟล์ PDF เพื่อดูว่าจะได้กี่แผ่น", "Choose a PDF to see how many sheets you get") },
    footer: [go, st.node],
  });
  ws.wrap.appendChild(el("style", {}, STYLE));
  ws.body.appendChild(results);

  let file = null, pageCount = 0;

  async function onFile(fs) {
    file = fs[0] || null;
    results.innerHTML = "";
    st.clear();
    if (!file) { stage.hidden = true; ws.showCanvas(false); go.disabled = true; return; }
    try {
      st.info(tr("กำลังอ่านไฟล์…", "Reading the file…"));
      const { doc } = await loadPdfLib(file);
      pageCount = doc.getPageCount();
      stage.hidden = false;
      ws.showCanvas(true);
      go.disabled = false;
      st.clear();
      preview();
    } catch (e) {
      stage.hidden = true; ws.showCanvas(false); go.disabled = true;
      st.err(friendlyPdfError(e, file.name).message);
    }
  }

  for (const c of [modeSel, paperSel, marginSel]) c.onchange = preview;

  /** คำนวณผังทั้งหมดจากค่าที่ตั้งไว้ ใช้ทั้งตอนพรีวิวและตอนบันทึกจริง จะได้ไม่มีทางไม่ตรงกัน */
  function plan() {
    const paper = PAPER[paperSel.value] || PAPER.a4;
    const margin = +marginSel.value || 0;
    if (modeSel.value === "booklet") {
      const { total, sheets } = bookletSheets(pageCount);
      /* เล่มเล็กใช้กระดาษแนวนอน แล้วพับครึ่งตามแนวตั้ง ได้หน้าขนาดครึ่งหนึ่งของกระดาษ */
      return { kind: "booklet", sheets, cols: 2, rows: 1,
               sheetW: paper.h, sheetH: paper.w, margin, gutter: 0, total };
    }
    const per = +modeSel.value;
    const g = GRIDS[per] || GRIDS[2];
    return { kind: "nup", per, sheets: chunkPages(pageCount, per),
             cols: g.cols, rows: g.rows,
             sheetW: g.landscape ? paper.h : paper.w,
             sheetH: g.landscape ? paper.w : paper.h,
             margin, gutter: 8 };
  }

  function preview() {
    if (!pageCount) return;
    const p = plan();
    const first = p.sheets[0] || [];
    /* วาดแผ่นแรกให้เห็นว่าหน้าไหนไปอยู่ตรงไหน ตามสัดส่วนจริงของกระดาษ */
    const boxW = 240, boxH = boxW * (p.sheetH / p.sheetW);
    Object.assign(sheetBox.style, {
      width: boxW + "px", height: boxH + "px",
      gridTemplateColumns: `repeat(${p.cols}, 1fr)`,
      gridTemplateRows: `repeat(${p.rows}, 1fr)`,
    });
    sheetBox.replaceChildren(...first.map((n) => el("div",
      { class: "nu-cell" + (n ? "" : " blank") }, n ? String(n) : tr("ว่าง", "blank"))));

    meta.replaceChildren(
      el("b", {}, tr(`${pageCount} หน้า เป็น ${p.sheets.length} แผ่น`,
                     `${pl(pageCount, "page", "pages")} onto ${pl(p.sheets.length, "sheet", "sheets")}`)),
      el("div", {}, tr(`กระดาษ ${Math.round(p.sheetW)} x ${Math.round(p.sheetH)} พอยต์`,
                       `Paper ${Math.round(p.sheetW)} x ${Math.round(p.sheetH)} pt`)),
    );
    foldNote.hidden = p.kind !== "booklet";
    if (p.kind === "booklet") {
      const paperSheets = p.sheets.length / 2;
      foldNote.textContent = tr(
        `พิมพ์สองหน้าบนกระดาษ ${paperSheets} แผ่น โดยพลิกด้านตามแนวสั้นของกระดาษ แล้วพับครึ่งเย็บกลาง จะได้เล่ม ${p.total} หน้าเรียงถูกต้อง` +
        (p.total > pageCount ? ` (เติมหน้าว่างให้ ${p.total - pageCount} หน้า เพราะเล่มพับต้องหารด้วย 4 ลงตัว)` : ""),
        `Print double-sided on ${pl(paperSheets, "sheet", "sheets")}, flipping on the short edge, then fold in half and staple the middle for a ${p.total}-page booklet in the right order` +
        (p.total > pageCount ? ` (${p.total - pageCount} blank pages added, since a folded booklet needs a multiple of four)` : ""));
    }
  }

  async function run() {
    if (!file || !pageCount) return;
    results.innerHTML = "";
    go.disabled = true;
    ws.setBusy(true);
    st.begin();
    st.info(tr("กำลังจัดหน้า…", "Arranging the pages…"));
    try {
      const { PDFDocument } = PDFLib;
      const { doc: src } = await loadPdfLib(file);
      const out = await PDFDocument.create();
      const embedded = await out.embedPages(src.getPages());
      const p = plan();
      await imposeSheets(out, embedded, p.sheets, {
        sheetW: p.sheetW, sheetH: p.sheetH, cols: p.cols, rows: p.rows,
        margin: p.margin, gutter: p.gutter, mode: "fit",
        onSheet: async (i, n) => {
          st.progress((i / n) * 100, `(${i}/${n})`);
          await yieldToBrowser();
        },
      });
      st.end();
      const blob = new Blob([await out.save()], { type: "application/pdf" });
      const suffix = p.kind === "booklet" ? tr("-เล่มเล็ก.pdf", "-booklet.pdf")
                                          : tr(`-${p.per}หน้าต่อแผ่น.pdf`, `-${p.per}up.pdf`);
      const name = stripExt(file.name) + suffix;
      st.progress(null);
      st.ok(tr(`จัดเสร็จ ${pageCount} หน้า เป็น ${p.sheets.length} แผ่น`,
               `Done, ${pl(pageCount, "page", "pages")} onto ${pl(p.sheets.length, "sheet", "sheets")}`));
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name),
          el("small", {}, tr(`${p.sheets.length} แผ่น, ${fmtBytes(blob.size)}`,
                             `${pl(p.sheets.length, "sheet", "sheets")}, ${fmtBytes(blob.size)}`))]),
        downloadButton(blob, name),
      ]));
    } catch (e) {
      st.end();
      st.progress(null);
      st.err(friendlyPdfError(e, file && file.name).message);
    } finally {
      go.disabled = false;
      ws.setBusy(false);
    }
  }

  return ws.wrap;
}
