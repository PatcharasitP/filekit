// ─────────────────────────────────────────────────────────────────────────────
// โครงหน้าเครื่องมือ v2 — หนึ่งจอ หนึ่งเรื่อง
//
// ที่มา: พี่ปอนด์สั่ง 20/09/2026 "หน้าเครื่องมือมันยังไม่ถูกใจพี่เลย ไปก็อปเขามาเลยเถอะ
//        I LOVE PDF, SMALLPDF เอาแบบ FULL SYSTEM เลย" แล้วเคาะต้นแบบ 21/09
//        แผนเต็ม: .claude/plans/2026-09-20-filekit-toolpage-v2-plan.md
//
// สิ่งที่วัดมาได้ก่อนออกแบบ (จอ 1920x920 ไฟล์ชุดเดียวกัน เดินครบ 3 สถานะ):
//   ของกดได้ในจอ  iLovePDF 11-19 · Smallpdf 20-27 · FileKit v127 29-57
//   ปุ่มลงมือหลัก  iLovePDF 392x80 · Smallpdf 320x40 · FileKit 89x43
//   หน้าเลื่อนไหม  สองเจ้าแรกไม่เลื่อน · ของเราเลื่อน 1184-1716px
//   มือถืองานเริ่ม iLovePDF 60px · Smallpdf 112px · ของเรา 739-1053px
//   ‼️ และ iLovePDF ใช้โครงเดียวกันเป๊ะทั้ง 8 เครื่องมือที่ยิง ส่วนเรามี 2 โครง คูณ 6 โหมดผัง
//
// หลัก 7 ข้อของ v2
//   1 หนึ่งจอ หนึ่งเรื่อง  4 สถานะ แต่ละสถานะมีปุ่มพระเอกปุ่มเดียว
//   2 โครงเดียวทั้ง 53 เครื่องมือ ไม่มีโหมดผังให้ผู้ใช้เลือก
//   3 งานเริ่มใต้แถบหัวทันที
//   4 สถานะทำงานคือโหมดแอป หน้าเว็บไม่เลื่อน เลื่อนเฉพาะในผืนงานกับในแผง
//   5 ปุ่มหลักยักษ์ ตรึงท้ายแผงเสมอ กดไม่ได้เมื่อไรต้องบอกเหตุผลเป็นข้อความ
//   6 คำอธิบายอยู่หน้าเปล่าใต้จอแรก หรือในแผงผลลัพธ์ ไม่อยู่ในสถานะทำงาน
//   7 มีงบของที่กดได้ และมีเทสบังคับ (tests/browser_shell2.py)
//
// ‼️ ข้อตัดสินใจทางเทคนิคที่สำคัญที่สุดของไฟล์นี้: **ไม่ย้าย node ของเครื่องมือเลย**
//   หน้าเปล่าเป็น "ชั้นลอยทับ" ที่มีปุ่มยักษ์ ซึ่งส่งต่อการกดไปยังปุ่มจริงในกล่องรับไฟล์
//   กล่องรับไฟล์ตัวจริงอยู่ที่เดิมตลอดเวลา เครื่องมือจึงค้น .file-row ของตัวเองเจอเหมือนเดิม
//   เหตุผล: 20/09/2026 เราเพิ่งเสียเวลาทั้งวันกับบั๊ก 4 ตัวที่รากเดียวกันคือ
//   "ย้าย node แล้วของที่อ้างอิงตำแหน่งพังเงียบ ๆ" และตัวที่ร้ายที่สุดคือ
//   กล่องรับไฟล์ถูกย้ายเข้าแถบหัว แล้วแถบหัวถูกซ่อนที่จอ 1820px จนเครื่องมือ 16 ตัว
//   ไม่มีอะไรให้กดเลือกไฟล์เลย · ย้ายน้อยที่สุด = พังน้อยที่สุด
// ─────────────────────────────────────────────────────────────────────────────
import { el } from "./dom.js";
import { configSearch, CFGSEARCH_CSS, flatGroups } from "./cfgsearch.js";
import { toolIcon, uiIcon } from "./icons.js";
import { tr, pl } from "./i18n.js";
import { GROUPS, TOOLS, subsOf } from "./registry.js";
import {
  fileState, treeFiles, watchFiles, setInputFiles, setResultFiles,
  toolMeta, toolExample, toolFaq, nextSteps, railCopyMd, fmtBytes, download,
} from "./ui.js";

const GROUP_ACCENT = {
  pdf: "--g-pdf", "from-pdf": "--g-pdf", "to-pdf": "--g-pdf",
  image: "--g-img", doc: "--g-doc", ppt: "--g-ppt", data: "--g-data",
  excel: "--g-data", thai: "--g-thai",
  powerbi: "--g-powerbi", powerquery: "--g-powerbi", powerautomate: "--g-powerbi",
};
const accentOf = (t) => `var(${GROUP_ACCENT[t.group] || "--brand"})`;

/* ── เมนูรวมเครื่องมือในแถบหัว ───────────────────────────────────────────
 * ถอดจาก iLovePDF: ชี้แล้วการ์ดขาวลอยลงมา **ไม่ดันเนื้อหา** 7 คอลัมน์ แถวละ 36px
 * ของเขามี 33 เครื่องมือใน 7 คอลัมน์ ของเรามี 53 จึงแบ่งคอลัมน์ตามจำนวนจริง
 * ‼️ อ่านจากทะเบียนเสมอ ห้ามฝังรายชื่อไว้ในนี้ (เทสที่ก็อปตรรกะไปเขียนซ้ำจะตกยุคทุกครั้ง)
 * ‼️ หมวด pdf โตเป็น 26 ตัว คอลัมน์เดียวยาวเลยจอ จึงแยกเป็นคอลัมน์ละกลุ่มย่อย
 *   (จัดหน้า, แก้ไขและประทับตรา, ความปลอดภัย, แปลงจาก PDF) ตามช่อง sub ในทะเบียน
 *   id หมวดยังเป็น pdf เหมือนเดิม นี่เป็นเรื่องการแสดงผลล้วน ๆ
 *   ‼️ 23/09/2026 เลิกหั่นด้วยเลขดัชนีตายตัว (MENU_SPLIT เดิม) เพราะพอเพิ่มเครื่องมือกลางหมวด
 *      เส้นแบ่งจะเลื่อนไปคนละที่โดยไม่มีใครรู้ ตอนนี้กลุ่มมาจากทะเบียน เพิ่มตัวใหม่แล้วเข้ากลุ่มถูกเอง */

function menuColumns() {
  const cols = [];
  for (const g of GROUPS) {
    const list = TOOLS.filter((t) => t.group === g.id);
    if (!list.length) continue;
    const subs = subsOf(g.id);
    if (subs) cols.push(...subs.map((s) => ({ head: s.label, accent: g.accent, tools: s.tools })));
    else cols.push({ head: g.label, accent: g.accent, tools: list });
  }
  return cols;
}

/** ต่อเมนูรวมเครื่องมือเข้ากับปุ่มถาวรในแถบหัวของเว็บ
 * ‼️ ปุ่มกับกล่องเมนูอยู่ใน index.html ถาวร ไม่ได้สร้างใหม่ต่อเครื่องมือ
 *   เพราะแอปเก็บ DOM ของเครื่องมือไว้ใช้ซ้ำ ของที่สร้างต่อเครื่องมือจะติดอยู่กับตัวมัน
 *   พอสลับเครื่องมือแล้วสลับกลับ ของนั้นไม่กลับมาที่แถบหัวอีก
 *   (บั๊กจริงที่ tests/browser_shell2.py จับได้ 21/09: ปุ่มภาษากับธีมหายทุกเครื่องมือยกเว้นตัวแรก)
 * ‼️ v2 จึงใช้แถบหัวเดิมของเว็บเป็นแถบหัวของหน้าเครื่องมือเลย ไม่สร้างแถบที่สอง
 *   ได้ทั้งความสูง 60px ตามเป้า และปุ่มธีมกับภาษายังอยู่ที่เดิมโดยไม่ต้องย้ายอะไร */
