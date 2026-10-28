/* =========================================================
   Aplikasi Keuangan Pondok Pesantren — Frontend SPA
   Kompatibel shared hosting (API via api.php)
   ========================================================= */
'use strict';

/* Penerjemah URL: '/api/transaksi?x=1' -> 'api.php?p=transaksi&x=1'
   '/api/tagihan/ID/bayar' -> 'api.php?p=tagihan&id=ID&act=bayar'
   '/api/laporan/iuran?..' -> 'api.php?p=laporan&sub=iuran&..' */
function apiUrl(u) {
  let path = u.startsWith('/api/') ? u.slice(5) : u;
  const qi = path.indexOf('?');
  const pathname = qi >= 0 ? path.slice(0, qi) : path;
  const qs = qi >= 0 ? path.slice(qi + 1) : '';
  const params = new URLSearchParams(qs);
  const seg = pathname.split('/').filter(Boolean);
  if (!seg.length) return 'api.php';
  params.set('p', seg[0]);
  if (seg[0] === 'laporan' && seg[1]) {
    params.set('sub', seg[1]);
  } else if (seg[0] === 'tagihan' && seg[1] === 'generate') {
    params.set('act', 'generate');
  } else if (seg[1]) {
    params.set('id', seg[1]);
    if (seg[2]) params.set('act', seg[2]);
  }
  return 'api.php?' + params.toString();
}

const API = {
  get: (u) => fetch(apiUrl(u)).then(h),
  post: (u, b) => fetch(apiUrl(u), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(h),
  put: (u, b) => fetch(apiUrl(u), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(h),
  del: (u) => fetch(apiUrl(u), { method: 'DELETE' }).then(h)
};
async function h(r) {
  const t = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(t.error || ('HTTP ' + r.status));
  return t;
}

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];

const fmt = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => today().slice(0, 7);
const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const periodeLabel = (p) => { const [y, m] = String(p).split('-'); return `${BLN[+m - 1]} ${y}`; };
const tglLabel = (d) => { const [y, m, dd] = String(d).split('-'); return `${+dd} ${BLN[+m - 1].slice(0, 3)} ${y}`; };

let STATE = { page: 'dashboard', kas: {}, iuran: {}, santri: {} };

/* ---------------- Toast & Modal ---------------- */
function toast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' error' : '');
  el.innerHTML = `<span>${type === 'error' ? '⚠️' : '✅'}</span> ${esc(msg)}`;
  $('#toastWrap').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3200);
}

function openModal(title, bodyHTML, footHTML) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHTML + (footHTML ? `<div class="modal-foot">${footHTML}</div>` : '');
  $('#modalBackdrop').hidden = false;
  const f = $('#modalBody input, #modalBody select, #modalBody textarea');
  if (f) setTimeout(() => f.focus(), 60);
}
function closeModal() { $('#modalBackdrop').hidden = true; $('#modalBody').innerHTML = ''; }

