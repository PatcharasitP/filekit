#!/usr/bin/env python3
"""ริบบอนเครื่องมือ — ย้ายเครื่องมือได้โดยไม่ต้องกลับหน้าแรก และต้องไม่กินความสูงฟรี

‼️ ที่มา 20/09/2026 พี่ปอนด์ชี้ริบบอนของ Power BI แล้วบอกว่าอยากได้แบบนั้น
   ฟ้าวัดก่อนแล้วพบว่าถ้าทำเป็น "ริบบอนของการตั้งค่า" ไม่คุ้ม เพราะค่ากลางของเรา
   คือ 3 ช่องตั้งค่าต่อเครื่องมือ มีแค่ 5 ตัวเกิน 20 ช่อง และไม่มีสักตัวเกิน 40
   แต่ถ้าทำเป็น **ริบบอนของเครื่องมือ** จะตรงกับที่พี่ปอนด์บ่นไว้ตั้งแต่ต้นพอดี
   คือ "เครื่องมือเยอะมาก อยากใช้หลายฟังก์ชันในที่เดียว ไม่ต้องกลับหน้าแรกทุกที"

‼️ สามข้อที่เทสนี้บังคับ และเป็นเหตุผลที่มันมีอยู่
   ① ‼️ ค่าเริ่มต้นต้องพับ และตอนพับต้องเตี้ย
      วัดจริงวันนี้ว่าหน้ากระดาษในเครื่องมือ PDF ถูกจำกัดด้วย "ความสูงจอ" ไม่ใช่ความกว้าง
      ของที่กินความสูงจึงแพงกว่าของที่กินความกว้างเสมอ ถ้าวันหลังมีใครทำให้มันสูงขึ้น
      หรือกางเป็นค่าเริ่มต้น เอกสารของผู้ใช้จะถูกเบียดทันทีทุกหน้า
   ② ปุ่มทุกตัวต้องไม่เล็กกว่าเกณฑ์นิ้วแตะ ริบบอนอยู่ทุกหน้าเครื่องมือ
      ตอนแรกฟ้าตั้งแท็บไว้ 34px ต่ำกว่าเกณฑ์ 2px กลายเป็นจุดพลาด **560 จุด** ทั้งเว็บทันที
   ③ แท็บต้องเดินด้วยลูกศรได้ และรับ Tab ได้แค่ตัวเดียว (roving tabindex)
      ไม่งั้นคนใช้คีย์บอร์ดต้องกด Tab ผ่านแท็บทั้ง 9 ตัวก่อนถึงจะไปถึงเนื้อหา

รันปกติ:   ../.venv/bin/python tests/browser_ribbon.py
รันพิสูจน์: ../.venv/bin/python tests/browser_ribbon.py --selftest
"""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")

# ‼️ ชุดนี้ตรวจ "โครงหน้าเครื่องมือรุ่นเดิม (v1)" ซึ่งยังอยู่ในเว็บและเปิดได้ด้วย ?ui=1
#    ค่าตั้งต้นของเว็บเปลี่ยนเป็น v2 ไปแล้วตั้งแต่ 21/09/2026 ชุดนี้จึงต้องประกาศให้ชัด
#    ว่าจะตรวจ v1 ไม่ใช่ปล่อยให้แดงค้างแล้วคิดว่า "เทสพัง" (ของจริงไม่ได้พัง มันคนละโครงกัน)
# ‼️ ตั้งผ่าน localStorage ไม่ใช่ต่อท้าย URL เพราะเว็บใช้ hash routing
#    (?ui=1 ต้องอยู่ก่อน # เสมอ ซึ่งพลาดง่ายเวลาประกอบ URL หลายที่ในไฟล์เดียว)
# ‼️ เมื่อพี่ปอนด์ยืนยันว่าเอา v2 แน่ แล้วโค้ด v1 ถูกลบ ให้ลบชุดนี้พร้อมกัน
V1_INIT = "try{localStorage.setItem('fk:ui','1')}catch(e){}"

SELFTEST = "--selftest" in sys.argv
MAX_COLLAPSED = 56       # ตอนพับสูงได้ไม่เกินนี้ (ตอนนี้ 50px)
MIN_TAP = 36             # เกณฑ์เดียวกับ tests/browser_layout.py
ok = fail = 0
reds = []
MUST_FAIL = {"ตอนพับต้องเตี้ยกว่าเกณฑ์"}


