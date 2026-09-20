# ไลบรารีที่ FileKit ยืมมาใช้ และสัญญาอนุญาตของแต่ละตัว

FileKit เก็บไลบรารีทุกตัวไว้ในเครื่องเรา (self-host) แทนที่จะดึงจาก CDN ตอนใช้งาน
เหตุผลด้านความเร็วอยู่ใน `README.md` ส่วนไฟล์นี้คือเครดิตและสัญญาอนุญาตของเจ้าของแต่ละตัว

**ทุกตัวเก็บไว้แบบไม่ได้แก้ไขอะไรเลย** ดาวน์โหลดมาแล้ววางไว้ตามเดิม
ถ้าอยากตรวจว่าไฟล์ตรงกับต้นทางจริงไหม `src/loader.js` เก็บลายนิ้วมือ SHA-384 ของแต่ละตัวไว้ให้แล้ว

| ไฟล์ใน `vendor/` | ไลบรารี | สัญญาอนุญาต | ต้นทาง |
|---|---|---|---|
| `pdf.min.js` , `pdf.worker.min.js` | pdf.js | Apache-2.0 | https://github.com/mozilla/pdf.js |
| `pdf-lib.min.js` | pdf-lib | MIT | https://github.com/Hopding/pdf-lib |
| `xlsx.full.min.js` | SheetJS | Apache-2.0 | https://github.com/SheetJS/sheetjs |
| `docx.umd.js` | docx | MIT | https://github.com/dolanmiu/docx |
| `jszip.min.js` | JSZip | MIT หรือ GPL-3.0-or-later | https://github.com/Stuk/jszip |
| `mammoth.browser.min.js` | mammoth.js | BSD-2-Clause | https://github.com/mwilliamson/mammoth.js |
| `jspdf.umd.min.js` | jsPDF | MIT | https://github.com/parallax/jsPDF |
| `jspdf.plugin.autotable.min.js` | jsPDF-AutoTable | MIT | https://github.com/simonbengtsson/jsPDF-AutoTable |
| `tesseract.min.js` | Tesseract.js | Apache-2.0 | https://github.com/naptha/tesseract.js |
| `vega.min.js` | Vega | BSD-3-Clause | https://github.com/vega/vega |
| `vega-lite.min.js` | Vega-Lite | BSD-3-Clause | https://github.com/vega/vega-lite |
| `vega-embed.min.js` | vega-embed | BSD-3-Clause | https://github.com/vega/vega-embed |
| `vega-interpreter.esm.js` | vega-interpreter | BSD-3-Clause | https://github.com/vega/vega-interpreter |
| `easy-template-x.esm.js` | easy-template-x | MIT | https://github.com/alonrbar/easy-template-x |
| **`libheif.js` , `libheif.wasm`** | **libheif-js** (libheif คอมไพล์เป็น WebAssembly) | **‼️ LGPL-3.0** | https://github.com/catdad-experiments/libheif-js · ตัวไลบรารีจริง https://github.com/strukturag/libheif |
| `fonts/Sarabun-*.woff2` | Sarabun | SIL Open Font License 1.1 | https://github.com/cadsondemak/Sarabun |

## ‼️ libheif ใช้ LGPL-3.0 ซึ่งต่างจากตัวอื่นทั้งหมด

ตัวอื่นในตารางเป็น permissive license (MIT , Apache , BSD) ที่แค่ให้เครดิตก็พอ
แต่ libheif เป็น **LGPL-3.0** ซึ่งมีเงื่อนไขเพิ่ม และ FileKit ทำตามครบแล้วทั้งสามข้อ

1. **บอกให้ชัดว่าใช้อะไรและสัญญาอนุญาตอะไร** คือไฟล์นี้
2. **ต้องหาซอร์สของไลบรารีได้** ลิงก์ต้นทางอยู่ในตารางข้างบน และไฟล์ที่เราเก็บไว้ก็ไม่ได้แก้อะไรเลย
3. **ผู้ใช้ต้องเปลี่ยนตัวไลบรารีเองได้** ข้อนี้ FileKit ทำได้ง่ายเป็นพิเศษ เพราะ libheif
   ถูกโหลดเป็นไฟล์แยกต่างหากผ่าน `vendor/heic-sandbox.html` ไม่ได้ถูกรวมเข้าไปในโค้ดของเรา
   เอาไฟล์ `libheif.js` กับ `libheif.wasm` ไปทับด้วยรุ่นอื่นได้ตรง ๆ โดยไม่ต้องแตะอะไรอีก

‼️ **ห้ามเอา libheif ไปรวมร่าง (bundle) เข้ากับโค้ดของเรา** เพราะจะทำให้เงื่อนไขข้อ 3 เสียไป
ตอนนี้มันแยกไฟล์อยู่แล้วเพราะเหตุผลด้านความปลอดภัย (ดูคอมเมนต์ใน `vendor/heic-sandbox.html`)
ซึ่งบังเอิญทำให้เรื่องสัญญาอนุญาตถูกต้องไปด้วย

## ของเราเอง

`heic-sandbox.html` , `heic-sandbox.js` , `vega-util-shim.js` เป็นโค้ดของ FileKit เองที่วางไว้ในโฟลเดอร์นี้
เพราะทำงานคู่กับไลบรารีข้างบน ไม่ใช่ของที่ยืมมา
