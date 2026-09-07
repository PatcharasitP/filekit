import sys, re, pathlib
from playwright.sync_api import sync_playwright
BASE=__import__("os").environ.get("FK_BASE", "http://localhost:8899")  # ตั้ง FK_BASE เพื่อยิงใส่เว็บจริง
REG = pathlib.Path(__file__).resolve().parent.parent / "src/registry.js"
ids = re.findall(r'id:"([\w-]+)"', REG.read_text(encoding="utf-8"))
bad=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":1280,"height":1000})
    errs=[]
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
    for i,t in enumerate(ids,1):
        errs.clear()
        pg.goto("about:blank"); pg.goto(f"{BASE}/#/{t}", wait_until="networkidle")
        try: pg.wait_for_selector(".dz, .tool-head", timeout=12000)
        except Exception as e: bad.append((t,"ไม่ขึ้นหน้าเครื่องมือ")); print(f"  ❌ {t}"); continue
        head = pg.locator(".tool-head").inner_text() if pg.locator(".tool-head").count() else ""
        if pg.locator(".tool-ico .ico-svg").count() != 1:
            bad.append((t, "ยังไม่มีไอคอนวาดเอง (ตกไปใช้อีโมจิ)")); print(f"  ❌ {t} — ไม่มีไอคอน"); continue
        nxt = pg.locator(".next-card").count()
        if nxt < 2: bad.append((t, f"แถว 'ทำอะไรต่อดี' มีแค่ {nxt} ตัว")); print(f"  ❌ {t} — next {nxt}"); continue
        hrefs = pg.eval_on_selector_all(".next-card", "els => els.map(e => e.getAttribute('href'))")
        if any(h == "#/" + t for h in hrefs): bad.append((t, "แนะนำวนกลับหาตัวเอง")); print(f"  ❌ {t} — วนกลับหาตัวเอง"); continue
        real=[e for e in errs if "favicon" not in e.lower()]
        if real: bad.append((t, real[0][:110])); print(f"  ❌ {t}  — {real[0][:70]}")
        elif not head.strip(): bad.append((t,"หัวเครื่องมือว่าง")); print(f"  ❌ {t}")
        else: print(f"  ✅ {i:2}/{len(ids)} {t}  · {head.splitlines()[0][:40]}")
    b.close()
print("\n"+"━"*54)
print(f"เปิดผ่าน {len(ids)-len(bad)}/{len(ids)} เครื่องมือ")
for t,m in bad: print(f"  ❌ {t}: {m}")
sys.exit(1 if bad else 0)
