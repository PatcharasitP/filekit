// ── Service Worker ─────────────────────────────────────────────────────────
// GitHub Pages ตั้ง Cache-Control ให้ทุกไฟล์เป็น max-age=600 เท่ากันหมด และ
// ไม่ส่ง brotli — เราจึงคุมแคชเองตรงนี้แทนการหวังพึ่ง header ของโฮสต์
//
// กลยุทธ์:
//   vendor/*  → cache-first ถาวร (ไฟล์ตรึงเวอร์ชันในชื่อ/เนื้อหาอยู่แล้ว)
//   ที่เหลือ  → stale-while-revalidate (เปิดเร็วจากแคช แล้วอัปเดตเงียบ ๆ)
// ผลพลอยได้คือเปิดใช้งานได้แม้ออฟไลน์ ซึ่งพิสูจน์คำโฆษณา "ไฟล์ไม่ออกจากเครื่อง"
// ด้วยพฤติกรรมจริง ไม่ใช่แค่คำพูด

const VERSION = "filekit-v156";
const SHELL = `${VERSION}-shell`;
/* เพดานเวลารอเครือข่ายตอนเปิดหน้าเว็บ ครบเวลาแล้วใช้แคชทันที */
const NAV_NET_TIMEOUT_MS = 1200;
/* หน้าที่เปิดตรงได้ (path เทียบกับที่อยู่ของ service worker) กับกุญแจแคชของหน้านั้น ‼️ เพิ่มหน้าใหม่ต้องเพิ่มที่นี่ */
const PAGES = {
  "": "./index.html", "index.html": "./index.html",
  "flow/": "./flow/index.html", "flow/index.html": "./flow/index.html",
};

/* ‼️‼️ แคชไลบรารี **ห้ามผูกกับเวอร์ชันของแอป**
 *
 * เดิมเขียนว่า `${VERSION}-libs` ซึ่งแปลว่าทุกครั้งที่ bump เวอร์ชัน
 * ตัวจัดการ activate จะลบแคชนี้ทิ้งด้วย แล้วเบราว์เซอร์ต้องโหลด
 * **ไลบรารีกับฟอนต์ 5.9 MB ใหม่ทั้งหมด** ทั้งที่ไฟล์พวกนี้ไม่ได้เปลี่ยนอะไรเลย
 * (ชื่อไฟล์ตรึงเวอร์ชันอยู่แล้ว เปลี่ยนรุ่นเมื่อไหร่ชื่อไฟล์เปลี่ยนตาม)
 *
 * ‼️ อาการที่ผู้ใช้เจอ: เปลี่ยนภาษาบนหน้าเครื่องมือแล้วตัวหมุนหมุนนานผิดปกติ
 *    เพราะการเปลี่ยนภาษาคือการโหลดหน้าใหม่ ถ้าแคชเพิ่งถูกล้างเพราะ deploy
 *    ก็ต้องโหลดไลบรารีของเครื่องมือนั้นใหม่ทั้งก้อน
 *    วัดจริง 13/09/2026 บน pdf-pages เน็ต 600kbps ตัวหมุนหมุน **4,192 ms**
 *    (pdf-lib.min.js 4,204 ms + pdf.min.js 2,662 ms) เทียบกับ 159 ms ตอนแคชอุ่น
 *    พี่ปอนด์ทักเองว่า "ทำไมตอนเปลี่ยนภาษามันหมุนนานขึ้นมาก" ซึ่งถูกต้อง
 *    วันนั้นฟ้า deploy ไป 18 เวอร์ชัน = ทิ้งแคช 5.9 MB ไป 18 รอบ
 *
 * ‼️ ตัวเลขท้ายชื่อนี้ให้ขยับ **เฉพาะตอนที่ไฟล์ใน vendor/ เปลี่ยนจริง ๆ**
 *    (เพิ่ม ลบ หรืออัปเกรดรุ่นไลบรารี) ห้ามขยับตามเวอร์ชันแอปเด็ดขาด */
