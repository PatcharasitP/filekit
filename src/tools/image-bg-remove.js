import { el, dropzone, statusBar, button, field, select, segmented, download,
         stripExt, fmtBytes, registerCleanup, yieldToBrowser } from "../ui.js";
import { workspace } from "../workspace.js";
import { tr, pl } from "../i18n.js";
import { decodeImage } from "../imgdecode.js";

/* ── ลบพื้นหลังรูปภาพ ───────────────────────────────────────────────────────
 * ‼️ ทำไมไม่ใช้โมเดล AI (ตัดสินจากงานวิจัย 19/09/2026 + วัดผลจริงเอง)
 *   โมเดลที่คุณภาพดีจริงคือ RMBG-1.4/2.0 แต่ใบอนุญาตเป็น CC-BY-NC = ห้ามใช้เชิงพาณิชย์
 *   ตัวที่ใบอนุญาตเปิด (BiRefNet-lite) เล็กสุด 94 MB ส่วน U2NetP 4.6 MB คุณภาพขอบปานกลาง
 *   และ onnxruntime-web ต้องการ CSP `wasm-unsafe-eval` ซึ่งของเรายังไม่ได้เปิด
 *   -> รุ่นแรกจึงทำด้วยการคำนวณตรง ๆ ไม่ต้องโหลดอะไรเพิ่มสักไบต์ ได้ผลทันที
 *
 * ‼️ สองโหมด เพราะวัดแล้วพบว่าวิธีเดียวใช้ไม่ได้กับทั้งสองแบบ (ทดสอบกับรูปที่มีเฉลย)
 *   โหมดหมึก   : หารด้วยแผนที่แสง แล้วปรับช่วง — ลายเซ็น พื้นหลังค้าง 0.0 หมึกหาย 0.0
 *                 (วิธีตรงไปตรงมาคือเอาความสว่างมาเป็นความทึบ ได้ IoU 100% ก็จริง
 *                  แต่พื้นหลังยังทึบค้างอยู่ 33/255 เห็นเป็นฝ้าเทาเวลาเอาไปวางทับ)
 *   โหมดพื้นสี : คีย์สีจากขอบภาพ — วัตถุที่มีส่วนสีขาว พื้นหลังค้าง 0.3 เนื้อหาย 2.5
 *                 (ถ้าใช้โหมดหมึกกับวัตถุที่มีหน้าขาว หน้าขาวจะกลายเป็นโปร่งใสไปด้วย
 *                  วัดได้ว่าเนื้อหายไป 107.8 จาก 255 = พังเห็น ๆ)
 *
 * ‼️ แผนที่แสงคำนวณบนรูปย่อ 64px แล้วขยายกลับ ไม่ได้เบลอรูปเต็ม
 *   เพราะแสงที่ไม่เท่ากันเป็นความถี่ต่ำ พิสูจน์แล้วว่าได้ผลต่างกันเฉลี่ยแค่ 0.07 ระดับ
 *   แต่รูป 12 ล้านพิกเซลไม่ต้องรอเบลอทั้งรูป
 */

const MAX_PREVIEW = 1100;   // ด้านยาวสุดของภาพตัวอย่าง — ใหญ่กว่านี้ตาคนไม่เห็นต่าง แต่ปรับค่าแล้วหน่วง

