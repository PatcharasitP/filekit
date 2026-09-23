# เทสของ FileKit

รันจากโฟลเดอร์ `FileKit/`:

```bash
# ① ตรรกะล้วน (เร็ว ไม่ต้องเปิดเบราว์เซอร์)
node tests/thai.test.mjs

node tests/search.test.mjs

node tests/resultsize.test.mjs   # ทุกแถวผลลัพธ์ต้องบอกขนาดไฟล์ที่ได้

node tests/plural.test.mjs       # โหมด EN ต้องไม่มี "1 pages" (ไทยไม่มีพหูพจน์ คนเขียนจึงแปลตรงตัว)

node tests/paint.test.mjs        # ตัวไฮไลต์โค้ด ทาสีถูก และคัดลอกแล้วได้ต้นฉบับเป๊ะ

node tests/samples.test.mjs      # กฎจุดกลางต้องบังคับถึงไฟล์ตัวอย่างด้วย ไม่ใช่แค่โค้ดใน src/

node tests/matrixdax.test.mjs    # สูตร DAX ของ Matrix ต้องแปลงทุกชนิดเป็นข้อความ ยอด 0 ห้ามหาย

node tests/binkit.test.mjs        # จัดกลุ่มตัวเลขเป็นช่วง (ขอบบนรวม, ล็อกรายตัวแล้วลำดับต้องไม่พัง)

node tests/geokit.test.mjs        # แผนที่การย้ายที่ตั้ง (ระยะทางเทียบกับค่าที่ DAX คำนวณไว้จริง 40 คู่, WKT)

# ② เบราว์เซอร์จริง — ใช้ tests/run.sh จะขอพอร์ตว่างจากระบบและยืนยันว่าเสิร์ฟโค้ดชุดนี้จริงก่อนยิง
# แบบเดิม: เปิดเซิร์ฟเวอร์เองก่อน
#
# ‼️ เรื่องความเร็วและขนาดไฟล์ (tests/browser_perf.py) ต้องใช้เซิร์ฟเวอร์ที่บีบอัด ไม่ใช่ http.server
#    เพราะ GitHub Pages ซึ่งเป็นที่อยู่จริงของเว็บส่ง gzip ทุกไฟล์ข้อความ วัดจริงแล้วต่างกันเท่าตัว
#         python3 -m http.server   299,825 bytes · FCP 596ms
#         เว็บจริงที่ผู้ใช้เปิด    154,895 bytes  (บีบได้ 61%)
#    ถ้ารันผิดตัว เทสจะหยุดเองพร้อมบอกวิธีแก้ ไม่ปล่อยให้ได้ตัวเลขที่เชื่อไม่ได้
python3 tests/gzip_server.py 8901 &        # ใช้กับ browser_perf (บีบอัดเหมือนเว็บจริง)
python3 -m http.server 8899 &              # ชุดอื่นใช้ตัวนี้ได้ตามเดิม
../.venv/bin/python tests/browser_smoke.py      # เปิดครบทุกเครื่องมือ ไม่มี error
../.venv/bin/python tests/browser_ux.py         # หน้าแรก ค้นหา ธีม คีย์บอร์ด คอนทราสต์ มือถือ
../.venv/bin/python tests/browser_findability.py # เปิดหน้าแรกแล้วต้องเห็นเครื่องมือและหมวดครบ ไม่ต้องเลื่อนหา
../.venv/bin/python tests/browser_affordance.py  # ปุ่มลงมือทำต้องกดไม่ได้ตอนยังไม่มีไฟล์ และกลับมากดได้เมื่อพร้อม
../.venv/bin/python tests/browser_configpanel.py # ช่องค้นหาในแผงตั้งค่า กรองแล้วเลื่อนน้อยลง ล้างแล้วกลับมาเท่าเดิมเป๊ะ
../.venv/bin/python tests/browser_dirtymark.py  # บอกว่าช่องไหนถูกแก้จากค่าเริ่มต้น และคืนค่าทีละช่องได้
../.venv/bin/python tests/browser_codeview.py   # โค้ดที่จะคัดลอกต้องเห็นได้ก่อนกด และเปลี่ยนตามค่าจริง
../.venv/bin/python tests/browser_thai.py       # ชุดเครื่องมือไทย ตรวจค่าจริงในตาราง
../.venv/bin/python tests/browser_mailmerge.py  # ขั้นตอนล็อก/ปลดล็อก + ฟอร์มตรงแนว
../.venv/bin/python tests/browser_batch.py      # ไฟล์เสียปนมาแล้วไฟล์อื่นต้องรอด
../.venv/bin/python tests/browser_pbibar.py     # กราฟแท่ง Deneb วัดความยาวแท่งจากพิกัดจริงในเบราว์เซอร์
../.venv/bin/python tests/browser_numberbins.py # จัดกลุ่มตัวเลข ตรวจค่าบนจอและในไฟล์ที่ดาวน์โหลดทุกแถว (16/09)
../.venv/bin/python tests/browser_maprelocate.py # แผนที่การย้ายที่ตั้ง ตรวจภาพที่วาดจริง ซูม ธีม และชีตที่ส่งเข้า Power BI (16/09)

../.venv/bin/python tests/browser_viewer.py     # ตัวดูรูปเต็มจอ ปิดแล้วต้องไม่พาหลุดออกจากงาน
../.venv/bin/python tests/browser_dialogroute.py # กล่องดูไฟล์เต็มจอต้องปิดเองตอนสลับเครื่องมือ ไม่งั้นหน้าที่เหลือคลิกไม่ได้
../.venv/bin/python tests/browser_pdfpages.py  # ชิปไฟล์ PDF บอกจำนวนหน้า และห้ามลาก pdf.js 1.37 MB มาเพิ่มเพื่อการนี้
../.venv/bin/python tests/browser_codepaint.py # โค้ดของสามเสา Power ต้องมีสี คัดลอกสะอาด และคอนทราสต์ผ่านทั้งสองโหมด
../.venv/bin/python tests/browser_matrixdetails.py # Matrix หลายชั้น ISINSCOPE ต้องผูกชั้นในสุด และชนิดที่เสี่ยงต้องถูกห่อ FORMAT
../.venv/bin/python tests/browser_sortbar.py    # ตัวเรียงหน้าแรก และฉาก hero ที่ตัวเลขต้องบวกกันได้จริง
../.venv/bin/python tests/browser_hover.py      # ชี้การ์ดหน้าแรกแล้วยกเงา+วงขอบสีเน้นของตระกูล (ไอเดีย ① thepexcel 13/09)
../.venv/bin/python tests/browser_fontrace.py   # ฟอนต์ที่วาดจริง (CDP) ต้องเป็น Sarabun ทุกวิธีโหลด ไม่สลับเป็น Leelawadee หลัง refresh (13/09)
../.venv/bin/python tests/browser_theme.py      # หน้าธีม Power BI โคลนโครง datatraining.io ฟอนต์ Segoe UI ทั้งหน้าทาสีตามชุด (13/09)
../.venv/bin/python tests/browser_toolrail.py   # รางซ้ายบนจอกว้าง ต้องไม่ทับพื้นที่ทำงาน และคืนที่แนวตั้งได้จริง
../.venv/bin/python tests/browser_toolio.py     # ‼️ ช้า ~5 นาที รันทุกเครื่องมือจริงแล้วเทียบกับตัวเลขที่โชว์บนหน้า
../.venv/bin/python tests/browser_freebies.py   # หน้าของแจก ไฟล์ต้องมีจริง ตัวเลขตรงไฟล์ และคัดลอกได้เนื้อไฟล์จริง
../.venv/bin/python tests/browser_a11y.py       # คีย์บอร์ด โฟกัส ป้ายกำกับ คอนทราสต์
../.venv/bin/python tests/browser_leak.py       # objectURL / listener / DOM / heap รั่ว (เปิด server เอง พอร์ต 8924)
../.venv/bin/python tests/browser_stress.py     # ทรมานด้วยเคสสุดโต่ง ไฟล์เสีย ไฟล์เยอะ กดรัว
../.venv/bin/python tests/browser_i18n_deep.py  # ข้อความไทยตกค้างในโหมดอังกฤษ หลังลงมือทำงานจริง
../.venv/bin/python tests/browser_cache.py      # แคชเครื่องมือ คืนแรมได้ แต่ห้ามกินไฟล์ที่ผู้ใช้เลือกไว้
../.venv/bin/python tests/browser_output.py     # เปิดไฟล์ผลลัพธ์ตรวจเนื้อในจริง 11 เครื่องมือ
../.venv/bin/python tests/browser_privacy.py    # พิสูจน์ว่าไม่มีเนื้อไฟล์/ชื่อไฟล์หลุดออกไปที่ไหน
../.venv/bin/python tests/browser_perfbudget.py # เพดานไบต์ FCP CLS long task เวลาเปิดเครื่องมือ
../.venv/bin/python tests/browser_swupdate.py   # ปล่อยเวอร์ชันใหม่แล้วผู้ใช้เดิมเห็นเมื่อไร (เปิด server เอง)
../.venv/bin/python tests/browser_crossbrowser.py  # เคสเดียวกันบน chromium + firefox (+ webkit ถ้าติดตั้งได้)
../.venv/bin/python tests/browser_word.py       # เปิดไฟล์ Word/PDF ผลลัพธ์ตรวจเนื้อใน 6 เครื่องมือสายเอกสาร
node tests/thai_adversarial.test.mjs            # ยิงข้อมูลไทยโหด ๆ ใส่เครื่องมือไทย (ตรรกะล้วน)
node tests/thai_parsers.test.mjs               # ตัวแยกชื่อไทย + ที่อยู่ไทย ระดับหน่วย (ตรรกะล้วน)
../.venv/bin/python tests/browser_datatools.py  # เครื่องมือใหม่ 3 ตัว แยก/รวม Excel และใส่เลขหน้า PDF

# ③ ยิงใส่เว็บจริง (ประตู 2 — ต้องทำก่อนปิดงานทุกครั้ง)
FK_BASE=https://patcharasitp.github.io/filekit/ ../.venv/bin/python tests/browser_ux.py
```

