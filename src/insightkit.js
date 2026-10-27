/* ตัวคิดประโยคสรุปจากข้อมูลกราฟ ฟังก์ชันล้วน ไม่แตะ DOM ไม่ import อะไร
 * รับแถว { Category, Value, Target? } แบบเดียวกับที่ pbi-bar ป้อนให้สเปก
 * ที่มา: กล่อง "สรุปจากข้อมูลนี้" ของ dash-man.com (ศึกษา 27/10/2026)
 * เทส tests/insightkit.test.mjs
 *
 * ‼️ มีค่าติดลบเมื่อไหร่ ห้ามคิดสัดส่วนและ Pareto เลย เพราะยอดรวมหักกันเอง
 *    กำไร 120,000 กับขาดทุน -65,000 จะได้ "สาขาเมืองคิดเป็น 89%" ซึ่งไม่มีความหมาย
 * ‼️ ข้อความทุกบรรทัดห้ามมีจุดกลางกับขีดยาว (กฎหน้าจอของพี่ปอนด์ เทสข้อ ⑥ จับ) */

const EPS = 1e-9;

export function fmtNum(n, en = false) {
  const a = Math.abs(n);
  if (a >= 1e6) {
    const m = Number((n / 1e6).toFixed(2));
    return en ? `${m}M` : `${m} ล้าน`;
  }
  return Number(n.toFixed(2)).toLocaleString("en-US");
}

export function fmtPct(p) {
  return `${Number((p * 100).toFixed(1))}%`;
}

export function summarize(input) {
  const list = (input || [])
    .filter((r) => r && typeof r.Value === "number" && Number.isFinite(r.Value))
    .map((r) => ({ name: String(r.Category), value: r.Value,
                   target: typeof r.Target === "number" && Number.isFinite(r.Target) ? r.Target : null }));
  if (!list.length) return null;

  const sorted = [...list].sort((a, b) => b.value - a.value);
  const n = sorted.length;
  const total = sorted.reduce((s, r) => s + r.value, 0);
  const negatives = sorted.filter((r) => r.value < 0).length;
  const shareOk = negatives === 0 && total > 0;
  const share = (v) => (shareOk ? v / total : null);

  const t = sorted[0];
  const tie = sorted.filter((r) => Math.abs(r.value - t.value) < EPS).length;
  const nextIdx = sorted.findIndex((r) => r.value < t.value - EPS);
  const second = tie === 1 && nextIdx > 0 ? sorted[nextIdx] : null;
  const top = {
    name: t.name, value: t.value, share: share(t.value), tie,
    leadPct: second && second.value > 0 ? (t.value - second.value) / second.value : null,
  };
  const b = sorted[n - 1];
  const bottom = n > 1 && tie < n
    ? { name: b.name, value: b.value, share: share(b.value), vsTop: t.value > 0 && b.value >= 0 ? b.value / t.value : null }
    : null;

  let pareto = null;
  if (shareOk && n >= 3) {
    let cum = 0, k = 0;
    while (k < n && cum < 0.8 * total - EPS) cum += sorted[k++].value;
    pareto = { k, n, share: cum / total, concentrated: k <= n / 2 };
  }

  let target = null;
  const withT = list.filter((r) => r.target !== null);
  if (withT.length) {
    const sumV = withT.reduce((s, r) => s + r.value, 0);
    const sumT = withT.reduce((s, r) => s + r.target, 0);
    const ratio = (r) => (r.target > 0 ? r.value / r.target : Infinity);
    const worst = withT.reduce((w, r) => (ratio(r) < ratio(w) ? r : w));
    target = {
      count: withT.length,
      hit: withT.filter((r) => r.value >= r.target - EPS).length,
      achieved: sumT > 0 ? sumV / sumT : null,
      gap: sumV - sumT,
      worst: { name: worst.name, ratio: worst.target > 0 ? ratio(worst) : null },
    };
  }

  return { n, total, negatives, top, second: second ? { name: second.name, value: second.value } : null,
           bottom, pareto, target };
}

