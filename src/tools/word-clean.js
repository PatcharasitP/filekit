import { el, dropzone, toolShell, statusBar, button, download, stripExt, fmtBytes, yieldToBrowser, eachFile, failedBox } from "../ui.js";
import { inspect, clean } from "../docxclean.js";
import { loadLibs } from "../loader.js";
import { tr } from "../i18n.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const reportBox = el("div", {});
  const results = el("div", { class: "results" });
  let files = [], reports = [];

  const dz = dropzone({
    expect: ["docx"], expectLabel: tr("ไฟล์ Word (.docx)", "Word files (.docx)"),
    accept: ".docx", multiple: true,
    hint: tr("ตรวจก่อน ยังไม่แก้จนกว่าจะกดล้าง", "We scan first. Nothing changes until you click Clean"),
    onChange: async (f) => { files = f; await scan(); },
  });

  const opts = {
    comments: checkbox(tr("ลบคอมเมนต์ทั้งหมด", "Remove all comments"), true),
    trackChanges: checkbox(tr("ยอมรับแก้ไขค้าง (เก็บเพิ่ม ลบที่ลบ)", "Accept tracked changes (keep insertions, remove deletions)"), true),
    metadata: checkbox(tr("ล้างชื่อผู้เขียน บริษัท และเวลาที่ใช้ทำ", "Clear author, company, and time spent"), true),
    rsid: checkbox(tr("ลบรหัสรอบบันทึก (ระบุผู้แก้ไขได้)", "Remove save-session IDs (identifies editors)"), true),
  };
  const go = button(tr("ล้าง", "Clean"), { onclick: run });
  go.disabled = true;

  body.append(dz.container, reportBox,
    el("div", { class: "clean-opts" }, [
      el("p", { class: "mm-label" }, tr("เลือกสิ่งที่ต้องการล้าง", "Choose what to clean")),
      ...Object.values(opts).map((o) => o.node),
    ]),
    el("div", { class: "actions" }, [go]), st.node, results);

  body.appendChild(el("div", { class: "note" },
    tr("ล้างคอมเมนต์ ประวัติแก้ไข ชื่อผู้เขียน ไฟล์ต้นฉบับไม่ถูกแก้ไข สร้างไฟล์ใหม่แทน",
    "Removes comments, edit history, author info. Your original file is untouched, a new one is created")));

  function checkbox(label, checked) {
    const input = el("input", { type: "checkbox", checked: checked || null });
    return { input, node: el("label", { class: "clean-check" }, [input, el("span", { text: label })]) };
  }

  async function scan() {
    reportBox.innerHTML = ""; results.innerHTML = ""; reports = [];
    if (!files.length) { go.disabled = true; st.clear(); return; }
    st.info(tr("กำลังตรวจไฟล์…", "Scanning files…"));
    try {
      const scanFailed = await eachFile(files, null, async (f) => {
        reports.push({ file: f, report: await inspect(f) });
      });
      if (!reports.length) throw new Error(tr("เปิดไฟล์ไม่ได้ ตรวจว่าเป็น .docx จริง", "Could not open. Check they're valid .docx files."));
      st.clear();
      renderReport();
      if (scanFailed.length) reportBox.appendChild(failedBox(scanFailed));
      go.disabled = false;
    } catch (e) {
      st.err(tr("ตรวจไฟล์ไม่สำเร็จ: ", "Scan failed: ") + e.message);
    }
  }

  function renderReport() {
    const dirty = reports.filter((r) => r.report.anything).length;
    // ‼️ ผลตรวจโผล่มาเองหลังอ่านไฟล์เสร็จ ต้องประกาศให้โปรแกรมอ่านหน้าจอได้ยินด้วย
    //    ไม่ใช่แค่โชว์ให้ตาเห็น (แถบสถานะอีกก้อนมี role นี้อยู่แล้ว ก้อนนี้เคยไม่มี)
    reportBox.append(el("div", { class: "status show " + (dirty ? "err" : "ok"), role: "status", "aria-live": "polite" },
      dirty
        ? tr(`พบร่องรอยที่ควรล้างใน ${dirty} จาก ${reports.length} ไฟล์`, `Found traces to clean in ${dirty} of ${reports.length} files`)
        : tr(`ตรวจแล้ว ${reports.length} ไฟล์ ไม่พบร่องรอยที่ต้องล้าง`, `Checked ${reports.length} files, nothing to clean`)));

    reports.forEach(({ file, report: r }) => {
      const items = [];
      const add = (cond, text, level = "warn") => { if (cond) items.push({ text, level }); };
      add(r.comments > 0, tr(`คอมเมนต์ ${r.comments} อัน` +
        (r.commentAuthors.length ? ` (จาก ${r.commentAuthors.join(", ")})` : ""),
        `${r.comments} comment${r.comments === 1 ? "" : "s"}` +
        (r.commentAuthors.length ? ` (from ${r.commentAuthors.join(", ")})` : "")), "bad");
      add(r.inserted > 0 || r.deleted > 0,
        tr(`ประวัติการแก้ไขที่ยังไม่ยอมรับ: เพิ่ม ${r.inserted} จุด ลบ ${r.deleted} จุด`,
           `Pending tracked changes: ${r.inserted} insertions, ${r.deleted} deletions`), "bad");
      add(r.formatChanges > 0, tr(`การเปลี่ยนรูปแบบที่ยังไม่ยอมรับ ${r.formatChanges} จุด`, `${r.formatChanges} pending formatting changes`));
      add(!!r.author, tr(`ผู้เขียน: ${r.author}`, `Author: ${r.author}`));
      add(!!r.lastModifiedBy, tr(`แก้ไขล่าสุดโดย: ${r.lastModifiedBy}`, `Last modified by: ${r.lastModifiedBy}`));
      add(!!r.company, tr(`บริษัท: ${r.company}`, `Company: ${r.company}`));
      add(!!r.manager, tr(`ผู้จัดการ: ${r.manager}`, `Manager: ${r.manager}`));
      add(!!r.totalTime && r.totalTime !== "0", tr(`เวลาที่ใช้ทำเอกสาร: ${r.totalTime} นาที`, `Time spent: ${r.totalTime} minutes`));
      add(!!r.revision && r.revision !== "1", tr(`บันทึกมาแล้ว ${r.revision} รอบ`, `Saved ${r.revision} times`));
      add(r.rsid > 0, tr(`รหัสรอบการบันทึก ${r.rsid} ชุด`, `${r.rsid} save-session IDs`));

      reportBox.appendChild(el("div", { class: "clean-card" }, [
        el("div", { class: "clean-head" }, [
          el("strong", { text: file.name }),
          el("span", { class: "r-size", text: fmtBytes(file.size) }),
        ]),
        items.length
          ? el("ul", { class: "clean-list" }, items.map((i) =>
              el("li", { class: i.level === "bad" ? "bad" : "", text: i.text })))
          : el("p", { class: "clean-ok" }, tr("ไม่พบร่องรอยที่ต้องล้าง", "No traces found to clean")),
      ]));
    });
  }

  async function run() {
    results.innerHTML = "";
    go.disabled = true;
    st.info(tr("กำลังล้าง…", "Cleaning…"));
    try {
      const options = Object.fromEntries(Object.entries(opts).map(([k, v]) => [k, v.input.checked]));
      const made = [];
      const failed = await eachFile(files, st, async (f) => {
        const { blob } = await clean(f, options);
        made.push({ name: tr(`${stripExt(f.name)}-สะอาด.docx`, `${stripExt(f.name)}-cleaned.docx`), blob, from: f.size });
      });
      st.progress(null);
      if (!made.length) throw new Error(tr("ล้างไม่สำเร็จสักไฟล์", "Could not clean any file"));
      if (failed.length) results.appendChild(failedBox(failed));
      st.ok(tr(`ล้างเสร็จ ${made.length} ไฟล์${failed.length ? `, ข้าม ${failed.length}` : ""}`,
        `Done, cleaned ${made.length} files${failed.length ? `, skipped ${failed.length}` : ""}`));

      if (made.length > 1) results.appendChild(el("div", { class: "actions" }, [
        button(tr("โหลดทั้งหมด (ZIP)", "Download all (ZIP)"), { icon: "zip",  onclick: async () => {
          const [JSZipLib] = await loadLibs("jszip");
          const zip = new JSZipLib();
          made.forEach((m) => zip.file(m.name, m.blob));
          download(await zip.generateAsync({ type: "blob" }), tr("เอกสารที่ล้างแล้ว.zip", "cleaned-documents.zip"));
        } }),
      ]));
      made.forEach((m) => results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, m.name),
          el("small", {}, `${fmtBytes(m.from)} → ${fmtBytes(m.blob.size)}`)]),
        button(tr("ดาวน์โหลด", "Download"), { icon: "download", label: tr("ดาวน์โหลด", "Download"),  onclick: () => download(m.blob, m.name) }),
      ])));
    } catch (e) {
      st.progress(null);
      st.err(tr("ล้างไม่สำเร็จ: ", "Could not clean: ") + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
