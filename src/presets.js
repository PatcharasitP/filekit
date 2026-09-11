import { el } from "./dom.js";
import { tr } from "./i18n.js";

/* ── ชุดพร้อมใช้ กดครั้งเดียวได้ทั้งชุด ────────────────────────────────────
 * ปัญหาที่แก้: เครื่องมือที่ปรับได้ 20 ช่อง คนเปิดมาครั้งแรกไม่รู้จะเริ่มตรงไหน
 * ต้องเข้าใจทุกช่องก่อนถึงจะได้ของที่ใช้ได้ ซึ่งไม่มีใครอยากทำ
 * ชุดพร้อมใช้ทำให้ได้ของที่ใช้ได้ทันทีในคลิกเดียว แล้วค่อยไปปรับรายละเอียดทีหลัง
 *
 * ‼️ ต่างจาก Preset Colors ของ Microsoft ตรงที่ของเขาได้แค่สี ของเราได้ทั้งชุดการตั้งค่า
 * เพราะสิ่งที่คนติดไม่ใช่ "เลือกสีไม่ถูก" แต่เป็น "ไม่รู้ว่าต้องตั้งอะไรบ้างถึงจะสวย"
 *
 * วิธีใช้
 *   const bar = presetBar(PRESETS, (values) => applyValues(values));
 *   rightBody.prepend(bar.node);
 *   ...แล้วเวลาผู้ใช้แก้ค่าเองให้เรียก bar.clearActive() เพราะไม่ตรงกับชุดไหนแล้ว
 */

export function presetBar(presets, onApply) {
  let activeId = null;

  const chips = presets.map((p) =>
    el("button", {
      class: "ps-chip", type: "button", "data-id": p.id, title: p.desc || "",
      onclick: () => apply(p),
    }, p.name)
  );

  const node = el("div", { class: "ps-wrap" }, [
    el("div", { class: "ps-label" }, tr("ชุดพร้อมใช้", "Ready made")),
    el("div", { class: "ps-chips" }, chips),
  ]);

  function apply(p) {
    activeId = p.id;
    paint();
    onApply(structuredClone ? structuredClone(p.values) : JSON.parse(JSON.stringify(p.values)));
  }

  function paint() {
    for (const c of chips) c.classList.toggle("on", c.dataset.id === activeId);
  }

  // ผู้ใช้แก้ค่าเองเมื่อไร ก็ไม่ตรงกับชุดไหนแล้ว ต้องเลิกไฮไลต์ ไม่งั้นชิปโกหก
  function clearActive() {
    if (activeId === null) return;
    activeId = null;
    paint();
  }

  return { node, clearActive, apply: (id) => {
    const p = presets.find((x) => x.id === id);
    if (p) apply(p);
  } };
}

export const PRESETS_CSS = `
.ps-wrap{margin-bottom:16px}
.ps-label{font-size:11.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
  color:var(--text-mute);margin-bottom:7px}
.ps-chips{display:flex;flex-wrap:wrap;gap:6px}
.ps-chip{border:1.5px solid var(--line);background:var(--bg-soft);color:var(--text);
  border-radius:999px;padding:5px 12px;font:600 12.5px/1.4 var(--font);cursor:pointer;
  transition:border-color .12s var(--ease-snap,ease),background .12s var(--ease-snap,ease)}
.ps-chip:hover{border-color:color-mix(in srgb,var(--g-powerbi,var(--brand)) 45%,var(--line))}
.ps-chip.on{border-color:var(--g-powerbi,var(--brand));
  background:color-mix(in srgb,var(--g-powerbi,var(--brand)) 14%,var(--bg-soft))}
.ps-chip:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
/* ‼️ บนจอสัมผัส เป้าการแตะต้องไม่ต่ำกว่า 36px ไม่งั้นกดพลาดบ่อยจนใช้ไม่ไหว
   แยกไว้ใน pointer:coarse เพื่อไม่ให้เมาส์บนจอใหญ่ได้ปุ่มอ้วนเกินจำเป็น */
@media (pointer:coarse){
  .ps-chip{min-height:36px;padding:7px 14px}
}
`;
