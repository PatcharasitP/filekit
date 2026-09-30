# คำอธิบายสัญลักษณ์ของ "แผนที่พื้นที่รอบจุด" (map-coverage) ต้องตรงกับที่วาดจริง
#
# ‼️ ที่มา 30/09/2026: ศึกษาเว็บแผนที่ EEC ของ NGIS แล้วเทียบ พบว่าแผนที่ของเราไม่มีคำอธิบายสัญลักษณ์เลย
#    ทั้งบนจอและในภาพ PNG ที่ส่งต่อ
# ‼️ ตัวตรวจไม่เชื่อ DOM อย่างเดียว: สีในกล่องคำอธิบายต้องเทียบกับ "สีที่ถูกวาดลงพิกเซลจริงของ canvas"
#    ถ้ากล่องบอกสีหนึ่งแต่จุดบนแผนที่เป็นอีกสี เทสต้องแดง
# ถ้าผิดจะรู้ได้ยังไง: ข้อ ② เปลี่ยนสีแล้วทั้งกล่องและพิกเซลต้องเปลี่ยนตาม ข้อ ③ ปิดชั้นแล้วรายการต้องหาย
#
# รัน: tests/run.sh browser_covlegend
import os
import pathlib
import sys
import tempfile

import openpyxl

from PIL import Image
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import fkui  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
TMP = pathlib.Path(tempfile.mkdtemp(prefix="filekit_covlegend_"))
P, F = 0, []


def make_files(with_new):
    """ข้อมูลที่ควบคุมได้: 1 วงรัศมี 3 กม. จุดเดิมในวง 2 จุด (ห่างศูนย์กลางราว 1.5 กม. ทั้งคู่) จุดเดิมนอกวง 1 จุด (ห่าง 4.4 กม.) และ (ถ้าขอ) จุดใหม่ 1 จุดในวง ทุกจุดห่างกันหลายกิโลเมตร ไม่วาดทับกัน
    ‼️ ไม่ใช้ samples/ ของเว็บ เพราะที่ซูมเริ่มต้นจุดในวงกองรวมกันแล้วถูกจุดอื่นวาดทับ วัดสีจากพิกเซลไม่ได้"""
    c = openpyxl.Workbook(); w = c.active; w.title = "C"
    w.append(["รหัสสาย", "ละติจูด", "ลองจิจูด"]); w.append(["C1", 13.75, 100.50])
    c.save(TMP / "centers.xlsx")
    p = openpyxl.Workbook(); w = p.active; w.title = "P"
    w.append(["รหัสสถานี", "ละติจูดเดิม", "ลองจิจูดเดิม", "ละติจูดใหม่", "ลองจิจูดใหม่"])
    w.append(["S1", 13.76, 100.51, None, None])
    w.append(["S2", 13.74, 100.49, 13.76 if with_new else None, 100.485 if with_new else None])
    w.append(["S3", 13.79, 100.50, None, None])
    p.save(TMP / "points.xlsx")


def ck(name, got, want):
    global P
    ok = got == want
    if ok:
        P += 1
    else:
        F.append(f"{name}\n      ได้    : {got!r}\n      ควรได้ : {want!r}")
    print(f"  {'✅' if ok else '❌'} {name}")


def roles(pg):
    return pg.evaluate("() => [...document.querySelectorAll('.mc-legend [data-role]')].map(e => e.dataset.role)")


def swatch(pg, role):
    """สีของตัวอย่างในกล่องคำอธิบาย เป็น rgb(...)"""
    return pg.evaluate("""(r) => { const i = document.querySelector(`.mc-legend [data-role=${r}] i`);
        const c = getComputedStyle(i); return r === 'ring' ? c.borderTopColor : c.backgroundColor; }""", role)


