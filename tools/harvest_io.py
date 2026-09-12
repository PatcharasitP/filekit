"""เก็บ "ใส่อะไรเข้าไป ได้อะไรออกมา" ของทุกเครื่องมือ จากการรันจริง

‼️ ทำไมต้องรันจริง ไม่ใช่อ่านจากโค้ด
   ลองดึงชนิดไฟล์ผลลัพธ์ด้วย regex จากซอร์สแล้ว ได้แค่ 18 จาก 41 ตัว
   และที่ได้มาก็ผิด (pbi-bar ขึ้นเป็น csv ทั้งที่จริงได้สเปก Deneb)
   ข้อมูลที่ยืนยันไม่ได้ ห้ามเอาไปแสดงให้ผู้ใช้เห็น จึงต้องวัดจากของจริงเท่านั้น

วิธี: เปิดทุกเครื่องมือในทะเบียน กดปุ่มลองด้วยไฟล์ตัวอย่าง กดปุ่มลงมือทำ
      แล้วอ่านแถวไฟล์เข้าและแถวผลลัพธ์จาก DOM จริง
เครื่องมือที่รันอัตโนมัติไม่ได้ (ต้องเลือกหน้า/ป้อนเอง) จะไม่มีตัวอย่าง ซึ่งถูกต้องแล้ว
ดีกว่าเดาแล้วโชว์ของผิด

ผลลัพธ์: src/toolio.js  (ไฟล์นี้ถูกสร้างจากสคริปต์ ห้ามแก้มือ)
รัน: python3 -m http.server 8971 &  แล้ว python3 tools/harvest_io.py
"""
import json, os, re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ.get("FK_BASE", "http://localhost:8971")
reg = (ROOT / "src/registry.js").read_text(encoding="utf-8")
IDS = [m.group(1) for m in re.finditer(r'\{\s*id:"([\w-]+)",\s*group:', reg)]
print(f"เครื่องมือในทะเบียน {len(IDS)} ตัว")

READ = """() => {
  const pick = e => ({
    name: (e.querySelector('.f-name,.r-name strong') || {}).textContent || '',
    size: (e.querySelector('.f-size,.r-size') || {}).textContent || '',
    meta: (e.querySelector('.f-pages,.r-name small') || {}).textContent || '',
  });
  return {
    ins: [...document.querySelectorAll('.file-row')].map(pick),
    outs: [...document.querySelectorAll('.result')].map(pick),
    /* เครื่องมือสายข้อความ/ตาราง ไม่ได้คืนเป็นไฟล์ จึงไม่มีแถว .result
       เก็บสิ่งที่ผู้ใช้เห็นว่าเป็น "ผลที่ได้" ไว้ด้วย จะได้รู้ว่าเครื่องมือทำงานจริง */
    okMsg: [...document.querySelectorAll('.status.ok')].map(e => e.innerText.trim()).filter(Boolean),
    table: document.querySelectorAll('.xt-wrap table tbody tr, .tbl tbody tr').length,
    err: [...document.querySelectorAll('.status.err')].map(e => e.innerText.trim()).filter(Boolean),
  };
}"""

