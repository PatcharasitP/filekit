// worker ของ pngopt.js: โหลด OxiPNG (WASM) ครั้งเดียว แล้วบีบ PNG ทีละไฟล์ตามลำดับที่ส่งมา
import init, { optimise } from "../vendor/oxipng/squoosh_oxipng.js";

const ready = init();   // ไม่ส่งอะไร glue หา squoosh_oxipng_bg.wasm ข้างตัวเองเอง
ready.catch(() => {});  // โหลดไม่ได้ไม่ต้องขึ้น error ลอย แต่ละงานจะตอบกลับว่าบีบไม่ได้แทน

self.onmessage = async ({ data: { id, buf } }) => {
  try {
    await ready;
    // ระดับ 2 = ค่าตั้งต้นของ Squoosh, ไม่ interlace, ไม่แตะสีของพิกเซลที่โปร่งใส (พิกเซลเท่าเดิมทุกค่า)
    const out = optimise(new Uint8Array(buf), 2, false, false);
    self.postMessage({ id, out: out.buffer }, [out.buffer]);
  } catch (e) {
    self.postMessage({ id, err: String(e) });
  }
};
