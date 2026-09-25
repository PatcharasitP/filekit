"""เครื่องมือ รวมหลาย query เป็นตัวเดียว (pq-combine) กดจริงทั้งสองแท็บ

ที่มา 26/09/2026: เครื่องนี้ย้ายโค้ดของผู้ใช้ไปมา และเจอข้อมูลภายในบริษัท (ชื่อ server, SQL)
จึงต้องพิสูจน์ด้วยการกดจริง ไม่ใช่แค่เทสตรรกะ (ตรรกะอยู่ที่ tests/pqcombine.test.mjs)

ตรวจ
   ① เปิดได้ ไม่มี console error ตลอดทั้งชุด
   ② แท็บสร้างใหม่: ค่าเริ่มต้นได้โค้ดต่อ 2 แหล่ง, parameter, แบบฟังก์ชัน, เพิ่ม ลบ เลื่อนแหล่ง, เตือนช่องว่าง
   ③ แท็บรวม: ตัวอย่างอ่านได้ 5 query, ยุบ 2 ตัว, dim_store ได้บล็อกคัดลอก, สลับไม่แตะแล้วผลเปลี่ยนตาม
   ④ ปุ่มคัดลอกได้ข้อความตรงกับโค้ดที่เห็น
   ⑤ ‼️ ความเป็นส่วนตัว: ชื่อ server, SQL และโค้ดที่วาง ต้องไม่ไปอยู่ใน localStorage
      พิสูจน์ตัวตรวจ: ตัวค้นต้องเจอคำที่ใส่เองลง localStorage ก่อน ไม่งั้นข้อนี้ผ่านหลอก
   ⑥ กล่องโค้ดไม่ล้นแนวนอนแม้ SQL ยาวมาก พิสูจน์ตัวตรวจด้วยการปิดการหักบรรทัดแล้วต้องล้น
   ⑦ โหมดอังกฤษไม่มีข้อความไทยค้างในแผง และจอ 390px ไม่ล้นแนวนอน

รัน: python3 -m http.server 8899 &  แล้ว ../.venv/bin/python tests/browser_pqcombine.py
"""
import os
import re
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
SHOTS = os.environ.get("FK_SHOTS")  # ใส่โฟลเดอร์ถ้าอยากได้ภาพไว้ดูด้วยตา
fails = []
errors = []
THAI = re.compile(r"[฀-๿]")


def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label)
    if not ok:
        if detail:
            print("      " + str(detail)[:400])
        fails.append(label)


def code(pg):
    return pg.eval_on_selector(".pqc-code code", "e => e.textContent")


