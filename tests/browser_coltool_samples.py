"""เครื่องมือแปลงคอลัมน์ทั้ง 5 ตัว กด "ลองด้วยไฟล์ตัวอย่าง" แล้วต้องเลือกคอลัมน์ที่ถูกเรื่องให้เอง และแปลงสำเร็จอย่างน้อยหนึ่งแถว
ที่มา 07/11/2026 ฟ้าไล่กดทุกปุ่มบนเว็บจริง v218 ทั้ง 5 ตัวได้ไฟล์ตัวอย่างกลาง ตัวอย่าง-ข้อมูลใบเสนอราคา.xlsx
แยกที่อยู่แยกได้ 0 จาก 5 (ไฟล์ไม่มีคอลัมน์ที่อยู่ เลือกคอลัมน์ เลขที่) , ตรวจเลขบัตรเลือกคอลัมน์ ภาษี ถูกต้อง 0 ,
แปลงตัวเลขเป็นคำอ่านเลือกคอลัมน์ ยืนราคาถึง ซึ่งเป็นวันที่ คนที่ลองครั้งแรกเห็นเครื่องมือเหมือนใช้ไม่ได้
ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> ../.venv/bin/python tests/browser_coltool_samples.py"""
import os, re, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
bad = 0
def check(name, ok, d=""):
    global bad
    bad += 0 if ok else 1
    print(("  ✅ " if ok else "  ❌ ") + name + (f"  [{str(d)[:200]}]" if not ok else ""), flush=True)

# เครื่องมือ: (คำในชื่อคอลัมน์ที่ต้องถูกเลือก, คำนับแถวสำเร็จ, คำนับแถวพลาด)
WANT = {
    "thai-address": ("ที่อยู่", "แยกได้", "แยกไม่ได้"),
    "thai-date": ("วันที่", "แปลงได้", "อ่านรูปแบบวันที่ไม่ออก"),
    "thai-id": ("ผู้เสียภาษี", "ถูกต้อง", "ผิด/ไม่ครบ"),
    "thai-name": ("ชื่อ", "แยกได้", "แยกไม่ได้"),
    "thai-number": ("ยอด", "แปลงได้", "ไม่ใช่ตัวเลข"),
}
COL = """() => { const s = [...document.querySelectorAll('#tool select')].find(x => x.options.length > 3); return s ? s.options[s.selectedIndex].text : '' }"""
with sync_playwright() as pw:
    b = pw.chromium.launch(); errs = []
    for tid, (col_word, ok_word, bad_word) in WANT.items():
        p = b.new_page(viewport={"width": 1280, "height": 900}); p.on("pageerror", lambda e: errs.append(str(e)))
        p.goto(f"{BASE}/#/{tid}"); p.wait_for_selector("button.s2-link", timeout=20000); p.wait_for_timeout(600)
        p.locator("#tool button:visible", has_text="ลองด้วยไฟล์ตัวอย่าง").first.click()
        t = ""
        for _ in range(30):
            p.wait_for_timeout(300); t = p.inner_text("#tool")
            if re.search(re.escape(ok_word) + r"\s*\d+\s*แถว", t): break
        col = p.evaluate(COL)
        okn = re.search(re.escape(ok_word) + r"\s*(\d+)\s*แถว", t); badn = re.search(re.escape(bad_word) + r"\s*(\d+)\s*แถว", t)
        okv = int(okn.group(1)) if okn else 0; badv = int(badn.group(1)) if badn else 0
        check(f"{tid}: เลือกคอลัมน์ที่มีคำว่า {col_word} ให้เอง", col_word in col and "ยืนราคา" not in col, col)
        check(f"{tid}: ไฟล์ตัวอย่างแปลงสำเร็จอย่างน้อยครึ่งหนึ่ง", okv >= 1 and okv >= badv, f"{ok_word} {okv} {bad_word} {badv}")
        p.close()
    check("ไม่มี error ในหน้า", not errs, errs[:2])
    b.close()
print(f"\nbrowser_coltool_samples: {'ผ่านหมด' if not bad else f'ตก {bad}'}")
sys.exit(1 if bad else 0)
