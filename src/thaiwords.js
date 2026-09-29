// ── นับคำภาษาไทย ─────────────────────────────────────────────────────────────
// ที่มา 29/09/2026: เว็บนับคำดัง (wordcounter.net) ตัดคำด้วยช่องว่าง ประโยคไทยทั้งประโยคจึงนับเป็น 1 คำ
// ใช้ตัวตัดคำของเบราว์เซอร์ (Intl.Segmenter) ซึ่งตัดคำไทยแท้ได้ดี
//
// ‼️ ตัวตัดคำไม่รู้จักคำทับศัพท์ ฉีกเป็นเศษไร้ความหมาย (วัดใน Chrome 148)
//   แดชบอร์ด → แด|ช|บอร์ด   พาวเวอร์ → พา|ว|เวอร์   เมเชอร์ → เม|เชอ|ร์
//   เศษพวกนี้ไม่ใช่คำ นับเข้าไปจำนวนคำจะบวม จึงรวมกลับเข้าคำก่อนหน้า (ดู mergeFragments)
// ‼️ คำประสมถูกแยกตามพจนานุกรม (ยอด|ขาย, เป้า|หมาย) ซึ่งคนไทยเองก็นับไม่ตรงกัน
//   ตัวเลขที่ได้จึงเป็นค่าประมาณเสมอ หน้าจอต้องบอกตรง ๆ และโชว์ให้เห็นว่าตัดตรงไหน

const THAI = /[฀-๿]/;

/* เศษที่ไม่ใช่คำ: พยัญชนะตัวเดียว (ช, ว) หรือพยัญชนะกับการันต์ (ร์, นต์) หรือชิ้นที่ขึ้นต้นด้วยสระบนล่างหรือวรรณยุกต์
   ‼️ ณ กับ ธ เป็นคำจริงที่มีพยัญชนะตัวเดียว (ประชุมณห้องใหญ่ ตัวตัดคำให้ ณ แยกถูกแล้ว) ห้ามรวม */
const FRAGMENT = /^(?:[ก-ฒด-ทน-ฮ]|[ก-ฮ]{1,2}์|[ัิ-ฺ็-๎].*)$/;

/** ตัดคำ คืน [{ text, word }] ครบทุกชิ้นตามลำดับ (รวมช่องว่างและเครื่องหมาย) ต่อกลับได้ข้อความเดิมพอดี */
export function segmentWords(text) {
  const seg = new Intl.Segmenter("th", { granularity: "word" });
  const parts = [];
  for (const s of seg.segment(text || "")) {
    const prev = parts[parts.length - 1];
    /* ต่อเข้าคำก่อนหน้าเฉพาะเมื่อติดกันไม่มีช่องว่างคั่น และคำก่อนหน้าเป็นคำไทย */
    if (s.isWordLike && prev && prev.word && THAI.test(prev.text) && FRAGMENT.test(s.segment)) {
      prev.text += s.segment;
      continue;
    }
    parts.push({ text: s.segment, word: !!s.isWordLike });
  }
  return parts;
}

/** จำนวนตัวอักษรแบบที่ตาเห็น สระกับวรรณยุกต์ที่ซ้อนบนล่างไม่นับแยก */
export function countGraphemes(text) {
  let n = 0;
  for (const _ of new Intl.Segmenter("th", { granularity: "grapheme" }).segment(text || "")) n++;
  return n;
}

/** นับทุกอย่างของข้อความ */
export function countText(text) {
  const t = text || "";
  const parts = segmentWords(t);
  const words = parts.filter((p) => p.word);
  const thai = words.filter((p) => THAI.test(p.text)).length;
  const noSpace = t.replace(/\s+/g, "");
  return {
    words: words.length,
    thaiWords: thai,
    otherWords: words.length - thai,
    graphemes: countGraphemes(noSpace),
    codeUnits: t.length,
    lines: t ? t.split("\n").length : 0,
    paragraphs: t.split(/\n\s*\n/).filter((p) => p.trim()).length,
  };
}
