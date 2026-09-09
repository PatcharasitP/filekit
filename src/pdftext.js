// ── ตัวช่วยอ่านโครงข้อความจาก PDF ──────────────────────────────────────────
// ใช้ร่วมกันระหว่าง PDF→Word และ PDF→Excel: ทั้งคู่ต้องการ "บรรทัด"ที่เรียง
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

// ── ตัวตรวจจับ "หลายคอลัมน์แบบข้อความไหล" (จุลสาร/วารสาร/ประกาศ) ──────────
// ต่างจาก guessColumns/rowToCells ด้านบน (ออกแบบมาสำหรับ "ตาราง" อ่านแบบ row-major
// ซ้าย→ขวาในแถวเดียวกัน) ตัวนี้ตรวจว่าเป็น "บทความจัดคอลัมน์" (ซ้าย-ขวาคนละเรื่อง ต้อง
// อ่านคอลัมน์ซ้ายให้จบก่อนค่อยอ่านคอลัมน์ขวา ไม่ใช่ไล่ตาม y แถวต่อแถว) — ไม่แตะ 2 ฟังก์ชัน
// ด้านบนเพราะ pdf-to-excel.js ใช้อยู่แล้ว เพิ่มฟังก์ชันใหม่แยกต่างหากแทน

const COL_MIN_ROWS_PER_ZONE = 4;      // โซนต้องมีอย่างน้อยกี่บรรทัดถึงจะนับว่า "เป็นคอลัมน์จริง" ไม่ใช่ noise
const COL_BUCKET_TOL = 5;             // pt — x เริ่มต้องตรงกันแค่ไหนถึงนับเป็นโซนเดียวกัน (คอลัมน์จัดหน้าจริงชิดกันมาก)
const COL_MAX_ZONES = 3;              // เจอมากกว่านี้ = น่าจะเป็นตารางหลายคอลัมน์ ไม่ใช่บทความ → ไม่แตะ
const COL_FILL_THRESH = 0.8;          // สัดส่วนความกว้างเทียบ max ของโซนนั้น ที่ถือว่า "ข้อความไหลจนเกือบเต็มคอลัมน์"
const COL_FILL_ROW_FRAC = 0.5;        // ต้องมีอย่างน้อยกี่ % ของบรรทัดในโซนที่ "เต็ม" ถึงเชื่อว่าเป็นย่อหน้าไหล ไม่ใช่ label/เซลล์สั้น ๆ
const COL_MIN_ZONE_WIDTH = 80;        // pt — โซนแคบกว่านี้ไม่นับ (กันคอลัมน์เลขลำดับ 1-2 ตัวอักษรในตาราง)
const COL_MAX_ITEM_WIDTH_FRAC = 0.55; // item ที่กว้างเกินสัดส่วนนี้ของหน้า (หัวเรื่องพาดเต็มความกว้าง) ไม่ใช่เนื้อคอลัมน์แน่ ๆ
                                       // (คอลัมน์จริงต้องเว้นที่ให้อีกอย่างน้อย 1 คอลัมน์) ต้องกันไว้ก่อนคำนวณโซน ไม่งั้นบรรทัด
                                       // พาดเต็มความกว้างจะไปเบี้ยว "ความกว้างสุดของโซน" จนตรวจจับพัง (ดู red4 ในชุดทดสอบ)

function colNonEmptyItems(row) {
  return row.items.filter((it) => it.str.trim() !== "");
}

/** จัดกลุ่ม x เริ่มต้นของ item เป็น "โซน" — merge เทียบค่า seed ของบักเก็ต (ไม่ใช่ running average
 *  แบบ guessColumns) กัน false-merge จากการไล่เรียงหลุด tolerance สะสมทีละนิด */
function colBucketStarts(items, tol) {
  const buckets = [];
  for (const it of items) {
    let b = buckets.find((b) => Math.abs(b.seed - it.x) <= tol);
    if (!b) { b = { seed: it.x, xs: [], items: [] }; buckets.push(b); }
    b.xs.push(it.x);
    b.items.push(it);
  }
  return buckets.map((b) => ({ x: b.xs.reduce((a, v) => a + v, 0) / b.xs.length, items: b.items }));
}

/**
 * ตรวจจับโซนคอลัมน์ของ "บทความหลายคอลัมน์" จากข้อมูลทั้งหน้า (rows จาก pageLines())
 * คืน null ถ้าไม่ใช่ (หรือไม่มั่นใจพอ — ปลอดภัยไว้ก่อน) คืน {bounds:[x0,x1,...]} ถ้าใช่
 * (bounds.length = จำนวนคอลัมน์ที่ตรวจพบ, 2 หรือ 3)
 */
