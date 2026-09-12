import { detectType, wrongTypeMessage, typeLabel } from "./filetype.js";
import { $, $$, el, showVeil, filesFromClipboard } from "./dom.js";
import { byId, GROUPS } from "./registry.js";
import { toolIcon, uiIcon, fileKindIcon } from "./icons.js";
import { tr, pl } from "./i18n.js";

/* ‼️ 09/09/2026 พี่ปอนด์ทักเอง: "ไฟล์ควรคลิกดูข้อมูลข้างในได้ไหม" — เดิมกดดูได้เฉพาะ
 * ภาพย่อของรูป ส่วนแถวไฟล์ Excel/Word กดไม่ได้เลย ทั้งที่คนหยิบผิดไฟล์บ่อยกว่ารูปด้วยซ้ำ
 * (ชื่อไฟล์คล้ายกันหมด) จึงทำชื่อไฟล์ให้กดดูเนื้อข้างในได้ทุกชนิดที่ตัวดูไฟล์รองรับ
 * ‼️ ไม่เปิดแท็บใหม่ เพราะเบราว์เซอร์มือถือบล็อกหน้าต่างใหม่บ่อย และการพาไฟล์ข้ามแท็บ
 * ต้องส่งข้อมูลออกไปนอกหน้าเดิม ซึ่งขัดกับหลักของเว็บนี้ที่ไฟล์อยู่ในหน้าเดียวตลอด */
const OPENABLE = new Set(["image", "pdf", "xlsx", "csv", "docx"]);
const openable = (f) => OPENABLE.has(detectType(f));

