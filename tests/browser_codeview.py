"""โค้ดที่ผู้ใช้จะคัดลอกไปใช้ ต้องเห็นได้ก่อนกดคัดลอก

‼️ ที่มา งานวิจัย 11/09/2026 เปิดดูของจริง 12 เว็บที่ทำงานแบบเดียวกัน
   (regex101, crontab.guru, sqlformat.org, cssgradient.io, curlconverter,
    shadcn/ui, Tailwind Play, Carbon, Vega-Lite Editor, Postman, Hoppscotch, CodePen)
   **ไม่มีเว็บไหนซ่อนผลลัพธ์ไว้หลังปุ่มคัดลอกเลยสักที่** ทุกที่โชว์เต็มในกล่องที่เลื่อนดูได้
   ส่วน FileKit วัดแล้วพบว่าสเปก Deneb 29KB ไม่ได้แสดงให้ดูเลย
   ผู้ใช้กดคัดลอกโดยไม่เคยเห็นว่าได้อะไรไป

เทสนี้ตรวจ 5 อย่าง
   ① มีกล่องแสดงสเปก และบอกขนาดตั้งแต่ยังไม่กาง
   ② ‼️ ยังไม่กางต้องยังไม่วาดโค้ด (โค้ด 894 บรรทัดวาดตอนเปิดหน้าจะหน่วงเปล่า ๆ)
   ③ กางแล้วเห็นโค้ดจริงและมีไฮไลต์สี
   ④ ‼️ เนื้อโค้ดต้องเปลี่ยนตามค่าที่ปรับจริง ไม่ใช่ค้างค่าเดิม
   ⑤ ความสูงกล่องต้องถูกคุมไว้ ไม่ดันหน้ายาวจนหาปุ่มอื่นไม่เจอ

รัน: python3 -m http.server 8899 &  แล้ว python3 tests/browser_codeview.py
"""
import re, sys
from playwright.sync_api import sync_playwright

BASE = __import__("os").environ.get("FK_BASE", "http://localhost:8899")
fails = []
CASES = [("pbi-bar", "ความหนาแท่ง", "barThickness", "0.4", "0.9"),
         ("pbi-donut", "ความหนาวง", "donutThickness", "0.2", "0.44")]
MAX_H = 520   # เพดานความสูงกล่องโค้ด

def ck(label, ok, detail=""):
    print(("  ✅ " if ok else "  ❌ ") + label)
    if not ok:
        if detail: print("      " + detail)
        fails.append(label)

def main():
    with sync_playwright() as P:
        b = P.chromium.launch()
        pg = b.new_context(viewport={"width": 1440, "height": 950}).new_page()
        for tid, label, param, v1, v2 in CASES:
            print(f"\n── {tid} ──")
            pg.goto("about:blank")
            pg.goto(f"{BASE}/#/{tid}", wait_until="networkidle")
            pg.wait_for_selector(".cv", timeout=20000)
            pg.wait_for_timeout(1300)

            before = pg.evaluate("""() => {
              const cv = document.querySelector('.cv');
              return { open: cv.open, meta: (cv.querySelector('.cv-meta')||{}).textContent || '',
                       painted: (cv.querySelector('.cv-pre')||{}).childElementCount || 0 };
            }""")
            ck(f"{tid}: บอกขนาดโค้ดตั้งแต่ยังไม่กาง ({before['meta']})",
               bool(re.search(r"\d", before["meta"])) and ("บรรทัด" in before["meta"] or "lines" in before["meta"]))
            # ‼️ ถ้าวาดตั้งแต่ยังไม่กาง แปลว่าเสียแรงวาด 894 บรรทัดฟรีทุกครั้งที่เปิดหน้า
            ck(f"{tid}: ยังไม่กางต้องยังไม่วาดโค้ด (วาดไป {before['painted']} ชิ้น)",
               not before["open"] and before["painted"] == 0)

            pg.click(".cv-sum"); pg.wait_for_timeout(700)
            opened = pg.evaluate("""() => {
              const pre = document.querySelector('.cv-pre');
              return { chars: pre.textContent.length, keys: pre.querySelectorAll('.cv-key').length,
                       h: Math.round(pre.getBoundingClientRect().height) };
            }""")
            ck(f"{tid}: กางแล้วเห็นโค้ดจริง ({opened['chars']:,} ตัวอักษร) และมีไฮไลต์ ({opened['keys']} คีย์)",
               opened["chars"] > 2000 and opened["keys"] > 50, str(opened))
            ck(f"{tid}: ความสูงกล่องโค้ดไม่เกิน {MAX_H}px (ได้ {opened['h']}px)", opened["h"] <= MAX_H)

            # ‼️ เนื้อโค้ดต้องเปลี่ยนตามค่าจริง ไม่ใช่ค้างค่าเดิม
            read = """(p) => {
              const t = document.querySelector('.cv-pre').textContent;
              const m = t.match(new RegExp('"name":\\\\s*"' + p + '"[\\\\s\\\\S]{0,140}?"value":\\\\s*([\\\\d.]+)'));
              return m ? m[1] : null;
            }"""
            pg.get_by_label(label).fill(v1); pg.wait_for_timeout(600)
            got1 = pg.evaluate(read, param)
            pg.get_by_label(label).fill(v2); pg.wait_for_timeout(600)
            got2 = pg.evaluate(read, param)
            ck(f"{tid}: เนื้อโค้ดเปลี่ยนตามค่าที่ปรับจริง ({got1} แล้ว {got2})",
               got1 == v1 and got2 == v2, f"คาด {v1} แล้ว {v2}")
        b.close()

    print("\n" + "━" * 54)
    print(f"ตก {len(fails)} ข้อ" if fails else "ผ่านทุกข้อ")
    sys.exit(1 if fails else 0)

main()
