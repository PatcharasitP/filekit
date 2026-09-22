// ─────────────────────────────────────────────────────────────────────────────
// FlowKit หน้าวาดผัง: ข้อความ → FlowModel → Mermaid → draw.io → PNG ฝัง XML
//
// ‼️ ผังที่เห็นบนจอคือไฟล์ที่จะได้จริงทุกพิกเซล (ภาพเดียวกับที่ดาวน์โหลด) ไม่มีตัววาดพรีวิวแยกอีกตัว
// ‼️ ข้อความของผู้ใช้เก็บใน sessionStorage เท่านั้น (สลับภาษา = โหลดหน้าใหม่ ต้องไม่หาย)
//    ปิดแท็บแล้วหายตั้งใจ เครื่องที่ใช้ร่วมกันจะไม่มีผังของคนก่อนค้างอยู่
// ─────────────────────────────────────────────────────────────────────────────
import { tr, IS_EN, setLang } from "../../src/i18n.js";
import { parseText } from "./parse.js";
import { toMermaid, STRETCH_Y } from "./to-mermaid.js";
import { createEngine } from "./engine.js";
import { createEditor } from "./editor.js";
import { SAMPLES } from "./samples.js";

const $ = (s) => document.querySelector(s);
const ta = $("#src"), hl = $("#hl"), hint = $("#hint"), msg = $("#msg");
const canvas = $("#canvas"), img = $("#png"), cvmsg = $("#cvmsg"), cvnote = $("#cvnote"), live = $("#live"), dl = $("#dl");
const editBtn = $("#edit"), room = $("#room"), fileIn = $("#filein");
const KINDS = ["steps", "org", "system", "timeline"];
const SAMPLE = SAMPLES[IS_EN ? "en" : "th"];
const DEBOUNCE_MS = 400;                          // แผนเฟส 2 ข้อ 5
const isPhone = () => matchMedia("(max-width:760px)").matches;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* โหมดส่วนตัว */ } },
};

