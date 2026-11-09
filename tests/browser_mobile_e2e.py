"""ใช้งานจริงบนมือถือจนได้ไฟล์ (เฟส 2 เทสมุมอื่น 09/11/2026)
browser_mobile ตรวจแค่หน้าตา (ล้นจอ ปุ่มเล็ก) เทสนี้กดใช้งานจริงบนเครื่องยนต์ของมือถือแต่ละรุ่น
  iPhone 15 = WebKit, Pixel 7 = Chromium (โน้ตคลัง จำลองมือถือต้องเปิดตาม default_browser_type)
ทุกเครื่องมือที่มีปุ่ม ลองด้วยไฟล์ตัวอย่าง: ใส่ตัวอย่าง → กดปุ่มลงมือทำ (ปุ่มเงา .s2-cta ที่คนใช้กดจริง)
  → กด ดาวน์โหลด ที่แถวผลลัพธ์แรก → ไฟล์ที่ได้ต้องเปิดได้จริงตามชนิด
  PDF เปิดด้วย PyMuPDF ได้อย่างน้อย 1 หน้า , docx xlsx pptx zip ต้องเป็น zip ที่ไม่เสีย
  PNG JPEG WEBP เปิดด้วย Pillow ได้ , csv txt json ต้องถอดเป็น UTF-8 ได้และไม่ว่าง
เครื่องมือที่ต้องตั้งค่าเองก่อนกด หรือไม่คืนเป็นไฟล์ (ผลเป็นข้อความ ตาราง) จดเป็น ข้าม พร้อมเหตุผล ไม่นับตก
ใช้: FK_BASE=http://127.0.0.1:PORT python3 tests/browser_mobile_e2e.py
     E2E_ONLY=pdf-merge,excel-merge ไล่เฉพาะบางตัว , E2E_DEVICES="iPhone 15" เลือกรุ่น
     E2E_BREAK=1 ทำให้ไฟล์ที่ดาวน์โหลดเสียก่อนตรวจ (ตัดเหลือครึ่ง) ใช้พิสูจน์ว่าตัวตรวจแดงเป็น
"""
import io, json, os, re, sys, pathlib, tempfile, zipfile
from playwright.sync_api import sync_playwright
sys.stdout.reconfigure(line_buffering=True)  # ผลออกทีละบรรทัด รอบเต็ม 09/11 หมดเวลาแล้ว log ว่างทั้งไฟล์

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = os.environ.get("FK_BASE", "http://localhost:8971").rstrip("/")
reg = (ROOT / "src/registry.js").read_text(encoding="utf-8")
TOOLS = [m.group(1) for m in re.finditer(r'\{\s*id:"([\w-]+)",\s*group:', reg)]
if os.environ.get("E2E_ONLY"):
    TOOLS = [t for t in TOOLS if t in os.environ["E2E_ONLY"].split(",")]
# ‼️ ไล่ครบทุกเครื่องมือใช้ราว 35 นาที เกินเพดาน 600 วินาทีของ runp.sh (รอบเต็ม 09/11/2026 หมดเวลา)
#    ชุดใหญ่จึงไล่ชุดตัวแทนที่ครอบชนิดไฟล์หลักและเคยมีบั๊ก ไล่ครบใส่ E2E_FULL=1
CORE = ["pdf-merge", "pdf-split", "pdf-compress", "pdf-page-numbers", "pdf-to-images", "excel-merge",
        "excel-csv", "word-to-pdf", "image-convert", "pdf-watermark"]
if not os.environ.get("E2E_ONLY") and os.environ.get("E2E_FULL") != "1":
    TOOLS = [t for t in CORE if t in TOOLS]
DEVICES = [d.strip() for d in os.environ.get("E2E_DEVICES", "iPhone 15,Pixel 7").split(",") if d.strip()]
BREAK = os.environ.get("E2E_BREAK") == "1"
OUT = pathlib.Path(tempfile.mkdtemp(prefix="fk-e2e-"))

CLICK_SAMPLE = """() => { const b = [...document.querySelectorAll('button')]
  .find((e) => e.offsetParent && /ลองด้วยไฟล์ตัวอย่าง/.test(e.textContent)); if (!b) return false; b.click(); return true }"""
# ปุ่มลงมือทำ: ปุ่มเงาในแผง (ทางที่คนใช้กดจริง) ก่อน ไม่มีค่อยหาในกล่อง .actions .ws-footer เหมือน harvest_io
CLICK_GO = """() => { const skip = /คัดลอก|ดาวน์โหลด|โหลดไว้|ล้าง|รีเซ็ต|ตัวเลือก/;
  const vis = (e) => e.offsetParent && !e.disabled && !skip.test(e.textContent);
  let b = [...document.querySelectorAll('.s2-cta-row button.s2-cta')].find(vis);
  if (!b) { const s = document.querySelector('.actions, .ws-footer');
    if (s) b = [...s.querySelectorAll('button.btn')].find((e) => vis(e) && !e.classList.contains('ghost')) }
  if (!b) return null; b.click(); return b.textContent.trim() }"""


