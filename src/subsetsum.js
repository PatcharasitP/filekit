// ─────────────────────────────────────────────────────────────────────────────
// แกนค้นหา "รายการไหนบวกกันได้ยอดนี้" (subset-sum ที่ตั้งเงื่อนไขได้)
//
// ‼️ ทำไมไม่ใช้ Solver ของ Excel: วัดจริงบนเครื่อง 15/09/2026 — Solver (Simplex LP + ตัวแปร
//    binary) กับข้อมูลแค่ 50 แถวยังไม่คืนคำตอบภายใน 5 นาที และ MaxTime ที่ตั้งไว้ 60 วินาที
//    ก็ไม่หยุดให้ ขณะที่วิธีในไฟล์นี้ค้น 14,651 แถวจบใน 37 ms บนข้อมูลชุดเดียวกัน
//    อีกอย่าง Solver เวอร์ชันมาตรฐานรับตัวแปรได้ 200 ตัว ข้อมูลจริงหลักหมื่นแถวจึงใส่ไม่ได้ตั้งแต่ต้น
//
// ‼️ กฎเหล็กของไฟล์นี้: คิดด้วยจำนวนเต็มเท่านั้น
//    0.1 + 0.2 ในเลขทศนิยมลอยได้ 0.30000000000000004 — งานกระทบยอดที่ต้องตรงเป๊ะจึงคูณ
//    ด้วย 10^ทศนิยมสูงสุด แล้วคำนวณบนจำนวนเต็มล้วน (ผลรวมสูงสุดที่รับไหว 9,007,199,254,740,991)
// ─────────────────────────────────────────────────────────────────────────────

/** จำนวนทศนิยมของข้อความตัวเลข (อ่านจากข้อความ ไม่ใช่จาก Number เพราะ Number ทิ้งศูนย์ท้าย) */
export function decimalsOf(s) {
  const t = String(s).trim().replace(/,/g, "");
  const m = /^[-+]?\d*\.(\d+)$/.exec(t);
  return m ? m[1].length : 0;
}

/** ข้อความ → จำนวนเต็มหน่วยย่อย (เช่น สตางค์) โดยไม่ผ่านการคูณทศนิยมลอย */
export function toInt(s, decimals) {
  const t = String(s).trim().replace(/,/g, "");
  const m = /^([-+]?)(\d*)(?:\.(\d*))?$/.exec(t);
  if (!m || (!m[2] && !m[3])) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const frac = (m[3] || "").slice(0, decimals).padEnd(decimals, "0");
  // ‼️ ทศนิยมที่ยาวเกินกว่าที่ตกลงกันไว้ ต้องปัดไม่ใช่ตัดทิ้ง ไม่งั้น 0.999 (ทศนิยม 2) จะกลายเป็น 0.99
  const extra = (m[3] || "").slice(decimals);
  let n = Number((m[2] || "0") + frac);
  if (extra && Number(extra[0]) >= 5) n += 1;
  return sign * n;
}

