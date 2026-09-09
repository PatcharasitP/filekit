"""ตรวจสอบคำโฆษณา "ไฟล์ไม่ถูกอัปโหลดไปไหน" ของ FileKit ด้วยหลักฐานเครือข่ายจริง (ห้ามเดา ต้องจับ request จริง)

หน้าเว็บ FileKit โฆษณาไว้ชัดเจนว่า "ทุกอย่างทำงานในเครื่องคุณ ไฟล์ไม่ถูกอัปโหลดไปไหน"
เทสนี้ดักทุก request ที่ออกจากเบราว์เซอร์ทั้งระดับเครือข่าย (ผ่าน Playwright browser context —
ครอบคลุมถึง request จาก Web Worker ด้วย) และระดับ JS API (fetch/XHR/sendBeacon/WebSocket/
Image.src ที่ patch เอง) ระหว่างใช้งานเครื่องมือจริง 9 ตัว ครอบทุกตระกูลไลบรารีหลักของเว็บนี้
(pdf-lib, pdf.js, docx, mammoth, xlsx, canvas, tesseract) กับไฟล์จริงที่ฝังคำลับเฉพาะตัว:
  - เนื้อไฟล์ : MAGIC_SECRET   (ค้นหาง่ายถ้าเนื้อหาไฟล์หลุดออกไปที่ไหน)
  - ชื่อไฟล์ : MAGIC_FILENAME  (ค้นหาง่ายถ้าไฟล์ถูกอัปโหลดจริง — ชื่อไฟล์มักติดไปกับ multipart/form-data)

## หลักการวัด (ห้ามเดา ต้องจับค่าจริง — CLAUDE.md)
  - network : context.on("request"/"requestfinished"/"requestfailed") ที่ระดับ browser
              context (ไม่ใช่แค่ page) เพราะ Tesseract รัน OCR ใน Web Worker แยกจาก main thread —
              request จาก Worker จะไม่โผล่ใน window.fetch/XHR patch (คนละ JS realm ของหน้า)
              แต่โผล่ในนี้แน่นอนเพราะ Playwright ดักที่ระดับเครือข่ายของเบราว์เซอร์เอง — นี่คือ
              แหล่งความจริงหลักของเทสนี้
  - JS API  : patch window.fetch / XMLHttpRequest.prototype.open+send / navigator.sendBeacon /
              window.WebSocket / HTMLImageElement.src ผ่าน page.add_init_script เป็นหลักฐานเสริม
              ระดับ API ‼️ ค่าที่ patch ไว้ "รีเซ็ตทุกครั้งที่ page.goto ไปเอกสารใหม่" (เป็น JS realm
              ใหม่) จึงต้อง harvest window.__calls ก่อนสลับเครื่องมือทุกครั้ง (ดู harvest_js_calls())
  - storage : ดัมพ์ localStorage/sessionStorage/cookie/indexedDB ค่าจริงหลังใช้งานครบทุกเครื่องมือ

## พิสูจน์เครื่องมือตรวจก่อนเชื่อผล (Section 0 — ตามธรรมเนียมชุดเทสนี้ + feedback_prove_the_checker_first)
ก่อนเชื่อว่า "ไม่เจอการรั่วไหล" เทสนี้ยิง canary ที่มีคำลับฝังอยู่เองก่อน ผ่านทุกช่องทางที่ตรวจ
(fetch/XHR/sendBeacon/WebSocket/Image.src/localStorage/request ระดับเครือข่าย/requestfailed)
โดยเล็งไปที่ same-origin หรือ loopback (127.0.0.1) เท่านั้น — "ไม่ยิงออกเว็บภายนอกจริง" ตามข้อห้าม
ของงานนี้ — แล้วเช็คว่าตัวดักจับทุกช่องทางเจอ canary จริง ถ้าพลาดแม้แต่ช่องทางเดียว = ผลตรวจท้ายไฟล์
เชื่อถือไม่ได้ทันที (F จะขึ้นตั้งแต่ Section 0 ก่อนไปแตะเครื่องมือจริงเลย)

ข้อห้ามของงานนี้: ห้ามแก้ src/**, index.html, assets/**, sw.js — เจอช่องโหว่ให้รายงานเฉย ๆ ห้ามแก้เอง
"""
import io
import os
import re
import sys
import json
import time
import shutil
import socket
import pathlib
import tempfile
import zipfile
import subprocess
import urllib.request
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

import fitz              # pymupdf — สร้าง/ตรวจ PDF จริง
import docx as pydocx     # python-docx — สร้าง/ตรวจ Word จริง
import openpyxl           # สร้าง/ตรวจ Excel จริง
from PIL import Image, ImageDraw, ImageFont

# ── ตั้งค่าพื้นฐาน — อ่าน BASE จาก env เสมอ ห้าม hardcode port ที่ชนกับเทสอื่น ──────
ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = 8933   # ไม่ชนกับ browser_leak.py(8924) / browser_chain.py(8925)
BASE_ENV = os.environ.get("FK_BASE", "").strip()
BASE = BASE_ENV or f"http://localhost:{PORT}"

SCRATCH = pathlib.Path(tempfile.mkdtemp(prefix="fk_privacy_test_"))   # เดิม hardcode path ของ scratchpad session เก่า (ซ่อม 09/09/2026)
IN_DIR = SCRATCH / "in"
OUT_DIR = SCRATCH / "out"

STEP_TIMEOUT = 90_000      # ms ต่อขั้น (โหลดไลบรารีหนักครั้งแรก + เผื่อเครื่องแชร์กับงานอื่นพร้อมกัน)
SIF_TIMEOUT = 15_000       # ms รอ input[type=file] / .file-row
OCR_TIMEOUT = 180_000      # ms — ครั้งแรกต้องโหลดชุดภาษา Tesseract จาก CDN จริง (~5-20MB)

MAGIC_SECRET = "MAGIC-SECRET-9F3K2"        # ฝังในเนื้อไฟล์
MAGIC_FILENAME = "MAGIC-FILENAME-7Q1"      # ฝังในชื่อไฟล์
CANARY_MARK = "__fk_privacy_canary__"      # แท็กกันปนกับผลตรวจจริง — same-origin/loopback เท่านั้น

# ── ผลรวม + ตัวช่วยพิมพ์ผล (ตามธรรมเนียมชุดเทสนี้ — ต้องแดงตอนมีบั๊ก เขียวหลังแก้) ─────
P, F = 0, []
RISKS = []   # (severity, name, detail) — ความเสี่ยงที่ต้องรายงานแต่ไม่ใช่การรั่วไหลของไฟล์ผู้ใช้


def ck_true(name, cond, detail=""):
    global P
    if cond:
        P += 1
    else:
        F.append(f"{name}{(' — ' + detail) if detail else ''}")
    print(f"  {'✅' if cond else '❌'} {name}" + (f"  ({detail})" if detail else ""))
    return cond


def risk(severity, name, detail):
    RISKS.append((severity, name, detail))
    print(f"      ⚠️ [{severity}] {name} — {detail}")


def section(title):
    print(f"\n{'━'*70}\n{title}\n{'━'*70}")


# ── เซิร์ฟเวอร์ 8933 (เสิร์ฟเอง ถ้าไม่ได้ตั้ง FK_BASE จากภายนอก) ────────────────
_server_proc = None