def check_file(path):
    """คืน (ผ่านไหม, รายละเอียด) ตามชนิดไฟล์จากนามสกุล"""
    data = path.read_bytes()
    if not data:
        return False, "ไฟล์ว่าง 0 ไบต์"
    ext = path.suffix.lower()
    try:
        if ext == ".pdf":
            import fitz
            # ‼️ 09/11/2026 พิสูจน์แดง: PDF ตัดครึ่ง PyMuPDF ซ่อมเองแล้วนับได้ 5 หน้าเท่าเดิม นับหน้าอย่างเดียวผ่านหลอก
            #    ต้องไม่ต้องซ่อม , ท้ายไฟล์มี %%EOF , และวาดทุกหน้าได้
            doc = fitz.open(stream=data, filetype="pdf"); n = doc.page_count; repaired = bool(getattr(doc, "is_repaired", False))
            for pgn in doc: pgn.get_pixmap(dpi=20)
            doc.close()
            eof = b"%%EOF" in data[-2048:]
            ok = n > 0 and not repaired and eof
            return ok, f"PDF {n} หน้า" + ("" if ok else f" (ต้องซ่อม {repaired} , ท้ายไฟล์มี %%EOF {eof})")
        if ext in (".docx", ".xlsx", ".pptx", ".zip", ".odt"):
            z = zipfile.ZipFile(io.BytesIO(data)); bad = z.testzip(); n = len(z.namelist())
            return bad is None and n > 0, f"zip {n} ไฟล์ข้างใน" + (f" เสียที่ {bad}" if bad else "")
        if ext in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
            from PIL import Image
            im = Image.open(io.BytesIO(data)); im.load()
            return im.width > 0, f"รูป {im.width}x{im.height}"
        if ext in (".csv", ".txt", ".json", ".md", ".html", ".svg", ".m", ".pq"):
            t = data.decode("utf-8-sig")
            return bool(t.strip()), f"ข้อความ {len(t)} ตัวอักษร"
        return len(data) > 0, f"ชนิดอื่น {len(data)} ไบต์ (ตรวจแค่ไม่ว่าง)"
    except Exception as e:
        return False, f"เปิดไม่ได้ {type(e).__name__}: {str(e)[:80]}"


fails, rows = [], []
with sync_playwright() as p:
    for dev_name in DEVICES:
        dev = p.devices[dev_name]
        b = getattr(p, dev["default_browser_type"]).launch()
        ctx = b.new_context(**dev, accept_downloads=True)
        ctx.add_init_script("try{localStorage.setItem('fk-lang','th');localStorage.setItem('fk-theme','light')}catch(e){}")
        pg = ctx.new_page()
        for tid in TOOLS:
            rec = {"device": dev_name, "tool": tid}
            try:
                pg.goto("about:blank")
                pg.goto(f"{BASE}/#/{tid}", wait_until="networkidle", timeout=30000)
                pg.wait_for_timeout(500)
                if not pg.evaluate(CLICK_SAMPLE):
                    rec["skip"] = "ไม่มีไฟล์ตัวอย่าง"; rows.append(rec); continue
                try: pg.wait_for_selector(".file-row, .dz-done, .s2-cta", timeout=8000)
                except Exception: pass
                pg.wait_for_timeout(1500)
                go = pg.evaluate(CLICK_GO)
                if not go:
                    rec["skip"] = "ปุ่มลงมือทำยังกดไม่ได้ (ต้องตั้งค่าเอง)"; rows.append(rec); continue
                rec["btn"] = go
                dl = pg.locator(".result button:visible", has_text="ดาวน์โหลด").first
                try: dl.wait_for(timeout=25000)
                except Exception:
                    errs = pg.evaluate("() => [...document.querySelectorAll('.status.err')].map((e) => e.innerText.trim()).filter(Boolean)")
                    if errs:
                        rec["fail"] = f"กด {go} แล้วขึ้น error: {errs[0][:80]}"; fails.append(rec)
                    else:
                        rec["skip"] = "ไม่ได้คืนเป็นไฟล์ (ผลเป็นข้อความหรือตาราง)"
                    rows.append(rec); continue
                with pg.expect_download(timeout=25000) as info:
                    dl.click()
                d = info.value
                name = d.suggested_filename
                path = OUT / f"{dev_name.replace(' ', '_')}__{tid}__{name}"
                d.save_as(str(path))
                if BREAK:
                    raw = path.read_bytes(); path.write_bytes(raw[: len(raw) // 2])
                ok, detail = check_file(path)
                rec.update(file=name, size=path.stat().st_size, detail=detail)
                # ชื่อไฟล์ที่ดาวน์โหลดต้องมีนามสกุล ไม่งั้นมือถือเปิดไม่ถูกแอป
                if not re.search(r"\.[A-Za-z0-9]{2,5}$", name):
                    ok, rec["detail"] = False, f"ชื่อไฟล์ไม่มีนามสกุล {name!r}"
                if not ok:
                    rec["fail"] = rec["detail"]; fails.append(rec)
            except Exception as e:
                rec["fail"] = f"ล้มกลางทาง {str(e).splitlines()[0][:100]}"; fails.append(rec)
            rows.append(rec)
        b.close()

got = [r for r in rows if "file" in r and "fail" not in r]
skip = [r for r in rows if "skip" in r]
for r in rows:
    tag = "❌" if "fail" in r else ("➖" if "skip" in r else "✅")
    print(f"{tag} [{r['device']}] {r['tool']:<22} {r.get('fail') or r.get('skip') or (r['file'] + '  ' + r['detail'])}")
(OUT / "e2e.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"\nbrowser_mobile_e2e: {len(DEVICES)} รุ่น , ได้ไฟล์ถูก {len(got)} , ข้าม {len(skip)} , ตก {len(fails)}  (ไฟล์อยู่ที่ {OUT})")
# ‼️ ด่านประชากร: ไม่ได้ไฟล์เลยสักตัว = ตัวเทสเองหาปุ่มไม่เจอ ห้ามผ่าน (บทเรียน harvest 0 จาก 71)
if not got and not os.environ.get("E2E_ONLY"):
    print("❌ ไม่ได้ไฟล์เลยสักเครื่องมือ ตัวเทสน่าจะหาปุ่มไม่เจอ"); sys.exit(1)
sys.exit(1 if fails else 0)
