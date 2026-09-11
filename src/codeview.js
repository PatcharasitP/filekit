import { el } from "./dom.js";
import { tr } from "./i18n.js";

/* ── กล่องแสดงโค้ดที่ผู้ใช้จะคัดลอกไปใช้ ──────────────────────────────────
 * ปัญหาที่แก้ (วิจัย 11/09/2026 เปิดดูของจริง 12 เว็บ)
 *   regex101, crontab.guru, sqlformat.org, cssgradient.io, curlconverter,
 *   shadcn/ui, Tailwind Play, Carbon, Vega-Lite Editor, Postman, Hoppscotch, CodePen
 *   **ไม่มีเว็บไหนซ่อนผลลัพธ์ไว้หลังปุ่มคัดลอกเฉย ๆ เลยสักที่** ทุกที่โชว์เต็มในกล่องที่เลื่อนดูได้
 *   ส่วน FileKit วัดแล้วพบว่าสเปก Deneb ขนาด 26KB ไม่ได้แสดงให้ดูเลย
 *   ผู้ใช้กดคัดลอกโดยไม่เคยเห็นว่าได้อะไรไป
 *
 * ‼️ ทำไมเขียนตัวไฮไลต์เอง ไม่ใช้ Prism
 *   วัดจริงแล้ว Prism core หนัก 19KB (7KB เมื่อบีบ) ซึ่งไม่มาก แต่
 *   ① เราต้องการแค่ JSON กับภาษา M ซึ่ง Prism ไม่มีไวยากรณ์ภาษา M ให้อยู่แล้ว
 *   ② เว็บนี้ใช้ออฟไลน์ได้ ไฟล์นอกทุกไฟล์ต้องเข้าคลัง vendor พร้อม SRI และ service worker
 *   ③ ไฮไลต์ JSON ใช้ regex ไม่กี่บรรทัด เขียนเองได้โดยไม่เพิ่มไฟล์เลยสักไบต์
 *
 * ‼️ โค้ด 26KB มีราว 900 บรรทัด ถ้าวาดทุกบรรทัดตั้งแต่เปิดหน้าจะหน่วง
 *   จึงวาดตอนกางดูครั้งแรกเท่านั้น (กล่องพับอยู่โดยค่าเริ่มต้น แต่ **บอกขนาดไว้ตั้งแต่แรก**
 *   ซึ่งต่างจากการซ่อน เพราะผู้ใช้รู้ว่ามีอะไรอยู่และเปิดดูได้ทันทีด้วยคลิกเดียว)
 */

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ไฮไลต์ JSON แบบเบา จับทีละโทเคนด้วย regex เดียว
   ‼️ ต้องจับสตริงก่อนตัวเลขเสมอ ไม่งั้นตัวเลขในสตริง ("2026-09-11") จะโดนทาสีผิด */
function paintJson(src) {
  return esc(src).replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/g,
    (m, str, colon, lit, num) => {
      if (str) return colon
        ? `<i class="cv-key">${str}</i>${colon}`      // ชื่อคีย์ ก่อนเครื่องหมายทวิภาค
        : `<i class="cv-str">${str}</i>`;
      if (lit) return `<i class="cv-lit">${lit}</i>`;
      if (num) return `<i class="cv-num">${num}</i>`;
      return m;
    }
  );
}

/* ไฮไลต์ภาษา M ของ Power Query แบบเบา
   ‼️ ต้องจับคอมเมนต์กับสตริงก่อนคำสงวน ไม่งั้นคำสงวนที่อยู่ในคอมเมนต์จะโดนทาสี */
const M_WORDS = /\b(let|in|each|if|then|else|try|otherwise|type|as|is|meta|and|or|not|true|false|null|error)\b/g;
function paintM(src) {
  const out = esc(src)
    .replace(/(\/\/[^\n]*)/g, '<i class="cv-cmt">$1</i>')
    .replace(/("(?:""|[^"])*")/g, '<i class="cv-str">$1</i>');
  // ทาคำสงวนเฉพาะส่วนที่ยังไม่ถูกทาสี กันทับซ้อนด้วยการข้ามช่วงที่อยู่ในแท็บ <i>
  return out.split(/(<i class="cv-(?:cmt|str)">[\s\S]*?<\/i>)/).map((chunk, i) =>
    i % 2 ? chunk : chunk.replace(M_WORDS, '<i class="cv-kw">$1</i>')
  ).join("");
}

const PAINT = { json: paintJson, m: paintM };