if (!document.getElementById("bgr-style")) {
  const style = el("style", { id: "bgr-style" });
  style.textContent = `
.bgr-left,.bgr-right{display:flex;flex-direction:column;gap:14px}
/* ‼️ พื้นหมากรุกคือสิ่งเดียวที่บอกได้ว่า "ตรงนี้โปร่งใสจริง" ไม่ใช่ขาวทึบ
   ถ้าโชว์บนพื้นขาว ผู้ใช้จะแยกไม่ออกเลยว่าลบสำเร็จหรือยัง */
.bgr-stage{
  position:relative;width:100%;height:min(56vh,520px);min-height:240px;display:grid;place-items:center;
  border-radius:var(--r);border:1px solid var(--line-soft);overflow:hidden;
  background-color:#fff;
  background-image:linear-gradient(45deg,#dcdcdc 25%,transparent 25%),linear-gradient(-45deg,#dcdcdc 25%,transparent 25%),
                   linear-gradient(45deg,transparent 75%,#dcdcdc 75%),linear-gradient(-45deg,transparent 75%,#dcdcdc 75%);
  background-size:18px 18px;
  background-position:0 0,0 9px,9px -9px,-9px 0;
}
.bgr-stage canvas{max-width:100%;max-height:100%;display:block;image-rendering:auto}
.bgr-stage.picking{cursor:crosshair}
.bgr-stage.busy{opacity:.5}
.bgr-swatch{width:26px;height:26px;border-radius:7px;border:1px solid var(--line);flex:none}
.bgr-key{display:flex;align-items:center;gap:9px}
.bgr-key small{color:var(--text-mute);font-size:11.5px;line-height:1.4}
.bgr-range{display:flex;align-items:center;gap:9px}
.bgr-range input[type=range]{flex:1;min-width:0}
.bgr-range b{font-variant-numeric:tabular-nums;font-size:12px;color:var(--text-dim);min-width:30px;text-align:end}
@media (pointer:coarse){ .bgr-swatch{width:36px;height:36px} }
`;
  document.head.appendChild(style);
}

/** แถบเลื่อนพร้อมตัวเลขกำกับ — ‼️ ต้องเห็นค่าปัจจุบัน ไม่งั้นปรับแล้วจำไม่ได้ว่าเคยอยู่ตรงไหน */
function slider(labelText, min, max, value, hint, onInput) {
  const out = el("b", {}, String(value));
  const r = el("input", { type: "range", min, max, value,
    oninput: () => { out.textContent = r.value; onInput(+r.value); } });
  const node = field(labelText, el("div", { class: "bgr-range" }, [r, out]), hint);
  return Object.assign(node, { get value() { return +r.value; },
                               set value(v) { r.value = v; out.textContent = r.value; } });
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * แผนที่ "ระดับกระดาษ" ของแต่ละจุด — ใช้ประมาณว่าพื้นหลังตรงนั้นสว่างแค่ไหน
 *
 * ‼️ ครั้งแรกใช้ค่าเฉลี่ยในละแวก (ย่อรูปแล้วเบลอ) ซึ่งใช้ได้ดีกับหมึกบาง ๆ
 *    แต่พังกับวัตถุใหญ่ วัดจริงกับโลโก้ที่กินพื้นที่ 16% -> หมึกหายไป 84.7 จาก 255
 *    เพราะค่าเฉลี่ยรอบจุดกลางวัตถุกลายเป็นสีของวัตถุเอง ระบบเลยคิดว่าตรงนั้นคือพื้นหลัง
 * ‼️ แก้ด้วยการใช้ **ค่าสว่างสูงสุดในละแวก** แทนค่าเฉลี่ย
 *    เพราะกระดาษคือส่วนที่สว่างที่สุดเสมอ ต่อให้มีวัตถุใหญ่ทับอยู่ก็ยังหาเจอ
 *    วัดครบ 4 รูปแล้ว: ลายเซ็น ตราประทับ โลโก้ ได้ พื้นหลังค้าง 0.0 หมึกหาย 0.0 ทั้งสามตัว
 *
 * ทำงานบนรูปย่อด้านยาว 48px เพราะแสงที่ไม่เท่ากันเป็นความถี่ต่ำ
 * รูป 12 ล้านพิกเซลจึงไม่ต้องรอคำนวณทั้งรูป
 */
function illumination(src, w, h) {
  const k = 48 / Math.max(w, h);
  const tw = Math.max(3, Math.round(w * k)), th = Math.max(3, Math.round(h * k));
  const small = document.createElement("canvas");
  small.width = tw; small.height = th;
  const sc = small.getContext("2d", { willReadFrequently: true });
  sc.imageSmoothingEnabled = true; sc.imageSmoothingQuality = "high";
  sc.drawImage(src, 0, 0, tw, th);
  const im = sc.getImageData(0, 0, tw, th), d = im.data;

  const L = new Float32Array(tw * th);
  for (let i = 0, p = 0; p < L.length; i += 4, p++) L[p] = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];

  const R = 2;                                  // ละแวก 5x5 บนรูปย่อ = กว้างราว 20% ของรูปจริง
  const M = new Float32Array(tw * th);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      let m = 0;
      for (let dy = -R; dy <= R; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= th) continue;
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= tw) continue;
          const v = L[yy * tw + xx]; if (v > m) m = v;
        }
      }
      M[y * tw + x] = m;
    }
  }
  // เกลี่ยให้นุ่มด้วยกล่อง 3x3 สองรอบ ไม่งั้นขอบของละแวกจะกลายเป็นขั้นบันไดตอนขยายกลับ
  const tmp = new Float32Array(tw * th);
  const boxPass = (a, b) => {
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= th) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= tw) continue;
          sum += a[yy * tw + xx]; n++;
        }
      }
      b[y * tw + x] = sum / n;
    }
  };
  boxPass(M, tmp); boxPass(tmp, M);

  for (let i = 0, p = 0; p < M.length; i += 4, p++) {
    const v = M[p] < 1 ? 1 : M[p];
    d[i] = d[i+1] = d[i+2] = v; d[i+3] = 255;
  }
  sc.putImageData(im, 0, 0);

  const big = document.createElement("canvas");
  big.width = w; big.height = h;
  const bc = big.getContext("2d", { willReadFrequently: true });
  bc.imageSmoothingEnabled = true; bc.imageSmoothingQuality = "high";
  bc.drawImage(small, 0, 0, w, h);
  const out = bc.getImageData(0, 0, w, h).data;
  small.width = small.height = big.width = big.height = 0;
  return out;
}

