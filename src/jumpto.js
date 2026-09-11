/* ── คลิกบนตัวอย่าง แล้วกระโดดไปช่องที่คุมมัน ─────────────────────────────
 * ปัญหาที่แก้: หน้าตั้งค่าที่มีช่องเยอะ คนไม่รู้ว่าช่องไหนคุมอะไร ต้องไล่ลองทีละช่อง
 * วิธีแก้ที่ได้ผลกว่าการเขียนคำอธิบายเพิ่ม คือให้ชี้ของที่เห็นแล้วมันพาไปหาช่องเอง
 * (ไอเดียจาก PWR Theme ที่ทำให้สาย Power BI โดยเฉพาะ ดูงานวิจัย 11/09/2026)
 *
 * วิธีใช้ในเครื่องมือ
 *   const jump = jumpSystem();
 *   jump.register("title", ช่องหัวเรื่อง);          // ลงทะเบียนช่องที่จะกระโดดไป
 *   jump.attach(กล่องพรีวิว);                      // ผูกครั้งเดียวพอ
 *   ...แล้วในพรีวิวใส่ data-jump="title" บนส่วนที่ตรงกัน
 *
 * ‼️ ใส่ data-jump เฉพาะตอนวาดพรีวิวเท่านั้น ห้ามติดไปกับโค้ดที่ผู้ใช้ก็อปไปใช้
 */

export function jumpSystem() {
  const targets = new Map();   // คีย์ -> ช่องที่จะกระโดดไป

  function register(key, node) {
    if (key && node) targets.set(String(key), node);
  }

  function clear() { targets.clear(); }

  // ลบเฉพาะกลุ่มที่ขึ้นต้นด้วยคำนี้ ใช้ตอนสร้างรายการใหม่ เช่นคอลัมน์ที่เพิ่มลบได้
  // ไม่งั้นคีย์ของคอลัมน์ที่ลบไปแล้วจะค้าง แล้วกระโดดไปช่องที่หลุดจากหน้าไปแล้ว
  function clearPrefix(prefix) {
    for (const k of [...targets.keys()]) if (k.startsWith(prefix)) targets.delete(k);
  }

  function attach(root) {
    root.addEventListener("click", (e) => {
      const hit = e.target.closest && e.target.closest("[data-jump]");
      if (!hit || !root.contains(hit)) return;
      go(hit.getAttribute("data-jump"));
    });
  }

  function go(key) {
    const node = targets.get(String(key));
    if (!node) return false;
    node.scrollIntoView({ block: "center", behavior: "smooth" });
    flash(node);
    // โฟกัสช่องกรอกข้างในให้เลย จะได้พิมพ์ต่อได้ทันทีโดยไม่ต้องคลิกซ้ำ
    const input = node.matches("input, select, textarea")
      ? node
      : node.querySelector("input, select, textarea");
    if (input) input.focus({ preventScroll: true });
    return true;
  }

  // ‼️ ต้องถอดคลาสแล้วบังคับให้เบราว์เซอร์คำนวณ layout ก่อนใส่ใหม่
  // ไม่งั้นคลิกซ้ำจุดเดิมจะไม่กะพริบ เพราะอนิเมชันเดิมยังไม่จบ
  function flash(node) {
    node.classList.remove("jt-flash");
    void node.offsetWidth;
    node.classList.add("jt-flash");
  }

  return { register, clear, clearPrefix, attach, go };
}

export const JUMPTO_CSS = `
[data-jump]{cursor:pointer}
[data-jump]:hover{outline:2px solid var(--g-powerbi,var(--brand));outline-offset:1px}
.jt-flash{animation:jt-flash 1.1s var(--ease-snap,ease)}
@keyframes jt-flash{
  0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--g-powerbi,var(--brand)) 60%,transparent)}
  30%{box-shadow:0 0 0 5px color-mix(in srgb,var(--g-powerbi,var(--brand)) 28%,transparent)}
  100%{box-shadow:0 0 0 0 transparent}
}
@media (prefers-reduced-motion:reduce){
  .jt-flash{animation:none;outline:2px solid var(--g-powerbi,var(--brand));outline-offset:2px}
}
`;
