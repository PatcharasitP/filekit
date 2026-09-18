"""จำค่าที่ตั้งไว้ และแชร์ด้วยลิงก์ — ไล่ทุกเครื่องมือที่ต่อ statekit ไว้

‼️ ที่มา 18/09/2026 พี่ปอนด์ส่ง https://siahra-radar.co มาให้ศึกษา
   เว็บนั้นเก็บสถานะทั้งแอป (มุมกล้อง + สวิตช์ชั้นข้อมูล 12 ตัว) ไว้ใน URL
   วัดของเราแล้วพบว่ามี statekit อยู่แล้วแต่ต่อไว้แค่ 7 เครื่องมือ
   ขณะที่อีก 13 ตัวมีช่องตั้งค่า 5 ช่องขึ้นไปแต่ปรับเสร็จแล้วค่าหาย

‼️ เกณฑ์เลือกเครื่องมือที่จะต่อ ไม่ใช่ "ช่องเยอะที่สุด" แต่เป็น
   "ค่าผูกกับไฟล์ที่ผู้ใช้เปิดหรือเปล่า" — ถ้าผูก ส่งลิงก์ไปคนอื่นก็ใช้ไม่ได้

เทสนี้ตรวจ 4 อย่างต่อเครื่องมือ ทุกข้อยิงบนเบราว์เซอร์จริง
   ① เปลี่ยนค่าแล้วรีเฟรช ค่าต้องยังอยู่
   ② ปุ่มคัดลอกลิงก์ต้องได้ลิงก์ที่มีสถานะติดมาจริง (?s=)
   ③ ‼️ เปิดลิงก์ในบริบทสะอาด (ไม่มี localStorage เดิม) ค่าต้องตามไปด้วย
      ข้อนี้สำคัญสุด เทสในหน้าต่างเดิมจะผ่านหลอกจากค่าที่จำไว้ในเครื่อง
   ④ ‼️ ค่าที่ผูกกับไฟล์ ต้องไม่ติดไปกับลิงก์

รัน: tests/run.sh browser_sharestate
"""
import os
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://127.0.0.1:8899")
ok = fail = 0


def ck(label, got, want):
    global ok, fail
    if got == want:
        ok += 1
        print(f"  ✅ {label}")
    else:
        fail += 1
        print(f"  ❌ {label}\n      ได้    : {got!r}\n      ควรได้ : {want!r}")


# ต่อเครื่องมือ: (id, ฟังก์ชันอ่านค่า, ฟังก์ชันตั้งค่า, ค่าที่คาดหลังตั้ง)
READ_THEME = """() => {
  const n = document.querySelector('input[type=text]');
  const num = [...document.querySelectorAll('input[type=number]')][0];
  return {a: n && n.value, b: num && num.value};
}"""
READ_BINS = """() => {
  const sels = [...document.querySelectorAll('select')];
  const m = sels.find(s => [...s.options].some(o => o.value === 'quantile'));
  const unit = [...document.querySelectorAll('input.nb-num')].find(i => i.placeholder && /กม|km/.test(i.placeholder));
  return {a: m && m.value, b: unit && unit.value};
}"""


def set_theme(pg):
    pg.fill("input[type=text]", "ธีมของพี่ปอนด์")
    pg.wait_for_timeout(300)
    n = pg.locator("input[type=number]").first
    n.fill("2560")
    n.dispatch_event("input")


def set_bins(pg):
    sel = pg.locator("select").filter(has=pg.locator("option[value=quantile]")).first
    sel.select_option("quantile")
    pg.wait_for_timeout(300)
    unit = pg.locator("input.nb-num").filter(has_not=pg.locator("x")).nth(1)
    unit.fill("กม.")
    unit.dispatch_event("input")


READ_PAGENUM = """() => {
  const s = [...document.querySelectorAll('.ws-right select, .ws-left select')];
  const n = [...document.querySelectorAll('input[type=number]')];
  return {a: s[3] && s[3].value, b: n[0] && n[0].value};
}"""
READ_WM = """() => {
  const t = document.querySelector('.ws-right input[type=text], .ws-left input[type=text]');
  const r = document.querySelector('input[type=range]');
  return {a: t && t.value, b: r && r.value};
}"""


def set_pagenum(pg):
    pg.locator(".ws-right select, .ws-left select").nth(3).select_option("16")
    pg.wait_for_timeout(300)
    n = pg.locator("input[type=number]").first
    n.fill("7")
    n.dispatch_event("input")


