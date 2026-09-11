"""แผงตั้งค่าต้องบอกได้ว่าช่องไหนถูกแก้จากค่าเริ่มต้น และคืนค่าทีละช่องได้

‼️ ที่มา 11/09/2026 วัดของจริงแล้วพบว่า ปรับ 2 ช่องให้ต่างจากค่าเริ่มต้น
   ไม่มีอะไรบอกเลยสักอย่าง และคืนค่าได้แค่ทั้งชุดเท่านั้น
   คนกดชุดพร้อมใช้แล้วปรับต่อไปเรื่อย ๆ จึงไม่รู้ว่าเบี่ยงไปกี่ช่อง ช่องไหนบ้าง
   งานวิจัย 11/09/2026 พบว่า VS Code, Webflow และ Power BI ทำเรื่องนี้เหมือนกัน

เทสนี้เดินครบทุกเส้นทางที่ค่าเปลี่ยนได้ ไม่ใช่แค่เส้นทางเดียว
   ① เปิดมาใหม่ต้องไม่มีอะไรถูกทำเครื่องหมาย
   ② แก้ทีละช่องแล้วนับต้องเพิ่มตาม
   ③ กดคืนค่าทีละช่องแล้วต้องลดลงเฉพาะช่องนั้น ช่องอื่นไม่หาย
   ④ กดชุดพร้อมใช้แล้วต้องอัปเดตตาม ไม่ใช่ค้างค่าเดิม
   ⑤ ‼️ ปุ่มคืนค่าห้ามอยู่ใน label ของช่องกรอก ไม่งั้นชื่อที่โปรแกรมอ่านหน้าจอ
      ได้ยินจะเพี้ยน (เจอจริงตอนทำ หาช่องด้วยชื่อป้ายไม่เจออีกเลย)

รัน: python3 -m http.server 8899 &  แล้ว python3 tests/browser_dirtymark.py
"""
import sys
from playwright.sync_api import sync_playwright

BASE = __import__("os").environ.get("FK_BASE", "http://localhost:8899")
fails = []
# ‼️ ค่าที่ใช้ทดสอบต้องอยู่ในช่วงของแต่ละช่องจริง ไม่งั้น fill ล้มเหลว
# (ช่องขนาดวงของโดนัทมีเพดาน 1.0 ใส่ 7 ไม่ได้ เจอจริงตอนเขียนเทส)
CASES = [("pbi-bar", ".pbib-right", ("ความหนาแท่ง", "0.4"), ("มุมโค้งปลายแท่ง", "7"), "ขึ้นจอนำเสนอ"),
         ("pbi-donut", ".pbid-right", ("ความหนาวง", "0.4"), ("ขนาดวง", "0.6"), "ขึ้นจอนำเสนอ")]

def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label)
    if not ok:
        if detail: print("      " + detail)
        fails.append(label)

SNAP = """(sel) => {
  const p = document.querySelector(sel);
  const vis = e => !e.hidden && e.offsetParent !== null;
  return {
    changed: p.querySelectorAll('[data-param].dm-changed').length,
    buttons: [...p.querySelectorAll('.dm-reset')].filter(vis).length,
    summary: (document.querySelector('.dm-summary') || {}).textContent || '',
    tagged: p.querySelectorAll('[data-param]').length,
    inLabel: p.querySelectorAll('label .dm-reset').length,
  };
}"""

def main():
    with sync_playwright() as P:
        b = P.chromium.launch()
        pg = b.new_context(viewport={"width": 1440, "height": 950}).new_page()
        for tid, panel, (f1, v1), (f2, v2), preset in CASES:
            print(f"\n── {tid} ──")
            pg.goto("about:blank")
            pg.goto(f"{BASE}/#/{tid}", wait_until="networkidle")
            pg.wait_for_selector(".cfs-input", timeout=20000)
            pg.wait_for_timeout(1300)

            s0 = pg.evaluate(SNAP, panel)
            ck(f"{tid}: ทุกช่องติดป้ายว่าคุมพารามิเตอร์ไหน (พบ {s0['tagged']} ช่อง)", s0["tagged"] >= 15)
            ck(f"{tid}: เปิดมาใหม่ต้องไม่มีช่องไหนถูกทำเครื่องหมาย", s0["changed"] == 0 and s0["summary"] == "")
            # ‼️ ปุ่มคืนค่าห้ามอยู่ใน label ของช่องกรอก เพราะทำให้ชื่อที่อ่านหน้าจอได้ยินเพี้ยน
            ck(f"{tid}: ปุ่มคืนค่าต้องอยู่นอก label ของช่องกรอก", s0["inLabel"] == 0,
               f"พบปุ่มอยู่ใน label {s0['inLabel']} จุด")

            pg.get_by_label(f1).fill(v1); pg.wait_for_timeout(350)
            s1 = pg.evaluate(SNAP, panel)
            ck(f"{tid}: แก้ 1 ช่องแล้วขึ้นเครื่องหมายและปุ่มคืนค่า",
               s1["changed"] == 1 and s1["buttons"] == 1 and s1["summary"] != "", str(s1))

            pg.get_by_label(f2).fill(v2); pg.wait_for_timeout(350)
            s2 = pg.evaluate(SNAP, panel)
            ck(f"{tid}: แก้ช่องที่สองแล้วนับเพิ่มเป็น 2", s2["changed"] == 2 and s2["buttons"] == 2, str(s2))

            pg.locator(".dm-reset:visible").first.click(); pg.wait_for_timeout(450)
            s3 = pg.evaluate(SNAP, panel)
            ck(f"{tid}: กดคืนค่าทีละช่องแล้วลดเฉพาะช่องนั้น ช่องอื่นยังอยู่",
               s3["changed"] == 1 and s3["buttons"] == 1, str(s3))

            pg.get_by_role("button", name=preset).click(); pg.wait_for_timeout(600)
            s4 = pg.evaluate(SNAP, panel)
            ck(f"{tid}: กดชุดพร้อมใช้แล้วเครื่องหมายอัปเดตตาม ไม่ค้างค่าเดิม",
               s4["changed"] > 0 and s4["changed"] != s3["changed"], str(s4))
        b.close()

    print("\n" + "━" * 54)
    print(f"ตก {len(fails)} ข้อ" if fails else "ผ่านทุกข้อ")
    sys.exit(1 if fails else 0)

main()