/* ── ธีม กับ ภาษา (พฤติกรรมเดียวกับหน้าแรก src/app.js) ── */
{
  const btn = $("#theme");
  const name = { light: tr("โหมดสว่าง", "light"), dark: tr("โหมดมืด", "dark") };
  const apply = (v) => {
    if (v === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
    btn.ariaLabel = tr(`ธีม: ${name[v] || "ตามเครื่อง"} (กดเพื่อสลับ)`, `Theme: ${name[v] || "system"} (click to switch)`);
  };
  apply(store.get("fk-theme", "auto"));
  btn.addEventListener("click", () => {
    const cur = store.get("fk-theme", "auto");
    const now = cur !== "auto" ? cur : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = now === "dark" ? "light" : "dark";
    store.set("fk-theme", next);
    apply(next);
  });
  for (const b of document.querySelectorAll("#lang .langopt")) {
    const cur = b.dataset.lang === (IS_EN ? "en" : "th");
    b.setAttribute("aria-current", String(cur));
    b.setAttribute("aria-label", b.dataset.lang === "th" ? "ภาษาไทย" : "English");
    if (!cur) b.addEventListener("click", () => { saveDraft(); setLang(b.dataset.lang); });
  }
  /* ลิงก์หมวดในแถบท้ายเว็บ ฝากหมวดไว้ให้หน้าแรกกรองให้ (กลไกเดียวกับ src/app.js) */
  for (const a of document.querySelectorAll(".sites a[data-gocat]")) {
    a.addEventListener("click", () => { try { if (a.dataset.gocat) sessionStorage.setItem("fk:gocat", a.dataset.gocat); } catch { /* โหมดส่วนตัว */ } });
  }
}

/* ‼️ เปิดจากแอปแชท (LINE ฯลฯ) ดาวน์โหลดตรง ๆ ไม่ได้ ต้องส่งผ่าน share sheet
   โหลดโมดูลไว้ก่อนตั้งแต่เปิดหน้า เพราะตอนกดห้ามมี await ก่อน navigator.share (ดู src/inapp.js)
   ‼️ รายชื่อแอปต้องตรงกับ src/app.js และครอบทุกแอปใน SIGNS ของ inapp.js (tests/accepts.test.mjs จับ) */
const MAYBE_IN_APP = /Line\/|FBAN|FBAV|FB_IAB|FB4A|Instagram|Messenger|BytedanceWebview|musical_ly|TikTok/i;
let inapp = null;
if (MAYBE_IN_APP.test(navigator.userAgent)) {
  import("../../src/inapp.js").then((m) => {
    inapp = m;
    const bar = m.inAppBanner();
    if (bar) $("header.top").after(bar);
  }).catch(() => {});
}

/* ── ข้อความของแต่ละชนิดผัง: กดสลับชนิดแล้วของที่พิมพ์ไว้ไม่หาย กลับมาก็ยังอยู่ ── */
const HINTS = {
  steps: tr("หนึ่งบรรทัดคือหนึ่งกล่อง , ลงท้ายด้วย ? คือจุดตัดสินใจ , ย่อหน้าใต้คำถามแล้วเขียน คำตอบ: ขั้นถัดไป",
            "One line is one box, end with ? for a decision, indent the answers under it as answer: next step"),
  org: tr("หนึ่งบรรทัดคือหนึ่งคนหรือหนึ่งทีม , ย่อหน้าเข้าไปคือคนที่ขึ้นกับบรรทัดข้างบน",
          "One line is one person or team, indent a line to put it under the line above"),
  system: tr("หนึ่งบรรทัดคือหนึ่งเส้น เขียนว่า ต้นทาง -> ปลายทาง: สิ่งที่ส่ง , ใช้ --> เป็นเส้นประ , <-> เป็นสองทาง",
             "One line is one arrow, write from -> to: what moves, use --> for dashed and <-> for both ways"),
  timeline: tr("หนึ่งบรรทัดคือหนึ่งช่วง เขียนว่า ช่วงเวลา: งาน , ย่อหน้าเพื่อเพิ่มงานในช่วงเดียวกัน",
               "One line is one period, write period: task, indent to add more tasks to the same period"),
};
const DRAFT_KEY = "fk-flow";
let kind = "steps";
const texts = { steps: null, org: null, system: null, timeline: null };   // null = ยังเป็นตัวอย่าง
try {
  const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
  if (d && KINDS.includes(d.kind)) kind = d.kind;
  if (d && d.texts) for (const k of KINDS) if (typeof d.texts[k] === "string") texts[k] = d.texts[k];
} catch { /* โหมดส่วนตัว หรือของเสีย */ }
const textOf = (k) => texts[k] ?? SAMPLE[k];
function saveDraft() {
  texts[kind] = ta.value === SAMPLE[kind] ? null : ta.value;
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ kind, texts })); } catch { /* โหมดส่วนตัว */ }
}

function setKind(k, first = false) {
  if (!first) saveDraft();
  kind = k;
  for (const b of document.querySelectorAll("#types .type")) b.setAttribute("aria-pressed", String(b.dataset.kind === k));
  hint.textContent = HINTS[k];
  ta.value = textOf(k);
  ta.scrollTop = 0;
  if (!first) { saveDraft(); update(); }
}
for (const b of document.querySelectorAll("#types .type")) b.addEventListener("click", () => { if (b.dataset.kind !== kind) setKind(b.dataset.kind); });

/* ── ช่องพิมพ์: Tab ย่อหน้า , Enter ต่อบรรทัดด้วยย่อหน้าเดิม (หลังคำถามย่อให้อีกชั้น) ──
 * ‼️ แทรกข้อความด้วย execCommand("insertText") เท่านั้น ตั้ง ta.value ตรง ๆ แล้ว Ctrl+Z ย้อนไม่ได้
 * ‼️ กด Esc แล้ว Tab = ออกจากช่อง (กันคนใช้คีย์บอร์ดติดอยู่ในช่องพิมพ์ WCAG 2.1.2) */