const ROW_STYLE_ID = "fk-frow-style";
function ensureRowStyle() {
  if (document.getElementById(ROW_STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = ROW_STYLE_ID;
  // ปุ่มต้องหน้าตาเหมือนข้อความเดิมเป๊ะ ต่างแค่บอกว่ากดได้ (ห้ามแก้ assets/css/tool.css)
  st.textContent = `.file-row .f-open{ background:none; border:0; padding:0; margin:0; font:inherit;
    color:inherit; text-align:left; cursor:pointer; min-width:0; }
  .file-row .f-open:hover .f-name{ text-decoration:underline; }
  .file-row .f-open:focus-visible{ outline:2px solid var(--accent,#3b6cf6); outline-offset:3px; border-radius:6px; }`;
  document.head.appendChild(st);
}
export { $, $$, el } from "./dom.js";

export function fmtBytes(b) {
  if (b === null || b === undefined) return "";
  if (b < 1024) return b + " B";
  const u = ["KB", "MB", "GB"];
  let v = b / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return v.toFixed(v < 10 ? 1 : 0) + " " + u[i];
}

/** คืนคิวให้เบราว์เซอร์ได้วาดจอ/รับคลิกระหว่างงานหนัก — กัน INP พุ่งและจอค้าง */
export const yieldToBrowser = (() => {
  if (typeof scheduler !== "undefined" && scheduler.yield) return () => scheduler.yield();
  return () => new Promise((r) => setTimeout(r, 0));
})();

export const readBuffer = (file) => file.arrayBuffer();

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  announceResult(blob, filename); // ผลลัพธ์นี้พร้อมพาไปเครื่องมือถัดไปแล้ว — ดู "ผลลัพธ์ล่าสุด" ด้านล่าง
}

/**
 * ปุ่มดาวน์โหลดไฟล์ผลลัพธ์ 1 ไฟล์ — ใช้แทนการเขียน button(... onclick: () => download(...)) เองทุกที่
 * ‼️ เหตุผลที่ต้องมี: แถว "ทำอะไรต่อดี" ท้ายหน้าจะพาไฟล์ผลลัพธ์ไปเครื่องมือถัดไปให้ ก็ต่อเมื่อมีคน
 *    ประกาศว่า "ผลลัพธ์ล่าสุดคือไฟล์นี้" ซึ่งเดิมประกาศตอน download() ทำงานเท่านั้น = ผู้ใช้ต้อง
 *    กดดาวน์โหลดลงเครื่องก่อน ป้าย "พาไฟล์ไปด้วย" ถึงจะโผล่ ทั้งที่จุดประสงค์ของแถวนั้นคือ
 *    "ทำต่อโดยไม่ต้องดาวน์โหลด" พอดี (วัดจริงจาก tests/browser_chain.py: กดการ์ดแล้วไฟล์ไม่ตามไป)
 *    ตัวนี้ประกาศให้ตั้งแต่ตอนสร้างปุ่ม คือตอนที่ผลลัพธ์เกิดขึ้นจริง
 * ป้ายบนปุ่มยังเป็น "ดาวน์โหลด" เหมือนเดิม ส่วน aria-label บอกชื่อไฟล์ให้โปรแกรมอ่านหน้าจอ
 */
export function downloadButton(blob, filename, opts = {}) {
  announceResult(blob, filename);
  return button(opts.text ?? tr("ดาวน์โหลด", "Download"), {
    icon: "download",
    label: tr(`ดาวน์โหลด ${filename}`, `Download ${filename}`),
    onclick: () => download(blob, filename),
    ...opts.btn,
  });
}

/** โครงหน้าเครื่องมือ: หัวเรื่อง + กล่องเนื้อหา */
const GROUP_ACCENT = {
  pdf: "--g-pdf", "from-pdf": "--g-pdf", "to-pdf": "--g-pdf",
  image: "--g-img", doc: "--g-doc", ppt: "--g-ppt", data: "--g-data", thai: "--g-thai",
};

export function toolShell(tool) {
  const body = el("div", { class: "panel" });
  const wrap = el("div", { style: `--ac:var(${GROUP_ACCENT[tool.group] || "--brand"})` }, [
    el("div", { class: "tool-head" }, [
      el("div", { class: "tool-ico", "aria-hidden": "true" }, [toolIcon(tool) || tool.icon]),
      el("div", {}, [el("h1", {}, tool.title), el("p", {}, tool.desc), toolMeta(tool)]),
    ]),
    body,
    toolFaq(tool),
    nextSteps(tool),
    toolRail(tool),
  ]);
  return { wrap, body };
}

/** รางซ้ายติดขอบจอ สำหรับจอกว้างเท่านั้น
 *
 * ‼️ ที่มา thepexcel วางสารบัญส่วนไว้ในรางซ้ายที่ลอยอยู่ข้างเนื้อหา
 *    วัดของเราแล้วพบว่าเนื้อหาถูกจำกัดกว้าง 1096px จอ 1600px จึงมีขอบว่างข้างละ 252px
 *    และจอ 1920px ว่างถึง 412px ซึ่งทิ้งเปล่าอยู่ทั้งหมด
 *    เอาหัวเรื่องเครื่องมือ (สูง 138px) ย้ายไปอยู่ในขอบว่างนั้น
 *    แผงงานจึงขยับขึ้นไปเริ่มที่ด้านบนของจอแทนที่จะเริ่มที่ 249px
 *    ‼️ ได้ที่แนวตั้งคืน 138px โดยไม่เสียความกว้างของพื้นที่ทำงานเลยสักพิกเซล
 *
 * ‼️ โผล่เฉพาะจอตั้งแต่ 1500px ขึ้นไป เพราะแคบกว่านั้นขอบว่างไม่พอ
 *    จอเล็กกว่านั้นใช้หัวเรื่องเดิมตามปกติ (ดู .tool-rail ใน tool.css)
 * ‼️ aria-hidden ไม่ได้ เพราะมีลิงก์ข้ามส่วนที่คนใช้คีย์บอร์ดควรใช้ได้
 *    แต่ชื่อเครื่องมือซ้ำกับ h1 จึงไม่ทำเป็นหัวเรื่องซ้ำอีกชั้น */
export function toolRail(tool) {
  const jump = [["ws-top", tr("พื้นที่ทำงาน", "Workspace")],
                ["faq-h", tr("คำถามที่เจอบ่อย", "Common questions")],
                ["next-h", tr("ทำอะไรต่อดี", "What next?")]];
  return el("aside", { class: "tool-rail", "aria-label": tr("ข้อมูลเครื่องมือนี้", "About this tool") }, [
    el("div", { class: "rail-id" }, [
      el("span", { class: "rail-ico", "aria-hidden": "true" }, [toolIcon(tool) || tool.icon]),
      el("b", {}, tool.title),
    ]),
    el("p", { class: "rail-desc" }, tool.desc),
    toolMeta(tool),
    railCopyMd(tool),
    el("nav", { class: "rail-jump", "aria-label": tr("ข้ามไปยังส่วน", "Jump to a section") },
      jump.map(([id, label]) => el("a", { href: `#${id}`, onclick: (e) => {
        /* ‼️ href แบบ #id ชนกับ router ที่อ่าน hash เป็นชื่อเครื่องมือ
           จะเด้งกลับหน้าแรกทันที จึงเลื่อนเองแล้วห้ามเบราว์เซอร์เปลี่ยน hash */
        e.preventDefault();
        const t = document.getElementById(id);
        if (t) t.scrollIntoView({ block: "start", behavior: "smooth" });
      } }, label))),
  ]);
}

/** หัวข้อระดับส่วน มีแถบสีตั้งข้างหน้าและขีดใต้เฉพาะความกว้างของข้อความ
 *  ‼️ ถอดจาก thepexcel 12/09/2026 เขาใช้แบบนี้กับ H2 ทุกตัวในหน้าอ้างอิง
 *     ทำให้กวาดตาหาหัวข้อเจอโดยไม่ต้องใช้ขนาดตัวอักษรใหญ่ ๆ มาแย่งพื้นที่
 *     ธีมเราเป็นขาวดำ แถบจึงใช้สีประจำตระกูลของเครื่องมือ (--ac) ไม่ใช่สีเน้นเดี่ยว */
export function sectionHead(text) {
  return el("h2", { class: "sec-h" }, [el("span", {}, text)]);
}

/* คำถามที่ตอบได้เหมือนกันทุกเครื่องมือ เพราะเป็นคุณสมบัติของทั้งเว็บ ไม่ใช่ของเครื่องมือใดเครื่องมือหนึ่ง
   ‼️ ทุกข้อต้องเป็นเรื่องจริงที่ตรวจสอบได้เอง ไม่ใช่คำโฆษณา
      ข้อแรกบอกวิธีตรวจสอบไว้ด้วย เพราะคำสัญญาเรื่องความเป็นส่วนตัวที่พิสูจน์ไม่ได้ก็แค่คำพูด */
const BASE_FAQ = () => [
  [tr("ไฟล์ของฉันถูกส่งขึ้นเซิร์ฟเวอร์ไหม", "Do my files get uploaded?"),
   tr("ไม่ ทุกอย่างทำในเบราว์เซอร์คุณ ตรวจเองได้โดยเปิดแท็บ Network แล้วกดทำงาน จะไม่เห็นการส่งข้อมูลออกเลย",
      "No. It all runs in your browser. Open the Network tab, run the tool, and you will see nothing go out.")],
  [tr("ใช้ตอนไม่มีอินเทอร์เน็ตได้ไหม", "Does it work offline?"),
   tr("ได้ กดปุ่มโหลดไว้ใช้ออฟไลน์ท้ายหน้าหนึ่งครั้ง จากนั้นใช้ได้แม้ไม่มีเน็ต",
      "Yes. Press the offline button once, then it works without a connection.")],
  [tr("ไฟล์ใหญ่ได้แค่ไหน", "How big can a file be?"),
   tr("ไม่มีเพดานจากฝั่งเว็บ เพราะไม่ได้อัปโหลดไปไหน ขีดจำกัดคือแรมเครื่องคุณเอง",
      "No limit from our side, nothing is uploaded. Your own memory is the limit.")],
  [tr("ต้องสมัครสมาชิกหรือเสียเงินไหม", "Do I need an account or payment?"),
   tr("ไม่ต้องทั้งสองอย่าง ใช้ได้ไม่จำกัดจำนวนครั้ง และไม่มีโฆษณา",
      "Neither. Use it as many times as you like, with no ads.")],
];

/** ปุ่มคัดลอกหน้านี้เป็น Markdown สำหรับเอาไปวางคุยกับ AI ต่อ
 *
 * ‼️ ที่มา thepexcel มีปุ่ม "Copy as Markdown" กับลิงก์ .md ลอยอยู่มุมขวาล่างทุกหน้า
 *    (ผ่าเว็บ 12/09/2026) เพราะคนเอาเนื้อหาไปถาม AI ต่อกันเป็นปกติแล้ว
 *    ของเราได้เปรียบตรงที่เครื่องมือสายโค้ดสร้างโค้ดจริงอยู่บนหน้า
 *    จึงแนบโค้ดที่ได้ไปด้วย ซึ่งตรงกับที่พี่ปอนด์วางไว้ว่า "ได้ Code ไปใช้งานแบบ Dynamic"
 *
 * ‼️ แนบโค้ดเฉพาะตอนที่มีโค้ดอยู่บนจอจริง ๆ ไม่ใช่เดาว่าเครื่องมือนี้น่าจะมี
 *    ไม่งั้นจะได้ Markdown ที่มีหัวข้อ "โค้ดที่ได้" แต่ข้างในว่างเปล่า */
export function railCopyMd(tool) {
  const st = el("span", { class: "rail-md-st", role: "status", "aria-live": "polite" });
  const btn = el("button", {
    class: "rail-md", type: "button",
    onclick: async () => {
      const md = toolMarkdown(tool);
      try {
        await navigator.clipboard.writeText(md);
        st.textContent = tr(`คัดลอกแล้ว ${md.split("\n").length} บรรทัด`,
                            `Copied ${pl(md.split("\n").length, "line", "lines")}`);
      } catch {
        st.textContent = tr("คัดลอกไม่สำเร็จ", "Could not copy");
      }
      setTimeout(() => { st.textContent = ""; }, 4000);
    },
  }, [uiIcon("copy", "ico-svg"), tr("คัดลอกเป็น Markdown", "Copy as Markdown")]);
  return el("div", { class: "rail-md-wrap" }, [btn, st]);
}

/** ข้อความ Markdown ของหน้าเครื่องมือนี้ — แยกออกมาเพื่อให้เทสเรียกตรงได้ */
export function toolMarkdown(tool) {
  const g = GROUPS.find((x) => x.id === tool.group);
  const unknown = typeLabel("");
  const kinds = [...new Set((tool.accepts || []).map(typeLabel))].filter((x) => x && x !== unknown);
  const L = [];
  L.push(`# ${tool.title}`, "");
  if (tool.desc) L.push(tool.desc, "");
  if (g) L.push(tr(`- หมวด: ${g.label}`, `- Category: ${g.label}`));
  if (kinds.length) L.push(tr(`- รับไฟล์: ${kinds.join(", ")}`, `- Takes: ${kinds.join(", ")}`));
  L.push(tr("- ทำงานในเบราว์เซอร์ ไฟล์ไม่ถูกอัปโหลดไปไหน",
            "- Runs in the browser, files are never uploaded"));
  L.push(`- ${location.origin}${location.pathname}#/${tool.id}`, "");

  /* โค้ดที่อยู่บนจอตอนนี้ เอาก้อนที่ยาวที่สุดซึ่งเป็นผลลัพธ์หลักของหน้าเสมอ
     ‼️ ต้องเลือกที่ <pre> ไม่ใช่ <pre code> เพราะเครื่องมือในเว็บนี้ใส่โค้ดสองแบบ
        บางตัวมี <code> ซ้อนข้างใน บางตัวใส่ลง <pre> ตรง ๆ (เจอจริงตอนทดสอบ
        excel-to-pq ที่ได้ Markdown ไม่มีโค้ดติดมาเลย) */
  const blocks = [...document.querySelectorAll("pre")]
    .filter((e) => e.offsetParent && (e.textContent || "").trim().length > 40)
    .map((e) => e.textContent);
  if (blocks.length) {
    const code = blocks.sort((a, b) => b.length - a.length)[0];
    L.push(tr("## โค้ดที่ได้จากหน้านี้", "## Code from this page"), "",
           "```", code.trimEnd(), "```", "");
  }
  return L.join("\n");
}

/** ส่วนคำถามที่เจอบ่อย ท้ายหน้าเครื่องมือ
 *  ‼️ ถอดจาก thepexcel ที่ใส่ FAQ ไว้ทุกหน้าอ้างอิง เพราะคำถามเดิม ๆ ถูกถามซ้ำทุกวัน
 *     ของเขาเป็นการ์ดพับได้ เราใช้ <details> ซึ่งพับได้เองโดยไม่ต้องมีสคริปต์
 *  เครื่องมือไหนมีคำถามเฉพาะตัว ใส่ faq ไว้ในทะเบียนได้ จะขึ้นก่อนคำถามรวม */
export function toolFaq(tool) {
  const items = [...(tool.faq || []), ...BASE_FAQ()];
  if (!items.length) return null;
  /* ‼️ ทั้งส่วนอยู่ในกล่องพับกล่องเดียว ไม่ใช่กางไว้แล้วมี 4 กล่องย่อย
     เพราะ tests/browser_mobile.py จับได้ว่าหางหน้าที่ยาวขึ้น ~250px ทำให้ปุ่มลงมือทำ
     หลุดจอตอนเลื่อนสุดหน้าบนมือถือ ถึง 53 จุด (แถบปุ่มเป็น sticky ในกรอบ .panel
     พอเลื่อนพ้นกรอบก็หายไป) ยุบเหลือกล่องเดียวแล้วหางสั้นลงเหลือระดับเดียวกับ
     "ทำอะไรต่อดี" ที่ผ่านเกณฑ์อยู่แล้ว
     และเข้ากับธรรมชาติของเนื้อหาด้วย คำถามพวกนี้เป็นของเสริม ไม่ใช่สิ่งที่มาทำ */
  return el("details", { class: "faq" }, [
    el("summary", { class: "faq-top" }, [
      el("span", { class: "faq-top-t", id: "faq-h" }, tr("คำถามที่เจอบ่อย", "Common questions")),
      el("span", { class: "faq-top-n" }, tr(`${items.length} ข้อ`, pl(items.length, "question", "questions"))),
    ]),
    el("div", { class: "faq-list" }, items.map(([q, a]) =>
      el("details", { class: "faq-i" }, [
        el("summary", {}, q),
        el("div", { class: "faq-a" }, a),
      ]))),
  ]);
}

/** แถวชิปข้อมูลใต้หัวเรื่องเครื่องมือ
 *
 * ‼️ ที่มา ผ่าเว็บ thepexcel.com 12/09/2026 (.claude/research/2026-09-12-thepexcel-full-system.md)
 *    หน้าอ้างอิงของเขาทุกหน้าเริ่มด้วยชิป 3 ตัว (แอป, หมวด, เวอร์ชันที่เริ่มมี)
 *    และ **ชิปเป็นลิงก์กรอง** กดแล้วเด้งไปหน้ารายการที่กรองให้เลย
 *    สำรวจของเราแล้วพบว่า ทะเบียนมีข้อมูลพวกนี้ครบอยู่แล้ว แต่ไม่เคยแสดงที่ไหนเลย
 *    คนเปิดเครื่องมือมาจึงไม่รู้ว่ามันอยู่หมวดไหน และรับไฟล์อะไรได้บ้าง
 *    จนกว่าจะลากไฟล์ผิดชนิดเข้าไปแล้วโดนเตือน
 *
 * ‼️ ธีมขาวดำ จึงไม่ใช้สีเน้นเดี่ยวแบบทองของเขา ชิปหมวดใช้สีประจำตระกูลเป็นจุดเล็ก ๆ แทน
 */
export function toolMeta(tool) {
  const g = GROUPS.find((x) => x.id === tool.group);
  const chips = [];

  if (g) {
    /* ‼️ กดแล้วต้องพาไปหน้าแรกที่กรองหมวดนี้ไว้แล้ว ไม่ใช่หน้าแรกเปล่า ๆ
       ui.js ห้าม import app.js (จะวนกันเอง) จึงฝากค่าไว้ใน sessionStorage แล้วให้หน้าแรกอ่านเอง */
    chips.push(el("a", {
      class: "tm-chip tm-cat", href: "#/",
      title: tr(`ดูเครื่องมือหมวด ${g.label} ทั้งหมด`, `See all ${g.label} tools`),
      onclick: () => { try { sessionStorage.setItem("fk:gocat", tool.group); } catch { /* โหมดส่วนตัว */ } },
    }, [el("i", { class: "tm-dot", "aria-hidden": "true" }), g.short || g.label]));
  }

  /* ‼️ accepts ในทะเบียนใช้ "นามสกุลไฟล์" (xls, xlsm, txt, json…) ส่วน typeLabel รู้จักแค่
     ชนิดหลักที่ detectType คืนมา ตัวที่ไม่รู้จักจะได้คำว่า "ไฟล์ชนิดนี้" กลับมา
     ปล่อยไว้จะได้ป้ายว่า "รับ Excel, ไฟล์ชนิดนี้, ไฟล์ชนิดนี้, CSV" ซึ่งอ่านไม่รู้เรื่อง (เจอจริงตอนทดสอบ)
     จึงยุบด้วย "ป้ายที่ได้" ไม่ใช่ด้วยนามสกุล แล้วตัดตัวที่แปลไม่ออกทิ้ง
     เหลือว่างทั้งหมดก็ไม่ต้องโชว์ชิปนี้ ดีกว่าโชว์คำที่ไม่มีความหมาย */
  const unknown = typeLabel("");
  const kinds = [...new Set((tool.accepts || []).map(typeLabel))].filter((x) => x && x !== unknown);
  if (kinds.length) {
    const list = kinds.slice(0, 4).join(", ") + (kinds.length > 4 ? " …" : "");
    chips.push(el("span", { class: "tm-chip" }, tr(`รับ ${list}`, `Takes ${list}`)));
  }

  /* คำสัญญาหลักของเว็บ ควรอยู่ตรงที่คนกำลังจะใส่ไฟล์ ไม่ใช่แค่ที่หน้าแรก */
  chips.push(el("span", { class: "tm-chip tm-safe" }, tr("ทำงานในเครื่องคุณ", "Runs on your device")));

  return el("div", { class: "tool-meta" }, chips);
}

/** แถว "ทำอะไรต่อดี"ท้ายหน้าเครื่องมือ — งานเอกสารจริงแทบไม่มีขั้นตอนเดียวจบ
 *  เช่นรวม PDF เสร็จมักตามด้วยบีบอัดหรือเซ็นชื่อ · เดิมผู้ใช้ต้องกดกลับหน้าแรกไปหาเอง */
export function nextSteps(tool) {
  const list = (tool.next || []).map(byId).filter(Boolean);
  if (!list.length) return null;
  ensureResultLifecycle();
  const accent = (t) => `var(${GROUP_ACCENT[t.group] || "--brand"})`;

  const cards = list.map((t) => {
    // ป้ายเล็ก ๆ บอกว่ากดแล้วไฟล์ผลลัพธ์ล่าสุดจะตามไปด้วย — ซ่อนไว้ก่อน โผล่เฉพาะตอนมีผลลัพธ์
    // ที่ชนิดตรงกับเครื่องมือปลายทางนี้จริง ๆ (เดิม hidden ในตอนสร้าง ค่อยเปิดทีหลังด้วย sync())
    const carryTag = el("span", { class: "next-carry", hidden: true }, [
      uiIcon("download", "ico-svg"),
      tr("พาไฟล์ไปด้วย", "Brings your file"),
    ]);
    const a = el("a", {
      class: "next-card", href: "#/" + t.id, style: `--ac:${accent(t)}`,
      onclick: () => {
        const carried = resultFilesFor(t);
        if (carried) stashFiles(carried); // ไฟล์ตามไปเฉพาะตอนชนิดเข้ากันได้จริง — การ์ดอื่นทำงานปกติ
      },
    }, [
      el("span", { class: "next-ico", "aria-hidden": "true" }, [toolIcon(t) || t.icon]),
      el("span", { class: "next-label" }, [el("span", { class: "next-title" }, t.title), carryTag]),
    ]);
    return { t, a, carryTag };
  });

  function sync() {
    for (const { t, carryTag } of cards) carryTag.hidden = !resultFilesFor(t);
  }
  sync();

  const nav = el("nav", { class: "next-steps", "aria-label": tr("เครื่องมือที่มักใช้ต่อ", "Tools people use next") }, [
    Object.assign(sectionHead(tr("ทำอะไรต่อดี", "What next?")), { id: "next-h" }),
    el("div", { class: "next-row" }, cards.map((c) => c.a)),
  ]);
  // อัปเดตป้ายทันทีที่มีผลลัพธ์ใหม่ (ผู้ใช้กดดาวน์โหลดหลังจากแถวนี้วาดไปแล้ว) — ถอดตัวเองเมื่อแถวนี้หลุดจากหน้า
  resultWatchers.add({ dead: () => !nav.isConnected, fn: sync });
  return nav;
}

/** แถบสถานะ + แถบความคืบหน้า (ใช้คู่กันเสมอ) */
export function statusBar() {
  const msg = el("div", { class: "status", role: "status", "aria-live": "polite" });
  const fill = el("div", { class: "fill" });
  // ‼️ งานที่ใช้เวลานานต้องยกเลิกได้ ไม่งั้นลากมา 50 ไฟล์แล้วกดผิดต้องรอจนจบหรือปิดแท็บทิ้ง
  let cancelled = false;
  let busy = false;                 // อยู่ระหว่าง begin() ถึง end() — เครื่องมือใช้เช็คว่าห้ามล้างผลกลางคัน
  // ‼️ Nielsen Norman: งานที่เสร็จใน <1 วิ ไม่ควรมีแถบความคืบหน้าเลย (กระพริบแว้บ ยิ่งดูช้า)
  //    จึงหน่วงการ "โชว์" แถบไว้จนกว่าจะผ่านไป ≥800ms — ค่า % ยังอัปเดตข้างในตลอด
  //    เผื่องานที่ยาวเกินคาดพอถึงจุดที่โชว์แถบจะได้ไม่กระโดดจาก 0 ทันที
  let startedAt = 0;
  const PROGRESS_DELAY_MS = 800;
  const stop = el("button", { class: "btn-cancel", type: "button", hidden: true,
    onclick: () => { cancelled = true; stop.disabled = true; stop.textContent = tr("กำลังหยุด…", "Stopping…"); } }, tr("หยุด", "Stop"));
  const bar = el("div", { class: "progress" }, [fill]);
  const node = el("div", { class: "status-wrap" }, [msg, el("div", { class: "prog-row" }, [bar, stop])]);
  let label = "";
  return {
    node,
    get cancelled() { return cancelled; },
    /** เรียกก่อนเริ่มงานใหม่ทุกครั้ง — เปิดปุ่มหยุดและล้างธงเดิม */
    get busy() { return busy; },
    begin: () => { cancelled = false; busy = true; startedAt = performance.now(); stop.hidden = false; stop.disabled = false; stop.textContent = tr("หยุด", "Stop"); },
    end: () => { busy = false; stop.hidden = true; },
    info: (t) => { msg.className = "status show info"; msg.textContent = t; label = t; },
    ok: (t) => { msg.className = "status show ok"; msg.textContent = t; },
    err: (t) => { msg.className = "status show err"; msg.textContent = t; },
    clear: () => { msg.className = "status"; msg.textContent = ""; bar.classList.remove("show"); stop.hidden = true; },
    progress: (pct, note) => {
      if (pct === null) { bar.classList.remove("show"); return; }
      fill.style.width = Math.max(0, Math.min(100, pct)) + "%";
      if (performance.now() - startedAt >= PROGRESS_DELAY_MS) bar.classList.add("show");
      if (note) msg.textContent = `${label ? label + " " : ""}${note}`;
    },
  };
}

// จำไว้ว่าปุ่มไหนถูกปิดโดยกลไกกลางนี้ จะได้ไม่ไปเปิดปุ่มที่เครื่องมือตั้งใจปิดเอง
const CLOSED_BY_US = new WeakSet();

export function button(text, opts = {}) {
  const ico = opts.icon ? uiIcon(opts.icon) : null;
  return el("button", {
    class: "btn" + (opts.ghost ? " ghost" : "") + (opts.danger ? " danger" : "") + (ico ? " has-ico" : ""),
    type: "button",
    onclick: opts.onclick,
    "aria-label": opts.label || null,
  }, ico ? [ico, text ? el("span", {}, text) : null] : text);
}

export function field(labelText, control, hint) {
  return el("label", { class: "field" }, [
    el("span", {}, labelText),
    control,
    hint ? el("small", {}, hint) : null,
  ]);
}

let segSeq = 0;
/**
 * ปุ่มแบบแบ่งช่อง — ใช้แทน dropdown เมื่อมีตัวเลือก 2-4 ตัวและข้อความสั้น
 * เห็นทุกตัวเลือกพร้อมกันโดยไม่ต้องกดเปิด และกดโดนง่ายกว่าบนมือถือ
 * ‼️ ใช้ <input type=radio> จริง จึงได้การนำทางด้วยลูกศร/Tab และการอ่านออกเสียงมาฟรี
 *    (เหตุการณ์ change ของ radio ลอยขึ้นมาถึงกล่องอยู่แล้ว จึงผูก .onchange กับกล่องได้เลย
 *     เหมือน select ทุกประการ — ห้าม dispatch ซ้ำ ไม่งั้นจะยิงสองรอบ)
 */
export function segmented(options, value) {
  const name = "seg" + ++segSeq;
  const wrap = el("div", { class: "seg", role: "radiogroup" });
  const inputs = options.map(([v, t]) => {
    const input = el("input", { type: "radio", name, value: v, checked: v === value || null });
    wrap.appendChild(el("label", { class: "seg-item" }, [input, el("span", {}, t)]));
    return input;
  });
  Object.defineProperty(wrap, "value", {
    get: () => (inputs.find((i) => i.checked) || {}).value ?? "",
    set: (v) => inputs.forEach((i) => { i.checked = i.value === v; }),
  });
  return wrap;
}

export function select(options, value) {
  const s = el("select", {});
  options.forEach(([v, t]) => s.appendChild(el("option", { value: v, selected: v === value }, t)));
  return s;
}

/** กล่องผลลัพธ์ 1 บรรทัด พร้อมปุ่มดาวน์โหลด */
export function resultRow(name, blob, extra) {
  return el("div", { class: "result" }, [
    el("div", { class: "r-name" }, [el("strong", {}, name), extra ? el("small", {}, extra) : null]),
    el("span", { class: "r-size" }, fmtBytes(blob.size)),
    button(tr("ดาวน์โหลด", "Download"), { onclick: () => download(blob, name) }),
  ]);
}

/**
 * ไฟล์ตัวอย่างสำหรับปุ่ม "ลองด้วยไฟล์ตัวอย่าง" ใต้กล่องลากวาง — คีย์ตรงกับ kind ของ detectType()
 * แต่ละรายการ: [path ใน samples/, ป้ายไทย, ป้ายอังกฤษ] · เนื้อหาทั้งหมดเป็นข้อมูลสมมติ ไม่ใช่ของจริง
 * ‼️ ลำดับใน SAMPLE_KIND_PRIORITY ใช้ตัดสินว่าเครื่องมือที่รับหลายชนิด (เช่น pdf-ocr รับ pdf+image)
 *    จะโหลดตัวอย่างชนิดไหนก่อน
 */
const SAMPLE_KIND_PRIORITY = ["pdf", "docx", "xlsx", "pptx", "image", "csv"];
const SAMPLE_FILES = {
  pdf: [
    ["samples/ตัวอย่าง-รายงานประจำเดือน.pdf", "รายงานยอดขายตัวอย่าง (PDF)", "Sample sales report (PDF)"],
    ["samples/ตัวอย่าง-ใบปะหน้าเอกสาร.pdf", "ใบปะหน้าเอกสารตัวอย่าง (PDF)", "Sample cover sheet (PDF)"],
  ],
  docx: [
    ["samples/ตัวอย่าง-ใบเสนอราคา.docx", "ใบเสนอราคาตัวอย่าง (Word)", "Sample quotation (Word)"],
    ["samples/ตัวอย่าง-หนังสือแจ้งผลประเมิน.docx", "หนังสือแจ้งผลตัวอย่าง (Word)", "Sample notice letter (Word)"],
  ],
  xlsx: [
    ["samples/ตัวอย่าง-ข้อมูลใบเสนอราคา.xlsx", "ข้อมูลใบเสนอราคาตัวอย่าง (Excel)", "Sample quotation data (Excel)"],
    ["samples/ตัวอย่าง-ข้อมูลพนักงาน.xlsx", "ข้อมูลพนักงานตัวอย่าง (Excel)", "Sample employee data (Excel)"],
  ],
  pptx: [
    ["samples/ตัวอย่าง-นำเสนอบริษัท.pptx", "งานนำเสนอตัวอย่าง (PowerPoint)", "Sample presentation (PowerPoint)"],
  ],
  image: [
    ["samples/ตัวอย่าง-รูปภาพ-1.jpg", "รูปภาพตัวอย่าง 1 (JPG)", "Sample image 1 (JPG)"],
    ["samples/ตัวอย่าง-รูปภาพ-2.png", "รูปภาพตัวอย่าง 2 (PNG)", "Sample image 2 (PNG)"],
  ],
  csv: [
    ["samples/ตัวอย่าง-รายชื่อสินค้า.csv", "รายชื่อสินค้าตัวอย่าง (CSV)", "Sample product list (CSV)"],
  ],
};

/**
 * ภาพย่อไฟล์ — วิจัยจริง 7 เว็บ (iLovePDF/PDF24/Squoosh ฯลฯ) ทุกเว็บโชว์ภาพย่อทันทีหลังใส่ไฟล์
 * FileKit เดิมโชว์แค่ชื่อ+ขนาดเป็นตัวหนังสือ เว็บเดียวที่ไม่มีภาพย่อเลย
 * ‼️ ต้องไม่ทำให้ add()/render() ช้าลง — วาดแถวด้วยไอคอนทั่วไปก่อนเสมอ แล้วค่อยเติมภาพจริงทีหลัง (async)
 */
function genericThumbIcon(kind) {
  return fileKindIcon(kind) || uiIcon("list");   // ไม่รู้จักชนิด = เส้น 3 ขีดกลาง ๆ
}
/** เติมภาพย่อ/ไอคอนลงกล่อง .thumb ของแถวไฟล์หนึ่งแถว — ไม่มีสถานะภายในของตัวเอง ใช้ซ้ำได้ทุก dropzone */
function paintThumb(row, entry) {
  const box = row && row.querySelector(".thumb");
  if (!box) return;
  box.innerHTML = "";
  if (entry.node) { box.classList.remove("generic"); box.appendChild(entry.node); }
  else { box.classList.add("generic"); const ic = genericThumbIcon(entry.kind); if (ic) box.appendChild(ic); }
}
/** วาดหน้าแรกของ PDF ลง <canvas> เล็ก ๆ ด้วย pdf.js — เรียกเฉพาะตอน window.pdfjsLib โหลดอยู่แล้วเท่านั้น
 *  (เครื่องมือที่ไม่ได้ใช้ pdf.js จะไม่มีการโหลดเพิ่มเพื่อภาพย่อ — ผู้เรียกเป็นคนเช็คเงื่อนไขนี้ก่อน)
 *  คืน { canvas, pages } — แกะไฟล์รอบเดียวได้ทั้งภาพและจำนวนหน้า ไม่ต้องอ่านซ้ำ */
async function renderPdfThumbCanvas(file) {
  try {
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    const pages = doc.numPages;
    const page = await doc.getPage(1);
    const vp0 = page.getViewport({ scale: 1 });
    const scale = Math.min(88 / vp0.width, 112 / vp0.height) || 1; // ~2× ของกล่อง 44×56 ให้คมบนจอ retina
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    doc.destroy?.();
    return { canvas, pages };
  } catch (e) {
    console.error(e); // ไฟล์ PDF เปิดไม่ได้ตอนทำภาพย่อ — ไม่ใช่เรื่องใหญ่ ตกไปใช้ไอคอนทั่วไปเงียบ ๆ
    return null;
  }
}

/** จำนวนหน้าของ PDF โดย "ไม่โหลดไลบรารีเพิ่มสักตัว" — ใช้เฉพาะตัวที่เครื่องมือนั้นดึงมาอยู่แล้ว
 *
 * ‼️ ทำไมไม่โหลด pdf.js มาให้ครบทุกเครื่องมือ: วัดจริงแล้ว pdf.min.js 312 KB + worker 1,061 KB
 *    รวม 1.37 MB ซึ่งแพงเกินกว่าจะจ่ายเพื่อข้อมูลประดับ เว็บคู่แข่ง (iLovePDF ฯลฯ) โชว์ได้
 *    เพราะเรนเดอร์ฝั่งเซิร์ฟเวอร์ ไม่ได้จ่ายค่านี้ที่เครื่องผู้ใช้ ของเราทำงานในเครื่องล้วน
 *    จึงต้องใช้ของที่มีอยู่แล้วเท่านั้น
 *
 * เครื่องมือกลุ่มรวม/แยก/ลายน้ำ ใช้ pdf-lib อยู่แล้ว, กลุ่มแปลง/อ่าน ใช้ pdf.js อยู่แล้ว
 * ทั้งสองทางบอกจำนวนหน้าได้ทั้งคู่ · ไม่มีสักตัว = คืน null แล้วไม่ต้องโชว์อะไร
 * @returns {Promise<number|null>} */
async function pdfPageCount(file) {
  try {
    if (window.PDFLib) {
      // ‼️ ไฟล์ที่ตั้งรหัสไว้จะโยน error ถ้าไม่บอก ignoreEncryption — เราแค่ต้องการจำนวนหน้า
      //    ไม่ได้จะแก้ไขอะไร อ่านผ่านไปได้
      const doc = await window.PDFLib.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      return doc.getPageCount();
    }
    if (window.pdfjsLib) {
      const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      const n = doc.numPages;
      doc.destroy?.();
      return n;
    }
  } catch { /* ไฟล์เสีย/ตั้งรหัสแน่นหนา — ไม่โชว์จำนวนหน้า ดีกว่าโชว์เลขผิด */ }
  return null;
}

/* ── ช่องประกาศสถานะรายไฟล์ ─────────────────────────────────────────────
 * eachFile() รู้จักแค่ตัว File ไม่รู้ว่ากล่องลากวางอยู่ตรงไหน (เครื่องมือ 29 ตัวเรียกกันคนละที่)
 * จึงประกาศออกมากลาง ๆ แล้วให้กล่องที่ "ถือไฟล์ใบนั้นอยู่จริง" หยิบไปแสดงเอง
 * — ไม่ต้องแก้เครื่องมือสักตัว · กล่องที่หลุดจากหน้าไปแล้ว (isConnected=false) ถูกถอดทิ้งเอง */
const stateWatchers = new Set();

/* ‼️ บางเครื่องมือมีกล่องลากไฟล์ 2 ใบ (จดหมายเวียน: เทมเพลต Word + ข้อมูล Excel)
 * ตัวรับระดับหน้าทำงานทุกใบ → วางไฟล์ทีเดียว ใบที่ไม่เกี่ยวเด้งเตือน "ผิดชนิด" ขึ้นมาด้วย
 * จึงให้ "ใบที่รับชนิดนี้ได้" คว้าเหตุการณ์ไปก่อน · ถ้าไม่มีใบไหนรับได้เลย ใบแรกค่อยเตือนใบเดียว
 * (เช็คทีหลังใน microtask — ตอนนั้นตัวรับแบบ sync ของทุกใบทำงานจบแล้ว) */
const claimedEvents = new WeakSet();

/* ── คืนหน่วยความจำตอนเครื่องมือถูกถอดออกจากแคช ──────────────────────────
 * ‼️ เดิมเปิดเครื่องมือ 20 ตัวติดกัน = กล่องลากไฟล์ 20 ใบยังค้างอยู่ในหน่วยความจำทั้งหมด
 *    พร้อม objectURL ของภาพย่อทุกใบ (ไม่เคยถูก revoke) และตัวรับ event ระดับ document
 *    ที่เก็บกวาดตัวเองแบบ "รอมีเหตุการณ์มาก่อนถึงจะถอด" — วัดได้ +20 ตัวต่อ 20 ครั้ง
 *    (จับได้จาก tests/browser_leak.py) · หน้าเว็บที่เปิดค้างทั้งวันจึงบวมขึ้นเรื่อย ๆ
 * แก้โดยให้ทุกกล่องฝากวิธีเก็บของตัวเองไว้ แล้ว app.js เรียก disposeTree() ตอนถอดแคช */
const zoneDisposers = new Set();
function forZonesIn(node, fn) {
  if (!node) return 0;
  let n = 0;
  for (const d of [...zoneDisposers]) {
    if (node === d.zone || node.contains(d.zone)) { fn(d); n++; }
  }
  return n;
}
/** เครื่องมือถูกซ่อนไปแล้วแต่ยังอยู่ในแคช — คืนหน่วยความจำของภาพย่อทันที
 *  แต่เก็บรายชื่อไฟล์ไว้ กลับเข้ามาแล้วงานยังอยู่ครบ (ภาพย่อวาดใหม่ให้เอง เร็วอยู่แล้ว) */
export function sleepTree(node) { return forZonesIn(node, (d) => d.sleep()); }
/** กลับเข้ามาที่เครื่องมือเดิมที่แคชไว้ — วาดภาพย่อกลับมา */
export function wakeTree(node) { return forZonesIn(node, (d) => d.wake()); }
/** ถอดออกจากแคชถาวร — คืนทุกอย่างรวมทั้งตัวรับ event ระดับ document */
export function disposeTree(node) {
  return forZonesIn(node, (d) => { zoneDisposers.delete(d); d.dispose(); });
}
/** เครื่องมือนี้ยังมีไฟล์ที่ผู้ใช้เลือกไว้ค้างอยู่ไหม — ใช้ตัดสินว่า "ห้ามถอดออกจากแคช"
 *  ผู้ใช้ที่ลากไฟล์ 30 ใบใส่ไว้แล้วแวะไปเครื่องมืออื่น ต้องกลับมาเจอของเดิมครบเสมอ */
export function treeHasFiles(node) {
  let any = false;
  forZonesIn(node, (d) => { if (d.hasFiles()) any = true; });
  return any;
}
/** ให้เครื่องมือที่ถือ objectURL ของตัวเอง (เช่นแกลเลอรีภาพย่อของ image-resize)
 *  ฝากวิธีคืนหน่วยความจำไว้ที่เดียวกัน — เรียกครั้งเดียวตอน mount ก็พอ
 *  `node` = element ไหนก็ได้ที่อยู่ในต้นไม้ของเครื่องมือนั้น (ปกติใช้ตัว wrap) */
export function registerCleanup(node, { sleep = () => {}, wake = () => {}, dispose = sleep, hasFiles = () => false } = {}) {
  zoneDisposers.add({ zone: node, sleep, wake, dispose, hasFiles });
}

/* ── ส่งไฟล์ข้ามหน้า ────────────────────────────────────────────────────
 * หน้าแรกรับไฟล์ที่ลาก/วางเข้ามาแล้วเสนอเครื่องมือให้เลือก — พอกดเลือก ไฟล์ต้องตามไปด้วย
 * ไม่ใช่ให้ผู้ใช้เลือกไฟล์ใหม่อีกรอบ · ฝากไว้ตรงนี้แล้วกล่องของเครื่องมือปลายทางมาหยิบเอง
 * เก็บได้ครั้งละชุดเดียวและหยิบแล้วหายไป — กันไฟล์เก่าค้างไปโผล่ในเครื่องมือถัดไป */
let stashed = null;
export function stashFiles(files) { stashed = files && files.length ? [...files] : null; }
export function hasStashedFiles() { return !!stashed; }
function emitFileState(file, state) {
  for (const w of stateWatchers) { if (w.dead()) stateWatchers.delete(w); else w.fn(file, state); }
}

/* ── ผลลัพธ์ล่าสุดของเครื่องมือที่กำลังเปิดอยู่ ─────────────────────────────
 * ปัญหาเดิม: รวม PDF เสร็จ → กด "ทำอะไรต่อดี" ไปบีบอัดต่อ → ไฟล์ไม่ตามไป ต้องโหลด
 * ลงเครื่องแล้วลากกลับเข้าเว็บเอง · แก้โดยดักที่ download() ซึ่งทุกเครื่องมือ (29 ตัว)
 * เรียกอยู่แล้วตอนสร้างไฟล์ผลลัพธ์ — ไม่ต้องแก้ src/tools/** สักไฟล์
 * ‼️ ผูกกับเครื่องมือที่กำลังเปิดอยู่เท่านั้น: ล้างทิ้งทันทีที่ #tool เปลี่ยนเนื้อหา
 *    (สลับเครื่องมือ/กลับหน้าแรก) ไม่งั้นไฟล์เก่าจากงานก่อนหน้าจะหลุดไปโผล่เป็น
 *    "พาไฟล์ไปด้วย" ในเครื่องมืออื่นที่ไม่เกี่ยวข้องกันเลย (เข้าทาง search/ป้ายหน้าแรก)
 * เก็บได้ผลลัพธ์เดียว (คำสั่งดาวน์โหลดล่าสุดชนะ) — พอสำหรับ 29 เครื่องมือซึ่งส่วนใหญ่
 * มีผลลัพธ์เดียวต่อรอบ ตัวที่ดาวน์โหลดทีละไฟล์หลายไฟล์ (เช่นซ่อมไฟล์ไทยเพี้ยนหลายไฟล์
 * โดยไม่กดรวม-zip) จะพาไปแค่ไฟล์ล่าสุดที่กด ไม่ใช่ทุกไฟล์ — ยอมรับได้ ดีกว่าไม่พาไปเลย
 */
let resultFiles = null;
const resultWatchers = new Set();
function notifyResultWatchers() {
  for (const w of resultWatchers) { if (w.dead()) resultWatchers.delete(w); else w.fn(); }
}
export function setResultFiles(files) {
  resultFiles = files && files.length ? [...files] : null;
  notifyResultWatchers();
}
function announceResult(blob, filename) {
  try { setResultFiles([new File([blob], filename, { type: blob.type })]); }
  catch { /* เบราว์เซอร์เก่ามาก ๆ ที่ไม่รองรับ File ตรง ๆ — ไม่ใช่จุดคอขวด ปล่อยผ่านเงียบ ๆ */ }
}
/** ไฟล์ผลลัพธ์ล่าสุดที่ "เครื่องมือปลายทาง t" รับได้ — ใช้ตัดสินว่าการ์ดนี้พาไฟล์ไปได้ไหม */
function resultFilesFor(t) {
  if (!resultFiles || !t.accepts) return null;
  const picked = resultFiles.filter((f) => t.accepts.includes(detectType(f)));
  return picked.length ? picked : null;
}
/** ล้างผลลัพธ์ที่ค้างอยู่ทุกครั้งที่เนื้อหาใน #tool ถูกเปลี่ยน (สลับเครื่องมือ/กลับหน้าแรก)
 *  ตั้งค่าครั้งเดียวทั้งหน้าเว็บ — เรียกซ้ำได้ปลอดภัย (มีธงกันซ้ำ) */
let resultLifecycleReady = false;
function ensureResultLifecycle() {
  if (resultLifecycleReady) return;
  const host = document.getElementById("tool");
  if (!host) return; // ยังไม่มี #tool ในหน้า (ไม่ควรเกิด แต่กันพังไว้)
  resultLifecycleReady = true;
  new MutationObserver((muts) => {
    if (muts.some((m) => m.removedNodes.length)) setResultFiles(null);
  }).observe(host, { childList: true });
}

/* ── ลากไฟล์ลงตรงไหนของหน้าก็ได้ + วางจากคลิปบอร์ด ─────────────────────
 * เว็บเครื่องมือรุ่นใหม่ไม่บังคับให้เล็งกล่องเล็ก ๆ อีกแล้ว — ลากเข้าหน้าจอที่ไหนก็รับ
 * และแคปหน้าจอแล้วกด Ctrl+V ได้เลยโดยไม่ต้องเซฟไฟล์ก่อน
 * ผ้าคลุมมีชิ้นเดียวทั้งเว็บ (ทีละหน้ามีกล่องเดียวอยู่แล้ว) สร้างตอนถูกใช้ครั้งแรกเท่านั้น */
/** ── กล่องลากวางไฟล์ ───────────────────────────────────────────────────── */
export function dropzone(opts = {}) {
  const {
    accept = "*/*", multiple = true, reorder = false,
    hint = tr("ลากไฟล์มาวาง หรือคลิกเพื่อเลือก", "Drop files here, or click to choose"),
    onChange = () => {},
    expect = null,                 // เช่น ["pdf"] — ชนิดไฟล์ที่เครื่องมือนี้รับ
    thumbs = true,                 // false = เครื่องมือมีแกลเลอรีภาพของตัวเองแล้ว อย่าโชว์ซ้ำ
    expectLabel = tr("ไฟล์ชนิดที่รองรับ", "a supported file type"),
  } = opts;

  let files = [];
  // ‼️ ภาพย่อคงอยู่ข้าม render() (คีย์ด้วยตัว File เอง) — ไม่งั้นทุกครั้งที่มีไฟล์เพิ่ม/ลบ/สลับลำดับ
  //    list.innerHTML="" ใน render() จะล้างภาพที่คำนวณไปแล้วทิ้ง ต้องมาคำนวณใหม่ทุกรอบ
  const thumbCache = new Map();  // File -> { kind, node, pending }
  const pageCounts = new Map();  // File -> จำนวนหน้าของ PDF (คำนวณครั้งเดียวต่อไฟล์)
  const pagePending = new Set(); // ไฟล์ที่กำลังนับหน้าอยู่ กันยิงซ้ำระหว่าง render รอบถัดไป
  const thumbUrls  = new Map();  // File -> objectURL ของรูป (เฉพาะรูป) — ต้อง revoke ตอนไฟล์หลุดจากลิสต์
  const states = new Map();      // File -> "working" | "done" | "error" (ไม่มีในทะเบียน = ยังไม่เริ่ม)
  const input = el("input", {
    type: "file", accept, multiple: multiple || null, hidden: true,
    onchange: (e) => { add([...e.target.files]); input.value = ""; },
  });
  const list = el("div", { class: "files" });
  const chooseBtn = el("button", { class: "dz-btn", type: "button",
    onclick: (e) => { e.stopPropagation(); input.click(); } }, tr("เลือกไฟล์", "Choose files"));
  const zone = el("div", {
    class: "dz", tabindex: "0", role: "button",
    "aria-label": tr(`เลือกไฟล์: ${expectLabel} คลิกหรือกด Enter เพื่อเลือก หรือลากไฟล์มาวาง`,
                     `Choose files: ${expectLabel}, click or press Enter to pick, or drop files here`),
  }, [
    el("div", { class: "dz-ico", "aria-hidden": "true" }, [uiIcon("upload", "dz-svg")]),
    el("div", { class: "dz-main" }, tr("ลากไฟล์มาวางที่นี่", "Drop your files here")),
    chooseBtn,
    // โผล่แทนทั้งกล่องตอนยุบแล้ว (CSS สลับให้) — ยังลากไฟล์ทับได้เหมือนเดิม
    el("span", { class: "dz-more" }, tr("+ เพิ่มไฟล์", "+ Add files")),
    el("div", { class: "dz-hint" }, expect && expect.includes("image")
      ? hint + tr(", วางจากคลิปบอร์ดได้ (Ctrl+V)", ", or paste from clipboard (Ctrl+V)") : hint),
    // ย้ำความเป็นส่วนตัวตรงจุดที่ผู้ใช้กำลังลังเลจะปล่อยไฟล์ ไม่ใช่ปล่อยให้ไปอ่านที่ท้ายหน้า
    el("div", { class: "dz-safe" }, [uiIcon("lock", "safe-svg"), tr("ไฟล์อยู่ในเครื่องคุณ ไม่ถูกส่งไปที่ไหนทั้งสิ้น", "Your files stay on this device, nothing is uploaded")]),
    input,
  ]);

  /* ‼️ กล่องถูกสร้างใหม่ทุกครั้งที่เปลี่ยนเครื่องมือ — listener ที่ผูกไว้ที่ document
     ต้องถอดตัวเองเมื่อกล่องหลุดจากหน้าแล้ว ไม่งั้นกล่องเก่าจะแย่งรับไฟล์ของกล่องใหม่ */
  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  const pageHandlers = {
    dragenter: (e) => { if (!hasFiles(e)) return; dragDepth++; showVeil(true, tr("ปล่อยไฟล์ได้เลย", "Drop your files")); },
    dragover:  (e) => { if (hasFiles(e)) e.preventDefault(); },
    dragleave: () => { if (--dragDepth <= 0) { dragDepth = 0; showVeil(false); } },
    drop: (e) => {
      dragDepth = 0; showVeil(false);
      const f = [...(e.dataTransfer?.files || [])];
      if (!f.length) return;
      e.preventDefault();
      claim(e, f);
    },
    paste: (e) => {
      const f = filesFromClipboard(e);
      if (!f.length) return;                 // วางข้อความธรรมดา — ปล่อยผ่านไปตามปกติ
      e.preventDefault();
      claim(e, f);
    },
  };
  /** กล่องนี้ควรรับไฟล์ชุดนี้ไหม — รับได้ = คว้าไปเลย · รับไม่ได้ = รอดูว่ามีใบอื่นคว้าไหม */
  function claim(e, f) {
    if (claimedEvents.has(e)) return;
    if (!expect || f.some((x) => expect.includes(detectType(x)))) {
      claimedEvents.add(e);
      add(f);
      return;
    }
    queueMicrotask(() => {                   // ตัวรับ sync ของกล่องอื่นทำงานจบแล้วตรงนี้
      if (claimedEvents.has(e)) return;      // ใบอื่นรับไปแล้ว — เงียบไว้ อย่าเตือนซ้ำ
      claimedEvents.add(e);
      add(f);                                // ไม่มีใครรับได้เลย → เตือนผิดชนิดใบเดียว
    });
  }

  const onPage = (e) => {
    if (!zone.isConnected) {                 // ซ่อนอยู่ (ยังอยู่ในแคช) — ไม่รับงาน แต่ยังไม่ถอดทิ้ง
      showVeil(false);
      return;
    }
    pageHandlers[e.type](e);
  };
  for (const t of Object.keys(pageHandlers)) document.addEventListener(t, onPage);

  /* ‼️ ภาพย่อกินหน่วยความจำจริง (objectURL 1 ตัวต่อรูป ไม่เคยถูกคืนจนกว่าจะปิดแท็บ)
   * เดิมเปิดเครื่องมือทิ้งไว้พร้อมรูป 30 ใบแล้วสลับไปตัวอื่น = รูปทั้ง 30 ยังกินแรมอยู่
   * (วัดจาก tests/browser_leak.py) · คืนตอนหลับ แล้ววาดใหม่ตอนตื่น — ไฟล์ยังอยู่ครบ */
  function releaseThumbs() {
    for (const u of thumbUrls.values()) URL.revokeObjectURL(u);
    thumbUrls.clear(); thumbCache.clear();
  }
  zoneDisposers.add({
    zone,
    hasFiles: () => files.length > 0,
    sleep: releaseThumbs,
    wake() { if (files.length) render(); },
    dispose() {
      for (const t of Object.keys(pageHandlers)) document.removeEventListener(t, onPage);
      releaseThumbs(); states.clear(); files = [];
    },
  });

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
  });
  ["dragenter", "dragover"].forEach((t) =>
    zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.add("over"); }));
  ["dragleave", "dragend"].forEach((t) =>
    zone.addEventListener(t, () => zone.classList.remove("over")));
  zone.addEventListener("drop", (e) => {
    e.stopPropagation();                     // ตัวรับของทั้งหน้าอยู่ชั้น capture — กันนับซ้ำสองใบ
    e.preventDefault();
    zone.classList.remove("over");
    dragDepth = 0; showVeil(false);
    add([...(e.dataTransfer?.files || [])]);
  });

  function add(incoming) {
    if (!incoming.length) return;
    warn.innerHTML = "";

    // กันเคสที่ผู้ใช้ลากไฟล์ผิดชนิดเข้ามา (เช่นเอา PowerPoint ใส่เครื่องมือ PDF)
    // เดิมไฟล์จะถูกรับเข้าไปแล้วไปพังตอนอ่าน ทำให้ขึ้นว่า "ไฟล์เสียหาย"ซึ่งไม่จริง
    let usable = incoming;
    if (expect) {
      const bad = [];
      usable = incoming.filter((f) => {
        const kind = detectType(f);
        if (kind && expect.includes(kind)) return true;
        bad.push({ file: f, kind });
        return false;
      });
      if (bad.length) showWrongType(bad);
      if (!usable.length) return;
    }

    /* ‼️ เลือกไฟล์เดิมซ้ำ (กดเลือกอีกรอบ ลากซ้ำ วางซ้ำ) เดิมได้แถวซ้ำกันเป๊ะ 2 แถว
     * แล้วผลลัพธ์ก็ออกมาซ้ำ 2 ชุดชื่อเดียวกัน คนใช้โปรแกรมอ่านหน้าจอแยกไม่ออกเลยว่าปุ่มไหนของใคร
     * (จับได้จาก tests/browser_a11y.py) · เทียบด้วยชื่อ+ขนาด+เวลาแก้ไขล่าสุด แบบเดียวกับหน้าแรก */
    const key = (f) => `${f.name}|${f.size}|${f.lastModified}`;
    if (multiple) {
      const have = new Set(files.map(key));
      usable = usable.filter((f) => !have.has(key(f)) && (have.add(key(f)), true));
      if (!usable.length) return;              // ไฟล์เดิมทั้งหมด ไม่มีอะไรให้เพิ่ม
    }
    if (!multiple) files.forEach(revokeThumb); // โหมดไฟล์เดียว — ไฟล์เก่าถูกแทนที่ ต้องคืนหน่วยความจำก่อน
    files = multiple ? files.concat(usable) : usable.slice(0, 1);
    render();
    onChange(files);
  }

  /** เอา objectURL ของภาพย่อไฟล์นี้คืนหน่วยความจำ (ถ้ามี) — เรียกทุกครั้งที่ไฟล์หลุดจากลิสต์ */
  /** ข้อความจำนวนหน้าของไฟล์นี้ถ้ารู้แล้ว — ยังไม่รู้ = ค่าว่าง ให้ paintPages เติมทีหลัง
   *  (ค่าถูกแคชไว้ ข้าม render รอบถัดไปจึงไม่กะพริบหายแล้วโผล่ใหม่) */
  function pageLabel(file) {
    const n = pageCounts.get(file);
    return n == null ? "" : tr(`${n} หน้า`, n === 1 ? "1 page" : `${pl(n, "page", "pages")}`);
  }

  function revokeThumb(file) {
    const u = thumbUrls.get(file);
    if (u) { URL.revokeObjectURL(u); thumbUrls.delete(file); }
    thumbCache.delete(file);
  }

  /** วาดภาพย่อของแถวนี้: ถ้ามีผลอยู่แล้ว (จากรอบ render ก่อน) ใช้ทันที · ถ้ายัง เริ่มคำนวณแบบไม่บล็อก
   *  (รูป → objectURL, PDF → หน้าแรกผ่าน pdf.js ถ้าโหลดอยู่แล้ว, อื่น ๆ → ไอคอนทั่วไปค้างไว้) */
  function ensureThumb(file, row) {
    let entry = thumbCache.get(file);
    if (!entry) { entry = { kind: detectType(file), node: null, pending: false }; thumbCache.set(file, entry); }
    paintThumb(row, entry);
    if (entry.node || entry.pending) return; // มีภาพแล้ว หรือกำลังคำนวณจากรอบก่อนอยู่แล้ว ไม่ทำซ้ำ

    if (entry.kind === "image") {
      entry.pending = true;
      const url = URL.createObjectURL(file);
      thumbUrls.set(file, url);
      const img = el("img", { alt: "", decoding: "async" });
      img.addEventListener("load", () => { entry.pending = false; entry.node = img; rePaintIfPresent(file, entry); }, { once: true });
      img.addEventListener("error", () => { entry.pending = false; URL.revokeObjectURL(url); thumbUrls.delete(file); }, { once: true });
      img.src = url;
    } else if (entry.kind === "pdf" && window.pdfjsLib) {
      entry.pending = true;
      renderPdfThumbCanvas(file).then((res) => {
        entry.pending = false;
        if (!res) return;
        entry.node = res.canvas;
        if (res.pages) { pageCounts.set(file, res.pages); paintPages(file); }
        rePaintIfPresent(file, entry);
      });
    }
  }

  /** เติมจำนวนหน้าลงชิปไฟล์ PDF — งานเบื้องหลัง ไม่บล็อกการวาดแถว
   *  ‼️ เริ่มก็ต่อเมื่อมีไลบรารีอยู่แล้ว (ดู pdfPageCount) และทำครั้งเดียวต่อไฟล์ */
  function ensurePageCount(file) {
    if (detectType(file) !== "pdf") return;
    if (pageCounts.has(file) || pagePending.has(file)) return;
    if (!window.PDFLib && !window.pdfjsLib) return;
    pagePending.add(file);
    pdfPageCount(file).then((n) => {
      pagePending.delete(file);
      if (n == null) return;
      pageCounts.set(file, n);
      paintPages(file);
    });
  }
  /** วาดจำนวนหน้าลงแถวปัจจุบันของไฟล์นี้ — query สดเพราะ render() อาจสร้างแถวใหม่ไปแล้วระหว่างรอ */
  function paintPages(file) {
    const i = files.indexOf(file);
    if (i === -1) return;
    const n = pageCounts.get(file);
    const slot = list.querySelector(`.file-row[data-i="${i}"] .f-pages`);
    if (slot && n != null) slot.textContent = tr(`${n} หน้า`, n === 1 ? "1 page" : `${pl(n, "page", "pages")}`);
  }

  /** วาดผลภาพย่อที่เพิ่งคำนวณเสร็จลงแถวปัจจุบันของไฟล์นี้ — ใช้ query สดเพราะ render() อาจสร้างแถวใหม่ไปแล้ว
   *  ระหว่างที่รอ (เช่นผู้ใช้ลาก/ลบไฟล์อื่นระหว่างนั้น) ทำให้ node เดิมอ้างอิง DOM ที่หลุดไปแล้ว */
  function rePaintIfPresent(file, entry) {
    const i = files.indexOf(file);
    if (i === -1) return; // ไฟล์ถูกเอาออกไปแล้วระหว่างรอภาพย่อ
    const row = list.querySelector(`.file-row[data-i="${i}"]`);
    if (row) paintThumb(row, entry);
  }

  function showWrongType(bad) {
    const first = bad[0];
    const info = wrongTypeMessage(first.kind, expectLabel);
    const names = bad.map((b) => b.file.name).join(", ");
    const box = el("div", { class: "wrong-type" }, [
      el("div", {}, [
        el("strong", {}, tr("ไฟล์นี้ใช้กับเครื่องมือนี้ไม่ได้", "This file does not work with this tool")),
        el("div", { class: "wt-detail" }, `${info.text}: ${names}`),
      ]),
      info.toolId
        ? el("button", { class: "btn", type: "button",
            onclick: () => { location.hash = "#/" + info.toolId; } },
            tr(`ไปที่ ${info.toolName} →`, `Go to ${info.toolName} →`))
        : null,
    ]);
    warn.appendChild(box);
  }
  function remove(i) { revokeThumb(files[i]); pageCounts.delete(files[i]); pagePending.delete(files[i]);
    states.delete(files[i]); files.splice(i, 1); render(); onChange(files); }

  /** ป้ายสถานะท้ายแถว — ยังไม่เริ่มทำ = ไม่ต้องมีป้าย (แถวเปล่าอ่านง่ายกว่าป้าย "รอ" เต็มจอ) */
  function stateBadge(st) {
    if (!st || st === "pending") return null;
    const label = st === "working" ? tr("กำลังทำ", "Working")
                : st === "done"    ? tr("เสร็จ", "Done")
                                   : tr("ไม่สำเร็จ", "Failed");
    return el("span", { class: "state" }, label);
  }
  function move(from, to) {
    if (from === to || from < 0 || to < 0) return;
    files.splice(to, 0, files.splice(from, 1)[0]);
    render(); onChange(files);
  }

  stateWatchers.add({
    dead: () => !zone.isConnected,
    fn: (file, state) => {
      const i = files.indexOf(file);
      if (i === -1) return;
      states.set(file, state);
      const row = list.querySelector(`.file-row[data-i="${i}"]`);
      if (!row) return;
      row.dataset.state = state;
      row.querySelector(".state")?.remove();
      const badge = stateBadge(state);
      if (badge) row.insertBefore(badge, row.querySelector(".icon-btn"));
    },
  });

  /** กล่องภาพย่อ — ถ้าไฟล์เปิดดูได้ ทำเป็นปุ่มกดดูรูปใหญ่ ไม่ใช่แค่รูปประดับ */
  function thumbBox(f) {
    const kind = detectType(f);
    if (kind !== "image" && kind !== "pdf") {
      return el("span", { class: "thumb generic", "aria-hidden": "true" });
    }
    const btn = el("button", {
      class: "thumb generic", type: "button",
      title: tr("กดเพื่อดูรูปใหญ่", "Click to view larger"),
      "aria-label": tr(`ดู ${f.name} ขนาดใหญ่`, `View ${f.name} larger`),
      onclick: async (e) => {
        e.stopPropagation();
        /* ‼️ ตัวดูไฟล์เปิด PDF ได้ก็ต่อเมื่อ pdf.js โหลดอยู่แล้ว — แต่เครื่องมืออย่าง
         * รวม PDF / ใส่ลายน้ำ ใช้แค่ pdf-lib ไม่ได้ดึง pdf.js มาเลย ผลคือกดภาพย่อของ
         * ไฟล์ PDF แล้ว "เงียบสนิท ไม่มีอะไรเกิดขึ้น ไม่มี error" ให้งงเล่น
         * (จับได้จาก tests/browser_crossbrowser.py เกิดเหมือนกันทั้ง Chrome และ Firefox)
         * กดแล้วคือแสดงเจตนาจะดูแล้ว ดึงตัวอ่านมาให้ตอนนั้นเลยดีกว่าเงียบใส่ */
        if (kind === "pdf" && !window.pdfjsLib) {
          btn.classList.add("loading");
          btn.disabled = true;
          try {
            const { loadLibs } = await import("./loader.js");
            await loadLibs("pdfjs");
          } catch {
            btn.classList.remove("loading");
            btn.disabled = false;
            return;                  // เปิดไม่ได้จริง ๆ (เน็ตหลุด) — ปล่อยให้ภาพย่อเป็นไอคอนเหมือนเดิม
          }
          btn.classList.remove("loading");
          btn.disabled = false;
          revokeThumb(f);            // มีตัวอ่านแล้ว วาดภาพย่อหน้าแรกจริงแทนไอคอนได้
          render();
        }
        const m = await import("./preview.js");
        m.viewFile(f, files);        // ส่งทั้งชุดไปด้วย จะได้เลื่อนดูใบอื่นต่อได้เลย
      },
    });
    return btn;
  }

  function render() {
    // ‼️ วัดจริงบนมือถือ: กล่องลากไฟล์สูง 243px = 29% ของจอ และไม่หดเลยหลังเลือกไฟล์แล้ว
    //    พอมีไฟล์ในมือ คำเชิญ "ลากไฟล์มาวางที่นี่" กับปุ่มลองไฟล์ตัวอย่างหมดหน้าที่แล้ว
    //    ยุบเหลือแถบเตี้ย "เพิ่มไฟล์" — ผลลัพธ์กับปุ่มลงมือจะเลื่อนขึ้นมาอยู่ในสายตาแทน
    container.classList.toggle("has-files", files.length > 0);
    syncActionButtons();
    ensureRowStyle();
    list.innerHTML = "";
    files.forEach((f, i) => {
      // ‼️ การลากวางแบบ HTML5 ใช้ไม่ได้เลยบนมือถือและกับคนที่ใช้คีย์บอร์ดอย่างเดียว
      //    จึงต้องมีปุ่มขึ้น-ลงคู่กันเสมอ ไม่ใช่ทางเลือกเสริม
      const move = (d) => { const j = i + d; if (j < 0 || j >= files.length) return;
        [files[i], files[j]] = [files[j], files[i]]; render(); onChange(files); };
      const row = el("div", { class: "file-row", draggable: reorder || null, "data-i": i,
        "data-state": states.get(f) || "pending" }, [
        reorder ? el("span", { class: "grip", title: tr("ลากเพื่อสลับลำดับ", "Drag to reorder"), "aria-hidden": "true" }, [uiIcon("grip", "grip-svg")]) : null,
        thumbs ? thumbBox(f) : null,
        openable(f) ? el("button", { class: "f-meta f-open", type: "button",
            title: tr("กดเพื่อดูข้อมูลในไฟล์", "Click to see what's inside"),
            "aria-label": tr(`ดูข้อมูลใน ${f.name}`, `View contents of ${f.name}`),
            onclick: async (e) => { e.stopPropagation();
              const m = await import("./preview.js"); m.viewFile(f, files); } }, [
          el("span", { class: "f-name" }, f.name),
          // ขนาดกับจำนวนหน้าอยู่บรรทัดเดียวกัน — .f-meta เป็นคอลัมน์ ถ้าแยก span จะกลายเป็นบรรทัดที่ 3
          el("span", { class: "f-sub" }, [
            el("span", { class: "f-size" }, fmtBytes(f.size)),
            el("span", { class: "f-pages" }, pageLabel(f)),
          ]),
        ]) : el("span", { class: "f-meta" }, [
          el("span", { class: "f-name" }, f.name),
          el("span", { class: "f-sub" }, [
            el("span", { class: "f-size" }, fmtBytes(f.size)),
            el("span", { class: "f-pages" }, pageLabel(f)),
          ]),
        ]),
        stateBadge(states.get(f)),
        reorder ? el("button", { class: "icon-btn", type: "button", "aria-label": tr(`เลื่อน ${f.name} ขึ้น`, `Move ${f.name} up`),
          title: tr("เลื่อนขึ้น", "Move up"), disabled: i === 0 || null, onclick: () => move(-1) }, "↑") : null,
        reorder ? el("button", { class: "icon-btn", type: "button", "aria-label": tr(`เลื่อน ${f.name} ลง`, `Move ${f.name} down`),
          title: tr("เลื่อนลง", "Move down"), disabled: i === files.length - 1 || null, onclick: () => move(1) }, "↓") : null,
        el("button", { class: "icon-btn danger", type: "button", title: tr("เอาออก", "Remove"),
          "aria-label": tr(`เอา ${f.name} ออก`, `Remove ${f.name}`), onclick: () => remove(i) }, [uiIcon("close", "pg-ico")]),
      ]);
      list.appendChild(row);
      if (thumbs) ensureThumb(f, row);   // วาดไอคอนทั่วไปทันที แล้วเติมภาพจริงทีหลังถ้าทำได้
      ensurePageCount(f);                // จำนวนหน้าของ PDF เติมทีหลังเช่นกัน ไม่หน่วงการวาดแถว
    });
    count.textContent = !files.length ? ""
      : tr(`${files.length} ไฟล์, รวม ${fmtBytes(files.reduce((a, f) => a + f.size, 0))}`,
           `${pl(files.length, "file", "files")}, ${fmtBytes(files.reduce((a, f) => a + f.size, 0))} total`);
  }

  if (reorder) {
    let dragging = null;
    list.addEventListener("dragstart", (e) => {
      dragging = e.target.closest(".file-row");
      if (dragging) dragging.classList.add("dragging");
    });
    list.addEventListener("dragend", () => {
      list.querySelectorAll(".file-row").forEach((n) => n.classList.remove("dragging", "over"));
      dragging = null;
    });
    list.addEventListener("dragover", (e) => {
      e.preventDefault();
      const over = e.target.closest(".file-row");
      if (!over || over === dragging) return;
      list.querySelectorAll(".file-row").forEach((n) => n.classList.remove("over"));
      over.classList.add("over");
    });
    list.addEventListener("drop", (e) => {
      e.preventDefault();
      const over = e.target.closest(".file-row");
      if (!over || !dragging) return;
      move(+dragging.dataset.i, +over.dataset.i);
    });
  }

  const count = el("div", { class: "dz-count" });
  const warn = el("div", {});

  // ‼️ ปุ่ม "ลองด้วยไฟล์ตัวอย่าง" — โผล่เฉพาะเมื่อ opts.expect บอกชนิดไฟล์ไว้ชัดเจน
  //    โหลดจริงเฉพาะตอนกด (fetch ใน onclick) ไม่โหลดตอนเปิดหน้า จึงไม่ถ่วงหน้าแรก
  const sampleKind = expect && SAMPLE_KIND_PRIORITY.find((k) => expect.includes(k) && SAMPLE_FILES[k]);
  let sampleBox = null;
  if (sampleKind) {
    const entries = SAMPLE_FILES[sampleKind].slice(0, multiple ? 2 : 1);
    const sampleErr = el("small", { class: "dz-sample-err", style: { display: "block", marginTop: "6px", color: "var(--err)" } });
    const sampleBtn = button(tr("ลองด้วยไฟล์ตัวอย่าง", "Try a sample file"), {
      ghost: true,
      onclick: async () => {
        sampleBtn.disabled = true;
        sampleBtn.textContent = tr("กำลังโหลด…", "Loading…");
        sampleErr.textContent = "";
        try {
          const loaded = [];
          for (const [path, , ] of entries) {
            const res = await fetch(path);
            if (!res.ok) throw new Error("fetch failed: " + path);
            const blob = await res.blob();
            loaded.push(new File([blob], path.split("/").pop(), { type: blob.type }));
          }
          add(loaded);
        } catch (e) {
          // ออฟไลน์/ไฟล์หาย/ถูกบล็อก — บอกสั้น ๆ ไม่ให้หน้าเครื่องมือพัง
          sampleErr.textContent = tr("โหลดไฟล์ตัวอย่างไม่สำเร็จ ลองใหม่อีกครั้ง", "Couldn't load the sample file. Please try again.");
        } finally {
          sampleBtn.disabled = false;
          sampleBtn.textContent = tr("ลองด้วยไฟล์ตัวอย่าง", "Try a sample file");
        }
      },
    });
    sampleBox = el("div", { class: "dz-sample", style: { marginTop: "10px" } }, [sampleBtn, sampleErr]);
  }

  const container = el("div", { class: "dz-wrap" }, [zone, sampleBox, warn, count, list]);

  /* ── ปุ่มลงมือทำต้องบอกความจริงว่าตอนนี้กดได้หรือยัง ──────────────────
   * ‼️ สำรวจทั้งเว็บ 11/09/2026 พบ 19 จาก 36 เครื่องมือที่ปุ่มลงมือทำดำเข้มกดได้
   * ทั้งที่ยังไม่มีไฟล์เลย กดแล้วเจอข้อความดุว่า "กรุณาเลือกไฟล์ก่อน" ทั้งที่ระบบรู้อยู่แล้ว
   * ส่วนอีกไม่กี่ตัวทำถูกคือปุ่มจาง ความไม่สม่ำเสมอทำให้คนใช้เรียนรู้กฎของเว็บไม่ได้
   *
   * ‼️‼️ กฎเหล็กของฟังก์ชันนี้: **ปิดได้ แต่ห้ามเปิดทับ**
   * เครื่องมือหลายตัวมีเงื่อนไขของตัวเองที่ปิดปุ่มไว้ถูกต้องแล้ว เช่น pdf-sign ที่ยังไม่ได้
   * วางลายเซ็น หรือ word-replace ที่ยังไม่ได้กรอกคู่คำ ถ้าเราไปเปิดทับจะพังทันที
   * จึงจำไว้ว่าปุ่มไหน "เราเป็นคนปิด" แล้วเปิดคืนเฉพาะปุ่มนั้น
   *
   * ‼️ ต้องดูกล่องลากไฟล์ทุกกล่องในหน้า เพราะบางเครื่องมือรับสองไฟล์คนละกล่อง
   * (เช่นจดหมายเวียนที่ต้องมีทั้ง Word และ Excel) ครบทุกกล่องแล้วถึงจะเรียกว่าพร้อม */
  function syncActionButtons() {
    const scope = container.closest(".panel") || document;
    const zones = [...scope.querySelectorAll(".dz-wrap")];
    const ready = zones.length > 0 && zones.every((z) => z.classList.contains("has-files"));
    const btns = scope.querySelectorAll(".actions button.btn, .ws-footer button.btn");
    for (const b of btns) {
      if (b.classList.contains("ghost")) continue;   // ปุ่มช่วยอย่างรีเซ็ตหรือคัดลอก กดได้ตลอด
      if (!ready) {
        if (!b.disabled) { CLOSED_BY_US.add(b); b.disabled = true; }
      } else if (CLOSED_BY_US.has(b)) {
        CLOSED_BY_US.delete(b); b.disabled = false;
      }
    }
  }


  // หยิบไฟล์ที่หน้าแรกฝากไว้ (ถ้าชนิดตรงกับที่เครื่องมือนี้รับ) — ผู้ใช้จะได้ไม่ต้องเลือกไฟล์ซ้ำ
  if (stashed) {
    const mine = expect ? stashed.filter((f) => expect.includes(detectType(f))) : stashed;
    if (mine.length) { const take = mine; stashed = null; queueMicrotask(() => add(take)); }
  }
  /* ‼️ render() ถูกเรียกเฉพาะตอนไฟล์เปลี่ยน ตอนเปิดหน้ามาใหม่จึงไม่มีใครปิดปุ่มให้เลย
     ต้องยิงครั้งแรกเองหลังหน้าประกอบเสร็จ ใช้ rAF เพราะเครื่องมือยัง append ปุ่มต่อ
     หลังจากเรียก dropzone() จบ ถ้ายิงทันทีจะยังหาปุ่มไม่เจอ */
  requestAnimationFrame(syncActionButtons);

  return { container, get files() { return files; },
           clear() { files = []; warn.innerHTML = ""; render(); onChange(files); } };
}

