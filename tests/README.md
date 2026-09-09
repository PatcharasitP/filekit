# เทสของ FileKit

รันจากโฟลเดอร์ `FileKit/`:

```bash
# ① ตรรกะล้วน (เร็ว ไม่ต้องเปิดเบราว์เซอร์)
node tests/thai.test.mjs

node tests/search.test.mjs

# ② เบราว์เซอร์จริง — ต้องเปิดเซิร์ฟเวอร์ก่อน
python3 -m http.server 8899 &
../.venv/bin/python tests/browser_smoke.py      # เปิดครบทุกเครื่องมือ ไม่มี error
../.venv/bin/python tests/browser_ux.py         # หน้าแรก ค้นหา ธีม คีย์บอร์ด คอนทราสต์ มือถือ
../.venv/bin/python tests/browser_thai.py       # ชุดเครื่องมือไทย ตรวจค่าจริงในตาราง
../.venv/bin/python tests/browser_mailmerge.py  # ขั้นตอนล็อก/ปลดล็อก + ฟอร์มตรงแนว
../.venv/bin/python tests/browser_batch.py      # ไฟล์เสียปนมาแล้วไฟล์อื่นต้องรอด

../.venv/bin/python tests/browser_viewer.py     # ตัวดูรูปเต็มจอ ปิดแล้วต้องไม่พาหลุดออกจากงาน
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

# ③ ยิงใส่เว็บจริง (ประตู 2 — ต้องทำก่อนปิดงานทุกครั้ง)
FK_BASE=https://patcharasitp.github.io/filekit ../.venv/bin/python tests/browser_ux.py
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
