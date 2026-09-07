// ── ตัวช่วยอ่านโครงข้อความจาก PDF ──────────────────────────────────────────
// ใช้ร่วมกันระหว่าง PDF→Word และ PDF→Excel: ทั้งคู่ต้องการ "บรรทัด" ที่เรียง
// ตามตำแหน่งจริงบนหน้า ไม่ใช่ลำดับ item ดิบซึ่งมักสลับไปมา

/** คืนบรรทัดของหน้าเป็น [{y, items:[{x,str,w}]}] เรียงจากบนลงล่าง */
export async function pageLines(page, yTolerance = 2.5) {
  const content = await page.getTextContent();
  const rows = [];
  for (const it of content.items) {
    if (!it.str) continue;
    const x = it.transform[4], y = it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) <= yTolerance);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push({ x, str: it.str, w: it.width || 0 });
  }
  rows.sort((a, b) => b.y - a.y);
  rows.forEach((r) => r.items.sort((a, b) => a.x - b.x));
  return rows;
}

/** ต่อ item ในบรรทัดเป็นข้อความเดียว โดยเติมเว้นวรรคเมื่อช่องว่างกว้างพอ */
export function lineText(row, gap = 1.2) {
  let out = "";
  let prev = null;
  for (const it of row.items) {
    if (prev && it.x - (prev.x + prev.w) > gap) out += " ";
    out += it.str;
    prev = it;
  }
  return out.replace(/\s+$/, "");
}

/**
 * เดาขอบเขตคอลัมน์ของตารางจากตำแหน่ง x ที่ข้อความมักเริ่มซ้ำ ๆ กันหลายบรรทัด
 * คืน [x1, x2, ...] เป็นจุดเริ่มของแต่ละคอลัมน์
 */
export function guessColumns(rows, minRepeat = 3, tolerance = 6) {
  const buckets = [];
  for (const r of rows) {
    for (const it of r.items) {
      const b = buckets.find((b) => Math.abs(b.x - it.x) <= tolerance);
      if (b) { b.n++; b.x = (b.x * (b.n - 1) + it.x) / b.n; }
      else buckets.push({ x: it.x, n: 1 });
    }
  }
  return buckets.filter((b) => b.n >= minRepeat).map((b) => b.x).sort((a, b) => a - b);
}

/** แปลงบรรทัดหนึ่งเป็นเซลล์ตามขอบคอลัมน์ที่เดาไว้ */
export function rowToCells(row, cols, tolerance = 6) {
  const cells = new Array(cols.length).fill("");
  for (const it of row.items) {
    let idx = 0;
    for (let i = cols.length - 1; i >= 0; i--) {
      if (it.x >= cols[i] - tolerance) { idx = i; break; }
    }
    cells[idx] = cells[idx] ? cells[idx] + " " + it.str : it.str;
  }
  return cells.map((c) => c.trim());
}
