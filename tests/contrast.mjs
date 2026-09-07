// ตรวจอัตราส่วนความคมชัดตาม WCAG 2.1 — ใช้ก่อนเลือกสีทุกครั้ง ห้ามเดาว่า "น่าจะอ่านออก"
const hex = (h) => { h = h.replace("#",""); if (h.length===3) h = [...h].map(c=>c+c).join("");
  return [0,2,4].map(i => parseInt(h.slice(i,i+2),16)); };
const lin = (c) => { c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
export const lum = (h) => { const [r,g,b] = hex(h).map(lin); return 0.2126*r + 0.7152*g + 0.0722*b; };
export const ratio = (a,b) => { const [x,y] = [lum(a),lum(b)].sort((m,n)=>n-m); return (x+0.05)/(y+0.05); };
export const grade = (r, large=false) =>
  r >= (large?4.5:7) ? "AAA" : r >= (large?3:4.5) ? "AA" : r >= 3 ? "AA(ใหญ่)" : "ตก";

if (process.argv[1]?.endsWith("contrast.mjs")) {
  const pairs = process.argv.slice(2);
  if (pairs.length >= 2) {
    for (let i=0;i<pairs.length-1;i+=2) {
      const r = ratio(pairs[i], pairs[i+1]);
      console.log(`  ${pairs[i]} บน ${pairs[i+1]} = ${r.toFixed(2)}:1  ${grade(r)}`);
    }
  }
}