let menuWired = false;
export function wireToolMenu(tool) {
  const btn = document.getElementById("toolmenu");
  const panel = document.getElementById("toolmenupanel");
  if (!btn || !panel) return { close: () => {}, isOpen: () => false };
  /* ‼️ ต้องถอด hidden ด้วย JS ไม่ใช่ CSS เพราะโปรเจกต์นี้ประกาศ [hidden]{display:none !important}
     ไว้เป็นกฎกลาง (บทเรียน 09/09: กฎของเบราว์เซอร์แพ้ display ที่เราเขียนเอง จึงต้องมี !important)
     กฎที่มี !important จะชนะทุก selector ที่ไม่มี การซ่อนหรือแสดงของชิ้นนี้จึงทำผ่าน JS เท่านั้น */
  btn.hidden = false;

  if (!panel.dataset.built) {
    panel.dataset.built = "1";
    for (const c of menuColumns()) {
      panel.appendChild(el("div", { class: "s2-col" }, [
        el("h4", {}, c.head),
        ...c.tools.map((t) => el("a", {
          class: "s2-mi", href: "#/" + t.id, "data-id": t.id, style: `--gc:var(${c.accent})`,
        }, [
          el("span", { class: "s2-mi-ico", "aria-hidden": "true" }, [toolIcon(t) || t.icon]),
          el("span", { class: "s2-mi-tx" }, t.title),
        ])),
      ]));
    }
  }
  for (const a of panel.querySelectorAll(".s2-mi")) {
    const on = a.dataset.id === tool.id;
    a.classList.toggle("here", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }

  const toggle = (force) => {
    const open = force !== undefined ? force : panel.hidden;
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    if (open) { const f = panel.querySelector(".s2-mi"); if (f) f.focus(); }
  };

  if (!menuWired) {
    menuWired = true;
    btn.addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
    panel.addEventListener("click", () => toggle(false));
    document.addEventListener("click", (e) => {
      if (!panel.hidden && !e.target.closest("#toolmenupanel") && !e.target.closest("#toolmenu")) toggle(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !panel.hidden) { toggle(false); btn.focus(); }
    });
    /* ลูกศรขึ้นลงเดินในคอลัมน์ ซ้ายขวาข้ามคอลัมน์ (ยกตรรกะมาจากริบบอนเดิมที่ผ่าน WCAG แล้ว) */
    panel.addEventListener("keydown", (e) => {
      const cur = document.activeElement;
      if (!cur || !cur.classList || !cur.classList.contains("s2-mi")) return;
      const col = cur.closest(".s2-col");
      const inCol = [...col.querySelectorAll(".s2-mi")];
      const ci = inCol.indexOf(cur);
      const cols = [...panel.querySelectorAll(".s2-col")];
      const colIdx = cols.indexOf(col);
      let to = null;
      if (e.key === "ArrowDown") to = inCol[Math.min(ci + 1, inCol.length - 1)];
      else if (e.key === "ArrowUp") to = inCol[Math.max(ci - 1, 0)];
      else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const next = cols[colIdx + (e.key === "ArrowRight" ? 1 : -1)];
        if (next) { const l = [...next.querySelectorAll(".s2-mi")]; to = l[Math.min(ci, l.length - 1)]; }
      }
      if (!to) return;
      e.preventDefault();
      to.focus();
    });
  }
  return { close: () => toggle(false), isOpen: () => !panel.hidden };
}


/* ── หน้าเปล่า ────────────────────────────────────────────────────────
 * ‼️ เป็นชั้นลอยทับพื้นที่ทำงาน ไม่ใช่การย้ายกล่องรับไฟล์มาไว้ตรงนี้
 *   ปุ่มยักษ์ส่งต่อการกดไปยังปุ่มจริงในกล่อง (ดูหมายเหตุหัวไฟล์ว่าทำไม)
 *   การลากไฟล์ยังทำงานเหมือนเดิมทุกประการ เพราะตัวรับ drop ของกล่องผูกไว้ที่ document อยู่แล้ว */
function landingBlock(tool, forward, pasteLink) {
  const big = el("button", { class: "s2-cta-big", type: "button", onclick: () => forward("pick") },
    tool.accepts && tool.accepts.length
      /* ต่อสตริงแทน template เพราะตรงนี้เป็นชื่อชนิดไฟล์ ไม่ใช่จำนวน (Choose PDF files) เทสพหูพจน์จะได้ไม่จับผิดตัว */
      ? tr(`เลือกไฟล์ ${labelOfAccepts(tool)}`, "Choose " + labelOfAccepts(tool, true) + " files")
      : tr("เริ่มใช้งาน", "Get started"));

  const sample = el("button", { class: "s2-link", type: "button", onclick: () => forward("sample") },
    tr("ลองด้วยไฟล์ตัวอย่าง", "Try a sample file"));

  return el("div", { class: "s2-land" }, [
    el("div", { class: "s2-land-in" }, [
      el("div", { class: "s2-land-ico", "aria-hidden": "true" }, [toolIcon(tool) || tool.icon]),
      el("h1", {}, tool.title),
      el("p", { class: "s2-land-sub" }, tool.desc),
      big,
      el("p", { class: "s2-land-drop" }, tr("หรือลากไฟล์มาวางตรงไหนก็ได้ในหน้านี้",
                                            "Or drop your files anywhere on this page")),
      el("div", { class: "s2-land-row" }, [
        sample,
        pasteLink,
        el("span", { class: "s2-safe" }, [
          uiIcon("lock", "s2-safe-ico"),
          tr("ไฟล์อยู่ในเครื่องคุณ ไม่ถูกส่งไปที่ไหนทั้งสิ้น", "Your files stay on this device, nothing is uploaded"),
        ]),
      ]),
      /* ใต้จอแรก: ของที่เคยกองอยู่ในหน้าทำงานจนบังงานจริง ย้ายมาอยู่ตรงนี้ทั้งหมด */
      el("div", { class: "s2-fold" }, [
        toolMeta(tool), toolExample(tool), nextSteps(tool), toolFaq(tool), railCopyMd(tool),
      ]),
    ]),
  ]);
}

const ACC_LABEL = { pdf: "PDF", image: tr("รูปภาพ", "image"), docx: "Word", pptx: "PowerPoint",
  xlsx: "Excel", xls: "Excel", xlsm: "Excel", csv: "CSV", txt: tr("ข้อความ", "text") };
function labelOfAccepts(tool) {
  const seen = [];
  for (const a of tool.accepts || []) {
    const l = ACC_LABEL[a];
    if (l && !seen.includes(l)) seen.push(l);
  }
  return seen.slice(0, 2).join(tr(" หรือ ", " or ")) || tr("ไฟล์", "file");
}

/* ── แผงผลลัพธ์ ───────────────────────────────────────────────────────
 * ลูกผสม: โครงจาก iLovePDF (ปุ่มดาวน์โหลดเป็นพระเอก) แผงจาก Smallpdf
 * (ชื่อไฟล์ ขนาด จำนวนหน้า แล้วตามด้วย "ทำอะไรต่อดี")
 * ‼️ ของเราบอกขนาดไฟล์ผลลัพธ์ ซึ่ง iLovePDF ไม่บอก (วัดเองแล้ว 20/09) */
function resultBlock(tool, files, onAgain, onBack) {
  const one = files.length === 1 ? files[0] : null;
  return el("div", { class: "s2-res" }, [
    el("p", { class: "s2-done" }, [
      el("span", { class: "s2-done-ico", "aria-hidden": "true" }, [uiIcon("check", "s2-done-svg")]),
      tr("เสร็จแล้ว", "Done"),
    ]),
    one
      ? el("div", {}, [
          el("div", { class: "s2-res-name" }, one.name),
          el("div", { class: "s2-res-meta" }, fmtBytes(one.size)),
        ])
      : el("div", { class: "s2-res-meta" },
          tr(`ได้ ${files.length} ไฟล์`, pl(files.length, "file", "files"))),
    /* ‼️ ต้องมีปุ่มดาวน์โหลดเสมอ (บั๊ก v130 เจอ 21/09/2026)
     * แผงนี้เคยมีแต่ชื่อไฟล์กับขนาด เพราะตอนออกแบบคิดว่าไฟล์ถูกเซฟลงเครื่องไปแล้ว
     * ซึ่งจริงเฉพาะเครื่องมือที่เรียก download() · อีก 18 ตัวใช้ downloadButton()
     * ซึ่งแปลว่า "ยังไม่เซฟ รอผู้ใช้กด" แต่ทั้งสองทางประกาศผลลัพธ์ด้วยคำสั่งเดียวกัน
     * เปลือกหน้าจึงแยกไม่ออก ผลคือ pdf-compress บีบเสร็จแล้วไม่มีอะไรให้กดเลย
     * ทางแก้ที่ไม่ต้องพึ่งจังหวะเวลา: วาดปุ่มจากไฟล์ที่ได้มาเสมอ
     * ถ้าไฟล์ถูกเซฟไปแล้วจริง การมีปุ่มเซฟซ้ำก็ไม่เสียหาย ดีกว่าไม่มีทางออก */
    el("div", { class: "s2-res-dl" }, files.map((f) => el("button", {
      class: "btn has-ico", type: "button",
      "aria-label": tr(`ดาวน์โหลด ${f.name}`, `Download ${f.name}`),
      onclick: () => download(f, f.name),
    }, [uiIcon("download"), el("span", {}, files.length === 1
      ? tr("ดาวน์โหลด", "Download") : f.name)]))),
    el("div", { class: "s2-res-row" }, [
      el("button", { class: "s2-btn2", type: "button", onclick: onBack }, tr("กลับไปแก้", "Back to editing")),
      el("button", { class: "s2-btn2", type: "button", onclick: onAgain }, tr("เริ่มใหม่", "Start over")),
    ]),
    nextSteps(tool),
  ]);
}