/** แปลง "1-3,5,8-"เป็นอาร์เรย์เลขหน้า (ฐาน 1) — ใช้ร่วมหลายเครื่องมือ */
export function parsePages(spec, total) {
  const out = new Set();
  for (const part of String(spec).split(",")) {
    const s = part.trim();
    if (!s) continue;
    const m = s.match(/^(\d+)?\s*-\s*(\d+)?$/);
    if (m) {
      const a = Math.max(1, +(m[1] || 1));
      const b = Math.min(total, +(m[2] || total));
      for (let i = a; i <= b; i++) out.add(i);
    } else if (/^\d+$/.test(s)) {
      const n = +s;
      if (n >= 1 && n <= total) out.add(n);
    } else {
      throw new Error(tr(`อ่านช่วงหน้าไม่เข้าใจ: "${s}"`, `Could not read the page range: "${s}"`));
    }
  }
  return [...out].sort((a, b) => a - b);
}

export const stripExt = (n) => (n.lastIndexOf(".") > 0 ? n.slice(0, n.lastIndexOf(".")) : n);

/**
 * วนทำงานทีละไฟล์แบบ "ทนต่อไฟล์เสีย"
 * เดิมทุกเครื่องมือครอบ try รอบลูปทั้งก้อน → ไฟล์เดียวพัง = ผลงานที่แปลงสำเร็จไปแล้วหายหมด
 * ซึ่งเจ็บมากเวลาลากมา 30 ไฟล์แล้วมีไฟล์เสียปนอยู่ใบเดียว
 * คืนรายการไฟล์ที่ข้ามไปพร้อมเหตุผล เพื่อเอาไปบอกผู้ใช้ให้ตรงจุด
 */