/* ‼️ ห้ามแทรกข้อความว่าง: Chrome ทำ insertText "" แล้วเคอร์เซอร์ถอยไปอยู่หน้าบรรทัดก่อน ตัวที่พิมพ์ต่อไปติดท้ายบรรทัดบน
 *    (จับค่าจริง 22/09/2026 ค่า selectionStart ได้ 9 แทน 10) ต้องการลบให้ใช้ delete กับช่วงที่เลือกแทน */
const insert = (s) => {
  if (!s) { if (!document.execCommand("delete")) ta.setRangeText("", ta.selectionStart, ta.selectionEnd, "end"); return; }
  if (!document.execCommand("insertText", false, s)) ta.setRangeText(s, ta.selectionStart, ta.selectionEnd, "end");
};
let escaped = false;
ta.addEventListener("keydown", (e) => {
  if (e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === "Escape") { escaped = true; return; }
  if (e.key === "Tab") {
    if (escaped) { escaped = false; return; }
    e.preventDefault();
    indentLines(e.shiftKey ? -1 : 1);
    return;
  }
  escaped = false;
  if (e.key === "Enter" && !e.shiftKey) {
    const v = ta.value, at = ta.selectionStart;
    const start = v.lastIndexOf("\n", at - 1) + 1;
    const line = v.slice(start, at);
    const pad = line.match(/^ */)[0];
    if (!line.trim() && pad.length >= 2 && ta.selectionStart === ta.selectionEnd) {
      /* Enter บนบรรทัดว่างที่ย่อหน้าอยู่ = ถอยออกหนึ่งชั้น กลับไประดับหลักได้โดยไม่ต้องลบวรรคเอง */
      e.preventDefault();
      ta.setSelectionRange(at - 2, at);
      insert("");
      return;
    }
    e.preventDefault();
    insert("\n" + pad + (/[?？:：]\s*$/.test(line) ? "  " : ""));
  }
});
function indentLines(dir) {
  const v = ta.value;
  const s = ta.selectionStart, eSel = ta.selectionEnd;
  const start = v.lastIndexOf("\n", s - 1) + 1;
  const endNl = v.indexOf("\n", eSel > s && v[eSel - 1] === "\n" ? eSel - 1 : eSel);
  const end = endNl < 0 ? v.length : endNl;
  const block = v.slice(start, end).split("\n");
  const out = block.map((l) => dir > 0 ? "  " + l : l.replace(/^ {1,2}/, ""));
  if (out.join("\n") === block.join("\n")) return;           // ไม่มีวรรคให้ถอยแล้ว
  const moved0 = out[0].length - block[0].length;
  ta.setSelectionRange(start, end);
  insert(out.join("\n"));
  if (s === eSel) { const p = Math.max(start, s + moved0); ta.setSelectionRange(p, p); }
  else ta.setSelectionRange(start, start + out.join("\n").length);
}

/* ── แถบสีใต้บรรทัดที่ผิด (ชั้นกระจกใต้ช่องพิมพ์ ตัวอักษรโปร่งใส) ── */
let hlLine = 0;
function paintHighlight(lineNo) {
  hlLine = lineNo;
  hl.replaceChildren();
  if (!lineNo) return;
  const lines = ta.value.split(/\r\n|\r|\n/);
  const before = lines.slice(0, lineNo - 1).join("\n");
  hl.append(before + (lineNo > 1 ? "\n" : ""));
  const mark = document.createElement("mark");
  mark.textContent = lines[lineNo - 1] || " ";
  hl.append(mark, "\n" + lines.slice(lineNo).join("\n") + "\n");
  hl.scrollTop = ta.scrollTop;
}
ta.addEventListener("scroll", () => { if (hlLine) hl.scrollTop = ta.scrollTop; });
function goToLine(n) {
  const lines = ta.value.split("\n");
  const at = lines.slice(0, n - 1).reduce((a, l) => a + l.length + 1, 0);
  ta.focus();
  ta.setSelectionRange(at, at + (lines[n - 1] || "").length);
  /* เลื่อนให้บรรทัดนั้นอยู่กลางช่อง (textarea ไม่มีคำสั่งเลื่อนไปที่บรรทัดให้ ต้องคำนวณเอง) */
  const lh = parseFloat(getComputedStyle(ta).lineHeight) || 28;
  ta.scrollTop = Math.max(0, (n - 1) * lh - ta.clientHeight / 2);
}

