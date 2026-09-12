"""เครื่องมือสร้างธีม Power BI (theme.json)

‼️ ที่มา พี่ปอนด์ส่ง https://datatraining.io/powerbi-theme-starter มาให้ดู
   พร้อมคลิปสอนทำธีม แล้วสั่งให้เพิ่มเครื่องมือทำ Custom Theme JSON ในหมวด Power BI

เทสนี้ตรวจ 10 อย่าง
   ① เปิดหน้าได้ ไม่มี error หลุด (‼️ ดักบั๊ก TDZ ที่ทำให้แท็บไฟล์ธีมว่างเปล่า เจอจริง 12/09)
   ② ปุ่มลงมือทำกดได้ตั้งแต่วินาทีแรก (‼️ เครื่องนี้ไม่ต้องมีไฟล์ก่อน ห้ามมีอะไรมาปิดปุ่ม)
   ③ แท็บไฟล์ธีมได้ JSON ที่ parse ได้จริง ไม่ใช่กล่องว่าง
   ④ เปลี่ยนชุดสีแล้วทั้งพรีวิวและไฟล์ธีมเปลี่ยนตามจริง
   ⑤ ‼️ คำเตือนคอนทราสต์เป็นของจริง ใส่สีที่อ่านไม่ออกแล้วต้องขึ้นเตือน ไม่ใช่ป้ายประดับ
   ⑥ ‼️ คำเตือนตาบอดสีเป็นของจริง ใส่สีที่กลืนกันแล้วต้องจับได้
   ⑦ เปลี่ยนขนาดผืนผ้าใบแล้วขนาดตัวอักษรในไฟล์เปลี่ยนตาม
   ⑧ เปิดไฟล์ธีมเดิมเข้ามาแล้วสีถูกอ่านเข้ามาจริง
   ⑨ แผงขวาไม่ล้นออกด้านข้าง (‼️ เคยตัดช่อง "สูง" หายครึ่งหนึ่งที่ 1600px)
   ⑩ จอมือถือ 390px ไม่มีแถบเลื่อนแนวนอน และโหมด EN ไม่มีภาษาไทยหลุด

รัน: python3 -m http.server 8899 &  แล้ว python3 tests/browser_theme.py
"""
import json, os, re, sys, tempfile
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
fails = []

def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label + (("  → " + str(detail)) if (detail and not ok) else ""))
    if not ok:
        fails.append(label + ((" | " + str(detail)) if detail else ""))

def theme_json(pg):
    """อ่าน JSON จากแท็บไฟล์ธีม"""
    pg.locator('.seg input[value="json"]').check()
    pg.wait_for_timeout(250)
    return json.loads(pg.locator(".th-code").inner_text())

def set_hex(pg, box_sel, idx, value):
    """พิมพ์ hex ลงช่องที่ idx ของกล่องที่ระบุ"""
    f = pg.locator(f"{box_sel} .ck-hex").nth(idx)
    f.fill(value)
    pg.wait_for_timeout(200)

