#!/usr/bin/env python3
"""ตัวแก้ไขบนหน้า รอบ 5 (19/11/2026) ตามที่พี่ปอนด์ลองบน v247 แล้วติ

  ①  กล่องข้อความทั้งตอนพิมพ์และตอนเลือก มีปุ่มลบแดงกับจุดจับวงกลม 4 มุม แบบเดียวกับลายเซ็น
      ("ข้อความอ่ะอยากให้มันกดปิดได้ ... ชอบยืดขยายสัญลักษณ์แบบนี้")
  ②  ลากจุดจับกล่องข้อความแล้วตัวอักษรย่อขยายตาม ค่าขนาดในแผงเปลี่ยนตาม ไฟล์ได้ขนาดนั้น
  ③  ข้อความที่พิมพ์บนหน้าอยู่ในช่องข้อความของแผง แก้ที่ไหนอีกที่เปลี่ยนตาม ไฟล์ได้ข้อความล่าสุด
  ④  กล่องตอนเริ่มพิมพ์อ่านง่าย (มีคำแนะนำ ไม่ใช่กรอบเล็กว่าง) เคอร์เซอร์อยู่ในกล่อง
  ⑤  ลากลายเซ็นจากช่องที่บันทึกไว้ไปปล่อยบนหน้า วางกึ่งกลางที่จุดปล่อย ("จับลากมาวางไม่มา")
  ⑥  ลายเซ็นวางครั้งแรกกว้าง 20% ของหน้า , วางชิดขอบแล้วของไม่ล้นหน้าทั้งบนจอและในไฟล์
  ⑦  แผงในตัวดูเว้นขอบขวาไม่น้อยกว่าระยะขอบบน ("อยู่ชิดจอมากเกิน")
  ⑧  กระดานวาดลายเซ็นอยู่ในจอตอนเปิดแผง ปุ่มลบเส้นเป็นไอคอนบนกระดาน ปิดไว้ตอนว่าง กดแล้วกระดานว่างจริง
      ("ล้างกระดาน ควรเป็นสัญลักษณ์แทนไหม อธิบายแล้วงง") ทั้งตัวดูและหน้าแก้ไขและเซ็น
  ภาพจอ คอม 1440 และมือถือ 390

ไฟล์ผลลัพธ์อ่านด้วย PyMuPDF ข้อความลงไฟล์เป็นภาพ ความสูงภาพ = 1.7 เท่าของขนาดตัวอักษร
ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> <venv>/bin/python tests/browser_pdfpages_edit_r5.py [--shots <โฟลเดอร์>]
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
notes = []


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
    for i in range(3):
        p = d.new_page(width=595, height=842)
        p.insert_text((80, 100), f"Page {i + 1}", fontsize=20)
        # แถวตัวหนังสือดำหนา ๆ ไว้ทดสอบไฮไลต์ทับ (y 250 ถึง 290 พอยต์)
        p.insert_text((60, 280), "MMMMMMMMMMMMMMMM", fontsize=40, color=(0, 0, 0))
    d.save(a)
    d.close()
    red = tmp / "red.png"
    Image.new("RGB", (80, 40), (255, 0, 0)).save(red)       # กว้าง 2 เท่าของสูง
    return a, red


def render_png(page, zoom=2):
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def color_bbox(im, test):
    px = im.load()
    x0 = y0 = 10 ** 9
    x1 = y1 = -1
    n = 0
    for y in range(0, im.height, 2):
        for x in range(0, im.width, 2):
            if test(px[x, y]):
                n += 1
                x0 = min(x0, x); y0 = min(y0, y); x1 = max(x1, x); y1 = max(y1, y)
    if not n:
        return None
    W, H = im.width, im.height
    return (x0 / W, y0 / H, (x1 + 2) / W, (y1 + 2) / H)


def region_stats(im, fx0, fy0, fx1, fy1):
    """ในกรอบสัดส่วน: ค่ามืดสุด (มีตัวหนังสือใต้แถบไหม) และสีพื้นแถบ (ค่ากลางของพิกเซลที่สว่าง)"""
    px = im.load()
    W, H = im.size
    lums, light = [], []
    for y in range(int(fy0 * H), int(fy1 * H), 2):
        for x in range(int(fx0 * W), int(fx1 * W), 2):
            r, g, b = px[x, y]
            L = 0.299 * r + 0.587 * g + 0.114 * b
            lums.append(L)
            if L > 150:
                light.append((r, g, b))
    if not lums:
        return None, None
    light.sort(key=lambda c: c[0] + c[1] + c[2])
    bg = light[len(light) // 2] if light else None
    return min(lums), bg



def main():
    from playwright.sync_api import sync_playwright
    tmp = Path(tempfile.mkdtemp(prefix="fk_ppedit5_"))
    A, RED = make_files(tmp)

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 950}, accept_downloads=True)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("dialog", lambda dg: dg.dismiss())

        def fresh(p=pg):
            p.goto("about:blank")
            p.goto(f"{BASE}/#pdf-pages", wait_until="domcontentloaded", timeout=60000)
            p.wait_for_timeout(2200)
            p.evaluate("() => { try { localStorage.clear(); } catch (e) {} }")
            p.set_input_files("input[type=file]", [str(A)])
            p.wait_for_selector(".pg", timeout=60000)
            p.wait_for_timeout(1500)

        def open_edit(p=pg):
            btn = p.locator(".s2-tbar button").filter(has_text="แก้ข้อความบนหน้า").first
            btn.scroll_into_view_if_needed(); btn.click()
            p.wait_for_selector(".pz.editing", timeout=8000)
            p.wait_for_timeout(1200)

        def paper_at(fx, fy, p=pg):
            r = p.locator(".pz-paper").bounding_box()
            return r["x"] + r["width"] * fx, r["y"] + r["height"] * fy

        def mode(m, p=pg):
            p.click(f".pz-edit button[data-mode={m}]"); p.wait_for_timeout(350)

        def set_input(sel, value):
            pg.evaluate("""([sel, v]) => { const n = [...document.querySelectorAll(sel)].find((x) => x.offsetParent);
              n.value = v; n.dispatchEvent(new Event('input', {bubbles: true})); n.dispatchEvent(new Event('change', {bubbles: true})); }""",
                        [sel, value])
            pg.wait_for_timeout(300)

        def panel_text():
            return pg.evaluate("() => { const n = [...document.querySelectorAll('.pz-edit input[type=text], .pz-edit input:not([type])')].find((x) => x.offsetParent); return n ? n.value : null; }")

        def close_viewer():
            pg.keyboard.press("Escape"); pg.wait_for_timeout(900)

        def save(name):
            out = tmp / name
            with pg.expect_download(timeout=60000) as dl:
                pg.locator("button.s2-cta:visible").filter(has_text="บันทึก").first.click()
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

        BOX_UI = """(sel) => { const n = document.querySelector(sel); if (!n) return null;
          const vis = (x) => x && getComputedStyle(x).opacity !== '0' && getComputedStyle(x).display !== 'none' && x.getBoundingClientRect().width > 0;
          const grips = [...n.querySelectorAll('.pe-grip')];
          const r = n.getBoundingClientRect();
          const a = document.activeElement;
          return { rm: vis(n.querySelector('.rm')), grips: grips.filter(vis).length,
                   round: grips.every((g) => parseFloat(getComputedStyle(g).borderTopLeftRadius) >= g.getBoundingClientRect().width / 2 - 0.5),
                   w: r.width, h: r.height, focusIn: !!(a && n.contains(a) && a.isContentEditable),
                   hint: (getComputedStyle(n.querySelector('[contenteditable]') || n, '::before').content || '') }; }"""

        # ①③④ พิมพ์บนหน้า: กล่องมีปุ่มลบ จุดจับ อ่านง่าย ช่องแผงเห็นข้อความเดียวกัน
        def s1():
            fresh(); open_edit(); mode("text")
            pg.mouse.click(*paper_at(0.20, 0.62)); pg.wait_for_timeout(500)
            u = pg.evaluate(BOX_UI, ".pz .pe-box.text.editing, .pz .pe-edit")
            if SHOTS:
                pg.screenshot(path=str(SHOTS / "typing_start_1440.png"))
            ck(bool(u) and u["rm"], "① กล่องตอนพิมพ์มีปุ่มลบ", str(u))
            ck(bool(u) and u["grips"] == 4 and u["round"], f"① กล่องตอนพิมพ์มีจุดจับวงกลม 4 มุม ({u and u['grips']})", str(u))
            ck(bool(u) and u["w"] >= 60 and u["h"] >= 14 and "พิมพ์" in u["hint"],
               f"④ กล่องตอนเริ่มพิมพ์อ่านง่าย มีคำแนะนำ กว้าง {u and round(u['w'])} สูง {u and round(u['h'])} px", str(u))
            ck(bool(u) and u["focusIn"], "④ เคอร์เซอร์อยู่ในกล่องบนหน้า")
            pg.keyboard.type("HELLO")
            pg.wait_for_timeout(300)
            ck(panel_text() == "HELLO", f"③ พิมพ์บนหน้าแล้วช่องข้อความในแผงเห็นข้อความเดียวกันทันที ({panel_text()!r})")
            lab = pg.evaluate("() => { const n = [...document.querySelectorAll('.pz-edit label.field')].find((x) => x.offsetParent && x.querySelector('input:not([type=color]):not([type=range]):not([type=file])')); return n ? n.querySelector('span').textContent + '|' + n.querySelector('input').placeholder : ''; }")
            ck("ชิ้นนี้" in lab and "ไม่ต้องใส่" not in lab, f"③ ป้ายช่องเปลี่ยนเป็นข้อความของชิ้นนี้ ({lab})", lab)
            pg.keyboard.press("Enter"); pg.wait_for_timeout(400)
            u2 = pg.evaluate(BOX_UI, ".pz .pe-box.text.sel")
            ck(bool(u2) and u2["rm"] and u2["grips"] == 4, "① กล่องข้อความที่เลือกอยู่มีปุ่มลบและจุดจับ 4 มุม", str(u2))
            if SHOTS:
                pg.screenshot(path=str(SHOTS / "text_selected_1440.png"))
            set_input(".pz-edit input:not([type=color]):not([type=range]):not([type=file])", "HELLO WORLD 2569")
            t = pg.evaluate("() => [...document.querySelectorAll('.pz .pe-box.text')].map((n) => n.innerText.replace(/[\\u2715]/g, '').trim())")
            ck(t == ["HELLO WORLD 2569"], f"③ แก้ในแผงแล้วข้อความบนหน้าเปลี่ยนตามทันที ({t})", str(t))
            scr_w = pg.evaluate("() => { const p = document.querySelector('.pz-paper').getBoundingClientRect(); const n = document.querySelector('.pz .pe-box.text span'); return n.getBoundingClientRect().width / p.width; }")
            close_viewer()
            doc = save("panel_text.pdf")
            infos = doc[0].get_image_info()
            W = doc[0].rect.width
            if len(infos) != 1:
                return ck(False, "③ ไฟล์มีข้อความ 1 ชิ้น", str(len(infos)))
            fw = (infos[0]["bbox"][2] - infos[0]["bbox"][0]) / W
            notes.append(f"ข้อความที่แก้ในแผง กว้างบนจอ {scr_w:.4f} ในไฟล์ {fw:.4f} ของหน้า")
            ck(abs(fw - scr_w) <= 0.02 and fw > 0.12, f"③ ไฟล์ได้ข้อความที่แก้ในแผง ความกว้างตรงกับบนจอ ({fw:.4f} กับ {scr_w:.4f})")
        section("①③④ พิมพ์บนหน้า", s1)

        # ② ลากจุดจับข้อความแล้วตัวอักษรใหญ่ขึ้น ค่าขนาดในแผงตาม ไฟล์ได้ขนาดนั้น , ปุ่มลบเอาออกได้
        def s2():
            fresh(); open_edit(); mode("text")
            set_input(".pz-edit select", "14")
            pg.mouse.click(*paper_at(0.20, 0.50)); pg.wait_for_timeout(400)
            pg.keyboard.type("SIZE"); pg.keyboard.press("Enter"); pg.wait_for_timeout(400)
            pg.mouse.click(*paper_at(0.20, 0.80)); pg.wait_for_timeout(400)
            pg.keyboard.type("GONE"); pg.keyboard.press("Enter"); pg.wait_for_timeout(400)
            boxes = pg.locator(".pz .pe-box.text")
            boxes.nth(0).click(); pg.wait_for_timeout(400)
            g = pg.locator(".pz .pe-box.text.sel .pe-grip.se")
            if g.count() != 1:
                return ck(False, "② กล่องข้อความที่เลือกมีจุดจับมุมขวาล่าง", str(g.count()))
            top0 = pg.locator(".pz .pe-box.text.sel").bounding_box()["y"]
            gb = g.bounding_box()
            sx, sy = gb["x"] + gb["width"] / 2, gb["y"] + gb["height"] / 2
            pg.mouse.move(sx, sy); pg.mouse.down()
            pg.mouse.move(sx + 40, sy + 30, steps=8); pg.mouse.up(); pg.wait_for_timeout(400)
            size = pg.evaluate("() => +[...document.querySelectorAll('.pz-edit select')].find((x) => x.offsetParent).value")
            ck(24 <= size <= 72, f"② ลากจุดจับลง 30 px แล้วขนาดตัวอักษรในแผงเพิ่มจาก 14 เป็น {size} ตามความสูงกล่อง")
            top1 = pg.locator(".pz .pe-box.text").first.bounding_box()["y"]
            ck(abs(top1 - top0) <= 3, f"② ยืดจากมุมขวาล่าง ขอบบนของกล่องอยู่ที่เดิม ({top0:.0f} กับ {top1:.0f})")
            fpx = pg.evaluate("() => parseFloat(getComputedStyle(document.querySelector('.pz .pe-box.text')).fontSize)")
            ck(fpx > 0 and size >= 24, f"② ตัวอักษรบนหน้าใหญ่ขึ้น ({fpx:.1f} px)")
            # ปุ่มลบของชิ้นที่สอง
            boxes.nth(1).click(); pg.wait_for_timeout(300)
            pg.locator(".pz .pe-box.text.sel .rm").click(); pg.wait_for_timeout(400)
            ck(pg.locator(".pz .pe-box.text").count() == 1, "① กดปุ่มลบของกล่องข้อความแล้วชิ้นนั้นหายไป")
            close_viewer()
            doc = save("text_resize.pdf")
            infos = doc[0].get_image_info()
            if len(infos) != 1:
                return ck(False, "② ไฟล์มีข้อความ 1 ชิ้น", str(len(infos)))
            h = infos[0]["bbox"][3] - infos[0]["bbox"][1]
            notes.append(f"ลากจุดจับแล้วขนาด {size} พอยต์ ภาพข้อความในไฟล์สูง {h:.1f} (ควร {1.7 * size:.1f})")
            ck(abs(h - 1.7 * size) <= 1.5, f"② ไฟล์ได้ตัวอักษรขนาด {size} (ภาพสูง {h:.1f} พอยต์)")
        section("② ลากจุดจับข้อความ", s2)

        def draw_on_pad(p, sel=".pz-edit canvas.sign-canvas"):
            c = p.locator(sel).first
            c.scroll_into_view_if_needed()
            r = c.bounding_box()
            p.mouse.move(r["x"] + r["width"] * 0.2, r["y"] + r["height"] * 0.6); p.mouse.down()
            p.mouse.move(r["x"] + r["width"] * 0.5, r["y"] + r["height"] * 0.3, steps=6)
            p.mouse.move(r["x"] + r["width"] * 0.8, r["y"] + r["height"] * 0.7, steps=6); p.mouse.up()
            p.wait_for_timeout(250)

        PAD_INK = """(sel) => { const c = [...document.querySelectorAll(sel)].find((x) => x.offsetParent); if (!c) return -1;
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
          for (let i = 3; i < d.length; i += 16) if (d[i] > 0) n++; return n; }"""
        CLEAR_BTN = """(scope) => { const c = [...document.querySelectorAll(scope + ' canvas.sign-canvas')].find((x) => x.offsetParent); if (!c) return null;
          const btn = [...c.closest('.pe-sign').querySelectorAll('button')].find((x) => /ลบเส้นที่วาด/.test(x.getAttribute('aria-label') || ''));
          if (!btn) return { found: false };
          const r = btn.getBoundingClientRect(), cr = c.getBoundingClientRect();
          return { found: true, icon: !!btn.querySelector('svg'), text: btn.innerText.trim(), title: btn.title, disabled: btn.disabled,
                   onPad: r.left >= cr.left - 2 && r.right <= cr.right + 2 && r.top >= cr.top - 2 && r.bottom <= cr.top + cr.height / 2 }; }"""
        IN_VIEW = """(scope) => { const c = [...document.querySelectorAll(scope + ' canvas.sign-canvas')].find((x) => x.offsetParent); if (!c) return null;
          const r = c.getBoundingClientRect(); let box = c.parentElement;
          while (box && !(box.scrollHeight > box.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
          const b = box ? box.getBoundingClientRect() : { top: 0, bottom: innerHeight };
          return { top: Math.round(r.top), bottom: Math.round(r.bottom), vTop: Math.round(Math.max(b.top, 0)), vBottom: Math.round(Math.min(b.bottom, innerHeight)), h: Math.round(r.height),
                   ok: r.height > 40 && r.top >= Math.max(b.top, 0) - 1 && r.bottom <= Math.min(b.bottom, innerHeight) + 1 }; }"""

        # ⑧ กระดานลายเซ็น ⑤ ลากจากช่องที่บันทึกไว้ ⑥ 20% ⑦ ระยะแผง
        def s5():
            fresh(); open_edit()
            gap = pg.evaluate("""() => { const p = document.querySelector('.pz-edit').getBoundingClientRect();
              const top = document.querySelector('.pz-top').getBoundingClientRect();
              return { right: innerWidth - p.right, top: p.top - top.bottom }; }""")
            ck(gap["right"] >= max(8, gap["top"]), f"⑦ แผงเว้นขอบขวา {gap['right']:.0f} px ไม่น้อยกว่าระยะขอบบน {gap['top']:.0f} px", str(gap))
            mode("sign")
            v = pg.evaluate(IN_VIEW, ".pz-edit")
            ck(bool(v) and v["ok"], f"⑧ เปิดแผงลายเซ็นแล้วกระดานอยู่ในจอโดยไม่ต้องเลื่อน (คอม 1440) {v}")
            cb = pg.evaluate(CLEAR_BTN, ".pz-edit")
            ck(bool(cb) and cb.get("found") and cb["icon"] and not cb["text"], f"⑧ ปุ่มลบเส้นเป็นไอคอน มีป้าย ลบเส้นที่วาด ({cb})", str(cb))
            ck(bool(cb) and cb.get("found") and cb["onPad"], "⑧ ปุ่มลบเส้นอยู่มุมบนของกระดาน")
            ck(bool(cb) and cb.get("found") and cb["disabled"], "⑧ กระดานว่าง ปุ่มลบเส้นปิดไว้")
            ink0 = pg.evaluate(PAD_INK, ".pz-edit canvas.sign-canvas")
            draw_on_pad(pg)
            ink1 = pg.evaluate(PAD_INK, ".pz-edit canvas.sign-canvas")
            ck(ink0 == 0 and ink1 > 20, f"⑧ วาดเส้นแล้วพิกเซลบนกระดานเปลี่ยน ({ink0} เป็น {ink1})")
            cb = pg.evaluate(CLEAR_BTN, ".pz-edit")
            ck(bool(cb) and cb.get("found") and not cb["disabled"], "⑧ วาดแล้วปุ่มลบเส้นกดได้")
            if cb and cb.get("found"):
                pg.locator(".pz-edit button[aria-label='ลบเส้นที่วาด']").click(); pg.wait_for_timeout(250)
            ink2 = pg.evaluate(PAD_INK, ".pz-edit canvas.sign-canvas")
            cb = pg.evaluate(CLEAR_BTN, ".pz-edit")
            ck(ink2 == 0 and bool(cb) and cb.get("found") and cb["disabled"], f"⑧ กดลบเส้นแล้วกระดานว่าง ปุ่มกลับปิด (หมึก {ink2})")
            draw_on_pad(pg)
            pg.locator(".pz-edit button").filter(has_text="ใช้ลายเซ็นนี้").first.click(); pg.wait_for_timeout(400)
            fig = pg.locator(".pz-edit .pe-saved figure").first
            ck(fig.count() == 1, "⑧ ใช้ลายเซ็นนี้แล้วเข้าช่องที่บันทึกไว้")
            if SHOTS:
                pg.screenshot(path=str(SHOTS / "sign_panel_1440.png"))
            # ⑤ ลากจากช่องที่บันทึกไว้ไปปล่อยบนหน้า
            fb = fig.bounding_box()
            pg.mouse.move(fb["x"] + fb["width"] / 2, fb["y"] + fb["height"] / 2); pg.mouse.down()
            tx, ty = paper_at(0.40, 0.70)
            pg.mouse.move((fb["x"] + tx) / 2, (fb["y"] + ty) / 2, steps=6)
            if SHOTS:
                pg.screenshot(path=str(SHOTS / "drag_saved_1440.png"))
            pg.mouse.move(tx, ty, steps=6); pg.mouse.up(); pg.wait_for_timeout(600)
            n1 = pg.locator(".pz .pe-box.stamp").count()
            ck(n1 == 1, f"⑤ ลากลายเซ็นจากช่องที่บันทึกไว้ไปปล่อยบนหน้า ได้ลายเซ็นบนหน้า ({n1})")
            # ปล่อยนอกหน้าไม่วาง
            fb = fig.bounding_box()
            pg.mouse.move(fb["x"] + fb["width"] / 2, fb["y"] + fb["height"] / 2); pg.mouse.down()
            pg.mouse.move(fb["x"] - 60, fb["y"] - 200, steps=8); pg.mouse.up(); pg.wait_for_timeout(500)
            n2 = pg.locator(".pz .pe-box.stamp").count()
            ck(n2 == n1, f"⑤ ปล่อยนอกหน้าไม่วาง ({n2})")
            # ⑥ คลิกวางชิดขอบขวาของกระดาษ
            pg.mouse.click(*paper_at(0.97, 0.30)); pg.wait_for_timeout(600)
            boxes = pg.evaluate("""() => { const p = document.querySelector('.pz-paper').getBoundingClientRect();
              return [...document.querySelectorAll('.pz .pe-box.stamp')].map((n) => { const r = n.getBoundingClientRect(); return [(r.left - p.left) / p.width, (r.right - p.left) / p.width]; }); }""")
            ck(len(boxes) == 2 and boxes[1][1] <= 1.002, f"⑥ วางชิดขอบขวา บนจอไม่ล้นหน้า ({boxes})", str(boxes))
            close_viewer()
            doc = save("sign_drop.pdf")
            p = doc[0]
            W, H = p.rect.width, p.rect.height
            infos = sorted(p.get_image_info(), key=lambda i: i["bbox"][1])
            if len(infos) != 2:
                return ck(False, "⑤⑥ ไฟล์มีลายเซ็น 2 ชิ้น", str(len(infos)))
            right_one, drop_one = infos[0], infos[1]
            x0, y0, x1, y1 = drop_one["bbox"]
            cx, cy = (x0 + x1) / 2 / W, (y0 + y1) / 2 / H
            notes.append(f"ลายเซ็นที่ลากมาปล่อย กึ่งกลาง ({cx:.4f}, {cy:.4f}) (ปล่อยที่ 0.40, 0.70) กว้าง {(x1 - x0) / W:.4f} ของหน้า")
            ck(abs(cx - 0.40) <= 0.01 and abs(cy - 0.70) <= 0.01, f"⑤ ในไฟล์ลายเซ็นอยู่กึ่งกลางที่จุดปล่อย ({cx:.4f}, {cy:.4f})")
            ck(abs((x1 - x0) / W - 0.20) <= 0.006, f"⑥ ลายเซ็นวางครั้งแรกกว้าง 20% ของหน้า ({(x1 - x0) / W:.4f})")
            rx1 = right_one["bbox"][2]
            notes.append(f"ลายเซ็นที่คลิกชิดขอบขวา ขอบขวาในไฟล์ {rx1:.1f} จากหน้ากว้าง {W:.1f} พอยต์")
            ck(rx1 <= W + 0.5 and right_one["bbox"][0] >= -0.5, f"⑥ ในไฟล์ลายเซ็นที่วางชิดขอบไม่ล้นหน้า (ขอบขวา {rx1:.1f} จาก {W:.1f})")
        section("⑤⑥⑦⑧ ลายเซ็น", s5)

        # ⑥ ข้อความวางชิดขอบขวาแล้วไม่ล้นหน้าในไฟล์
        def s6():
            fresh(); open_edit(); mode("text")
            pg.mouse.click(*paper_at(0.93, 0.40)); pg.wait_for_timeout(400)
            pg.keyboard.type("EDGE TEXT 12345"); pg.keyboard.press("Enter"); pg.wait_for_timeout(400)
            close_viewer()
            doc = save("text_edge.pdf")
            p = doc[0]
            infos = p.get_image_info()
            if len(infos) != 1:
                return ck(False, "⑥ ไฟล์มีข้อความ 1 ชิ้น", str(len(infos)))
            x1 = infos[0]["bbox"][2]
            notes.append(f"ข้อความที่คลิกชิดขอบขวา ขอบขวาในไฟล์ {x1:.1f} จาก {p.rect.width:.1f}")
            ck(x1 <= p.rect.width + 0.5, f"⑥ ข้อความวางชิดขอบขวา ในไฟล์ไม่ล้นหน้า ({x1:.1f} จาก {p.rect.width:.1f})")
        section("⑥ ข้อความชิดขอบ", s6)

        # ⑧ หน้าแก้ไขและเซ็นก็ได้ปุ่มลบเส้นไอคอนเหมือนกัน
        def s7():
            pg.goto("about:blank")
            pg.goto(f"{BASE}/#pdf-edit", wait_until="domcontentloaded", timeout=60000)
            pg.wait_for_timeout(2200)
            pg.set_input_files("input[type=file]", [str(A)])
            pg.wait_for_selector(".pe-stage:not([hidden]) canvas", timeout=60000)
            pg.wait_for_timeout(1500)
            pg.locator(".pe-right button[data-mode=sign]").click(); pg.wait_for_timeout(400)
            cb = pg.evaluate(CLEAR_BTN, ".pe-right")
            ck(bool(cb) and cb.get("found") and cb["icon"] and cb["disabled"], f"⑧ หน้าแก้ไขและเซ็น ปุ่มลบเส้นเป็นไอคอน ปิดไว้ตอนว่าง ({cb})", str(cb))
            draw_on_pad(pg, ".pe-right canvas.sign-canvas")
            if cb and cb.get("found"):
                pg.locator(".pe-right button[aria-label='ลบเส้นที่วาด']").click(); pg.wait_for_timeout(250)
            ink = pg.evaluate(PAD_INK, ".pe-right canvas.sign-canvas")
            ck(ink == 0, f"⑧ หน้าแก้ไขและเซ็น วาดแล้วกดลบเส้น กระดานว่าง ({ink})")
            draw_on_pad(pg, ".pe-right canvas.sign-canvas")
            pg.locator(".pe-right button").filter(has_text="ใช้ลายเซ็นนี้").first.click(); pg.wait_for_timeout(400)
            ck(pg.locator(".pe-right .pe-saved figure").count() == 1, "⑧ หน้าแก้ไขและเซ็น ใช้ลายเซ็นนี้แล้วเข้าช่องที่บันทึกไว้")
        section("⑧ หน้าแก้ไขและเซ็น", s7)

        ck(not errs, "ไม่มี error ในหน้าเว็บ", "; ".join(errs[:2]))
        b.close()

        # มือถือ 390: กระดานอยู่ในจอตอนเปิดแผงลายเซ็น , ภาพตอนพิมพ์ข้อความ
        def s8():
            b2 = pw.chromium.launch()
            m = b2.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
            mp = m.new_page()
            fresh(mp); open_edit(mp)
            mp.click(".pz-edit button[data-mode=sign]"); mp.wait_for_timeout(500)
            v = mp.evaluate(IN_VIEW, ".pz-edit")
            ck(bool(v) and v["ok"], f"⑧ มือถือ เปิดแผงลายเซ็นแล้วกระดานอยู่ในจอโดยไม่ต้องเลื่อน {v}")
            cb = mp.evaluate(CLEAR_BTN, ".pz-edit")
            ck(bool(cb) and cb.get("found") and cb["icon"] and cb["disabled"], "⑧ มือถือ ปุ่มลบเส้นเป็นไอคอน ปิดไว้ตอนว่าง", str(cb))
            if SHOTS:
                mp.screenshot(path=str(SHOTS / "sign_panel_390.png"))
            mp.click(".pz-edit button[data-mode=text]"); mp.wait_for_timeout(300)
            r = mp.locator(".pz-paper").bounding_box()
            mp.mouse.click(r["x"] + r["width"] * 0.2, r["y"] + r["height"] * 0.4); mp.wait_for_timeout(500)
            mp.keyboard.type("MOBILE"); mp.wait_for_timeout(300)
            u = mp.evaluate(BOX_UI, ".pz .pe-box.text.editing, .pz .pe-edit")
            ck(bool(u) and u["rm"] and u["grips"] == 4, "① มือถือ กล่องตอนพิมพ์มีปุ่มลบและจุดจับ 4 มุม", str(u))
            if SHOTS:
                mp.screenshot(path=str(SHOTS / "typing_390.png"))
            b2.close()
        section("มือถือ 390", s8)

    if notes:
        print("\n      ค่าที่วัด")
        for n in notes:
            print(f"      {n}")
    print(f"\nผ่าน {ok} , ตก {fail}")
    sys.exit(1 if fail else 0)


if __name__ == "__main__":
    main()
