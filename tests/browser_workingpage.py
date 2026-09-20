"""หน้าทำงาน (หลังผู้ใช้ใส่ไฟล์แล้ว) ต้องเป็นของผู้ใช้ ไม่ใช่ของโบรชัวร์

‼️ ที่มา 18/09/2026 ส่องเว็บจัดการไฟล์ 15 เว็บด้วยหัววัดเดียวกัน
   iLovePDF: หน้าแรกมีของที่กดได้ 74 ชิ้น -> หน้าทำงานเหลือ 8 ชิ้น
   ตัดทุกอย่างที่ไม่เกี่ยวกับงานตรงหน้าทิ้ง และตรึงปุ่มลงมือทำไว้มุมล่างตลอด
   วัดของเราแล้วพบว่าหลังใส่ไฟล์ ส่วนที่อธิบายเครื่องมือกิน 402px
   ขณะที่พื้นที่ทำงานจริงได้แค่ 238px

เทสนี้ตรวจ 3 อย่าง
   ① แถว "ลองแล้วได้แบบนี้" ต้องหายไปเมื่อมีไฟล์จริงแล้ว
      (ตัวเลขสมมติที่ขัดกับไฟล์จริงที่อยู่ข้างล่าง)
   ② ‼️ ปุ่มลงมือทำต้องอยู่ในสายตาแม้ใส่ไฟล์เยอะ ทั้งจอใหญ่และมือถือ
      เดิมจอใหญ่ไม่ตรึง คอมเมนต์ในโค้ดเขียนว่า "ปุ่มอยู่ในสายตาอยู่แล้ว"
      แต่วัดจริงด้วย 12 ไฟล์ ปุ่มไปอยู่ที่ y=1361 บนจอสูง 950 = หลุดจอ
   ③ ตอนยังไม่มีไฟล์ แถบปุ่มต้องไม่ลอยไปทับอะไร (กันเคส pdf-ocr ที่เคยทับป้ายช่องกรอก)

รัน: tests/run.sh browser_workingpage
"""
import os
import sys
import tempfile
from pathlib import Path
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


def make_pdfs(dirp, n):
    """ไฟล์ PDF เปล่าเล็กที่สุดที่ถูกต้องตามรูปแบบ — ไม่พึ่งไลบรารีภายนอก"""
    body = (b"%PDF-1.4\n"
            b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
            b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
            b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n"
            b"trailer<</Root 1 0 R>>\n%%EOF\n")
    out = []
    for i in range(n):
        p = Path(dirp) / f"t{i + 1}.pdf"
        p.write_bytes(body)
        out.append(str(p))
    return out


