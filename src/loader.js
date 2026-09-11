// ── ตัวโหลดไลบรารีแบบ on-demand ────────────────────────────────────────────
// หัวใจของ performance: หน้าแรกไม่โหลดไลบรารีสักตัว แต่ละเครื่องมือขอเฉพาะ
// ที่ตัวเองใช้ ตอนที่ผู้ใช้เปิดเครื่องมือนั้นจริง ๆ (หรือตอน hover = prefetch)
//
// ทุกตัวโหลดจาก vendor/ ในโดเมนเดียวกันก่อน เพราะตั้งแต่ Chrome 86 เป็นต้นมา
// HTTP cache ถูกแบ่งตามเว็บที่เรียก (cache partitioning) — ไฟล์จาก CDN สาธารณะ
// จึงไม่ได้ถูกใช้ซ้ำข้ามเว็บอีกแล้ว การ self-host ตัดมือ DNS+TLS+connect ของ
// โดเมนที่สามทิ้งได้ทั้งก้อน ถ้า vendor/ พังค่อยตกลง CDN เป็นตาข่ายรองรับ

import { tr } from "./i18n.js";

const REG = {
  pdfjs: {
    global: "pdfjsLib",
    local: "vendor/pdf.min.js",
    extra: ["vendor/pdf.worker.min.js"],   // worker แยกไฟล์ ต้องมีตอนออฟไลน์ด้วย
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
  // ‼️ ลำดับต้องเป็น vega → vega-lite → vega-embed เท่านั้น (embed ต้องการอีกสองตัวอยู่บน
  // window ก่อนตัวมันเองรัน) ใช้ needs ไล่โซ่ให้อัตโนมัติ ไม่ต้องพึ่งลำดับที่ tool.js เรียก
  vega: {
    global: "vega",
    local: "vendor/vega.min.js",
    // ‼️ สองไฟล์นี้โหลดด้วย import() ไม่ใช่แท็ก script จึงไม่มี global ของตัวเอง
    // แต่ขาดไม่ได้ ไม่มีแล้วกราฟ Deneb เรนเดอร์ไม่ได้เลยตอนออฟไลน์
    extra: ["vendor/vega-interpreter.esm.js", "vendor/vega-util-shim.js"],
    cdn: "https://cdnjs.cloudflare.com/ajax/libs/vega/6.4.0/vega.min.js",
  },
  vegaLite: {
    global: "vegaLite",
    needs: ["vega"],
    local: "vendor/vega-lite.min.js",
    cdn: "https://cdnjs.cloudflare.com/ajax/libs/vega-lite/6.4.3/vega-lite.min.js",
  },
  vegaEmbed: {
    global: "vegaEmbed",
    needs: ["vegaLite"],
    local: "vendor/vega-embed.min.js",
    cdn: "https://cdnjs.cloudflare.com/ajax/libs/vega-embed/7.2.0/vega-embed.min.js",
  },
};

/** รายชื่อไฟล์ในเครื่อง (vendor/) ของทุกไลบรารี — ใช้ตอนเตรียมใช้งานออฟไลน์ */
export const localLibFiles = () => {
  const files = [];
  for (const spec of Object.values(REG)) {
    files.push(spec.local);
    if (spec.extra) files.push(...spec.extra);
  }
  return files;
};

const inflight = new Map(); // ชื่อ -> Promise — กันโหลดซ้ำเมื่อหลายเครื่องมือขอพร้อมกัน

/* ── ลายนิ้วมือของไฟล์ไลบรารีบน CDN (Subresource Integrity) ───────────────
 * ปกติทุกตัวโหลดจาก vendor/ ในโดเมนเดียวกันอยู่แล้ว CDN เป็นแค่ตาข่ายรองรับ
 * แต่ถ้าวันหนึ่งตกไปใช้ CDN แล้ว CDN นั้นถูกแฮ็ก = โค้ดแปลกปลอมรันบนหน้าเว็บผู้ใช้
 * ซึ่งอ่านไฟล์ที่กำลังประมวลผลอยู่ในหน่วยความจำได้ทันที เป็นทางเดียวที่คำสัญญา
 * "ไฟล์ไม่ออกจากเครื่องคุณ" จะถูกทำลายได้จริง · ใส่ลายนิ้วมือไว้ เบราว์เซอร์จะปฏิเสธ
 * ไฟล์ที่ไบต์ไม่ตรงเป๊ะให้เอง (คำนวณจากไฟล์จริงบน CDN 09/09/2026)
 * ‼️ เปลี่ยนเลขเวอร์ชันใน REG เมื่อไร ต้องคำนวณลายนิ้วมือใหม่ด้วยเสมอ ไม่งั้นตาข่ายรองรับพัง:
 *    curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A */
const SRI = {
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js":
    "sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js":
    "sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js":
    "sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw",
  "https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js":
    "sha384-4xaIisuLEy2lo2HkB2C4rEf7v8jbTb2kuogX6TkuEt9feTWKBSFSOzsqNNbV+sKh",
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js":
    "sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG",
  "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js":
    "sha384-/cXAMbzovUIKbBERjPmR3SnPTh8siWr5lsvFYj1Uq4XP0yaJUZJmsh0YXyGv5P0y",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js":
    "sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js":
    "sha384-fCAW/rDWORTbQXSiB7mOg0QtQ5c+r0f544y6XoKjuVva0nMBlCpNUjiFeG5iMdS3",
  "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js":
    "sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F",
  "https://cdnjs.cloudflare.com/ajax/libs/vega/6.4.0/vega.min.js":
    "sha384-VKdcJr3ZaBIJMbVcopTAI/JEuUkSY6qnwVu9iLuw0DnQ9gQ1JjsfZJhXFQAgNi43",
  "https://cdnjs.cloudflare.com/ajax/libs/vega-lite/6.4.3/vega-lite.min.js":
    "sha384-9/70gNCfOu6G7xXvkdreMfuqAEsoaGJVXV2BN/JLRXkSmcGvnMqtsRx8HZtUWAvI",
  "https://cdnjs.cloudflare.com/ajax/libs/vega-embed/7.2.0/vega-embed.min.js":
    "sha384-l5WgDTucorQO8clo6JeifE4nfFGsdrY0Zdhvg6idhVrlT2cXjJQ7oMCiaQKzGYfh",
};

function injectScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    const hash = SRI[src];
    if (hash) { s.integrity = hash; s.crossOrigin = "anonymous"; }
    s.onload = () => resolve(src);
    s.onerror = () => reject(new Error(tr("โหลดไม่สำเร็จ: ", "Failed to load: ") + src));
    document.head.appendChild(s);
  });
}

async function loadOne(name) {
  const spec = REG[name];
  if (!spec) throw new Error(tr("ไม่รู้จักไลบรารี: ", "Unknown library: ") + name);
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
  if (spec.global && !lib) throw new Error(tr("โหลดแล้วแต่ไม่พบ ", "Loaded but could not find ") + spec.global);
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

/** บอกว่าไลบรารีชุดนี้พร้อมใช้แล้วหรือยัง (ใช้ตัดสินว่าจะโชว์ "กำลังเตรียม..."ไหม) */
export function libsReady(names = []) {
  return names.every((n) => {
    const s = REG[n];
    return s && (!s.global || !!window[s.global]);
  });
}
