"""browser_mailmerge_big.py  จดหมายเวียนข้อมูลใหญ่ (ตั้งแต่ 1,500 แถว) ทางเร็ว ZIP ทีละชุด
พี่ปอนด์ 07/11/2026 "รองรับข้อมูลหลายล้านแถวได้เพื่อทำ MAILMERGE ... CHALLENGE เลย"
วัดทางเดิมก่อนทำ: 4.1 มิลลิวินาทีต่อฉบับ 5,000 ฉบับ ผล 188 MB ค้างในหน่วยความจำ
ต้อง:
 ① เบราว์เซอร์ไม่มีตัวเลือกโฟลเดอร์ 3,100 แถว ได้ ZIP 2 ชุด (2,000 + 1,100) CRC ถูก ชื่อไฟล์ตามคอลัมน์ ไม่ซ้ำ
 ② ทุกฉบับข้อความตรงกับแม่แบบที่ใส่ค่าแล้ว (ไทย , & < > " ' , ค่าว่าง , ตัวเลข) ทั้งในเนื้อและท้ายกระดาษ
 ③ ค่าที่มีขึ้นบรรทัดได้สองบรรทัดจริง (w:br) ตรงตำแหน่งตัวยึด ข้อความหลังตัวยึดตามบรรทัดสอง
    (ทางเดิม easy-template-x ต่อบรรทัดสองไว้ท้ายก้อน ได้ "บรรทัดแรก จบ" แล้วค่อย "บรรทัดสอง" ยิงจริง 07/11/2026)
 ④ ชื่อผู้เขียนแม่แบบไม่ติดไป , Word จริงเปิดฉบับทางเร็วได้ อ่านข้อความกลับตรง และแปลงเป็น PDF ได้
    (LibreOffice บนเครื่องนี้เปิด docx ไม่ได้ทุกไฟล์ โน้ตคลัง 14/09/2026 จึงใช้ Word ผ่าน COM)
 ⑤ มีตัวเลือกโฟลเดอร์ (จำลองด้วย OPFS) เขียนลงไฟล์ตรง 1,600 แถว 1 ชุด อ่านกลับได้ครบ
 ⑥ ประชากร: 1,499 แถวยังใช้ทางเดิม (มีปุ่มรวมเป็นไฟล์ Word เดียว)
ใช้: FK_BASE=http://localhost:8899 ../.venv/bin/python tests/browser_mailmerge_big.py"""
import sys, os, io, re, zipfile, tempfile, pathlib, subprocess, shutil, base64
from playwright.sync_api import sync_playwright
from docx import Document
from openpyxl import Workbook

BASE = os.environ.get("FK_BASE", "http://localhost:8899")
P, F = 0, []
def ck(n, g, w):
    global P
    ok = g == w
    P += ok
    if not ok: F.append(f"{n}\n      ได้ {g!r} ควรได้ {w!r}")
    print(f"  {'✅' if ok else '❌'} {n}", flush=True)

TMP = pathlib.Path(tempfile.mkdtemp())
tpl = TMP / "แม่แบบ.docx"
d = Document(); d.core_properties.author = "TEMPLATE-AUTHOR-BIG"
d.add_paragraph("เรียน {{ชื่อ}}")
d.add_paragraph("รหัส {{Site}} ยอด {{ยอด}} บาท")
d.add_paragraph("หมายเหตุ {{หมายเหตุ}} จบ")
d.sections[0].footer.paragraphs[0].text = "ท้าย {{Site}}"
d.save(tpl)

SPECIAL = ['บริษัท A&B <จำกัด>', 'คำพูด "ใน" เครื่องหมาย', "อัญประกาศเดี่ยว 'x'", "", "สระ ำ ไม้ ็ ๆ ฯ"]
def rows(n):
    out = []
    for i in range(n):
        note = SPECIAL[i % len(SPECIAL)]
        if i == 7: note = "บรรทัดแรก\nบรรทัดสอง"
        out.append({"Site": f"CRI{i:05d}", "ชื่อ": f"คุณทดสอบ {i + 1}", "ยอด": f"{(i * 37) % 9999:,}.50", "หมายเหตุ": note})
    return out
