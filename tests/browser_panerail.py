# -*- coding: utf-8 -*-
"""พับแผงข้างเก็บเป็นแถบไอคอน (ผังแบบ Power BI ที่พี่ปอนด์ขอ 20/09/2026)

ทำไมต้องมีเทสนี้ ไม่ใช่ดูครั้งเดียวแล้วจบ
  ของชิ้นนี้แตะ workspace() ซึ่งเป็นโครงร่วมของทั้ง 53 เครื่องมือ
  รอบแรกที่ฟ้าแตะไฟล์นี้ กราฟโดนัทเหลือกลุ่มพับได้ 0 จาก 5 กลุ่มทันที
  เพราะตัวสแกนกลุ่มหาแผงด้วย grid.querySelector แต่แผงถูกย้ายออกนอก grid ไปแล้ว
  ตาเปล่ามองไม่เห็นเลย หน้าจอดูปกติทุกอย่าง ต้องมีคนไปนับให้

ทุกค่าที่ assert ในไฟล์นี้มาจากการวัดของจริงก่อน ไม่ได้ตั้งเอาเอง
  กราฟโดนัทบนจอ 1440px  ตรงกลาง 708px -> 1216px เมื่อพับทั้งสองข้าง

รันพิสูจน์ว่าเทสจับบั๊กได้จริง: ../.venv/bin/python tests/browser_panerail.py --selftest
"""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8848")
SELFTEST = "--selftest" in sys.argv
MIN_TAP = 36            # เกณฑ์เดียวกับ tests/browser_layout.py
CENTRE_MIN = 1150       # วัดจริงได้ 1216px ตั้งเพดานล่างไว้ต่ำกว่าเล็กน้อยกันค่าแกว่ง
SWEEP = ["pdf-merge", "pdf-split", "pdf-watermark", "pdf-sign", "image-resize",
         "image-convert", "pbi-donut", "pbi-bar", "map-coverage", "pdf-page-numbers"]
ok = fail = 0
reds = []
MUST_FAIL = {"พับขวาแล้วตรงกลางกว้างขึ้นจริง"}


