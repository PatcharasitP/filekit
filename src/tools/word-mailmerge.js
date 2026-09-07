import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, fmtBytes, yieldToBrowser } from "../ui.js";
import { readPlaceholders, mergeAll } from "../docxmerge.js";
import { loadLibs } from "../loader.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });

  let tplFile = null, dataFile = null;
  let fields = [];        // ตัวยึดในเทมเพลต
  let rows = [];          // ข้อมูลจาก Excel
  let columns = [];       // ชื่อคอลัมน์ใน Excel
  const mapping = {};     // ตัวยึด -> คอลัมน์

  // ── ขั้นที่ 1: เทมเพลต Word ───────────────────────────────────────────────
  const tplZone = dropzone({
    expect: ["docx"], expectLabel: "ไฟล์ Word (.docx)",
    accept: ".docx", multiple: false,
    hint: "ไฟล์ Word ที่ใส่ตัวยึดไว้ เช่น {{ชื่อ}} {{ตำแหน่ง}}",
    onChange: async (f) => { tplFile = f[0] || null; await scanTemplate(); },
  });

  // ── ขั้นที่ 2: ข้อมูล Excel/CSV ───────────────────────────────────────────
  const dataZone = dropzone({
    expect: ["xlsx", "csv"], expectLabel: "ไฟล์ Excel หรือ CSV",
    accept: ".xlsx,.xls,.csv", multiple: false,
    hint: "แถวแรกต้องเป็นชื่อคอลัมน์ · หนึ่งแถว = หนึ่งเอกสาร",
    onChange: async (f) => { dataFile = f[0] || null; await scanData(); },
  });

  const fieldsBox = el("div", { class: "mm-box", hidden: true });
  const mapBox = el("div", { class: "mm-box", hidden: true });
  const previewBox = el("div", { class: "mm-box", hidden: true });

  const missing = select([["blank", "เว้นว่างไว้"], ["keep", "คงตัวยึดเดิมไว้ (เพื่อให้เห็นว่าขาด)"]], "blank");
  const nameCol = el("select", {});
  const go = button("📄 สร้างเอกสารทั้งชุด", { onclick: run });
  go.disabled = true;

  body.append(
    el("div", { class: "mm-step" }, [el("span", { class: "mm-num" }, "1"),
      el("div", {}, [el("h3", {}, "เลือกเทมเพลต Word"), tplZone.container, fieldsBox])]),
    el("div", { class: "mm-step" }, [el("span", { class: "mm-num" }, "2"),
      el("div", {}, [el("h3", {}, "เลือกไฟล์ข้อมูล"), dataZone.container])]),
    el("div", { class: "mm-step" }, [el("span", { class: "mm-num" }, "3"),
      el("div", {}, [el("h3", {}, "จับคู่ข้อมูลกับตัวยึด"), mapBox])]),
    el("div", { class: "mm-step" }, [el("span", { class: "mm-num" }, "4"),
      el("div", {}, [el("h3", {}, "ตรวจดูก่อนสร้าง"), previewBox,
        el("div", { class: "row" }, [
          field("ถ้าข้อมูลช่องไหนว่าง", missing),
          field("ตั้งชื่อไฟล์จากคอลัมน์", nameCol, "เว้นไว้ = ตั้งชื่อตามลำดับ"),
        ]),
        el("div", { class: "actions" }, [go])])]),
    st.node, results);

  body.appendChild(el("div", { class: "note" },
    "วิธีใช้: เปิดไฟล์ Word ของคุณแล้วพิมพ์ตัวยึดในตำแหน่งที่ต้องการเติมข้อมูล เช่น " +
    "“เรียน {{คำนำหน้า}}{{ชื่อ}}” จากนั้นเตรียม Excel ที่มีคอลัมน์ชื่อเดียวกัน ระบบจะสร้างเอกสารให้ทีละแถว · " +
    "รองรับหัวกระดาษและท้ายกระดาษด้วย · ทุกอย่างทำในเครื่องคุณเอง ไฟล์ไม่ถูกอัปโหลดไปไหน"));

  // ── อ่านตัวยึดจากเทมเพลต ─────────────────────────────────────────────────
  async function scanTemplate() {
    fieldsBox.hidden = true; fieldsBox.innerHTML = "";
    fields = [];
    if (!tplFile) return refresh();
    st.info("กำลังอ่านตัวยึดในเทมเพลต…");
    try {
      fields = await readPlaceholders(tplFile);
      st.clear();
      if (!fields.length) {
        fieldsBox.hidden = false;
        fieldsBox.appendChild(el("div", { class: "status show err" },
          "ไม่พบตัวยึดในไฟล์นี้ — ตัวยึดต้องอยู่ในรูป {{ชื่อคอลัมน์}} เช่น {{ชื่อ}} หรือ {{ตำแหน่ง}}"));
      } else {
        fieldsBox.hidden = false;
        fieldsBox.append(
          el("p", { class: "mm-label" }, `พบตัวยึด ${fields.length} รายการในเทมเพลต`),
          el("div", { class: "stack" }, fields.map((f) => el("span", { text: `{{${f}}}` })))
        );
      }
    } catch (e) {
      st.err("อ่านเทมเพลตไม่สำเร็จ: " + e.message);
    }
    buildMapping(); refresh();
  }

  // ── อ่านข้อมูลจาก Excel/CSV ──────────────────────────────────────────────
  async function scanData() {
    rows = []; columns = [];
    if (!dataFile) { buildMapping(); return refresh(); }
    st.info("กำลังอ่านข้อมูล…");
    try {
      const [XLSXLib] = await loadLibs("xlsx");
      const wb = XLSXLib.read(await dataFile.arrayBuffer(), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSXLib.utils.sheet_to_json(sheet, { defval: "", raw: false });
      if (!rows.length) throw new Error("ไม่พบข้อมูลในไฟล์ (ต้องมีแถวหัวตารางและอย่างน้อย 1 แถวข้อมูล)");
      columns = Object.keys(rows[0]);
      st.ok(`อ่านข้อมูลได้ ${rows.length.toLocaleString("th-TH")} แถว · ${columns.length} คอลัมน์ จากชีท “${wb.SheetNames[0]}”`);
    } catch (e) {
      st.err("อ่านไฟล์ข้อมูลไม่สำเร็จ: " + e.message);
    }
    buildMapping(); refresh();
  }

  // ── จับคู่ตัวยึดกับคอลัมน์ (เดาให้ก่อนจากชื่อที่ตรงกัน) ──────────────────
  function buildMapping() {
    mapBox.innerHTML = "";
    Object.keys(mapping).forEach((k) => delete mapping[k]);
    if (!fields.length || !columns.length) {
      mapBox.hidden = true;
      nameCol.innerHTML = "";
      return;
    }
    mapBox.hidden = false;
    const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, "");
    const byNorm = new Map(columns.map((c) => [norm(c), c]));

    const grid = el("div", { class: "mm-grid" });
    fields.forEach((f) => {
      const guess = byNorm.get(norm(f)) || "";
      mapping[f] = guess;
      const sel = el("select", { onchange: (e) => { mapping[f] = e.target.value; renderPreview(); refresh(); } });
      sel.appendChild(el("option", { value: "" }, "— ไม่ใช้ —"));
      columns.forEach((c) => sel.appendChild(el("option", { value: c, selected: c === guess }, c)));
      grid.append(
        el("code", { class: "mm-key", text: `{{${f}}}` }),
        el("span", { class: "mm-arrow" }, "←"),
        sel
      );
    });
    mapBox.append(el("p", { class: "mm-label" }, "ระบบจับคู่ให้อัตโนมัติเมื่อชื่อตรงกัน ปรับเองได้"), grid);

    const unmatched = fields.filter((f) => !mapping[f]);
    if (unmatched.length) {
      mapBox.appendChild(el("div", { class: "status show err", style: { marginTop: "12px" } },
        `ยังไม่ได้จับคู่ ${unmatched.length} ตัวยึด: ${unmatched.map((f) => `{{${f}}}`).join(" ")}`));
    }

    nameCol.innerHTML = "";
    nameCol.appendChild(el("option", { value: "" }, "— ตั้งชื่อตามลำดับ —"));
    columns.forEach((c) => nameCol.appendChild(el("option", { value: c }, c)));
    renderPreview();
  }

  // ── พรีวิวแถวแรก ให้เห็นผลก่อนสร้างจริง ─────────────────────────────────
  function renderPreview() {
    previewBox.innerHTML = "";
    if (!rows.length || !fields.length) { previewBox.hidden = true; return; }
    previewBox.hidden = false;
    const r = rows[0];
    const list = el("div", { class: "mm-preview" });
    fields.forEach((f) => {
      const col = mapping[f];
      const v = col ? String(r[col] ?? "") : "";
      list.append(
        el("code", { class: "mm-key", text: `{{${f}}}` }),
        el("span", { class: "mm-arrow" }, "→"),
        el("span", { class: v ? "mm-val" : "mm-val empty", text: v || (col ? "(ว่างในแถวแรก)" : "(ยังไม่จับคู่)") })
      );
    });
    previewBox.append(
      el("p", { class: "mm-label" }, `ตัวอย่างจากแถวแรกของข้อมูล — จะสร้างทั้งหมด ${rows.length.toLocaleString("th-TH")} ไฟล์`),
      list);
  }

  const refresh = () => { go.disabled = !(tplFile && rows.length && fields.length); };

  // ── สร้างเอกสารทั้งชุด ───────────────────────────────────────────────────
  async function run() {
    results.innerHTML = "";
    go.disabled = true;
    st.info("กำลังสร้างเอกสาร…");
    try {
      const base = stripExt(tplFile.name);
      const used = new Map();
      const nameOf = (row, i) => {
        let label = nameCol.value ? String(row[nameCol.value] ?? "").trim() : "";
        label = label.replace(/[\\/:*?"<>|]/g, "-").slice(0, 60);   // กันอักขระที่ตั้งชื่อไฟล์ไม่ได้
        let name = label ? `${base}-${label}` : `${base}-${i + 1}`;
        const n = (used.get(name) || 0) + 1;                        // ชื่อซ้ำให้เติมเลขต่อท้าย
        used.set(name, n);
        return (n > 1 ? `${name} (${n})` : name) + ".docx";
      };

      // แปลงข้อมูลให้คีย์เป็นชื่อ "ตัวยึด" ตามที่จับคู่ไว้
      const mapped = rows.map((r) => {
        const o = {};
        fields.forEach((f) => { o[f] = mapping[f] ? r[mapping[f]] : ""; });
        return o;
      });

      const made = await mergeAll(tplFile, mapped, {
        missing: missing.value, nameOf,
        onProgress: ({ done, total }) => st.progress((done / total) * 100, `(${done}/${total})`),
      });

      st.progress(null);
      const totalSize = made.reduce((a, m) => a + m.blob.size, 0);
      st.ok(`สร้างเอกสารสำเร็จ ${made.length.toLocaleString("th-TH")} ไฟล์ · รวม ${fmtBytes(totalSize)}`);

      if (made.length > 1) {
        results.appendChild(el("div", { class: "actions" }, [
          button("📦 ดาวน์โหลดทั้งหมดเป็น ZIP", { onclick: async () => {
            st.info("กำลังบีบเป็น ZIP…");
            const [JSZipLib] = await loadLibs("jszip");
            const zip = new JSZipLib();
            made.forEach((m) => zip.file(m.name, m.blob));
            download(await zip.generateAsync({ type: "blob" }), `${base}-รวม ${made.length} ไฟล์.zip`);
            st.ok("ดาวน์โหลด ZIP แล้ว");
          } }),
        ]));
      }
      made.slice(0, 50).forEach((m) => results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, m.name)]),
        el("span", { class: "r-size" }, fmtBytes(m.blob.size)),
        button("⬇", { onclick: () => download(m.blob, m.name) }),
      ])));
      if (made.length > 50) results.appendChild(el("div", { class: "note" },
        `แสดง 50 ไฟล์แรกในรายการ · ไฟล์ที่เหลืออยู่ในไฟล์ ZIP ครบทั้ง ${made.length} ไฟล์`));
      await yieldToBrowser();
    } catch (e) {
      st.progress(null);
      st.err("สร้างเอกสารไม่สำเร็จ: " + e.message);
    } finally { refresh(); }
  }

  return wrap;
}
