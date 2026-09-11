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
 *
 * ‼️ ต้องทาสีให้จบใน regex เดียว ห้ามไล่ replace ทีละรอบเด็ดขาด
 *    บทเรียนจริง 11/09/2026: เวอร์ชันแรกทาคอมเมนต์ก่อนแล้วค่อยทาสตริง
 *    พอรอบสองมาถึง มันไปเจอ class="cv-cmt" ที่รอบแรกเพิ่งใส่ แล้วนับว่าเป็นสตริงของโค้ด
 *    ได้ผลลัพธ์เป็น <i class=<i class="cv-str">"cv-cmt"</i>> ซึ่ง HTML พัง
 *    เบราว์เซอร์กลืน <i class= ทิ้ง แล้วโชว์ "cv-cmt">// ... เป็นตัวหนังสือให้ผู้ใช้เห็น
 *    (ไม่โผล่มาก่อนเพราะสเปก Deneb เป็น JSON จึงไม่เคยเดินผ่านทางนี้จนมีโค้ด M ที่มีคอมเมนต์)
 *    การทาสีรอบเดียวไม่มีทางเกิดปัญหานี้ เพราะไม่เคยอ่านสิ่งที่ตัวเองเขียนออกไปแล้ว */
const M_TOKEN = /(\/\/[^\n]*)|("(?:""|[^"])*")|\b(let|in|each|if|then|else|try|otherwise|type|as|is|meta|and|or|not|true|false|null|error)\b/g;
function paintM(src) {
  return esc(src).replace(M_TOKEN, (m, cmt, str, kw) =>
    cmt ? `<i class="cv-cmt">${cmt}</i>`
    : str ? `<i class="cv-str">${str}</i>`
    : `<i class="cv-kw">${kw}</i>`);
}

/* ไฮไลต์ HTML แบบเบา สำหรับตารางที่เอาไปวางในก้อนส่งเมลของ flow
   ‼️ ใช้กลวิธีเดียวกับ paintM คือทาคอมเมนต์ก่อน แล้ว split ข้ามช่วงที่ทาไปแล้ว
      ไม่งั้นแท็กที่อยู่ในคอมเมนต์จะโดนทาซ้ำจนโครงสร้างพัง
   ‼️ ทำงานบนข้อความที่ผ่าน esc() แล้ว แท็กจริงจึงอยู่ในรูป &lt;table&gt; ส่วน &lt;i&gt;
      ที่เราแทรกเองเป็น < > จริง ๆ regex ที่มองหา &lt; จึงไม่ไปแตะของที่แทรกไปแล้ว */
function paintHtml(src) {
  const withCmt = esc(src).replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<i class="cv-cmt">$1</i>');
  return withCmt.split(/(<i class="cv-cmt">[\s\S]*?<\/i>)/).map((chunk, i) => {
    if (i % 2) return chunk;                       // ช่วงคอมเมนต์ที่ทาสีแล้ว ข้ามไป
    return chunk.replace(/&lt;(\/?)([a-zA-Z][\w:-]*)([^&]*?)(\/?)&gt;/g, (m, slash, tag, attrs, selfClose) => {
      const painted = attrs.replace(/([\w:-]+)(\s*=\s*)("[^"]*")/g,
        '<i class="cv-key">$1</i>$2<i class="cv-str">$3</i>');
      return `&lt;${slash}<i class="cv-kw">${tag}</i>${painted}${selfClose}&gt;`;
    });
  }).join("");
}

const PAINT = { json: paintJson, m: paintM, html: paintHtml };

/** ทาสีโค้ดหนึ่งก้อนแล้วคืน HTML ที่พร้อมยัดลง innerHTML
 *
 * ‼️ แยกออกมาให้เครื่องมือที่ "โชว์โค้ดเต็มอยู่แล้ว" เรียกใช้ได้ โดยไม่ต้องเอากล่องพับ
 *    ของ codeView() ไปครอบ เพราะการเอากล่องพับไปครอบของที่เห็นอยู่แล้ว = ถอยหลัง
 *    (งานวิจัย 12 เว็บข้างบนบอกว่าอย่าซ่อนผลลัพธ์)
 * ‼️ ผู้เรียกต้องใส่ CODE_TOKEN_CSS ลงในสไตล์ของโมดูลตัวเองด้วย ไม่งั้นได้แค่ตัวอักษรสีเดียว
 * ‼️ ปลอดภัยต่อการคัดลอก: ทุกตัวทาสีเรียก esc() ก่อนเสมอ และห่อด้วย <i> ซึ่งไม่มีข้อความ
 *    ของตัวเอง ดังนั้น element.textContent หลังทาสี ยังเท่ากับโค้ดต้นฉบับเป๊ะ
 * @param {string} src โค้ดต้นฉบับ
 * @param {"json"|"m"|"html"} lang ภาษา · ไม่รู้จัก = คืนข้อความที่ esc แล้วเฉย ๆ */
export function paintCode(src, lang) {
  return (PAINT[lang] || esc)(src || "");
}

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

/* ‼️ ก้อนนี้ต้องอยู่ "ก่อน" CODEVIEW_CSS เสมอ เพราะ const ไม่ยกค่าขึ้นไปข้างบน (TDZ)
   ถ้าสลับที่กัน จะได้ ReferenceError ตอนโหลดโมดูล และทั้งเครื่องมือจอขาว
   บั๊กชนิดนี้เกิดซ้ำในโปรเจกต์นี้มาแล้วหลายครั้ง */
/** สีของโทเคนอย่างเดียว สำหรับเครื่องมือที่มีกล่องโค้ดของตัวเองอยู่แล้ว */
export const CODE_TOKEN_CSS = `
code i, pre i{font-style:normal}
/* ‼️ สีโหมดสว่างวัดคอนทราสต์จริงบนพื้นกล่องโค้ดแล้วทุกตัว ต้องผ่าน 4.5:1 ของ WCAG AA
   ค่าเดิมของ v75 ตกเกณฑ์ 2 ตัว ม่วง #8a3ffc ได้ 4.31:1 และส้ม #b3541e ได้ 4.30:1
   ทำให้เข้มขึ้นโดยคงโทนเดิม ตอนนี้ผ่านทั้งบนพื้นเทาอ่อน efeeea และพื้นขาวล้วน
   (tests/browser_codepaint.py วัดซ้ำทุกครั้ง จะได้ไม่ถอยหลังเงียบ ๆ อีก) */
.cv-key{color:#0a6ebd}
.cv-str{color:#0a7a4a}
.cv-num{color:#a54a15}
.cv-lit{color:#7c2fe0}
.cv-kw{color:#7c2fe0;font-weight:700}
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
` + CODE_TOKEN_CSS;