def ck(label, cond, detail=""):
    global ok, fail
    if callable(cond):
        try:
            cond = cond()
        except Exception as e:                       # ข้อที่ระเบิด = ตก ไม่ใช่เทสพัง
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
        ctx = b.new_context(viewport={"width": 1440, "height": 950})
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:130]))

        # ── ① ทุกแผงต้องมีปุ่มพับ ไม่ใช่มีแค่บางเครื่องมือ
        print("① ปุ่มพับติดครบทุกแผง")
        miss = []
        for t in SWEEP:
            pg.goto(f"{BASE}/#{t}", wait_until="load", timeout=60000)
            pg.wait_for_timeout(2300)
            r = pg.evaluate("""() => {
              const q = s => document.querySelector(s);
              const bad = [];
              for (const side of ['left', 'right']) {
                const pn = q('.ws-' + side);
                if (!pn) continue;
                if (!pn.querySelector('.ws-panefold')) bad.push(side);
                if (!q('.ws-rail-' + side)) bad.push(side + '(ไม่มีแถบ)');
              }
              return bad;
            }""")
            if r:
                miss.append(f"{t}:{','.join(r)}")
        ck("ทุกแผงของ 10 เครื่องมือตัวอย่างมีปุ่มพับและแถบไอคอนคู่กัน",
           not miss, "; ".join(miss) or f"{len(SWEEP)} เครื่องมือ")

        # ── ② พับแล้วต้องได้พื้นที่คืนจริง ซึ่งคือเหตุผลทั้งหมดที่ทำของชิ้นนี้
        print("\n② พับแล้วพื้นที่ตรงกลางโตขึ้นจริง")
        pg.goto(f"{BASE}/#pbi-donut", wait_until="load", timeout=60000)
        pg.wait_for_timeout(3000)
        wid = lambda: pg.evaluate(
            "() => Math.round(document.querySelector('.ws-center').getBoundingClientRect().width)")
        base = wid()
        ck("ตอนกางทั้งสองแผง ตรงกลางแคบกว่าครึ่งจอ", base < 760, f"{base}px")
        if SELFTEST:
            # ‼️ ล็อกความกว้างคอลัมน์ขวาไว้เท่าเดิม แถบไอคอนจะยังโผล่และแผงยังหาย
            #    แต่ตรงกลางไม่โตขึ้นเลย คือบั๊กที่ "ดูผ่าน" ถ้าไม่ไปวัดความกว้าง
            pg.add_style_tag(content=".ws-grid.fold-right{--ws-col-r:minmax(230px,290px) !important}")
        for side in ["left", "right"]:
            pg.locator(f".ws-{side} .ws-panefold").click()
            pg.wait_for_timeout(350)
        grown = wid()
        ck("พับขวาแล้วตรงกลางกว้างขึ้นจริง", grown >= CENTRE_MIN,
           f"{base}px -> {grown}px (+{grown - base}) เกณฑ์ {CENTRE_MIN}")
        ck("แผงที่พับแล้วหายไปจากสายตา",
           pg.evaluate("() => !document.querySelector('.ws-right').offsetParent"))
        ck("แถบไอคอนโผล่มาแทนทั้งสองข้าง",
           pg.evaluate("""() => ['left','right'].every(s =>
              !!document.querySelector('.ws-rail-' + s)?.offsetParent)"""))
        ck("กริดยังเป็นสามคอลัมน์เหมือนเดิม ไม่ได้ยุบหาย",
           pg.evaluate("""() => getComputedStyle(document.querySelector('.ws-grid'))
              .gridTemplateColumns.split(' ').length === 3"""),
           pg.evaluate("() => getComputedStyle(document.querySelector('.ws-grid')).gridTemplateColumns"))

        # ── ③ แถบไอคอนต้องบอกได้ว่ามันคืออะไร ไม่ใช่ไอคอนเปล่าให้เดา
        print("\n③ แถบไอคอนบอกตัวเองได้ และกดถึง")
        ck("แถบมีชื่อแผงกำกับ ไม่ใช่ไอคอนเปล่า",
           pg.evaluate("""() => {
             const t = document.querySelector('.ws-rail-right .ws-rail-txt');
             return !!t && t.textContent.trim().length >= 2;
           }"""),
           pg.evaluate("() => document.querySelector('.ws-rail-right .ws-rail-txt')?.textContent"))
        small = pg.evaluate(f"""() => [...document.querySelectorAll('.ws-rail')]
            .filter(e => e.offsetParent)
            .filter(e => {{ const r = e.getBoundingClientRect();
                return r.width < {MIN_TAP} || r.height < {MIN_TAP}; }}).length""")
        ck("แถบไอคอนกดถึงตามเกณฑ์", small == 0, f"เล็กเกิน {small} อัน")
        ck("แถบไอคอนเป็นปุ่มจริง คีย์บอร์ดกดได้",
           pg.evaluate("() => document.querySelector('.ws-rail-right').tagName === 'BUTTON'"))
        ck("แถบไอคอนมีป้ายบอกสำหรับโปรแกรมอ่านจอ",
           pg.evaluate("""() => {
             const r = document.querySelector('.ws-rail-right');
             return (r.getAttribute('aria-label') || '').length > 3
                 && r.getAttribute('aria-expanded') === 'false';
           }"""))

        # ── ④ โฟกัสต้องตามของที่กด ไม่งั้นคนใช้คีย์บอร์ดหลุดไปต้นหน้า
        print("\n④ โฟกัสตามไปกับปุ่มที่สลับกันโผล่")
        pg.locator(".ws-rail-right").focus()
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(350)
        ck("กางกลับด้วยคีย์บอร์ดแล้วโฟกัสไปอยู่ที่ปุ่มพับ",
           pg.evaluate("() => document.activeElement.classList.contains('ws-panefold')"),
           pg.evaluate("() => document.activeElement.className"))
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(350)
        ck("พับอีกครั้งแล้วโฟกัสไปอยู่ที่แถบไอคอน",
           pg.evaluate("() => document.activeElement.classList.contains('ws-rail')"),
           pg.evaluate("() => document.activeElement.className"))

        # ── ⑤ ของในแผงต้องไม่ถูกสร้างใหม่ ค่าที่ผู้ใช้ตั้งไว้ห้ามหาย
        print("\n⑤ พับแล้วกางกลับ ของในแผงต้องเป็นชิ้นเดิม")
        pg.evaluate("""() => { const f = document.querySelector('.ws-right .ws-scroll select, .ws-right .ws-scroll input');
            if (f) f.dataset.mark = 'ชิ้นเดิม'; }""")
        for _ in range(2):
            pg.locator(".ws-rail-right:visible, .ws-right .ws-panefold:visible").first.click()
            pg.wait_for_timeout(300)
        ck("ช่องตั้งค่ายังเป็นโหนดเดิม ไม่ได้ถูกวาดใหม่",
           pg.evaluate("""() => { const f = document.querySelector('.ws-right .ws-scroll select, .ws-right .ws-scroll input');
               return f ? f.dataset.mark === 'ชิ้นเดิม' : 'ไม่มีช่อง'; }""") is True)

        # ── ⑥ จำสิ่งที่ผู้ใช้เลือกไว้ข้ามการเปิดหน้า
        print("\n⑥ จำสถานะข้ามการเปิดหน้า และแยกรายเครื่องมือ")
        pg.evaluate("() => localStorage.setItem('filekit-pane-right-pbi-donut','1')")
        pg.reload(wait_until="load")
        pg.wait_for_timeout(3000)
        ck("เปิดหน้าใหม่แล้วยังพับไว้เหมือนเดิม",
           pg.evaluate("() => document.querySelector('.ws-grid').classList.contains('fold-right')"))
        # ‼️ ต้องเลือกเครื่องมือที่มีผังสามคอลัมน์จริง pdf-merge ไม่ได้ใช้ workspace() จึงไม่มี .ws-grid เลย
        pg.goto(f"{BASE}/#pbi-bar", wait_until="load", timeout=60000)
        pg.wait_for_timeout(2800)
        ck("เครื่องมืออื่นไม่ถูกพับตามไปด้วย",
           pg.evaluate("""() => { const g = document.querySelector('.ws-grid');
               return !!g && !g.classList.contains('fold-right'); }"""))

        # ── ⑦ จอแคบต้องไม่มีของพวกนี้เลย กริดเหลือคอลัมน์เดียวอยู่แล้ว
        print("\n⑦ จอแคบปิดเรื่องพับทั้งหมด")
        pg.set_viewport_size({"width": 390, "height": 844})
        pg.goto(f"{BASE}/#pbi-donut", wait_until="load", timeout=60000)
        pg.wait_for_timeout(3000)
        ck("จอ 390px แผงที่เคยพับไว้ต้องกลับมาเห็นเต็ม",
           pg.evaluate("() => !!document.querySelector('.ws-right')?.offsetParent"))
        ck("จอ 390px ไม่มีแถบไอคอนมารกจอ",
           pg.evaluate("() => !document.querySelector('.ws-rail-right')?.offsetParent"))
        ck("จอ 390px ไม่มีปุ่มพับมาให้กดหลง",
           pg.evaluate("() => ![...document.querySelectorAll('.ws-panefold')].some(e => e.offsetParent)"))

        # ── ⑧ โหมดริบบอนกับการพับ ต้องไม่โผล่พร้อมกัน เพราะเป็นของชิ้นเดียวกัน
        print("\n⑧ ริบบอนกับแถบไอคอนขวา ห้ามโผล่พร้อมกัน")
        pg.set_viewport_size({"width": 1440, "height": 950})
        pg.goto(f"{BASE}/#pdf-page-numbers", wait_until="load", timeout=60000)
        pg.wait_for_timeout(2600)
        ck("เครื่องมือนี้ขึ้นเป็นริบบอนตามค่าเริ่มต้นที่วัดไว้",
           pg.evaluate("() => !!document.querySelector('.ws-panel.as-ribbon')"))
        ck("อยู่ในโหมดริบบอนแล้วไม่มีแถบไอคอนขวาโผล่มาซ้ำ",
           pg.evaluate("() => !document.querySelector('.ws-rail-right')?.offsetParent"))
        ck("อยู่ในโหมดริบบอนแล้วปุ่มพับแผงขวาต้องหายไป",
           pg.evaluate("() => !document.querySelector('.as-ribbon .ws-panefold')?.offsetParent"))
        # ‼️ ปุ่มริบบอนกับปุ่มพับเคยเป็นลูกศรเหมือนกันสองอัน เห็นในภาพว่าแยกไม่ออก
        ck("ปุ่มริบบอนกับปุ่มพับใช้ไอคอนคนละแบบ",
           pg.evaluate("""() => {
             const a = document.querySelector('.ws-ribbtn svg');
             const b = document.querySelector('.ws-left .ws-panefold svg');
             return !!a && !!b && a.innerHTML !== b.innerHTML;
           }"""))

        # ‼️ ด่านนี้มาจากบั๊กที่ฟ้าทำเอง แล้วเทสข้อ ⑥ จับได้ (20/09/2026)
        #    ค่าเริ่มต้นของหลายเครื่องมือ "เดาเป็นริบบอนก่อน" แล้วถอยเป็นแผงข้างหลังวัดความสูง
        #    ถ้าโค้ดไปล้างสถานะพับทิ้งระหว่างจังหวะที่ยังเดาอยู่ ผู้ใช้จะเสียค่าที่ตั้งไว้ทุกครั้งที่เปิดหน้า
        #    ด่านนี้ยืนยันว่าการอยู่โหมดริบบอน "กดทับ" การพับเฉย ๆ ห้ามไปแตะค่าที่เก็บไว้
        pg.goto(f"{BASE}/#pbi-donut", wait_until="load", timeout=60000)
        pg.wait_for_timeout(2500)
        pg.evaluate("() => localStorage.setItem('filekit-pane-right-pbi-donut','1')")
        pg.reload(wait_until="load")
        pg.wait_for_timeout(3200)
        ck("ค่าที่ผู้ใช้ตั้งไว้ต้องไม่ถูกโหมดริบบอนล้างทิ้งระหว่างทาง",
           pg.evaluate("() => localStorage.getItem('filekit-pane-right-pbi-donut') === '1'"),
           pg.evaluate("() => localStorage.getItem('filekit-pane-right-pbi-donut')"))
        pg.evaluate("() => localStorage.clear()")

        ck("ไม่มี error หลุดออกมาระหว่างทาง", not errs, errs[0] if errs else "")
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
