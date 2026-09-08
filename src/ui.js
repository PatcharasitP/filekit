import { detectType, wrongTypeMessage } from "./filetype.js";
import { $, $$, el } from "./dom.js";
import { byId } from "./registry.js";
import { toolIcon, uiIcon } from "./icons.js";
import { tr } from "./i18n.js";
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
      el("div", {}, [el("h1", {}, tool.title), el("p", {}, tool.desc)]),
    ]),
    body,
    nextSteps(tool),
  ]);
  return { wrap, body };
}

/** แถว "ทำอะไรต่อดี"ท้ายหน้าเครื่องมือ — งานเอกสารจริงแทบไม่มีขั้นตอนเดียวจบ
 *  เช่นรวม PDF เสร็จมักตามด้วยบีบอัดหรือเซ็นชื่อ · เดิมผู้ใช้ต้องกดกลับหน้าแรกไปหาเอง */
export function nextSteps(tool) {
  const list = (tool.next || []).map(byId).filter(Boolean);
  if (!list.length) return null;
  const accent = (t) => `var(${GROUP_ACCENT[t.group] || "--brand"})`;
  return el("nav", { class: "next-steps", "aria-label": tr("เครื่องมือที่มักใช้ต่อ", "Tools people use next") }, [
    el("h2", {}, tr("ทำอะไรต่อดี", "What next?")),
    el("div", { class: "next-row" }, list.map((t) =>
      el("a", { class: "next-card", href: "#/" + t.id, style: `--ac:${accent(t)}` }, [
        el("span", { class: "next-ico", "aria-hidden": "true" }, [toolIcon(t) || t.icon]),
        el("span", {}, t.title),
      ])
    )),
  ]);
}

/** แถบสถานะ + แถบความคืบหน้า (ใช้คู่กันเสมอ) */
export function statusBar() {
  const msg = el("div", { class: "status", role: "status", "aria-live": "polite" });
  const fill = el("div", { class: "fill" });
  // ‼️ งานที่ใช้เวลานานต้องยกเลิกได้ ไม่งั้นลากมา 50 ไฟล์แล้วกดผิดต้องรอจนจบหรือปิดแท็บทิ้ง
  let cancelled = false;
  const stop = el("button", { class: "btn-cancel", type: "button", hidden: true,
    onclick: () => { cancelled = true; stop.disabled = true; stop.textContent = tr("กำลังหยุด…", "Stopping…"); } }, tr("หยุด", "Stop"));
  const bar = el("div", { class: "progress" }, [fill]);
  const node = el("div", { class: "status-wrap" }, [msg, el("div", { class: "prog-row" }, [bar, stop])]);
  let label = "";
  return {
    node,
    get cancelled() { return cancelled; },
    /** เรียกก่อนเริ่มงานใหม่ทุกครั้ง — เปิดปุ่มหยุดและล้างธงเดิม */
    begin: () => { cancelled = false; stop.hidden = false; stop.disabled = false; stop.textContent = tr("หยุด", "Stop"); },
    end: () => { stop.hidden = true; },
    info: (t) => { msg.className = "status show info"; msg.textContent = t; label = t; },
    ok: (t) => { msg.className = "status show ok"; msg.textContent = t; },
    err: (t) => { msg.className = "status show err"; msg.textContent = t; },
    clear: () => { msg.className = "status"; msg.textContent = ""; bar.classList.remove("show"); stop.hidden = true; },
    progress: (pct, note) => {
      if (pct === null) { bar.classList.remove("show"); return; }
      bar.classList.add("show");
      fill.style.width = Math.max(0, Math.min(100, pct)) + "%";
      if (note) msg.textContent = `${label ? label + " " : ""}${note}`;
    },
  };
}

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

