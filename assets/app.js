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
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const thisMonth = () => today().slice(0, 7);
const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const periodeLabel = (p) => { const [y, m] = String(p).split('-'); return `${BLN[+m - 1]} ${y}`; };
const tglLabel = (d) => { const [y, m, dd] = String(d).split('-'); return `${+dd} ${BLN[+m - 1].slice(0, 3)} ${y}`; };

let STATE = { page: 'dashboard', kas: {}, iuran: {}, santri: { grup: 'umum' }, jurnal: {} };

/* ---------------- Toast & Modal ---------------- */
function toast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' error' : '');
  el.innerHTML = `<span>${type === 'error' ? '⚠️' : '✅'}</span> ${esc(msg)}`;
  $('#toastWrap').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3200);
}

function openModal(title, bodyHTML, footHTML, width) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHTML + (footHTML ? `<div class="modal-foot">${footHTML}</div>` : '');
  $('#modal').style.maxWidth = (width || 560) + 'px';
  $('#modalBackdrop').hidden = false;
  const f = $('#modalBody input, #modalBody select, #modalBody textarea');
  if (f) setTimeout(() => f.focus(), 60);
}
function closeModal() { $('#modalBackdrop').hidden = true; $('#modalBody').innerHTML = ''; }

$('#modalClose').onclick = closeModal;
$('#modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

/* ---------------- Router ---------------- */
const ROUTES = { dashboard: pageDashboard, jurnal: pageJurnal, kas: pageKas, iuran: pageIuran, santri: pageSantri, laporan: pageLaporan, pengaturan: pagePengaturan };
const TITLES = {
  dashboard: ['Dashboard', 'Ringkasan keuangan pesantren'],
  jurnal: ['Jurnal Pemasukan', 'Entry pemasukan harian — BKM, santri & rekening'],
  kas: ['Kas / Transaksi', 'Catat pemasukan & pengeluaran harian'],
  iuran: ['Iuran Santri', 'Tagihan, pembayaran & tunggakan'],
  santri: ['Data Santri', 'Kolom tagihan SPP, Infaq, Laundry & lainnya'],
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
              <td>${esc(t.keterangan || '-')} ${t.ref ? `<span class="badge lunas" style="font-size:10px">${t.ref_tipe === 'jurnal' || String(t.ref).startsWith('JUR') ? 'jurnal' : 'iuran'}</span>` : ''}</td>
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
   JURNAL PEMASUKAN
   ========================================================= */
let JLIST = [], JSANTRI = [], JCUSTOM = [], JCUR = null, JEDIT = null;

function jurnalTagihanSelect(s, pilihKey) {
  const sel = $('#j-tagihan'); if (!sel) return;
  if (!s) { sel.innerHTML = '<option value="">— Tanpa tagihan —</option>'; return; }
  const ops = allJenisOpsi(s, JCUSTOM);
  sel.innerHTML = '<option value="">— Tanpa tagihan —</option>' +
    ops.map(o => `<option value="${esc(o.key)}">${esc(o.nama)} — ${fmt(o.nilai)}</option>`).join('');
  if (pilihKey) sel.value = pilihKey;
}

async function pageJurnal() {
  const f = Object.assign({ dari: '', sampai: '', q: '', jenis_transaksi: 'semua', tanggal: '' }, STATE.jurnal);
  STATE.jurnal = f;
  const qs = new URLSearchParams();
  if (f.dari) qs.set('dari', f.dari);
  if (f.sampai) qs.set('sampai', f.sampai);
  if (f.q) qs.set('q', f.q);
  if (f.jenis_transaksi && f.jenis_transaksi !== 'semua') qs.set('jenis_transaksi', f.jenis_transaksi);

  const [list, santri, custom, next] = await Promise.all([
    API.get('/api/jurnal' + (qs.toString() ? '?' + qs : '')),
    API.get('/api/santri'),
    API.get('/api/kolom-custom'),
    API.get('/api/jurnal?act=next')
  ]);
  JLIST = list; JSANTRI = santri; JCUSTOM = custom;

  const per = { Cas: 0, BRI: 0, BSI: 0, BPD: 0 };
  list.forEach(j => { per[j.jenis_transaksi] = (per[j.jenis_transaksi] || 0) + (Number(j.nominal) || 0); });
  const total = list.reduce((a, j) => a + (Number(j.nominal) || 0), 0);
  const badgeJenis = (v) => `<span class="badge ${v === 'Cas' ? 'cash' : 'bank'}">${esc(v)}</span>`;

  $('#content').innerHTML = `
    <div class="grid grid-4">
      <div class="stat saldo"><div class="stat-ico">💰</div><div class="stat-label">Total Pemasukan</div><div class="stat-value" style="font-size:19px">${fmt(total)}</div><div class="stat-sub">${list.length} entry jurnal</div></div>
      <div class="stat"><div class="stat-ico">💵</div><div class="stat-label">Cas</div><div class="stat-value" style="font-size:19px">${fmt(per.Cas)}</div></div>
      <div class="stat"><div class="stat-ico">🏦</div><div class="stat-label">Transfer Bank</div><div class="stat-value" style="font-size:19px">${fmt(per.BRI + per.BSI + per.BPD)}</div><div class="stat-sub">BRI ${fmt(per.BRI)} · BSI ${fmt(per.BSI)} · BPD ${fmt(per.BPD)}</div></div>
      <div class="stat iuran"><div class="stat-ico">📒</div><div class="stat-label">BKM Tahun Ini</div><div class="stat-value">${(next.no_bkm || '').split('/').pop()}</div><div class="stat-sub">nomor berikutnya: ${esc(next.no_bkm || '-')}</div></div>
    </div>

    <div class="card mt">
      <div class="card-head"><h3 id="j-form-title">✏️ Entry Pemasukan</h3><span class="muted">Pilih nama santri → nominal terisi otomatis dari tagihan (bisa diedit)</span></div>
      <div class="card-pad">
        <div class="entry-grid">
          <div class="field"><label>Tanggal</label><input type="date" id="j-tgl" value="${f.tanggal || today()}"></div>
          <div class="field"><label>No BKM</label><input id="j-bkm" value="${esc(next.no_bkm || '')}" placeholder="otomatis"></div>
          <div class="field grow"><label>Nama Santri / Manual</label>
            <input id="j-nama" list="dl-santri" placeholder="pilih dari data santri… atau ketik manual" autocomplete="off">
            <datalist id="dl-santri">${santri.map(s => `<option value="${esc(s.nama)}">${esc(s.kelas)}</option>`).join('')}</datalist>
          </div>
          <div class="field"><label>Kelas</label><input id="j-kelas" placeholder="-"></div>
          <div class="field"><label>Jenis Tagihan</label><select id="j-tagihan"><option value="">— Tanpa tagihan —</option></select></div>
          <div class="field"><label>Jenis Transaksi</label><select id="j-jenis">
            <option>Cas</option><option>BRI</option><option>BSI</option><option>BPD</option>
          </select></div>
          <div class="field"><label>Nominal (Rp)</label><input type="number" id="j-nom" min="1" step="1000" placeholder="0"></div>
          <div class="field field-btn"><label>&nbsp;</label>
            <div class="flex">
              <button class="btn btn-primary" id="j-entry">✔ Entry</button>
              <button class="btn" id="j-batal" hidden>Batal</button>
            </div>
          </div>
        </div>
        <p class="hint muted" id="j-hint" style="margin-top:10px">Nominal mengikuti tagihan santri yang dipilih — tetap boleh diedit per transaksi.</p>
      </div>
    </div>

    <div class="filters card card-pad mt">
      <div class="field grow"><label>Cari</label><input id="j-q" value="${esc(f.q)}" placeholder="nama atau No BKM…"></div>
      <div class="field"><label>Dari</label><input type="date" id="j-dari" value="${f.dari}"></div>
      <div class="field"><label>Sampai</label><input type="date" id="j-sampai" value="${f.sampai}"></div>
      <div class="field"><label>Jenis Transaksi</label><select id="j-fjenis">
        <option value="semua">Semua</option>
        ${['Cas', 'BRI', 'BSI', 'BPD'].map(v => `<option ${f.jenis_transaksi === v ? 'selected' : ''}>${v}</option>`).join('')}
      </select></div>
      <button class="btn" id="j-reset">Reset</button>
      <button class="btn" onclick="window.print()">🖨️ Cetak</button>
    </div>

    <div class="card">
      <div class="card-head"><h3>Jurnal Pemasukan (${list.length})</h3><span class="muted">Edit / hapus lewat kolom aksi — kas otomatis menyesuaikan</span></div>
      <div class="table-wrap">
        ${list.length ? `<table>
          <thead><tr><th>Tanggal</th><th>No BKM</th><th>Nama Santri</th><th>Kelas</th><th>Jenis Tagihan</th><th>Jenis Transaksi</th><th class="num">Nominal</th><th></th></tr></thead>
          <tbody>${list.map(j => `
            <tr>
              <td class="nowrap">${tglLabel(j.tanggal)}</td>
              <td class="nowrap"><strong>${esc(j.no_bkm)}</strong></td>
              <td>${esc(j.nama)}</td>
              <td>${esc(j.kelas || '-')}</td>
              <td>${j.label_tagihan ? esc(j.label_tagihan) : '<span class="muted">Tanpa tagihan</span>'}</td>
              <td>${badgeJenis(j.jenis_transaksi)}</td>
              <td class="num pos">${fmt(j.nominal)}</td>
              <td class="actions">
                <button class="btn btn-sm" data-jedit="${j.id}">Edit</button>
                <button class="btn btn-sm btn-danger" data-jdel="${j.id}">Hapus</button>
              </td>
            </tr>`).join('')}</tbody>
          <tfoot><tr style="background:#f8fafc"><td colspan="6"><strong>Total</strong></td><td class="num"><strong>${fmt(total)}</strong></td><td></td></tr></tfoot>
        </table>` : `<div class="empty"><div class="empty-ico">📒</div><p>Belum ada jurnal pemasukan pada filter ini.</p></div>`}
      </div>
    </div>`;

  /* --- aksi form --- */
  $('#j-nama').onchange = () => {
    const v = $('#j-nama').value.trim().toLowerCase();
    const s = v ? JSANTRI.find(x => String(x.nama).trim().toLowerCase() === v) : null;
    JCUR = s || null;
    if (s) {
      $('#j-kelas').value = s.kelas || '';
      jurnalTagihanSelect(s, null);
      const first = allJenisOpsi(s, JCUSTOM).find(o => o.nilai > 0);
      if (first) {
        $('#j-tagihan').value = first.key;
        $('#j-nom').value = first.nilai;
        $('#j-hint').innerHTML = `✔ Santri <strong>${esc(s.nama)}</strong> (${esc(s.kelas)}) — nominal terisi otomatis dari tagihan, boleh diedit.`;
      } else {
        $('#j-nom').value = '';
        $('#j-hint').innerHTML = `✔ Santri <strong>${esc(s.nama)}</strong> (${esc(s.kelas)}) — tagihan masih Rp 0, pilih jenis tagihan atau isi nominal manual.`;
      }
    } else {
      jurnalTagihanSelect(null, null);
      $('#j-hint').textContent = v ? 'Nama tidak ada di data santri — dianggap input manual.' : '';
    }
  };
  $('#j-tagihan').onchange = () => {
    const key = $('#j-tagihan').value;
    if (JCUR && key) $('#j-nom').value = nilaiSantri(JCUR, key);
  };
  $('#j-entry').onclick = async () => {
    const nama = $('#j-nama').value.trim();
    const cocok = nama ? JSANTRI.find(x => String(x.nama).trim().toLowerCase() === nama.toLowerCase()) : null;
    const payload = {
      tanggal: $('#j-tgl').value,
      no_bkm: $('#j-bkm').value.trim(),
      nama,
      santri_id: cocok ? cocok.id : '',
      kelas: $('#j-kelas').value.trim(),
      jenis_transaksi: $('#j-jenis').value,
      tagihan_jenis: $('#j-tagihan').value || '',
      nominal: Number($('#j-nom').value)
    };
    if (!payload.tanggal || !payload.nama || !(payload.nominal > 0)) return toast('Tanggal, nama & nominal wajib diisi', 'error');
    try {
      if (JEDIT) {
        await API.put('/api/jurnal/' + JEDIT, payload);
        toast('Jurnal diperbarui — kas ikut disesuaikan');
      } else {
        await API.post('/api/jurnal', payload);
        toast('Entry tersimpan ke jurnal & kas');
        STATE.jurnal.tanggal = payload.tanggal;
      }
      JEDIT = null; refreshSaldo(); pageJurnal();
    } catch (e) { toast(e.message, 'error'); }
  };
  $('#j-batal').onclick = () => { JEDIT = null; JCUR = null; pageJurnal(); };

  /* --- filter --- */
  let tId; $('#j-q').oninput = () => { clearTimeout(tId); tId = setTimeout(() => { STATE.jurnal.q = $('#j-q').value.trim(); pageJurnal(); }, 400); };
  const applyFilter = () => {
    STATE.jurnal = {
      dari: $('#j-dari').value, sampai: $('#j-sampai').value, q: $('#j-q').value.trim(),
      jenis_transaksi: $('#j-fjenis').value, tanggal: STATE.jurnal.tanggal
    };
    pageJurnal();
  };
  ['j-dari', 'j-sampai', 'j-fjenis'].forEach(id => $('#' + id).onchange = applyFilter);
  $('#j-reset').onclick = () => { STATE.jurnal = { tanggal: STATE.jurnal.tanggal }; pageJurnal(); };

  /* --- aksi baris --- */
  $$('[data-jedit]').forEach(b => b.onclick = () => jurnalMuatEdit(b.dataset.jedit));
  $$('[data-jdel]').forEach(b => b.onclick = async () => {
    if (!confirm('Hapus jurnal ini? Transaksi kas terkait juga ikut terhapus.')) return;
    try { await API.del('/api/jurnal/' + b.dataset.jdel); toast('Jurnal dihapus'); JEDIT = null; refreshSaldo(); pageJurnal(); }
    catch (e) { toast(e.message, 'error'); }
  });

  if (JEDIT) {
    const j = JLIST.find(x => x.id === JEDIT);
    if (j) jurnalIsiForm(j); else JEDIT = null;
  }
}

function jurnalIsiForm(j) {
  JCUR = JSANTRI.find(s => s.id === j.santri_id) || null;
  $('#j-tgl').value = j.tanggal;
  $('#j-bkm').value = j.no_bkm;
  $('#j-nama').value = j.nama;
  $('#j-kelas').value = j.kelas || '-';
  $('#j-jenis').value = j.jenis_transaksi;
  jurnalTagihanSelect(JCUR, j.tagihan_jenis || '');
  if (!JCUR && j.tagihan_jenis) { /* mode manual: biarkan */ }
  $('#j-nom').value = j.nominal;
  $('#j-entry').textContent = '💾 Update';
  $('#j-batal').hidden = false;
  $('#j-form-title').textContent = '✏️ Edit Jurnal — ' + j.no_bkm;
  $('#j-hint').innerHTML = `Mengedit <strong>${esc(j.no_bkm)}</strong> — perubahan langsung disinkronkan ke kas.`;
  const card = $('#content .card');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function jurnalMuatEdit(id) {
  const j = JLIST.find(x => x.id === id);
  if (!j) return;
  JEDIT = id;
  jurnalIsiForm(j);
}

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
   DATA SANTRI (kolom tagihan lengkap)
   ========================================================= */
const BLN3 = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const KD = (() => {
  const spp = [], infaq = [], laundry = [];
  BLN.forEach((b, i) => {
    const s = String(i + 1).padStart(2, '0');
    spp.push({ key: 'spp_' + s, nama: 'SPP ' + b, singkat: BLN3[i], grup: 'spp' });
    infaq.push({ key: 'infaq_' + s, nama: 'Infaq Wajib ' + b, singkat: BLN3[i], grup: 'infaq' });
    laundry.push({ key: 'laundry_' + s, nama: 'Laundry Wajib ' + b, singkat: BLN3[i], grup: 'laundry' });
  });
  const lain = [
    ['administrasi_awal', 'Administrasi Awal'], ['wakaf', 'Wakaf'], ['daftar_ulang', 'Daftar Ulang'],
    ['tunggakan_spp', 'Tunggakan SPP'], ['tunggakan_infaq', 'Tunggakan Infaq Wajib'],
    ['tunggakan_laundry', 'Tunggakan Laundry Wajib'], ['tunggakan_daftar_ulang', 'Tunggakan Daftar Ulang'],
    ['akhirusanah', 'Akhirusanah'], ['study_tour', 'Study Tour'], ['bimbel', 'Bimbel'], ['rihlah', 'Rihlah']
  ].map(([k, n]) => ({ key: k, nama: n, singkat: n, grup: 'lainnya' }));
  const semua = [...spp, ...infaq, ...laundry, ...lain];
  return { spp, infaq, laundry, lain, semua, set: new Set(semua.map(k => k.key)) };
})();
const fmtNum = (n) => (Number(n) || 0) ? Number(n).toLocaleString('id-ID') : '<span class="muted">·</span>';

function kolomTabelSantri(grup, custom) {
  const c = custom.map(x => ({ key: x.key, nama: x.nama, cus: true }));
  const ident = [
    { key: 'no', nama: 'No', t: 'num' },
    { key: 'nama', nama: 'Nama' },
    { key: 'kelas', nama: 'Kelas' },
    { key: 'no_wa', nama: 'No WA' }
  ];
  const total = [{ key: 'total_tagihan', nama: 'Total Tagihan', t: 'rupiah' }];
  const aksi = [{ key: '_aksi', nama: '' }];
  switch (grup) {
    case 'spp': return [ident[0], ident[1], ...KD.spp, ...aksi];
    case 'infaq': return [ident[0], ident[1], ...KD.infaq, ...aksi];
    case 'laundry': return [ident[0], ident[1], ...KD.laundry, ...aksi];
    case 'lainnya': return [ident[0], ident[1], ...KD.lain, ...c, ...aksi];
    case 'semua': return [...ident, ...KD.spp, ...KD.infaq, ...KD.laundry, ...KD.lain, ...c, ...total, ...aksi];
    default: return [...ident, ...total, ...c, ...aksi];
  }
}
function nilaiSantri(s, key) {
  if (!s) return 0;
  if (KD.set.has(key)) return Number(s[key]) || 0;
  return Number((s.custom || {})[key]) || 0;
}
function allJenisOpsi(santriObj, custom) {
  const cus = (custom || []).map(x => ({ key: x.key, nama: x.nama }));
  return [...KD.semua, ...cus].map(k => ({ key: k.key, nama: k.nama, nilai: nilaiSantri(santriObj, k.key) }));
}

async function pageSantri() {
  const f = Object.assign({ q: '', kelas: 'semua', grup: 'umum' }, STATE.santri);
  STATE.santri = f;
  const [list, custom] = await Promise.all([API.get('/api/santri'), API.get('/api/kolom-custom')]);
  STATE.santriCustom = custom;
  const kelasUnik = [...new Set(list.map(s => s.kelas))].sort((a, b) => a.localeCompare(b));
  const q = f.q.toLowerCase();
  const rows = list.filter(s => {
    if (f.kelas !== 'semua' && s.kelas !== f.kelas) return false;
    if (q && !(String(s.nama).toLowerCase().includes(q) || String(s.no_wa).includes(q) || String(s.nis).toLowerCase().includes(q))) return false;
    return true;
  });
  const totalTagihan = rows.reduce((a, s) => a + (Number(s.total_tagihan) || 0), 0);
  const totalTunggakan = rows.reduce((a, s) => a + nilaiSantri(s, 'tunggakan_spp') + nilaiSantri(s, 'tunggakan_infaq') + nilaiSantri(s, 'tunggakan_laundry') + nilaiSantri(s, 'tunggakan_daftar_ulang'), 0);

  const cols = kolomTabelSantri(f.grup, custom);
  const grupTab = [['umum', 'Umum'], ['spp', 'SPP'], ['infaq', 'Infaq Wajib'], ['laundry', 'Laundry Wajib'], ['lainnya', 'Lainnya'], ['semua', 'Semua']];

  const th = cols.map(c => `<th class="${c.t === 'num' || c.t === 'rupiah' ? 'num' : ''} ${c.key === 'no' || c.key === 'nama' ? 'sticky-col' + (c.key === 'nama' ? '2' : '') : ''}">${esc(c.nama)}</th>`).join('');
  const td = (s, c) => {
    const st = c.key === 'no' ? ' class="num sticky-col"' : c.key === 'nama' ? ' class="sticky-col2"' : '';
    if (c.key === '_aksi') return `<td class="actions"><button class="btn btn-sm" data-edit="${s.id}">Edit</button> <button class="btn btn-sm btn-danger" data-del="${s.id}">Hapus</button></td>`;
    if (c.t === 'num') return `<td${st}>${s.no}</td>`;
    if (c.t === 'rupiah') return `<td class="num">${fmt(s.total_tagihan)}</td>`;
    if (c.cus || KD.set.has(c.key)) return `<td class="num">${fmtNum(nilaiSantri(s, c.key))}</td>`;
    return `<td${st}>${c.key === 'nama' ? `<strong>${esc(s[c.key])}</strong>` : esc(s[c.key] ?? '')}</td>`;
  };
  const sumCols = cols.filter(c => (c.cus || KD.set.has(c.key)) && c.key !== 'no');
  const foot = sumCols.length ? `<tfoot><tr>${cols.map(c => {
    if (c.key === '_aksi') return '<td></td>';
    if (c.key === 'nama') return '<td><strong>Total</strong></td>';
    if (c.key === 'no') return '<td class="num sticky-col"></td>';
    if (!(c.cus || KD.set.has(c.key)) && c.t !== 'rupiah') return '<td></td>';
    const sum = c.t === 'rupiah' ? totalTagihan : rows.reduce((a, s) => a + nilaiSantri(s, c.key), 0);
    return `<td class="num"><strong>${fmt(sum)}</strong></td>`;
  }).join('')}</tr></tfoot>` : '';

  $('#content').innerHTML = `
    <div class="grid grid-4">
      <div class="stat"><div class="stat-ico">👨‍🎓</div><div class="stat-label">Total Santri</div><div class="stat-value">${rows.length}</div><div class="stat-sub">dari ${list.length} terdaftar</div></div>
      <div class="stat saldo"><div class="stat-ico">🧾</div><div class="stat-label">Total Tagihan</div><div class="stat-value" style="font-size:18px">${fmt(totalTagihan)}</div><div class="stat-sub">seluruh kolom tagihan</div></div>
      <div class="stat keluar"><div class="stat-ico">⚠️</div><div class="stat-label">Total Tunggakan</div><div class="stat-value" style="font-size:18px">${fmt(totalTunggakan)}</div><div class="stat-sub">SPP · Infaq · Laundry · Daftar Ulang</div></div>
      <div class="stat iuran"><div class="stat-ico">➕</div><div class="stat-label">Kolom Custom</div><div class="stat-value">${custom.length}</div><div class="stat-sub">kolom tambahan buatan sendiri</div></div>
    </div>

    <div class="filters card card-pad mt">
      <div class="field grow"><label>Cari</label><input id="s-q" value="${esc(f.q)}" placeholder="nama, NIS, no WA…"></div>
      <div class="field"><label>Kelas</label><select id="s-kelas">
        <option value="semua">Semua Kelas</option>
        ${kelasUnik.map(k => `<option value="${esc(k)}" ${f.kelas === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}
      </select></div>
      <button class="btn" id="s-reset">Reset</button>
      <button class="btn" id="s-kolom">⚙️ Kolom Custom</button>
      <button class="btn" id="s-tpl">⬇ Template</button>
      <button class="btn" id="s-csv">⬇ CSV</button>
      <button class="btn btn-gold" id="s-import">📥 Import Excel</button>
      <button class="btn btn-primary" id="s-add">＋ Tambah Santri</button>
    </div>

    <div class="tabs card-pad" style="padding-bottom:0">
      ${grupTab.map(([k, n]) => `<button class="tab ${f.grup === k ? 'on' : ''}" data-grup="${k}">${n}</button>`).join('')}
      <span class="muted" style="margin-left:auto;font-size:12px">${cols.length - 1} kolom ditampilkan • geser ke samping untuk melihat semua</span>
    </div>

    <div class="card">
      <div class="card-head"><h3>Daftar Santri (${rows.length})</h3><span class="muted">Klik Edit untuk ubah tagihan per santri</span></div>
      <div class="table-wrap">
        ${rows.length ? `<table class="tbl-santri">
          <thead><tr>${th}</tr></thead>
          <tbody>${rows.map(s => `<tr>${cols.map(c => td(s, c)).join('')}</tr>`).join('')}</tbody>
          ${foot}
        </table>` : `<div class="empty"><div class="empty-ico">👨‍🎓</div><p>Tidak ada santri ditemukan.</p><button class="btn btn-primary" id="s-add2">Tambah Santri</button></div>`}
      </div>
    </div>`;

  let tId; $('#s-q').oninput = () => { clearTimeout(tId); tId = setTimeout(() => { STATE.santri.q = $('#s-q').value.trim(); pageSantri(); }, 400); };
  $('#s-kelas').onchange = () => { STATE.santri.kelas = $('#s-kelas').value; pageSantri(); };
  $('#s-reset').onclick = () => { STATE.santri = { q: '', kelas: 'semua', grup: STATE.santri.grup }; pageSantri(); };
  $$('.tab[data-grup]').forEach(b => b.onclick = () => { STATE.santri.grup = b.dataset.grup; pageSantri(); });
  $('#s-add').onclick = () => formSantri(null, custom);
  if ($('#s-add2')) $('#s-add2').onclick = () => formSantri(null, custom);
  $$('[data-edit]').forEach(b => b.onclick = () => formSantri(rows.find(x => x.id === b.dataset.edit), custom));
  $$('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Hapus santri ini?')) return;
    try { await API.del('/api/santri/' + b.dataset.del); toast('Santri dihapus'); pageSantri(); }
    catch (e) { toast(e.message, 'error'); }
  });
  $('#s-import').onclick = () => importSantri(custom);
  $('#s-kolom').onclick = () => kelolaKolom(custom);
  $('#s-tpl').onclick = () => unduhTemplateSantri(custom);
  $('#s-csv').onclick = () => exportSantriCsv(rows, custom);
}

function formSantri(s, custom) {
  const b = s || {};
  custom = custom || STATE.santriCustom || [];
  const n = (v) => (Number(v) || 0) !== 0 ? Number(v) : '';
  const blokJudul = (t) => `<div class="form-sec"><h4>${t}</h4></div>`;
  const inp = (k, label) => `<div class="field"><label title="${esc(k.nama)}">${esc(label || k.nama)}</label>
    <input class="sf-num" type="number" data-key="${k.key}" data-cus="${k.cus ? 1 : ''}" value="${n(nilaiSantri(b, k.key))}" min="0" step="1000" placeholder="0"></div>`;

  openModal(b.id ? 'Edit Santri — ' + b.nama : 'Tambah Santri', `
    <div class="form-grid">
      <div class="field full"><label>Nama Lengkap *</label><input id="sf-nama" value="${esc(b.nama || '')}" placeholder="Nama santri"></div>
      <div class="field"><label>Kelas</label><input id="sf-kelas" value="${esc(b.kelas || '')}" placeholder="mis. TMI 2"></div>
      <div class="field"><label>No. WA</label><input id="sf-wa" value="${esc(b.no_wa || '')}" placeholder="08xxxxxxxxxx"></div>
      <div class="field"><label>NIS (opsional)</label><input id="sf-nis" value="${esc(b.nis || '')}" placeholder="otomatis jika kosong"></div>
      <div class="field"><label>Status</label><select id="sf-status">
        <option value="aktif" ${(b.status || 'aktif') === 'aktif' ? 'selected' : ''}>Aktif</option>
        <option value="cuti" ${b.status === 'cuti' ? 'selected' : ''}>Cuti</option>
        <option value="lulus" ${b.status === 'lulus' ? 'selected' : ''}>Lulus</option>
      </select></div>

      ${blokJudul('SPP per Bulan')}
      <div class="grid-num">${KD.spp.map(k => inp(k, k.singkat)).join('')}</div>
      ${blokJudul('Infaq Wajib per Bulan')}
      <div class="grid-num">${KD.infaq.map(k => inp(k, k.singkat)).join('')}</div>
      ${blokJudul('Laundry Wajib per Bulan')}
      <div class="grid-num">${KD.laundry.map(k => inp(k, k.singkat)).join('')}</div>
      ${blokJudul('Tagihan Lainnya')}
      <div class="grid-num n3">${KD.lain.map(k => inp(k)).join('')}</div>
      ${custom.length ? blokJudul('Kolom Custom') + `<div class="grid-num n3">${custom.map(c => inp({ key: c.key, nama: c.nama, cus: true })).join('')}</div>` : ''}
    </div>`,
    `<button class="btn" onclick="closeModal()">Batal</button><button class="btn btn-primary" id="sf-save">💾 Simpan</button>`, 940);

  $('#sf-save').onclick = async () => {
    const payload = {
      nama: $('#sf-nama').value.trim(),
      kelas: $('#sf-kelas').value.trim() || '-',
      no_wa: $('#sf-wa').value.trim(),
      nis: $('#sf-nis').value.trim(),
      status: $('#sf-status').value,
      custom: {}
    };
    if (!payload.nama) return toast('Nama wajib diisi', 'error');
    $$('.sf-num').forEach(i => {
      const v = i.value === '' ? 0 : Number(i.value);
      if (i.dataset.cus) payload.custom[i.dataset.key] = v;
      else payload[i.dataset.key] = v;
    });
    try {
      if (b.id) await API.put('/api/santri/' + b.id, payload);
      else await API.post('/api/santri', payload);
      toast('Data santri tersimpan'); closeModal(); pageSantri();
    } catch (e) { toast(e.message, 'error'); }
  };
}

/* ---------- Import Excel ---------- */
function parseCsvText(text) {
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const delim = (first.split(';').length > first.split(',').length) ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  if (rows.length < 2) return [];
  const head = rows.shift().map(h => String(h).trim());
  return rows.filter(r => r.some(c => String(c).trim() !== '')).map(r => {
    const o = {}; head.forEach((h, i) => { if (h) o[h] = r[i] ?? ''; }); return o;
  });
}

function downloadCsv(filename, rows) {
  const csv = rows.map(r => r.map(c => {
    const s = String(c ?? '');
    return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = filename; a.click();
}

function headerSantri(custom) {
  return ['No', 'Nama', 'Kelas', 'No WA', ...KD.semua.map(k => k.nama), ...(custom || []).map(c => c.nama)];
}
function unduhTemplateSantri(custom) {
  downloadCsv('template-import-santri.csv', [headerSantri(custom)]);
}
function exportSantriCsv(rows, custom) {
  const head = headerSantri(custom);
  const body = rows.map(s => [
    s.no, s.nama, s.kelas, s.no_wa,
    ...KD.semua.map(k => nilaiSantri(s, k.key)),
    ...(custom || []).map(c => nilaiSantri(s, c.key))
  ]);
  downloadCsv(`santri-${today()}.csv`, [head, ...body]);
}

function importSantri(custom) {
  custom = custom || STATE.santriCustom || [];
  let parsed = [];
  openModal('📥 Import Data Santri dari Excel', `
    <p class="hint">Judul kolom baris pertama harus cocok (boleh potongan): <em>Nama, Kelas, No WA, SPP Januari, Infaq Wajib Januari, Laundry Wajib Januari, Administrasi Awal, Wakaf, Daftar Ulang, Bimbel…</em>. Kolom yang tidak dikenal otomatis jadi kolom baru.</p>
    <div class="flex wrap-actions" style="margin-top:12px">
      <button class="btn" id="im-tpl">⬇ Template CSV</button>
      <label class="btn btn-primary" style="cursor:pointer">📥 Pilih File (.xlsx / .csv)<input type="file" id="im-file" accept=".xlsx,.xls,.csv" hidden></label>
    </div>
    <label class="flex" style="margin-top:14px;gap:8px;cursor:pointer">
      <input type="checkbox" id="im-ovr" checked> Perbarui santri yang namanya sudah ada
    </label>
    <div id="im-prev" class="mt"></div>`,
    `<button class="btn" onclick="closeModal()">Tutup</button><button class="btn btn-gold" id="im-go" disabled>📥 Import Sekarang</button>`, 760);

  $('#im-tpl').onclick = () => unduhTemplateSantri(custom);
  $('#im-file').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      let rows;
      if (/\.csv$/i.test(file.name)) {
        rows = parseCsvText(await file.text());
      } else {
        if (typeof XLSX === 'undefined') throw new Error('Library Excel belum termuat (butuh internet). Simpan file sebagai CSV lalu import ulang.');
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      }
      parsed = rows.filter(r => r && Object.values(r).some(v => String(v ?? '').trim() !== ''));
      $('#im-go').disabled = !parsed.length;
      if (!parsed.length) { $('#im-prev').innerHTML = '<p class="muted">Tidak ada baris terbaca.</p>'; return; }
      const heads = Object.keys(parsed[0]);
      $('#im-prev').innerHTML = `
        <div class="card card-pad" style="box-shadow:none;background:var(--green-50);border-color:var(--green-100)">
          <strong>${parsed.length} baris terbaca</strong> — ${heads.length} kolom: ${heads.slice(0, 12).map(h => `<span class="badge lunas" style="margin:2px">${esc(h)}</span>`).join('')}${heads.length > 12 ? '…' : ''}
        </div>
        <div class="table-wrap mt" style="margin-top:12px;max-height:220px;overflow:auto">
          <table><thead><tr>${heads.slice(0, 8).map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${parsed.slice(0, 5).map(r => `<tr>${heads.slice(0, 8).map(h => `<td>${esc(String(r[h] ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody></table>
        </div>`;
    } catch (err) { toast(err.message, 'error'); }
    e.target.value = '';
  };
  $('#im-go').onclick = async () => {
    if (!parsed.length) return;
    try {
      const r = await API.post('/api/santri?act=import', { rows: parsed, overwrite: $('#im-ovr').checked });
      toast(r.pesan); closeModal(); pageSantri();
    } catch (e) { toast(e.message, 'error'); }
  };
}

/* ---------- Kolom Custom ---------- */
async function kelolaKolom(custom) {
  const render = (list) => {
    $('#kc-list').innerHTML = list.length ? `<table><tbody>${list.map(c => `
      <tr><td><strong>${esc(c.nama)}</strong><br><small class="muted">${esc(c.key)}</small></td>
      <td class="actions"><button class="btn btn-sm btn-danger" data-delc="${c.key}">Hapus</button></td></tr>`).join('')}</tbody></table>`
      : `<p class="muted" style="font-size:12.5px">Belum ada kolom custom. Tambahkan kolom tagihan sesuai kebutuhan (mis. Seragam, Makan, Kegiatan…).</p>`;
    $$('[data-delc]').forEach(b => b.onclick = async () => {
      if (!confirm('Hapus kolom ini? Nilai pada semua santri ikut terhapus.')) return;
      try { await API.del('/api/kolom-custom/' + b.dataset.delc); toast('Kolom dihapus'); render(await API.get('/api/kolom-custom')); }
      catch (e) { toast(e.message, 'error'); }
    });
  };
  openModal('⚙️ Kelola Kolom Custom', `
    <div id="kc-list"></div>
    <div class="form-grid mt" style="margin-top:16px">
      <div class="field full"><label>Nama kolom baru</label><input id="kc-nama" placeholder="mis. Seragam / Kegiatan / Perpustakaan"></div>
    </div>`,
    `<button class="btn" onclick="closeModal()">Tutup</button><button class="btn btn-primary" id="kc-add">＋ Tambah Kolom</button>`, 560);
  render(custom);
  $('#kc-add').onclick = async () => {
    const nama = $('#kc-nama').value.trim();
    if (!nama) return toast('Nama kolom wajib diisi', 'error');
    try {
      await API.post('/api/kolom-custom', { nama });
      $('#kc-nama').value = ''; toast('Kolom ditambahkan');
      const list = await API.get('/api/kolom-custom');
      render(list); STATE.santriCustom = list;
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