print(f"\n━━ หน้าทำงานต้องเป็นของผู้ใช้ ({BASE}) ━━")
with tempfile.TemporaryDirectory() as td:
    files = make_pdfs(td, 12)
    with sync_playwright() as p:
        b = p.chromium.launch()

        # ── ① ตัวอย่างต้องหายเมื่อมีไฟล์จริง
        pg = b.new_page(viewport={"width": 1440, "height": 950})
        pg.goto(f"{BASE}/#pdf-merge", wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_timeout(2400)
        before = pg.evaluate("() => { const t = document.querySelector('.tex');"
                             " return t ? t.getBoundingClientRect().height > 2 : false; }")
        ck("① ก่อนใส่ไฟล์ ต้องเห็นตัวอย่าง 'ลองแล้วได้แบบนี้'", before, True)
        pg.set_input_files("input[type=file]", files[:2])
        pg.wait_for_timeout(4000)
        after = pg.evaluate("() => { const t = document.querySelector('.tex');"
                            " return t ? t.getBoundingClientRect().height > 2 : false; }")
        ck("① หลังใส่ไฟล์ ตัวอย่างต้องหายไป", after, False)
        pg.close()

        # ── ② ปุ่มลงมือทำต้องอยู่ในสายตาแม้ไฟล์เยอะ
        for label, w, h in [("จอใหญ่", 1440, 950), ("มือถือ", 390, 844)]:
            pg = b.new_page(viewport={"width": w, "height": h})
            pg.goto(f"{BASE}/#pdf-merge", wait_until="domcontentloaded", timeout=60000)
            pg.wait_for_timeout(2400)
            pg.set_input_files("input[type=file]", files)
            pg.wait_for_timeout(4500)
            d = pg.evaluate("""() => {
              /* ‼️ โครง v2 ย้ายปุ่มลงมือทำไปไว้ท้ายแผงขวาซึ่งตรึงอยู่แล้วโดยโครงสร้าง
                 จึงไม่มี .actions ลอยอีกต่อไป · เจตนาเดิมของข้อนี้คือ "ปุ่มต้องอยู่ในสายตา
                 แม้ใส่ไฟล์เยอะ" ซึ่งยังตรวจได้เหมือนเดิม แค่เปลี่ยนที่หา (แก้ 21/09/2026) */
              const a = document.querySelector('.s2-side-ft') || document.querySelector('.actions');
              const btn = a && (a.querySelector('.s2-cta') || a.querySelector('.btn:not(.ghost)'));
              if (!btn) return null;
              const r = btn.getBoundingClientRect();
              return {inView: r.top < innerHeight && r.bottom > 0,
                      fullyInView: r.bottom <= innerHeight + 1 && r.top >= -1,
                      pos: getComputedStyle(a).position, rows: document.querySelectorAll('.file-row').length};
            }""")
            ck(f"② {label}: ใส่ {d and d['rows']} ไฟล์แล้วปุ่มลงมือทำยังอยู่ในจอ",
               bool(d and d["inView"]), True)
            # ‼️ v2 ไม่ต้องตรึงแถบปุ่ม เพราะแผงขวาสูงเท่าจอพอดีและไม่เลื่อนทั้งแผง
            # เจตนาจริงของข้อนี้คือ "ปุ่มต้องไม่เลื่อนหลุดไปกับเนื้อหา" ซึ่งวัดได้ตรงกว่า
            # ด้วยพิกัดจริง จึงยอมรับทั้งแบบตรึง และแบบอยู่ในโครงที่ไม่เลื่อน
            ck(f"② {label}: ปุ่มต้องไม่เลื่อนหลุดไปกับเนื้อหา",
               bool(d and (d["pos"] in ("sticky", "fixed") or d["fullyInView"])), True)
            pg.close()

        # ── ④ แผงตั้งค่าแบบแน่น: เมาส์ได้เล็ก นิ้วต้องได้เท่าเดิม
        # ‼️ ถ้าใครเผลอผูกการย่อกับความกว้างจออย่างเดียว มือถือจะได้ของเล็กแล้วกดพลาด
        sizes = {}
        for tag, vw, touch in [("เมาส์", 1440, False), ("นิ้ว-จอใหญ่", 1440, True), ("นิ้ว-มือถือ", 390, True)]:
            ctx = b.new_context(viewport={"width": vw, "height": 950},
                                has_touch=touch, is_mobile=(touch and vw < 500))
            pg = ctx.new_page()
            pg.goto(f"{BASE}/#pbi-bar", wait_until="domcontentloaded", timeout=60000)
            pg.wait_for_timeout(2600)
            try:
                sb = pg.locator("button", has_text="ลองด้วยไฟล์ตัวอย่าง").first
                if sb.is_visible(timeout=900):
                    sb.click()
                    pg.wait_for_timeout(3000)
            except Exception:
                pass
            sizes[tag] = pg.evaluate("""() => {
              /* ‼️ บนมือถือ โครง v2 ซ่อนแผงตั้งค่าไว้หลังปุ่ม "ตัวเลือก" ต้องเปิดก่อนถึงจะวัดได้
                 ถ้าไม่เปิด จะวัดได้ 0 แล้วเข้าใจผิดว่าช่องกรอกหาย ทั้งที่แค่ยังไม่ได้กางแผ่น */
              const sb = document.querySelector('.s2-sheetbtn');
              if (sb && getComputedStyle(sb).display !== 'none') sb.click();
              const n = document.querySelector('.s2-side-bd .field select, .s2-side-bd .field input')
                        || document.querySelector('.ws-right .field select, .ws-right .field input');
              return n ? Math.round(n.getBoundingClientRect().height) : null;
            }""")
            ctx.close()
        ck("④ จอกว้าง+เมาส์ ช่องกรอกในแผงต้องเล็กลง (ต่ำกว่า 36px)",
           bool(sizes["เมาส์"] and sizes["เมาส์"] < 36), True)
        ck("④ จอกว้าง+นิ้วสัมผัส ต้องยังได้ 36px ขึ้นไป",
           bool(sizes["นิ้ว-จอใหญ่"] and sizes["นิ้ว-จอใหญ่"] >= 36), True)
        ck("④ มือถือ+นิ้วสัมผัส ต้องยังได้ 36px ขึ้นไป",
           bool(sizes["นิ้ว-มือถือ"] and sizes["นิ้ว-มือถือ"] >= 36), True)
        print(f"      ขนาดที่วัดได้: {sizes}")

        # ── ③ ยังไม่มีไฟล์ แถบปุ่มต้องไม่ลอยไปทับอะไร
        pg = b.new_page(viewport={"width": 1440, "height": 950})
        pg.goto(f"{BASE}/#pdf-ocr", wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_timeout(2600)
        pos = pg.evaluate("""() => { const a = document.querySelector('.s2-side-ft') || document.querySelector('.actions');
          return a ? getComputedStyle(a).position : 'ไม่มีแถบปุ่ม'; }""")
        ck("③ ยังไม่มีไฟล์ แถบปุ่มต้องไม่ลอย", pos, "static")
        pg.close()
        b.close()

print(f"\nผ่าน {ok} · ตก {fail}")
sys.exit(1 if fail else 0)