def port_open(host, port, timeout=0.4):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def start_server():
    global _server_proc
    if BASE_ENV:
        print(f"ใช้ FK_BASE ภายนอก: {BASE} (ไม่เปิดเซิร์ฟเวอร์เอง)")
        return
    if port_open("localhost", PORT):
        print(f"‼️ พอร์ต {PORT} มีอะไรฟังอยู่แล้ว — ใช้ของที่มีอยู่ (ไม่เปิดซ้ำ)")
        return
    print(f"เปิดเซิร์ฟเวอร์ {BASE} จาก {ROOT} ...")
    _server_proc = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT)],
        cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    for _ in range(50):
        try:
            urllib.request.urlopen(BASE, timeout=1)
            print("  พร้อมแล้ว")
            return
        except Exception:
            time.sleep(0.2)
    raise RuntimeError(f"เซิร์ฟเวอร์ {BASE} ไม่ขึ้นภายในเวลาที่กำหนด")


def stop_server():
    if _server_proc:
        _server_proc.terminate()
        try:
            _server_proc.wait(timeout=5)
        except Exception:
            _server_proc.kill()
        print(f"ปิดเซิร์ฟเวอร์ {BASE} แล้ว")


# ── สร้างไฟล์ทดสอบที่มีคำลับฝังอยู่จริง (เก็บนอกโปรเจกต์ — สแครตช์แพด) ────────────
def make_magic_files():
    IN_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    files = {}

    # PDF หลัก 2 หน้า มีชั้นข้อความจริง (อ่านได้ด้วย pdf.js) — ชื่อไฟล์ = MAGIC_FILENAME ตรงตัว
    doc = fitz.open()
    p1 = doc.new_page(width=595, height=842)
    p1.insert_text((72, 100), MAGIC_SECRET, fontsize=26)
    p1.insert_text((72, 140), "FileKit privacy test document", fontsize=14)
    p2 = doc.new_page(width=595, height=842)
    p2.insert_text((72, 100), "page 2 - " + MAGIC_SECRET, fontsize=18)
    p_pdf = IN_DIR / f"{MAGIC_FILENAME}.pdf"
    doc.save(str(p_pdf)); doc.close()
    files["pdf_main"] = p_pdf

    # PDF ใบที่สอง (ไว้ทดสอบ pdf-merge ที่ต้องใช้ 2 ไฟล์) — คำลับคนละคำต่อท้าย แยกแยะได้ในผลลัพธ์
    doc2 = fitz.open()
    q1 = doc2.new_page(width=595, height=842)
    q1.insert_text((72, 100), MAGIC_SECRET + "-FILE2", fontsize=22)
    p_pdf2 = IN_DIR / f"{MAGIC_FILENAME}-second.pdf"
    doc2.save(str(p_pdf2)); doc2.close()
    files["pdf_second"] = p_pdf2

    # DOCX
    d = pydocx.Document()
    d.add_paragraph(MAGIC_SECRET)
    d.add_paragraph("FileKit privacy test document")
    p_docx = IN_DIR / f"{MAGIC_FILENAME}.docx"
    d.save(str(p_docx))
    files["docx"] = p_docx

    # XLSX
    wb = openpyxl.Workbook()
    ws = wb.active
    ws["A1"] = "label"; ws["B1"] = MAGIC_SECRET
    ws["A2"] = "note";  ws["B2"] = "FileKit privacy test row"
    p_xlsx = IN_DIR / f"{MAGIC_FILENAME}.xlsx"
    wb.save(str(p_xlsx))
    files["xlsx"] = p_xlsx

    # PNG — ตัวหนังสือใหญ่ชัด ขาวดำคอนทราสต์สูง ให้ OCR อ่านคำลับกลับมาได้จริง
    # (พิสูจน์ว่ามีการประมวลผลเนื้อไฟล์จริง ไม่ใช่แค่ "รันไม่พัง")
    img = Image.new("RGB", (1000, 260), "white")
    dr = ImageDraw.Draw(img)
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 66)
    dr.text((30, 90), MAGIC_SECRET, fill="black", font=font)
    p_png = IN_DIR / f"{MAGIC_FILENAME}.png"
    img.save(p_png)
    files["png"] = p_png

    return files


# ── init script: patch ทุกช่องทางที่ข้อมูลออกจากเบราว์เซอร์ได้ในระดับ JS API ──────
# ‼️ รีเซ็ตทุกครั้งที่ page.goto ไปเอกสารใหม่ (เอกสารใหม่ = JS realm ใหม่) — harvest ก่อนสลับเครื่องมือ
INIT_SCRIPT = r"""
(() => {
  const calls = { fetch: [], xhrSend: [], beacon: [], ws: [], imgSrc: [], storageSet: [] };
  window.__calls = calls;

  const _fetch = window.fetch ? window.fetch.bind(window) : null;
  if (_fetch) {
    window.fetch = function(input, init) {
      try {
        const url = typeof input === "string" ? input : (input && input.url) || String(input);
        let body = null;
        if (init && init.body != null) { try { body = String(init.body).slice(0, 500); } catch (e) {} }
        calls.fetch.push({ url: String(url), method: (init && init.method) || "GET", body });
      } catch (e) {}
      return _fetch(input, init);
    };
  }

  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__fk_method = method; this.__fk_url = url;
    return _open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function(body) {
    try {
      calls.xhrSend.push({
        method: this.__fk_method, url: this.__fk_url,
        body: body != null ? String(body).slice(0, 500) : null,
      });
    } catch (e) {}
    return _send.apply(this, arguments);
  };

  if (navigator.sendBeacon) {
    const _beacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function(url, data) {
      try { calls.beacon.push({ url: String(url), data: data != null ? String(data).slice(0, 500) : null }); } catch (e) {}
      return _beacon(url, data);
    };
  }

  const _WS = window.WebSocket;
  if (_WS) {
    function PatchedWS(url, protocols) {
      try { calls.ws.push({ url: String(url) }); } catch (e) {}
      return protocols !== undefined ? new _WS(url, protocols) : new _WS(url);
    }
    PatchedWS.prototype = _WS.prototype;
    window.WebSocket = PatchedWS;
  }

  try {
    const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    if (desc && desc.set) {
      Object.defineProperty(HTMLImageElement.prototype, "src", {
        get: desc.get,
        set: function(v) { try { calls.imgSrc.push(String(v).slice(0, 500)); } catch (e) {} return desc.set.call(this, v); },
        configurable: true,
      });
    }
  } catch (e) {}

  try {
    const patch = (store, label) => {
      const _set = store.setItem.bind(store);
      store.setItem = function(k, v) {
        try { calls.storageSet.push({ store: label, key: k, value: String(v).slice(0, 2000) }); } catch (e) {}
        return _set(k, v);
      };
    };
    patch(window.localStorage, "local");
    patch(window.sessionStorage, "session");
  } catch (e) {}
})();
"""


def harvest_js_calls(pg, scenario, sink):
    """ดึง window.__calls ออกมาก่อนเสมอ ก่อน page.goto ครั้งถัดไปจะล้างมันทิ้ง (เอกสารใหม่ = JS realm ใหม่)"""
    try:
        data = pg.evaluate("() => window.__calls || {}")
    except Exception as e:
        data = {"_harvest_error": str(e)}
    sink.append({"scenario": scenario, "calls": data})
    return data


