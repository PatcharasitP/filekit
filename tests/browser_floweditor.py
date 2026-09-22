# FlowKit ห้องแก้ไข (แผนเฟส 3): กดลากแก้ต่อ แก้ในห้อง บันทึกแล้วผังที่ได้คือผังที่แก้จริงไหม
#
# ‼️ ถามของที่ผู้ใช้ได้จริงทุกข้อ: แกะ XML ที่ฝังใน PNG ของพรีวิวกับไฟล์ที่ดาวน์โหลด แล้วนับกล่อง
#    แก้ในห้องด้วยคีย์บอร์ดจริง (เลือกทั้งหมดแล้วลบ) กดปุ่ม "บันทึก และ ออก" ของ draw.io จริง
# ‼️ ข้อที่พลาดแล้วงานผู้ใช้หาย: พิมพ์ข้อความต่อหลังแก้ด้วยมือต้องไม่วาดทับเอง , โหลดหน้าใหม่ต้องได้ผังที่แก้กลับมา ,
#    กด "ออก" (ไม่บันทึก) ผังเดิมต้องไม่เปลี่ยน
# ‼️ ต้องต่อเน็ตได้ (ห้องแก้ไขโหลด draw.io จาก embed.diagrams.net)
#
# --selftest ตัวตรวจต้องเห็นว่าผังที่แก้ต่างจากผังเดิม และเห็นว่าผังถูกวาดทับ

import sys, os, hashlib, pathlib, tempfile, shutil, traceback, base64
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from browser_flowkit import drawio_xml, cells, preview_png, set_text, state   # ตัวอ่านไฟล์ผลตัวเดียวกัน

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899").rstrip("/")
URL = BASE + "/flow/"
SELFTEST = "--selftest" in sys.argv
SAMPLE = sorted(["ลูกค้าแจ้งเรื่อง", "Call Center รับเรื่อง", "แก้ได้เองไหม?", "ปิดงาน", "ส่งช่างหน้างาน", "ช่างปิดงาน"])

P, F = 0, []


def ck(name, ok, detail=""):
    global P
    if ok: P += 1
    else: F.append(name + (f"\n      {detail}" if detail else ""))
    print(f"  {'✅' if ok else '❌'} {name}" + ("" if ok or not detail else f"\n      {detail}"))
    return ok


def boxes(pg):
    return sorted(t for t, _ in cells(drawio_xml(preview_png(pg)) or ""))


def ready(pg, ms=60000):
    pg.wait_for_function("() => document.querySelector('#canvas').dataset.state === 'ready' && !document.querySelector('#live').hasAttribute('data-busy')", timeout=ms)


def editor_frame(pg):
    for f in pg.frames:
        if "embed.diagrams.net" in f.url and f.evaluate("() => !!document.querySelector('.geMenubar')"):
            return f
    return None


def open_room(pg):
    pg.click("#edit")
    pg.wait_for_function("() => document.querySelector('#room').dataset.state === 'ready'", timeout=60000)
    pg.wait_for_timeout(500)


def wipe_in_room(pg):
    """แก้แบบผู้ใช้: คลิกผืนผัง เลือกทั้งหมด แล้วลบ"""
    box = pg.locator("#room iframe").bounding_box()
    pg.mouse.click(box["x"] + box["width"] * 0.55, box["y"] + box["height"] * 0.6)
    pg.keyboard.press("Control+a"); pg.keyboard.press("Delete")
    pg.wait_for_timeout(1200)


def press_room_button(pg, th_text, discard=False):
    """กดปุ่มของ draw.io ในห้อง ‼️ กด "ออก" หลังแก้แล้ว draw.io ถามก่อนทิ้ง (เห็นจากภาพจริง shots/room-exit-click.png)
    discard=True = ตอบ "ละทิ้งการเปลี่ยนแปลง" เหมือนผู้ใช้ คืนค่าว่าถามจริงไหม"""
    f = editor_frame(pg)
    f.get_by_text(th_text, exact=True).first.click()
    asked = False
    if discard:
        btn = f.get_by_text("ละทิ้งการเปลี่ยนแปลง", exact=True)
        try:
            btn.first.wait_for(state="visible", timeout=5000); asked = True; btn.first.click()
        except Exception:
            asked = False
    pg.wait_for_function("() => document.querySelector('#room').hidden", timeout=20000)
    pg.wait_for_timeout(600)
    return asked