export function detectColumnZones(rows, pageWidth) {
  const maxItemW = pageWidth * COL_MAX_ITEM_WIDTH_FRAC;
  const allItems = [];
  rows.forEach((row) => {
    const items = colNonEmptyItems(row).filter((it) => it.w <= maxItemW);
    /* ‼️ แถวที่เหลือ item เดียว (หัวเรื่อง/บรรทัดโดด ๆ) ต้องไม่ถูกใช้เป็นหลักฐานตั้งโซน
     * หลักฐานที่แท้จริงของ "จัดหน้าหลายคอลัมน์" คือแถวที่มีเนื้อความคนละคอลัมน์อยู่ "พร้อมกัน"
     * ที่ความสูงเดียวกัน ถ้าปล่อยให้แถว 1 item เข้าไปด้วย หัวเรื่องที่ x เริ่มใกล้คอลัมน์ซ้าย
     * (ในระยะ COL_BUCKET_TOL) จะถูกยำรวมเข้าบักเก็ตเดียวกับคอลัมน์ซ้าย แล้วเพราะหัวเรื่องกว้าง
     * กว่าบรรทัดคอลัมน์จริงทุกบรรทัด จะไปเป็น "ความกว้างสุด" ปลอม ทำให้บรรทัดคอลัมน์ซ้ายของจริง
     * ทุกบรรทัดดูเหมือนไหลไม่เต็มโซน (ยิงจริง 09/09/2026 กับไฟล์ที่มีบรรทัดชื่อเรื่องเหนือ 2 คอลัมน์:
     * หัวเรื่องกว้าง 233pt เข้าบักเก็ตเดียวกับคอลัมน์ซ้าย x=55 เพราะ x หัวเรื่อง=60 ห่างแค่ 5pt
     * ทำให้ fullCount/rights.length เหลือ 1/7=14% ต่ำกว่าเกณฑ์ 50% จน detectColumnZones คืน null
     * ทั้งที่เป็น 2 คอลัมน์แท้ ๆ) แถวโดดยังถูกจัดเข้าคอลัมน์ตามปกติตอนอ่านจริงใน columnAwareLines
     * (ผ่าน colZoneIndexOf บน bounds ที่ตั้งไว้แล้ว) แค่ไม่นับเป็นหลักฐานตอนตรวจจับเท่านั้น */
    if (items.length >= 2) allItems.push(...items);
  });
  if (allItems.length < COL_MIN_ROWS_PER_ZONE * 2) return null;

  const zones = colBucketStarts(allItems, COL_BUCKET_TOL)
    .filter((z) => z.items.length >= COL_MIN_ROWS_PER_ZONE)
    .sort((a, b) => a.x - b.x);

  if (zones.length < 2) return null;
  if (zones.length > COL_MAX_ZONES) return null; // น่าจะเป็นตารางหลายคอลัมน์ ไม่ใช่บทความ

  for (let i = 0; i < zones.length; i++) {
    const rightBound = i < zones.length - 1 ? zones[i + 1].x : pageWidth;
    if (rightBound - zones[i].x < COL_MIN_ZONE_WIDTH) return null;
  }

  // เกณฑ์หลัก: ทุกโซนยกเว้นโซนขวาสุด ต้องมีบรรทัดจำนวนมาก "ไหลจนเกือบเต็มความกว้างสุดของโซนนั้น"
  // (ข้อความ label/เซลล์ตารางสั้น ๆ จะไม่ทำแบบนี้ — ความกว้างจะกระจัดกระจายสั้น ๆ ไม่เกาะกลุ่มใกล้ max)
  for (let i = 0; i < zones.length - 1; i++) {
    const z = zones[i];
    const rights = z.items.map((it) => it.x + it.w - z.x);
    const maxRight = Math.max(...rights);
    if (maxRight <= 0) return null;
    const fullCount = rights.filter((r) => r / maxRight >= COL_FILL_THRESH).length;
    if (fullCount / rights.length < COL_FILL_ROW_FRAC) return null;
  }

  return { bounds: zones.map((z) => z.x) };
}

function colZoneIndexOf(x, bounds) {
  for (let i = bounds.length - 1; i >= 0; i--) if (x >= bounds[i] - 1e-6) return i;
  return 0;
}

/**
 * คืนบรรทัดของทั้งหน้า โดยถ้าตรวจพบเลย์เอาต์หลายคอลัมน์แบบข้อความไหล (detectColumnZones)
 * จะอ่านคอลัมน์ซ้ายให้จบก่อนแล้วค่อยคอลัมน์ขวา (column-major) แทนการไล่ตาม y (row-major)
 * แถวที่ "พาดเต็มความกว้าง" (หัวเรื่อง/เลขหน้า) จะคงอยู่ตามลำดับเดิม ไม่ถูกจัดเข้าคอลัมน์
 * ถ้าตรวจไม่พบ คืนพฤติกรรมเดิมเป๊ะ (rows.map(lineText).filter(t=>t!=="")) — ไม่มีการเปลี่ยนแปลง
 */
export function columnAwareLines(rows, pageWidth) {
  const zones = detectColumnZones(rows, pageWidth);
  if (!zones) return rows.map(lineText).filter((t) => t !== "");

  const bounds = zones.bounds;
  const out = [];
  let colBuf = null; // array[zone] ของบรรทัด สะสมระหว่างอยู่ในโซนคอลัมน์

  const flush = () => {
    if (!colBuf) return;
    for (const zoneLines of colBuf) out.push(...zoneLines);
    colBuf = null;
  };

  for (const row of rows) {
    const items = colNonEmptyItems(row);
    if (items.length === 0) continue;

    // แถว "พาดเต็มความกว้าง" (item ใด ๆ ยื่นข้ามเขตโซนของตัวเอง) → ไม่ใช่ส่วนของคอลัมน์ อ่านตามเดิม
    const spans = items.some((it) => {
      const z = colZoneIndexOf(it.x, bounds);
      const nextBound = z < bounds.length - 1 ? bounds[z + 1] : Infinity;
      return it.x + it.w > nextBound;
    });

    if (spans) {
      flush();
      const line = lineText(row);
      if (line !== "") out.push(line);
      continue;
    }

    if (!colBuf) colBuf = bounds.map(() => []);
    const perZone = bounds.map(() => []);
    for (const it of items) perZone[colZoneIndexOf(it.x, bounds)].push(it);
    perZone.forEach((zoneItems, idx) => {
      if (zoneItems.length === 0) return;
      const line = lineText({ items: zoneItems.slice().sort((a, b) => a.x - b.x) });
      if (line !== "") colBuf[idx].push(line);
    });
  }
  flush();
  return out;
}
