/* ‼️ ไฟล์นี้ถูกสร้างด้วยสคริปต์ ห้ามแก้มือ
 *
 * ที่มา: พี่ปอนด์สั่งให้เอาแนวคิด Examples ของ thepexcel มาใช้ คือโชว์ให้เห็นว่า
 * "ใส่อะไรเข้าไป ได้อะไรออกมา" ก่อนลงมือทำ
 *
 * ‼️ ทำไมต้องสร้างจากการรันจริง ไม่ใช่กรอกมือหรืออ่านจากซอร์ส
 *    ลองดึงชนิดไฟล์ผลลัพธ์ด้วย regex จากซอร์สแล้ว ได้แค่ 18 จาก 41 ตัว
 *    และที่ได้มาก็ผิด (pbi-bar ขึ้นเป็น csv ทั้งที่จริงได้สเปก Deneb)
 *    ตัวเลขในไฟล์นี้ทุกตัวมาจากการเปิดเครื่องมือจริง กดไฟล์ตัวอย่าง กดลงมือทำ
 *    แล้วอ่านค่าที่ขึ้นบนหน้าจอ จึงเป็นความจริงที่ตรวจสอบซ้ำได้
 *
 * ‼️ ข้อมูลในไฟล์นี้ต้อง "ตรงกับความจริงทุกตัวอักษร" ห้ามตัดแต่งให้สวย
 *    เคยลองตัด meta ที่ยาวออกจากข้อมูล แล้ว tests/browser_toolio.py แดงทันที
 *    เพราะมันเทียบข้อมูลกับผลรันจริง ซึ่งถูกต้องแล้ว
 *    จะย่อหรือซ่อนอะไรให้ทำตอนวาดหน้าจอ (ดู toolExample ใน src/ui.js) ไม่ใช่ที่นี่
 *
 * ‼️ เก็บทั้งไทยและอังกฤษ เพราะข้อความอย่าง "3 หน้า" กับ "3 pages" มาจากตัวเครื่องมือเอง
 *    และเก็บเฉพาะตัวที่ได้ผลครบทั้งสองภาษา จะได้ไม่หายไปตอนสลับภาษา
 *
 * สร้างใหม่:  python3 -m http.server 8971 &  แล้ว  python3 tools/harvest_io.py
 * ตรวจว่ายังตรงกับความจริง: tests/browser_toolio.py (รันทุกตัวจริง ช้าราว 5 นาที)
 */
