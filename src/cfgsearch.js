import { el } from "./dom.js";
import { tr } from "./i18n.js";
import { enToThai, highlightRange } from "./search.js";

/* ── ค้นหาในแผงตั้งค่า ─────────────────────────────────────────────────────
 * ปัญหาที่แก้ (วัดจริง 11/09/2026 บนเว็บจริง)
 *   กราฟโดนัท 22 ช่องปรับ 5 กลุ่ม เนื้อหาสูง 2070px ช่องมองเห็นแค่ 657px
 *   = ต้องเลื่อน 3.15 เท่าของจอ กราฟแท่ง 2.82 เท่า บนมือถือเห็นแค่ 5 จาก 21 ช่อง
 *   กลุ่ม "ขนาดและรูปทรง" ซึ่งคนน่าจะปรับบ่อย อยู่ลึกถึง 1212px
 *
 * ‼️ ทำไมเลือกทางนี้ ไม่ใช่แตกเป็นแท็บหรือยุบกลุ่ม
 *   งานวิจัย 11/09/2026 พบว่า VS Code, Chrome และ Firefox ทำเหมือนกันหมดคือ
 *   กรองสดแล้วซ่อนกลุ่มที่ไม่มีผลลัพธ์ทั้งกลุ่ม ส่วน NN/g มีบทความสองชิ้นที่
 *   แนะนำขัดกันเรื่องการซ่อน (ชิ้นหนึ่งให้ซ่อนของใช้ไม่บ่อย อีกชิ้นเตือนว่า
 *   ถ้าคนต้องเปิดดูส่วนใหญ่อยู่ดี การบังคับคลิกแพงกว่าการเลื่อน)
 *   ทางนี้จึงปลอดภัยที่สุด เพราะ **ไม่พิมพ์ก็เหมือนเดิมทุกอย่าง** เป็นทางลัดที่เพิ่มเข้ามา
 *   ไม่ใช่การบังคับเปลี่ยนวิธีใช้
 *
 * ‼️ บทเรียนจากบั๊กจริงของ GitLab: ตอนไม่เจอผลลัพธ์ ห้ามซ่อนหัวเรื่องไปด้วย
 *   ไม่งั้นคนจะงงว่าหน้าหายไปไหน ต้องเหลือข้อความบอกสถานะไว้เสมอ
 *
 * วิธีใช้
 *   const cs = configSearch({ scope: rightBody, groupSel: ".pbib-group" });
 *   rightBody.prepend(cs.node);
 *   ...ถ้าสร้างแผงใหม่ทั้งก้อน ให้เรียก cs.reindex() ด้วย
 */

/* ‼️ ตัดวรรณยุกต์ออกตอนเทียบ คนไทยพิมพ์ค้นหามักไม่ใส่วรรณยุกต์
   แต่ใช้เฉพาะตอน "ตัดสินว่าตรงไหม" เท่านั้น ห้ามใช้ตอนไฮไลต์
   เพราะความยาวข้อความเปลี่ยน ตำแหน่งที่หาได้จะเลื่อนไม่ตรงกับข้อความจริง */
const stripTone = (s) => s.replace(/[็-๎]/g, "");
const norm = (s) => stripTone(String(s || "").toLowerCase().replace(/\s+/g, " ").trim());