/** ── กล่องลากวางไฟล์ ───────────────────────────────────────────────────── */
export function dropzone(opts = {}) {
  const {
    accept = "*/*", multiple = true, reorder = false,
    hint = tr("ลากไฟล์มาวาง หรือคลิกเพื่อเลือก", "Drop files here, or click to choose"),
    onChange = () => {},
    expect = null,                 // เช่น ["pdf"] — ชนิดไฟล์ที่เครื่องมือนี้รับ
    expectLabel = tr("ไฟล์ชนิดที่รองรับ", "a supported file type"),
  } = opts;

  let files = [];
  const input = el("input", {
    type: "file", accept, multiple: multiple || null, hidden: true,
    onchange: (e) => { add([...e.target.files]); input.value = ""; },
  });
  const list = el("div", { class: "files" });
  const zone = el("div", {
    class: "dz", tabindex: "0", role: "button",
    "aria-label": tr(`เลือกไฟล์: ${expectLabel} — คลิกหรือกด Enter เพื่อเลือก หรือลากไฟล์มาวาง`,
                     `Choose files: ${expectLabel} — click or press Enter to pick, or drop files here`),
  }, [
    el("div", { class: "dz-ico", "aria-hidden": "true" }, [uiIcon("upload", "dz-svg")]),
    el("div", { class: "dz-main" }, tr("คลิกเพื่อเลือกไฟล์ หรือลากมาวาง", "Click to choose files, or drop them here")),
    el("div", { class: "dz-hint" }, hint),
    // ย้ำความเป็นส่วนตัวตรงจุดที่ผู้ใช้กำลังลังเลจะปล่อยไฟล์ ไม่ใช่ปล่อยให้ไปอ่านที่ท้ายหน้า
    el("div", { class: "dz-safe" }, [uiIcon("lock", "safe-svg"), tr("ไฟล์อยู่ในเครื่องคุณ ไม่ถูกส่งไปที่ไหนทั้งสิ้น", "Your files stay on this device — nothing is uploaded")]),
    input,
  ]);

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
  });
  ["dragenter", "dragover"].forEach((t) =>
    zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.add("over"); }));
  ["dragleave", "dragend"].forEach((t) =>
    zone.addEventListener(t, () => zone.classList.remove("over")));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("over");
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

    files = multiple ? files.concat(usable) : usable.slice(0, 1);
    render();
    onChange(files);
  }

  function showWrongType(bad) {
    const first = bad[0];
    const info = wrongTypeMessage(first.kind, expectLabel);
    const names = bad.map((b) => b.file.name).join(", ");
    const box = el("div", { class: "wrong-type" }, [
      el("div", {}, [
        el("strong", {}, tr("ไฟล์นี้ใช้กับเครื่องมือนี้ไม่ได้", "This file does not work with this tool")),
        el("div", { class: "wt-detail" }, `${info.text} — ${names}`),
      ]),
      info.toolId
        ? el("button", { class: "btn", type: "button",
            onclick: () => { location.hash = "#/" + info.toolId; } },
            tr(`ไปที่ ${info.toolName} →`, `Go to ${info.toolName} →`))
        : null,
    ]);
    warn.appendChild(box);
  }
  function remove(i) { files.splice(i, 1); render(); onChange(files); }
  function move(from, to) {
    if (from === to || from < 0 || to < 0) return;
    files.splice(to, 0, files.splice(from, 1)[0]);
    render(); onChange(files);
  }

  function render() {
    list.innerHTML = "";
    files.forEach((f, i) => {
      // ‼️ การลากวางแบบ HTML5 ใช้ไม่ได้เลยบนมือถือและกับคนที่ใช้คีย์บอร์ดอย่างเดียว
      //    จึงต้องมีปุ่มขึ้น-ลงคู่กันเสมอ ไม่ใช่ทางเลือกเสริม
      const move = (d) => { const j = i + d; if (j < 0 || j >= files.length) return;
        [files[i], files[j]] = [files[j], files[i]]; render(); onChange(files); };
      const row = el("div", { class: "file-row", draggable: reorder || null, "data-i": i }, [
        reorder ? el("span", { class: "grip", title: tr("ลากเพื่อสลับลำดับ", "Drag to reorder"), "aria-hidden": "true" }, [uiIcon("grip", "grip-svg")]) : null,
        el("span", { class: "f-name" }, f.name),
        el("span", { class: "f-size" }, fmtBytes(f.size)),
        reorder ? el("button", { class: "icon-btn", type: "button", "aria-label": tr(`เลื่อน ${f.name} ขึ้น`, `Move ${f.name} up`),
          title: tr("เลื่อนขึ้น", "Move up"), disabled: i === 0 || null, onclick: () => move(-1) }, "↑") : null,
        reorder ? el("button", { class: "icon-btn", type: "button", "aria-label": tr(`เลื่อน ${f.name} ลง`, `Move ${f.name} down`),
          title: tr("เลื่อนลง", "Move down"), disabled: i === files.length - 1 || null, onclick: () => move(1) }, "↓") : null,
        el("button", { class: "icon-btn danger", type: "button", title: tr("เอาออก", "Remove"),
          "aria-label": tr(`เอา ${f.name} ออก`, `Remove ${f.name}`), onclick: () => remove(i) }, [uiIcon("close", "pg-ico")]),
      ]);
      list.appendChild(row);
    });
    count.textContent = !files.length ? ""
      : tr(`${files.length} ไฟล์ · รวม ${fmtBytes(files.reduce((a, f) => a + f.size, 0))}`,
           `${files.length} files · ${fmtBytes(files.reduce((a, f) => a + f.size, 0))} total`);
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
          sampleErr.textContent = tr("โหลดไฟล์ตัวอย่างไม่สำเร็จ ลองใหม่อีกครั้ง", "Couldn't load the sample file — please try again.");
        } finally {
          sampleBtn.disabled = false;
          sampleBtn.textContent = tr("ลองด้วยไฟล์ตัวอย่าง", "Try a sample file");
        }
      },
    });
    sampleBox = el("div", { class: "dz-sample", style: { marginTop: "10px" } }, [sampleBtn, sampleErr]);
  }

  const container = el("div", {}, [zone, sampleBox, warn, count, list]);
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
  const failed = [];
  st?.begin?.();
  let stopped = 0;
  for (let i = 0; i < files.length; i++) {
    if (st?.cancelled) { stopped = files.length - i; break; }
    try { await fn(files[i], i); }
    catch (e) { failed.push({ name: files[i].name, why: (e && e.message) || String(e) }); }
    st?.progress?.(((i + 1) / files.length) * 100, `(${i + 1}/${files.length})`);
    await yieldToBrowser();
  }
  st?.end?.();
  failed.stopped = stopped;          // ไฟล์ที่ยังไม่ได้ทำเพราะผู้ใช้กดหยุด
  return failed;
}

