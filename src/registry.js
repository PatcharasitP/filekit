import { LANG } from "./i18n.js";

// ทะเบียนเครื่องมือ — ไฟล์นี้มีแต่ "ข้อมูล"ไม่ import โค้ดเครื่องมือสักบรรทัด
// หน้าแรกจึงวาดรายการได้โดยไม่ดึงโค้ดของเครื่องมือใดเข้ามาเลย
// libs = ไลบรารีที่เครื่องมือนั้นต้องใช้ (ชื่อตาม src/loader.js) ใช้ทั้งตอนโหลดจริง
// และตอน prefetch ล่วงหน้าเมื่อผู้ใช้เอาเมาส์ไปชี้การ์ด
// คำค้นสำรองอยู่ src/registry-keys.js โหลดตอนแตะช่องค้นหา ห้ามใส่ keys ที่นี่

// accent = สีประจำตระกูล (ชื่อตัวแปร CSS ใน index.html) — หมวดตระกูลเดียวกันใช้สีเดียวกัน
// จงใจไม่ให้สีละหมวด เพราะ 8 สีบนหน้าเดียวทำให้ลายตาและจำไม่ได้
export const GROUPS = [
  /* ‼️ เดิมแยกเป็นสามหมวด จัดการ/แปลงจาก/แปลงเป็น แล้วยุบเหลือชิปเดียว
     รอบนี้ยุบหัวหมวดในกริดด้วย เหลือ "PDF" อันเดียว (พี่ปอนด์สั่ง 19/09/2026)
     ‼️ กติกาใหม่ที่ตามมา: **เครื่องมือแปลงอยู่ในหมวดของไฟล์ต้นทาง ไม่ใช่ปลายทาง**
        เพราะคนเริ่มจากไฟล์ที่ถืออยู่ในมือ คนมี Excel แล้วอยากได้ PDF
        จะกดหมวด Excel ก่อน ไม่ใช่หมวด PDF ซึ่งยังไม่มีไฟล์อะไรอยู่เลย
        ดังนั้น PDF → X อยู่หมวด PDF · X → PDF ไปอยู่หมวด X */
  { id: "pdf", label: "PDF", short: "PDF", accent: "--g-pdf" },
  { id: "image", label: "รูปภาพ", short: "Images", accent: "--g-img" },
  { id: "doc", label: "เอกสารและจดหมายเวียน", short: "Word", accent: "--g-doc" },
  { id: "ppt", label: "PowerPoint", short: "PowerPoint", accent: "--g-ppt" },
  { id: "excel", label: "Excel และการคำนวณ", short: "Excel", accent: "--g-data" },
  { id: "thai", label: "งานเอกสารไทย", short: "Thai", accent: "--g-thai" },
  // ตระกูล Power Platform ใช้สีเดียวกันทั้งสามหมวด ตามกฎเดียวกับตระกูล PDF ที่ใช้ 3 หมวด 1 สี
  // (เพิ่มสีใหม่ทุกครั้งที่เพิ่มหมวด = หน้าเดียวมีสิบสี ลายตาและจำไม่ได้)
  { id: "powerbi", label: "Power BI", short: "Power BI", accent: "--g-powerbi" },
  { id: "powerquery", label: "Power Query", short: "Power Query", accent: "--g-powerbi" },
  { id: "powerautomate", label: "Power Automate Cloud", short: "Power Automate", accent: "--g-powerbi" },
];