## ‼️ กับดักที่ทำให้เทส "เขียวหลอก" มาแล้ว (อ่านก่อนเขียนเทสใหม่)

1. **Playwright ตั้ง `prefers-reduced-motion: reduce` เป็นค่าปริยาย** — เทสที่ไม่ระบุ
   `reduced_motion="no-preference"` จะไม่เคยวิ่งผ่านเส้นทางแอนิเมชันที่ผู้ใช้จริง 99% เจอเลย
   (เคยรายงานว่าแกลเลอรีรูปผ่าน ทั้งที่ของจริงกระตุกที่ 13fps)
2. **อย่ารอ "คำเฉพาะ" ในข้อความสำเร็จ/ล้มเหลว** — พอข้อความเปลี่ยนนิดเดียวเทสจะรายงานว่า
   "ค้าง" ทั้งที่งานจบไปแล้วใน 0.1 วินาที · ให้รอเงื่อนไขที่แท้จริง เช่น "มีข้อความ และไม่ใช่คำว่ากำลัง"
3. **`.click()` ของ Playwright รอให้ element นิ่งก่อน** — ระหว่างงานหนัก main thread ไม่ว่าง
   มันจึงไปกดเอาตอนงานจบแล้ว กลายเป็นทดสอบคนละเคสโดยไม่รู้ตัว · เคส "แทรกกลางคัน"
   ต้องยิงผ่าน DOM ตรง ๆ ด้วย `pg.evaluate("() => el.click()")`
