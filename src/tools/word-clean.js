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
    hint: tr("เลือกได้หลายไฟล์ · ระบบจะตรวจให้ก่อน ยังไม่แก้อะไรจนกว่าจะกดล้าง", "Choose multiple files · we'll scan first — nothing changes until you click Clean"),
    onChange: async (f) => { files = f; await scan(); },
  });

  const opts = {
    comments: checkbox(tr("ลบคอมเมนต์ทั้งหมด", "Remove all comments"), true),
    trackChanges: checkbox(tr("ยอมรับการแก้ไขที่ค้างอยู่ (ข้อความที่เพิ่มคงไว้ ที่ลบให้หายจริง)", "Accept pending tracked changes (keep inserted text, actually remove deleted text)"), true),
    metadata: checkbox(tr("ล้างชื่อผู้เขียน ผู้แก้ไขล่าสุด บริษัท และเวลาที่ใช้ทำ", "Clear author, last-modified-by, company, and time spent"), true),
    rsid: checkbox(tr("ลบรหัสรอบการบันทึกที่บอกได้ว่าใครแก้ช่วงไหน", "Remove save-session IDs that reveal who edited what and when"), true),
  };
  const go = button(tr("ล้างแล้วดาวน์โหลด", "Clean and download"), { onclick: run });
  go.disabled = true;

  body.append(dz.container, reportBox,
    el("div", { class: "clean-opts" }, [
      el("p", { class: "mm-label" }, tr("เลือกสิ่งที่ต้องการล้าง", "Choose what to clean")),
      ...Object.values(opts).map((o) => o.node),
    ]),
    el("div", { class: "actions" }, [go]), st.node, results);

  body.appendChild(el("div", { class: "note" },
    tr("เอกสารที่ผ่านการรีวิวหลายรอบมักพกของที่ไม่ควรออกไปด้วย — คอมเมนต์ภายใน ประวัติการแก้ไขที่ยังไม่ยอมรับ " +
    "ชื่อคนที่แก้ ชื่อบริษัท และเวลาที่ใช้ทำงาน ของพวกนี้มองไม่เห็นบนหน้าจอถ้าไม่เปิดโหมดรีวิว แต่ผู้รับเปิดดูได้ทั้งหมด · " +
    "ไฟล์ต้นฉบับในเครื่องคุณไม่ถูกแก้ไข ระบบสร้างไฟล์ใหม่ให้ดาวน์โหลดเท่านั้น",
    "Documents that have gone through several review rounds often carry things that shouldn't leave your desk — internal comments, unaccepted tracked changes, " +
    "the editors' names, company name, and time spent. None of this is visible on screen unless review mode is on, but the recipient can see all of it · " +
    "Your original file on this device is never modified — a new file is created for you to download")));

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
      if (!reports.length) throw new Error(tr("เปิดไฟล์ไม่ได้สักไฟล์ — ตรวจว่าเป็น .docx จริงหรือไม่", "Could not open any file — check that they are valid .docx files"));
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
    reportBox.append(el("div", { class: "status show " + (dirty ? "err" : "ok") },
      dirty
        ? tr(`พบร่องรอยที่ควรล้างใน ${dirty} จาก ${reports.length} ไฟล์`, `Found traces to clean in ${dirty} of ${reports.length} files`)
        : tr(`ตรวจแล้ว ${reports.length} ไฟล์ — ไม่พบคอมเมนต์ ประวัติแก้ไข หรือชื่อผู้เขียนที่ติดมา`, `Checked ${reports.length} files — no comments, tracked changes, or author info found`)));

    reports.forEach(({ file, report: r }) => {
      const items = [];
      const add = (cond, text, level = "warn") => { if (cond) items.push({ text, level }); };
      add(r.comments > 0, tr(`คอมเมนต์ ${r.comments} อัน` +
        (r.commentAuthors.length ? ` (จาก ${r.commentAuthors.join(", ")})` : ""),
        `${r.comments} comment${r.comments === 1 ? "" : "s"}` +
        (r.commentAuthors.length ? ` (from ${r.commentAuthors.join(", ")})` : "")), "bad");
      add(r.inserted > 0 || r.deleted > 0,
        tr(`ประวัติการแก้ไขที่ยังไม่ยอมรับ — เพิ่ม ${r.inserted} จุด ลบ ${r.deleted} จุด`,
           `Pending tracked changes — ${r.inserted} insertions, ${r.deleted} deletions`), "bad");
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
      st.ok(tr(`ล้างเสร็จ ${made.length} ไฟล์${failed.length ? ` · ข้าม ${failed.length}` : ""} — ตรวจผลได้จากการอัปโหลดไฟล์ที่ล้างแล้วกลับเข้ามาใหม่`,
        `Done — cleaned ${made.length} files${failed.length ? `, skipped ${failed.length}` : ""} — check the result by uploading the cleaned file back in`));

      if (made.length > 1) results.appendChild(el("div", { class: "actions" }, [
        button(tr("ดาวน์โหลดทั้งหมดเป็น ZIP", "Download all as ZIP"), { icon: "zip",  onclick: async () => {
          const [JSZipLib] = await loadLibs("jszip");
          const zip = new JSZipLib();
          made.forEach((m) => zip.file(m.name, m.blob));
          download(await zip.generateAsync({ type: "blob" }), tr("เอกสารที่ล้างแล้ว.zip", "cleaned-documents.zip"));
        } }),
      ]));
      made.forEach((m) => results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, m.name),
          el("small", {}, `${fmtBytes(m.from)} → ${fmtBytes(m.blob.size)}`)]),
        button("", { icon: "download", label: tr("ดาวน์โหลด", "Download"),  onclick: () => download(m.blob, m.name) }),
      ])));
    } catch (e) {
      st.progress(null);
      st.err(tr("ล้างไม่สำเร็จ: ", "Could not clean: ") + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
