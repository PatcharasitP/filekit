// ซ่อมไฟล์ข้อความ/CSV ที่ภาษาไทยกลายเป็นตัวประหลาด
// เบราว์เซอร์ถอด TIS-620/Windows-874 ได้เองในตัว (มาตรฐาน WHATWG Encoding) จึงไม่ต้องใช้ไลบรารีเลย
import { el } from "../dom.js";
import { toolShell, statusBar, button, field, select, dropzone, download, stripExt, fmtBytes } from "../ui.js";
import { analyzeBytes, decodeBytes, undoDoubleEncode, ENC_LABEL } from "../thai.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  let items = [];              // { file, u8, analysis, choice }

  const bomChk = el("input", { type: "checkbox", checked: true });
  const bomBox = el("label", { class: "clean-check" }, [bomChk,
    el("span", {}, "ใส่เครื่องหมาย BOM ให้ไฟล์ CSV (แนะนำ — เปิดใน Excel แล้วภาษาไทยไม่เพี้ยนซ้ำ)")]);

  const list = el("div", { class: "enc-list" });
  const actions = el("div", { class: "actions" });

  const dz = dropzone({
    accept: ".csv,.txt,.tsv,.json,.sql,.log,.md",
    expect: ["csv", "txt", "tsv", "json", "sql", "log", "md"], expectLabel: "ไฟล์ข้อความหรือ CSV",
    hint: "รับ .csv .txt .tsv .json — เลือกหลายไฟล์พร้อมกันได้",
    onChange: scan,
  });

  body.append(dz.container, bomBox, st.node, list, actions);
  body.appendChild(el("div", { class: "note" },
    "ไฟล์ Excel (.xlsx) ไม่ต้องใช้เครื่องมือนี้ — .xlsx เก็บข้อความเป็น UTF-8 เสมอ ปัญหาไทยเพี้ยนเกิดกับไฟล์ข้อความล้วนอย่าง CSV เท่านั้น"));

  async function scan() {
    list.innerHTML = ""; actions.innerHTML = ""; st.clear();
    items = [];
    if (!dz.files.length) return;
    st.info("กำลังตรวจการเข้ารหัส…");
    for (const f of dz.files) {
      const u8 = new Uint8Array(await f.arrayBuffer());
      const analysis = analyzeBytes(u8);
      items.push({ file: f, u8, analysis, choice: 0 });
    }
    render();
    const fixable = items.filter((it) => needsFix(it)).length;
    if (!fixable) st.ok(`ตรวจ ${items.length} ไฟล์ — เป็น UTF-8 ที่ถูกต้องอยู่แล้วทุกไฟล์ ไม่ต้องซ่อม`);
    else st.info(`ตรวจ ${items.length} ไฟล์ — ต้องซ่อม ${fixable} ไฟล์`);
  }

  const needsFix = (it) => {
    const b = it.analysis.candidates[it.choice];
    return !!b && (b.undo || b.enc !== "utf-8");
  };

  function render() {
    list.innerHTML = "";
    items.forEach((it, idx) => {
      const cands = it.analysis.candidates;
      const sel = select(cands.map((c, i) => [String(i), c.label + (i === 0 ? "  ← ระบบเลือกให้" : "")]), "0");
      sel.onchange = () => { it.choice = +sel.value; render(); };
      const cur = cands[it.choice];
      const sample = (cur?.text || "").split(/\r?\n/).filter((l) => l.trim()).slice(0, 3).join("\n");
      const before = (decodeBytes(it.u8, "utf-8") || "").split(/\r?\n/).filter((l) => l.trim()).slice(0, 3).join("\n");

      list.appendChild(el("div", { class: "enc-card" }, [
        el("div", { class: "enc-head" }, [
          el("strong", {}, it.file.name),
          el("span", { class: "r-size" }, fmtBytes(it.file.size)),
          el("span", { class: "stat " + (needsFix(it) ? "warn" : "ok") },
            needsFix(it) ? "ต้องซ่อม" : "ปกติดีอยู่แล้ว"),
        ]),
        el("div", { class: "note" }, it.analysis.why || ""),
        field("อ่านไฟล์นี้เป็น", sel),
        el("div", { class: "enc-cmp" }, [
          el("div", {}, [el("small", {}, "ถ้าเปิดตรง ๆ (แบบ UTF-8)"), el("pre", { class: "preview-text bad" }, before)]),
          el("div", {}, [el("small", {}, "หลังซ่อมด้วยตัวเลือกด้านบน"), el("pre", { class: "preview-text good" }, sample)]),
        ]),
      ]));
    });
    actions.innerHTML = "";
    if (!items.length) return;
    actions.append(
      button("💾 บันทึกเป็น UTF-8 ทุกไฟล์", { onclick: () => saveAll(false) }),
      items.length > 1 ? button("ดาวน์โหลดรวมเป็น ZIP", { icon: "zip",  onclick: () => saveAll(true), ghost: true }) : null,
    );
  }

  function fixedText(it) {
    const cur = it.analysis.candidates[it.choice];
    let text = decodeBytes(it.u8, cur.enc);
    if (cur.undo) { const r = undoDoubleEncode(text); if (r) text = r.text; }
    return text;
  }

  async function saveAll(asZip) {
    try {
      const made = items.map((it) => {
        const ext = (it.file.name.split(".").pop() || "txt").toLowerCase();
        const useBom = bomChk.checked && ext === "csv";
        return { name: `${stripExt(it.file.name)}-utf8.${ext}`,
                 blob: new Blob([(useBom ? "﻿" : "") + fixedText(it)], { type: "text/plain;charset=utf-8" }) };
      });
      if (asZip) {
        const zip = new JSZip();
        made.forEach((m) => zip.file(m.name, m.blob));
        download(await zip.generateAsync({ type: "blob" }), "ไฟล์ซ่อมแล้ว.zip");
      } else made.forEach((m) => download(m.blob, m.name));
      st.ok(`บันทึกแล้ว ${made.length} ไฟล์ (UTF-8)`);
    } catch (e) { st.err("บันทึกไม่สำเร็จ — " + (e.message || e)); }
  }

  return wrap;
}