/** สีพื้นหลังที่เดาจากขอบภาพ — ใช้ค่ามัธยฐาน ไม่ใช่ค่าเฉลี่ย เพราะถ้ามีวัตถุล้ำมาที่ขอบ
 *  ค่าเฉลี่ยจะถูกดึงไป แต่มัธยฐานยังอยู่ที่สีพื้นตราบใดที่วัตถุกินขอบไม่เกินครึ่ง */
function guessKey(d, w, h) {
  const rs = [], gs = [], bs = [];
  const step = Math.max(1, Math.round((w + h) / 600));
  const push = (x, y) => { const i = (y * w + x) * 4; rs.push(d[i]); gs.push(d[i+1]); bs.push(d[i+2]); };
  for (let x = 0; x < w; x += step) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y += step) { push(0, y); push(w - 1, y); }
  const mid = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1] || 0; };
  return [mid(rs), mid(gs), mid(bs)];
}

/**
 * เดาว่ารูปนี้ควรใช้โหมดไหน
 *
 * ‼️ โหมดหมึกตั้งอยู่บนสมมติฐานเดียวคือ "ของที่ต้องการเข้มกว่ากระดาษ"
 *    ถ้าของที่ต้องการมีส่วนสว่างพอ ๆ กับพื้นหลัง (เช่นหน้าจอขาวของสินค้า บนพื้นเทา)
 *    โหมดหมึกจะทำให้ส่วนนั้นใสไปด้วย กลายเป็นรูโบ๋กลางวัตถุ
 *    วัดจริง: รูปสินค้าในโหมดหมึก เนื้อหายไป 91 จาก 255 ส่วนโหมดคีย์สีตรงเฉลย 99.8%
 * ‼️ จึงวัดตรงสาเหตุ: ในบริเวณที่สีต่างจากพื้นหลัง มีกี่ส่วนที่ "ไม่ได้เข้มกว่าพื้น"
 *    เกิน 15% เมื่อไหร่ = โหมดหมึกจะเจาะรู ให้ใช้โหมดคีย์สีแทน
 * ‼️ เกณฑ์แรกที่เขียนไว้ดูแค่ "เหลือเนื้อไหม" ซึ่งพลิกไปมาทุกครั้งที่แก้วิธีประมาณพื้นหลัง
 *    เพราะมันวัดอาการ ไม่ได้วัดสาเหตุ
 */
function autoMode(d, w, h) {
  const key = guessKey(d, w, h);
  const keyL = 0.299 * key[0] + 0.587 * key[1] + 0.114 * key[2];
  if (keyL < 170) return "key";          // พื้นหลังไม่สว่าง = ไม่ใช่กระดาษแน่นอน
  let subject = 0, notDarker = 0;
  for (let i = 0; i < d.length; i += 16) {   // สุ่มทุก 4 พิกเซล พอสำหรับหาสัดส่วนคร่าว ๆ
    const dr = d[i] - key[0], dg = d[i+1] - key[1], db = d[i+2] - key[2];
    if (dr * dr + dg * dg + db * db < 46 * 46) continue;     // ใกล้สีพื้น = ไม่ใช่ของที่ต้องการ
    subject++;
    if (0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2] >= keyL - 12) notDarker++;
  }
  if (subject < 20) return "ink";        // แทบไม่มีอะไรต่างจากพื้น เดาเป็นเอกสารไว้ก่อน
  return notDarker / subject > 0.15 ? "key" : "ink";
}

