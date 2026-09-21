// ── เทียบข้อความสองชุด ────────────────────────────────────────────────────
// ‼️ เขียนเองแทนการเพิ่มไลบรารี เพราะอัลกอริทึมนี้สั้นกว่าโค้ดที่ต้องเขียนเพื่อ
//   โหลดไลบรารี ตรวจ SRI และดูแลเวอร์ชัน · และทำให้ไม่ต้องเพิ่มไฟล์ลง vendor/
//
// ‼️ ตัดคำไทยด้วย Intl.Segmenter (พิสูจน์แล้ว 21/09/2026 ว่าเบราว์เซอร์ทำได้ดี)
//   "ค่าจ้างรวมหนึ่งแสนห้าหมื่นบาทถ้วน" ตัดได้เป็น ค่า จ้าง รวม หนึ่ง แสน ห้า หมื่น บาท ถ้วน
//   ถ้าใช้ split(" ") แบบภาษาอังกฤษ ทั้งประโยคไทยจะกลายเป็นคำเดียว
//   แล้วแก้เลขตัวเดียวก็จะฟ้องว่าทั้งบรรทัดเปลี่ยน ซึ่งไร้ประโยชน์กับคนอ่านสัญญา

/** ตัดข้อความเป็นหน่วยที่ใช้เทียบ (คำสำหรับอังกฤษ, คำไทยที่ตัดแล้วสำหรับไทย) */
export function segmentWords(text) {
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    try {
      const seg = new Intl.Segmenter("th", { granularity: "word" });
      return [...seg.segment(text)].map((s) => s.segment).filter((s) => s !== "");
    } catch { /* เบราว์เซอร์เก่าที่ไม่มี Segmenter ใช้ทางสำรองด้านล่าง */ }
  }
  return text.split(/(\s+)/).filter((s) => s !== "");
}

/**
 * หาความต่างของสองลำดับด้วย LCS (longest common subsequence)
 * คืนรายการ { type: "same" | "del" | "add", items: [...] }
 * ‼️ จำกัดขนาดตารางไว้ เพราะ LCS ใช้หน่วยความจำ O(n×m)
 *   เอกสาร 2 ฉบับ ฉบับละ 5,000 คำ = ตาราง 25 ล้านช่อง ซึ่งทำให้แท็บค้าง
 *   เกินเพดานเมื่อไร ถอยไปเทียบแบบหยาบ (เท่ากันทั้งบรรทัดหรือไม่เท่า) แล้วบอกผู้ใช้
 */
const MAX_CELLS = 4_000_000;

export function diffSeq(a, b) {
  if (a.length * b.length > MAX_CELLS) return null;   // ผู้เรียกต้องจัดการเอง
  const n = a.length, m = b.length;
  /* ตาราง LCS แบบแถวเดียวไม่พอ เพราะต้องย้อนรอยเพื่อสร้างผลลัพธ์
     ใช้ Uint32Array เพื่อไม่ให้กินหน่วยความจำเท่า array ปกติ */
  const dp = new Uint32Array((n + 1) * (m + 1));
  const at = (i, j) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[at(i, j)] = a[i] === b[j]
        ? dp[at(i + 1, j + 1)] + 1
        : Math.max(dp[at(i + 1, j)], dp[at(i, j + 1)]);
    }
  }
  const out = [];
  const push = (type, item) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.items.push(item);
    else out.push({ type, items: [item] });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { push("same", a[i]); i++; j++; }
    else if (dp[at(i + 1, j)] >= dp[at(i, j + 1)]) { push("del", a[i]); i++; }
    else { push("add", b[j]); j++; }
  }
  while (i < n) push("del", a[i++]);
  while (j < m) push("add", b[j++]);
  return out;
}

/**
 * เทียบเอกสารสองฉบับที่แบ่งเป็นบรรทัดแล้ว
 * คืน { rows, stats } โดย rows แต่ละแถวคือ { type, a, b, parts }
 *   type: "same" | "changed" | "del" | "add"
 *   parts: ผลเทียบระดับคำ (เฉพาะแถวที่ changed) ไว้ไฮไลต์เฉพาะคำที่ต่าง
 * ‼️ เทียบระดับบรรทัดก่อนเสมอ แล้วค่อยลงระดับคำเฉพาะบรรทัดที่ต่าง
 *   เพราะเทียบระดับคำทั้งเอกสารรวดเดียวจะได้ผลที่อ่านไม่รู้เรื่อง (คำเดียวกันคนละที่จับคู่กันมั่ว)
 *   และช้ากว่ามาก
 */
export function diffLines(linesA, linesB) {
  const seq = diffSeq(linesA, linesB);
  const stats = { same: 0, changed: 0, added: 0, removed: 0, tooBig: false };
  if (!seq) {
    /* เอกสารใหญ่เกินเพดาน เทียบแบบตรงตัวทีละบรรทัดแทน แล้วบอกผู้ใช้ว่าหยาบกว่า */
    const rows = [];
    const n = Math.max(linesA.length, linesB.length);
    for (let i = 0; i < n; i++) {
      const a = linesA[i], b = linesB[i];
      if (a === b) { rows.push({ type: "same", a, b }); stats.same++; }
      else if (a === undefined) { rows.push({ type: "add", b }); stats.added++; }
      else if (b === undefined) { rows.push({ type: "del", a }); stats.removed++; }
      else { rows.push({ type: "changed", a, b, parts: null }); stats.changed++; }
    }
    stats.tooBig = true;
    return { rows, stats };
  }

  /* แปลงผล LCS ระดับบรรทัดเป็นแถวตาราง โดยจับคู่ del กับ add ที่อยู่ติดกันเป็น "แก้ไข"
     ‼️ ต้องจับคู่ ไม่งั้นการแก้ตัวเลขหนึ่งตัวจะแสดงเป็น "ลบทั้งบรรทัด" บวก "เพิ่มทั้งบรรทัด"
        ซึ่งคนอ่านต้องมานั่งไล่เองว่าตรงไหนเปลี่ยน */
  const rows = [];
  for (let k = 0; k < seq.length; k++) {
    const cur = seq[k];
    if (cur.type === "same") {
      for (const line of cur.items) { rows.push({ type: "same", a: line, b: line }); stats.same++; }
      continue;
    }
    const next = seq[k + 1];
    if (cur.type === "del" && next && next.type === "add") {
      const pairs = Math.min(cur.items.length, next.items.length);
      for (let p = 0; p < pairs; p++) {
        const a = cur.items[p], b = next.items[p];
        const parts = diffSeq(segmentWords(a), segmentWords(b));
        rows.push({ type: "changed", a, b, parts });
        stats.changed++;
      }
      for (let p = pairs; p < cur.items.length; p++) { rows.push({ type: "del", a: cur.items[p] }); stats.removed++; }
      for (let p = pairs; p < next.items.length; p++) { rows.push({ type: "add", b: next.items[p] }); stats.added++; }
      k++;    // กิน block ของ add ไปแล้ว
      continue;
    }
    for (const line of cur.items) {
      if (cur.type === "del") { rows.push({ type: "del", a: line }); stats.removed++; }
      else { rows.push({ type: "add", b: line }); stats.added++; }
    }
  }
  return { rows, stats };
}
