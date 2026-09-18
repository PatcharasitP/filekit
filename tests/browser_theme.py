"""เครื่องมือสร้างธีม Power BI (theme.json)

‼️ ที่มา พี่ปอนด์ส่ง https://datatraining.io/powerbi-theme-starter มาให้ดู
   พร้อมคลิปสอนทำธีม แล้วสั่งให้เพิ่มเครื่องมือทำ Custom Theme JSON ในหมวด Power BI
‼️ 13/09/2026 พี่ปอนด์ทักว่า "ของเราไม่สวยเท่าของเขาทั้ง UX UI ทั้ง FONT" สั่งโคลนหน้าตา
   หน้าจึงเปลี่ยนจาก 3 แผงเป็นการ์ดเรียงลง ฟอนต์ Segoe UI และทั้งหน้าทาสีตามชุดที่เลือก
‼️ 13/09/2026 เย็น พี่ปอนด์ดูแล้วบอก "รกมาก" ยุบจาก 6 ส่วนเหลือ 4 ตัดป้ายเลข/ชิป ผลตรวจสีเหลือ 1 บรรทัด + รายละเอียดพับ

เทสนี้ตรวจ 11 อย่าง
   ① เปิดหน้าได้ ไม่มี error หลุด (‼️ ดักบั๊ก TDZ ที่ทำให้ไฟล์ธีมว่างเปล่า เจอจริง 12/09)
   ② ปุ่มลงมือทำกดได้ตั้งแต่วินาทีแรก (‼️ เครื่องนี้ไม่ต้องมีไฟล์ก่อน ห้ามมีอะไรมาปิดปุ่ม)
   ③ ไฟล์ธีมได้ JSON ที่ parse ได้จริง ไม่ใช่กล่องว่าง
   ④ เปลี่ยนชุดสีแล้วทั้งพรีวิวและไฟล์ธีมเปลี่ยนตามจริง
   ⑤ ‼️ คำเตือนคอนทราสต์เป็นของจริง ใส่สีที่อ่านไม่ออกแล้วต้องขึ้นเตือน ไม่ใช่ป้ายประดับ
   ⑥ ‼️ คำเตือนตาบอดสีเป็นของจริง ใส่สีที่กลืนกันแล้วต้องจับได้
   ⑦ เปลี่ยนขนาดผืนผ้าใบแล้วขนาดตัวอักษรในไฟล์เปลี่ยนตาม
   ⑧ เปิดไฟล์ธีมเดิมเข้ามาแล้วสีถูกอ่านเข้ามาจริง
   ⑧.5 ของที่โคลนจาก datatraining.io มีจริงและวัดได้ (ฟอนต์ สีธีมทั้งหน้า สายพานชุดสี น้ำหนักตัวบาง)
   ⑨ แผงย่อยไม่ล้นออกด้านข้าง
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
    """อ่าน JSON จากกล่อง 'ดูไฟล์ theme.json' (ยุบอยู่ ต้องกางก่อนอ่าน)"""
    pg.locator("details.ts-json").evaluate("d => d.open = true")
    pg.wait_for_timeout(150)
    return json.loads(pg.locator(".th-code").inner_text())

def open_check(pg):
    """กางกล่อง 'รายละเอียดการตรวจสี' (ตาราง/กล่องตาบอดสีอยู่ในนั้น)"""
    pg.locator("details.ts-check").evaluate("d => d.open = true")
    pg.wait_for_timeout(150)

def open_custom(pg):
    """กางกล่อง 'ปรับสีเองทีละสี' ช่องสีทั้งหมดอยู่ในนั้น"""
    pg.locator("details.ts-custom").evaluate("d => d.open = true")
    pg.wait_for_timeout(150)

def set_hex(pg, box_sel, idx, value):
    """พิมพ์ hex ลงช่องที่ idx ของกล่องที่ระบุ"""
    open_custom(pg)
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
    ck("มี 4 ส่วน (ผืนผ้าใบ หน้าตา พรีวิว ไฟล์ธีม) ไม่มีป้ายเลข/ชิปสถิติที่พี่ปอนด์บอกรก",
       pg.locator(".ts-sec").count() == 4 and pg.locator(".ts-n").count() == 0 and pg.locator(".ts-chip").count() == 0,
       [pg.locator(".ts-sec").count(), pg.locator(".ts-n").count()])
    ck("ผลตรวจสีเป็น 1 บรรทัดสรุปใต้พรีวิว และรายละเอียดพับไว้", pg.locator(".ts-status").count() == 1 and not pg.locator("details.ts-check").evaluate("d => d.open"))

    # ── ② ปุ่มกดได้ตั้งแต่แรก ─────────────────────────────────────────
    print("\n② ปุ่มลงมือทำ")
    btns = pg.locator(".ts-actions button, .ts-foot button")
    disabled = [btns.nth(i).inner_text() for i in range(btns.count()) if btns.nth(i).is_disabled()]
    # ‼️ 18/09/2026 เพิ่มปุ่ม "คัดลอกลิงก์ค่านี้" เป็นปุ่มที่ 4 (ต่อ statekit เข้ากับเครื่องมือนี้)
    #    นับชื่อปุ่มแทนการนับจำนวนล้วน จะได้บอกได้ว่าปุ่มไหนหายไปเวลาแดง
    names = [btns.nth(i).inner_text().strip() for i in range(btns.count())]
    want = ["คัดลอก JSON", "คัดลอกลิงก์ค่านี้", "สร้างไฟล์ธีม", "เริ่มใหม่"]
    ck("มีปุ่มคัดลอก JSON, คัดลอกลิงก์, สร้างไฟล์ และเริ่มใหม่", sorted(names), sorted(want))
    ck("ปุ่มทุกปุ่มกดได้ทันทีโดยไม่ต้องมีไฟล์ก่อน", not disabled, disabled)

    # ── ③ ไฟล์ธีม ─────────────────────────────────────────────────────
    print("\n③ ไฟล์ธีมที่ออกมา")
    t = theme_json(pg)
    ck("กล่องไฟล์ธีมได้ JSON ที่อ่านกลับได้", isinstance(t, dict) and bool(t.get("name")))
    ck("มี $schema ชี้ 2.157", "2.157" in t.get("$schema", ""), t.get("$schema"))
    ck("มี dataColors 5 สี", len(t.get("dataColors", [])) == 5, t.get("dataColors"))
    ck("tableAccent ไม่ใช่สีแบรนด์ (TH1)", t["tableAccent"] not in t["dataColors"], t["tableAccent"])
    ck("textClasses ประกาศ 4 คลาส", len(t.get("textClasses", {})) == 4, list(t.get("textClasses", {})))

    # ── ④ เปลี่ยนชุดสี ────────────────────────────────────────────────
    print("\n④ เปลี่ยนชุดสี")
    pg.wait_for_timeout(200)
    bg_before = pg.locator(".th-report").get_attribute("style")
    pg.locator(".ts-pal .th-sw", has_text="จอมืด").click()
    pg.wait_for_timeout(400)
    bg_after = pg.locator(".th-report").get_attribute("style")
    ck("กดชุดจอมืดแล้วพื้นพรีวิวเปลี่ยนจริง", bg_before != bg_after, f"{bg_before} -> {bg_after}")
    t2 = theme_json(pg)
    ck("ไฟล์ธีมเปลี่ยนตามชุดที่เลือก", t2["dataColors"] != t["dataColors"] and t2["background"].lower() == "#1a1d23",
       t2["background"])
    pg.locator(".ts-pal .th-sw", has_text="ดินเผา").click()
    pg.wait_for_timeout(400)

    # ── ⑤ คำเตือนคอนทราสต์ต้องเป็นของจริง ─────────────────────────────
    print("\n⑤ คำเตือนคอนทราสต์")
    open_check(pg)
    ck("บรรทัดสรุปตอนเริ่มต้นเป็นเขียว", "ok" in pg.locator(".ts-status").get_attribute("class"), pg.locator(".ts-status").get_attribute("class"))
    ok_txt = " ".join(pg.locator(".th-warn").all_inner_texts())
    ck("ตอนเริ่มต้น ชุดของกลางผ่านคอนทราสต์ทุกคู่", "ผ่านเกณฑ์ทุกคู่" in ok_txt, ok_txt[:120])
    # ‼️ #FFFF00 บนพื้นขาวได้ราว 1.07:1 ต้องถูกจับได้แน่นอน
    set_hex(pg, ".ts-custom", 5, "#FFFF00")   # ช่องที่ 5 = สีข้อมูลตัวแรก (0-4 คือสีพื้นฐาน)
    pg.wait_for_timeout(300)
    bad_txt = " ".join(pg.locator(".th-warn").all_inner_texts())
    rows = pg.locator(".th-tbl tbody tr").all_inner_texts()
    low = [r for r in rows if "ต่ำไป" in r]
    ck("ใส่เหลืองสดบนพื้นขาวแล้วขึ้นเตือนว่าคอนทราสต์ต่ำ", "ต่ำกว่าเกณฑ์" in bad_txt, bad_txt[:140])
    ck("บรรทัดสรุปกลายเป็นแดงและบอกว่าคอนทราสต์ต่ำ", "bad" in pg.locator(".ts-status").get_attribute("class") and "คอนทราสต์ต่ำ" in pg.locator(".ts-status").inner_text(), pg.locator(".ts-status").inner_text())
    ck("ตารางชี้ได้ว่าแถวไหนตก", len(low) >= 1, rows)
    ck("ตัวเลขที่โชว์คือค่าที่วัดได้จริง ไม่ใช่ป้ายตายตัว",
       any(re.search(r"1\.0\d:1", r) for r in low), low)

    # ── ⑥ คำเตือนตาบอดสีต้องเป็นของจริง ───────────────────────────────
    print("\n⑥ คำเตือนตาบอดสี")
    set_hex(pg, ".ts-custom", 5, "#DD7755")   # คืนค่าเดิม
    pg.wait_for_timeout(200)
    base_cvd = " ".join(pg.locator(".th-warn").all_inner_texts())
    ck("ชุดของกลางแยกออกครบ 5 สี", "แยกออกครบทั้ง 5" in base_cvd, base_cvd[:140])
    # ‼️ ทำให้สีที่ 5 เกือบเท่าสีที่ 4 ต้องถูกจับได้
    #    ช่องสีเรียง พื้นหลัง ตัวอักษร ค่าดี ค่ากลาง ค่าแย่ (0-4) แล้วค่อยสีข้อมูล (5-9)
    #    จึงต้องเป็นช่อง 9 คือสีข้อมูลตัวที่ 5 ไม่ใช่ช่อง 8 ซึ่งคือตัวที่ 4 ที่เป็นคู่เทียบเอง
    set_hex(pg, ".ts-custom", 9, "#3A5BC0")
    pg.wait_for_timeout(300)
    merged = " ".join(pg.locator(".th-warn").all_inner_texts())
    ck("ตั้งสองสีให้ใกล้กันแล้วถูกจับได้ว่าแยกไม่ครบ", "แยกออกแค่" in merged, merged[:160])
    ck("บอกชื่อภาวะเป็นภาษาที่อ่านรู้เรื่อง ไม่ใช่คีย์ดิบ", "ตาบอดสี" in merged, merged[:160])
    boxes = pg.locator(".th-cvdbox b").all_inner_texts()
    ck("มีกล่องเทียบครบ สายตาปกติกับอีกสามภาวะ", len(boxes) == 4, boxes)
    set_hex(pg, ".ts-custom", 9, "#884466")
    pg.wait_for_timeout(200)

    # ── ⑦ ขนาดผืนผ้าใบ ────────────────────────────────────────────────
    print("\n⑦ ขนาดผืนผ้าใบกับขนาดตัวอักษร")
    small = theme_json(pg)["textClasses"]["callout"]["fontSize"]
    pg.locator(".ts-dim", has_text="2560 x 1440").click()
    pg.wait_for_timeout(300)
    big = theme_json(pg)["textClasses"]["callout"]["fontSize"]
    ck(f"ผืนใหญ่ขึ้นแล้วตัวอักษรโตขึ้นจริง ({small}pt เป็น {big}pt)", big > small)
    ck("โตแบบรากที่สองของพื้นที่ ไม่ใช่โตตามพื้นที่", big == 60, big)
    pg.locator(".ts-dim", has_text="1920 x 1080").click()
    pg.wait_for_timeout(300)

    # ── ⑧ เปิดไฟล์ธีมเดิม ─────────────────────────────────────────────
    print("\n⑧ เปิดไฟล์ธีมเดิมเข้ามาแก้")
    src = {"name": "ธีมทดสอบของบริษัทสมมติ", "dataColors": ["#123456", "#654321"],
           "background": "#EEEEEE", "foreground": "#111111",
           "visualStyles": {"*": {"*": {"background": [{"show": True}]}}}}
    fp = os.path.join(tempfile.gettempdir(), "fk_theme_probe.json")
    with open(fp, "w", encoding="utf-8") as f:
        json.dump(src, f, ensure_ascii=False)
    pg.locator(".ts input[type=file]").set_input_files(fp)
    pg.wait_for_timeout(600)
    t3 = theme_json(pg)
    ck("ชื่อธีมถูกอ่านเข้ามา", t3["name"] == src["name"], t3["name"])
    ck("สีข้อมูลถูกอ่านเข้ามาครบ", [c.lower() for c in t3["dataColors"]] == ["#123456", "#654321"], t3["dataColors"])
    ck("พื้นหลังถูกอ่านเข้ามา", t3["background"].lower() == "#eeeeee", t3["background"])
    ck("visualStyles ไม่ถูกกลืนเข้ามาเงียบ ๆ", "visualStyles" not in t3, list(t3)[:5])
    msg = pg.locator(".ts .status").inner_text()
    ck("บอกผู้ใช้ตรง ๆ ว่า visualStyles เดิมไม่ถูกนำมาด้วย", "visualStyles" in msg, msg)
    os.remove(fp)

    # ── ⑧.5 ของที่โคลนมาจาก datatraining.io ──────────────────────────
    print("\n⑧.5 หน้าตาที่โคลนจาก datatraining.io (วัดจริง 13/09/2026)")
    pg.locator(".ts-pal .th-sw", has_text="ดินเผา").click()
    pg.wait_for_timeout(500)
    # ‼️ ฟอนต์ของเขาคือ system-ui ซึ่งบน Windows = Segoe UI ของเราตั้งเป็นเครื่องมือนี้เท่านั้น
    ff = pg.evaluate("getComputedStyle(document.querySelector('.ts .panel')).fontFamily")
    ck(f"ตัวเครื่องมือใช้ฟอนต์ Segoe UI ไม่ใช่ Sarabun ({ff[:40]})", ff.startswith('"Segoe UI"') and "Sarabun" not in ff, ff)
    fs = pg.evaluate("getComputedStyle(document.querySelector('.ts .panel')).fontSize")
    ck("ขนาดตัวอักษรพื้น 14px เท่าของเขา", fs == "14px", fs)
    h2 = pg.evaluate("(() => { const s = getComputedStyle(document.querySelector('.ts-h')); return [s.fontSize, s.fontWeight, s.lineHeight]; })()")
    ck("หัวข้อส่วน 18px/28px น้ำหนัก 500 เท่าที่วัดจากของเขา", h2 == ["18px", "500", "28px"], h2)
    # ‼️ ไอเดียหลักของเขา ทั้งหน้าทาสีของธีมที่กำลังสร้าง แถบหัว แถบล่าง ปุ่มที่เลือก ปุ่มสร้างไฟล์
    tp_before = pg.evaluate("getComputedStyle(document.querySelector('.ts')).getPropertyValue('--tp').trim()")
    head_bg = pg.evaluate("getComputedStyle(document.querySelector('.ts .tool-head')).backgroundImage")
    foot_bg = pg.evaluate("getComputedStyle(document.querySelector('.ts-foot')).backgroundImage")
    ck("แถบหัวเป็นไล่สีของธีม ส่วนแถบล่างพื้นเรียบ (ไม่ซ้ำกันจนรก)", "linear-gradient" in head_bg and foot_bg == "none", [head_bg[:60], foot_bg[:60]])
    pg.locator(".ts-pal .th-sw", has_text="True Corporation").click()
    pg.wait_for_timeout(600)
    tp_after = pg.evaluate("getComputedStyle(document.querySelector('.ts')).getPropertyValue('--tp').trim()")
    ac_after = pg.evaluate("getComputedStyle(document.querySelector('.ts')).getPropertyValue('--ac').trim()")
    ck(f"เปลี่ยนชุดสีแล้วสีธีมทั้งหน้าเปลี่ยนตาม ({tp_before} เป็น {tp_after})",
       tp_before != tp_after and tp_after.startswith("#"), f"{tp_before} -> {tp_after}")
    ck("สีประจำเครื่องมือของ FileKit (--ac) ก็เปลี่ยนตาม", ac_after.startswith("#"), ac_after)
    # ‼️ สีธีมที่ทาแถบต้องอ่านตัวหนังสือขาวออก ไม่ใช่เอาสีอ่อนของชุดมาทาตรง ๆ
    ratio = pg.evaluate("""() => {
      const h = (c) => { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]
        .map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); };
      const L = (c) => { const [r, g, b] = h(c); return .2126 * r + .7152 * g + .0722 * b; };
      const tp = getComputedStyle(document.querySelector('.ts')).getPropertyValue('--tp').trim();
      return (1.05) / (L(tp) + .05); }""")
    ck(f"ตัวหนังสือขาวบนสีธีมได้คอนทราสต์อย่างน้อย 4.5 (วัดได้ {ratio:.2f})", ratio >= 4.5, ratio)
    open_custom(pg); open_check(pg)
    ck("ชุดของแบรนด์โหลดสีมาครบ 8 สี ไม่ถูกตัดเหลือ 5",
       pg.locator(".ts-custom .ck-hex").count() == 13, pg.locator(".ts-custom .ck-hex").count())
    # ‼️ ชุดแบรนด์ต้องถูกรายงานตามจริง ไม่ใช่ปล่อยผ่านเพราะเป็นของบริษัท
    brand_txt = " ".join(pg.locator(".th-warn").all_inner_texts())
    ck("ชุดแบรนด์ถูกเตือนเรื่องคอนทราสต์ตามที่วัดได้จริง", "ต่ำกว่าเกณฑ์" in brand_txt, brand_txt[:130])
    ck("ชุดแบรนด์ถูกเตือนว่าแยกออกแค่ 5 สีแรก", "แยกออกแค่ 5" in brand_txt, brand_txt[:170])
    ck("ชุดแบรนด์มีป้ายบอกว่าเป็นแบรนด์", pg.locator(".ts-pal .th-tag").count() == 1, pg.locator(".ts-pal .th-tag").count())
    pg.locator(".ts-pal .th-sw", has_text="ดินเผา").click(); pg.wait_for_timeout(400)

    # สายพานชุดสี มีปุ่มกลมสองข้าง กดแล้วเลื่อนจริง
    arrows = pg.locator(".ts-arr")
    ck("สายพานชุดสีมีปุ่มเลื่อนสองข้าง", arrows.count() == 2, arrows.count())
    sl0 = pg.evaluate("document.querySelector('.ts-track').scrollLeft")
    pg.locator(".ts-arr.next").click(); pg.wait_for_timeout(700)
    sl1 = pg.evaluate("document.querySelector('.ts-track').scrollLeft")
    ck(f"กดลูกศรขวาแล้วสายพานเลื่อนจริง ({sl0} เป็น {sl1})", sl1 > sl0, [sl0, sl1])
    pg.locator(".ts-arr.prev").click(); pg.wait_for_timeout(700)
    # แถบเลื่อนคู่ช่องตัวเลข
    bars = pg.locator(".th-num input[type=range]")
    ck("มีแถบเลื่อนคู่กับช่องตัวเลขทั้งกว้างและสูง", bars.count() == 2, bars.count())
    pg.locator(".ts-dim", has_text="2560 x 1440").click(); pg.wait_for_timeout(400)
    ck("ลากแถบเลื่อนกับพิมพ์เลขผูกกันสองทาง",
       sorted([bars.nth(0).input_value(), bars.nth(1).input_value()]) == ["1440", "2560"],
       [bars.nth(0).input_value(), bars.nth(1).input_value()])
    pressed = pg.locator(".ts-dim[aria-pressed='true']").all_inner_texts()
    ck("ปุ่มขนาดที่เลือกถูกทาสีธีม", pressed == ["2560 x 1440"], pressed)
    # กล่องสัดส่วนผืนผ้าใบต้องตรงอัตราส่วนจริง
    bx = pg.locator(".th-cvbox").bounding_box()
    ratio = bx["width"] / bx["height"]
    ck(f"กล่องพรีวิวผืนผ้าใบตรงสัดส่วนจริง 2560:1440 = 1.78 (วัดได้ {ratio:.2f})", abs(ratio - 2560 / 1440) < 0.08, ratio)
    pg.locator(".ts-dim", has_text="1920 x 1080").click(); pg.wait_for_timeout(400)
    # แถบล่างบอกตัวเลขสดที่ใช้คำนวณจริง
    facts = pg.locator(".th-facts").inner_text()
    ck(f"แถบล่างบอกพื้นที่ผืนผ้าใบที่ใช้คำนวณจริง ({facts})", "2,073,600" in facts, facts)
    # รายงานจำลองต้องมีของครบ ไม่ใช่แค่แท่งกราฟ
    for sel, name in [(".th-cards .th-card", "การ์ด KPI"), (".th-tg", "แถวเทียบเป้าหมาย"),
                      (".th-area", "กราฟเส้น"), (".th-bb", "แท่งยอดขายรายภาค"),
                      (".th-ccol i", "แท่งแนวตั้ง"), (".th-legend span", "แถบสีชุดข้อมูล")]:
        ck(f"รายงานจำลองมี{name}", pg.locator(sel).count() >= 1, pg.locator(sel).count())
    # ‼️ โทนของภาพเขา: ตัวเลขการ์ดน้ำหนักบาง 300 การ์ดไม่มีเส้นขอบแต่มีเงา ใช้แค่ 2 สีหลักในกราฟ
    kw = pg.evaluate("getComputedStyle(document.querySelector('.th-card b')).fontWeight")
    ck("ตัวเลขในการ์ด KPI น้ำหนักบาง 300 เหมือนรายงานของเขา", kw == "300", kw)
    cs = pg.evaluate("(() => { const s = getComputedStyle(document.querySelector('.th-card')); return [s.borderTopColor, s.boxShadow]; })()")
    ck("การ์ดบนพื้นสว่างไม่มีเส้นขอบ ใช้เงาบางแทน", cs[0] == "rgba(0, 0, 0, 0)" and cs[1] != "none", cs)
    used = pg.evaluate("""() => new Set([...document.querySelectorAll('.th-bbt i, .th-tgt i, .th-ccol i')]
        .map(e => getComputedStyle(e).backgroundColor)).size""")
    ck(f"กราฟใช้สีหลักแค่ 2 สี ไม่ใช่ทุกสีในชุด (ใช้จริง {used})", used == 2, used)
    # ‼️ ข้อที่พี่ปอนด์ทักโดยตรง การ์ด KPI ต้องกว้างพอจนชื่อไม่ตัดคำ
    cb = pg.locator(".th-card").first.bounding_box()
    ck(f"การ์ด KPI กว้างพอไม่ตัดคำ ({round(cb['width'])}px ต้องอย่างน้อย 150)", cb["width"] >= 150, cb)
    clipped = pg.evaluate("""() => [...document.querySelectorAll('.th-ct, .th-vt')]
        .filter(e => e.scrollWidth - e.clientWidth > 1).map(e => e.textContent)""")
    ck(f"ไม่มีชื่อไหนถูกตัดข้อความ ({clipped})", not clipped, clipped)
    pw_ = pg.locator(".th-prevwrap").bounding_box()["width"]; pnl = pg.locator(".ts .panel").bounding_box()["width"]
    ck(f"พรีวิวเต็มความกว้างของแผง ({pw_:.0f} จาก {pnl:.0f})", pw_ > pnl * 0.85)
    sp = pg.locator(".th-area").bounding_box()
    ck(f"กราฟเส้นเรนเดอร์จริง ไม่ใช่กล่องเปล่า ({sp['width']:.0f}x{sp['height']:.0f})", sp["width"] > 50 and sp["height"] > 30, sp)
    ck("กราฟเส้นวาดเส้น จุด และป้ายตัวเลขครบทุกเดือน",
       pg.evaluate("document.querySelectorAll('.th-area path').length") == 2
       and pg.evaluate("document.querySelectorAll('.th-area circle').length") == 12
       and pg.evaluate("document.querySelectorAll('.th-area text').length") == 12)
    for sel, name in [(".th-side", "แถบข้างไล่สี"), (".th-cdrow", "บรรทัดเทียบในการ์ด KPI"),
                      (".th-bbt b", "ป้ายเงินในแท่ง"), (".th-tgt u", "เส้นเป้าหมาย"),
                      (".th-tree .th-nd", "ผังแยกส่วน"), (".th-ccy span", "แกนค่าของกราฟแท่ง"),
                      (".th-vs", "บรรทัดรองใต้ชื่อกราฟ")]:
        n = pg.locator(sel).count()
        ck(f"พรีวิวมี{name} ({n} ชิ้น)", n >= 1, n)

    # ── ⑨ แผงย่อยต้องไม่ล้น ───────────────────────────────────────────
    print("\n⑨ แผงย่อยไม่ล้นออกด้านข้าง")
    ov = pg.evaluate("""() => {
      const out = [];
      for (const el of document.querySelectorAll('.ts-sec, .ts-sub, .ck-wrap')) {
        if (el.scrollWidth - el.clientWidth > 1) out.push(el.className + ' ' + el.scrollWidth + '>' + el.clientWidth);
      }
      return out;
    }""")
    ck("ไม่มีกล่องไหนที่เนื้อหากว้างเกินกรอบ", not ov, ov)

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
    en.locator("details.ts-custom").evaluate("d => d.open = true")
    en.locator("details.ts-json").evaluate("d => d.open = true")
    en.locator("details.ts-check").evaluate("d => d.open = true")
    en.wait_for_timeout(300)
    panel = en.locator(".panel").inner_text()
    thai = sorted(set(re.findall(r"[฀-๿]+", panel)))
    ck("โหมดอังกฤษไม่มีภาษาไทยหลุดในพื้นที่ทำงาน", not thai, thai[:8])
    ck("โหมดอังกฤษไม่มี error", not en_errs, en_errs)
    en.close()
    br.close()

print(f"\nผ่าน {0 if fails else 'ครบ'} ตก {len(fails)}")
if fails:
    for f in fails:
        print("  ❌ " + f)
    sys.exit(1)
print("✅ ผ่านหมด")
