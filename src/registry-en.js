/* คำแปลอังกฤษของทะเบียนเครื่องมือ แยกออกมาจาก src/registry.js (26/09/2026)
   ‼️ โหลดเฉพาะตอนเป็นโหมดอังกฤษ โหมดไทยไม่โหลดไฟล์นี้ หน้าแรกเบาลง 4,615 ไบต์ (gzip)
      งบ JS หน้าแรก 60,000 ไบต์ (tests/browser_perfbudget.py) เคยเหลือ 14 ไบต์ก่อนแยก
   ‼️ เพิ่มเครื่องมือใหม่ ใส่คำแปลที่ไฟล์นี้ (tests/accepts.test.mjs จับถ้าลืม) */

/* ─────────────────────────────────────────────────────────────────────────
   คำแปลอังกฤษ — เก็บรวมไว้ก้อนเดียวเพื่อให้ทะเบียนไทยข้างบนอ่านง่ายเหมือนเดิม
   ‼️ ทับค่าลงบนอ็อบเจกต์เดิมตอนโหลดโมดูล ไม่ใช่ห่อด้วยฟังก์ชันแปล
      เพราะ LANG คงที่ตลอดอายุหน้า (สลับภาษา = โหลดใหม่ ดู src/i18n.js)
      ทำแบบนี้แล้วโค้ดที่อ่าน t.title / g.label ทุกจุดไม่ต้องแก้แม้แต่บรรทัดเดียว
   ‼️ แปลเฉพาะข้อความที่ตาเห็น — id / group / libs / next เป็นกุญแจ ห้ามแตะ
   ‼️ keys ไม่ต้องแปล: ตอนเป็นอังกฤษ title/desc กลายเป็นอังกฤษอยู่แล้ว ค้นเจอเอง
   ───────────────────────────────────────────────────────────────────────── */
export const EN_SUBS = { organize: "Organize PDF", stamp: "Edit & stamp", secure: "PDF security", convert: "Convert from PDF" };
export const EN_GROUPS = {
  "pdf": ["PDF", "PDF"],
  "image": ["Images", "Images"],
  "doc": ["Documents & mail merge", "Word"],
  "ppt": ["PowerPoint", "PowerPoint"],
  "excel": ["Excel & calculations", "Excel"],
  "thai": ["Thai paperwork", "Thai"],
  "powerbi": ["Power BI", "Power BI"],
  "powerquery": ["Power Query", "Power Query"],
  "powerautomate": ["Power Automate Cloud", "Power Automate"],
};

