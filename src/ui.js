import { detectType, wrongTypeMessage } from "./filetype.js";
import { $, $$, el } from "./dom.js";
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
export function toolShell(tool) {
  const body = el("div", { class: "panel" });
  const wrap = el("div", {}, [
    el("div", { class: "tool-head" }, [
      el("div", { class: "tool-ico" }, tool.icon),
      el("div", {}, [el("h1", {}, tool.title), el("p", {}, tool.desc)]),
    ]),
    body,
  ]);
  return { wrap, body };
}

/** แถบสถานะ + แถบความคืบหน้า (ใช้คู่กันเสมอ) */
export function statusBar() {
  const msg = el("div", { class: "status" });
  const fill = el("div", { class: "fill" });
  const bar = el("div", { class: "progress" }, [fill]);
  const node = el("div", { class: "status-wrap" }, [msg, bar]);
  let label = "";
  return {
    node,
    info: (t) => { msg.className = "status show info"; msg.textContent = t; label = t; },
    ok: (t) => { msg.className = "status show ok"; msg.textContent = t; },
    err: (t) => { msg.className = "status show err"; msg.textContent = t; },
    clear: () => { msg.className = "status"; msg.textContent = ""; bar.classList.remove("show"); },
    progress: (pct, note) => {
      if (pct === null) { bar.classList.remove("show"); return; }
      bar.classList.add("show");
      fill.style.width = Math.max(0, Math.min(100, pct)) + "%";
      if (note) msg.textContent = `${label ? label + " " : ""}${note}`;
    },
  };
}

export function button(text, opts = {}) {
  return el("button", {
    class: "btn" + (opts.ghost ? " ghost" : "") + (opts.danger ? " danger" : ""),
    type: "button",
    onclick: opts.onclick,
  }, text);
}

export function field(labelText, control, hint) {
  return el("label", { class: "field" }, [
    el("span", {}, labelText),
    control,
    hint ? el("small", {}, hint) : null,
  ]);
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
    button("⬇ ดาวน์โหลด", { onclick: () => download(blob, name) }),
  ]);
}

/** ── กล่องลากวางไฟล์ ───────────────────────────────────────────────────── */
export function dropzone(opts = {}) {
  const {
    accept = "*/*", multiple = true, reorder = false,
    hint = "ลากไฟล์มาวาง หรือคลิกเพื่อเลือก",
    onChange = () => {},
    expect = null,                 // เช่น ["pdf"] — ชนิดไฟล์ที่เครื่องมือนี้รับ
    expectLabel = "ไฟล์ชนิดที่รองรับ",
  } = opts;

  let files = [];
  const input = el("input", {
    type: "file", accept, multiple: multiple || null, hidden: true,
    onchange: (e) => { add([...e.target.files]); input.value = ""; },
  });
  const list = el("div", { class: "files" });
  const zone = el("div", { class: "dz", tabindex: "0", role: "button" }, [
    el("div", { class: "dz-ico" }, "📁"),
    el("div", { class: "dz-main" }, "คลิกเพื่อเลือกไฟล์ หรือลากมาวาง"),
    el("div", { class: "dz-hint" }, hint),
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
    // เดิมไฟล์จะถูกรับเข้าไปแล้วไปพังตอนอ่าน ทำให้ขึ้นว่า "ไฟล์เสียหาย" ซึ่งไม่จริง
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
        el("strong", {}, "ไฟล์นี้ใช้กับเครื่องมือนี้ไม่ได้"),
        el("div", { class: "wt-detail" }, `${info.text} — ${names}`),
      ]),
      info.toolId
        ? el("button", { class: "btn", type: "button",
            onclick: () => { location.hash = "#/" + info.toolId; } }, `ไปที่ ${info.toolName} →`)
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
      const row = el("div", { class: "file-row", draggable: reorder || null, "data-i": i }, [
        reorder ? el("span", { class: "grip", title: "ลากเพื่อสลับลำดับ" }, "⠿") : null,
        el("span", { class: "f-name" }, f.name),
        el("span", { class: "f-size" }, fmtBytes(f.size)),
        el("button", { class: "icon-btn danger", type: "button", title: "เอาออก",
          onclick: () => remove(i) }, "✕"),
      ]);
      list.appendChild(row);
    });
    count.textContent = files.length ? `${files.length} ไฟล์ · รวม ${fmtBytes(files.reduce((a, f) => a + f.size, 0))}` : "";
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
  const container = el("div", {}, [zone, warn, count, list]);
  return { container, get files() { return files; },
           clear() { files = []; warn.innerHTML = ""; render(); onChange(files); } };
}

/** แปลง "1-3,5,8-" เป็นอาร์เรย์เลขหน้า (ฐาน 1) — ใช้ร่วมหลายเครื่องมือ */
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
      throw new Error(`อ่านช่วงหน้าไม่เข้าใจ: "${s}"`);
    }
  }
  return [...out].sort((a, b) => a - b);
}

export const stripExt = (n) => (n.lastIndexOf(".") > 0 ? n.slice(0, n.lastIndexOf(".")) : n);
