/* Grafik canvas sederhana — tanpa library eksternal */
(function (global) {
  'use strict';

  function hidpi(canvas, height) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h: height };
  }

  function rupiahShort(n) {
    const v = Math.round(Number(n) || 0);
    if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1).replace('.0', '') + ' M';
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1).replace('.0', '') + ' jt';
    if (Math.abs(v) >= 1e3) return Math.round(v / 1e3) + ' rb';
    return String(v);
  }

  /* ---------- Bar chart grouped (masuk vs keluar) ---------- */
  function barChart(canvas, labels, series, opts) {
    opts = opts || {};
    const height = opts.height || 240;
    const { ctx, w, h } = hidpi(canvas, height);
    const padL = 46, padR = 10, padT = 14, padB = 28;
    const cw = w - padL - padR, ch = h - padT - padB;

    ctx.clearRect(0, 0, w, h);
    if (!labels.length) {
      ctx.fillStyle = '#94a3b8'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Belum ada data', w / 2, h / 2); return;
    }

    const maxVal = Math.max(1, ...series.flatMap(s => s.data));
    const steps = 4;
    ctx.font = '10px sans-serif'; ctx.textBaseline = 'middle';
    for (let i = 0; i <= steps; i++) {
      const y = padT + ch - (ch * i / steps);
      ctx.strokeStyle = '#eef2f7'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'right';
      ctx.fillText(rupiahShort(maxVal * i / steps), padL - 7, y);
    }

    const groupW = cw / labels.length;
    const gap = Math.min(8, groupW * 0.15);
    const barW = Math.max(6, (groupW - gap * 2) / series.length);

    labels.forEach((lab, i) => {
      const gx = padL + i * groupW + gap;
      series.forEach((s, si) => {
        const val = s.data[i] || 0;
        const bh = maxVal ? (val / maxVal) * ch : 0;
        const x = gx + si * barW;
        const y = padT + ch - bh;
        ctx.fillStyle = s.color;
        roundRect(ctx, x, y, barW - 2, bh, 3);
        ctx.fill();
      });
      ctx.fillStyle = '#64748b'; ctx.textAlign = 'center';
      ctx.fillText(lab, padL + i * groupW + groupW / 2, h - 12);
    });
  }

  /* ---------- Donut chart ---------- */
  function donutChart(canvas, items, opts) {
    opts = opts || {};
    const size = opts.size || 190;
    const { ctx, w, h } = hidpi(canvas, size);
    canvas.style.height = size + 'px';
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const rOuter = Math.min(w, h) / 2 - 4;
    const rInner = rOuter * 0.62;
    const total = items.reduce((a, i) => a + i.value, 0);

    if (!total) {
      ctx.fillStyle = '#94a3b8'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Belum ada data', cx, cy); return;
    }

    let start = -Math.PI / 2;
    items.forEach(it => {
      const ang = (it.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, rOuter, start, start + ang);
      ctx.closePath();
      ctx.fillStyle = it.color;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(start) * rOuter, cy + Math.sin(start) * rOuter);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      start += ang;
    });

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(cx, cy, rInner, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = '#0f172a'; ctx.font = '700 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(rupiahShort(total), cx, cy - 8);
    ctx.fillStyle = '#94a3b8'; ctx.font = '10px sans-serif';
    ctx.fillText(opts.centerLabel || 'Total', cx, cy + 10);
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, 0);
    ctx.arcTo(x, y + h, x, y, 0);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  global.Charts = { barChart, donutChart, rupiahShort };
})(window);
