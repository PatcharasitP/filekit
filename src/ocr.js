// ── สะพานจาก "PDF ที่ไม่มีชั้นข้อความ"ไปสู่เครื่องมือแปลงทุกตัว ────────────
// เดิมเมื่อผู้ใช้เอาไฟล์สแกนมาแปลงเป็น Word/Excel/ข้อความ ระบบจะบอกให้ไปใช้
// เครื่องมือ OCR แยก ซึ่งคืนได้แค่ไฟล์ .txt = ทางตัน แปลงต่อไม่ได้
// ไฟล์นี้ทำให้แต่ละเครื่องมืออ่านไฟล์สแกนได้เองในที่เดียว โดยยังโหลด
// Tesseract (ตัวหนักสุดในโปรเจกต์) เฉพาะตอนที่ผู้ใช้กดยืนยันเท่านั้น

import { loadLibs } from "./loader.js";
import { yieldToBrowser } from "./ui.js";

/** เรนเดอร์หน้า PDF เป็น dataURL สำหรับป้อนให้ OCR */
async function pageToImage(pdf, pageNo, scale) {
  const page = await pdf.getPage(pageNo);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  page.cleanup();
  const url = canvas.toDataURL("image/png");
  canvas.width = canvas.height = 0;
  return url;
}

/**
 * อ่านข้อความจากหน้า PDF ด้วย OCR
 * คืน [{ page, text, lines }] — lines ใช้ต่อได้ทั้งกับ Word (ย่อหน้า) และ Excel (แถว)
 */
export async function ocrPdf(pdf, { lang = "tha+eng", scale = 2.6, pages, onProgress, minConfidence = 55 } = {}) {
  const [Tess] = await loadLibs("tesseract");
  const list = pages || Array.from({ length: pdf.numPages }, (_, i) => i + 1);
  const worker = await Tess.createWorker(lang, 1, {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) onProgress({ phase: "read", ratio: m.progress });
      else if (onProgress && /load|initial/i.test(m.status || "")) onProgress({ phase: "prepare", status: m.status });
    },
  });
  try {
    const out = [];
    for (let i = 0; i < list.length; i++) {
      onProgress?.({ phase: "page", current: i + 1, total: list.length });
      const img = await pageToImage(pdf, list[i], scale);
      const { data } = await worker.recognize(img);

      // Tesseract คืนค่าความมั่นใจรายบรรทัดมาด้วย — ใช้ตัด "บรรทัดขยะ"ที่มัก
      // เกิดจากขอบกระดาษ/รอยเปื้อน (เช่นได้ "ฆม"หรือ "Vv =|"ลอยมาบนสุด)
      // ตัดเฉพาะบรรทัดที่ทั้งความมั่นใจต่ำ "และ"สั้นมาก เพื่อไม่ให้เผลอตัดข้อมูลจริง
      const raw = Array.isArray(data.lines) && data.lines.length
        ? data.lines.map((l) => ({ text: (l.text || "").trim(), conf: l.confidence ?? 100 }))
        : (data.text || "").split("\n").map((t) => ({ text: t.trim(), conf: 100 }));
      const lines = raw
        .filter((l) => l.text)
        .filter((l) => !(l.conf < minConfidence && l.text.replace(/\s/g, "").length <= 4))
        .map((l) => l.text);
      const text = lines.join("\n");
      out.push({ page: list[i], text, lines });
      await yieldToBrowser();
    }
    return out;
  } finally {
    await worker.terminate();
  }
}

/** ตรวจว่า PDF มีชั้นข้อความจริงหรือไม่ (ใช้ตัดสินว่าต้อง OCR ไหม) */
export async function hasTextLayer(pdf, sampleUpTo = 3) {
  const n = Math.min(pdf.numPages, sampleUpTo);
  for (let p = 1; p <= n; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const chars = content.items.map((i) => i.str).join("").replace(/\s/g, "").length;
    page.cleanup();
    if (chars > 0) return true;
  }
  return false;
}
