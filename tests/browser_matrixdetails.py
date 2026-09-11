"""เครื่องมือรายละเอียดหลายคอลัมน์ในช่องเดียวของ Matrix

‼️ ที่มา พี่ปอนด์ส่งคลิป SQLBI "Show transaction details on matrix visual in Power BI"
   มาให้ดู แล้วสั่งว่า "คิดท่าที่ดีที่สุด แล้วทำมาเพิ่มเครื่องมือให้ Customize ได้ทุก Data Type"
   จากนั้นทักเพิ่มว่า Matrix จริงมีหัวแถวหลายชั้น และคอลัมน์รหัสซ้ำได้หลายแถว
   พร้อมถามว่า "มันจะเอา Scope ตัวในสุดมาถูกไหม" ซึ่งถูกต้อง

เทสนี้ตรวจ 6 อย่าง
   ① เปิดหน้าได้ ไม่มี error หลุด (‼️ ดักบั๊ก TDZ ที่เคยทำให้ฟังก์ชันไม่ถูกสร้าง)
   ② ใส่ไฟล์แล้วอ่านคอลัมน์ได้ และมีรายการชั้นหัวแถว
   ③ ‼️ เพิ่มชั้นแล้ว ISINSCOPE ต้องย้ายไปผูกกับชั้นในสุด ไม่ใช่ค้างที่ชั้นแรก
   ④ พรีวิวต้องจับกลุ่มด้วยหัวแถวครบทุกชั้น ไม่ใช่ชั้นเดียว
   ⑤ ‼️ ฟิลด์ที่ไม่ใช่ข้อความต้องถูกห่อ FORMAT เสมอ ไม่งั้นยอด 0 หายเงียบ ๆ
   ⑥ คัดลอกแล้วได้สูตรสะอาด ไม่มีแท็ก HTML ปน

รัน: python3 -m http.server 8899 &  แล้ว python3 tests/browser_matrixdetails.py
"""
import os, re, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
fails = []

def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label)
    if not ok:
        fails.append(label + (f" — {detail}" if detail else ""))