def xlsx(rs, name):
    p = TMP / name
    wb = Workbook(); ws = wb.active; ws.append(["Site", "ชื่อ", "ยอด", "หมายเหตุ"])
    for r in rs: ws.append([r["Site"], r["ชื่อ"], r["ยอด"], r["หมายเหตุ"]])
    wb.save(p); return p

def texts(docx_bytes):
    z = zipfile.ZipFile(io.BytesIO(docx_bytes))
    def paras(xml):
        out = []
        for p in re.findall(r"<w:p[ >].*?</w:p>", xml, flags=re.S):
            s = ""
            for m in re.finditer(r"<w:t(?: [^>]*)?>([^<]*)</w:t>|<w:t(?: [^>]*)?/>|<w:br/>", p):
                s += "\n" if m.group(0) == "<w:br/>" else (m.group(1) or "")
            out.append(s)
        return [x for x in out if x]
    body = paras(z.read("word/document.xml").decode())
    foot = [x for n in z.namelist() if n.startswith("word/footer") for x in paras(z.read(n).decode())]
    unesc = lambda s: s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&apos;", "'").replace("&amp;", "&")
    return [unesc(x) for x in body], [unesc(x) for x in foot], z.read("docProps/core.xml").decode()

def expect(r):
    return [f"เรียน {r['ชื่อ']}", f"รหัส {r['Site']} ยอด {r['ยอด']} บาท", f"หมายเหตุ {r['หมายเหตุ']} จบ"], [f"ท้าย {r['Site']}"]

