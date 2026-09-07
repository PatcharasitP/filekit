import { el, dropzone, toolShell, statusBar, button, field, select, download,
         stripExt, fmtBytes, yieldToBrowser } from "../ui.js";
import { readPlaceholders, mergeAll, buildRecords } from "../docxmerge.js";
import { loadLibs } from "../loader.js";

export function mount(tool) {
  const { wrap, body } = toolShell(tool);
  const st = statusBar();
  const results = el("div", { class: "results" });

  let tplFile = null, dataFile = null;
  let fields = [];        // ตัวยึดธรรมดาในเทมเพลต
  let loops = [];         // บล็อกวนซ้ำ เช่น {{#รายการ}} … {{/รายการ}}
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

  const modeSel = select([["row", "หนึ่งแถว = หนึ่งเอกสาร"], ["group", "รวมหลายแถวเป็นเอกสารเดียว (ใช้กับตารางรายการ)"]], "row");
  const groupCol = el("select", {});
  const loopSel = el("select", {});
  const groupField = field("จัดกลุ่มด้วยคอลัมน์", groupCol, "แถวที่ค่าตรงกันจะรวมเป็นเอกสารเดียว");
  const loopField = field("ใส่รายการลงบล็อก", loopSel);
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
          field("รูปแบบเอกสาร", modeSel),
          groupField, loopField,
          field("ตั้งชื่อไฟล์จากคอลัมน์", nameCol, "เว้นไว้ = ตั้งชื่อตามลำดับ"),
        ]),
        el("div", { class: "actions" }, [go])])]),
    st.node, results);

  // ให้ลองใช้ได้ทันทีโดยไม่ต้องเตรียมไฟล์เอง — คนส่วนใหญ่ติดตรงไม่รู้ว่าเทมเพลตหน้าตายังไง
  body.appendChild(el("div", { class: "sample-box" }, [
    el("div", {}, [
      el("strong", {}, "ยังไม่มีไฟล์? ลองด้วยตัวอย่างสำเร็จรูปได้เลย"),
      el("p", { class: "mm-label", style: { margin: "5px 0 0" } },
        "มีทั้งแบบหนึ่งแถวหนึ่งใบ (หนังสือแจ้งผลประเมิน) และแบบมีตารางรายการ (ใบเสนอราคา) พร้อมตัวอย่างเงื่อนไข"),
    ]),
    el("div", { class: "sample-links" }, [
      el("a", { class: "chip", href: "samples/ตัวอย่าง-หนังสือแจ้งผลประเมิน.docx", download: true }, "📄 เทมเพลตประเมิน"),
      el("a", { class: "chip", href: "samples/ตัวอย่าง-ข้อมูลพนักงาน.xlsx", download: true }, "📊 ข้อมูลพนักงาน"),
      el("a", { class: "chip", href: "samples/ตัวอย่าง-ใบเสนอราคา.docx", download: true }, "📄 เทมเพลตใบเสนอราคา"),
      el("a", { class: "chip", href: "samples/ตัวอย่าง-ข้อมูลใบเสนอราคา.xlsx", download: true }, "📊 ข้อมูลใบเสนอราคา"),
      el("a", { class: "chip", href: "samples/อ่านก่อนใช้.txt", download: true }, "📘 วิธีเขียนตัวยึด"),
    ]),
  ]));

  body.appendChild(el("div", { class: "note" },
    "วิธีใช้: เปิดไฟล์ Word ของคุณแล้วพิมพ์ตัวยึดในตำแหน่งที่ต้องการเติมข้อมูล เช่น " +
    "“เรียน {{คำนำหน้า}}{{ชื่อ}}” จากนั้นเตรียม Excel ที่มีคอลัมน์ชื่อเดียวกัน ระบบจะสร้างเอกสารให้ทีละแถว · " +
    "รองรับหัวกระดาษและท้ายกระดาษด้วย · ทุกอย่างทำในเครื่องคุณเอง ไฟล์ไม่ถูกอัปโหลดไปไหน"));

  body.appendChild(el("div", { class: "note" },
    "เงื่อนไข: ใส่ {{#ได้โบนัส}}ข้อความเมื่อจริง{{/ได้โบนัส}} แล้วใน Excel ใส่ TRUE / FALSE (หรือ ใช่ / ไม่ใช่, มี / ไม่มี) · " +
    "อยากได้ข้อความกรณีตรงข้ามให้ใช้ {{#ไม่ได้โบนัส}}…{{/ไม่ได้โบนัส}} — ไม่ต้องเพิ่มคอลัมน์ ระบบสร้างตัวขึ้นต้นด้วย “ไม่” ให้เอง · " +
    "ตารางรายการหลายบรรทัด: ในแถวตารางใส่ {{#รายการ}} ที่ช่องแรกและ {{/รายการ}} ที่ช่องสุดท้าย"));

  // ── อ่านตัวยึดจากเทมเพลต ─────────────────────────────────────────────────
  async function scanTemplate() {
    fieldsBox.hidden = true; fieldsBox.innerHTML = "";
    fields = [];
    if (!tplFile) return refresh();
    st.info("กำลังอ่านตัวยึดในเทมเพลต…");
    try {
      const parsed = await readPlaceholders(tplFile);
      fields = parsed.fields; loops = parsed.loops;
      st.clear();
      fieldsBox.hidden = false;
      if (!fields.length && !loops.length) {
        fieldsBox.appendChild(el("div", { class: "status show err" },
          "ไม่พบตัวยึดในไฟล์นี้ — ตัวยึดต้องอยู่ในรูป {{ชื่อคอลัมน์}} เช่น {{ชื่อ}} หรือ {{ตำแหน่ง}}"));
      } else {
        fieldsBox.append(
          el("p", { class: "mm-label" }, `พบตัวยึด ${fields.length} รายการ` +
            (loops.length ? ` และบล็อกวนซ้ำ ${loops.length} บล็อก` : "")),
          el("div", { class: "stack" }, fields.map((f) => el("span", { text: `{{${f}}}` })))
        );
        if (loops.length) {
          fieldsBox.append(
            el("p", { class: "mm-label", style: { marginTop: "10px" } }, "บล็อกวนซ้ำ (ใช้กับตารางรายการหลายบรรทัด)"),
            el("div", { class: "stack" }, loops.map((f) => el("span", { class: "mm-loop", text: `{{#${f}}} … {{/${f}}}` })))
          );
        }
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
    // บล็อกเงื่อนไข (เช่น {{#ได้โบนัส}}) ก็ต้องจับคู่กับคอลัมน์เหมือนตัวยึดธรรมดา
    // ไม่งั้นค่าจะไม่ถูกส่งเข้าเทมเพลตและเงื่อนไขจะไม่ทำงานเลย
    // ส่วนบล็อกวนซ้ำที่รับรายการ (ใช้ในโหมดจัดกลุ่ม) ไม่ต้องจับคู่ เพราะระบบสร้างให้เอง
    const negOf = (n) => (n.startsWith("ไม่") ? n.slice(2) : "ไม่" + n);
    const loopSet = new Set(loops);
    const condFields = loops.filter((l) => !loopSet.has(negOf(l)) || !l.startsWith("ไม่"));
    const mappable = [...fields, ...loops.filter((l) => !l.startsWith("ไม่"))];
    mappable.forEach((f) => {
      const guess = byNorm.get(norm(f)) || "";
      mapping[f] = guess;
      const sel = el("select", { onchange: (e) => { mapping[f] = e.target.value; renderPreview(); renderUnmatched(); refresh(); } });
      sel.appendChild(el("option", { value: "" }, "— ไม่ใช้ —"));
      columns.forEach((c) => sel.appendChild(el("option", { value: c, selected: c === guess }, c)));
      grid.append(
        el("code", { class: "mm-key", text: `{{${f}}}` }),
        el("span", { class: "mm-arrow" }, "←"),
        sel
      );
    });
    mapBox.append(el("p", { class: "mm-label" }, "ระบบจับคู่ให้อัตโนมัติเมื่อชื่อตรงกัน ปรับเองได้"), grid);

    renderUnmatched();

    nameCol.innerHTML = "";
    nameCol.appendChild(el("option", { value: "" }, "— ตั้งชื่อตามลำดับ —"));
    columns.forEach((c) => nameCol.appendChild(el("option", { value: c }, c)));

    groupCol.innerHTML = "";
    columns.forEach((c) => groupCol.appendChild(el("option", { value: c }, c)));
    loopSel.innerHTML = "";
    loops.forEach((l) => loopSel.appendChild(el("option", { value: l }, `{{#${l}}}`)));
    if (loops.length && modeSel.value === "row" && rows.length > new Set(rows.map(r => r[columns[0]])).size) {
      // ข้อมูลมีค่าซ้ำในคอลัมน์แรกและเทมเพลตมีบล็อกวนซ้ำ → น่าจะตั้งใจทำแบบจัดกลุ่ม
      modeSel.value = "group"; groupCol.value = columns[0];
    }
    syncMode();
    renderPreview();
  }

  // ── พรีวิวแถวแรก ให้เห็นผลก่อนสร้างจริง ─────────────────────────────────
  function renderPreview() {
    previewBox.innerHTML = "";
    if (!rows.length || !fields.length) { previewBox.hidden = true; return; }
    previewBox.hidden = false;
    const r = rows[0];
    const list = el("div", { class: "mm-preview" });
    const shown = [...fields, ...loops.filter((l) => !l.startsWith("ไม่") && mapping[l] !== undefined)];
    shown.forEach((f) => {
      const col = mapping[f];
      const v = col ? String(r[col] ?? "") : "";
      list.append(
        el("code", { class: "mm-key", text: `{{${f}}}` }),
        el("span", { class: "mm-arrow" }, "→"),
        el("span", { class: v ? "mm-val" : "mm-val empty", text: v || (col ? "(ว่างในแถวแรก)" : "(ยังไม่จับคู่)") })
      );
    });
    let head = `ตัวอย่างจากแถวแรกของข้อมูล — จะสร้างทั้งหมด ${rows.length.toLocaleString("th-TH")} ไฟล์`;
    if (modeSel.value === "group" && groupCol.value) {
      const n = new Set(rows.map((r) => String(r[groupCol.value] ?? ""))).size;
      head = `จัดกลุ่มตามคอลัมน์ “${groupCol.value}” — จะได้ ${n.toLocaleString("th-TH")} ไฟล์ จาก ${rows.length.toLocaleString("th-TH")} แถว`;
    }
    previewBox.append(el("p", { class: "mm-label" }, head), list);
  }

  // เตือนเฉพาะตัวยึดที่ผู้ใช้ต้องจับคู่จริง — ไม่นับบล็อกที่ระบบเติมรายการให้เองในโหมดจัดกลุ่ม
  let warnNode = null;
  function renderUnmatched() {
    warnNode?.remove(); warnNode = null;
    if (!mapBox || mapBox.hidden) return;
    const skip = modeSel.value === "group" && loopSel.value ? loopSel.value : null;
    const list = [...fields, ...loops.filter((l) => !l.startsWith("ไม่"))]
      .filter((f) => f !== skip && !mapping[f]);
    if (!list.length) return;
    warnNode = el("div", { class: "status show err", style: { marginTop: "12px" } },
      `ยังไม่ได้จับคู่ ${list.length} ตัวยึด: ${list.map((f) => `{{${f}}}`).join(" ")}`);
    mapBox.appendChild(warnNode);
  }

  function syncMode() {
    const grouped = modeSel.value === "group";
    groupField.style.display = grouped ? "" : "none";
    loopField.style.display = grouped ? "" : "none";
    renderPreview();
  }
  modeSel.addEventListener("change", () => { syncMode(); renderUnmatched(); refresh(); });
  groupCol.addEventListener("change", renderPreview);
  loopSel.addEventListener("change", () => { renderPreview(); renderUnmatched(); });

  const refresh = () => {
    const grouped = modeSel.value === "group";
    go.disabled = !(tplFile && rows.length && (fields.length || loops.length)
                    && (!grouped || (groupCol.value && loopSel.value)));
  };

  // ── สร้างเอกสารทั้งชุด ───────────────────────────────────────────────────
  async function run() {
    results.innerHTML = "";
    go.disabled = true;
    st.info("กำลังสร้างเอกสาร…");
    try {
      const base = stripExt(tplFile.name);
      const used = new Map();
      const nameOf = (record, i) => {
        const src = record.__rows ? record.__rows[0] : null;
        let label = "";
        if (nameCol.value) {
          label = src ? String(src[nameCol.value] ?? "").trim()
                      : String(record[Object.keys(mapping).find((f) => mapping[f] === nameCol.value)] ?? "").trim();
        }
        label = label.replace(/[\\/:*?"<>|]/g, "-").slice(0, 60);   // กันอักขระที่ตั้งชื่อไฟล์ไม่ได้
        let name = label ? `${base}-${label}` : `${base}-${i + 1}`;
        const n = (used.get(name) || 0) + 1;                        // ชื่อซ้ำให้เติมเลขต่อท้าย
        used.set(name, n);
        return (n > 1 ? `${name} (${n})` : name) + ".docx";
      };

      const cleanMapping = { ...mapping };
      if (modeSel.value === "group" && loopSel.value) delete cleanMapping[loopSel.value];
      const records = buildRecords(rows, {
        mode: modeSel.value,
        groupBy: groupCol.value,
        loopName: loopSel.value,
        mapping: cleanMapping,
      });

      const made = await mergeAll(tplFile, records, {
        nameOf,
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