with sync_playwright() as pw:
    br = pw.chromium.launch()

    # ── ① เปิดหน้า ────────────────────────────────────────────────────
    print("\n① เปิดหน้าเครื่องมือ")
    errs = []
    pg = br.new_page(viewport={"width": 1600, "height": 1000})
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERROR: " + str(e)))
    pg.goto(BASE + "/#/pbi-theme", wait_until="networkidle")
    pg.wait_for_selector(".th-prev .th-canvas", timeout=8000)
    ck("เปิดแล้วไม่มี error หลุดออกมาเลย", not errs, errs)
    ck("มีครบทั้งสามแผง", pg.locator(".ws-left").count() == 1 and pg.locator(".ws-right").count() == 1)

    # ── ② ปุ่มกดได้ตั้งแต่แรก ─────────────────────────────────────────
    print("\n② ปุ่มลงมือทำ")
    btns = pg.locator(".ws-footer button.btn")
    disabled = [btns.nth(i).inner_text() for i in range(btns.count()) if btns.nth(i).is_disabled()]
    ck("ปุ่มทุกปุ่มกดได้ทันทีโดยไม่ต้องมีไฟล์ก่อน", not disabled, disabled)

    # ── ③ ไฟล์ธีม ─────────────────────────────────────────────────────
    print("\n③ ไฟล์ธีมที่ออกมา")
    t = theme_json(pg)
    ck("แท็บไฟล์ธีมได้ JSON ที่อ่านกลับได้", isinstance(t, dict) and bool(t.get("name")))
    ck("มี $schema ชี้ 2.157", "2.157" in t.get("$schema", ""), t.get("$schema"))
    ck("มี dataColors 5 สี", len(t.get("dataColors", [])) == 5, t.get("dataColors"))
    ck("tableAccent ไม่ใช่สีแบรนด์ (TH1)", t["tableAccent"] not in t["dataColors"], t["tableAccent"])
    ck("textClasses ประกาศ 4 คลาส", len(t.get("textClasses", {})) == 4, list(t.get("textClasses", {})))

    # ── ④ เปลี่ยนชุดสี ────────────────────────────────────────────────
    print("\n④ เปลี่ยนชุดสี")
    pg.locator('.seg input[value="prev"]').check()
    pg.wait_for_timeout(200)
    bg_before = pg.locator(".th-canvas").get_attribute("style")
    pg.locator(".ws-left .th-sw", has_text="จอมืด").click()
    pg.wait_for_timeout(400)
    bg_after = pg.locator(".th-canvas").get_attribute("style")
    ck("กดชุดจอมืดแล้วพื้นพรีวิวเปลี่ยนจริง", bg_before != bg_after, f"{bg_before} -> {bg_after}")
    t2 = theme_json(pg)
    ck("ไฟล์ธีมเปลี่ยนตามชุดที่เลือก", t2["dataColors"] != t["dataColors"] and t2["background"].lower() == "#1a1d23",
       t2["background"])
    pg.locator(".ws-left .th-sw", has_text="ดินเผา").click()
    pg.wait_for_timeout(400)

    # ── ⑤ คำเตือนคอนทราสต์ต้องเป็นของจริง ─────────────────────────────
    print("\n⑤ คำเตือนคอนทราสต์")
    pg.locator('.seg input[value="check"]').check()
    pg.wait_for_timeout(300)
    ok_txt = " ".join(pg.locator(".th-warn").all_inner_texts())
    ck("ตอนเริ่มต้น ชุดของกลางผ่านคอนทราสต์ทุกคู่", "ผ่านเกณฑ์ทุกคู่" in ok_txt, ok_txt[:120])
    # ‼️ #FFFF00 บนพื้นขาวได้ราว 1.07:1 ต้องถูกจับได้แน่นอน
    set_hex(pg, ".ws-right", 5, "#FFFF00")   # ช่องที่ 5 = สีข้อมูลตัวแรก (0-4 คือสีพื้นฐาน)
    pg.wait_for_timeout(300)
    bad_txt = " ".join(pg.locator(".th-warn").all_inner_texts())
    rows = pg.locator(".th-tbl tbody tr").all_inner_texts()
    low = [r for r in rows if "ต่ำไป" in r]
    ck("ใส่เหลืองสดบนพื้นขาวแล้วขึ้นเตือนว่าคอนทราสต์ต่ำ", "ต่ำกว่าเกณฑ์" in bad_txt, bad_txt[:140])
    ck("ตารางชี้ได้ว่าแถวไหนตก", len(low) >= 1, rows)
    ck("ตัวเลขที่โชว์คือค่าที่วัดได้จริง ไม่ใช่ป้ายตายตัว",
       any(re.search(r"1\.0\d:1", r) for r in low), low)

    # ── ⑥ คำเตือนตาบอดสีต้องเป็นของจริง ───────────────────────────────
    print("\n⑥ คำเตือนตาบอดสี")
    set_hex(pg, ".ws-right", 5, "#DD7755")   # คืนค่าเดิม
    pg.wait_for_timeout(200)
    base_cvd = " ".join(pg.locator(".th-warn").all_inner_texts())
    ck("ชุดของกลางแยกออกครบ 5 สี", "แยกออกครบทั้ง 5" in base_cvd, base_cvd[:140])
    # ‼️ ทำให้สีที่ 5 เกือบเท่าสีที่ 4 ต้องถูกจับได้
    #    ช่องสีในแผงขวาเรียง พื้นหลัง ตัวอักษร ค่าดี ค่ากลาง ค่าแย่ (0-4) แล้วค่อยสีข้อมูล (5-9)
    #    จึงต้องเป็นช่อง 9 คือสีข้อมูลตัวที่ 5 ไม่ใช่ช่อง 8 ซึ่งคือตัวที่ 4 ที่เป็นคู่เทียบเอง
    set_hex(pg, ".ws-right", 9, "#3A5BC0")
    pg.wait_for_timeout(300)
    merged = " ".join(pg.locator(".th-warn").all_inner_texts())
    ck("ตั้งสองสีให้ใกล้กันแล้วถูกจับได้ว่าแยกไม่ครบ", "แยกออกแค่" in merged, merged[:160])
    ck("บอกชื่อภาวะเป็นภาษาที่อ่านรู้เรื่อง ไม่ใช่คีย์ดิบ", "ตาบอดสี" in merged, merged[:160])
    boxes = pg.locator(".th-cvdbox b").all_inner_texts()
    ck("มีกล่องเทียบครบ สายตาปกติกับอีกสามภาวะ", len(boxes) == 4, boxes)
    set_hex(pg, ".ws-right", 9, "#884466")
    pg.wait_for_timeout(200)

    # ── ⑦ ขนาดผืนผ้าใบ ────────────────────────────────────────────────
    print("\n⑦ ขนาดผืนผ้าใบกับขนาดตัวอักษร")
    small = theme_json(pg)["textClasses"]["callout"]["fontSize"]
    pg.locator(".ws-right .th-sw", has_text="2560 x 1440").click()
    pg.wait_for_timeout(300)
    big = theme_json(pg)["textClasses"]["callout"]["fontSize"]
    ck(f"ผืนใหญ่ขึ้นแล้วตัวอักษรโตขึ้นจริง ({small}pt เป็น {big}pt)", big > small)
    ck("โตแบบรากที่สองของพื้นที่ ไม่ใช่โตตามพื้นที่", big == 60, big)
    pg.locator(".ws-right .th-sw", has_text="1920 x 1080").click()
    pg.wait_for_timeout(300)

    # ── ⑧ เปิดไฟล์ธีมเดิม ─────────────────────────────────────────────
    print("\n⑧ เปิดไฟล์ธีมเดิมเข้ามาแก้")
    src = {"name": "ธีมทดสอบของบริษัทสมมติ", "dataColors": ["#123456", "#654321"],
           "background": "#EEEEEE", "foreground": "#111111",
           "visualStyles": {"*": {"*": {"background": [{"show": True}]}}}}
    fp = os.path.join(tempfile.gettempdir(), "fk_theme_probe.json")
    with open(fp, "w", encoding="utf-8") as f:
        json.dump(src, f, ensure_ascii=False)
    pg.locator(".ws-left input[type=file]").set_input_files(fp)
    pg.wait_for_timeout(600)
    t3 = theme_json(pg)
    ck("ชื่อธีมถูกอ่านเข้ามา", t3["name"] == src["name"], t3["name"])
    ck("สีข้อมูลถูกอ่านเข้ามาครบ", [c.lower() for c in t3["dataColors"]] == ["#123456", "#654321"], t3["dataColors"])
    ck("พื้นหลังถูกอ่านเข้ามา", t3["background"].lower() == "#eeeeee", t3["background"])
    ck("visualStyles ไม่ถูกกลืนเข้ามาเงียบ ๆ", "visualStyles" not in t3, list(t3)[:5])
    msg = pg.locator(".ws-footer .status").inner_text()
    ck("บอกผู้ใช้ตรง ๆ ว่า visualStyles เดิมไม่ถูกนำมาด้วย", "visualStyles" in msg, msg)
    os.remove(fp)

    # ── ⑨ แผงขวาต้องไม่ล้น ────────────────────────────────────────────
    print("\n⑨ แผงขวาไม่ล้นออกด้านข้าง")
    ov = pg.evaluate("""() => {
      const out = [];
      for (const el of document.querySelectorAll('.ws-right .ws-scroll, .ws-right .th-two, .ws-right .ck-wrap')) {
        if (el.scrollWidth - el.clientWidth > 1) out.push(el.className + ' ' + el.scrollWidth + '>' + el.clientWidth);
      }
      return out;
    }""")
    ck("ไม่มีกล่องไหนในแผงขวาที่เนื้อหากว้างเกินกรอบ", not ov, ov)

    # ── ⑩ มือถือกับภาษาอังกฤษ ─────────────────────────────────────────
    print("\n⑩ จอมือถือกับโหมดอังกฤษ")
    pg.set_viewport_size({"width": 390, "height": 780})
    pg.wait_for_timeout(500)
    sw = pg.evaluate("document.documentElement.scrollWidth")
    ck(f"ที่ 390px ไม่มีแถบเลื่อนแนวนอน (scrollWidth {sw})", sw <= 392, sw)
    pg.close()

    en = br.new_page(viewport={"width": 1400, "height": 900})
    en_errs = []
    en.on("pageerror", lambda e: en_errs.append(str(e)))
    en.goto(BASE + "/", wait_until="networkidle")
    en.locator('#lang .langopt[data-lang="en"]').click()
    en.wait_for_timeout(900)
    en.goto(BASE + "/#/pbi-theme", wait_until="networkidle")
    en.wait_for_selector(".th-prev .th-canvas", timeout=8000)
    en.locator('.seg input[value="check"]').check()
    en.wait_for_timeout(400)
    panel = en.locator(".panel").inner_text()
    thai = sorted(set(re.findall(r"[฀-๿]+", panel)))
    ck("โหมดอังกฤษไม่มีภาษาไทยหลุดในพื้นที่ทำงาน", not thai, thai[:8])
    ck("โหมดอังกฤษไม่มี error", not en_errs, en_errs)
    en.close()
    br.close()

print(f"\nผ่าน {0 if fails else 'ครบ'} · ตก {len(fails)}")
if fails:
    for f in fails:
        print("  ❌ " + f)
    sys.exit(1)
print("✅ ผ่านหมด")
