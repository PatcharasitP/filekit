import { LANG } from "./i18n.js";

// ทะเบียนเครื่องมือ — ไฟล์นี้มีแต่ "ข้อมูล"ไม่ import โค้ดเครื่องมือสักบรรทัด
// หน้าแรกจึงวาดรายการได้โดยไม่ดึงโค้ดของเครื่องมือใดเข้ามาเลย
// libs = ไลบรารีที่เครื่องมือนั้นต้องใช้ (ชื่อตาม src/loader.js) ใช้ทั้งตอนโหลดจริง
// และตอน prefetch ล่วงหน้าเมื่อผู้ใช้เอาเมาส์ไปชี้การ์ด

// accent = สีประจำตระกูล (ชื่อตัวแปร CSS ใน index.html) — หมวดตระกูลเดียวกันใช้สีเดียวกัน
// จงใจไม่ให้สีละหมวด เพราะ 8 สีบนหน้าเดียวทำให้ลายตาและจำไม่ได้
export const GROUPS = [
  /* ‼️ เดิมแยกเป็นสามหมวด จัดการ/แปลงจาก/แปลงเป็น แล้วยุบเหลือชิปเดียว
     รอบนี้ยุบหัวหมวดในกริดด้วย เหลือ "PDF" อันเดียว (พี่ปอนด์สั่ง 19/09/2026)
     ‼️ กติกาใหม่ที่ตามมา: **เครื่องมือแปลงอยู่ในหมวดของไฟล์ต้นทาง ไม่ใช่ปลายทาง**
        เพราะคนเริ่มจากไฟล์ที่ถืออยู่ในมือ คนมี Excel แล้วอยากได้ PDF
        จะกดหมวด Excel ก่อน ไม่ใช่หมวด PDF ซึ่งยังไม่มีไฟล์อะไรอยู่เลย
        ดังนั้น PDF → X อยู่หมวด PDF · X → PDF ไปอยู่หมวด X */
  { id: "pdf",      label: "PDF",                   short: "PDF", accent: "--g-pdf" },
  { id: "image",    label: "รูปภาพ",                short: "Images",      accent: "--g-img" },
  { id: "doc",      label: "เอกสารและจดหมายเวียน",  short: "Word",        accent: "--g-doc" },
  { id: "ppt",      label: "PowerPoint",            short: "PowerPoint",  accent: "--g-ppt" },
  { id: "excel",    label: "Excel และการคำนวณ",     short: "Excel",       accent: "--g-data" },
  { id: "thai",     label: "งานเอกสารไทย",          short: "Thai",        accent: "--g-thai" },
  // ตระกูล Power Platform ใช้สีเดียวกันทั้งสามหมวด ตามกฎเดียวกับตระกูล PDF ที่ใช้ 3 หมวด 1 สี
  // (เพิ่มสีใหม่ทุกครั้งที่เพิ่มหมวด = หน้าเดียวมีสิบสี ลายตาและจำไม่ได้)
  { id: "powerbi",  label: "Power BI",              short: "Power BI",    accent: "--g-powerbi" },
  { id: "powerquery", label: "Power Query",         short: "Power Query", accent: "--g-powerbi" },
  { id: "powerautomate", label: "Power Automate Cloud", short: "Power Automate", accent: "--g-powerbi" },
];

