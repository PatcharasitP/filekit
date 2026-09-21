// ── ข้อความเป็น PDF ────────────────────────────────────────────────────────
// เคสจริง: มีข้อความจากโน้ต แชท หรือไฟล์ .txt แล้วต้องส่งเป็น PDF เพราะปลายทางขอแบบนั้น
// เดิมต้องเปิด Word วาง จัดหน้า แล้ว Save As PDF ซึ่งเสียเวลากับงานสองบรรทัด
//
// ‼️ รองรับภาษาไทยเต็มรูปแบบ ฝังฟอนต์ให้เลย และ **ตัดบรรทัดโดยไม่ฉีกคำไทย**
//   ใช้ตัวตัดคำเดียวกับที่เครื่องมือ Word เป็น PDF ใช้อยู่ ซึ่งพิสูจน์มาแล้ว
import { loadLibs } from "../loader.js";
import { useThaiFont, warmThaiFont, THAI_FONT, splitThaiTextToSize } from "../thaifont.js";
import { el, dropzone, statusBar, button, field, select, downloadButton,
         stripExt, yieldToBrowser, fmtBytes } from "../ui.js";
import { workspace } from "../workspace.js";
import { tr, pl } from "../i18n.js";

const PAPER = { a4: [595.28, 841.89], a5: [419.53, 595.28], letter: [612, 792] };

const STYLE = `
.tp-wrap{display:flex;flex-direction:column;gap:8px;height:100%;min-height:0}
.tp-ta{flex:1 1 auto;min-height:160px;width:100%;resize:none;font-family:inherit;font-size:14px;
  line-height:1.7;padding:12px 14px;border:1px solid var(--line);border-radius:var(--r-sm);
  background:var(--card);color:var(--text)}
.tp-ta:focus-visible{outline:2px solid var(--g-pdf);outline-offset:1px}
.tp-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12.5px;color:var(--text-mute)}
.tp-bar .grow{flex:1 1 auto}
.tp-note{font-size:12.5px;line-height:1.6;color:var(--text-mute);
  background:var(--bg-soft);border:1px solid var(--line-soft);border-radius:var(--r-sm);padding:9px 12px}
`;