export function sentences(s, en = false) {
  const N = (v) => fmtNum(v, en);
  const out = [];
  out.push(en ? `${s.n} groups, total ${N(s.total)}` : `${s.n} กลุ่ม รวม ${N(s.total)}`);

  const { top } = s;
  if (top.tie > 1) {
    out.push(en ? `${top.tie} groups share first place at ${N(top.value)}`
                : `${top.tie} กลุ่มเท่ากันที่อันดับ 1 คือ ${N(top.value)}`);
  } else {
    const pct = top.share !== null ? (en ? `, ${fmtPct(top.share)} of the total` : ` คิดเป็น ${fmtPct(top.share)} ของทั้งหมด`) : "";
    out.push(en ? `Highest is ${top.name} at ${N(top.value)}${pct}` : `สูงสุดคือ ${top.name} ที่ ${N(top.value)}${pct}`);
    if (top.leadPct !== null && s.second) {
      out.push(en ? `${fmtPct(top.leadPct)} ahead of second place, ${s.second.name}`
                  : `นำอันดับ 2 (${s.second.name}) อยู่ ${fmtPct(top.leadPct)}`);
    }
  }

  if (s.pareto) {
    const { k, n } = s.pareto;
    out.push(s.pareto.concentrated
      ? (en ? `Concentrated: ${k} of ${n} groups make up ${fmtPct(s.pareto.share)}` : `กระจุกตัว ${k} จาก ${n} กลุ่มรวมกันได้ ${fmtPct(s.pareto.share)}`)
      : (en ? `Spread out: it takes ${k} of ${n} groups to reach 80%` : `กระจายตัว ต้องใช้ ${k} จาก ${n} กลุ่มถึงได้ 80%`));
  }

  if (s.bottom) {
    const vs = s.bottom.vsTop !== null ? (en ? `, ${fmtPct(s.bottom.vsTop)} of the leader` : ` เท่ากับ ${fmtPct(s.bottom.vsTop)} ของอันดับ 1`) : "";
    out.push(en ? `Lowest is ${s.bottom.name} at ${N(s.bottom.value)}${vs}` : `ต่ำสุดคือ ${s.bottom.name} ที่ ${N(s.bottom.value)}${vs}`);
  }

  if (s.negatives) {
    out.push(en ? `${s.negatives} negative ${s.negatives === 1 ? "group" : "groups"}, so shares are not shown`
                : `มีค่าติดลบ ${s.negatives} กลุ่ม จึงไม่คิดสัดส่วน`);
  }

  if (s.target) {
    const t = s.target;
    const ach = t.achieved !== null ? (en ? `, ${fmtPct(t.achieved)} of target overall` : ` รวมได้ ${fmtPct(t.achieved)} ของเป้า`) : "";
    out.push(en ? `${t.hit} of ${t.count} groups hit target${ach}` : `ถึงเป้า ${t.hit} จาก ${t.count} กลุ่ม${ach}`);
    if (t.gap < 0) {
      out.push(en ? `Short by ${N(-t.gap)}, furthest behind is ${t.worst.name}` : `ขาดอีก ${N(-t.gap)} ห่างเป้ามากสุดคือ ${t.worst.name}`);
    } else if (t.gap > 0) {
      out.push(en ? `Above target by ${N(t.gap)}` : `เกินเป้า ${N(t.gap)}`);
    }
  }
  return out;
}

/* หัวกราฟแบบเล่าเรื่อง 1 บรรทัด ให้คนอ่านรู้ข้อสรุปก่อนดูกราฟ
   มีเป้า = พูดเรื่องเป้า เพราะเป็นคำถามแรกของผู้บริหารเสมอ ไม่มีเป้า = พูดเรื่องอันดับ 1 */
export function headline(s, en = false) {
  if (s.target) {
    const { hit, count, achieved } = s.target;
    // ‼️ ถ้อยคำต้องตรงกับประโยคเป้าใน sentences() ทุกตัวอักษร details() ถึงตัดซ้ำออกได้
    const a = achieved !== null ? (en ? `, ${fmtPct(achieved)} of target overall` : ` รวมได้ ${fmtPct(achieved)} ของเป้า`) : "";
    return en ? `${hit} of ${count} groups hit target${a}` : `ถึงเป้า ${hit} จาก ${count} กลุ่ม${a}`;
  }
  const t = s.top;
  if (t.tie > 1) return en ? `${t.tie} groups tied at the top` : `${t.tie} กลุ่มเท่ากันที่อันดับ 1`;
  if (t.share !== null) return en ? `${t.name} leads with ${fmtPct(t.share)} of the total` : `${t.name} มากสุด คิดเป็น ${fmtPct(t.share)} ของทั้งหมด`;
  return en ? `${t.name} is highest at ${fmtNum(t.value, true)}` : `${t.name} สูงสุดที่ ${fmtNum(t.value)}`;
}

/* ประโยครองใต้หัวกราฟ ตัดประโยคที่หัวกราฟพูดไปแล้วออก (เห็นซ้ำบนจอจริง 27/10/2026) */
export function details(s, en = false) {
  const h = headline(s, en);
  return sentences(s, en).filter((x) => x !== h);
}
