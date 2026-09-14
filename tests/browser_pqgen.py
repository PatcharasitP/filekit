"""โค้ด Power Query ที่เครื่องมือสร้าง ต้องอ่านจบได้โดยไม่ต้องลากแนวนอน

‼️ ที่มา 14/09/2026: ทำเครื่องมือ 3 ตัวแล้วบรรทัดโค้ดล้นกรอบถึง 3 รอบติด
   รอบแรกไม่ได้ใส่กลไกหักบรรทัดเลย รอบสองใส่แต่เดาเกณฑ์ไว้ 78 ตัวอักษร
   (ของจริงกล่องแสดงได้ 61) รอบสามหักบรรทัดโค้ดแล้วแต่ลืมคอมเมนต์ที่ยาว 80 ตัว
   ทุกรอบต้องเปิดจอดูเองถึงจะเห็น เทสนี้จึงมีไว้แทนสายตา

ตรวจ 5 อย่าง ต่อเครื่องมือ ต่อภาษา
   ① กล่องโค้ดต้องไม่ล้นแนวนอน (scrollWidth ไม่เกิน clientWidth)
   ② ‼️ พิสูจน์ตัวตรวจ: ยัดบรรทัดยาวเข้าไปเองแล้วข้อ ① ต้องแดง ไม่งั้นแปลว่าเครื่องตรวจพัง
   ③ ปรับค่าแล้วโค้ดต้องเปลี่ยนจริง ไม่ใช่ค้างค่าเดิม
   ④ แท็บตัวฟังก์ชันต้องโหลดไฟล์ .pq ได้จริง ไม่ใช่ 404
   ⑤ ไม่มี console error ตลอดทั้งชุด

รัน: python3 -m http.server 8899 &  แล้ว python3 tests/browser_pqgen.py
"""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
fails = []
errors = []

# (id ของเครื่องมือ, คลาสกล่องโค้ด, ช่องที่จะแก้เพื่อพิสูจน์ว่าโค้ดเปลี่ยนตาม)
CASES = [
    ("pq-group-concat", ".pqg-code", "GroupProbe"),
    ("pq-to-date", ".pqd-code", "DateProbe"),
    ("pq-pick-date", ".pqp-code", "PickProbe"),
]
LANGS = [("th", "ไทย"), ("en", "อังกฤษ")]


def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label)
    if not ok:
        if detail:
            print("      " + detail)
        fails.append(label)


def overflow(pg, box):
    return pg.evaluate(
        """(sel) => {
          const pre = document.querySelector(sel);
          if (!pre) return null;
          const code = pre.querySelector('code');
          return {
            over: pre.scrollWidth > pre.clientWidth + 1,
            longest: Math.max(...code.textContent.split('\\n').map(l => l.length)),
            text: code.textContent,
          };
        }""",
        box,
    )


def main():
    with sync_playwright() as P:
        b = P.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 900})
        pg = ctx.new_page()
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))

        for lang, lang_th in LANGS:
            print(f"\n━━ ภาษา{lang_th} ━━")
            pg.goto(f"{BASE}/", wait_until="networkidle")
            pg.evaluate("(l) => localStorage.setItem('fk-lang', l)", lang)

            for tid, box, probe in CASES:
                pg.goto(f"{BASE}/#/{tid}", wait_until="networkidle")
                pg.wait_for_selector(box, timeout=20000)
                pg.wait_for_timeout(600)

                got = overflow(pg, box)
                ck(
                    f"{tid} [{lang}] ① โค้ดอ่านจบได้โดยไม่ต้องลากแนวนอน (บรรทัดยาวสุด {got['longest'] if got else '?'})",
                    bool(got) and not got["over"],
                    (got or {}).get("text", "")[:300],
                )

                # ② พิสูจน์ตัวตรวจ: ยัดบรรทัดยาวเข้าไปเอง ข้อ ① ต้องจับได้
                pg.evaluate(
                    """(sel) => {
                      const code = document.querySelector(sel).querySelector('code');
                      code.textContent += '\\n' + 'X'.repeat(200);
                    }""",
                    box,
                )
                rigged = overflow(pg, box)
                ck(
                    f"{tid} [{lang}] ② เครื่องตรวจจับบรรทัดยาวได้จริง",
                    bool(rigged) and rigged["over"],
                    "ยัดบรรทัด 200 ตัวอักษรแล้วยังบอกว่าไม่ล้น แปลว่าเครื่องตรวจพัง",
                )

                # ③ ปรับชื่อคิวรีแล้วโค้ดต้องเปลี่ยนตาม
                pg.reload(wait_until="networkidle")
                pg.wait_for_selector(box, timeout=20000)
                pg.wait_for_timeout(500)
                # ‼️ เครื่องมือจำค่าที่ตั้งไว้ครั้งก่อนใน localStorage (stateKit)
                #    ถ้าใช้ชื่อ probe เดิมทั้งสองภาษา รอบที่สองจะเจอชื่อนั้นค้างอยู่แล้ว
                #    แล้วข้อนี้จะแดงทั้งที่เครื่องมือทำงานถูก จึงต้องแยกชื่อต่อภาษา
                probe_name = f"{probe}{lang.upper()}"
                before = overflow(pg, box)["text"]
                pg.evaluate(
                    """(name) => {
                      const q = document.querySelector('.field input[type=text]');
                      q.value = name;
                      q.dispatchEvent(new Event('input', { bubbles: true }));
                    }""",
                    probe_name,
                )
                pg.wait_for_timeout(300)
                after = overflow(pg, box)
                ck(
                    f"{tid} [{lang}] ③ แก้ชื่อคิวรีแล้วโค้ดเปลี่ยนตาม",
                    after["text"] != before and probe_name in after["text"],
                )
                ck(
                    f"{tid} [{lang}] ③ข ชื่อยาวขึ้นแล้วยังไม่ล้นกรอบ",
                    not after["over"],
                    after["text"][:300],
                )

                # ④ก แท็บ T-SQL ต้องสร้างโค้ดได้ ไม่ใช่ข้อความว่าง และไม่ล้นกรอบ
                pg.get_by_role("button", name="T-SQL").click()
                pg.wait_for_timeout(500)
                sqlgot = overflow(pg, box)
                ck(
                    f"{tid} [{lang}] ④ก แท็บ T-SQL สร้างโค้ดได้ ({len(sqlgot['text'])} ตัวอักษร)",
                    len(sqlgot["text"]) > 60 and "SELECT" in sqlgot["text"].upper(),
                    sqlgot["text"][:200],
                )
                ck(f"{tid} [{lang}] ④ข โค้ด T-SQL ไม่ล้นกรอบ", not sqlgot["over"], sqlgot["text"][:200])

                # ④ แท็บตัวฟังก์ชันต้องได้ไฟล์จริง
                pg.get_by_role("button", name="ตัวฟังก์ชัน" if lang == "th" else "The function").click()
                pg.wait_for_timeout(1200)
                fn = overflow(pg, box)
                ck(
                    f"{tid} [{lang}] ④ แท็บตัวฟังก์ชันโหลดไฟล์ได้ ({len(fn['text'])} ตัวอักษร)",
                    len(fn["text"]) > 1500 and "fn" in fn["text"],
                    fn["text"][:200],
                )

        print("\n── ไม่มี error หลุดออกมา ──")
        ck(f"⑤ ไม่มี console หรือ page error ({len(errors)} รายการ)", not errors, " | ".join(errors[:3]))
        b.close()

    total = len(fails)
    print("\n" + "━" * 60)
    print(f"ผ่านทุกข้อ" if not total else f"ตก {total} ข้อ")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