def set_wm(pg):
    t = pg.locator(".ws-right input[type=text], .ws-left input[type=text]").first
    t.fill("ห้ามคัดลอก")
    t.dispatch_event("input")
    pg.wait_for_timeout(300)
    r = pg.locator("input[type=range]").first
    r.fill("45")
    r.dispatch_event("input")


TOOLS = [
    ("pbi-theme", READ_THEME, set_theme, {"a": "ธีมของพี่ปอนด์", "b": "2560"}),
    ("number-bins", READ_BINS, set_bins, {"a": "quantile", "b": "กม."}),
    ("pdf-page-numbers", READ_PAGENUM, set_pagenum, {"a": "16", "b": "7"}),
    ("pdf-watermark", READ_WM, set_wm, {"a": "ห้ามคัดลอก", "b": "45"}),
]

print(f"\n━━ จำค่า + แชร์ลิงก์ ({BASE}) ━━")
with sync_playwright() as p:
    b = p.chromium.launch()
    for tid, reader, setter, want in TOOLS:
        print(f"\n── {tid}")
        ctx = b.new_context(viewport={"width": 1440, "height": 950},
                            permissions=["clipboard-read", "clipboard-write"])
        pg = ctx.new_page()
        pg.goto(f"{BASE}/#{tid}", wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_timeout(2800)
        try:
            setter(pg)
        except Exception as e:
            print(f"  ❌ ตั้งค่าไม่ได้: {str(e)[:70]}")
            fail += 1
            ctx.close()
            continue
        pg.wait_for_timeout(1500)

        pg.reload(wait_until="domcontentloaded")
        pg.wait_for_timeout(2800)
        ck("① เปลี่ยนค่าแล้วรีเฟรช ค่ายังอยู่", pg.evaluate(reader), want)

        pg.locator("button", has_text="คัดลอกลิงก์ค่านี้").first.click()
        pg.wait_for_timeout(900)
        link = pg.evaluate("() => navigator.clipboard.readText()") or ""
        ck("② ลิงก์ที่คัดลอกมีสถานะติดมาจริง", "?s=" in link, True)

        ctx2 = b.new_context(viewport={"width": 1440, "height": 950})
        pg2 = ctx2.new_page()
        pg2.goto(link or f"{BASE}/#{tid}", wait_until="domcontentloaded", timeout=60000)
        pg2.wait_for_timeout(3000)
        ck("③ เปิดลิงก์บนเครื่องสะอาด ค่าตามไปครบ", pg2.evaluate(reader), want)
        ctx2.close()
        ctx.close()

    # ④ ค่าที่ผูกกับไฟล์ต้องไม่ติดไปกับลิงก์ของ number-bins
    import base64
    import json as js
    ctx = b.new_context(viewport={"width": 1440, "height": 950},
                        permissions=["clipboard-read", "clipboard-write"])
    pg = ctx.new_page()
    pg.goto(f"{BASE}/#number-bins", wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(2600)
    set_bins(pg)
    pg.wait_for_timeout(1200)
    pg.locator("button", has_text="คัดลอกลิงก์ค่านี้").first.click()
    pg.wait_for_timeout(800)
    link = pg.evaluate("() => navigator.clipboard.readText()") or ""
    # ‼️ ลิงก์หน้าตาเป็น .../?s=XXXX#/number-bins ต้องตัดทั้ง & และ # ออก
    #    รอบแรกลืมตัด # แล้วถอดรหัสพัง เทสเลย "ผ่านแบบหลอก" เพราะเซตว่างตัดกับอะไรก็ว่าง
    raw = link.split("?s=")[-1].split("&")[0].split("#")[0] if "?s=" in link else ""
    keys, err = [], None
    if raw:
        pad = raw.replace("-", "+").replace("_", "/")
        pad += "=" * (-len(pad) % 4)
        try:
            keys = sorted(js.loads(base64.b64decode(pad).decode()).get("v", {}).keys())
        except Exception as e:
            err = str(e)
    # ถอดรหัสไม่ออก = ตัวตรวจพัง ต้องแดง ห้ามปล่อยผ่าน
    ck("④ ถอดสถานะในลิงก์ออกมาอ่านได้", (err is None) and len(keys) > 0, True)
    banned = {"sheet", "col", "key", "overrides", "locks", "sheetSel", "colSel", "keySel"}
    ck("④ ลิงก์ต้องไม่พกค่าที่ผูกกับไฟล์ (ชีต คอลัมน์ ล็อก)", sorted(set(keys) & banned), [])
    print(f"      คีย์ที่อยู่ในลิงก์: {keys}{' · ถอดรหัสพลาด: ' + err if err else ''}")
    ctx.close()
    b.close()

print(f"\nผ่าน {ok} · ตก {fail}")
sys.exit(1 if fail else 0)
