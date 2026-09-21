# ตรวจบั๊ก "ลากไฟล์ใหม่ทับแล้วยังโชว์ผลลัพธ์ของไฟล์เก่า" (จับได้ 22/09/2026)
#
# อาการที่เห็นกับตาบนเว็บจริง
#   ใส่เลขหน้า first.pdf เสร็จ แล้วลาก second.pdf มาวางทับ
#   หน้ายังค้างสถานะผลลัพธ์ โชว์ "first-มีเลขหน้า.pdf" พร้อมปุ่มดาวน์โหลดที่กดได้
#   = ผู้ใช้ได้ไฟล์ผิดใบโดยไม่มีอะไรเตือน และ "ทำอะไรต่อดี" ก็พาไฟล์เก่าไปเครื่องมือถัดไปด้วย
#
# ต้นเหตุ 2 ชั้น (แก้คู่กัน)
#   ① ui.js setInputFiles() ไม่ล้างผลลัพธ์ของไฟล์ชุดก่อน
#   ② shell2.js ได้ยินว่าไฟล์เปลี่ยนก่อนที่เครื่องมือจะล้างแถวผลลัพธ์เก่า แล้วคว้าแถวเก่าไปโชว์
#      (ลำดับจริงของกล่องรับไฟล์คือ setInputFiles ก่อน onChange เสมอ)
#
# ‼️ เทสนี้ถามของที่ผู้ใช้เจอจริง 2 อย่าง: หน้ากลับไปหน้าทำงานไหม และไฟล์ที่จะพาไปต่อเป็นใบใหม่ไหม

import sys, os, pathlib, tempfile, shutil, traceback
import fitz
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
SELFTEST = "--selftest" in sys.argv
ROOT = pathlib.Path(tempfile.mkdtemp(prefix="fk_stale_"))

# เครื่องมือไฟล์เดียวที่ทำผลลัพธ์ออกมาแน่นอน กับข้อความบนปุ่มหลักของมัน
CASES = [("pdf-page-numbers", "ใส่เลขหน้า"), ("pdf-watermark", "ใส่ลายน้ำ")]

P, F = 0, []


