// ── ตัวโหลดไลบรารีแบบ on-demand ────────────────────────────────────────────
// หัวใจของ performance: หน้าแรกไม่โหลดไลบรารีสักตัว แต่ละเครื่องมือขอเฉพาะ
// ที่ตัวเองใช้ ตอนที่ผู้ใช้เปิดเครื่องมือนั้นจริง ๆ (หรือตอน hover = prefetch)
//
// ทุกตัวโหลดจาก vendor/ ในโดเมนเดียวกันก่อน เพราะตั้งแต่ Chrome 86 เป็นต้นมา
// HTTP cache ถูกแบ่งตามเว็บที่เรียก (cache partitioning) — ไฟล์จาก CDN สาธารณะ
// จึงไม่ได้ถูกใช้ซ้ำข้ามเว็บอีกแล้ว การ self-host ตัดมือ DNS+TLS+connect ของ
// โดเมนที่สามทิ้งได้ทั้งก้อน ถ้า vendor/ พังค่อยตกลง CDN เป็นตาข่ายรองรับ

const REG = {
  pdfjs: {
    global: "pdfjsLib",
    local: "vendor/pdf.min.js",
    cdn: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    ready(lib, base) {
      lib.GlobalWorkerOptions.workerSrc = base.startsWith("http")
        ? "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
        : "vendor/pdf.worker.min.js";
    },
  },
  pdflib: {
    global: "PDFLib",
    local: "vendor/pdf-lib.min.js",
    cdn: "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js",
  },
  xlsx: {
    global: "XLSX",
    local: "vendor/xlsx.full.min.js",
    cdn: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  },
  docx: {
    global: "docx",
    local: "vendor/docx.umd.js",
    cdn: "https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js",
  },
  jszip: {
    global: "JSZip",
    local: "vendor/jszip.min.js",
    cdn: "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
  },
  mammoth: {
    global: "mammoth",
    local: "vendor/mammoth.browser.min.js",
    cdn: "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js",
  },
  jspdf: {
    global: "jspdf",
    local: "vendor/jspdf.umd.min.js",
    cdn: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  },
  jspdfTable: {
    global: null, // ปลั๊กอิน: ไม่ประกาศ global ของตัวเอง ต่อท้าย jspdf
    needs: ["jspdf"],
    local: "vendor/jspdf.plugin.autotable.min.js",
    cdn: "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
  },
  tesseract: {
    global: "Tesseract",
    local: "vendor/tesseract.min.js",
    cdn: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
  },
};

const inflight = new Map(); // ชื่อ -> Promise — กันโหลดซ้ำเมื่อหลายเครื่องมือขอพร้อมกัน

function injectScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve(src);
    s.onerror = () => reject(new Error("โหลดไม่สำเร็จ: " + src));
    document.head.appendChild(s);
  });
}

async function loadOne(name) {
  const spec = REG[name];
  if (!spec) throw new Error("ไม่รู้จักไลบรารี: " + name);
  if (spec.needs) await Promise.all(spec.needs.map(loadOne));
  if (spec.global && window[spec.global]) return window[spec.global];

  let base = spec.local;
  try {
    await injectScript(spec.local);
  } catch {
    base = spec.cdn;
    await injectScript(spec.cdn); // ตาข่ายรองรับเมื่อ vendor/ ไม่มีไฟล์
  }
  const lib = spec.global ? window[spec.global] : true;
  if (spec.global && !lib) throw new Error("โหลดแล้วแต่ไม่พบ " + spec.global);
  if (spec.ready) spec.ready(lib, base);
  return lib;
}

/** โหลดไลบรารีตามชื่อ (ขนานกัน) แล้วคืนค่า global ของแต่ละตัวเป็นอาร์เรย์ */
export function loadLibs(...names) {
  return Promise.all(
    names.map((n) => {
      if (!inflight.has(n)) {
        inflight.set(
          n,
          loadOne(n).catch((e) => {
            inflight.delete(n); // ให้ลองใหม่ได้ ไม่แคช error ค้าง
            throw e;
          })
        );
      }
      return inflight.get(n);
    })
  );
}

/** เริ่มโหลดเงียบ ๆ ล่วงหน้า (ตอน hover/focus การ์ด) — ไม่รอผล ไม่โยน error */
export function warmLibs(names = []) {
  if (!names.length) return;
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
  idle(() => loadLibs(...names).catch(() => {}));
}

/** บอกว่าไลบรารีชุดนี้พร้อมใช้แล้วหรือยัง (ใช้ตัดสินว่าจะโชว์ "กำลังเตรียม..." ไหม) */
export function libsReady(names = []) {
  return names.every((n) => {
    const s = REG[n];
    return s && (!s.global || !!window[s.global]);
  });
}
