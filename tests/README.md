# เทสของ FileKit

รันจากโฟลเดอร์ `FileKit/`:

```bash
# ① ตรรกะล้วน (เร็ว ไม่ต้องเปิดเบราว์เซอร์)
node tests/thai.test.mjs

# ② เบราว์เซอร์จริง — ต้องเปิดเซิร์ฟเวอร์ก่อน
python3 -m http.server 8899 &
../.venv/bin/python tests/browser_smoke.py    # เปิดครบทุกเครื่องมือ ไม่มี error
../.venv/bin/python tests/browser_thai.py     # ชุดเครื่องมือไทย ตรวจค่าจริงในตาราง
```

เปลี่ยน `BASE` ในไฟล์เป็น `https://patcharasitp.github.io/filekit` เพื่อยิงใส่เว็บจริงได้

**กติกา:** เทสต้อง **แดงตอนมีบั๊ก** และ **เขียวหลังแก้** — ห้ามเขียนให้ผ่านเฉย ๆ
เทสชุดนี้จับบั๊กจริงมาแล้ว 2 ตัว (การตัดสิน encoding ด้วยคะแนน · ตาราง latin1 ที่ขาดไป)