export const TOOL_IO_ALL = {
 "excel-csv": {
  "th": {
   "n": 2,
   "inSize": "6.3 KB",
   "inMeta": "",
   "outExt": "csv",
   "outSize": "3.4 KB",
   "outMeta": ""
  },
  "en": {
   "n": 2,
   "inSize": "6.3 KB",
   "inMeta": "",
   "outExt": "csv",
   "outSize": "3.4 KB",
   "outMeta": ""
  }
 },
 "excel-merge": {
  "th": {
   "n": 2,
   "inSize": "6.3 KB",
   "inMeta": "",
   "outExt": "xlsx",
   "outSize": "32 KB",
   "outMeta": "9 แถว, 45 คอลัมน์"
  },
  "en": {
   "n": 2,
   "inSize": "6.3 KB",
   "inMeta": "",
   "outExt": "xlsx",
   "outSize": "32 KB",
   "outMeta": "9 rows, 45 columns"
  }
 },
 "excel-split": {
  "th": {
   "n": 1,
   "inSize": "6.3 KB",
   "inMeta": "",
   "outExt": "zip",
   "outSize": "42 KB",
   "outMeta": "2 ไฟล์"
  },
  "en": {
   "n": 1,
   "inSize": "6.3 KB",
   "inMeta": "",
   "outExt": "zip",
   "outSize": "42 KB",
   "outMeta": "2 files"
  }
 },
 "excel-to-pdf": {
  "th": {
   "n": 1,
   "inSize": "6.3 KB",
   "inMeta": "",
   "outExt": "pdf",
   "outSize": "74 KB",
   "outMeta": "1 หน้า"
  },
  "en": {
   "n": 1,
   "inSize": "6.3 KB",
   "inMeta": "",
   "outExt": "pdf",
   "outSize": "74 KB",
   "outMeta": "1 page"
  }
 },
 "image-convert": {
  "th": {
   "n": 2,
   "inSize": "23 KB",
   "inMeta": "",
   "outExt": "jpg",
   "outSize": "",
   "outMeta": "23 KB → 27 KB"
  },
  "en": {
   "n": 2,
   "inSize": "23 KB",
   "inMeta": "",
   "outExt": "jpg",
   "outSize": "",
   "outMeta": "23 KB → 27 KB"
  }
 },
 "images-to-pdf": {
  "th": {
   "n": 2,
   "inSize": "23 KB",
   "inMeta": "",
   "outExt": "pdf",
   "outSize": "44 KB",
   "outMeta": "2 หน้า"
  },
  "en": {
   "n": 2,
   "inSize": "23 KB",
   "inMeta": "",
   "outExt": "pdf",
   "outSize": "44 KB",
   "outMeta": "2 pages"
  }
 },
 "pdf-compress": {
  "th": {
   "n": 1,
   "inSize": "28 KB",
   "inMeta": "3 หน้า",
   "outExt": "pdf",
   "outSize": "",
   "outMeta": "28 KB → 25 KB, ระดับปานกลาง"
  },
  "en": {
   "n": 1,
   "inSize": "28 KB",
   "inMeta": "3 pages",
   "outExt": "pdf",
   "outSize": "",
   "outMeta": "28 KB → 25 KB, Medium level"
  }
 },
 "pdf-merge": {
  "th": {
   "n": 2,
   "inSize": "28 KB",
   "inMeta": "3 หน้า",
   "outExt": "pdf",
   "outSize": "47 KB",
   "outMeta": "5 หน้า"
  },
  "en": {
   "n": 2,
   "inSize": "28 KB",
   "inMeta": "3 pages",
   "outExt": "pdf",
   "outSize": "47 KB",
   "outMeta": "5 pages"
  }
 },
 "pdf-page-numbers": {
  "th": {
   "n": 1,
   "inSize": "28 KB",
   "inMeta": "3 หน้า",
   "outExt": "pdf",
   "outSize": "26 KB",
   "outMeta": "3 หน้า, เลข 1 ถึง 3"
  },
  "en": {
   "n": 1,
   "inSize": "28 KB",
   "inMeta": "3 pages",
   "outExt": "pdf",
   "outSize": "26 KB",
   "outMeta": "3 pages, numbered 1 to 3"
  }
 },
 "pdf-pages": {
  "th": {
   "n": 1,
   "inSize": "28 KB",
   "inMeta": "3 หน้า",
   "outExt": "pdf",
   "outSize": "25 KB",
   "outMeta": "3 หน้า"
  },
  "en": {
   "n": 1,
   "inSize": "28 KB",
   "inMeta": "3 pages",
   "outExt": "pdf",
   "outSize": "25 KB",
   "outMeta": "3 pages"
  }
 },
 "pdf-split": {
  "th": {
   "n": 1,
   "inSize": "28 KB",
   "inMeta": "3 หน้า",
   "outExt": "pdf",
   "outSize": "25 KB",
   "outMeta": "3 หน้า"
  },
  "en": {
   "n": 1,
   "inSize": "28 KB",
   "inMeta": "3 pages",
   "outExt": "pdf",
   "outSize": "25 KB",
   "outMeta": "3 pages"
  }
 },
 "pdf-to-excel": {
  "th": {
   "n": 1,
   "inSize": "28 KB",
   "inMeta": "3 หน้า",
   "outExt": "xlsx",
   "outSize": "21 KB",
   "outMeta": "3 ชีท"
  },
  "en": {
   "n": 1,
   "inSize": "28 KB",
   "inMeta": "3 pages",
   "outExt": "xlsx",
   "outSize": "21 KB",
   "outMeta": "3 sheets"
  }
 },
 "pdf-to-images": {
  "th": {
   "n": 1,
   "inSize": "28 KB",
   "inMeta": "3 หน้า",
   "outExt": "png",
   "outSize": "100 KB",
   "outMeta": ""
  },
  "en": {
   "n": 1,
   "inSize": "28 KB",
   "inMeta": "3 pages",
   "outExt": "png",
   "outSize": "100 KB",
   "outMeta": ""
  }
 },
 "pdf-to-longimage": {
  "th": {
   "n": 1,
   "inSize": "28 KB",
   "inMeta": "3 หน้า",
   "outExt": "jpg",
   "outSize": "183 KB",
   "outMeta": "3 หน้า, 1071x4561 px, 183 KB"
  },
  "en": {
   "n": 1,
   "inSize": "28 KB",
   "inMeta": "3 pages",
   "outExt": "jpg",
   "outSize": "183 KB",
   "outMeta": "3 pages, 1071x4561 px, 183 KB"
  }
 },
 "pdf-to-word": {
  "th": {
   "n": 1,
   "inSize": "28 KB",
   "inMeta": "3 หน้า",
   "outExt": "docx",
   "outSize": "8.4 KB",
   "outMeta": "3 หน้า"
  },
  "en": {
   "n": 1,
   "inSize": "28 KB",
   "inMeta": "3 pages",
   "outExt": "docx",
   "outSize": "8.4 KB",
   "outMeta": "3 pages"
  }
 },
 "pdf-watermark": {
  "th": {
   "n": 1,
   "inSize": "28 KB",
   "inMeta": "3 หน้า",
   "outExt": "pdf",
   "outSize": "46 KB",
   "outMeta": "3 หน้า"
  },
  "en": {
   "n": 1,
   "inSize": "28 KB",
   "inMeta": "3 pages",
   "outExt": "pdf",
   "outSize": "47 KB",
   "outMeta": "3 pages"
  }
 },
 "powerpoint-to-pdf": {
  "th": {
   "n": 1,
   "inSize": "31 KB",
   "inMeta": "",
   "outExt": "pdf",
   "outSize": "38 KB",
   "outMeta": "4 สไลด์, 16:9"
  },
  "en": {
   "n": 1,
   "inSize": "31 KB",
   "inMeta": "",
   "outExt": "pdf",
   "outSize": "38 KB",
   "outMeta": "4 slides, 16:9"
  }
 },
 "powerpoint-to-word": {
  "th": {
   "n": 1,
   "inSize": "31 KB",
   "inMeta": "",
   "outExt": "docx",
   "outSize": "7.9 KB",
   "outMeta": "4 สไลด์"
  },
  "en": {
   "n": 1,
   "inSize": "31 KB",
   "inMeta": "",
   "outExt": "docx",
   "outSize": "7.9 KB",
   "outMeta": "4 slides"
  }
 },
 "word-join": {
  "th": {
   "n": 2,
   "inSize": "37 KB",
   "inMeta": "",
   "outExt": "docx",
   "outSize": "38 KB",
   "outMeta": "ตัวอย่าง-ใบเสนอราคา.docx (19 ย่อหน้า), ตัวอย่าง-หนังสือแจ้งผลประเมิน.docx (25 ย่อหน้า)"
  },
  "en": {
   "n": 2,
   "inSize": "37 KB",
   "inMeta": "",
   "outExt": "docx",
   "outSize": "38 KB",
   "outMeta": "ตัวอย่าง-ใบเสนอราคา.docx (19 paragraphs), ตัวอย่าง-หนังสือแจ้งผลประเมิน.docx (25 paragraphs)"
  }
 },
 "word-to-pdf": {
  "th": {
   "n": 2,
   "inSize": "37 KB",
   "inMeta": "",
   "outExt": "pdf",
   "outSize": "36 KB",
   "outMeta": "1 หน้า"
  },
  "en": {
   "n": 2,
   "inSize": "37 KB",
   "inMeta": "",
   "outExt": "pdf",
   "outSize": "36 KB",
   "outMeta": "1 page"
  }
 }
};

import { IS_EN } from "./i18n.js";
/** ข้อมูลของภาษาที่กำลังใช้อยู่ */
export const TOOL_IO = Object.fromEntries(
  Object.entries(TOOL_IO_ALL).map(([k, v]) => [k, IS_EN ? v.en : v.th])
);