def shot(pg, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        pg.screenshot(path=os.path.join(SHOTS, name), full_page=True)


def open_tool(pg, lang="th"):
    pg.goto(f"{BASE}/", wait_until="networkidle")
    pg.evaluate("(l) => { localStorage.setItem('fk-lang', l); localStorage.removeItem('filekit-state-pq-combine'); }", lang)
    pg.goto(f"{BASE}/#/pq-combine", wait_until="networkidle")
    # ‼️ ภาษาอ่านครั้งเดียวตอนโหลดโมดูล (กติกาเว็บนี้ สลับภาษา = โหลดใหม่) เปลี่ยนแค่ # ไม่พอ ต้อง reload
    pg.reload(wait_until="networkidle")
    pg.wait_for_selector(".pqc-code code", timeout=20000)
    pg.wait_for_timeout(400)


def click_mode(pg, value):
    # บนมือถือแผงตัวเลือกเป็นแผ่นที่ปิดอยู่ ต้องกดปุ่ม ตัวเลือก ก่อน (กดที่ป้าย ไม่ใช่ radio ที่ซ่อนไว้)
    btn = pg.locator(".s2-sheetbtn")
    if btn.count() and btn.first.is_visible() and btn.first.get_attribute("aria-expanded") != "true":
        btn.first.click()
        pg.wait_for_timeout(300)
    pg.locator(f".pqc-mode label:has(input[value='{value}'])").click()
    pg.wait_for_timeout(200)


def main():
    with sync_playwright() as P:
        b = P.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 950})
        ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE.rstrip("/"))
        pg = ctx.new_page()
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))

        print("\n━━ ② แท็บสร้างใหม่ ━━")
        open_tool(pg)
        c = code(pg)
        ck("ค่าเริ่มต้นต่อ 2 แหล่งด้วย Table.Combine", "Table.Combine({" in c and c.count("Sql.Database(") == 2, c[:300])
        ck("ข้อความ SQL ของแต่ละแหล่งแยกกัน (ใช้ #(lf))", c.count('[Query = "SELECT Code, Amount, SaleDate#(lf)FROM dbo.Sales"]') == 2)
        ck("ส่วน parameter ซ่อนอยู่ตอนไม่ได้เปิด", pg.is_hidden(".pqc-code >> nth=1"))
        ck("มีโน้ตเรื่อง privacy เพราะสอง server", "privacy level" in pg.inner_text(".pqc-note:not(.warn)"))
        shot(pg, "build_default.png")

        pg.locator(".pqc-switch input").first.check(force=True)
        pg.wait_for_timeout(200)
        c = code(pg)
        ck("เปิด parameter แล้วโค้ดใช้ Server_1 Database_1", "Sql.Database(Server_1, Database_1," in c, c[:300])
        pc = pg.eval_on_selector_all(".pqc-code code", "els => els[1].textContent")
        ck("มีโค้ด parameter ครบ 4 ตัวรูปที่ Power BI รู้จัก", pc.count("IsParameterQuery = true") == 4, pc[:300])
        pg.locator(".pqc-switch input").first.uncheck(force=True)

        pg.locator("input[type=radio][value='function']").check(force=True)
        pg.wait_for_timeout(200)
        c = code(pg)
        ck("แบบฟังก์ชันมี LoadSql และเรียกบรรทัดละแหล่ง", "LoadSql = (server as text" in c and c.count("= LoadSql(") == 2, c[:400])
        pg.locator("input[type=radio][value='blocks']").check(force=True)

        pg.get_by_role("button", name=re.compile("เพิ่มแหล่ง")).click()
        pg.wait_for_timeout(200)
        cards = pg.locator(".pqc-src")
        ck("กดเพิ่มแหล่งได้การ์ดที่ 3", cards.count() == 3)
        third = cards.nth(2)
        inputs = third.locator("input[type=text]")
        inputs.nth(1).fill("srv-probe")
        inputs.nth(2).fill("ProbeDB")
        third.locator("textarea").fill('select "q" as X\nfrom t')
        pg.wait_for_timeout(200)
        c = code(pg)
        ck("แหล่งที่ 3 เข้าโค้ดพร้อม escape เครื่องหมายคำพูดและขึ้นบรรทัด",
           'Sql.Database("srv-probe", "ProbeDB", [Query = "select ""q"" as X#(lf)from t"])' in c, c[-600:])
        ck("ต่อครบ 3 แหล่ง", c.count("Sql.Database(") == 3)
        # เลื่อนแหล่งที่ 3 ขึ้นบนแล้วลำดับในโค้ดต้องเปลี่ยนตาม
        third.locator("button[aria-label]").first.click()
        pg.wait_for_timeout(200)
        c = code(pg)
        ck("เลื่อนขึ้นแล้วลำดับในโค้ดเปลี่ยน", c.index("srv-probe") < c.index("10.0.0.5"))
        cards.nth(1).locator("button[aria-label]").nth(2).click()
        pg.wait_for_timeout(200)
        ck("ลบแหล่งแล้วเหลือ 2", pg.locator(".pqc-src").count() == 2 and "srv-probe" not in code(pg))

        pg.locator(".pqc-src").first.locator("input[type=text]").nth(1).fill("")
        pg.wait_for_timeout(200)
        ck("server ว่างแล้วมีคำเตือน", "server" in pg.inner_text(".pqc-note.warn"), pg.inner_text(".pqc-note.warn") if pg.is_visible(".pqc-note.warn") else "ไม่มีกล่องเตือน")

        print("\n━━ ⑥ กล่องโค้ดไม่ล้นแนวนอน ━━")
        pg.locator(".pqc-src").first.locator("textarea").fill("SELECT " + ", ".join(f"Column{i}" for i in range(400)) + " FROM dbo.Wide")
        pg.wait_for_timeout(300)
        over = pg.eval_on_selector(".pqc-code", "e => e.scrollWidth > e.clientWidth + 1")
        ck("SQL ยาวมากแต่กล่องโค้ดไม่ต้องลากแนวนอน", not over)
        pg.eval_on_selector(".pqc-code code", "e => e.style.whiteSpace = 'pre'")
        over2 = pg.eval_on_selector(".pqc-code", "e => e.scrollWidth > e.clientWidth + 1")
        ck("พิสูจน์ตัวตรวจ: ปิดการหักบรรทัดแล้วต้องล้นจริง", over2)
        pg.eval_on_selector(".pqc-code code", "e => e.style.whiteSpace = ''")

        print("\n━━ ③ แท็บรวม query ที่มีอยู่ ━━")
        click_mode(pg, "merge")
        ck("สลับแท็บแล้วแผงสร้างใหม่ซ่อน", pg.locator(".pqc-src").first.is_hidden())
        pg.get_by_role("button", name=re.compile("ลองกับตัวอย่าง")).click()
        pg.wait_for_timeout(300)
        ck("อ่านตัวอย่างได้ 5 query", "อ่านได้ 5 query" in pg.inner_text(".pqc-paste + .pqc-row + .pqc-hint"))
        c = code(pg)
        ck("query หลักเดาเป็น sales_all", c.startswith("// sales_all\nlet\n"), c[:200])
        ck("ยุบ sales_th sales_vn เข้าไป", "    sales_th =\n" in c and "    sales_vn =\n" in c)
        ck("dim_store ได้บล็อกคัดลอก (ไม่ได้ชี้ไป sales_all)", "// dim_store\nlet\n" in c and c.count('Sql.Database("server-a"') == 2, c[-500:])
        ck("last_sale ไม่อยู่ในผล (ไม่ได้ถูกแก้)", "// last_sale" not in c)
        notes = pg.inner_text(".pqc-note:not(.warn)")
        ck("บอกว่าลบ sales_th sales_vn ได้", "sales_th, sales_vn" in notes, notes)
        ck("บอกเรื่อง Enable load", "Enable load" in notes)
        ck("เตือน privacy เพราะ query หลักดึงสองแหล่ง", "privacy level" in pg.inner_text(".pqc-note.warn"))
        shot(pg, "merge_example.png")

        pg.locator("input[type=radio][value='keep']").check(force=True)
        pg.wait_for_timeout(200)
        c2 = code(pg)
        ck("เลือกไม่แตะแล้ว dim_store หายจากผล", "// dim_store" not in c2)
        ck("บอกว่า sales_th ยังลบไม่ได้", "sales_th" in pg.inner_text(".pqc-note:not(.warn)") and "Enable load" in pg.inner_text(".pqc-note:not(.warn)"))
        pg.locator("input[type=radio][value='copy']").check(force=True)

        box = pg.locator(".pqc-check input").first
        box.uncheck(force=True)
        pg.wait_for_timeout(200)
        # เหลือยุบแค่ sales_vn เข้าตัวหลัก 1 ก้อน และ dim_store ไม่ได้ถูกแก้เพราะ sales_th ไม่ได้ถูกยุบแล้ว
        ck("เอาติ๊กตัวแรกออกแล้วยุบเหลือตัวเดียว", code(pg).count("// ย้ายมาจาก query") == 1, code(pg)[:300])
        box.check(force=True)
        pg.wait_for_timeout(200)

        print("\n━━ ④ ปุ่มคัดลอก ━━")
        pg.get_by_role("button", name=re.compile("คัดลอกโค้ด")).click()
        pg.wait_for_timeout(300)
        clip = pg.evaluate("navigator.clipboard.readText()")
        ck("คลิปบอร์ดตรงกับโค้ดที่เห็นทุกตัวอักษร", clip == code(pg), f"{len(clip)} กับ {len(code(pg))}")

        print("\n━━ ⑤ ไม่เก็บชื่อ server SQL และโค้ดที่วางลงเครื่อง ━━")
        pg.locator(".pqc-paste").fill(pg.locator(".pqc-paste").input_value() + "\n// secret_probe\nlet s = Sql.Database(\"secret-srv-77\", \"SecretDB\") in s")
        pg.wait_for_timeout(300)
        dump = pg.evaluate("() => Object.keys(localStorage).map(k => k + '=' + localStorage.getItem(k)).join('\\n')")
        for bad in ["secret-srv-77", "SecretDB", "server-a", "SELECT Code", "Sql.Database"]:
            ck(f"localStorage ไม่มี {bad}", bad not in dump)
        pg.evaluate("() => localStorage.setItem('fk-probe', 'secret-srv-77')")
        dump2 = pg.evaluate("() => Object.keys(localStorage).map(k => k + '=' + localStorage.getItem(k)).join('\\n')")
        ck("พิสูจน์ตัวตรวจ: ใส่เองแล้วต้องเจอ", "secret-srv-77" in dump2)
        pg.evaluate("() => localStorage.removeItem('fk-probe')")
        ck("จำแค่ตัวเลือก (แท็บที่เปิดอยู่)", '"mode":"merge"' in dump, dump[:300])

        print("\n━━ ⑦ โหมดอังกฤษ และจอเล็ก ━━")
        open_tool(pg, "en")
        panel = pg.inner_text(".ws-body") if pg.locator(".ws-body").count() else pg.inner_text("main")
        leftover = sorted(set(m for m in THAI.findall(panel)))
        ck("โหมดอังกฤษไม่มีตัวอักษรไทยค้างในหน้าเครื่องมือ", not leftover, "".join(leftover)[:80])
        ck("ค่าเริ่มต้นภาษาอังกฤษ", '#"Sales TH"' in code(pg))
        shot(pg, "build_en.png")

        m = b.new_context(viewport={"width": 390, "height": 844}, color_scheme="dark")
        mp = m.new_page()
        mp.on("pageerror", lambda e: errors.append(str(e)))
        open_tool(mp)
        wide = mp.evaluate("() => document.scrollingElement.scrollWidth > window.innerWidth + 1")
        ck("จอ 390px ไม่ล้นแนวนอน (ธีมมืด)", not wide)
        shot(mp, "mobile_dark.png")
        click_mode(mp, "merge")
        mp.get_by_role("button", name=re.compile("ลองกับตัวอย่าง")).click()
        mp.wait_for_timeout(300)
        ck("จอ 390px สลับไปแท็บรวมและใส่ตัวอย่างได้", "// sales_all" in code(mp))
        wide2 = mp.evaluate("() => document.scrollingElement.scrollWidth > window.innerWidth + 1")
        ck("จอ 390px แท็บรวมก็ไม่ล้น", not wide2)
        shot(mp, "mobile_dark_merge.png")
        m.close()

        print("\n━━ ① console ━━")
        ck("ไม่มี console error ตลอดทั้งชุด", not errors, errors[:5])
        b.close()

    print(f"\n{'❌ ตก ' + str(len(fails)) + ' ข้อ' if fails else '✅ ผ่านทั้งหมด'}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
