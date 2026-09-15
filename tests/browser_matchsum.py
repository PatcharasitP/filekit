# เครื่องมือ "หายอดที่บวกกันได้เท่านี้" ตรวจของที่ผู้ใช้เอาไปใช้ต่อจริง ไม่ใช่แค่ว่ากดแล้วไม่ error
#
# ‼️ สองข้อที่เคยพังจริงและต้องกันไม่ให้กลับมา (เจอ 15/09/2026 ตอนลองกับไฟล์จริง 14,656 แถว):
#    ① เลขแถวเลื่อน — ตัวอ่านชีตกลางของโปรเจกต์สั่ง blankrows:false แถวที่ทั้งแถวเป็น #N/A
#       จึงหลุดไปทั้งแถว ทำให้ "แถว 14591" กลายเป็น "แถว 14586" งานกระทบยอดต้องเปิดไฟล์ไปดูแถวนั้นต่อ
#       เลขแถวผิดคือผิดทั้งงาน และผิดแบบเงียบ ไม่มีอะไรฟ้อง
#    ② โหมดวางตัวเลขเอง ปุ่มค้นหากดไม่ได้ เพราะกล่องลากไฟล์ปิดปุ่มหลักไว้จนกว่าจะมีไฟล์
#
# ถ้าผิดจะรู้ได้ยังไง: ไฟล์ทดสอบจงใจใส่ #N/A ไว้ก่อนแถวคำตอบ ถ้าใครเผลอกลับไปใช้ตัวอ่านที่ตัดแถวทิ้ง
# ข้อ ① จะแดงทันทีพร้อมเลขแถวที่คลาด
#
# รัน: ../.venv/bin/python tests/browser_matchsum.py
import os
import pathlib
import socket
import subprocess
import sys
import tempfile
import time

import openpyxl
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
TMP = pathlib.Path(tempfile.mkdtemp(prefix="filekit_msum_"))
P, F = 0, []


def ck(name, got, want):
    global P
    ok = got == want
    if ok:
        P += 1
    else:
        F.append(f"{name}\n      ได้    : {got!r}\n      ควรได้ : {want!r}")
    print(f"  {'✅' if ok else '❌'} {name}")


def ok(name, cond, note=""):
    global P
    if cond:
        P += 1
    else:
        F.append(f"{name} {note}")
    print(f"  {'✅' if cond else '❌'} {name}{(' ' + note) if note and not cond else ''}")


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


# คอลัมน์ตัวเลขล้วน ไม่มีหัวตาราง แบบที่ไฟล์กระทบยอดจริงเป็น
# แถว 1-5 ของจริง, แถว 6-7 เป็น #N/A (กับดักเลขแถวเลื่อน), คำตอบซ่อนอยู่หลังจากนั้น
VALUES = [
    100,          # แถว 1
    250.50,       # แถว 2
    "#N/A",       # แถว 3
    7000,         # แถว 4
    49.50,        # แถว 5
    "#N/A",       # แถว 6
    "#N/A",       # แถว 7
    12,           # แถว 8
    88,           # แถว 9
    -30,          # แถว 10  (ค่าติดลบ)
    300,          # แถว 11
    300,          # แถว 12  (ค่าซ้ำกับแถว 11)
    1_500_000,    # แถว 13  (ก้อนใหญ่ ใช้ทดสอบการคัดช่วงค่า)
]
# ชุดที่รวมได้ 400 พอดี (ไม่เกิน 4 รายการ ไม่ใช้ค่าติดลบ):
#   300 + 100, 300 + 88 + 12, 250.50 + 100 + 49.50, 250.50 + 88 + 49.50 + 12
def key_of(*vals):
    return "+".join(str(float(v)) if float(v) % 1 else str(int(v)) for v in sorted(vals))


EXPECT_SETS = {key_of(300, 100), key_of(300, 88, 12), key_of(250.5, 100, 49.5),
               key_of(250.5, 88, 49.5, 12)}


def make_file():
    wb = openpyxl.Workbook()
    ws = wb.active
    for v in VALUES:
        ws.append([v])
    p = TMP / "ยอดกระทบ.xlsx"
    wb.save(p)
    return p


def sets_on_screen(pg):
    """ชุดคำตอบที่แสดงบนจอ คืนเป็น {"ค่า+ค่า": [เลขแถว...]} เรียงค่าแล้วเพื่อเทียบง่าย"""
    return pg.evaluate("""() => {
      const out = {};
      for (const card of document.querySelectorAll('.ms-card')) {
        const trs = [...card.querySelectorAll('.ms-rows tr')];
        const body = trs.slice(0, -1).map(tr => {
          const td = tr.querySelectorAll('td');
          return { v: td[0].textContent.replace(/,/g, ''), where: td[1].textContent };
        });
        body.sort((a, b) => +a.v - +b.v);
        const key = body.map(b => String(+b.v)).join('+');
        out[key] = body.map(b => +(b.where.match(/(\\d+)\\s*$/) || [0, 0])[1]);
      }
      return out;
    }""")


