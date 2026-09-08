import { LANG } from "./i18n.js";

// ทะเบียนเครื่องมือ — ไฟล์นี้มีแต่ "ข้อมูล"ไม่ import โค้ดเครื่องมือสักบรรทัด
// หน้าแรกจึงวาดรายการได้โดยไม่ดึงโค้ดของเครื่องมือใดเข้ามาเลย
// libs = ไลบรารีที่เครื่องมือนั้นต้องใช้ (ชื่อตาม src/loader.js) ใช้ทั้งตอนโหลดจริง
// และตอน prefetch ล่วงหน้าเมื่อผู้ใช้เอาเมาส์ไปชี้การ์ด

// accent = สีประจำตระกูล (ชื่อตัวแปร CSS ใน index.html) — หมวดตระกูลเดียวกันใช้สีเดียวกัน
// จงใจไม่ให้สีละหมวด เพราะ 8 สีบนหน้าเดียวทำให้ลายตาและจำไม่ได้
export const GROUPS = [
  { id: "pdf",      label: "จัดการไฟล์ PDF",        short: "จัดการ PDF",  accent: "--g-pdf" },
  { id: "from-pdf", label: "แปลงจาก PDF",           short: "จาก PDF",     accent: "--g-pdf" },
  { id: "to-pdf",   label: "แปลงเป็น PDF",          short: "เป็น PDF",    accent: "--g-pdf" },
  { id: "image",    label: "รูปภาพ",                short: "รูปภาพ",      accent: "--g-img" },
  { id: "doc",      label: "เอกสารและจดหมายเวียน",  short: "Word",        accent: "--g-doc" },
  { id: "ppt",      label: "PowerPoint",            short: "PowerPoint",  accent: "--g-ppt" },
  { id: "data",     label: "ตารางและข้อมูล",        short: "ตาราง",       accent: "--g-data" },
  { id: "thai",     label: "งานเอกสารไทย",          short: "งานไทย",      accent: "--g-thai" },
];

