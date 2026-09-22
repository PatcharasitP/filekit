// ‼️ สัญญาไฟล์กลาง: FlowKit (repo flowkit อีกเว็บในโดเมนเดียวกัน) import ไฟล์นี้ตรง ๆ ผ่าน ../FlowKit/src/shared.js
//    export ที่ FlowKit ใช้ห้ามเปลี่ยนความหมายหรือตัดทิ้ง (เพิ่มได้ , จะตัดต้องให้ FlowKit ย้ายก่อน) แก้แล้วรัน tests/runp.sh contract
import { el } from "./dom.js";
import { tr } from "./i18n.js";

/* ── เบราว์เซอร์ในแอป (in-app browser) ────────────────────────────────────
 * ‼️ ที่มา 20/09/2026 พี่ปอนด์เปิด FileKit จากลิงก์ในแอป LINE บนมือถือ
 *   ย่อรูปสำเร็จ กดดาวน์โหลด แล้ว LINE ขึ้นข้อความของตัวเองว่า
 *   "ไม่สามารถดาวน์โหลดไฟล์ได้ โปรดดาวน์โหลดด้วยเบราว์เซอร์อื่น"
 *   งานที่ทำมาทั้งหมดจึงสูญเปล่า และผู้ใช้ไม่รู้ว่าต้องทำยังไงต่อ
 *
 * ‼️ ทำไมมันบล็อก: WebView ในแอปแชทไม่ได้ต่อกับตัวจัดการดาวน์โหลดของระบบ
 *   ลิงก์ <a download> กับ blob: จึงตายทั้งคู่ ไม่ใช่ความผิดของหน้าเว็บ
 *   แก้ที่ฝั่งเราไม่ได้ตรง ๆ แต่มีทางอ้อมที่ใช้ได้จริง 2 ทาง
 *
 *   ① Web Share API ระดับไฟล์ — เรียก share sheet ของระบบ ส่งไฟล์ออกไปได้เลย
 *      เซฟลงไฟล์ก็ได้ ส่งเข้าแชทก็ได้ ไม่ต้องผ่านตัวจัดการดาวน์โหลด
 *      ‼️ ใช้เฉพาะตอนอยู่ในแอปเท่านั้น บนเบราว์เซอร์ปกติห้ามแตะ
 *         เพราะการดาวน์โหลดปกติดีกว่าอยู่แล้ว และ Chrome เดสก์ท็อปบางรุ่นก็มี share
 *         ถ้าเผลอใช้จะกลายเป็นเปลี่ยนพฤติกรรมของคนที่ไม่ได้มีปัญหา
 *   ② เปิดในเบราว์เซอร์จริง — LINE รองรับพารามิเตอร์ `openExternalBrowser=1`
 *      อย่างเป็นทางการ ใส่ต่อท้าย URL แล้วมันจะเด้งออกไป Chrome/Safari ให้
 *      แอปอื่นไม่มีพารามิเตอร์นี้ ต้องบอกผู้ใช้ให้กดเมนูเปิดในเบราว์เซอร์เอง
 *
 * ‼️ ตรวจจากข้อความบอกตัวตนของเบราว์เซอร์ (user agent) ซึ่งเชื่อได้แค่ "พอประมาณ"
 *   จึงใช้ทำได้แค่ "เตือนกับเสนอทางเลือก" เท่านั้น ห้ามใช้ตัดสินใจอะไรที่ย้อนกลับไม่ได้
 */

const SIGNS = [
  // LINE ใส่ Line/<เวอร์ชัน> ไว้เสมอ และใส่ LIFF เพิ่มเมื่อเปิดผ่าน LIFF
  [/\bLine\//i, "LINE", true],
  [/FBAN|FBAV|FB_IAB|FB4A/i, "Facebook", false],
  [/Instagram/i, "Instagram", false],
  [/\bMessenger\b/i, "Messenger", false],
  [/BytedanceWebview|musical_ly|TikTok/i, "TikTok", false],
];

/** อยู่ในเบราว์เซอร์ของแอปไหน คืน null ถ้าเป็นเบราว์เซอร์ปกติ */
export function inApp(ua = navigator.userAgent) {
  for (const [re, name, canEscape] of SIGNS) if (re.test(ua)) return { name, canEscape };
  return null;
}

/** ลิงก์ที่สั่งให้ LINE เปิดหน้านี้ด้วยเบราว์เซอร์จริง */
export function escapeUrl(href = location.href) {
  const u = new URL(href);
  u.searchParams.set("openExternalBrowser", "1");
  return u.toString();
}

/**
 * บันทึกไฟล์ให้ผู้ใช้ — ในแอปแชทจะลองส่งผ่าน share sheet ของระบบก่อน
 * @returns {Promise<"share"|"download"|"cancel">} ทางที่ใช้จริง
 * ‼️ คืนค่าบอกว่าไปทางไหน เพื่อให้ผู้เรียกพูดกับผู้ใช้ได้ตรงกับสิ่งที่เกิดขึ้นจริง
 */
export async function saveViaShare(blob, filename) {
  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
  if (!navigator.canShare || !navigator.canShare({ files: [file] })) return "download";
  try {
    await navigator.share({ files: [file] });
    return "share";
  } catch (e) {
    // ผู้ใช้กดยกเลิกเอง ไม่ใช่ความผิดพลาด ห้ามเด้งดาวน์โหลดซ้ำให้ตกใจ
    if (e && e.name === "AbortError") return "cancel";
    return "download";
  }
}

/** แถบเตือนบาง ๆ ใต้หัวเว็บ โผล่เฉพาะตอนเปิดในแอปแชทเท่านั้น */
export function inAppBanner() {
  const app = inApp();
  if (!app) return null;
  const openBtn = app.canEscape
    ? el("a", { class: "ia-go", href: escapeUrl() },
         tr("เปิดในเบราว์เซอร์", "Open in browser"))
    : el("span", { class: "ia-how" },
         tr("กดเมนู ⋮ แล้วเลือกเปิดในเบราว์เซอร์", "Use the ⋮ menu, then open in browser"));
  return el("div", { class: "ia-bar", role: "status" }, [
    el("span", {}, tr(`เปิดอยู่ในแอป ${app.name} ซึ่งมักบันทึกไฟล์ลงเครื่องไม่ได้`,
                      `You are inside the ${app.name} app, which usually blocks saving files`)),
    openBtn,
  ]);
}
