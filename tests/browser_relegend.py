# คำอธิบายสัญลักษณ์ของ "แผนที่การย้ายที่ตั้ง" (map-relocate) ต้องตรงกับที่วาดจริง และต้องติดไปกับภาพ PNG ที่บันทึก
#
# ‼️ ที่มา 30/09/2026: ทำคำอธิบายสัญลักษณ์ใต้ภาพให้ map-coverage แล้ว (browser_covlegend) map-relocate มีกล่องบนจอ
#    แต่ภาพ PNG ไม่มีอะไรบอกเลยว่าสีส้ม สีน้ำเงิน และเส้นแปลว่าอะไร คนที่ได้ภาพไปทางแชทจึงอ่านไม่ออก
# ‼️ ตัวตรวจไม่เชื่อ DOM อย่างเดียว: สีในแถบใต้ภาพต้องเทียบกับพิกเซลจริงของไฟล์ที่ดาวน์โหลด
# ถ้าผิดจะรู้ได้ยังไง: ข้อ ③ เปลี่ยนสีจุดแล้วแถบในภาพต้องเปลี่ยนตาม ถ้าแถบวาดจากสีค่าเริ่มต้นตายตัว เทสแดง
#
# รัน: tests/run.sh browser_relegend
import os
import pathlib
import sys
import tempfile

import openpyxl
from PIL import Image
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import fkui  # noqa: E402

TMP = pathlib.Path(tempfile.mkdtemp(prefix="filekit_relegend_"))
P, F = 0, []


def ck(name, got, want):
    global P
    ok = got == want
    if ok:
        P += 1
    else:
        F.append(f"{name}\n      ได้    : {got!r}\n      ควรได้ : {want!r}")
    print(f"  {'✅' if ok else '❌'} {name}")


def make_file():
    """5 คู่ย้ายไกลราว 80 กม. กระจายทั่วประเทศ ที่ซูมพอดีข้อมูลจุดสองจุดของทุกคู่ห่างกันพอ ไม่ถูกยุบเป็นจุดครึ่งสี
    ‼️ รอบแรกใช้ 6 กม. แล้วรายการจุดครึ่งสีขึ้นมา ใช้สีเดียวกับจุดเดิมกับจุดใหม่ บังการวาดสีตายตัวจนเทสไม่แดง (พิสูจน์ 30/09/2026)"""
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "R"
    ws.append(["SITE_CODE_OLD", "LAT_OLD", "LON_OLD", "SITE_CODE_NEW", "LAT_NEW", "LON_NEW", "PROVINCE"])
    for i, (la, lo) in enumerate([(13.5, 100.5), (18.6, 98.8), (8.0, 98.4), (16.6, 102.9), (14.8, 102.3)]):
        ws.append([f"O{i}", la, lo, f"N{i}", la + 0.6, lo + 0.5, "ทดสอบ"])
    p = TMP / "moves.xlsx"; wb.save(p)
    return p


def roles(pg):
    return pg.evaluate("() => [...document.querySelectorAll('.mr-legend [data-role]')].map(e => e.dataset.role)")


def swatch(pg, role):
    return pg.evaluate("""(r) => { const i = document.querySelector(`.mr-legend [data-role=${r}] i`);
        return i ? getComputedStyle(i).backgroundColor : null; }""", role)


def rgb(hexs):
    h = hexs.lstrip("#")
    return "rgb(%d, %d, %d)" % tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def set_color(pg, idx, hexs):
    """ช่องเลือกสีลำดับที่ idx (0 จุดเดิม 1 จุดใหม่)"""
    pg.evaluate("""([i, v]) => { const el = document.querySelectorAll('input.mr-color')[i];
        el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }""", [idx, hexs])
    pg.wait_for_timeout(400)


def pick(pg, text_in_option, value):
    pg.evaluate("""([t, v]) => { const s = [...document.querySelectorAll('.ws-right select, .s2-side-bd select')]
        .find(x => [...x.options].some(o => o.textContent.includes(t)));
        s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }""", [text_in_option, value])
    pg.wait_for_timeout(600)