def main():
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="fk_floweditor_"))
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
            pg = ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(URL); ready(pg)

            if SELFTEST:
                print("\n━━ selftest ━━")
                before = boxes(pg)
                ck("ตัวตรวจอ่านผังตัวอย่างได้ 6 กล่อง (ประชากรไม่เป็นศูนย์)", before == SAMPLE, str(before))
                open_room(pg); wipe_in_room(pg); press_room_button(pg, "บันทึก และ ออก")
                ck("ตัวตรวจเห็นว่าผังหลังแก้ต่างจากผังเดิม", boxes(pg) != before)
                pg.click("#cvnote button")
                pg.wait_for_timeout(2500)
                ck("ตัวตรวจเห็นว่าผังถูกวาดทับกลับเป็นผังจากข้อความ", boxes(pg) == SAMPLE)
                b.close()
                return finish()

            print("\n━━ ก. เปิดห้องแก้ไขจากผังที่วาดอยู่ ━━")
            ck("ผังตัวอย่างขึ้นแล้ว ปุ่มลากแก้ต่อกดได้", boxes(pg) == SAMPLE and pg.is_enabled("#edit"))
            open_room(pg)
            f = editor_frame(pg)
            ck("กดลากแก้ต่อ ห้องแก้ไขเปิดเต็มจอ เมนูเป็นภาษาไทย", f is not None and f.get_by_text("บันทึก และ ออก", exact=True).count() > 0)
            ck("ห้องแก้ไขได้ผังเดียวกับพรีวิว (ข้อความไทยครบในห้อง)",
               f is not None and f.evaluate("() => document.body.innerText.includes('ลูกค้าแจ้งเรื่อง') && document.body.innerText.includes('ช่างปิดงาน')"))
            ck("หน้าเบื้องหลังเลื่อนไม่ได้ระหว่างอยู่ในห้อง", pg.evaluate("() => getComputedStyle(document.body).overflow") == "hidden")

            print("\n━━ ข. ออกโดยไม่บันทึก ━━")
            wipe_in_room(pg)
            asked = press_room_button(pg, "ออก", discard=True)
            ck("กดออกหลังแก้ draw.io ถามก่อนทิ้งงาน", asked)
            ck("กดออก ผังเดิมไม่เปลี่ยน ไม่มีป้ายแก้ด้วยมือ", boxes(pg) == SAMPLE and pg.evaluate("() => document.querySelector('#cvnote').hidden"))
            ck("กดออกแล้ว ไม่มีผังที่แก้ค้างไว้ในเครื่อง", pg.evaluate("() => sessionStorage.getItem('fk-flow-edit')") is None)
            ck("ออกจากห้องแล้วโฟกัสกลับมาที่ปุ่มลากแก้ต่อ", pg.evaluate("() => document.activeElement && document.activeElement.id") == "edit")

            print("\n━━ ค. แก้แล้วบันทึก ━━")
            open_room(pg); wipe_in_room(pg)
            ck("ระหว่างแก้ ผังถูกเก็บไว้กันงานหาย", (pg.evaluate("() => (sessionStorage.getItem('fk-flow-edit') || '').length") or 0) > 100)
            press_room_button(pg, "บันทึก และ ออก")
            ck("บันทึกแล้ว พรีวิวเป็นผังที่แก้ (ลบทุกกล่องแล้ว เหลือ 0)", boxes(pg) == [], str(boxes(pg)))
            ck("มีป้ายบอกว่าผังนี้แก้ด้วยมือ พร้อมปุ่มวาดใหม่จากข้อความ",
               not pg.evaluate("() => document.querySelector('#cvnote').hidden") and pg.locator("#cvnote button").count() == 1)
            with pg.expect_download() as d:
                pg.click("#dl")
            p = tmp / "edited.png"; d.value.save_as(str(p))
            ck("ดาวน์โหลดได้ผังที่แก้ ตรงกับภาพบนจอทุกไบต์", hashlib.sha256(p.read_bytes()).digest() == hashlib.sha256(preview_png(pg)).digest())

            print("\n━━ ง. ข้อความกับผังแยกทางกัน ━━")
            set_text(pg, "ข้อความใหม่หลังแก้\nอีกขั้นหนึ่ง")
            pg.wait_for_timeout(2500)
            ck("‼️ พิมพ์ต่อหลังแก้ด้วยมือ ผังที่แก้ไม่ถูกวาดทับเอง", boxes(pg) == [], str(boxes(pg)))
            ck("ป้ายบอกว่าข้อความเปลี่ยนแล้ว แต่ผังยังเป็นแบบที่แก้", "ข้อความเปลี่ยนแล้ว" in pg.inner_text("#cvnote"), pg.inner_text("#cvnote"))
            pg.reload(); pg.wait_for_timeout(500)
            try:
                ready(pg, 60000); restored = boxes(pg)
            except Exception:
                restored = None
            ck("‼️ โหลดหน้าใหม่ ได้ผังที่แก้กลับมา ไม่ใช่ผังจากข้อความ", restored == [], str(restored))
            ck("โหลดหน้าใหม่ ข้อความที่พิมพ์ยังอยู่ และป้ายยังบอกสถานะถูก", pg.input_value("#src").startswith("ข้อความใหม่หลังแก้") and "ข้อความเปลี่ยนแล้ว" in pg.inner_text("#cvnote"))
            pg.click("#cvnote button")
            got = None
            for _ in range(60):
                pg.wait_for_timeout(500)
                if state(pg) == "ready" and boxes(pg) == sorted(["ข้อความใหม่หลังแก้", "อีกขั้นหนึ่ง"]): got = True; break
            ck("กดวาดใหม่จากข้อความ ได้ผังจากข้อความปัจจุบัน ป้ายหาย ผังที่แก้ถูกล้าง", bool(got) and pg.evaluate("() => document.querySelector('#cvnote').hidden")
               and pg.evaluate("() => sessionStorage.getItem('fk-flow-edit')") is None)

            print("\n━━ จ. เปิดไฟล์ผังเดิม ━━")
            pg.set_input_files("#filein", str(p))
            try:
                pg.wait_for_function("() => document.querySelector('#room').dataset.state === 'ready'", timeout=60000); opened = True
            except Exception:
                opened = False
            ck("เลือกไฟล์ .drawio.png ที่เคยดาวน์โหลด ห้องแก้ไขเปิดพร้อมผังในไฟล์", opened)
            if opened:
                press_room_button(pg, "บันทึก และ ออก")
                ck("บันทึกจากไฟล์ที่เปิด พรีวิวเป็นผังในไฟล์ (0 กล่อง) พร้อมป้ายแก้ด้วยมือ",
                   boxes(pg) == [] and pg.evaluate("() => document.querySelector('#cvnote').hidden") is False)
            plain = tmp / "plain.png"
            plain.write_bytes(base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="))
            pg.set_input_files("#filein", str(plain)); pg.wait_for_timeout(800)
            ck("ภาพ PNG ธรรมดา บอกว่าไม่มีผังฝังอยู่ ไม่เปิดห้องเปล่า", "ไม่มีผัง draw.io" in pg.inner_text("#msg") and pg.evaluate("() => document.querySelector('#room').hidden"),
               pg.inner_text("#msg"))
            drop_ok = pg.evaluate("""async (b64) => {
                const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
                const dt = new DataTransfer(); dt.items.add(new File([u], 'ลากมา.drawio.png', { type: 'image/png' }));
                const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
                document.querySelector('#canvas').dispatchEvent(ev); return ev.defaultPrevented; }""", base64.b64encode(p.read_bytes()).decode())
            try:
                pg.wait_for_function("() => document.querySelector('#room').dataset.state === 'ready' && !document.querySelector('#room').hidden", timeout=60000); dropped = True
            except Exception:
                dropped = False
            ck("ลากไฟล์ .drawio.png มาวางบนหน้า ห้องแก้ไขเปิดเอง", drop_ok and dropped)
            if dropped: press_room_button(pg, "ออก", discard=True)
            ck("ไม่มี error บนหน้า", not errs, str(errs[:3]))
            b.close()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return finish()


def finish():
    print("\n" + "━" * 62)
    print(f"ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    if F:
        print("\nข้อที่ไม่ผ่าน:")
        for i, x in enumerate(F, 1): print(f"  {i}. {x}")
        return 1
    print("✅ ตัวตรวจเห็นผังที่แก้และผังที่ถูกวาดทับ" if SELFTEST else "✅ ห้องแก้ไขใช้ได้จริง งานที่แก้ไม่หาย ไม่ถูกวาดทับเอง")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