def main():
    base = os.environ.get("FK_BASE")
    server = None
    if not base:
        port = free_port()
        server = subprocess.Popen([sys.executable, "-m", "http.server", str(port)],
                                  cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        base = f"http://localhost:{port}"
        time.sleep(1.5)

    xlsx = make_file()
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            ctx = b.new_context(viewport={"width": 1360, "height": 1000}, accept_downloads=True,
                                timezone_id="Asia/Bangkok")
            pg = ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
            pg.on("console", lambda m: errs.append(m.text[:160]) if m.type == "error" else None)

            pg.goto(f"{base}/#/excel-match-sum", wait_until="networkidle")
            pg.wait_for_selector(".dz")
            pg.locator(".dz input[type=file]").first.set_input_files(str(xlsx))
            pg.wait_for_timeout(1800)

            print("\n── ① อ่านไฟล์ที่ไม่มีหัวตาราง ──")
            chips = pg.evaluate("() => [...document.querySelectorAll('.ms-chip')].map(c => c.textContent)")
            nums = [v for v in VALUES if not isinstance(v, str)]
            ok("รู้เองว่าแถวแรกเป็นข้อมูล ไม่ใช่ชื่อคอลัมน์",
               pg.evaluate("() => document.querySelector('.ws-left input[type=checkbox]').checked") is False)
            ok(f"อ่านตัวเลขได้ครบ {len(nums)} แถว",
               any(f"{len(nums)}" in c and "อ่านเป็นตัวเลข" in c for c in chips), f"ได้ {chips}")
            ok("นับแถวที่อ่านไม่ออกแยกไว้ 3 แถว",
               any("อ่านไม่ออก" in c and "3" in c for c in chips), f"ได้ {chips}")

            print("\n── ② ชุดที่รวมกันได้ ต้องครบและถูกทุกชุด ──")
            pg.evaluate("""() => {
              document.querySelectorAll('.ws-right input.ms-num')[0].value = '400';
            }""")
            pg.locator(".ws-footer button", has_text="ค้นหา").first.click()
            pg.wait_for_timeout(1200)
            found = sets_on_screen(pg)
            ck("เจอครบทุกชุดที่เป็นไปได้ ไม่ขาดไม่เกิน", set(found), EXPECT_SETS)

            print("\n── ③ เลขแถวต้องตรงกับไฟล์จริง (แถว #N/A ต้องไม่ทำให้เลื่อน) ──")
            # แผนที่ค่า -> เลขแถวจริงในไฟล์ (นับจาก 1 เหมือนที่ผู้ใช้เห็นใน Excel)
            real = {}
            for i, v in enumerate(VALUES, 1):
                if not isinstance(v, str):
                    real.setdefault(str(float(v)) if float(v) % 1 else str(int(v)), []).append(i)
            bad = []
            for key, rows in found.items():
                for val, row in zip(key.split("+"), rows):
                    if row not in real.get(val, []):
                        bad.append(f"{val} ชี้ไปแถว {row} แต่ของจริงอยู่แถว {real.get(val)}")
            ck("ทุกค่าที่โชว์ ชี้ไปแถวที่มีค่านั้นจริง", bad, [])
            ok("ค่า 300 ที่ซ้ำสองแถว ชี้ไปแถว 11 หรือ 12 เท่านั้น",
               all(r in (11, 12) for k, rows in found.items() for v, r in zip(k.split("+"), rows) if v == "300"))

            print("\n── ④ เงื่อนไขที่ผู้ใช้ปรับได้ ต้องมีผลจริง ──")
            def search(target="400", tol="0", lo="1", hi="4", minv="", maxv="", neg=False):
                pg.evaluate("""([t, tol, lo, hi, minv, maxv, neg]) => {
                  const n = document.querySelectorAll('.ws-right input.ms-num');
                  n[0].value = t; n[1].value = tol; n[2].value = lo; n[3].value = hi;
                  n[4].value = minv; n[5].value = maxv;
                  const sw = document.querySelectorAll('.ws-right input[type=checkbox]')[0];
                  if (sw.checked !== neg) sw.click();
                }""", [target, tol, lo, hi, minv, maxv, neg])
                pg.locator(".ws-footer button", has_text="ค้นหา").first.click()
                pg.wait_for_timeout(900)
                return sets_on_screen(pg)

            two = search(hi="2")
            ck("จำกัดไม่เกิน 2 รายการ เหลือเฉพาะคู่", set(two), {key_of(300, 100)})
            three = search(lo="3", hi="3")
            ck("บังคับ 3 รายการพอดี", set(three), {key_of(300, 88, 12), key_of(250.5, 100, 49.5)})
            tol = search(target="401", tol="1", hi="2")
            ok("ยอมคลาดเคลื่อน ±1 ทำให้ 400 เข้าเกณฑ์กับเป้า 401", key_of(300, 100) in tol, f"ได้ {list(tol)}")
            neg = search(target="370", hi="3", neg=True)
            ok("เปิดใช้ค่าติดลบแล้ว -30 ถูกนำมาใช้",
               any("-30" in k for k in neg), f"ได้ {list(neg)}")
            cut = search(target="1500000", hi="1", maxv="1000000")
            ck("คัดรายการเกินหนึ่งล้านออก จึงหาไม่เจอ", set(cut), set())

            print("\n── ⑤ ไม่เจอ ต้องบอกว่าไม่เจอ ──")
            none = search(target="999999", hi="4")
            ck("ไม่มีชุดไหนรวมได้ จึงไม่โชว์ชุดมั่ว", set(none), set())
            msg = pg.evaluate("() => document.querySelector('.ms-banner')?.textContent || ''")
            ok("บอกด้วยว่าค้นครบทุกความเป็นไปได้แล้วหรือยัง",
               ("ค้นครบทุกความเป็นไปได้" in msg) or ("หมดเวลา" in msg), f"ได้ {msg[:80]!r}")

            print("\n── ⑥ ดาวน์โหลดผลเป็น Excel แล้วค่าต้องตรงกับที่โชว์ ──")
            shown = search()
            with pg.expect_download() as dl:
                pg.locator(".ws-footer button", has_text="ดาวน์โหลด").first.click()
            path = TMP / "ผลลัพธ์.xlsx"
            dl.value.save_as(str(path))
            wb = openpyxl.load_workbook(path)
            ws = wb.active
            rows = list(ws.iter_rows(min_row=2, values_only=True))
            in_file = {}
            for r in rows:
                in_file.setdefault(r[0], []).append(str(float(r[2])) if float(r[2]) % 1 else str(int(r[2])))
            ck("ไฟล์ที่ดาวน์โหลดมีชุดเท่าที่โชว์บนจอ", len(in_file), len(shown))
            ck("ทุกชุดในไฟล์ตรงกับชุดบนจอ",
               sorted(key_of(*[float(x) for x in v]) for v in in_file.values()), sorted(shown.keys()))

            print("\n── ⑦ โหมดวางตัวเลขเอง (ไม่มีไฟล์) ──")
            pg.goto(f"{base}/#/excel-match-sum", wait_until="networkidle")
            pg.wait_for_selector(".ms-ta", state="attached")
            pg.evaluate("""() => {
              document.querySelector('input[value="paste"]').click();
              const ta = document.querySelector('.ms-ta');
              ta.value = "100\\n250.50\\n49.50\\n300";
              ta.dispatchEvent(new Event('input'));
            }""")
            pg.wait_for_timeout(600)
            disabled = pg.evaluate("() => [...document.querySelectorAll('.ws-footer button')]"
                                   ".find(b => b.textContent.includes('ค้นหา')).disabled")
            ok("ปุ่มค้นหากดได้แม้ไม่มีไฟล์", disabled is False)
            pg.evaluate("() => { document.querySelectorAll('.ws-right input.ms-num')[0].value = '400'; }")
            pg.locator(".ws-footer button", has_text="ค้นหา").first.click()
            pg.wait_for_timeout(800)
            ck("ค้นจากตัวเลขที่วางเองได้", set(sets_on_screen(pg)),
               {key_of(300, 100), key_of(250.5, 100, 49.5)})

            print("\n── ⑧ โหมดอังกฤษ ──")
            pg.evaluate("() => { try { localStorage.setItem('fk-lang','en'); } catch {} }")
            pg.reload(wait_until="networkidle")
            pg.wait_for_timeout(400)
            pg.wait_for_selector(".ms-ta", state="attached")
            pg.evaluate("""() => {
              document.querySelector('input[value="paste"]').click();
              const ta = document.querySelector('.ms-ta');
              ta.value = "100\\n300";
              ta.dispatchEvent(new Event('input'));
              document.querySelectorAll('.ws-right input.ms-num')[0].value = '400';
            }""")
            pg.wait_for_timeout(500)
            pg.locator(".ws-footer button", has_text="Find").first.click()
            pg.wait_for_timeout(800)
            status = pg.evaluate("() => document.querySelector('.status')?.textContent || ''")
            ok("ชุดเดียวต้องเขียนว่า 1 set ไม่ใช่ 1 sets", "1 set " in status and "1 sets" not in status,
               f"ได้ {status!r}")
            thai = pg.evaluate("() => (document.querySelector('.ws-body')?.textContent || '')"
                               ".match(/[\\u0E00-\\u0E7F]+/g) || []")
            ck("ไม่มีภาษาไทยตกค้างในโหมด EN", thai, [])
            pg.evaluate("() => { try { localStorage.removeItem('fk-lang'); } catch {} }")

            ok("ไม่มี error ในคอนโซลตลอดการทดสอบ", not errs, f"เจอ {errs[:3]}")
            ctx.close()
            b.close()
    finally:
        if server:
            server.terminate()

    print(f"\nสรุป: ผ่าน {P} ข้อ, ตก {len(F)} ข้อ")
    for f in F:
        print("  ❌ " + f)
    sys.exit(1 if F else 0)


if __name__ == "__main__":
    main()
