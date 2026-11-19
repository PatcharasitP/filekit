#!/usr/bin/env python3
"""จัดการหน้า PDF แก้ไขบนหน้า เฟส 3: พรีวิวครบ กันงานหาย และหน้าตาแผง

ที่มา แผน .claude/plans/2026-11-18-merge-edit-into-pages.md เฟส 3 กับข้อที่ฟ้าเคาะ 19/11/2026
  ①  ภาพลอยตอนชี้ค้างเห็นของที่วาง (เดิมเรนเดอร์จาก pdf.js ล้วน ของที่วางไม่ขึ้น พรีวิวไม่ตรงไฟล์)
  ②  ตัวดูเต็มจอแบบดูอย่างเดียว (แว่นขยายบนการ์ด) เห็นของที่วาง
  ③  เปลี่ยนหน้าในตัวดูแล้ววางบนหน้านั้นได้ ไฟล์มีของตรงหน้า (แถบภาพย่อเอาออกในรอบ 4)
  ④  เอาไฟล์ B ออกจากรายการ ของที่วางและการหมุนบนหน้าของ A ยังอยู่ อ่านไฟล์ผลลัพธ์จริง
      (เดิมอ่านทุกไฟล์ใหม่หมด งานทั้งชุดหาย) และไม่ถามถ้า B ไม่มีของ , B มีของ = ถามก่อน ตอบไม่ ไฟล์ยังอยู่
  ⑤  ช่องสีของปิดทับเป็นสีขาว ต้องเห็นว่าเป็นตัวเลือกสี ขอบวงสีต่างจากพื้นแผงอย่างน้อย 1.5 เท่า และแสดงรหัสสี (รอบ 4)
  ⑥  มือถือ 390 หัวตัวดูกับแถบล่างทึบ ไม่เห็นสีแดงของหน้าข้างหลังซึมขึ้นมา , แถบภาพย่อซ่อนบนจอแคบ

ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> <venv>/bin/python tests/browser_pdfpages_edit_more.py [--shots <โฟลเดอร์>]
"""
import io
import os
import sys
import tempfile
import traceback
from pathlib import Path

import fitz
from PIL import Image

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
SHOTS = Path(sys.argv[sys.argv.index("--shots") + 1]) if "--shots" in sys.argv else None
ok = fail = 0


def ck(cond, label, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ✅ {label}")
    else:
        fail += 1
        print(f"  ❌ {label}" + (f"  [{detail}]" if detail else ""))


def make_files(tmp):
    a = tmp / "a.pdf"
    d = fitz.open()
    for i in range(5):
        d.new_page(width=595, height=842).insert_text((80, 100), f"Page {i + 1}", fontsize=20)
    d.save(a)
    d.close()
    b = tmp / "b.pdf"
    d = fitz.open()
    for i in range(2):
        d.new_page(width=595, height=842).insert_text((80, 100), f"Bfile {i + 1}", fontsize=20)
    d.save(b)
    d.close()
    red = tmp / "red.png"
    Image.new("RGB", (80, 40), (255, 0, 0)).save(red)
    return a, b, red


def red_count(png_bytes):
    im = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    px = im.load()
    n = 0
    for y in range(0, im.height, 2):
        for x in range(0, im.width, 2):
            r, g, b = px[x, y]
            if r > 200 and g < 80 and b < 80:
                n += 1
    return n


def bleed_share(clean_png, red_png):
    """สัดส่วนพิกเซลที่แดงขึ้นเมื่อของข้างหลังตัวดูเปลี่ยนจากน้ำเงินล้วนเป็นแดงล้วน พื้นทึบ = ภาพเหมือนกันทุกพิกเซล
    ‼️ วัดจากผลต่าง ไม่ใช่โทนสีของภาพเดียว ขอบตัวอักษรของเบราว์เซอร์มีพิกเซลออกส้มอยู่แล้ว (วัดได้ 1.2% ทั้งสองภาพ)
    ‼️ ภาพเทียบต้องมีของทึบข้างหลังด้วย (น้ำเงิน) ไม่ใช่หน้าเว็บจริง รุ่นแรกเทียบกับหน้าเว็บจริงซึ่งข้างล่างเป็นพื้นขาว
       พื้นโปร่งทับขาวกับทับแดงได้ช่องแดงเท่ากัน แถบล่างของ v245 ที่ซึมชัด ๆ จึงผ่าน (ภาพ phase3/v245_390_redunder.png)"""
    a = Image.open(io.BytesIO(clean_png)).convert("RGB")
    b = Image.open(io.BytesIO(red_png)).convert("RGB")
    pa, pb = a.load(), b.load()
    n = t = 0
    for y in range(0, min(a.height, b.height), 2):
        for x in range(0, min(a.width, b.width), 2):
            t += 1
            if pb[x, y][0] - pa[x, y][0] > 10:
                n += 1
    return n / max(1, t)


def lum(c):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2])


