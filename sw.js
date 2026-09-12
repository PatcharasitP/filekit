// ── Service Worker ─────────────────────────────────────────────────────────
// GitHub Pages ตั้ง Cache-Control ให้ทุกไฟล์เป็น max-age=600 เท่ากันหมด และ
// ไม่ส่ง brotli — เราจึงคุมแคชเองตรงนี้แทนการหวังพึ่ง header ของโฮสต์
//
// กลยุทธ์:
//   vendor/*  → cache-first ถาวร (ไฟล์ตรึงเวอร์ชันในชื่อ/เนื้อหาอยู่แล้ว)
//   ที่เหลือ  → stale-while-revalidate (เปิดเร็วจากแคช แล้วอัปเดตเงียบ ๆ)
// ผลพลอยได้คือเปิดใช้งานได้แม้ออฟไลน์ ซึ่งพิสูจน์คำโฆษณา "ไฟล์ไม่ออกจากเครื่อง"
// ด้วยพฤติกรรมจริง ไม่ใช่แค่คำพูด

const VERSION = "filekit-v94";
const SHELL = `${VERSION}-shell`;

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
const LIBS = "filekit-libs-v1";

const PRECACHE = [
  "./", "./index.html",
  "./src/app.js", "./src/i18n.js", "./src/registry.js", "./src/loader.js", "./src/dom.js", "./src/search.js", "./src/icons.js", "./src/workspace.js",
  "./assets/css/tool.css", "./manifest.webmanifest",
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