export const TOOLS = [
  { id:"pdf-pages",   group:"pdf", sub:"organize", icon:"📑", title:"จัดการหน้า PDF",
    desc:"หลายไฟล์มารวมกระดานเดียว เก็บ ลบ สลับลำดับ และหมุนหน้า",
    accepts:["pdf"],
    libs:["pdfjs","pdflib"], next:["pdf-edit","pdf-merge","pdf-compress"] },

  { id:"pdf-edit",    group:"pdf", sub:"stamp", icon:"✏️", title:"แก้ไขและเซ็นบน PDF",
    desc:"ปิดทับข้อความเดิม พิมพ์ใหม่ ไฮไลต์ เซ็นชื่อ และวางรูป ครบในรอบเดียว บันทึกครั้งเดียว ภาษาไทยได้",
    accepts:["pdf"],
    libs:["pdfjs","pdflib"], next:["pdf-pages","pdf-watermark"] },

  { id:"pdf-merge",   group:"pdf", sub:"organize", icon:"🔗", title:"รวมไฟล์ PDF",
    desc:"รวมหลายไฟล์เป็นเล่มเดียว ลากสลับลำดับได้",
    accepts:["pdf"],
    libs:["pdflib"], next:["pdf-compress","pdf-watermark","pdf-sign"] },

  { id:"pdf-split",   group:"pdf", sub:"organize", icon:"✂", title:"แยกไฟล์ PDF",
    desc:"แยกตามช่วงหน้า ทุก N หน้า หรือแยกทีละหน้า",
    accepts:["pdf"],
    libs:["pdflib","jszip"], next:["pdf-merge","pdf-pages"] },

  { id:"pdf-compress",group:"pdf", sub:"organize", icon:"🗜", title:"บีบอัดไฟล์ PDF",
    desc:"ลดขนาดไฟล์สแกนหรือไฟล์ที่มีรูปเยอะ เทียบขนาดก่อนกับหลังให้เห็น",
    accepts:["pdf"],
    libs:["pdfjs","pdflib"], next:["pdf-merge","pdf-to-images"] },

  { id:"pdf-sign",group:"pdf", sub:"stamp", icon:"🖊", title:"เซ็นชื่อบน PDF",
    desc:"วาดลายเซ็นหรืออัปโหลดรูป แล้วลากไปวางบนเอกสาร เก็บลายเซ็นไว้ใช้ซ้ำได้ ถ้าต้องแก้ข้อความด้วยให้ใช้ตัวแก้ไขและเซ็น",
    accepts:["pdf"],
    libs:["pdfjs","pdflib"], next:["pdf-edit","pdf-compress","pdf-watermark"] },

  { id:"pdf-protect", group:"pdf", sub:"secure", icon:"🔒", title:"ใส่รหัสผ่าน PDF",
    desc:"ตั้งรหัสให้ต้องใส่ก่อนเปิดไฟล์ และเลือกได้ว่าให้พิมพ์หรือคัดลอกได้ไหม ทำในเครื่องล้วน ไฟล์ไม่ถูกอัปโหลด",
    accepts:["pdf"], since:"2026-09-21",
    libs:["pdflib"], next:["pdf-unlock","pdf-watermark"] },

  { id:"pdf-compare", group:"pdf", sub:"stamp", icon:"⇄", title:"เทียบ PDF สองฉบับ",
    desc:"หาว่าฉบับใหม่แก้ตรงไหนบ้าง ชี้ถึงระดับคำ รองรับภาษาไทย และไฟล์ไม่ถูกอัปโหลดไปไหน",
    accepts:["pdf"], since:"2026-09-21",
    libs:["pdfjs"], next:["pdf-clean","pdf-protect"] },

  { id:"pdf-crop", group:"pdf", sub:"organize", icon:"⬚", title:"ครอบตัดขอบ PDF",
    desc:"ลากคลุมส่วนที่อยากเก็บ ตัดขอบดำจากไฟล์สแกนหรือขอบขาวเยอะเกินไปของสไลด์ ใช้กับทุกหน้าหรือเฉพาะหน้าคี่คู่ได้",
    accepts:["pdf"], since:"2026-09-21",
    libs:["pdfjs","pdflib"], next:["pdf-resize","pdf-nup"] },

  { id:"pdf-resize", group:"pdf", sub:"organize", icon:"📐", title:"เปลี่ยนขนาดกระดาษ PDF",
    desc:"เปลี่ยนเป็น A4, A5, Letter หรือขนาดอื่น เลือกได้ว่าจะย่อให้เห็นครบหรือขยายเต็มกระดาษ ข้อความยังค้นหาได้",
    accepts:["pdf"], since:"2026-09-21",
    libs:["pdflib"], next:["pdf-nup","pdf-crop"] },

  { id:"pdf-nup", group:"pdf", sub:"organize", icon:"▦", title:"หลายหน้าต่อแผ่น และหนังสือเล่มเล็ก",
    desc:"ประหยัดกระดาษด้วย 2, 4, 6 หรือ 9 หน้าต่อแผ่น หรือจัดเป็นเล่มพับครึ่งเย็บกลางที่เรียงหน้าถูกต้อง",
    accepts:["pdf"], since:"2026-09-21",
    libs:["pdflib"], next:["pdf-resize","pdf-merge"] },

  { id:"pdf-clean", group:"pdf", sub:"secure", icon:"🧼", title:"ตรวจ PDF ก่อนส่ง",
    desc:"ดูว่าไฟล์พกอะไรติดมาบ้าง ชื่อผู้เขียน คอมเมนต์ ช่องฟอร์ม ไฟล์แนบ สคริปต์ แล้วล้างให้ในคลิกเดียว",
    accepts:["pdf"], since:"2026-09-21",
    libs:["pdflib"], next:["pdf-redact","pdf-protect"] },

  { id:"pdf-redact", group:"pdf", sub:"secure", icon:"⬛", title:"ลบข้อมูลลับออกจาก PDF",
    desc:"ลากคลุมส่วนที่ต้องการลบ แล้วข้อความใต้กล่องหายจากไฟล์จริง ไม่ใช่แค่วางสี่เหลี่ยมทับที่ลากคัดลอกออกมาได้",
    accepts:["pdf"], since:"2026-09-21",
    libs:["pdfjs","pdflib"], next:["pdf-protect","pdf-clean"] },

  { id:"pdf-unlock", group:"pdf", sub:"secure", icon:"🔓", title:"ปลดรหัสผ่าน PDF",
    desc:"เอารหัสออกจากไฟล์ที่ต้องพิมพ์รหัสทุกครั้ง หรือปลดข้อห้ามคัดลอกและสั่งพิมพ์ ต้องรู้รหัสก่อน ไม่ใช่เครื่องมือเจาะรหัส",
    accepts:["pdf"], since:"2026-09-21",
    libs:["pdflib"], next:["pdf-protect","pdf-merge"] },

  { id:"pdf-watermark",group:"pdf", sub:"stamp", icon:"💧", title:"ใส่ลายน้ำ PDF",
    desc:"ประทับข้อความไทย-อังกฤษลงทุกหน้า เลือกตำแหน่ง สี และความเข้มได้",
    accepts:["pdf"],
    libs:["pdflib"], next:["pdf-compress","pdf-sign"] },

  { id:"pdf-unstamp", group:"pdf", sub:"stamp", icon:"🧽", title:"ลบชั้นที่ทับบนหน้า PDF",
    desc:"เอาลายน้ำหรือตราที่ถูกวางทับออก เห็นผลทันทีก่อนบันทึก และไม่มีทางลบเนื้อหาจริงพลาด",
    accepts:["pdf"],
    libs:["pdfjs","pdflib"], next:["pdf-watermark","pdf-compress"] },

  { id:"pdf-page-numbers", group:"pdf", sub:"stamp", icon:"🔢", title:"ใส่เลขหน้า PDF",
    desc:"ใส่เลขหน้า เลขรัน Bates สำหรับงานคดี หรือข้อความของคุณเองลงหัวท้ายกระดาษ เลือกตำแหน่ง รูปแบบ และใช้เลขไทยได้ ข้ามหน้าปกได้",
    accepts:["pdf"],
    libs:["pdflib"], next:["pdf-merge","pdf-compress"] },

  { id:"pdf-remove-blank", group:"pdf", sub:"organize", icon:"🧹", title:"ลบหน้าว่างจากไฟล์สแกน",
    desc:"สแกนสองหน้าแล้วได้หน้าเปล่าคั่นทุกใบ ตรวจให้เองทีละหน้า กดสลับเก็บหรือลบเองได้",
    accepts:["pdf"],
    libs:["pdfjs","pdflib"], next:["pdf-compress","pdf-ocr"] },

  { id:"pdf-ocr",     group:"pdf", sub:"stamp", icon:"🔍", title:"OCR อ่านข้อความจากสแกน",
    desc:"อ่านตัวอักษรไทย-อังกฤษจาก PDF สแกน ได้เป็นข้อความหรือ PDF ที่ค้นหาได้",
    accepts:["pdf","image"],
    libs:["pdfjs","tesseract"], next:["pdf-to-text","pdf-to-word"] },

  { id:"pdf-extract-images", group:"pdf", sub:"convert", icon:"🖼", title:"ดึงรูปออกจาก PDF",
    desc:"ได้รูปที่ฝังอยู่ในไฟล์ตามความละเอียดจริง ไม่ใช่ภาพหน้าจอ เลือกข้ามไอคอนเล็ก ๆ ได้",
    accepts:["pdf"], since:"2026-09-21",
    libs:["pdfjs","jszip"], next:["image-resize","pdf-to-images"] },

  { id:"pdf-to-powerpoint", group:"pdf", sub:"convert", icon:"📽", title:"PDF เป็น PowerPoint",
    desc:"หนึ่งหน้าเป็นหนึ่งสไลด์ เอาไปฉายหรือแทรกในเด็คอื่นได้ บอกตรง ๆ ว่าสไลด์เป็นภาพ แก้ข้อความข้างในไม่ได้",
    accepts:["pdf"], since:"2026-09-21",
    libs:["pdfjs","pptxgen"], next:["powerpoint-to-pdf","pdf-to-images"] },

  { id:"pdf-to-images",group:"pdf", sub:"convert", icon:"🖼", title:"PDF เป็น Images",
    desc:"แปลงทุกหน้าเป็น PNG หรือ JPG เลือกความละเอียดได้",
    accepts:["pdf"],
    libs:["pdfjs","jszip"], next:["image-resize","images-to-pdf"] },

  { id:"pdf-to-longimage", group:"pdf", sub:"convert", icon:"📜", title:"PDF เป็นภาพยาวแผ่นเดียว",
    desc:"ต่อทุกหน้าเป็นภาพเดียวยาว ๆ ส่งในไลน์แล้วเลื่อนอ่านรวดเดียวจบ ไม่ต้องกดโหลด",
    accepts:["pdf"],
    libs:["pdfjs"], next:["image-resize","images-to-pdf"] },

  { id:"pdf-to-text", group:"pdf", sub:"convert", icon:"📄", title:"PDF เป็นข้อความ",
    desc:"ดึงข้อความออกมาเป็นไฟล์ TXT พร้อมคัดลอกได้ทันที",
    accepts:["pdf"],
    libs:["pdfjs"], next:["pdf-to-word","pdf-ocr"] },

  { id:"pdf-to-word", group:"pdf", sub:"convert", icon:"📝", title:"PDF เป็น Word",
    desc:"แปลงเนื้อหาเป็นเอกสาร DOCX ที่แก้ไขต่อได้",
    accepts:["pdf"],
    libs:["pdfjs","docx"], next:["word-clean","word-to-pdf"] },

  { id:"pdf-to-excel",group:"pdf", sub:"convert", icon:"📊", title:"PDF เป็น Excel",
    desc:"จับตารางในไฟล์ PDF ออกมาเป็น XLSX",
    accepts:["pdf"],
    libs:["pdfjs","xlsx"], next:["excel-csv","thai-date"] },

  { id:"image-convert",group:"image", icon:"🔄", title:"แปลงชนิดไฟล์รูป",
    desc:"สลับระหว่าง PNG, JPG, WEBP พร้อมปรับคุณภาพ และทำไฟล์ .ico สำหรับใช้เป็น favicon ของเว็บ",
    accepts:["image"],
    libs:["jszip"], next:["image-resize","images-to-pdf"] },

  { id:"image-resize",group:"image", icon:"📐", title:"ย่อและบีบอัดรูปภาพ",
    desc:"ย่อขนาดและลดน้ำหนักไฟล์รูปทีละหลายไฟล์ เห็นขนาดก่อนกับหลัง",
    accepts:["image"],
    libs:["jszip"], next:["image-convert","image-bg-remove"] },

  { id:"image-bg-remove",group:"image", icon:"✂", title:"ลบพื้นหลังรูปภาพ",
    desc:"ทำพื้นหลังให้โปร่งใส ใช้ได้กับลายเซ็นที่ถ่ายบนกระดาษ ตราประทับ โลโก้ และของบนพื้นเรียบ",
    accepts:["image"],
    libs:["jszip"], next:["pdf-sign","image-convert"] },

  { id:"images-to-pdf",group:"image", icon:"🧩", title:"Images เป็น PDF",
    desc:"รวมรูปหลายไฟล์เป็น PDF เดียว จัดขนาดหน้าอัตโนมัติ",
    accepts:["image"],
    libs:["pdflib"], next:["pdf-compress","pdf-watermark"] },

  { id:"word-join",group:"doc", icon:"🔗", title:"รวมไฟล์ Word",
    desc:"ต่อเอกสารหลายไฟล์เป็นเล่มเดียว พร้อมรูปภาพครบ ลากจัดลำดับได้",
    accepts:["docx"],
    libs:["jszip"], next:["word-clean","word-to-pdf"] },

  { id:"word-replace",group:"doc", icon:"✏", title:"ค้นหาและแทนที่ทั้งชุด",
    desc:"แก้คำเดิมพร้อมกันหลายไฟล์ เช่นเปลี่ยนชื่อบริษัทหรือปีในเอกสารทั้งกอง",
    accepts:["docx"],
    libs:["jszip"], next:["word-clean","word-to-pdf"] },

  { id:"word-clean",group:"doc", icon:"🧹", title:"ตรวจเอกสารก่อนส่ง",
    desc:"หาคอมเมนต์ค้าง ประวัติแก้ไข และชื่อผู้เขียนที่ติดมากับไฟล์ แล้วล้างให้ในคลิกเดียว",
    accepts:["docx"],
    libs:["jszip"], next:["word-to-pdf","word-join"] },

  { id:"word-mailmerge",group:"doc", icon:"📬", title:"จดหมายเวียน Word + Excel",
    desc:"เอาข้อมูลจาก Excel เติมลงเทมเพลต Word ทีละแถว ได้เอกสารครบทั้งชุดในครั้งเดียว",
    accepts:["docx"],
    libs:["jszip","xlsx"], next:["thai-number","word-to-pdf","word-clean"] },

  { id:"word-to-pdf", group:"doc", icon:"📘", title:"Word เป็น PDF",
    desc:"แปลง DOCX เป็น PDF รองรับภาษาไทยเต็มรูปแบบ ทำได้ทีละหลายไฟล์",
    accepts:["docx"],
    libs:["mammoth","jspdf"], next:["pdf-merge","pdf-sign"] },

  { id:"text-to-pdf", group:"doc", icon:"📄", title:"ข้อความเป็น PDF",
    desc:"วางข้อความหรือลากไฟล์ .txt มา ได้ PDF ที่ฝังฟอนต์ไทยให้แล้ว ตัดบรรทัดไม่ฉีกคำ",
    accepts:["txt"], since:"2026-09-21", startsEmpty:true,
    libs:["jspdf"], next:["pdf-merge","pdf-page-numbers"] },

  { id:"powerpoint-to-word",group:"ppt", icon:"📽", title:"PowerPoint เป็น Word",
    desc:"ดึงข้อความทุกสไลด์ หัวข้อย่อย และโน้ตผู้บรรยาย เป็นเอกสาร Word",
    accepts:["pptx"],
    libs:["jszip","docx"], next:["word-clean","word-to-pdf"] },

  { id:"powerpoint-to-pdf",group:"ppt", icon:"🖥", title:"PowerPoint เป็น PDF",
    desc:"จัดสไลด์เป็นไฟล์ PDF อ่านง่าย 1 สไลด์ = 1 หน้า เลือกธีมได้",
    accepts:["pptx"],
    libs:["jszip","jspdf"], next:["pdf-merge","pdf-compress"] },

  { id:"excel-match-sum", group:"excel", icon:"🎯", since:"2026-09-15", title:"หายอดที่บวกกันได้เท่านี้",
    desc:"เงินเข้าก้อนเดียวแต่ในระบบเป็นหลายใบ หาให้ว่าใบไหนบ้างรวมกันได้พอดี ตั้งเงื่อนไขได้ว่ากี่ใบ ช่วงยอดเท่าไร ยอมคลาดเคลื่อนได้แค่ไหน และบอกตรง ๆ ว่าคำตอบมีกี่ชุด",
    accepts:["xlsx","csv","txt"],
    libs:["xlsx"],
    next:["excel-split","excel-csv"] },

  { id:"excel-csv",   group:"excel", icon:"🔁", title:"สลับ Excel กับ CSV",
    desc:"แปลง XLSX เป็น CSV (แยกทีละชีท) หรือรวม CSV กลับเป็น Excel",
    accepts:["xlsx","csv"],
    libs:["xlsx","jszip"], next:["thai-encoding","excel-to-pdf"] },

  { id:"excel-split", group:"excel", icon:"✂️", title:"แยกไฟล์ Excel ตามคอลัมน์",
    desc:"เลือกคอลัมน์แล้วแยกเป็นไฟล์ละกลุ่ม (ZIP) หรือไฟล์เดียวแยกเป็นชีท",
    accepts:["xlsx","csv","txt"],
    libs:["xlsx","jszip"], next:["excel-to-pdf","thai-encoding"] },

  { id:"excel-merge", group:"excel", icon:"🧲", title:"รวมหลายไฟล์ Excel",
    desc:"ต่อแถวจากหลายไฟล์เป็นไฟล์เดียว จับคู่คอลัมน์ด้วยชื่อหัวตาราง ไม่ใช่ตำแหน่ง",
    accepts:["xlsx","csv","txt"],
    libs:["xlsx"], next:["excel-split","excel-to-pdf"] },
  { id:"excel-to-pdf",group:"excel", icon:"📕", title:"Excel เป็น PDF",
    desc:"แปลงแต่ละชีทเป็นตารางในไฟล์ PDF",
    accepts:["xlsx","csv"],
    libs:["xlsx","jspdf","jspdfTable"], next:["pdf-merge","pdf-watermark"] },

  { id:"excel-to-pq", group:"powerquery", icon:"🔤", title:"ตารางเป็นสูตร Power Query",
    desc:"ลากไฟล์ Excel, PDF, Word หรือรูปถ่ายตารางเข้ามา ได้โค้ด #table พร้อมวาง กำหนดชนิดข้อมูลรายคอลัมน์ได้",
    accepts:["xlsx","csv","pdf","docx","image"],
    libs:["xlsx"], next:["excel-split","thai-encoding"] },

  { id:"thai-encoding", group:"thai", icon:"🩹", title:"ซ่อมไฟล์ไทยเพี้ยน",
    desc:"เปิด CSV แล้วเจอ “เธชเธงเธฑ” หรือ “à¸ªà¸§” ตรวจการเข้ารหัสให้เอง แล้วบันทึกใหม่เป็น UTF-8",
    accepts:["csv","txt"],
    libs:["jszip"], next:["excel-csv","thai-date"] },

  { id:"thai-date", group:"thai", icon:"📅", title:"สลับปี พ.ศ. กับ ค.ศ. ทั้งคอลัมน์",
    desc:"อ่านวันที่ไทยได้ทุกแบบ (15 ม.ค. 2569, ๑๕/๐๑/๒๕๖๙) แปลงทั้งคอลัมน์แล้วเลือกรูปแบบผลลัพธ์ได้",
    accepts:["xlsx","csv"],
    libs:["xlsx"], next:["thai-id","thai-number"] },

  { id:"thai-id", group:"thai", icon:"🪪", title:"ตรวจเลขบัตร ปชช. / ผู้เสียภาษี",
    desc:"ตรวจหลักตรวจสอบเลข 13 หลักทั้งไฟล์ บอกได้ว่าแถวไหนพิมพ์ผิดและควรเป็นเลขอะไร",
    accepts:["xlsx","csv"],
    libs:["xlsx"], next:["thai-date","thai-number"] },

  { id:"thai-name", group:"thai", icon:"👤", since:"2026-09-08", title:"แยกคำนำหน้า, ชื่อ, นามสกุล",
    desc:"แยก “นางสาวสมหญิง ใจดี” เป็น 3 คอลัมน์ เรียงลำดับและทำจดหมายเวียนต่อได้",
    accepts:["xlsx","csv"],
    libs:["xlsx"], next:["word-mailmerge","thai-id"] },

  { id:"thai-address", group:"thai", icon:"📍", since:"2026-09-08", title:"แยกที่อยู่ไทยเป็นคอลัมน์",
    desc:"แยกตำบล อำเภอ จังหวัด รหัสไปรษณีย์ ออกจากที่อยู่ที่อยู่รวมกันในช่องเดียว",
    accepts:["xlsx","csv"],
    libs:["xlsx"], next:["word-mailmerge","thai-name"] },

  { id:"thai-number", group:"thai", icon:"🔢", title:"ตัวเลขเป็นบาทถ้วน / เลขไทย",
    desc:"128,400 เป็นหนึ่งแสนสองหมื่นแปดพันสี่ร้อยบาทถ้วน, สลับเลขไทย ๑๒๓ กับ 123 ได้ทั้งคอลัมน์",
    accepts:["xlsx","csv"],
    libs:["xlsx"], next:["word-mailmerge","thai-date"] },

  { id:"pbi-donut", group:"powerbi", icon:"🍩", since:"2026-09-11", title:"กราฟโดนัท Deneb",
    desc:"ปรับหน้าตากราฟโดนัทสด ๆ เห็นผลทันที แล้วคัดลอกสเปกไปวางใน Deneb ได้เลย",
    libs:["vega","vegaLite","vegaEmbed"],
    next:["pbi-theme","excel-to-pq"] },

  { id:"pbi-bar", group:"powerbi", icon:"📊", since:"2026-09-11", title:"กราฟแท่งแนวนอน Deneb",
    desc:"ปรับแท่ง ป้ายตัวเลข และเส้นเป้าหมายสด ๆ ความยาวแท่งตรงสัดส่วนค่าจริงเสมอ แล้วคัดลอกสเปกไปวางใน Deneb",
    libs:["vega","vegaLite","vegaEmbed"],
    next:["pbi-donut","pbi-theme"] },

  { id:"freebies", group:"powerbi", icon:"🎁", since:"2026-09-12", title:"ของสำเร็จรูปแจกฟรี",
    desc:"สเปก Deneb และฟังก์ชัน Power Query ที่เว็บนี้ใช้อยู่จริง หยิบไปใช้ต่อได้เลย ไม่ต้องเปิดเครื่องมือทีละตัว",
    libs:[],
    next:["pbi-bar","pq-multisource-lookup"] },

  { id:"pbi-matrix-details", group:"powerbi", icon:"🧾", since:"2026-09-12", title:"รายละเอียดหลายคอลัมน์ในช่องเดียวของ Matrix",
    desc:"ยุบหลายคอลัมน์ให้อยู่ในช่องเดียวของ Matrix โดยหัวแถวยังตรึงอยู่ที่เดิม แปลงทุกชนิดข้อมูลเป็นข้อความให้ก่อน ยอด 0 กับค่า FALSE จึงไม่หาย",
    accepts:["xlsx","csv","txt"],
    libs:["xlsx"],
    next:["pbi-bar","excel-to-pq"] },

  { id:"pbi-theme", group:"powerbi", icon:"🎨", since:"2026-09-12", title:"สร้างธีม Power BI (theme.json)",
    desc:"เลือกชุดสีและขนาดผืนผ้าใบ แล้วเห็นพรีวิวรายงานสด ๆ พร้อมคำเตือนว่าสีไหนอ่านไม่ออกและคนตาบอดสีแยกสีไหนไม่ออก",
    libs:[],
    next:["pbi-bar","pbi-donut"] },

  { id:"pa-parse-json", group:"powerautomate", icon:"🧩", since:"2026-09-11", title:"ตารางเป็น Schema ของ Parse JSON",
    desc:"อ่านทั้งคอลัมน์ก่อนตัดสินชนิด ช่องที่เคยว่างจริงจะประกาศ null ให้เอง กัน flow พังตอนเจอแถวว่าง",
    accepts:["xlsx","csv","txt"],
    libs:["xlsx"],
    next:["excel-to-pq","pbi-donut"] },

  { id:"map-coverage", group:"powerbi", icon:"⭕", since:"2026-09-18", title:"แผนที่พื้นที่รอบจุด",
    desc:"มีพิกัดจุดศูนย์กลาง เช่น สายที่ลูกค้าแจ้ง แล้วอยากรู้ว่ารอบ ๆ มีอะไรอยู่บ้าง ลากไฟล์เข้ามาแล้วเลื่อนแถบรัศมี ภาพกับตัวเลขขยับตามทันที บอกว่าจุดไหนใกล้ที่สุด วงไหนไม่มีอะไรเลย แล้วส่งออกเป็นชีตให้ Icon Map Pro ใน Power BI ทำ slicer ปรับรัศมีต่อได้",
    accepts:["xlsx","csv","txt"],
    libs:["xlsx"],
    next:["map-relocate","excel-to-pq"] },

  { id:"map-relocate", group:"powerbi", icon:"🗺", since:"2026-09-16", title:"แผนที่การย้ายที่ตั้ง",
    desc:"ไฟล์พิกัดจุดเดิมกับจุดใหม่ กลายเป็นแผนที่ประเทศไทยที่มีจุด เส้นเชื่อม และระยะทางทันที ปรับสีขนาดป้ายเองได้ บันทึกเป็นภาพไปใส่สไลด์ หรือได้ชีตพร้อมใส่ Icon Map Pro ใน Power BI",
    accepts:["xlsx","csv","txt"],
    libs:["xlsx"],
    next:["number-bins","pbi-bar"] },

  { id:"number-bins", group:"powerquery", icon:"📶", since:"2026-09-16", title:"จัดกลุ่มตัวเลขเป็นช่วง",
    desc:"เห็นการกระจายจริงก่อน แล้วให้เครื่องเสนอจุดตัดมาเทียบ 4 แบบ ลากปรับเองได้ ล็อกบางรายการไปหมวดที่ต้องการเองก็ได้ และได้คอลัมน์เลขเรียงคู่มาเสมอ กราฟจึงไม่เรียงมั่ว",
    accepts:["xlsx","csv","txt"],
    libs:["xlsx"],
    next:["pq-group-concat","excel-to-pq"] },

  { id:"pq-multisource-lookup", group:"powerquery", icon:"🧭", since:"2026-09-11", title:"สร้างสูตรค้นข้ามหลายแหล่ง",
    desc:"ไล่หาจากหลายตารางตามลำดับ เจอแหล่งแรกแล้วหยุด ผลลัพธ์ลงคอลัมน์เดียวกันได้แม้แต่ละแหล่งตั้งชื่อคอลัมน์ต่างกัน",
    libs:[],
    next:["excel-to-pq","pa-parse-json"] },

  { id:"pq-group-concat", group:"powerquery", icon:"🧵", since:"2026-09-14", title:"ยุบหลายแถวให้เหลือแถวเดียว",
    desc:"หลายสัญญาต่อ 1 สถานีให้เหลือแถวเดียว ค่าต่อกันด้วยจุลภาค ยุบค่าซ้ำและบวกเงินตามที่ยุบได้ แถวที่ค่าว่างก็ยังอ่านคู่กันได้ไม่เลื่อนตำแหน่ง ตั้งค่าครั้งเดียวได้ทั้งโค้ด Power Query และ T-SQL",
    libs:[],
    next:["pq-multisource-lookup","excel-to-pq"] },

  { id:"pq-to-date", group:"powerquery", icon:"📅", since:"2026-09-14", title:"แปลงข้อความให้เป็นวันที่",
    desc:"คอลัมน์วันที่ที่เก็บเป็นข้อความ แปลงทีเดียวทั้งคอลัมน์ บอกได้ว่าข้อมูลเป็น พ.ศ. หรือ ค.ศ. ไม่ปล่อยให้เครื่องเดาเองจนวันเพี้ยน 543 ปี",
    libs:[],
    next:["pq-pick-date","pq-group-concat"] },

  { id:"pq-pick-date", group:"powerquery", icon:"🗓", since:"2026-09-14", title:"เลือกวันล่าสุดจากหลายคอลัมน์",
    desc:"หลายคอลัมน์วันที่ในแถวเดียว เลือกวันล่าสุด วันรองลงมา หรือวันแรกสุด มาไว้คอลัมน์เดียว เพิ่มได้หลายชั้นเพื่อเอาไปคิดช่วงห่างต่อ",
    libs:[],
    next:["pq-to-date","pq-group-concat"] },

  { id:"pq-combine", group:"powerquery", icon:"🧩", since:"2026-09-26", title:"รวมหลาย query เป็นตัวเดียว",
    desc:"ข้อมูลหลาย server ต่อเป็นตารางเดียวใน query เดียว เพิ่มแหล่งแค่เพิ่มแถว",
    libs:[],
    next:["pq-multisource-lookup","pq-group-concat"] },

  { id:"pa-html-table", group:"powerautomate", icon:"✉", since:"2026-09-11", title:"ตาราง HTML สำหรับอีเมลใน flow",
    desc:"ปรับหน้าตาแล้วเห็นตัวอย่างอีเมลทันที ได้เส้นขอบครบทุกช่องแบบที่ Outlook เดสก์ท็อปยอมแสดง",
    libs:[],
    next:["pa-parse-json","pq-multisource-lookup"] },
];


