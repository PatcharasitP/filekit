"""กล่องรับไฟล์แบบครั้งละไฟล์เดียว ได้ไฟล์มาหลายใบ (ทำอะไรต่อดี หรือลากหลายไฟล์) ต้องบอกว่าใช้ใบไหน ไม่ได้ใช้ใบไหน
ที่มา 07/11/2026 ฟ้ากดเส้นทางจริง word-to-pdf ได้ PDF 2 ใบ แล้วกดการ์ด แยกไฟล์ PDF หน้าใหม่รับแค่ใบแรก
ใบที่สองหายเงียบ (ui.js add ใช้ usable.slice(0, 1)) คนใช้คิดว่าทั้งสองใบตามมา
ใช้: FK_BASE=http://127.0.0.1:<พอร์ต> ../.venv/bin/python tests/browser_single_drop_note.py"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
bad = 0
def check(name, ok, d=""):
    global bad
    bad += 0 if ok else 1
    print(("  ✅ " if ok else "  ❌ ") + name + (f"  [{str(d)[:220]}]" if not ok else ""), flush=True)

with sync_playwright() as pw:
    b = pw.chromium.launch(); errs = []
    p = b.new_page(viewport={"width": 1280, "height": 900}, accept_downloads=True); p.on("pageerror", lambda e: errs.append(str(e)))
    p.goto(f"{BASE}/#/word-to-pdf"); p.wait_for_selector("button.s2-link", timeout=20000); p.wait_for_timeout(500)
    p.locator("#tool button:visible", has_text="ลองด้วยไฟล์ตัวอย่าง").first.click(); p.wait_for_timeout(2500)
    p.locator("#tool button.s2-cta:visible").first.click()
    p.wait_for_function("() => document.querySelectorAll('#tool .s2-side-res .result').length >= 2", timeout=60000); p.wait_for_timeout(800)
    names = p.evaluate("() => [...document.querySelectorAll('#tool .s2-side-res .result strong')].map(e => e.textContent.trim())")
    p.locator("#tool a.next-card:visible", has_text="แยกไฟล์ PDF").first.click(); p.wait_for_timeout(2500)
    got = p.evaluate("async () => { const m = await import('./src/ui.js'); return (m.fileState().input || []).map(f => f.name) }")
    txt = p.evaluate("() => document.querySelector('#tool').innerText")
    check("เครื่องมือไฟล์เดียวรับใบแรกไว้ทำงาน", len(got) == 1 and got[0] == names[0], {"got": got, "names": names})
    rest = [n for n in names if n not in got]
    check("บอกชื่อไฟล์ที่ไม่ได้ใช้ให้เห็นบนจอ", rest and all(n in txt for n in rest), {"rest": rest})
    check("บอกว่าเครื่องมือนี้รับครั้งละไฟล์เดียว", "ครั้งละ 1 ไฟล์" in txt, txt[:200])
    check("ไม่มี error ในหน้า", not errs, errs[:2])
    b.close()
print(f"\nbrowser_single_drop_note: {'ผ่านหมด' if not bad else f'ตก {bad}'}")
sys.exit(1 if bad else 0)
