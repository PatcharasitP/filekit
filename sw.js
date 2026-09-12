// ── Service Worker ─────────────────────────────────────────────────────────
// GitHub Pages ตั้ง Cache-Control ให้ทุกไฟล์เป็น max-age=600 เท่ากันหมด และ
// ไม่ส่ง brotli — เราจึงคุมแคชเองตรงนี้แทนการหวังพึ่ง header ของโฮสต์
//
// กลยุทธ์:
//   vendor/*  → cache-first ถาวร (ไฟล์ตรึงเวอร์ชันในชื่อ/เนื้อหาอยู่แล้ว)
//   ที่เหลือ  → stale-while-revalidate (เปิดเร็วจากแคช แล้วอัปเดตเงียบ ๆ)
// ผลพลอยได้คือเปิดใช้งานได้แม้ออฟไลน์ ซึ่งพิสูจน์คำโฆษณา "ไฟล์ไม่ออกจากเครื่อง"
// ด้วยพฤติกรรมจริง ไม่ใช่แค่คำพูด

const VERSION = "filekit-v93";
const SHELL = `${VERSION}-shell`;
const LIBS = `${VERSION}-libs`;

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
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
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