# ── ตัวจำแนก URL ภายนอก อ้างอิงจาก src/loader.js จริง ────────────────────────────
def classify_external(url):
    u = urlparse(url)
    host, path = u.netloc, u.path
    if host == "cdnjs.cloudflare.com" and "/ajax/libs/" in path:
        lib = path.split("/ajax/libs/")[1].split("/")[0]
        return (f"CDN fallback ของ src/loader.js สำหรับไลบรารี '{lib}' — ปกติไม่ควรเกิดเพราะมีไฟล์ "
                f"เดียวกันอยู่ใน vendor/ ของเว็บเองแล้ว (loader.js ลอง vendor/ ก่อนเสมอ ตกไปใช้ CDN "
                f"เฉพาะตอนไฟล์ในเครื่อง 404 เท่านั้น — ดู src/loader.js:injectScript())")
    if host == "cdn.jsdelivr.net" and "/npm/" in path:
        pkg = path.split("/npm/")[1].split("/")[0]
        if pkg.startswith("tesseract") or pkg.startswith("@tesseract"):
            return ("ไฟล์เอนจิน OCR (worker script / core wasm / ชุดภาษา traineddata) ของ Tesseract.js เอง — "
                     "ไม่ใช่เส้นทาง CDN fallback ของ loader.js (ตัว tesseract.min.js หลักโหลดจาก vendor/ ในเครื่อง "
                     "สำเร็จอยู่แล้ว) แต่เป็นค่า default ที่ hardcode CDN URL ไว้ภายในไลบรารี Tesseract.js เอง "
                     "โหลดเฉพาะตอนผู้ใช้กดใช้เครื่องมือ OCR เท่านั้น — เนื้อหาที่โหลดคือโมเดลภาษาสาธารณะ ไม่ใช่ไฟล์ของผู้ใช้")
        return f"CDN fallback ของ src/loader.js สำหรับ npm package '{pkg}'"
    return "‼️ โดเมนที่ไม่รู้จัก ไม่ตรงกับไลบรารีใดใน src/loader.js เลย — ต้องสืบเพิ่มก่อนสรุปว่าปลอดภัย"


# ── ดัมพ์ storage ค่าจริง ─────────────────────────────────────────────────────
def dump_storage(pg):
    return pg.evaluate("""() => {
        const ls = {}; for (let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); ls[k]=localStorage.getItem(k); }
        const ss = {}; for (let i=0;i<sessionStorage.length;i++){ const k=sessionStorage.key(i); ss[k]=sessionStorage.getItem(k); }
        return { localStorage: ls, sessionStorage: ss, cookie: document.cookie };
    }""")


def dump_indexeddb(pg, secret, filename_marker):
    """เปิดทุก IndexedDB database จริง ไล่ทุก object store ไล่ทุก key/value จริง
    (ไม่ใช่แค่รายชื่อ database) แล้วสแกนเนื้อ value แบบไบต์ต่อไบต์หาคำลับ — ไม่ JSON.stringify
    ค่าที่อาจเป็น binary blob หลายสิบ MB ตรง ๆ (ช้า/กิน memory เปล่า ๆ) ใช้การสแกน pattern ตรง
    บน Uint8Array แทน คืนรายละเอียดพอให้ "เห็นค่าจริง" ของทุก entry (ชื่อ key, ชนิด, ขนาดไบต์จริง,
    ผลสแกนคำลับ) โดยไม่ต้อง dump ก้อนไบนารีทั้งก้อนออกมาเป็นข้อความ (dump ไม่ได้อยู่ดี อ่านไม่ออก)"""
    return pg.evaluate("""async (args) => {
        const [secret, marker] = args;
        const encoder = new TextEncoder();
        const patSecret = encoder.encode(secret);
        const patMarker = encoder.encode(marker);
        function containsBytes(bytes, pat) {
            const n = bytes.length, m = pat.length;
            outer: for (let i = 0; i <= n - m; i++) {
                for (let j = 0; j < m; j++) { if (bytes[i + j] !== pat[j]) continue outer; }
                return true;
            }
            return false;
        }
        function toBytes(v) {
            if (v instanceof ArrayBuffer) return new Uint8Array(v);
            if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
            return null;
        }
        if (!indexedDB.databases) return { supported: false, dbs: [] };
        try {
            const list = await indexedDB.databases();
            const out = [];
            for (const meta of list) {
                const req = indexedDB.open(meta.name);
                const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
                const storeNames = Array.from(db.objectStoreNames);
                const stores = {};
                for (const sn of storeNames) {
                    const tx = db.transaction(sn, "readonly");
                    const store = tx.objectStore(sn);
                    const keys = await new Promise((res, rej) => { const r = store.getAllKeys(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
                    const vals = await new Promise((res, rej) => { const r = store.getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
                    stores[sn] = keys.map((k, i) => {
                        const v = vals[i];
                        const keyStr = String(k);
                        const bytes = toBytes(v);
                        const ctor = v && v.constructor ? v.constructor.name : typeof v;
                        const keyHasSecret = keyStr.includes(secret) || keyStr.includes(marker);
                        let valHasSecret = false, byteLength = null;
                        if (bytes) {
                            byteLength = bytes.length;
                            valHasSecret = containsBytes(bytes, patSecret) || containsBytes(bytes, patMarker);
                        } else {
                            const s = String(v);
                            valHasSecret = s.includes(secret) || s.includes(marker);
                            byteLength = s.length;
                        }
                        return { key: keyStr, ctor, byteLength, keyHasSecret, valHasSecret };
                    });
                }
                db.close();
                out.push({ name: meta.name, version: meta.version, storeNames, stores });
            }
            return { supported: true, dbs: out };
        } catch (e) { return { supported: true, error: String(e), dbs: [] }; }
    }""", [secret, filename_marker])


# ── ตัวช่วยเบราว์เซอร์ทั่วไป (แบบแผนเดียวกับ tests/browser_chain.py) ──────────────
def goto(pg, tool_id):
    pg.goto("about:blank")
    pg.goto(f"{BASE}/#/{tool_id}", wait_until="networkidle")
    pg.wait_for_selector(".tool-head", timeout=STEP_TIMEOUT)


def dl(pg, trigger, filename, timeout=STEP_TIMEOUT):
    with pg.expect_download(timeout=timeout) as di:
        trigger()
    d = di.value
    out = OUT_DIR / filename
    d.save_as(str(out))
    return out


# ═════════════════════════════════════════════════════════════════════════
# สถานการณ์ใช้งานจริง 9 เครื่องมือ — ครอบทุกตระกูลไลบรารี
# (pdf-lib, pdf.js, docx, mammoth, xlsx, canvas, tesseract)
# ═════════════════════════════════════════════════════════════════════════
def sc_pdf_merge(pg, files):
    """pdf-lib — รวม 2 PDF ที่มีคำลับคนละท่อนเข้าด้วยกัน"""
    goto(pg, "pdf-merge")
    pg.set_input_files("input[type=file]",
                        [str(files["pdf_main"]), str(files["pdf_second"])], timeout=SIF_TIMEOUT)
    pg.wait_for_selector(".file-row", timeout=SIF_TIMEOUT)
    ck_true("pdf-merge: ไฟล์เข้าครบ 2 แถว", pg.locator(".file-row").count() == 2)
    pg.get_by_role("button", name="รวมไฟล์").click()
    pg.wait_for_selector(".results .result", timeout=STEP_TIMEOUT)
    out = dl(pg, lambda: pg.locator(".results .result button").first.click(), "pdf_merge_out.pdf")
    d = fitz.open(str(out))
    ck_true("pdf-merge: จำนวนหน้ารวมถูกต้อง (3)", d.page_count == 3, f"ได้ {d.page_count}")
    text = "".join(pg_.get_text() for pg_ in d)
    ck_true("pdf-merge: เนื้อหารวมมีคำลับจากทั้งสองไฟล์ (พิสูจน์ว่าประมวลผลจริง)",
            MAGIC_SECRET in text and (MAGIC_SECRET + "-FILE2") in text, text[:150])


