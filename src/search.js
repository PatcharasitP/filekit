// ─────────────────────────────────────────────────────────────────────────────
// การค้นหาเครื่องมือ — ยอมให้พิมพ์ไม่ครบ พิมพ์ผิด และลืมสลับแป้นพิมพ์
// ‼️ ภาษาไทยไม่มีเว้นวรรคระหว่างคำ และ \b ใน regex ใช้ไม่ได้ → ใช้การเทียบสตริงตรง ๆ
//    กับการเทียบแบบข้ามตัวอักษร (subsequence) เท่านั้น ห้ามพึ่งขอบเขตคำ
// ─────────────────────────────────────────────────────────────────────────────

// แป้นเกษมณี: กดปุ่มอังกฤษตัวไหน ได้อักษรไทยตัวไหน (ไว้กู้เคส "ลืมสลับแป้น")
const KEDMANEE = {
  "1":"ๅ","2":"/","3":"-","4":"ภ","5":"ถ","6":"ุ","7":"ึ","8":"ค","9":"ต","0":"จ","-":"ข","=":"ช",
  q:"ๆ", w:"ไ", e:"ำ", r:"พ", t:"ะ", y:"ั", u:"ี", i:"ร", o:"น", p:"ย", "[":"บ", "]":"ล",
  a:"ฟ", s:"ห", d:"ก", f:"ด", g:"เ", h:"้", j:"่", k:"า", l:"ส", ";":"ว", "'":"ง",
  z:"ผ", x:"ป", c:"แ", v:"อ", b:"ิ", n:"ื", m:"ท", ",":"ม", ".":"ใ", "/":"ฝ",
  Q:"๐", W:"\"", E:"ฎ", R:"ฑ", T:"ธ", Y:"ํ", U:"๊", I:"ณ", O:"ฯ", P:"ญ", "{":"ฐ", "}":",",
  A:"ฤ", S:"ฆ", D:"ฏ", F:"โ", G:"ฌ", H:"็", J:"๋", K:"ษ", L:"ศ", ":":"ซ", "\"":".",
  Z:"(", X:")", C:"ฉ", V:"ฮ", B:"ฺ", N:"์", M:"?", "<":"ฒ", ">":"ฬ", "?":"ฦ",
};

/** แปลงคำที่พิมพ์ด้วยแป้นอังกฤษ ให้เป็นอักษรไทยตามตำแหน่งปุ่ม */
export function enToThai(s) {
  let out = "", hit = 0;
  for (const ch of s) {
    const t = KEDMANEE[ch];
    if (t) { out += t; hit++; } else out += ch;
  }
  return hit >= 2 ? out : null;   // ต้องแปลงได้อย่างน้อย 2 ตัวถึงจะถือว่าน่าจะตั้งใจพิมพ์ไทย
}

/** ตัดวรรณยุกต์/ไม้ไต่คู้ออก เพื่อให้พิมพ์ไม่ใส่วรรณยุกต์ก็ยังเจอ */
const stripTone = (s) => s.replace(/[็-๎]/g, "");

const norm = (s) => stripTone(String(s).toLowerCase().replace(/\s+/g, " ").trim());

// ‼️ คำย่อภาษาไทยเต็มไปด้วยจุด (พ.ศ. · ม.ค. · ก.พ.) แต่คนพิมพ์ค้นหามักไม่ใส่จุด
//    จึงต้องเทียบอีกชั้นแบบ "ถอดจุด/ขีด/ช่องว่างออกทั้งหมด" ไม่งั้นพิมพ์ "พศ" แล้วไม่เจออะไรเลย
const compact = (s) => norm(s).replace(/[\s.\-_/]/g, "");