$('#modalClose').onclick = closeModal;
$('#modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

/* ---------------- Router ---------------- */
const ROUTES = { dashboard: pageDashboard, kas: pageKas, iuran: pageIuran, santri: pageSantri, laporan: pageLaporan, pengaturan: pagePengaturan };
const TITLES = {
  dashboard: ['Dashboard', 'Ringkasan keuangan pesantren'],
  kas: ['Kas / Transaksi', 'Catat pemasukan & pengeluaran harian'],
  iuran: ['Iuran Santri', 'Tagihan, pembayaran & tunggakan'],
  santri: ['Data Santri', 'Kelola data santri pondok'],
  laporan: ['Laporan Keuangan', 'Rekap & cetak laporan periode'],
  pengaturan: ['Pengaturan', 'Profil pesantren, backup & data']
};

function navigate() {
  const hash = (location.hash.replace('#/', '') || 'dashboard').split('?')[0];
  const page = ROUTES[hash] ? hash : 'dashboard';
  STATE.page = page;
  $$('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  $('#pageTitle').textContent = TITLES[page][0];
  $('#pageSub').textContent = TITLES[page][1];
  $('#sidebar').classList.remove('open');
  ROUTES[page]();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', navigate);

$('#btnMenu').onclick = () => $('#sidebar').classList.toggle('open');
$('#btnTambahCepat').onclick = () => formTransaksi();

/* ---------------- Header info ---------------- */
async function loadHeader() {
  try {
    const p = await API.get('/api/pengaturan');
    $('#brandLogo').textContent = (p.logo_teks || 'PP').slice(0, 3).toUpperCase();
    $('#brandNama').textContent = p.nama_pesantren;
    $('#brandTahun').textContent = 'TA ' + (p.tahun_ajaran || '-');
  } catch (e) { /* ignore */ }
  const d = new Date();
  $('#todayChip').textContent = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

async function refreshSaldo() {
  try {
    const d = await API.get('/api/dashboard');
    $('#sidebarSaldo').textContent = fmt(d.saldo);
  } catch (e) { /* ignore */ }
}

/* =========================================================
   DASHBOARD
   ========================================================= */
async function pageDashboard() {
  const c = $('#content');
  c.innerHTML = `<div class="empty"><div class="empty-ico">⏳</div><p>Memuat data…</p></div>`;
  const d = await API.get('/api/dashboard');
  const naik = d.bulan_ini.saldo_bulan >= 0;
  c.innerHTML = `
    <div class="grid grid-4">
      <div class="stat saldo">
        <div class="stat-ico">💰</div>
        <div class="stat-label">Saldo Kas</div>
        <div class="stat-value">${fmt(d.saldo)}</div>
        <div class="stat-sub">Saldo awal ${fmt(d.saldo_awal)}</div>
      </div>
      <div class="stat masuk">
        <div class="stat-ico">📈</div>
        <div class="stat-label">Total Pemasukan</div>
        <div class="stat-value">${fmt(d.total_masuk)}</div>
        <div class="stat-sub">Bulan ini ${fmt(d.bulan_ini.masuk)}</div>
      </div>
      <div class="stat keluar">
        <div class="stat-ico">📉</div>
        <div class="stat-label">Total Pengeluaran</div>
        <div class="stat-value">${fmt(d.total_keluar)}</div>
        <div class="stat-sub">Bulan ini ${fmt(d.bulan_ini.keluar)}</div>
      </div>
      <div class="stat iuran">
        <div class="stat-ico">🧾</div>
        <div class="stat-label">Iuran Terkumpul</div>
        <div class="stat-value">${d.iuran.persen}%</div>
        <div class="stat-sub">${fmt(d.iuran.terkumpul)} dari ${fmt(d.iuran.total)}</div>
      </div>
    </div>

    <div class="grid grid-main">
      <div class="card">
        <div class="card-head">
          <div><h3>Arus Kas 6 Bulan</h3><span class="muted">Perbandingan pemasukan vs pengeluaran</span></div>
        </div>
        <div class="card-pad">
          <div class="chart-box"><canvas class="chart" id="chartTren"></canvas></div>
          <div class="legend">
            <span class="legend-item"><span class="legend-swatch" style="background:#059669"></span> Pemasukan</span>
            <span class="legend-item"><span class="legend-swatch" style="background:#ef4444"></span> Pengeluaran</span>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>Pengeluaran per Kategori</h3><span class="muted">Bulan ${periodeLabel(d.bulan_ini.periode)}</span></div></div>
        <div class="card-pad">
          <div class="chart-box" style="display:grid;place-items:center"><canvas class="chart" id="chartKat" style="max-width:200px"></canvas></div>
          <div class="kat-list mt" id="listKat"></div>
        </div>
      </div>
    </div>

    <div class="grid grid-3 mt">
      <div class="card card-pad">
        <div class="flex between"><strong>Progress Iuran Bulan Ini</strong><span class="badge ${d.iuran.persen === 100 ? 'lunas' : 'sebagian'}">${d.iuran.persen}%</span></div>
        <div class="progress mt" style="margin-top:12px"><span style="width:${d.iuran.persen}%"></span></div>
        <p class="muted" style="margin-top:10px;font-size:12.5px">Terkumpul <strong>${fmt(d.iuran.terkumpul)}</strong> dari total tagihan <strong>${fmt(d.iuran.total)}</strong>.</p>
      </div>
      <div class="card card-pad">
        <div class="flex between"><strong>⚠️ Tunggakan</strong><span class="badge belum">${d.tunggakan.jumlah_item} tagihan</span></div>
        <div class="stat-value" style="margin-top:10px;color:var(--red)">${fmt(d.tunggakan.total)}</div>
        <p class="muted" style="margin-top:6px;font-size:12.5px">Iuran yang lewat periode & belum lunas.</p>
        <a href="#/iuran" class="btn btn-sm mt" style="margin-top:12px">Lihat Tunggakan →</a>
      </div>
      <div class="card card-pad">
        <div class="flex between"><strong>👨‍🎓 Santri</strong><span class="badge aktif">${d.santri.aktif} aktif</span></div>
        <div class="stat-value" style="margin-top:10px">${d.santri.total} <span style="font-size:13px;font-weight:500;color:var(--muted)">terdaftar</span></div>
        <p class="muted" style="margin-top:6px;font-size:12.5px">Saldo kas bergerak <strong class="${naik ? 'pos' : 'neg'}">${naik ? '▲' : '▼'} ${fmt(Math.abs(d.bulan_ini.saldo_bulan))}</strong> bulan ini.</p>
        <a href="#/santri" class="btn btn-sm mt" style="margin-top:12px">Kelola Santri →</a>
      </div>
    </div>`;

  window.Charts.barChart($('#chartTren'), d.tren.map(t => t.label),
    [{ data: d.tren.map(t => t.masuk), color: '#059669' }, { data: d.tren.map(t => t.keluar), color: '#ef4444' }],
    { height: 240 });

  const kat = d.topKategori;
  window.Charts.donutChart($('#chartKat'), kat.map(k => ({ value: k.jumlah, color: k.warna })), { centerLabel: 'Pengeluaran', size: 190 });
  const maxK = kat.length ? kat[0].jumlah : 1;
  $('#listKat').innerHTML = kat.length ? kat.map(k => `
    <div class="kat-row">
      <span class="kat-name"><span class="kat-dot" style="background:${k.warna}"></span>${esc(k.nama)}</span>
      <span class="kat-val">${fmt(k.jumlah)}</span>
      <div class="progress"><span style="width:${Math.round(k.jumlah / maxK * 100)}%;background:${k.warna}"></span></div>
    </div>`).join('') : `<p class="muted" style="font-size:12.5px">Belum ada pengeluaran bulan ini.</p>`;
}

/* =========================================================
   KAS / TRANSAKSI
   ========================================================= */
async function pageKas() {
  const f = Object.assign({ dari: '', sampai: '', jenis: 'semua', kategori_id: '', q: '' }, STATE.kas);
  STATE.kas = f;
  const [kategori, trx] = await Promise.all([
    API.get('/api/kategori'),
    API.get('/api/transaksi?' + new URLSearchParams(Object.entries(f).filter(([, v]) => v)))
  ]);

  $('#content').innerHTML = `
    <div class="filters card card-pad">
      <div class="field grow"><label>Cari keterangan</label><input id="f-q" value="${esc(f.q)}" placeholder="mis. beras, gaji, donatur…"></div>
      <div class="field"><label>Dari tanggal</label><input type="date" id="f-dari" value="${f.dari}"></div>
      <div class="field"><label>Sampai</label><input type="date" id="f-sampai" value="${f.sampai}"></div>
      <div class="field"><label>Jenis</label><select id="f-jenis">
        <option value="semua">Semua</option>
        <option value="masuk" ${f.jenis === 'masuk' ? 'selected' : ''}>Pemasukan</option>
        <option value="keluar" ${f.jenis === 'keluar' ? 'selected' : ''}>Pengeluaran</option>
      </select></div>
      <div class="field"><label>Kategori</label><select id="f-kat">
        <option value="">Semua</option>
        ${kategori.map(k => `<option value="${k.id}" ${f.kategori_id === k.id ? 'selected' : ''}>${esc(k.nama)}</option>`).join('')}
      </select></div>
      <button class="btn" id="f-reset">Reset</button>
      <button class="btn btn-primary" id="btnAdd">＋ Tambah</button>
      <button class="btn" id="btnCsv">⬇ CSV</button>
    </div>

    <div class="card">
      <div class="card-head"><h3>Riwayat Transaksi (${trx.length})</h3><span class="muted">Klik baris untuk detail</span></div>
      <div class="table-wrap">
        ${trx.length ? `<table>
          <thead><tr><th>Tanggal</th><th>Keterangan</th><th>Kategori</th><th>Jenis</th><th class="num">Jumlah</th><th></th></tr></thead>
          <tbody>${trx.map(t => `
            <tr>
              <td class="nowrap">${tglLabel(t.tanggal)}</td>
              <td>${esc(t.keterangan || '-')} ${t.ref ? '<span class="badge lunas" style="font-size:10px">iuran</span>' : ''}</td>
              <td><span class="kat-dot" style="background:${t.warna}"></span>${esc(t.kategori)}</td>
              <td><span class="badge ${t.jenis}">${t.jenis === 'masuk' ? 'Masuk' : 'Keluar'}</span></td>
              <td class="num ${t.jenis === 'masuk' ? 'pos' : 'neg'}">${t.jenis === 'masuk' ? '+' : '−'} ${fmt(t.jumlah)}</td>
              <td class="actions">${t.ref ? '' : `<button class="btn btn-sm btn-danger" data-del="${t.id}">Hapus</button>`}</td>
            </tr>`).join('')}</tbody>
        </table>` : `<div class="empty"><div class="empty-ico">📭</div><p>Tidak ada transaksi ditemukan.</p><button class="btn btn-primary" onclick="document.getElementById('btnAdd').click()">Tambah Transaksi</button></div>`}
      </div>
    </div>`;

  const apply = () => {
    STATE.kas = {
      q: $('#f-q').value.trim(), dari: $('#f-dari').value, sampai: $('#f-sampai').value,
      jenis: $('#f-jenis').value, kategori_id: $('#f-kat').value
    };
    pageKas();
  };
  $('#btnAdd').onclick = () => formTransaksi();
  $('#f-reset').onclick = () => { STATE.kas = {}; pageKas(); };
  let tId; $('#f-q').oninput = () => { clearTimeout(tId); tId = setTimeout(apply, 450); };
  ['f-dari', 'f-sampai', 'f-jenis', 'f-kat'].forEach(id => $('#' + id).onchange = apply);
  $$('[data-del]').forEach(b => b.onclick = async (e) => {
    e.stopPropagation();
    if (!confirm('Hapus transaksi ini?')) return;
    try { await API.del('/api/transaksi/' + b.dataset.del); toast('Transaksi dihapus'); refreshSaldo(); pageKas(); }
    catch (err) { toast(err.message, 'error'); }
  });
  $('#btnCsv').onclick = () => exportCsv(trx);
}

function exportCsv(rows) {
  const head = ['Tanggal', 'Keterangan', 'Kategori', 'Jenis', 'Jumlah'];
  const lines = [head.join(';')].concat(rows.map(t =>
    [t.tanggal, `"${String(t.keterangan || '').replace(/"/g, '""')}"`, t.kategori, t.jenis, t.jumlah].join(';')));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kas-${today()}.csv`;
  a.click();
}

async function formTransaksi(pre) {
  const kategori = await API.get('/api/kategori');
  const b = pre || {};
  openModal(b.id ? 'Edit Transaksi' : 'Tambah Transaksi', `
    <div class="form-grid">
      <div class="field full">
        <label>Jenis</label>
        <div class="radio-row">
          <label class="on-masuk"><input type="radio" name="t-jenis" value="masuk" ${(b.jenis || 'masuk') === 'masuk' ? 'checked' : ''}>⬆ Masuk</label>
          <label class="on-keluar"><input type="radio" name="t-jenis" value="keluar" ${b.jenis === 'keluar' ? 'checked' : ''}>⬇ Keluar</label>
        </div>
      </div>
      <div class="field"><label>Tanggal</label><input type="date" id="t-tgl" value="${b.tanggal || today()}"></div>
      <div class="field"><label>Jumlah (Rp)</label><input type="number" id="t-jml" min="1" step="1000" value="${b.jumlah || ''}" placeholder="0"></div>
      <div class="field full"><label>Kategori</label><select id="t-kat">
        ${kategori.map(k => `<option value="${k.id}" data-jenis="${k.jenis}" ${b.kategori_id === k.id ? 'selected' : ''}>${esc(k.nama)} (${k.jenis === 'masuk' ? 'Masuk' : 'Keluar'})</option>`).join('')}
      </select></div>
      <div class="field full"><label>Keterangan</label><textarea id="t-ket" placeholder="mis. Belanja beras 50 kg">${esc(b.keterangan || '')}</textarea></div>
    </div>`,
    `<button class="btn" onclick="closeModal()">Batal</button><button class="btn btn-primary" id="t-save">💾 Simpan</button>`);

  const syncKat = () => {
    const jenis = $('input[name="t-jenis"]:checked').value;
    $$('#t-kat option').forEach(o => { o.hidden = o.dataset.jenis !== jenis; });
    const sel = $('#t-kat'); const vis = $$('#t-kat option').filter(o => !o.hidden);
    if (vis.length && vis.every(o => !o.selected)) sel.value = vis[0].value;
  };
  $$('input[name="t-jenis"]').forEach(r => r.onchange = syncKat);
  syncKat();

  $('#t-save').onclick = async () => {
    const payload = {
      tanggal: $('#t-tgl').value,
      jenis: $('input[name="t-jenis"]:checked').value,
      jumlah: Number($('#t-jml').value),
      kategori_id: $('#t-kat').value,
      keterangan: $('#t-ket').value.trim()
    };
    if (!payload.tanggal || !payload.jumlah || payload.jumlah <= 0) return toast('Tanggal & jumlah wajib diisi', 'error');
    try {
      await API.post('/api/transaksi', payload);
      toast('Transaksi tersimpan');
      closeModal(); refreshSaldo();
      if (STATE.page === 'kas') pageKas(); else if (STATE.page === 'dashboard') pageDashboard();
    } catch (e) { toast(e.message, 'error'); }
  };
}
window.formTransaksi = formTransaksi;
window.closeModal = closeModal;

/* =========================================================
   IURAN SANTRI
   ========================================================= */
async function pageIuran() {
  const f = Object.assign({ periode: thisMonth(), status: 'semua', jenis_id: '', q: '' }, STATE.iuran);
  STATE.iuran = f;
  const [jenis, rekap, tags] = await Promise.all([
    API.get('/api/jenis-tagihan'),
    API.get('/api/laporan/iuran'),
    API.get('/api/tagihan?' + new URLSearchParams(Object.entries(f).filter(([, v]) => v)))
  ]);

  const bulanIni = rekap.find(r => r.periode === thisMonth()) || { total: 0, terkumpul: 0, sisa: 0, lunas: 0, belum: 0, sebagian: 0, jumlah_tagihan: 0 };
  const persen = bulanIni.total ? Math.round(bulanIni.terkumpul / bulanIni.total * 100) : 0;

  $('#content').innerHTML = `
    <div class="grid grid-4">
      <div class="stat iuran"><div class="stat-ico">🧾</div><div class="stat-label">Tagihan Bulan Ini</div><div class="stat-value">${fmt(bulanIni.total)}</div><div class="stat-sub">${bulanIni.jumlah_tagihan} tagihan • ${periodeLabel(thisMonth())}</div></div>
      <div class="stat masuk"><div class="stat-ico">✅</div><div class="stat-label">Terkumpul</div><div class="stat-value">${fmt(bulanIni.terkumpul)}</div><div class="stat-sub">${persen}% dari total</div></div>
      <div class="stat keluar"><div class="stat-ico">⏳</div><div class="stat-label">Belum Dibayar</div><div class="stat-value">${fmt(bulanIni.sisa)}</div><div class="stat-sub">${bulanIni.belum + bulanIni.sebagian} menunggu</div></div>
      <div class="stat"><div class="stat-ico">📊</div><div class="stat-label">Lunas / Sebagian</div><div class="stat-value">${bulanIni.lunas} / ${bulanIni.sebagian}</div><div class="stat-sub">dari ${bulanIni.jumlah_tagihan} bulan ini</div></div>
    </div>

    <div class="card mt">
      <div class="card-head"><h3>Rekap per Periode</h3><span class="muted">Klik untuk filter</span></div>
      <div class="table-wrap">
        ${rekap.length ? `<table>
          <thead><tr><th>Periode</th><th class="num">Total Tagihan</th><th class="num">Terkumpul</th><th class="num">Sisa</th><th>Progress</th><th>Status</th></tr></thead>
          <tbody>${rekap.map(r => {
            const p = r.total ? Math.round(r.terkumpul / r.total * 100) : 0;
            return `<tr data-periode="${r.periode}" style="cursor:pointer">
              <td><strong>${periodeLabel(r.periode)}</strong></td>
              <td class="num">${fmt(r.total)}</td>
              <td class="num pos">${fmt(r.terkumpul)}</td>
              <td class="num neg">${fmt(r.sisa)}</td>
              <td style="min-width:130px"><div class="progress"><span style="width:${p}%"></span></div><small class="muted">${p}%</small></td>
              <td><span class="badge ${p === 100 ? 'lunas' : p > 0 ? 'sebagian' : 'belum'}">${p === 100 ? 'Lunas' : p > 0 ? 'Sebagian' : 'Belum'}</span></td>
            </tr>`;
          }).join('')}</tbody>
        </table>` : `<div class="empty"><div class="empty-ico">🗓️</div><p>Belum ada tagihan dibuat.</p></div>`}
      </div>
    </div>

    <div class="filters card card-pad mt">
      <div class="field"><label>Periode</label><select id="i-periode">
        <option value="">Semua</option>
        ${[...new Set(rekap.map(r => r.periode))].sort().reverse().map(p => `<option value="${p}" ${f.periode === p ? 'selected' : ''}>${periodeLabel(p)}</option>`).join('')}
        ${rekap.every(r => r.periode !== f.periode) && f.periode ? `<option value="${f.periode}" selected>${periodeLabel(f.periode)}</option>` : ''}
      </select></div>
      <div class="field grow"><label>Cari santri</label><input id="i-q" value="${esc(f.q)}" placeholder="nama atau NIS…"></div>
      <div class="field"><label>Status</label><select id="i-status">
        <option value="semua">Semua</option>
        <option value="belum" ${f.status === 'belum' ? 'selected' : ''}>Belum</option>
        <option value="sebagian" ${f.status === 'sebagian' ? 'selected' : ''}>Sebagian</option>
        <option value="lunas" ${f.status === 'lunas' ? 'selected' : ''}>Lunas</option>
      </select></div>
      <div class="field"><label>Jenis Iuran</label><select id="i-jenis">
        <option value="">Semua</option>
        ${jenis.map(j => `<option value="${j.id}" ${f.jenis_id === j.id ? 'selected' : ''}>${esc(j.nama)}</option>`).join('')}
      </select></div>
      <button class="btn" id="i-reset">Reset</button>
      <button class="btn btn-gold" id="i-generate">⚙️ Generate Tagihan</button>
      <button class="btn btn-primary" id="i-add">＋ Jenis Iuran</button>
    </div>

    <div class="card">
      <div class="card-head"><h3>Daftar Tagihan (${tags.length})</h3><span class="muted">Status: ${f.status}</span></div>
      <div class="table-wrap">
        ${tags.length ? `<table>
          <thead><tr><th>Santri</th><th>Periode</th><th>Jenis</th><th class="num">Tagihan</th><th class="num">Dibayar</th><th class="num">Sisa</th><th>Status</th><th></th></tr></thead>
          <tbody>${tags.map(t => `
            <tr>
              <td><strong>${esc(t.nama_santri)}</strong><br><small class="muted">${esc(t.nis)} • ${esc(t.kelas)}</small></td>
              <td class="nowrap">${periodeLabel(t.periode)}</td>
              <td>${esc(t.jenis)}</td>
              <td class="num">${fmt(t.nominal)}</td>
              <td class="num pos">${fmt(t.total_bayar)}</td>
              <td class="num ${t.sisa > 0 ? 'neg' : 'pos'}">${fmt(t.sisa)}</td>
              <td><span class="badge ${t.status}">${t.status === 'belum' ? 'Belum' : t.status === 'lunas' ? 'Lunas' : 'Sebagian'}</span></td>
              <td class="actions">${t.sisa > 0
                ? `<button class="btn btn-sm btn-primary" data-bayar="${t.id}">Bayar</button>`
                : `<button class="btn btn-sm" data-detail="${t.id}">Riwayat</button>`}</td>
            </tr>`).join('')}</tbody>
        </table>` : `<div class="empty"><div class="empty-ico">🧾</div><p>Tidak ada tagihan. Klik <strong>Generate Tagihan</strong> untuk membuat iuran massal.</p></div>`}
      </div>
    </div>`;

  let tId; $('#i-q').oninput = () => { clearTimeout(tId); tId = setTimeout(() => { STATE.iuran.q = $('#i-q').value.trim(); pageIuran(); }, 450); };
  ['i-periode', 'i-status', 'i-jenis'].forEach(id => $('#' + id).onchange = () => {
    STATE.iuran = { periode: $('#i-periode').value, status: $('#i-status').value, jenis_id: $('#i-jenis').value, q: $('#i-q').value.trim() };
    pageIuran();
  });
  $('#i-reset').onclick = () => { STATE.iuran = { periode: thisMonth() }; pageIuran(); };
  $$('[data-periode]').forEach(tr => tr.onclick = () => { STATE.iuran.periode = tr.dataset.periode; pageIuran(); });
  $$('[data-bayar]').forEach(b => b.onclick = () => formBayar(b.dataset.bayar));
  $$('[data-detail]').forEach(b => b.onclick = () => detailTagihan(b.dataset.detail));
  $('#i-generate').onclick = () => formGenerate();
  $('#i-add').onclick = () => formJenisIuran();
}

async function formGenerate() {
  const [santri, jenis] = await Promise.all([API.get('/api/santri?status=aktif'), API.get('/api/jenis-tagihan')]);
  const bln = thisMonth();
  openModal('Generate Tagihan Massal', `
    <div class="form-grid">
      <div class="field full"><label>Periode (bulan tagihan)</label><input type="month" id="g-periode" value="${bln}"></div>
      <div class="field full"><label>Jenis Iuran</label><select id="g-jenis" multiple size="${Math.min(5, jenis.length)}" style="padding:6px">
        ${jenis.map(j => `<option value="${j.id}" selected>${esc(j.nama)} — ${fmt(j.nominal)}</option>`).join('')}
      </select><span class="hint">Tahan Ctrl/⌘ untuk pilih lebih dari satu. Kosongkan = semua jenis aktif.</span></div>
      <div class="field full"><label>Santri</label><select id="g-santri" multiple size="${Math.min(6, santri.length)}" style="padding:6px">
        ${santri.map(s => `<option value="${s.id}" selected>${esc(s.nama)} — ${esc(s.kelas)}</option>`).join('')}
      </select><span class="hint">Kosongkan = semua santri aktif. Tagihan duplikat otomatis dilewati.</span></div>
    </div>`,
    `<button class="btn" onclick="closeModal()">Batal</button><button class="btn btn-gold" id="g-save">⚙️ Generate</button>`);
  $('#g-save').onclick = async () => {
    const payload = {
      periode: $('#g-periode').value,
      jenis_ids: [...$('#g-jenis').selectedOptions].map(o => o.value),
      santri_ids: [...$('#g-santri').selectedOptions].map(o => o.value)
    };
    if (!payload.periode) return toast('Pilih periode', 'error');
    try {
      const r = await API.post('/api/tagihan/generate', payload);
      toast(r.pesan); closeModal(); pageIuran();
    } catch (e) { toast(e.message, 'error'); }
  };
}

async function formJenisIuran() {
  const jenis = await API.get('/api/jenis-tagihan');
  openModal('Kelola Jenis Iuran', `
    <div class="card" style="box-shadow:none">
      <div class="table-wrap"><table>
        <thead><tr><th>Nama</th><th class="num">Nominal / bulan</th><th></th></tr></thead>
        <tbody>${jenis.map(j => `<tr>
          <td>${esc(j.nama)}</td>
          <td class="num">${fmt(j.nominal)}</td>
          <td class="actions"><button class="btn btn-sm btn-danger" data-delj="${j.id}">Hapus</button></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>
    <div class="form-grid mt" style="margin-top:16px">
      <div class="field"><label>Nama jenis iuran</label><input id="j-nama" placeholder="mis. Uang Seragam"></div>
      <div class="field"><label>Nominal (Rp)</label><input type="number" id="j-nom" min="0" step="5000" placeholder="0"></div>
    </div>`,
    `<button class="btn" onclick="closeModal()">Tutup</button><button class="btn btn-primary" id="j-save">＋ Tambah</button>`);
  $('#j-save').onclick = async () => {
    const nama = $('#j-nama').value.trim(), nominal = Number($('#j-nom').value);
    if (!nama || nominal <= 0) return toast('Nama & nominal wajib diisi', 'error');
    try { await API.post('/api/jenis-tagihan', { nama, nominal }); toast('Jenis iuran ditambah'); formJenisIuran(); }
    catch (e) { toast(e.message, 'error'); }
  };
  $$('[data-delj]').forEach(b => b.onclick = async () => {
    if (!confirm('Hapus jenis iuran ini?')) return;
    try { await API.del('/api/jenis-tagihan/' + b.dataset.delj); toast('Dihapus'); formJenisIuran(); }
    catch (e) { toast(e.message, 'error'); }
  });
}

async function formBayar(id) {
  const all = await API.get('/api/tagihan?' + new URLSearchParams({ periode: STATE.iuran.periode || '', q: STATE.iuran.q || '' }));
  const t = all.find(x => x.id === id);
  if (!t) return toast('Tagihan tidak ditemukan', 'error');
  openModal('Pembayaran Iuran', `
    <div class="card card-pad" style="box-shadow:none;background:var(--green-50);border-color:var(--green-100)">
      <strong>${esc(t.nama_santri)}</strong> <span class="muted">(${esc(t.nis)} • ${esc(t.kelas)})</span><br>
      <span class="muted">${esc(t.jenis)} — ${periodeLabel(t.periode)}</span>
      <div class="flex between" style="margin-top:10px">
        <span>Tagihan <strong>${fmt(t.nominal)}</strong></span>
        <span>Sisa <strong class="neg">${fmt(t.sisa)}</strong></span>
      </div>
    </div>
    <div class="form-grid mt" style="margin-top:16px">
      <div class="field"><label>Tanggal Bayar</label><input type="date" id="b-tgl" value="${today()}"></div>
      <div class="field"><label>Jumlah (Rp)</label><input type="number" id="b-jml" value="${t.sisa}" min="1" step="1000"></div>
      <div class="field"><label>Metode</label><select id="b-metode">
        <option>Tunai</option><option>Transfer</option><option>QRIS</option><option>Setor ke Bendahara</option>
      </select></div>
      <div class="field"><label>Petugas</label><input id="b-petugas" value="Bendahara" placeholder="Nama petugas"></div>
      <div class="field full"><label>Catatan</label><input id="b-ket" placeholder="opsional"></div>
    </div>
    <p class="hint muted" style="margin-top:12px;font-size:12px">💡 Pembayaran otomatis dicatat sebagai pemasukan pada kas pondok.</p>`,
    `<button class="btn" onclick="closeModal()">Batal</button><button class="btn btn-primary" id="b-save">💳 Bayar</button>`);
  $('#b-save').onclick = async () => {
    const payload = {
      tanggal: $('#b-tgl').value, jumlah: Number($('#b-jml').value),
      metode: $('#b-metode').value, petugas: $('#b-petugas').value.trim(), keterangan: $('#b-ket').value.trim()
    };
    if (payload.jumlah <= 0) return toast('Jumlah harus > 0', 'error');
    try {
      const r = await API.post(`/api/tagihan/${id}/bayar`, payload);
      toast(r.pesan || 'Pembayaran tersimpan'); closeModal(); refreshSaldo(); pageIuran();
    } catch (e) { toast(e.message, 'error'); }
  };
}

async function detailTagihan(id) {
  const all = await API.get('/api/tagihan?' + new URLSearchParams({ periode: STATE.iuran.periode || '' }));
  const t = all.find(x => x.id === id);
  if (!t) return toast('Tagihan tidak ditemukan', 'error');
  openModal('Riwayat Pembayaran', `
    <p><strong>${esc(t.nama_santri)}</strong> — ${esc(t.jenis)} ${periodeLabel(t.periode)}</p>
    <div class="flex between" style="margin:12px 0">
      <span>Tagihan <strong>${fmt(t.nominal)}</strong></span>
      <span>Dibayar <strong class="pos">${fmt(t.total_bayar)}</strong></span>
      <span>Sisa <strong class="${t.sisa ? 'neg' : 'pos'}">${fmt(t.sisa)}</strong></span>
    </div>
    <table>
      <thead><tr><th>Tanggal</th><th>Metode</th><th>Petugas</th><th class="num">Jumlah</th><th></th></tr></thead>
      <tbody>${t.riwayat.map(p => `<tr>
        <td>${tglLabel(p.tanggal)}</td><td>${esc(p.metode)}</td><td>${esc(p.petugas)}</td>
        <td class="num pos">${fmt(p.jumlah)}</td>
        <td class="actions"><button class="btn btn-sm btn-danger" data-delp="${p.id}">✕</button></td>
      </tr>`).join('')}</tbody>
    </table>`,
    `<button class="btn" onclick="closeModal()">Tutup</button>`);
  $$('[data-delp]').forEach(b => b.onclick = async () => {
    if (!confirm('Hapus pembayaran ini? Transaksi kas terkait juga ikut terhapus.')) return;
    try { await API.del('/api/pembayaran/' + b.dataset.delp); toast('Pembayaran dihapus'); closeModal(); refreshSaldo(); pageIuran(); }
    catch (e) { toast(e.message, 'error'); }
  });
}

/* =========================================================
   DATA SANTRI
   ========================================================= */
async function pageSantri() {
  const f = Object.assign({ q: '', status: 'semua' }, STATE.santri);
  STATE.santri = f;
  const list = await API.get('/api/santri?' + new URLSearchParams(f));
  const aktif = list.filter(s => s.status === 'aktif').length;
  const tunggak = list.filter(s => s.sisa_tagihan > 0).length;

  $('#content').innerHTML = `
    <div class="grid grid-3">
      <div class="stat"><div class="stat-ico">👨‍🎓</div><div class="stat-label">Total Santri</div><div class="stat-value">${list.length}</div></div>
      <div class="stat masuk"><div class="stat-ico">✅</div><div class="stat-label">Santri Aktif</div><div class="stat-value">${aktif}</div></div>
      <div class="stat keluar"><div class="stat-ico">⚠️</div><div class="stat-label">Ada Tunggakan</div><div class="stat-value">${tunggak}</div></div>
    </div>

    <div class="filters card card-pad mt">
      <div class="field grow"><label>Cari</label><input id="s-q" value="${esc(f.q)}" placeholder="nama atau NIS…"></div>
      <div class="field"><label>Status</label><select id="s-status">
        <option value="semua">Semua</option>
        <option value="aktif" ${f.status === 'aktif' ? 'selected' : ''}>Aktif</option>
        <option value="cuti" ${f.status === 'cuti' ? 'selected' : ''}>Cuti</option>
        <option value="lulus" ${f.status === 'lulus' ? 'selected' : ''}>Lulus</option>
      </select></div>
      <button class="btn" id="s-reset">Reset</button>
      <button class="btn btn-primary" id="s-add">＋ Tambah Santri</button>
    </div>

    <div class="card">
      <div class="card-head"><h3>Daftar Santri (${list.length})</h3></div>
      <div class="table-wrap">
        ${list.length ? `<table>
          <thead><tr><th>NIS</th><th>Nama</th><th>Kelas</th><th>Asrama</th><th>Status</th><th class="num">Total Iuran</th><th class="num">Sisa</th><th></th></tr></thead>
          <tbody>${list.map(s => `
            <tr>
              <td class="muted">${esc(s.nis)}</td>
              <td><strong>${esc(s.nama)}</strong></td>
              <td>${esc(s.kelas)}</td>
              <td>${esc(s.asrama)}</td>
              <td><span class="badge ${s.status}">${esc(s.status)}</span></td>
              <td class="num">${fmt(s.total_tagihan)}</td>
              <td class="num ${s.sisa_tagihan > 0 ? 'neg' : 'pos'}">${fmt(s.sisa_tagihan)}</td>
              <td class="actions">
                <button class="btn btn-sm" data-edit="${s.id}">Edit</button>
                <button class="btn btn-sm btn-danger" data-dels="${s.id}">Hapus</button>
              </td>
            </tr>`).join('')}</tbody>
        </table>` : `<div class="empty"><div class="empty-ico">👨‍🎓</div><p>Belum ada data santri.</p><button class="btn btn-primary" id="s-add2">Tambah Santri</button></div>`}
      </div>
    </div>`;

  let tId; $('#s-q').oninput = () => { clearTimeout(tId); tId = setTimeout(() => { STATE.santri.q = $('#s-q').value.trim(); pageSantri(); }, 450); };
  $('#s-status').onchange = () => { STATE.santri.status = $('#s-status').value; pageSantri(); };
  $('#s-reset').onclick = () => { STATE.santri = { q: '', status: 'semua' }; pageSantri(); };
  $('#s-add').onclick = () => formSantri();
  if ($('#s-add2')) $('#s-add2').onclick = () => formSantri();
  $$('[data-edit]').forEach(b => b.onclick = () => formSantri(list.find(x => x.id === b.dataset.edit)));
  $$('[data-dels]').forEach(b => b.onclick = async () => {
    if (!confirm('Hapus santri ini?')) return;
    try { await API.del('/api/santri/' + b.dataset.dels); toast('Santri dihapus'); pageSantri(); }
    catch (e) { toast(e.message, 'error'); }
  });
}

async function formSantri(s) {
  const b = s || {};
  openModal(b.id ? 'Edit Santri' : 'Tambah Santri', `
    <div class="form-grid">
      <div class="field full"><label>Nama Lengkap *</label><input id="s-nama" value="${esc(b.nama || '')}" placeholder="Nama santri"></div>
      <div class="field"><label>NIS</label><input id="s-nis" value="${esc(b.nis || '')}" placeholder="otomatis jika kosong"></div>
      <div class="field"><label>Status</label><select id="s-st">
        <option value="aktif" ${b.status === 'aktif' || !b.id ? 'selected' : ''}>Aktif</option>
        <option value="cuti" ${b.status === 'cuti' ? 'selected' : ''}>Cuti</option>
        <option value="lulus" ${b.status === 'lulus' ? 'selected' : ''}>Lulus</option>
      </select></div>
      <div class="field"><label>Kelas</label><input id="s-kelas" value="${esc(b.kelas || '')}" placeholder="mis. TMI 2"></div>
      <div class="field"><label>Asrama</label><input id="s-asrama" value="${esc(b.asrama || '')}" placeholder="mis. Asrama Al-Fatih"></div>
      <div class="field full"><label>No. Telepon</label><input id="s-tel" value="${esc(b.telepon || '')}" placeholder="08xxxxxxxxxx"></div>
    </div>`,
    `<button class="btn" onclick="closeModal()">Batal</button><button class="btn btn-primary" id="s-save">💾 Simpan</button>`);
  $('#s-save').onclick = async () => {
    const payload = {
      nama: $('#s-nama').value.trim(), nis: $('#s-nis').value.trim(), kelas: $('#s-kelas').value.trim(),
      asrama: $('#s-asrama').value.trim(), status: $('#s-st').value, telepon: $('#s-tel').value.trim()
    };
    if (!payload.nama) return toast('Nama wajib diisi', 'error');
    try {
      if (b.id) await API.put('/api/santri/' + b.id, payload);
      else await API.post('/api/santri', payload);
      toast('Data santri tersimpan'); closeModal(); pageSantri();
    } catch (e) { toast(e.message, 'error'); }
  };
}

/* =========================================================
   LAPORAN
   ========================================================= */
async function pageLaporan() {
  const d = new Date();
  const awal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  if (!STATE.laporan) STATE.laporan = { dari: awal, sampai: today(), jenis: 'semua' };
  const f = STATE.laporan;
  const [lap, rekap, set] = await Promise.all([
    API.get('/api/laporan?' + new URLSearchParams(f)),
    API.get('/api/laporan/iuran'),
    API.get('/api/pengaturan')
  ]);

  const km = lap.rincian_kategori;
  const masukKat = km.filter(k => k.jenis === 'masuk');
  const keluarKat = km.filter(k => k.jenis === 'keluar');

  const rowKat = (k) => `<tr>
    <td><span class="kat-dot" style="background:${k.warna}"></span>${esc(k.kategori)}</td>
    <td class="num">${k.jumlah_item}</td>
    <td class="num">${k.jenis === 'masuk' ? '+' : '−'} ${fmt(k.jumlah)}</td>
  </tr>`;

  $('#content').innerHTML = `
    <div class="print-head">
      <h2>${esc(set.nama_pesantren)}</h2>
      <p>${esc(set.alamat)}</p>
      <p><strong>LAPORAN KEUANGAN</strong> — Periode ${tglLabel(lap.periode.dari)} s/d ${tglLabel(lap.periode.sampai)} (TA ${esc(set.tahun_ajaran)})</p>
    </div>

    <div class="filters card card-pad">
      <div class="field"><label>Dari</label><input type="date" id="l-dari" value="${f.dari}"></div>
      <div class="field"><label>Sampai</label><input type="date" id="l-sampai" value="${f.sampai}"></div>
      <div class="field"><label>Jenis</label><select id="l-jenis">
        <option value="semua">Semua</option>
        <option value="masuk" ${f.jenis === 'masuk' ? 'selected' : ''}>Pemasukan</option>
        <option value="keluar" ${f.jenis === 'keluar' ? 'selected' : ''}>Pengeluaran</option>
      </select></div>
      <button class="btn" id="l-bulan">📅 Bulan Ini</button>
      <button class="btn" id="l-tahun">📆 Tahun Ini</button>
      <button class="btn" onclick="window.print()">🖨️ Cetak / PDF</button>
      <button class="btn" id="l-csv">⬇ CSV</button>
    </div>

    <div class="grid grid-4">
      <div class="stat masuk"><div class="stat-ico">📈</div><div class="stat-label">Pemasukan</div><div class="stat-value">${fmt(lap.ringkas.masuk)}</div></div>
      <div class="stat keluar"><div class="stat-ico">📉</div><div class="stat-label">Pengeluaran</div><div class="stat-value">${fmt(lap.ringkas.keluar)}</div></div>
      <div class="stat saldo"><div class="stat-ico">💰</div><div class="stat-label">Selisih (Arus Kas)</div><div class="stat-value ${lap.ringkas.selisih >= 0 ? 'pos' : 'neg'}">${fmt(lap.ringkas.selisih)}</div></div>
      <div class="stat"><div class="stat-ico">🧮</div><div class="stat-label">Jumlah Transaksi</div><div class="stat-value">${lap.ringkas.jumlah_transaksi}</div></div>
    </div>

    <div class="grid grid-2 mt">
      <div class="card">
        <div class="card-head"><h3>📈 Rekap Pemasukan per Kategori</h3></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Kategori</th><th class="num">Item</th><th class="num">Jumlah</th></tr></thead>
          <tbody>${masukKat.length ? masukKat.map(rowKat).join('') : '<tr><td colspan="3" class="muted">—</td></tr>'}</tbody>
          <tfoot><tr style="background:#f8fafc"><td><strong>Total</strong></td><td></td><td class="num pos"><strong>${fmt(masukKat.reduce((a, k) => a + k.jumlah, 0))}</strong></td></tr></tfoot>
        </table></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>📉 Rekap Pengeluaran per Kategori</h3></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Kategori</th><th class="num">Item</th><th class="num">Jumlah</th></tr></thead>
          <tbody>${keluarKat.length ? keluarKat.map(rowKat).join('') : '<tr><td colspan="3" class="muted">—</td></tr>'}</tbody>
          <tfoot><tr style="background:#f8fafc"><td><strong>Total</strong></td><td></td><td class="num neg"><strong>${fmt(keluarKat.reduce((a, k) => a + k.jumlah, 0))}</strong></td></tr></tfoot>
        </table></div>
      </div>
    </div>

    <div class="card mt">
      <div class="card-head"><h3>Rincian Transaksi (${lap.transaksi.length})</h3></div>
      <div class="table-wrap">
        ${lap.transaksi.length ? `<table>
          <thead><tr><th>Tanggal</th><th>Keterangan</th><th>Kategori</th><th class="num">Masuk</th><th class="num">Keluar</th></tr></thead>
          <tbody>${lap.transaksi.map(t => `<tr>
            <td class="nowrap">${tglLabel(t.tanggal)}</td>
            <td>${esc(t.keterangan || '-')}</td>
            <td><span class="kat-dot" style="background:${t.warna}"></span>${esc(t.kategori)}</td>
            <td class="num pos">${t.jenis === 'masuk' ? fmt(t.jumlah) : ''}</td>
            <td class="num neg">${t.jenis === 'keluar' ? fmt(t.jumlah) : ''}</td>
          </tr>`).join('')}</tbody>
          <tfoot><tr style="background:#f8fafc"><td colspan="3"><strong>Selisih Periode</strong></td>
            <td class="num pos"><strong>${fmt(lap.ringkas.masuk)}</strong></td>
            <td class="num neg"><strong>${fmt(lap.ringkas.keluar)}</strong></td></tr></tfoot>
        </table>` : `<div class="empty"><div class="empty-ico">📊</div><p>Tidak ada transaksi pada periode ini.</p></div>`}
      </div>
    </div>

    <div class="card mt">
      <div class="card-head"><h3>🧾 Rekap Iuran per Periode</h3></div>
      <div class="table-wrap" id="iuranRekap"></div>
    </div>`;

  $('#iuranRekap').innerHTML = rekap.length ? `<table>
    <thead><tr><th>Periode</th><th class="num">Tagihan</th><th class="num">Terkumpul</th><th class="num">Sisa</th><th>Progress</th><th>Lunas</th></tr></thead>
    <tbody>${rekap.map(r => {
      const p = r.total ? Math.round(r.terkumpul / r.total * 100) : 0;
      return `<tr><td><strong>${periodeLabel(r.periode)}</strong></td>
        <td class="num">${fmt(r.total)}</td><td class="num pos">${fmt(r.terkumpul)}</td><td class="num neg">${fmt(r.sisa)}</td>
        <td style="min-width:120px"><div class="progress"><span style="width:${p}%"></span></div></td>
        <td><span class="badge ${p === 100 ? 'lunas' : p > 0 ? 'sebagian' : 'belum'}">${r.lunas}/${r.jumlah_tagihan}</span></td></tr>`;
    }).join('')}</tbody></table>` : `<div class="empty"><p>Belum ada data iuran.</p></div>`;

  const apply = () => {
    STATE.laporan = { dari: $('#l-dari').value, sampai: $('#l-sampai').value, jenis: $('#l-jenis').value };
    pageLaporan();
  };
  ['l-dari', 'l-sampai', 'l-jenis'].forEach(id => $('#' + id).onchange = apply);
  $('#l-bulan').onclick = () => { STATE.laporan = { dari: awal, sampai: today(), jenis: 'semua' }; pageLaporan(); };
  $('#l-tahun').onclick = () => { STATE.laporan = { dari: `${d.getFullYear()}-01-01`, sampai: today(), jenis: 'semua' }; pageLaporan(); };
  $('#l-csv').onclick = () => exportCsv(lap.transaksi);
}

/* =========================================================
   PENGATURAN
   ========================================================= */
async function pagePengaturan() {
  const p = await API.get('/api/pengaturan');
  $('#content').innerHTML = `
    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h3>🕌 Profil Pesantren</h3></div>
        <div class="card-pad">
          <div class="form-grid">
            <div class="field full"><label>Nama Pesantren</label><input id="p-nama" value="${esc(p.nama_pesantren)}"></div>
            <div class="field full"><label>Alamat</label><textarea id="p-alamat">${esc(p.alamat)}</textarea></div>
            <div class="field"><label>Tahun Ajaran</label><input id="p-ta" value="${esc(p.tahun_ajaran)}" placeholder="2025/2026"></div>
            <div class="field"><label>Logo Teks (2-3 huruf)</label><input id="p-logo" value="${esc(p.logo_teks)}" maxlength="3" placeholder="PP"></div>
            <div class="field full"><label>Saldo Awal Kas (Rp)</label><input type="number" id="p-saldo" value="${p.saldo_awal}" step="1000"><span class="hint">Saldo sebelum semua transaksi dicatat.</span></div>
          </div>
          <button class="btn btn-primary mt" style="margin-top:16px" id="p-save">💾 Simpan Pengaturan</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>🗂️ Kategori Transaksi</h3><button class="btn btn-sm btn-primary" id="k-add">＋ Tambah</button></div>
        <div class="table-wrap" id="k-list"></div>
      </div>
    </div>

    <div class="grid grid-3 mt">
      <div class="card card-pad">
        <strong>⬇️ Backup Data</strong>
        <p class="muted" style="margin:8px 0 12px;font-size:12.5px">Unduh seluruh data (santri, kas, iuran) sebagai file JSON.</p>
        <button class="btn btn-block" id="b-backup">Unduh Backup</button>
      </div>
      <div class="card card-pad">
        <strong>⬆️ Restore Data</strong>
        <p class="muted" style="margin:8px 0 12px;font-size:12.5px">Pulihkan data dari file backup JSON. Data saat ini akan ditimpa.</p>
        <input type="file" id="b-file" accept="application/json" hidden>
        <button class="btn btn-block" id="b-restore">Pilih File Backup</button>
      </div>
      <div class="card card-pad">
        <strong>🧪 Data Demo</strong>
        <p class="muted" style="margin:8px 0 12px;font-size:12.5px">Muat contoh data (30 santri, kas & iuran 3 bulan) untuk mencoba aplikasi.</p>
        <button class="btn btn-gold btn-block" id="b-demo">Muat Data Demo</button>
      </div>
    </div>

    <div class="card card-pad mt" style="border-color:#fecaca">
      <strong style="color:var(--red)">⚠️ Zona Berbahaya</strong>
      <p class="muted" style="margin:8px 0 12px;font-size:12.5px">Kosongkan <em>seluruh</em> data aplikasi (santri, kas, iuran, kategori). Tindakan ini tidak bisa dibatalkan.</p>
      <button class="btn btn-danger" id="b-reset">🗑️ Kosongkan Semua Data</button>
    </div>

    <div class="card card-pad mt">
      <strong>ℹ️ Tentang Aplikasi</strong>
      <p class="muted" style="margin-top:8px;font-size:12.5px;line-height:1.7">
        Aplikasi Keuangan Pondok Pesantren v1.1 (shared hosting) — kas harian, iuran santri otomatis tercatat sebagai pemasukan,
        laporan siap cetak, penyimpanan lokal (file <code>data/db.json</code>) tanpa database & tanpa Node.js.
        Cukup upload folder ini ke <code>public_html</code> via File Manager/FTP.
      </p>
    </div>`;

  $('#p-save').onclick = async () => {
    try {
      await API.put('/api/pengaturan', {
        nama_pesantren: $('#p-nama').value.trim(), alamat: $('#p-alamat').value.trim(),
        tahun_ajaran: $('#p-ta').value.trim(), logo_teks: $('#p-logo').value.trim().toUpperCase(),
        saldo_awal: Number($('#p-saldo').value) || 0
      });
      toast('Pengaturan tersimpan'); loadHeader(); refreshSaldo();
    } catch (e) { toast(e.message, 'error'); }
  };

  const loadKat = async () => {
    const kat = await API.get('/api/kategori');
    $('#k-list').innerHTML = `<table><tbody>${kat.map(k => `
      <tr>
        <td><span class="kat-dot" style="background:${k.warna}"></span>${esc(k.nama)}</td>
        <td><span class="badge ${k.jenis}">${k.jenis === 'masuk' ? 'Masuk' : 'Keluar'}</span></td>
        <td class="actions"><button class="btn btn-sm btn-danger" data-delk="${k.id}">Hapus</button></td>
      </tr>`).join('')}</tbody></table>`;
    $$('[data-delk]').forEach(b => b.onclick = async () => {
      if (!confirm('Hapus kategori ini?')) return;
      try { await API.del('/api/kategori/' + b.dataset.delk); toast('Kategori dihapus'); loadKat(); }
      catch (e) { toast(e.message, 'error'); }
    });
  };
  loadKat();

  $('#k-add').onclick = () => {
    openModal('Tambah Kategori', `
      <div class="form-grid">
        <div class="field full"><label>Nama</label><input id="k-nama" placeholder="mis. Kendaraan"></div>
        <div class="field"><label>Jenis</label><select id="k-jenis"><option value="masuk">Pemasukan</option><option value="keluar">Pengeluaran</option></select></div>
        <div class="field"><label>Warna</label><input type="color" id="k-warna" value="#0ea5e9" style="height:40px;padding:3px"></div>
      </div>`,
      `<button class="btn" onclick="closeModal()">Batal</button><button class="btn btn-primary" id="k-save">Simpan</button>`);
    $('#k-save').onclick = async () => {
      const nama = $('#k-nama').value.trim();
      if (!nama) return toast('Nama kategori wajib diisi', 'error');
      try { await API.post('/api/kategori', { nama, jenis: $('#k-jenis').value, warna: $('#k-warna').value }); toast('Kategori ditambah'); closeModal(); loadKat(); }
      catch (e) { toast(e.message, 'error'); }
    };
  };

  $('#b-backup').onclick = () => { window.location.href = apiUrl('/api/backup'); };
  $('#b-restore').onclick = () => $('#b-file').click();
  $('#b-file').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!confirm('Timpa seluruh data saat ini dengan isi backup ini?')) return;
      const r = await API.post('/api/restore', data);
      toast(r.pesan); loadHeader(); refreshSaldo(); pagePengaturan();
    } catch (err) { toast('File tidak valid: ' + err.message, 'error'); }
    e.target.value = '';
  };
  $('#b-demo').onclick = async () => {
    if (!confirm('Muat data demo? Data saat ini akan ditimpa.')) return;
    try { const r = await API.post('/api/demo'); toast(r.pesan); loadHeader(); refreshSaldo(); pagePengaturan(); }
    catch (e) { toast(e.message, 'error'); }
  };
  $('#b-reset').onclick = async () => {
    if (!confirm('Yakin ingin MENGOSONGKAN semua data? Ketik tidak bisa dibatalkan.')) return;
    if (!confirm('Konfirmasi terakhir: hapus semua data santri, kas, dan iuran?')) return;
    try { const r = await API.post('/api/reset'); toast(r.pesan); loadHeader(); refreshSaldo(); pagePengaturan(); }
    catch (e) { toast(e.message, 'error'); }
  };
}

/* =========================================================
   INIT
   ========================================================= */
(async function init() {
  await loadHeader();
  await refreshSaldo();
  navigate();
})();