/** ลบพื้นหลังลงบน ImageData ตรง ๆ (แก้ช่องอัลฟาอย่างเดียว สี RGB เดิมไม่ถูกแตะ) */
function removeBg(img, w, h, cfg, illum) {
  const d = img.data;
  if (cfg.mode === "ink") {
    const lo = cfg.lo, hi = Math.max(cfg.hi, cfg.lo + 1), span = hi - lo;
    for (let i = 0; i < d.length; i += 4) {
      const L = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
      const B = 0.299 * illum[i] + 0.587 * illum[i+1] + 0.114 * illum[i+2];
      // หารด้วยแสงพื้นหลัง = ตัดเงาและแสงที่ไม่เท่ากันทิ้ง เหลือแต่ "เข้มกว่ากระดาษรอบ ๆ แค่ไหน"
      const ratio = 255 - (L / (B < 1 ? 1 : B)) * 255;
      d[i + 3] = clamp255(((ratio - lo) / span) * 255);
    }
  } else {
    const [kr, kg, kb] = cfg.key;
    const tol = cfg.tol, soft = Math.max(cfg.soft, 1);
    for (let i = 0; i < d.length; i += 4) {
      const dr = d[i] - kr, dg = d[i+1] - kg, db = d[i+2] - kb;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      d[i + 3] = clamp255(((dist - tol) / soft) * 255);
    }
  }
  return img;
}

