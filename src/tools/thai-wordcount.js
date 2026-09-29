// ── นับคำภาษาไทย ─────────────────────────────────────────────────────────────
// เคสจริง: ต้องส่งบทความ แคปชัน หรือบทคัดย่อที่จำกัดจำนวนคำ แต่ตัวนับคำทั่วไปตัดคำด้วยช่องว่าง
// พิมพ์ประโยคไทยยาวแค่ไหนก็ได้ 1 คำ (วัด wordcounter.net 29/09/2026 ได้ 5 คำจากประโยคที่มี 14)
//
// ‼️ นับด้วยตัวตัดคำของเบราว์เซอร์ ซึ่งยังพลาดกับคำทับศัพท์และแยกคำประสม
//   ตัวเลขจึงเป็นค่าประมาณเสมอ หน้าจอบอกตรง ๆ และโชว์เส้นแบ่งคำให้ตรวจเองได้
import { countText, segmentWords } from "../thaiwords.js";
import { el, dropzone, statusBar, button } from "../ui.js";
import { workspace } from "../workspace.js";
import { tr, pl } from "../i18n.js";

/* ‼️ เส้นแบ่งคำวาดทีละคำ ข้อความยาวมากจะหน่วง จึงวาดแค่ช่วงแรกแล้วบอกว่าตัดไว้ */
const PREVIEW_MAX = 1500;

const STYLE = `
.tw-wrap{display:flex;flex-direction:column;gap:10px;height:100%;min-height:0}
.tw-ta{flex:1 1 55%;min-height:150px;width:100%;resize:none;font-family:inherit;font-size:14px;
  line-height:1.7;padding:12px 14px;border:1px solid var(--line);border-radius:var(--r-sm);
  background:var(--card);color:var(--text)}
.tw-ta:focus-visible{outline:2px solid var(--g-thai);outline-offset:1px}
.tw-cap{font-size:12.5px;color:var(--text-mute)}
.tw-sum{font-size:14px;font-weight:600;color:var(--text);font-variant-numeric:tabular-nums}
.tw-seg{flex:1 1 45%;min-height:90px;overflow:auto;padding:10px 12px;line-height:2.1;font-size:14px;
  border:1px solid var(--line-soft);border-radius:var(--r-sm);background:var(--bg-soft);color:var(--text)}
.tw-w{border-radius:4px;padding:1px 2px;background:color-mix(in srgb,var(--g-thai) 12%,transparent)}
.tw-w:nth-child(even){background:color-mix(in srgb,var(--g-thai) 24%,transparent)}
.tw-stats{display:grid;grid-template-columns:1fr auto;gap:6px 12px;font-size:13.5px;margin:0}
.tw-stats dt{color:var(--text-mute)}
.tw-stats dd{margin:0;text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
.tw-stats .big{font-size:22px;line-height:1.2}
.tw-note{font-size:12.5px;line-height:1.6;color:var(--text-mute);
  background:var(--bg-soft);border:1px solid var(--line-soft);border-radius:var(--r-sm);padding:9px 12px;margin-top:10px}
`;

const fmt = (n) => n.toLocaleString(tr("th-TH", "en-US"));