/**
 * โครงหน้าเครื่องมือ v2
 * @param tool รายการจากทะเบียน
 * @param cfg  โครงสร้างเดียวกับ workspace() เดิมทุกประการ
 *             { left, center, right, toolbar, toolbarGroups, footer, note }
 *             ไม่ส่ง cfg มาเลย = โหมด panel ของเก่า ทุกอย่างลงผืนงาน
 * @returns { wrap, body, grid, canvas, side, setBusy, showCanvas }  (เข้ากันได้กับของเดิม)
 */
/* ── ช่องค้นหาในแผงตั้งค่าของโครง v2 ──────────────────────────────────────
 * เหตุผลที่ต้องมี (วัดจริง 11/09/2026): แผงของเครื่องมือหนักยาวเกินหนึ่งจอ ต้องเลื่อนหา 2 ถึง 3 เท่าของจอ
 * ‼️ โครง v1 (workspace.js) ต่อช่องค้นหาให้เองอยู่แล้วโดยใช้กลุ่มพับเป็นกลุ่ม
 *    ส่วน v2 ไม่มีกลุ่มพับ เดิมจึงไม่มีช่องค้นหาเลยทั้งที่เป็นโครงที่ผู้ใช้เห็นจริง
 *    (บทเรียน 23/09/2026: ตอนแรกไปต่อทีละเครื่องมือ 5 ตัว ผลคือไปบังของที่ v1 ต่อให้อยู่แล้ว
 *     เทส browser_foldpanes แดงทันที ที่ถูกคือต่อที่โครงกลาง ให้แต่ละโครงมีตัวของตัวเอง)
 * ‼️ ต่อเฉพาะแผงที่ของเยอะจริง (ช่องตั้งแต่ 12 และหัวข้อตั้งแต่ 2) แผงเล็กมีช่องค้นหา = รกเปล่า ๆ
 * ‼️ หลายเครื่องมือแผงโตหลังใส่ไฟล์ จึงเฝ้าดูแล้วต่อให้ทีหลังได้ แต่ต่อครั้งเดียวตลอดอายุแผง */
const FIND_MIN_FIELDS = 12;
function attachSideSearch(panel) {
  let attached = false;
  const tryAttach = () => {
    if (attached || panel.querySelector(".cfs-wrap")) return;      // เครื่องมือต่อเองไว้แล้ว = ไม่ยุ่ง
    if (panel.querySelectorAll("input, select, textarea").length < FIND_MIN_FIELDS) return;
    if (panel.querySelectorAll("h3").length < 2) return;           // ไม่มีหัวข้อ = ไม่มีกลุ่มให้ยุบ
    attached = true;
    if (!document.getElementById("cfs-css")) {
      document.head.append(el("style", { id: "cfs-css" }, CFGSEARCH_CSS));
    }
    const cs = configSearch({ scope: panel, ...flatGroups("h3") });
    panel.prepend(cs.node);
    panel.s2Search = cs;
  };
  tryAttach();
  new MutationObserver(tryAttach).observe(panel, { childList: true, subtree: true });
}