/* ── ข้อผิดพลาด (บอกบรรทัด บอกทางแก้) กับคำเตือน ── */
const lineLabel = (n) => tr(`บรรทัด ${n}`, `Line ${n}`);
function showMessages(r) {
  msg.replaceChildren();
  if (r.error) {
    const e = r.error;
    const box = document.createElement("div");
    box.className = "err";
    const b = document.createElement("b");
    b.textContent = lineLabel(e.line);
    box.append(b, " " + e.message);
    if (e.hint) { const f = document.createElement("span"); f.className = "fix"; f.textContent = e.hint; box.append(f); }
    const go = document.createElement("button");
    go.type = "button"; go.className = "go";
    go.textContent = tr("ไปที่บรรทัดนี้", "Go to this line");
    go.addEventListener("click", () => goToLine(e.line));
    box.append(go);
    msg.append(box);
  }
  const warns = r.model ? r.model.warnings : [];
  if (warns.length) {
    const ul = document.createElement("ul");
    for (const w of warns.slice(0, 3)) {
      const li = document.createElement("li");
      li.textContent = (w.line ? lineLabel(w.line) + " " : "") + w.text;
      ul.append(li);
    }
    if (warns.length > 3) {
      const li = document.createElement("li");
      li.textContent = tr(`และอีก ${warns.length - 3} ข้อ`, `and ${warns.length - 3} more`);
      ul.append(li);
    }
    msg.append(ul);
  }
}

/* ── พื้นที่ผัง ── */
function setCanvas(state, text = "", withRetry = false) {
  canvas.dataset.state = state;
  cvmsg.replaceChildren();
  if (text) {
    const [head, ...rest] = [].concat(text);
    const b = document.createElement("b"); b.textContent = head; cvmsg.append(b);
    for (const t of rest) { const s = document.createElement("span"); s.textContent = t; cvmsg.append(s); }
  }
  if (withRetry) {
    const r = document.createElement("button");
    r.type = "button"; r.textContent = tr("ลองใหม่", "Try again");
    r.addEventListener("click", retry);
    cvmsg.append(r);
  }
}
/* กดที่ผัง = ดูขนาดจริงแล้วเลื่อนดู กดอีกทีกลับมาเห็นทั้งผัง
   ‼️ ใช้ได้เฉพาะตอนที่ผังถูกย่อให้พอดีกรอบ ผังเล็กที่เห็นขนาดจริงอยู่แล้ว กดแล้วแค่กระโดดขึ้นลง
      (พี่ปอนด์ทัก 22/09/2026 "กดแล้วมันขยับขึ้นลงคือไร" วัดได้ผังองค์กร 633x296 เท่ากันทั้งสองโหมด ย้ายจากกลางกรอบขึ้นไปชิดบนเฉย ๆ) */
function updateZoomable() {
  if ("zoom" in canvas.dataset) return;
  const shrunk = img.naturalWidth > 0 && (img.clientWidth < img.naturalWidth - 1 || img.clientHeight < img.naturalHeight - 1);
  if (shrunk && !isPhone()) canvas.dataset.zoomable = ""; else delete canvas.dataset.zoomable;
}
img.addEventListener("load", updateZoomable);
new ResizeObserver(updateZoomable).observe(canvas);
img.addEventListener("click", () => {
  if ("zoom" in canvas.dataset) { delete canvas.dataset.zoom; updateZoomable(); return; }
  if ("zoomable" in canvas.dataset) canvas.dataset.zoom = "";
});
const unzoom = () => { delete canvas.dataset.zoom; delete canvas.dataset.zoomable; };

