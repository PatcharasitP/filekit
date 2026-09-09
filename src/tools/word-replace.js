import { el, dropzone, toolShell, statusBar, button, download, stripExt, fmtBytes, yieldToBrowser, eachFile, failedBox } from "../ui.js";
import { uiIcon } from "../icons.js";
import { countMatches, replaceInDocx, makeRules } from "../docxreplace.js";
import { loadLibs } from "../loader.js";
import { tr } from "../i18n.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const previewBox = el("div", {});
  const results = el("div", { class: "results" });
  let files = [];

  const dz = dropzone({
    expect: ["docx"], expectLabel: tr("ไฟล์ Word (.docx)", "Word files (.docx)"),
    accept: ".docx", multiple: true,
    hint: tr("แก้หลายไฟล์ด้วยกฎเดียวกัน", "Apply the same rules to all files"),
    onChange: (f) => { files = f; previewBox.innerHTML = ""; results.innerHTML = ""; st.clear(); refresh(); },
  });

  const rulesBox = el("div", { class: "rep-rules" });
  const matchCase = el("input", { type: "checkbox" });
  const wholeWord = el("input", { type: "checkbox" });

  const addRule = (find = "", replace = "") => {
    const fi = el("input", { type: "text", placeholder: tr("ค้นหาคำนี้", "Find this text"), value: find, oninput: () => { refresh(); previewBox.innerHTML = ""; } });
    const ri = el("input", { type: "text", placeholder: tr("แทนที่ด้วย (ว่าง = ลบ)", "Replace with (blank = delete)"), value: replace });
    const row = el("div", { class: "rep-row" }, [
      fi, el("span", { class: "mm-arrow" }, "→"), ri,
      el("button", { class: "icon-btn danger", type: "button", title: tr("เอาออก", "Remove"),
        onclick: () => { row.remove(); refresh(); previewBox.innerHTML = ""; } }, [uiIcon("close", "pg-ico")]),
    ]);
    row._get = () => ({ find: fi.value.trim(), replace: ri.value });
    rulesBox.appendChild(row);
    return row;
  };
  addRule();

  const preview = button(tr("ดูตัวอย่าง", "Preview"), { ghost: true, onclick: runPreview });
  const go = button(tr("แทนที่", "Replace"), { onclick: run });

  body.append(dz.container,
    el("div", { class: "rep-head" }, [
      el("p", { class: "mm-label" }, tr("กฎการแทนที่ (ใส่ได้หลายคู่)", "Replacement rules (multiple pairs)")),
      button(tr("+ เพิ่มคู่", "+ Add pair"), { ghost: true, onclick: () => { addRule(); refresh(); } }),
    ]),
    rulesBox,
    el("div", { class: "clean-opts" }, [
      el("label", { class: "clean-check" }, [matchCase, el("span", {}, tr("ตรงตัวพิมพ์ใหญ่เล็ก (อังกฤษ)", "Match case (English)"))]),
      el("label", { class: "clean-check" }, [wholeWord, el("span", {}, tr("ทั้งคำ (เฉพาะอังกฤษ)", "Whole word (English only)"))]),
    ]),
    el("div", { class: "actions" }, [preview, go]), st.node, previewBox, results);

  body.appendChild(el("div", { class: "note" },
    tr("แก้หลายไฟล์พร้อมกัน กด “ดูตัวอย่าง” เช็คจำนวนก่อนแก้จริงเสมอ",
    "Batch-edit many files, always click “Preview” to check the count first")));

  const getPairs = () => [...rulesBox.children].map((r) => r._get()).filter((p) => p.find);
  function refresh() {
    const ok = files.length > 0 && getPairs().length > 0;
    go.disabled = !ok; preview.disabled = !ok;
  }
  refresh();

  const opts = () => ({ matchCase: matchCase.checked, wholeWord: wholeWord.checked });

  async function runPreview() {
    previewBox.innerHTML = ""; results.innerHTML = "";
    st.info(tr("กำลังตรวจ…", "Checking…"));
    try {
      const pairs = getPairs();
      const rules = makeRules(pairs, opts());
      const table = el("div", { class: "rep-preview" });
      let grand = 0;
      const scanFailed = await eachFile(files, null, async (f) => {
        const counts = await countMatches(f, rules);
        const sum = counts.reduce((a, b) => a + b, 0);
        grand += sum;
        table.appendChild(el("div", { class: "rep-line" + (sum ? "" : " none") }, [
          el("strong", { text: f.name }),
          el("span", {}, sum
            ? counts.map((c, i) => tr(`“${pairs[i].find}” ${c} จุด`, `“${pairs[i].find}” ${c} matches`)).filter((_, i) => counts[i]).join(", ")
            : tr("ไม่พบคำที่ค้นหา", "No matches found")),
        ]));
      });
      if (scanFailed.length) table.appendChild(failedBox(scanFailed));
      st.clear();
      previewBox.append(
        el("div", { class: "status show " + (grand ? "info" : "err") },
          grand ? tr(`จะแทนที่ทั้งหมด ${grand.toLocaleString("th-TH")} จุด ใน ${files.length} ไฟล์`,
                     `Will replace ${grand.toLocaleString("en-US")} matches across ${files.length} files`)
                : tr("ไม่พบคำที่ค้นหาเลย", "No matches found")),
        table);
    } catch (e) {
      st.err(tr("ตรวจไม่สำเร็จ: ", "Check failed: ") + e.message);
    }
  }

  async function run() {
    results.innerHTML = "";
    go.disabled = true;
    st.info(tr("กำลังแทนที่…", "Replacing…"));
    try {
      const rules = makeRules(getPairs(), opts());
      const made = [];
      let total = 0;
      const failed = await eachFile(files, st, async (f) => {
        const { blob, total: n } = await replaceInDocx(f, rules);
        total += n;
        made.push({ name: tr(`${stripExt(f.name)}-แก้แล้ว.docx`, `${stripExt(f.name)}-edited.docx`), blob, n });
      });
      st.progress(null);
      if (!made.length) throw new Error(tr("แก้ไม่สำเร็จ ตรวจว่าเป็น .docx จริง", "Could not process. Check they're valid .docx files."));
      if (failed.length) results.appendChild(failedBox(failed));
      st.ok(tr(`แทนที่ ${total.toLocaleString("th-TH")} จุด ใน ${made.length} ไฟล์`,
        `Replaced ${total.toLocaleString("en-US")} matches in ${made.length} files`));
      if (made.length > 1) results.appendChild(el("div", { class: "actions" }, [
        button(tr("โหลดทั้งหมด (ZIP)", "Download all (ZIP)"), { icon: "zip",  onclick: async () => {
          const [JSZipLib] = await loadLibs("jszip");
          const zip = new JSZipLib();
          made.forEach((m) => zip.file(m.name, m.blob));
          download(await zip.generateAsync({ type: "blob" }), tr("เอกสารที่แก้แล้ว.zip", "edited-documents.zip"));
        } }),
      ]));
      made.forEach((m) => results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, m.name), el("small", {}, tr(`แทนที่ ${m.n} จุด`, `Replaced ${m.n} matches`))]),
        el("span", { class: "r-size" }, fmtBytes(m.blob.size)),
        button("", { icon: "download", label: tr("ดาวน์โหลด", "Download"),  onclick: () => download(m.blob, m.name) }),
      ])));
    } catch (e) {
      st.progress(null);
      st.err(tr("แทนที่ไม่สำเร็จ: ", "Could not replace: ") + e.message);
    } finally { refresh(); }
  }
  return wrap;
}
