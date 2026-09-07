import re, sys, pathlib
from playwright.sync_api import sync_playwright

BASE = __import__("os").environ.get("FK_BASE", "http://localhost:8899")  # ตั้ง FK_BASE เพื่อยิงใส่เว็บจริง
FX = pathlib.Path("/tmp/claude-1000/-mnt-c-Users-USER-Desktop-Claude-Code/1a23ba41-65a0-437b-a9bd-bf64961a3d72/scratchpad/fx")
OUT = FX / "downloads"; OUT.mkdir(exist_ok=True)
P, Fa = 0, []
def ck(name, got, want, contains=False):
    global P
    ok = (want in str(got)) if contains else (got == want)
    if ok: P += 1
    else: Fa.append(f"{name}\n      ได้    : {got!r}\n      ควรได้ : {'…มีคำว่า '+repr(want) if contains else repr(want)}")
    print(f"  {'✅' if ok else '❌'} {name}")

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width":1280,"height":1000})
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))

    # ── ① หน้าแรก ──────────────────────────────────────────────
    print("\n━━ ① หน้าแรกเห็นเครื่องมือใหม่ ━━")
    pg.goto(BASE, wait_until="networkidle")
    ck("จำนวนเครื่องมือทั้งหมด", pg.locator("button.pill, button.card").count(), 27)
    ck("มีหมวด 'งานเอกสารไทย'", pg.get_by_text("งานเอกสารไทย", exact=True).count() >= 1, True)
    for tid in ["thai-encoding","thai-date","thai-id","thai-number"]:
        ck(f"มีเครื่องมือ {tid}", pg.locator(f'button.pill[data-id="{tid}"], button.card[data-id="{tid}"]').count(), 1)
    # หน้าแรกต้องไม่ดึงไลบรารีหนักมาก่อน (หลักการ lazy-first ของโปรเจกต์)
    reqs = []
    pg.on("request", lambda r: reqs.append(r.url))
    pg.reload(wait_until="networkidle")
    ck("หน้าแรกยังไม่โหลด xlsx (lazy-first ไม่พัง)", any("xlsx" in u for u in reqs), False)

    def open_tool(tid):
        pg.goto("about:blank")                       # ตัดสถานะเดิมทิ้งให้ขาด
        pg.goto(f"{BASE}/#/{tid}", wait_until="networkidle")
        pg.wait_for_selector(".dz", timeout=15000)

    def upload(path):
        pg.set_input_files('input[type=file]', str(path))
        pg.wait_for_timeout(1200)

    # ── ② ซ่อมไฟล์ไทยเพี้ยน ────────────────────────────────────
    print("\n━━ ② ซ่อมไฟล์ไทยเพี้ยน ━━")
    open_tool("thai-encoding")
    upload(FX/"พนักงาน-TIS620.csv")
    pg.wait_for_selector(".enc-card", timeout=10000)
    ck("ตรวจว่าไฟล์ TIS-620 ต้องซ่อม", pg.locator(".enc-head .stat").first.inner_text(), "ต้องซ่อม")
    ck("บอกเหตุผลที่ตัดสิน", pg.locator(".enc-card .note").first.inner_text(), "TIS-620", contains=True)
    ck("ช่อง 'เปิดตรง ๆ' โชว์ตัวประหลาด", "�" in pg.locator(".preview-text.bad").first.inner_text(), True)
    ck("ช่อง 'หลังซ่อม' อ่านภาษาไทยออก", pg.locator(".preview-text.good").first.inner_text(), "สมชาย ใจดี", contains=True)
    with pg.expect_download() as dl:
        pg.locator("button.btn", has_text="บันทึกเป็น UTF-8").click()
    f = OUT/"fixed-tis620.csv"; dl.value.save_as(str(f))
    txt = f.read_bytes().decode("utf-8-sig")
    ck("ไฟล์ที่ดาวน์โหลดอ่านเป็น UTF-8 ได้ถูกต้อง", txt.split("\n")[1], "EMP-001,สมชาย ใจดี,ฝ่ายบุคคล,เจ้าหน้าที่อาวุโส")
    ck("มี BOM ให้ Excel", f.read_bytes()[:3], b"\xef\xbb\xbf")

    print("\n  — เพี้ยนซ้อน 2 ชั้น (เธชเธงเธฑ) และแบบฝรั่ง (à¸ªà¸§) พร้อมกัน —")
    open_tool("thai-encoding")
    pg.set_input_files("input[type=file]",
        [str(FX/"ยอดขาย-เพี้ยนซ้อน.csv"), str(FX/"ลูกค้า-เพี้ยนแบบฝรั่ง.csv")])
    pg.wait_for_timeout(1500)
    pg.wait_for_selector(".enc-card", timeout=10000)
    ck("รับหลายไฟล์พร้อมกันได้", pg.locator(".enc-card").count(), 2)
    c874, c1252 = pg.locator(".enc-card").nth(0), pg.locator(".enc-card").nth(1)
    ck("การ์ด 874 · ตรวจเจอว่าเพี้ยนซ้อน", c874.locator(".note").first.inner_text(), "เคยถูกอ่านผิดแล้วบันทึกซ้ำ", contains=True)
    ck("การ์ด 874 · กู้ข้อความกลับได้", c874.locator(".preview-text.good").inner_text(), "สมชาย ใจดี", contains=True)
    ck("การ์ด 1252 · ตรวจเจอว่าเพี้ยนซ้อน", c1252.locator(".note").first.inner_text(), "เคยถูกอ่านผิดแล้วบันทึกซ้ำ", contains=True)
    ck("การ์ด 1252 · กู้ข้อความกลับได้", c1252.locator(".preview-text.good").inner_text(), "สุดารัตน์ รักงาน", contains=True)
    ck("การ์ด 1252 · ยังโชว์ตัวเพี้ยนเดิมให้เทียบ", c1252.locator(".preview-text.bad").inner_text(), "à¸", contains=True)

    # ── ③ พ.ศ. ⇄ ค.ศ. ─────────────────────────────────────────
    print("\n━━ ③ แปลง พ.ศ. ⇄ ค.ศ. ━━")
    open_tool("thai-date")
    upload(FX/"ข้อมูลพนักงาน-ทดสอบ.xlsx")
    pg.wait_for_selector(".xt", timeout=10000)
    ck("เดาคอลัมน์วันที่ให้เอง", pg.locator(".panel select").nth(1).input_value(), "2")  # 0=ชีท(ซ่อน) 1=คอลัมน์
    body = pg.locator(".xt tbody")
    ck("15 ม.ค. 2569 → 2026-01-15", body.locator("tr").nth(0).locator("td").nth(3).inner_text(), "2026-01-15")
    ck("1 กันยายน 2568 → 2025-09-01", body.locator("tr").nth(1).locator("td").nth(3).inner_text(), "2025-09-01")
    ck("2569-03-31 → 2026-03-31", body.locator("tr").nth(2).locator("td").nth(3).inner_text(), "2026-03-31")
    ck("'ยังไม่ระบุ' ถูกจับว่าอ่านไม่ออก", body.locator("tr.bad").count(), 1)
    ck("สรุปแปลงได้ 4 แถว", pg.locator(".stat.ok").inner_text(), "4", contains=True)
    ck("สรุปอ่านไม่ออก 1 แถว", pg.locator(".stat.bad").inner_text(), "1", contains=True)
    # สลับเป็นไทยย่อ
    pg.locator(".panel select").nth(3).select_option("thabbr")   # 2=ทิศทาง 3=รูปแบบ
    pg.wait_for_timeout(300)
    ck("เปลี่ยนรูปแบบเป็นไทยย่อได้", body.locator("tr").nth(0).locator("td").nth(3).inner_text(), "15 ม.ค. 2026")
    with pg.expect_download() as dl:
        pg.locator("button.btn", has_text="ดาวน์โหลดเป็น Excel").click()
    fx = OUT/"date.xlsx"; dl.value.save_as(str(fx))
    ck("ไฟล์ Excel ที่ได้มีขนาดสมเหตุผล", fx.stat().st_size > 3000, True)

    # ── ④ ตรวจเลข 13 หลัก ─────────────────────────────────────
    print("\n━━ ④ ตรวจเลขบัตร ปชช. ━━")
    open_tool("thai-id")
    upload(FX/"ข้อมูลพนักงาน-ทดสอบ.xlsx")
    pg.wait_for_selector(".xt", timeout=10000)
    ck("เดาคอลัมน์เลขบัตรให้เอง", pg.locator(".panel select").nth(1).input_value(), "4")
    ck("ถูกต้อง 3 แถว", pg.locator(".stat.ok").inner_text(), "3", contains=True)
    ck("ผิด 2 แถว", pg.locator(".stat.bad").inner_text(), "2", contains=True)
    tb = pg.locator(".xt tbody")
    ck("บอกเลขที่ควรเป็นให้ด้วย", tb.locator("tr.bad").first.locator("td").nth(3).inner_text(), "หลักสุดท้ายควรเป็น", contains=True)
    ck("เลขมีขีดคั่นยังตรวจผ่าน", tb.locator("tr").nth(3).locator("td").nth(3).inner_text().strip(), "ถูกต้อง")

    # ── ⑤ บาทถ้วน ─────────────────────────────────────────────
    print("\n━━ ⑤ ตัวเลข → บาทถ้วน ━━")
    open_tool("thai-number")
    upload(FX/"ข้อมูลพนักงาน-ทดสอบ.xlsx")
    pg.wait_for_selector(".xt", timeout=10000)
    ck("เดาคอลัมน์เงินเดือนให้เอง", pg.locator(".panel select").nth(1).input_value(), "5")
    tb = pg.locator(".xt tbody")
    ck("38000 → สามหมื่นแปดพันบาทถ้วน", tb.locator("tr").nth(0).locator("td").nth(3).inner_text(), "สามหมื่นแปดพันบาทถ้วน")
    ck("128400 → หนึ่งแสนสองหมื่นแปดพันสี่ร้อยบาทถ้วน", tb.locator("tr").nth(3).locator("td").nth(3).inner_text(), "หนึ่งแสนสองหมื่นแปดพันสี่ร้อยบาทถ้วน")
    ck("แปลงได้ครบ 5 แถว", pg.locator(".stat.ok").inner_text(), "5", contains=True)
    pg.locator(".panel select").nth(2).select_option("toThai")
    pg.wait_for_timeout(300)
    ck("โหมดเลขไทย 38000 → ๓๘๐๐๐", tb.locator("tr").nth(0).locator("td").nth(3).inner_text(), "๓๘๐๐๐")

    real = [e for e in errs if "favicon" not in e.lower()]
    print(f"\n━━ console error: {len(real)} ━━")
    for e in real[:5]: print("   ⚠️", e[:160])
    ck("ไม่มี error ใน console", len(real), 0)
    b.close()

print("\n" + "━"*60)
print(f"ผ่าน {P} · ตก {len(Fa)}")
if Fa:
    print("\nรายการที่ตก:")
    for i,f in enumerate(Fa,1): print(f"  {i}. {f}")
    sys.exit(1)