def rgb(hexs):
    h = hexs.lstrip("#")
    return "rgb(%d, %d, %d)" % tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def set_color(pg, idx, hexs):
    """ตั้งสีในช่องเลือกสีลำดับที่ idx (0 จุดศูนย์กลาง 1 จุดเดิม 2 จุดใหม่)"""
    pg.evaluate("""([i, v]) => { const el = document.querySelectorAll('input[type=color]')[i];
        el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }""", [idx, hexs])
    pg.wait_for_timeout(400)


def canvas_has_color(pg, hexs, tol=6):
    """มีพิกเซลบน canvas ที่ใกล้สีนี้ไหม (นับจำนวน)"""
    return pg.evaluate("""([hex, tol]) => {
      const c = document.querySelector('.mc-canvas-wrap canvas'); const g = c.getContext('2d');
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const h = hex.replace('#',''); const t = [0,2,4].map(i => parseInt(h.slice(i, i+2), 16));
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i+3] > 250 && Math.abs(d[i]-t[0]) <= tol && Math.abs(d[i+1]-t[1]) <= tol && Math.abs(d[i+2]-t[2]) <= tol) n++;
      return n; }""", [hexs, tol])


def halo_pixels(pg):
    """พิกเซลเทาขาวสว่างบน canvas (ขอบสว่างใต้วงรัศมี) ไม่นับสีสด เพราะจุดกับวงมีสี"""
    return pg.evaluate("""() => {
      const c = document.querySelector('.mc-canvas-wrap canvas'); const g = c.getContext('2d');
      const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], gg = d[i+1], b = d[i+2];
        if (d[i+3] > 250 && r > 120 && Math.max(r, gg, b) - Math.min(r, gg, b) < 22) n++;
      }
      return n; }""")


def set_theme(pg, name):
    pg.evaluate("(n) => document.documentElement.setAttribute('data-theme', n)", name)
    pg.wait_for_timeout(300)