def set_switch(pg, label, on):
    pg.evaluate("""([t, on]) => { const l = [...document.querySelectorAll('.mr-switch-field')].find(x => x.textContent.includes(t));
        const i = l.querySelector('input[type=checkbox]'); if (i.checked !== on) i.click(); }""", [label, on])
    pg.wait_for_timeout(600)


def set_png_legend(pg, v):
    pg.evaluate("""(v) => { const lab = [...document.querySelectorAll('label.field')].find(l => l.textContent.includes('คำอธิบายสัญลักษณ์ใต้ภาพ'));
        [...lab.querySelectorAll('input[type=radio]')].find(i => i.value === v).click(); }""", v)
    pg.wait_for_timeout(400)


def near(img, hexs, tol=8):
    h = hexs.lstrip("#"); t = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    return sum(1 for px in img.getdata() if all(abs(px[k] - t[k]) <= tol for k in range(3)))


def main():
    base = os.environ.get("FK_BASE") or "http://127.0.0.1:8899"
    errs = []
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 1360, "height": 1000}, timezone_id="Asia/Bangkok", accept_downloads=True)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        fkui.open_tool(pg, "map-relocate", base)
        pg.locator(".dz input[type=file]").first.set_input_files(str(make_file())); pg.wait_for_timeout(2200)
        pick(pg, "ซูมพอดี", "data")

        def canvas_size():
            return pg.evaluate("() => { const c = document.querySelector('.mr-canvas'); return [c.width, c.height]; }")

        def save_png():
            with pg.expect_download(timeout=30000) as d:
                fkui.act(pg, "บันทึกภาพ")
            path = TMP / d.value.suggested_filename
            d.value.save_as(str(path))
            img = Image.open(path).convert("RGB")
            fkui.back_to_work(pg)      # ดาวน์โหลดพาหน้าไปจอผลลัพธ์ ผู้ใช้จริงต้องกลับมาก่อนสั่งรอบใหม่
            return img

        print("\n── ① กล่องคำอธิบายบนจอ ตรงกับสีที่ตั้ง ──")
        set_color(pg, 0, "#11aa44"); set_color(pg, 1, "#7722cc")
        ck("รายการเริ่มต้น จุดเดิม จุดใหม่ เส้น (ไม่มีจุดครึ่งสี เพราะทุกคู่ห่างกันพอ)", roles(pg), ["old", "new", "line"])
        ck("สีจุดเดิมในกล่อง = สีที่เลือก", swatch(pg, "old"), rgb("#11aa44"))
        ck("สีจุดใหม่ในกล่อง = สีที่เลือก", swatch(pg, "new"), rgb("#7722cc"))

        print("\n── ② ภาพ PNG: ปิดสวิตช์ = ขนาดเดิมเป๊ะ เปิด = มีแถบใต้แผนที่ ──")
        cw, ch = canvas_size()
        set_png_legend(pg, "off")
        off = save_png()
        ck("ปิดสวิตช์: ภาพเท่าแผนที่บนจอ (พฤติกรรมเดิม)", off.size, (cw, ch))
        set_png_legend(pg, "on")
        on = save_png()
        ck("เปิดสวิตช์: กว้างเท่าเดิม สูงขึ้น", (on.width == cw, on.height > ch), (True, True))
        ck("แผนที่ด้านบนเหมือนกันทุกพิกเซลกับตอนปิด",
           list(on.crop((0, 0, cw, ch)).getdata()) == list(off.getdata()), True)
        band = on.crop((0, ch, cw, on.height))
        ck("แถบมีสีจุดเดิมและจุดใหม่ตรงกับที่เลือก", [near(band, "#11aa44") > 15, near(band, "#7722cc") > 15], [True, True])
        ck("ในแถบมีข้อความ (สีมากกว่าพื้นกับสองสีจุด)", len({px for px in band.getdata()}) > 6, True)
        ck("แผนที่ด้านบนไม่มีสีจุดใหม่รั่วเข้าแถบเกินจริง (แถบไม่ใช่ภาพแผนที่ซ้ำ)", on.height - ch < ch // 3, True)

        print("\n── ③ เปลี่ยนสี แถบในภาพต้องเปลี่ยนตาม (ไม่ใช่สีค่าเริ่มต้นตายตัว) ──")
        set_color(pg, 0, "#cc5500")
        band3 = save_png()
        band3 = band3.crop((0, ch, cw, band3.height))
        ck("สีใหม่อยู่ในแถบ สีเก่าหายไป", [near(band3, "#cc5500") > 15, near(band3, "#11aa44")], [True, 0])

        print("\n── ④ วงรัศมี ──")
        n_before = len(roles(pg))
        set_switch(pg, "วาดวงรัศมีรอบจุด", True)
        # ซูมพอดีข้อมูลทำให้รัศมี 3 กม. ใหญ่พอเห็น (ถ้าเล็กเกินจะเป็นบันทึกเตือนแทน)
        r4 = roles(pg)
        ck("เปิดวงรัศมี: มีรายการเพิ่มหนึ่งข้อ (วงหรือบันทึกเตือน)", len(r4), n_before + 1)
        ck("รายการที่เพิ่มคือวงรัศมีหรือบันทึกเตือนอย่างใดอย่างหนึ่ง", ("ring" in r4) != ("note" in r4), True)

        print("\n── ⑤ ข้อความยาว ห่อบรรทัดในภาพ ไม่ล้นขอบ ──")
        pick(pg, "ซูมพอดี", "country")          # ทั้งประเทศ รัศมี 3 กม. เล็กเกินเห็น = บันทึกเตือนยาว
        ck("ซูมทั้งประเทศ: มีบันทึกเตือนรัศมีเล็กเกินไป", "note" in roles(pg), True)
        cw5, ch5 = canvas_size()
        img5 = save_png()
        ck("แถบสูงขึ้นจากการห่อบรรทัด (ยาวกว่าหนึ่งแถว)", img5.height - ch5 > 60, True)
        edge = img5.crop((cw5 - 8, ch5 + 4, cw5, img5.height))
        bgpx = img5.getpixel((cw5 - 1, img5.height - 1))
        ck("ขอบขวา 8 พิกเซลของแถบเป็นสีพื้นล้วน (ข้อความไม่ล้นขอบ)", set(edge.getdata()) <= {bgpx}, True)

        print("\n── ⑥ ธีมมืด: พื้นแถบเป็นสีของธีม ไม่ใช่ขาวตายตัว ──")
        pick(pg, "ซูมพอดี", "data")
        pg.evaluate("() => document.documentElement.setAttribute('data-theme', 'dark')")
        pg.wait_for_timeout(500)
        card = pg.evaluate("() => getComputedStyle(document.body).getPropertyValue('--card').trim()")
        dk = save_png()
        cwd, chd = canvas_size()
        px = dk.getpixel((2, dk.height - 2))
        ck("พื้นแถบในธีมมืดไม่ใช่ขาว", sum(px) < 300, True)
        pg.evaluate("() => document.documentElement.setAttribute('data-theme', 'light')")

        print("\n── ⑦ ภาษาอังกฤษ ──")
        pg.locator('#lang .langopt[data-lang="en"]').click(); pg.wait_for_timeout(1200)
        fkui.open_tool(pg, "map-relocate", base)
        pg.locator(".dz input[type=file]").first.set_input_files(str(TMP / "moves.xlsx")); pg.wait_for_timeout(2200)
        texts = pg.evaluate("() => [...document.querySelectorAll('.mr-legend [data-role]')].map(e => e.textContent)")
        ck("คำอธิบายเป็นอังกฤษล้วน ไม่มีไทยตกค้าง",
           [t for t in texts if any('฀' <= c <= '๿' for c in t)], [])
        ck("มีข้อความ Old site", "Old site" in texts, True)
        pg.locator('#lang .langopt[data-lang="th"]').click(); pg.wait_for_timeout(800)
        b.close()

    ck("ไม่มี error ใน console", errs, [])
    print(f"\n{'✅' if not F else '❌'} ผ่าน {P} ข้อ {'' if not F else f'ตก {len(F)} ข้อ'}")
    if F:
        print("\n" + "\n".join(F) + "\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