export function mount(tool) {
  const st = statusBar();
  const results = el("div", { class: "results" });

  const ta = el("textarea", { class: "tp-ta", spellcheck: "false",
    /* ‼️ ห้ามบอกทิศทาง (แก้ 22/09/2026) เดิมเขียนว่า "มาวางทางซ้าย" แต่หน้า v2 แผงอยู่ขวา
       และบนมือถืออยู่ในแผ่นตัวเลือก · วางไฟล์ลงตรงไหนของหน้าก็รับ (ลองลากลงช่องนี้เองแล้ว ข้อความเข้าครบ) */
    placeholder: tr("พิมพ์หรือวางข้อความที่นี่ หรือลากไฟล์ .txt มาวางตรงไหนก็ได้",
                    "Type or paste your text here, or drop a .txt file anywhere on the page") });
  const counter = el("span", { class: "grow" });
  const clearBtn = button(tr("ล้างข้อความ", "Clear"), { ghost: true, onclick: () => { ta.value = ""; sync(); } });
  const wrap = el("div", { class: "tp-wrap" }, [
    ta, el("div", { class: "tp-bar" }, [counter, clearBtn]),
  ]);

  const paperSel = select([
    ["a4", "A4"], ["a5", "A5"], ["letter", tr("Letter (จดหมาย)", "Letter")],
  ], "a4");
  const sizeSel = select([["11", "11 pt"], ["13", "13 pt"], ["15", "15 pt"], ["18", "18 pt"]], "13");
  const marginSel = select([
    ["36", tr("ขอบแคบ", "Narrow")], ["57", tr("ขอบปกติ (2 ซม.)", "Normal (2 cm)")],
    ["85", tr("ขอบกว้าง (3 ซม.)", "Wide (3 cm)")],
  ], "57");
  const numSel = select([["off", tr("ไม่ใส่", "No")], ["on", tr("ใส่เลขหน้าให้", "Yes")]], "on");

  const go = button(tr("สร้างไฟล์ PDF", "Create the PDF"), { onclick: run });
  go.disabled = true;

  const dz = dropzone({
    accept: ".txt,.md,text/plain", multiple: false,
    expect: ["txt"], expectLabel: tr("ไฟล์ข้อความ (.txt)", "a text file (.txt)"),
    hint: tr("ไม่ใส่ไฟล์ก็ได้ พิมพ์เองในช่องกลางได้เลย", "A file is optional, you can just type in the middle"),
    onChange: onFile,
  });

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์ข้อความ (ถ้ามี)", "Text file (optional)"), node: dz.container },
    right: { title: tr("รูปแบบหน้า", "Page format"), node: el("div", {}, [
      field(tr("ขนาดกระดาษ", "Paper size"), paperSel),
      field(tr("ขนาดตัวอักษร", "Font size"), sizeSel),
      field(tr("ขอบกระดาษ", "Margin"), marginSel),
      field(tr("เลขหน้า", "Page numbers"), numSel),
      el("div", { class: "tp-note" },
         tr("ฝังฟอนต์ไทยให้อัตโนมัติ และตัดบรรทัดโดยไม่ฉีกคำไทย ข้อความในไฟล์ที่ได้ยังค้นหาและคัดลอกได้",
            "A Thai font is embedded for you and lines break without splitting Thai words. The text stays searchable and copyable")),
    ]) },
    center: { node: wrap },
    footer: [go, st.node],
  });
  ws.wrap.appendChild(el("style", {}, STYLE));
  ws.body.appendChild(results);
  /* ‼️ เครื่องมือนี้ใช้งานได้โดยไม่ต้องมีไฟล์ จึงต้องเปิดพื้นที่ทำงานไว้ตั้งแต่แรก
     ไม่งั้นผู้ใช้จะเจอหน้าว่างที่บอกให้เลือกไฟล์ ทั้งที่พิมพ์เองได้เลย */
  ws.showCanvas(true);
  warmThaiFont();

  function sync() {
    const text = ta.value;
    const chars = text.length;
    const lines = text ? text.split("\n").length : 0;
    counter.textContent = chars
      ? tr(`${chars.toLocaleString("th-TH")} ตัวอักษร, ${lines.toLocaleString("th-TH")} บรรทัด`,
           `${pl(chars.toLocaleString(), "character", "characters")}, ${pl(lines.toLocaleString(), "line", "lines")}`)
      : tr("ยังไม่มีข้อความ", "No text yet");
    go.disabled = !text.trim();
  }
  ta.addEventListener("input", sync);
  sync();

  async function onFile(fs) {
    const f = fs[0];
    results.innerHTML = "";
    st.clear();
    if (!f) return;
    try {
      /* ‼️ อ่านแบบ utf-8 ก่อน ถ้าเจออักขระอ่านไม่ออกให้ลอง windows-874 ซึ่งเป็นรหัสไทยเก่า
         ไฟล์ .txt ไทยที่ส่งต่อกันในราชการยังเป็น 874 อยู่มาก ถ้าไม่ดักจะได้ภาษาต่างดาว */
      const buf = await f.arrayBuffer();
      let text = new TextDecoder("utf-8").decode(buf);
      if (text.includes("�")) {
        try { text = new TextDecoder("windows-874").decode(buf); } catch { /* เบราว์เซอร์ไม่รู้จักก็ใช้ของเดิม */ }
      }
      ta.value = text;
      sync();
      st.ok(tr(`อ่านไฟล์แล้ว ${text.length.toLocaleString("th-TH")} ตัวอักษร`,
               `Loaded ${pl(text.length.toLocaleString(), "character", "characters")}`));
    } catch (e) {
      st.err(tr("อ่านไฟล์ไม่ได้: ", "Couldn't read the file: ") + e.message);
    }
  }

  async function run() {
    const text = ta.value;
    if (!text.trim()) return st.err(tr("ยังไม่มีข้อความ", "There is no text yet"));
    results.innerHTML = "";
    go.disabled = true;
    ws.setBusy(true);
    st.info(tr("กำลังสร้างไฟล์ PDF…", "Creating the PDF…"));
    try {
      const [jspdfNS] = await loadLibs("jspdf");
      const { jsPDF } = jspdfNS;
      const [pw, ph] = PAPER[paperSel.value] || PAPER.a4;
      const doc = new jsPDF({ unit: "pt", format: [pw, ph] });
      await useThaiFont(doc, "normal");

      const size = +sizeSel.value || 13;
      const margin = +marginSel.value || 57;
      const lh = size * 1.7;          /* ‼️ ไทยต้องอย่างน้อย 1.3 เท่า ใช้ 1.7 ให้สระบนล่างไม่ชนกัน */
      const maxW = pw - margin * 2;
      doc.setFont(THAI_FONT, "normal");
      doc.setFontSize(size);

      /* ตัดบรรทัดทีละย่อหน้า โดยไม่ฉีกคำไทย */
      const paras = text.replace(/\r\n?/g, "\n").split("\n");
      const lines = [];
      for (const p of paras) {
        if (!p.trim()) { lines.push(""); continue; }
        for (const l of splitThaiTextToSize(doc, p, maxW)) lines.push(l);
      }

      let y = margin + size;
      let pageNo = 1;
      const bottom = ph - margin - (numSel.value === "on" ? lh : 0);
      for (let i = 0; i < lines.length; i++) {
        if (y > bottom) {
          if (numSel.value === "on") stampNumber(doc, pageNo, pw, ph, margin, size);
          doc.addPage([pw, ph]);
          doc.setFont(THAI_FONT, "normal");
          doc.setFontSize(size);
          pageNo++;
          y = margin + size;
        }
        if (lines[i]) doc.text(lines[i], margin, y);
        y += lh;
        if (i % 60 === 59) await yieldToBrowser();
      }
      if (numSel.value === "on") stampNumber(doc, pageNo, pw, ph, margin, size);

      const blob = doc.output("blob");
      const name = (dz.files[0] ? stripExt(dz.files[0].name) : tr("ข้อความ", "text")) + ".pdf";
      st.ok(tr(`สร้างเสร็จ ${pageNo} หน้า`, `Done, ${pl(pageNo, "page", "pages")}`));
      results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, name),
          el("small", {}, tr(`${pageNo} หน้า, ${fmtBytes(blob.size)}`,
                             `${pl(pageNo, "page", "pages")}, ${fmtBytes(blob.size)}`))]),
        downloadButton(blob, name),
      ]));
    } catch (e) {
      st.err(tr("สร้างไฟล์ไม่สำเร็จ: ", "Couldn't create the file: ") + e.message);
    } finally {
      go.disabled = false;
      ws.setBusy(false);
    }
  }

  function stampNumber(doc, n, pw, ph, margin, size) {
    doc.setFontSize(size * 0.8);
    const s = String(n);
    doc.text(s, pw / 2 - doc.getTextWidth(s) / 2, ph - margin / 2);
    doc.setFontSize(size);
  }

  return ws.wrap;
}