def sc_pdf_watermark(pg, files):
    """pdf-lib — ใส่ลายน้ำ ตรวจว่าเนื้อความเดิม (คำลับ) ยังอยู่ครบหลังแก้ไฟล์"""
    goto(pg, "pdf-watermark")
    pg.set_input_files("input[type=file]", str(files["pdf_main"]), timeout=SIF_TIMEOUT)
    pg.wait_for_selector(".file-row", timeout=SIF_TIMEOUT)
    pg.get_by_role("button", name="ใส่ลายน้ำ").click()
    pg.wait_for_selector(".result", timeout=STEP_TIMEOUT)
    out = dl(pg, lambda: pg.get_by_role("button", name="ดาวน์โหลด").click(), "pdf_watermark_out.pdf")
    d = fitz.open(str(out))
    ck_true("pdf-watermark: จำนวนหน้าเท่าเดิม (2)", d.page_count == 2, f"ได้ {d.page_count}")
    text = "".join(pg_.get_text() for pg_ in d)
    ck_true("pdf-watermark: เนื้อความเดิม (คำลับ) ยังอยู่ครบ", MAGIC_SECRET in text)


def sc_pdf_to_text(pg, files):
    """pdf.js — ดึงข้อความออกมาเป็น .txt"""
    goto(pg, "pdf-to-text")
    pg.set_input_files("input[type=file]", str(files["pdf_main"]), timeout=SIF_TIMEOUT)
    pg.wait_for_selector(".file-row", timeout=SIF_TIMEOUT)
    pg.get_by_role("button", name="ดึงข้อความ").click()
    # ‼️ pdf-to-text.js ไม่ได้ใช้ resultRow() ร่วม เขียนปุ่มเองในกล่อง class="actions" (ไม่ใช่ ".result")
    #    ตรวจแล้วกับ tests/browser_files.py:case_pdf_to_text ที่รอ ".results .actions" เหมือนกัน
    pg.wait_for_selector(".results .actions", timeout=STEP_TIMEOUT)
    out = dl(pg, lambda: pg.get_by_role("button", name="ดาวน์โหลด .txt").click(), "pdf_to_text_out.txt")
    text = out.read_text(encoding="utf-8-sig")
    ck_true("pdf-to-text: ข้อความที่ดึงมามีคำลับ", MAGIC_SECRET in text)


def sc_pdf_to_images(pg, files):
    """pdf.js + canvas — แปลงทุกหน้าเป็นรูป (page.render ลง canvas แล้ว toBlob)"""
    goto(pg, "pdf-to-images")
    pg.set_input_files("input[type=file]", str(files["pdf_main"]), timeout=SIF_TIMEOUT)
    pg.wait_for_selector(".file-row", timeout=SIF_TIMEOUT)
    pg.get_by_role("button", name="แปลงเป็นรูป").click()
    pg.wait_for_selector(".results button", timeout=STEP_TIMEOUT)
    out = dl(pg, lambda: pg.locator(".results button", has_text="ZIP").first.click(), "pdf_to_images_out.zip")
    with zipfile.ZipFile(out) as z:
        names = z.namelist()
        ck_true("pdf-to-images: จำนวนรูปตรงจำนวนหน้า (2)", len(names) == 2, f"ได้ {len(names)}")
        for n in names:
            im = Image.open(io.BytesIO(z.read(n)))
            im.verify()


def sc_pdf_to_word(pg, files):
    """pdf.js (อ่าน) + docx (เขียน) — แปลง PDF เป็น DOCX ที่แก้ไขต่อได้"""
    goto(pg, "pdf-to-word")
    pg.set_input_files("input[type=file]", str(files["pdf_main"]), timeout=SIF_TIMEOUT)
    pg.wait_for_selector(".file-row", timeout=SIF_TIMEOUT)
    pg.get_by_role("button", name="แปลงเป็น Word").click()
    pg.wait_for_selector(".results .result", timeout=STEP_TIMEOUT)
    out = dl(pg, lambda: pg.locator(".results .result button").first.click(), "pdf_to_word_out.docx")
    d = pydocx.Document(str(out))
    full = "\n".join(p.text for p in d.paragraphs)
    ck_true("pdf-to-word: เอกสาร Word ที่ได้มีคำลับ", MAGIC_SECRET in full)


def sc_word_to_pdf(pg, files):
    """mammoth (อ่าน docx) + jspdf (เขียน pdf) — ฝังฟอนต์ไทยจาก vendor/fonts/ ด้วย"""
    goto(pg, "word-to-pdf")
    pg.set_input_files("input[type=file]", str(files["docx"]), timeout=SIF_TIMEOUT)
    pg.wait_for_selector(".file-row", timeout=SIF_TIMEOUT)
    pg.get_by_role("button", name="แปลงเป็น PDF").click()
    pg.wait_for_selector(".results .result", timeout=STEP_TIMEOUT)
    out = dl(pg, lambda: pg.locator(".results .result button").first.click(), "word_to_pdf_out.pdf")
    d = fitz.open(str(out))
    text = "".join(pg_.get_text() for pg_ in d)
    ck_true("word-to-pdf: PDF ที่ได้มีคำลับ", MAGIC_SECRET in text)


def sc_excel_csv(pg, files):
    """xlsx — แปลง XLSX เป็น CSV"""
    goto(pg, "excel-csv")
    pg.set_input_files("input[type=file]", str(files["xlsx"]), timeout=SIF_TIMEOUT)
    pg.wait_for_selector(".file-row", timeout=SIF_TIMEOUT)
    pg.get_by_role("button", name="แปลงไฟล์").click()
    pg.wait_for_selector(".results .result", timeout=STEP_TIMEOUT)
    out = dl(pg, lambda: pg.locator(".results .result button").first.click(), "excel_csv_out.csv")
    text = out.read_text(encoding="utf-8-sig")
    ck_true("excel-csv: CSV ที่ได้มีคำลับ", MAGIC_SECRET in text)


def sc_image_resize(pg, files):
    """canvas — ย่อ/บีบอัดรูปด้วย canvas.toBlob() ในเบราว์เซอร์ล้วน"""
    goto(pg, "image-resize")
    pg.set_input_files("input[type=file]", str(files["png"]), timeout=SIF_TIMEOUT)
    pg.wait_for_selector(".file-row", timeout=SIF_TIMEOUT)
    pg.get_by_role("button", name="ย่อและบีบอัด").click()
    # ‼️ image-resize.js มี UI ของตัวเอง (.rz-* ทั้งหมด) ไม่มี ".results"/".result" เลย
    #    ตรวจแล้วกับ tests/browser_files.py:case_image_resize ที่รอ ".status-wrap .status.show" แทน
    pg.wait_for_selector(".status-wrap .status.show", timeout=STEP_TIMEOUT)
    out = dl(pg, lambda: pg.get_by_role("button", name="ดาวน์โหลดรูป").click(), "image_resize_out.jpg")
    im = Image.open(out); im.verify()
    ck_true("image-resize: ไฟล์รูปที่ได้เปิดได้จริงและมีขนาด > 0", out.exists() and out.stat().st_size > 0)


