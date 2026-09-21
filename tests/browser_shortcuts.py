# -*- coding: utf-8 -*-
"""คีย์ลัดต้องทำงานจริง และต้องมีที่บอกผู้ใช้ว่ามีคีย์ลัดอะไรบ้าง

ที่มา 20/09/2026 พี่ปอนด์ลองใช้ของจริงแล้วเจอสองเรื่องพร้อมกัน
  ① "พี่ลองกด Delete ลบกระดาษมันไม่ลบให้"
     ไล่ดูโค้ดแล้วไม่มีตัวรับปุ่ม Delete เลย มีแค่ Enter กับ Space
     และต่อให้ใส่เข้าไป ก็ยังไม่ทำงานอยู่ดี เพราะ render() วาดการ์ดใหม่ทั้งตะแกรง
     การ์ดที่โฟกัสอยู่ถูกโยนทิ้ง โฟกัสตกไปที่ <body> คีย์ลัดจึงไม่มีวันถึงมือเครื่องมือ
  ② "ปุ่มพวกคีย์ลัดยังไม่เห็นนะ"
     เว็บนี้มีคีย์ลัดใช้ได้จริงหลายตัวมาตั้งนานแล้ว แต่ไม่เคยบอกใครเลยสักที่
     และเราห้าม tooltip ของเบราว์เซอร์ทั้งเว็บ จึงต้องเขียนไว้บนจอตรง ๆ

ทำไมต้องเป็นเทสถาวร ไม่ใช่ทดสอบครั้งเดียวแล้วจบ
  โฟกัสหลุดเป็นบั๊กที่ "มองด้วยตาไม่เห็น" หน้าจอดูปกติทุกอย่าง
  และมันกลับมาได้ทุกครั้งที่ใครเพิ่มการวาดใหม่เข้าไปในเส้นทางใดเส้นทางหนึ่ง

รันพิสูจน์ว่าเทสจับได้จริง: ../.venv/bin/python tests/browser_shortcuts.py --selftest
"""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
SELFTEST = "--selftest" in sys.argv
SAMPLE = "samples/ตัวอย่าง-รายงานประจำเดือน.pdf"
ok = fail = 0
reds = []
MUST_FAIL = {"กด Delete แล้วหน้าหายไปจริง"}