export const TOOLS = [
  { id:"pdf-pages",   group:"pdf", icon:"📑", title:"จัดการหน้า PDF",
    desc:"เลือกเก็บ ลบ สลับลำดับ และหมุนหน้า พร้อมพรีวิวทุกหน้า",
    libs:["pdfjs","pdflib"], keys:"page manager หน้า ลบหน้า หมุน เรียง จัดการ", next:["pdf-merge","pdf-compress"] },

  { id:"pdf-merge",   group:"pdf", icon:"🔗", title:"รวมไฟล์ PDF",
    desc:"รวมหลายไฟล์เป็นเล่มเดียว ลากสลับลำดับได้",
    libs:["pdflib"], keys:"merge combine รวม ต่อ เล่ม", next:["pdf-compress","pdf-watermark","pdf-sign"] },

  { id:"pdf-split",   group:"pdf", icon:"✂", title:"แยกไฟล์ PDF",
    desc:"แยกตามช่วงหน้า ทุก N หน้า หรือแยกทีละหน้า",
    libs:["pdflib","jszip"], keys:"split แยก ตัด ช่วงหน้า", next:["pdf-merge","pdf-pages"] },

  { id:"pdf-compress",group:"pdf", icon:"🗜", title:"บีบอัดไฟล์ PDF",
    desc:"ลดขนาดไฟล์สแกนหรือไฟล์ที่มีรูปเยอะ เทียบขนาดก่อน–หลังให้เห็น",
    libs:["pdfjs","pdflib"], keys:"compress บีบอัด ลดขนาด เล็กลง", next:["pdf-merge","pdf-to-images"] },

  { id:"pdf-sign",group:"pdf", icon:"🖊", title:"เซ็นชื่อบน PDF",
    desc:"วาดลายเซ็นหรืออัปโหลดรูป แล้วลากไปวางบนเอกสาร เก็บลายเซ็นไว้ใช้ซ้ำได้",
    libs:["pdfjs","pdflib"], keys:"sign signature เซ็น ลายเซ็น เซ็นชื่อ สัญญา ใบลา อนุมัติ", next:["pdf-compress","pdf-watermark"] },

  { id:"pdf-watermark",group:"pdf", icon:"💧", title:"ใส่ลายน้ำ PDF",
    desc:"ประทับข้อความไทย–อังกฤษลงทุกหน้า เลือกตำแหน่ง สี และความเข้มได้",
    libs:["pdflib"], keys:"watermark ลายน้ำ ประทับ ลับ confidential ตราประทับ", next:["pdf-compress","pdf-sign"] },

  { id:"pdf-ocr",     group:"pdf", icon:"🔍", title:"OCR อ่านข้อความจากสแกน",
    desc:"อ่านตัวอักษรไทย–อังกฤษจาก PDF สแกน ได้เป็นข้อความหรือ PDF ที่ค้นหาได้",
    libs:["pdfjs","tesseract"], keys:"ocr สแกน อ่านข้อความ ตัวอักษร recognize", next:["pdf-to-text","pdf-to-word"] },

  { id:"pdf-to-images",group:"from-pdf", icon:"🖼", title:"PDF → รูปภาพ",
    desc:"แปลงทุกหน้าเป็น PNG หรือ JPG เลือกความละเอียดได้",
    libs:["pdfjs","jszip"], keys:"image png jpg รูป ภาพ export", next:["image-resize","images-to-pdf"] },

  { id:"pdf-to-text", group:"from-pdf", icon:"📄", title:"PDF → ข้อความ",
    desc:"ดึงข้อความออกมาเป็นไฟล์ TXT พร้อมคัดลอกได้ทันที",
    libs:["pdfjs"], keys:"text txt ข้อความ ดึง copy", next:["pdf-to-word","pdf-ocr"] },

  { id:"pdf-to-word", group:"from-pdf", icon:"📝", title:"PDF → Word",
    desc:"แปลงเนื้อหาเป็นเอกสาร DOCX ที่แก้ไขต่อได้",
    libs:["pdfjs","docx"], keys:"word docx เอกสาร แก้ไข", next:["word-clean","word-to-pdf"] },

  { id:"pdf-to-excel",group:"from-pdf", icon:"📊", title:"PDF → Excel",
    desc:"จับตารางในไฟล์ PDF ออกมาเป็น XLSX",
    libs:["pdfjs","xlsx"], keys:"excel xlsx ตาราง table sheet", next:["excel-csv","thai-date"] },

  { id:"word-to-pdf", group:"to-pdf", icon:"📘", title:"Word → PDF",
    desc:"แปลง DOCX เป็น PDF รองรับภาษาไทยเต็มรูปแบบ ทำได้ทีละหลายไฟล์",
    libs:["mammoth","jspdf"], keys:"word docx pdf แปลง", next:["pdf-merge","pdf-sign"] },

  { id:"excel-to-pdf",group:"to-pdf", icon:"📕", title:"Excel → PDF",
    desc:"แปลงแต่ละชีทเป็นตารางในไฟล์ PDF",
    libs:["xlsx","jspdf","jspdfTable"], keys:"excel xlsx sheet ตาราง pdf", next:["pdf-merge","pdf-watermark"] },

  { id:"images-to-pdf",group:"to-pdf", icon:"🧩", title:"รูปภาพ → PDF",
    desc:"รวมรูปหลายไฟล์เป็น PDF เดียว จัดขนาดหน้าอัตโนมัติ",
    libs:["pdflib"], keys:"image jpg png รูป รวม pdf", next:["pdf-compress","pdf-watermark"] },

  { id:"image-convert",group:"image", icon:"🔄", title:"แปลงชนิดไฟล์รูป",
    desc:"สลับระหว่าง PNG · JPG · WEBP พร้อมปรับคุณภาพ",
    libs:["jszip"], keys:"png jpg webp แปลง รูป convert", next:["image-resize","images-to-pdf"] },

  { id:"image-resize",group:"image", icon:"📐", title:"ย่อ–บีบอัดรูปภาพ",
    desc:"ย่อขนาดและลดน้ำหนักไฟล์รูปทีละหลายไฟล์ เห็นขนาดก่อน–หลัง",
    libs:["jszip"], keys:"resize compress ย่อ ลดขนาด บีบอัด รูป", next:["image-convert","images-to-pdf"] },

  { id:"word-join",group:"doc", icon:"🔗", title:"รวมไฟล์ Word",
    desc:"ต่อเอกสารหลายไฟล์เป็นเล่มเดียว พร้อมรูปภาพครบ ลากจัดลำดับได้",
    libs:["jszip"], keys:"merge join รวม ต่อ เอกสาร word docx เล่ม รายงาน", next:["word-clean","word-to-pdf"] },

  { id:"word-replace",group:"doc", icon:"✏", title:"ค้นหา–แทนที่ทั้งชุด",
    desc:"แก้คำเดิมพร้อมกันหลายไฟล์ เช่นเปลี่ยนชื่อบริษัทหรือปีในเอกสารทั้งกอง",
    libs:["jszip"], keys:"find replace ค้นหา แทนที่ หลายไฟล์ batch แก้ทั้งชุด word", next:["word-clean","word-to-pdf"] },

  { id:"word-clean",group:"doc", icon:"🧹", title:"ตรวจเอกสารก่อนส่ง",
    desc:"หาคอมเมนต์ค้าง ประวัติแก้ไข และชื่อผู้เขียนที่ติดมากับไฟล์ แล้วล้างให้ในคลิกเดียว",
    libs:["jszip"], keys:"clean metadata comment track changes ตรวจ ล้าง คอมเมนต์ ประวัติ ผู้เขียน ความลับ ส่งออก", next:["word-to-pdf","word-join"] },

  { id:"word-mailmerge",group:"doc", icon:"📬", title:"จดหมายเวียน Word + Excel",
    desc:"เอาข้อมูลจาก Excel เติมลงเทมเพลต Word ทีละแถว ได้เอกสารครบทั้งชุดในครั้งเดียว",
    libs:["jszip","xlsx"], keys:"mailmerge mail merge จดหมายเวียน เทมเพลต template word excel ใบรับรอง ใบเสร็จ เวียน", next:["thai-number","word-to-pdf","word-clean"] },

  { id:"powerpoint-to-word",group:"ppt", icon:"📽", title:"PowerPoint → Word",
    desc:"ดึงข้อความทุกสไลด์ หัวข้อย่อย และโน้ตผู้บรรยาย เป็นเอกสาร Word",
    libs:["jszip","docx"], keys:"powerpoint ppt pptx สไลด์ word docx โน้ต presentation แปลง", next:["word-clean","word-to-pdf"] },

  { id:"powerpoint-to-pdf",group:"ppt", icon:"🖥", title:"PowerPoint → PDF",
    desc:"จัดสไลด์เป็นไฟล์ PDF อ่านง่าย 1 สไลด์ = 1 หน้า เลือกธีมได้",
    libs:["jszip","jspdf"], keys:"powerpoint ppt pptx สไลด์ pdf presentation แปลง แจก", next:["pdf-merge","pdf-compress"] },

  { id:"excel-csv",   group:"data", icon:"🔁", title:"สลับ Excel กับ CSV",
    desc:"แปลง XLSX เป็น CSV (แยกทีละชีท) หรือรวม CSV กลับเป็น Excel",
    libs:["xlsx","jszip"], keys:"csv excel xlsx แปลง data ข้อมูล", next:["thai-encoding","excel-to-pdf"] },
  { id:"thai-encoding", group:"thai", icon:"🩹", title:"ซ่อมไฟล์ไทยเพี้ยน",
    desc:"เปิด CSV แล้วเจอ “เธชเธงเธฑ” หรือ “à¸ªà¸§” — ตรวจการเข้ารหัสให้เอง แล้วบันทึกใหม่เป็น UTF-8",
    libs:["jszip"], keys:"encoding tis-620 windows-874 utf-8 เพี้ยน ต่างดาว อ่านไม่ออก มั่ว csv ภาษาไทย ยึกยือ", next:["excel-csv","thai-date"] },

  { id:"thai-date", group:"thai", icon:"📅", title:"สลับปี พ.ศ. กับ ค.ศ. ทั้งคอลัมน์",
    desc:"อ่านวันที่ไทยได้ทุกแบบ (15 ม.ค. 2569 · ๑๕/๐๑/๒๕๖๙) แปลงทั้งคอลัมน์แล้วเลือกรูปแบบผลลัพธ์ได้",
    libs:["xlsx"], keys:"พ.ศ. ค.ศ. buddhist christian ปี วันที่ 543 แปลงปี date excel", next:["thai-id","thai-number"] },

  { id:"thai-id", group:"thai", icon:"🪪", title:"ตรวจเลขบัตร ปชช. / ผู้เสียภาษี",
    desc:"ตรวจหลักตรวจสอบเลข 13 หลักทั้งไฟล์ บอกได้ว่าแถวไหนพิมพ์ผิดและควรเป็นเลขอะไร",
    libs:["xlsx"], keys:"บัตรประชาชน เลขบัตร ผู้เสียภาษี tax id 13 หลัก ตรวจสอบ checksum", next:["thai-date","thai-number"] },

  { id:"thai-name", group:"thai", icon:"👤", since:"2026-09-08", title:"แยกคำนำหน้า–ชื่อ–นามสกุล",
    desc:"แยก “นางสาวสมหญิง ใจดี” เป็น 3 คอลัมน์ เรียงลำดับและทำจดหมายเวียนต่อได้",
    libs:["xlsx"], keys:"ชื่อ นามสกุล คำนำหน้า นาย นาง นางสาว แยกชื่อ split name title prefix hr รายชื่อ", next:["word-mailmerge","thai-id"] },

  { id:"thai-address", group:"thai", icon:"📍", since:"2026-09-08", title:"แยกที่อยู่ไทยเป็นคอลัมน์",
    desc:"แยกตำบล อำเภอ จังหวัด รหัสไปรษณีย์ ออกจากที่อยู่ที่อยู่รวมกันในช่องเดียว",
    libs:["xlsx"], keys:"ที่อยู่ จังหวัด อำเภอ ตำบล เขต แขวง รหัสไปรษณีย์ address province district subdistrict postcode แยกที่อยู่", next:["word-mailmerge","thai-name"] },

  { id:"thai-number", group:"thai", icon:"🔢", title:"ตัวเลข → บาทถ้วน / เลขไทย",
    desc:"128,400 → หนึ่งแสนสองหมื่นแปดพันสี่ร้อยบาทถ้วน · สลับเลขไทย ๑๒๓ กับ 123 ได้ทั้งคอลัมน์",
    libs:["xlsx"], keys:"บาทถ้วน ตัวหนังสือ อ่านตัวเลข bahttext เลขไทย อารบิก ใบเสนอราคา ใบกำกับ เช็ค", next:["word-mailmerge","thai-date"] },
];


