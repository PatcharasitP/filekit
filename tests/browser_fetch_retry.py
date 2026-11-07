"""ไฟล์ของเว็บเองโหลดพลาดชั่วคราว (5xx) ครั้งแรก เครื่องมือต้องลองซ้ำเองแล้วใช้งานได้ ไม่ค้างหน้า error ที่ปุ่มกดแล้วเงียบ
ที่มา 07/11/2026 ไล่กดทุกปุ่มบนเว็บจริง v221 สามกองพร้อมกัน กราฟแท่ง Deneb โหลด samples/powerbi/bar.vl.json ได้ HTTP 503 หนึ่งครั้ง
ขึ้น เตรียมเครื่องมือไม่สำเร็จ แล้วปุ่มคัดลอกสเปก ดาวน์โหลด .json ฯลฯ 5 ปุ่มกดแล้วเงียบ ยิงซ้ำทันทีได้ 200 (หลักฐาน .claude/evidence/2026-11-07-filekit-sweep-v221)
ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> ../.venv/bin/python tests/browser_fetch_retry.py"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
bad = 0
def check(name, ok, d=""):
    global bad
    bad += 0 if ok else 1
    print(("  ✅ " if ok else "  ❌ ") + name + (f"  [{str(d)[:220]}]" if not ok else ""), flush=True)

CASES = [("pbi-bar", "**/samples/powerbi/bar.vl.json*"), ("pbi-donut", "**/samples/powerbi/*donut*.json*"), ("pbi-gantt", "**/samples/powerbi/gantt.vl.json*")]
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for tool, pat in CASES:
        c = b.new_context(viewport={"width": 1280, "height": 900}, service_workers="block"); p = c.new_page(); errs = []
        p.on("pageerror", lambda e: errs.append(str(e)))
        hit = {"n": 0}
        def make(hit):  # ‼️ Playwright ส่ง request เป็นอาร์กิวเมนต์ที่สอง ห้ามใช้ค่าเริ่มต้นของพารามิเตอร์เก็บตัวนับ
            def flaky(route, request):
                hit["n"] += 1
                if hit["n"] == 1: return route.fulfill(status=503, body="Service Unavailable")
                return route.continue_()
            return flaky
        p.route(pat, make(hit))
        p.goto(f"{BASE}/#/{tool}"); p.wait_for_timeout(5000)
        txt = p.evaluate("() => document.querySelector('#tool')?.innerText || ''")
        check(f"{tool}: ตั้งต้น ไฟล์สเปกถูกขอและครั้งแรกได้ 503", hit["n"] >= 1, hit)
        check(f"{tool}: ลองซ้ำเองแล้วไม่ค้างที่ เตรียมเครื่องมือไม่สำเร็จ", "ไม่สำเร็จ" not in txt and hit["n"] >= 2, {"ขอกี่ครั้ง": hit["n"], "จอ": txt[:160]})
        check(f"{tool}: กราฟขึ้นจริง", p.locator("#tool canvas, #tool svg.marks").count() > 0)
        check(f"{tool}: ไม่มี error ในหน้า", not errs, errs[:2])
        c.close()
    b.close()
print(f"\nbrowser_fetch_retry: {'ผ่านหมด' if not bad else f'ตก {bad}'}")
sys.exit(1 if bad else 0)
