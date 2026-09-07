// ── เตรียมใช้งานออฟไลน์ ────────────────────────────────────────────────────
// ปกติเว็บนี้จะดาวน์โหลดไลบรารีเฉพาะตอนเปิดเครื่องมือนั้นจริง ซึ่งทำให้หน้าแรก
// เบามาก แต่แลกมาด้วยข้อจำกัด: เครื่องมือที่ยังไม่เคยเปิดจะใช้ตอนไม่มีเน็ตไม่ได้
// (พิสูจน์แล้วด้วยการตัดเน็ตจริงระดับเครือข่าย)
//
// ไฟล์นี้ให้ผู้ใช้ "เลือกเอง" ว่าจะดึงทุกอย่างมาเก็บไว้ล่วงหน้าไหม — ไม่บังคับ
// โหลด 4-5 MB ตั้งแต่หน้าแรก เพราะจะทำลายข้อดีเรื่องความเร็วที่ตั้งใจออกแบบไว้

import { localLibFiles } from "./loader.js";
import { TOOLS } from "./registry.js";
import { el } from "./dom.js";

const KEY = "filekit-offline-ready";
const FONTS = ["vendor/fonts/Sarabun-Regular-th.ttf", "vendor/fonts/Sarabun-Bold-th.ttf"];

const assetList = () => [
  ...localLibFiles(),
  ...FONTS,
  ...TOOLS.map((t) => `src/tools/${t.id}.js`),
  "src/ui.js", "src/filetype.js", "src/pdfopen.js", "src/ocr.js",
  "src/pdftext.js", "src/pptx.js", "src/thaifont.js", "assets/css/tool.css",
];

export const isReady = () => {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
};

/** ดึงทุกไฟล์มาเก็บไว้ในเครื่อง — service worker จะเก็บให้เองระหว่างทาง */
export async function prepareOffline(onProgress) {
  const list = assetList();
  let done = 0, failed = 0;
  const CONCURRENCY = 4;   // ดึงทีละ 4 ไฟล์ พอให้เร็วโดยไม่แย่งแบนด์วิดท์จนเครื่องหน่วง
  const queue = [...list];

  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      try {
        const res = await fetch(url, { cache: "reload" });
        if (!res.ok) throw new Error(String(res.status));
        await res.blob();
      } catch { failed++; }
      done++;
      onProgress?.({ done, total: list.length, failed });
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (failed === 0) { try { localStorage.setItem(KEY, "1"); } catch {} }
  return { total: list.length, failed };
}

/** แถบเล็ก ๆ ท้ายหน้าแรก ให้ผู้ใช้กดเตรียมไฟล์ไว้ใช้ตอนไม่มีเน็ต */
export function offlineBar() {
  const bar = el("div", { class: "offline-bar" });

  const render = () => {
    bar.innerHTML = "";
    if (isReady()) {
      bar.appendChild(el("span", { class: "ob-ready" }, "✅ เตรียมไฟล์ไว้ในเครื่องแล้ว — ใช้ได้ครบทุกเครื่องมือแม้ไม่มีเน็ต"));
      bar.appendChild(el("button", { class: "ob-link", type: "button", onclick: run }, "โหลดใหม่อีกครั้ง"));
      return;
    }
    bar.appendChild(el("span", {}, [
      el("strong", {}, "📥 ใช้งานตอนไม่มีเน็ต"),
      el("span", { class: "ob-detail" },
        " — ตอนนี้เครื่องมือที่เคยเปิดแล้วใช้ออฟไลน์ได้ กดปุ่มนี้เพื่อดึงทุกเครื่องมือมาเก็บไว้ล่วงหน้า (ประมาณ 5 MB)"),
    ]));
    bar.appendChild(el("button", { class: "btn ob-btn", type: "button", onclick: run }, "เตรียมใช้งานออฟไลน์"));
  };

  async function run() {
    bar.innerHTML = "";
    const label = el("span", {}, "กำลังเตรียมไฟล์…");
    const fill = el("div", { class: "fill" });
    bar.append(label, el("div", { class: "progress show ob-progress" }, [fill]));
    const r = await prepareOffline(({ done, total }) => {
      fill.style.width = (done / total) * 100 + "%";
      label.textContent = `กำลังเตรียมไฟล์… ${done}/${total}`;
    });
    bar.innerHTML = "";
    if (r.failed) {
      bar.appendChild(el("span", { class: "ob-fail" },
        `เตรียมไม่ครบ (${r.failed} จาก ${r.total} ไฟล์โหลดไม่ได้) — ลองใหม่เมื่อสัญญาณดีขึ้น`));
      bar.appendChild(el("button", { class: "btn ob-btn", type: "button", onclick: run }, "ลองใหม่"));
    } else {
      render();
    }
  }

  render();
  return bar;
}