def code(pg):
    return pg.evaluate("() => { const e = document.querySelector('.pmd-code code'); return e ? e.textContent : ''; }")

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={"width": 1440, "height": 950},
                         permissions=["clipboard-read", "clipboard-write"])
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)

    pg.goto(f"{BASE}/#/pbi-matrix-details", wait_until="networkidle")
    pg.wait_for_timeout(1400)
    ck("① เปิดหน้าเครื่องมือได้", "Matrix" in pg.title(), pg.title())

    pg.get_by_role("button", name="ลองด้วยไฟล์ตัวอย่าง").click()
    pg.wait_for_timeout(4200)
    cols = pg.evaluate("() => [...document.querySelectorAll('.pmd-col-name')].map(e => e.textContent)")
    lv = pg.evaluate("() => [...document.querySelectorAll('.pmd-level-name')].map(e => e.textContent)")
    ck(f"② อ่านคอลัมน์จากไฟล์ได้ {len(cols)} คอลัมน์ และมีชั้นหัวแถว {len(lv)} ชั้น",
       len(cols) >= 10 and len(lv) == 1, f"cols={len(cols)} levels={lv}")

    first = code(pg)
    m1 = re.search(r"ISINSCOPE \( .*?\[(.+?)\] \)", first)
    ck(f"③ ตอนชั้นเดียว ผูก ISINSCOPE กับ {m1.group(1) if m1 else '?'}",
       bool(m1) and m1.group(1) == lv[0], f"ได้ {m1.group(1) if m1 else 'ไม่เจอ'} ควรเป็น {lv[0]}")

    # เพิ่มชั้นในสุด แล้ว ISINSCOPE ต้องย้ายตาม
    added = pg.evaluate("""() => {
        const sels = [...document.querySelectorAll('.ws-right select')];
        const s = sels.find(x => [...x.options].some(o => o.textContent.trim() === 'ลำดับ'));
        if (!s) return null;
        s.value = [...s.options].find(o => o.textContent.trim() === 'ลำดับ').value;
        s.dispatchEvent(new Event('change', { bubbles: true }));
        [...document.querySelectorAll('.ws-right button')].find(b => b.textContent.includes('เพิ่มชั้น')).click();
        return 'ลำดับ';
    }""")
    pg.wait_for_timeout(1400)
    lv2 = pg.evaluate("() => [...document.querySelectorAll('.pmd-level-name')].map(e => e.textContent)")
    second = code(pg)
    m2 = re.search(r"ISINSCOPE \( .*?\[(.+?)\] \)", second)
    ck(f"③ เพิ่มชั้นแล้ว ISINSCOPE ย้ายไปชั้นในสุด ({lv2[-1] if lv2 else '?'})",
       len(lv2) == 2 and bool(m2) and m2.group(1) == lv2[-1],
       f"ชั้น={lv2} ผูกกับ={m2.group(1) if m2 else 'ไม่เจอ'}")
    ck("③ ต้องมี ISINSCOPE ตัวเดียว ไม่ซ้อนทุกชั้น",
       len(re.findall(r"ISINSCOPE", second)) == 1, f"เจอ {len(re.findall(r'ISINSCOPE', second))} ตัว")
    ck("③ ชั้นในสุดต้องถูกทำเครื่องหมายให้เห็นว่าเป็นตัวที่ผูกอยู่",
       pg.evaluate("""() => { const l = [...document.querySelectorAll('.pmd-level')];
           return l.length > 0 && l[l.length - 1].classList.contains('inner'); }"""))

    # ④ พรีวิวต้องมีคอลัมน์หัวแถวครบทุกชั้น
    pg.evaluate("() => document.querySelector(\".pmd-tabs input[value='preview']\").click()")
    pg.wait_for_timeout(1400)
    th = pg.evaluate("() => [...document.querySelectorAll('.pmd-preview th')].map(e => e.textContent)")
    ck(f"④ พรีวิวจับกลุ่มด้วยหัวแถวครบ {len(lv2)} ชั้น (หัวตาราง {th})",
       len(th) == len(lv2) + 1 and th[:len(lv2)] == lv2, f"ได้ {th}")

    # ⑤ ฟิลด์ที่ไม่ใช่ข้อความต้องถูกห่อ FORMAT
    pg.evaluate("() => document.querySelector(\".pmd-tabs input[value='dax']\").click()")
    pg.wait_for_timeout(900)
    dax = code(pg)
    ck("⑤ ฟิลด์ที่ไม่ใช่ข้อความถูกห่อ FORMAT (ยอด 0 กับ FALSE จึงไม่หาย)",
       "FORMAT (" in dax, "ไม่พบ FORMAT ในสูตรเลย")
    ck("⑤ ตัวกรองค่าว่างของ SQLBI ยังอยู่ครบ", '[Value] <> ""' in dax)

    # ⑥ คัดลอกต้องได้สูตรสะอาด
    pg.evaluate("""() => [...document.querySelectorAll('button')]
        .find(e => e.offsetParent && /คัดลอก/.test(e.textContent)).click()""")
    pg.wait_for_timeout(700)
    clip = pg.evaluate("() => navigator.clipboard.readText()")
    ck(f"⑥ คัดลอกได้สูตรตรงกับที่ตาเห็น ({len(clip)} ตัวอักษร)",
       clip == dax and "<i" not in clip, f"ยาว {len(clip)} เทียบ {len(dax)}")

    ck("ไม่มี error หลุดออกมาตลอดทั้งชุด", not errs, str(errs[:2]))
    br.close()

print(f"\n{'❌' if fails else '✅'} ตก {len(fails)} ข้อ")
for f in fails: print("   -", f)
sys.exit(1 if fails else 0)