export async function eachFile(files, st, fn) {
  /* ‼️ ทำงานบน "สำเนา" ของรายการเสมอ — ผู้ใช้ลบไฟล์กลางลิสต์ระหว่างที่ยังทำงานอยู่ได้
   * (กดถังขยะในกล่องลากไฟล์) ซึ่งไปตัด array ตัวเดียวกับที่ลูปนี้กำลังวนอยู่พอดี
   * ผลคือดัชนีเลื่อน ทำงานข้ามไฟล์ แล้วงานทั้งชุดเงียบหายไปทั้งที่ทำไปแล้วครึ่งทาง
   * (จับได้จาก tests/browser_stress.py ⑤) */
  const list = [...files];
  const failed = [];
  st?.begin?.();
  let stopped = 0;
  for (let i = 0; i < list.length; i++) {
    if (st?.cancelled) { stopped = list.length - i; break; }
    emitFileState(list[i], "working");
    try { await fn(list[i], i); emitFileState(list[i], "done"); }
    catch (e) { emitFileState(list[i], "error"); failed.push({ name: list[i].name, why: (e && e.message) || String(e) }); }
    st?.progress?.(((i + 1) / list.length) * 100, `(${i + 1}/${list.length})`);
    await yieldToBrowser();
  }
  st?.end?.();
  failed.stopped = stopped;          // ไฟล์ที่ยังไม่ได้ทำเพราะผู้ใช้กดหยุด
  return failed;
}