def contrast(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)


def page_with(doc, text):
    for i, p in enumerate(doc):
        if text in p.get_text():
            return i
    return -1


def main():
    from playwright.sync_api import sync_playwright
    tmp = Path(tempfile.mkdtemp(prefix="fk_ppedit3_"))
    A, B, RED = make_files(tmp)

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 950}, accept_downloads=True)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        dialogs = []
        answer = {"yes": False}

        def on_dialog(dg):
            dialogs.append(dg.message)
            dg.accept() if answer["yes"] else dg.dismiss()
        pg.on("dialog", on_dialog)

        def fresh(files):
            pg.goto("about:blank")
            pg.goto(f"{BASE}/#pdf-pages", wait_until="domcontentloaded", timeout=60000)
            pg.wait_for_timeout(2200)
            pg.set_input_files("input[type=file]", [str(f) for f in files])
            pg.wait_for_selector(".pg", timeout=60000)
            pg.wait_for_timeout(1800)

        bar = lambda: pg.locator(".s2-tbar button:visible, .s2-canvas button:visible")

        def pick(i):
            if pg.locator(".pg.selected").count() == 1 and "selected" in (pg.locator(".pg").nth(i).get_attribute("class") or ""):
                return
            pg.locator(".pg").nth(i).click()
            pg.wait_for_timeout(300)

        def open_edit(card_i=None):
            if card_i is not None:
                pick(card_i)
            bar().filter(has_text="แก้ข้อความบนหน้า").first.click()
            pg.wait_for_selector(".pz.editing", timeout=8000)
            pg.wait_for_timeout(1200)

        def paper_at(fx, fy):
            r = pg.locator(".pz-paper").bounding_box()
            return r["x"] + r["width"] * fx, r["y"] + r["height"] * fy

        def stamp_at(fx, fy):
            # รอบ 6 (19/11/2026) รูปกับลายเซ็นรวมเป็นเครื่องมือเดียว data-mode=sign มีช่องอัปโหลดช่องเดียว (ตัวสุดท้าย)
            pg.click(".pz-edit button[data-mode=sign]")
            if not pg.evaluate("() => !!document.querySelector('.pz-edit .pe-saved figure.on')"):
                pg.locator(".pz-edit input[type=file]").last.set_input_files(str(RED))
                pg.wait_for_timeout(700)
            pg.mouse.click(*paper_at(fx, fy))
            pg.wait_for_timeout(300)

        def close_viewer():
            pg.keyboard.press("Escape")
            pg.wait_for_timeout(1000)

        def save(name):
            out = tmp / name
            with pg.expect_download(timeout=60000) as dl:
                pg.locator("button.s2-cta:visible, .ws-footer button").filter(has_text="บันทึก").first.click()
                pg.wait_for_timeout(2500)
                pg.locator(".s2-side-res .result button:visible, .results .result button:visible").filter(has_text="ดาวน์โหลด").first.click()
            dl.value.save_as(str(out))
            return fitz.open(str(out))

        def section(name, fn):
            print(f"\n── {name}")
            try:
                fn()
            except Exception as e:
                ck(False, f"{name}: ทำจนจบไม่ได้", f"{type(e).__name__}: {str(e).splitlines()[0][:160]}")
                if os.environ.get("FK_TRACE"):
                    traceback.print_exc()

        # ①② ภาพลอยกับตัวดูแบบดูอย่างเดียว เห็นของที่วาง
        def s1():
            fresh([A])
            open_edit(1)
            stamp_at(0.5, 0.5)
            close_viewer()
            pg.mouse.click(5, 940)                       # ปล่อยการเลือกไว้ ไม่กด Esc (ไม่มีหน้าเลือก = ออกจากเครื่องมือ)
            pg.mouse.move(700, 900)
            pg.wait_for_timeout(500)
            card = pg.locator(".pg").nth(1).locator("img").first.bounding_box()
            pg.mouse.move(card["x"] + card["width"] * 0.3, card["y"] + card["height"] * 0.7)
            pg.mouse.move(card["x"] + card["width"] * 0.32, card["y"] + card["height"] * 0.7)
            try:
                pg.wait_for_selector(".pp-peek.on img", timeout=6000)
                pg.wait_for_timeout(400)
                n = red_count(pg.locator(".pp-peek img").first.screenshot())
            except Exception as e:
                n = -1
            ck(n > 200, f"① ภาพลอยตอนชี้ค้างเห็นรูปที่วาง (พิกเซลแดง {n})", str(n))
            if SHOTS:
                pg.screenshot(path=str(SHOTS / "peek_with_mark.png"))
            pg.mouse.move(700, 920)
            pg.wait_for_timeout(500)
            pg.locator(".pg").nth(1).hover()
            pg.locator(".pg").nth(1).locator(".pp-zoom").click()
            pg.wait_for_selector(".pz", timeout=8000)
            pg.wait_for_timeout(1500)
            ck(pg.locator(".pz.editing").count() == 0, "② แว่นขยายเปิดตัวดูแบบดูอย่างเดียว (แผงแก้ไขพับ)")
            n2 = red_count(pg.locator(".pz-paper").screenshot())
            ck(n2 > 500, f"② ตัวดูเต็มจอเห็นรูปที่วาง (พิกเซลแดง {n2})", str(n2))
            close_viewer()
        section("①② ภาพลอยและตัวดูเห็นของที่วาง", s1)

        # ③ เปลี่ยนหน้าในตัวดูแล้ววางบนหน้านั้น
        #    รอบ 4 (19/11/2026) พี่ปอนด์ให้เอาแถบภาพย่อออก ("มันไม่ค่อยสวย แปลก ๆ") ข้อนี้จึงตรวจว่าไม่มีแถบแล้ว
        #    และไปหน้า 4 ด้วยปุ่มถัดไปของตัวดูแทน
        def s3():
            fresh([A])
            open_edit(0)
            ck(pg.locator(".pz-edit .pp-strip").count() == 0, "③ แผงแก้ไขไม่มีแถบภาพย่อ (รอบ 4)")
            for _ in range(3):
                pg.locator(".pz-bar button[aria-label^='หน้าถัดไป']").click()
                pg.wait_for_timeout(900)
            title = pg.locator(".pz-title").inner_text()
            ck("หน้า 4 จาก 5" in title, f"③ กดถัดไปสามครั้ง ตัวดูไปหน้า 4 ({title.splitlines()[0]})", title)
            stamp_at(0.4, 0.4)
            close_viewer()
            doc = save("strip.pdf")
            imgs = [len(p.get_images()) for p in doc]
            ck(imgs == [0, 0, 0, 1, 0], f"③ ไฟล์มีรูปที่หน้า 4 หน้าเดียว ({imgs})", str(imgs))
        section("③ เปลี่ยนหน้าแล้ววาง", s3)

        # ④ เอาไฟล์ออก งานของไฟล์ที่เหลือยังอยู่
        def s4():
            fresh([A, B])
            open_edit(0)
            stamp_at(0.5, 0.5)
            close_viewer()
            pick(1)
            pg.keyboard.press("]")
            pg.wait_for_timeout(500)
            dialogs.clear()
            answer["yes"] = True                      # คนตั้งใจเอา B ออก ถ้ามีถามก็ตอบตกลง (โค้ดเดิมถามแล้วล้างทั้งชุด)
            rm = pg.locator("button[aria-label^='เอา '][aria-label$=' ออก']")
            rm.nth(1).click()
            pg.wait_for_timeout(2500)
            answer["yes"] = False
            ck(not dialogs, f"④ ไฟล์ B ไม่มีของที่วาง เอาออกได้เลย ไม่ถาม ({dialogs[:1]})", str(dialogs))
            ck(pg.locator(".pg").count() == 5, f"④ เหลือหน้าของไฟล์ A 5 หน้า ({pg.locator('.pg').count()})")
            red = pg.evaluate("""() => { const im = document.querySelectorAll('.pg')[0].querySelector('img');
              const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
              const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data;
              let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i+1] < 80 && d[i+2] < 80) n++; return n; }""")
            ck(red > 20, f"④ การ์ดหน้า 1 ยังเห็นรูปที่วาง (พิกเซลแดง {red})", str(red))
            doc = save("removed_b.pdf")
            imgs = [len(p.get_images()) for p in doc]
            rots = [p.rotation for p in doc]
            ck(doc.page_count == 5 and page_with(doc, "Bfile") < 0, f"④ ไฟล์ผลลัพธ์มีแต่หน้าของ A ({doc.page_count} หน้า)")
            ck(imgs[0] == 1 and sum(imgs) == 1, f"④ รูปที่วางบนหน้า 1 ของ A ยังอยู่ ({imgs})", str(imgs))
            ck(rots[1] == 90, f"④ การหมุนหน้า 2 ของ A ยังอยู่ ({rots})", str(rots))

            fresh([A, B])
            open_edit(5)
            stamp_at(0.5, 0.5)
            close_viewer()
            dialogs.clear()
            pg.locator("button[aria-label^='เอา '][aria-label$=' ออก']").nth(1).click()
            pg.wait_for_timeout(1500)
            ck(len(dialogs) == 1 and pg.locator(".pg").count() == 7,
               f"④ ไฟล์ B มีของที่วาง ถามก่อน ตอบไม่ หน้ายังอยู่ครบ 7 ({dialogs[:1]})", f"{dialogs} {pg.locator('.pg').count()}")
        section("④ เอาไฟล์ออก งานไฟล์ที่เหลือยังอยู่", s4)

        # ⑤ ช่องสีขาวเห็นว่าเป็นตัวเลือกสี
        def s5():
            fresh([A])
            open_edit(0)
            pg.click(".pz-edit button[data-mode=cover]")
            pg.wait_for_timeout(300)
            info = pg.evaluate("""() => {
              const inp = [...document.querySelectorAll('.pz-edit input[type=color]')].find((n) => n.offsetParent);
              if (!inp) return null;
              const cs = getComputedStyle(inp);
              let p = inp.parentElement, bg = 'rgba(0, 0, 0, 0)';
              while (p) { const b = getComputedStyle(p).backgroundColor; if (b && !b.endsWith(', 0)') && b !== 'transparent') { bg = b; break; } p = p.parentElement; }
              const field = inp.closest('.field');
              const r = inp.getBoundingClientRect();
              return { border: cs.borderTopColor, bw: parseFloat(cs.borderTopWidth), bg, value: inp.value,
                       ar: r.width / r.height, round: parseFloat(cs.borderTopLeftRadius) / r.height,
                       text: field ? field.innerText : '' };
            }""")
            if not info:
                return ck(False, "⑤ หาช่องสีของปิดทับเจอ")
            rgb = lambda s: tuple(int(float(v)) for v in s[s.index("(") + 1:s.index(")")].split(",")[:3])
            c = contrast(rgb(info["border"]), rgb(info["bg"]))
            ck(info["value"] == "#ffffff", "⑤ ค่าตั้งต้นของปิดทับเป็นสีขาว")
            ck(info["bw"] >= 1 and c >= 1.5, f"⑤ ขอบวงสีต่างจากพื้นแผง {c:.2f} เท่า (ขอบ {info['border']} พื้น {info['bg']})", str(info))
            # รอบ 4 พี่ปอนด์ "ไม่เอาคำว่าขาว เอาเป็นรหัสสีมาเลย"
            ck("#FFFFFF" in info["text"] and "ขาว" not in info["text"].replace("ปกติใช้สีขาว", ""),
               "⑤ ข้างวงสีแสดงรหัสสี #FFFFFF ไม่มีชื่อสี", info["text"])
            # ‼️ ขอบอย่างเดียวไม่พอ v245 ก็มีขอบเข้ม (5.68 เท่า) แต่เป็นแถบยาวเต็มช่อง หน้าตาเหมือนช่องพิมพ์ว่าง ๆ
            #    ตัวเลือกสีต้องเป็นวง (กว้างเท่าสูง มุมโค้งครึ่งหนึ่งของความสูง)
            ck(info["ar"] <= 1.2 and info["round"] >= 0.4, f"⑤ ช่องสีเป็นวงกลม ไม่ใช่แถบยาวเหมือนช่องพิมพ์ (กว้างต่อสูง {info['ar']:.2f})",
               f"{info['ar']:.2f} {info['round']:.2f}")
            if SHOTS:
                pg.locator(".pz-edit").screenshot(path=str(SHOTS / "swatch_white.png"))
        section("⑤ ช่องสีขาว", s5)

        ck(not errs, "ไม่มี error ในหน้าเว็บ", "; ".join(errs[:2]))
        b.close()

        # ⑥ มือถือ พื้นหัวและแถบล่างทึบ
        def s6():
            b2 = pw.chromium.launch()
            m = b2.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
            mp = m.new_page()
            mp.goto(f"{BASE}/#pdf-pages", wait_until="domcontentloaded", timeout=60000)
            mp.wait_for_timeout(2200)
            mp.set_input_files("input[type=file]", [str(A)])
            mp.wait_for_selector(".pg", timeout=60000)
            mp.wait_for_timeout(1800)
            # ของแดงเต็มจอข้างหลังตัวดู แทนปุ่มแดงของหน้า จะได้ไม่ขึ้นกับว่าปุ่มอยู่ตรงไหน
            mp.evaluate("""() => { const d = document.createElement('div'); d.id = 'red-under';
              d.style.cssText = 'position:fixed;inset:0;background:#ff0000;z-index:999;pointer-events:none';
              document.body.appendChild(d); }""")
            btn = mp.locator(".s2-tbar button").filter(has_text="แก้ข้อความบนหน้า").first
            mp.evaluate("() => document.querySelector('#red-under').style.display = 'none'")
            btn.scroll_into_view_if_needed()
            btn.click()
            mp.wait_for_selector(".pz.editing", timeout=8000)
            mp.wait_for_timeout(1200)
            tb = mp.locator(".pz-top").bounding_box()
            barb = mp.locator(".pz-bar").bounding_box()
            clips = [{"x": 0, "y": tb["y"], "width": 390, "height": tb["height"]},
                     {"x": 0, "y": barb["y"] - 8, "width": 390, "height": barb["height"] + 16}]
            mp.evaluate("() => { const d = document.querySelector('#red-under'); d.style.display = ''; d.style.background = '#0000ff'; }")
            mp.wait_for_timeout(400)
            clean = [mp.screenshot(clip=c) for c in clips]
            mp.evaluate("() => { document.querySelector('#red-under').style.background = '#ff0000'; }")
            mp.wait_for_timeout(400)
            red = [mp.screenshot(clip=c) for c in clips]
            t1, t2 = bleed_share(clean[0], red[0]), bleed_share(clean[1], red[1])
            ck(t1 < 0.01, f"⑥ หัวตัวดูไม่มีสีแดงข้างหลังซึม (พิกเซลที่แดงขึ้น {t1:.1%})", f"{t1:.3f}")
            ck(t2 < 0.01, f"⑥ แถบล่างไม่มีสีแดงข้างหลังซึม (พิกเซลที่แดงขึ้น {t2:.1%})", f"{t2:.3f}")
            ck(mp.locator(".pz-edit .pp-strip").count() == 0 or not mp.locator(".pz-edit .pp-strip").first.is_visible(),
               "⑥ จอแคบไม่มีแถบภาพย่อ แผงไม่รก")
            if SHOTS:
                mp.screenshot(path=str(SHOTS / "viewer_edit_390_redunder.png"))
                mp.evaluate("() => document.querySelector('#red-under').remove()")
                mp.wait_for_timeout(300)
                mp.screenshot(path=str(SHOTS / "viewer_edit_390.png"))
            b2.close()
        section("⑥ มือถือ", s6)

    print(f"\nผ่าน {ok} , ตก {fail}")
    sys.exit(1 if fail else 0)


if __name__ == "__main__":
    main()
