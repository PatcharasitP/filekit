import { loadPdfLib, ENCRYPTED_WARNING } from "../pdfopen.js";
import { el, dropzone, statusBar, button, field, download,
         stripExt, parsePages, fmtBytes, yieldToBrowser, segmented } from "../ui.js";
import { workspace } from "../workspace.js";
import { tr } from "../i18n.js";

// ── สไตล์เฉพาะหน้านี้ — ห้ามแก้ assets/css/tool.css จึงฝังไว้ในโมดูลแทน (ตามแบบ pdf-pages.js) ──
// ไม่มี pdfjs ให้ใช้ในเครื่องมือนี้ (ดู registry.js) จึงพรีวิวเป็น "กรอบเลขหน้าจำลอง" แทนภาพจริง
// จัดกลุ่มเป็นกล่อง (cluster) ตามไฟล์ผลลัพธ์ที่จะได้ แล้วคั่นด้วยรอยตัด (.sp-cut) ระหว่างกล่องไฟล์คนละใบ
const STYLE = `
.sp-left,.sp-right{display:flex;flex-direction:column;gap:10px}
.sp-count{font-size:15px;font-weight:800;color:var(--text)}
.sp-count.err{color:var(--err);font-size:13px;font-weight:600;line-height:1.6}
.sp-sumlist{display:flex;flex-direction:column;gap:6px;margin-top:2px}
.sp-sumrow{display:flex;align-items:center;gap:8px;font-size:12.5px;padding:6px 9px;
  border-radius:var(--r-sm);background:var(--bg-soft);border:1px solid var(--line-soft)}
.sp-sumrow-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.sp-sumrow-n{color:var(--text-mute);font-size:11.5px;font-variant-numeric:tabular-nums;white-space:nowrap}
.sp-more{font-size:12px;color:var(--text-mute);padding:2px 4px}
.sp-empty-note{font-size:13px;color:var(--text-mute)}
.sp-dot{width:9px;height:9px;border-radius:50%;background:var(--pc,var(--brand));flex:none}

.sp-toolbar-status{font-size:13px;font-weight:700;color:var(--text)}
.sp-toolbar-status.err{color:var(--err)}

.sp-track{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start}
.sp-cluster{border-radius:var(--r-sm);padding:8px;display:flex;flex-direction:column;gap:6px;flex:none}
.sp-cluster.incl{border:1.5px solid color-mix(in srgb,var(--pc) 55%,var(--line-soft));
  background:color-mix(in srgb,var(--pc) 7%,var(--card))}
.sp-cluster.excl{border:1.5px dashed var(--line);background:var(--bg-soft);opacity:.75}
.sp-cluster-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.sp-cluster-label{font-size:12px;font-weight:800;color:var(--text)}
.sp-cluster-label.muted{color:var(--text-mute)}
.sp-cluster-range{font-size:11px;color:var(--text-mute);font-variant-numeric:tabular-nums}
.sp-tiles{display:flex;flex-wrap:wrap;gap:4px}
.sp-pg{
  width:32px;height:44px;border-radius:5px;border:1.5px solid var(--line-soft);
  background:var(--card);display:flex;align-items:flex-end;justify-content:center;
  font-size:10px;font-weight:700;color:var(--text-dim);font-variant-numeric:tabular-nums;
  padding-bottom:3px;flex:none;
}
.sp-cluster.incl .sp-pg{border-color:color-mix(in srgb,var(--pc) 60%,var(--line-soft));color:var(--text)}
.sp-cluster.excl .sp-pg{border-style:dashed;background:var(--bg-soft);opacity:.7}

.sp-cut{flex:0 0 auto;align-self:stretch;width:14px;position:relative;min-height:44px}
.sp-cut::before{content:"";position:absolute;inset-block:4px;inset-inline-start:50%;
  border-inline-start:2px dashed var(--brand-text);transform:translateX(-50%)}
.sp-cut::after{content:"";position:absolute;inset-inline-start:50%;top:50%;
  width:7px;height:7px;border-radius:50%;background:var(--brand-text);transform:translate(-50%,-50%)}
`;

// สีหมุนเวียนให้แต่ละไฟล์ผลลัพธ์ — ใช้โทนสีหมวดที่ผ่าน WCAG AA ทั้งสองธีมแล้วเท่านั้น (ไม่มีค่าสีดิบ)
const PALETTE = ["--brand", "--g-img", "--g-doc", "--g-ppt", "--g-data", "--g-thai", "--brand-2"];
const paletteVar = (gi) => PALETTE[gi % PALETTE.length];