export const byId = (id) => TOOLS.find((t) => t.id === id);

/* ── กลุ่มย่อยในหมวดใหญ่ ──────────────────────────────────────────────────
   PDF โต 16 → 26 ตัว รายการเดียวยาวเกินกวาดตา จึงหั่น 4 กลุ่มตาม "สิ่งที่ผู้ใช้ตั้งใจทำ"
   ‼️ ที่มาของกลุ่มอยู่ในทะเบียน (ช่อง sub) ลืมใส่ = tests/browser_menu.py จับ ไม่ใช่หายเงียบ */
export const SUBS = {
  pdf: [
    { id: "organize", label: "จัดหน้า PDF" },
    { id: "stamp", label: "แก้ไขและประทับตรา" },
    { id: "secure", label: "ความปลอดภัย PDF" },
    { id: "convert", label: "แปลงจาก PDF" },
  ],
};

/** กลุ่มย่อยพร้อมเครื่องมือในกลุ่ม (ไม่มี = null) */
export const subsOf = (groupId) => {
  const s = SUBS[groupId];
  if (!s) return null;
  return s.map((x) => ({ ...x, tools: TOOLS.filter((t) => t.group === groupId && t.sub === x.id) }))
          .filter((x) => x.tools.length);
};

// คำแปลอังกฤษอยู่ src/registry-en.js โหลดเฉพาะโหมดอังกฤษ โหลดไม่ได้ก็ใช้ชื่อไทยต่อ ดีกว่าหน้าว่าง
if (LANG === "en") {
  try {
    const { EN_GROUPS, EN_TOOLS, EN_SUBS } = await import("./registry-en.js");
    for (const g of GROUPS) {
      const e = EN_GROUPS[g.id];
      if (e) { g.label = e[0]; g.short = e[1]; }
    }
    for (const t of TOOLS) {
      const e = EN_TOOLS[t.id];
      if (e) { t.title = e[0]; t.desc = e[1]; }
    }
    for (const list of Object.values(SUBS)) {
      for (const s of list) if (EN_SUBS[s.id]) s.label = EN_SUBS[s.id];
    }
  } catch { /* ใช้ชื่อไทยต่อ */ }
}


/** ชิปกรองของหมวดนี้ — หลายหมวดใช้ชิปเดียวกันได้ (เช่นตระกูล PDF สามหมวดใช้ชิป "pdf") */
export const chipOf = (groupId) => {
  const g = GROUPS.find((x) => x.id === groupId);
  return (g && g.chip) || groupId;
};