/* v2 = 21/09/2026 อัปเกรด pdf-lib เป็น fork @cantoo/pdf-lib 2.11.1
 * ‼️ ชื่อไฟล์ยังเป็น vendor/pdf-lib.min.js เหมือนเดิม ถ้าไม่ขยับเลขนี้
 *    เครื่องที่เคยเปิดเว็บแล้วจะใช้ไลบรารีตัวเก่าจากแคชไปตลอด แล้วฟีเจอร์ใหม่จะไม่มา */
const LIBS = "filekit-libs-v2";

/* ‼️ ทุกโมดูลใน src/ ที่ถูก import ต้องอยู่ในนี้ ไม่งั้นออฟไลน์เปิดเครื่องมือไม่ได้ (tests/browser_offline.py ①)
   13/09/2026 เจอขาด 5 ไฟล์ (cfgsearch, codeview, cvd, dirtymark, toolio) ที่เพิ่มมา 11-12/09 แล้วลืมใส่ */
/* ‼️ ฟอนต์ 3 ไฟล์อยู่ใน PRECACHE ด้วย (13/09/2026): โหลดแรกสุดฟอนต์ถูก fetch ก่อน SW จะ claim หน้า
   จึงไม่เคยถูกใส่แคชในรอบนั้น รอบถัดไปต้องไปดึงจาก HTTP cache ผ่าน SW อีก ใส่ไว้ตั้งแต่ install ให้จบ */
