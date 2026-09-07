import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, parsePages, fmtBytes, yieldToBrowser } from "../ui.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });
  let file = null;

  const dz = dropzone({
    accept: "application/pdf,.pdf", multiple: false,
    hint: "ครั้งละ 1 ไฟล์",
    onChange: (f) => { file = f[0] || null; st.clear(); results.innerHTML = ""; },
  });

  const mode = select([["range", "แยกตามช่วงหน้าที่ระบุ"], ["every", "แยกทุก ๆ N หน้า"], ["each", "แยกทีละหน้า"]], "range");
  const rangeInput = el("input", { type: "text", placeholder: "เช่น 1-3,5,8-", value: "1-" });
  const everyInput = el("input", { type: "number", min: "1", value: "1" });

  const fRange = field("ช่วงหน้าที่ต้องการ", rangeInput, "ใช้ - สำหรับช่วง และ , คั่นหลายช่วง เช่น 1-3,7,10-");
  const fEvery = field("แยกทุกกี่หน้า", everyInput, "เช่น 2 = ได้ไฟล์ละ 2 หน้า");
  fEvery.style.display = "none";
  mode.addEventListener("change", () => {
    fRange.style.display = mode.value === "range" ? "" : "none";
    fEvery.style.display = mode.value === "every" ? "" : "none";
  });

  const go = button("✂️ แยกไฟล์", { onclick: run });
  body.append(dz.container,
    el("div", { class: "row" }, [field("รูปแบบการแยก", mode), fRange, fEvery]),
    el("div", { class: "actions" }, [go]), st.node, results);

  async function run() {
    if (!file) return st.err("กรุณาเลือกไฟล์ PDF ก่อน");
    results.innerHTML = "";
    go.disabled = true;
    st.info("กำลังแยกไฟล์…");
    try {
      const { PDFDocument } = PDFLib;
      const buf = await file.arrayBuffer();
      const src = await PDFDocument.load(buf, { ignoreEncryption: true });
      const total = src.getPageCount();

      // สร้าง "กลุ่มหน้า" ตามโหมดที่เลือก แล้วปั้นไฟล์ทีละกลุ่มด้วยตรรกะเดียวกัน
      let groups = [];
      if (mode.value === "range") {
        const pages = parsePages(rangeInput.value, total);
        if (!pages.length) throw new Error("ช่วงหน้าที่ระบุไม่มีหน้าที่มีอยู่จริง (ไฟล์นี้มี " + total + " หน้า)");
        groups = [pages];
      } else if (mode.value === "every") {
        const n = Math.max(1, +everyInput.value || 1);
        for (let i = 1; i <= total; i += n)
          groups.push(Array.from({ length: Math.min(n, total - i + 1) }, (_, k) => i + k));
      } else {
        groups = Array.from({ length: total }, (_, i) => [i + 1]);
      }

      const base = stripExt(file.name);
      const made = [];
      for (let g = 0; g < groups.length; g++) {
        const out = await PDFDocument.create();
        const copied = await out.copyPages(src, groups[g].map((p) => p - 1));
        copied.forEach((p) => out.addPage(p));
        const blob = new Blob([await out.save()], { type: "application/pdf" });
        const label = groups[g].length === 1 ? `หน้า${groups[g][0]}` : `หน้า${groups[g][0]}-${groups[g].at(-1)}`;
        made.push({ name: `${base}-${label}.pdf`, blob, count: groups[g].length });
        st.progress(((g + 1) / groups.length) * 100, `(${g + 1}/${groups.length})`);
        await yieldToBrowser();
      }

      st.progress(null);
      st.ok(`แยกได้ ${made.length} ไฟล์`);
      made.forEach((m) => results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, m.name), el("small", {}, `${m.count} หน้า`)]),
        el("span", { class: "r-size" }, fmtBytes(m.blob.size)),
        button("⬇", { onclick: () => download(m.blob, m.name) }),
      ])));

      if (made.length > 1) {
        results.prepend(el("div", { class: "actions" }, [
          button("📦 ดาวน์โหลดทั้งหมดเป็น ZIP", {
            onclick: async () => {
              st.info("กำลังบีบเป็น ZIP…");
              const zip = new JSZip();
              made.forEach((m) => zip.file(m.name, m.blob));
              download(await zip.generateAsync({ type: "blob" }), base + "-แยกไฟล์.zip");
              st.ok("ดาวน์โหลด ZIP แล้ว");
            },
          }),
        ]));
      }
    } catch (e) {
      st.progress(null);
      st.err("แยกไฟล์ไม่สำเร็จ: " + e.message);
    } finally {
      go.disabled = false;
    }
  }
  return wrap;
}