export const byId = (id) => TOOLS.find((t) => t.id === id);

/* ─────────────────────────────────────────────────────────────────────────
   คำแปลอังกฤษ — เก็บรวมไว้ก้อนเดียวเพื่อให้ทะเบียนไทยข้างบนอ่านง่ายเหมือนเดิม
   ‼️ ทับค่าลงบนอ็อบเจกต์เดิมตอนโหลดโมดูล ไม่ใช่ห่อด้วยฟังก์ชันแปล
      เพราะ LANG คงที่ตลอดอายุหน้า (สลับภาษา = โหลดใหม่ ดู src/i18n.js)
      ทำแบบนี้แล้วโค้ดที่อ่าน t.title / g.label ทุกจุดไม่ต้องแก้แม้แต่บรรทัดเดียว
   ‼️ แปลเฉพาะข้อความที่ตาเห็น — id / group / libs / next เป็นกุญแจ ห้ามแตะ
   ‼️ keys ไม่ต้องแปล: ตอนเป็นอังกฤษ title/desc กลายเป็นอังกฤษอยู่แล้ว ค้นเจอเอง
   ───────────────────────────────────────────────────────────────────────── */
const EN_GROUPS = {
  "pdf":      ["PDF tools", "PDF"],
  "from-pdf": ["Convert from PDF", "From PDF"],
  "to-pdf":   ["Convert to PDF", "To PDF"],
  "image":    ["Images", "Images"],
  "doc":      ["Documents & mail merge", "Word"],
  "ppt":      ["PowerPoint", "PowerPoint"],
  "data":     ["Spreadsheets & data", "Data"],
  "thai":     ["Thai paperwork", "Thai"],
};