const MAX_TILES = 400;     // เกินนี้เลิกวาดทีละหน้า กันจอค้างกับไฟล์หน้าเยอะมาก
const SUMMARY_CAP = 150;   // เกินนี้ตัดรายการในแผงขวา

export function mount(tool) {
  const st = statusBar();
  const results = el("div", { class: "results" });
  let file = null;
  let cache = null;      // { file, doc, encrypted, total } — กันโหลดไฟล์ซ้ำตอนกดแยกจริง
  let loading = false;
  let loadError = null;

  const dz = dropzone({
    accept: "application/pdf,.pdf", multiple: false,
    hint: tr("ครั้งละ 1 ไฟล์", "One file at a time"),
    expect: ["pdf"], expectLabel: tr("ไฟล์ PDF", "PDF files"),
    onChange: (f) => {
      file = f[0] || null;
      cache = null; loadError = null; loading = false;
      results.innerHTML = ""; st.clear();
      if (file) loadFile(); else updateAll();
    },
  });

  const infoBox = el("div", {});
  const leftNode = el("div", { class: "sp-left" }, [dz.container, infoBox]);

  // ── แผงขวา: โหมดแยก + ช่องกรอก + สรุปว่าจะได้กี่ไฟล์ ─────────────────────
  const modeSeg = segmented([["range", tr("ตามช่วงหน้า", "By page range")], ["every", tr("ทุก N หน้า", "Every N pages")], ["each", tr("ทีละหน้า", "One page each")]], "range");
  const rangeInput = el("input", { type: "text", placeholder: tr("เช่น 1-3,5,8-", "e.g. 1-3,5,8-"), value: "1-" });
  const everyInput = el("input", { type: "number", min: "1", value: "1" });
  const fRange = field(tr("ช่วงหน้าที่ต้องการ", "Page range"), rangeInput, tr("ใช้ - สำหรับช่วง และ , คั่นหลายช่วง เช่น 1-3,7,10-", "Use - for a range and , to separate ranges, e.g. 1-3,7,10-"));
  const fEvery = field(tr("แยกทุกกี่หน้า", "Split every N pages"), everyInput, tr("เช่น 2 = ได้ไฟล์ละ 2 หน้า", "e.g. 2 = each file gets 2 pages"));
  fEvery.style.display = "none";

  const summaryCount = el("div", { class: "sp-count" }, tr("เลือกไฟล์ก่อนเพื่อดูตัวอย่าง", "Choose a file first to preview"));
  const summaryList = el("div", { class: "sp-sumlist" });
  const rightNode = el("div", { class: "sp-right" }, [
    field(tr("รูปแบบการแยก", "Split mode"), modeSeg, tr("เลือกวิธีแบ่งไฟล์ — แผนผังตรงกลางจะไฮไลต์ใหม่ทันที", "Choose how to split the file — the diagram in the middle updates right away")),
    fRange, fEvery,
    summaryCount, summaryList,
  ]);

  const toolbarStatus = el("div", { class: "sp-toolbar-status" }, tr("ยังไม่มีไฟล์", "No file yet"));

  const centerNode = el("div", {});
  const go = button(tr("แยกไฟล์", "Split file"), { onclick: run });
  go.disabled = true;

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์ต้นฉบับ", "Source file"), node: leftNode, hint: tr("รองรับไฟล์เดียวต่อครั้ง", "One file supported at a time") },
    center: { title: tr("แผนผังหน้า", "Page layout"), node: centerNode, empty: tr("ยังไม่มีไฟล์ — เลือกไฟล์ PDF ก่อนเพื่อดูว่าจะตัดตรงไหน", "No file yet — choose a PDF file to see where it will be cut") },
    right: { title: tr("ตั้งค่าการแยก", "Split settings"), node: rightNode },
    toolbar: [toolbarStatus],
    footer: [st.node, go],
  });
  ws.wrap.prepend(el("style", {}, STYLE));
  ws.body.append(results, el("div", { class: "note" },
    tr("พรีวิวแสดงเป็นกรอบเลขหน้าจำลอง (ไม่ใช่ภาพหน้าเอกสารจริง) เพื่อความเร็ว แต่กลุ่มสี รอยตัด และชื่อไฟล์ตรงกับผลลัพธ์จริงทุกประการ",
       "The preview shows simple page-number tiles (not real page images) for speed, but the color groups, cuts, and file names exactly match the real result")));
  ws.showCanvas(false);

  modeSeg.addEventListener("change", () => {
    fRange.style.display = modeSeg.value === "range" ? "" : "none";
    fEvery.style.display = modeSeg.value === "every" ? "" : "none";
    updateAll();
  });
  rangeInput.addEventListener("input", updateAll);
  everyInput.addEventListener("input", updateAll);

  // ── โหลดไฟล์เพื่อรู้จำนวนหน้า (ใช้ pdf-lib ตัวเดียวกับที่จะใช้แยกจริงตอนกด "แยกไฟล์") ──
  async function loadFile() {
    const myFile = file;
    loading = true; loadError = null; cache = null;
    updateAll();
    try {
      const { doc, encrypted } = await loadPdfLib(myFile);
      if (file !== myFile) return; // ผู้ใช้เปลี่ยนไฟล์ระหว่างโหลด — ทิ้งผลเก่า
      cache = { file: myFile, doc, encrypted, total: doc.getPageCount() };
    } catch (e) {
      if (file !== myFile) return;
      loadError = tr("เปิดไฟล์ไม่สำเร็จ: ", "Could not open the file: ") + e.message;
    } finally {
      if (file === myFile) loading = false;
      updateAll();
    }
  }

  // ── ตรรกะเดียวกันทั้งพรีวิวและตอนแยกจริง — กันพรีวิวกับผลลัพธ์ไม่ตรงกัน ──
  function computeGroups(total) {
    if (modeSeg.value === "range") {
      let pages;
      try { pages = parsePages(rangeInput.value, total); }
      catch (e) { return { groups: [], error: e.message }; }
      if (!pages.length) return { groups: [], error: tr(`ช่วงหน้าที่ระบุไม่มีหน้าที่มีอยู่จริง (ไฟล์นี้มี ${total} หน้า)`, `The page range you entered has no pages in this file (it has ${total} pages)`) };
      return { groups: [pages], error: null };
    }
    if (modeSeg.value === "every") {
      const n = Math.max(1, +everyInput.value || 1);
      const groups = [];
      for (let i = 1; i <= total; i += n)
        groups.push(Array.from({ length: Math.min(n, total - i + 1) }, (_, k) => i + k));
      return { groups, error: null };
    }
    return { groups: Array.from({ length: total }, (_, i) => [i + 1]), error: null };
  }

  const labelFor = (pages) => pages.length === 1 ? tr(`หน้า${pages[0]}`, `page${pages[0]}`) : tr(`หน้า${pages[0]}-${pages.at(-1)}`, `page${pages[0]}-${pages.at(-1)}`);
  const nameFor = (base, pages) => `${base}-${labelFor(pages)}.pdf`;

  function buildSegments(total, assign) {
    const segs = [];
    let i = 0;
    while (i < total) {
      const gi = assign[i];
      let j = i;
      while (j < total && assign[j] === gi) j++;
      segs.push({ gi, pages: Array.from({ length: j - i }, (_, k) => i + k + 1) });
      i = j;
    }
    return segs;
  }

  function pageTile(p) {
    return el("div", { class: "sp-pg" }, String(p));
  }
  function fileCluster(seg, meta) {
    const range = seg.pages.length === 1 ? tr(`หน้า ${seg.pages[0]}`, `Page ${seg.pages[0]}`) : tr(`หน้า ${seg.pages[0]}-${seg.pages.at(-1)}`, `Page ${seg.pages[0]}-${seg.pages.at(-1)}`);
    return el("div", { class: "sp-cluster incl", style: `--pc:var(${meta.colorVar})`, title: meta.name }, [
      el("div", { class: "sp-cluster-head" }, [
        el("span", { class: "sp-dot" }),
        el("span", { class: "sp-cluster-label" }, tr(`ไฟล์ ${meta.ordinal}`, `File ${meta.ordinal}`)),
        el("span", { class: "sp-cluster-range" }, tr(`${range} · ${seg.pages.length} หน้า`, `${range} · ${seg.pages.length} pages`)),
      ]),
      el("div", { class: "sp-tiles" }, seg.pages.map(pageTile)),
    ]);
  }
  function excludedCluster(seg) {
    const range = seg.pages.length === 1 ? tr(`หน้า ${seg.pages[0]}`, `Page ${seg.pages[0]}`) : tr(`หน้า ${seg.pages[0]}-${seg.pages.at(-1)}`, `Page ${seg.pages[0]}-${seg.pages.at(-1)}`);
    return el("div", { class: "sp-cluster excl" }, [
      el("div", { class: "sp-cluster-head" }, [
        el("span", { class: "sp-cluster-label muted" }, tr("ไม่รวมในไฟล์ใด", "Not included in any file")),
        el("span", { class: "sp-cluster-range" }, range),
      ]),
      el("div", { class: "sp-tiles" }, seg.pages.map(pageTile)),
    ]);
  }
  function cutConnector() {
    return el("div", { class: "sp-cut", "aria-hidden": "true" });
  }

  // ── วาดใหม่ทั้งสามแผงทุกครั้งที่ไฟล์/โหมด/ช่วงหน้าเปลี่ยน ──
  function updateAll() {
    const total = cache ? cache.total : null;
    let groups = [], error = null;
    if (file && !loadError && !loading && total != null) {
      const r = computeGroups(total);
      groups = r.groups; error = r.error;
    }
    renderLeft(total);
    renderCenter(total, groups, error);
    renderRight(total, groups, error);
    renderToolbar(groups, error);
    go.disabled = !file || loading || !!loadError || !!error || total == null || groups.length === 0;
  }

  function renderLeft(total) {
    infoBox.innerHTML = "";
    if (!file) return;
    if (loadError) { infoBox.appendChild(el("div", { class: "status show err" }, loadError)); return; }
    if (loading || total == null) {
      infoBox.appendChild(el("div", { class: "kv" }, tr("กำลังอ่านไฟล์…", "Reading file…")));
      return;
    }
    infoBox.appendChild(el("div", { class: "kv" }, [
      el("span", {}, [tr("จำนวนหน้า ", "Pages "), el("b", {}, String(total)), tr(" หน้า", "")]),
      el("span", {}, [tr("ขนาดไฟล์ ", "File size "), el("b", {}, fmtBytes(file.size))]),
    ]));
    if (cache && cache.encrypted)
      infoBox.appendChild(el("div", { class: "status show info" }, tr("ไฟล์นี้ถูกล็อกด้วยรหัสผ่าน ระบบจะพยายามอ่านต่อให้", "This file is password-protected — we will try to read it anyway")));
  }

  function renderCenter(total, groups, error) {
    centerNode.innerHTML = "";
    if (!file) { ws.showCanvas(false); return; }
    ws.showCanvas(true);
    if (loadError) { centerNode.appendChild(el("div", { class: "status show err" }, loadError)); return; }
    if (loading || total == null) {
      centerNode.appendChild(el("div", { class: "loading" }, [el("div", { class: "spinner" }), el("div", {}, tr("กำลังวิเคราะห์ไฟล์…", "Analyzing file…"))]));
      return;
    }
    if (error) { centerNode.appendChild(el("div", { class: "status show err" }, error)); return; }
    if (total > MAX_TILES) {
      centerNode.appendChild(el("div", { class: "status show info" },
        tr(`ไฟล์นี้มี ${total} หน้า มากเกินกว่าจะแสดงแผนผังทีละหน้าได้ลื่นไหล — ดูรายชื่อไฟล์ที่จะได้ในแผงขวาแทน`,
           `This file has ${total} pages — too many to show a smooth page-by-page diagram. See the file list on the right instead`)));
      return;
    }
    const base = stripExt(file.name);
    const groupMeta = groups.map((pages, gi) => ({ pages, name: nameFor(base, pages), colorVar: paletteVar(gi), ordinal: gi + 1 }));
    const assign = new Array(total).fill(-1);
    groups.forEach((pages, gi) => pages.forEach((p) => { assign[p - 1] = gi; }));
    const segs = buildSegments(total, assign);
    const track = el("div", { class: "sp-track" });
    segs.forEach((seg, i) => {
      if (i > 0 && segs[i - 1].gi !== -1 && seg.gi !== -1) track.appendChild(cutConnector());
      track.appendChild(seg.gi === -1 ? excludedCluster(seg) : fileCluster(seg, groupMeta[seg.gi]));
    });
    centerNode.appendChild(track);
  }

  function renderRight(total, groups, error) {
    summaryCount.className = "sp-count";
    if (!file) summaryCount.textContent = tr("เลือกไฟล์ก่อนเพื่อดูตัวอย่าง", "Choose a file first to preview");
    else if (loadError) { summaryCount.textContent = loadError; summaryCount.classList.add("err"); }
    else if (loading || total == null) summaryCount.textContent = tr("กำลังวิเคราะห์ไฟล์…", "Analyzing file…");
    else if (error) { summaryCount.textContent = error; summaryCount.classList.add("err"); }
    else summaryCount.textContent = tr(`จะได้ ${groups.length} ไฟล์`, `Will produce ${groups.length} files`);

    summaryList.innerHTML = "";
    if (file && !loadError && !loading && total != null && !error && groups.length) {
      const base = stripExt(file.name);
      const capped = groups.slice(0, SUMMARY_CAP);
      capped.forEach((pages, gi) => {
        summaryList.appendChild(el("div", { class: "sp-sumrow" }, [
          el("span", { class: "sp-dot", style: `--pc:var(${paletteVar(gi)})` }),
          el("span", { class: "sp-sumrow-name" }, nameFor(base, pages)),
          el("span", { class: "sp-sumrow-n" }, tr(`${pages.length} หน้า`, `${pages.length} pages`)),
        ]));
      });
      if (groups.length > capped.length)
        summaryList.appendChild(el("div", { class: "sp-more" }, tr(`และอีก ${groups.length - capped.length} ไฟล์`, `and ${groups.length - capped.length} more files`)));
    }
  }

  function renderToolbar(groups, error) {
    toolbarStatus.className = "sp-toolbar-status";
    if (!file) toolbarStatus.textContent = tr("ยังไม่มีไฟล์", "No file yet");
    else if (loadError) { toolbarStatus.textContent = loadError; toolbarStatus.classList.add("err"); }
    else if (loading) toolbarStatus.textContent = tr("กำลังวิเคราะห์ไฟล์…", "Analyzing file…");
    else if (error) { toolbarStatus.textContent = error; toolbarStatus.classList.add("err"); }
    else toolbarStatus.textContent = tr(`จะได้ ${groups.length} ไฟล์`, `Will produce ${groups.length} files`);
  }

  async function run() {
    if (!file) return st.err(tr("กรุณาเลือกไฟล์ PDF ก่อน", "Please choose a PDF file first"));
    results.innerHTML = "";
    go.disabled = true;
    ws.setBusy(true);
    st.info(tr("กำลังแยกไฟล์…", "Splitting file…"));
    try {
      const { PDFDocument } = PDFLib;
      let src, encrypted;
      if (cache && cache.file === file) { src = cache.doc; encrypted = cache.encrypted; }
      else { const loaded = await loadPdfLib(file); src = loaded.doc; encrypted = loaded.encrypted; }
      const total = src.getPageCount();
      const { groups, error } = computeGroups(total);
      if (error) throw new Error(error);

      const base = stripExt(file.name);
      const made = [];
      for (let g = 0; g < groups.length; g++) {
        const out = await PDFDocument.create();
        const copied = await out.copyPages(src, groups[g].map((p) => p - 1));
        copied.forEach((p) => out.addPage(p));
        const blob = new Blob([await out.save()], { type: "application/pdf" });
        made.push({ name: nameFor(base, groups[g]), blob, count: groups[g].length });
        st.progress(((g + 1) / groups.length) * 100, `(${g + 1}/${groups.length})`);
        await yieldToBrowser();
      }

      st.progress(null);
      st.ok(tr(`แยกได้ ${made.length} ไฟล์`, `Done — ${made.length} files`));
      if (encrypted) results.appendChild(el("div", { class: "status show err" }, ENCRYPTED_WARNING));
      made.forEach((m) => results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, m.name), el("small", {}, tr(`${m.count} หน้า`, `${m.count} pages`))]),
        el("span", { class: "r-size" }, fmtBytes(m.blob.size)),
        button("", { icon: "download", label: tr("ดาวน์โหลด", "Download"), onclick: () => download(m.blob, m.name) }),
      ])));

      if (made.length > 1) {
        results.prepend(el("div", { class: "actions" }, [
          button(tr("ดาวน์โหลดทั้งหมดเป็น ZIP", "Download all as ZIP"), { icon: "zip",
            onclick: async () => {
              st.info(tr("กำลังบีบเป็น ZIP…", "Zipping…"));
              const zip = new JSZip();
              made.forEach((m) => zip.file(m.name, m.blob));
              download(await zip.generateAsync({ type: "blob" }), base + tr("-แยกไฟล์.zip", "-split.zip"));
              st.ok(tr("ดาวน์โหลด ZIP แล้ว", "ZIP downloaded"));
            },
          }),
        ]));
      }
    } catch (e) {
      st.progress(null);
      st.err(tr("แยกไฟล์ไม่สำเร็จ: ", "Could not split the file: ") + e.message);
    } finally {
      go.disabled = false;
      ws.setBusy(false);
    }
  }

  updateAll();
  return ws.wrap;
}
