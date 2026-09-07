import { el, dropzone, toolShell, statusBar, button, download, stripExt, fmtBytes, yieldToBrowser, eachFile, failedBox } from "../ui.js";
import { inspect, clean } from "../docxclean.js";
import { loadLibs } from "../loader.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const reportBox = el("div", {});
  const results = el("div", { class: "results" });
  let files = [], reports = [];

  const dz = dropzone({
    expect: ["docx"], expectLabel: "ไฟล์ Word (.docx)",
    accept: ".docx", multiple: true,
    hint: "เลือกได้หลายไฟล์ · ระบบจะตรวจให้ก่อน ยังไม่แก้อะไรจนกว่าจะกดล้าง",
    onChange: async (f) => { files = f; await scan(); },
  });

  const opts = {
    comments: checkbox("ลบคอมเมนต์ทั้งหมด", true),
    trackChanges: checkbox("ยอมรับการแก้ไขที่ค้างอยู่ (ข้อความที่เพิ่มคงไว้ ที่ลบให้หายจริง)", true),
    metadata: checkbox("ล้างชื่อผู้เขียน ผู้แก้ไขล่าสุด บริษัท และเวลาที่ใช้ทำ", true),
    rsid: checkbox("ลบรหัสรอบการบันทึกที่บอกได้ว่าใครแก้ช่วงไหน", true),
  };
  const go = button("🧹 ล้างแล้วดาวน์โหลด", { onclick: run });
  go.disabled = true;

  body.append(dz.container, reportBox,
    el("div", { class: "clean-opts" }, [
      el("p", { class: "mm-label" }, "เลือกสิ่งที่ต้องการล้าง"),
      ...Object.values(opts).map((o) => o.node),
    ]),
    el("div", { class: "actions" }, [go]), st.node, results);

  body.appendChild(el("div", { class: "note" },
    "เอกสารที่ผ่านการรีวิวหลายรอบมักพกของที่ไม่ควรออกไปด้วย — คอมเมนต์ภายใน ประวัติการแก้ไขที่ยังไม่ยอมรับ " +
    "ชื่อคนที่แก้ ชื่อบริษัท และเวลาที่ใช้ทำงาน ของพวกนี้มองไม่เห็นบนหน้าจอถ้าไม่เปิดโหมดรีวิว แต่ผู้รับเปิดดูได้ทั้งหมด · " +
    "‼️ ไฟล์ต้นฉบับในเครื่องคุณไม่ถูกแก้ไข ระบบสร้างไฟล์ใหม่ให้ดาวน์โหลดเท่านั้น"));

  function checkbox(label, checked) {
    const input = el("input", { type: "checkbox", checked: checked || null });
    return { input, node: el("label", { class: "clean-check" }, [input, el("span", { text: label })]) };
  }

  async function scan() {
    reportBox.innerHTML = ""; results.innerHTML = ""; reports = [];
    if (!files.length) { go.disabled = true; st.clear(); return; }
    st.info("กำลังตรวจไฟล์…");
    try {
      const scanFailed = await eachFile(files, null, async (f) => {
        reports.push({ file: f, report: await inspect(f) });
      });
      if (!reports.length) throw new Error("เปิดไฟล์ไม่ได้สักไฟล์ — ตรวจว่าเป็น .docx จริงหรือไม่");
      st.clear();
      renderReport();
      if (scanFailed.length) reportBox.appendChild(failedBox(scanFailed));
      go.disabled = false;
    } catch (e) {
      st.err("ตรวจไฟล์ไม่สำเร็จ: " + e.message);
    }
  }

  function renderReport() {
    const dirty = reports.filter((r) => r.report.anything).length;
    reportBox.append(el("div", { class: "status show " + (dirty ? "err" : "ok") },
      dirty
        ? `พบร่องรอยที่ควรล้างใน ${dirty} จาก ${reports.length} ไฟล์`
        : `ตรวจแล้ว ${reports.length} ไฟล์ — ไม่พบคอมเมนต์ ประวัติแก้ไข หรือชื่อผู้เขียนที่ติดมา`));

    reports.forEach(({ file, report: r }) => {
      const items = [];
      const add = (cond, text, level = "warn") => { if (cond) items.push({ text, level }); };
      add(r.comments > 0, `คอมเมนต์ ${r.comments} อัน` +
        (r.commentAuthors.length ? ` (จาก ${r.commentAuthors.join(", ")})` : ""), "bad");
      add(r.inserted > 0 || r.deleted > 0,
        `ประวัติการแก้ไขที่ยังไม่ยอมรับ — เพิ่ม ${r.inserted} จุด ลบ ${r.deleted} จุด`, "bad");
      add(r.formatChanges > 0, `การเปลี่ยนรูปแบบที่ยังไม่ยอมรับ ${r.formatChanges} จุด`);
      add(!!r.author, `ผู้เขียน: ${r.author}`);
      add(!!r.lastModifiedBy, `แก้ไขล่าสุดโดย: ${r.lastModifiedBy}`);
      add(!!r.company, `บริษัท: ${r.company}`);
      add(!!r.manager, `ผู้จัดการ: ${r.manager}`);
      add(!!r.totalTime && r.totalTime !== "0", `เวลาที่ใช้ทำเอกสาร: ${r.totalTime} นาที`);
      add(!!r.revision && r.revision !== "1", `บันทึกมาแล้ว ${r.revision} รอบ`);
      add(r.rsid > 0, `รหัสรอบการบันทึก ${r.rsid} ชุด`);

      reportBox.appendChild(el("div", { class: "clean-card" }, [
        el("div", { class: "clean-head" }, [
          el("strong", { text: file.name }),
          el("span", { class: "r-size", text: fmtBytes(file.size) }),
        ]),
        items.length
          ? el("ul", { class: "clean-list" }, items.map((i) =>
              el("li", { class: i.level === "bad" ? "bad" : "", text: i.text })))
          : el("p", { class: "clean-ok" }, "ไม่พบร่องรอยที่ต้องล้าง"),
      ]));
    });
  }

  async function run() {
    results.innerHTML = "";
    go.disabled = true;
    st.info("กำลังล้าง…");
    try {
      const options = Object.fromEntries(Object.entries(opts).map(([k, v]) => [k, v.input.checked]));
      const made = [];
      const failed = await eachFile(files, st, async (f) => {
        const { blob } = await clean(f, options);
        made.push({ name: `${stripExt(f.name)}-สะอาด.docx`, blob, from: f.size });
      });
      st.progress(null);
      if (!made.length) throw new Error("ล้างไม่สำเร็จสักไฟล์");
      if (failed.length) results.appendChild(failedBox(failed));
      st.ok(`ล้างเสร็จ ${made.length} ไฟล์${failed.length ? ` · ข้าม ${failed.length}` : ""} — ตรวจผลได้จากการอัปโหลดไฟล์ที่ล้างแล้วกลับเข้ามาใหม่`);

      if (made.length > 1) results.appendChild(el("div", { class: "actions" }, [
        button("ดาวน์โหลดทั้งหมดเป็น ZIP", { icon: "zip",  onclick: async () => {
          const [JSZipLib] = await loadLibs("jszip");
          const zip = new JSZipLib();
          made.forEach((m) => zip.file(m.name, m.blob));
          download(await zip.generateAsync({ type: "blob" }), "เอกสารที่ล้างแล้ว.zip");
        } }),
      ]));
      made.forEach((m) => results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, m.name),
          el("small", {}, `${fmtBytes(m.from)} → ${fmtBytes(m.blob.size)}`)]),
        button("", { icon: "download", label: "ดาวน์โหลด",  onclick: () => download(m.blob, m.name) }),
      ])));
    } catch (e) {
      st.progress(null);
      st.err("ล้างไม่สำเร็จ: " + e.message);
    } finally { go.disabled = false; }
  }
  return wrap;
}