/** จำนวนเต็ม → ข้อความที่คนอ่านรู้เรื่อง (ใส่จุลภาคหลักพัน) */
export function fromInt(n, decimals) {
  const neg = n < 0;
  const s = String(Math.abs(n)).padStart(decimals + 1, "0");
  const head = s.slice(0, s.length - decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const tail = decimals ? "." + s.slice(s.length - decimals) : "";
  return (neg ? "-" : "") + head + tail;
}

/**
 * รวมแถวที่ "ค่าเท่ากัน" เป็นก้อนเดียว
 * ‼️ ขั้นนี้สำคัญกว่าที่คิด: ไฟล์จริงของพี่ปอนด์ 14,651 แถวมีค่าไม่ซ้ำแค่ 3,852 ค่า
 *    ถ้าไม่ยุบก่อน คำตอบชุดเดียวกันจะถูกนับซ้ำเป็นพัน ๆ ครั้งเพียงเพราะมันคนละแถว
 * @returns [{ v, rows:[index...] }] เรียงจากค่ามากไปน้อย
 */
export function groupByValue(items) {
  const m = new Map();
  for (const it of items) {
    let g = m.get(it.v);
    if (!g) { g = { v: it.v, rows: [] }; m.set(it.v, g); }
    g.rows.push(it.row);
  }
  return [...m.values()].sort((a, b) => b.v - a.v);
}

/**
 * ค้นหาชุดของค่าที่บวกกันได้ตามเป้า
 * @param groups   ผลจาก groupByValue (เรียงมากไปน้อยแล้ว)
 * @param target   เป้าหมาย (จำนวนเต็ม)
 * @param opt {
 *   tol, minCount, maxCount, maxResults, timeMs,
 *   reuseValue  ใช้ค่าเดิมซ้ำได้ไหม (ถ้ามีหลายแถวที่ค่าเท่ากัน) — false = ค่าเดิมใช้ได้ครั้งเดียว
 *   onTick      เรียกเป็นระยะระหว่างค้น คืน false เพื่อสั่งหยุด
 * }
 * @returns { results:[{ picks:[{g,times}], sum, diff }], nodes, ms, stopped, exhausted }
 */
export function search(groups, target, opt = {}) {
  const tol = Math.max(0, opt.tol | 0);
  const minCount = Math.max(1, opt.minCount || 1);
  const maxCount = Math.max(minCount, opt.maxCount || 4);
  const maxResults = Math.max(1, opt.maxResults || 50);
  const timeMs = opt.timeMs == null ? 4000 : opt.timeMs;
  const reuse = opt.reuseValue !== false;
  const onTick = opt.onTick;

  const n = groups.length;
  const v = new Float64Array(n);
  const cap = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    v[i] = groups[i].v;
    cap[i] = reuse ? Math.min(groups[i].rows.length, maxCount) : 1;
  }

  // ขอบบน/ขอบล่าง: จากก้อนที่ i หยิบได้ไม่เกิน d ตัว รวมได้มากสุด/น้อยสุดเท่าไร
  // ‼️ ต้องคิดแบบ "เลือกหรือไม่เลือกทีละก้อน" จริง ๆ ห้ามลัดว่าค่าที่ i ดีที่สุดเสมอ
  //    ขอบบนลัดได้เพราะเรียงมากไปน้อย แต่ขอบล่างลัดไม่ได้ ค่าที่ติดลบที่สุดอยู่ท้ายแถว
  //    (เคยลัดแล้วผิด: ขอบล่างได้ -33 ทั้งที่ของจริงเอื้อมถึง -233 จึงตัดคำตอบที่ต้องใช้ค่าลบก้อนใหญ่ทิ้ง
  //     tests/subsetsum.test.mjs ข้อ ⑤ จับได้ รอบที่ 45)
  const D = maxCount + 1;
  const up = new Float64Array(n * D + D);     // up[i*D+d]
  const dn = new Float64Array(n * D + D);
  for (let i = n - 1; i >= 0; i--) {
    for (let d = 0; d <= maxCount; d++) {
      let hi = up[(i + 1) * D + d];           // ไม่หยิบก้อนนี้
      let lo = dn[(i + 1) * D + d];
      const lim = Math.min(cap[i], d);
      for (let t = 1; t <= lim; t++) {
        const a = v[i] * t + up[(i + 1) * D + (d - t)];
        if (a > hi) hi = a;
        const b = v[i] * t + dn[(i + 1) * D + (d - t)];
        if (b < lo) lo = b;
      }
      up[i * D + d] = hi;
      dn[i * D + d] = lo;
    }
  }

  const t0 = now();
  const deadline = timeMs > 0 ? t0 + timeMs : Infinity;
  const out = [];
  const stack = [];
  let nodes = 0, stopped = false, exhausted = true;

  function dfs(i, rem, depth) {
    if (stopped) return;
    if ((++nodes & 1023) === 0) {
      if (now() > deadline || (onTick && onTick(nodes, out.length) === false)) { stopped = true; exhausted = false; return; }
    }
    if (depth >= minCount && rem <= tol && rem >= -tol) {
      out.push({ picks: stack.map((s) => ({ g: groups[s.j], times: s.t })), diff: -rem });
      if (out.length >= maxResults) { stopped = true; exhausted = false; return; }
      // ‼️ ห้าม return ตรงนี้ เจอชุดหนึ่งแล้วยังต้องค้นต่อ — พอมีค่าคลาดเคลื่อนหรือมีค่าติดลบ
      //    ชุดที่ยาวกว่าก็เข้าเกณฑ์ได้เหมือนกันและเป็นคนละคำตอบ (เทสข้อ ⑤ รอบ 20 จับได้)
      //    กรณีธรรมดา (ค่าบวกล้วน ไม่มีคลาดเคลื่อน) ขอบบน/ล่างข้างล่างจะตัดให้เองอยู่แล้ว
    }
    if (depth >= maxCount || i >= n) return;
    const left = maxCount - depth;
    if (rem - tol > up[i * D + left]) return;   // เหลือมากเกินกว่าที่ของที่เหลือจะไปถึง
    if (rem + tol < dn[i * D + left]) return;   // ติดลบเกินกว่าที่ของที่เหลือจะดึงกลับได้
    for (let j = i; j < n; j++) {
      if (rem - tol > up[j * D + left]) return; // ของที่เหลือไม่พอแล้ว เลิกทั้งชั้น
      const lim = Math.min(cap[j], left);
      for (let t = 1; t <= lim; t++) {
        const s = v[j] * t;
        // ค่าบวกที่ทำให้เกินเป้าไปแล้ว หยิบซ้ำอีกยิ่งเกิน — แต่ถ้ายังมีค่าลบรออยู่ต้องปล่อยให้ลองต่อ
        if (v[j] > 0 && s - tol > rem && dn[(j + 1) * D + (left - t)] === 0) break;
        stack.push({ j, t });
        dfs(j + 1, rem - s, depth + t);
        stack.pop();
        if (stopped) return;
      }
    }
  }
  dfs(0, target, 0);

  // เรียง "ชุดที่น่าเชื่อที่สุด" ขึ้นก่อน: ใช้รายการน้อยกว่า แล้วค่อยดูว่าตรงเป้ากว่า
  for (const r of out) {
    r.count = r.picks.reduce((a, p) => a + p.times, 0);
    r.sum = target + r.diff;
  }
  out.sort((a, b) => a.count - b.count || Math.abs(a.diff) - Math.abs(b.diff) || b.picks[0].g.v - a.picks[0].g.v);
  return { results: out, nodes, ms: now() - t0, stopped, exhausted };
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * นับว่ามีคำตอบทั้งหมดกี่ชุด (หยุดเมื่อถึงเพดานหรือหมดเวลา)
 * ‼️ มีไว้เพื่อบอกความจริงข้อสำคัญที่สุดของงานนี้: คำตอบแทบไม่เคยมีชุดเดียว
 *    ข้อมูลจริงของพี่ปอนด์ เป้า 257,425.30 ใช้ไม่เกิน 3 รายการ = 73 ชุด
 */
export function countAll(groups, target, opt = {}) {
  const r = search(groups, target, { ...opt, maxResults: opt.cap || 1000 });
  return { count: r.results.length, capped: r.results.length >= (opt.cap || 1000), exhausted: r.exhausted, ms: r.ms };
}
