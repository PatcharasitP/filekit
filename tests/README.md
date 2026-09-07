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

# ③ ยิงใส่เว็บจริง (ประตู 2 — ต้องทำก่อนปิดงานทุกครั้ง)
FK_BASE=https://patcharasitp.github.io/filekit ../.venv/bin/python tests/browser_ux.py
```

## ‼️ พิสูจน์เครื่องมือตรวจก่อนเชื่อผล
`tests/contrast.mjs` และตัววัดใน `browser_ux.py` **ต้องผสมค่า alpha** ก่อนคำนวณ
รุ่นแรกอ่านแค่ค่า R,G,B ของพื้นหลัง ทำให้พื้นแบบ `color-mix(...12%, transparent)`
ถูกคิดเป็นสีทึบ แล้วรายงาน **11.83:1 (ผ่าน)** ทั้งที่ของจริง **1.34:1 (ตกหนัก)**

**กติกา:** เทสต้อง **แดงตอนมีบั๊ก** และ **เขียวหลังแก้** — ห้ามเขียนให้ผ่านเฉย ๆ
เทสชุดนี้จับบั๊กจริงมาแล้ว 2 ตัว (การตัดสิน encoding ด้วยคะแนน · ตาราง latin1 ที่ขาดไป)