def ck(name, got, want, note=""):
    global P
    ok = got == want
    if ok: P += 1
    else: F.append(f"{name}\n      ได้ {got!r} ควรได้ {want!r}" + (f"\n      {note}" if note else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + (f" — ได้ {got!r}" if not ok else ""))
    return ok


def make(name, label):
    d = fitz.open()
    for i in range(2):
        d.new_page(width=400, height=300).insert_text((40, 80), f"{label} {i + 1}", fontname="helv", fontsize=20)
    p = ROOT / name
    d.save(str(p)); d.close()
    return p


def state(pg):
    return pg.evaluate("() => document.querySelector('.s2')?.dataset.state || null")


def carry(pg):
    """ไฟล์ที่ "ทำอะไรต่อดี" จะพาไปเครื่องมือถัดไป อ่านจากโมดูลตัวเดียวกับที่หน้าใช้จริง"""
    return pg.evaluate("async () => { const m = await import('./src/ui.js'); return (m.carryFiles() || []).map(f => f.name); }")


def run_tool(pg, text):
    pg.locator("button.s2-cta:visible").filter(has_text=text).first.click(timeout=15000)
    pg.wait_for_function("() => document.querySelector('.s2')?.dataset.state === 'result'", timeout=30000)
    pg.wait_for_timeout(400)


def main():
    first, second = make("first.pdf", "FIRST"), make("second.pdf", "SECOND")
    other = make("other.pdf", "OTHER")
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 1400, "height": 950}, service_workers="block")
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))

        for tool, text in CASES:
            print(f"\n── {tool}")
            pg.goto("about:blank")
            pg.goto(f"{BASE}/#/{tool}", wait_until="networkidle")
            pg.wait_for_selector(".dz", state="attached")
            pg.locator(".dz input[type=file]").first.set_input_files(str(first))
            pg.wait_for_timeout(2200)
            run_tool(pg, text)

            if SELFTEST:
                # ‼️ พิสูจน์ว่าตัวตรวจ "มองเห็น" สถานะผลลัพธ์และไฟล์ผลลัพธ์ของไฟล์แรกจริง
                #    ถ้าข้อนี้ไม่ผ่าน แปลว่าข้อหลักข้างล่างผ่านได้เพราะตัวตรวจตาบอด ไม่ใช่เพราะของถูก
                ck(f"[{tool}] ตัวตรวจเห็นสถานะผลลัพธ์หลังทำไฟล์แรก", state(pg), "result")
                got = carry(pg)
                ck(f"[{tool}] ตัวตรวจเห็นไฟล์ผลลัพธ์ของไฟล์แรกเป็นของที่จะพาไปต่อ",
                   bool(got) and got[0].startswith("first") and got[0] != "first.pdf", True, f"ได้ {got}")
                continue

            pg.locator(".dz input[type=file]").first.set_input_files(str(second))
            pg.wait_for_timeout(2200)
            ck(f"[{tool}] ลากไฟล์ใหม่ทับแล้ว ต้องกลับหน้าทำงาน ไม่ค้างผลลัพธ์ของไฟล์เก่า", state(pg), "work")
            ck(f"[{tool}] ไฟล์ที่จะพาไปเครื่องมือถัดไป ต้องเป็นไฟล์ใหม่ ไม่ใช่ผลลัพธ์ของไฟล์เก่า",
               carry(pg), ["second.pdf"])
            visible_old = pg.evaluate("""() => [...document.querySelectorAll('.s2-side-res button, .s2-side-res .result')]
                .filter(e => e.offsetParent && /first/.test(e.textContent + (e.getAttribute('aria-label') || ''))).length""")
            ck(f"[{tool}] บนจอต้องไม่เหลือปุ่มหรือแถวของไฟล์เก่าให้กด", visible_old, 0)

            run_tool(pg, text)
            got = carry(pg)
            ck(f"[{tool}] ทำไฟล์ใหม่เสร็จ ผลลัพธ์ต้องเป็นของไฟล์ใหม่",
               bool(got) and got[0].startswith("second"), True, f"ได้ {got}")

        # ── แวะไปเครื่องมืออื่นแล้วกลับมา แล้วค่อยลากไฟล์ใหม่ทับ (เจอ 22/09/2026) ──
        # ‼️ แอปเก็บหน้าเครื่องมือไว้ในแคช เดิมตัวเฝ้าไฟล์ของหน้าเดิมถูกถอดทิ้งตอนหน้าหลุดจากจอ
        #    กลับมาแล้วลากไฟล์ใหม่ใส่ หน้ายังค้างผลลัพธ์ของไฟล์เก่า กดดาวน์โหลดได้ไฟล์เก่า
        #    (จับได้จาก PDF ที่ดาวน์โหลดมาเป็นของเก่าจริงใน browser_realfiles.py)
        # เปลี่ยนหน้าด้วย hash แบบที่เมนูกับลิงก์ในเว็บทำ ไม่ใช่โหลดหน้าใหม่ ไม่งั้นแคชไม่ได้ถูกใช้เลย
        for tool, text in CASES:
            print(f"\n── {tool} แวะเครื่องมืออื่นแล้วกลับมา")
            pg.goto("about:blank")
            pg.goto(f"{BASE}/#/{tool}", wait_until="networkidle")
            pg.wait_for_selector(".dz", state="attached")
            pg.locator(".dz input[type=file]").first.set_input_files(str(first))
            pg.wait_for_timeout(2200)
            run_tool(pg, text)
            # ที่เครื่องมือที่แวะไป ผู้ใช้ใส่ไฟล์อีกใบไว้ด้วย ถ้าค่ากลางไม่ถูกคืน "ทำอะไรต่อดี" จะพาใบนี้ไปแทน
            pg.evaluate("() => { location.hash = '#/pdf-merge'; }")
            pg.wait_for_timeout(1500)
            pg.locator("#tool .dz input[type=file]").first.set_input_files(str(other))
            pg.wait_for_timeout(1200)
            pg.evaluate(f"() => {{ location.hash = '#/{tool}'; }}")
            pg.wait_for_timeout(1500)
            if SELFTEST:
                ck(f"[{tool}] ตัวตรวจเห็นสถานะผลลัพธ์เดิมหลังกลับมา", state(pg), "result")
            else:
                ck(f"[{tool}] กลับมาแล้วผลลัพธ์เดิมของเครื่องมือนี้ยังอยู่ ไม่หายเพราะแค่แวะไปที่อื่น", state(pg), "result")
                got = carry(pg)
                ck(f"[{tool}] กลับมาแล้ว ทำอะไรต่อดี ต้องพาผลลัพธ์ของหน้านี้ ไม่ใช่ไฟล์ของเครื่องมือที่แวะไป",
                   bool(got) and got[0].startswith("first") and got[0] != "first.pdf", True, f"ได้ {got}")
                pg.locator("#tool .dz input[type=file]").first.set_input_files(str(second))
                pg.wait_for_timeout(2200)
                ck(f"[{tool}] กลับมาแล้วลากไฟล์ใหม่ทับ ต้องกลับหน้าทำงาน ไม่ค้างผลลัพธ์ของไฟล์เก่า", state(pg), "work")
                ck(f"[{tool}] ไฟล์ที่จะพาไปต่อเป็นไฟล์ใหม่", carry(pg), ["second.pdf"])
                # ตัวเฝ้าที่ตายไปแล้วไม่เห็นการประกาศผลลัพธ์ หน้าจะค้างสถานะทำงาน ไม่มีปุ่มดาวน์โหลดให้กด
                reached = True
                try:
                    run_tool(pg, text)
                except Exception:
                    reached = False
                ck(f"[{tool}] ทำไฟล์ใหม่หลังกลับมา หน้าต้องเข้าสถานะผลลัพธ์ให้กดดาวน์โหลดได้", reached, True)
                got = carry(pg)
                ck(f"[{tool}] ทำไฟล์ใหม่เสร็จหลังกลับมา ผลลัพธ์ต้องเป็นของไฟล์ใหม่",
                   bool(got) and got[0].startswith("second"), True, f"ได้ {got}")

        ck("ไม่มี error บนหน้า", errs, [])
        b.close()

    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ ตัวตรวจเห็นสถานะจริง" if SELFTEST else "✅ ลากไฟล์ใหม่ทับแล้วไม่ค้างผลลัพธ์ของไฟล์เก่า")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
    finally:
        shutil.rmtree(ROOT, ignore_errors=True)
