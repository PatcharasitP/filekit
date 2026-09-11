// ── เตรียมใช้งานออฟไลน์ ────────────────────────────────────────────────────
// ปกติเว็บนี้จะดาวน์โหลดไลบรารีเฉพาะตอนเปิดเครื่องมือนั้นจริง ซึ่งทำให้หน้าแรก
// เบามาก แต่แลกมาด้วยข้อจำกัด: เครื่องมือที่ยังไม่เคยเปิดจะใช้ตอนไม่มีเน็ตไม่ได้
// (พิสูจน์แล้วด้วยการตัดเน็ตจริงระดับเครือข่าย)
//
// ไฟล์นี้ให้ผู้ใช้ "เลือกเอง"ว่าจะดึงทุกอย่างมาเก็บไว้ล่วงหน้าไหม — ไม่บังคับ
// โหลด 4-5 MB ตั้งแต่หน้าแรก เพราะจะทำลายข้อดีเรื่องความเร็วที่ตั้งใจออกแบบไว้

import { localLibFiles } from "./loader.js";
import { TOOLS } from "./registry.js";
import { el } from "./dom.js";
import { uiIcon } from "./icons.js";
import { tr } from "./i18n.js";

const KEY = "filekit-offline-ready";
const FONTS = ["vendor/fonts/Sarabun-Regular-th.ttf", "vendor/fonts/Sarabun-Bold-th.ttf",
  "vendor/fonts/Sarabun-Regular.woff2", "vendor/fonts/Sarabun-SemiBold.woff2", "vendor/fonts/Sarabun-Bold.woff2"];

const assetList = () => [
  ...localLibFiles(),
  ...FONTS,
  ...TOOLS.map((t) => `src/tools/${t.id}.js`),
  "src/i18n.js", "src/preview.js", "src/offline.js", "src/ui.js", "src/filetype.js",
  "vendor/easy-template-x.esm.js", "src/pdfopen.js", "src/ocr.js",
  "src/pdftext.js", "src/pptx.js", "src/thaifont.js", "assets/css/tool.css",
  "src/thai.js", "src/sheetpick.js", "src/xlsxutil.js", "src/pqm.js", "src/pqtypes.js", "src/tabledata.js", "src/search.js", "src/icons.js", "src/workspace.js", "src/docxmerge.js", "src/docxjoin.js",
  "src/docxreplace.js", "src/docxclean.js", "src/signpad.js", "src/colorkit.js",
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
      bar.appendChild(el("span", { class: "ob-ready" }, tr("เตรียมไฟล์ไว้ในเครื่องแล้ว ใช้ได้ครบทุกเครื่องมือแม้ไม่มีเน็ต", "Files are ready on this device. Every tool works even without internet")));
      bar.appendChild(el("button", { class: "ob-link", type: "button", onclick: run }, tr("โหลดใหม่อีกครั้ง", "Refresh files")));
      return;
    }
    bar.appendChild(el("span", {}, [
      el("strong", {}, [uiIcon("offline", "ob-ico"), tr("ใช้ได้แม้ไม่มีอินเทอร์เน็ต", "Works without internet")]),
      // ‼️ ประโยคเดิมยาว 2 บรรทัดและขึ้นต้นด้วยขีดยาว — พี่ปอนด์ทักว่าอ่านแล้วรก
      //    เหลือเฉพาะสิ่งที่ผู้ใช้ต้องรู้: ได้อะไร กินที่เท่าไร · รายละเอียดที่เหลือไม่จำเป็น
      el("span", { class: "ob-detail" },
        tr("  โหลดเครื่องมือทั้งหมดไว้ล่วงหน้า (5 MB)",
           "  Download every tool in advance (5 MB)")),
    ]));
    bar.appendChild(el("button", { class: "btn ob-btn", type: "button", onclick: run }, tr("โหลดไว้ใช้ออฟไลน์", "Download for offline")));
  };

  async function run() {
    bar.innerHTML = "";
    const label = el("span", {}, tr("กำลังเตรียมไฟล์…", "Preparing files…"));
    const fill = el("div", { class: "fill" });
    bar.append(label, el("div", { class: "progress show ob-progress" }, [fill]));
    const r = await prepareOffline(({ done, total }) => {
      fill.style.width = (done / total) * 100 + "%";
      label.textContent = tr(`กำลังเตรียมไฟล์… ${done}/${total}`, `Preparing files… ${done}/${total}`);
    });
    bar.innerHTML = "";
    if (r.failed) {
      bar.appendChild(el("span", { class: "ob-fail" },
        tr(`เตรียมไม่ครบ (${r.failed} จาก ${r.total} ไฟล์โหลดไม่ได้) ลองใหม่เมื่อสัญญาณดีขึ้น`,
           `Not all files were ready (${r.failed} of ${r.total} failed to load), try again once your connection is better`)));
      bar.appendChild(el("button", { class: "btn ob-btn", type: "button", onclick: run }, tr("ลองใหม่", "Try again")));
    } else {
      render();
    }
  }

  render();
  return bar;
}