4. **regex จับ "ข้อความในเครื่องหมายคำพูด" พลาด template ซ้อนชั้น** — `` `a ${x ? ` · b` : ""}` ``
   จับคู่ผิดคู่จนของจริงรอดสายตา · ต้องเดินอ่านทีละตัวอักษรและจำสถานะ (ดู `accepts.test.mjs`)

## ‼️ พิสูจน์เครื่องมือตรวจก่อนเชื่อผล
`tests/contrast.mjs` และตัววัดใน `browser_ux.py` **ต้องผสมค่า alpha** ก่อนคำนวณ
รุ่นแรกอ่านแค่ค่า R,G,B ของพื้นหลัง ทำให้พื้นแบบ `color-mix(...12%, transparent)`
ถูกคิดเป็นสีทึบ แล้วรายงาน **11.83:1 (ผ่าน)** ทั้งที่ของจริง **1.34:1 (ตกหนัก)**

**กติกา:** เทสต้อง **แดงตอนมีบั๊ก** และ **เขียวหลังแก้** — ห้ามเขียนให้ผ่านเฉย ๆ
เทสชุดนี้จับบั๊กจริงมาแล้ว 2 ตัว (การตัดสิน encoding ด้วยคะแนน · ตาราง latin1 ที่ขาดไป)
