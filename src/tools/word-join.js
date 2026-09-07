import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, fmtBytes } from "../ui.js";
import { joinDocx } from "../docxjoin.js";
import { tr } from "../i18n.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  let files = [];

  const dz = dropzone({
    expect: ["docx"], expectLabel: tr("ไฟล์ Word (.docx)", "Word files (.docx)"),
    accept: ".docx", multiple: true, reorder: true,
    hint: tr("เลือกหลายไฟล์ · ลากแถวเพื่อจัดลำดับก่อนรวม", "Choose multiple files · drag rows to reorder before merging"),
    onChange: (f) => { files = f; st.clear(); results.innerHTML = ""; refresh(); },
  });

  const brk = select([["yes", tr("ขึ้นหน้าใหม่ทุกไฟล์", "Start a new page for each file")],
    ["no", tr("ต่อกันไปเลย ไม่ขึ้นหน้าใหม่", "Continue without a page break")]], "yes");
  const go = button(tr("รวมเป็นไฟล์เดียว", "Merge into one file"), { onclick: run });
  go.disabled = true;

  body.append(dz.container,
    el("div", { class: "row" }, [field(tr("การขึ้นหน้า", "Page breaks"), brk)]),
    el("div", { class: "actions" }, [go]), st.node, results);

  body.appendChild(el("div", { class: "note" },
    tr("ใช้ไฟล์แรกเป็นแม่แบบของเล่ม — รูปแบบตัวอักษร ระยะขอบ และการตั้งค่าหน้ากระดาษจะยึดตามไฟล์แรก " +
    "ส่วนเนื้อหาของไฟล์ถัดไปถูกนำมาต่อ พร้อมย้ายรูปภาพมาด้วยและออกรหัสอ้างอิงใหม่ให้ไม่ชนกัน · " +
    "ถ้าแต่ละไฟล์ตั้งค่าหน้ากระดาษต่างกันมาก (เช่นแนวตั้งกับแนวนอน) ผลลัพธ์จะยึดของไฟล์แรก " +
    "และหัวกระดาษ–ท้ายกระดาษของไฟล์ที่นำมาต่อจะไม่ถูกนำมาด้วย",
    "The first file is used as the template — fonts, margins, and page setup follow it. " +
    "Content from the other files is appended, with images carried over and re-numbered to avoid clashes. " +
    "If the files have very different page setups (e.g. portrait vs. landscape), the result follows the first file, " +
    "and headers/footers from the appended files are not carried over")));

  const refresh = () => { go.disabled = files.length < 2; };

  async function run() {
    results.innerHTML = "";
    go.disabled = true;
    st.info(tr("กำลังรวมไฟล์…", "Merging files…"));
    try {
      const { blob, parts } = await joinDocx(files, {
        pageBreak: brk.value === "yes",
        onProgress: ({ done, total }) => st.progress((done / total) * 100, `(${done}/${total})`),
      });
      st.progress(null);
      const total = parts.reduce((a, p) => a + p.paragraphs, 0);
      st.ok(tr(`รวมเสร็จ ${parts.length} ไฟล์ · ${total.toLocaleString("th-TH")} ย่อหน้า`,
        `Done — ${parts.length} files, ${total.toLocaleString("en-US")} paragraphs`));

      const name = stripExt(files[0].name) + tr("-รวม.docx", "-merged.docx");
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name),
          el("small", {}, parts.map((p) => tr(`${p.name} (${p.paragraphs} ย่อหน้า)`, `${p.name} (${p.paragraphs} paragraphs)`)).join(" · "))]),
        el("span", { class: "r-size" }, fmtBytes(blob.size)),
        button(tr("ดาวน์โหลด", "Download"), { icon: "download",  onclick: () => download(blob, name) }),
      ]));
    } catch (e) {
      st.progress(null);
      st.err(tr("รวมไฟล์ไม่สำเร็จ: ", "Could not merge files: ") + e.message);
    } finally { refresh(); }
  }
  return wrap;
}
