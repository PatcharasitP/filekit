"""ลูกศรเลื่อนแถบชุดสี (pbi-theme) ต้องปิดตัวเองเมื่อเลื่อนต่อไม่ได้ ไม่งั้นกดแล้วไม่เกิดอะไรขึ้น
ที่มา 07/11/2026 พี่ปอนด์ "บางปุ่มเหมือนมีแต่กดแล้วไม่เกิดอะไรขึ้น" ฟ้าไล่กดทุกปุ่มบนเว็บจริง v218 วัดแล้ว
ต้นแถบ scrollLeft 2 จาก 487 ลูกศรก่อนหน้าทึบเต็ม กดได้ กดแล้วอยู่ที่เดิม , สุดแถบ 487 จาก 487 ลูกศรถัดไปก็เหมือนกัน
ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> ../.venv/bin/python tests/browser_carousel_ends.py"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
bad = 0
def check(name, ok, d=""):
    global bad
    bad += 0 if ok else 1
    print(("  ✅ " if ok else "  ❌ ") + name + (f"  [{str(d)[:200]}]" if not ok else ""), flush=True)

ST = """() => { const t = document.querySelector('.ts-track.ts-pal'); const p = document.querySelector('.ts-arr.prev'), n = document.querySelector('.ts-arr.next');
  return { left: Math.round(t.scrollLeft), max: t.scrollWidth - t.clientWidth, prev: p.disabled, next: n.disabled }; }"""
with sync_playwright() as pw:
    b = pw.chromium.launch(); errs = []
    for w in (1280, 390):
        p = b.new_page(viewport={"width": w, "height": 900}); p.on("pageerror", lambda e: errs.append(str(e)))
        p.goto(f"{BASE}/#/pbi-theme"); p.wait_for_selector(".ts-track.ts-pal", timeout=20000); p.wait_for_timeout(1200)
        p.locator(".ts-track.ts-pal").first.scroll_into_view_if_needed(); p.wait_for_timeout(300)
        s = p.evaluate(ST)
        check(f"{w}px: แถบยาวกว่ากรอบจริง (มีอะไรให้เลื่อน)", s["max"] > 20, s)
        check(f"{w}px: ต้นแถบ ลูกศรก่อนหน้าปิด ลูกศรถัดไปเปิด", s["prev"] is True and s["next"] is False, s)
        # ‼️ ปิดแล้วต้องดูออกว่าปิด (07/11 รอบแรกปิดได้แต่หน้าตาเหมือนเดิม opacity 1 เคอร์เซอร์มือ)
        op = p.evaluate("() => [...document.querySelectorAll('.ts-arr')].map(a => [parseFloat(getComputedStyle(a).opacity), getComputedStyle(a).cursor])")
        check(f"{w}px: ลูกศรที่ปิดดูจางและไม่ใช่เคอร์เซอร์มือ ลูกศรที่เปิดทึบเต็ม", op[0][0] < 0.6 and op[0][1] != "pointer" and op[1][0] == 1, op)
        p.click(".ts-arr.next"); p.wait_for_timeout(800); s = p.evaluate(ST)
        check(f"{w}px: กดถัดไปแล้วแถบเลื่อน และลูกศรก่อนหน้าเปิด", s["left"] > 20 and s["prev"] is False, s)
        for _ in range(10):
            if p.evaluate(ST)["next"]: break
            p.click(".ts-arr.next"); p.wait_for_timeout(600)
        s = p.evaluate(ST)
        check(f"{w}px: สุดแถบ ลูกศรถัดไปปิด", s["next"] is True and s["left"] >= s["max"] - 4, s)
        p.close()
    check("ไม่มี error ในหน้า", not errs, errs[:2])
    b.close()
print(f"\nbrowser_carousel_ends: {'ผ่านหมด' if not bad else f'ตก {bad}'}")
sys.exit(1 if bad else 0)
