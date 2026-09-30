// ─────────────────────────────────────────────────────────────────────────────
// เขียนกลับทับไฟล์เดิมที่ผู้ใช้เปิดเข้ามา โดยไม่ต้องดาวน์โหลด (File System Access API ของ Chrome และ Edge)
//
// ‼️ วิธีได้ "มือจับไฟล์" มี 2 ทาง
//    ① ลากไฟล์มาวาง: ต้องเรียก getAsFileSystemHandle() ระหว่างที่เหตุการณ์ drop ยังทำงานอยู่เท่านั้น
//       (พ้นจากนั้นข้อมูลใน dataTransfer ถูกล้าง) จึงดักที่ระดับ document ชั้น capture ก่อน dropzone
//       dropzone ของ FileKit รับ File เฉย ๆ ไม่รู้จักมือจับ เรา "จำ" มือจับไว้ด้วยชื่อ+ขนาด+เวลาแก้ไข
//    ② กดปุ่มเลือกไฟล์ผ่าน showOpenFilePicker ได้มือจับตรง ๆ
//
// ‼️ Excel ล็อกไฟล์ที่เปิดอยู่ (พิสูจน์แล้ว 30/09/2026 ด้วย Excel จริงเปิดไฟล์ค้างไว้ แล้วลองเขียนจากอีกโปรเซส)
//    เขียนทับตรง ๆ, เขียนไฟล์พักแล้วสลับทับ (แบบที่ createWritable ทำ), แม้แต่ลบ ถูกปฏิเสธหมด (Permission denied)
//    ไฟล์เดิมไม่เสียหาย ขนาดไม่เปลี่ยน แต่ปิดไฟล์ใน Excel แล้วเขียนได้ปกติ
//    จึงต้องบอกผู้ใช้ให้ปิดไฟล์ใน Excel ก่อน และมีทางออกเป็นดาวน์โหลดเสมอ
// ─────────────────────────────────────────────────────────────────────────────

const keyOf = (f) => `${f.name}|${f.size}|${f.lastModified}`;
const handles = new Map();          // คีย์ไฟล์ → Promise<FileSystemFileHandle | null>

/** เบราว์เซอร์นี้เขียนกลับไฟล์เดิมได้ไหม (Chrome/Edge บนคอม ที่เป็น https หรือ localhost) */
export const canWriteInPlace = () =>
  typeof window !== "undefined" && window.isSecureContext && typeof window.showOpenFilePicker === "function";

let watching = false;
/** เริ่มจำมือจับของไฟล์ที่ลากมาวาง เรียกครั้งเดียวตอนเครื่องมือเปิด (เรียกซ้ำไม่มีผล) */
export function watchDrops() {
  if (watching || typeof document === "undefined") return;
  watching = true;
  document.addEventListener("drop", (e) => {
    const items = e.dataTransfer && e.dataTransfer.items;
    if (!items) return;
    for (const it of items) {
      if (it.kind !== "file" || typeof it.getAsFileSystemHandle !== "function") continue;
      const f = it.getAsFile();
      if (!f) continue;
      // ‼️ ต้องเรียกตรงนี้เลย ห้ามมี await คั่นก่อน ไม่งั้นมือจับหายไปพร้อมกับ dataTransfer
      handles.set(keyOf(f), it.getAsFileSystemHandle().then((h) => (h && h.kind === "file" ? h : null), () => null));
    }
  }, true);
}

/** มือจับของไฟล์นี้ (ถ้าได้มาตอนลากวางหรือตอนเลือกด้วยตัวเลือกแก้ตรง) ไม่มี = null */
export async function handleOf(file) {
  const p = handles.get(keyOf(file));
  return p ? await p : null;
}

/** เปิดหน้าต่างเลือกไฟล์แบบได้มือจับ ผู้ใช้กดยกเลิก = null */
export async function pickWritable() {
  try {
    const [h] = await window.showOpenFilePicker({
      multiple: false,
      types: [{
        description: "Excel",
        accept: {
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
          "application/vnd.ms-excel.sheet.macroEnabled.12": [".xlsm"],
        },
      }],
    });
    const file = await h.getFile();
    handles.set(keyOf(file), Promise.resolve(h));
    return { handle: h, file };
  } catch (e) {
    if (e && e.name === "AbortError") return null;
    throw e;
  }
}

/** ขอสิทธิ์เขียน (ต้องเรียกจากการกดของผู้ใช้) คืน true ถ้าได้ */
export async function askWrite(handle) {
  const opt = { mode: "readwrite" };
  if (handle.queryPermission && (await handle.queryPermission(opt)) === "granted") return true;
  if (handle.requestPermission) return (await handle.requestPermission(opt)) === "granted";
  return true;
}

/** เขียนทับทั้งไฟล์ Chrome เขียนลงไฟล์พักก่อนแล้วสลับทับตอน close ถ้าล้มตรงไหน ไฟล์เดิมไม่ถูกแตะ */
export async function writeBack(handle, bytes) {
  const w = await handle.createWritable();
  try {
    await w.write(bytes);
    await w.close();
  } catch (e) {
    try { await w.abort(); } catch { /* ปิดไม่ได้แล้วก็ไม่เป็นไร */ }
    throw e;
  }
}
