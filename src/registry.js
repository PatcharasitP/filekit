// ทะเบียนเครื่องมือ — ไฟล์นี้มีแต่ "ข้อมูล" ไม่ import โค้ดเครื่องมือสักบรรทัด
// หน้าแรกจึงวาดรายการได้โดยไม่ดึงโค้ดของเครื่องมือใดเข้ามาเลย
// libs = ไลบรารีที่เครื่องมือนั้นต้องใช้ (ชื่อตาม src/loader.js) ใช้ทั้งตอนโหลดจริง
// และตอน prefetch ล่วงหน้าเมื่อผู้ใช้เอาเมาส์ไปชี้การ์ด

export const GROUPS = [
  { id: "pdf", label: "จัดการไฟล์ PDF" },
  { id: "from-pdf", label: "แปลงจาก PDF" },
  { id: "to-pdf", label: "แปลงเป็น PDF" },
  { id: "image", label: "รูปภาพ" },
  { id: "doc", label: "เอกสารและจดหมายเวียน" },
  { id: "ppt", label: "PowerPoint" },
  { id: "data", label: "ตารางและข้อมูล" },
];

export const TOOLS = [
  { id:"pdf-pages",   group:"pdf", icon:"📑", title:"จัดการหน้า PDF",
    desc:"เลือกเก็บ ลบ สลับลำดับ และหมุนหน้า พร้อมพรีวิวทุกหน้า",
    libs:["pdfjs","pdflib"], keys:"page manager หน้า ลบหน้า หมุน เรียง จัดการ" },

  { id:"pdf-merge",   group:"pdf", icon:"🔗", title:"รวมไฟล์ PDF",
    desc:"รวมหลายไฟล์เป็นเล่มเดียว ลากสลับลำดับได้",
    libs:["pdflib"], keys:"merge combine รวม ต่อ เล่ม" },

  { id:"pdf-split",   group:"pdf", icon:"✂️", title:"แยกไฟล์ PDF",
    desc:"แยกตามช่วงหน้า ทุก N หน้า หรือแยกทีละหน้า",
    libs:["pdflib","jszip"], keys:"split แยก ตัด ช่วงหน้า" },

  { id:"pdf-compress",group:"pdf", icon:"🗜️", title:"บีบอัดไฟล์ PDF",
    desc:"ลดขนาดไฟล์สแกนหรือไฟล์ที่มีรูปเยอะ เทียบขนาดก่อน–หลังให้เห็น",
    libs:["pdfjs","pdflib"], keys:"compress บีบอัด ลดขนาด เล็กลง" },

  { id:"pdf-watermark",group:"pdf", icon:"💧", title:"ใส่ลายน้ำ PDF",
    desc:"ประทับข้อความไทย–อังกฤษลงทุกหน้า เลือกตำแหน่ง สี และความเข้มได้",
    libs:["pdflib"], keys:"watermark ลายน้ำ ประทับ ลับ confidential ตราประทับ" },

  { id:"pdf-ocr",     group:"pdf", icon:"🔍", title:"OCR อ่านข้อความจากสแกน",
    desc:"อ่านตัวอักษรไทย–อังกฤษจาก PDF สแกน ได้เป็นข้อความหรือ PDF ที่ค้นหาได้",
    libs:["pdfjs","tesseract"], keys:"ocr สแกน อ่านข้อความ ตัวอักษร recognize" },

  { id:"pdf-to-images",group:"from-pdf", icon:"🖼️", title:"PDF → รูปภาพ",
    desc:"แปลงทุกหน้าเป็น PNG หรือ JPG เลือกความละเอียดได้",
    libs:["pdfjs","jszip"], keys:"image png jpg รูป ภาพ export" },

  { id:"pdf-to-text", group:"from-pdf", icon:"📄", title:"PDF → ข้อความ",
    desc:"ดึงข้อความออกมาเป็นไฟล์ TXT พร้อมคัดลอกได้ทันที",
    libs:["pdfjs"], keys:"text txt ข้อความ ดึง copy" },

  { id:"pdf-to-word", group:"from-pdf", icon:"📝", title:"PDF → Word",
    desc:"แปลงเนื้อหาเป็นเอกสาร DOCX ที่แก้ไขต่อได้",
    libs:["pdfjs","docx"], keys:"word docx เอกสาร แก้ไข" },

  { id:"pdf-to-excel",group:"from-pdf", icon:"📊", title:"PDF → Excel",
    desc:"จับตารางในไฟล์ PDF ออกมาเป็น XLSX",
    libs:["pdfjs","xlsx"], keys:"excel xlsx ตาราง table sheet" },

  { id:"word-to-pdf", group:"to-pdf", icon:"📘", title:"Word → PDF",
    desc:"แปลง DOCX เป็น PDF รองรับภาษาไทยเต็มรูปแบบ",
    libs:["mammoth","jspdf"], keys:"word docx pdf แปลง" },

  { id:"excel-to-pdf",group:"to-pdf", icon:"📕", title:"Excel → PDF",
    desc:"แปลงแต่ละชีทเป็นตารางในไฟล์ PDF",
    libs:["xlsx","jspdf","jspdfTable"], keys:"excel xlsx sheet ตาราง pdf" },

  { id:"images-to-pdf",group:"to-pdf", icon:"🧩", title:"รูปภาพ → PDF",
    desc:"รวมรูปหลายไฟล์เป็น PDF เดียว จัดขนาดหน้าอัตโนมัติ",
    libs:["pdflib"], keys:"image jpg png รูป รวม pdf" },

  { id:"image-convert",group:"image", icon:"🔄", title:"แปลงชนิดไฟล์รูป",
    desc:"สลับระหว่าง PNG · JPG · WEBP พร้อมปรับคุณภาพ",
    libs:["jszip"], keys:"png jpg webp แปลง รูป convert" },

  { id:"image-resize",group:"image", icon:"📐", title:"ย่อ–บีบอัดรูปภาพ",
    desc:"ย่อขนาดและลดน้ำหนักไฟล์รูปทีละหลายไฟล์ เห็นขนาดก่อน–หลัง",
    libs:["jszip"], keys:"resize compress ย่อ ลดขนาด บีบอัด รูป" },

  { id:"word-mailmerge",group:"doc", icon:"📬", title:"จดหมายเวียน Word + Excel",
    desc:"เอาข้อมูลจาก Excel เติมลงเทมเพลต Word ทีละแถว ได้เอกสารครบทั้งชุดในครั้งเดียว",
    libs:["jszip","xlsx"], keys:"mailmerge mail merge จดหมายเวียน เทมเพลต template word excel ใบรับรอง ใบเสร็จ เวียน" },

  { id:"powerpoint-to-word",group:"ppt", icon:"📽️", title:"PowerPoint → Word",
    desc:"ดึงข้อความทุกสไลด์ หัวข้อย่อย และโน้ตผู้บรรยาย เป็นเอกสาร Word",
    libs:["jszip","docx"], keys:"powerpoint ppt pptx สไลด์ word docx โน้ต presentation แปลง" },

  { id:"powerpoint-to-pdf",group:"ppt", icon:"🖥️", title:"PowerPoint → PDF",
    desc:"จัดสไลด์เป็นไฟล์ PDF อ่านง่าย 1 สไลด์ = 1 หน้า เลือกธีมได้",
    libs:["jszip","jspdf"], keys:"powerpoint ppt pptx สไลด์ pdf presentation แปลง แจก" },

  { id:"excel-csv",   group:"data", icon:"🔁", title:"Excel ⇄ CSV",
    desc:"แปลง XLSX เป็น CSV (แยกทีละชีท) หรือรวม CSV กลับเป็น Excel",
    libs:["xlsx","jszip"], keys:"csv excel xlsx แปลง data ข้อมูล" },
];

export const byId = (id) => TOOLS.find((t) => t.id === id);