/**
 * @param getCode  ฟังก์ชันคืนข้อความโค้ดปัจจุบัน เรียกตอนกางดูและตอน refresh
 * @param lang     "json" หรือ "m" ใช้เลือกวิธีทาสี
 * @param title    ข้อความหัวกล่อง บอกว่าโค้ดนี้เอาไปวางที่ไหน
 */
export function codeView({ getCode, lang = "json", title, openLabel }) {
  const pre = el("pre", { class: "cv-pre" });
  const meta = el("span", { class: "cv-meta" });
  const body = el("div", { class: "cv-body" }, [pre]);
  const summary = el("summary", { class: "cv-sum" }, [
    el("span", { class: "cv-title" }, title || tr("โค้ดที่จะได้", "The code you get")), meta,
  ]);
  const box = el("details", { class: "cv" }, [summary, body]);

  let painted = false;

  function sizeText(code) {
    const lines = code ? code.split("\n").length : 0;
    const kb = (new Blob([code || ""]).size / 1024).toFixed(1);
    return tr(`${lines.toLocaleString("th-TH")} บรรทัด, ${kb} KB`,
              `${lines.toLocaleString("en-US")} lines, ${kb} KB`);
  }

  /** วาดจริงเมื่อกางดูเท่านั้น โค้ด 900 บรรทัดวาดตอนเปิดหน้าจะหน่วงเปล่า ๆ */
  function paint() {
    const code = getCode() || "";
    pre.innerHTML = (PAINT[lang] || esc)(code);
    painted = true;
  }

  function refresh() {
    const code = getCode() || "";
    meta.textContent = sizeText(code);
    if (box.open) paint(); else painted = false;   // ยังพับอยู่ ค่อยวาดตอนกาง
  }

  box.addEventListener("toggle", () => { if (box.open && !painted) paint(); });
  refresh();
  return { node: box, refresh };
}

export const CODEVIEW_CSS = `
.cv{border:1.5px solid var(--line);border-radius:var(--r-sm);background:var(--bg-soft);
  overflow:hidden;margin-top:12px}
.cv-sum{cursor:pointer;padding:10px 13px;display:flex;align-items:baseline;gap:10px;
  flex-wrap:wrap;list-style:none;font-size:13px;font-weight:700;color:var(--text)}
.cv-sum::-webkit-details-marker{display:none}
.cv-sum::before{content:"\\25B8";display:inline-block;width:13px;flex:none;font-weight:400;
  transition:transform .15s var(--ease-snap,ease)}
.cv[open] .cv-sum::before{transform:rotate(90deg)}
.cv-meta{font-size:12px;font-weight:600;color:var(--text-mute);margin-inline-start:auto}
.cv-body{border-top:1px solid var(--line);background:var(--card)}
/* ‼️ ต้องคุมความสูงไว้ ไม่งั้นโค้ด 900 บรรทัดดันหน้ายาวจนหาปุ่มอื่นไม่เจอ */
.cv-pre{margin:0;max-height:420px;overflow:auto;padding:11px 13px;
  font:12.5px/1.7 ui-monospace,'SF Mono',Menlo,Consolas,monospace;
  color:var(--text);white-space:pre;tab-size:2}
.cv-pre i{font-style:normal}
.cv-key{color:#0a6ebd}
.cv-str{color:#0a7a4a}
.cv-num{color:#b3541e}
.cv-lit{color:#8a3ffc}
.cv-kw{color:#8a3ffc;font-weight:700}
.cv-cmt{color:var(--text-mute);font-style:italic}
/* โหมดมืดต้องสว่างขึ้น ไม่งั้นสีเข้มบนพื้นเข้มอ่านไม่ออก */
:root[data-theme="dark"] .cv-key{color:#6cb6ff}
:root[data-theme="dark"] .cv-str{color:#5fd3a0}
:root[data-theme="dark"] .cv-num{color:#ffa657}
:root[data-theme="dark"] .cv-lit,:root[data-theme="dark"] .cv-kw{color:#c49bff}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]) .cv-key{color:#6cb6ff}
  :root:not([data-theme="light"]) .cv-str{color:#5fd3a0}
  :root:not([data-theme="light"]) .cv-num{color:#ffa657}
  :root:not([data-theme="light"]) .cv-lit,
  :root:not([data-theme="light"]) .cv-kw{color:#c49bff}
}
@media (pointer:coarse){ .cv-sum{min-height:44px;align-items:center} }
`;