def ck(label, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ✅ {label}" + (f"  ({detail})" if detail else ""))
    else:
        fail += 1
        reds.append(label)
        print(f"  ❌ {label}" + (f"  ({detail})" if detail else ""))


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 1000})
        pg = ctx.new_page()
        pg.add_init_script(V1_INIT)
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:130]))

        pg.goto(f"{BASE}/", wait_until="load", timeout=60000)
        pg.wait_for_timeout(2400)
        ck("หน้าแรกต้องไม่มีริบบอน (มีรายการเครื่องมือเต็มอยู่แล้ว)",
           pg.evaluate("() => !document.querySelector('.ribbon')"))

        pg.goto(f"{BASE}/#/pdf-merge", wait_until="load", timeout=60000)
        pg.wait_for_timeout(2600)
        ck("หน้าเครื่องมือมีริบบอน", pg.evaluate("() => !!document.querySelector('.ribbon')"))

        h = pg.evaluate("() => Math.round(document.querySelector('.ribbon').getBoundingClientRect().height)")
        if SELFTEST:
            pg.add_style_tag(content=".rb-tabs{padding:40px 6px !important}")
            pg.wait_for_timeout(300)
            h = pg.evaluate("() => Math.round(document.querySelector('.ribbon').getBoundingClientRect().height)")
        ck("ตอนพับต้องเตี้ยกว่าเกณฑ์", h <= MAX_COLLAPSED, f"สูง {h}px เกณฑ์ {MAX_COLLAPSED}")
        ck("ค่าเริ่มต้นคือพับ ไม่ใช่กาง",
           pg.evaluate("() => !document.querySelector('.ribbon.open')"))

        small = pg.evaluate(f"""() => [...document.querySelectorAll('.rb-tab, .rb-toggle')]
            .filter(e => {{ const r = e.getBoundingClientRect();
                return r.height < {MIN_TAP} || r.width < {MIN_TAP / 2}; }}).length""")
        ck(f"ปุ่มในริบบอนไม่เล็กกว่า {MIN_TAP}px", small == 0, f"เล็กเกิน {small} ปุ่ม")

        nt = pg.evaluate("() => document.querySelectorAll('.rb-tab').length")
        ck("มีแท็บครบทุกหมวด", nt >= 8, f"{nt} แท็บ")

        # เปิดไฟล์แล้วกางริบบอน
        pg.get_by_role("button", name="ลองด้วยไฟล์ตัวอย่าง").first.click()
        pg.wait_for_timeout(3000)
        pg.locator(".rb-tab").first.click()
        pg.wait_for_timeout(700)
        ck("กดแท็บแล้วกางออก", pg.evaluate("() => !!document.querySelector('.ribbon.open')"))
        cmds = pg.evaluate("() => document.querySelectorAll('.rb-cmd').length")
        ck("กางแล้วเห็นเครื่องมือในหมวดนั้น", cmds >= 5, f"{cmds} ตัว")
        ck("ชี้ได้ว่าตอนนี้อยู่เครื่องมือไหน",
           pg.evaluate("""() => document.querySelector('.rb-cmd.here')?.getAttribute('href')""") == "#/pdf-merge")
        ck("บอกว่าตัวไหนพาไฟล์ไปด้วยได้",
           pg.evaluate("() => document.querySelectorAll('.rb-carry').length") > 0)

        # ‼️ roving tabindex กับลูกศร
        only1 = pg.evaluate("() => [...document.querySelectorAll('.rb-tab')].filter(b => b.tabIndex === 0).length")
        ck("รับ Tab ได้แค่แท็บเดียว (roving tabindex)", only1 == 1, f"{only1} ตัว")
        pg.locator(".rb-tab.on").focus()
        first = pg.evaluate("() => document.querySelector('.rb-tab.on').textContent")
        pg.keyboard.press("ArrowRight")
        pg.wait_for_timeout(400)
        second = pg.evaluate("() => document.querySelector('.rb-tab.on').textContent")
        ck("ลูกศรเดินระหว่างแท็บได้", first != second, f"{first} → {second}")

        # กดคำสั่งแล้วต้องพาไฟล์ไปด้วย
        pg.keyboard.press("ArrowLeft")
        pg.wait_for_timeout(400)
        pg.locator(".rb-cmd:not(.here)").first.click()
        pg.wait_for_timeout(3000)
        ck("กดแล้วย้ายเครื่องมือจริง", pg.evaluate("() => location.hash") != "#/pdf-merge",
           pg.evaluate("() => location.hash"))
        ck("‼️ ไฟล์ตามไปด้วย ไม่ต้องเลือกใหม่",
           pg.evaluate("() => document.querySelectorAll('.file-row').length") > 0)

        # จำสถานะข้ามหน้า
        pg.reload(wait_until="load")
        pg.wait_for_timeout(2600)
        ck("จำได้ว่าผู้ใช้กางริบบอนไว้",
           pg.evaluate("() => !!document.querySelector('.ribbon.open')"))
        ck("ไม่มี error หลุดออกมา", not errs, errs[0] if errs else "")
        b.close()

    print(f"\nผ่าน {ok} ตก {fail}")
    if SELFTEST:
        good = set(reds) == MUST_FAIL
        print("โหมดพิสูจน์:", "✅ เทสจับได้ตรงข้อที่ควรจับ" if good else
              f"❌ จับไม่ตรง ขาด {MUST_FAIL - set(reds)} เกิน {set(reds) - MUST_FAIL}")
        return 0 if good else 1
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