/** เทียบแบบข้ามตัวอักษรได้ — "รวมpdf" เจอ "รวมไฟล์ PDF" · คืน null ถ้าไม่ตรง */
function subseqScore(hay, q) {
  let i = 0, gaps = 0, last = -1;
  for (const ch of q) {
    const at = hay.indexOf(ch, i);
    if (at < 0) return null;
    if (last >= 0 && at > last + 1) gaps += at - last - 1;
    last = at; i = at + 1;
  }
  return Math.max(0, 30 - Math.min(gaps, 25));
}

/**
 * ให้คะแนนความเข้ากันของเครื่องมือกับคำค้น (สูง = ตรงกว่า) · 0 = ไม่ตรงเลย
 * ลำดับความสำคัญ: ชื่อขึ้นต้นตรง > ชื่อมีคำนี้ > คำสำคัญ/คำอธิบายมีคำนี้ > ข้ามตัวอักษรในชื่อ
 */
export function scoreTool(t, rawQ) {
  const q = norm(rawQ);
  if (!q) return 1;
  const title = norm(t.title);
  const keys = norm(t.keys || "");
  const desc = norm(t.desc || "");
  const id = norm(t.id);

  const tries = [q];
  const alt = enToThai(rawQ);
  if (alt) tries.push(norm(alt));

  let best = 0;
  for (let k = 0; k < tries.length; k++) {
    const s = tries[k];
    const penalty = k ? 12 : 0;               // ผลจากการเดาแป้นพิมพ์ ให้คะแนนน้อยกว่าที่พิมพ์ตรง
    // คิดคะแนนทุกทางแล้วเอาสูงสุด — ห้ามใช้ if-else ต่อกันเป็นลูกโซ่ เพราะทางที่ตรงกว่า
    // อาจอยู่ล่างสุดแล้วถูกทางที่หยาบกว่าตัดหน้าไปก่อน (เจอจริงตอนเทส: "รวมpdf")
    const cq = compact(s);
    let sc = 0;
    const bump = (v) => { if (v > sc) sc = v; };
    if (title.startsWith(s)) bump(100);
    if (title.includes(s)) bump(85);
    if (cq.length >= 2 && compact(t.title).includes(cq)) bump(78);
    if (id.includes(s)) bump(70);
    if (keys.includes(s)) bump(62);
    if (desc.includes(s)) bump(48);
    if (cq.length >= 2 && compact(t.keys || "").includes(cq)) bump(40);
    if (s.length >= 3) {
      const sub = subseqScore(title, s);
      if (sub != null) bump(58 - (30 - sub));     // ยิ่งตัวอักษรอยู่ห่างกัน คะแนนยิ่งลด
    }
    if (sc) best = Math.max(best, sc - penalty);
  }
  return best;
}

/** คืนรายการเครื่องมือที่ตรง เรียงคะแนนมากไปน้อย (คงลำดับเดิมเมื่อคะแนนเท่ากัน) */
export function searchTools(tools, q, min = 20) {
  if (!q.trim()) return tools.map((t) => ({ t, score: 1 }));
  return tools
    .map((t, i) => ({ t, i, score: scoreTool(t, q) }))
    .filter((r) => r.score >= min)
    .sort((a, b) => b.score - a.score || a.i - b.i);
}

/**
 * ตำแหน่งที่ควรไฮไลต์ในชื่อเครื่องมือ — คืน null ถ้าไม่ควรไฮไลต์
 * ‼️ ตรงนี้ห้ามใช้ norm() เพราะมันตัดวรรณยุกต์และยุบช่องว่าง ทำให้ตำแหน่งตัวอักษร
 *    เลื่อนไม่ตรงกับสตริงต้นฉบับ แล้วไฮไลต์จะไปคร่อมผิดตัว
 */
export function highlightRange(title, rawQ) {
  const lower = title.toLowerCase();
  const cands = [rawQ.toLowerCase().trim()];
  const alt = enToThai(rawQ);
  if (alt) cands.push(alt.toLowerCase().trim());
  for (const c of cands) {
    if (!c) continue;
    const at = lower.indexOf(c);
    if (at >= 0) return [at, at + c.length];
  }
  return null;
}
