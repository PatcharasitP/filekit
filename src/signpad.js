// ── กระดานวาดลายเซ็น ───────────────────────────────────────────────────────
// รองรับทั้งเมาส์ ปากกา และนิ้ว ผ่าน Pointer Events ตัวเดียว
// เก็บลายเซ็นไว้ในเครื่องผู้ใช้ (localStorage) เพื่อไม่ต้องวาดใหม่ทุกครั้ง
// — ข้อมูลไม่ออกจากเครื่องเช่นเดียวกับส่วนอื่นของเว็บ

import { el } from "./dom.js";

const KEY = "filekit-signatures";

export const savedSignatures = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
};

export function saveSignature(dataUrl) {
  try {
    const list = savedSignatures().filter((s) => s !== dataUrl);
    list.unshift(dataUrl);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 5)));   // เก็บ 5 อันล่าสุดพอ
  } catch {}
}

export function removeSignature(dataUrl) {
  try { localStorage.setItem(KEY, JSON.stringify(savedSignatures().filter((s) => s !== dataUrl))); } catch {}
}

/**
 * สร้างกระดานวาด คืน { node, toDataURL, clear, isEmpty }
 * วาดบน canvas ความละเอียดสูงกว่าที่แสดง เพื่อให้เส้นคมตอนนำไปวางบน PDF
 */
export function signaturePad({ width = 560, height = 200, onChange } = {}) {
  const scale = 3;                                   // ความละเอียดจริง = 3 เท่าของที่เห็น
  const canvas = el("canvas", { class: "sign-canvas", width: width * scale, height: height * scale });
  canvas.style.width = "100%";
  canvas.style.aspectRatio = `${width} / ${height}`;
  const ctx = canvas.getContext("2d");
  ctx.lineWidth = 2.6 * scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#111827";

  let drawing = false, empty = true, last = null;

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvas.width / r.width),
             y: (e.clientY - r.top) * (canvas.height / r.height) };
  };

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drawing = true; empty = false;
    last = pos(e);
    // จุดเดียวก็ต้องเห็น (คนแตะสั้น ๆ)
    ctx.beginPath(); ctx.arc(last.x, last.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p;
  });
  const end = () => { if (drawing) { drawing = false; onChange?.(); } };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("pointerleave", end);

  /** ตัดขอบว่างรอบลายเซ็นออก ให้เหลือเฉพาะเส้นจริง แล้วคืนเป็น PNG พื้นโปร่งใส */
  function toDataURL() {
    if (empty) return null;
    const { width: w, height: h } = canvas;
    const data = ctx.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = 0, maxY = 0, found = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 8) {
          found = true;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) return null;
    const pad = Math.round(6 * scale);
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
    const out = document.createElement("canvas");
    out.width = maxX - minX + 1; out.height = maxY - minY + 1;
    out.getContext("2d").drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  }

  function clear() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    empty = true;
    onChange?.();
  }

  return { node: canvas, toDataURL, clear, isEmpty: () => empty };
}

/** แปลงไฟล์รูปลายเซ็นเป็น PNG พื้นโปร่งใส โดยถอดพื้นขาวออก */
export async function imageToSignature(file, { threshold = 232 } = {}) {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width; canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  // รูปลายเซ็นที่ถ่าย/สแกนมามักมีพื้นขาว ถ้าไม่ถอดออกจะเป็นกล่องสี่เหลี่ยมทับเอกสาร
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > threshold && d[i + 1] > threshold && d[i + 2] > threshold) d[i + 3] = 0;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}
