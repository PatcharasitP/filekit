import { el, dropzone, toolShell, statusBar, button, field, select, downloadButton,
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
    hint: tr("ลากแถวเพื่อจัดลำดับ", "Drag rows to reorder"),
    onChange: (f) => { files = f; st.clear(); results.innerHTML = ""; refresh(); },
  });

  const brk = select([["yes", tr("ขึ้นหน้าใหม่ทุกไฟล์", "Start a new page for each file")],
    ["no", tr("ต่อกันไปเลย ไม่ขึ้นหน้าใหม่", "Continue without a page break")]], "yes");
  const go = button(tr("รวมไฟล์", "Merge files"), { onclick: run });
  go.disabled = true;

  body.append(dz.container,
    el("div", { class: "row" }, [field(tr("การขึ้นหน้า", "Page breaks"), brk)]),
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
      const { blob, parts } = await joinDocx(files, {
        pageBreak: brk.value === "yes",
        onProgress: ({ done, total }) => st.progress((done / total) * 100, `(${done}/${total})`),
      });
      st.progress(null);
      const total = parts.reduce((a, p) => a + p.paragraphs, 0);
      st.ok(tr(`รวมเสร็จ ${parts.length} ไฟล์, ${total.toLocaleString("th-TH")} ย่อหน้า`,
        `Done — ${parts.length} files, ${total.toLocaleString("en-US")} paragraphs`));

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