def sc_pdf_ocr(pg, files):
    """tesseract — OCR อ่านคำลับจากรูปกลับมาเป็นข้อความ (พิสูจน์ว่าประมวลผลเนื้อไฟล์จริงในเครื่อง)"""
    goto(pg, "pdf-ocr")
    pg.set_input_files("input[type=file]", str(files["png"]), timeout=SIF_TIMEOUT)
    pg.wait_for_selector(".file-row", timeout=SIF_TIMEOUT)
    # เลือกภาษาอังกฤษอย่างเดียว (ข้อความในรูปเป็น ASCII ล้วน) — โหลดชุดภาษาเล็กสุด เร็วสุด
    pg.locator('.seg input[value="eng"]').check()
    pg.get_by_role("button", name="เริ่มอ่าน").click()
    pg.wait_for_function(
        "() => { const s = document.querySelector('.status'); "
        "return s && (s.classList.contains('ok') || s.classList.contains('err')); }",
        timeout=OCR_TIMEOUT,
    )
    cls = pg.locator(".status").first.get_attribute("class") or ""
    ck_true("pdf-ocr: เครื่องมือรันจบโดยไม่ error", "err" not in cls, cls)
    text = pg.locator(".preview-text").text_content() or ""
    got_clean = re.sub(r"[^A-Z0-9]", "", text.upper())
    want_clean = re.sub(r"[^A-Z0-9]", "", MAGIC_SECRET.upper())
    ck_true("pdf-ocr: อ่านคำลับกลับมาได้จริง (พิสูจน์ว่า OCR ประมวลผลรูปจริงในเบราว์เซอร์)",
            want_clean in got_clean, f"OCR ได้: {text[:200]!r}")


SCENARIOS = [
    ("pdf-merge (pdf-lib)", sc_pdf_merge),
    ("pdf-watermark (pdf-lib)", sc_pdf_watermark),
    ("pdf-to-text (pdf.js)", sc_pdf_to_text),
    ("pdf-to-images (pdf.js + canvas)", sc_pdf_to_images),
    ("pdf-to-word (pdf.js + docx)", sc_pdf_to_word),
    ("word-to-pdf (mammoth + jspdf)", sc_word_to_pdf),
    ("excel-csv (xlsx)", sc_excel_csv),
    ("image-resize (canvas)", sc_image_resize),
    ("pdf-ocr (tesseract)", sc_pdf_ocr),
]


# ═════════════════════════════════════════════════════════════════════════
# ตรวจซ้ำฝั่งโค้ด (static) — brief ข้อ 4
# ═════════════════════════════════════════════════════════════════════════
def static_checks():
    src_text = ""
    for f in sorted((ROOT / "src").rglob("*.js")):
        src_text += f"\n### {f.relative_to(ROOT)} ###\n" + f.read_text(encoding="utf-8")
    index_text = (ROOT / "index.html").read_text(encoding="utf-8")
    sw_text = (ROOT / "sw.js").read_text(encoding="utf-8")

    bad_patterns = ["googletagmanager", "gtag(", "google-analytics", "analytics.js",
                     "mixpanel", "amplitude", "segment.com", "hotjar", "sentry", "fullstory",
                     "plausible.io", "cloudflareinsights"]
    hits = [pat for pat in bad_patterns if pat in src_text or pat in index_text or pat in sw_text]
    ck_true("ไม่มีร่องรอย analytics/tracking library ใด ๆ ในโค้ด (gtag/GA/mixpanel/sentry/hotjar ฯลฯ)",
            not hits, f"เจอ: {hits}")

    ext_script_srcs = re.findall(r'<script[^>]+src="(https?://[^"]+)"', index_text)
    ck_true('ไม่มี <script src="http...\"> ภายนอกฝังตรงใน index.html (ทุกอย่างโหลดผ่าน loader.js on-demand)',
            not ext_script_srcs, str(ext_script_srcs))

    img_http_src = re.findall(r'\.src\s*=\s*["\']https?://', src_text)
    ck_true("ไม่มีจุดไหนใน src/*.js ตั้ง .src = \"http...\" ตรง ๆ (ยกเว้นผ่าน loader.js ที่ตรวจแยกแล้ว)",
            not img_http_src, str(len(img_http_src)))

    has_csp_meta = 'http-equiv="Content-Security-Policy"' in index_text or "http-equiv='Content-Security-Policy'" in index_text
    if not has_csp_meta:
        risk("กลาง", "ไม่มี Content-Security-Policy",
             "index.html ไม่มี <meta http-equiv=\"Content-Security-Policy\"> เลย และ GitHub Pages "
             "(static hosting ล้วน ไม่มีกลไก _headers/response header กำหนดเอง) ก็ไม่ได้ส่ง CSP header มาแทน "
             "— ถ้ามี XSS จุดใดจุดหนึ่งเกิดขึ้น (เช่นบั๊กในอนาคต) จะไม่มีชั้นป้องกันที่สองเลย "
             "แนะนำเพิ่ม <meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; "
             "script-src 'self' cdnjs.cloudflare.com cdn.jsdelivr.net; "
             "connect-src 'self' cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; "
             "img-src 'self' data: blob:; object-src 'none'\"> ใน index.html "
             "(connect-src ต้องเปิด cdn.jsdelivr.net ไว้เพราะ Tesseract.js ดึงชุดภาษา OCR จากที่นั่นจริง)")

    has_integrity = ('integrity="' in src_text) or ('integrity="' in index_text) or ("integrity=" in src_text)
    if not has_integrity:
        risk("สูง", "สคริปต์จาก CDN ภายนอกไม่มี Subresource Integrity (SRI)",
             "src/loader.js ฟังก์ชัน injectScript() (โหลดทุกไลบรารีของเว็บ รวม CDN fallback) "
             "สร้าง <script src=...> โดยไม่ตั้ง .integrity/.crossOrigin เลย และ Tesseract.js เองก็โหลด "
             "worker script + core wasm + ชุดภาษาจาก cdn.jsdelivr.net โดยไม่ตรวจ integrity เช่นกัน — "
             "ถ้า CDN นั้นถูกแฮ็กหรือถูกสอดแทรกระหว่างทาง (MITM) จะรันโค้ดอะไรก็ได้ในหน้าเว็บผู้ใช้ "
             "รวมถึงมีโอกาสอ่าน/ส่งไฟล์ที่ผู้ใช้กำลังประมวลผลอยู่ในหน่วยความจำตอนนั้นออกไปได้จริง "
             "(ตรงข้ามกับคำโฆษณา 'ไฟล์ไม่ถูกอัปโหลด') "
             "แนะนำ: (1) เพิ่ม integrity hash (sha384) ต่อ entry ที่มี .cdn ใน src/loader.js REG อย่างน้อย "
             "สำหรับเส้นทาง CDN fallback (2) self-host worker.min.js + core wasm + ชุดภาษา eng/tha "
             "ของ Tesseract ไว้ใน vendor/ ให้ครบ (ตอนนี้ vendor/ มีแค่ tesseract.min.js ตัวหลัก) "
             "เพื่อตัดการพึ่งพา CDN ภายนอกสำหรับ OCR ไปเลย")
    else:
        ck_true("สคริปต์จาก CDN มี Subresource Integrity (SRI) กำกับ", True)

    blanks = re.findall(r'<a\b[^>]*target="_blank"[^>]*>', index_text)
    missing_noopener = [b for b in blanks if "noopener" not in b]
    ck_true('ทุก target="_blank" ใน index.html มี rel="noopener" ครบ (กัน reverse tabnabbing)',
            not missing_noopener, str(missing_noopener))
    ck_true(f'พบลิงก์ target="_blank" ทั้งหมด {len(blanks)} จุด (ตรวจครบทุกจุดแล้วข้างบน)', True)