def harvest(pg, lang):
    """เก็บผลของทุกเครื่องมือในภาษาหนึ่ง
    ‼️ ต้องเก็บทั้งไทยและอังกฤษ เพราะข้อความอย่าง "3 หน้า" กับ "3 pages" มาจากตัวเครื่องมือเอง
       ถ้าเก็บแค่ไทยแล้วเอาไปโชว์ โหมดอังกฤษจะมีไทยตกค้าง (browser_lang จับได้)"""
    out = {}
    for i, tid in enumerate(IDS, 1):
        rec = {"id": tid}
        try:
            pg.goto("about:blank")
            pg.goto(f"{BASE}/#/{tid}", wait_until="networkidle", timeout=30000)
            pg.wait_for_timeout(700)
            # ‼️ ชื่อปุ่มเปลี่ยนตามภาษา เก็บรอบอังกฤษแล้วหาด้วยชื่อไทยไม่เจอสักตัว
            clicked = pg.evaluate("""() => {
                const b = [...document.querySelectorAll('button')]
                  .find(e => e.offsetParent && /ลองด้วยไฟล์ตัวอย่าง|Try a sample/i.test(e.textContent));
                if (!b) return false; b.click(); return true;
            }""")
            if not clicked:
                print(f"{i:>3}. {tid:<24} ไม่มีปุ่มไฟล์ตัวอย่าง")
                continue
            pg.wait_for_timeout(4200)
            before = pg.evaluate(READ)
            # ปุ่มลงมือทำตัวแรกที่กดได้จริง
            # ‼️ ห้ามกดปุ่มคัดลอก/ดาวน์โหลด เพราะมันไม่ใช่การ "ลงมือทำ"
            #    รอบแรกกดโดนแล้วได้ error เรื่องคลิปบอร์ด จนนึกว่าเครื่องมือพัง
            name = pg.evaluate("""() => {
                const skip = /คัดลอก|Copy|ดาวน์โหลด|Download|โหลดไว้|ล้าง|Clear|รีเซ็ต|Reset/i;
                const s = document.querySelector('.actions, .ws-footer');
                if (!s) return null;
                const b = [...s.querySelectorAll('button.btn')]
                  .find(e => e.offsetParent && !e.disabled && !e.classList.contains('ghost')
                             && !skip.test(e.textContent));
                if (!b) return null; b.click(); return b.textContent.trim();
            }""")
            if not name:
                print(f"{i:>3}. {tid:<24} ปุ่มลงมือทำยังกดไม่ได้ (ต้องตั้งค่าเอง)")
                continue
            pg.wait_for_timeout(8000)
            after = pg.evaluate(READ)
            # ‼️ บางเครื่องมือขึ้นข้อความสไตล์ error เพื่อ "รายงานสิ่งที่ตรวจพบ" ไม่ใช่ความล้มเหลว
            #    (word-clean ขึ้นว่า "พบร่องรอยที่ควรล้างใน 2 จาก 2 ไฟล์" ซึ่งคือผลที่ถูกต้อง)
            #    ถ้ามีผลลัพธ์ออกมาแล้ว อย่าตัดสินว่าพัง
            if after["err"] and not after["outs"]:
                print(f"{i:>3}. {tid:<24} ‼️ error: {after['err'][0][:50]}")
                continue
            if not after["outs"]:
                note = (after["okMsg"][0][:46] if after["okMsg"] else
                        (f"ตาราง {after['table']} แถว" if after["table"] else "ไม่มีผลลัพธ์ที่อ่านได้"))
                print(f"{i:>3}. {tid:<24} ไม่ได้คืนเป็นไฟล์ ({note})")
                continue
            rec["btn"] = name
            rec["ins"] = [x for x in before["ins"] if x["name"].strip()]
            rec["outs"] = after["outs"]
            out[tid] = rec
            ins = ", ".join(f"{x['name']}" for x in rec["ins"][:2]) or "-"
            o = rec["outs"][0]
            print(f"{i:>3}. {tid:<24} {ins[:34]:<34} → {o['name'][:28]:<28} {o['size']} {o['meta']}")
        except Exception as e:
            print(f"{i:>3}. {tid:<24} ‼️ {str(e).splitlines()[0][:60]}")
    return out

both = {}
with sync_playwright() as p:
    br = p.chromium.launch()
    for lang in ("th", "en"):
        ctx = br.new_context(viewport={"width": 1440, "height": 950},
                             permissions=["clipboard-read", "clipboard-write"])
        pg = ctx.new_page()
        pg.goto(BASE, wait_until="networkidle", timeout=30000)
        pg.wait_for_timeout(800)
        if lang == "en":
            pg.get_by_role("button", name="English", exact=True).click()
            pg.wait_for_timeout(2500)
        print(f"\n════ ภาษา {lang} ════")
        both[lang] = harvest(pg, lang)
        ctx.close()
    br.close()

(ROOT / "tools/toolio.json").write_text(json.dumps(both, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"\nเก็บได้ ไทย {len(both['th'])} อังกฤษ {len(both['en'])} จาก {len(IDS)} เครื่องมือ → tools/toolio.json")
