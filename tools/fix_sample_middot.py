"""ลบอักขระที่กฎห้าม (จุดกลาง · และขีดยาว —) ออกจากไฟล์ตัวอย่าง PDF โดยไม่แตะอย่างอื่นเลย

‼️ ที่มา: กฎของพี่ปอนด์ห้ามใช้จุดกลาง · เป็นตัวคั่นในข้อความที่ผู้ใช้เห็น
   ไฟล์ตัวอย่างนี้มีจุดกลาง 1 จุด ซึ่งไหลเข้าไปอยู่ในโค้ด M ที่ผู้ใช้คัดลอกไปใช้จริง
   จาก excel-to-pq (เครื่องมือนั้นเลือกตัวอย่างเป็น PDF ตาม SAMPLE_KIND_PRIORITY)

‼️ ทำไมไม่แทนที่ด้วยจุลภาค: ฟอนต์ในไฟล์เป็น subset ที่ฝังมาเฉพาะกลิฟที่ใช้จริง
   การใส่อักขระใหม่เสี่ยงว่าไม่มีกลิฟนั้นในฟอนต์แล้วขึ้นเป็นกล่องเปล่า
   กฎอนุญาต "เว้นวรรคกว้าง" อยู่แล้ว การลบกลิฟทิ้งจึงได้ผลที่ถูกกฎและปลอดภัยที่สุด

‼️ ทำไมต้องเป็นสคริปต์ ไม่ใช่แก้มือครั้งเดียว: ไฟล์นี้ถูก commit มาเป็นไบนารีล้วน
   ไม่มีสคริปต์สร้าง ครั้งหน้าที่ต้องแก้จะต้องมานั่งเดาใหม่ทั้งหมด

รัน: python3 tools/fix_sample_middot.py [--check]
     --check = ตรวจอย่างเดียว ไม่แก้ไฟล์
"""
import shutil
import sys

import fitz

PDF = "samples/ตัวอย่าง-รายงานประจำเดือน.pdf"
BAD = ["\u00b7", "\u2014"]     # จุดกลาง และ ขีดยาว ทั้งคู่กฎห้ามเป็นตัวคั่น


def count_bad(path):
    doc = fitz.open(path)
    n = sum(page.get_text().count(ch) for page in doc for ch in BAD)
    pages = doc.page_count
    doc.close()
    return n, pages


def main():
    check_only = "--check" in sys.argv
    before, pages_before = count_bad(PDF)
    print(f"ก่อนแก้: อักขระต้องห้าม {before} จุด, {pages_before} หน้า")
    if check_only:
        sys.exit(0 if before == 0 else 1)
    if before == 0:
        print("ไม่มีอักขระต้องห้ามแล้ว ไม่ต้องทำอะไร")
        return

    shutil.copy2(PDF, PDF + ".bak")
    doc = fitz.open(PDF)
    removed = 0
    for page in doc:
        for ch in BAD:
          for rect in page.search_for(ch):
            # ‼️ ลบเฉพาะกรอบของกลิฟนั้น ไม่ใส่อะไรแทน จึงเหลือเป็นช่องว่าง
            page.add_redact_annot(rect)
            removed += 1
        if removed:
            # ‼️ ห้ามให้ลบรูปหรือกราฟิกอื่นที่บังเอิญทับกรอบ
            page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE,
                                  graphics=fitz.PDF_REDACT_LINE_ART_NONE)
    doc.save(PDF + ".tmp", garbage=3, deflate=True)
    doc.close()
    shutil.move(PDF + ".tmp", PDF)

    after, pages_after = count_bad(PDF)
    print(f"หลังแก้: อักขระต้องห้าม {after} จุด, {pages_after} หน้า (ลบไป {removed} จุด)")
    if after != 0 or pages_after != pages_before:
        shutil.move(PDF + ".bak", PDF)
        print("‼️ ผลไม่เป็นไปตามที่ควร คืนไฟล์เดิมแล้ว")
        sys.exit(1)
    print("สำเร็จ · ไฟล์สำรองอยู่ที่", PDF + ".bak")


if __name__ == "__main__":
    main()