/* ต่อ draw.io ไม่ได้: บอกตรง ๆ ว่าโหลดมาจากไหน กดลองใหม่ได้ และถ้าต่อได้ทีหลังผังขึ้นเองไม่ต้องกด */
let engineState = "booting";
const engineDown = () => engineState === "offline" || engineState === "unreachable";
const engine = createEngine({
  onState(s) {
    engineState = s;
    const waiting = !current || canvas.dataset.state === "error";
    if (s === "slow" && canvas.dataset.state === "booting") {
      setCanvas("booting", [tr("กำลังเตรียมตัววาดผัง", "Getting the diagram engine ready"),
        tr("ครั้งแรกต้องโหลดตัววาดผังของ draw.io ก่อน เน็ตช้าอาจใช้เวลาสักครู่", "The first visit loads draw.io, it can take a moment on a slow connection")]);
    } else if (s === "unreachable") {
      setCanvas("error", [tr("ยังต่อตัววาดผังไม่ได้", "Cannot reach the diagram engine yet"),
        tr("ตัววาดผังโหลดมาจาก diagrams.net ถ้าเน็ตช้ารอสักครู่ ผังจะขึ้นเอง ถ้าเครือข่ายบล็อกเว็บนี้จะวาดไม่ได้",
           "It loads from diagrams.net. On a slow connection just wait, the diagram appears by itself. A network that blocks that site cannot draw")], true);
      dl.disabled = true;
    } else if (s === "offline") {
      setCanvas("error", [tr("ไม่ได้ต่ออินเทอร์เน็ต", "You are offline"),
        tr("ตัววาดผังต้องโหลดจาก diagrams.net ต่อเน็ตแล้วผังจะขึ้นเอง", "The diagram engine loads from diagrams.net, it draws as soon as you are back online")], true);
      dl.disabled = true;
    } else if (s === "ready" && waiting && canvas.dataset.state === "error") {
      setCanvas("booting", [tr("กำลังวาดผัง", "Drawing")]);
    }
  },
});
function retry() { engine.retry(); lastMmd = ""; update(); }

