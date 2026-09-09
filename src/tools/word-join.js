import { el, dropzone, toolShell, statusBar, button, field, select, downloadButton,
         stripExt, fmtBytes } from "../ui.js";
import { joinDocx } from "../docxjoin.js";
import { inspect as inspectDocx, clean as cleanDocx } from "../docxclean.js";
import { tr } from "../i18n.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  let files = [];

  const dz = dropzone({
    expect: ["docx"], expectLabel: tr("ไฟล์ Word (.docx)", "Word files (.docx)"),
    accept: ".docx", multiple: true, reorder: true,
    hint: tr("ลากแถวเพื่อจัดลำดับ", "Drag rows to reorder"),
    onChange: (f) => { files = f; st.clear(); results.innerHTML = ""; refresh(); },
  });

  const brk = select([["yes", tr("ขึ้นหน้าใหม่ทุกไฟล์", "Start a new page for each file")],
    ["no", tr("ต่อกันไปเลย ไม่ขึ้นหน้าใหม่", "Continue without a page break")]], "yes");
  // ‼️ ค่าเริ่มต้น = เก็บคอมเมนต์ไว้ (คนรวมไฟล์ Word ส่วนใหญ่ยังทำงาน/รีวิวกันต่ออยู่ ไม่ใช่
  // ตอนส่งออกไฟล์สุดท้าย) ผู้ใช้กดเลือกลบเองได้ถ้าต้องการไฟล์ที่สะอาดสำหรับส่งออก
  const keepComments = el("input", { type: "checkbox", checked: true });
  const go = button(tr("รวมไฟล์", "Merge files"), { onclick: run });
  go.disabled = true;

  body.append(dz.container,
    el("div", { class: "row" }, [field(tr("การขึ้นหน้า", "Page breaks"), brk)]),
    el("label", { class: "clean-check" }, [keepComments, el("span", {}, tr("เก็บคอมเมนต์จากไฟล์ต้นฉบับไว้ (ถ้ามี)", "Keep comments from the source files (if any)"))]),
    el("div", { class: "actions" }, [go]), st.node, results);

  body.appendChild(el("div", { class: "note" },
    tr("ไฟล์แรกกำหนดฟอนต์และหน้ากระดาษ ไฟล์อื่นต่อท้ายโดยไม่รวมหัว-ท้ายกระดาษ",
    "First file sets fonts and page setup; others append without headers/footers")));

  const refresh = () => { go.disabled = files.length < 2; };

  async function run() {
    results.innerHTML = "";
    go.disabled = true;
    st.info(tr("กำลังรวมไฟล์…", "Merging files…"));
    try {
      const { blob: rawBlob, parts } = await joinDocx(files, {
        pageBreak: brk.value === "yes",
        onProgress: ({ done, total }) => st.progress((done / total) * 100, `(${done}/${total})`),
      });

      // ‼️ ต้องเจอ "ก่อน" ล้าง ไม่งั้นถ้าผู้ใช้สั่งลบคอมเมนต์ทิ้ง จำนวนที่บอกจะเป็น 0 เสมอ
      const before = await inspectDocx(rawBlob);
      // ล้างชื่อผู้เขียน/ผู้แก้ไขล่าสุด/บริษัทของไฟล์ต้นฉบับเสมอ (ยิงจริง 09/09/2026: ไฟล์รวม
      // แล้วชื่อคนแรกยังติดไปเต็ม ๆ) ส่วนคอมเมนต์ลบตามที่ผู้ใช้เลือกเท่านั้น ไม่ใช้ track-changes
      // ที่นี่ (ยังไม่เคาะ — เจ้าของโปรดักต์จะถามพี่ปอนด์เอง) ใช้ตัวล้างจาก docxclean.js ตัวเดียวกับ word-clean
      const { blob } = await cleanDocx(rawBlob, {
        comments: !keepComments.checked, trackChanges: false, metadata: true, rsid: false,
      });

      st.progress(null);
      const total = parts.reduce((a, p) => a + p.paragraphs, 0);
      st.ok(tr(`รวมเสร็จ ${parts.length} ไฟล์, ${total.toLocaleString("th-TH")} ย่อหน้า`,
        `Done, ${parts.length} files, ${total.toLocaleString("en-US")} paragraphs`)
        + (before.comments
          ? (keepComments.checked
            ? tr(` (มีคอมเมนต์จากไฟล์ต้นฉบับ ${before.comments} รายการ ยังคงอยู่ในไฟล์ที่ได้)`,
                 ` (${before.comments} comment(s) from the source files, kept in the result)`)
            : tr(` (มีคอมเมนต์จากไฟล์ต้นฉบับ ${before.comments} รายการ ถูกลบออกจากไฟล์ที่ได้แล้ว)`,
                 ` (${before.comments} comment(s) from the source files, removed from the result)`))
          : ""));

      const name = stripExt(files[0].name) + tr("-รวม.docx", "-merged.docx");
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name),
          el("small", {}, parts.map((p) => tr(`${p.name} (${p.paragraphs} ย่อหน้า)`, `${p.name} (${p.paragraphs} paragraphs)`)).join(", "))]),
        el("span", { class: "r-size" }, fmtBytes(blob.size)),
        downloadButton(blob, name),
      ]));
    } catch (e) {
      st.progress(null);
      st.err(tr("รวมไฟล์ไม่สำเร็จ: ", "Could not merge files: ") + e.message);
    } finally { refresh(); }
  }
  return wrap;
}