const PRECACHE = [
  "./", "./index.html",
  "./src/app.js", "./src/i18n.js", "./src/registry.js", "./src/loader.js", "./src/dom.js", "./src/search.js", "./src/icons.js", "./src/workspace.js",
  "./assets/css/tool.css", "./assets/css/tool2.css", "./src/shell2.js", "./manifest.webmanifest",
  "vendor/heic-sandbox.html",  /* ห้องขังตัวถอด HEIC */
  "vendor/heic-sandbox.js",
  "src/imgdecode.js",   /* ตัวอ่านรูป รวมทางถอด HEIC */
  "src/inapp.js",       /* แถบเตือน + ทางออกตอนเปิดจากแอปแชท ui.js เรียกใช้ทุกหน้า */
  "src/cfgsearch.js",
  "src/codeview.js",
  "src/cvd.js",
  "src/dirtymark.js",
  "src/toolio.js",
  "src/handoff.js",     /* รับไฟล์ที่ส่งมาจาก FlowKit */
  /* ‼️ โมดูลที่เครื่องมือใช้ร่วมกัน ถ้าไม่อยู่ที่นี่ เครื่องมือนั้นจะเปิดไม่ได้ตอนไม่มีเน็ต
     ทั้งที่หน้าอื่นใช้ได้ปกติ ผู้ใช้จะเห็นเป็น "บางเครื่องมือพัง" ซึ่งงงกว่าเว็บล่มทั้งเว็บ
     tests/browser_offline.py ข้อ ① จับข้อนี้ได้ ให้รันทุกครั้งที่เพิ่มโมดูลใหม่ */
  "src/binkit.js",       /* number-bins */
  "src/geokit.js",       /* map-relocate, map-coverage */
  "src/tools/map-coverage.js",
  "src/pdfimpose.js", /* pdf-nup, pdf-resize */
  "src/textdiff.js",  /* pdf-compare */
  "src/sqlgen.js",       /* pq-group-concat, pq-pick-date, pq-to-date */
  "src/subsetsum.js",    /* excel-match-sum */
  "./vendor/fonts/Sarabun-Regular.woff2", "./vendor/fonts/Sarabun-SemiBold.woff2", "./vendor/fonts/Sarabun-Bold.woff2",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      /* ‼️ เก็บทั้งแคชของเวอร์ชันนี้ และแคชไลบรารีซึ่งมีอายุยืนกว่าแอป
         ถ้าลืมเงื่อนไข k !== LIBS ตรงนี้ ไลบรารี 5.9 MB จะถูกทิ้งทุก deploy เหมือนเดิม */
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION) && k !== LIBS).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isLib = sameOrigin && (url.pathname.includes("/vendor/"));

  if (isLib) {
    // ไลบรารีและฟอนต์: มีในแคชแล้วใช้เลย ไม่ต้องถามเครือข่าย
    e.respondWith(
      caches.open(LIBS).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
    );
    return;
  }

  if (!sameOrigin) return; // ชุดภาษา OCR ฯลฯ ปล่อยให้เบราว์เซอร์จัดการเอง

  /* ── ตัวหน้าเว็บเอง: ถามเครือข่ายก่อน แล้วค่อยถอยมาที่แคช ───────────────────
   * ‼️ ทำไมต้องต่างจากไฟล์อื่น (วัดค่าจริง 16/09/2026)
   *    ของเดิมเสิร์ฟจากแคชก่อนทุกอย่าง (stale-while-revalidate) ซึ่งเร็วมากก็จริง
   *    แต่แปลว่าทุกครั้งที่ปล่อยเวอร์ชันใหม่ ผู้ใช้เดิมจะเห็นหน้าเก่าไปอีกหนึ่งรอบเสมอ
   *    อาการที่เจ้าของเว็บเจอเองคือ กด Ctrl+Shift+R เห็นของใหม่ พอ F5 ต่อกลับเป็นของเก่า
   *    จับสถานะจริงตอนนั้นได้ว่า cache ยังเป็น filekit-v104 ทั้งที่ปล่อย v999 ไปแล้ว
   *    เพราะ service worker ตัวใหม่ยังติดตั้งไม่เสร็จ ตัวเก่าจึงกลับมาคุมแล้วเสิร์ฟของเก่า
   *
   * ‼️ ราคาที่จ่าย และทำไมถึงคุ้ม
   *    ตอนเปิดซ้ำต้องรอเครือข่ายก่อน ซึ่งช้ากว่าหยิบจากแคชเล็กน้อย จึงใส่เพดานเวลาไว้
   *    ครบเวลาเมื่อไหร่ใช้แคชทันที คนเน็ตช้าหรือเน็ตล่มจึงไม่ได้รับผลกระทบเลย
   *    และไฟล์อื่นทั้งหมด (js/css/ฟอนต์) ยังหยิบจากแคชก่อนเหมือนเดิม ความเร็วโดยรวมจึงไม่เปลี่ยน
   */
  if (request.mode === "navigate") {
    /* ‼️ แต่ละหน้าต้องมีกุญแจแคชของตัวเอง (แก้ 22/09/2026 ตอนเพิ่มหน้า flow/ ของ FlowKit)
     *    เดิมตอบทุกหน้าด้วยแคชของ index.html และเอาหน้าไหนก็ตามที่โหลดได้ไปเขียนทับกุญแจนั้น
     *    ผลที่จับได้จริงใน tests/browser_swpages.py:
     *    ① เปิด /flow/ ตอนเน็ตช้าเกิน 1.2 วินาที ได้หน้าแรกของ FileKit แทน
     *    ② เปิด FlowKit แล้วกลับหน้าแรกตอนเน็ตช้า ได้ FlowKit (แคชหน้าแรกถูกเขียนทับ)
     *    หน้าที่ไม่อยู่ในรายการ ปล่อยเบราว์เซอร์จัดการเอง ไม่ต้องแตะแคช */
    const rel = url.pathname.slice(new URL(self.registration.scope).pathname.length);
    const key = sameOrigin ? PAGES[rel] : undefined;
    if (!key) return;
    e.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const cached = await cache.match(key);
        const net = fetch(request)
          .then((res) => { if (res.ok) cache.put(key, res.clone()); return res; });
        if (!cached) return net;                       // ยังไม่เคยมีแคช ต้องรอเครือข่ายอยู่แล้ว
        const wait = new Promise((r) => setTimeout(() => r(null), NAV_NET_TIMEOUT_MS));
        const first = await Promise.race([net.catch(() => null), wait]);
        return first || cached;                        // เครือข่ายช้าหรือล่ม ใช้ของในแคชทันที
      })
    );
    return;
  }

  e.respondWith(
    caches.open(SHELL).then(async (cache) => {
      const hit = await cache.match(request, { ignoreSearch: false });
      const fresh = fetch(request)
        .then((res) => { if (res.ok) cache.put(request, res.clone()); return res; })
        .catch(() => hit || caches.match("./index.html"));
      return hit || fresh;
    })
  );
});