def load(pg, data):
    pg.goto(f"{BASE}/#/word-mailmerge", wait_until="networkidle"); pg.wait_for_selector(".mm-step")
    pg.locator("input[type=file]").nth(0).set_input_files(str(tpl)); pg.wait_for_timeout(900)
    pg.locator("input[type=file]").nth(1).set_input_files(str(data))
    pg.wait_for_function("() => /อ่านข้อมูลได้/.test(document.body.innerText)", timeout=120000)
    pg.wait_for_timeout(500)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    # ① ② ③ ④ ไม่มีตัวเลือกโฟลเดอร์
    c = b.new_context(viewport={"width": 1280, "height": 950}, accept_downloads=True)
    c.add_init_script("delete window.showDirectoryPicker;")
    pg = c.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    R1 = rows(3100); load(pg, xlsx(R1, "ข้อมูล3100.xlsx"))
    dls = []
    pg.on("download", lambda dl: dls.append(dl))
    pg.locator("button.btn:visible", has_text="สร้างเอกสารทั้งชุด").click()
    pg.wait_for_selector("#mm-big-done", timeout=600000); pg.wait_for_timeout(1500)
    info = pg.evaluate("() => { const e = document.querySelector('#mm-big-done'); return { files: e.dataset.files, parts: e.dataset.parts, slow: e.dataset.slow }; }")
    ck("① สร้างครบ 3,100 ฉบับ 2 ชุด ไม่ต้องกลับไปทางเดิม (ค่าหลายบรรทัดอยู่ในข้อความ)", info, {"files": "3100", "parts": "2", "slow": "0"})
    ck("① ดาวน์โหลด 2 ไฟล์", len(dls), 2)
    zs = []
    for dl in dls:
        p = TMP / dl.suggested_filename; dl.save_as(p); zs.append(zipfile.ZipFile(p))
    ck("① CRC ทุกฉบับถูก ทั้งสองชุด", [z.testzip() for z in zs], [None, None])
    names = [n for z in zs for n in z.namelist()]
    ck("① จำนวนฉบับต่อชุด 2,000 กับ 1,100", [len(z.namelist()) for z in zs], [2000, 1100])
    ck("① ชื่อไฟล์ไม่ซ้ำ", len(set(names)), 3100)
    bad, checked = [], 0
    allb = {n: z.read(n) for z in zs for n in z.namelist()}
    order = names
    for i, n in enumerate(order):
        if i % 7 and i not in (7, 3099, 1999, 2000): continue  # ตรวจทุกฉบับที่ 7 กับฉบับรอยต่อ
        body, foot, core = texts(allb[n]); eb, ef = expect(R1[i]); checked += 1
        if body != eb or foot != ef: bad.append((i, body, foot))
    ck(f"② ข้อความตรงแม่แบบที่ใส่ค่า ทั้งเนื้อและท้ายกระดาษ (ตรวจ {checked} ฉบับ)", bad[:2], [])
    ck("③ ฉบับที่ 8 ค่าหลายบรรทัด ได้สองบรรทัดจริง", texts(allb[order[7]])[0][2], "หมายเหตุ บรรทัดแรก\nบรรทัดสอง จบ")
    ck("④ ชื่อผู้เขียนแม่แบบไม่ติดไป", any("TEMPLATE-AUTHOR-BIG" in texts(allb[order[i]])[2] for i in (0, 1, 2500)), False)
    PS = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
    if os.path.exists(PS):
        wd = pathlib.Path("/mnt/c/Users/USER/AppData/Local/Temp/fk_mm_big"); wd.mkdir(parents=True, exist_ok=True)
        for k in (1, 7): (wd / f"fast{k}.docx").write_bytes(allb[order[k]])
        win = "C:\\Users\\USER\\AppData\\Local\\Temp\\fk_mm_big\\"
        ps = ("$ErrorActionPreference='Stop'; $w = New-Object -ComObject Word.Application; $w.Visible = $false; try { foreach ($k in 1,7) { "
              f"$d = $w.Documents.Open('{win}fast' + $k + '.docx', $false, $true); "
              "[IO.File]::WriteAllText(" + f"'{win}fast' + $k + '.txt'" + ", $d.Content.Text, [Text.Encoding]::UTF8); "
              f"$d.SaveAs([ref]('{win}fast' + $k + '.pdf'), [ref]17); $d.Close($false) }} }} finally {{ $w.Quit() }}")
        r = subprocess.run([PS, "-NoProfile", "-Command", ps], capture_output=True, timeout=300)
        t1 = (wd / "fast1.txt").read_text(encoding="utf-8-sig") if (wd / "fast1.txt").exists() else ""
        t7 = (wd / "fast7.txt").read_text(encoding="utf-8-sig") if (wd / "fast7.txt").exists() else ""
        ck("④ Word เปิดฉบับทางเร็วได้ ข้อความตรง และแปลง PDF ได้", ("เรียน คุณทดสอบ 2" in t1, "รหัส CRI00001" in t1, (wd / "fast1.pdf").exists()), (True, True, True))
        ck("③ Word เห็นฉบับที่ 8 เป็นบรรทัดแรก ขึ้นบรรทัด แล้วบรรทัดสอง จบ", "หมายเหตุ บรรทัดแรก" + chr(11) + "บรรทัดสอง จบ" in t7, True)
        if r.returncode: print("    Word:", r.stderr.decode("utf-8", "replace")[-300:])
    ck("ไม่มี error ในหน้า (ไม่มีตัวเลือกโฟลเดอร์)", errs, [])
    c.close()

    # ⑤ มีตัวเลือกโฟลเดอร์ จำลองด้วย OPFS ของหน้าเอง
    c = b.new_context(viewport={"width": 1280, "height": 950}, accept_downloads=True)
    c.add_init_script("window.showDirectoryPicker = async () => { const r = await navigator.storage.getDirectory(); for await (const k of r.keys()) await r.removeEntry(k, { recursive: true }); return r; };")
    pg = c.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    R2 = rows(1600); load(pg, xlsx(R2, "ข้อมูล1600.xlsx"))
    pg.locator("button.btn:visible", has_text="สร้างเอกสารทั้งชุด").click()
    pg.wait_for_selector("#mm-big-done", timeout=600000)
    got = pg.evaluate("""async () => { const r = await navigator.storage.getDirectory(); const out = [];
      for await (const [k, h] of r.entries()) { const f = await h.getFile(); out.push({ k, size: f.size }); }
      const [first] = out; const f = await (await r.getFileHandle(first.k)).getFile(); const buf = new Uint8Array(await f.arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return { files: out, b64: btoa(s) }; }""")
    ck("⑤ เขียนลงโฟลเดอร์ 1 ไฟล์ ไม่มีดาวน์โหลด", len(got["files"]), 1)
    z = zipfile.ZipFile(io.BytesIO(base64.b64decode(got["b64"])))
    ck("⑤ ไฟล์ในโฟลเดอร์ CRC ถูก 1,600 ฉบับ", (z.testzip(), len(z.namelist())), (None, 1600))
    body, foot, _ = texts(z.read(z.namelist()[1599]))
    ck("⑤ ฉบับสุดท้ายข้อความถูก", (body, foot), expect(R2[1599]))
    ck("ไม่มี error ในหน้า (มีตัวเลือกโฟลเดอร์)", errs, [])
    c.close()

    # ⑧ ⑨ โฟลเดอร์จำลองในหน่วยความจำ ตั้งให้เต็มหรือเขียนช้าได้ (ดิสก์เต็มเจอจริงตอนวัด 07/11/2026 exceed its storage quota)
    FAKE = """window.__fk = { bytes: 0, files: {}, limit: %d, delay: %d };
      window.showDirectoryPicker = async () => ({ getFileHandle: async (name) => ({ createWritable: async () => {
        window.__fk.files[name] = 'open';
        return { write: async (d) => { if (window.__fk.delay) await new Promise((r) => setTimeout(r, window.__fk.delay));
                   if (window.__fk.bytes + d.byteLength > window.__fk.limit) throw new DOMException('The operation failed because it would cause the application to exceed its storage quota.', 'QuotaExceededError');
                   window.__fk.bytes += d.byteLength; },
                 close: async () => { window.__fk.files[name] = 'closed'; }, abort: async () => { window.__fk.files[name] = 'aborted'; } }; } }) });"""
    for label, limit, delay in (("⑧", 800 * 1024 * 1024, 0), ("⑨", 10 ** 12, 300)):  # ⑧ ชุดแรก 20,000 ฉบับราว 760 MB ผ่าน ชุดสองเต็ม
        c = b.new_context(viewport={"width": 1280, "height": 950}, accept_downloads=True)
        c.add_init_script(FAKE % (limit, delay))
        pg = c.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        R = rows(24000 if label == "⑧" else 3100); load(pg, xlsx(R, f"ข้อมูล{label}.xlsx"))
        pg.locator("button.btn:visible", has_text="สร้างเอกสารทั้งชุด").click()
        if label == "⑧":
            pg.wait_for_selector("#mm-big-fail, #mm-big-done", timeout=600000)
            f8 = pg.evaluate("() => { const e = document.querySelector('#mm-big-fail'); return e ? { parts: e.dataset.parts, done: e.dataset.done } : null; }")
            st8 = pg.evaluate("() => [...document.querySelectorAll('[role=status]')].map((x) => x.innerText).join(' ')")
            files8 = pg.evaluate("() => window.__fk.files")
            ck("⑧ ดิสก์เต็มกลางชุดที่สอง: ขึ้นกล่องล้ม ชุดแรกครบ 20,000 ฉบับยังใช้ได้", f8, {"parts": "1", "done": "20000"})
            ck("⑧ ข้อความบอกฉบับที่ล้มและให้ตรวจที่ว่างในดิสก์", ("เขียนไม่สำเร็จที่ฉบับที่" in st8, "ตรวจที่ว่างในดิสก์" in st8), (True, True))
            ck("⑧ ชุดแรกปิดครบ ชุดที่ค้างถูกยกเลิก ไม่ค้างครึ่งไฟล์", sorted(files8.values()), ["aborted", "closed"])
        else:
            pg.wait_for_function("() => /\\(([\\d,]+)\\/3,100\\)/.test(document.body.innerText)", timeout=120000)
            vis = pg.evaluate("() => { const s = document.querySelector('.s2-stat .status-wrap'); const r = s && s.getBoundingClientRect(); return { inFoot: !!s, onScreen: !!r && r.top >= 0 && r.bottom <= innerHeight, text: s ? s.innerText : '' }; }")
            ck("⑨ ระหว่างสร้าง แถบสถานะอยู่ข้างปุ่มหลัก เห็นบนจอ มีตัวนับ", (vis["inFoot"], vis["onScreen"], "/3,100)" in vis["text"]), (True, True, True))
            ck("⑨ ปุ่มหยุดที่มองเห็นมีใบเดียว", pg.locator("button:visible", has_text="หยุด").count(), 1)
            pg.locator("button:visible", has_text="หยุด").click()
            pg.wait_for_selector("#mm-big-stopped, #mm-big-done", timeout=300000)
            f9 = pg.evaluate("() => { const e = document.querySelector('#mm-big-stopped'); return e ? Number(e.dataset.done) : null; }")
            ck("⑨ กดหยุดกลางทาง: หยุดจริง สร้างไปบางส่วน ไม่ครบ 3,100", f9 is not None and 0 < f9 < 3100, True)
            ck("⑨ ชุดที่หยุดปิดไฟล์ให้ครบ ใช้ได้", list(pg.evaluate("() => window.__fk.files").values()), ["closed"])
        ck(f"ไม่มี error ในหน้า ({label})", errs, [])
        c.close()

    # ⑥ ประชากร ต่ำกว่าเกณฑ์ใช้ทางเดิม
    c = b.new_context(viewport={"width": 1280, "height": 950}, accept_downloads=True)
    pg = c.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    load(pg, xlsx(rows(1499), "ข้อมูล1499.xlsx"))
    pg.locator("button.btn:visible", has_text="สร้างเอกสารทั้งชุด").click()
    pg.wait_for_selector("button:visible:has-text('รวมเป็นไฟล์ Word เดียว')", timeout=600000)
    ck("⑥ ประชากร: 1,499 แถวใช้ทางเดิม ไม่ขึ้นกล่องข้อมูลใหญ่", pg.locator("#mm-big-done").count(), 0)
    with pg.expect_download(timeout=600000) as dl:
        pg.locator("button:visible", has_text="โหลดทั้งหมด (ZIP)").click()
    zp = TMP / "small.zip"; dl.value.save_as(zp); zs = zipfile.ZipFile(zp)
    R3 = rows(1499); n3 = zs.namelist()
    ck("⑦ ทางเดิมได้ 1,499 ฉบับ CRC ถูก", (zs.testzip(), len(n3)), (None, 1499))
    ck("⑦ ทางเดิมค่าหลายบรรทัดขึ้นบรรทัดตรงตำแหน่งตัวยึด (เดิมบรรทัดสองไปต่อท้าย จบ)", texts(zs.read(n3[7]))[0][2], "หมายเหตุ บรรทัดแรก\nบรรทัดสอง จบ")
    ck("⑦ ทางเดิมฉบับอื่นข้อความตรง (ไทย , & < > เครื่องหมายคำพูด , ค่าว่าง)", [texts(zs.read(n3[i]))[:2] for i in (0, 1, 2, 3, 4, 1498)], [expect(R3[i]) for i in (0, 1, 2, 3, 4, 1498)])
    ck("ไม่มี error ในหน้า (ทางเดิม)", errs, [])
    b.close()

print(f"\nbrowser_mailmerge_big: ผ่าน {P}/{P + len(F)}")
for f in F: print("  ❌", f)
sys.exit(1 if F else 0)