export const TOOLS = [
  { id:"pdf-pages",   group:"pdf", sub:"organize", icon:"📑", title:"จัดการหน้า PDF",
    desc:"หลายไฟล์มารวมกระดานเดียว เก็บ ลบ สลับลำดับ และหมุนหน้า",
    accepts:["pdf"],
    libs:["pdfjs","pdflib"], keys:"page manager หน้า ลบหน้า หมุน เรียง จัดการ จัดระเบียบ organize หลายไฟล์", next:["pdf-edit","pdf-merge","pdf-compress"] },

  { id:"pdf-edit",    group:"pdf", sub:"stamp", icon:"✏️", title:"แก้ไขและเซ็นบน PDF",
    desc:"ปิดทับข้อความเดิม พิมพ์ใหม่ ไฮไลต์ เซ็นชื่อ และวางรูป ครบในรอบเดียว บันทึกครั้งเดียว ภาษาไทยได้",
    accepts:["pdf"],
    libs:["pdfjs","pdflib"], keys:"edit แก้ไข ข้อความ ลบข้อความ ปิดทับ วันที่ พิมพ์ทับ redact ไฮไลต์ highlight เน้นข้อความ เซ็น ลายเซ็น sign วางรูป โลโก้ ตราประทับ stamp", next:["pdf-pages","pdf-watermark"] },

  { id:"pdf-merge",   group:"pdf", sub:"organize", icon:"🔗", title:"รวมไฟล์ PDF",
    desc:"รวมหลายไฟล์เป็นเล่มเดียว ลากสลับลำดับได้",
    accepts:["pdf"],
    libs:["pdflib"], keys:"merge combine รวม ต่อ เล่ม", next:["pdf-compress","pdf-watermark","pdf-sign"] },

  { id:"pdf-split",   group:"pdf", sub:"organize", icon:"✂", title:"แยกไฟล์ PDF",
    desc:"แยกตามช่วงหน้า ทุก N หน้า หรือแยกทีละหน้า",
    accepts:["pdf"],
    libs:["pdflib","jszip"], keys:"split แยก ตัด ช่วงหน้า", next:["pdf-merge","pdf-pages"] },

  { id:"pdf-compress",group:"pdf", sub:"organize", icon:"🗜", title:"บีบอัดไฟล์ PDF",
    desc:"ลดขนาดไฟล์สแกนหรือไฟล์ที่มีรูปเยอะ เทียบขนาดก่อนกับหลังให้เห็น",
    accepts:["pdf"],
    libs:["pdfjs","pdflib"], keys:"compress บีบอัด ลดขนาด เล็กลง", next:["pdf-merge","pdf-to-images"] },

  { id:"pdf-sign",group:"pdf", sub:"stamp", icon:"🖊", title:"เซ็นชื่อบน PDF",
    desc:"วาดลายเซ็นหรืออัปโหลดรูป แล้วลากไปวางบนเอกสาร เก็บลายเซ็นไว้ใช้ซ้ำได้ ถ้าต้องแก้ข้อความด้วยให้ใช้ตัวแก้ไขและเซ็น",
    accepts:["pdf"],
    libs:["pdfjs","pdflib"], keys:"sign signature เซ็น ลายเซ็น เซ็นชื่อ สัญญา ใบลา อนุมัติ", next:["pdf-edit","pdf-compress","pdf-watermark"] },

  { id:"pdf-protect", group:"pdf", sub:"secure", icon:"🔒", title:"ใส่รหัสผ่าน PDF",
    desc:"ตั้งรหัสให้ต้องใส่ก่อนเปิดไฟล์ และเลือกได้ว่าให้พิมพ์หรือคัดลอกได้ไหม ทำในเครื่องล้วน ไฟล์ไม่ถูกอัปโหลด",
    accepts:["pdf"], since:"2026-09-21",
    libs:["pdflib"], keys:"protect encrypt password lock ใส่รหัส ตั้งรหัส รหัสผ่าน ล็อก ล็อค เข้ารหัส ป้องกัน ความลับ ห้ามพิมพ์ ห้ามคัดลอก", next:["pdf-unlock","pdf-watermark"] },

  { id:"pdf-compare", group:"pdf", sub:"stamp", icon:"⇄", title:"เทียบ PDF สองฉบับ",
    desc:"หาว่าฉบับใหม่แก้ตรงไหนบ้าง ชี้ถึงระดับคำ รองรับภาษาไทย และไฟล์ไม่ถูกอัปโหลดไปไหน",
    accepts:["pdf"], since:"2026-09-21",
    libs:["pdfjs"], keys:"compare diff เทียบ เปรียบเทียบ สองฉบับ แก้ตรงไหน ฉบับแก้ไข สัญญา ร่าง ต่างกัน", next:["pdf-clean","pdf-protect"] },

  { id:"pdf-crop", group:"pdf", sub:"organize", icon:"⬚", title:"ครอบตัดขอบ PDF",
    desc:"ลากคลุมส่วนที่อยากเก็บ ตัดขอบดำจากไฟล์สแกนหรือขอบขาวเยอะเกินไปของสไลด์ ใช้กับทุกหน้าหรือเฉพาะหน้าคี่คู่ได้",
    accepts:["pdf"], since:"2026-09-21",
    libs:["pdfjs","pdflib"], keys:"crop trim ครอบตัด ตัดขอบ ขอบดำ สแกน ขอบขาว ย่อกรอบ", next:["pdf-resize","pdf-nup"] },

  { id:"pdf-resize", group:"pdf", sub:"organize", icon:"📐", title:"เปลี่ยนขนาดกระดาษ PDF",
    desc:"เปลี่ยนเป็น A4, A5, Letter หรือขนาดอื่น เลือกได้ว่าจะย่อให้เห็นครบหรือขยายเต็มกระดาษ ข้อความยังค้นหาได้",
    accepts:["pdf"], since:"2026-09-21",
    libs:["pdflib"], keys:"resize paper size ขนาดกระดาษ a4 a5 letter legal เปลี่ยนขนาด ย่อขยาย แนวตั้ง แนวนอน", next:["pdf-nup","pdf-crop"] },

  { id:"pdf-nup", group:"pdf", sub:"organize", icon:"▦", title:"หลายหน้าต่อแผ่น และหนังสือเล่มเล็ก",
    desc:"ประหยัดกระดาษด้วย 2, 4, 6 หรือ 9 หน้าต่อแผ่น หรือจัดเป็นเล่มพับครึ่งเย็บกลางที่เรียงหน้าถูกต้อง",
    accepts:["pdf"], since:"2026-09-21",
    libs:["pdflib"], keys:"nup booklet หลายหน้าต่อแผ่น ประหยัดกระดาษ พับครึ่ง เย็บกลาง เล่มเล็ก สูจิบัตร คู่มือ 2in1 4in1", next:["pdf-resize","pdf-merge"] },

  { id:"pdf-clean", group:"pdf", sub:"secure", icon:"🧼", title:"ตรวจ PDF ก่อนส่ง",
    desc:"ดูว่าไฟล์พกอะไรติดมาบ้าง ชื่อผู้เขียน คอมเมนต์ ช่องฟอร์ม ไฟล์แนบ สคริปต์ แล้วล้างให้ในคลิกเดียว",
    accepts:["pdf"], since:"2026-09-21",
    libs:["pdflib"], keys:"clean metadata sanitize ตรวจก่อนส่ง ล้างข้อมูล ชื่อผู้เขียน คอมเมนต์ ฟอร์ม ไฟล์แนบ สคริปต์ ข้อมูลแฝง", next:["pdf-redact","pdf-protect"] },

  { id:"pdf-redact", group:"pdf", sub:"secure", icon:"⬛", title:"ลบข้อมูลลับออกจาก PDF",
    desc:"ลากคลุมส่วนที่ต้องการลบ แล้วข้อความใต้กล่องหายจากไฟล์จริง ไม่ใช่แค่วางสี่เหลี่ยมทับที่ลากคัดลอกออกมาได้",
    accepts:["pdf"], since:"2026-09-21",
    libs:["pdfjs","pdflib"], keys:"redact censor ลบข้อมูล ปิดทับ ข้อมูลลับ เซ็นเซอร์ ปกปิด ดำ ลบชื่อ ลบเลขบัตร ลบข้อความจริง", next:["pdf-protect","pdf-clean"] },

  { id:"pdf-unlock", group:"pdf", sub:"secure", icon:"🔓", title:"ปลดรหัสผ่าน PDF",
    desc:"เอารหัสออกจากไฟล์ที่ต้องพิมพ์รหัสทุกครั้ง หรือปลดข้อห้ามคัดลอกและสั่งพิมพ์ ต้องรู้รหัสก่อน ไม่ใช่เครื่องมือเจาะรหัส",
    accepts:["pdf"], since:"2026-09-21",
    libs:["pdflib"], keys:"unlock decrypt remove password ปลดรหัส ถอดรหัส เอารหัสออก ปลดล็อก ปลดล็อค เปิดไฟล์ล็อก คัดลอกไม่ได้ พิมพ์ไม่ได้", next:["pdf-protect","pdf-merge"] },

  { id:"pdf-watermark",group:"pdf", sub:"stamp", icon:"💧", title:"ใส่ลายน้ำ PDF",
    desc:"ประทับข้อความไทย-อังกฤษลงทุกหน้า เลือกตำแหน่ง สี และความเข้มได้",
    accepts:["pdf"],
    libs:["pdflib"], keys:"watermark ลายน้ำ ประทับ ลับ confidential ตราประทับ", next:["pdf-compress","pdf-sign"] },

  { id:"pdf-unstamp", group:"pdf", sub:"stamp", icon:"🧽", title:"ลบชั้นที่ทับบนหน้า PDF",
    desc:"เอาลายน้ำหรือตราที่ถูกวางทับออก เห็นผลทันทีก่อนบันทึก และไม่มีทางลบเนื้อหาจริงพลาด",
    accepts:["pdf"],
    libs:["pdfjs","pdflib"], keys:"remove watermark stamp layer ลบลายน้ำ เอาลายน้ำออก ลบตรา ลบชั้น ลบโลโก้ทับ overlay", next:["pdf-watermark","pdf-compress"] },

  { id:"pdf-page-numbers", group:"pdf", sub:"stamp", icon:"🔢", title:"ใส่เลขหน้า PDF",
    desc:"ใส่เลขหน้า เลขรัน Bates สำหรับงานคดี หรือข้อความของคุณเองลงหัวท้ายกระดาษ เลือกตำแหน่ง รูปแบบ และใช้เลขไทยได้ ข้ามหน้าปกได้",
    accepts:["pdf"],
    libs:["pdflib"], keys:"page number เลขหน้า เลขไทย หน้า numbering ปกสารบัญ รายงาน bates เลขรัน เลขลำดับเอกสาร หัวกระดาษ ท้ายกระดาษ header footer ประทับข้อความ คดี ตรวจสอบ", next:["pdf-merge","pdf-compress"] },

  { id:"pdf-remove-blank", group:"pdf", sub:"organize", icon:"🧹", title:"ลบหน้าว่างจากไฟล์สแกน",
    desc:"สแกนสองหน้าแล้วได้หน้าเปล่าคั่นทุกใบ ตรวจให้เองทีละหน้า กดสลับเก็บหรือลบเองได้",
    accepts:["pdf"],
    libs:["pdfjs","pdflib"], keys:"blank ว่าง เปล่า สแกน scan ลบหน้า สองหน้า duplex หน้าคู่", next:["pdf-compress","pdf-ocr"] },

  { id:"pdf-ocr",     group:"pdf", sub:"stamp", icon:"🔍", title:"OCR อ่านข้อความจากสแกน",
    desc:"อ่านตัวอักษรไทย-อังกฤษจาก PDF สแกน ได้เป็นข้อความหรือ PDF ที่ค้นหาได้",
    accepts:["pdf","image"],
    libs:["pdfjs","tesseract"], keys:"ocr สแกน อ่านข้อความ ตัวอักษร ตัวหนังสือ รูปภาพ ภาพถ่าย recognize", next:["pdf-to-text","pdf-to-word"] },

  { id:"pdf-extract-images", group:"pdf", sub:"convert", icon:"🖼", title:"ดึงรูปออกจาก PDF",
    desc:"ได้รูปที่ฝังอยู่ในไฟล์ตามความละเอียดจริง ไม่ใช่ภาพหน้าจอ เลือกข้ามไอคอนเล็ก ๆ ได้",
    accepts:["pdf"], since:"2026-09-21",
    libs:["pdfjs","jszip"], keys:"extract images ดึงรูป เอารูปออก รูปภาพใน pdf แกะรูป โบรชัวร์ ภาพประกอบ", next:["image-resize","pdf-to-images"] },

  { id:"pdf-to-powerpoint", group:"pdf", sub:"convert", icon:"📽", title:"PDF เป็น PowerPoint",
    desc:"หนึ่งหน้าเป็นหนึ่งสไลด์ เอาไปฉายหรือแทรกในเด็คอื่นได้ บอกตรง ๆ ว่าสไลด์เป็นภาพ แก้ข้อความข้างในไม่ได้",
    accepts:["pdf"], since:"2026-09-21",
    libs:["pdfjs","pptxgen"], keys:"powerpoint pptx สไลด์ นำเสนอ ฉาย ประชุม เด็ค ppt แปลงเป็นสไลด์", next:["powerpoint-to-pdf","pdf-to-images"] },

  { id:"pdf-to-images",group:"pdf", sub:"convert", icon:"🖼", title:"PDF เป็น Images",
    desc:"แปลงทุกหน้าเป็น PNG หรือ JPG เลือกความละเอียดได้",
    accepts:["pdf"],
    libs:["pdfjs","jszip"], keys:"image png jpg รูป ภาพ export", next:["image-resize","images-to-pdf"] },

  { id:"pdf-to-longimage", group:"pdf", sub:"convert", icon:"📜", title:"PDF เป็นภาพยาวแผ่นเดียว",
    desc:"ต่อทุกหน้าเป็นภาพเดียวยาว ๆ ส่งในไลน์แล้วเลื่อนอ่านรวดเดียวจบ ไม่ต้องกดโหลด",
    accepts:["pdf"],
    libs:["pdfjs"], keys:"long image ภาพยาว ต่อภาพ ไลน์ line แชท ส่งรูป สกรีนช็อต pdf เป็นรูป", next:["image-resize","images-to-pdf"] },

  { id:"pdf-to-text", group:"pdf", sub:"convert", icon:"📄", title:"PDF เป็นข้อความ",
    desc:"ดึงข้อความออกมาเป็นไฟล์ TXT พร้อมคัดลอกได้ทันที",
    accepts:["pdf"],
    libs:["pdfjs"], keys:"text txt ข้อความ ดึง copy", next:["pdf-to-word","pdf-ocr"] },

  { id:"pdf-to-word", group:"pdf", sub:"convert", icon:"📝", title:"PDF เป็น Word",
    desc:"แปลงเนื้อหาเป็นเอกสาร DOCX ที่แก้ไขต่อได้",
    accepts:["pdf"],
    libs:["pdfjs","docx"], keys:"word docx เอกสาร แก้ไข", next:["word-clean","word-to-pdf"] },

  { id:"pdf-to-excel",group:"pdf", sub:"convert", icon:"📊", title:"PDF เป็น Excel",
    desc:"จับตารางในไฟล์ PDF ออกมาเป็น XLSX",
    accepts:["pdf"],
    libs:["pdfjs","xlsx"], keys:"excel xlsx ตาราง table sheet", next:["excel-csv","thai-date"] },

  { id:"image-convert",group:"image", icon:"🔄", title:"แปลงชนิดไฟล์รูป",
    desc:"สลับระหว่าง PNG, JPG, WEBP พร้อมปรับคุณภาพ และทำไฟล์ .ico สำหรับใช้เป็น favicon ของเว็บ",
    accepts:["image"],
    libs:["jszip"], keys:"png jpg webp แปลง รูป convert ico favicon ไอคอน ไอคอนเว็บ", next:["image-resize","images-to-pdf"] },

  { id:"image-resize",group:"image", icon:"📐", title:"ย่อและบีบอัดรูปภาพ",
    desc:"ย่อขนาดและลดน้ำหนักไฟล์รูปทีละหลายไฟล์ เห็นขนาดก่อนกับหลัง",
    accepts:["image"],
    libs:["jszip"], keys:"resize compress ย่อ ลดขนาด บีบอัด รูป", next:["image-convert","image-bg-remove"] },

  { id:"image-bg-remove",group:"image", icon:"✂", title:"ลบพื้นหลังรูปภาพ",
    desc:"ทำพื้นหลังให้โปร่งใส ใช้ได้กับลายเซ็นที่ถ่ายบนกระดาษ ตราประทับ โลโก้ และของบนพื้นเรียบ",
    accepts:["image"],
    libs:["jszip"], keys:"background remove transparent โปร่งใส ลบพื้นหลัง ตัดพื้นหลัง ลายเซ็น ตราประทับ โลโก้ png ฉากหลัง", next:["pdf-sign","image-convert"] },

  { id:"images-to-pdf",group:"image", icon:"🧩", title:"Images เป็น PDF",
    desc:"รวมรูปหลายไฟล์เป็น PDF เดียว จัดขนาดหน้าอัตโนมัติ",
    accepts:["image"],
    libs:["pdflib"], keys:"image jpg png รูป รวม pdf", next:["pdf-compress","pdf-watermark"] },

  { id:"word-join",group:"doc", icon:"🔗", title:"รวมไฟล์ Word",
    desc:"ต่อเอกสารหลายไฟล์เป็นเล่มเดียว พร้อมรูปภาพครบ ลากจัดลำดับได้",
    accepts:["docx"],
    libs:["jszip"], keys:"merge join รวม ต่อ เอกสาร word docx เล่ม รายงาน", next:["word-clean","word-to-pdf"] },

  { id:"word-replace",group:"doc", icon:"✏", title:"ค้นหาและแทนที่ทั้งชุด",
    desc:"แก้คำเดิมพร้อมกันหลายไฟล์ เช่นเปลี่ยนชื่อบริษัทหรือปีในเอกสารทั้งกอง",
    accepts:["docx"],
    libs:["jszip"], keys:"find replace ค้นหา แทนที่ หลายไฟล์ batch แก้ทั้งชุด word", next:["word-clean","word-to-pdf"] },

  { id:"word-clean",group:"doc", icon:"🧹", title:"ตรวจเอกสารก่อนส่ง",
    desc:"หาคอมเมนต์ค้าง ประวัติแก้ไข และชื่อผู้เขียนที่ติดมากับไฟล์ แล้วล้างให้ในคลิกเดียว",
    accepts:["docx"],
    libs:["jszip"], keys:"clean metadata comment track changes ตรวจ ล้าง คอมเมนต์ ประวัติ ผู้เขียน ความลับ ส่งออก", next:["word-to-pdf","word-join"] },

  { id:"word-mailmerge",group:"doc", icon:"📬", title:"จดหมายเวียน Word + Excel",
    desc:"เอาข้อมูลจาก Excel เติมลงเทมเพลต Word ทีละแถว ได้เอกสารครบทั้งชุดในครั้งเดียว",
    accepts:["docx"],
    libs:["jszip","xlsx"], keys:"mailmerge mail merge จดหมายเวียน เทมเพลต template word excel ใบรับรอง ใบเสร็จ เวียน", next:["thai-number","word-to-pdf","word-clean"] },

  { id:"word-to-pdf", group:"doc", icon:"📘", title:"Word เป็น PDF",
    desc:"แปลง DOCX เป็น PDF รองรับภาษาไทยเต็มรูปแบบ ทำได้ทีละหลายไฟล์",
    accepts:["docx"],
    libs:["mammoth","jspdf"], keys:"word docx pdf แปลง", next:["pdf-merge","pdf-sign"] },

  { id:"text-to-pdf", group:"doc", icon:"📄", title:"ข้อความเป็น PDF",
    desc:"วางข้อความหรือลากไฟล์ .txt มา ได้ PDF ที่ฝังฟอนต์ไทยให้แล้ว ตัดบรรทัดไม่ฉีกคำ",
    accepts:["txt"], since:"2026-09-21", startsEmpty:true,
    libs:["jspdf"], keys:"text txt ข้อความ โน้ต note บันทึก พิมพ์ เป็น pdf แปลง ตัวอักษร พิมพ์ข้อความ", next:["pdf-merge","pdf-page-numbers"] },

  { id:"powerpoint-to-word",group:"ppt", icon:"📽", title:"PowerPoint เป็น Word",
    desc:"ดึงข้อความทุกสไลด์ หัวข้อย่อย และโน้ตผู้บรรยาย เป็นเอกสาร Word",
    accepts:["pptx"],
    libs:["jszip","docx"], keys:"powerpoint ppt pptx สไลด์ word docx โน้ต presentation แปลง", next:["word-clean","word-to-pdf"] },

  { id:"powerpoint-to-pdf",group:"ppt", icon:"🖥", title:"PowerPoint เป็น PDF",
    desc:"จัดสไลด์เป็นไฟล์ PDF อ่านง่าย 1 สไลด์ = 1 หน้า เลือกธีมได้",
    accepts:["pptx"],
    libs:["jszip","jspdf"], keys:"powerpoint ppt pptx สไลด์ pdf presentation แปลง แจก", next:["pdf-merge","pdf-compress"] },

  { id:"excel-match-sum", group:"excel", icon:"🎯", since:"2026-09-15", title:"หายอดที่บวกกันได้เท่านี้",
    desc:"เงินเข้าก้อนเดียวแต่ในระบบเป็นหลายใบ หาให้ว่าใบไหนบ้างรวมกันได้พอดี ตั้งเงื่อนไขได้ว่ากี่ใบ ช่วงยอดเท่าไร ยอมคลาดเคลื่อนได้แค่ไหน และบอกตรง ๆ ว่าคำตอบมีกี่ชุด",
    accepts:["xlsx","csv","txt"],
    libs:["xlsx"],
    keys:"solver subset sum กระทบยอด reconcile หายอด รวมกันได้ จับคู่ยอด เงินโอน ใบแจ้งหนี้ ผลต่าง หาตัวที่หาย combination excel solver what combination adds up",
    next:["excel-split","excel-csv"] },

  { id:"excel-csv",   group:"excel", icon:"🔁", title:"สลับ Excel กับ CSV",
    desc:"แปลง XLSX เป็น CSV (แยกทีละชีท) หรือรวม CSV กลับเป็น Excel",
    accepts:["xlsx","csv"],
    libs:["xlsx","jszip"], keys:"csv excel xlsx แปลง data ข้อมูล", next:["thai-encoding","excel-to-pdf"] },

  { id:"excel-split", group:"excel", icon:"✂️", title:"แยกไฟล์ Excel ตามคอลัมน์",
    desc:"เลือกคอลัมน์แล้วแยกเป็นไฟล์ละกลุ่ม (ZIP) หรือไฟล์เดียวแยกเป็นชีท",
    accepts:["xlsx","csv","txt"],
    libs:["xlsx","jszip"], keys:"split แยก แบ่ง group แผนก สาขา จังหวัด ตามคอลัมน์ excel", next:["excel-to-pdf","thai-encoding"] },

  { id:"excel-merge", group:"excel", icon:"🧲", title:"รวมหลายไฟล์ Excel",
    desc:"ต่อแถวจากหลายไฟล์เป็นไฟล์เดียว จับคู่คอลัมน์ด้วยชื่อหัวตาราง ไม่ใช่ตำแหน่ง",
    accepts:["xlsx","csv","txt"],
    libs:["xlsx"], keys:"merge รวม ต่อ combine consolidate หลายไฟล์ สาขา excel", next:["excel-split","excel-to-pdf"] },
  { id:"excel-to-pdf",group:"excel", icon:"📕", title:"Excel เป็น PDF",
    desc:"แปลงแต่ละชีทเป็นตารางในไฟล์ PDF",
    accepts:["xlsx","csv"],
    libs:["xlsx","jspdf","jspdfTable"], keys:"excel xlsx sheet ตาราง pdf", next:["pdf-merge","pdf-watermark"] },

  { id:"excel-to-pq", group:"powerquery", icon:"🔤", title:"ตารางเป็นสูตร Power Query",
    desc:"ลากไฟล์ Excel, PDF, Word หรือรูปถ่ายตารางเข้ามา ได้โค้ด #table พร้อมวาง กำหนดชนิดข้อมูลรายคอลัมน์ได้",
    accepts:["xlsx","csv","pdf","docx","image"],
    libs:["xlsx"], keys:"power query m code #table pq โค้ด สูตร excel ชนิดข้อมูล type int64 currency pdf word รูป ocr", next:["excel-split","thai-encoding"] },

  { id:"thai-encoding", group:"thai", icon:"🩹", title:"ซ่อมไฟล์ไทยเพี้ยน",
    desc:"เปิด CSV แล้วเจอ “เธชเธงเธฑ” หรือ “à¸ªà¸§” ตรวจการเข้ารหัสให้เอง แล้วบันทึกใหม่เป็น UTF-8",
    accepts:["csv","txt"],
    libs:["jszip"], keys:"encoding tis-620 windows-874 utf-8 เพี้ยน ต่างดาว อ่านไม่ออก มั่ว csv ภาษาไทย ยึกยือ", next:["excel-csv","thai-date"] },

  { id:"thai-date", group:"thai", icon:"📅", title:"สลับปี พ.ศ. กับ ค.ศ. ทั้งคอลัมน์",
    desc:"อ่านวันที่ไทยได้ทุกแบบ (15 ม.ค. 2569, ๑๕/๐๑/๒๕๖๙) แปลงทั้งคอลัมน์แล้วเลือกรูปแบบผลลัพธ์ได้",
    accepts:["xlsx","csv"],
    libs:["xlsx"], keys:"พ.ศ. ค.ศ. buddhist christian ปี วันที่ 543 แปลงปี date excel", next:["thai-id","thai-number"] },

  { id:"thai-id", group:"thai", icon:"🪪", title:"ตรวจเลขบัตร ปชช. / ผู้เสียภาษี",
    desc:"ตรวจหลักตรวจสอบเลข 13 หลักทั้งไฟล์ บอกได้ว่าแถวไหนพิมพ์ผิดและควรเป็นเลขอะไร",
    accepts:["xlsx","csv"],
    libs:["xlsx"], keys:"บัตรประชาชน เลขบัตร ผู้เสียภาษี tax id 13 หลัก ตรวจสอบ checksum", next:["thai-date","thai-number"] },

  { id:"thai-name", group:"thai", icon:"👤", since:"2026-09-08", title:"แยกคำนำหน้า, ชื่อ, นามสกุล",
    desc:"แยก “นางสาวสมหญิง ใจดี” เป็น 3 คอลัมน์ เรียงลำดับและทำจดหมายเวียนต่อได้",
    accepts:["xlsx","csv"],
    libs:["xlsx"], keys:"ชื่อ นามสกุล คำนำหน้า นาย นาง นางสาว แยกชื่อ split name title prefix hr รายชื่อ", next:["word-mailmerge","thai-id"] },

  { id:"thai-address", group:"thai", icon:"📍", since:"2026-09-08", title:"แยกที่อยู่ไทยเป็นคอลัมน์",
    desc:"แยกตำบล อำเภอ จังหวัด รหัสไปรษณีย์ ออกจากที่อยู่ที่อยู่รวมกันในช่องเดียว",
    accepts:["xlsx","csv"],
    libs:["xlsx"], keys:"ที่อยู่ จังหวัด อำเภอ ตำบล เขต แขวง รหัสไปรษณีย์ address province district subdistrict postcode แยกที่อยู่", next:["word-mailmerge","thai-name"] },

  { id:"thai-number", group:"thai", icon:"🔢", title:"ตัวเลขเป็นบาทถ้วน / เลขไทย",
    desc:"128,400 เป็นหนึ่งแสนสองหมื่นแปดพันสี่ร้อยบาทถ้วน, สลับเลขไทย ๑๒๓ กับ 123 ได้ทั้งคอลัมน์",
    accepts:["xlsx","csv"],
    libs:["xlsx"], keys:"บาทถ้วน ตัวหนังสือ อ่านตัวเลข bahttext เลขไทย อารบิก ใบเสนอราคา ใบกำกับ เช็ค", next:["word-mailmerge","thai-date"] },

  { id:"pbi-donut", group:"powerbi", icon:"🍩", since:"2026-09-11", title:"กราฟโดนัท Deneb",
    desc:"ปรับหน้าตากราฟโดนัทสด ๆ เห็นผลทันที แล้วคัดลอกสเปกไปวางใน Deneb ได้เลย",
    libs:["vega","vegaLite","vegaEmbed"],
    keys:"deneb donut vega โดนัท วงกลม power bi custom visual กราฟ pie พาย",
    next:["pbi-theme","excel-to-pq"] },

  { id:"pbi-bar", group:"powerbi", icon:"📊", since:"2026-09-11", title:"กราฟแท่งแนวนอน Deneb",
    desc:"ปรับแท่ง ป้ายตัวเลข และเส้นเป้าหมายสด ๆ ความยาวแท่งตรงสัดส่วนค่าจริงเสมอ แล้วคัดลอกสเปกไปวางใน Deneb",
    libs:["vega","vegaLite","vegaEmbed"],
    keys:"deneb bar vega แท่ง แนวนอน power bi custom visual กราฟ ranking จัดอันดับ target เป้าหมาย",
    next:["pbi-donut","pbi-theme"] },

  { id:"freebies", group:"powerbi", icon:"🎁", since:"2026-09-12", title:"ของสำเร็จรูปแจกฟรี",
    desc:"สเปก Deneb และฟังก์ชัน Power Query ที่เว็บนี้ใช้อยู่จริง หยิบไปใช้ต่อได้เลย ไม่ต้องเปิดเครื่องมือทีละตัว",
    libs:[], keys:"แจก ฟรี ของแถม สำเร็จรูป template deneb spec m code power query ดาวน์โหลด ก๊อปไปใช้ freebies gift",
    next:["pbi-bar","pq-multisource-lookup"] },

  { id:"pbi-matrix-details", group:"powerbi", icon:"🧾", since:"2026-09-12", title:"รายละเอียดหลายคอลัมน์ในช่องเดียวของ Matrix",
    desc:"ยุบหลายคอลัมน์ให้อยู่ในช่องเดียวของ Matrix โดยหัวแถวยังตรึงอยู่ที่เดิม แปลงทุกชนิดข้อมูลเป็นข้อความให้ก่อน ยอด 0 กับค่า FALSE จึงไม่หาย",
    accepts:["xlsx","csv","txt"],
    libs:["xlsx"], keys:"matrix dax measure text power bi ตรึงคอลัมน์ freeze รายละเอียด transaction details concatenatex sqlbi ยุบคอลัมน์ ข้อความในตาราง",
    next:["pbi-bar","excel-to-pq"] },

  { id:"pbi-theme", group:"powerbi", icon:"🎨", since:"2026-09-12", title:"สร้างธีม Power BI (theme.json)",
    desc:"เลือกชุดสีและขนาดผืนผ้าใบ แล้วเห็นพรีวิวรายงานสด ๆ พร้อมคำเตือนว่าสีไหนอ่านไม่ออกและคนตาบอดสีแยกสีไหนไม่ออก",
    libs:[], keys:"theme json power bi ธีม สี แบรนด์ corporate palette dataColors textClasses คอนทราสต์ ตาบอดสี accessibility contrast",
    next:["pbi-bar","pbi-donut"] },

  { id:"pa-parse-json", group:"powerautomate", icon:"🧩", since:"2026-09-11", title:"ตารางเป็น Schema ของ Parse JSON",
    desc:"อ่านทั้งคอลัมน์ก่อนตัดสินชนิด ช่องที่เคยว่างจริงจะประกาศ null ให้เอง กัน flow พังตอนเจอแถวว่าง",
    accepts:["xlsx","csv","txt"],
    libs:["xlsx"], keys:"power automate flow parse json schema พาร์ส เจสัน โฟลว์ สคีมา อัตโนมัติ",
    next:["excel-to-pq","pbi-donut"] },

  { id:"map-coverage", group:"powerbi", icon:"⭕", since:"2026-09-18", title:"แผนที่พื้นที่รอบจุด",
    desc:"มีพิกัดจุดศูนย์กลาง เช่น สายที่ลูกค้าแจ้ง แล้วอยากรู้ว่ารอบ ๆ มีอะไรอยู่บ้าง ลากไฟล์เข้ามาแล้วเลื่อนแถบรัศมี ภาพกับตัวเลขขยับตามทันที บอกว่าจุดไหนใกล้ที่สุด วงไหนไม่มีอะไรเลย แล้วส่งออกเป็นชีตให้ Icon Map Pro ใน Power BI ทำ slicer ปรับรัศมีต่อได้",
    accepts:["xlsx","csv","txt"],
    libs:["xlsx"],
    keys:"map แผนที่ รัศมี radius วง circle พื้นที่ area coverage buffer call center คอลเซ็นเตอร์ ใกล้ที่สุด nearest ระยะทาง distance haversine icon map pro wkt polygon slicer จุดศูนย์กลาง ครอบคลุม",
    next:["map-relocate","excel-to-pq"] },

  { id:"map-relocate", group:"powerbi", icon:"🗺", since:"2026-09-16", title:"แผนที่การย้ายที่ตั้ง",
    desc:"ไฟล์พิกัดจุดเดิมกับจุดใหม่ กลายเป็นแผนที่ประเทศไทยที่มีจุด เส้นเชื่อม และระยะทางทันที ปรับสีขนาดป้ายเองได้ บันทึกเป็นภาพไปใส่สไลด์ หรือได้ชีตพร้อมใส่ Icon Map Pro ใน Power BI",
    accepts:["xlsx","csv","txt"],
    libs:["xlsx"],
    keys:"map แผนที่ ย้ายสถานี relocate relocation กระจัด พิกัด lat lon latitude longitude ระยะทาง distance haversine icon map pro wkt linestring polygon รัศมี site move จุดเดิม จุดใหม่",
    next:["number-bins","pbi-bar"] },

  { id:"number-bins", group:"powerquery", icon:"📶", since:"2026-09-16", title:"จัดกลุ่มตัวเลขเป็นช่วง",
    desc:"เห็นการกระจายจริงก่อน แล้วให้เครื่องเสนอจุดตัดมาเทียบ 4 แบบ ลากปรับเองได้ ล็อกบางรายการไปหมวดที่ต้องการเองก็ได้ และได้คอลัมน์เลขเรียงคู่มาเสมอ กราฟจึงไม่เรียงมั่ว",
    accepts:["xlsx","csv","txt"],
    libs:["xlsx"],
    keys:"bin binning จัดกลุ่ม แบ่งช่วง ช่วงตัวเลข band bucket range histogram การกระจาย อายุงาน sla ค่าเช่า ระยะทาง quantile quartile decile jenks natural breaks เลขกลม group by range sort by column เรียงมั่ว เรียงผิด",
    next:["pq-group-concat","excel-to-pq"] },

  { id:"pq-multisource-lookup", group:"powerquery", icon:"🧭", since:"2026-09-11", title:"สร้างสูตรค้นข้ามหลายแหล่ง",
    desc:"ไล่หาจากหลายตารางตามลำดับ เจอแหล่งแรกแล้วหยุด ผลลัพธ์ลงคอลัมน์เดียวกันได้แม้แต่ละแหล่งตั้งชื่อคอลัมน์ต่างกัน",
    libs:[],   // เครื่องนี้เขียนโค้ดล้วน ไม่ต้องใช้ไลบรารีนอกเลย
    keys:"power query m lookup merge fallback multisource รวมแหล่ง ค้นข้าม vlookup ไล่หา cascade",
    next:["excel-to-pq","pa-parse-json"] },

  { id:"pq-group-concat", group:"powerquery", icon:"🧵", since:"2026-09-14", title:"ยุบหลายแถวให้เหลือแถวเดียว",
    desc:"หลายสัญญาต่อ 1 สถานีให้เหลือแถวเดียว ค่าต่อกันด้วยจุลภาค ยุบค่าซ้ำและบวกเงินตามที่ยุบได้ แถวที่ค่าว่างก็ยังอ่านคู่กันได้ไม่เลื่อนตำแหน่ง ตั้งค่าครั้งเดียวได้ทั้งโค้ด Power Query และ T-SQL",
    libs:[],
    keys:"power query m group concat ยุบแถว รวมแถว ต่อข้อความ combine rows group by textjoin concatenate สรุปต่อกลุ่ม latest contract sql server t-sql string_agg for xml path",
    next:["pq-multisource-lookup","excel-to-pq"] },

  { id:"pq-to-date", group:"powerquery", icon:"📅", since:"2026-09-14", title:"แปลงข้อความให้เป็นวันที่",
    desc:"คอลัมน์วันที่ที่เก็บเป็นข้อความ แปลงทีเดียวทั้งคอลัมน์ บอกได้ว่าข้อมูลเป็น พ.ศ. หรือ ค.ศ. ไม่ปล่อยให้เครื่องเดาเองจนวันเพี้ยน 543 ปี",
    libs:[],
    keys:"power query m date text แปลงวันที่ พศ คศ buddhist era ปฏิทิน type date locale culture วันที่เพี้ยน 543 เปลี่ยนชนิดข้อมูล sql server t-sql try_convert dateadd",
    next:["pq-pick-date","pq-group-concat"] },

  { id:"pq-pick-date", group:"powerquery", icon:"🗓", since:"2026-09-14", title:"เลือกวันล่าสุดจากหลายคอลัมน์",
    desc:"หลายคอลัมน์วันที่ในแถวเดียว เลือกวันล่าสุด วันรองลงมา หรือวันแรกสุด มาไว้คอลัมน์เดียว เพิ่มได้หลายชั้นเพื่อเอาไปคิดช่วงห่างต่อ",
    libs:[],
    keys:"power query m date max min rank วันล่าสุด วันแรกสุด อันดับ sla ช่วงห่าง list max หลายคอลัมน์ เลือกวันที่ sql server t-sql cross apply row_number",
    next:["pq-to-date","pq-group-concat"] },

  { id:"pa-html-table", group:"powerautomate", icon:"✉", since:"2026-09-11", title:"ตาราง HTML สำหรับอีเมลใน flow",
    desc:"ปรับหน้าตาแล้วเห็นตัวอย่างอีเมลทันที ได้เส้นขอบครบทุกช่องแบบที่ Outlook เดสก์ท็อปยอมแสดง",
    libs:[],
    keys:"power automate flow email html table outlook อีเมล ตาราง เมล compose create html table",
    next:["pa-parse-json","pq-multisource-lookup"] },
];


