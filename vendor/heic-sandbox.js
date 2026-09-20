/* ตัวถอด HEIC ที่ถูกขังไว้ในหน้าของตัวเอง — ดู heic-sandbox.html ว่าทำไม
   ‼️ หน้านี้ไม่มีสิทธิ์ต่อเน็ต (default-src 'none') ไบต์ที่รับมาจึงออกไปไหนไม่ได้
   ‼️ รับ wasm มาจากหน้าแม่ ไม่ดึงเอง เพราะดึงเองไม่ได้และไม่ควรได้ */
let mod = null;

async function ready(wasmBinary) {
  if (!mod) mod = await self.libheif({ wasmBinary });
  return mod;
}

function decode(m, bytes) {
  const imgs = new m.HeifDecoder().decode(bytes);
  if (!imgs || !imgs.length) throw new Error("ไม่พบภาพในไฟล์");
  const img = imgs[0];
  const w = img.get_width(), h = img.get_height();
  const out = new ImageData(w, h);
  return new Promise((res, rej) => {
    img.display(out, (d) => {
      for (const i of imgs) { if (i.free) i.free(); }
      // ‼️ display คืน null เมื่อถอดไม่สำเร็จ ต้องเช็ค ไม่งั้นได้ภาพดำทั้งใบแบบเงียบ ๆ
      d ? res({ w, h, buf: out.data.buffer }) : rej(new Error("ถอดภาพไม่สำเร็จ"));
    });
  });
}

addEventListener("message", async (e) => {
  const { id, bytes, wasmBinary } = e.data || {};
  const reply = (msg, transfer) => e.source.postMessage({ id, ...msg }, "*", transfer || []);
  try {
    const m = await ready(wasmBinary);
    const r = await decode(m, new Uint8Array(bytes));
    reply({ ok: true, w: r.w, h: r.h, buf: r.buf }, [r.buf]);
  } catch (err) {
    reply({ ok: false, err: String((err && err.message) || err) });
  }
});

// บอกหน้าแม่ว่าพร้อมรับงานแล้ว
if (parent !== self) parent.postMessage({ ready: true, from: "heic-sandbox" }, "*");