export function configSearch(cfg) {
  /* ‼️ ช่องอาจถูกห่อด้วย .dm-field (กล่องที่ติดป้ายว่าคุมพารามิเตอร์ไหน) อีกชั้น
     ต้องเลือกกล่องห่อเป็นหน่วยของการซ่อน ไม่งั้นซ่อนช่องแล้วปุ่มคืนค่ายังลอยค้างอยู่ */
  const { scope, groupSel, fieldSel = ".dm-field, .field, [class*='-switch-field']", keep = [] } = cfg;

  const input = el("input", {
    type: "search", class: "cfs-input", autocomplete: "off", spellcheck: "false",
    placeholder: tr("ค้นหาการตั้งค่า", "Search settings"),
    "aria-label": tr("ค้นหาการตั้งค่า", "Search settings"),
  });
  const clearBtn = el("button", {
    type: "button", class: "cfs-clear", hidden: true,
    "aria-label": tr("ล้างคำค้นหา", "Clear search"),
    onclick: () => { input.value = ""; run(); input.focus(); },
  }, "✕");
  const count = el("div", { class: "cfs-count", role: "status", "aria-live": "polite" });
  const node = el("div", { class: "cfs-wrap" }, [
    el("div", { class: "cfs-box" }, [input, clearBtn]), count,
  ]);

  let items = [];   // { field, group, text }
  /* ‼️‼️ กฎเดียวกับปุ่มลงมือทำ: ซ่อนได้ แต่ห้ามเปิดทับ
     เครื่องมือซ่อนบางช่องไว้ถูกต้องแล้วตามเงื่อนไข (เช่นลำดับที่กำหนดเองจะโผล่
     เฉพาะตอนเลือกเรียงแบบกำหนดเอง) ถ้าตอนล้างคำค้นเราสั่งเปิดหมดทุกช่อง
     ช่องพวกนั้นจะโผล่ออกมาผิดจังหวะ
     จับได้จริงจากตัวเลข ก่อนค้น 6 กลุ่ม 15 ช่อง แต่หลังล้างกลับเป็น 7 กลุ่ม 18 ช่อง */
  const HIDDEN_BY_US = new WeakSet();

  function hide(node) { if (!node.hidden) { HIDDEN_BY_US.add(node); node.hidden = true; } }
  function unhide(node) { if (HIDDEN_BY_US.has(node)) { HIDDEN_BY_US.delete(node); node.hidden = false; } }

  /** อ่านโครงแผงใหม่ เรียกทุกครั้งที่สร้างช่องปรับใหม่ทั้งก้อน */
  function reindex() {
    items = [];
    for (const g of scope.querySelectorAll(groupSel)) {
      for (const f of g.querySelectorAll(fieldSel)) {
        // ข้อความที่ใช้ค้น รวมทั้งป้ายชื่อและคำอธิบายใต้ช่อง เพราะคนมักพิมพ์คำพ้อง
        items.push({ field: f, group: g, text: f.textContent || "" });
      }
    }
  }

  function matches(text, q) {
    const t = norm(text);
    if (t.includes(q)) return true;
    const alt = enToThai(q);           // เผื่อลืมสลับแป้นพิมพ์
    return !!alt && t.includes(norm(alt));
  }

  /* ‼️ ไฮไลต์ทำบนป้ายชื่อช่องเท่านั้น และใช้ highlightRange ของ search.js
     ซึ่งทำงานบนข้อความต้นฉบับ ไม่ได้ตัดวรรณยุกต์ก่อน ตำแหน่งจึงตรงเสมอ
     (ตรวจโค้ดจริงแล้ว 11/09/2026 ไม่ได้เชื่อตามที่ใครบอก) */
  function paintLabel(field, rawQ) {
    const span = field.querySelector(":scope > span, :scope > .field > span, :scope > label > span");
    if (!span) return;
    if (span.dataset.cfsOrig === undefined) span.dataset.cfsOrig = span.textContent;
    const orig = span.dataset.cfsOrig;
    const r = rawQ ? highlightRange(orig, rawQ) : null;
    if (!r) { span.textContent = orig; return; }
    span.textContent = "";
    span.append(orig.slice(0, r[0]), el("mark", {}, orig.slice(r[0], r[1])), orig.slice(r[1]));
  }

  function run() {
    const rawQ = input.value.trim();
    const q = norm(rawQ);
    clearBtn.hidden = !rawQ;
    scope.classList.toggle("cfs-on", !!q);
    for (const k of keep) if (k) k.hidden = !!q;   // ชุดพร้อมใช้ไม่เกี่ยวกับการค้น ซ่อนตอนค้น

    if (!q) {
      for (const it of items) { unhide(it.field); paintLabel(it.field, ""); }
      for (const g of scope.querySelectorAll(groupSel)) unhide(g);
      count.textContent = "";
      return;
    }

    let hits = 0;
    const live = new Set();
    for (const it of items) {
      // ช่องที่เครื่องมือซ่อนไว้เองอยู่แล้ว ไม่นับเป็นผลการค้นหา เพราะตอนนี้มันใช้ไม่ได้จริง
      const already = it.field.hidden && !HIDDEN_BY_US.has(it.field);
      const ok = !already && matches(it.text, q);
      if (ok) { unhide(it.field); hits++; live.add(it.group); } else if (!already) hide(it.field);
      paintLabel(it.field, ok ? rawQ : "");
    }
    // กลุ่มที่ไม่มีผลลัพธ์เลยหายไปทั้งกลุ่ม ไม่ใช่เหลือหัวข้อลอย ๆ (ตาม VS Code และ Chrome)
    for (const g of scope.querySelectorAll(groupSel)) {
      if (live.has(g)) unhide(g); else if (!g.hidden || HIDDEN_BY_US.has(g)) hide(g);
    }

    count.textContent = hits
      ? tr(`พบ ${hits} รายการ`, `${hits} found`)
      : tr("ไม่พบการตั้งค่าที่ตรงกับคำนี้ ลองพิมพ์สั้นลง",
           "No settings match that, try a shorter word");
  }

  input.addEventListener("input", run);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && input.value) { e.preventDefault(); input.value = ""; run(); }
  });

  reindex();
  return { node, reindex, refresh: run, clear: () => { input.value = ""; run(); } };
}

export const CFGSEARCH_CSS = `
.cfs-wrap{margin-bottom:14px}
.cfs-box{position:relative;display:flex;align-items:center}
.cfs-input{width:100%;box-sizing:border-box;padding-inline-end:34px}
.cfs-input::-webkit-search-cancel-button{display:none}
.cfs-clear{position:absolute;inset-inline-end:6px;width:26px;height:26px;display:grid;
  place-items:center;border:0;background:transparent;color:var(--text-mute);cursor:pointer;
  border-radius:7px;font-size:13px;line-height:1}
.cfs-clear:hover{color:var(--text);background:var(--bg-soft)}
.cfs-clear:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
.cfs-count{font-size:12px;color:var(--text-mute);line-height:1.6;margin-top:6px;min-height:0}
.cfs-wrap mark,.cfs-on mark{background:color-mix(in srgb,var(--g-powerbi,var(--brand)) 26%,transparent);
  color:inherit;border-radius:3px;padding:0 1px}
/* ‼️ เป้าการแตะบนจอสัมผัสห้ามต่ำกว่า 36px (เทส browser_ux จับ) */
@media (pointer:coarse){ .cfs-clear{width:36px;height:36px} }
`;