/** ชื่อไฟล์จาก ชื่อ: หรือกล่องแรก (แผนเฟส 3 ข้อ 1) */
function fileName(model) {
  const raw = model.title || (model.nodes[0] ? model.nodes[0].text.split(" | ")[0] : "") || "FlowKit";
  const safe = raw.replace(/[\\/:*?"<>|#%\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60).trim();
  return (safe || "FlowKit") + ".drawio.png";
}
const KIND_NAME = { steps: tr("ผังขั้นตอน", "Process diagram"), org: tr("ผังองค์กร", "Org chart"),
  system: tr("ผังระบบ", "Systems diagram"), timeline: tr("ไทม์ไลน์", "Timeline") };

/** เอาภาพผัง (PNG ฝัง XML) ขึ้นจอ และเป็นไฟล์ที่ปุ่มดาวน์โหลดจะให้ */
function show(png, xml, name, alt) {
  if (current) URL.revokeObjectURL(current.url);
  current = { blob: png, url: URL.createObjectURL(png), name, xml };
  unzoom();
  /* ‼️ ภาพส่งออกที่ 2 เท่า บอกเบราว์เซอร์ด้วย srcset 2x ขนาดจริงของภาพจึงเท่าผังจริง
     ผังเล็กจึงแสดงเท่าขนาดจริง ไม่ถูกขยายจนตัวหนังสือโตเกินจริง (เห็นเองกับตาบนผังระบบ 4 กล่อง 22/09/2026 ดู flow.css)
     ‼️ ห้ามใส่ src คู่กัน: src นับเป็นตัวเลือก 1x จอความละเอียดปกติจึงเลือก src แล้วผังโตสองเท่า
        (วัดจริง naturalWidth 626 บนจอ 1x กับ 313 บนจอ 2x ภาพเดียวกัน) */
  img.removeAttribute("src");
  img.srcset = `${current.url} 2x`;
  img.alt = alt;
  img.hidden = false;
  setCanvas("ready");
  dl.disabled = false;
  editBtn.disabled = false;
}

/* ── ผังที่แก้ด้วยมือในห้องแก้ไข (แผนเฟส 3 ข้อ 4) ────────────────────────────
 * ‼️ ข้อความกับผังแยกทางกันได้ ไม่พยายามซิงก์สองทาง: แก้ด้วยมือแล้ว พิมพ์ต่อจะไม่วาดทับเอง
 *    ป้ายบนผังบอกว่าข้อความเปลี่ยนแล้ว และให้ผู้ใช้เลือกกด "วาดใหม่จากข้อความ" เอง (ที่แก้ไว้จะหาย)
 * เก็บผังที่แก้ใน sessionStorage (autosave ของ draw.io) โหลดหน้าใหม่หรือสลับภาษาแล้วยังอยู่ ปิดแท็บแล้วหาย */
const EDIT_KEY = "fk-flow-edit";
let edited = null;        // { text, kind } ข้อความตอนเริ่มแก้ด้วยมือ
let editBase = null, editName = "";
let savedRecord = null;   // ผังที่กดบันทึกแล้วล่าสุด ใช้คืนค่าถ้าผู้ใช้ออกจากห้องโดยไม่บันทึก
const readRecord = () => { try { return JSON.parse(sessionStorage.getItem(EDIT_KEY) || "null"); } catch { return null; } };
const writeRecord = (r) => { try { r ? sessionStorage.setItem(EDIT_KEY, JSON.stringify(r)) : sessionStorage.removeItem(EDIT_KEY); } catch { /* โหมดส่วนตัว */ } };

function paintEditNote() {
  cvnote.replaceChildren();
  cvnote.hidden = !edited;
  if (!edited) return;
  const diverged = ta.value !== edited.text || kind !== edited.kind;
  const b = document.createElement("b");
  b.textContent = diverged ? tr("ข้อความเปลี่ยนแล้ว แต่ผังยังเป็นแบบที่แก้ด้วยมือ", "The text changed, the diagram still has your manual edits")
                           : tr("ผังนี้แก้ด้วยมือแล้ว", "This diagram has manual edits");
  const go = document.createElement("button");
  go.type = "button";
  go.textContent = tr("วาดใหม่จากข้อความ", "Redraw from the text");
  go.title = "";
  go.setAttribute("aria-label", tr("วาดใหม่จากข้อความ ส่วนที่แก้ด้วยมือจะหาย", "Redraw from the text, manual edits will be lost"));
  go.addEventListener("click", () => { edited = null; savedRecord = null; writeRecord(null); lastMmd = ""; paintEditNote(); update(); });
  cvnote.append(b, go);
}

const editor = createEditor({
  onAutosave(xml) { writeRecord({ xml, name: editName, text: editBase.text, kind: editBase.kind }); },
  onSave({ png, xml }) {
    edited = { ...editBase };
    savedRecord = { xml, name: editName, text: edited.text, kind: edited.kind };
    writeRecord(savedRecord);
    show(png, xml, editName, tr("ผังที่แก้ด้วยมือ", "Diagram with manual edits"));
    paintEditNote();
  },
  onClose() {
    const r = readRecord();
    if (r && (!savedRecord || r.xml !== savedRecord.xml)) writeRecord(savedRecord);   // ออกโดยไม่บันทึก = ทิ้งที่แก้รอบนี้
    editBtn.focus();
  },
});
function openRoom(src, name) {
  editBase = edited ? { ...edited } : { text: ta.value, kind };
  editName = name;
  editor.open(src).catch(() => {
    const m = room.querySelector(".editroom-err b");
    if (m) m.textContent = tr("เปิดห้องแก้ไขไม่ได้ ห้องแก้ไขโหลดมาจาก diagrams.net ตรวจอินเทอร์เน็ตแล้วลองใหม่",
                              "Could not open the editor, it loads from diagrams.net, check your connection and try again");
  });
}
editBtn.addEventListener("click", () => { if (current && current.xml) openRoom({ xml: current.xml }, current.name); });
room.querySelector(".editroom-err button").addEventListener("click", () => editor.close());

/* ── เปิดไฟล์ผังเดิม: .drawio.png ที่ FlowKit หรือ draw.io ทำไว้ , .drawio , .xml (ลากมาวาง หรือกดเลือก) ── */
function hasDiagram(bytes) {
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50) return false;
  for (let i = 8; i + 8 <= bytes.length;) {
    const n = (bytes[i] << 24 | bytes[i + 1] << 16 | bytes[i + 2] << 8 | bytes[i + 3]) >>> 0;
    const t = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
    if (t === "tEXt" || t === "zTXt" || t === "iTXt") {
      const key = String.fromCharCode(...bytes.subarray(i + 8, Math.min(i + 8 + 12, i + 8 + n)));
      if (key.startsWith("mxfile") || key.startsWith("mxGraphModel")) return true;
    }
    if (t === "IEND") break;
    i += 12 + n;
  }
  return false;
}
function fileProblem(text) {
  msg.replaceChildren();
  const box = document.createElement("div");
  box.className = "err";
  box.textContent = text;
  msg.append(box);
}
async function openFile(file) {
  if (!file) return;
  const name = (file.name.replace(/\.(drawio\.png|drawio\.xml|png|drawio|xml)$/i, "").trim() || "FlowKit") + ".drawio.png";
  try {
    if (/\.png$/i.test(file.name) || file.type === "image/png") {
      if (!hasDiagram(new Uint8Array(await file.arrayBuffer()))) {
        return fileProblem(tr(`${file.name} เป็นภาพธรรมดา ไม่มีผัง draw.io ฝังอยู่ เปิดแก้ได้เฉพาะไฟล์ .drawio.png`,
                              `${file.name} is a plain image with no draw.io diagram inside, only .drawio.png files can be opened`));
      }
      const uri = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
      openRoom({ xmlpng: uri }, name);
    } else {
      const text = await file.text();
      if (!/<mxfile|<mxGraphModel/.test(text)) {
        return fileProblem(tr(`${file.name} ไม่ใช่ไฟล์ผังของ draw.io`, `${file.name} is not a draw.io diagram file`));
      }
      openRoom({ xml: text }, name);
    }
  } catch {
    fileProblem(tr(`อ่านไฟล์ ${file.name} ไม่ได้`, `Could not read ${file.name}`));
  }
}
$("#openfile").addEventListener("click", () => fileIn.click());
fileIn.addEventListener("change", () => { openFile(fileIn.files[0]); fileIn.value = ""; });
addEventListener("dragover", (e) => {
  if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
  e.preventDefault(); canvas.dataset.drop = "";
});
addEventListener("dragleave", (e) => { if (!e.relatedTarget) delete canvas.dataset.drop; });
addEventListener("drop", (e) => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault(); delete canvas.dataset.drop;
  openFile(e.dataTransfer.files[0]);
});