export const byId = (id) => TOOLS.find((t) => t.id === id);

/* ── กลุ่มย่อยในหมวดใหญ่ ──────────────────────────────────────────────────
   PDF โต 16 → 26 ตัว รายการเดียวยาวเกินกวาดตา จึงหั่น 4 กลุ่มตาม "สิ่งที่ผู้ใช้ตั้งใจทำ"
   ‼️ ที่มาของกลุ่มอยู่ในทะเบียน (ช่อง sub) ลืมใส่ = tests/browser_menu.py จับ ไม่ใช่หายเงียบ */
export const SUBS = {
  pdf: [
    { id: "organize", label: "จัดหน้า PDF" },
    { id: "stamp",    label: "แก้ไขและประทับตรา" },
    { id: "secure",   label: "ความปลอดภัย PDF" },
    { id: "convert",  label: "แปลงจาก PDF" },
  ],
};
const EN_SUBS = { organize: "Organize PDF", stamp: "Edit & stamp", secure: "PDF security", convert: "Convert from PDF" };

/** กลุ่มย่อยพร้อมเครื่องมือในกลุ่ม (ไม่มี = null) */
export const subsOf = (groupId) => {
  const s = SUBS[groupId];
  if (!s) return null;
  return s.map((x) => ({ ...x, tools: TOOLS.filter((t) => t.group === groupId && t.sub === x.id) }))
          .filter((x) => x.tools.length);
};