export function mount(tool) {
  const st = statusBar();

  const ta = el("textarea", { class: "tw-ta", spellcheck: "false",
    placeholder: tr("พิมพ์หรือวางข้อความที่นี่ หรือลากไฟล์ .txt มาวางตรงไหนก็ได้",
                    "Type or paste your text here, or drop a .txt file anywhere on the page") });
  const seg = el("div", { class: "tw-seg", "aria-label": tr("ข้อความที่แบ่งเป็นคำแล้ว", "Text split into words") });
  const segCap = el("div", { class: "tw-cap" });
  /* ‼️ บนมือถือแผงผลนับอยู่หลังปุ่มตัวเลือก (เห็นในภาพ 390px 29/09/2026) จึงสรุปเลขหลักไว้ใต้ช่องพิมพ์ด้วย */
  const sum = el("div", { class: "tw-sum", role: "status", "aria-live": "polite" });
  const wrap = el("div", { class: "tw-wrap" }, [ta, sum, segCap, seg]);

  const rows = {};
  const row = (key, label) => { rows[key] = el("dd", {}, "0"); return [el("dt", {}, label), rows[key]]; };
  const stats = el("dl", { class: "tw-stats" }, [
    ...row("words", tr("คำ (โดยประมาณ)", "Words (approx.)")),
    ...row("thaiWords", tr("คำภาษาไทย", "Thai words")),
    ...row("otherWords", tr("คำภาษาอื่นและตัวเลข", "Other words and numbers")),
    ...row("graphemes", tr("ตัวอักษร ไม่นับช่องว่าง", "Characters, no spaces")),
    ...row("codeUnits", tr("อักขระแบบ Excel LEN", "Characters as Excel LEN counts")),
    ...row("lines", tr("บรรทัด", "Lines")),
    ...row("paragraphs", tr("ย่อหน้า", "Paragraphs")),
  ]);
  rows.words.classList.add("big");

  const copyBtn = button(tr("คัดลอกผลนับ", "Copy the counts"), { onclick: copy });
  const clearBtn = button(tr("ล้างข้อความ", "Clear"), { ghost: true, onclick: () => { ta.value = ""; sync(); ta.focus(); } });

  const dz = dropzone({
    accept: ".txt,.md,text/plain", multiple: false,
    expect: ["txt"], expectLabel: tr("ไฟล์ข้อความ (.txt)", "a text file (.txt)"),
    hint: tr("ไม่ใส่ไฟล์ก็ได้ พิมพ์หรือวางในช่องกลางได้เลย", "A file is optional, you can just type or paste in the middle"),
    onChange: onFile,
  });

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์ข้อความ (ถ้ามี)", "Text file (optional)"), node: dz.container },
    right: { title: tr("ผลนับ", "Counts"), node: el("div", {}, [
      stats,
      /* ‼️ ข้อความไทยต่อก้อนห้ามเกิน 100 ตัวอักษร (tests/browser_layout.py) จึงแบ่งเป็นสองประโยค */
      el("div", { class: "tw-note" }, [
        el("p", { style: "margin:0 0 6px" },
           tr("ภาษาไทยไม่เว้นวรรคระหว่างคำ ตัวนับคำทั่วไปจึงนับทั้งประโยคเป็นคำเดียว ที่นี่ตัดคำด้วยพจนานุกรม",
              "Thai has no spaces between words, so ordinary counters see a whole sentence as one word. This one uses a dictionary")),
        el("p", { style: "margin:0" },
           tr("คำประสมอย่าง ยอดขาย อาจนับเป็นสองคำ ดูเส้นแบ่งคำใต้ช่องพิมพ์ได้ว่านับตรงไหน",
              "Compounds may count as two words, the strip under the text box shows every cut")),
      ]),
    ]) },
    center: { node: wrap },
    footer: [copyBtn, clearBtn, st.node],
  });
  ws.wrap.appendChild(el("style", {}, STYLE));
  /* ไม่ต้องมีไฟล์ก็ใช้ได้ เปิดพื้นที่ทำงานไว้ตั้งแต่แรก (แบบเดียวกับข้อความเป็น PDF) */
  ws.showCanvas(true);

  let last = null;
  let timer = 0;
  function sync() {
    const text = ta.value;
    last = countText(text);
    for (const k of Object.keys(rows)) rows[k].textContent = fmt(last[k]);
    copyBtn.disabled = !text.trim();
    sum.textContent = text.trim()
      ? tr(`${fmt(last.words)} คำ (โดยประมาณ), ${fmt(last.graphemes)} ตัวอักษร, ${fmt(last.lines)} บรรทัด`,
           `${pl(fmt(last.words), "word", "words")} (approx.), ${pl(fmt(last.graphemes), "character", "characters")}, ${pl(fmt(last.lines), "line", "lines")}`)
      : "";
    drawSegments(text);
  }
  ta.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(sync, 120); });

  function drawSegments(text) {
    seg.textContent = "";
    if (!text.trim()) {
      segCap.textContent = tr("เส้นแบ่งคำจะขึ้นตรงนี้ แต่ละคำสลับสีให้เห็นว่าตัดตรงไหน",
                              "Word boundaries show up here, alternating shades mark each word");
      return;
    }
    let n = 0, cut = false;
    const frag = document.createDocumentFragment();
    for (const p of segmentWords(text)) {
      if (p.word) {
        if (n >= PREVIEW_MAX) { cut = true; break; }
        frag.appendChild(el("span", { class: "tw-w" }, p.text));
        n++;
      } else {
        frag.appendChild(document.createTextNode(p.text));
      }
    }
    seg.appendChild(frag);
    segCap.textContent = cut
      ? tr(`เส้นแบ่งคำ แสดง ${fmt(PREVIEW_MAX)} คำแรก (ผลนับด้านข้างนับครบทุกคำ)`,
           `Word boundaries, first ${fmt(PREVIEW_MAX)} words shown (the counts include every word)`)
      : tr("เส้นแบ่งคำ แต่ละคำสลับสี", "Word boundaries, alternating shades");
  }

  async function copy() {
    if (!last) return;
    const lines = [
      tr(`คำ (โดยประมาณ) ${fmt(last.words)}`, `Words (approx.) ${fmt(last.words)}`),
      tr(`คำภาษาไทย ${fmt(last.thaiWords)}`, `Thai words ${fmt(last.thaiWords)}`),
      tr(`คำภาษาอื่นและตัวเลข ${fmt(last.otherWords)}`, `Other words and numbers ${fmt(last.otherWords)}`),
      tr(`ตัวอักษร ไม่นับช่องว่าง ${fmt(last.graphemes)}`, `Characters, no spaces ${fmt(last.graphemes)}`),
      tr(`อักขระแบบ Excel LEN ${fmt(last.codeUnits)}`, `Characters as Excel LEN counts ${fmt(last.codeUnits)}`),
      tr(`บรรทัด ${fmt(last.lines)}`, `Lines ${fmt(last.lines)}`),
      tr(`ย่อหน้า ${fmt(last.paragraphs)}`, `Paragraphs ${fmt(last.paragraphs)}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      st.ok(tr("คัดลอกผลนับแล้ว", "Counts copied"));
    } catch {
      st.err(tr("คัดลอกไม่สำเร็จ ลองเลือกข้อความในแผงผลนับแล้วคัดลอกเอง", "Could not copy, select the counts panel and copy it yourself"));
    }
  }

  async function onFile(fs) {
    const f = fs[0];
    st.clear();
    if (!f) return;
    try {
      /* ‼️ ไฟล์ .txt ไทยเก่ายังเป็น windows-874 อยู่มาก อ่าน utf-8 แล้วเจออักขระเสียให้ลองอีกรหัส (แบบเดียวกับข้อความเป็น PDF) */
      const buf = await f.arrayBuffer();
      let text = new TextDecoder("utf-8").decode(buf);
      if (text.includes("�")) {
        try { text = new TextDecoder("windows-874").decode(buf); } catch { /* เบราว์เซอร์ไม่รู้จักก็ใช้ของเดิม */ }
      }
      ta.value = text;
      sync();
      st.ok(tr(`อ่านไฟล์แล้ว ${fmt(text.length)} อักขระ`, `Loaded ${pl(fmt(text.length), "character", "characters")}`));
    } catch (e) {
      st.err(tr("อ่านไฟล์ไม่ได้: ", "Couldn't read the file: ") + e.message);
    }
  }

  sync();
  return ws.wrap;
}