export function mount(tool) {
  let files = [];
  let active = null;           // ไฟล์ที่กำลังดูตัวอย่าง
  let bitmap = null;           // ImageBitmap ของไฟล์ที่ดูอยู่
  let baseData = null;         // ImageData ต้นฉบับขนาดตัวอย่าง (ไม่ถูกแก้ ใช้ก๊อปปี้ทุกครั้ง)
  let illumData = null;        // แผนที่แสงของขนาดตัวอย่าง
  let previewW = 0, previewH = 0;
  let queued = false;

  const st = statusBar();
  const view = el("canvas", {});
  const stage = el("div", { class: "bgr-stage" }, [view]);

  // ── แผงซ้าย: ไฟล์
  const dz = dropzone({
    accept: "image/*", expect: ["image"], thumbs: true,
    expectLabel: tr("ไฟล์รูปภาพ", "an image file"),
    hint: tr("ลากรูปมาวาง หรือคลิกเพื่อเลือก", "Drop images here, or click to choose"),
    onChange: (next) => {
      files = next;
      if (!files.length) { active = null; ws.showCanvas(false); st.clear(); return; }
      if (!files.includes(active)) { active = files[0]; loadActive(); }
    },
  });

  // ── แผงขวา: การตั้งค่า
  const modeSel = segmented([
    ["ink", tr("หมึกบนกระดาษ", "Ink on paper")],
    ["key", tr("วัตถุบนพื้นสีเดียว", "Object on plain background")],
  ], "ink");
  let modeTouched = false;   // ผู้ใช้กดเปลี่ยนเองแล้ว = เลิกเดาให้
  const autoNote = el("div", { class: "note", hidden: true });
  modeSel.onchange = () => { modeTouched = true; autoNote.hidden = true; syncMode(); schedule(); };

  const loS = slider(tr("เริ่มนับว่าเป็นหมึกที่ความเข้ม", "Count as ink from"),
    0, 80, 18, tr("ยิ่งน้อยยิ่งเก็บรอยจาง แต่ก็เก็บฝ้ากระดาษมาด้วย",
                  "Lower keeps faint strokes, but also picks up paper grain"), () => schedule());
  const hiS = slider(tr("ความเข้มที่ถือว่าทึบเต็ม", "Fully opaque at"),
    30, 220, 110, tr("ยิ่งน้อยเส้นยิ่งทึบและหนาขึ้น", "Lower makes strokes darker and thicker"), () => schedule());

  const swatch = el("span", { class: "bgr-swatch" });
  const pickBtn = button(tr("เลือกสีจากรูป", "Pick from image"), { ghost: true,
    onclick: () => { stage.classList.toggle("picking"); } });
  const keyRow = field(tr("สีพื้นหลัง", "Background colour"),
    el("div", { class: "bgr-key" }, [swatch, pickBtn]),
    tr("เดาจากขอบรูปให้อัตโนมัติ กดปุ่มแล้วแตะในรูปเพื่อเลือกเอง",
       "Guessed from the image edges. Tap the button, then tap the image to choose"));
  const tolS = slider(tr("ความคลาดเคลื่อนของสีที่ยอมรับ", "Colour tolerance"),
    4, 140, 46, tr("ยิ่งมากยิ่งลบพื้นที่สีเพี้ยนไปได้ แต่เสี่ยงกินเนื้อวัตถุ",
                   "Higher removes more shades, but may eat into the subject"), () => schedule());
  const softS = slider(tr("ความนุ่มของขอบ", "Edge softness"),
    1, 90, 22, tr("ขอบนุ่มขึ้นทำให้ไม่เห็นรอยหยัก", "Softer edges hide jagged pixels"), () => schedule());

  const outSel = select([
    ["png", tr("พื้นหลังโปร่งใส (PNG)", "Transparent (PNG)")],
    ["white", tr("พื้นหลังสีขาว", "White background")],
    ["custom", tr("เลือกสีพื้นหลังเอง", "Pick a background colour")],
  ], "png");
  const outColor = el("input", { type: "color", value: "#ffffff" });
  const outColorRow = field(tr("สีพื้นหลังใหม่", "New background colour"), outColor, "");
  outSel.onchange = () => { outColorRow.hidden = outSel.value !== "custom"; };
  outColorRow.hidden = true;

  const inkGroup = el("div", {}, [
    el("h3", {}, tr("ความเข้มของหมึก", "Ink strength")), loS, hiS,
  ]);
  const keyGroup = el("div", {}, [
    el("h3", {}, tr("สีพื้นหลังที่จะลบ", "Background to remove")), keyRow, tolS, softS,
  ]);
  const rightBody = el("div", { class: "bgr-right" }, [
    el("div", {}, [
      el("h3", {}, tr("รูปแบบของรูป", "What kind of image")), modeSel,
      el("div", { class: "note" },
        tr("ลายเซ็น ตราประทับ ลายมือ เลือกหมึกบนกระดาษ  โลโก้หรือสินค้าบนพื้นเรียบ เลือกวัตถุบนพื้นสีเดียว",
           "Signatures, stamps and handwriting use ink mode. Logos and products on a plain backdrop use object mode")),
      autoNote,
    ]),
    inkGroup, keyGroup,
    el("div", {}, [el("h3", {}, tr("ผลลัพธ์", "Output")), field("", outSel, ""), outColorRow]),
  ]);

  function syncMode() {
    const ink = modeSel.value === "ink";
    inkGroup.hidden = !ink;
    keyGroup.hidden = ink;
    if (!ink) stage.classList.remove("picking");
  }
  syncMode();

  // ── โหลดไฟล์ที่เลือกมาทำภาพตัวอย่าง
  async function loadActive() {
    if (!active) return;
    try {
      bitmap?.close?.();
      bitmap = await decodeImage(active, { imageOrientation: "from-image" });
      const k = Math.min(1, MAX_PREVIEW / Math.max(bitmap.width, bitmap.height));
      previewW = Math.max(1, Math.round(bitmap.width * k));
      previewH = Math.max(1, Math.round(bitmap.height * k));
      view.width = previewW; view.height = previewH;
      const ctx = view.getContext("2d", { willReadFrequently: true });
      ctx.clearRect(0, 0, previewW, previewH);
      ctx.drawImage(bitmap, 0, 0, previewW, previewH);
      baseData = ctx.getImageData(0, 0, previewW, previewH);
      illumData = illumination(view, previewW, previewH);
      if (!keyRow.dataset.picked) setKey(guessKey(baseData.data, previewW, previewH));
      // เดาโหมดให้เฉพาะไฟล์แรก หลังจากนั้นเคารพสิ่งที่ผู้ใช้เลือกไว้
      if (!modeTouched) {
        modeSel.value = autoMode(baseData.data, previewW, previewH);
        syncMode();
        autoNote.hidden = false;
        autoNote.textContent = modeSel.value === "ink"
          ? tr("เดาให้แล้วว่าเป็นหมึกบนกระดาษ ถ้าไม่ใช่กดเปลี่ยนด้านบนได้",
               "Guessed this is ink on paper. Switch above if that is wrong")
          : tr("เดาให้แล้วว่าเป็นวัตถุบนพื้นสีเดียว ถ้าไม่ใช่กดเปลี่ยนด้านบนได้",
               "Guessed this is an object on a plain background. Switch above if that is wrong");
      }
      ws.showCanvas(true);
      render();
    } catch {
      st.err(tr("เปิดรูปนี้ไม่ได้ ลองไฟล์อื่น", "Could not open this image. Try another file"));
    }
  }

  function setKey(rgb) {
    keyRow.dataset.key = rgb.join(",");
    swatch.style.background = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  }
  const currentKey = () => (keyRow.dataset.key || "255,255,255").split(",").map(Number);

  const cfg = () => ({
    mode: modeSel.value, lo: loS.value, hi: hiS.value,
    key: currentKey(), tol: tolS.value, soft: softS.value,
  });

  /* ‼️ หน่วงด้วยเฟรมถัดไป ไม่ใช่ตัวจับเวลา — ลากแถบเลื่อนยิง input รัวมาก
     ถ้าคำนวณทุกครั้งจะค้าง ถ้าใช้ setTimeout จะรู้สึกหน่วงตามหลังนิ้ว */
  function schedule() {
    if (queued || !baseData) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); });
  }

  function render() {
    if (!baseData) return;
    const ctx = view.getContext("2d", { willReadFrequently: true });
    const work = new ImageData(new Uint8ClampedArray(baseData.data), previewW, previewH);
    removeBg(work, previewW, previewH, cfg(), illumData);
    ctx.putImageData(work, 0, 0);
  }

  // แตะในรูปเพื่อเลือกสีพื้นหลังเอง
  stage.addEventListener("click", (e) => {
    if (!stage.classList.contains("picking") || !baseData) return;
    const r = view.getBoundingClientRect();
    const x = Math.round((e.clientX - r.left) / r.width * previewW);
    const y = Math.round((e.clientY - r.top) / r.height * previewH);
    if (x < 0 || y < 0 || x >= previewW || y >= previewH) return;
    const i = (y * previewW + x) * 4;
    setKey([baseData.data[i], baseData.data[i+1], baseData.data[i+2]]);
    keyRow.dataset.picked = "1";      // ผู้ใช้เลือกเอง = ใช้สีนี้กับทุกไฟล์ในชุด
    stage.classList.remove("picking");
    schedule();
  });

  // ── ทำจริงทั้งชุดที่ความละเอียดเต็ม
  const results = el("div", {});
  const go = button(tr("ลบพื้นหลัง", "Remove background"), { onclick: () => run() });

  async function processOne(file) {
    const bmp = await decodeImage(file, { imageOrientation: "from-image" });
    const w = bmp.width, h = bmp.height;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    const conf = cfg();
    // ‼️ โหมดพื้นสีต้องเดาสีจากรูปเต็มของไฟล์นั้น ๆ ไม่ใช่ใช้สีของไฟล์ที่กำลังดูตัวอย่างอยู่
    //    (ยกเว้นผู้ใช้เลือกสีเอง ซึ่งถือว่าตั้งใจให้ใช้สีเดียวกันทั้งชุด)
    if (conf.mode === "key" && !keyRow.dataset.picked && file !== active) {
      conf.key = guessKey(img.data, w, h);
    }
    const illum = conf.mode === "ink" ? illumination(c, w, h) : null;
    removeBg(img, w, h, conf, illum);
    ctx.putImageData(img, 0, 0);

    let outBlob;
    if (outSel.value === "png") {
      outBlob = await new Promise((r) => c.toBlob(r, "image/png"));
    } else {
      // รองพื้นสีที่เลือกไว้ใต้ภาพ แล้วค่อยวาดทับ
      const flat = document.createElement("canvas");
      flat.width = w; flat.height = h;
      const fx = flat.getContext("2d");
      fx.fillStyle = outSel.value === "white" ? "#ffffff" : outColor.value;
      fx.fillRect(0, 0, w, h);
      fx.drawImage(c, 0, 0);
      outBlob = await new Promise((r) => flat.toBlob(r, "image/png"));
      flat.width = flat.height = 0;
    }
    bmp.close?.();
    c.width = c.height = 0;
    return { name: `${stripExt(file.name)}.png`, blob: outBlob, from: file.size };
  }

  async function run() {
    if (!files.length) { st.err(tr("ยังไม่ได้เลือกรูป", "No image chosen yet")); return; }
    go.disabled = true; results.innerHTML = ""; stage.classList.add("busy");
    st.begin();
    const made = [], failed = [];
    try {
      for (let i = 0; i < files.length; i++) {
        // ‼️ งานหลายรูปต้องหยุดกลางคันได้ ลากมา 50 รูปแล้วกดผิดจะได้ไม่ต้องรอจนจบ
        if (st.cancelled) break;
        st.info(tr(`กำลังลบพื้นหลัง ${i + 1} จาก ${files.length}`, `Removing background ${i + 1} of ${files.length}`));
        st.progress(((i + 1) / files.length) * 100);   // ‼️ รับเป็นเปอร์เซ็นต์ ไม่ใช่เศษส่วน
        try { made.push(await processOne(files[i])); }
        catch (e) { failed.push({ name: files[i].name, why: e.message }); }
        await yieldToBrowser();
      }
      st.progress(null);
      if (!made.length) throw new Error(tr("ลบพื้นหลังไม่สำเร็จ", "Could not remove the background"));
      st.ok(tr(`เสร็จแล้ว ${made.length} รูป` + (failed.length ? `, ข้าม ${failed.length} รูป` : ""),
               `Done, ${pl(made.length, "image", "images")}` + (failed.length ? `, skipped ${failed.length}` : "")));
      made.forEach((m) => results.appendChild(el("div", { class: "result" }, [
        el("div", { class: "r-name" }, [el("strong", {}, m.name),
          el("small", {}, `${fmtBytes(m.from)} เป็น ${fmtBytes(m.blob.size)}`)]),
        button(tr("ดาวน์โหลด", "Download"), { icon: "download",
          label: tr(`ดาวน์โหลด ${m.name}`, `Download ${m.name}`), onclick: () => download(m.blob, m.name) }),
      ])));
      if (made.length > 1) results.prepend(el("div", { class: "actions" }, [
        button(tr("โหลดทั้งหมด (ZIP)", "Download all (ZIP)"), { icon: "zip", onclick: async () => {
          const zip = new JSZip();
          made.forEach((m) => zip.file(m.name, m.blob));
          download(await zip.generateAsync({ type: "blob" }), tr("รูปที่ลบพื้นหลังแล้ว.zip", "background-removed.zip"));
        } }),
      ]));
    } catch (e) {
      st.progress(null);
      st.err(tr("ลบพื้นหลังไม่สำเร็จ: ", "Could not remove the background: ") + e.message);
    } finally { st.end(); go.disabled = false; stage.classList.remove("busy"); }
  }

  const ws = workspace(tool, {
    left: { title: tr("ไฟล์รูปภาพ", "Image files"), node: el("div", { class: "bgr-left" }, [dz.container]) },
    center: { node: stage, empty: tr("ยังไม่มีรูป เลือกไฟล์เพื่อดูตัวอย่าง", "No image yet. Choose a file to preview") },
    right: { title: tr("ปรับแต่ง", "Adjust"), node: rightBody },
    footer: [st.node, go],
  });
  ws.showCanvas(false);
  ws.body.appendChild(results);
  ws.body.appendChild(el("div", { class: "note" },
    tr("ลายเซ็นที่ถ่ายบนกระดาษขาว ลบพื้นหลังแล้วเอาไปวางบน PDF ได้เลยด้วยเครื่องมือเซ็นชื่อบน PDF",
       "A signature photographed on white paper can go straight onto a PDF with the signing tool")));

  registerCleanup(ws.wrap, {
    sleep: () => { bitmap?.close?.(); bitmap = null; baseData = null; illumData = null; },
    hasFiles: () => files.length > 0,
  });
  return ws.wrap;
}