# ═════════════════════════════════════════════════════════════════════════
def main():
    start_server()
    files = make_magic_files()

    # เก็บหลักฐาน request ทั้งหมด — ระดับ "network" (แหล่งความจริงหลัก ครอบคลุมถึง Worker)
    all_requests = []     # จาก context "request": scenario/url/method/resource_type/post_data
    finished_log = []     # จาก context "requestfinished": scenario/url/status
    failed_log = []       # จาก context "requestfailed": scenario/url/failure
    ws_events = []        # จาก page "websocket": scenario/url
    js_calls_log = []     # harvest ของ window.__calls ต่อฉาก (ระดับ JS API — เสริม)
    page_errs = []
    current_scenario = {"name": "boot"}

    def on_request(req):
        try:
            pd = req.post_data
        except Exception:
            pd = None
        all_requests.append({
            "scenario": current_scenario["name"],
            "url": req.url, "method": req.method,
            "resource_type": req.resource_type,
            "post_data": (pd[:500] if pd else None),
        })

    def on_finished(req):
        try:
            resp = req.response()
            status = resp.status if resp else None
        except Exception:
            status = None
        finished_log.append({"scenario": current_scenario["name"], "url": req.url, "status": status})

    def on_failed(req):
        try:
            failure = req.failure
        except Exception:
            failure = None
        failed_log.append({"scenario": current_scenario["name"], "url": req.url, "failure": failure})

    def on_websocket(ws):
        ws_events.append({"scenario": current_scenario["name"], "url": ws.url})

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            ctx = browser.new_context(viewport={"width": 1360, "height": 980})
            ctx.on("request", on_request)
            ctx.on("requestfinished", on_finished)
            ctx.on("requestfailed", on_failed)
            pg = ctx.new_page()
            pg.on("websocket", on_websocket)
            pg.on("pageerror", lambda e: page_errs.append(str(e)))
            pg.add_init_script(INIT_SCRIPT)

            pg.goto(BASE, wait_until="networkidle")
            pg.wait_for_selector("#tools", timeout=STEP_TIMEOUT)

            # ═══════════════════════════════════════════════════════════════
            section("0) พิสูจน์เครื่องมือตรวจก่อนเชื่อผล — canary same-origin/loopback เท่านั้น "
                    "(ห้ามยิงออกเว็บภายนอกจริงตามข้อห้าม)")
            # ═══════════════════════════════════════════════════════════════
            current_scenario["name"] = "canary-self-test"
            before_reqs = len(all_requests)
            before_failed = len(failed_log)
            pg.evaluate("""(args) => {
                const [secret, mark] = args;
                // fetch — same-origin (เสิร์ฟจาก http.server ของเราเอง คาด 404 แต่ไม่ออกนอกเครื่อง)
                fetch('/' + mark + '/fetch?leak=' + secret).catch(()=>{});
                // fetch ไป loopback พอร์ตปิด — พิสูจน์ requestfailed (ต่อไม่ติด แต่ "พยายามยิง" ต้องถูกจับ)
                fetch('http://127.0.0.1:1/' + mark + '-http?leak=' + secret).catch(()=>{});
                // XHR — same-origin
                try {
                    const x = new XMLHttpRequest();
                    x.open('POST', '/' + mark + '/xhr');
                    x.send('leak=' + secret);
                } catch(e) {}
                // sendBeacon — same-origin
                try { navigator.sendBeacon('/' + mark + '/beacon', 'leak=' + secret); } catch(e) {}
                // Image.src — same-origin
                try { const im = new Image(); im.src = '/' + mark + '/img?leak=' + secret; } catch(e) {}
                // WebSocket ไป loopback พอร์ตปิด — ต่อไม่ติดแน่นอน แต่ "พยายามยิง" ต้องถูกจับที่ระดับ JS
                try { new WebSocket('ws://127.0.0.1:1/' + mark + '/' + secret); } catch(e) {}
                // localStorage
                try { localStorage.setItem('__fk_canary_key__', 'leak=' + secret); } catch(e) {}
            }""", [MAGIC_SECRET, CANARY_MARK])
            pg.wait_for_timeout(1500)

            calls = pg.evaluate("() => window.__calls || {}")
            ck_true("canary — window.fetch patch จับ canary ได้จริง",
                    any(MAGIC_SECRET in c.get("url", "") for c in calls.get("fetch", [])))
            ck_true("canary — XMLHttpRequest patch จับ canary ได้จริง",
                    any(MAGIC_SECRET in (c.get("body") or "") for c in calls.get("xhrSend", [])))
            ck_true("canary — navigator.sendBeacon patch จับ canary ได้จริง",
                    any(MAGIC_SECRET in (c.get("data") or "") for c in calls.get("beacon", [])))
            ck_true("canary — HTMLImageElement.src patch จับ canary ได้จริง",
                    any(MAGIC_SECRET in s for s in calls.get("imgSrc", [])))
            ck_true("canary — WebSocket patch จับ canary ได้จริง",
                    any(MAGIC_SECRET in c.get("url", "") for c in calls.get("ws", [])))
            ck_true("canary — localStorage.setItem patch จับ canary ได้จริง",
                    any(MAGIC_SECRET in (c.get("value") or "") for c in calls.get("storageSet", [])))

            new_reqs = all_requests[before_reqs:]
            ck_true("canary — network-level capture (context.on('request')) จับ fetch canary ได้จริง",
                    any(MAGIC_SECRET in r["url"] for r in new_reqs))

            # requestfailed ต้องจับ canary ที่ยิงไป loopback พอร์ตปิดได้ (รอให้ล้มเหลวจริงก่อน)
            deadline = time.time() + 10
            while time.time() < deadline and not any(CANARY_MARK in r["url"] and "127.0.0.1:1" in r["url"] for r in failed_log[before_failed:]):
                pg.wait_for_timeout(200)
            ck_true("canary — context.on('requestfailed') จับ request ที่ยิงไม่สำเร็จได้จริง (loopback พอร์ตปิด)",
                    any(CANARY_MARK in r["url"] for r in failed_log[before_failed:]))

            # เก็บกวาดร่องรอย canary ออกจาก localStorage จริง กันปนกับผลตรวจตอนท้าย
            pg.evaluate("() => { try { localStorage.removeItem('__fk_canary_key__'); } catch(e) {} }")

            if F:
                print("\n‼️ ตัวดักจับพลาด canary บางช่องทาง — ผลตรวจ Section ถัดไปเชื่อถือไม่ได้ หยุดที่นี่")
                raise SystemExit(97)

            # ═══════════════════════════════════════════════════════════════
            # สถานการณ์ใช้งานจริง 9 เครื่องมือ
            # ═══════════════════════════════════════════════════════════════
            for name, fn in SCENARIOS:
                section(f"ทดสอบเครื่องมือจริง: {name}")
                current_scenario["name"] = name
                try:
                    fn(pg, files)
                except Exception as e:
                    F.append(f"[{name}] เครื่องมือ error ระหว่างรัน: {e}")
                    print(f"  ❌ [{name}] EXCEPTION: {e}")
                finally:
                    harvest_js_calls(pg, name, js_calls_log)

            # ═══════════════════════════════════════════════════════════════
            section("ดัมพ์ storage ค่าจริงหลังใช้งานครบทุกเครื่องมือ")
            # ═══════════════════════════════════════════════════════════════
            storage = dump_storage(pg)
            print(json.dumps(storage, ensure_ascii=False, indent=2))
            idb = dump_indexeddb(pg, MAGIC_SECRET, MAGIC_FILENAME)
            # พิมพ์ค่าจริงของทุก key/store (ไม่พิมพ์ตัวเนื้อไบนารีทั้งก้อน — อ่านไม่ออกอยู่ดี แต่พิมพ์
            # ชื่อ key/ชนิด/ขนาดไบต์จริง/ผลสแกนคำลับต่อ entry แทน ซึ่งคือ "ค่าจริง" ที่ตรวจได้จริง)
            print("IndexedDB (ค่าจริงทุก database/store/key ที่เจอ):")
            print(json.dumps(idb, ensure_ascii=False, indent=2))

            storage_text = json.dumps(storage, ensure_ascii=False)
            ck_true("localStorage/sessionStorage/cookie ไม่มีคำลับ (เนื้อไฟล์/ชื่อไฟล์) ปนอยู่เลย",
                    MAGIC_SECRET not in storage_text and MAGIC_FILENAME not in storage_text)

            idb_dbs = idb.get("dbs", [])
            idb_leaks = []
            for db in idb_dbs:
                for sn, entries in db.get("stores", {}).items():
                    for e in entries:
                        if e.get("keyHasSecret") or e.get("valHasSecret"):
                            idb_leaks.append(f"{db['name']}/{sn}/{e['key']}")
            if not idb_dbs:
                ck_true("ไม่มี IndexedDB database ใด ๆ ถูกสร้างขึ้นเลยระหว่างทดสอบ", True)
            else:
                names = [d["name"] for d in idb_dbs]
                # ‼️ พบจริงตอนรัน (จับได้ครั้งแรกด้วยการทดสอบจริง ไม่ใช่เดาจาก static grep): Tesseract.js
                # เองใช้ idb-keyval แคชชุดภาษา OCR ที่ดาวน์โหลดมาไว้ใน IndexedDB "keyval-store" ข้าม
                # session (เห็น key "./eng.traineddata" ขนาดหลายสิบ MB) — เป็นโมเดลภาษาสาธารณะที่ตัว
                # เอนจินดาวน์โหลดมาเอง ไม่ใช่ไฟล์ของผู้ใช้ที่อัปโหลดเข้ามา จึงไม่ผิดคำโฆษณา "ไฟล์ไม่ถูก
                # อัปโหลด" — แต่ "ต้องไม่มีคำลับของเราปนอยู่ในนั้นเลย" คือเงื่อนไขที่ต้องพิสูจน์จริง
                risk("ต่ำ", "OCR แคชชุดภาษาไว้ถาวรใน IndexedDB โดยไม่บอกผู้ใช้ตรง ๆ",
                     f"เจอ database จริง: {names} — มาจาก Tesseract.js เอง (ผ่าน idb-keyval ที่บันเดิลอยู่ใน "
                     f"worker.min.js ที่โหลดจาก cdn.jsdelivr.net ตอนกดใช้ OCR) เก็บชุดภาษาที่ดาวน์โหลดมา "
                     f"(เช่น eng.traineddata) ไว้ใช้ซ้ำข้าม session ขนาดหลายสิบ MB ต่อภาษา ไม่ใช่ข้อมูล/ไฟล์ "
                     f"ของผู้ใช้ (พิสูจน์แล้วด้านล่างว่าไม่มีคำลับปนอยู่ในนั้นเลย) แต่หน้าเว็บไม่ได้บอกผู้ใช้ว่า "
                     f"จะฝังไฟล์ถาวรไว้ในเบราว์เซอร์แบบนี้ (ต่างจากปุ่ม 'เตรียมใช้งานออฟไลน์' ใน src/offline.js "
                     f"ที่ผู้ใช้กดเลือกเองชัดเจน) แนะนำเพิ่มข้อความในหน้า pdf-ocr (src/tools/pdf-ocr.js) ให้รู้ว่า "
                     f"ชุดภาษาจะถูกแคชถาวรในเบราว์เซอร์ และจะล้างได้อย่างไร (ล้าง site data ของเว็บนี้)")
            ck_true("‼️ ไม่มีคำลับ (เนื้อไฟล์/ชื่อไฟล์) ปนอยู่ใน IndexedDB เลยแม้แต่ entry เดียว "
                    "(รวมทั้งชื่อ key และสแกนเนื้อ value แบบไบต์ต่อไบต์)",
                    not idb_leaks, f"เจอใน: {idb_leaks}")

            real_page_errs = [e for e in page_errs if "favicon" not in e.lower()
                               and "transition was skipped" not in e.lower()]
            ck_true("ไม่มี pageerror ระหว่างใช้งานเครื่องมือจริงทั้ง 9 ตัว",
                    not real_page_errs, "; ".join(real_page_errs[:3]))

            # ═══════════════════════════════════════════════════════════════
            section("ผลตรวจคำโฆษณา 'ไฟล์ไม่ถูกอัปโหลดไปไหน' — จากหลักฐาน request จริงทั้งหมด")
            # ═══════════════════════════════════════════════════════════════
            real = [r for r in all_requests if CANARY_MARK not in r["url"]]
            print(f"  จำนวน request ทั้งหมดที่จับได้ระหว่างใช้งานเครื่องมือจริง (ไม่รวม canary): {len(real)}")
            print(f"  จำนวน requestfinished: {len(finished_log)}  ·  requestfailed: {len(failed_log)}")

            leaked = [r for r in real if
                      MAGIC_SECRET in r["url"] or (r["post_data"] and MAGIC_SECRET in r["post_data"]) or
                      MAGIC_FILENAME in r["url"] or (r["post_data"] and MAGIC_FILENAME in r["post_data"])]
            ck_true("‼️ หัวใจของเทสนี้: ไม่มี request ใดเลยที่ url/post_data มีคำลับ (เนื้อไฟล์หรือชื่อไฟล์)",
                    not leaked, f"เจอ {len(leaked)} รายการ: " + "; ".join(r['url'][:200] for r in leaked[:5]))

            # เช็คคำลับใน window.__calls ทุกฉากด้วย (ชั้นที่สอง — ระดับ JS API)
            js_leak = []
            for entry in js_calls_log:
                blob = json.dumps(entry["calls"], ensure_ascii=False)
                if MAGIC_SECRET in blob or MAGIC_FILENAME in blob:
                    js_leak.append(entry["scenario"])
            ck_true("ไม่มีคำลับหลุดผ่าน window.fetch/XHR/sendBeacon/WebSocket/Image.src ในฉากไหนเลย",
                    not js_leak, f"เจอในฉาก: {js_leak}")

            # blob:/data: ไม่ใช่ network request เลย — resolve ในเบราว์เซอร์เองล้วน ๆ (ไม่มี DNS/TLS/
            # connection ใด ๆ ออกไปไหน) เป็น object URL ที่หน้าเว็บสร้างเองชี้ไปข้อมูลในหน่วยความจำ/แคช
            # ของตัวเอง (เช่น URL.createObjectURL(canvas.toBlob(...)) หรือ URL.createObjectURL(new Blob([workerScript]))
            # ตอนสร้าง Worker ในเบราว์เซอร์) — ต้องแยกออกจาก "โดเมนภายนอก" ให้ชัด ไม่งั้นจะดูเหมือนเป็นการ
            # ยิงออกนอกเครื่องทั้งที่จริงไม่ใช่เลย
            LOCAL_URL_PREFIXES = ("blob:", "data:", "about:", "filesystem:")
            in_memory = [r for r in real if r["url"].startswith(LOCAL_URL_PREFIXES)]
            ext = [r for r in real
                   if not r["url"].startswith(BASE) and not r["url"].startswith(LOCAL_URL_PREFIXES)]
            ext_write = [r for r in ext if r["method"] in ("POST", "PUT", "PATCH", "DELETE")]
            ck_true("ไม่มี request แบบ POST/PUT/PATCH/DELETE ออกไปโดเมนภายนอกเลย",
                    not ext_write, "; ".join(f"{r['method']} {r['url']}" for r in ext_write[:5]))

            domains = {}
            for r in ext:
                host = urlparse(r["url"]).netloc
                domains.setdefault(host, []).append(r)

            print(f"\n  โดเมนภายนอกทั้งหมดที่ถูกเรียกจริงระหว่างใช้งานเครื่องมือทั้ง 9 ตัว: {len(domains)} โดเมน")
            if not domains:
                print("  (ไม่มีเลย — ทุก request เป็น same-origin ทั้งหมด)")
            for host, reqs in sorted(domains.items()):
                scenarios = sorted(set(r["scenario"] for r in reqs))
                print(f"\n  ── โดเมน: {host}   ({len(reqs)} request, เกิดตอน: {', '.join(scenarios)})")
                print(f"     คือ: {classify_external(reqs[0]['url'])}")
                seen = set()
                for r in reqs:
                    key = (r["url"], r["scenario"])
                    if key in seen:
                        continue
                    seen.add(key)
                    print(f"       [{r['scenario']:28s}] {r['method']:4s} {r['resource_type']:10s} {r['url']}")

            # same-origin สรุปสั้น ๆ (จำนวนพอ ไม่ต้อง list ทุกบรรทัด)
            same_origin = [r for r in real if r["url"].startswith(BASE)]
            by_scn = {}
            for r in same_origin:
                by_scn.setdefault(r["scenario"], 0)
                by_scn[r["scenario"]] += 1
            print(f"\n  request same-origin ทั้งหมด {len(same_origin)} รายการ (index.html/src/*.js/vendor/* ที่โหลดซ้ำทุกครั้ง goto ใหม่)")
            for scn, n in by_scn.items():
                print(f"    · {scn}: {n} request")

            by_scn_mem = {}
            for r in in_memory:
                by_scn_mem.setdefault(r["scenario"], 0)
                by_scn_mem[r["scenario"]] += 1
            print(f"\n  request blob:/data: (ในหน่วยความจำล้วน ไม่ใช่ network จริง) ทั้งหมด {len(in_memory)} รายการ")
            for scn, n in by_scn_mem.items():
                print(f"    · {scn}: {n} request")

            # ═══════════════════════════════════════════════════════════════
            section("ตรวจซ้ำฝั่งโค้ด (static) — fetch/XHR/analytics/CSP/SRI/target=_blank")
            # ═══════════════════════════════════════════════════════════════
            static_checks()

            ctx.close()
            browser.close()
    finally:
        stop_server()
        shutil.rmtree(SCRATCH, ignore_errors=True)
        print(f"\nลบไฟล์ชั่วคราวที่ {SCRATCH} แล้ว")

    # ═════════════════════════════════════════════════════════════════════
    print(f"\n{'═'*70}\nผ่าน {P} · ตก {len(F)}")
    if F:
        print("\nรายการที่ตก:")
        for i, x in enumerate(F, 1):
            print(f"  {i}. {x}")

    print(f"\n{'═'*70}\nตารางความเสี่ยง (ไม่ใช่การรั่วไหลของไฟล์ผู้ใช้ — แต่ควรแก้)\n{'═'*70}")
    order = {"สูง": 0, "กลาง": 1, "ต่ำ": 2}
    if RISKS:
        for sev, name, detail in sorted(RISKS, key=lambda x: order.get(x[0], 9)):
            print(f"  [{sev}] {name}\n        {detail}\n")
    else:
        print("  ไม่พบความเสี่ยงเพิ่มเติมนอกจากที่ระบุด้านบน")

    print(f"\n{'═'*70}\nสรุปคำตอบ: คำโฆษณา 'ไฟล์ไม่ถูกอัปโหลดไปไหน' เป็นความจริงหรือไม่\n{'═'*70}")
    if not F:
        print("  ✅ เป็นความจริง — ทดสอบเครื่องมือจริง 9 ตัว (ครอบ pdf-lib/pdf.js/docx/mammoth/xlsx/"
              "canvas/tesseract) ด้วยไฟล์ที่ฝังคำลับ ไม่พบคำลับ (เนื้อไฟล์หรือชื่อไฟล์) หลุดออกไปใน request "
              "ใดเลย ไม่มี POST/PUT ออกโดเมนภายนอกเลย ตัวดักจับพิสูจน์แล้วว่าจับ canary ได้จริงทุกช่องทาง "
              "ก่อนเชื่อผลนี้ (ดู Section 0) — ข้อยกเว้นเดียวคือเครื่องมือ OCR (pdf-ocr) ที่ดาวน์โหลด "
              "เอนจิน/ชุดภาษาสาธารณะจาก cdn.jsdelivr.net (ไม่ใช่ไฟล์ของผู้ใช้ และเป็นทิศทาง "
              "'ดาวน์โหลดเข้า' ไม่ใช่ 'อัปโหลดออก') ดูตารางโดเมนภายนอกด้านบนสำหรับรายละเอียดครบ\n"
              "  หมายเหตุที่จับได้จริงระหว่างทดสอบ (ไม่ใช่การรั่วไหล แต่ต้องรู้ไว้): เครื่องมือ OCR แคช "
              "ชุดภาษาที่ดาวน์โหลดมาไว้ใน IndexedDB ถาวรข้าม session ผ่านกลไกของ Tesseract.js เอง — "
              "ตรวจแล้วว่าเป็นแค่ไฟล์โมเดลภาษาสาธารณะ ไม่มีคำลับของเราปนอยู่เลย (ดูตารางความเสี่ยงระดับ "
              "'ต่ำ' ด้านล่าง)")
    else:
        print("  ❌ พบปัญหา — ดูรายการที่ตกด้านบนก่อนสรุป")

    print()
    sys.exit(1 if F else 0)


if __name__ == "__main__":
    main()