let lastMmd = "", current = null, ver = 0, timer = 0;
function update() {
  clearTimeout(timer);
  const r = parseText(ta.value, kind);
  paintHighlight(r.error ? r.error.line : 0);
  showMessages(r);
  if (edited) { paintEditNote(); return; }        // ผังที่แก้ด้วยมือ ข้อความไม่วาดทับเอง (ผู้ใช้เลือกผ่านป้าย)
  if (r.empty) {
    current = null; lastMmd = ""; img.hidden = true; dl.disabled = true; editBtn.disabled = true;
    setCanvas("empty", [isPhone() ? tr("พิมพ์ข้อความข้างบน ผังจะขึ้นตรงนี้", "Type above and the diagram shows up here")
                                  : tr("พิมพ์ข้อความทางซ้าย ผังจะขึ้นตรงนี้", "Type on the left and the diagram shows up here")]);
    return;
  }
  if (r.error) {
    dl.disabled = true;
    setCanvas(current ? "stale" : "empty", [tr(`แก้${lineLabel(r.error.line)} ก่อน`, `Fix ${lineLabel(r.error.line).toLowerCase()} first`),
      tr("ผังจะวาดใหม่ให้เอง", "and the diagram redraws by itself")]);
    return;
  }
  const model = r.model;
  const mmd = toMermaid(model);
  if (mmd === lastMmd && current) {
    current.name = fileName(model);               // ชื่อ: เปลี่ยนอย่างเดียว ผังไม่ต้องวาดใหม่
    setCanvas("ready"); dl.disabled = false;
    return;
  }
  const my = ++ver;
  live.dataset.busy = "";
  /* ‼️ ห้ามทับข้อความต่อไม่ได้ด้วย "กำลังวาด" (เคยทับจนผู้ใช้ออฟไลน์ไม่รู้ว่าทำไมผังไม่ขึ้น จับได้ใน tests/browser_swpages.py) */
  if (!current && !engineDown() && canvas.dataset.state !== "booting") setCanvas("booting", [tr("กำลังวาดผัง", "Drawing")]);
  engine.render(mmd, model.nodes.length, STRETCH_Y[model.kind] || 1).then((out) => {
    if (out.stale || my !== ver) return;
    lastMmd = mmd;
    show(out.png, out.xml, fileName(model),
      tr(`${KIND_NAME[model.kind]} ${model.nodes.length} กล่อง`, `${KIND_NAME[model.kind]} with ${model.nodes.length} boxes`));
  }, (e) => {
    if (my !== ver || (e && e.kind === "reset")) return;   // reset = ผู้ใช้กดลองใหม่ งานนี้ถูกแทนด้วยรอบใหม่แล้ว
    console.warn("FlowKit", e);
    setCanvas("error", [tr("วาดผังนี้ไม่สำเร็จ", "This diagram could not be drawn"),
      e && e.kind === "incomplete" ? tr("ตัววาดได้กล่องไม่ครบ ลองเปลี่ยนเครื่องหมายแปลก ๆ ในข้อความ", "Some boxes went missing, try removing unusual symbols")
                                   : tr("ลองใหม่อีกครั้ง ถ้ายังไม่ได้ ลองแบ่งผังให้เล็กลง", "Try again, or split the diagram into smaller ones")], true);
    dl.disabled = true;
  }).finally(() => { if (my === ver) delete live.dataset.busy; });
}

