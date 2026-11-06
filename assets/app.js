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
  } else if (seg[0] === 'tagihan' && ['generate', 'hapus'].includes(seg[1])) {
    params.set('act', seg[1]);
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
/* Angka kwitansi: 1.600.000,00 (dua desimal, tanpa simbol Rp) */
const angkaKw = (n) => (Number(n) || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/* Tanggal panjang utk footer kwitansi — "6 November 2026" */
const tglPanjang = (d) => { const [y, m, dd] = String(d || '').split('-'); return `${+dd || ''} ${BLN[+m - 1] || ''} ${y}`.trim(); };
/* Nama pesantren dipecah 2 baris utk kop: "Pondok Pesantren" / "Ash-Shiddiq" */
function namaSplit(nama) {
  const s = String(nama || '').trim();
  const i = s.lastIndexOf(' ');
  if (i <= 0) return ['', s];
  return [s.slice(0, i), s.slice(i + 1)];
}

/* Terbilang nominal utk kwitansi */
const TERBI = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
function terbilang(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n < 12) return TERBI[n];
  if (n < 20) return TERBI[n - 10] + ' belas';
  if (n < 100) { const a = terbilang(Math.floor(n / 10)), b = n % 10; return (a ? a + ' puluh' : '') + (b ? ' ' + terbilang(b) : ''); }
  if (n < 200) return n === 100 ? 'seratus' : 'seratus ' + terbilang(n - 100);
  if (n < 1000) { const a = terbilang(Math.floor(n / 100)), b = n % 100; return (a ? a + ' ratus' : '') + (b ? ' ' + terbilang(b) : ''); }
  if (n < 2000) return n === 1000 ? 'seribu' : 'seribu ' + terbilang(n - 1000);
  const skala = [[1e12, 'triliun'], [1e9, 'miliar'], [1e6, 'juta'], [1e3, 'ribu']];
  for (const [v, s] of skala) {
    if (n >= v) {
      const a = terbilang(Math.floor(n / v)), b = n % v;
      return (a ? a + ' ' + s : '') + (b ? (a ? ' ' : '') + terbilang(b) : '');
    }
  }
  return '';
}
function terbilangRapi(n) {
  const s = terbilang(n).replace(/\s+/g, ' ').trim();
  return (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Nol') + ' rupiah';
}

let STATE = { page: 'dashboard', iuran: {}, santri: { grup: 'umum' }, jurnal: {}, rekap: {}, mutasi: {}, kwitansi: {}, saldoAkun: {} };

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
function closeModal() { $('#modalBackdrop').hidden = true; $('#modalBody').innerHTML = ''; document.body.classList.remove('print-modal'); }

$('#modalClose').onclick = closeModal;
$('#modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

/* ---------------- Router ---------------- */
const ROUTES = { dashboard: pageDashboard, jurnal: pageJurnal, iuran: pageIuran, santri: pageSantri, rekap: pageRekap, laporan: pageLaporan, pengaturan: pagePengaturan, kwitansi: pageKwitansi, 'saldo-akun': pageSaldoAkun, 'mutasi-us': () => pageMutasi('us'), 'mutasi-tab': () => pageMutasi('tab'), 'mutasi-lain': () => pageMutasi('lain') };
const TITLES = {
  dashboard: ['Dashboard', 'Ringkasan keuangan pesantren'],
  jurnal: ['Jurnal Kas', 'Entry kas masuk (BKM) — multi tagihan santri & nama manual — serta kas keluar (BKK)'],
  iuran: ['Iuran Santri', 'Tagihan, pembayaran & tunggakan — halaman tanpa menu: lewat Generate (Jurnal Kas) atau Lihat Tunggakan (Dashboard)'],
  santri: ['Data Santri', 'Kolom tagihan SPP, Infaq, Laundry & lainnya'],
  rekap: ['Rekap Pembayaran', 'Per santri — hijau = sudah dibayar, merah = tagihan belum bayar (muncul di Jurnal Kas)'],
  laporan: ['Laporan Keuangan', 'Rekap & cetak laporan periode'],
  'saldo-akun': ['Saldo Akun Pemasukan', 'Saldo awal, masuk, keluar & saldo akhir tiap akun pemasukan'],
  pengaturan: ['Pengaturan', 'Profil pesantren, backup & data'],
  kwitansi: ['Kwitansi Penerimaan', 'Pratinjau & cetak kwitansi per nomor BKM — kirim via WhatsApp (antre bot WA)'],
  'mutasi-us': ['Mutasi Uang Saku', 'Setoran & pembagian uang saku santri — saldo berjalan per akun'],
  'mutasi-tab': ['Mutasi Tabungan', 'Setoran & penarikan tabungan santri — saldo berjalan per akun'],
  'mutasi-lain': ['Mutasi Tagihan Lain-lain', 'Penerimaan & pengeluaran tagihan lain-lain — saldo berjalan per akun']
};

function navigate() {
  if (window.__waPoll) { clearInterval(window.__waPoll); window.__waPoll = null; }
  const hash = (location.hash.replace('#/', '') || 'dashboard').split('?')[0];
  const page = ROUTES[hash] ? hash : 'dashboard';
  if (STATE.page && STATE.page !== page) STATE.prevPage = STATE.page;
  STATE.page = page;
  $$('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  $('#pageTitle').textContent = TITLES[page][0];
  $('#pageSub').textContent = TITLES[page][1];
  $('#sidebar').classList.remove('open');
  ROUTES[page]();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', navigate);

/* Halaman Iuran Santri tanpa menu sidebar — buka dari tombol Generate (Jurnal Kas) */
function bukaGenerate() {
  if (STATE.page === 'iuran') { formGenerate(); return; }
  location.hash = '#/iuran';
  setTimeout(() => { try { formGenerate(); } catch (e) {} }, 350);
}

$('#btnMenu').onclick = () => $('#sidebar').classList.toggle('open');
$('#btnTambahCepat').onclick = () => {
  STATE.jurnal.arah = 'masuk';
  if ((location.hash.split('?')[0] || '') === '#/jurnal') pageJurnal();
  else location.hash = '#/jurnal';
};

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

/* ---------------- Ekspor CSV (dipakai Jurnal Kas & Laporan) ---------------- */
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

window.closeModal = closeModal;

/* =========================================================
   JURNAL KAS — MASUK (BKM) & KELUAR (BKK)
   ========================================================= */
let JLIST = [], JSANTRI = [], JCUSTOM = [], JCUR = null, JEDIT = null, JAKUN = { pemasukan: [], pengeluaran: [] }, JTAGIHAN = [], JNANTI = [], JPILIH = new Set(), JLUNAS = 0, JEMPTY = '', JNOM_AUTO = false;
/* bukti jurnal: foto transfer (kas masuk), foto nota & tanda tangan penerima (kas keluar) */
let JB64 = { transfer: '', nota: '', ttd: '' };
let JHAPUS = { transfer: false, nota: false, ttd: false };

function akunDariTagihanJS(key, custom) {
  if (!key) return '';
  const m = String(key).match(/^(spp|infaq|laundry)_\d{2}$/);
  if (m) return { spp: 'SPP', infaq: 'Infaq Wajib', laundry: 'Laundry Wajib' }[m[1]];
  const map = {
    administrasi_awal: 'Administrasi', wakaf: 'Wakaf', daftar_ulang: 'Daftar Ulang',
    tunggakan_spp: 'Tunggakan SPP', tunggakan_infaq: 'Tunggakan Infaq Wajib',
    tunggakan_laundry: 'Tunggakan Laundry Wajib', tunggakan_daftar_ulang: 'Tunggakan Daftar Ulang',
    akhirusanah: 'Akhirussanah', study_tour: 'Study Tour', bimbel: 'Bimbel', rihlah: 'Rihlah'
  };
  if (map[key]) return map[key];
  let nama = key;
  (custom || []).forEach(c => { if (c.key === key) nama = c.nama; });
  return (JAKUN.pemasukan || []).find(a => String(a).toLowerCase() === String(nama).toLowerCase()) || '';
}

function jurnalAkunSelect(arah, value) {
  const sel = $('#j-akun'); if (!sel) return;
  const list = arah === 'keluar' ? (JAKUN.pengeluaran || []) : (JAKUN.pemasukan || []);
  sel.innerHTML = '<option value="">— Pilih akun —</option>' +
    list.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
  if (value) sel.value = value;
}

function jurnalSumberSelect(value) {
  const sel = $('#j-sumber'); if (!sel) return;
  sel.innerHTML = '<option value="">— Pilih sumber dana —</option>' +
    (JAKUN.pemasukan || []).map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
  if (value) sel.value = value;
}

/** Pasang preset akun kas khusus (Uang Saku / Tabungan / Tagihan Lain) di form Jurnal Kas */
function jurnalPasangPreset(arah) {
  const kode = STATE.jurnal.preset || '';
  const cfg = MUTASI_CFG[kode];
  $$('#j-preset-row .chip').forEach(c => c.classList.toggle('on', (c.dataset.preset || '') === kode));
  const note = $('#j-preset-note');

  /* kas khusus bukan iuran — pilihan Jenis Tagihan & kotak tagihan disembunyikan;
     kas keluar khusus justru MENAMPILKAN field nama santri */
  const fJenis = $('#j-f-jenis-tagihan');
  const box    = $('#j-tagihan-box');
  const fNamaK = $('#j-f-nama-k');
  if (fNamaK) fNamaK.hidden = !cfg;
  if (arah === 'masuk') {
    if (fJenis) fJenis.hidden = !!cfg;
    if (cfg && box) box.hidden = true;
    const selJ = $('#j-tagihan');
    if (cfg && selJ) { selJ.innerHTML = '<option value="">— Tanpa tagihan —</option>'; selJ.value = ''; }
  }

  if (!cfg) { if (note) note.textContent = ''; return; }
  if (arah === 'keluar') {
    const a = $('#j-akun'), s = $('#j-sumber');
    if (a) a.value = cfg.akunKeluar;
    if (s) s.value = cfg.akun;
    if (note) note.textContent = `Akun keluar "${cfg.akunKeluar}" ← sumber "${cfg.akun}"`;
  } else {
    const a = $('#j-akun');
    if (a) a.value = cfg.akun;
    if (note) note.textContent = `Akun pemasukan "${cfg.akun}"`;
  }
}
function jurnalHapusPreset() {
  if (!STATE.jurnal.preset) return;
  STATE.jurnal.preset = '';
  $$('#j-preset-row .chip').forEach(c => c.classList.toggle('on', c.dataset.preset === ''));
  const note = $('#j-preset-note');
  if (note) note.textContent = '';
}

/** Isi nominal otomatis dari tagihan — tidak pernah menimpa nominal yang diketik user,
    tidak dipakai saat preset kas khusus (uang saku/tabungan/tagihan lain) & saat nominal terkunci (multi-centang) */
function isiNomOtomatis(v) {
  const el = $('#j-nom'); if (!el) return;
  if (STATE.jurnal.preset || el.readOnly) return;
  if (v === '') { if (JNOM_AUTO) { el.value = ''; JNOM_AUTO = false; } return; }
  if (!JNOM_AUTO && el.value !== '') return;
  el.value = v;
  JNOM_AUTO = true;
}

function jurnalTagihanSelect(s, pilihKey) {
  const sel = $('#j-tagihan'); if (!sel) return;
  if (!s) { sel.innerHTML = '<option value="">— Tanpa tagihan —</option>'; return; }
  const ops = allJenisOpsi(s, JCUSTOM);
  sel.innerHTML = '<option value="">— Tanpa tagihan —</option>' +
    ops.map(o => `<option value="${esc(o.key)}">${esc(o.nama)} — ${fmt(o.nilai)}</option>`).join('');
  if (pilihKey) sel.value = pilihKey;
}

/* =========================================================
   BUKTI JURNAL — foto transfer (kas masuk), foto nota &
   tanda tangan penerima via canvas (kas keluar)
   ========================================================= */
function buktiReset() {
  JB64   = { transfer: '', nota: '', ttd: '' };
  JHAPUS = { transfer: false, nota: false, ttd: false };
}
function buktiPreview(prevId, delId, src) {
  const p = $('#' + prevId), d = $('#' + delId);
  if (!p) return;
  if (src) { p.src = src; p.hidden = false; } else { p.removeAttribute('src'); p.hidden = true; }
  if (d) d.hidden = !src;
}
function buktiPasangFile(pickId, fileId, prevId, delId, key) {
  const pick = $('#' + pickId), file = $('#' + fileId);
  if (!pick || !file) return;
  pick.onclick = () => file.click();
  file.onchange = () => {
    const f = file.files[0]; if (!f) return;
    if (!/^image\//.test(f.type)) return toast('File harus berupa gambar', 'error');
    if (f.size > 3 * 1024 * 1024) return toast('Ukuran gambar maksimal 3 MB', 'error');
    const fr = new FileReader();
    fr.onload = () => { JB64[key] = fr.result; JHAPUS[key] = false; buktiPreview(prevId, delId, fr.result); };
    fr.onerror = () => toast('Gagal membaca file', 'error');
    fr.readAsDataURL(f);
    file.value = '';
  };
  const del = $('#' + delId);
  if (del) del.onclick = () => { JB64[key] = ''; JHAPUS[key] = true; buktiPreview(prevId, delId, ''); };
}
/** Lampirkan bukti baru / minta hapus bukti lama ke payload entry-edit */
function buktiKePayload(payload, key, fieldBaru, fieldHapus) {
  if (JB64[key]) { payload[fieldBaru] = JB64[key]; }
  else if (JEDIT && JHAPUS[key]) { payload[fieldHapus] = true; }
  return payload;
}
/** Tampilkan kotak foto transfer hanya utk jenis bank (atau bila foto sudah ada) */
function buktiTampilTransfer() {
  const box = $('#j-bukti-transfer'), sel = $('#j-jenis'), prev = $('#j-bt-prev');
  if (!box || !sel) return;
  const adaFoto = !!(prev && prev.hasAttribute('src'));
  box.hidden = sel.value === 'Cas' && !adaFoto;
}

/** Modal tanda tangan penerima — digambar langsung di canvas (mouse / jari) */
function modalTandaTangan(onPakai) {
  openModal('✍️ Tanda Tangan Penerima', `
    <p class="hint" style="margin-bottom:10px">Gambar tanda tangan di kotak putih menggunakan mouse atau jari (layar sentuh).</p>
    <div class="tt-box"><canvas id="tt-cv"></canvas></div>
    <p class="hint muted" style="margin-top:8px">Tanda tangan ini dicetak pada kwitansi BKK bila tidak ada foto nota.</p>`,
    `<button class="btn" id="tt-clear">🧽 Bersihkan</button>
     <button class="btn" onclick="closeModal()">Batal</button>
     <button class="btn btn-primary" id="tt-ok">✔ Pakai Tanda Tangan</button>`, 620);

  const cv = $('#tt-cv');
  const W = 560, H = 190, dpr = window.devicePixelRatio || 1;
  cv.width = W * dpr; cv.height = H * dpr;
  cv.style.width = '100%'; cv.style.height = 'auto'; cv.style.touchAction = 'none';
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#0f172a';

  let gambar = false, last = null;
  const posisi = (e) => {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  };
  cv.addEventListener('pointerdown', (e) => { gambar = true; last = posisi(e); cv.setPointerCapture(e.pointerId); e.preventDefault(); });
  cv.addEventListener('pointermove', (e) => {
    if (!gambar) return;
    const p = posisi(e);
    g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke();
    last = p; e.preventDefault();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => cv.addEventListener(ev, () => { gambar = false; }));

  $('#tt-clear').onclick = () => g.clearRect(0, 0, W, H);
  $('#tt-ok').onclick = () => {
    const url = cv.toDataURL('image/png');
    closeModal();
    onPakai(url);
    toast('Tanda tangan siap dipakai di kwitansi BKK');
  };
}

async function pageJurnal() {
  const f = Object.assign({ dari: '', sampai: '', q: '', jenis_transaksi: 'semua', tanggal: '', arah: 'masuk' }, STATE.jurnal);
  f.arah = f.arah === 'keluar' ? 'keluar' : 'masuk';
  STATE.jurnal = f;
  const masuk = f.arah === 'masuk';
  buktiReset();   // state foto transfer / nota / tanda tangan form baru
  const qs = new URLSearchParams();
  if (f.dari) qs.set('dari', f.dari);
  if (f.sampai) qs.set('sampai', f.sampai);
  if (f.q) qs.set('q', f.q);
  if (f.jenis_transaksi && f.jenis_transaksi !== 'semua') qs.set('jenis_transaksi', f.jenis_transaksi);
  qs.set('arah', f.arah);

  const thn = String(f.tanggal || today()).slice(0, 4) || String(new Date().getFullYear());
  const [list, santri, custom, next, akun, lapTahun] = await Promise.all([
    API.get('/api/jurnal' + (qs.toString() ? '?' + qs : '')),
    API.get('/api/santri'),
    API.get('/api/kolom-custom'),
    API.get('/api/jurnal?act=next&arah=' + f.arah),
    API.get('/api/akun'),
    /* total kas masuk tahun berjalan — utk kartu BKM Tahun Ini */
    masuk ? API.get('/api/laporan?dari=' + thn + '-01-01&sampai=' + thn + '-12-31').catch(() => null) : Promise.resolve(null)
  ]);
  JLIST = list; JSANTRI = santri; JCUSTOM = custom; JAKUN = akun;

  const per = { Cas: 0, BRI: 0, BSI: 0, BPD: 0 };
  list.forEach(j => { per[j.jenis_transaksi] = (per[j.jenis_transaksi] || 0) + (Number(j.nominal) || 0); });
  const total = list.reduce((a, j) => a + (Number(j.nominal) || 0), 0);
  const badgeJenis = (v) => `<span class="badge ${v === 'Cas' ? 'cash' : 'bank'}">${esc(v)}</span>`;
  const noVch = masuk ? (next.no_bkm || '') : (next.no_bkk || '');

  $('#content').innerHTML = `
    <div class="grid grid-4">
      ${masuk ? `
      <div class="stat saldo"><div class="stat-ico">💰</div><div class="stat-label">Total Pemasukan</div><div class="stat-value" style="font-size:19px">${fmt(total)}</div><div class="stat-sub">${list.length} entry jurnal</div></div>
      <div class="stat"><div class="stat-ico">💵</div><div class="stat-label">Cas</div><div class="stat-value" style="font-size:19px">${fmt(per.Cas)}</div></div>
      <div class="stat"><div class="stat-ico">🏦</div><div class="stat-label">Transfer Bank</div><div class="stat-value" style="font-size:19px">${fmt(per.BRI + per.BSI + per.BPD)}</div><div class="stat-sub">BRI ${fmt(per.BRI)} · BSI ${fmt(per.BSI)} · BPD ${fmt(per.BPD)}</div></div>
      <div class="stat iuran"><div class="stat-ico">📒</div><div class="stat-label">BKM Tahun Ini</div><div class="stat-value">${(next.no_bkm || '').split('/').pop()}</div><div class="stat-sub">nomor berikutnya: ${esc(next.no_bkm || '-')}<br>jumlah kas masuk: <strong class="pos">${lapTahun && lapTahun.ringkas ? fmt(lapTahun.ringkas.masuk) : '-'}</strong></div></div>`
      : `
      <div class="stat saldo"><div class="stat-ico">💸</div><div class="stat-label">Total Pengeluaran</div><div class="stat-value" style="font-size:19px">${fmt(total)}</div><div class="stat-sub">${list.length} entry jurnal</div></div>
      <div class="stat"><div class="stat-ico">💵</div><div class="stat-label">Cas</div><div class="stat-value" style="font-size:19px">${fmt(per.Cas)}</div></div>
      <div class="stat"><div class="stat-ico">🏦</div><div class="stat-label">Transfer Bank</div><div class="stat-value" style="font-size:19px">${fmt(per.BRI + per.BSI + per.BPD)}</div><div class="stat-sub">BRI ${fmt(per.BRI)} · BSI ${fmt(per.BSI)} · BPD ${fmt(per.BPD)}</div></div>
      <div class="stat iuran"><div class="stat-ico">📒</div><div class="stat-label">BKK Tahun Ini</div><div class="stat-value">${(next.no_bkk || '').split('/').pop()}</div><div class="stat-sub">nomor berikutnya: ${esc(next.no_bkk || '-')}</div></div>`}
    </div>

    <div class="card mt">
      <div class="tabs" style="border:none;border-bottom:1px solid var(--border);padding-bottom:12px">
        <button class="tab ${masuk ? 'on' : ''}" data-arah="masuk">⬆ Kas Masuk (BKM)</button>
        <button class="tab ${!masuk ? 'on' : ''}" data-arah="keluar">⬇ Kas Keluar (BKK)</button>
      </div>
      <div class="preset-row" id="j-preset-row">
        <span class="muted">Kas khusus:</span>
        <button type="button" class="chip" data-preset="us">🪙 Uang Saku</button>
        <button type="button" class="chip" data-preset="tab">🏦 Tabungan</button>
        <button type="button" class="chip" data-preset="lain">📄 Tagihan Lain</button>
        <button type="button" class="chip" data-preset="">✕ Tanpa preset</button>
        <span class="muted" style="font-size:12px" id="j-preset-note"></span>
      </div>
      <div class="card-head"><h3 id="j-form-title">${masuk ? '✏️ Entry Kas Masuk' : '✏️ Entry Kas Keluar'}</h3><span class="muted">${masuk ? 'Centang tagihan santri yang belum terbayar (boleh lebih dari satu) — atau isi manual untuk nama di luar data santri' : 'Pilih akun pengeluaran + sumber dananya — nomor BKK otomatis'}</span></div>
      <div class="card-pad">
        ${masuk ? `
        <div class="entry-grid">
          <div class="field"><label>Tanggal</label><input type="date" id="j-tgl" value="${f.tanggal || today()}"></div>
          <div class="field"><label>No BKM</label><input id="j-bkm" value="${esc(next.no_bkm || '')}" placeholder="otomatis"></div>
          <div class="field grow"><label>Nama Santri / Manual</label>
            <input id="j-nama" list="dl-santri" placeholder="pilih dari data santri… atau ketik nama lain (donatur, dst)" autocomplete="off">
            <datalist id="dl-santri">${santri.map(s => `<option value="${esc(s.nama)}">${esc(s.kelas)}</option>`).join('')}</datalist>
          </div>
          <div class="field"><label>Kelas</label><input id="j-kelas" placeholder="-"></div>
        </div>
        <div class="tagihan-box" id="j-tagihan-box" hidden>
          <div class="tagihan-head">
            <strong id="j-tagihan-title">📋 Tagihan Belum Terbayar</strong>
            <span class="tagihan-tools">
              <label class="tagihan-all"><input type="checkbox" id="j-pilih-semua"> Pilih semua</label>
              <span class="tagihan-total" id="j-tagihan-total"></span>
              <button class="btn btn-sm btn-gold" id="j-generate" title="Kelola & buat tagihan iuran">⚙️ Generate</button>
            </span>
          </div>
          <div class="tagihan-list" id="j-tagihan-list"></div>
        </div>
        <div class="entry-grid" style="margin-top:13px">
          <div class="field" id="j-f-jenis-tagihan"><label>Jenis Tagihan</label><select id="j-tagihan"><option value="">— Tanpa tagihan —</option></select></div>
          <div class="field"><label>Akun Pemasukan</label><select id="j-akun"><option value="">— Pilih akun —</option></select></div>
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
        <div class="bukti-box" id="j-bukti-transfer" hidden>
          <div class="bukti-head"><strong>📷 Foto Bukti Transfer</strong><span class="hint">tampil di kwitansi BKM — pratinjau, cetak & PNG</span></div>
          <div class="upload-row">
            <img class="up-prev" id="j-bt-prev" hidden alt="bukti transfer">
            <input type="file" id="j-bt-file" accept="image/*" hidden>
            <button type="button" class="btn btn-sm" id="j-bt-pick">📁 Pilih foto transfer</button>
            <button type="button" class="btn btn-sm btn-danger" id="j-bt-del" hidden>✕ Hapus foto</button>
          </div>
          <span class="hint muted">Otomatis dimunculkan untuk transfer bank (BRI / BSI / BPD) — bukti transfer ikut tercetak pada kwitansi.</span>
        </div>
        <p class="hint muted" id="j-hint" style="margin-top:10px">Pilih nama santri untuk munculkan daftar tagihan yang belum terbayar — atau langsung isi nominal & akun untuk kas masuk manual.</p>`
        : `
        <div class="entry-grid">
          <div class="field"><label>Tanggal</label><input type="date" id="j-tgl" value="${f.tanggal || today()}"></div>
          <div class="field"><label>No BKK</label><input id="j-bkk" value="${esc(next.no_bkk || '')}" placeholder="otomatis"></div>
          <div class="field grow" id="j-f-nama-k" hidden><label>Nama Santri</label>
            <input id="j-nama" list="dl-santri-k" placeholder="pilih nama santri dari data…" autocomplete="off">
            <datalist id="dl-santri-k">${santri.map(s => `<option value="${esc(s.nama)}">${esc(s.kelas)}</option>`).join('')}</datalist>
          </div>
          <div class="field grow"><label>Akun Pengeluaran</label><select id="j-akun"><option value="">— Pilih akun pengeluaran —</option></select></div>
          <div class="field grow"><label>Kas Keluar dari Akun Pemasukan</label><select id="j-sumber"><option value="">— Pilih sumber dana —</option></select></div>
          <div class="field"><label>Jenis Transaksi</label><select id="j-jenis">
            <option>Cas</option><option>BRI</option><option>BSI</option><option>BPD</option>
          </select></div>
          <div class="field"><label>Nominal (Rp)</label><input type="number" id="j-nom" min="1" step="1000" placeholder="0"></div>
          <div class="field grow"><label>Dibayarkan kepada</label><input id="j-dibayar" placeholder="diketik manual — tampil di kwitansi BKK"></div>
          <div class="field grow"><label>Keterangan</label><input id="j-ket" placeholder="mis. Listrik aula November"></div>
          <div class="field field-btn"><label>&nbsp;</label>
            <div class="flex">
              <button class="btn btn-primary" id="j-entry">✔ Entry</button>
              <button class="btn" id="j-batal" hidden>Batal</button>
            </div>
          </div>
        </div>
        <div class="bukti-box" id="j-bukti-keluar">
          <div class="bukti-grid">
            <div class="bukti-col">
              <strong>📷 Foto Nota</strong>
              <div class="upload-row">
                <img class="up-prev" id="j-nt-prev" hidden alt="foto nota">
                <input type="file" id="j-nt-file" accept="image/*" hidden>
                <button type="button" class="btn btn-sm" id="j-nt-pick">📁 Pilih foto nota</button>
                <button type="button" class="btn btn-sm btn-danger" id="j-nt-del" hidden>✕ Hapus</button>
              </div>
              <span class="hint muted">Nota / str pembayaran — dicetak pada kwitansi BKK.</span>
            </div>
            <div class="bukti-col">
              <strong>✍️ Tanda Tangan Penerima <span class="muted">(bila tanpa nota)</span></strong>
              <div class="upload-row">
                <img class="up-prev ttd" id="j-ttd-prev" hidden alt="tanda tangan penerima">
                <button type="button" class="btn btn-sm" id="j-ttd-open">✍️ Buat Tanda Tangan</button>
                <button type="button" class="btn btn-sm btn-danger" id="j-ttd-del" hidden>✕ Hapus</button>
              </div>
              <span class="hint muted">Ditandatangani langsung di layar (canvas) — tampil pada kolom penerima kwitansi BKK.</span>
            </div>
          </div>
        </div>
        <p class="hint muted" id="j-hint" style="margin-top:10px">Kas keluar dicatat ke rekening sesuai <strong>sumber dana</strong> yang dipilih — kas & laporan ikut menyesuaikan.</p>`}
      </div>
    </div>

    <div class="filters card card-pad mt">
      <div class="field grow"><label>Cari</label><input id="j-q" value="${esc(f.q)}" placeholder="nama, No BKM/BKK, akun, atau keterangan…"></div>
      <div class="field"><label>Dari</label><input type="date" id="j-dari" value="${f.dari}"></div>
      <div class="field"><label>Sampai</label><input type="date" id="j-sampai" value="${f.sampai}"></div>
      <div class="field"><label>Jenis Transaksi</label><select id="j-fjenis">
        <option value="semua">Semua</option>
        ${['Cas', 'BRI', 'BSI', 'BPD'].map(v => `<option ${f.jenis_transaksi === v ? 'selected' : ''}>${v}</option>`).join('')}
      </select></div>
      <button class="btn" id="j-reset">Reset</button>
      <button class="btn btn-gold" id="j-ke-iuran2">⚙️ Generate Tagihan</button>
      <button class="btn" id="j-ke-kwitansi">🧾 Kwitansi</button>
      <button class="btn" onclick="window.print()">🖨️ Cetak</button>
    </div>

    <div class="card">
      <div class="card-head"><h3>${masuk ? 'Jurnal Pemasukan' : 'Jurnal Pengeluaran'} (${list.length})</h3><span class="muted">Edit / hapus lewat kolom aksi — kas otomatis menyesuaikan</span></div>
      <div class="table-wrap">
        ${list.length ? `<table>
          <thead><tr>${masuk
            ? `<th>Tanggal</th><th>No BKM</th><th>Nama</th><th>Kelas</th><th>Jenis Tagihan</th><th>Akun</th><th>Jenis Transaksi</th><th class="num">Nominal</th><th></th>`
            : `<th>Tanggal</th><th>No BKK</th><th>Akun Pengeluaran</th><th>Sumber Dana</th><th>Keterangan</th><th>Jenis Transaksi</th><th class="num">Nominal</th><th></th>`}</tr></thead>
          <tbody>${list.map(j => masuk ? `
            <tr>
              <td class="nowrap">${tglLabel(j.tanggal)}</td>
              <td class="nowrap"><strong>${esc(j.no_bkm)}</strong></td>
              <td>${esc(j.nama)}</td>
              <td>${esc(j.kelas || '-')}</td>
              <td>${j.label_tagihan ? esc(j.label_tagihan) : '<span class="muted">Tanpa tagihan</span>'}</td>
              <td>${j.akun ? esc(j.akun) : '<span class="muted">—</span>'}</td>
              <td>${badgeJenis(j.jenis_transaksi)}${j.bukti_transfer ? ' <span class="bukti-mark" title="Ada foto bukti transfer">📷</span>' : ''}</td>
              <td class="num pos">${fmt(j.nominal)}</td>
              <td class="actions">
                <button class="btn btn-sm" data-jedit="${j.id}">Edit</button>
                <button class="btn btn-sm btn-danger" data-jdel="${j.id}">Hapus</button>
              </td>
            </tr>` : `
            <tr>
              <td class="nowrap">${tglLabel(j.tanggal)}</td>
              <td class="nowrap"><strong>${esc(j.no_bkk || '-')}</strong></td>
              <td>${esc(j.akun || '-')}</td>
              <td>${esc(j.sumber_dana || '-')}</td>
              <td>${esc(j.keterangan || '-')}${j.dibayarkan ? `<br><small class="muted">→ Dibayarkan ke ${esc(j.dibayarkan)}</small>` : ''}${j.nama ? `<br><small class="muted">👤 ${esc(j.nama)}${j.kelas ? ' · ' + esc(j.kelas) : ''}</small>` : ''}${j.bukti_nota || j.ttd_penerima ? `<br><small class="muted" title="${j.bukti_nota ? 'Foto nota' : ''}${j.bukti_nota && j.ttd_penerima ? ' & ' : ''}${j.ttd_penerima ? 'tanda tangan penerima' : ''}">${j.bukti_nota ? '📷 foto nota' : ''}${j.bukti_nota && j.ttd_penerima ? ' · ' : ''}${j.ttd_penerima ? '✍️ ttd penerima' : ''}</small>` : ''}</td>
              <td>${badgeJenis(j.jenis_transaksi)}</td>
              <td class="num neg">${fmt(j.nominal)}</td>
              <td class="actions">
                <button class="btn btn-sm btn-gold" data-jkw="${j.id}" title="Pratinjau & cetak kwitansi BKK">🧾 Kwitansi</button>
                <button class="btn btn-sm" data-jedit="${j.id}">Edit</button>
                <button class="btn btn-sm btn-danger" data-jdel="${j.id}">Hapus</button>
              </td>
            </tr>`).join('')}</tbody>
          <tfoot><tr style="background:#f8fafc"><td colspan="${masuk ? 7 : 6}"><strong>Total</strong></td><td class="num"><strong>${fmt(total)}</strong></td><td></td></tr></tfoot>
        </table>` : `<div class="empty"><div class="empty-ico">📒</div><p>Belum ada jurnal ${masuk ? 'pemasukan' : 'pengeluaran'} pada filter ini.</p></div>`}
      </div>
    </div>`;

  /* --- aksi form --- */
  $$('[data-arah]').forEach(b => b.onclick = () => {
    if (f.arah === b.dataset.arah) return;
    JEDIT = null; JCUR = null;
    STATE.jurnal.arah = b.dataset.arah;
    pageJurnal();
  });

  /* cocokkan nama santri: persis → awalan → mengandung (unik) — dipakai arah masuk & keluar */
  const cocokSantri = (v) => {
    v = String(v || '').trim().toLowerCase();
    if (!v) return null;
    const n = (x) => String(x || '').trim().toLowerCase();
    const persis = JSANTRI.find(x => n(x.nama) === v);
    if (persis) return persis;
    const awal = JSANTRI.filter(x => n(x.nama).startsWith(v));
    if (awal.length === 1) return awal[0];
    const isi = JSANTRI.filter(x => n(x.nama).includes(v));
    return isi.length === 1 ? isi[0] : null;
  };

  if (masuk) {
    JPILIH = new Set(); JTAGIHAN = []; JNANTI = []; JLUNAS = 0; JEMPTY = '';
    if (!JEDIT) JNOM_AUTO = false;
    jurnalAkunSelect('masuk', '');
    if (!JEDIT) jurnalPasangPreset('masuk');
    /* foto bukti transfer — tampil utk jenis transaksi bank */
    buktiPasangFile('j-bt-pick', 'j-bt-file', 'j-bt-prev', 'j-bt-del', 'transfer');
    const selJenisM = $('#j-jenis');
    if (selJenisM) selJenisM.onchange = buktiTampilTransfer;
    buktiTampilTransfer();
    const boxEl  = $('#j-tagihan-box');
    const listEl = $('#j-tagihan-list');
    const totalPilih = () => JTAGIHAN.filter(t => JPILIH.has(t.id)).reduce((a, t) => a + (Number(t.sisa) || 0), 0);

    const jurnalHint = () => {
      if (JPILIH.size > 0) {
        $('#j-hint').innerHTML = `✔ <strong>${JPILIH.size} tagihan</strong> dipilih — total <strong>${fmt(totalPilih())}</strong>. Klik <strong>Entry</strong> untuk menerbitkan <strong>satu nomor BKM</strong> berisi ${JPILIH.size} transaksi & menandai tagihan terbayar.`;
      } else if (JCUR) {
        $('#j-hint').innerHTML = `Centang tagihan di atas untuk entry sekaligus (boleh lebih dari satu), atau isi <strong>Jenis Tagihan</strong> + nominal untuk satu per satu. Nama di luar data santri juga tetap bisa.`;
      } else {
        const v = $('#j-nama').value.trim();
        $('#j-hint').textContent = v ? 'Nama tidak ada di data santri — kas masuk manual: isi nominal & akun, lalu Entry.' : '';
      }
    };

    const sinkronMode = () => {
      const n = JPILIH.size;
      const fld = $('#j-f-jenis-tagihan');
      if (fld) fld.hidden = n > 0 || !!STATE.jurnal.preset;
      $('#j-nom').readOnly = n > 0;
      if (n > 0) { $('#j-nom').value = totalPilih(); JNOM_AUTO = true; }
      const tt = $('#j-tagihan-total');
      if (tt) tt.textContent = n ? `${n} tagihan • ${fmt(totalPilih())}` : (JTAGIHAN.length ? `${JTAGIHAN.length} tagihan tersedia` : '');
      const all = $('#j-pilih-semua');
      if (all) {
        all.checked = JTAGIHAN.length > 0 && n === JTAGIHAN.length;
        all.indeterminate = n > 0 && n < JTAGIHAN.length;
      }
      jurnalHint();
    };

    const renderTagihan = () => {
      const item = (t, nanti) => `
        <label class="tagihan-item${nanti ? ' ti-nanti' : ''}">
          ${nanti ? '' : `<input type="checkbox" data-tid="${esc(t.id)}" ${JPILIH.has(t.id) ? 'checked' : ''}>`}
          <span class="ti-periode">${periodeLabel(t.periode)}</span>
          <span class="ti-nama">${esc(t.jenis)}${t.status === 'sebagian' ? ' <span class="badge sebagian" style="font-size:10px">Sebagian</span>' : ''}${nanti ? ' <span class="badge cuti" style="font-size:10px">Berikutnya</span>' : ''}</span>
          <span class="ti-nilai">${fmt(t.sisa)}</span>
        </label>`;
      if (!JTAGIHAN.length && !JNANTI.length) {
        if (JEMPTY === 'buat') {
          listEl.innerHTML = `<div class="tagihan-empty">Belum ada tagihan untuk santri ini.<br>
            <button class="btn btn-sm btn-primary" id="j-ke-iuran" style="margin-top:9px">⚙️ Buat Tagihan (Generate)</button></div>`;
          const b = $('#j-ke-iuran');
          if (b) b.onclick = bukaGenerate;
        } else {
          listEl.innerHTML = `<div class="tagihan-empty">${JEMPTY || `Tidak ada tagihan belum terbayar untuk santri ini.`}</div>`;
        }
        return;
      }
      listEl.innerHTML =
        (JTAGIHAN.length
          ? JTAGIHAN.map(t => item(t, false)).join('')
          : `<div class="tagihan-empty">Belum ada tagihan jatuh tempo s/d ${periodeLabel(thisMonth())}.</div>`)
        + (JNANTI.length
          ? `<div class="tagihan-next">⏱ Periode berikutnya — belum bisa di-entry sekarang:</div>` + JNANTI.map(t => item(t, true)).join('')
          : '');
      $$('#j-tagihan-list input[type="checkbox"]').forEach(c => c.onchange = () => {
        if (c.checked) JPILIH.add(c.dataset.tid); else JPILIH.delete(c.dataset.tid);
        sinkronMode();
      });
    };

    $('#j-pilih-semua').onchange = (e) => {
      if (e.target.checked) JTAGIHAN.forEach(t => JPILIH.add(t.id));
      else JPILIH.clear();
      renderTagihan();
      sinkronMode();
    };

    /* cocokkan nama: persis → awalan → mengandung (unik) */
    let jNamaT;
    const jurnalNamaPick = async () => {
      const el = $('#j-nama'); if (!el) return;
      const s = cocokSantri(el.value);
      JCUR = s || null;
      JPILIH = new Set(); JTAGIHAN = []; JNANTI = [];
      if (boxEl) boxEl.hidden = true;
      /* kas khusus (uang saku/tabungan/tagihan lain): tagihan iuran tidak relevan —
         kelas & santri_id tetap terisi, tapi daftar tagihan & Jenis Tagihan tidak dimunculkan */
      if (STATE.jurnal.preset) {
        if (s) $('#j-kelas').value = s.kelas || '';
        jurnalTagihanSelect(null, null);
        sinkronMode();
        return;
      }
      if (s) {
        $('#j-kelas').value = s.kelas || '';
        if (!JEDIT) {
          JEMPTY = ''; JLUNAS = 0;
          try {
            const r = await API.get('/api/tagihan?' + new URLSearchParams({ santri_id: s.id }));
            if (JCUR !== s) return; // nama sudah diganti lagi
            const semua = Array.isArray(r) ? r : [];
            const belum = semua.filter(t => Number(t.sisa) > 0)
              .sort((a, b) => String(a.periode).localeCompare(String(b.periode)));
            JTAGIHAN = belum.filter(t => String(t.periode) <= thisMonth());
            JNANTI   = belum.filter(t => String(t.periode) > thisMonth());
            JLUNAS   = semua.length - belum.length;
            if (!belum.length) {
              if (semua.length) {
                const tot = semua.reduce((a, t) => a + (Number(t.nominal) || 0), 0);
                JEMPTY = `✅ Semua tagihan santri ini sudah lunas — ${semua.length} tagihan, total ${fmt(tot)}.`;
              } else {
                JEMPTY = 'buat';
                try {
                  const sem2 = await API.get('/api/tagihan');
                  if (JCUR !== s) return;
                  const nm = String(s.nama).trim().toLowerCase();
                  const mirip = (Array.isArray(sem2) ? sem2 : []).filter(t => String(t.nama_santri || '').trim().toLowerCase() === nm);
                  if (mirip.length) {
                    JEMPTY = `⚠️ Ditemukan ${mirip.length} tagihan bernama <strong>${esc(s.nama)}</strong> tetapi tercatat pada <strong>santri lain</strong> (santri_id berbeda) — kemungkinan ada santri bernama sama. Periksa menu Data Santri / Iuran Santri.`;
                  }
                } catch (e) {}
              }
            }
          } catch (e) { JTAGIHAN = []; JNANTI = []; JEMPTY = ''; }
          $('#j-tagihan-title').textContent = `📋 Tagihan Belum Terbayar s/d ${periodeLabel(thisMonth())}` +
            (JNANTI.length ? ` (+${JNANTI.length} periode berikutnya)` : '') +
            (JLUNAS ? ` • ${JLUNAS} sudah lunas` : '');
          if (boxEl) boxEl.hidden = false;
          renderTagihan();
        }
        jurnalTagihanSelect(s, null);
        const first = allJenisOpsi(s, JCUSTOM).find(o => o.nilai > 0);
        if (first) {
          $('#j-tagihan').value = first.key;
          isiNomOtomatis(first.nilai);
          const a = akunDariTagihanJS(first.key, JCUSTOM);
          if (a && !STATE.jurnal.preset) $('#j-akun').value = a;
        } else {
          isiNomOtomatis('');
        }
      } else {
        jurnalTagihanSelect(null, null);
        if (!JEDIT) isiNomOtomatis('');
      }
      sinkronMode();
    };

    $('#j-nama').onchange = jurnalNamaPick;
    const genHead = $('#j-generate');
    if (genHead) genHead.onclick = bukaGenerate;
    /* sebagian browser hanya mengirim 'input' saat memilih dari datalist — jadi pasang juga */
    if (!JEDIT) $('#j-nama').oninput = () => { clearTimeout(jNamaT); jNamaT = setTimeout(jurnalNamaPick, 250); };
    /* nominal yang diketik user ditandai manual — tidak boleh ditimpa auto-fill tagihan */
    $('#j-nom').oninput = () => { JNOM_AUTO = false; };

    $('#j-tagihan').onchange = () => {
      if (JPILIH.size > 0) return;
      const key = $('#j-tagihan').value;
      if (JCUR && key) isiNomOtomatis(nilaiSantri(JCUR, key));
      const a = akunDariTagihanJS(key, JCUSTOM);
      if (a && !STATE.jurnal.preset) $('#j-akun').value = a;
    };

    $('#j-entry').onclick = async () => {
      const nama = $('#j-nama').value.trim();
      const cocok = cocokSantri(nama);
      const base = {
        arah: 'masuk',
        tanggal: $('#j-tgl').value,
        nama,
        santri_id: cocok ? cocok.id : '',
        kelas: $('#j-kelas').value.trim(),
        jenis_transaksi: $('#j-jenis').value
      };
      const tunggal = Object.assign({}, base, {
        no_bkm: $('#j-bkm').value.trim(),
        tagihan_jenis: $('#j-tagihan').value || '',
        akun: $('#j-akun').value || '',
        nominal: Number($('#j-nom').value)
      });
      buktiKePayload(tunggal, 'transfer', 'bukti_transfer_b64', 'hapus_bukti_transfer');

      if (JEDIT) {
        if (!tunggal.tanggal || !tunggal.nama || !(tunggal.nominal > 0)) return toast('Tanggal, nama & nominal wajib diisi', 'error');
        try {
          await API.put('/api/jurnal/' + JEDIT, tunggal);
          toast('Jurnal diperbarui — kas ikut disesuaikan');
        } catch (e) { return toast(e.message, 'error'); }
        JEDIT = null; refreshSaldo(); pageJurnal(); return;
      }

      if (JPILIH.size > 0) {
        const dipilih = JTAGIHAN.filter(t => JPILIH.has(t.id));
        const payload = Object.assign({}, base, {
          items: [...JPILIH].map(tid => ({ tagihan_id: tid })),
          santri_id: (dipilih[0] && dipilih[0].santri_id) || (cocok ? cocok.id : ''),
          akun: $('#j-akun').value || ''
        });
        buktiKePayload(payload, 'transfer', 'bukti_transfer_b64', 'hapus_bukti_transfer');
        if (!payload.tanggal || !payload.nama) return toast('Tanggal & nama wajib diisi', 'error');
        try {
          const r = await API.post('/api/jurnal', payload);
          toast(`${r.dibuat} tagihan tercatat — total ${fmt(r.total)}`);
          STATE.jurnal.tanggal = payload.tanggal;
        } catch (e) { return toast(e.message, 'error'); }
        JPILIH = new Set(); JTAGIHAN = [];
        refreshSaldo(); pageJurnal(); return;
      }

      if (!tunggal.tanggal || !tunggal.nama || !(tunggal.nominal > 0)) return toast('Tanggal, nama & nominal wajib diisi', 'error');
      try {
        await API.post('/api/jurnal', tunggal);
        toast('Entry tersimpan ke jurnal & kas');
        STATE.jurnal.tanggal = tunggal.tanggal;
      } catch (e) { return toast(e.message, 'error'); }
      refreshSaldo(); pageJurnal();
    };
  } else {
    jurnalAkunSelect('keluar', '');
    jurnalSumberSelect('');
    if (!JEDIT) jurnalPasangPreset('keluar');
    /* foto nota & tanda tangan penerima (canvas) utk kwitansi BKK */
    buktiPasangFile('j-nt-pick', 'j-nt-file', 'j-nt-prev', 'j-nt-del', 'nota');
    const bTTD = $('#j-ttd-open');
    if (bTTD) bTTD.onclick = () => modalTandaTangan((url) => { JB64.ttd = url; JHAPUS.ttd = false; buktiPreview('j-ttd-prev', 'j-ttd-del', url); });
    const bTTDdel = $('#j-ttd-del');
    if (bTTDdel) bTTDdel.onclick = () => { JB64.ttd = ''; JHAPUS.ttd = true; buktiPreview('j-ttd-prev', 'j-ttd-del', ''); };
    $('#j-entry').onclick = async () => {
      const presetKeluar = !!STATE.jurnal.preset;
      const namaEl = $('#j-nama');
      const namaK = namaEl ? namaEl.value.trim() : '';
      const cocokK = namaK ? cocokSantri(namaK) : null;
      const payload = {
        arah: 'keluar',
        tanggal: $('#j-tgl').value,
        no_bkk: $('#j-bkk').value.trim(),
        akun: $('#j-akun').value,
        sumber_dana: $('#j-sumber').value,
        jenis_transaksi: $('#j-jenis').value,
        nominal: Number($('#j-nom').value),
        dibayarkan: ($('#j-dibayar') ? $('#j-dibayar').value : '').trim(),
        keterangan: $('#j-ket').value.trim()
      };
      buktiKePayload(payload, 'nota', 'bukti_nota_b64', 'hapus_bukti_nota');
      buktiKePayload(payload, 'ttd', 'ttd_b64', 'hapus_ttd_penerima');
      if (presetKeluar) {
        payload.nama = namaK;
        payload.santri_id = cocokK ? cocokK.id : '';
        payload.kelas = cocokK ? (cocokK.kelas || '') : '';
      }
      if (!payload.tanggal || !payload.akun || !payload.sumber_dana || !(payload.nominal > 0)) {
        return toast('Tanggal, akun pengeluaran, sumber dana & nominal wajib diisi', 'error');
      }
      if (presetKeluar && !payload.nama) return toast('Nama santri wajib diisi untuk kas keluar khusus', 'error');
      try {
        if (JEDIT) {
          await API.put('/api/jurnal/' + JEDIT, payload);
          toast('Jurnal keluar diperbarui — kas ikut disesuaikan');
        } else {
          await API.post('/api/jurnal', payload);
          toast('Entry kas keluar tersimpan ke jurnal & kas');
          STATE.jurnal.tanggal = payload.tanggal;
        }
        JEDIT = null; refreshSaldo(); pageJurnal();
      } catch (e) { toast(e.message, 'error'); }
    };
  }
  $('#j-batal').onclick = () => { JEDIT = null; JCUR = null; pageJurnal(); };

  /* --- preset kas khusus (Uang Saku / Tabungan / Tagihan Lain) --- */
  $$('#j-preset-row .chip').forEach(c => c.onclick = () => {
    STATE.jurnal.preset = c.dataset.preset || '';
    jurnalPasangPreset(f.arah);
  });
  const jAkunEl = $('#j-akun');
  if (jAkunEl) jAkunEl.onchange = () => {
    const cfgP = MUTASI_CFG[STATE.jurnal.preset || ''];
    if (!cfgP) return;
    const harap = f.arah === 'keluar' ? cfgP.akunKeluar : cfgP.akun;
    if (jAkunEl.value !== harap) jurnalHapusPreset();
  };
  const jSumberEl = $('#j-sumber');
  if (jSumberEl) jSumberEl.onchange = () => {
    const cfgP = MUTASI_CFG[STATE.jurnal.preset || ''];
    if (cfgP && jSumberEl.value !== cfgP.akun) jurnalHapusPreset();
  };

  /* --- filter --- */
  let tId; $('#j-q').oninput = () => { clearTimeout(tId); tId = setTimeout(() => { STATE.jurnal.q = $('#j-q').value.trim(); pageJurnal(); }, 400); };
  const applyFilter = () => {
    STATE.jurnal = {
      dari: $('#j-dari').value, sampai: $('#j-sampai').value, q: $('#j-q').value.trim(),
      jenis_transaksi: $('#j-fjenis').value, tanggal: STATE.jurnal.tanggal, arah: f.arah,
      preset: STATE.jurnal.preset || ''
    };
    pageJurnal();
  };
  ['j-dari', 'j-sampai', 'j-fjenis'].forEach(id => $('#' + id).onchange = applyFilter);
  $('#j-reset').onclick = () => { STATE.jurnal = { tanggal: STATE.jurnal.tanggal, arah: f.arah, preset: STATE.jurnal.preset || '' }; pageJurnal(); };
  $('#j-ke-iuran2').onclick = bukaGenerate;
  $('#j-ke-kwitansi').onclick = () => { location.hash = '#/kwitansi'; };

  /* --- aksi baris --- */
  $$('[data-jedit]').forEach(b => b.onclick = () => jurnalMuatEdit(b.dataset.jedit));
  $$('[data-jkw]').forEach(b => b.onclick = () => bukaKwitansiBKK(b.dataset.jkw));
  $$('[data-jdel]').forEach(b => b.onclick = async () => {
    if (!confirm('Hapus jurnal ini? Transaksi kas terkait ikut terhapus & tagihan iurannya (bila ada) kembali belum terbayar.')) return;
    try { await API.del('/api/jurnal/' + b.dataset.jdel); toast('Jurnal dihapus'); JEDIT = null; refreshSaldo(); pageJurnal(); }
    catch (e) { toast(e.message, 'error'); }
  });

  if (JEDIT) {
    const j = JLIST.find(x => x.id === JEDIT);
    if (j) jurnalIsiForm(j); else JEDIT = null;
  }
}

function jurnalIsiForm(j) {
  const arah = j.arah === 'keluar' ? 'keluar' : 'masuk';
  buktiReset();
  if (arah === 'keluar') {
    $('#j-tgl').value = j.tanggal;
    $('#j-bkk').value = j.no_bkk || '';
    jurnalAkunSelect('keluar', j.akun || '');
    jurnalSumberSelect(j.sumber_dana || '');
    $('#j-jenis').value = j.jenis_transaksi;
  $('#j-nom').value = j.nominal;
  JNOM_AUTO = false;
    $('#j-ket').value = j.keterangan || '';
    const jDib = $('#j-dibayar');
    if (jDib) jDib.value = j.dibayarkan || '';
    buktiPreview('j-nt-prev', 'j-nt-del', j.bukti_nota || '');
    buktiPreview('j-ttd-prev', 'j-ttd-del', j.ttd_penerima || '');
    const namaKEl = $('#j-nama');
    if (namaKEl) {
      namaKEl.value = j.nama || '';
      const fNK = $('#j-f-nama-k');
      if (fNK) fNK.hidden = !STATE.jurnal.preset && !j.nama;   // tampil bila preset aktif / entry punya nama
    }
    $('#j-entry').textContent = '💾 Update';
    $('#j-batal').hidden = false;
    $('#j-form-title').textContent = '✏️ Edit Jurnal Keluar — ' + (j.no_bkk || '');
    $('#j-hint').innerHTML = `Mengedit <strong>${esc(j.no_bkk || '')}</strong> — perubahan langsung disinkronkan ke kas.`;
    const cardK = $('#content .card');
    if (cardK) cardK.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  JCUR = JSANTRI.find(s => s.id === j.santri_id) || null;
  const boxEdit = $('#j-tagihan-box');
  if (boxEdit) { boxEdit.hidden = true; } // saat edit, pilihan multi tagihan disembunyikan
  $('#j-tgl').value = j.tanggal;
  $('#j-bkm').value = j.no_bkm;
  $('#j-nama').value = j.nama;
  $('#j-kelas').value = j.kelas || '-';
  $('#j-jenis').value = j.jenis_transaksi;
  jurnalTagihanSelect(JCUR, j.tagihan_jenis || '');
  if (j.tagihan_id && j.label_tagihan) {
    const selJ = $('#j-tagihan');
    selJ.innerHTML = `<option value="">${esc(j.label_tagihan)} — sudah ditandai terbayar</option>` + selJ.innerHTML;
  }
  jurnalAkunSelect('masuk', j.akun || akunDariTagihanJS(j.tagihan_jenis || '', JCUSTOM));
  if (!JCUR && j.tagihan_jenis) { /* mode manual: biarkan */ }
  $('#j-nom').value = j.nominal;
  buktiPreview('j-bt-prev', 'j-bt-del', j.bukti_transfer || '');
  buktiTampilTransfer();
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
   MUTASI KAS KHUSUS — Uang Saku, Tabungan, Tagihan Lain-lain
   ========================================================= */
const MUTASI_CFG = {
  us: {
    kode: 'us', sub: 'uang-saku', akun: 'Uang Saku', akunKeluar: 'Pembagian Uang Saku',
    ico: '🪙', label: 'Uang Saku & Pembagian'
  },
  tab: {
    kode: 'tab', sub: 'tabungan', akun: 'Tabungan', akunKeluar: 'Penarikan Tabungan',
    ico: '🏦', label: 'Tabungan'
  },
  lain: {
    kode: 'lain', sub: 'tagihan-lain', akun: 'Tagihan Lain-lain', akunKeluar: 'Pengembalian Tagihan Lain-lain',
    ico: '📄', label: 'Tagihan Lain-lain'
  }
};
/** Buka Jurnal Kas dengan preset akun kas khusus (entry dipindah ke sini) */
function bukaJurnalKas(cfg, arah) {
  STATE.jurnal = Object.assign({}, STATE.jurnal, { arah: arah === 'keluar' ? 'keluar' : 'masuk', preset: cfg ? cfg.kode : '' });
  JEDIT = null;
  if (location.hash.split('?')[0] === '#/jurnal') pageJurnal();
  else location.hash = '#/jurnal';
}

async function pageMutasi(kode) {
  const cfg = MUTASI_CFG[kode];
  if (!cfg) { location.hash = '#/dashboard'; return; }
  const f = Object.assign({ dari: '', sampai: '', q: '', jenis_transaksi: 'semua', santri_id: '' }, STATE.mutasi[kode]);
  STATE.mutasi[kode] = f;

  const qs = new URLSearchParams({ sub: cfg.sub });
  if (f.dari) qs.set('dari', f.dari);
  if (f.sampai) qs.set('sampai', f.sampai);
  if (f.q) qs.set('q', f.q);
  if (f.jenis_transaksi && f.jenis_transaksi !== 'semua') qs.set('jenis_transaksi', f.jenis_transaksi);
  if (f.santri_id) qs.set('santri_id', f.santri_id);

  const [data, set, santri] = await Promise.all([
    API.get('/api/mutasi?' + qs),
    API.get('/api/pengaturan'),
    API.get('/api/santri')
  ]);
  const list = Array.isArray(data.list) ? data.list : [];
  const rekap = Array.isArray(data.per_santri) ? data.per_santri : [];
  const badgeJenis = (v) => `<span class="badge ${v === 'Cas' ? 'cash' : 'bank'}">${esc(v)}</span>`;
  const periodeTxt = (f.dari || f.sampai)
    ? `${f.dari ? tglLabel(f.dari) : 'Awal'} s/d ${f.sampai ? tglLabel(f.sampai) : 'Sekarang'}`
    : 'Seluruh periode';

  $('#content').innerHTML = `
    <div class="print-head">
      <h2>${esc(set.nama_pesantren)}</h2>
      <p>${esc(set.alamat)}</p>
      <p><strong>LAPORAN MUTASI ${esc(cfg.akun.toUpperCase())}</strong> — ${periodeTxt} (TA ${esc(set.tahun_ajaran)})</p>
      <p>Saldo awal ${fmt(data.saldo_awal)} • Masuk ${fmt(data.total_masuk)} • Keluar ${fmt(data.total_keluar)} • <strong>Saldo akhir ${fmt(data.saldo_akhir)}</strong></p>
    </div>

    <div class="grid grid-4">
      <div class="stat saldo"><div class="stat-ico">${cfg.ico}</div><div class="stat-label">Saldo ${esc(cfg.akun)}</div><div class="stat-value" style="font-size:19px">${fmt(data.saldo_akhir)}</div><div class="stat-sub">Saldo awal ${fmt(data.saldo_awal)}</div></div>
      <div class="stat masuk"><div class="stat-ico">⬆️</div><div class="stat-label">Total Masuk</div><div class="stat-value" style="font-size:19px">${fmt(data.total_masuk)}</div><div class="stat-sub">periode ditampilkan</div></div>
      <div class="stat keluar"><div class="stat-ico">⬇️</div><div class="stat-label">Total Keluar</div><div class="stat-value" style="font-size:19px">${fmt(data.total_keluar)}</div><div class="stat-sub">periode ditampilkan</div></div>
      <div class="stat iuran"><div class="stat-ico">📒</div><div class="stat-label">Jumlah Mutasi</div><div class="stat-value">${data.jumlah}</div><div class="stat-sub">baris pada filter ini</div></div>
    </div>

    <div class="card mt no-print">
      <div class="card-pad flex between" style="flex-wrap:wrap;gap:12px;align-items:center">
        <div style="max-width:620px">
          <strong>✏️ Entry kas khusus ${esc(cfg.label)} — lewat Jurnal Kas</strong>
          <p class="muted" style="margin:4px 0 0;font-size:12.5px">Setoran & pembagian <strong>${esc(cfg.akun)}</strong> dicatat di satu form <strong>Jurnal Kas</strong> (akun sudah terpreset otomatis). Halaman ini khusus <strong>laporan mutasi, saldo berjalan & saldo akhir per santri</strong>.</p>
        </div>
        <div class="flex" style="flex-wrap:wrap;gap:8px">
          <button class="btn btn-primary" id="m-ke-masuk">⬆ Entry Kas Masuk</button>
          <button class="btn" id="m-ke-keluar">⬇ Entry Kas Keluar</button>
          <button class="btn btn-gold" id="m-ke-kwitansi">🧾 Kwitansi</button>
        </div>
      </div>
    </div>

    <div class="filters card card-pad mt">
      <div class="field grow"><label>Cari</label><input id="m-q" value="${esc(f.q)}" placeholder="nama, No BKM/BKK, akun, atau keterangan…"></div>
      <div class="field"><label>Dari</label><input type="date" id="m-dari" value="${f.dari}"></div>
      <div class="field"><label>Sampai</label><input type="date" id="m-sampai" value="${f.sampai}"></div>
      <div class="field"><label>Jenis Transaksi</label><select id="m-fjenis">
        <option value="semua">Semua</option>
        ${['Cas', 'BRI', 'BSI', 'BPD'].map(v => `<option ${f.jenis_transaksi === v ? 'selected' : ''}>${v}</option>`).join('')}
      </select></div>
      <div class="field grow"><label>Santri</label><select id="m-santri">
        <option value="">Semua santri</option>
        ${(Array.isArray(santri) ? santri : []).map(s => `<option value="${esc(s.id)}" ${f.santri_id === s.id ? 'selected' : ''}>${esc(s.nama)} — ${esc(s.kelas || '-')}</option>`).join('')}
      </select></div>
      <button class="btn" id="m-reset">Reset</button>
      <button class="btn" id="m-csv">⬇ CSV</button>
      <button class="btn" onclick="window.print()">🖨️ Cetak</button>
    </div>

    <div class="card">
      <div class="card-head"><h3>Mutasi ${esc(cfg.label)} (${list.length})</h3><span class="muted">Saldo berjalan per baris — edit / hapus lewat kolom aksi</span></div>
      <div class="table-wrap">
        ${list.length ? `<table>
          <thead><tr><th>Tanggal</th><th>No VCH</th><th>Keterangan</th><th>Jenis Transaksi</th><th class="num">Masuk</th><th class="num">Keluar</th><th class="num">Saldo</th><th class="actions"></th></tr></thead>
          <tbody>${list.map(j => {
            const m = j.arah === 'masuk';
            const ket = m
              ? esc(j.nama || '-') + (j.label_tagihan ? ` <span class="muted">• ${esc(j.label_tagihan)}</span>` : '') + (j.keterangan ? `<br><small class="muted">${esc(j.keterangan)}</small>` : '')
              : esc(j.akun || '-') + (j.sumber_dana ? ` <span class="muted">← ${esc(j.sumber_dana)}</span>` : '') + (j.nama ? ` <span class="muted">• ${esc(j.nama)}</span>` : '') + (j.keterangan ? `<br><small class="muted">${esc(j.keterangan)}</small>` : '');
            return `
            <tr>
              <td class="nowrap">${tglLabel(j.tanggal)}</td>
              <td class="nowrap"><strong>${esc(m ? (j.no_bkm || '') : (j.no_bkk || ''))}</strong></td>
              <td>${ket}</td>
              <td>${badgeJenis(j.jenis_transaksi)}</td>
              <td class="num pos">${m ? fmt(j.nominal) : ''}</td>
              <td class="num neg">${m ? '' : fmt(j.nominal)}</td>
              <td class="num"><strong>${fmt(j.saldo)}</strong></td>
              <td class="actions">
                <button class="btn btn-sm" data-medit="${j.id}">Edit</button>
                <button class="btn btn-sm btn-danger" data-mdel="${j.id}">Hapus</button>
              </td>
            </tr>`;
          }).join('')}</tbody>
          <tfoot><tr style="background:#f8fafc">
            <td colspan="4"><strong>Total</strong></td>
            <td class="num pos"><strong>${fmt(data.total_masuk)}</strong></td>
            <td class="num neg"><strong>${fmt(data.total_keluar)}</strong></td>
            <td class="num"><strong>${fmt(data.saldo_akhir)}</strong></td><td class="actions"></td>
          </tr></tfoot>
        </table>` : `<div class="empty"><div class="empty-ico">${cfg.ico}</div><p>Belum ada mutasi ${esc(cfg.akun)} pada filter ini.</p></div>`}
      </div>
    </div>

    <div class="card mt">
      <div class="card-head"><h3>🧾 Rekap Saldo per Santri (${rekap.length})</h3><span class="muted">Saldo akhir ${esc(cfg.akun)} tiap santri pada periode ${periodeTxt}</span></div>
      <div class="table-wrap">
        ${rekap.length ? `<table>
          <thead><tr><th class="num">#</th><th>Nama Santri</th><th>Kelas</th><th class="num">Saldo Awal</th><th class="num">Masuk</th><th class="num">Keluar</th><th class="num">Saldo Akhir</th></tr></thead>
          <tbody>${rekap.map((r, i) => `
            <tr>
              <td class="num muted">${i + 1}</td>
              <td>${esc(r.nama)}${r.santri_id ? '' : ' <span class="muted">(manual)</span>'}</td>
              <td class="nowrap">${esc(r.kelas || '-')}</td>
              <td class="num">${r.saldo_awal ? fmt(r.saldo_awal) : '<span class="muted">—</span>'}</td>
              <td class="num pos">${r.masuk ? fmt(r.masuk) : ''}</td>
              <td class="num neg">${r.keluar ? fmt(r.keluar) : ''}</td>
              <td class="num"><strong class="${r.saldo < 0 ? 'neg' : ''}">${fmt(r.saldo)}</strong></td>
            </tr>`).join('')}</tbody>
          <tfoot><tr style="background:#f8fafc">
            <td colspan="3"><strong>Total ${rekap.length} santri</strong></td>
            <td class="num"><strong>${fmt(data.saldo_awal)}</strong></td>
            <td class="num pos"><strong>${fmt(rekap.reduce((a, r) => a + r.masuk, 0))}</strong></td>
            <td class="num neg"><strong>${fmt(rekap.reduce((a, r) => a + r.keluar, 0))}</strong></td>
            <td class="num"><strong>${fmt(data.saldo_akhir)}</strong></td>
          </tr></tfoot>
        </table>` : `<div class="empty"><div class="empty-ico">${cfg.ico}</div><p>Belum ada mutasi per santri pada periode ini.</p></div>`}
      </div>
    </div>`;

  /* --- aksi toolbar --- */
  $('#m-ke-masuk').onclick = () => bukaJurnalKas(cfg, 'masuk');
  $('#m-ke-keluar').onclick = () => bukaJurnalKas(cfg, 'keluar');
  $('#m-ke-kwitansi').onclick = () => { location.hash = '#/kwitansi'; };

  /* --- filter --- */
  let tId; $('#m-q').oninput = () => { clearTimeout(tId); tId = setTimeout(() => { STATE.mutasi[kode].q = $('#m-q').value.trim(); pageMutasi(kode); }, 400); };
  const applyFilter = () => {
    STATE.mutasi[kode] = Object.assign({}, STATE.mutasi[kode], {
      dari: $('#m-dari').value, sampai: $('#m-sampai').value, q: $('#m-q').value.trim(),
      jenis_transaksi: $('#m-fjenis').value, santri_id: $('#m-santri').value
    });
    pageMutasi(kode);
  };
  ['m-dari', 'm-sampai', 'm-fjenis', 'm-santri'].forEach(id => $('#' + id).onchange = applyFilter);
  $('#m-reset').onclick = () => { STATE.mutasi[kode] = {}; pageMutasi(kode); };
  $('#m-csv').onclick = () => {
    const head = ['Tanggal', 'No VCH', 'Arah', 'Nama', 'Akun', 'Sumber Dana', 'Jenis Transaksi', 'Masuk', 'Keluar', 'Saldo', 'Keterangan'];
    const rows = list.map(j => [
      j.tanggal, j.no_bkm || j.no_bkk || '', j.arah === 'masuk' ? 'Masuk' : 'Keluar', j.nama || '',
      j.akun || '', j.sumber_dana || '', j.jenis_transaksi || '',
      j.arah === 'masuk' ? j.nominal : '', j.arah === 'keluar' ? j.nominal : '', j.saldo, j.keterangan || ''
    ]);
    const rec = rekap.map((r, i) => [i + 1, r.nama, r.kelas || '-', r.saldo_awal, r.masuk, r.keluar, r.saldo]);
    downloadCsv(`mutasi-${cfg.sub}-${today()}.csv`, [
      ['LAPORAN MUTASI', cfg.akun.toUpperCase(), periodeTxt],
      ['Saldo Awal', data.saldo_awal, 'Total Masuk', data.total_masuk, 'Total Keluar', data.total_keluar, 'Saldo Akhir', data.saldo_akhir],
      [], head, ...rows,
      [], ['REKAP SALDO PER SANTRI'],
      ['No', 'Nama Santri', 'Kelas', 'Saldo Awal', 'Masuk', 'Keluar', 'Saldo Akhir'], ...rec
    ]);
  };

  /* --- aksi baris --- */
  $$('[data-medit]').forEach(b => b.onclick = () => {
    const j = list.find(x => x.id === b.dataset.medit);
    if (!j) return;
    JEDIT = j.id;
    STATE.jurnal = Object.assign({}, STATE.jurnal, {
      arah: j.arah === 'keluar' ? 'keluar' : 'masuk', preset: ''
    });
    toast('Membuka ' + (j.no_bkm || j.no_bkk || '') + ' di Jurnal Kas untuk diedit');
    location.hash = '#/jurnal';
  });
  $$('[data-mdel]').forEach(b => b.onclick = async () => {
    if (!confirm('Hapus mutasi ini? Transaksi kas terkait ikut terhapus & saldo akun menyesuaikan.')) return;
    try { await API.del('/api/jurnal/' + b.dataset.mdel); toast('Mutasi dihapus'); refreshSaldo(); pageMutasi(kode); }
    catch (e) { toast(e.message, 'error'); }
  });
}

/* =========================================================
   SALDO AKUN PEMASUKAN
   ========================================================= */
async function pageSaldoAkun() {
  const f = Object.assign({ dari: '', sampai: '' }, STATE.saldoAkun);
  STATE.saldoAkun = f;
  const qs = new URLSearchParams();
  if (f.dari) qs.set('dari', f.dari);
  if (f.sampai) qs.set('sampai', f.sampai);
  const [data, set] = await Promise.all([
    API.get('/api/saldo-akun' + (qs.toString() ? '?' + qs : '')),
    API.get('/api/pengaturan')
  ]);
  const list = Array.isArray(data.list) ? data.list : [];
  const periodeTxt = (f.dari || f.sampai)
    ? `${f.dari ? tglLabel(f.dari) : 'Awal'} s/d ${f.sampai ? tglLabel(f.sampai) : 'Sekarang'}`
    : 'Seluruh periode';

  $('#content').innerHTML = `
    <div class="print-head">
      <h2>${esc(set.nama_pesantren)}</h2>
      <p>${esc(set.alamat)}</p>
      <p><strong>SALDO AKUN PEMASUKAN</strong> — ${periodeTxt} (TA ${esc(set.tahun_ajaran)})</p>
      <p>Saldo awal ${fmt(data.total_saldo_awal)} • Masuk ${fmt(data.total_masuk)} • Keluar ${fmt(data.total_keluar)} • <strong>Saldo akhir ${fmt(data.total_saldo_akhir)}</strong></p>
    </div>

    <div class="grid grid-4">
      <div class="stat saldo"><div class="stat-ico">🏦</div><div class="stat-label">Saldo Akhir</div><div class="stat-value" style="font-size:19px">${fmt(data.total_saldo_akhir)}</div><div class="stat-sub">${list.length} akun aktif</div></div>
      <div class="stat masuk"><div class="stat-ico">⬆️</div><div class="stat-label">Total Masuk</div><div class="stat-value" style="font-size:19px">${fmt(data.total_masuk)}</div><div class="stat-sub">periode ditampilkan</div></div>
      <div class="stat keluar"><div class="stat-ico">⬇️</div><div class="stat-label">Total Keluar</div><div class="stat-value" style="font-size:19px">${fmt(data.total_keluar)}</div><div class="stat-sub">periode ditampilkan</div></div>
      <div class="stat iuran"><div class="stat-ico">📒</div><div class="stat-label">Saldo Awal</div><div class="stat-value" style="font-size:19px">${fmt(data.total_saldo_awal)}</div><div class="stat-sub">sebelum periode</div></div>
    </div>

    <div class="filters card card-pad mt no-print">
      <div class="field"><label>Dari</label><input type="date" id="sa-dari" value="${f.dari}"></div>
      <div class="field"><label>Sampai</label><input type="date" id="sa-sampai" value="${f.sampai}"></div>
      <button class="btn" id="sa-reset">Reset</button>
      <button class="btn" id="sa-csv">⬇ CSV</button>
      <button class="btn" onclick="window.print()">🖨️ Cetak</button>
    </div>

    <div class="card">
      <div class="card-head"><h3>Saldo per Akun Pemasukan (${list.length})</h3><span class="muted">Saldo akhir = saldo awal + masuk − keluar</span></div>
      <div class="table-wrap">
        ${list.length ? `<table>
          <thead><tr><th class="num">NO</th><th>Nama Akun</th><th class="num">Saldo Awal</th><th class="num">Masuk</th><th class="num">Keluar</th><th class="num">Saldo Akhir</th></tr></thead>
          <tbody>${list.map((r, i) => `
            <tr>
              <td class="num muted">${i + 1}</td>
              <td>${esc(r.nama)}</td>
              <td class="num">${r.saldo_awal ? fmt(r.saldo_awal) : '<span class="muted">—</span>'}</td>
              <td class="num pos">${r.masuk ? fmt(r.masuk) : ''}</td>
              <td class="num neg">${r.keluar ? fmt(r.keluar) : ''}</td>
              <td class="num"><strong class="${r.saldo_akhir < 0 ? 'neg' : ''}">${fmt(r.saldo_akhir)}</strong></td>
            </tr>`).join('')}</tbody>
          <tfoot><tr style="background:#f8fafc">
            <td colspan="2"><strong>Total ${list.length} akun</strong></td>
            <td class="num"><strong>${fmt(data.total_saldo_awal)}</strong></td>
            <td class="num pos"><strong>${fmt(data.total_masuk)}</strong></td>
            <td class="num neg"><strong>${fmt(data.total_keluar)}</strong></td>
            <td class="num"><strong>${fmt(data.total_saldo_akhir)}</strong></td>
          </tr></tfoot>
        </table>` : `<div class="empty"><div class="empty-ico">🧾</div><p>Belum ada mutasi akun pemasukan pada filter ini.</p></div>`}
      </div>
    </div>`;

  const applyFilter = () => {
    STATE.saldoAkun = { dari: $('#sa-dari').value, sampai: $('#sa-sampai').value };
    pageSaldoAkun();
  };
  ['sa-dari', 'sa-sampai'].forEach(id => $('#' + id).onchange = applyFilter);
  $('#sa-reset').onclick = () => { STATE.saldoAkun = {}; pageSaldoAkun(); };
  $('#sa-csv').onclick = () => {
    downloadCsv(`saldo-akun-pemasukan-${today()}.csv`, [
      ['SALDO AKUN PEMASUKAN', periodeTxt],
      ['Saldo Awal', data.total_saldo_awal, 'Total Masuk', data.total_masuk, 'Total Keluar', data.total_keluar, 'Saldo Akhir', data.total_saldo_akhir],
      [],
      ['NO', 'Nama Akun', 'Saldo Awal', 'Masuk', 'Keluar', 'Saldo Akhir'],
      ...list.map((r, i) => [i + 1, r.nama, r.saldo_awal, r.masuk, r.keluar, r.saldo_akhir])
    ]);
  };
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
    <div class="flex between" style="flex-wrap:wrap;gap:8px;margin-bottom:12px">
      <button class="btn btn-sm" id="i-back">← Kembali</button>
      <span class="muted" style="font-size:12.5px">Halaman ini tanpa menu sidebar — buka lewat <strong>Generate</strong> (Jurnal Kas) atau <strong>Lihat Tunggakan</strong> (Dashboard)</span>
    </div>

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
      <button class="btn btn-danger" id="i-hapus">🗑 Hapus Tagihan</button>
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
  $('#i-back').onclick = () => { location.hash = '#/' + (STATE.prevPage && STATE.prevPage !== 'iuran' ? STATE.prevPage : 'dashboard'); };
  $$('[data-periode]').forEach(tr => tr.onclick = () => { STATE.iuran.periode = tr.dataset.periode; pageIuran(); });
  $$('[data-bayar]').forEach(b => b.onclick = () => formBayar(b.dataset.bayar));
  $$('[data-detail]').forEach(b => b.onclick = () => detailTagihan(b.dataset.detail));
  $('#i-generate').onclick = () => formGenerate();
  $('#i-hapus').onclick = () => formHapusTagihan(rekap);
  $('#i-add').onclick = () => formJenisIuran();
}

async function formHapusTagihan(rekap) {
  const periodes = [...new Set(rekap.map(r => r.periode))].sort().reverse();
  const cur = STATE.iuran.periode || thisMonth();
  if (!periodes.includes(cur)) { periodes.unshift(cur); }
  const bulanan = [
    { key: 'spp', nama: 'SPP' },
    { key: 'infaq', nama: 'Infaq Wajib' },
    { key: 'laundry', nama: 'Laundry Wajib' }
  ];
  const custom = await API.get('/api/kolom-custom');
  const kolom = [...bulanan, ...KD.lain, ...custom.map(c => ({ key: c.key, nama: c.nama }))];
  openModal('Hapus Tagihan per Periode', `
    <div class="form-grid">
      <div class="field full"><label>Periode</label><select id="h-periode">
        ${periodes.map(p => `<option value="${p}" ${p === cur ? 'selected' : ''}>${periodeLabel(p)}</option>`).join('')}
      </select></div>
      <div class="field full"><label>Jenis tagihan</label><div id="h-kolom">
        <label class="gen-kolom"><input type="checkbox" id="h-semua" checked> Semua jenis</label>
        <div class="gen-kolom-list" id="h-daftar" style="margin-top:6px" hidden>
          ${kolom.map(k => `<label class="gen-kolom"><input type="checkbox" value="${esc(k.key)}" data-kolom> ${esc(k.nama)}</label>`).join('')}
        </div>
      </div></div>
    </div>
    <div class="gen-warn" style="margin-top:12px">⚠️ Hanya tagihan <strong>yang belum memiliki pembayaran</strong> yang dihapus — tagihan lunas/berbayar aman. Setelah dihapus, klik <strong>Generate Tagihan</strong> bila ingin membuat ulang.</div>`,
    `<button class="btn" onclick="closeModal()">Batal</button><button class="btn btn-danger" id="h-save">🗑 Hapus Tagihan</button>`);
  const semua = $('#h-semua'), daftar = $('#h-daftar');
  semua.onchange = () => { daftar.hidden = semua.checked; };
  $('#h-save').onclick = async () => {
    const body = { periode: $('#h-periode').value };
    if (!semua.checked) {
      body.kolom = $$('#h-daftar input:checked').map(i => i.value);
      if (!body.kolom.length) return toast('Pilih minimal satu jenis tagihan', 'error');
    }
    try {
      const r = await API.post('/api/tagihan/hapus', body);
      toast(r.pesan); closeModal(); pageIuran();
    } catch (e) { toast(e.message, 'error'); }
  };
}

async function formGenerate() {
  const [santri, custom] = await Promise.all([API.get('/api/santri?status=aktif'), API.get('/api/kolom-custom')]);
  const bln = thisMonth();
  const bulanan = [
    { key: 'spp', nama: 'SPP' },
    { key: 'infaq', nama: 'Infaq Wajib' },
    { key: 'laundry', nama: 'Laundry Wajib' }
  ];
  const lain = [...KD.lain, ...custom.map(c => ({ key: c.key, nama: c.nama }))];
  const adaIsi = (key) => santri.some(s => nilaiSantri(s, key) > 0);
  const cb = (o, on) => `<label class="gen-kolom"><input type="checkbox" value="${esc(o.key)}" ${on ? 'checked' : ''}> ${esc(o.nama)}</label>`;
  openModal('Generate Tagihan Massal', `
    ${!santri.length ? `<div class="gen-warn">⚠️ Tidak ada <strong>santri aktif</strong> — tambah/ubah status santri dulu. <a class="btn btn-sm" href="#/santri" id="g-ke-santri" style="margin-left:6px">Buka Data Santri</a></div>` : ''}
    <div class="form-grid">
      <div class="field full"><label>Periode (bulan tagihan)</label><input type="month" id="g-periode" value="${bln}"></div>
      <div class="field full"><label>Jenis Tagihan — kolom Data Santri</label>
        <div id="g-kolom">
          <p class="gen-grp">Bulanan — menyesuaikan periode yang dipilih</p>
          <div class="gen-kolom-list">${bulanan.map(o => cb(o, true)).join('')}</div>
          <p class="gen-grp">Kolom lain — nilai di Data Santri</p>
          <div class="gen-kolom-list">${lain.map(o => cb(o, adaIsi(o.key))).join('')}</div>
        </div>
        <span class="hint">Nominal tiap santri diambil dari kolomnya sendiri (mis. SPP November → kolom <strong>SPP November</strong>). Nilai 0 tidak dibuatkan tagihan & tagihan yang sudah ada tidak digandakan.</span>
      </div>
      <div class="field full"><label>Santri</label><select id="g-santri" multiple size="${Math.min(6, Math.max(santri.length, 3))}" style="padding:6px">
        ${santri.map(s => `<option value="${s.id}" selected>${esc(s.nama)} — ${esc(s.kelas)}</option>`).join('')}
      </select><span class="hint">Kosongkan = semua santri aktif.</span></div>
      <div class="field full">
        <label class="gen-kolom" style="font-size:13.5px"><input type="checkbox" id="g-hapus"> 🗑 Hapus tagihan lama periode ini lalu buat ulang (regenerate)</label>
        <span class="hint">Centang bila nominal di Data Santri sudah diubah — tagihan lama pada kolom terpilih dihapus, lalu digenerate ulang. Tagihan yang sudah memiliki pembayaran tetap dipertahankan.</span>
      </div>
    </div>`,
    `<button class="btn" onclick="closeModal()">Batal</button><button class="btn btn-gold" id="g-save">⚙️ Generate</button>`);
  const keSantri = $('#g-ke-santri');
  if (keSantri) keSantri.onclick = () => closeModal();
  $('#g-hapus').onchange = (e) => { $('#g-save').textContent = e.target.checked ? '🗑 Hapus & Generate' : '⚙️ Generate'; };
  $('#g-save').onclick = async () => {
    const payload = {
      periode: $('#g-periode').value,
      kolom: $$('#g-kolom input:checked').map(i => i.value),
      santri_ids: [...$('#g-santri').selectedOptions].map(o => o.value),
      hapus_dulu: $('#g-hapus').checked
    };
    if (!payload.periode) return toast('Pilih periode', 'error');
    if (!payload.kolom.length) return toast('Pilih minimal satu kolom tagihan', 'error');
    if (!payload.santri_ids.length && !santri.length) return toast('Tidak ada santri aktif — tambah santri di menu Data Santri', 'error');
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
   REKAP PEMBAYARAN PERSANTRI (matriks santri × jenis iuran)
   ========================================================= */
async function pageRekap() {
  const f = Object.assign({ periode: 'kumulatif', kelas: 'semua', status: 'semua', q: '' }, STATE.rekap);
  STATE.rekap = f;
  const [santri, jenis, bulan] = await Promise.all([
    API.get('/api/santri'),
    API.get('/api/jenis-tagihan'),
    API.get('/api/laporan/iuran')
  ]);

  const qs = new URLSearchParams();
  if (f.periode === 'kumulatif') qs.set('periode_sampai', thisMonth());
  else if (f.periode && f.periode !== 'semua') qs.set('periode', f.periode);
  const tags = await API.get('/api/tagihan' + (qs.toString() ? '?' + qs.toString() : ''));

  /* agregat per santri × jenis iuran */
  const agg = {}, colTot = {}, rowMap = {};
  let totTagihan = 0, totBayar = 0, totSisa = 0;
  tags.forEach(t => {
    const nominal = Number(t.nominal) || 0;
    const bayar   = Number(t.total_bayar) || 0;
    const sisa    = Number(t.sisa) || 0;
    totTagihan += nominal; totBayar += bayar; totSisa += sisa;
    const k = t.santri_id + '|' + t.jenis_id;
    if (!agg[k]) agg[k] = { bayar: 0, sisa: 0 };
    agg[k].bayar += bayar; agg[k].sisa += sisa;
    if (!colTot[t.jenis_id]) colTot[t.jenis_id] = { bayar: 0, sisa: 0 };
    colTot[t.jenis_id].bayar += bayar; colTot[t.jenis_id].sisa += sisa;
    if (!rowMap[t.santri_id]) rowMap[t.santri_id] = { bayar: 0, sisa: 0 };
    rowMap[t.santri_id].bayar += bayar; rowMap[t.santri_id].sisa += sisa;
  });

  const adaTagihan = (id) => tags.some(t => t.santri_id === id);
  const adaSisa    = (id) => tags.some(t => t.santri_id === id && Number(t.sisa) > 0);

  const kelasUnik = [...new Set(santri.map(s => s.kelas))].sort((a, b) => String(a).localeCompare(String(b)));
  const q = f.q.toLowerCase();
  const rows = santri.filter(s => {
    if (f.kelas !== 'semua' && s.kelas !== f.kelas) return false;
    if (q && !(String(s.nama).toLowerCase().includes(q) || String(s.nis || '').toLowerCase().includes(q))) return false;
    const byr = adaTagihan(s.id), ssa = adaSisa(s.id);
    if (f.status === 'belum' && !ssa) return false;
    if (f.status === 'lunas' && !(byr && !ssa)) return false;
    if (f.status === 'kosong' && byr) return false;
    return true;
  }).sort((a, b) => String(a.kelas).localeCompare(String(b.kelas)) || String(a.nama).localeCompare(String(b.nama)));

  const cols = jenis.filter(j => colTot[j.id]);
  const showCols = cols.length ? cols : jenis;
  const persen = totTagihan ? Math.round(totBayar / totTagihan * 100) : 0;
  const belumTagihan = tags.filter(t => Number(t.sisa) > 0).length;
  const belumSantri  = rows.filter(s => adaSisa(s.id)).length;
  const scopeLabel = f.periode === 'kumulatif' ? `kumulatif s/d ${periodeLabel(thisMonth())}`
    : f.periode === 'semua' ? 'semua periode' : periodeLabel(f.periode);

  const cellTd = (sid, jid) => {
    const c = agg[sid + '|' + jid];
    if (!c) return '<td class="num rc-kosong">–</td>';
    if (c.sisa <= 0) return `<td class="num rc-lunas">${fmt(c.bayar)} <small>✓</small></td>`;
    if (c.bayar <= 0) return `<td class="num rc-belum" title="Belum dibayar — otomatis muncul di daftar Entry Kas Jurnal Kas">${fmt(c.sisa)}</td>`;
    return `<td class="num rc-seb"><span class="rc-lunas">${fmt(c.bayar)}</span><br><small class="rc-belum">sisa ${fmt(c.sisa)}</small></td>`;
  };

  const thHtml = [
    '<th class="num sticky-col">No</th>', '<th class="sticky-col2">Nama</th>', '<th>Kelas</th>',
    ...showCols.map(j => `<th class="num">${esc(j.nama)}</th>`),
    '<th class="num">Terbayar</th>', '<th class="num">Sisa</th>'
  ].join('');

  const tbody = rows.map((s, i) => {
    const rt = rowMap[s.id] || { bayar: 0, sisa: 0 };
    return `<tr>
      <td class="num sticky-col">${i + 1}</td>
      <td class="sticky-col2"><strong>${esc(s.nama)}</strong><br><small class="muted">${esc(s.nis || '-')}</small></td>
      <td>${esc(s.kelas)}</td>
      ${showCols.map(j => cellTd(s.id, j.id)).join('')}
      <td class="num">${rt.bayar > 0 ? `<span class="rc-lunas">${fmt(rt.bayar)}</span>` : '<span class="muted">–</span>'}</td>
      <td class="num">${rt.sisa > 0 ? `<span class="rc-belum">${fmt(rt.sisa)}</span>` : (rowMap[s.id] ? '<span class="badge lunas">Lunas</span>' : '<span class="muted">–</span>')}</td>
    </tr>`;
  }).join('');

  const tfoot = `<tfoot><tr>
    <td class="sticky-col"></td>
    <td class="sticky-col2"><strong>Total</strong></td>
    <td></td>
    ${showCols.map(j => {
      const c = colTot[j.id] || { bayar: 0, sisa: 0 };
      return `<td class="num"><strong>${fmt(c.bayar)}</strong>${c.sisa > 0 ? `<br><small class="rc-belum">${fmt(c.sisa)}</small>` : ''}</td>`;
    }).join('')}
    <td class="num"><strong>${fmt(totBayar)}</strong></td>
    <td class="num rc-belum"><strong>${fmt(totSisa)}</strong></td>
  </tr></tfoot>`;

  const bulanOpts = [...new Set(bulan.map(b => b.periode))].sort().reverse();
  if (f.periode && f.periode !== 'kumulatif' && f.periode !== 'semua' && !bulanOpts.includes(f.periode)) bulanOpts.unshift(f.periode);

  $('#content').innerHTML = `
    <div class="grid grid-4">
      <div class="stat iuran"><div class="stat-ico">🧾</div><div class="stat-label">Total Tagihan</div><div class="stat-value">${fmt(totTagihan)}</div><div class="stat-sub">${tags.length} tagihan • ${scopeLabel}</div></div>
      <div class="stat masuk"><div class="stat-ico">✅</div><div class="stat-label">Terbayar</div><div class="stat-value">${fmt(totBayar)}</div><div class="stat-sub">${persen}% dari total tagihan</div></div>
      <div class="stat keluar"><div class="stat-ico">⏳</div><div class="stat-label">Belum Dibayar</div><div class="stat-value">${fmt(totSisa)}</div><div class="stat-sub">${belumTagihan} tagihan • ${belumSantri} santri ditampilkan</div></div>
      <div class="stat"><div class="stat-ico">👥</div><div class="stat-label">Santri Ditampilkan</div><div class="stat-value">${rows.length}</div><div class="stat-sub">dari ${santri.length} terdaftar</div></div>
    </div>

    <div class="card card-pad mt rc-info">
      <span>ℹ️ Sel <span class="rc-lunas">hijau</span> = santri sudah bayar (terisi nominal) · Sel <span class="rc-belum">merah</span> = tagihan belum dibayar → <strong>otomatis muncul di daftar Entry Kas Jurnal Kas</strong> (bisa dicentang banyak sekaligus)</span>
      ${totSisa > 0
        ? `<button class="btn btn-primary" id="rk-jurnal">➕ Entry Kas (${belumTagihan} tagihan)</button>`
        : '<span class="badge lunas" style="margin-left:auto">Semua tagihan lunas ✓</span>'}
    </div>

    <div class="filters card card-pad mt">
      <div class="field"><label>Periode</label><select id="r-periode">
        <option value="kumulatif" ${f.periode === 'kumulatif' ? 'selected' : ''}>Kumulatif s/d ${periodeLabel(thisMonth())}</option>
        ${bulanOpts.map(p => `<option value="${p}" ${f.periode === p ? 'selected' : ''}>${periodeLabel(p)}</option>`).join('')}
        <option value="semua" ${f.periode === 'semua' ? 'selected' : ''}>Semua periode</option>
      </select></div>
      <div class="field"><label>Kelas</label><select id="r-kelas">
        <option value="semua">Semua Kelas</option>
        ${kelasUnik.map(k => `<option value="${esc(k)}" ${f.kelas === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}
      </select></div>
      <div class="field"><label>Status</label><select id="r-status">
        <option value="semua" ${f.status === 'semua' ? 'selected' : ''}>Semua</option>
        <option value="belum" ${f.status === 'belum' ? 'selected' : ''}>Belum bayar</option>
        <option value="lunas" ${f.status === 'lunas' ? 'selected' : ''}>Sudah lunas</option>
        <option value="kosong" ${f.status === 'kosong' ? 'selected' : ''}>Tanpa tagihan</option>
      </select></div>
      <div class="field grow"><label>Cari santri</label><input id="r-q" value="${esc(f.q)}" placeholder="nama atau NIS…"></div>
      <button class="btn" id="r-reset">Reset</button>
      <button class="btn" id="r-csv">⤓ CSV</button>
    </div>

    <div class="card">
      <div class="card-head"><h3>Rekap Pembayaran per Santri (${rows.length})</h3><span class="muted">${scopeLabel} • geser ke samping untuk semua jenis iuran</span></div>
      <div class="table-wrap">
        ${rows.length ? `<table class="tbl-santri">
          <thead><tr>${thHtml}</tr></thead>
          <tbody>${tbody}</tbody>
          ${tfoot}
        </table>` : `<div class="empty"><div class="empty-ico">🔍</div><p>Tidak ada santri ditemukan pada filter ini.</p></div>`}
      </div>
    </div>`;

  let tId; $('#r-q').oninput = () => { clearTimeout(tId); tId = setTimeout(() => { STATE.rekap.q = $('#r-q').value.trim(); pageRekap(); }, 400); };
  ['r-periode', 'r-kelas', 'r-status'].forEach(id => $('#' + id).onchange = () => {
    STATE.rekap = { periode: $('#r-periode').value, kelas: $('#r-kelas').value, status: $('#r-status').value, q: $('#r-q').value.trim() };
    pageRekap();
  });
  $('#r-reset').onclick = () => { STATE.rekap = { periode: 'kumulatif' }; pageRekap(); };
  $('#r-csv').onclick = () => {
    const head = ['No', 'Nama', 'Kelas'].concat(showCols.map(j => j.nama)).concat(['Terbayar', 'Sisa']);
    const lines = [head.join(';')];
    rows.forEach((s, i) => {
      const rt = rowMap[s.id] || { bayar: 0, sisa: 0 };
      const cells = showCols.map(j => {
        const c = agg[s.id + '|' + j.id];
        if (!c) return '';
        return c.sisa <= 0 ? c.bayar : (c.bayar <= 0 ? 'BELUM ' + c.sisa : c.bayar + ' (sisa ' + c.sisa + ')');
      });
      lines.push([i + 1, `"${String(s.nama).replace(/"/g, '""')}"`, s.kelas].concat(cells).concat([rt.bayar, rt.sisa]).join(';'));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rekap-pembayaran-${today()}.csv`;
    a.click();
  };
  if ($('#rk-jurnal')) $('#rk-jurnal').onclick = () => {
    STATE.jurnal.arah = 'masuk';
    if ((location.hash.split('?')[0] || '') === '#/jurnal') pageJurnal();
    else location.hash = '#/jurnal';
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
   KWITANSI PENERIMAAN (BKM) + KIRIM WHATSAPP
   ========================================================= */
function kwReceiptHTML(x, set) {
  if (!x) return `<div class="empty"><div class="empty-ico">🧾</div><p>Pilih salah satu BKM pada daftar di samping — kwitansi penerimaan akan tampil di sini.</p></div>`;
  const items = Array.isArray(x.items) && x.items.length ? x.items
    : [{ label_tagihan: x.label_tagihan || x.keterangan || x.akun || 'Pembayaran iuran', nominal: x.nominal }];
  const kek = Array.isArray(x.kekurangan) ? x.kekurangan : [];
  const [namaAtas, namaBawah] = namaSplit(set.nama_pesantren);
  const ket = x.keterangan || x.label_tagihan || '-';
  const via = x.jenis_transaksi || 'Cas';
  const foto = x.bukti_transfer || '';
  const rowRinci = (lbl, n) => `<tr><td class="k">${esc(lbl)}</td><td class="c">:</td><td class="c rp">Rp</td><td class="n">${angkaKw(n)}</td></tr>`;
  const totalKek = Number(x.kekurangan_total) || kek.reduce((a, b) => a + (Number(b.nominal) || 0), 0);
  return `
  <div class="kw-receipt kw2 kw-bkm${foto ? ' kw-ada-side' : ''}">
    <div class="kw2-head">
      <div class="kw2-logo">${set.logo ? `<img src="${esc(set.logo)}" alt="Logo">` : esc((set.logo_teks || 'PP').toUpperCase().slice(0, 3))}</div>
      <div class="kw2-kop"><span>${esc(namaAtas)}</span><strong>${esc(namaBawah)}</strong></div>
      <div class="kw2-no"><span>Nomor Bukti Kas Masuk :</span><strong>${esc(x.no_bkm)}</strong></div>
    </div>
    <div class="kw2-main">
      <div class="kw2-sec">Keterangan dan Rincian</div>
      <table class="kw2-info"><tbody>
        <tr>
          <td class="k">Nama</td><td class="c">:</td><td class="v">${esc(x.nama || '-')}</td>
          <td class="k k2">Kelas</td><td class="c">:</td><td class="v v2">${esc(x.kelas || '-')}</td>
        </tr>
        <tr>
          <td class="k">Ket</td><td class="c">:</td><td class="v">${esc(ket)}</td>
          <td class="k k2">Via</td><td class="c">:</td><td class="v v2">${esc(via)}</td>
        </tr>
      </tbody></table>
      <table class="kw2-rinci"><tbody>
        ${items.map(i => rowRinci(i.label_tagihan || i.akun || 'Transaksi', i.nominal)).join('')}
        <tr class="kw2-jumlah"><td class="k">Jumlah</td><td class="c">:</td><td class="c rp">Rp</td><td class="n">${angkaKw(x.nominal)}</td></tr>
      </tbody></table>
      <div class="kw2-terbilang"><span>Terbilang</span><span class="c">:</span><em>${esc(terbilangRapi(x.nominal))}</em></div>
      ${kek.length ? `
      <div class="kw2-band">Kekurangan Biaya Pendidikan</div>
      <div class="kw2-band2">Keterangan dan Rincian</div>
      <table class="kw2-rinci"><tbody>
        ${kek.map(k => rowRinci(k.nama, k.nominal)).join('')}
        <tr class="kw2-jumlah"><td class="k">Total Kekurangan Biaya Pendidikan</td><td class="c">:</td><td class="c rp">Rp</td><td class="n">${angkaKw(totalKek)}</td></tr>
      </tbody></table>` : ''}
      <div class="kw2-foot">
        <div class="kw2-quote">
          <div class="kw2-ar1">جزاك الله خيرًا</div>
          <div class="kw2-ar2">Jazakallahu Khairan</div>
          <div class="kw2-ar3">الْمَالُ وَالْبَنُونَ زِينَةُ الْحَيَاةِ الدُّنْيَا وَالْبَاقِيَاتُ الصَّالِحَاتُ خَيْرٌ عِنْدَ رَبِّكَ ثَوَابًا وَخَيْرٌ أَمَلًا</div>
          <div class="kw2-id">"Harta dan anak-anak adalah perhiasan kehidupan dunia tetapi amalan-amalan yang kekal lagi saleh adalah lebih baik pahalanya di sisi Tuhanmu serta lebih baik untuk menjadi harapan." (QS. Al-Kahf: 46)</div>
        </div>
        <div class="kw2-sign">
          <div class="kw2-tgl">${esc([set.kota, tglPanjang(x.tanggal)].filter(Boolean).join(', '))}</div>
          <div class="kw2-jab">Bendahara,</div>
          <div class="kw2-ttdrow">
            ${set.cap ? `<img class="kw2-cap" src="${esc(set.cap)}" alt="Cap pesantren">` : ''}
            <div class="kw2-ttdcol">
              <div class="kw2-ttdline">${set.ttd_bendahara ? `<img class="kw2-ttd" src="${esc(set.ttd_bendahara)}" alt="Tanda tangan bendahara">` : ''}</div>
              <strong>${esc(set.nama_bendahara || set.nama_pesantren)}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
    ${foto ? `<div class="kw2-side">
      <div class="kw2-side-title">Bukti Transfer</div>
      <div class="kw2-side-body"><img src="${esc(foto)}" alt="Bukti transfer"></div>
    </div>` : ''}
  </div>`;
}

/* Gambar PNG kwitansi BKM — format baru: kop hijau, rincian, kekurangan, footer */
async function kwitansiCanvas(x, set) {
  const items = Array.isArray(x.items) && x.items.length ? x.items
    : [{ label_tagihan: x.label_tagihan || x.keterangan || x.akun || 'Pembayaran iuran', nominal: x.nominal }];
  const kek = Array.isArray(x.kekurangan) ? x.kekurangan : [];
  const ketStr = x.keterangan || x.label_tagihan || '-';
  const via    = x.jenis_transaksi || 'Cas';
  const totalKek = Number(x.kekurangan_total) || kek.reduce((a, b) => a + (Number(b.nominal) || 0), 0);

  /* muat gambar logo, TTD, cap & bukti transfer */
  const muatImg = (src) => new Promise(res => {
    if (!src) return res(null);
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
  const [imLogo, imTtd, imCap, imBukti] = await Promise.all([muatImg(set.logo), muatImg(set.ttd_bendahara), muatImg(set.cap), muatImg(x.bukti_transfer)]);

  const HIJAU = '#17512b', HIJAU2 = '#2f7a41', LEMBUT = '#e4f0e0', AKSEN = '#8fd67e';
  const TEKS = '#0f2e1a', TEKS2 = '#3f5b46', GARIS = '#b9cfc0';
  const W = 880, S = 2;
  const M = 20;                        // margin isi
  const SIDE = imBukti ? 240 : 0;      // lebar kolom foto bukti transfer
  const CW = W - SIDE;                 // lebar kolom kiri
  const x0 = M, wid = CW - M * 2, xEnd = x0 + wid, colK = x0 + Math.round(wid * 0.42);
  const [nAtas, nBawah] = namaSplit(set.nama_pesantren);
  const ARABIC = "'Scheherazade New', 'Traditional Arabic', 'Arabic Typesetting', serif";

  /* ---- tinggi isi kwitansi (dihitung dulu) ---- */
  let h = 66 + 34 + 72;                        // kop + judul section + blok info
  h += 26 * items.length + 44 + 30;            // rincian + jumlah + terbilang
  if (kek.length) { h += 6 + 30 + 26 + 26 * kek.length + 42; }   // band + rincian + total
  h += 178 + 14;                               // footer (quote + tanda tangan) + padding
  const natH = h;

  /* ukuran kwitansi: sepertiga halaman — maksimal setengah halaman (A4 210 x 297 mm) */
  const MIN_H = Math.round(W * 99 / 210);
  const MAX_H = Math.round(W * 148.5 / 210);
  const LH = Math.max(natH, MIN_H);
  const H  = Math.min(LH, MAX_H);
  const sk = natH > MAX_H ? MAX_H / natH : 1;

  const cv = document.createElement('canvas');
  cv.width = W * S; cv.height = H * S;
  const g = cv.getContext('2d');
  g.scale(S, S);
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  if (sk < 1) { g.translate((W - W * sk) / 2, 0); g.scale(sk, sk); }

  const setFont = (o) => {
    o = o || {};
    g.font = `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${o.size || 14}px ${o.font || "'Segoe UI', Arial, sans-serif"}`;
    g.fillStyle = o.color || TEKS;
    g.textAlign = o.align || 'left';
    g.textBaseline = o.base || 'alphabetic';
  };
  const txt = (s, px, py, o) => { setFont(o); g.fillText(String(s ?? ''), px, py); };
  const kotak = (px, py, w2, hh, col) => { g.fillStyle = col; g.fillRect(px, py, w2, hh); };
  const garis = (ax, ay, bx, by, w2, col) => {
    g.beginPath(); g.lineWidth = w2 || 1; g.strokeStyle = col || TEKS;
    g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
  };
  const bungkus = (s, maxW, o) => {
    setFont(o);
    const words = String(s ?? '').split(/\s+/);
    const out = []; let ln = '';
    for (const wd of words) {
      const t = ln ? ln + ' ' + wd : wd;
      if (g.measureText(t).width > maxW && ln) { out.push(ln); ln = wd; } else { ln = t; }
    }
    if (ln) out.push(ln);
    return out;
  };
  const potong = (s, maxW, o) => {
    setFont(o);
    let t = String(s ?? '');
    if (g.measureText(t).width <= maxW) { return t; }
    while (t.length > 1 && g.measureText(t + '…').width > maxW) { t = t.slice(0, -1); }
    return t + '…';
  };

  /* ---------- kop hijau (lebar penuh) ---------- */
  kotak(0, 0, W, 66, HIJAU);
  if (imLogo) {
    g.drawImage(imLogo, 16, 11, 44, 44);
  } else {
    kotak(16, 11, 44, 44, '#ffffff');
    txt((set.logo_teks || 'PP').toUpperCase().slice(0, 3), 38, 34, { bold: true, size: 15, align: 'center', base: 'middle', color: HIJAU });
  }
  txt(nAtas, 72, 28, { size: 13.5, color: '#e7f1e8' });
  txt(String(nBawah).toUpperCase(), 72, 52, { bold: true, size: 21, color: '#ffffff' });
  txt('Nomor Bukti Kas Masuk :', W - M, 26, { size: 12, align: 'right', color: '#cfe3d2' });
  txt(x.no_bkm, W - M, 52, { bold: true, size: 19, align: 'right', color: '#ffffff' });

  let y = 66;

  /* ---------- judul section ---------- */
  txt('Keterangan dan Rincian', x0 + wid / 2, y + 26, { bold: true, size: 15, align: 'center', color: HIJAU });
  y += 36;

  /* ---------- blok info (Nama/Kelas · Ket/Via) ---------- */
  kotak(x0, y, wid, 68, LEMBUT);
  const c2 = x0 + Math.round(wid * 0.56);
  const infoRow = (lbl, val, ly, cx, maxW) => {
    txt(lbl, cx, ly, { bold: true, size: 13, color: HIJAU });
    txt(':', cx + 76, ly, { size: 13, color: TEKS });
    txt(potong(val, maxW, { size: 13 }), cx + 90, ly, { size: 13, color: TEKS });
  };
  infoRow('Nama', x.nama || '-', y + 27, x0 + 12, c2 - x0 - 104);
  infoRow('Kelas', x.kelas || '-', y + 27, c2, xEnd - c2 - 104);
  infoRow('Ket', ketStr, y + 54, x0 + 12, c2 - x0 - 104);
  infoRow('Via', via, y + 54, c2, xEnd - c2 - 104);
  y += 68 + 6;

  /* ---------- rincian transaksi ---------- */
  const barisRinci = (lbl, n, bold) => {
    const o = { size: 13.5, bold: !!bold };
    txt(potong(lbl, colK - x0 - 12, o), x0, y + 18, o);
    txt(':', colK, y + 18, o);
    txt('Rp', x0 + wid - 140, y + 18, { ...o, align: 'right' });
    txt(angkaKw(n), x0 + wid, y + 18, { ...o, size: 14.5, align: 'right' });
    y += 26;
  };
  items.forEach(i => barisRinci(i.label_tagihan || i.akun || 'Transaksi', i.nominal, false));

  /* jumlah */
  kotak(x0, y, wid, 38, AKSEN);
  txt('Jumlah', x0 + 12, y + 25, { bold: true, size: 14.5 });
  txt(':', colK, y + 25, { bold: true, size: 14.5 });
  txt('Rp', x0 + wid - 140, y + 25, { bold: true, size: 14.5, align: 'right' });
  txt(angkaKw(x.nominal), x0 + wid - 12, y + 25, { bold: true, size: 16.5, align: 'right' });
  y += 38 + 8;

  /* terbilang */
  txt('Terbilang', x0, y + 20, { bold: true, size: 13.5 });
  txt(':', x0 + 80, y + 20, { size: 13.5 });
  txt(terbilangRapi(x.nominal), x0 + 94, y + 20, { italic: true, size: 13.5, color: TEKS2 });
  y += 30;

  /* ---------- kekurangan biaya pendidikan ---------- */
  if (kek.length) {
    y += 6;
    kotak(x0, y, wid, 30, HIJAU);
    txt('Kekurangan Biaya Pendidikan', x0 + wid / 2, y + 20, { bold: true, size: 14.5, align: 'center', color: '#ffffff' });
    y += 30;
    kotak(x0, y, wid, 26, HIJAU2);
    txt('Keterangan dan Rincian', x0 + wid / 2, y + 18, { bold: true, size: 12.5, align: 'center', color: '#ffffff' });
    y += 26;
    kek.forEach(k => barisRinci(k.nama, k.nominal, false));
    kotak(x0, y, wid, 42, AKSEN);
    txt('Total Kekurangan Biaya Pendidikan', x0 + 12, y + 27, { bold: true, size: 13.5 });
    txt(':', colK + 60, y + 27, { bold: true, size: 13.5 });
    txt('Rp', x0 + wid - 140, y + 27, { bold: true, size: 13.5, align: 'right' });
    txt(angkaKw(totalKek), x0 + wid - 12, y + 27, { bold: true, size: 15.5, align: 'right' });
    y += 42 + 6;
  }

  /* ---------- footer: terima kasih + ayat | tanda tangan ---------- */
  y += 8;
  const footY = y;
  const qw = Math.min(Math.round(wid * 0.60), 460);
  const qx = x0 + qw / 2;
  txt('جزاك الله خيرًا', qx, footY + 34, { font: ARABIC, size: 30, align: 'center', color: TEKS });
  txt('Jazakallahu Khairan', qx, footY + 52, { size: 11, align: 'center', color: TEKS2 });
  const AYAT = 'الْمَالُ وَالْبَنُونَ زِينَةُ الْحَيَاةِ الدُّنْيَا وَالْبَاقِيَاتُ الصَّالِحَاتُ خَيْرٌ عِنْدَ رَبِّكَ ثَوَابًا وَخَيْرٌ أَمَلًا';
  let szA = 19;
  setFont({ font: ARABIC, size: szA });
  while (szA > 11 && g.measureText(AYAT).width > qw) { szA -= 1; setFont({ font: ARABIC, size: szA }); }
  txt(AYAT, qx, footY + 84, { font: ARABIC, size: szA, align: 'center', color: TEKS });
  const TRAD = '"Harta dan anak-anak adalah perhiasan kehidupan dunia tetapi amalan-amalan yang kekal lagi saleh adalah lebih baik pahalanya di sisi Tuhanmu serta lebih baik untuk menjadi harapan." (QS. Al-Kahf: 46)';
  bungkus(TRAD, qw, { size: 12.5 }).forEach((ln, i) => txt(ln, qx, footY + 110 + i * 17, { size: 12.5, align: 'center', color: TEKS2 }));

  /* tanda tangan bendahara (kanan bawah) — cap besar geser kanan, ttd sedikit lebih besar */
  const xR = x0 + wid, lebarTtd = 180;
  const lineY = footY + 128;
  txt([set.kota, tglPanjang(x.tanggal)].filter(Boolean).join(', '), xR, footY + 24, { size: 13.5, align: 'right', bold: true });
  txt('Bendahara,', xR, footY + 50, { size: 13.5, align: 'right' });
  garis(xR - lebarTtd, lineY, xR, lineY, 1.5, TEKS);
  if (imTtd) {
    const tw = 164, th = Math.min(74, tw * imTtd.height / imTtd.width);
    g.drawImage(imTtd, xR - lebarTtd + (lebarTtd - tw) / 2, lineY - th - 6, tw, th);
  }
  if (imCap) {
    const cw = 124, ch = Math.min(124, cw * imCap.height / imCap.width);
    g.globalAlpha = 0.9;
    g.drawImage(imCap, xR - lebarTtd - cw + 28, footY + 40, cw, ch);
    g.globalAlpha = 1;
  }
  txt(set.nama_bendahara || set.nama_pesantren, xR - lebarTtd / 2, lineY + 26, { bold: true, size: 13.5, align: 'center' });

  /* ---------- kolom foto bukti transfer (kanan) ---------- */
  if (SIDE) {
    garis(CW, 66, CW, LH, 1.5, GARIS);
    txt('Bukti Transfer', CW + SIDE / 2, 66 + 26, { bold: true, size: 14, align: 'center', color: HIJAU });
    const bx = CW + 16, bw = SIDE - 32, by = 66 + 44, bh = LH - by - 18;
    const r = Math.min(bw / imBukti.width, bh / imBukti.height);
    const iw = imBukti.width * r, ih = imBukti.height * r;
    g.drawImage(imBukti, bx + (bw - iw) / 2, by + (bh - ih) / 2, iw, ih);
  }

  /* garis tepi kwitansi (tanpa skala — menempel di tepi kanvas) */
  g.setTransform(S, 0, 0, S, 0, 0);
  g.strokeStyle = HIJAU; g.lineWidth = 3; g.strokeRect(1.5, 1.5, W - 3, H - 3);

  return cv;
}

/* Cetak kwitansi = PNG yang sama dengan tombol Simpan PNG (gambar canvas penuh) */
async function cetakKwitansiCanvas(buatCanvas) {
  let cv;
  try { cv = await buatCanvas(); }
  catch (e) { return toast('Gagal membuat gambar kwitansi: ' + e.message, 'error'); }
  let box = document.getElementById('kw-print-img');
  if (!box) {
    box = document.createElement('div');
    box.id = 'kw-print-img';
    document.body.appendChild(box);
  }
  box.innerHTML = '';
  const img = document.createElement('img');
  img.alt = 'Kwitansi';
  img.src = cv.toDataURL('image/png');
  box.appendChild(img);
  document.body.classList.add('print-kwitansi-img');
  await new Promise(r => { if (img.complete) r(); else { img.onload = r; img.onerror = r; } });
  const bersih = () => {
    document.body.classList.remove('print-kwitansi-img');
    box.remove();
    window.removeEventListener('afterprint', bersih);
  };
  window.addEventListener('afterprint', bersih);
  window.print();
  /* fallback bila afterprint tidak terpicu */
  setTimeout(() => { if (document.body.classList.contains('print-kwitansi-img')) bersih(); }, 8000);
}

/* =========================================================
   KWITANSI BKK (KAS KELUAR) — foto nota atau tanda tangan penerima
   ========================================================= */
function kwBkkHTML(j, set) {
  if (!j) return '';
  const foto = j.bukti_nota || '';
  const ttdP = j.ttd_penerima || '';
  const sisi = foto;                                // kolom kanan: hanya foto nota
  const judulSisi = 'BUKTI TRANSFER / NOTA';
  const penerima = j.dibayarkan || j.nama || '';   // "Dibayarkan kepada" — input manual di Jurnal Kas
  const ket = j.keterangan || '-';
  return `
  <div class="kw-receipt kw2 kw-bkk${sisi ? ' kw-ada-side' : ''}">
    <div class="kw2-head">
      <strong>${esc(set.nama_pesantren)}</strong>
      <span>LEMBAGA SOSIAL, PENDIDIKAN, DAN DAKWAH</span>
      <span>${esc(set.alamat)}</span>
    </div>
    ${sisi ? `<div class="kw2-head-side">${esc(judulSisi)}</div>` : ''}
    <div class="kw2-main">
      <div class="kw2-bandrow"><strong>BUKTI PENGELUARAN KAS</strong><span>${esc(j.no_bkk || '-')}</span></div>
      <div class="kw2-bandrow sub"><span>${esc(set.nama_pesantren)}</span><span>No Nota : ${esc(j.no_bkk || '-')}</span></div>
      <table class="kw2-info bkk"><tbody>
        <tr><td class="k">Jumlah</td><td class="c">:</td><td class="v"><span class="hl">Rp ${angkaKw(j.nominal)}</span></td></tr>
        <tr><td class="k">Terbilang</td><td class="c">:</td><td class="v"><span class="hl">${esc(terbilangRapi(j.nominal))}</span></td></tr>
        <tr><td class="k">Tanggal</td><td class="c">:</td><td class="v">${esc(tglPanjang(j.tanggal))}</td></tr>
        <tr><td class="k">Dibayarkan kepada</td><td class="c">:</td><td class="v">${penerima ? esc(penerima) : '<span class="muted">—</span>'}</td></tr>
      </tbody></table>
      <table class="kw2-tbl"><thead>
        <tr><th>Jenis Pengeluaran</th><th>Saldo Dari</th><th class="num">Jumlah</th><th>Ket</th></tr>
      </thead><tbody>
        <tr><td>${esc(j.akun || '-')}</td><td>${esc(j.sumber_dana || '-')}</td><td class="num">Rp ${angkaKw(j.nominal)}</td><td>${esc(ket)}</td></tr>
      </tbody><tfoot>
        <tr><td><strong>Total</strong></td><td></td><td class="num"><strong>Rp ${angkaKw(j.nominal)}</strong></td><td></td></tr>
      </tfoot></table>
      <div class="kw2-foot bkk">
        <div class="kw2-sign c1">
          <div class="kw2-jab">Mudir</div>
          <div class="kw2-ttdrow one">
            <div class="kw2-ttdcol">
              <div class="kw2-ttdline">${set.ttd_mudir ? `<img class="kw2-ttd" src="${esc(set.ttd_mudir)}" alt="Tanda tangan mudir">` : ''}</div>
              <strong>${esc(set.nama_mudir || '-')}</strong>
            </div>
          </div>
        </div>
        <div class="kw2-sign c2">
          <div class="kw2-jab">Dikeluarkan</div>
          <div class="kw2-ttdrow one">
            ${set.cap ? `<img class="kw2-cap" src="${esc(set.cap)}" alt="Cap pesantren">` : ''}
            <div class="kw2-ttdcol">
              <div class="kw2-ttdline">${set.ttd_bendahara ? `<img class="kw2-ttd" src="${esc(set.ttd_bendahara)}" alt="Tanda tangan bendahara">` : ''}</div>
              <strong>${esc(set.nama_bendahara || set.nama_pesantren)}</strong>
            </div>
          </div>
        </div>
        ${ttdP ? `
        <div class="kw2-sign c3 kw-sign-penerima">
          <div class="kw2-jab">Penerima</div>
          <div class="kw2-ttdrow one">
            <div class="kw2-ttdcol">
              <div class="kw2-ttdline"><img class="kw2-ttd" src="${esc(ttdP)}" alt="Tanda tangan penerima"></div>
              <strong>${esc(penerima || '-')}</strong>
            </div>
          </div>
        </div>` : ''}
      </div>
    </div>
    ${sisi ? `<div class="kw2-side"><div class="kw2-side-body"><img src="${esc(sisi)}" alt="Bukti"></div></div>` : ''}
  </div>`;
}

/* Gambar PNG kwitansi BKK — identik dengan pratinjau HTML kwBkkHTML */
async function kwitansiBkkCanvas(j, set) {
  const foto = j.bukti_nota || '';
  const ttdP = j.ttd_penerima || '';
  const sisi = foto;                                // kolom kanan: hanya foto nota
  const judulSisi = 'BUKTI TRANSFER / NOTA';
  const penerima = j.dibayarkan || j.nama || '';
  const ket = j.keterangan || '-';

  const muatImg = (src) => new Promise(res => {
    if (!src) return res(null);
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
  const [imLogo, imTtdB, imTtdM, imCap, imSisi, imTtdP] = await Promise.all([
    muatImg(set.logo), muatImg(set.ttd_bendahara), muatImg(set.ttd_mudir), muatImg(set.cap), muatImg(sisi), muatImg(ttdP)
  ]);

  const HIJAU = '#17512b', HIJAU2 = '#2f7a41', LEMBUT = '#e4f0e0', AKSEN = '#8fd67e';
  const TEKS = '#0f2e1a', TEKS2 = '#3f5b46', GARIS = '#b9cfc0', KOP_BG = '#1a5c30';
  const W = 880, S = 2;
  const M = 20;
  const SIDE = imSisi ? 240 : 0;
  const CW = W - SIDE;
  const x0 = M, wid = CW - M * 2, xEnd = x0 + wid;

  /* tinggi isi (dihitung dulu) */
  let h = 78;                                   // kop
  if (SIDE) { h += 0; }                         // head-side sejajar kop (grid)
  h += 30 + 28;                                 // bandrow + sub
  h += 28 * 4 + 16;                             // info 4 baris
  h += 30 + 32 + 32 + 30;                       // tabel: header + baris + total + margin
  h += 170 + 16;                                // footer tanda tangan
  const natH = h;

  const MIN_H = Math.round(W * 99 / 210);
  const MAX_H = Math.round(W * 148.5 / 210);
  const LH = Math.max(natH, MIN_H);
  const H  = Math.min(LH, MAX_H);
  const sk = natH > MAX_H ? MAX_H / natH : 1;

  const cv = document.createElement('canvas');
  cv.width = W * S; cv.height = H * S;
  const g = cv.getContext('2d');
  g.scale(S, S);
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  if (sk < 1) { g.translate((W - W * sk) / 2, 0); g.scale(sk, sk); }

  const setFont = (o) => {
    o = o || {};
    g.font = `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${o.size || 14}px ${o.font || "'Segoe UI', Arial, sans-serif"}`;
    g.fillStyle = o.color || TEKS;
    g.textAlign = o.align || 'left';
    g.textBaseline = o.base || 'alphabetic';
  };
  const txt = (s, px, py, o) => { setFont(o); g.fillText(String(s ?? ''), px, py); };
  const kotak = (px, py, w2, hh, col) => { g.fillStyle = col; g.fillRect(px, py, w2, hh); };
  const garis = (ax, ay, bx, by, w2, col) => {
    g.beginPath(); g.lineWidth = w2 || 1; g.strokeStyle = col || TEKS;
    g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
  };
  const potong = (s, maxW, o) => {
    setFont(o);
    let t = String(s ?? '');
    if (g.measureText(t).width <= maxW) return t;
    while (t.length > 1 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  };
  const bungkus = (s, maxW, o) => {
    setFont(o);
    const words = String(s ?? '').split(/\s+/);
    const out = []; let ln = '';
    for (const wd of words) {
      const t = ln ? ln + ' ' + wd : wd;
      if (g.measureText(t).width > maxW && ln) { out.push(ln); ln = wd; } else { ln = t; }
    }
    if (ln) out.push(ln);
    return out;
  };

  /* ---------- kop (kiri, lebar CW) + judul sisi (kanan) ---------- */
  kotak(0, 0, CW, 78, KOP_BG);
  if (imLogo) {
    g.drawImage(imLogo, 16, 17, 44, 44);
  } else {
    kotak(16, 17, 44, 44, '#ffffff');
    txt((set.logo_teks || 'PP').toUpperCase().slice(0, 3), 38, 39, { bold: true, size: 15, align: 'center', base: 'middle', color: HIJAU });
  }
  txt(set.nama_pesantren || '-', CW / 2 + 20, 32, { bold: true, size: 17, align: 'center', color: '#ffffff' });
  txt('LEMBAGA SOSIAL, PENDIDIKAN, DAN DAKWAH', CW / 2 + 20, 50, { size: 12, align: 'center', color: '#dcebdd' });
  txt(set.alamat || '-', CW / 2 + 20, 66, { size: 12, align: 'center', color: '#dcebdd' });

  if (SIDE) {
    kotak(CW, 0, SIDE, 78, AKSEN);
    /* bungkus judul sisi bila panjang */
    setFont({ bold: true, size: 13, color: HIJAU });
    const jsLines = bungkus(judulSisi, SIDE - 20, { bold: true, size: 13, color: HIJAU });
    jsLines.forEach((ln, i) => txt(ln, CW + SIDE / 2, 34 + i * 16, { bold: true, size: 13, align: 'center', color: HIJAU }));
  }

  let y = 78;

  /* ---------- bandrow: BUKTI PENGELUARAN KAS + No Nota ---------- */
  kotak(0, y, CW, 30, HIJAU2);
  txt('BUKTI PENGELUARAN KAS', x0 + 4, y + 20, { bold: true, size: 15, color: '#ffffff' });
  txt(j.no_bkk || '-', xEnd, y + 20, { bold: true, size: 14, align: 'right', color: '#ffffff' });
  y += 30;
  kotak(0, y, CW, 28, HIJAU);
  txt(set.nama_pesantren || '-', x0 + 4, y + 18, { size: 13, color: '#ffffff' });
  txt('No Nota : ' + (j.no_bkk || '-'), xEnd, y + 18, { size: 13, align: 'right', color: '#ffffff' });
  y += 28 + 14;

  /* ---------- info: Jumlah / Terbilang / Tanggal / Dibayarkan ---------- */
  const barisInfo = (lbl, val, hl) => {
    txt(lbl, x0, y + 18, { size: 13.5, color: TEKS });
    txt(':', x0 + 158, y + 18, { size: 13.5, color: TEKS });
    if (hl) {
      setFont({ size: 13.5, bold: true, color: TEKS });
      const tw = g.measureText(val).width;
      kotak(x0 + 170, y + 4, tw + 16, 22, AKSEN);
      txt(val, x0 + 178, y + 19, { size: 13.5, bold: true, color: TEKS });
    } else {
      txt(potong(val, wid - 180, { size: 13.5 }), x0 + 170, y + 18, { size: 13.5, color: TEKS });
    }
    y += 28;
  };
  barisInfo('Jumlah', 'Rp ' + angkaKw(j.nominal), true);
  barisInfo('Terbilang', terbilangRapi(j.nominal), true);
  barisInfo('Tanggal', tglPanjang(j.tanggal), false);
  barisInfo('Dibayarkan kepada', penerima || '—', false);
  y += 6;

  /* ---------- tabel pengeluaran ---------- */
  const colJ = x0, colS = x0 + Math.round(wid * 0.28), colU = x0 + Math.round(wid * 0.55), colK = x0 + Math.round(wid * 0.70);
  const hT = 30;
  kotak(x0, y, wid, hT, HIJAU2);
  txt('Jenis Pengeluaran', colJ + 8, y + 20, { bold: true, size: 12.5, color: '#ffffff' });
  txt('Saldo Dari', colS + 8, y + 20, { bold: true, size: 12.5, color: '#ffffff' });
  txt('Jumlah', colU + 8, y + 20, { bold: true, size: 12.5, color: '#ffffff' });
  txt('Ket', colK + 8, y + 20, { bold: true, size: 12.5, color: '#ffffff' });
  /* garis kolom header */
  [colS, colU, colK].forEach(cx => garis(cx, y, cx, y + hT, 1, HIJAU));
  y += hT;
  const hB = 32;
  kotak(x0, y, wid, hB, '#ffffff');
  garis(x0, y, xEnd, y, 1, GARIS);
  txt(potong(j.akun || '-', colS - colJ - 12, { size: 12.5 }), colJ + 8, y + 20, { size: 12.5 });
  txt(potong(j.sumber_dana || '-', colU - colS - 12, { size: 12.5 }), colS + 8, y + 20, { size: 12.5 });
  txt('Rp ' + angkaKw(j.nominal), colU + 8, y + 20, { size: 12.5 });
  txt(potong(ket, xEnd - colK - 12, { size: 12.5 }), colK + 8, y + 20, { size: 12.5 });
  [colS, colU, colK].forEach(cx => garis(cx, y, cx, y + hB, 1, GARIS));
  garis(x0, y + hB, xEnd, y + hB, 1, GARIS);
  garis(x0, y, x0, y + hB, 1, GARIS);
  garis(xEnd, y, xEnd, y + hB, 1, GARIS);
  y += hB;
  const hF = 30;
  kotak(x0, y, wid, hF, AKSEN);
  txt('Total', colJ + 8, y + 20, { bold: true, size: 13 });
  txt('Rp ' + angkaKw(j.nominal), colU + 8, y + 20, { bold: true, size: 13 });
  [colS, colU, colK].forEach(cx => garis(cx, y, cx, y + hF, 1, HIJAU));
  garis(x0, y, x0, y + hF, 1, HIJAU);
  garis(xEnd, y, xEnd, y + hF, 1, HIJAU);
  garis(x0, y + hF, xEnd, y + hF, 1, HIJAU);
  y += hF + 26;

  /* ---------- tanda tangan: Mudir | Dikeluarkan | Penerima ---------- */
  const kolomTtd = (cx, lebar, jab, nama, imT, withCap) => {
    const cxx = cx;
    txt(jab, cxx, y + 16, { size: 13.5, align: 'center' });
    const lineY = y + 118;
    if (withCap && imCap) {
      const cw = 136, ch = Math.min(136, cw * imCap.height / imCap.width);
      g.globalAlpha = 0.9;
      g.drawImage(imCap, cxx - lebar / 2 - cw + 34, y + 26, cw, ch);
      g.globalAlpha = 1;
    }
    if (imT) {
      const tw = 156, th = Math.min(68, tw * imT.height / imT.width);
      g.drawImage(imT, cxx - tw / 2, lineY - th - 8, tw, th);
    }
    garis(cxx - lebar / 2, lineY, cxx + lebar / 2, lineY, 1.5, TEKS);
    txt(nama || '-', cxx, lineY + 24, { bold: true, size: 13.5, align: 'center' });
  };
  const adaPenerima = !!imTtdP;
  const kiriCx = x0 + wid * (adaPenerima ? 0.18 : 0.28);
  const kananCx = x0 + wid * (adaPenerima ? 0.54 : 0.72);
  kolomTtd(kiriCx, 170, 'Mudir', set.nama_mudir || '-', imTtdM, false);
  kolomTtd(kananCx, 170, 'Dikeluarkan', set.nama_bendahara || set.nama_pesantren || '-', imTtdB, true);
  if (adaPenerima) {
    const ttdPCx = x0 + wid * 0.88;
    txt('Penerima', ttdPCx, y + 16, { size: 13.5, align: 'center' });
    const lineY = y + 118;
    const tw = 150, th = Math.min(64, tw * imTtdP.height / imTtdP.width);
    g.drawImage(imTtdP, ttdPCx - tw / 2, lineY - th - 8, tw, th);
    garis(ttdPCx - 85, lineY, ttdPCx + 85, lineY, 1.5, TEKS);
    txt(penerima || '-', ttdPCx, lineY + 24, { bold: true, size: 13.5, align: 'center' });
  }

  /* ---------- kolom sisi (foto nota) ---------- */
  if (SIDE) {
    garis(CW, 78, CW, LH, 1.5, GARIS);
    const bx = CW + 16, bw = SIDE - 32, by = 78 + 16, bh = LH - by - 16;
    const r = Math.min(bw / imSisi.width, bh / imSisi.height);
    const iw = imSisi.width * r, ih = imSisi.height * r;
    g.drawImage(imSisi, bx + (bw - iw) / 2, by + (bh - ih) / 2, iw, ih);
  }

  /* garis tepi kwitansi (tanpa skala) */
  g.setTransform(S, 0, 0, S, 0, 0);
  g.strokeStyle = HIJAU; g.lineWidth = 3; g.strokeRect(1.5, 1.5, W - 3, H - 3);

  return cv;
}

/** Buka pratinjau kwitansi BKK dari baris Jurnal Kas Keluar (cetak: hanya kwitansi) */
async function bukaKwitansiBKK(id) {
  const j = JLIST.find(x => x.id === id);
  if (!j) return toast('Jurnal tidak ditemukan', 'error');
  let set;
  try { set = await API.get('/api/pengaturan'); }
  catch (e) { return toast('Gagal memuat pengaturan: ' + e.message, 'error'); }
  openModal('🧾 Kwitansi BKK ' + (j.no_bkk || ''), `
    <div class="kw-print-area">${kwBkkHTML(j, set)}</div>`,
    `<button class="btn" onclick="closeModal()">Tutup</button>
     <button class="btn btn-primary" id="kw-bkk-print">🖨️ Cetak Kwitansi</button>
     <button class="btn btn-gold" id="kw-bkk-png">⬇ Simpan PNG</button>`, 720);
  document.body.classList.add('print-modal');
  $('#kw-bkk-print').onclick = () => cetakKwitansiCanvas(() => kwitansiBkkCanvas(j, set));
  $('#kw-bkk-png').onclick = async () => {
    let cv;
    try { cv = await kwitansiBkkCanvas(j, set); }
    catch (e) { return toast('Gagal membuat gambar kwitansi: ' + e.message, 'error'); }
    cv.toBlob(b => {
      if (!b) return toast('Gagal membuat gambar kwitansi', 'error');
      const url = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = url; a.download = 'Kwitansi_' + (j.no_bkk || 'BKK') + '.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast('Kwitansi PNG diunduh');
    }, 'image/png');
  };
}

/* =========================================================
   SKALA CETAK KWITANSI — sepertiga halaman s/d maksimal setengah halaman
   ========================================================= */
function kwSkalaCetak() {
  const MM = 96 / 25.4;
  const tinggiHalaman = (297 - 24) * MM;      // A4 (297 mm) − margin @page 12 mm atas+bawah
  const minH = tinggiHalaman / 3, maxH = tinggiHalaman / 2;
  $$('.kw-receipt').forEach(el => {
    el.style.zoom = ''; el.style.transform = ''; el.style.width = ''; el.style.marginBottom = '';
    if (!el.getClientRects().length) return;
    const h = el.offsetHeight;
    if (!h) return;
    let s = 1;
    if (h > maxH) { s = maxH / h; } else if (h < minH) { s = minH / h; }
    if (Math.abs(s - 1) < 0.03) return;
    if (window.CSS && CSS.supports && CSS.supports('zoom', '1')) {
      el.style.zoom = s;                       // zoom ikut mengatur tinggi tata letak (pembagian halaman benar)
    } else {
      el.style.transform = 'scale(' + s + ')';
      el.style.transformOrigin = 'top left';
      el.style.marginBottom = (h * (s - 1)) + 'px';
    }
    el.style.width = (100 / s) + '%';
  });
}
window.addEventListener('beforeprint', kwSkalaCetak);
window.addEventListener('afterprint', () => $$('.kw-receipt').forEach(el => {
  el.style.zoom = ''; el.style.transform = ''; el.style.width = ''; el.style.marginBottom = '';
}));

async function pageKwitansi() {
  const f = STATE.kwitansi = Object.assign({ q: '', dari: '', sampai: '', pilih: '' }, STATE.kwitansi);
  const qs = new URLSearchParams({ limit: '300' });
  if (f.q) qs.set('q', f.q);
  if (f.dari) qs.set('dari', f.dari);
  if (f.sampai) qs.set('sampai', f.sampai);

  const [data, set] = await Promise.all([
    API.get('/api/kwitansi?' + qs),
    API.get('/api/pengaturan')
  ]);
  const list = Array.isArray(data.list) ? data.list : [];
  const it = list.find(x => x.no_bkm === f.pilih) || list[0] || null;
  f.pilih = it ? it.no_bkm : '';

  $('#content').innerHTML = `
    <div class="filters card card-pad">
      <div class="field grow"><label>Cari</label><input id="k-q" value="${esc(f.q)}" placeholder="No BKM, nama, kelas, akun, atau tagihan…"></div>
      <div class="field"><label>Dari</label><input type="date" id="k-dari" value="${f.dari}"></div>
      <div class="field"><label>Sampai</label><input type="date" id="k-sampai" value="${f.sampai}"></div>
      <button class="btn" id="k-reset">Reset</button>
      <button class="btn" id="k-refresh">🔄 Muat Ulang</button>
      <button class="btn btn-gold" id="k-cetak-top">🖨️ Cetak Kwitansi</button>
    </div>

    <div class="grid kw-grid">
      <div class="card no-print">
        <div class="card-head"><h3>📒 Daftar Penerimaan / BKM (${list.length})</h3><span class="muted">Klik baris utk pilih kwitansi</span></div>
        <div class="table-wrap kw-list">
          ${list.length ? `<table>
            <thead><tr><th>Tanggal</th><th>No BKM</th><th>Nama</th><th>No WA Wali</th><th>Untuk</th><th class="num">Nominal</th></tr></thead>
            <tbody>${list.map(x => `<tr class="kw-row ${it && x.no_bkm === it.no_bkm ? 'on' : ''}" data-kw="${esc(x.no_bkm)}">
              <td class="nowrap">${tglLabel(x.tanggal)}</td>
              <td class="nowrap"><strong>${esc(x.no_bkm)}</strong></td>
              <td>${esc(x.nama)}${x.kelas ? ` <span class="muted">· ${esc(x.kelas)}</span>` : ''}</td>
              <td class="nowrap muted">${esc(x.no_wa || x.no_wa_santri || '—')}</td>
              <td>${esc(x.label_tagihan || x.keterangan || x.akun || '-')}${x.jumlah_item > 1 ? ` <span class="badge sebagian">${x.jumlah_item} trx</span>` : ''}${x.bukti_transfer ? ' <span class="bukti-mark" title="Ada foto bukti transfer">📷</span>' : ''}</td>
              <td class="num pos">${fmt(x.nominal)}</td>
            </tr>`).join('')}</tbody>
          </table>` : `<div class="empty"><div class="empty-ico">🧾</div><p>Belum ada penerimaan (BKM) pada filter ini.<br>Entry kas masuk dulu di <strong>Jurnal Kas</strong>.</p></div>`}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>🧾 Pratinjau Kwitansi</h3><span class="muted">${it ? esc(it.no_bkm) + ' — ' + esc(it.nama) : 'belum dipilih'}</span></div>
        <div class="card-pad">${kwReceiptHTML(it, set)}</div>
        <div class="flex wrap-actions no-print" style="padding:0 20px 18px">
          <button class="btn" id="k-cetak">🖨️ Cetak</button>
          <button class="btn" id="k-png" ${it ? '' : 'disabled'}>⬇ Simpan PNG</button>
          <button class="btn btn-primary" id="k-wa" ${it ? '' : 'disabled'}>📱 Kirim WhatsApp</button>
          <button class="btn" id="k-riwayat">🕓 Riwayat Kirim</button>
        </div>
      </div>
    </div>

    <div class="card mt no-print" id="kw-riwayat" hidden>
      <div class="card-head"><h3>🕓 Riwayat Kirim WhatsApp</h3><button class="btn btn-sm" id="k-riwayat-close">Tutup</button></div>
      <div class="table-wrap" id="k-riwayat-body"></div>
    </div>`;

  /* --- filter --- */
  let tId;
  $('#k-q').oninput = () => { clearTimeout(tId); tId = setTimeout(() => { f.q = $('#k-q').value.trim(); pageKwitansi(); }, 400); };
  ['k-dari', 'k-sampai'].forEach(id => $('#' + id).onchange = () => { f.dari = $('#k-dari').value; f.sampai = $('#k-sampai').value; pageKwitansi(); });
  $('#k-reset').onclick = () => { STATE.kwitansi = { pilih: f.pilih }; pageKwitansi(); };
  $('#k-refresh').onclick = () => pageKwitansi();
  $$('[data-kw]').forEach(r => r.onclick = () => { f.pilih = r.dataset.kw; pageKwitansi(); });

  /* --- riwayat --- */
  const muatRiwayat = async () => {
    const box = $('#k-riwayat-body');
    try {
      const r = await API.get('/api/kwitansi?act=riwayat');
      const rl = Array.isArray(r.list) ? r.list : [];
      box.innerHTML = rl.length ? `<table>
        <thead><tr><th>Dibuat</th><th>No BKM</th><th>Nama</th><th>No HP</th><th>Status</th><th>Catatan</th></tr></thead>
        <tbody>${rl.map(a => `<tr>
          <td class="nowrap">${a.dibuat ? tglLabel(String(a.dibuat).slice(0, 10)) : '-'} <span class="muted">${String(a.dibuat || '').slice(11, 16)}</span></td>
          <td class="nowrap"><strong>${esc(a.no_bkm)}</strong></td>
          <td>${esc(a.nama)}</td>
          <td class="nowrap">${esc(a.no_hp)}</td>
          <td><span class="badge ${a.status === 'terkirim' ? 'lunas' : a.status === 'gagal' ? 'belum' : 'sebagian'}">${esc(a.status || '-')}</span></td>
          <td class="muted">${esc(a.catatan || '')}</td>
        </tr>`).join('')}</tbody></table>` : `<div class="empty"><div class="empty-ico">🕓</div><p>Belum ada riwayat kirim.</p></div>`;
    } catch (e) { box.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; }
  };
  $('#k-riwayat').onclick = () => { $('#kw-riwayat').hidden = false; muatRiwayat(); $('#kw-riwayat').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
  $('#k-riwayat-close').onclick = () => { $('#kw-riwayat').hidden = true; };

  /* --- cetak: sama persis dengan PNG unduhan (gambar canvas) --- */
  const cetakIni = () => {
    if (!it) return toast('Pilih dulu salah satu BKM', 'error');
    return cetakKwitansiCanvas(() => kwitansiCanvas(it, set));
  };
  const btnCetak = $('#k-cetak');
  if (btnCetak) btnCetak.onclick = cetakIni;
  const btnCetakTop = $('#k-cetak-top');
  if (btnCetakTop) btnCetakTop.onclick = cetakIni;

  /* --- simpan PNG --- */
  const btnPng = $('#k-png');
  if (btnPng && it) btnPng.onclick = async () => {
    let cv;
    try { cv = await kwitansiCanvas(it, set); }
    catch (e) { return toast('Gagal membuat gambar kwitansi: ' + e.message, 'error'); }
    cv.toBlob(b => {
      if (!b) return toast('Gagal membuat gambar kwitansi', 'error');
      const url = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = url; a.download = 'Kwitansi_' + it.no_bkm + '.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast('Kwitansi PNG diunduh');
    }, 'image/png');
  };

  /* --- kirim WhatsApp --- */
  const btnWa = $('#k-wa');
  if (btnWa && it) btnWa.onclick = () => {
    const pesanDefault = `Assalamualaikum.${it.nama ? ' ' + it.nama : ''}\nTerlampir kwitansi penerimaan No. ${it.no_bkm} sebesar ${fmt(it.nominal)}${it.label_tagihan ? ' untuk ' + it.label_tagihan : ''}.\n- ${set.nama_pesantren}`;
    openModal('Kirim Kwitansi ' + it.no_bkm, `
      <div class="form-grid">
        <div class="field full"><label>Nama Penerima</label><input id="w-nama" value="${esc(it.nama)}"></div>
        <div class="field full"><label>No. WA Wali <span class="muted">(otomatis dari Data Santri)</span></label><input id="w-hp" value="${esc(it.no_wa || it.no_wa_santri || '')}" placeholder="08123456789"></div>
        <div class="field full"><label>Pesan</label><textarea id="w-pesan" style="min-height:110px">${esc(pesanDefault)}</textarea></div>
        <div class="field full">
          <label class="gen-kolom" style="text-transform:none;font-size:13px;color:var(--text)">
            <input type="checkbox" id="w-gambar" ${it.ada_gambar ? '' : 'checked'}> Lampirkan gambar kwitansi (PNG)
          </label>
          <span class="hint">Gambar disimpan di server & diambil bot dari antrean — pastikan folder <code>data/kwitansi</code> bisa ditulis.</span>
        </div>
      </div>
      <p class="hint muted" style="margin-top:10px">Pilihan <strong>Antre ke Bot</strong> menyimpan pesan ke antrean server (diproses bot WA Web). <strong>WhatsApp (wa.me)</strong> membuka aplikasi WhatsApp; <strong>WhatsApp Web</strong> membuka web.whatsapp.com di browser — gambar dikirim manual.</p>`,
      `<button class="btn" onclick="closeModal()">Batal</button>
       <button class="btn" id="w-web">🖥️ WhatsApp Web</button>
       <button class="btn" id="w-open">📱 WhatsApp (wa.me)</button>
       <button class="btn btn-primary" id="w-antre">📤 Antre ke Bot</button>`, 560);

    /* normalisasi nomor: 08xx → 628xx, 8xx → 628xx */
    const normWa = (hp) => {
      let n = String(hp || '').replace(/\D/g, '');
      if (n.startsWith('0')) n = '62' + n.slice(1);
      else if (n.startsWith('8')) n = '62' + n;
      return n;
    };
    const bukaWa = (base) => {
      const hp = ($('#w-hp').value || '').trim();
      if (!hp) return toast('Nomor WhatsApp wajib diisi', 'error');
      const n = normWa(hp);
      if (!n || n.length < 10) return toast('Nomor WhatsApp tidak valid', 'error');
      window.open(base + '?phone=' + n + '&text=' + encodeURIComponent($('#w-pesan').value), '_blank');
    };
    $('#w-web').onclick  = () => bukaWa('https://web.whatsapp.com/send');
    $('#w-open').onclick = () => bukaWa('https://wa.me');
    $('#w-antre').onclick = async () => {
      const hp = ($('#w-hp').value || '').trim();
      if (!hp) return toast('Nomor WhatsApp wajib diisi', 'error');
      const lampir = $('#w-gambar').checked;
      try {
        const btn = $('#w-antre'); btn.disabled = true; btn.textContent = 'Mengirim…';
        const gambar = lampir ? (await kwitansiCanvas(it, set)).toDataURL('image/png') : '';
        await API.post('/api/kwitansi', {
          act: 'kirim-wa', no_bkm: it.no_bkm,
          nama: $('#w-nama').value.trim(), no_hp: hp,
          pesan: $('#w-pesan').value.trim(), gambar
        });
        closeModal();
        if (lampir) await pageKwitansi();
        toast('Kwitansi masuk antrean kirim WhatsApp');
        const rw = $('#kw-riwayat');
        if (rw) { rw.hidden = false; muatRiwayat(); }
      } catch (e) { toast(e.message, 'error'); const b = $('#w-antre'); if (b) { b.disabled = false; b.textContent = '📤 Antre ke Bot'; } }
    };
  };
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
            <div class="field"><label>Kota (footer kwitansi)</label><input id="p-kota" value="${esc(p.kota || '')}" placeholder="Ngawen"><span class="hint">Dipakai utk "Kota, tanggal" pada kwitansi.</span></div>
            <div class="field"><label>Saldo Awal Kas (Rp)</label><input type="number" id="p-saldo" value="${p.saldo_awal}" step="1000"><span class="hint">Saldo sebelum semua transaksi dicatat.</span></div>

            <div class="field full"><label>🖼️ Logo Pesantren (gambar)</label>
              <div class="upload-row">
                <img class="up-prev" id="p-logo-prev" src="${esc(p.logo || '')}" ${p.logo ? '' : 'hidden'} alt="logo">
                <input type="file" id="p-logo-file" accept="image/*" hidden>
                <button type="button" class="btn btn-sm" id="p-logo-pick">Pilih gambar logo</button>
                <span class="hint">Dipakai di kop kwitansi — PNG transparan disarankan.</span>
              </div>
            </div>
            <div class="field"><label>Nama Mudir</label><input id="p-mudir" value="${esc(p.nama_mudir || '')}" placeholder="nama mudir pesantren"></div>
            <div class="field"><label>Nama Bendahara</label><input id="p-bendahara" value="${esc(p.nama_bendahara || '')}" placeholder="nama bendahara"></div>
            <div class="field"><label>✍️ Tanda Tangan Mudir</label>
              <div class="upload-row">
                <img class="up-prev ttd" id="p-ttdm-prev" src="${esc(p.ttd_mudir || '')}" ${p.ttd_mudir ? '' : 'hidden'} alt="ttd mudir">
                <input type="file" id="p-ttdm-file" accept="image/*" hidden>
                <button type="button" class="btn btn-sm" id="p-ttdm-pick">Pilih gambar TTD</button>
              </div>
            </div>
            <div class="field"><label>✍️ Tanda Tangan Bendahara</label>
              <div class="upload-row">
                <img class="up-prev ttd" id="p-ttdb-prev" src="${esc(p.ttd_bendahara || '')}" ${p.ttd_bendahara ? '' : 'hidden'} alt="ttd bendahara">
                <input type="file" id="p-ttdb-file" accept="image/*" hidden>
                <button type="button" class="btn btn-sm" id="p-ttdb-pick">Pilih gambar TTD</button>
              </div>
            </div>
            <div class="field full"><label>⭕ Foto / Gambar Cap</label>
              <div class="upload-row">
                <img class="up-prev cap" id="p-cap-prev" src="${esc(p.cap || '')}" ${p.cap ? '' : 'hidden'} alt="cap">
                <input type="file" id="p-cap-file" accept="image/*" hidden>
                <button type="button" class="btn btn-sm" id="p-cap-pick">Pilih gambar cap</button>
                <span class="hint">Cap ditempel otomatis di kwitansi bersama tanda tangan bendahara.</span>
              </div>
            </div>
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

    <div class="card mt">
      <div class="card-head"><h3>📱 Login WhatsApp Bot</h3><span class="badge belum" id="wa-status">…</span></div>
      <div class="card-pad wa-login">
        <div class="wa-qr-box">
          <div id="wa-qr" class="wa-qr-cv"><div class="wa-qr-ph">Menunggu QR<br>dari bot…</div></div>
          <p class="hint" id="wa-qr-hint" style="text-align:center;margin:8px 0 0" hidden>Menunggu QR dari bot…</p>
        </div>
        <div class="wa-side">
          <label style="font-weight:600">🔑 Kode Pairing (8 karakter)</label>
          <div class="wa-kode" id="wa-kode">— — — — — — — —</div>
          <div class="field mt">
            <label>Nomor Telepon WhatsApp (HP yang akan ditautkan)</label>
            <input id="wa-no" placeholder="081234567890" inputmode="tel" autocomplete="tel">
          </div>
          <div class="flex" style="gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary" id="wa-gen">🔑 Minta Kode Pairing</button>
            <button class="btn" id="wa-refresh">🔄 Muat Status</button>
            <button class="btn btn-danger" id="wa-logout">⏏️ Keluar</button>
          </div>
          <p class="hint"><strong>Cara 1 — Scan QR:</strong> buka WhatsApp di HP → <strong>Perangkat tertaut → Tautkan perangkat</strong>, lalu scan QR di kotak kiri.</p>
          <p class="hint"><strong>Cara 2 — Kode pairing:</strong> isi nomor telepon di atas → klik <strong>Minta Kode Pairing</strong> → tunggu kode 8 karakter muncul → di HP buka WhatsApp → <strong>Perangkat tertaut → Tautkan dengan nomor telepon</strong> → masukkan kode itu. Kode pairing <em>hanya bisa dibuat saat bot sedang berjalan</em> (<code>node bot/index.js</code>).</p>
          <p class="hint">Bot WA Web (Baileys) mengirim QR/status ke <code>POST api.php?p=wa</code> dan memproses permintaan kode pairing — QR akan tampil di kotak ini.</p>
          <p class="hint muted" id="wa-updated"></p>
        </div>
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

  /* --- unggah gambar (logo / TTD / cap) --- */
  const pasangUnggah = (pick, file, prev) => {
    const bPick = $('#' + pick), bFile = $('#' + file), bPrev = $('#' + prev);
    if (!bPick || !bFile || !bPrev) return;
    bPick.onclick = () => bFile.click();
    bFile.onchange = () => {
      const f = bFile.files[0]; if (!f) return;
      if (!/^image\//.test(f.type)) return toast('File harus berupa gambar', 'error');
      if (f.size > 2 * 1024 * 1024) return toast('Ukuran gambar maks 2 MB', 'error');
      const fr = new FileReader();
      fr.onload = () => { bPrev.src = fr.result; bPrev.hidden = false; bPrev.dataset.b64 = fr.result; };
      fr.onerror = () => toast('Gagal membaca file', 'error');
      fr.readAsDataURL(f);
      bFile.value = '';
    };
  };
  pasangUnggah('p-logo-pick', 'p-logo-file', 'p-logo-prev');
  pasangUnggah('p-ttdm-pick', 'p-ttdm-file', 'p-ttdm-prev');
  pasangUnggah('p-ttdb-pick', 'p-ttdb-file', 'p-ttdb-prev');
  pasangUnggah('p-cap-pick', 'p-cap-file', 'p-cap-prev');

  $('#p-save').onclick = async () => {
    try {
      const payload = {
        nama_pesantren: $('#p-nama').value.trim(), alamat: $('#p-alamat').value.trim(),
        kota: ($('#p-kota') ? $('#p-kota').value.trim() : ''),
        tahun_ajaran: $('#p-ta').value.trim(), logo_teks: $('#p-logo').value.trim().toUpperCase(),
        saldo_awal: Number($('#p-saldo').value) || 0,
        nama_mudir: ($('#p-mudir') ? $('#p-mudir').value.trim() : ''),
        nama_bendahara: ($('#p-bendahara') ? $('#p-bendahara').value.trim() : '')
      };
      const ambilB64 = (id) => { const el = $(id); return el && el.dataset && el.dataset.b64 ? el.dataset.b64 : ''; };
      const bLogo = ambilB64('#p-logo-prev');   if (bLogo) payload.logo_b64 = bLogo;
      const bTtdM = ambilB64('#p-ttdm-prev');   if (bTtdM) payload.ttd_mudir_b64 = bTtdM;
      const bTtdB = ambilB64('#p-ttdb-prev');   if (bTtdB) payload.ttd_bendahara_b64 = bTtdB;
      const bCap  = ambilB64('#p-cap-prev');    if (bCap)  payload.cap_b64 = bCap;
      await API.put('/api/pengaturan', payload);
      toast('Pengaturan tersimpan'); loadHeader(); refreshSaldo();
    } catch (e) { toast(e.message, 'error'); }
  };

  /* --- login WhatsApp: QR barcode / kode pairing --- */
  const muatWa = async () => {
    try {
      const st = await API.get('/api/wa');
      const badge = $('#wa-status');
      const label = { logout: 'Belum login', menunggu_scan: 'Menunggu scan', meminta_kode: 'Meminta kode…', kode_aktif: 'Kode aktif', login: 'Terhubung' };
      if (badge) {
        badge.textContent = label[st.status] || st.status || '-';
        badge.className = 'badge ' + (st.status === 'login' ? 'lunas'
          : (st.status === 'menunggu_scan' || st.status === 'kode_aktif' || st.status === 'meminta_kode') ? 'sebagian' : 'belum');
      }
      const kd = $('#wa-kode');
      if (kd) kd.textContent = st.kode ? String(st.kode).split('').join(' ') : '— — — — — — — —';
      const inNo = $('#wa-no');
      if (inNo && !inNo.value && st.no) inNo.value = String(st.no);
      const up = $('#wa-updated');
      if (up) up.textContent = [st.no ? 'Nomor bot: ' + st.no : '', st.diperbarui ? 'Terakhir diperbarui: ' + st.diperbarui : ''].filter(Boolean).join(' • ');
      const cv = $('#wa-qr');
      if (cv) {
        const hint = $('#wa-qr-hint');
        if (st.qr) {
          if (hint) hint.hidden = true;
          cv.innerHTML = '';
          if (window.QRCode) {
            try {
              new QRCode(cv, { text: String(st.qr), width: 240, height: 240, colorDark: '#0f172a', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
            } catch (e) { cv.innerHTML = '<div class="wa-qr-ph">QR tidak<br>bisa dirender</div>'; }
          } else {
            cv.innerHTML = '<div class="wa-qr-ph">Pustaka QR<br>tidak termuat</div>';
          }
        } else {
          cv.innerHTML = '<div class="wa-qr-ph">Menunggu QR<br>dari bot…</div>';
          if (hint) { hint.hidden = false; hint.textContent = 'Menunggu QR dari bot — bot mengirim lewat POST api.php?p=wa.'; }
        }
      }
    } catch (e) { toast(e.message, 'error'); }
  };
  muatWa();
  /* QR dari bot dikirim kapan saja — muat ulang otomatis selama halaman terbuka */
  if (window.__waPoll) clearInterval(window.__waPoll);
  window.__waPoll = setInterval(() => {
    if (!$('#wa-qr')) { clearInterval(window.__waPoll); window.__waPoll = null; return; }
    muatWa();
  }, 4000);
  $('#wa-refresh').onclick = muatWa;
  $('#wa-gen').onclick = async () => {
    const no = ($('#wa-no') ? $('#wa-no').value : '').trim();
    if (!no) return toast('Isi nomor telepon WhatsApp dulu', 'error');
    try {
      await API.post('/api/wa', { act: 'pair', no });
      toast('Permintaan kode dikirim — tunggu beberapa detik (bot harus berjalan)');
      muatWa();
    } catch (e) { toast(e.message, 'error'); }
  };
  $('#wa-logout').onclick = async () => {
    try { await API.post('/api/wa', { act: 'logout' }); toast('Sesi WhatsApp direset'); muatWa(); }
    catch (e) { toast(e.message, 'error'); }
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