export function toolShell2(tool, cfg = {}) {
  const menu = wireToolMenu(tool);
  const panelMode = !cfg.center && !cfg.right && !cfg.left;

  /* ผืนงาน */
  const stage = el("div", { class: "s2-stage" });
  const toolbar = cfg.toolbar && cfg.toolbar.length
    ? el("div", { class: "s2-tbar" }, cfg.toolbar.filter(Boolean)) : null;
  const doneBig = el("div", { class: "s2-done-big" }, [
    el("div", { class: "ico", "aria-hidden": "true" }, [uiIcon("check")]),
    el("b", {}, tr("เสร็จแล้ว", "Done")),
    el("span", {}, tr("ไฟล์ผลลัพธ์อยู่ในแผงด้านขวา", "Your files are in the panel on the right")),
  ]);
  const emptyBox = el("div", { class: "s2-empty" }, [
    el("div", { class: "s2-empty-ico", "aria-hidden": "true" }, [toolIcon(tool, "s2-empty-svg")]),
    el("div", {}, (cfg.center && cfg.center.empty)
      || tr("ยังไม่มีไฟล์ เลือกไฟล์ก่อนเพื่อดูตัวอย่าง", "No file yet. Choose a file first to see a preview")),
  ]);
  if (cfg.center) stage.append(emptyBox, cfg.center.node);
  stage.appendChild(doneBig);
  const canvas = el("section", { class: "s2-canvas" }, [toolbar, stage]);

  /* แผงขวา */
  const sideBody = el("div", { class: "s2-side-bd" });
  if (cfg.left) {
    if (cfg.left.title) sideBody.appendChild(el("div", { class: "s2-grp" }, cfg.left.title));
    if (cfg.left.hint) sideBody.appendChild(el("p", { class: "s2-hint" }, cfg.left.hint));
    sideBody.appendChild(cfg.left.node);
  }
  if (cfg.right) {
    if (cfg.right.title && cfg.left) sideBody.appendChild(el("div", { class: "s2-grp" }, cfg.right.title));
    if (cfg.right.aside) sideBody.appendChild(cfg.right.aside);
    sideBody.appendChild(cfg.right.node);
  }

  const resultHost = el("div", { class: "s2-side-res", hidden: true });
  const ctaWhy = el("p", { class: "s2-cta-why", hidden: true });
  const ctaRow = el("div", { class: "s2-cta-row" });
  const sheetBtn = el("button", { class: "s2-sheetbtn", type: "button", "aria-expanded": "false" },
    tr("ตัวเลือก", "Options"));
  const sideFoot = el("div", { class: "s2-side-ft" }, [ctaWhy, ctaRow]);

  const restart = el("button", { class: "s2-link s2-restart", type: "button" }, tr("เริ่มใหม่", "Start over"));
  const side = el("aside", { class: "s2-side" }, [
    el("div", { class: "s2-sheet-hd" }, [
      el("b", {}, tr("ตัวเลือก", "Options")),
      el("button", { class: "s2-link", type: "button", onclick: () => setSheet(false) }, tr("ปิด", "Close")),
    ]),
    el("div", { class: "s2-side-hd" }, [
      el("h2", {}, tool.title),
      restart,
    ]),
    sideBody, resultHost, sideFoot,
  ]);
  attachSideSearch(sideBody);

  const grid = el("div", { class: "s2-work" }, [canvas, side]);
  if (panelMode) grid.classList.add("panel-mode");

  /* ── ปุ่มหลัก ────────────────────────────────────────────────────────
   * เอาปุ่มแรกจาก cfg.footer มาทำเป็นปุ่มยักษ์ ที่เหลือเป็นปุ่มรองใต้มัน
   * ‼️ ไม่สร้างปุ่มใหม่ ใช้ปุ่มตัวเดิมที่เครื่องมือสร้าง เพราะเครื่องมือถือ reference ไว้
   *   (เปิด/ปิด, เปลี่ยนข้อความ, ซ่อน) สร้างใหม่แล้วคำสั่งพวกนั้นจะไปตกที่ปุ่มผี */
  const footItems = (cfg.footer || []).filter(Boolean);
  const buttons = footItems.filter((n) => n && n.tagName === "BUTTON");
  const statusNodes = footItems.filter((n) => n && n.tagName !== "BUTTON");
  const mainBtn = buttons[0] || null;
  if (mainBtn) mainBtn.classList.add("s2-cta");
  const subBtns = buttons.slice(1);
  for (const b of subBtns) b.classList.add("s2-sub");
  if (statusNodes.length) sideFoot.insertBefore(el("div", { class: "s2-stat" }, statusNodes), ctaWhy);
  ctaRow.append(sheetBtn, mainBtn || el("span"));
  if (subBtns.length) sideFoot.appendChild(el("div", { class: "s2-subrow" }, subBtns));

  /* ── ทางเข้าแบบไม่มีไฟล์ ─────────────────────────────────────────────
   * เครื่องมือที่มีโหมด "วางตัวเลขเอง" (หายอดที่บวกกันได้, แบ่งช่วงตัวเลข) ใช้งานได้โดยไม่ต้องมีไฟล์
   * ‼️ หน้าเปล่าของ v2 มีแค่ปุ่มเลือกไฟล์กับไฟล์ตัวอย่าง แล้วสั่ง inert ทั้งผืนงานข้างหลัง
   *   โหมดวางตัวเลขจึงเข้าไม่ได้เลยถ้าไม่มีไฟล์ในมือ (เจอ 22/09/2026 จากภาพหน้าเปล่าจริง
   *   ส่วนเทสเดิมผ่านเพราะสั่ง click ผ่าน JS ทะลุชั้นที่บังอยู่ ซึ่งผู้ใช้ทำแบบนั้นไม่ได้)
   * ดูจาก DOM จริงว่ามีตัวเลือก value="paste" ไหม ไม่ต้องจดในทะเบียน เครื่องมือใหม่ที่มีโหมดนี้ได้ลิงก์เอง
   * ใช้ข้อความจากตัวเลือกของเครื่องมือเอง จึงแปลภาษาตามไปด้วยโดยไม่ต้องเขียนซ้ำ */
  const pasteRadio = grid.querySelector('input[type=radio][value="paste"]');
  const pasteName = pasteRadio ? (pasteRadio.closest("label")?.textContent || "").trim() : "";
  const pasteLink = pasteRadio ? el("button", { class: "s2-link", type: "button", onclick: startPaste },
    tr(`หรือ${pasteName}`, `Or ${pasteName.charAt(0).toLowerCase()}${pasteName.slice(1)}`)) : null;
  const pasting = () => !!(pasteRadio && pasteRadio.checked);
  function startPaste() {
    setState("work");
    if (!pasteRadio.checked) pasteRadio.click();
    /* บนมือถือ ช่องวางตัวเลขอยู่ในแผ่นตัวเลือกที่ปิดอยู่ ต้องเปิดให้ ไม่งั้นกดแล้วเหมือนไม่มีอะไรเกิดขึ้น */
    if (sheetBtn.offsetParent) setSheet(true);
    requestAnimationFrame(() => {
      const ta = [...grid.querySelectorAll("textarea")].find((t) => t.offsetParent);
      if (ta) ta.focus();
    });
  }
  /* กลับไปโหมดไฟล์ (ตัวเลือกแรกของกลุ่มเดียวกัน) ตอนเริ่มใหม่ หรือตอนผู้ใช้ลากไฟล์เข้ามาระหว่างวางตัวเลข */
  function leavePaste() {
    if (!pasting()) return;
    const first = [...grid.querySelectorAll("input[type=radio]")].find((r) => r.name === pasteRadio.name);
    if (first && first !== pasteRadio) first.click();
  }

  const noteEl = cfg.note ? el("div", { class: "s2-note" }, cfg.note) : null;
  const wrap = el("div", { class: "s2", "data-state": "landing",
    style: `--ac:${accentOf(tool)}` }, [
    landingBlock(tool, forward, pasteLink),
    grid,
    noteEl,
  ]);

  /* ── ส่งต่อการกดจากปุ่มยักษ์ไปยังปุ่มจริงในกล่องรับไฟล์ ─────────────────
   * หากล่องแบบอ่านอย่างเดียว ไม่แตะ ไม่ย้าย · เครื่องมือ panel ต่อกล่องหลัง mount
   * จึงหาแบบ lazy ทุกครั้งที่กด แทนการจำ reference ไว้ตอนสร้าง */
  function forward(what) {
    const dz = wrap.querySelector(".dz-wrap");
    if (!dz) return;
    if (what === "pick") {
      const btn = dz.querySelector(".dz-btn") || dz.querySelector(".dz");
      if (btn) btn.click();
      return;
    }
    const s = dz.querySelector(".dz-sample button, .dz-sample .btn");
    if (s) s.click();
  }

  /* ── เครื่องสถานะ ────────────────────────────────────────────────────
   * เกาะจุดประกาศกลางที่มีอยู่แล้วใน ui.js (setInputFiles จากกล่องรับไฟล์
   * กับ announceResult จาก download/downloadButton) จึงไม่ต้องแก้เครื่องมือสักตัว */
  let state = "landing";
  let sheetOpen = false;
  let manualBack = false;    // ผู้ใช้กด "กลับไปแก้" ทั้งที่ยังมีผลลัพธ์ค้างอยู่
  let domResultShown = false;  // เคยย้ายแถวผลลัพธ์จากผืนงานมาแผงขวาแล้วหรือยัง

  function setState(s) {
    /* ‼️ ห้ามข้ามเมื่อสถานะเท่าเดิม เพราะรอบแรกสุดสถานะเริ่มต้นก็เป็น landing อยู่แล้ว
       ถ้าข้าม ผลข้างเคียงของ landing (เช่น inert ที่กันโฟกัสหลงเข้าไปในแผงที่ถูกบัง)
       จะไม่เคยถูกตั้งเลยจนกว่าจะสลับสถานะไปกลับ (จับได้เพราะ gridInert เป็น false ทั้งที่อยู่หน้าเปล่า) */
    state = s;
    wrap.dataset.state = s;
    resultHost.hidden = s !== "result";
    sideBody.hidden = s === "result";
    /* ‼️ หน้าเปล่าเป็นชั้นลอยทับ ของที่อยู่ข้างหลังจึงยังโฟกัสด้วย Tab ได้ทั้งที่มองไม่เห็น
       คนใช้คีย์บอร์ดจะกด Tab แล้วหลงเข้าไปในแผงที่ถูกบังอยู่ โดยไม่มีอะไรบอกว่าอยู่ตรงไหน
       inert ปิดทั้งการโฟกัส การกด และซ่อนจากโปรแกรมอ่านหน้าจอในคำสั่งเดียว
       (จับได้เพราะเทสนับ "ของกดได้ในจอ" แล้วหน้าเปล่าได้ 36 ชิ้นทั้งที่ตาเห็นแค่ 4) */
    grid.inert = s === "landing";
    /* แถบหมายเหตุอยู่นอก grid แต่ก็ถูกหน้าเปล่าบังเหมือนกัน ถ้าไม่ปิดด้วย
       โปรแกรมอ่านหน้าจอจะอ่านคำเตือนที่ตามองไม่เห็นออกมาก่อนผู้ใช้ใส่ไฟล์ (เทส layout จับได้ 22/09/2026) */
    if (noteEl) noteEl.inert = s === "landing";
    if (panelMode) requestAnimationFrame(syncSideEmpty);
    restart.hidden = s === "result";
    if (s !== "work") setSheet(false);
    /* ‼️ ย้ายโฟกัสเมื่อสถานะเปลี่ยน ไม่งั้นคนใช้คีย์บอร์ดจะค้างอยู่กับปุ่มที่หายไปแล้ว */
    /* ‼️ แถบปุ่มรองต้องตามขึ้นมาอยู่ในแผงผลลัพธ์ (บั๊ก v130 เจอ 21/09/2026)
     * ปุ่ม "ดาวน์โหลด ZIP" ของเครื่องมือแบบแผงเดี่ยวถูก liftActions() ยกมาไว้ที่แถบล่างสุดของแผง
     * ซึ่งอยู่ใต้รายการ "ทำอะไรต่อดี" พอทำเสร็จจริงบนมือถือจึงต้องเลื่อนยาวมากกว่าจะเจอ
     * (เห็นกับตาจากภาพ: จอ 390 ปุ่มอยู่นอกจอไปเลย) ย้ายมาไว้บนสุดของแผงผลลัพธ์แทน
     * ย้ายได้ปลอดภัยเพราะเป็นปุ่มเงาที่เปลือกหน้าสร้างเอง ไม่ใช่ของเครื่องมือ */
    const subrow = side.querySelector(".s2-subrow");
    if (subrow) {
      if (s === "result") {
        /* วางใต้บรรทัด "ได้ N ไฟล์" ไม่ใช่เหนือมัน จะได้อ่านเรียงกันว่า เสร็จแล้ว แล้วเอาไฟล์ยังไง */
        const done = resultHost.querySelector(".s2-res > .s2-done");
        if (done) done.after(subrow); else resultHost.prepend(subrow);
      } else if (!sideFoot.contains(subrow)) sideFoot.appendChild(subrow);
    }
    if (s === "result") {
      const dl = resultHost.querySelector("button, a");
      if (dl && document.activeElement && wrap.contains(document.activeElement)) dl.focus();
    }
  }
  function setSheet(on) {
    sheetOpen = !!on;
    side.classList.toggle("open", sheetOpen);
    sheetBtn.setAttribute("aria-expanded", String(sheetOpen));
  }
  sheetBtn.addEventListener("click", () => setSheet(!sheetOpen));

  /* ‼️ เครื่องมือที่ให้ผลลัพธ์หลายไฟล์ (แยกไฟล์, PDF เป็นรูป, แยก Excel) ไม่ได้เรียก download()
     ตอนทำงานเสร็จ แต่วาดแถวผลลัพธ์ .result ลงผืนงานให้ผู้ใช้กดดาวน์โหลดทีละใบ
     จึงไม่มีสัญญาณกลางให้เกาะ · ตรวจจากของที่โผล่บนจอจริงแทน ซึ่งเป็นความจริง ไม่ใช่การเดา
     ‼️ ย้ายทั้งกองมาแผงขวา ปลอดภัยเพราะไม่มีเครื่องมือไหนค้นหาแถวผลลัพธ์จากตำแหน่งของมัน
        (ต่างจากกล่องรับไฟล์ที่เครื่องมือค้น .file-row จากพ่อของมันเอง) */
  function domResults() {
    /* ‼️ ต้องกวาดทั้งกล่อง ไม่ใช่เฉพาะในผืนงาน (บั๊ก v130 เจอ 21/09/2026)
     * เครื่องมือวางแถวผลลัพธ์ได้สองทาง คือต่อลง body หรือส่งมากับ cfg.footer
     * pdf-compress ส่ง results มากับ footer ซึ่งเปลือกหน้าเอาไปใส่ .s2-stat
     * แล้ว .s2-stat ถูกซ่อนตอนสถานะผลลัพธ์ ปุ่มดาวน์โหลดจึงหายไปทั้งที่บีบอัดสำเร็จ
     * (เห็นกับตา: สถานะขึ้น "เล็กลง 15%" แต่ทั้งหน้าไม่มีปุ่มดาวน์โหลดเลย)
     * กันวนซ้ำด้วยการไม่นับของที่ย้ายเข้าแผงผลลัพธ์ไปแล้ว */
    return [...wrap.querySelectorAll(".result")].filter((n) => !resultHost.contains(n) && !staleRes.has(n));
  }
  /* ‼️ แถวผลลัพธ์ที่มีอยู่ "ตอนไฟล์ในกล่องเปลี่ยน" เป็นของไฟล์ชุดก่อน ห้ามเอามาโชว์อีก (บั๊กจริง 22/09/2026)
   * ลำดับจริงของกล่องรับไฟล์คือ setInputFiles() ก่อน แล้วค่อยเรียก onChange ของเครื่องมือ
   * เปลือกหน้าจึงได้ยินว่าไฟล์เปลี่ยน ก่อนที่เครื่องมือจะล้างแถวผลลัพธ์เก่าของตัวเอง
   * แล้วคว้าแถวเก่านั้นย้ายเข้าแผงผลลัพธ์ไปเฉย ๆ พอเครื่องมือล้างทีหลังก็ล้างไม่โดนแล้ว
   * อาการที่เห็นกับตา: ใส่เลขหน้า first.pdf เสร็จ ลาก second.pdf ทับ หน้ายังโชว์
   * "first-มีเลขหน้า.pdf" พร้อมปุ่มดาวน์โหลดที่กดได้ = ผู้ใช้ได้ไฟล์ผิดใบโดยไม่มีอะไรเตือน
   * (จับลำดับจริงด้วยการใส่จุดบันทึกชั่วคราว: domRes = 1 ทันทีหลังล้างแผงผลลัพธ์)
   * ใช้ WeakSet จำ "ตัว node" ไม่ไปแตะ node ของเครื่องมือ ตามหลักข้อแรกของไฟล์นี้ */
  const staleRes = new WeakSet();
  function markStale() {
    for (const n of wrap.querySelectorAll(".result, .results > .actions, .results > .note")) staleRes.add(n);
  }
  /* ‼️ คำเตือนของเครื่องมือต้องตามผลลัพธ์ไปอยู่ในแผงผลลัพธ์ด้วย (บั๊กจริง 22/09/2026)
   * เครื่องมือหลายตัวต่อ .note ลงใน .results หลังทำเสร็จ เพื่อบอกเรื่องที่ผู้ใช้ "ต้องรู้ก่อนส่งไฟล์ออก"
   * เช่น word-to-pdf: "ฟอนต์ไทยรุ่นเก่า แปลงวรรณยุกต์ให้ 7 จุด" และ "มีแก้ไขค้าง ข้อความนั้นจะไปอยู่ใน PDF ด้วย"
   * แต่เปลือกหน้าย้ายมาเฉพาะแถว .result คำเตือนจึงค้างในผืนงานที่ถูกแผงผลลัพธ์บัง
   * วัดจริง: กล่องคำเตือนกว้าง 0 สูง 0 = ผู้ใช้ไม่มีทางเห็น
   * ข้อ "แก้ไขค้าง" ร้ายที่สุด เพราะข้อความที่เขาคิดว่าลบไปแล้วจะไปโผล่ใน PDF ที่ส่งออกไป
   * ‼️ คำเตือนมักต่อ "หลัง" แถวผลลัพธ์ในจังหวะเดียวกัน ตอนที่ syncState ย้ายแถวไปแล้ว
   *   จึงต้องมีตัวเฝ้าคอยเก็บตกทีหลังด้วย ไม่ใช่เก็บแค่ตอนสลับสถานะ */
  function pullNotes() {
    if (state !== "result") return;
    const notes = [...wrap.querySelectorAll(".results > .note")]
      .filter((n) => !resultHost.contains(n) && !staleRes.has(n));
    if (!notes.length) return;
    const res = resultHost.querySelector(".s2-res");
    if (!res) return;
    let box = res.querySelector(".s2-res-notes");
    if (!box) {
      box = el("div", { class: "s2-res-notes" });
      const done = res.querySelector(".s2-done");
      if (done) done.after(box); else res.prepend(box);
    }
    box.append(...notes);
  }

  /* ── ข้อความสรุปของเครื่องมือต้องตามมาอยู่ในแผงผลลัพธ์ด้วย (22/09/2026) ──────────
   * แถบสถานะอยู่ท้ายแผงซึ่งถูกซ่อนตอนสถานะผลลัพธ์ ข้อความสำคัญที่สุดของงานจึงหายไป
   * เช่นบีบอัด PDF "เล็กลง 6% ... ข้อความยังค้นหาและคัดลอกได้เหมือนเดิม" (เห็นจากภาพจริง)
   * ตรงกับแผน v2 ข้อ 4.4 ที่พี่ปอนด์เคาะ "ตัวเลขเฉพาะงานเพิ่มได้ เช่นบีบอัดโชว์ เล็กลง 82%"
   * ‼️ คัดลอกข้อความมาแสดง ไม่ย้าย node เพราะเครื่องมือถือ reference ไว้และยังเขียนทับอยู่
   * ‼️ เอาเฉพาะผลจบงาน (ok) กับข้อผิดพลาด (err) ข้อความระหว่างทำ (info) เป็นของชั่วคราว */
  function mirrorStatus() {
    if (state !== "result") return;
    const res = resultHost.querySelector(".s2-res");
    if (!res) return;
    const src = [...wrap.querySelectorAll(".status.show.ok, .status.show.err")].find((n) => !resultHost.contains(n));
    const text = src ? src.textContent.trim() : "";
    let line = res.querySelector(".s2-res-msg");
    if (!text) { if (line) line.remove(); return; }
    if (!line) {
      line = el("p", { class: "s2-res-msg", role: "status" });
      /* คำเตือนมาก่อนเสมอ (ต้องเห็นก่อนกดดาวน์โหลด) แล้วค่อยเป็นข้อความสรุป */
      const anchor = res.querySelector(".s2-res-notes") || res.querySelector(".s2-done");
      if (anchor) anchor.after(line); else res.prepend(line);
    }
    if (line.textContent !== text) line.textContent = text;
    line.dataset.kind = src.classList.contains("err") ? "err" : "ok";
  }

  /* ‼️ ปุ่มรวมของผลลัพธ์อยู่คนละที่กับแถวผลลัพธ์ (บั๊ก v130 เจอ 21/09/2026)
   * เครื่องมือ 11 ตัววางปุ่ม "ดาวน์โหลด ZIP" หรือปุ่มดาวน์โหลดหลักไว้ที่ .results > .actions
   * ซึ่งไม่ใช่ .result จึงไม่ถูกย้ายมาแผงขวา แล้วค้างอยู่ในผืนงานที่ถูกบังตอนสถานะผลลัพธ์
   * ผลคือกดไม่ได้เลย (Playwright ฟ้องว่า .s2-stage intercepts pointer events)
   * เครื่องมือแบบแผงเดี่ยวไม่เจออาการนี้เพราะ liftActions() ยกปุ่มพวกนี้ไปแล้ว
   * แต่ liftActions() ไม่ทำงานกับแบบผังงาน ที่นี่จึงต้องรับช่วงเอง */
  function domResultActions() {
    return [...wrap.querySelectorAll(".results > .actions")].filter((n) => !resultHost.contains(n) && !staleRes.has(n));
  }

  function syncState() {
    /* ‼️ เครื่องมือที่ไม่ได้ทำงานกับไฟล์ (กราฟ Deneb, ชุดสร้างสูตร Power Query, ตาราง HTML)
       ต้องไม่มีหน้าเปล่า เพราะไม่มีอะไรให้เลือก เข้าสถานะทำงานพร้อมข้อมูลตัวอย่างทันที
       เช็คจาก DOM จริง ไม่ใช่จาก tool.accepts เพราะบางตัวรับไฟล์ผ่าน sheetpick
       ซึ่งต่อกล่องเข้ามาทีหลัง จึงต้องดูว่า "ตอนนี้มีกล่องรับไฟล์อยู่จริงไหม" */
    if (!wrap.querySelector(".dz-wrap")) { setState("work"); return; }
    /* ไฟล์ของเครื่องมือนี้เอง ไม่ใช่ค่ากลางทั้งเว็บ (ดู treeFiles ใน ui.js และหมายเหตุที่ตัวเฝ้าข้างล่าง) */
    const input = treeFiles(wrap);
    /* หน้าที่ไม่อยู่บนจอ (แวะไปเครื่องมืออื่น) ห้ามหยิบผลลัพธ์กลาง เพราะตอนนั้นเป็นของเครื่องมืออื่น */
    const { result } = wrap.isConnected ? fileState() : { result: null };
    const domRes = domResults();
    /* ‼️ ต้องจำว่าเคยย้ายผลลัพธ์มาแล้ว เพราะพอย้ายเสร็จ ผืนงานก็ไม่มี .result อีกต่อไป
       ถ้าตรวจจากผืนงานอย่างเดียว สถานะจะเด้งกลับไป work ทันทีในรอบถัดไป
       (เจอกับตาตอนต่อ pdf-to-images: ผลลัพธ์ย้ายมาถูกที่แล้ว แต่หน้ายังเป็นสถานะทำงาน) */
    const domAct = panelMode ? [] : domResultActions();
    if (domRes.length || domAct.length) domResultShown = true;
    if ((domRes.length || domAct.length || domResultShown) && !manualBack) {
      if (!domRes.length && !domAct.length) { setState("result"); return; }
      /* ‼️ ต้องสะสมแถวที่เคยย้ายมาแล้ว ไม่ใช่แทนที่ทั้งก้อน (บั๊กเจอ 21/09/2026)
       * เครื่องมือที่ทำหลายไฟล์วาดแถวผลลัพธ์ทีละแถว และประกาศผลทุกแถว
       * ตัวนี้จึงถูกเรียกหลายรอบ รอบหลัง ๆ ผืนงานเหลือเฉพาะแถวใหม่
       * เพราะแถวเก่าถูกย้ายมาแผงขวาไปแล้ว ถ้า replaceChildren ทั้งก้อน แถวเก่าจะหายไป
       * (เห็นกับตา: ใส่รหัส 2 ไฟล์ สถานะบอก "ใส่รหัสให้ 2 ไฟล์แล้ว" แต่ดาวน์โหลดได้ไฟล์เดียว) */
      const kept = [...resultHost.querySelectorAll(".s2-res-list > .result")];
      const rows = [...kept, ...domRes];
      const host = el("div", { class: "s2-res" }, [
        el("p", { class: "s2-done" }, [
          el("span", { class: "s2-done-ico", "aria-hidden": "true" }, [uiIcon("check", "s2-done-svg")]),
          rows.length <= 1 ? tr("เสร็จแล้ว", "Done")
                           : tr(`ได้ ${rows.length} ไฟล์`, pl(rows.length, "file", "files")),
        ]),
        domAct.length ? el("div", { class: "s2-res-act" }, domAct) : null,
        rows.length ? el("div", { class: "s2-res-list" }, rows) : null,
        el("div", { class: "s2-res-row" }, [
          el("button", { class: "s2-btn2", type: "button",
            onclick: () => { manualBack = true; setState("work"); } }, tr("กลับไปแก้", "Back to editing")),
          el("button", { class: "s2-btn2", type: "button", onclick: hardReset }, tr("เริ่มใหม่", "Start over")),
        ]),
        nextSteps(tool),
      ]);
      /* คำเตือนที่ย้ายมาแล้วในรอบก่อน ต้องเก็บไว้ ไม่งั้นหายตอนวาดแผงใหม่ (เหมือนเรื่องสะสมแถวผลลัพธ์) */
      const keptNotes = [...resultHost.querySelectorAll(".s2-res-notes > .note")];
      resultHost.replaceChildren(host);
      if (keptNotes.length) {
        const box = el("div", { class: "s2-res-notes" }, keptNotes);
        const done = host.querySelector(".s2-done");
        if (done) done.after(box); else host.prepend(box);
      }
      setState("result");
      pullNotes();
      mirrorStatus();
      return;
    }
    if (result && result.length && !manualBack) {
      resultHost.replaceChildren(resultBlock(tool, result,
        () => { manualBack = true; hardReset(); },
        () => { manualBack = true; setState((input && input.length) || pasting() ? "work" : "landing"); }));
      setState("result");
      mirrorStatus();
      return;
    }
    /* ‼️ เครื่องมือที่ "ไฟล์เป็นของแถม" (startsEmpty ในทะเบียน) ต้องไม่ตกไปหน้าเปล่า
     * เช่นข้อความเป็น PDF ที่พิมพ์เองได้เลย จะลากไฟล์ .txt มาก็ได้ ไม่ลากก็ได้
     * เช็คจาก DOM อย่างเดียวไม่พอ เพราะกล่องรับไฟล์ "มีอยู่จริง" แต่ไม่บังคับ
     * อาการถ้าปล่อยไว้: หน้าเปล่าตั้ง grid.inert = true ทั้งผืน พิมพ์ในช่องไม่ได้
     * และปุ่มลงมือทำกดไม่ได้ (จับได้ด้วยเบราว์เซอร์จริง 21/09/2026 ค่าในช่องยังว่างหลัง fill)
     *
     * ‼️ ต้องดักตรงบรรทัดสุดท้ายนี้เท่านั้น ห้ามลัดออกตั้งแต่ต้นฟังก์ชันเหมือนเครื่องมือที่ไม่มีไฟล์เลย
     *   ครั้งแรกเขียนลัดออกไว้บนสุด ผลคือสถานะผลลัพธ์ไม่เคยทำงาน ปุ่มดาวน์โหลดจึงค้างอยู่
     *   ท้ายผืนงานจนตกนอกจอ ขึ้นว่า "สร้างเสร็จ 1 หน้า" แต่ไม่มีอะไรให้กด
     *   (เห็นกับตาจากภาพหน้าจอ ไม่ใช่จากเทส เพราะเทสมีทางถอยไปหาปุ่มในผืนงาน) */
    setState((input && input.length) || tool.startsEmpty || pasting() ? "work" : "landing");
  }
  function hardReset() {
    /* กดปุ่มลบของกล่องรับไฟล์ทุกใบ = กลับไปสถานะเริ่มต้นโดยไม่ต้องรีเฟรชหน้า */
    for (const x of wrap.querySelectorAll(".dz-wrap .file-x, .dz-wrap .files .x")) x.click();
    leavePaste();
    manualBack = false; domResultShown = false;
    resultHost.replaceChildren();
    setTimeout(syncState, 0);
  }
  restart.addEventListener("click", hardReset);

  /* ไฟล์ในกล่องเปลี่ยน = ผู้ใช้เริ่มรอบใหม่ ยกเลิกธง "กลับไปแก้" ให้เอง
   * ‼️ ต้องเทียบ "ตัวไฟล์" ไม่ใช่ "จำนวนไฟล์" (แก้ 22/09/2026)
   *   เดิมเทียบแค่จำนวน เครื่องมือไฟล์เดียวที่ลากไฟล์ใหม่มาทับ จำนวนยังเป็น 1 เท่าเดิม
   *   แผงผลลัพธ์ของไฟล์เก่าจึงค้างอยู่ พร้อมปุ่มดาวน์โหลดไฟล์ผิดใบ (เห็นกับตาที่ pdf-page-numbers)
   *   ต้นเหตุอีกครึ่งอยู่ที่ setInputFiles ใน ui.js ที่ไม่ล้างผลลัพธ์เก่า แก้คู่กันแล้ว */
  /* ‼️ ตัวเฝ้าต้องอยู่รอดตอนผู้ใช้แวะไปเครื่องมืออื่น แล้วอ่านไฟล์จากกล่องของตัวเอง (แก้ 22/09/2026)
   *   เดิมตั้งให้ตัวเฝ้า "ตาย" ทันทีที่หน้าหลุดจากจอ แต่แอปเก็บหน้าเครื่องมือไว้ในแคชแล้วเอากลับมาใช้
   *   แวะไปเครื่องมืออื่นแล้วกลับมา หน้าเดิมจึงไม่มีตัวเฝ้าเหลือ ลากไฟล์ใหม่ใส่แล้วหน้ายังค้าง
   *   ผลลัพธ์ของไฟล์เก่า กดดาวน์โหลดได้ไฟล์เก่า (จับได้จากไฟล์ PDF ที่ดาวน์โหลดมาเป็นของเก่าจริง
   *   ที่ excel-to-pdf ใน tests/browser_realfiles.py)
   * ‼️ และต้องนับไฟล์จากกล่องของตัวเอง ไม่ใช่ค่ากลาง เพราะค่ากลางคือกล่องใบล่าสุดที่เปลี่ยน
   *   ของเครื่องมือไหนก็ได้ กลับมาแล้วมันยังเป็นไฟล์ของเครื่องมือที่แวะไป
   * ‼️ ระหว่างที่หน้าไม่อยู่บนจอห้ามวาดสถานะ ผลลัพธ์กลางตอนนั้นเป็นของเครื่องมืออื่น
   *   ถ้าเอามาวาด แผงผลลัพธ์ของหน้านี้จะโชว์ไฟล์ของเครื่องมือที่ไม่เกี่ยวกัน
   *   แต่ยังต้องจดไฟล์ของตัวเองไว้ เพราะตอนเปิดหน้าครั้งแรก ไฟล์ที่พาตามมาจากเครื่องมือก่อนหน้า
   *   มาถึงก่อนหน้าจะถูกวางลงจอ (ถ้าไม่จด การประกาศครั้งถัดไปจะดูเหมือนไฟล์เปลี่ยน แล้วล้างผลลัพธ์ทิ้ง)
   *   จดได้ปลอดภัยเพราะนับจากกล่องของตัวเอง เครื่องมืออื่นจึงเปลี่ยนค่านี้ไม่ได้
   * ถอดตัวเฝ้าจริงเฉพาะตอนแอปทิ้งหน้านี้ออกจากแคช (fk:dispose จาก disposeTree) */
  /* ‼️ กลับมาจากเครื่องมืออื่นแล้ว ต้องคืนค่ากลางให้เป็นของหน้านี้ด้วย (22/09/2026)
   *   ค่ากลางคือสิ่งที่ "ทำอะไรต่อดี" จะพาไป ตอนกลับมาแผงผลลัพธ์ยังโชว์ไฟล์ของหน้านี้
   *   แต่ค่ากลางยังเป็นไฟล์ของเครื่องมือที่แวะไป กดการ์ดแล้วได้ไฟล์ผิดใบไปทำต่อ
   *   (วัดจริง: ผลลัพธ์ A-file-มีเลขหน้า.pdf แต่การ์ดพา B-file.pdf ไป)
   *   จึงจำผลลัพธ์ของหน้านี้ไว้ตอนอยู่บนจอ แล้วประกาศกลับตอนกลับมา */
  const inputKey = () => treeFiles(wrap).map((f) => `${f.name}|${f.size}|${f.lastModified}`).join("\n");
  let lastInputKey = "";
  let disposed = false;
  let away = false;          // หน้านี้เคยหลุดจากจอ (แวะไปเครื่องมืออื่น) และยังไม่ได้คืนค่ากลาง
  let myResult = null;       // ผลลัพธ์ล่าสุดของหน้านี้ ตอนที่ยังอยู่บนจอ
  const stopWatch = watchFiles(() => {
    const k = inputKey();
    if (k !== lastInputKey) {
      lastInputKey = k; manualBack = false; domResultShown = false; resultHost.replaceChildren(); markStale();
      myResult = null;
      if (k) leavePaste();
    }
    if (!wrap.isConnected) { away = true; return; }
    if (away) {
      /* ต้องเก็บค่าไว้ก่อน เพราะการประกาศข้างล่างวนกลับเข้ามาที่ตัวเฝ้านี้ แล้วจดผลลัพธ์ทับเป็นค่าว่าง */
      const keep = myResult;
      away = false;
      setInputFiles(treeFiles(wrap));
      if (keep) setResultFiles(keep);
      return;   // การประกาศสองครั้งข้างบนเรียก syncState ให้แล้ว
    }
    /* จดเฉพาะตอนมีผลลัพธ์จริง ห้ามจดค่าว่างทับ (เห็นจาก log 22/09/2026)
       เครื่องมือถัดไปถูกสร้างขณะที่หน้านี้ยังอยู่บนจอระหว่างเปลี่ยนหน้า กล่องรับไฟล์ว่าง ๆ ของมัน
       ประกาศไฟล์ว่างซึ่งล้างผลลัพธ์กลาง ถ้าจดตามนั้น ผลลัพธ์ของหน้านี้จะหายก่อนได้ใช้
       ค่านี้ล้างเฉพาะตอนไฟล์ในกล่องของหน้านี้เปลี่ยน (ข้างบน) */
    const r = fileState().result;
    if (r && r.length) myResult = r;
    syncState();
  }, () => disposed);
  wrap.addEventListener("fk:dispose", () => { disposed = true; stopWatch(); });

  /* ── ยกปุ่มลงมือทำของเครื่องมือแบบ panel ขึ้นมาเป็นปุ่มหลัก ───────────────
   * เครื่องมือ 28 ตัวที่ยังใช้โครงเดิมวางปุ่มไว้ใน .actions กลางผืนงาน
   * ‼️ ไม่ย้ายปุ่มจริง เพราะเครื่องมือถือ reference ไว้ (เปิด/ปิด เปลี่ยนข้อความ ซ่อน)
   *   แต่สร้าง "ปุ่มเงา" ในแผงขวาที่ส่งต่อการกด แล้วสะท้อนสภาพของปุ่มจริงตลอดเวลา
   *   วิธีนี้ทำให้ทั้ง 28 ตัวได้ปุ่มยักษ์ทันทีโดยไม่ต้องแก้สักไฟล์ และถอยกลับได้ทันทีเช่นกัน
   * ‼️ ต้องเฝ้าดูด้วย เพราะหลายเครื่องมือสร้าง .actions หลังโหลดไฟล์เสร็จ ไม่ใช่ตอน mount */
  const ghosts = new Map();
  function liftActions() {
    if (!panelMode) return;
    /* ‼️ ต้องรับชื่อคลาสของแถบปุ่มมากกว่าหนึ่งแบบ เครื่องมือบางตัวตั้งชื่อเอง
       (pbi-theme ใช้ .ts-actions) แล้วปุ่มดาวน์โหลดธีมจะไม่ถูกยกขึ้นมาเป็นปุ่มหลักเลย
       จับได้เพราะเทสถามว่า "สถานะนี้มีปุ่มลงมือทำที่มองเห็นไหม" กับทั้ง 53 ตัว */
    const acts = [...wrap.querySelectorAll('.s2-stage .actions, .s2-stage [class$="-actions"]')];
    const reals = acts.flatMap((a) => [...a.querySelectorAll("button")]).filter((b) => !ghosts.has(b));
    for (const real of reals) {
      const first = ghosts.size === 0;
      const ghost = el("button", {
        type: "button", class: "btn " + (first ? "s2-cta" : "s2-sub"),
        onclick: () => real.click(),
      }, real.textContent);
      const sync = () => {
        ghost.textContent = real.textContent;
        ghost.disabled = real.disabled;
        ghost.hidden = real.hidden;
        const al = real.getAttribute("aria-label");
        if (al) ghost.setAttribute("aria-label", al);
      };
      new MutationObserver(sync).observe(real, { attributes: true, childList: true, subtree: true, characterData: true });
      sync();
      /* ‼️ ซ่อนปุ่มจริงทิ้งไว้หลังบ้าน หลังมีปุ่มเงาสะท้อนมันแล้ว (21/09/2026)
       * ก่อนหน้านี้ปุ่มเดียวกันมีอยู่สองใบบนหน้าจอพร้อมกัน วัดได้จริงที่ pdf-merge
       * สถานะทำงาน: ปุ่ม "รวมไฟล์" 102x43 ในผืนงาน กับ 410x72 ในแผง ชื่อเดียวกันเป๊ะ
       * คนใช้โปรแกรมอ่านหน้าจอจึงได้ยินคำสั่งเดียวกันซ้ำสองรอบ และแยกไม่ออกว่าต่างกันยังไง
       * ‼️ ต้องซ่อนด้วยคลาส ห้ามใช้ property hidden เพราะ sync() สะท้อน real.hidden ไปที่เงา
       *   ถ้าไปตั้ง real.hidden = true ปุ่มเงาจะหายตามไปด้วยทั้งคู่
       * ‼️ ปุ่มจริงยังอยู่ใน DOM และยังกดผ่าน real.click() ได้ตามปกติ
       *   เครื่องมือที่ถือ reference ไว้เปลี่ยนข้อความ เปิดปิด ซ่อน ยังทำงานเหมือนเดิมทุกอย่าง */
      real.classList.add("s2-lifted");
      ghosts.set(real, ghost);
      if (first) ctaRow.appendChild(ghost);
      else {
        /* หาจากทั้งแผง เพราะตอนสถานะผลลัพธ์ แถบปุ่มรองถูกย้ายขึ้นไปอยู่ในแผงผลลัพธ์
           ถ้าหาจาก sideFoot อย่างเดียวจะไม่เจอแล้วสร้างใหม่ ปุ่มจะกระจายอยู่สองที่ */
        let sub = side.querySelector(".s2-subrow");
        if (!sub) { sub = el("div", { class: "s2-subrow" }); sideFoot.appendChild(sub); }
        sub.appendChild(ghost);
      }
    }
    /* แถบสถานะของเครื่องมือ (ความคืบหน้า/ข้อความ) ก็ควรอยู่ติดปุ่ม ไม่ใช่กลางผืนงาน
       แต่ตัวนี้ย้ายได้ปลอดภัย เพราะไม่มีเครื่องมือไหนค้นหามันจากตำแหน่ง */
    const st = wrap.querySelector(".s2-stage > .status-wrap");
    if (st && !sideFoot.contains(st)) sideFoot.insertBefore(el("div", { class: "s2-stat" }, [st]), ctaWhy);
  }
  /* ‼️ เครื่องมือแบบ panel ที่ยังไม่ได้ย้ายตัวเลือกเข้าแผง จะเหลือแผงขวาว่างเปล่าทั้งแถบ
     ซึ่งดูเหมือนของพังมากกว่าดูเหมือนดีไซน์ (เห็นกับตาบนเว็บสด: แผงกว้าง 384px มีแต่ชื่อกับปุ่ม)
     ถ้าแผงไม่มีเนื้อหาจริง ให้ยุบแผงทิ้งแล้วเอาปุ่มหลักไปไว้แถบล่างเต็มความกว้างแทน
     ‼️ วัดจากเนื้อหาจริงในแผง ไม่ใช่จากชนิดเครื่องมือ เพราะเครื่องมือเติมของเข้าแผงทีหลังได้ */
  function syncSideEmpty() {
    const has = sideBody.querySelector("input,select,textarea,button,canvas,.file-row,.dz-wrap,.field,li,tr");
    grid.classList.toggle("side-empty", !has && state !== "result");
  }
  /* เก็บตกคำเตือนที่เครื่องมือต่อเข้ามาหลังแถวผลลัพธ์ (ดู pullNotes) · หน่วงหนึ่งเฟรมกันเรียกถี่ */
  let notesQueued = false;
  new MutationObserver(() => {
    if (state !== "result" || notesQueued) return;
    notesQueued = true;
    requestAnimationFrame(() => { notesQueued = false; pullNotes(); mirrorStatus(); });
  }).observe(wrap, { childList: true, subtree: true });

  if (panelMode) {
    requestAnimationFrame(() => { liftActions(); syncSideEmpty(); });
    new MutationObserver(() => { liftActions(); syncSideEmpty(); })
      .observe(stage, { childList: true, subtree: true });
  }

  requestAnimationFrame(syncState);
  let resScan = false;
  new MutationObserver(() => {
    if (resScan) return;
    resScan = true;
    requestAnimationFrame(() => { resScan = false; syncState(); });
  }).observe(stage, { childList: true, subtree: true });
  /* ‼️ แถวผลลัพธ์ที่เครื่องมือส่งมากับ cfg.footer เกิดในแผงขวา ไม่ใช่ในผืนงาน (22/09/2026)
   * ตัวเฝ้าข้างบนดูแค่ผืนงาน แถวของบีบอัด PDF จึงไม่เคยถูกย้ายเข้าแผงผลลัพธ์ ค้างอยู่ในแถบสถานะที่ถูกซ่อน
   * ข้อมูล "38 KB เป็น 35 KB" ของแถวนั้นเลยไม่มีใครเห็น (วัดจริง: แถวอยู่ในผืนงาน มองไม่เห็น)
   * ‼️ กรองเฉพาะแถวผลลัพธ์ที่งอกขึ้นนอกแผงผลลัพธ์ ไม่งั้นการวาดแผงผลลัพธ์เองจะวนเรียกตัวเองไม่จบ */
  new MutationObserver((muts) => {
    if (resScan) return;
    const grew = muts.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1 && !resultHost.contains(n)
      && (n.matches(".result, .results > .actions") || n.querySelector(".result"))));
    if (!grew) return;
    resScan = true;
    requestAnimationFrame(() => { resScan = false; syncState(); });
  }).observe(side, { childList: true, subtree: true });


  /* Esc ปิดเมนูกับแผ่นล่าง แล้วคืนโฟกัส */
  wrap.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (menu.isOpen()) { menu.close(); menu.btn.focus(); e.stopPropagation(); return; }
    if (sheetOpen) { setSheet(false); sheetBtn.focus(); e.stopPropagation(); }
  });
  document.addEventListener("click", (e) => {
    if (!wrap.isConnected) return;
    if (menu.isOpen() && !e.target.closest(".s2-menu") && !e.target.closest(".s2-menubtn")) menu.close();
  });

  /* ‼️ body ต้องเป็น stage เสมอ ห้ามคืน cfg.center.node (บั๊ก v130 เจอ 21/09/2026)
   * สัญญาเดิมของ v1 คือ body = "กล่องใหญ่ที่เครื่องมือต่อของเพิ่มได้" ไม่ใช่ที่วางของกลางผืนงาน
   * เครื่องมือ 9 ตัวต่อของลง body (ตารางผลลัพธ์, โน้ต, style, ตัวดักคีย์บอร์ด)
   * พอ body กลายเป็น cfg.center.node ของพวกนั้นก็โดน 2 เด้ง
   *   ① showCanvas(false) สั่ง cfg.center.node.hidden = true พาของที่ต่อไว้หายไปด้วย
   *   ② เครื่องมือที่วาดผังกลางใหม่ทุกครั้ง (pdf-split) ล้าง node นั้นทิ้งพร้อมของที่ต่อไว้
   * ผลคือ pdf-split ขึ้น "แยกได้ 3 ไฟล์" แต่ไม่มีปุ่มดาวน์โหลดทั้งหน้า เอาไฟล์ออกไม่ได้เลย
   * คืนเป็น stage แล้ว .result ที่เครื่องมือวาดจะถูก domResults() เจอ และย้ายไปแผงขวาตามที่ออกแบบไว้ */
  return {
    wrap,
    body: stage,
    grid, canvas, side, stage,
    setState, forward,
    setBusy: (on) => grid.classList.toggle("busy", !!on),
    showCanvas: (on) => {
      emptyBox.hidden = !!on;
      if (cfg.center) cfg.center.node.hidden = !on;
      grid.classList.toggle("has-file", !!on);
    },
  };
}