/* ‼️ งานหนักของเครื่องมือสายภาพ (ถอดรหัส JPEG/PNG, วาด canvas, เข้ารหัสใหม่, เรนเดอร์หน้า PDF)
 * เกือบทั้งหมดเป็นโค้ด native ของเบราว์เซอร์ที่ทำงานนอกเธรดหลักอยู่แล้ว วัดจริงแล้วเวลา 60-86%
 * หมดไปกับตรงนี้ แต่โค้ดเราสั่งทีละชิ้นแล้วรอให้เสร็จก่อนค่อยสั่งชิ้นถัดไป = ปล่อยแกนอื่นว่างเปล่าตลอดทาง
 *
 * ตัวช่วยนี้แยกงานเป็น 2 จังหวะ
 *   prepare  งานหนักที่ทำพร้อมกันหลายชิ้นได้ (จำกัดจำนวนกันแรมพุ่ง)
 *   commit   งานเบาที่ต้อง "เรียงตามลำดับเดิมเป๊ะ ๆ" เช่นต่อหน้าเข้าไฟล์ PDF หรือเก็บผลลงรายการ
 * ‼️ commit ถูกเรียกตามลำดับดัชนีเดิมเสมอ ไม่ใช่ตามลำดับที่ทำเสร็จ ไม่งั้นหน้าใน PDF จะสลับกันแบบสุ่ม */
