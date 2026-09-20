import { tr } from "./i18n.js";

/* ── อ่านไฟล์รูปให้ได้ทุกชนิดที่ผู้ใช้มีจริง ────────────────────────────────
 * ‼️ ที่มา 20/09/2026 พี่ปอนด์ลองแปลงรูปจากมือถือแล้วขึ้นว่า "แปลงไม่สำเร็จ ตรวจว่าเป็นรูปจริง"
 *   ไฟล์ชื่อ 1000051522.heic คือรูปจาก iPhone ซึ่งเป็นรูปจริงทุกประการ
 *   ข้อความนั้นจึงโทษผู้ใช้ทั้งที่ความผิดอยู่ที่เรา และ .heic ก็อยู่ในรายการชนิดที่เรารับอยู่แล้ว
 *   = รับไฟล์เข้ามาแล้วทำไม่ได้ ซึ่งแย่กว่าไม่รับตั้งแต่แรก
 *
 * ‼️ ทำไมเบราว์เซอร์อ่านไม่ได้: HEIC ใช้ตัวบีบอัด HEVC ซึ่งติดสิทธิบัตร
 *   Chrome/Firefox จึงไม่ใส่มาให้ ส่วน Safari อ่านได้เพราะ Apple จ่ายค่าสิทธิ์อยู่แล้ว
 *   ‼️ จึงต้องลอง createImageBitmap ก่อนเสมอ คนใช้ Safari จะได้ไม่ต้องโหลดตัวถอด 960 KB ฟรี ๆ
 *
 * ‼️ ดูชนิดจากไบต์จริง ไม่ดูจากนามสกุล เพราะรูปจาก iPhone ที่ผ่านแอปแชทมา
 *   มักถูกเปลี่ยนชื่อเป็น .jpg ทั้งที่ข้างในยังเป็น HEIC อยู่
 */

/* ── ห้องขังของตัวถอด HEIC ────────────────────────────────────────────────
 * ‼️ libheif ใช้ Embind ซึ่งสร้างฟังก์ชันด้วย new Function จึงต้องการ 'unsafe-eval'
 *   ซึ่งทั้งเว็บของเราห้ามเด็ดขาด เพราะคำสัญญา "ไฟล์ไม่ออกจากเครื่องคุณ"
 *   พึ่ง CSP ที่เข้มเป็นด่านสุดท้าย การเปิด unsafe-eval ทั้งเว็บ = รื้อด่านนั้นทิ้งเพื่อฟีเจอร์เดียว
 *   จึงย้ายไปรันใน iframe ที่มี CSP ของตัวเอง `default-src 'none'` = ต่อเน็ตไม่ได้เลย
 *   ไบต์ที่ส่งเข้าไปจึงออกไปไหนไม่ได้ แล้วส่งภาพที่ถอดแล้วกลับมาทาง postMessage อย่างเดียว
 * ‼️ ส่ง wasm ให้เฉพาะครั้งแรก ครั้งต่อไปในห้องนั้นจำไว้แล้ว ไม่ต้องคัดลอก 877 KB ซ้ำทุกใบ */
let framePromise = null;
let wasmPromise = null;
let sentWasm = false;
let seq = 0;

const wasmBytes = () => (wasmPromise ||= fetch(new URL("../vendor/libheif.wasm", import.meta.url))
  .then((r) => { if (!r.ok) throw new Error("โหลดตัวถอด HEIC ไม่สำเร็จ"); return r.arrayBuffer(); })
  .catch((e) => { wasmPromise = null; throw e; }));

function sandbox() {
  if (framePromise) return framePromise;
  framePromise = new Promise((res, rej) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("tabindex", "-1");
    frame.title = "HEIC decoder";
    frame.style.cssText = "position:absolute;left:-9999px;width:0;height:0;border:0";
    const onReady = (e) => {
      if (e.source !== frame.contentWindow || !e.data || !e.data.ready) return;
      removeEventListener("message", onReady);
      res(frame);
    };
    addEventListener("message", onReady);
    const bail = setTimeout(() => {
      removeEventListener("message", onReady);
      rej(new Error(tr("ตัวถอดไฟล์ HEIC ไม่ตอบสนอง", "The HEIC decoder did not respond")));
    }, 25000);
    frame.addEventListener("load", () => clearTimeout(bail), { once: true });
    frame.src = new URL("../vendor/heic-sandbox.html", import.meta.url).toString();
    document.body.appendChild(frame);
  }).catch((e) => { framePromise = null; throw e; });
  return framePromise;
}

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis",
                             "hevm", "hevs", "mif1", "msf1"]);

/** ไฟล์นี้เป็นตระกูล HEIF ไหม ดูจาก 'ftyp' กับยี่ห้อใน 12 ไบต์แรก */
export async function isHeif(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (head.length < 12) return false;
    const at = (i, n) => String.fromCharCode(...head.slice(i, i + n));
    return at(4, 4) === "ftyp" && HEIF_BRANDS.has(at(8, 4).toLowerCase());
  } catch { return false; }
}

async function decodeHeif(file) {
  const [frame, bytes] = await Promise.all([sandbox(), file.arrayBuffer()]);
  const wasmBinary = sentWasm ? null : await wasmBytes();
  const id = ++seq;
  const bmp = await new Promise((res, rej) => {
    const onMsg = (e) => {
      if (e.source !== frame.contentWindow || !e.data || e.data.id !== id) return;
      removeEventListener("message", onMsg);
      if (!e.data.ok) {
        rej(new Error(tr("ไฟล์ HEIC นี้อ่านไม่ออก อาจเสียหายหรือถูกเข้ารหัสไว้",
                         "Could not read this HEIC file. It may be damaged or encrypted")));
        return;
      }
      const img = new ImageData(new Uint8ClampedArray(e.data.buf), e.data.w, e.data.h);
      createImageBitmap(img).then(res, rej);
    };
    addEventListener("message", onMsg);
    // ‼️ โอนกรรมสิทธิ์ไบต์ไฟล์ไปเลย ไม่ต้องคัดลอก รูปจากมือถือใบละหลายเมกะไบต์
    const payload = { id, bytes };
    const move = [bytes];
    if (wasmBinary) { payload.wasmBinary = wasmBinary; sentWasm = true; }
    frame.contentWindow.postMessage(payload, "*", move);
  });
  return bmp;
}

/**
 * อ่านไฟล์รูปเป็น ImageBitmap — ใช้แทน createImageBitmap ทุกที่ที่รับไฟล์จากผู้ใช้
 * @param {File|Blob} file
 * @param {object} [opts] ส่งต่อให้ createImageBitmap เช่น { imageOrientation: "from-image" }
 */
export async function decodeImage(file, opts) {
  try {
    return await createImageBitmap(file, opts);
  } catch (e) {
    if (!(await isHeif(file))) throw e;
    return decodeHeif(file);
  }
}
