import { el } from "./dom.js";
import { tr } from "./i18n.js";

/* ── ชุดเครื่องมือสีกลางของ FileKit ────────────────────────────────────────
 * ทุกเครื่องมือที่ให้ผู้ใช้เลือกสีควรเรียกจากที่นี่ ไม่ใช่ต่างคนต่างทำ
 * เพราะสิ่งที่สำคัญกว่าตัวเลือกสีสวย ๆ คือ "เตือนตอนสีคู่นั้นอ่านไม่ออก"
 * ซึ่งเป็นปัญหาที่เกิดจริงกับอีเมลและรายงานที่ส่งให้คนอื่นอ่าน
 *
 * ‼️ สูตร contrast ยกมาจาก Scripts/check_true_contrast.py ที่ใช้จริงกับธีม TRUE
 * และมี self-test พิสูจน์ว่าจับ known-bad ได้ ไม่ได้เขียนใหม่จากความจำ
 * (WCAG 2.1 relative luminance: sRGB → linear → 0.2126R + 0.7152G + 0.0722B)
 */

/** #abc หรือ #aabbcc หรือ aabbcc → {r,g,b} 0-255 · คืน null ถ้าอ่านไม่ออก */
export function parseHex(value) {
  const s = String(value ?? "").trim().replace(/^#/, "");
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function toHex({ r, g, b }) {
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

const _lin = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** ความสว่างสัมพัทธ์ตาม WCAG 2.1 · คืน null ถ้าสีอ่านไม่ออก */
export function luminance(hex) {
  const c = parseHex(hex);
  if (!c) return null;
  return 0.2126 * _lin(c.r) + 0.7152 * _lin(c.g) + 0.0722 * _lin(c.b);
}

/** อัตราส่วนความต่าง 1 ถึง 21 · คืน null ถ้าสีใดสีหนึ่งอ่านไม่ออก */
export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  if (la === null || lb === null) return null;
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/* เกณฑ์ WCAG 2.1: ตัวอักษรปกติ AA ต้อง 4.5 ขึ้นไป AAA ต้อง 7
   ตัวใหญ่ (18pt ขึ้นไป หรือ 14pt ตัวหนา) AA ต้อง 3 AAA ต้อง 4.5 */
export function contrastRating(ratio, large = false) {
  if (ratio === null) return { level: "?", ok: false };
  if (ratio >= (large ? 4.5 : 7)) return { level: "AAA", ok: true };
  if (ratio >= (large ? 3 : 4.5)) return { level: "AA", ok: true };
  if (large && ratio >= 3) return { level: "AA", ok: true };
  return { level: tr("ไม่ผ่าน", "fail"), ok: false };
}

/** เลือกสีตัวอักษรขาวหรือดำที่อ่านง่ายกว่าบนพื้นสีนี้ */
export function readableInk(bgHex) {
  const onBlack = contrast(bgHex, "#000000");
  const onWhite = contrast(bgHex, "#ffffff");
  if (onBlack === null || onWhite === null) return "#000000";
  return onBlack >= onWhite ? "#000000" : "#ffffff";
}

/* ── จานสีสำเร็จ ───────────────────────────────────────────────────────
 * ‼️ ชุดแรกคือสีจริงของธีม Power BI มาตรฐาน คนที่ทำงานกับ Power BI
 * จะได้เลือกสีที่ตรงกับรายงานของตัวเองได้ทันทีโดยไม่ต้องไปเปิดหา
 * ชุดกลางเป็นสีเทาสำหรับเส้นขอบและพื้นหลังตาราง ซึ่งเป็นสิ่งที่คนเลือกบ่อยที่สุด
 * เป็นค่าคงที่ ไม่ใช่ข้อความที่ต้องแปล */
export const SWATCHES = {
  powerbi: ["#118DFF", "#12239E", "#E66C37", "#6B007B", "#E044A7", "#744EC2", "#D9B300", "#D64550"],
  neutral: ["#FFFFFF", "#FAFAFA", "#F2F2F2", "#D9D9D9", "#BFBFBF", "#8C8C8C", "#595959", "#222222"],
  accent: ["#2E7D32", "#0288D1", "#F9A825", "#C62828", "#6A1B9A", "#00838F", "#4E342E", "#37474F"],
};

/* ── ตัวเลือกสีที่ใช้ซ้ำได้ทุกเครื่องมือ ────────────────────────────────
 * 3 ทางเข้าที่ชี้ไปค่าเดียวกัน: กดจานสีสำเร็จ, ช่องเลือกสีของระบบ, พิมพ์ hex เอง
 * (แพตเทิร์นนี้มาจากงานวิจัย 11/09/2026 เว็บที่ทำดีให้ครบทั้งสามทางเสมอ)
 * พิมพ์ hex ผิดจะไม่เขียนค่าทับของเดิม แต่ขึ้นเส้นขอบแดงให้เห็นว่ายังไม่ถูก
 */
export function colorPicker(value, onChange, opts = {}) {
  const { swatches = SWATCHES.powerbi, label } = opts;
  let current = parseHex(value) ? value : "#000000";

  const dot = el("input", { type: "color", class: "ck-dot", value: current,
    "aria-label": label || tr("เลือกสี", "Pick a colour") });
  const text = el("input", { type: "text", class: "ck-hex", value: current, spellcheck: "false",
    "aria-label": label ? label + " (hex)" : "hex" });
  const row = el("div", { class: "ck-row" }, [dot, text]);

  const swatchRow = el("div", { class: "ck-swatches" }, swatches.map((hex) =>
    el("button", {
      type: "button", class: "ck-sw", style: `--sw:${hex}`, title: hex, "aria-label": hex,
      onclick: () => set(hex, true),
    })
  ));

  const wrap = el("div", { class: "ck-wrap" }, [row, swatchRow]);

  dot.addEventListener("input", () => set(dot.value, true));
  text.addEventListener("input", () => {
    const parsed = parseHex(text.value);
    text.classList.toggle("bad", !parsed && text.value.trim() !== "");
    if (parsed) set(toHex(parsed), false);
  });

  function set(hex, syncText) {
    current = hex;
    dot.value = hex;
    if (syncText) { text.value = hex; text.classList.remove("bad"); }
    onChange(hex);
  }

  return { node: wrap, get value() { return current; }, setUI: (v) => set(v, true) };
}

/* ── ป้ายบอกความต่างของสีคู่หนึ่ง ─────────────────────────────────────
 * บอกเป็นตัวเลขจริงพร้อมคำตัดสิน ไม่ใช่แค่ไฟเขียวไฟแดง
 * เพราะคนที่เห็นเลข 3.2 กับเกณฑ์ 4.5 จะรู้เองว่าต้องขยับอีกแค่ไหน
 */
export function contrastBadge(fgGetter, bgGetter, opts = {}) {
  const { large = false, what, advisory = false, advice } = opts;
  const node = el("div", { class: "ck-contrast" });
  function update() {
    const ratio = contrast(fgGetter(), bgGetter());
    if (ratio === null) { node.textContent = ""; node.className = "ck-contrast"; return; }
    const { level, ok } = contrastRating(ratio, large);
    const head = what ? what + " " : "";
    if (ok) {
      node.className = "ck-contrast ok";
      node.textContent = tr(`${head}ความต่างสี ${ratio.toFixed(1)} ผ่านเกณฑ์ ${level}`,
                            `${head}contrast ${ratio.toFixed(1)}, meets ${level}`);
      return;
    }
    /* ‼️ แยกระดับความรุนแรง ไม่งั้นกลายเป็นเสียงหมาป่า
     * ข้อความที่คนต้องอ่านจริงตกเกณฑ์ = เรื่องใหญ่ ทาแดง
     * ส่วนของประดับอย่างเส้นขอบจาง ๆ เป็นสิ่งที่คนตั้งใจใช้กันทั่วไปในอีเมล
     * บอกตัวเลขกับผลที่ตามมาก็พอ อย่าไปตัดสินว่าเขาทำผิด */
    node.className = "ck-contrast " + (advisory ? "note" : "bad");
    node.textContent = advisory
      ? `${head}${tr("ความต่างสี", "contrast")} ${ratio.toFixed(1)}  ` +
        (advice || tr("จางมาก บางคนอาจมองไม่เห็น", "very faint, some people will not see it"))
      : tr(`${head}ความต่างสี ${ratio.toFixed(1)} อ่านยาก ต้องได้อย่างน้อย ${large ? "3" : "4.5"}`,
           `${head}contrast ${ratio.toFixed(1)} is hard to read, needs at least ${large ? "3" : "4.5"}`);
  }
  update();
  return { node, update };
}

/* ── สไตล์ของชุดเครื่องมือนี้ ──────────────────────────────────────────
 * เครื่องมือที่เรียกใช้ต้องเอาไปใส่ใน <style> ของตัวเองด้วย
 * (กฎของโปรเจกต์คือสไตล์อยู่ในโมดูล ไม่ไปแก้ assets/css/tool.css)
 */
export const COLORKIT_CSS = `
.ck-wrap{display:flex;flex-direction:column;gap:7px}
.ck-row{display:flex;align-items:center;gap:8px}
.ck-dot{flex:none;width:34px;height:28px;padding:0;border:1px solid var(--line);
  border-radius:6px;background:none;cursor:pointer}
.ck-hex{flex:1;min-width:0;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:12.5px}
.ck-hex.bad{border-color:#d64550;outline:1px solid #d64550}
.ck-swatches{display:flex;flex-wrap:wrap;gap:5px}
.ck-sw{width:20px;height:20px;border-radius:5px;border:1px solid var(--line);
  background:var(--sw);cursor:pointer;padding:0}
.ck-sw:hover{transform:scale(1.12)}
.ck-sw:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.ck-contrast{font-size:12px;line-height:1.6;margin-top:5px}
.ck-contrast.ok{color:var(--text-mute)}
.ck-contrast.bad{color:#d64550;font-weight:600}
.ck-contrast.note{color:var(--text-mute)}
`;