export function suggestedConcurrency() {
  const cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
  return Math.max(2, Math.min(4, cores));
}

/** ทำ prepare พร้อมกันหลายชิ้น แล้วเรียก commit ตามลำดับเดิม · คืนจำนวนชิ้นที่ commit สำเร็จ */
export async function mapConcurrent(items, { prepare, commit, concurrency, cancelled } = {}) {
  const list = [...items];
  if (!list.length) return 0;
  const limit = Math.max(1, Math.min(concurrency || suggestedConcurrency(), list.length));
  const running = new Map();   // ดัชนี → งานที่กำลังทำอยู่
  const ready = new Map();     // ดัชนี → ผลที่เสร็จแล้ว รอถึงคิวตัวเอง
  let next = 0, at = 0;

  const fill = () => {
    while (running.size < limit && next < list.length && !cancelled?.()) {
      const i = next++;
      const job = Promise.resolve()
        .then(() => prepare(list[i], i))
        .then((v) => ready.set(i, { ok: true, v }), (e) => ready.set(i, { ok: false, e }))
        .then(() => { running.delete(i); });
      running.set(i, job);
    }
  };

  fill();
  while (at < list.length) {
    if (!ready.has(at)) {
      if (!running.size) break;                       // ผู้ใช้กดหยุด ไม่มีงานค้างแล้ว
      await Promise.race([...running.values()]);
      fill();
      continue;
    }
    const r = ready.get(at);
    ready.delete(at);
    if (!r.ok) throw r.e;                             // ผู้เรียกที่อยากข้ามชิ้นเสีย ให้ดักเองใน prepare
    await commit(r.v, list[at], at);
    at++;
    fill();
    await yieldToBrowser();
  }
  return at;
}