/** กล่องสรุปไฟล์ที่ข้ามไป — ใช้คู่กับ eachFile */
export function failedBox(failed) {
  if (!failed) return null;
  if (!failed.length && !failed.stopped) return null;
  if (!failed.length) return el("div", { class: "fail-box" }, [
    el("strong", {}, tr(`หยุดตามที่สั่งแล้ว — ยังไม่ได้ทำอีก ${failed.stopped} ไฟล์ (ที่เสร็จแล้วดาวน์โหลดได้ตามปกติ)`,
                        `Stopped as asked — ${failed.stopped} files left untouched (whatever finished is still yours to download)`)),
  ]);
  return el("div", { class: "fail-box" }, [
    el("strong", {}, tr(`ข้ามไป ${failed.length} ไฟล์ที่ทำงานด้วยไม่ได้ (ไฟล์อื่นเสร็จเรียบร้อยแล้ว)`,
                        `Skipped ${failed.length} files this tool could not handle (the rest finished fine)`)),
    el("ul", {}, failed.map((f) => el("li", {}, `${f.name} — ${f.why}`))),
    failed.stopped ? el("div", {}, tr(`หยุดตามที่สั่งแล้ว — ยังไม่ได้ทำอีก ${failed.stopped} ไฟล์`,
                                      `Stopped as asked — ${failed.stopped} files left untouched`)) : null,
  ]);
}
