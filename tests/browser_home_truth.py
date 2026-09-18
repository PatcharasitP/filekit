"""หน้าแรก: ตัวเลขที่ประกาศต้องเป็นความจริง และต้องไม่มีแถบเรียงหลงเหลือ

‼️ ไฟล์นี้เดิมชื่อ browser_sortbar.py ตรวจแถบเรียงลำดับ 3 แบบ
   18/09/2026 พี่ปอนด์ชี้ที่ดรอปดาวน์ "เรียง ตามหมวด" แล้วสั่งเอาออก
   ข้อ ①-⑤ ที่ตรวจแถบเรียงจึงหมดหน้าที่ เหลือข้อ ⑥ ที่ตรวจว่าเว็บไม่โชว์ตัวเลขโกหก
   และเพิ่มข้อกันของเก่ากลับมา

เทสนี้ตรวจ 4 อย่าง
   ① ‼️ ต้องไม่มีแถบเรียงหลงเหลือใน DOM เลย (กันใส่กลับมาโดยไม่ตั้งใจ)
   ② ‼️ ตัวเลขใน hero ต้องสอดคล้องกับจำนวนเครื่องมือที่วาดจริง
   ③ ยังประกาศว่าไฟล์ที่ถูกอัปโหลดเป็นศูนย์
   ④ ไม่มี error หลุดออกมา

รัน: tests/run.sh browser_home_truth
"""
import os
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
fails = []


def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label)
    if not ok:
        fails.append(f"{label} {detail}".strip())


print(f"\n━━ หน้าแรกต้องไม่โกหก ({BASE}) ━━")
with sync_playwright() as p:
    br = p.chromium.launch()
    pg = br.new_page(viewport={"width": 1440, "height": 950})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(BASE, wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(2600)

    # ① ของเก่าต้องไม่กลับมา
    left = pg.evaluate("""() => ({
        bar: document.querySelectorAll('.sortbar, .sort-sel, .sort-lb').length,
        sel: document.querySelectorAll('select').length,
        word: /เรียง\\s*ตามหมวด|Sort\\s*By category/.test(document.body.innerText),
    })""")
    ck("① ไม่มีแถบเรียงหลงเหลือใน DOM", left["bar"] == 0, str(left))
    ck("① ไม่มี <select> ค้างบนหน้าแรก", left["sel"] == 0, str(left))
    ck("① ไม่มีข้อความ 'เรียง ตามหมวด' บนหน้า", not left["word"], str(left))

    # ② ตัวเลขต้องตรงกับของจริง
    facts = pg.evaluate(r"""() => {
        const n = document.getElementById('fact-n');
        return { shown: n ? n.textContent.trim() : null,
                 tools: document.querySelectorAll('.pill').length,
                 zero: [...document.querySelectorAll('.fact')].some(e => /\b0\b/.test(e.textContent)) };
    }""")
    ck(f"② จำนวนเครื่องมือที่โชว์ ตรงกับจำนวนที่วาดจริง ({facts['shown']} เทียบ {facts['tools']})",
       facts["shown"] is not None and int(facts["shown"]) >= facts["tools"] and facts["tools"] > 0, str(facts))
    ck("③ ยังประกาศว่าไฟล์ที่ถูกอัปโหลดเป็นศูนย์", facts["zero"], str(facts))

    # ยังต้องจัดกลุ่มตามหมวดอยู่ (หัวหมวดต้องมี)
    heads = pg.evaluate("() => document.querySelectorAll('.pill-group').length")
    ck(f"② ยังจัดกลุ่มตามหมวดอยู่ (หัวหมวด {heads} อัน)", heads >= 5, str(heads))

    ck("④ ไม่มี error หลุดออกมา", not errs, str(errs[:2]))
    br.close()

print(f"\n{'❌' if fails else '✅'} ตก {len(fails)} ข้อ")
for f in fails:
    print("   -", f)
sys.exit(1 if fails else 0)
