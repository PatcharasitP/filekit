"""image-bg-remove ลบพื้นหลังหลายรูปแล้ว ปุ่ม โหลดทั้งหมด (ZIP) ต้องอยู่ในแผงผลลัพธ์ที่เห็น และกดได้ไฟล์ zip
ที่มา 07/11/2026 ฟ้าไล่กดทุกปุ่มบนเว็บจริง v218 ปุ่ม ZIP กดไม่ได้ (Timeout) เปิดดูแล้วปุ่มค้างในผืนงานซ้ายใต้ s2-stage
ที่บังอยู่ เพราะกล่องผลลัพธ์ของเครื่องมือนี้ไม่มี class results เปลือกหน้าย้ายแค่ .results > .actions ไปแผงขวา
ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> ../.venv/bin/python tests/browser_bgremove_zip.py"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
bad = 0
def check(name, ok, d=""):
    global bad
    bad += 0 if ok else 1
    print(("  ✅ " if ok else "  ❌ ") + name + (f"  [{str(d)[:200]}]" if not ok else ""), flush=True)

with sync_playwright() as pw:
    b = pw.chromium.launch(); errs = []
    p = b.new_page(viewport={"width": 1280, "height": 900}, accept_downloads=True); p.on("pageerror", lambda e: errs.append(str(e)))
    p.goto(f"{BASE}/#/image-bg-remove"); p.wait_for_selector("button.s2-link", timeout=20000); p.wait_for_timeout(500)
    p.locator("#tool button:visible", has_text="ลองด้วยไฟล์ตัวอย่าง").first.click()
    p.wait_for_function("() => document.querySelectorAll('#tool [aria-label^=\"ดูข้อมูลใน\"]').length >= 2", timeout=20000)
    p.locator("#tool button.s2-cta:visible").first.click()
    p.wait_for_function("() => [...document.querySelectorAll('#tool button')].some(b => b.textContent.includes('โหลดทั้งหมด (ZIP)'))", timeout=120000)
    p.wait_for_timeout(800)
    # ‼️ สิ่งที่ ทำอะไรต่อดี พาไป ต้องเป็นรูปที่ลบพื้นหลังแล้ว (ขนาดตรงแถวผลลัพธ์) ไม่ใช่รูปต้นฉบับ
    #    ก่อนแก้พาต้นฉบับไป และหลังกด ZIP กลายเป็นไฟล์ zip ใบเดียว (07/11/2026)
    CARRY = "async () => { const m = await import('./src/ui.js'); return (m.carryFiles() || []).map(f => [f.name, f.size, f.type]); }"
    RES = """() => [...document.querySelectorAll('#tool .s2-side-res .result')].map(r => r.querySelector('strong').textContent.trim())"""
    def carry_ok(tag):
        c = p.evaluate(CARRY); names = p.evaluate(RES)
        inp = p.evaluate("async () => { const m = await import('./src/ui.js'); return (m.fileState().input || []).map(f => [f.name, f.size]); }")
        check(f"{tag}: พาไฟล์ไปเครื่องมือถัดไปครบ {len(names)} รูปที่เป็น png", len(c) == len(names) == 2 and all(x[0].endswith(".png") for x in c), c)
        check(f"{tag}: ไฟล์ที่พาไปไม่ใช่รูปต้นฉบับ (ขนาดต่างจากไฟล์ในกล่อง)", c and all([x[0], x[1]] not in [list(i) for i in inp] for x in c), {"carry": c, "input": inp})
        nxt = p.evaluate("() => { const t = document.querySelector('#tool').innerText; const i = t.indexOf('ทำอะไรต่อดี'); return i < 0 ? '' : t.slice(i, i + 600); }")
        check(f"{tag}: ทำอะไรต่อดี มีเครื่องมือที่พาไฟล์ไปด้วย", nxt.count("พาไฟล์ไปด้วย") >= 3, nxt[:200])
    carry_ok("ก่อนกด ZIP")
    z = p.locator("#tool button", has_text="โหลดทั้งหมด (ZIP)").first
    top = p.evaluate("""() => { const z = [...document.querySelectorAll('#tool button')].find(b => b.textContent.includes('โหลดทั้งหมด (ZIP)'));
      const r = z.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { hit: !!e && (e === z || z.contains(e)), on: e ? e.className : null, inside: !!z.closest('.s2-side-res') }; }""")
    check("ปุ่ม ZIP อยู่ในแผงผลลัพธ์ ไม่ค้างในผืนงานที่ถูกบัง", top["inside"], top)
    check("จุดกลางปุ่ม ZIP ไม่มีอะไรทับ", top["hit"], top)
    name = ""
    try:
        with p.expect_download(timeout=20000) as d:
            z.click(timeout=5000)
        name = d.value.suggested_filename
    except Exception as e:
        name = "กดไม่ได้: " + str(e).split("\n")[0][:120]
    check("กดปุ่ม ZIP แล้วได้ไฟล์ .zip", name.endswith(".zip"), name)
    p.wait_for_timeout(800)
    carry_ok("หลังกด ZIP")
    check("ไม่มี error ในหน้า", not errs, errs[:2])
    b.close()
print(f"\nbrowser_bgremove_zip: {'ผ่านหมด' if not bad else f'ตก {bad}'}")
sys.exit(1 if bad else 0)
