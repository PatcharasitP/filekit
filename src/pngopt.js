// บีบ PNG แบบไม่เสียคุณภาพด้วย OxiPNG ตัวเดียวกับ Squoosh (ผ่าน jSquash) พิกเซลเท่าเดิมทุกค่า
// วัดจริง 24/09/2026: PNG จาก canvas เล็กลง 18% (รูปพื้นใส) ถึง 56% (สไลด์) ใช้ 0.4 ถึง 1.1 วินาทีต่อรูป
// หลักฐาน .claude/evidence/2026-09-24-squoosh-vs-filekit ในโฟลเดอร์งาน
// ทำใน worker กันหน้าค้างระหว่างบีบ และถ้าโหลดตัวบีบไม่ได้ (ออฟไลน์ครั้งแรก, เบราว์เซอร์เก่า) คืนไฟล์เดิม ใช้งานต่อได้เสมอ
// ‼️ ห้ามเพิ่ม Reduce palette แบบ Squoosh ตัวนั้นใช้ libimagequant ซึ่งเป็น GPL v3 ขัดกับที่ FileKit สงวนสิทธิ์
let worker = null;
let broken = false;
let seq = 0;
const waiting = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./pngopt-worker.js", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }) => {
    const done = waiting.get(data.id);
    waiting.delete(data.id);
    done?.(data.out || null);
  };
  worker.onerror = () => {   // โหลดตัว worker ไม่ได้ เลิกลองในรอบนี้ ทุกงานที่รออยู่ได้ไฟล์เดิมคืน
    broken = true;
    for (const done of waiting.values()) done(null);
    waiting.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

/** คืน PNG ที่เล็กกว่าเดิมถ้าบีบได้ ไม่งั้นคืนไฟล์เดิม ไม่ throw */
export async function optimisePng(blob) {
  if (broken || !blob || blob.type !== "image/png" || typeof Worker === "undefined") return blob;
  try {
    const buf = await blob.arrayBuffer();
    const out = await new Promise((resolve) => {
      const id = ++seq;
      waiting.set(id, resolve);
      getWorker().postMessage({ id, buf }, [buf]);
    });
    return out && out.byteLength < blob.size ? new Blob([out], { type: "image/png" }) : blob;
  } catch {
    return blob;
  }
}
