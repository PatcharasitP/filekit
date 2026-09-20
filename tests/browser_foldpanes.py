# -*- coding: utf-8 -*-
"""แผงตั้งค่าพับได้ + ช่องค้นหาการตั้งค่า (แบบแผง Format ของ Power BI)

‼️ บทเรียนรอบนี้ ทำไมต้องมีเทสถาวร ไม่ใช่ดูครั้งเดียวแล้วจบ
   รอบแรกเกาะได้ 0 กลุ่ม (สแกนก่อนเครื่องมือเติมของ)
   รอบสองเกาะได้ 685 กลุ่ม (ตัวสแกนไปห่อปุ่มที่ตัวเองสร้าง วนไม่จบ)
   รอบสามเกาะได้แค่ 2 เครื่องมือ (รองรับแต่หัวข้อที่อยู่ในกล่องของตัวเอง)
   ทั้งสามรอบ "ดูผ่าน" ถ้าไม่ไปจับตัวเลขจริง
"""
import pathlib
import sys
import tempfile
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8848"
ok, bad = [], []
def check(name, cond, got=""):
    """‼️ cond ส่งเป็นฟังก์ชันได้ เพื่อให้ข้อที่ระเบิดกลายเป็น "ตก" ไม่ใช่ "เทสพัง"
       ตอนพิสูจน์ว่าเทสจับบั๊กได้ เอาโค้ดเก่ากลับมาแล้วมันพังตั้งแต่ข้อ 3
       เลยไม่เห็นว่าข้ออื่นเป็นยังไงบ้าง ซึ่งคือตอนที่อยากเห็นที่สุด"""
    if callable(cond):
        try: cond = cond()
        except Exception as e: cond, got = False, f"ระเบิด: {str(e).splitlines()[0][:60]}"
    (ok if cond else bad).append(name)
    print(f"  {'✅' if cond else '❌'} {name}" + (f"  ({got})" if got else ""))