/* ─────────────────────────────────────────────────────────────────────────
   คำแปลอังกฤษ — เก็บรวมไว้ก้อนเดียวเพื่อให้ทะเบียนไทยข้างบนอ่านง่ายเหมือนเดิม
   ‼️ ทับค่าลงบนอ็อบเจกต์เดิมตอนโหลดโมดูล ไม่ใช่ห่อด้วยฟังก์ชันแปล
      เพราะ LANG คงที่ตลอดอายุหน้า (สลับภาษา = โหลดใหม่ ดู src/i18n.js)
      ทำแบบนี้แล้วโค้ดที่อ่าน t.title / g.label ทุกจุดไม่ต้องแก้แม้แต่บรรทัดเดียว
   ‼️ แปลเฉพาะข้อความที่ตาเห็น — id / group / libs / next เป็นกุญแจ ห้ามแตะ
   ‼️ keys ไม่ต้องแปล: ตอนเป็นอังกฤษ title/desc กลายเป็นอังกฤษอยู่แล้ว ค้นเจอเอง
   ───────────────────────────────────────────────────────────────────────── */
const EN_GROUPS = {
  "pdf":      ["PDF", "PDF"],
  "image":    ["Images", "Images"],
  "doc":      ["Documents & mail merge", "Word"],
  "ppt":      ["PowerPoint", "PowerPoint"],
  "excel":    ["Excel & calculations", "Excel"],
  "thai":     ["Thai paperwork", "Thai"],
  "powerbi":  ["Power BI", "Power BI"],
  "powerquery": ["Power Query", "Power Query"],
  "powerautomate": ["Power Automate Cloud", "Power Automate"],
};

