// fetch_retry.test.mjs  fetchRetry ลองซ้ำเฉพาะพลาดชั่วคราว (เน็ตสะดุด 408 429 5xx) ไม่ลองซ้ำ 404
// ที่มา 07/11/2026 ไล่กดเว็บจริง v221 กราฟแท่งได้ 503 หนึ่งครั้งแล้วค้าง (browser_fetch_retry.py คือเทสหน้าจอคู่กัน)
globalThis.window = globalThis.window || globalThis;
const { fetchRetry } = await import("../src/loader.js");
let pass = 0; const F = [];
const ck = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : F.push(`${n} ได้ ${JSON.stringify(got)} ควรได้ ${JSON.stringify(want)}`); console.log(`  ${ok ? "✅" : "❌"} ${n}`); };
const script = (seq) => { let i = 0; const calls = []; globalThis.fetch = async (u) => { calls.push(u); const x = seq[Math.min(i++, seq.length - 1)]; if (x === "net") throw new TypeError("Failed to fetch"); return { ok: x < 400, status: x }; }; return calls; };
const W = [1, 1];

let c = script([503, 200]); let r = await fetchRetry("a", undefined, W);
ck("503 แล้ว 200 ได้ 200 ขอ 2 ครั้ง", [r.status, c.length], [200, 2]);
c = script(["net", 200]); r = await fetchRetry("a", undefined, W);
ck("เน็ตสะดุดแล้ว 200 ได้ 200", [r.status, c.length], [200, 2]);
c = script([404]); r = await fetchRetry("a", undefined, W);
ck("404 คืนทันที ไม่ลองซ้ำ", [r.status, c.length], [404, 1]);
c = script([429, 502, 200]); r = await fetchRetry("a", undefined, W);
ck("429 แล้ว 502 แล้ว 200 ได้ 200 ขอ 3 ครั้ง", [r.status, c.length], [200, 3]);
c = script([503]); r = await fetchRetry("a", undefined, W);
ck("503 ตลอด ลองครบแล้วคืน 503 ให้ตัวเรียกจัดการ ขอ 3 ครั้ง", [r.status, c.length], [503, 3]);
c = script(["net"]); let err = ""; try { await fetchRetry("a", undefined, W); } catch (e) { err = e.message; }
ck("เน็ตล่มตลอด โยน error เดิมหลังลองครบ", [err, c.length], ["Failed to fetch", 3]);
console.log(`\nผ่าน ${pass} ตก ${F.length}`); if (F.length) { F.forEach((f) => console.log("  " + f)); process.exit(1); }