const EN_TOOLS = {
  "pdf-pages":        ["Organise PDF pages", "Keep, delete, reorder and rotate pages, with a preview of every page"],
  "pdf-merge":        ["Merge PDF files", "Combine several files into one, drag to reorder"],
  "pdf-split":        ["Split a PDF", "Split by page range, every N pages, or one file per page"],
  "pdf-compress":     ["Compress a PDF", "Shrink scans and image-heavy files — see the size before and after"],
  "pdf-sign":         ["Sign a PDF", "Draw a signature or upload an image, then drag it onto the page. Saved for reuse"],
  "pdf-watermark":    ["Watermark a PDF", "Stamp text on every page — choose the position, colour and opacity"],
  "pdf-ocr":          ["OCR — read text from scans", "Read Thai and English text out of scanned PDFs as plain text or a searchable PDF"],
  "pdf-to-images":    ["PDF → images", "Turn every page into PNG or JPG at the resolution you choose"],
  "pdf-to-text":      ["PDF → text", "Pull the text out as a TXT file, ready to copy"],
  "pdf-to-word":      ["PDF → Word", "Turn the content into an editable DOCX document"],
  "pdf-to-excel":     ["PDF → Excel", "Capture the tables inside a PDF as an XLSX file"],
  "word-to-pdf":      ["Word → PDF", "Convert DOCX to PDF with full Thai support, several files at a time"],
  "excel-to-pdf":     ["Excel → PDF", "Lay every sheet out as a table in a PDF"],
  "images-to-pdf":    ["Images → PDF", "Combine many images into one PDF, page size fitted automatically"],
  "image-convert":    ["Convert image format", "Move between PNG · JPG · WEBP and set the quality"],
  "image-resize":     ["Resize & compress images", "Shrink dimensions and file size in bulk — see before and after"],
  "word-join":        ["Merge Word files", "Join several documents into one, images intact, drag to reorder"],
  "word-replace":     ["Find & replace in bulk", "Change the same wording across many files — a company name or a year, all at once"],
  "word-clean":       ["Check a document before sending", "Find leftover comments, tracked changes and author names, then clear them in one click"],
  "word-mailmerge":   ["Mail merge — Word + Excel", "Fill a Word template from Excel row by row and get the whole set of documents at once"],
  "powerpoint-to-word": ["PowerPoint → Word", "Pull the text, bullets and speaker notes from every slide into a Word document"],
  "powerpoint-to-pdf":  ["PowerPoint → PDF", "Lay the deck out as a readable PDF — one slide per page, pick a theme"],
  "excel-csv":        ["Excel ⇄ CSV", "Turn XLSX into CSV (one per sheet), or fold CSV files back into Excel"],
  "thai-encoding":    ["Repair garbled Thai files", "Opened a CSV and got “เธชเธงเธฑ” or “à¸ªà¸§”? This detects the encoding and saves it back as UTF-8"],
  "thai-date":        ["Buddhist ⇄ Gregorian years", "Reads every Thai date format (15 ม.ค. 2569 · ๑๕/๐๑/๒๕๖๙), converts a whole column, output format is yours to pick"],
  "thai-id":          ["Check Thai ID / tax numbers", "Verify the check digit of every 13-digit number in a file and see which rows are mistyped"],
  "thai-name":        ["Split Thai name into columns", "Break a full name into title, first name and surname — ready to sort or mail-merge"],
  "thai-address":     ["Split a Thai address", "Pull subdistrict, district, province and postcode out of an address crammed into one cell"],
  "thai-number":      ["Numbers → Thai baht text", "128,400 → หนึ่งแสนสองหมื่นแปดพันสี่ร้อยบาทถ้วน · swap Thai numerals ๑๒๓ and 123 across a column"],
};

if (LANG === "en") {
  for (const g of GROUPS) {
    const e = EN_GROUPS[g.id];
    if (e) { g.label = e[0]; g.short = e[1]; }
  }
  for (const t of TOOLS) {
    const e = EN_TOOLS[t.id];
    if (e) { t.title = e[0]; t.desc = e[1]; }
  }
}