ta.addEventListener("input", () => {
  saveDraft();
  if (hlLine) paintHighlight(0);                  // บรรทัดเปลี่ยนแล้ว แถบเดิมอาจไม่ตรง รอผลใหม่
  clearTimeout(timer);
  timer = setTimeout(update, DEBOUNCE_MS);
});

dl.addEventListener("click", () => {
  if (!current) return;
  const { blob, name } = current;
  if (inapp && inapp.inApp()) {
    inapp.saveViaShare(blob, name).then((how) => { if (how === "download") plainDownload(blob, name); });
    return;
  }
  plainDownload(blob, name);
});
function plainDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

addEventListener("online", () => { if (canvas.dataset.state === "error") retry(); });

setKind(kind, true);
setCanvas("booting", [tr("กำลังเตรียมตัววาดผัง", "Getting the diagram engine ready")]);
engine.boot();                                    // ออฟไลน์ตั้งแต่เปิด onState บอกผู้ใช้ทันที ไม่ต้องรอ
{
  /* ผังที่แก้ด้วยมือค้างอยู่จากรอบก่อน (โหลดหน้าใหม่ สลับภาษา) วาดกลับจาก xml ของมันเอง ไม่วาดจากข้อความทับ */
  const rec = readRecord();
  if (rec && rec.xml) {
    edited = { text: rec.text, kind: rec.kind }; savedRecord = rec; editName = rec.name || "FlowKit.drawio.png";
    showMessages(parseText(ta.value, kind));
    engine.renderXml(rec.xml).then((out) => {
      if (out.stale || !edited) return;
      show(out.png, out.xml, editName, tr("ผังที่แก้ด้วยมือ", "Diagram with manual edits"));
      paintEditNote();
    }, () => { edited = null; writeRecord(null); update(); });
  } else update();
}
