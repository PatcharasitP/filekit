import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGrid, withinKm, nearestOf, coverageOf, distanceKm } from "../src/geokit.js";

/* ‼️ ทำไมต้องมีเทสชุดนี้ (18/09/2026)
   หน้าใหม่คำนวณใหม่ทุกครั้งที่ลากแถบรัศมี จึงใช้ตารางกริดเพื่อไม่ต้องเทียบทุกคู่
   ความเร็วที่ได้มาแลกกับความเสี่ยงว่า "ตัดจุดที่ควรเจอทิ้งไปเงียบ ๆ"
   ซึ่งมองไม่เห็นบนหน้าจอเลย เพราะจุดที่หายไปก็แค่ไม่ปรากฏ
   เทสชุดนี้จึงเทียบผลของกริดกับการวนทุกคู่แบบตรงไปตรงมา ต้องได้เท่ากันเป๊ะทุกครั้ง */

const rnd = (seed) => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

function bruteWithin(points, lat, lon, km) {
  return points.map((p, i) => ({ index: i, km: distanceKm(lat, lon, p.lat, p.lon) }))
    .filter((x) => x.km <= km).sort((a, b) => a.km - b.km);
}

test("กริดให้ผลเท่ากับการวนทุกคู่ ทุกรัศมีที่ลองและทุกจุดที่ลอง", () => {
  const r = rnd(7);
  const points = Array.from({ length: 1200 }, () => ({
    lat: 6 + r() * 14, lon: 97.5 + r() * 8,
  }));
  const centers = Array.from({ length: 40 }, () => ({ lat: 6 + r() * 14, lon: 97.5 + r() * 8 }));
  for (const km of [0.5, 1, 3, 10, 25]) {
    const grid = buildGrid(points, km);
    for (const c of centers) {
      const a = withinKm(grid, c.lat, c.lon, km).map((x) => x.index).sort((x, y) => x - y);
      const b = bruteWithin(points, c.lat, c.lon, km).map((x) => x.index).sort((x, y) => x - y);
      assert.deepEqual(a, b, `รัศมี ${km} กม. ที่จุด ${c.lat},${c.lon} ผลไม่ตรงกับการวนทุกคู่`);
    }
  }
});

test("จุดที่อยู่พอดีเส้นรัศมีต้องนับว่าอยู่ในวง และเกินไปนิดเดียวต้องไม่นับ", () => {
  /* ‼️ ห้ามคิดระยะเป้าหมายเอาเองจากการบวกองศา
     เดิมเขียนว่า lat + 3/110.574 แล้วเชื่อว่าห่าง 3 กม. พอดี
     วัดจริงได้ 3.016851 กม. คลาด 16.85 เมตร เพราะ 110.574 เป็นค่าประมาณ
     เทสจึงแดงทั้งที่โค้ดถูก ต้องยึดค่าที่วัดได้จริงเป็นเกณฑ์ */
  const center = { lat: 13.7563, lon: 100.5018 };
  const north = { lat: center.lat + 3 / 110.574, lon: center.lon };
  const exact = distanceKm(center.lat, center.lon, north.lat, north.lon);
  const grid = buildGrid([north], 3);
  assert.equal(withinKm(grid, center.lat, center.lon, exact + 1e-9).length, 1, "พอดีเส้นต้องนับ");
  assert.equal(withinKm(grid, center.lat, center.lon, exact - 1e-6).length, 0, "เกินไปนิดต้องไม่นับ");
});

test("หาจุดใกล้ที่สุดได้ แม้จุดนั้นอยู่ไกลกว่ารัศมีเริ่มต้นมาก", () => {
  const far = { lat: 18.7883, lon: 98.9853 };
  const grid = buildGrid([far], 2);
  const n = nearestOf(grid, 7.8804, 98.3923, 2);
  assert.equal(n.index, 0);
  assert.ok(Math.abs(n.km - distanceKm(7.8804, 98.3923, far.lat, far.lon)) < 1e-9);
});

test("ไม่มีจุดเลย ต้องคืนค่าว่าง ไม่ใช่ค้างหรือโยน error", () => {
  const grid = buildGrid([], 3);
  assert.equal(nearestOf(grid, 13.7, 100.5, 2), null);
  assert.deepEqual(withinKm(grid, 13.7, 100.5, 5), []);
});

test("ข้ามจุดที่พิกัดเสีย ไม่ทำให้ทั้งชุดพัง", () => {
  const points = [{ lat: 13.76, lon: 100.50 }, { lat: NaN, lon: 100.5 }, { lat: null, lon: null }];
  const grid = buildGrid(points, 3);
  const hit = withinKm(grid, 13.7563, 100.5018, 3);
  assert.equal(hit.length, 1, "ควรเจอเฉพาะจุดที่พิกัดใช้ได้");
});

test("สรุปพื้นที่ นับจุดที่ถูกครอบคลุมโดยไม่นับซ้ำ และบอกวงที่ว่างเปล่า", () => {
  const points = [{ lat: 13.76, lon: 100.50, kind: "เดิม" }, { lat: 13.77, lon: 100.51, kind: "ใหม่" }];
  const centers = [{ id: "A", lat: 13.765, lon: 100.505 },
                   { id: "B", lat: 13.762, lon: 100.502 },
                   { id: "C", lat: 18.0, lon: 99.0 }];
  const cov = coverageOf(centers, buildGrid(points, 3), 3);
  assert.equal(cov.covered.size, 2, "สองจุดถูกครอบคลุม ไม่ใช่สี่ เพราะวง A กับ B ครอบจุดเดียวกัน");
  assert.equal(cov.emptyCenters, 1, "วง C ไม่มีจุดเลย");
  assert.deepEqual(cov.rows[0].byKind, { "เดิม": 1, "ใหม่": 1 });
});
