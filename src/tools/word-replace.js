import { el, dropzone, toolShell, statusBar, button, download, stripExt, fmtBytes, yieldToBrowser, eachFile, failedBox } from "../ui.js";
import { countMatches, replaceInDocx, makeRules } from "../docxreplace.js";
import { loadLibs } from "../loader.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const previewBox = el("div", {});
  const results = el("div", { class: "results" });
  let files = [];

  const dz = dropzone({
    expect: ["docx"], expectLabel: "ไฟล์ Word (.docx)",
    accept: ".docx", multiple: true,
    hint: "เลือกได้หลายไฟล์ · แก้พร้อมกันทั้งชุดด้วยกฎเดียวกัน",
    onChange: (f) => { files = f; previewBox.innerHTML = ""; results.innerHTML = ""; st.clear(); refresh(); },
  });

  const rulesBox = el("div", { class: "rep-rules" });
  const matchCase = el("input", { type: "checkbox" });
  const wholeWord = el("input", { type: "checkbox" });

  const addRule = (find = "", replace = "") => {
    const fi = el("input", { type: "text", placeholder: "ค้นหาคำนี้", value: find, oninput: () => { refresh(); previewBox.innerHTML = ""; } });
    const ri = el("input", { type: "text", placeholder: "แทนที่ด้วย (เว้นว่าง = ลบคำนั้น)", value: replace });
    const row = el("div", { class: "rep-row" }, [
      fi, el("span", { class: "mm-arrow" }, "→"), ri,
      el("button", { class: "icon-btn danger", type: "button", title: "เอาออก",
        onclick: () => { row.remove(); refresh(); previewBox.innerHTML = ""; } }, "✕"),
    ]);
    row._get = () => ({ find: fi.value.trim(), replace: ri.value });
    rulesBox.appendChild(row);
    return row;
  };
  addRule();

  const preview = button("🔍 ดูก่อนว่าจะเปลี่ยนกี่จุด", { ghost: true, onclick: runPreview });
  const go = button("✏️ แทนที่แล้วดาวน์โหลด", { onclick: run });

  body.append(dz.container,
    el("div", { class: "rep-head" }, [
      el("p", { class: "mm-label" }, "กฎการแทนที่ (ใส่ได้หลายคู่ ทำงานพร้อมกัน)"),
      button("+ เพิ่มคู่", { ghost: true, onclick: () => { addRule(); refresh(); } }),
    ]),
    rulesBox,
    el("div", { class: "clean-opts" }, [
      el("label", { class: "clean-check" }, [matchCase, el("span", {}, "ตรงตัวพิมพ์ใหญ่–เล็ก (มีผลกับภาษาอังกฤษ)")]),
      el("label", { class: "clean-check" }, [wholeWord, el("span", {}, "ต้องเป็นทั้งคำ (ใช้ได้กับคำภาษาอังกฤษ ภาษาไทยไม่มีขอบเขตคำจึงข้ามให้)")]),
    ]),
    el("div", { class: "actions" }, [preview, go]), st.node, previewBox, results);

  body.appendChild(el("div", { class: "note" },
    "เหมาะกับงานที่ต้องแก้เหมือนกันทั้งชุด เช่น เปลี่ยนชื่อบริษัท เปลี่ยนปีในหัวเอกสาร หรือแก้ตำแหน่งผู้ลงนามในเอกสารหลายสิบไฟล์ · " +
    "ระบบค้นข้ามการหั่นข้อความของ Word ให้ (คำที่ถูกตัดคาไว้คนละท่อนก็ยังเจอ) และรักษารูปแบบตัวอักษรเดิม · " +
    "แนะนำให้กด “ดูก่อน” ทุกครั้งเพื่อเช็คจำนวนก่อนแก้จริง"));

  const getPairs = () => [...rulesBox.children].map((r) => r._get()).filter((p) => p.find);
  function refresh() {
    const ok = files.length > 0 && getPairs().length > 0;
    go.disabled = !ok; preview.disabled = !ok;
  }
  refresh();

  const opts = () => ({ matchCase: matchCase.checked, wholeWord: wholeWord.checked });

  async function runPreview() {
    previewBox.innerHTML = ""; results.innerHTML = "";
    st.info("กำลังตรวจ…");
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
            ? counts.map((c, i) => `“${pairs[i].find}” ${c} จุด`).filter((_, i) => counts[i]).join(" · ")
            : "ไม่พบคำที่ค้นหา"),
        ]));
      });
      if (scanFailed.length) table.appendChild(failedBox(scanFailed));
      st.clear();
      previewBox.append(
        el("div", { class: "status show " + (grand ? "info" : "err") },
          grand ? `จะแทนที่ทั้งหมด ${grand.toLocaleString("th-TH")} จุด ใน ${files.length} ไฟล์`
                : "ไม่พบคำที่ค้นหาในไฟล์ที่เลือกเลย"),
        table);
    } catch (e) {
      st.err("ตรวจไม่สำเร็จ: " + e.message);
    }
  }

  async function run() {
    results.innerHTML = "";
    go.disabled = true;
    st.info("กำลังแทนที่…");
    try {
      const rules = makeRules(getPairs(), opts());
      const made = [];
      let total = 0;
      const failed = await eachFile(files, st, async (f) => {
        const { blob, total: n } = await replaceInDocx(f, rules);
        total += n;
        made.push({ name: `${stripExt(f.name)}-แก้แล้ว.docx`, blob, n });
      });
      st.progress(null);
      if (!made.length) throw new Error("แก้ไม่สำเร็จสักไฟล์ — ตรวจว่าไฟล์เป็น .docx จริงหรือไม่");
      if (failed.length) results.appendChild(failedBox(failed));
      st.ok(`แทนที่ ${total.toLocaleString("th-TH")} จุด ใน ${made.length} ไฟล์`);
      if (made.length > 1) results.appendChild(el("div", { class: "actions" }, [
        button("ดาวน์โหลดทั้งหมดเป็น ZIP", { icon: "zip",  onclick: async () => {
          const [JSZipLib] = await loadLibs("jszip");
          const zip = new JSZipLib();
          made.forEach((m) => zip.file(m.name, m.blob));
          download(await zip.generateAsync({ type: "blob" }), "เอกสารที่แก้แล้ว.zip");
        } }),
      ]));
      made.forEach((m) => results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, m.name), el("small", {}, `แทนที่ ${m.n} จุด`)]),
        el("span", { class: "r-size" }, fmtBytes(m.blob.size)),
        button("", { icon: "download", label: "ดาวน์โหลด",  onclick: () => download(m.blob, m.name) }),
      ])));
    } catch (e) {
      st.progress(null);
      st.err("แทนที่ไม่สำเร็จ: " + e.message);
    } finally { refresh(); }
  }
  return wrap;
}