const EN_TOOLS = {
  "pdf-pages":        ["Organise PDF pages", "Keep, delete, reorder and rotate pages, with a preview of every page"],
  "pdf-edit":         ["Edit and sign a PDF", "Cover the old text, type new text, highlight, sign and place images in one pass, then save once. Full Thai support"],
  "pdf-merge":        ["Merge PDF files", "Combine several files into one, drag to reorder"],
  "pdf-split":        ["Split a PDF", "Split by page range, every N pages, or one file per page"],
  "pdf-compress":     ["Compress a PDF", "Shrink scans and image-heavy files. See the size before and after"],
  "pdf-sign":         ["Sign a PDF", "Draw or upload a signature, then drag it onto the document and reuse it later. To edit text as well, use Edit and sign a PDF"],
  "pdf-unstamp":      ["Remove layers stamped on a PDF", "Take off a watermark or stamp that was placed on top. See the result before saving, and your real content can never be removed by mistake"],
  "pdf-protect":      ["Password-protect a PDF", "Set a password that must be typed before the file opens, and choose whether printing or copying stays allowed. Done entirely on your device, nothing is uploaded"],
  "pdf-compare":      ["Compare two PDFs", "Find exactly what the newer version changed, down to the word. Works with Thai, and neither file is uploaded anywhere"],
  "pdf-crop":         ["Crop a PDF", "Drag over what you want to keep. Trims black edges from scans or too much white space around slides, on every page or just the odd or even ones"],
  "pdf-resize":       ["Change a PDF's paper size", "Switch to A4, A5, Letter or another size. Choose whether to fit the whole page or fill the paper. Text stays searchable"],
  "pdf-nup":          ["Multiple pages per sheet, or a booklet", "Save paper with 2, 4, 6 or 9 pages per sheet, or lay it out as a folded booklet with the pages in the right order"],
  "pdf-clean":        ["Check a PDF before sending", "See what the file is carrying, such as the author name, comments, form fields, attachments and scripts, then clear it all in one click"],
  "pdf-redact":       ["Redact a PDF for real", "Drag over what must go and the text underneath is removed from the file, not just covered with a rectangle you can still select and copy"],
  "pdf-unlock":       ["Remove a PDF password", "Take the password off a file you have to unlock every time, or lift a ban on copying and printing. You need the password first, this is not a cracking tool"],
  "pdf-watermark":    ["Watermark a PDF", "Stamp text on every page. Choose the position, colour and opacity"],
  "pdf-page-numbers": ["Add page numbers to a PDF", "Number every page. Pick the position and format, use Thai numerals, and skip the cover"],
  "pdf-remove-blank": ["Remove blank pages from a scan", "Duplex scans leave a blank page between every sheet. Each page is checked for you, and you can keep or drop any of them yourself"],
  "pdf-ocr":          ["OCR (read text from scans)", "Read Thai and English text out of scanned PDFs as plain text or a searchable PDF"],
  "pdf-extract-images": ["Extract images from a PDF", "Get the pictures embedded in the file at their real resolution, not a screenshot. You can skip small icons"],
  "pdf-to-powerpoint": ["PDF to PowerPoint", "One page becomes one slide, ready to present or drop into another deck. Each slide is a picture, so the text inside cannot be edited"],
  "pdf-to-images":    ["PDF to images", "Turn every page into PNG or JPG at the resolution you choose"],
  "pdf-to-longimage": ["PDF to one long image", "Stack every page into a single tall image, ready to send in a chat with no download step"],
  "pdf-to-text":      ["PDF to text", "Pull the text out as a TXT file, ready to copy"],
  "pdf-to-word":      ["PDF to Word", "Turn the content into an editable DOCX document"],
  "pdf-to-excel":     ["PDF to Excel", "Capture the tables inside a PDF as an XLSX file"],
  "word-to-pdf":      ["Word to PDF", "Convert DOCX to PDF with full Thai support, several files at a time"],
  "text-to-pdf":      ["Text to PDF", "Paste text or drop a .txt file and get a PDF with a Thai font already embedded, wrapped without breaking words"],
  "excel-to-pdf":     ["Excel to PDF", "Lay every sheet out as a table in a PDF"],
  "images-to-pdf":    ["Images to PDF", "Combine many images into one PDF, page size fitted automatically"],
  "image-convert":    ["Convert image format", "Move between PNG, JPG, WEBP and set the quality, or build a .ico file to use as your site favicon"],
  "image-bg-remove":  ["Remove image background", "Make the background transparent. Works on signatures photographed on paper, stamps, logos and objects on a plain backdrop"],
  "image-resize":     ["Resize & compress images", "Shrink dimensions and file size in bulk. See before and after"],
  "word-join":        ["Merge Word files", "Join several documents into one, images intact, drag to reorder"],
  "word-replace":     ["Find & replace in bulk", "Change the same wording across many files: a company name or a year, all at once"],
  "word-clean":       ["Check a document before sending", "Find leftover comments, tracked changes and author names, then clear them in one click"],
  "word-mailmerge":   ["Mail merge (Word + Excel)", "Fill a Word template from Excel row by row and get the whole set of documents at once"],
  "powerpoint-to-word": ["PowerPoint to Word", "Pull the text, bullets and speaker notes from every slide into a Word document"],
  "powerpoint-to-pdf":  ["PowerPoint to PDF", "Lay the deck out as a readable PDF. One slide per page, pick a theme"],
  "map-coverage":     ["Map of what is around a point", "Drop in a file of centre points such as customer calls, then drag the radius bar. The map and the numbers move with it. Tells you which point is nearest and which circles are empty, then exports the sheets Icon Map Pro needs so Power BI can slice by radius"],
  "map-relocate":     ["Map of site moves", "Turn a file of old and new coordinates into a Thailand map with dots, joining lines and distances. Style it yourself, save it as an image for a deck, or export the sheets Icon Map Pro needs in Power BI"],
  "number-bins":      ["Group numbers into bands", "See the real spread first, compare four ways to cut the groups, drag any cut point by hand, lock chosen rows into a group of your own, and always get the sort column that keeps charts in the right order"],
  "excel-match-sum":  ["Find rows that add up to an amount", "One payment lands but the system holds many invoices. This finds which rows add up to it, with your own rules for how many rows, what size, and how close is close enough, and it says how many different answers exist"],
  "excel-csv":        ["Excel ⇄ CSV", "Turn XLSX into CSV (one per sheet), or fold CSV files back into Excel"],
  "excel-to-pq":      ["Table to a Power Query formula", "Drop in an Excel, PDF, Word file or a photo of a table and get ready-to-paste #table code. Pick the Power Query type for every column"],
  "excel-split":      ["Split an Excel file by column", "Pick a column and split into one file per group (ZIP), or one file with a sheet per group"],
  "excel-merge":      ["Merge several Excel files", "Append rows from many files into one. Columns are matched by header name, not position"],
  "thai-encoding":    ["Repair garbled Thai files", "Opened a CSV and got “เธชเธงเธฑ” or “à¸ªà¸§”? This detects the encoding and saves it back as UTF-8"],
  "thai-date":        ["Buddhist ⇄ Gregorian years", "Reads every Thai date format (15 ม.ค. 2569, ๑๕/๐๑/๒๕๖๙), converts a whole column, output format is yours to pick"],
  "thai-id":          ["Check Thai ID / tax numbers", "Verify the check digit of every 13-digit number in a file and see which rows are mistyped"],
  "thai-name":        ["Split Thai name into columns", "Break a full name into title, first name and surname, ready to sort or mail-merge"],
  "thai-address":     ["Split a Thai address", "Pull subdistrict, district, province and postcode out of an address crammed into one cell"],
  "thai-number":      ["Numbers to Thai baht text", "128,400 to หนึ่งแสนสองหมื่นแปดพันสี่ร้อยบาทถ้วน, swap Thai numerals ๑๒๓ and 123 across a column"],
  "freebies":         ["Ready made files, free to take", "Deneb specs and a Power Query function this site actually uses, take them as they are without opening each tool"],
  "pbi-matrix-details": ["Matrix transaction details in one column", "Fold several columns into a single matrix column while the row headers stay frozen, every data type is turned into text first so zeros and FALSE never vanish"],
  "pbi-bar":          ["Deneb horizontal bar chart", "Tweak the bars, value labels and target line live, with bar length always true to the real numbers, then copy the spec into Deneb"],
  "pbi-donut":        ["Deneb donut chart", "Tweak a live donut chart and see it change instantly, then copy the spec straight into Deneb"],
  "pbi-theme":        ["Build a Power BI theme (theme.json)", "Pick a palette and a canvas size, watch a live report preview, and get told which colours fall below the contrast floor or merge for colour blind viewers"],
  "pa-parse-json":    ["Table to a Parse JSON schema", "Reads the whole column before deciding the type, so columns that really do go blank are declared nullable and your flow survives them"],
  "pq-to-date":       ["Turn text into real dates", "Convert a whole column of text dates at once, telling it whether the years are Buddhist or Common era instead of letting the machine guess and shift everything by 543 years"],
  "pq-pick-date":     ["Pick the latest date across columns", "Bring the latest, the one before it, or the earliest of several date columns into a single column, stacked in as many layers as you need for gap calculations"],
  "pq-group-concat":  ["Collapse many rows into one", "Turn many contracts per site into a single row, values joined by commas, with repeats collapsed and their amounts added up, and blanks that still line up column by column"],
  "pq-multisource-lookup": ["Build a multi source lookup", "Search several tables in order and stop at the first hit, with results landing in one column even when each source names it differently"],
  "pa-html-table":    ["HTML table for a flow email", "Style it and see the email straight away, with the per cell borders that Outlook desktop actually renders"],
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
  for (const list of Object.values(SUBS)) {
    for (const s of list) if (EN_SUBS[s.id]) s.label = EN_SUBS[s.id];
  }
}


/** ชิปกรองของหมวดนี้ — หลายหมวดใช้ชิปเดียวกันได้ (เช่นตระกูล PDF สามหมวดใช้ชิป "pdf") */
export const chipOf = (groupId) => {
  const g = GROUPS.find((x) => x.id === groupId);
  return (g && g.chip) || groupId;
};
