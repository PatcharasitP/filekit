"""หน้าแรกต้องช่วยให้ "หาเครื่องมือเจอ" ไม่ใช่แค่มีเครื่องมือครบ

‼️ ที่มา 11/09/2026 พี่ปอนด์ว่า "เครื่องมือเราเยอะเกินไปละ" ตอนมี 40 ตัว
   วัดของจริงแล้วพบว่าไม่ได้เยอะเกิน แต่หน้าแรกไม่ช่วยหา
     จอใหญ่ 1440x950 เครื่องมือตัวแรกอยู่ที่ 832px เห็นแค่ 9 ตัวจาก 40
     หมวด Power Automate มองไม่เห็นตอนเปิดมา เพราะแถบหมวดเลื่อนแนวนอนแล้วล้นออกขวา
     มือถือหนักกว่า มองไม่เห็น 8 หมวด รวมทั้ง Power BI, Power Query, Power Automate
   ซึ่งเป็น 3 หมวดที่พี่ปอนด์ใช้งานจริงที่สุด

รัน: python3 -m http.server 8899 &  แล้ว python3 tests/browser_findability.py
"""
import sys
from playwright.sync_api import sync_playwright

BASE = __import__("os").environ.get("FK_BASE", "http://localhost:8899")
fails = []

def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label)
    if not ok:
        if detail: print("      " + detail)
        fails.append(label)

MEASURE = """() => {
  const pills = [...document.querySelectorAll('.pill')];
  const bar = document.querySelector('#cats');
  const cats = [...bar.querySelectorAll('.cat')];
  const br = bar.getBoundingClientRect();
  return {
    nPill: pills.length,
    firstTop: pills[0] ? Math.round(pills[0].getBoundingClientRect().top) : null,
    seen: pills.filter(p => p.getBoundingClientRect().bottom <= window.innerHeight).length,
    vh: window.innerHeight,
    nCat: cats.length,
    hidden: cats.filter(c => {
      const r = c.getBoundingClientRect();
      return r.right > br.right + 1 || r.left < br.left - 1;
    }).map(c => c.textContent.trim().replace(/\\s+/g, ' ')),
    pageH: document.documentElement.scrollHeight,
  };
}"""

def main():
    with sync_playwright() as P:
        b = P.chromium.launch()
        for w, h, tag, minSeen, topRatio in ((1440, 950, "จอใหญ่", 12, 0.72), (390, 844, "มือถือ", 4, 0.80)):
            pg = b.new_context(viewport={"width": w, "height": h}).new_page()
            pg.goto(f"{BASE}/", wait_until="networkidle")
            pg.wait_for_function("() => document.querySelectorAll('.pill').length > 0", timeout=15000)
            pg.wait_for_timeout(400)
            m = pg.evaluate(MEASURE)
            print(f"\n── {tag} {w}x{h} ──")
            ck(f"{tag}: เปิดมาต้องเห็นเครื่องมืออย่างน้อย {minSeen} ตัวโดยไม่เลื่อน (เห็น {m['seen']} จาก {m['nPill']})",
               m["seen"] >= minSeen)
            limit = int(m["vh"] * topRatio)
            ck(f"{tag}: เครื่องมือตัวแรกต้องโผล่ก่อน {limit}px (อยู่ที่ {m['firstTop']}px)",
               m["firstTop"] is not None and m["firstTop"] <= limit)
            # ‼️ หมวดที่ผู้ใช้ไม่รู้ว่ามี = เหมือนไม่มี ต้องเห็นครบทุกหมวดตอนเปิดมา ห้ามซ่อนไว้นอกจอ
            ck(f"{tag}: ต้องเห็นครบทุกหมวดตอนเปิดมา ไม่มีหมวดไหนถูกซ่อนนอกแถบ ({m['nCat']} หมวด)",
               not m["hidden"], "หมวดที่ถูกซ่อน: " + ", ".join(m["hidden"]) if m["hidden"] else "")
            print(f"     (หน้าสูงรวม {m['pageH']}px)")
        b.close()

    print("\n" + "━" * 54)
    print(f"ตก {len(fails)} ข้อ" if fails else "ผ่านทุกข้อ")
    sys.exit(1 if fails else 0)

main()