PANEL = ".ws-right .ws-scroll"

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 950})
    try:

        # ── ① พับแล้วแผงต้องสั้นลงจริง ไม่ใช่แค่ลูกศรหมุน
        pg.goto(f"{BASE}/#pbi-donut", wait_until="load"); pg.wait_for_timeout(2500)
        tall = pg.eval_on_selector(PANEL, "e => e.scrollHeight")
        n = pg.locator(f"{PANEL} .ws-fold-btn").count()
        check("กราฟโดนัทมีกลุ่มพับได้อย่างน้อย 4 กลุ่ม", n >= 4, f"{n} กลุ่ม")
        for i in range(n):
            pg.locator(f"{PANEL} .ws-fold-btn").nth(i).click()
        pg.wait_for_timeout(300)
        short = pg.eval_on_selector(PANEL, "e => e.scrollHeight")
        cut = round(100 - short / tall * 100)
        check("พับหมดแล้วแผงสั้นลงเกินครึ่ง", cut >= 50, f"{tall}px -> {short}px สั้นลง {cut}%")
        check("พับแล้วขึ้นเป็นการ์ดพื้นอ่อน",
              lambda: pg.eval_on_selector(f"{PANEL} .ws-fold-btn.folded",
                                          "e => getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)'"))
        check("ลูกศรอยู่ซ้ายหน้าหัวข้อ",
              lambda: pg.eval_on_selector(f"{PANEL} .ws-fold-btn",
                                          "e => e.firstElementChild.classList.contains('ws-fold-caret')"))

        # ── ② จำสถานะข้ามการเปิดหน้า
        pg.reload(wait_until="load"); pg.wait_for_timeout(2500)
        kept = pg.locator(f"{PANEL} .ws-fold-btn.folded").count()
        check("เปิดหน้าใหม่แล้วยังพับไว้เหมือนเดิม", kept == n, f"พับไว้ {kept} จาก {n}")

        # ── ③ กางแล้วต้องไม่ไปเปิดช่องที่เครื่องมือตั้งใจซ่อนไว้เอง
        pg.eval_on_selector_all(f"{PANEL} .ws-fold-btn", "a => a.forEach(x => x.click())")
        pg.wait_for_timeout(200)
        hid = pg.evaluate("""() => {
          if (!document.querySelector('.ws-right .ws-scroll .ws-fold-btn')) return 'ไม่มีกลุ่มพับได้';
          const b = document.querySelector('.ws-right .ws-scroll .ws-fold-btn');
          const m = b.nextElementSibling; m.hidden = true; m.dataset.mark = '1';
          b.click(); b.click();                       // พับแล้วกางกลับ
          return m.hidden;
        }""")
        check("ของที่เครื่องมือซ่อนไว้เอง ยังซ่อนอยู่หลังพับ-กาง", hid is True)

        # ── ④ จุดบอกค่าที่แก้
        pg.evaluate("""() => {
          const b = document.querySelector('.ws-right .ws-scroll .ws-fold-btn');
          if (!b) return;
          for (let n = b.nextElementSibling; n && !n.classList.contains('ws-fold-btn'); n = n.nextElementSibling) {
            const f = n.querySelector('input[type=text], input[type=number], select');
            if (f) { f.value = f.tagName === 'SELECT' ? f.options[f.options.length - 1].value : 'zz';
                     f.dispatchEvent(new Event('change', {bubbles: true})); return; }
          }
        }""")
        pg.locator(f"{PANEL} .ws-fold-btn").first.click(); pg.wait_for_timeout(200)
        check("กลุ่มที่พับไว้และมีค่าถูกแก้ ขึ้นจุดบอก",
              pg.locator(f"{PANEL} .ws-fold-btn.folded .ws-fold-dot:not([hidden])").count() >= 1)

        # ── ⑤ ช่องค้นหาการตั้งค่า
        pg.goto(f"{BASE}/#map-relocate", wait_until="load"); pg.wait_for_timeout(2500)
        find = pg.locator(f"{PANEL} .cfs-input")
        check("แผงที่ของเยอะมีช่องค้นหาการตั้งค่า", find.count() == 1)
        # ‼️ ของที่อยู่ในกลุ่มที่พับไว้ต้องค้นเจอด้วย ไม่งั้นพับแล้วเท่ากับของหายไปจากระบบค้นหา
        pg.locator(f"{PANEL} .ws-fold-btn").first.click(); pg.wait_for_timeout(200)
        find.fill("ระยะ"); pg.wait_for_timeout(350)
        check("ค้นเจอของที่อยู่ในกลุ่มที่พับไว้ด้วย",
              pg.locator(f"{PANEL} .cfs-count").inner_text().startswith("พบ"),
              pg.locator(f"{PANEL} .cfs-count").inner_text()[:30])
        find.fill(""); pg.wait_for_timeout(250)
        if find.count():
            before = pg.locator(f"{PANEL} .ws-fold-btn:visible").count()
            find.fill("สี"); pg.wait_for_timeout(250)
            after = pg.locator(f"{PANEL} .ws-fold-btn:visible").count()
            check("ค้นแล้วเหลือเฉพาะกลุ่มที่ตรง", 0 < after < before, f"{before} -> {after} กลุ่ม")
            check("กลุ่มที่ตรงถูกกางให้เห็นผลเลย",
                  pg.locator(f"{PANEL} .ws-fold-btn:visible.folded").count() == 0)
            # ‼️ ข้อนี้มาจากบั๊กที่เห็นด้วยตาในภาพ ไม่ใช่จากเทส: ฟ้าเขียนช่องค้นหาขึ้นใหม่
            #    ทั้งที่มีของเดิมอยู่แล้ว เลยได้ช่องค้นหาซ้อนกันสองอันในแผงเดียว
            #    เทสชุดเดิมผ่านหมดทุกข้อ เพราะไม่มีข้อไหนถามว่า "มีกี่อัน"
            check("มีช่องค้นหาอันเดียวต่อแผง ไม่ซ้อนกัน",
                  pg.locator(f"{PANEL} input[type=search]").count() == 1,
                  f"{pg.locator(f'{PANEL} input[type=search]').count()} อัน")
            find.fill("ไม่มีคำนี้แน่นอน"); pg.wait_for_timeout(250)
            check("ค้นไม่เจอ มีข้อความบอก",
                  "ไม่พบ" in (pg.locator(f"{PANEL} .cfs-count").inner_text() or ""),
                  pg.locator(f"{PANEL} .cfs-count").inner_text()[:40])
            find.fill(""); pg.wait_for_timeout(250)
            check("ล้างคำค้นแล้วกลับมาครบเท่าเดิม",
                  pg.locator(f"{PANEL} .ws-fold-btn:visible").count() == before,
                  f"{pg.locator(f'{PANEL} .ws-fold-btn:visible').count()} จาก {before}")
        # ‼️ goto ที่เปลี่ยนแค่ #hash คืน None เพราะเป็นการย้ายภายในเอกสารเดิม ห้ามเอาไปเช็ค
        pg.goto(f"{BASE}/#pdf-sign", wait_until="load"); pg.wait_for_timeout(2000)
        check("แผงเล็กไม่มีช่องค้นหามารก", pg.locator(".cfs-wrap").count() == 0,
              f"{pg.locator('.ws-find').count()} ช่อง")

        # ── ⑥ แถวที่วางช่องคู่กันต้องไม่พัง (เหตุผลที่ไม่ห่อของเข้ากล่องใหม่)
        # ‼️ ค่าที่คาดมาจากการวัดฐานจริงก่อนแก้ ไม่ใช่เดา — number-bins ไม่เคยวางช่องคู่กันเลย
        #    (8 ช่อง 8 บรรทัด ทั้งก่อนและหลัง) ตัวที่วางคู่จริงคือ pa-html-table
        pg.goto(f"{BASE}/#pa-html-table", wait_until="load"); pg.wait_for_timeout(2500)
        rows = pg.evaluate("""() => {
          const f = [...document.querySelectorAll('.ws-scroll .field')].filter(x => !x.hidden && x.offsetParent);
          const t = {}; f.forEach(x => { const k = Math.round(x.getBoundingClientRect().top); t[k] = (t[k] || 0) + 1; });
          return {fields: f.length, pairs: Object.values(t).filter(v => v > 1).length};
        }""")
        check("ช่องที่วางคู่กันยังอยู่ครบ (โครงเดิมไม่ถูกแตะ)",
              rows["pairs"] >= 2, f"{rows['fields']} ช่อง วางคู่ {rows['pairs']} บรรทัด")

        # ── ⑦ ‼️ เคสที่พังตอนแรกสุด: เครื่องมือเติมของเข้าแผงหลังโหลดไฟล์เสร็จ
        #    รอบแรกสแกนครั้งเดียวด้วย rAF จึงเจอ 0 กลุ่ม ต้องเฝ้าดูแผงถึงจะทัน
        #    แผงนี้ก่อนใส่ไฟล์มี 6 ช่อง (ไม่ควรมีช่องค้นหา) หลังใส่ไฟล์มี 55 ช่อง (ต้องมี)
        csv = pathlib.Path(tempfile.gettempdir()) / "filekit-fold-matrix.csv"
        head = ["ภูมิภาค", "จังหวัด", "สินค้า", "ช่องทาง", "เดือน",
                "ยอดขาย", "จำนวน", "ต้นทุน", "กำไร", "ลูกค้า", "พนักงาน", "สถานะ"]
        rows = [head] + [[f"ก{i%4}", f"จ{i%9}", f"ส{i%6}", f"ช{i%3}", str(i % 12 + 1),
                          *[str(100 + i)] * 5, f"พ{i%7}", "ปกติ"] for i in range(40)]
        csv.write_text("\n".join(",".join(r) for r in rows), encoding="utf-8-sig")

        pg.goto(f"{BASE}/#pbi-matrix-details", wait_until="load"); pg.wait_for_timeout(2600)
        small = pg.evaluate(f"() => document.querySelector('{PANEL}').querySelectorAll('input[type=search]').length")
        check("แผงยังเล็กอยู่ ยังไม่ต้องมีช่องค้นหา", small == 0, f"{small} ช่อง")
        pg.locator("input[type=file]").first.set_input_files(str(csv)); pg.wait_for_timeout(3200)
        grown = pg.evaluate(f"""() => {{ const sc = document.querySelector('{PANEL}');
          return {{f: sc.querySelectorAll('input,select,textarea').length,
                   s: sc.querySelectorAll('input[type=search]').length, h: sc.scrollHeight}}; }}""")
        check("แผงโตขึ้นหลังใส่ไฟล์ แล้วช่องค้นหาโผล่มาเอง",
              grown["f"] > 40 and grown["s"] == 1, f"{grown['f']} ช่อง, ช่องค้นหา {grown['s']}")
        for i in range(pg.locator(f"{PANEL} .ws-fold-btn").count()):
            pg.locator(f"{PANEL} .ws-fold-btn").nth(i).click()
        pg.wait_for_timeout(300)
        after = pg.eval_on_selector(PANEL, "e => e.scrollHeight")
        check("พับแล้วแผงที่ยาวมากสั้นลงเกิน 80%", after < grown["h"] * 0.2,
              f"{grown['h']}px -> {after}px")
    except Exception as e:
        bad.append(f"เทสระเบิดกลางทาง: {str(e).splitlines()[0][:80]}")
        print(f"  ❌ เทสระเบิดกลางทาง {str(e).splitlines()[0][:80]}")
    b.close()

print(f"\nผ่าน {len(ok)} ตก {len(bad)}")
for x in bad: print(f"   ❌ {x}")
sys.exit(1 if bad else 0)