export const EN_TOOLS = {
  "pdf-pages": ["Organise PDF pages", "Keep, delete, reorder and rotate pages, with a preview of every page"],
  "pdf-edit": ["Edit and sign a PDF", "Cover the old text, type new text, highlight, sign and place images in one pass, then save once. Full Thai support"],
  "pdf-merge": ["Merge PDF files", "Combine several files into one, drag to reorder"],
  "pdf-split": ["Split a PDF", "Split by page range, every N pages, or one file per page"],
  "pdf-compress": ["Compress a PDF", "Shrink scans and image-heavy files. See the size before and after"],
  "pdf-sign": ["Sign a PDF", "Draw or upload a signature, then drag it onto the document and reuse it later. To edit text as well, use Edit and sign a PDF"],
  "pdf-unstamp": ["Remove layers stamped on a PDF", "Take off a watermark or stamp that was placed on top. See the result before saving, and your real content can never be removed by mistake"],
  "pdf-protect": ["Password-protect a PDF", "Set a password that must be typed before the file opens, and choose whether printing or copying stays allowed. Done entirely on your device, nothing is uploaded"],
  "pdf-compare": ["Compare two PDFs", "Find exactly what the newer version changed, down to the word. Works with Thai, and neither file is uploaded anywhere"],
  "pdf-crop": ["Crop a PDF", "Drag over what you want to keep. Trims black edges from scans or too much white space around slides, on every page or just the odd or even ones"],
  "pdf-resize": ["Change a PDF's paper size", "Switch to A4, A5, Letter or another size. Choose whether to fit the whole page or fill the paper. Text stays searchable"],
  "pdf-nup": ["Multiple pages per sheet, or a booklet", "Save paper with 2, 4, 6 or 9 pages per sheet, or lay it out as a folded booklet with the pages in the right order"],
  "pdf-clean": ["Check a PDF before sending", "See what the file is carrying, such as the author name, comments, form fields, attachments and scripts, then clear it all in one click"],
  "pdf-redact": ["Redact a PDF for real", "Drag over what must go and the text underneath is removed from the file, not just covered with a rectangle you can still select and copy"],
  "pdf-unlock": ["Remove a PDF password", "Take the password off a file you have to unlock every time, or lift a ban on copying and printing. You need the password first, this is not a cracking tool"],
  "pdf-watermark": ["Watermark a PDF", "Stamp text on every page. Choose the position, colour and opacity"],
  "pdf-page-numbers": ["Add page numbers to a PDF", "Number every page. Pick the position and format, use Thai numerals, and skip the cover"],
  "pdf-remove-blank": ["Remove blank pages from a scan", "Duplex scans leave a blank page between every sheet. Each page is checked for you, and you can keep or drop any of them yourself"],
  "pdf-ocr": ["OCR (read text from scans)", "Read Thai and English text out of scanned PDFs as plain text or a searchable PDF"],
  "pdf-extract-images": ["Extract images from a PDF", "Get the pictures embedded in the file at their real resolution, not a screenshot. You can skip small icons"],
  "pdf-to-powerpoint": ["PDF to PowerPoint", "One page becomes one slide, ready to present or drop into another deck. Each slide is a picture, so the text inside cannot be edited"],
  "pdf-to-images": ["PDF to images", "Turn every page into PNG or JPG at the resolution you choose"],
  "pdf-to-longimage": ["PDF to one long image", "Stack every page into a single tall image, ready to send in a chat with no download step"],
  "pdf-to-text": ["PDF to text", "Pull the text out as a TXT file, ready to copy"],
  "pdf-to-word": ["PDF to Word", "Turn the content into an editable DOCX document"],
  "pdf-to-excel": ["PDF to Excel", "Capture the tables inside a PDF as an XLSX file"],
  "word-to-pdf": ["Word to PDF", "Convert DOCX to PDF with full Thai support, several files at a time"],
  "text-to-pdf": ["Text to PDF", "Paste text or drop a .txt file and get a PDF with a Thai font already embedded, wrapped without breaking words"],
  "excel-to-pdf": ["Excel to PDF", "Lay every sheet out as a table in a PDF"],
  "images-to-pdf": ["Images to PDF", "Combine many images into one PDF, page size fitted automatically"],
  "image-convert": ["Convert image format", "Move between PNG, JPG, WEBP and set the quality, or build a .ico file to use as your site favicon"],
  "image-bg-remove": ["Remove image background", "Make the background transparent. Works on signatures photographed on paper, stamps, logos and objects on a plain backdrop"],
  "image-resize": ["Resize & compress images", "Shrink dimensions and file size in bulk. See before and after"],
  "word-join": ["Merge Word files", "Join several documents into one, images intact, drag to reorder"],
  "word-replace": ["Find & replace in bulk", "Change the same wording across many files: a company name or a year, all at once"],
  "word-clean": ["Check a document before sending", "Find leftover comments, tracked changes and author names, then clear them in one click"],
  "word-mailmerge": ["Mail merge (Word + Excel)", "Fill a Word template from Excel row by row and get the whole set of documents at once"],
  "powerpoint-to-word": ["PowerPoint to Word", "Pull the text, bullets and speaker notes from every slide into a Word document"],
  "powerpoint-to-pdf": ["PowerPoint to PDF", "Lay the deck out as a readable PDF. One slide per page, pick a theme"],
  "map-coverage": ["Map of what is around a point", "Drop in a file of centre points such as customer calls, then drag the radius bar. The map and the numbers move with it. Tells you which point is nearest and which circles are empty, then exports the sheets Icon Map Pro needs so Power BI can slice by radius"],
  "map-relocate": ["Map of site moves", "Turn a file of old and new coordinates into a Thailand map with dots, joining lines and distances. Style it yourself, save it as an image for a deck, or export the sheets Icon Map Pro needs in Power BI"],
  "number-bins": ["Group numbers into bands", "See the real spread first, compare four ways to cut the groups, drag any cut point by hand, lock chosen rows into a group of your own, and always get the sort column that keeps charts in the right order"],
  "excel-match-sum": ["Find rows that add up to an amount", "One payment lands but the system holds many invoices. This finds which rows add up to it, with your own rules for how many rows, what size, and how close is close enough, and it says how many different answers exist"],
  "excel-csv": ["Excel ⇄ CSV", "Turn XLSX into CSV (one per sheet), or fold CSV files back into Excel"],
  "excel-to-pq": ["Table to a Power Query formula", "Drop in an Excel, PDF, Word file or a photo of a table and get ready-to-paste #table code. Pick the Power Query type for every column"],
  "excel-split": ["Split an Excel file by column", "Pick a column and split into one file per group (ZIP), or one file with a sheet per group"],
  "excel-merge": ["Merge several Excel files", "Append rows from many files into one. Columns are matched by header name, not position"],
  "thai-encoding": ["Repair garbled Thai files", "Opened a CSV and got “เธชเธงเธฑ” or “à¸ªà¸§”? This detects the encoding and saves it back as UTF-8"],
  "thai-date": ["Buddhist ⇄ Gregorian years", "Reads every Thai date format (15 ม.ค. 2569, ๑๕/๐๑/๒๕๖๙), converts a whole column, output format is yours to pick"],
  "thai-id": ["Check Thai ID / tax numbers", "Verify the check digit of every 13-digit number in a file and see which rows are mistyped"],
  "thai-name": ["Split Thai name into columns", "Break a full name into title, first name and surname, ready to sort or mail-merge"],
  "thai-address": ["Split a Thai address", "Pull subdistrict, district, province and postcode out of an address crammed into one cell"],
  "thai-number": ["Numbers to Thai baht text", "128,400 to หนึ่งแสนสองหมื่นแปดพันสี่ร้อยบาทถ้วน, swap Thai numerals ๑๒๓ and 123 across a column"],
  "freebies": ["Ready made files, free to take", "Deneb specs and a Power Query function this site actually uses, take them as they are without opening each tool"],
  "pbi-matrix-details": ["Matrix transaction details in one column", "Fold several columns into a single matrix column while the row headers stay frozen, every data type is turned into text first so zeros and FALSE never vanish"],
  "pbi-bar": ["Deneb horizontal bar chart", "Tweak the bars, value labels and target line live, with bar length always true to the real numbers, then copy the spec into Deneb"],
  "pbi-donut": ["Deneb donut chart", "Tweak a live donut chart and see it change instantly, then copy the spec straight into Deneb"],
  "pbi-theme": ["Build a Power BI theme (theme.json)", "Pick a palette and a canvas size, watch a live report preview, and get told which colours fall below the contrast floor or merge for colour blind viewers"],
  "pa-parse-json": ["Table to a Parse JSON schema", "Reads the whole column before deciding the type, so columns that really do go blank are declared nullable and your flow survives them"],
  "pq-to-date": ["Turn text into real dates", "Convert a whole column of text dates at once, telling it whether the years are Buddhist or Common era instead of letting the machine guess and shift everything by 543 years"],
  "pq-pick-date": ["Pick the latest date across columns", "Bring the latest, the one before it, or the earliest of several date columns into a single column, stacked in as many layers as you need for gap calculations"],
  "pq-group-concat": ["Collapse many rows into one", "Turn many contracts per site into a single row, values joined by commas, with repeats collapsed and their amounts added up, and blanks that still line up column by column"],
  "pq-multisource-lookup": ["Build a multi source lookup", "Search several tables in order and stop at the first hit, with results landing in one column even when each source names it differently"],
  "pq-combine": ["Merge several queries into one", "Stack several servers into one query, add a source with one row"],
  "pa-html-table": ["HTML table for a flow email", "Style it and see the email straight away, with the per cell borders that Outlook desktop actually renders"],
};