def ck(label, cond, detail=""):
    global ok, fail
    if callable(cond):
        try:
            cond = cond()
        except Exception as e:
            cond, detail = False, f"ระเบิด: {str(e).splitlines()[0][:70]}"
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
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:130]))

        # ── ① จัดการหน้า PDF: ลบด้วยคีย์บอร์ดแล้วหน้าต้องหายจริง
        print("① ลบหน้าด้วยปุ่ม Delete")
        pg.goto(f"{BASE}/#pdf-pages", wait_until="load", timeout=60000)
        pg.wait_for_timeout(2500)
        pg.locator(".dz input[type=file]").first.set_input_files(SAMPLE)
        pg.wait_for_timeout(4000)
        seen = lambda: pg.evaluate(
            "() => [...document.querySelectorAll('.pg')].filter(e => e.offsetParent).length")
        start = seen()
        ck("เปิดไฟล์ตัวอย่างแล้วเห็นหน้ากระดาษ", start >= 3, f"{start} หน้า")

        if SELFTEST:
            # ‼️ จำลองบั๊กเดิม คือลบแล้วแค่จางลง ไม่ได้หายไป
            pg.add_style_tag(content=".pg.dropped{display:block !important;opacity:.3}")

        pg.locator(".pg:visible").first.click()
        pg.wait_for_timeout(400)
        ck("คลิกการ์ดแล้วโฟกัสไปอยู่ที่การ์ดนั้นจริง",
           pg.evaluate("() => !!document.activeElement.closest('.pg')"),
           pg.evaluate("() => document.activeElement.tagName + '.' + document.activeElement.className"))
        pg.keyboard.press("Delete")
        pg.wait_for_timeout(600)
        after = seen()
        ck("กด Delete แล้วหน้าหายไปจริง", after == start - 1, f"{start} -> {after} หน้า")
        ck("ลบแล้วโฟกัสยังอยู่บนการ์ด ไม่ตกไปที่ต้นหน้า",
           pg.evaluate("() => !!document.activeElement.closest('.pg')"),
           pg.evaluate("() => document.activeElement.tagName"))

        # ── ② Ctrl+Z เอากลับ
        print("\n② Ctrl+Z เอาหน้าที่ลบกลับมา")
        pg.keyboard.press("Control+z")
        pg.wait_for_timeout(600)
        ck("Ctrl+Z แล้วหน้ากลับมาครบ", seen() == start, f"{seen()} จาก {start}")
        ck("ไม่มีหน้าไหนเหลือค้างแล้ว ปุ่มย้อนการลบต้องปิด",
           pg.evaluate("""() => { const b = [...document.querySelectorAll('.s2-tbar button, .ws-toolbar button')]
               .find(x => /ย้อนการลบ/.test(x.textContent)); return !!b && b.disabled; }"""))

        # ── ③ คีย์ลัดหมุนต้องกดซ้ำได้ ไม่ใช่ได้ครั้งเดียวแล้วเงียบ
        #    ‼️ ข้อนี้คือหัวใจ บั๊กเดิมคือกดได้ครั้งแรกครั้งเดียวเพราะโฟกัสหลุดหลังวาดใหม่
        print("\n③ กดคีย์ลัดซ้ำได้ติดกัน (โฟกัสต้องไม่หลุดหลังวาดใหม่)")
        # ‼️ undoDelete() เลือกหน้าที่เอากลับมาให้อยู่แล้ว คลิกซ้ำจึงเป็นการ "ยกเลิกเลือก"
        #    ต้องยืนยันว่ามีการเลือกจริงก่อน ไม่ใช่คลิกแล้วเชื่อว่าเลือกแน่ ๆ
        if pg.evaluate("() => !document.querySelector('.pg.selected')"):
            pg.locator(".pg:visible").first.click()
            pg.wait_for_timeout(300)
        ck("มีหน้าที่ถูกเลือกอยู่ก่อนทดสอบคีย์หมุน",
           pg.evaluate("() => !!document.querySelector('.pg.selected')"))
        rot = lambda: pg.evaluate("""() => { const s = document.querySelector('.pg.selected');
            if (!s) return '';
            const e = [...s.querySelectorAll('*')].find(x => /rotate/.test(x.style.transform || ''));
            return e ? e.style.transform : ''; }""")
        pg.keyboard.press("]")
        pg.wait_for_timeout(450)
        one = rot()
        pg.keyboard.press("]")
        pg.wait_for_timeout(450)
        two = rot()
        ck("กด ] ครั้งแรกหมุน 90 องศา", one == "rotate(90deg)", one)
        ck("กด ] ครั้งที่สองหมุนต่อเป็น 180 องศา", two == "rotate(180deg)", f"{one} -> {two}")

        # ── ④ ต้องมีที่บอกผู้ใช้ว่ามีคีย์ลัดอะไร และต้องตรงกับของจริง
        print("\n④ แถวบอกคีย์ลัดมีอยู่จริงและตรงกับที่ใช้ได้")
        for tool, want in [("pdf-pages", ["Del", "Ctrl+Z", "[ ]"]),
                           ("pdf-sign", ["Del"]),
                           ("pdf-edit", ["Del", "Alt + ←"])]:
            pg.goto(f"{BASE}/#{tool}", wait_until="load", timeout=60000)
            pg.wait_for_timeout(2400)
            keys = pg.evaluate("""() => [...document.querySelectorAll('.keyhints .kbd')]
                .map(e => e.textContent.trim())""")
            miss = [k for k in want if k not in keys]
            ck(f"{tool} มีแถวคีย์ลัดครบตามที่ใช้ได้จริง", not miss,
               f"ขาด {miss}" if miss else f"{len(keys)} ปุ่ม {keys}")
            ck(f"{tool} แถวคีย์ลัดมองเห็นได้บนเครื่องที่มีเมาส์",
               pg.evaluate("() => !!document.querySelector('.keyhints')?.offsetParent"))

        # ── ⑤ จอสัมผัสไม่มีคีย์บอร์ด ต้องไม่เอาคีย์ลัดไปกินที่เปล่า ๆ
        print("\n⑤ จอสัมผัสต้องไม่มีแถวคีย์ลัด")
        tctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
        tpg = tctx.new_page()
        tpg.goto(f"{BASE}/#pdf-pages", wait_until="load", timeout=60000)
        tpg.wait_for_timeout(2400)
        ck("จอสัมผัสไม่แสดงแถวคีย์ลัด",
           tpg.evaluate("() => !document.querySelector('.keyhints')?.offsetParent"))
        tctx.close()

        ck("ไม่มี error หลุดออกมาระหว่างทาง", not errs, errs[0] if errs else "")
        b.close()

    print(f"\nผ่าน {ok} ตก {fail}")
    if SELFTEST:
        good = set(reds) >= MUST_FAIL
        print("โหมดพิสูจน์:", "✅ เทสจับได้ตรงข้อที่ควรจับ" if good else
              f"❌ จับไม่ตรง ขาด {MUST_FAIL - set(reds)}")
        return 0 if good else 1
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
