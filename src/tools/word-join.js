import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, fmtBytes } from "../ui.js";
import { joinDocx } from "../docxjoin.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  let files = [];

  const dz = dropzone({
    expect: ["docx"], expectLabel: "ไฟล์ Word (.docx)",
    accept: ".docx", multiple: true, reorder: true,
    hint: "เลือกหลายไฟล์ · ลากแถวเพื่อจัดลำดับก่อนรวม",
    onChange: (f) => { files = f; st.clear(); results.innerHTML = ""; refresh(); },
  });

  const brk = select([["yes", "ขึ้นหน้าใหม่ทุกไฟล์"], ["no", "ต่อกันไปเลย ไม่ขึ้นหน้าใหม่"]], "yes");
  const go = button("🔗 รวมเป็นไฟล์เดียว", { onclick: run });
  go.disabled = true;

  body.append(dz.container,
    el("div", { class: "row" }, [field("การขึ้นหน้า", brk)]),
    el("div", { class: "actions" }, [go]), st.node, results);

  body.appendChild(el("div", { class: "note" },
    "ใช้ไฟล์แรกเป็นแม่แบบของเล่ม — รูปแบบตัวอักษร ระยะขอบ และการตั้งค่าหน้ากระดาษจะยึดตามไฟล์แรก " +
    "ส่วนเนื้อหาของไฟล์ถัดไปถูกนำมาต่อ พร้อมย้ายรูปภาพมาด้วยและออกรหัสอ้างอิงใหม่ให้ไม่ชนกัน · " +
    "‼️ ถ้าแต่ละไฟล์ตั้งค่าหน้ากระดาษต่างกันมาก (เช่นแนวตั้งกับแนวนอน) ผลลัพธ์จะยึดของไฟล์แรก " +
    "และหัวกระดาษ–ท้ายกระดาษของไฟล์ที่นำมาต่อจะไม่ถูกนำมาด้วย"));

  const refresh = () => { go.disabled = files.length < 2; };

  async function run() {
    results.innerHTML = "";
    go.disabled = true;
    st.info("กำลังรวมไฟล์…");
    try {
      const { blob, parts } = await joinDocx(files, {
        pageBreak: brk.value === "yes",
        onProgress: ({ done, total }) => st.progress((done / total) * 100, `(${done}/${total})`),
      });
      st.progress(null);
      const total = parts.reduce((a, p) => a + p.paragraphs, 0);
      st.ok(`รวมเสร็จ ${parts.length} ไฟล์ · ${total.toLocaleString("th-TH")} ย่อหน้า`);

      const name = stripExt(files[0].name) + "-รวม.docx";
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name),
          el("small", {}, parts.map((p) => `${p.name} (${p.paragraphs} ย่อหน้า)`).join(" · "))]),
        el("span", { class: "r-size" }, fmtBytes(blob.size)),
        button("ดาวน์โหลด", { icon: "download",  onclick: () => download(blob, name) }),
      ]));
    } catch (e) {
      st.progress(null);
      st.err("รวมไฟล์ไม่สำเร็จ: " + e.message);
    } finally { refresh(); }
  }
  return wrap;
}