/** เหมือน eachFile แต่ทำงานหนักพร้อมกันหลายไฟล์ · ไฟล์เสียใบเดียวไม่ทำให้ทั้งชุดพัง */
export async function eachFileConcurrent(files, st, { prepare, commit, concurrency } = {}) {
  const list = [...files];       // วนบนสำเนาเสมอ ผู้ใช้ลบไฟล์กลางลิสต์ระหว่างทำงานได้
  const failed = [];
  failed.stopped = 0;
  if (!list.length) return failed;
  const why = (e) => (e && e.message) || String(e);

  st?.begin?.();
  const done = await mapConcurrent(list, {
    concurrency,
    cancelled: () => !!st?.cancelled,
    prepare: async (f, i) => {
      emitFileState(f, "working");
      try { return { ok: true, v: await prepare(f, i) }; }
      catch (e) { return { ok: false, e }; }
    },
    commit: async (r, f, i) => {
      if (r.ok) {
        try { await commit(r.v, f, i); emitFileState(f, "done"); }
        catch (e) { emitFileState(f, "error"); failed.push({ name: f.name, why: why(e) }); }
      } else {
        emitFileState(f, "error");
        failed.push({ name: f.name, why: why(r.e) });
      }
      st?.progress?.(((i + 1) / list.length) * 100, `(${i + 1}/${list.length})`);
    },
  });
  st?.end?.();
  failed.stopped = list.length - done;               // ที่ยังไม่ได้ทำเพราะผู้ใช้กดหยุด
  return failed;
}