def main():
    base = os.environ.get("FK_BASE") or "http://127.0.0.1:8899"
    errs = []
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 1360, "height": 1000}, timezone_id="Asia/Bangkok", accept_downloads=True)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        fkui.open_tool(pg, "map-coverage", base)
        ck("ยังไม่มีข้อมูล: กล่องคำอธิบายว่าง", roles(pg), [])

        def load(with_new):
            make_files(with_new)
            fkui.open_tool(pg, "map-coverage", base)
            pg.locator(".dz input[type=file]").nth(0).set_input_files(str(TMP / "centers.xlsx")); pg.wait_for_timeout(1200)
            pg.locator(".dz input[type=file]").nth(1).set_input_files(str(TMP / "points.xlsx")); pg.wait_for_timeout(2200)

        print("\n── ① ไม่มีจุดใหม่: รายการต้องไม่พูดถึงจุดใหม่กับเส้นเชื่อม ──")
        load(False)
        r = roles(pg)
        ck("รายการตรงกับที่วาด", r, ["center", "ring", "old", "faded", "count"])
        txt = pg.evaluate("() => document.querySelector('.mc-legend [data-role=ring]').textContent")
        ck("บอกรัศมีตรงกับแถบเลื่อน", txt, "วงรัศมี 3.0 กม.")

        print("\n── ② มีจุดใหม่: รายการครบ และสีในคำอธิบาย = สีที่วาดลงพิกเซลจริง ──")
        load(True)
        ck("มีจุดใหม่และเส้นเชื่อมด้วย", roles(pg), ["center", "ring", "old", "new", "faded", "link", "count"])
        for idx, role, hexs in ((0, "center", "#aa2233"), (1, "old", "#11aa44"), (2, "new", "#7722cc")):
            set_color(pg, idx, hexs)
            ck(f"เปลี่ยนสี {role} แล้วกล่องคำอธิบายเปลี่ยนตาม", swatch(pg, role), rgb(hexs))
            ck(f"และสี {hexs} ถูกวาดบน canvas จริง (มีพิกเซล)", canvas_has_color(pg, hexs) > 20, True)
        ck("วงรัศมีใช้สีเดียวกับจุดศูนย์กลาง", swatch(pg, "ring"), rgb("#aa2233"))
        pg.evaluate("""() => { const lab = [...document.querySelectorAll('label.field')].find(l => l.textContent.includes('จุดใหม่'));
            [...lab.querySelectorAll('input[type=radio]')].find(i => i.value === 'off').click(); }""")
        pg.wait_for_timeout(500)
        ck("ปิดจุดใหม่: รายการจุดใหม่และเส้นเชื่อมหายไปพร้อมกัน", roles(pg), ["center", "ring", "old", "faded", "count"])
        ck("และสีจุดใหม่หายจากพิกเซลด้วย (คำอธิบายไม่โกหก)", canvas_has_color(pg, "#7722cc") < 20, True)
        pg.evaluate("""() => { const lab = [...document.querySelectorAll('label.field')].find(l => l.textContent.includes('จุดใหม่'));
            [...lab.querySelectorAll('input[type=radio]')].find(i => i.value === 'on').click(); }""")
        pg.wait_for_timeout(500)

        print("\n── ③ ปิดชั้น รายการต้องหาย ──")
        pg.locator(".seg-item").filter(has_text="ตัวเลขจำนวนข้างวง").count()   # ป้ายอยู่ใน label field ไม่ใช่ปุ่ม
        pg.evaluate("""() => { const lab = [...document.querySelectorAll('label.field')].find(l => l.textContent.includes('ตัวเลขจำนวนข้างวง'));
            [...lab.querySelectorAll('input[type=radio]')].find(i => i.value === 'off').click(); }""")
        pg.wait_for_timeout(500)
        ck("ปิดตัวเลข: รายการตัวเลขหาย", "count" in roles(pg), False)
        pg.evaluate("""() => { const lab = [...document.querySelectorAll('label.field')].find(l => l.textContent.includes('จุดที่อยู่นอกวง'));
            [...lab.querySelectorAll('input[type=radio]')].find(i => i.value === 'hide').click(); }""")
        pg.wait_for_timeout(500)
        ck("โหมดซ่อนจุดนอกวง: รายการจุดจางหาย", "faded" in roles(pg), False)
        pg.evaluate("""() => { const lab = [...document.querySelectorAll('label.field')].find(l => l.textContent.includes('จุดที่อยู่นอกวง'));
            [...lab.querySelectorAll('input[type=radio]')].find(i => i.value === 'dim').click(); }""")
        pg.wait_for_timeout(500)
        ck("กลับเป็นโหมดจาง: รายการจุดจางกลับมา", "faded" in roles(pg), True)

        print("\n── ④ ลากและซูมไม่สร้างกล่องคำอธิบายใหม่ (ไม่กะพริบ) ──")
        pg.evaluate("() => { window.__n = 0; const box = document.querySelector('.mc-legend');"
                    "new MutationObserver(() => window.__n++).observe(box, { childList: true, subtree: true }); }")
        for _ in range(3):
            pg.locator(".mc-zoom button").nth(0).click(); pg.wait_for_timeout(150)
        ck("ซูมสามครั้ง กล่องคำอธิบายไม่ถูกสร้างใหม่", pg.evaluate("() => window.__n"), 0)

        print("\n── ⑥ ภาพ PNG ที่บันทึก: มีแถบคำอธิบายใต้แผนที่ และแผนที่เดิมไม่ถูกแตะ ──")
        load(True)
        for idx, hexs in ((0, "#aa2233"), (1, "#11aa44"), (2, "#7722cc")):
            set_color(pg, idx, hexs)
        cw, ch = pg.evaluate("() => { const c = document.querySelector('.mc-canvas-wrap canvas'); return [c.width, c.height]; }")

        def save_png():
            with pg.expect_download(timeout=30000) as d:
                fkui.act(pg, "บันทึกภาพ")
            path = TMP / d.value.suggested_filename
            d.value.save_as(str(path))
            img = Image.open(path).convert("RGB")
            # ผู้ใช้จริงต้องกด "กลับไปแก้" ก่อนสั่งงานรอบใหม่ (ดาวน์โหลดพาไปหน้าผลลัพธ์) เทสทำแบบเดียวกัน
            fkui.back_to_work(pg)
            return img

        def set_png_legend(v):
            pg.evaluate("""(v) => { const lab = [...document.querySelectorAll('label.field')].find(l => l.textContent.includes('คำอธิบายสัญลักษณ์ในภาพที่บันทึก'));
                [...lab.querySelectorAll('input[type=radio]')].find(i => i.value === v).click(); }""", v)
            pg.wait_for_timeout(400)

        set_png_legend("off")
        off = save_png()
        ck("ปิดสวิตช์: ภาพมีขนาดเท่าแผนที่บนจอเป๊ะ (พฤติกรรมเดิม)", off.size, (cw, ch))
        set_png_legend("on")
        on = save_png()
        ck("เปิดสวิตช์: กว้างเท่าเดิม สูงขึ้นเป็นแถบคำอธิบาย", (on.width == cw, on.height > ch), (True, True))
        ck("แผนที่ด้านบนเหมือนกันทุกพิกเซลกับตอนปิดสวิตช์", list(on.crop((0, 0, cw, ch)).getdata()) == list(off.getdata()), True)
        band = on.crop((0, ch, cw, on.height))

        def near(img, hexs, tol=8):
            h = hexs.lstrip("#"); t = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
            return sum(1 for px in img.getdata() if all(abs(px[k] - t[k]) <= tol for k in range(3)))

        ck("แถบมีสีจุดศูนย์กลาง จุดเดิม จุดใหม่ ตรงกับสีที่เลือก", [near(band, h) > 15 for h in ("#aa2233", "#11aa44", "#7722cc")], [True, True, True])
        ck("ในแถบมีข้อความ (พิกเซลสีตัวอักษรที่ไม่ใช่สีพื้น)", len({px for px in band.getdata()}) > 12, True)
        ck("แผนที่ด้านบนไม่มีสีจุดใหม่ในแถบ = สีในแถบไม่ได้รั่วขึ้นไป", near(on.crop((0, 0, cw, 4)), "#7722cc") == 0, True)
        pg.evaluate("""() => { const lab = [...document.querySelectorAll('label.field')].find(l => l.textContent.includes('จุดใหม่'));
            [...lab.querySelectorAll('input[type=radio]')].find(i => i.value === 'off').click(); }""")
        pg.wait_for_timeout(500)
        band2 = save_png().crop((0, ch, cw, on.height))
        ck("ปิดจุดใหม่บนจอ: สีจุดใหม่ต้องหายจากแถบในภาพด้วย", near(band2, "#7722cc") == 0, True)

        print("\n── ⑦ ธีมมืด: วงรัศมีสีเข้มต้องมองเห็น (ขอบสว่างใต้วง) และธีมสว่างต้องไม่เปลี่ยน ──")
        load(True)
        set_color(pg, 0, "#1a1a55")                      # น้ำเงินกรมท่า มองไม่เห็นบนพื้นมืด
        set_theme(pg, "light"); set_color(pg, 0, "#1a1a55")
        light_n = halo_pixels(pg)
        ck("ธีมสว่าง: กล่องคำอธิบายวงรัศมีไม่มีขอบสว่าง", pg.evaluate("() => !!document.querySelector('.mc-legend .ring.halo')"), False)
        set_theme(pg, "dark"); set_color(pg, 0, "#1a1a55")
        dark_n = halo_pixels(pg)
        print(f"     วัดจริง: พิกเซลขอบสว่าง ธีมสว่าง={light_n} ธีมมืด={dark_n}")
        ck("ธีมมืด สีวงเข้ม: มีขอบสว่างบนแผนที่ (พิกเซลเทาขาวสว่างเกิน 300)", dark_n > 300, True)
        ck("ธีมมืด สีวงเข้ม: กล่องคำอธิบายวงรัศมีมีขอบสว่างตามไปด้วย", pg.evaluate("() => !!document.querySelector('.mc-legend .ring.halo')"), True)
        set_color(pg, 0, "#ffd400")                      # เหลืองสด เห็นชัดอยู่แล้ว ต้องไม่ถูกใส่ขอบ
        print(f"     วัดจริง: สีวงสว่างในธีมมืด={halo_pixels(pg)}")
        ck("ธีมมืด สีวงสว่างอยู่แล้ว: ไม่ใส่ขอบ (ไม่เปลี่ยนสีที่ผู้ใช้เลือก)", pg.evaluate("() => !!document.querySelector('.mc-legend .ring.halo')"), False)
        ck("ขอบสว่างหายไปด้วยเมื่อสีวงสว่าง (เทียบกับกรณีสีเข้ม)", halo_pixels(pg) < dark_n // 3, True)
        set_color(pg, 0, "#1a1a55")
        def dark_band_grey(name):
            """จำนวนพิกเซลเทากลางในแถบใต้ภาพธีมมืด (ตัวอักษรขอบเบลอก็นับ จึงต้องเทียบสองกรณีที่ข้อความเหมือนกัน)"""
            with pg.expect_download(timeout=30000) as d:
                fkui.act(pg, "บันทึกภาพ")
            path = TMP / name; d.value.save_as(str(path)); fkui.back_to_work(pg)
            im = Image.open(path).convert("RGB")
            bd = im.crop((0, ch, im.width, im.height))
            return sum(1 for px in bd.getdata() if 110 < px[0] < 215 and max(px) - min(px) < 22)

        grey_halo = dark_band_grey("dark_halo.png")
        set_color(pg, 0, "#ffd400")
        grey_plain = dark_band_grey("dark_plain.png")
        print(f"     วัดจริง: พิกเซลเทากลางในแถบภาพมืด ขอบสว่าง={grey_halo} ไม่มีขอบ={grey_plain}")
        ck("ภาพ PNG ธีมมืด: ตัวอย่างวงรัศมีสีเข้มมีขอบสว่างเพิ่มในแถบ (เทียบกับสีวงสว่างที่ข้อความเท่ากัน)", grey_halo - grey_plain > 40, True)
        set_color(pg, 0, "#1a1a55")
        set_theme(pg, "light"); set_color(pg, 0, "#1a1a55")
        ck("กลับธีมสว่าง: ภาพแผนที่กลับเป็นแบบเดิมเป๊ะ (จำนวนพิกเซลเทาขาวเท่าตอนแรก)", halo_pixels(pg), light_n)
        set_theme(pg, "dark"); set_theme(pg, "light")

        print("\n── ⑤ ภาษาอังกฤษ ──")
        pg.locator('#lang .langopt[data-lang="en"]').click(); pg.wait_for_timeout(1200)
        load(True)
        texts = pg.evaluate("() => [...document.querySelectorAll('.mc-legend [data-role]')].map(e => e.textContent)")
        ck("ข้อความคำอธิบายเป็นอังกฤษล้วน ไม่มีไทยตกค้าง", [t for t in texts if any('\u0e00' <= ch <= '\u0e7f' for ch in t)], [])
        ck("มีข้อความรัศมีภาษาอังกฤษ", "3.0 km radius" in texts, True)
        pg.locator('#lang .langopt[data-lang="th"]').click(); pg.wait_for_timeout(800)
        b.close()

    ck("ไม่มี error ใน console", errs, [])
    print(f"\n{'✅' if not F else '❌'} ผ่าน {P} ข้อ {'' if not F else f'ตก {len(F)} ข้อ'}")
    if F:
        print("\n" + "\n".join(F) + "\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
