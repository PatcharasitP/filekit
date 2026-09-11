"""กล่องดูไฟล์เต็มจอต้องปิดเองเมื่อเปลี่ยนเครื่องมือ

‼️ ที่มา ตรวจของจริง 11/09/2026 พบบั๊ก: เปิดดูไฟล์เต็มจอแล้วสลับเครื่องมือโดยไม่ปิดก่อน
   <dialog class="pv"> ยังค้างเปิดอยู่ และเพราะเปิดด้วย showModal() ทั้งหน้าที่เหลือกลาย
   เป็น inert คลิกปุ่มอะไรไม่ได้เลยสักปุ่ม ต้องกด Escape เองถึงจะใช้เว็บต่อได้
   คนที่ไม่รู้ว่าต้องกด Escape จะคิดว่าเว็บค้าง

   ต้นเหตุ: box ถูกแคชไว้ระดับโมดูลใน src/preview.js และไม่มีใครสั่งปิดตอนเปลี่ยน route

เทสนี้ตรวจ 4 อย่าง
   ① เปิดกล่องดูไฟล์ได้จริง (ประชากรต้องไม่เป็นศูนย์ ไม่งั้นเทสเขียวหลอก)
   ② สลับเครื่องมือแล้วกล่องต้องปิด
   ③ ปุ่มในเครื่องมือใหม่ต้องคลิกได้จริง
   ④ กลับหน้าแรกก็ต้องปิดเหมือนกัน

รัน: python3 -m http.server 8899 &  แล้ว python3 tests/browser_dialogroute.py
"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
fails = []

def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label)
    if not ok:
        fails.append(label + (f" — {detail}" if detail else ""))

def go(pg, route):
    pg.goto("about:blank")
    pg.goto(f"{BASE}/#/{route}", wait_until="networkidle")
    pg.wait_for_timeout(700)

def open_viewer(pg):
    """กดภาพย่อไฟล์แรกเพื่อเปิดกล่องดูเต็มจอ — คืนชื่อปุ่มที่กด หรือ None"""
    return pg.evaluate("""() => {
        const b = [...document.querySelectorAll('button.thumb')].find(e => e.offsetParent);
        if (!b) return null;
        b.click();
        return b.getAttribute('aria-label') || 'thumb';
    }""")

def open_dialogs(pg):
    return pg.evaluate("()=>[...document.querySelectorAll('dialog.pv')].filter(d=>d.open).length")

with sync_playwright() as p:
    br = p.chromium.launch()
    pg = br.new_context(viewport={"width": 1440, "height": 950}).new_page()

    go(pg, "pdf-merge")
    pg.get_by_role("button", name="ลองด้วยไฟล์ตัวอย่าง").click()
    pg.wait_for_timeout(1300)

    opened = open_viewer(pg)
    pg.wait_for_timeout(900)
    ck("① เปิดกล่องดูไฟล์เต็มจอได้", opened is not None and open_dialogs(pg) == 1,
       f"ปุ่มที่กด={opened}, กล่องที่เปิด={open_dialogs(pg)}")

    # สลับเครื่องมือแบบเดียวกับที่คนกดลิงก์ (เปลี่ยน hash ไม่ใช่โหลดหน้าใหม่)
    pg.evaluate("()=>{location.hash='#/pdf-split'}")
    pg.wait_for_timeout(1100)
    ck("② สลับเครื่องมือแล้วกล่องปิดเอง", open_dialogs(pg) == 0,
       f"ยังเปิดอยู่ {open_dialogs(pg)} กล่อง")

    try:
        pg.get_by_role("button", name="ลองด้วยไฟล์ตัวอย่าง").click(timeout=4000)
        pg.wait_for_timeout(900)
        ck("③ ปุ่มในเครื่องมือใหม่คลิกได้", True)
    except Exception as e:
        ck("③ ปุ่มในเครื่องมือใหม่คลิกได้", False, str(e).split("\n")[0])

    # กลับหน้าแรกก็ต้องปิดเหมือนกัน
    go(pg, "pdf-merge")
    pg.get_by_role("button", name="ลองด้วยไฟล์ตัวอย่าง").click()
    pg.wait_for_timeout(1300)
    open_viewer(pg)
    pg.wait_for_timeout(900)
    before = open_dialogs(pg)
    pg.evaluate("()=>{location.hash=''}")
    pg.wait_for_timeout(1100)
    ck("④ กลับหน้าแรกแล้วกล่องปิดเอง", before == 1 and open_dialogs(pg) == 0,
       f"ก่อน={before} หลัง={open_dialogs(pg)}")

    br.close()

print(f"\n{'❌' if fails else '✅'} ตก {len(fails)} ข้อ")
for f in fails: print("   -", f)
sys.exit(1 if fails else 0)