/** กล่องสรุปไฟล์ที่ข้ามไป — ใช้คู่กับ eachFile */
export function failedBox(failed) {
  if (!failed) return null;
  if (!failed.length && !failed.stopped) return null;
  if (!failed.length) return el("div", { class: "fail-box" }, [
    el("strong", {}, tr(`หยุดตามที่สั่งแล้ว ยังไม่ได้ทำอีก ${failed.stopped} ไฟล์ (ที่เสร็จแล้วดาวน์โหลดได้ตามปกติ)`,
                        `Stopped as asked, ${pl(failed.stopped, "file", "files")} left untouched (whatever finished is still yours to download)`)),
  ]);
  return el("div", { class: "fail-box" }, [
    el("strong", {}, tr(`ข้ามไป ${failed.length} ไฟล์ที่ทำงานด้วยไม่ได้ (ไฟล์อื่นเสร็จเรียบร้อยแล้ว)`,
                        `Skipped ${pl(failed.length, "file", "files")} this tool could not handle (the rest finished fine)`)),
    el("ul", {}, failed.map((f) => el("li", {}, `${f.name}: ${f.why}`))),
    failed.stopped ? el("div", {}, tr(`หยุดตามที่สั่งแล้ว ยังไม่ได้ทำอีก ${failed.stopped} ไฟล์`,
                                      `Stopped as asked, ${pl(failed.stopped, "file", "files")} left untouched`)) : null,
  ]);
}
