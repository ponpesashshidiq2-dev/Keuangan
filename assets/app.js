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
  const tk = tokenSesi();
  if (tk) params.set('auth', tk);   // token ikut di query agar jendela baru & cetak ikut login
  return 'api.php?' + params.toString();
}

/* ---------------- Sesi login ---------------- */
const KUNCI_TOKEN = 'pp_sesi_token';
function tokenSesi() { try { return localStorage.getItem(KUNCI_TOKEN) || ''; } catch (e) { return ''; } }
function simpanToken(t) { try { t ? localStorage.setItem(KUNCI_TOKEN, t) : localStorage.removeItem(KUNCI_TOKEN); } catch (e) {} }
/* URL siap dibuka di jendela baru / unduhan — token disisipkan sebagai query */
function linkAuth(u) {
  const tk = tokenSesi();
  if (!tk) return u;
  return u + (u.includes('?') ? '&' : '?') + 'auth=' + encodeURIComponent(tk);
}

const API = {
  get: (u) => fetch(apiUrl(u)).then(h),
  post: (u, b) => fetch(apiUrl(u), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(h),
  put: (u, b) => fetch(apiUrl(u), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(h),
  del: (u) => fetch(apiUrl(u), { method: 'DELETE' }).then(h)
};
async function h(r) {
  const t = await r.json().catch(() => ({}));
  if (!r.ok) {
    /* sesi habis di tengah jalan → kembali ke layar login (kecuali request auth itu sendiri) */
    if (r.status === 401) {
      let p = '';
      try { p = new URL(r.url, location.href).searchParams.get('p') || ''; } catch (e) {}
      if (p !== 'auth' && SESI) { sesiBerakhir(); }
    }
    throw new Error(t.error || ('HTTP ' + r.status));
  }
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
/* Periode berikutnya: '2026-01' → '2026-02', '2026-12' → '2027-01' */
const nextPeriode = (p) => { const [y, m] = String(p).split('-').map(Number); const d = new Date(y, m, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const tglLabel = (d) => { const [y, m, dd] = String(d).split('-'); return `${+dd} ${BLN[+m - 1].slice(0, 3)} ${y}`; };
/* Angka kwitansi: 1.600.000,00 (dua desimal, tanpa simbol Rp) */
const angkaKw = (n) => (Number(n) || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/* Jumlah 1 komponen = volume × satuan (harga per satuan) — volume kosong → satuan langsung = jumlah */
const jmlKomp = (nom, vol) => ((Number(vol) || 0) > 0 ? Math.round((Number(vol) || 0) * (Number(nom) || 0)) : (Number(nom) || 0));
/* Teks "30 × Rp 5.000" — '' bila tanpa volume (dipakai sbg tooltip tabel) */
const volTeks = (vol, nom, rf) => {
  const v = Number(vol) || 0;
  if (v <= 0) { return ''; }
  return v + ' × ' + (rf || fmt)(nom);
};
const volTitle = (vol, nom, rf) => { const t = volTeks(vol, nom, rf); return t ? ` title="${esc(t)}"` : '' };
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

/* Normalisasi nomor WA: 08xx / 8xx → 628xx */
function normWa(hp) {
  let n = String(hp || '').replace(/\D/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  else if (n.startsWith('8')) n = '62' + n;
  return n;
}

let STATE = { page: 'dashboard', iuran: {}, santri: { grup: 'umum' }, jurnal: {}, rekap: {}, mutasi: {}, kwitansi: {}, saldoAkun: {}, suratTagihan: {}, kreditur: {}, kaskusKeluar: {}, rekapSaldo: {} };

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

/* =========================================================
   SESI LOGIN & PERGANTIAN TAMPILAN (admin / wali / login)
   ========================================================= */
let SESI = null;        // {login, peran, nama, username, santri_id, profil, sandi_default}
let PROFIL_PUB = null;  // profil pesantren utk layar login (tanpa sesi)

function setAuthView(pesanError) {
  SESI = null;
  $('#adminApp').hidden = true;
  $('#waliView').hidden = true;
  $('#authView').hidden = false;
  const pr = PROFIL_PUB || {};
  $('#authNama').textContent = pr.nama_pesantren || 'Pondok Pesantren';
  $('#authSub').textContent = 'Masuk ke aplikasi keuangan — ' + (pr.nama_pesantren || 'Pondok Pesantren');
  const lg = $('#authLogo');
  if (pr.logo) lg.innerHTML = `<img src="${esc(pr.logo)}" alt="logo">`;
  else lg.textContent = (pr.logo_teks || 'PP').slice(0, 3).toUpperCase();
  const e = $('#authErr');
  if (pesanError) { e.textContent = pesanError; e.hidden = false; } else { e.hidden = true; }
  if (!location.hash || location.hash === '#/') history.replaceState(null, '', location.pathname);
}

function setAdminView() {
  $('#authView').hidden = true;
  $('#waliView').hidden = true;
  $('#adminApp').hidden = false;
  $('#userChip').hidden = false;
  const lblPeran = SESI.peran === 'upj' ? 'UPJ' : 'admin';
  $('#userChipNama').textContent = (SESI.nama || SESI.username || 'admin') + ' · ' + lblPeran;
  $('#sandiBanner').hidden = !SESI.sandi_default;
  terapkanMenuPeran();
}

/** peran UPJ = pengguna khusus: Dashboard, Jurnal Kas Keluar, Jurnal Uang Saku /
 *  Tabungan / Tagihan Lain (mutasi) & Rekap Saldo — rute lain ditolak */
function peranUpj() { return !!(SESI && SESI.peran === 'upj'); }
const HALAMAN_UPJ = ['dashboard', 'kaskus-keluar', 'mutasi-us', 'mutasi-tab', 'mutasi-lain', 'rekap-saldo'];
/** nama menu sidebar (juga judul halaman) khusus tampilan UPJ */
const MENU_UPJ = {
  dashboard: ['Dashboard', 'Saldo pengeluaran, tarik tunai & ringkasan kas khusus'],
  'kaskus-keluar': ['Jurnal Kas Keluar', 'Entry kas keluar bebas — akun & sumber dana pilihan sendiri, format persis Jurnal Kas admin tanpa preset & riwayat pencatatan UPJ'],
  'mutasi-us': ['Jurnal Uang Saku', 'Entry kas keluar uang saku + mutasi setoran & pembagian — masuk, keluar & saldo berjalan'],
  'mutasi-tab': ['Jurnal Tabungan', 'Entry kas keluar tabungan + mutasi setoran & penarikan — masuk, keluar & saldo berjalan'],
  'mutasi-lain': ['Jurnal Tagihan Lain', 'Entry kas keluar tagihan lain-lain + mutasi penerimaan & pengembalian — masuk, keluar & saldo berjalan'],
  'rekap-saldo': ['Rekap Saldo', 'Masuk, keluar & saldo ketiga akun kas khusus — sinkron dengan jurnal pengurus (akun admin)']
};

/** Sembunyikan semua menu di luar hak akses UPJ & ganti nama menu (dipanggil setiap ganti tampilan) */
function terapkanMenuPeran() {
  const upj = peranUpj();
  $$('.nav-item').forEach(a => {
    let tampil = true;
    if (upj) tampil = a.dataset.upj === '1';
    else tampil = a.dataset.upjOnly !== '1';       /* Rekap Saldo = khusus UPJ */
    a.style.display = tampil ? '' : 'none';
    /* nama menu: pakai nama UPJ bila sesi UPJ, selain itu nama asli sidebar */
    if (a.dataset.navTeks === undefined) a.dataset.navTeks = teksNav(a);
    const ganti = upj && MENU_UPJ[a.dataset.page];
    setTeksNav(a, ganti ? ganti[0] : a.dataset.navTeks);
  });
  $$('.nav-label').forEach(p => { p.style.display = (upj && p.dataset.upj !== '1') ? 'none' : ''; });
  const btn = $('#btnTambahCepat');
  if (btn) btn.style.display = upj ? 'none' : '';
  const lbl = $('#sidebarSaldoLabel');
  if (lbl) lbl.textContent = upj ? 'Saldo Pengeluaran' : 'Saldo Kas';
}
/** teks label sebuah nav-item (di luar ikon <span class="nav-ico">) */
function teksNav(a) {
  return Array.from(a.childNodes).filter(n => n.nodeType === 3 && n.nodeValue.trim()).map(n => n.nodeValue).join('').trim();
}
function setTeksNav(a, teks) {
  const tn = Array.from(a.childNodes).find(n => n.nodeType === 3 && n.nodeValue.trim());
  if (tn) tn.nodeValue = ' ' + teks + ' ';
}

function setWaliView() {
  $('#authView').hidden = true;
  $('#adminApp').hidden = true;
  $('#waliView').hidden = false;
  const pr = SESI.profil || {};
  $('#waliNamaPes').textContent = pr.nama_pesantren || 'Pondok Pesantren';
  const wl = $('#waliLogo');
  if (pr.logo) wl.innerHTML = `<img src="${esc(pr.logo)}" alt="logo">`;
  else wl.textContent = (pr.logo_teks || 'PP').slice(0, 3).toUpperCase();
  $('#waliNamaSantri').textContent = SESI.nama || 'Wali Santri';
}

/* cek token tersimpan ke server — true bila masih sah */
async function muatSesi() {
  let r = null;
  try { r = await fetch(apiUrl('/api/auth')).then(h); } catch (e) {}
  if (!r) { setAuthView('Tidak dapat terhubung ke server. Muat ulang halaman.'); return false; }
  PROFIL_PUB = r.profil || PROFIL_PUB;
  if (!r.login) { setAuthView(); return false; }
  SESI = r;
  return true;
}

async function masukAplikasi() {
  if (SESI.peran === 'wali') {
    setWaliView();
    if (!/^#\/wali/.test(location.hash || '')) location.hash = '#/wali';  // memicu hashchange → navigate()
    else navigate();
    return;
  }
  setAdminView();
  await loadHeader();
  if (peranUpj()) {
    /* dashboard UPJ (bukan dashboard admin) — saldo sidebar diisi oleh pageUpjDashboard */
    $('#sidebarSaldo').textContent = '—';
    if (!HALAMAN_UPJ.includes((location.hash.replace('#/', '').split('?')[0]) || '')) location.hash = '#/dashboard';
    else navigate();
    return;
  }
  await refreshSaldo();
  if (/^#\/wali/.test(location.hash || '')) location.hash = '#/dashboard';
  else navigate();
}

async function logout(pesan) {
  try { await fetch(apiUrl('/api/auth?act=logout'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(h); } catch (e) {}
  simpanToken('');
  setAuthView(pesan || 'Anda telah keluar dari aplikasi.');
  $('#authPass').value = '';
}

function sesiBerakhir() {
  if (!SESI) return;
  simpanToken('');
  setAuthView('Sesi berakhir — silakan login kembali.');
  $('#authPass').value = '';
}

$('#authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#authBtn');
  btn.disabled = true; btn.textContent = 'Memeriksa…';
  try {
    const r = await API.post('/api/auth?act=login', {
      username: $('#authUser').value.trim(),
      sandi: $('#authPass').value
    });
    simpanToken(r.token);
    await muatSesi();                 // isi username & penanda sandi bawaan
    if (!SESI) throw new Error('Gagal memuat sesi');
    $('#authPass').value = '';
    await masukAplikasi();
    toast('Selamat datang, ' + (SESI.nama || SESI.username || 'admin'));
  } catch (err) {
    setAuthView(err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Masuk';
  }
});

$('#btnKeluar').onclick = () => logout();
$('#waliKeluar').onclick = () => logout();
$('#sandiBannerBtn').onclick = () => { location.hash = '#/pengaturan'; setTimeout(() => { const f = $('#a-sandi-baru'); if (f) f.focus(); }, 400); };
$('#sandiBannerX').onclick = () => { $('#sandiBanner').hidden = true; };

/* ---------------- Router ---------------- */
const ROUTES = { dashboard: () => (peranUpj() ? pageUpjDashboard() : pageDashboard()), jurnal: pageJurnal, iuran: pageIuran, santri: pageSantri, rekap: pageRekap, laporan: pageLaporan, pengaturan: pagePengaturan, kwitansi: pageKwitansi, 'saldo-akun': pageSaldoAkun, 'surat-tagihan': pageSuratTagihan, 'mutasi-us': () => pageMutasi('us'), 'mutasi-tab': () => pageMutasi('tab'), 'mutasi-lain': () => pageMutasi('lain'), kreditur: pageKreditur, gaji: pageGaji, 'kaskus-keluar': pageKaskusKeluar, 'rekap-saldo': pageRekapSaldoUpj, 'laporan-cetak': pageLaporanCetak };
const TITLES = {
  dashboard: ['Dashboard', 'Ringkasan keuangan pesantren'],
  jurnal: ['Jurnal Kas', 'Entry kas masuk (BKM) — multi tagihan santri & nama manual — serta kas keluar (BKK)'],
  iuran: ['Iuran Santri', 'Tagihan, pembayaran & tunggakan — halaman tanpa menu: lewat Generate (Jurnal Kas) atau Lihat Tunggakan (Dashboard)'],
  santri: ['Data Santri', 'Kolom tagihan SPP, Infaq, Laundry & lainnya'],
  rekap: ['Rekap Pembayaran', 'Per santri — hijau = sudah dibayar, merah = tagihan belum bayar (muncul di Jurnal Kas)'],
  laporan: ['Laporan Keuangan', 'Rekap & cetak laporan periode'],
  'laporan-cetak': ['Cetak Laporan', 'Sebelas jenis laporan keuangan siap cetak — F4 landscape, berkop & tanda tangan'],
  'saldo-akun': ['Saldo Akun Pemasukan', 'Saldo bank (BRI/BSI/BPD) & cash, tarik tunai, serta saldo awal/masuk/keluar/akhir tiap akun pemasukan'],
  'surat-tagihan': ['Surat Tagihan Santri', 'Surat informasi administrasi keuangan — tagihan belum lunas siap cetak'],
  pengaturan: ['Pengaturan', 'Profil pesantren, backup & data'],
  kwitansi: ['Kwitansi Penerimaan', 'Pratinjau & cetak kwitansi per nomor BKM — kirim via WhatsApp (antre bot WA)'],
  'mutasi-us': ['Uang Saku', 'Setoran & pembagian uang saku santri — mutasi & rekap saldo per santri'],
  'mutasi-tab': ['Tabungan', 'Setoran & penarikan tabungan santri — mutasi & rekap saldo per santri'],
  'mutasi-lain': ['Tagihan Lain-lain', 'Penerimaan & pengeluaran tagihan lain-lain — mutasi & rekap saldo per santri'],
  kreditur: ['Kreditur', 'Total masuk dari akun Hutang, total keluar dari akun Biaya Angsuran Hutang & daftar nama kreditur'],
  gaji: ['Gaji Guru & Karyawan', 'Data guru/karyawan, bayar gaji per periode (1 BKK → jurnal kas keluar), slip per orang + kirim WhatsApp & tanda tangan penerimaan'],
  'kaskus-keluar': ['Kas Khusus Keluar', 'Entry kas keluar bebas (sumber dana pilihan sendiri) & riwayat pencatatan UPJ — pilihan sumber kas khusus mengunci akun keluar otomatis'],
  'rekap-saldo': ['Rekap Saldo', 'Masuk, keluar & saldo ketiga akun kas khusus + rekap saldo per santri']
};

function navigate() {
  if (window.__waPoll) { clearInterval(window.__waPoll); window.__waPoll = null; }
  const hash = (location.hash.replace('#/', '') || 'dashboard').split('?')[0];
  /* portal wali punya rute sendiri (#/wali, #/wali/tagihan, #/wali/mutasi, #/wali/akun) */
  if (SESI && SESI.peran === 'wali') { waliNavigate(hash); return; }
  if (!SESI) { setAuthView(); return; }
  let page = ROUTES[hash] ? hash : 'dashboard';
  /* Rekap Saldo hanya untuk UPJ — sesi lain dipaksa ke Dashboard */
  if (page === 'rekap-saldo' && !peranUpj()) {
    page = 'dashboard';
    if (hash !== page) { history.replaceState(null, '', location.pathname + '#/' + page); }
  }
  /* UPJ — hanya 6 halamannya; rute lain dipaksa kembali ke Dashboard UPJ */
  if (peranUpj() && !HALAMAN_UPJ.includes(page)) {
    page = 'dashboard';
    if (hash !== page) { history.replaceState(null, '', location.pathname + '#/' + page); }
  }
  if (STATE.page && STATE.page !== page) STATE.prevPage = STATE.page;
  /* kanvas Gaji belum disimpan — pindah halaman (sidebar/rute) harus konfirmasi dulu */
  if (STATE.page === 'gaji' && page !== 'gaji' && typeof GJ_KOTOR !== 'undefined' && GJ_KOTOR) {
    if (!confirm('Perubahan kanvas belum disimpan — tinggalkan halaman dan buang perubahan?')) {
      history.replaceState(null, '', location.pathname + '#/' + STATE.page);
      return;
    }
  }
  STATE.page = page;
  $$('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  const judul = (peranUpj() && MENU_UPJ[page]) ? MENU_UPJ[page] : TITLES[page];
  $('#pageTitle').textContent = judul[0];
  $('#pageSub').textContent = judul[1];
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
    const bl = $('#brandLogo');
    if (p.logo) bl.innerHTML = `<img src="${esc(p.logo)}" alt="logo">`;
    else bl.textContent = (p.logo_teks || 'PP').slice(0, 3).toUpperCase();
    $('#brandNama').textContent = p.nama_pesantren;
    $('#brandTahun').textContent = 'TA ' + (p.tahun_ajaran || '-');
  } catch (e) { /* ignore */ }
  const d = new Date();
  $('#todayChip').textContent = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

async function refreshSaldo() {
  if (peranUpj()) return;   /* sesi UPJ tak punya akses p=dashboard — jangan memicu 403 */
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
let JLIST = [], JSANTRI = [], JCUSTOM = [], JCUR = null, JEDIT = null, JAKUN = { pemasukan: [], pengeluaran: [], peta: {} }, JTAGIHAN = [], JNANTI = [], JPILIH = new Set(), JKASKUS = [], JLUNAS = 0, JEMPTY = '', JNOM_AUTO = false, JNO_AUTO = false, JKREDITUR = [], JSINKRON = null, JAKUN_PREV = '';
/* bukti jurnal: foto transfer (kas masuk), foto nota & tanda tangan penerima (kas keluar) */
let JB64 = { transfer: '', nota: '', ttd: '' };
let JHAPUS = { transfer: false, nota: false, ttd: false };

function akunDariTagihanJS(key, custom) {
  if (!key) return '';
  const m = String(key).match(/^(spp|infaq|laundry)_\d{2}$/);
  let nama = '';
  if (m) nama = { spp: 'SPP', infaq: 'Infaq Wajib', laundry: 'Laundry Wajib' }[m[1]];
  else {
    const map = {
      administrasi_awal: 'Administrasi', wakaf: 'Wakaf', daftar_ulang: 'Daftar Ulang',
      tunggakan_spp: 'Tunggakan SPP', tunggakan_infaq: 'Tunggakan Infaq Wajib',
      tunggakan_laundry: 'Tunggakan Laundry Wajib', tunggakan_daftar_ulang: 'Tunggakan Daftar Ulang',
      akhirusanah: 'Akhirussanah', study_tour: 'Study Tour', bimbel: 'Bimbel', rihlah: 'Rihlah',
      tagihan_lain: 'Tagihan Lain-lain'
    };
    if (map[key]) nama = map[key];
    else {
      nama = key;
      (custom || []).forEach(c => { if (c.key === key) nama = c.nama; });
    }
  }
  /* nama bawaan bisa di-renames di Pengaturan → terjemahkan lewat peta */
  const peta = JAKUN.peta || {};
  const kini = peta[nama] || nama;
  return (JAKUN.pemasukan || []).find(a => String(a).toLowerCase() === String(kini).toLowerCase()) || '';
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

/** Sumber dana aktif pada form kas keluar: preset kas khusus, atau pilihan user di #j-sumber */
function jurnalSumberAktif() {
  const cfg = MUTASI_CFG[STATE.jurnal.preset || ''];
  if (cfg) return cfg.akun;
  const el = $('#j-sumber');
  return el ? (el.value || '') : '';
}

/** Kas keluar sumber kas khusus (Uang Saku / Tabungan / Tagihan Lain-lain) → sembunyikan
    "Akun Pengeluaran" & "Dibayarkan kepada" (penerima = nama santri). Nilai #j-sumber yang
    dibaca = persis yang dikirim ke backend. Akun wajib tetap terisi — backend menolak akun
    kosong — jadi bila kosong diisi otomatis akun keluar kanonik (resolve rename via JAKUN.peta). */
function jurnalToggleKKKeluar() {
  const sEl = $('#j-sumber'); if (!sEl) return;              // hanya form kas keluar (masuk tak punya #j-sumber)
  const aEl = $('#j-akun');
  const peta = JAKUN.peta || {};
  const sumber = sEl.value || '';
  let cfgKK = null;
  Object.values(MUTASI_CFG).forEach(c => {
    const kini = peta[c.akun] || c.akun;
    if (sumber && (sumber === c.akun || sumber === kini)) cfgKK = c;
  });
  const isKK = !!cfgKK;
  const fA = aEl ? aEl.closest('.field') : null;
  const dEl = $('#j-dibayar');
  const fD = dEl ? dEl.closest('.field') : null;
  if (fA) fA.hidden = isKK;
  if (fD) fD.hidden = isKK;
  if (isKK && aEl) {
    const harap = peta[cfgKK.akunKeluar] || cfgKK.akunKeluar;
    const kini = aEl.value || '';
    /* isi bila kosong; ganti juga bila akun kanonik kas khusus LAIN (sisa preset sebelumnya)
       — mode edit (JEDIT) tak pernah ditimpa agar data tersimpan tak berubah diam-diam */
    const sisaKKLain = !JEDIT && kini !== '' && kini !== harap
      && Object.values(MUTASI_CFG).some(c => kini === (peta[c.akunKeluar] || c.akunKeluar));
    if (kini === '' || sisaKKLain) {
      aEl.value = harap;                                   // bila opsi tak ada → value ''
      if (!aEl.value) {
        const cocok = Array.from(aEl.options || []).find(o => String(o.value).toLowerCase() === harap.toLowerCase());
        if (cocok) aEl.value = cocok.value;
      }
    }
  }
  /* note baris preset: preset aktif → teks dari jurnalPasangPreset (disentuh di sini hanya
     saat tanpa preset) — tampilkan pasangan sumber↔akun agar nilai tersembunyi tetap terbaca */
  const note = $('#j-preset-note');
  if (note && !STATE.jurnal.preset) {
    note.textContent = (isKK && aEl) ? `sumber kas khusus → akun keluar "${aEl.value}"` : '';
  }
  jurnalToggleKreditur();   // akun keluar "Biaya Angsuran Hutang" → mode kreditur
}

/** Nama akun kanonik → nilai tersimpan di select (ikut rename di Pengaturan) */
function jurnalAkunResolusi(nama, arah) {
  const peta = JAKUN.peta || {};
  const kini = peta[nama] || nama;
  const list = arah === 'keluar' ? (JAKUN.pengeluaran || []) : (JAKUN.pemasukan || []);
  const cocok = list.find(a => String(a).toLowerCase() === String(kini).toLowerCase());
  return cocok || '';
}

/** Akun aktif di form Jurnal Kas termasuk akun hutang? → 'Hutang' / 'Biaya Angsuran Hutang' / '' */
function jurnalAkunKreditur() {
  const aEl = $('#j-akun'); if (!aEl) return '';
  const arah = $('#j-sumber') ? 'keluar' : 'masuk';
  const kanonik = arah === 'keluar' ? 'Biaya Angsuran Hutang' : 'Hutang';
  const harap = jurnalAkunResolusi(kanonik, arah);
  if (!harap) return '';
  return String(aEl.value || '').toLowerCase() === harap.toLowerCase() ? kanonik : '';
}

/** Akun "Hutang" (kas masuk) / "Biaya Angsuran Hutang" (kas keluar) → field nama berubah jadi
    NAMA KREDITUR: datalist diisi dari menu Kreditur, pencocokan santri dimatikan, dan pada kas
    keluar field "Nama Santri" ikut tampil + "Dibayarkan kepada" terisi otomatis nama kreditur. */
function jurnalToggleKreditur() {
  const aEl = $('#j-akun'); if (!aEl) return;
  const arah = $('#j-sumber') ? 'keluar' : 'masuk';
  const mode = jurnalAkunKreditur();
  const aktif = !!mode;
  const dl = $('#dl-kreditur');
  if (dl) dl.innerHTML = JKREDITUR.map(k =>
    `<option value="${esc(k.nama)}">${esc(k.catatan || 'kreditur terdaftar')}</option>`).join('');

  const fNama = $('#j-f-nama-k');
  const lbl   = $('#j-lbl-nama-k');
  const inp   = $('#j-nama');
  if (arah === 'keluar') {
    /* tampil bila mode kreditur, preset kas khusus, atau entry sudah punya nama (aturan lama) */
    const punyaNama = !!(inp && inp.value.trim());
    if (fNama) fNama.hidden = !aktif && !STATE.jurnal.preset && !punyaNama;
    if (lbl) lbl.textContent = aktif ? 'Nama Kreditur' : 'Nama Santri';
  } else {
    const fJenis = $('#j-f-jenis-tagihan');
    if (fJenis) fJenis.hidden = aktif || !!STATE.jurnal.preset;
    const lblM = $('#j-lbl-nama');
    if (lblM) lblM.textContent = aktif ? 'Nama Kreditur' : 'Nama Santri / Manual';
  }
  if (inp) {
    if (aktif) {
      inp.setAttribute('list', 'dl-kreditur');
      inp.placeholder = arah === 'keluar'
        ? 'pilih nama kreditur… atau ketik nama baru'
        : 'pilih nama kreditur… atau ketik nama baru (pinjaman dari)';
    } else {
      inp.setAttribute('list', arah === 'keluar' ? 'dl-santri-k' : 'dl-santri');
      inp.placeholder = arah === 'keluar'
        ? 'pilih nama santri dari data…'
        : 'pilih dari data santri… atau ketik nama lain (donatur, dst)';
    }
  }
  /* "Dibayarkan kepada" (kwitansi BKK) ikut memakai nama kreditur selama belum diketik user */
  const dib = $('#j-dibayar');
  if (dib && arah === 'keluar') {
    if (aktif) {
      const v = (inp ? inp.value : '').trim();
      if (dib.value.trim() === '' || dib.dataset.auto === '1') {
        dib.value = v;
        if (v) dib.dataset.auto = '1'; else delete dib.dataset.auto;
      }
    } else if (dib.dataset.auto === '1') {
      dib.value = ''; delete dib.dataset.auto;
    }
  }
  /* petunjuk mode kreditur (kas keluar) — saat edit, hint dari jurnalIsiForm diutamakan */
  const hint = $('#j-hint');
  if (hint && arah === 'keluar' && !JEDIT) {
    hint.innerHTML = aktif
      ? `Mode <strong>Kreditur</strong> — nama yang diisi tercatat pada <a href="#/kreditur">laporan Kreditur</a> (akun keluar <strong>${esc(mode)}</strong>) & pada kolom Dibayarkan kwitansi BKK.`
      : 'Kas keluar dicatat ke rekening sesuai <strong>sumber dana</strong> yang dipilih — kas & laporan ikut menyesuaikan.';
  }
  JAKUN_PREV = aEl.value || '';   // acuan utk membatalkan perubahan akun (keranjang masih berisi item)
}

/** Nomor BKK berikutnya mengikuti sumber dana aktif — kas khusus memakai seri terpisah
    (BKK/US/…, BKK/TAB/…, BKK/TL/…). Nomor hanya ditimpa selama belum diketik user (JNO_AUTO). */
async function segarkanNoBkk() {
  if (JEDIT) return;
  const el = $('#j-bkk');
  if (!el) return;
  const sumber = jurnalSumberAktif();
  try {
    const r = await API.get('/api/jurnal?act=next&arah=keluar&sumber=' + encodeURIComponent(sumber));
    const no = (r && r.no_bkk) || '';
    if (!no) return;
    if (JNO_AUTO || el.value.trim() === '') el.value = no;
    const v = $('#j-bkk-v'), s = $('#j-bkk-s');
    const seri = (no.split('/')[1] || '');
    if (v) v.textContent = no.split('/').pop();
    if (s) s.innerHTML = 'nomor berikutnya: ' + esc(no) + (seri && !/^\d+$/.test(seri)
      ? '<br>seri kas khusus <strong>' + esc(seri) + '</strong> (terpisah)' : '');
  } catch (e) { /* senyap — form tetap bisa dipakai */ }
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
  const kkRow  = $('#j-kaskus-row');
  if (fNamaK) fNamaK.hidden = !cfg;
  if (kkRow && arah === 'masuk') kkRow.hidden = !JCUR || !!cfg || !!JEDIT;
  if (arah === 'masuk') {
    if (fJenis) fJenis.hidden = !!cfg;
    if (cfg && box) box.hidden = true;
    const selJ = $('#j-tagihan');
    if (cfg && selJ) { selJ.innerHTML = '<option value="">— Tanpa tagihan —</option>'; selJ.value = ''; }
  }

  if (!cfg) { if (note) note.textContent = ''; jurnalToggleKKKeluar(); return; }
  if (arah === 'keluar') {
    const a = $('#j-akun'), s = $('#j-sumber');
    if (a) a.value = cfg.akunKeluar;
    if (s) s.value = cfg.akun;
    if (note) note.textContent = `Akun keluar "${cfg.akunKeluar}" ← sumber "${cfg.akun}"`;
    jurnalToggleKKKeluar();
  } else {
    const a = $('#j-akun');
    if (a) a.value = cfg.akun;
    if (note) note.textContent = `Akun pemasukan "${cfg.akun}"`;
    jurnalToggleKreditur();
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

/* =========================================================
   KERANJANG KAS MASUK — draf tagihan terpilih (localStorage)
   + sakelar kirim info & kwitansi ke WA wali setelah Entry
   ========================================================= */
const KER_KEY = 'pp_keranjang_masuk', WA_WALI_KEY = 'pp_wa_wali_masuk';

function keranjangMuat() {
  try {
    const k = JSON.parse(localStorage.getItem(KER_KEY) || 'null');
    if (k && k.santri_id && Array.isArray(k.items) && (k.items.length || (Array.isArray(k.kaskus) && k.kaskus.length))) return k;
  } catch (e) {}
  return null;
}
/** Simpan draf dari pilihan tagihan + setoran kas khusus saat ini — hapus & kembalikan null bila kosong */
function keranjangSimpan() {
  try {
    if (!JCUR || (!JPILIH.size && !JKASKUS.length)) { localStorage.removeItem(KER_KEY); return null; }
    const items = JTAGIHAN.filter(t => JPILIH.has(t.id)).map(t => ({
      id: t.id, label: `${t.jenis} • ${periodeLabel(t.periode)}`, sisa: Number(t.sisa) || 0
    }));
    const kaskus = JKASKUS.filter(x => x && x.akun && Number(x.nominal) > 0)
      .map(x => ({ akun: x.akun, nominal: Number(x.nominal) }));
    if (!items.length && !kaskus.length) { localStorage.removeItem(KER_KEY); return null; }
    const k = { santri_id: JCUR.id, nama: JCUR.nama, kelas: JCUR.kelas || '', items, kaskus };
    localStorage.setItem(KER_KEY, JSON.stringify(k));
    return k;
  } catch (e) { return null; }
}
function keranjangHapus() { try { localStorage.removeItem(KER_KEY); } catch (e) {} }
function waWaliAktif() { try { return localStorage.getItem(WA_WALI_KEY) !== '0'; } catch (e) { return true; } }
function waWaliSimpan(v) { try { localStorage.setItem(WA_WALI_KEY, v ? '1' : '0'); } catch (e) {} }

/** Entry kas masuk sukses → antre info rincian + gambar kwitansi ke WA wali (No WA dari Data Santri) */
async function kirimInfoWaWali(noBkm, namaFallback) {
  if (!noBkm || !waWaliAktif()) return;
  try {
    const r = await API.get('/api/kwitansi?' + new URLSearchParams({ q: noBkm, limit: 50 }));
    const it = (r.list || []).find(x => x.no_bkm === noBkm);
    if (!it) return toast('Info WA wali tidak terkirim — BKM ' + noBkm + ' tidak ditemukan', 'error');
    const hp = String(it.no_wa || '').trim();
    if (!hp) return toast('Info WA wali dilewati — belum ada No WA untuk santri ini (isi di Data Santri)');
    const set = await API.get('/api/pengaturan');
    const gambar = (await kwitansiCanvas(it, set)).toDataURL('image/png');
    const rincian = (it.items || []).map(i => '• ' + (i.label_tagihan || i.akun || 'Pembayaran') + ' — ' + fmt(i.nominal)).join('\n');
    const pesan = [
      'Assalamualaikum Wr. Wb.' + (it.nama ? ' ' + it.nama : ''),
      '',
      'Terlampir kwitansi penerimaan No. ' + it.no_bkm + ' tanggal ' + tglLabel(it.tanggal) + ' sebesar ' + fmt(it.nominal) + ':',
      rincian,
      '',
      'Santri: ' + (it.nama || '') + (it.kelas ? ' • ' + it.kelas : ''),
      '- ' + (set.nama_pesantren || ''),
      'Pesan otomatis dari sistem keuangan pondok.'
    ].join('\n');
    await API.post('/api/kwitansi', {
      act: 'kirim-wa', no_bkm: noBkm, nama: it.nama || namaFallback || '',
      no_hp: hp, pesan, gambar
    });
    toast('Info pembayaran ' + noBkm + ' diantrekan ke WA wali ' + (it.nama || ''));
  } catch (e) { toast('Gagal antre info WA wali: ' + (e && e.message ? e.message : e), 'error'); }
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
  if (src) { p.src = src; p.hidden = false; p.title = 'Klik untuk memperbesar'; }
  else { p.removeAttribute('src'); p.hidden = true; p.title = ''; }
  if (d) d.hidden = !src;
}
/** Thumbnail kecil di form diklik → tampilkan foto penuh (resolusi asli) di modal */
function buktiPerbesar(img) {
  const src = img.getAttribute('src');
  if (!src) return;
  const alt = img.alt || 'Foto';
  openModal('🔍 ' + alt, `<div class="zoom-box"><img src="${esc(src)}" alt="${esc(alt)}"></div>`,
    `<span class="hint muted" style="margin-right:auto">Resolusi asli — foto sama persis dengan yang tercetak pada kwitansi.</span>
     <button class="btn" onclick="closeModal()">✕ Tutup</button>`, 820);
}
/* seluruh pratinjau foto (.up-prev) bisa diperbesar dengan sekali klik */
document.addEventListener('click', (e) => {
  const img = e.target && e.target.closest ? e.target.closest('.up-prev') : null;
  if (img && !img.hidden && img.getAttribute('src')) { buktiPerbesar(img); }
});
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
  /* nomor BKK berikutnya mengikuti sumber dana preset (kas khusus → seri US/TAB/TL terpisah) */
  const cfgAwal  = MUTASI_CFG[f.preset || ''] || null;
  const sumber0  = (!masuk && cfgAwal) ? cfgAwal.akun : '';
  const [list, santri, custom, next, akun, kred, lapTahun] = await Promise.all([
    API.get('/api/jurnal' + (qs.toString() ? '?' + qs : '')),
    API.get('/api/santri'),
    API.get('/api/kolom-custom'),
    API.get('/api/jurnal?act=next&arah=' + f.arah + (sumber0 ? '&sumber=' + encodeURIComponent(sumber0) : '')),
    API.get('/api/akun'),
    /* daftar nama kreditur — utk datalist field Nama Kreditur (akun Hutang / Biaya Angsuran Hutang) */
    API.get('/api/kreditur?act=daftar').then(r => (r && r.list) || []).catch(() => []),
    /* total kas masuk tahun berjalan — utk kartu BKM Tahun Ini */
    masuk ? API.get('/api/laporan?dari=' + thn + '-01-01&sampai=' + thn + '-12-31').catch(() => null) : Promise.resolve(null)
  ]);
  JLIST = list; JSANTRI = santri; JCUSTOM = custom; JAKUN = akun; JKREDITUR = kred;
  JNO_AUTO = false;   // dinyalakan lagi setelah render bila field No BKK masih otomatis

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
      <div class="stat iuran"><div class="stat-ico">📒</div><div class="stat-label">BKK Tahun Ini</div><div class="stat-value" id="j-bkk-v">${(next.no_bkk || '').split('/').pop()}</div><div class="stat-sub" id="j-bkk-s">nomor berikutnya: ${esc(next.no_bkk || '-')}${sumber0 ? '<br>seri kas khusus <strong>' + esc((next.no_bkk || '').split('/')[1] || '') + '</strong> (terpisah)' : ''}</div></div>`}
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
      <div class="card-head"><h3 id="j-form-title">${masuk ? '✏️ Entry Kas Masuk' : '✏️ Entry Kas Keluar'}</h3><span class="muted">${masuk ? 'Centang tagihan santri yang belum terbayar (boleh lebih dari satu) — atau isi manual untuk nama di luar data santri' : 'Pilih akun pengeluaran + sumber dananya — nomor BKK otomatis (uang saku / tabungan / tagihan lain memakai seri terpisah)'}</span></div>
      <div class="card-pad">
        ${masuk ? `
        <div class="entry-grid entry-row">
          <div class="field"><label>Tanggal</label><input type="date" id="j-tgl" value="${f.tanggal || today()}"></div>
          <div class="field"><label>No BKM</label><input id="j-bkm" value="${esc(next.no_bkm || '')}" placeholder="otomatis"></div>
          <div class="field grow" id="j-f-nama"><label id="j-lbl-nama">Nama Santri / Manual</label>
            <input id="j-nama" list="dl-santri" placeholder="pilih dari data santri… atau ketik nama lain (donatur, dst)" autocomplete="off">
            <datalist id="dl-santri">${santri.map(s => `<option value="${esc(s.nama)}">${esc(s.kelas)}</option>`).join('')}</datalist>
            <datalist id="dl-kreditur">${JKREDITUR.map(k => `<option value="${esc(k.nama)}">${esc(k.catatan || 'kreditur terdaftar')}</option>`).join('')}</datalist>
          </div>
          <div class="field"><label>Kelas</label><input id="j-kelas" placeholder="-"></div>
          <div class="field" id="j-f-jenis-tagihan"><label>Jenis Tagihan</label><select id="j-tagihan"><option value="">— Tanpa tagihan —</option></select></div>
          <div class="field" id="j-f-akun"><label>Akun Pemasukan</label><select id="j-akun"><option value="">— Pilih akun —</option></select></div>
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
        <div class="kaskus-row" id="j-kaskus-row" hidden>
          <span class="muted">Tambah ke keranjang:</span>
          <button type="button" class="chip" data-kk="Uang Saku">🪙 Setor Uang Saku</button>
          <button type="button" class="chip" data-kk="Tabungan">🏦 Setor Tabungan</button>
          <button type="button" class="chip" data-kk="Tagihan Lain-lain">📄 Setor Tagihan Lain</button>
        </div>
        <div class="keranjang-box" id="j-keranjang" hidden>
          <div class="keranjang-head">
            <strong>🧺 Keranjang Pembayaran <span class="muted" id="ker-nama"></span></strong>
            <span class="hint">draf tersimpan otomatis di browser — terhapus setelah Entry / dikosongkan</span>
          </div>
          <div class="keranjang-list" id="ker-list"></div>
          <div class="keranjang-foot">
            <span class="keranjang-total" id="ker-total"></span>
            <div class="flex">
              <button type="button" class="btn btn-primary" id="ker-entry">✔ Entry dari Keranjang</button>
              <button type="button" class="btn btn-sm" id="ker-kosong">🗑 Kosongkan</button>
            </div>
          </div>
        </div>
        <div class="bukti-box" id="j-bukti-transfer" hidden>
          <div class="bukti-head"><strong>📷 Foto Bukti Transfer</strong><span class="hint">tampil di kwitansi BKM — pratinjau (klik foto untuk memperbesar), cetak & PNG</span></div>
          <div class="upload-row">
            <img class="up-prev" id="j-bt-prev" hidden alt="bukti transfer">
            <input type="file" id="j-bt-file" accept="image/*" hidden>
            <button type="button" class="btn btn-sm" id="j-bt-pick">📁 Pilih foto transfer</button>
            <button type="button" class="btn btn-sm btn-danger" id="j-bt-del" hidden>✕ Hapus foto</button>
          </div>
          <span class="hint muted">Otomatis dimunculkan untuk transfer bank (BRI / BSI / BPD) — bukti transfer ikut tercetak pada kwitansi.</span>
        </div>
        <div class="wa-wali-row">
          <label class="wa-wali"><input type="checkbox" id="j-wa-wali">
            <span>📤 Kirim info pembayaran + gambar kwitansi ke WhatsApp wali <span class="muted">(No WA dari Data Santri) — otomatis setelah Entry sukses</span></span>
          </label>
        </div>
        <p class="hint muted" id="j-hint" style="margin-top:10px">Pilih nama santri untuk munculkan daftar tagihan yang belum terbayar — atau langsung isi nominal & akun untuk kas masuk manual.</p>`
        : `
        <div class="entry-grid entry-row">
          <div class="field"><label>Tanggal</label><input type="date" id="j-tgl" value="${f.tanggal || today()}"></div>
          <div class="field"><label>No BKK</label><input id="j-bkk" value="${esc(next.no_bkk || '')}" placeholder="otomatis"></div>
          <div class="field grow" id="j-f-nama-k" hidden><label id="j-lbl-nama-k">Nama Santri</label>
            <input id="j-nama" list="dl-santri-k" placeholder="pilih nama santri dari data…" autocomplete="off">
            <datalist id="dl-santri-k">${santri.map(s => `<option value="${esc(s.nama)}">${esc(s.kelas)}</option>`).join('')}</datalist>
            <datalist id="dl-kreditur">${JKREDITUR.map(k => `<option value="${esc(k.nama)}">${esc(k.catatan || 'kreditur terdaftar')}</option>`).join('')}</datalist>
            <span class="hint muted" id="j-saldo-k"></span>
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
              <span class="hint muted">Nota / str pembayaran — dicetak pada kwitansi BKK; klik pratinjau untuk memperbesar.</span>
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
    JPILIH = new Set(); JKASKUS = []; JTAGIHAN = []; JNANTI = []; JLUNAS = 0; JEMPTY = '';
    if (!JEDIT) JNOM_AUTO = false;
    jurnalAkunSelect('masuk', '');
    if (!JEDIT) jurnalPasangPreset('masuk');
    jurnalToggleKreditur();
    /* foto bukti transfer — tampil utk jenis transaksi bank */
    buktiPasangFile('j-bt-pick', 'j-bt-file', 'j-bt-prev', 'j-bt-del', 'transfer');
    const selJenisM = $('#j-jenis');
    if (selJenisM) selJenisM.onchange = buktiTampilTransfer;
    buktiTampilTransfer();
    const boxEl  = $('#j-tagihan-box');
    const listEl = $('#j-tagihan-list');
    const totalPilih = () => JTAGIHAN.filter(t => JPILIH.has(t.id)).reduce((a, t) => a + (Number(t.sisa) || 0), 0);
    const totalKer = () => totalPilih() + JKASKUS.reduce((a, x) => a + (Number(x.nominal) || 0), 0);

    const jurnalHint = () => {
      if (jurnalAkunKreditur()) {
        $('#j-hint').innerHTML = `Mode <strong>Kreditur</strong> — nama yang diisi tercatat pada <a href="#/kreditur">laporan Kreditur</a> (akun <strong>${esc(jurnalAkunKreditur())}</strong>). Pilih dari daftar kreditur atau ketik nama baru; nominal diisi manual.`;
      } else if (JPILIH.size > 0 || JKASKUS.length) {
        const bagian = [];
        if (JPILIH.size) bagian.push(`<strong>${JPILIH.size} tagihan</strong>`);
        if (JKASKUS.length) bagian.push(`<strong>${JKASKUS.length} kas khusus</strong>`);
        $('#j-hint').innerHTML = `✔ ${bagian.join(' + ')} dipilih — total <strong>${fmt(totalKer())}</strong>. Akun tiap tagihan otomatis mengikuti jenis tagihannya; setoran kas khusus masuk ke akunnya sendiri. Klik <strong>Entry</strong> untuk menerbitkan <strong>satu nomor BKM</strong> & menandai tagihan terbayar.`;
      } else if (JCUR) {
        $('#j-hint').innerHTML = `Centang tagihan di atas untuk entry sekaligus (boleh lebih dari satu), atau isi <strong>Jenis Tagihan</strong> + nominal untuk satu per satu. Nama di luar data santri juga tetap bisa.`;
      } else {
        const v = $('#j-nama').value.trim();
        $('#j-hint').textContent = v ? 'Nama tidak ada di data santri — kas masuk manual: isi nominal & akun, lalu Entry.' : '';
      }
    };

    const renderKeranjang = () => {
      const box = $('#j-keranjang'); if (!box) return;
      /* preset kas khusus (uang saku/tabungan/tagihan lain): draf tagihan iuran tidak disentuh */
      if (STATE.jurnal.preset) { box.hidden = true; return; }
      const k = keranjangSimpan();
      if (!k) { box.hidden = true; return; }
      box.hidden = false;
      const nm = $('#ker-nama');
      if (nm) nm.textContent = '— ' + k.nama + (k.kelas ? ' • ' + k.kelas : '');
      const list = $('#ker-list');
      if (list) {
        const kkHtml = (k.kaskus || []).map((i, idx) => `
          <div class="ker-item ker-kk">
            <span class="ker-label">🪙 Setor ${esc(i.akun)}</span>
            <span class="ker-nom">${fmt(i.nominal)}</span>
            <button type="button" class="ker-hapus" data-kkidx="${idx}" title="Buang dari keranjang">✕</button>
          </div>`).join('');
        list.innerHTML = k.items.map(i => `
          <div class="ker-item">
            <span class="ker-label">${esc(i.label)}</span>
            <span class="ker-nom">${fmt(i.sisa)}</span>
            <button type="button" class="ker-hapus" data-tid="${esc(i.id)}" title="Buang dari keranjang">✕</button>
          </div>`).join('') + kkHtml;
        $$('#ker-list .ker-hapus[data-tid]').forEach(b => b.onclick = () => {
          const tid = b.dataset.tid;
          const cb = $$('#j-tagihan-list input[type="checkbox"]').find(c => c.dataset.tid === tid);
          if (cb) { cb.click(); return; }
          JPILIH.delete(tid);      /* tagihan sudah tidak ada di daftar (mis. lunas) */
          renderTagihan();
          sinkronMode();
        });
        $$('#ker-list .ker-hapus[data-kkidx]').forEach(b => b.onclick = () => {
          JKASKUS.splice(Number(b.dataset.kkidx), 1);
          renderKeranjang();
          sinkronMode();
        });
      }
      const nKk = (k.kaskus || []).length;
      const tot = $('#ker-total');
      if (tot) tot.innerHTML = `<strong>${k.items.length} tagihan${nKk ? ` + ${nKk} kas khusus` : ''}</strong> • total <strong class="pos">${fmt(k.items.reduce((a, i) => a + (Number(i.sisa) || 0), 0) + (k.kaskus || []).reduce((a, i) => a + (Number(i.nominal) || 0), 0))}</strong>`;
      const bEntry = $('#ker-entry');
      if (bEntry) bEntry.disabled = false;
    };

    const sinkronMode = () => {
      const n = JPILIH.size;
      const nKk = JKASKUS.length;
      const adaKer = n > 0 || nKk > 0;
      const fld = $('#j-f-jenis-tagihan');
      if (fld) fld.hidden = adaKer || !!STATE.jurnal.preset || !!jurnalAkunKreditur();
      /* preset kas khusus tidak relevan selama keranjang berisi item */
      $$('#j-preset-row .chip').forEach(c => { c.disabled = adaKer && (c.dataset.preset || '') !== ''; });
      const kkRow = $('#j-kaskus-row');
      if (kkRow) kkRow.hidden = !JCUR || !!STATE.jurnal.preset || !!JEDIT;
      $('#j-nom').readOnly = adaKer;
      if (adaKer) { $('#j-nom').value = totalKer(); JNOM_AUTO = true; }
      const tt = $('#j-tagihan-total');
      if (tt) tt.textContent = n ? `${n} tagihan • ${fmt(totalPilih())}` : (JTAGIHAN.length ? `${JTAGIHAN.length} tagihan tersedia` : '');
      const all = $('#j-pilih-semua');
      if (all) {
        all.checked = JTAGIHAN.length > 0 && n === JTAGIHAN.length;
        all.indeterminate = n > 0 && n < JTAGIHAN.length;
      }
      renderKeranjang();
      jurnalHint();
    };
    JSINKRON = sinkronMode;   /* sinkronMode berblok di cabang kas masuk — diekspor utk handler akun */

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
      /* mode kreditur (akun Hutang): nama bukan santri — jangan tawarkan tagihan iuran */
      if (jurnalAkunKreditur()) {
        JCUR = null;
        JPILIH = new Set(); JKASKUS = []; JTAGIHAN = []; JNANTI = [];
        if (boxEl) boxEl.hidden = true;
        jurnalTagihanSelect(null, null);
        if (!JEDIT) isiNomOtomatis('');
        sinkronMode();
        return;
      }
      const s = cocokSantri(el.value);
      /* keranjang berisi santri lain → tanya dulu sebelum dibuang */
      const kerAwal = keranjangMuat();
      const idLama = JCUR ? String(JCUR.id) : (kerAwal ? String(kerAwal.santri_id) : '');
      if (!JEDIT && s && kerAwal && idLama && String(s.id) !== idLama) {
        const nKer = kerAwal.items.length + ((kerAwal.kaskus || []).length);
        const ok = confirm(`🧺 Keranjang berisi ${nKer} item untuk "${kerAwal.nama}".\nGanti santri & buang isi keranjang?`);
        if (!ok) { el.value = kerAwal.nama; return jurnalNamaPick(); }
        keranjangHapus();
      }
      JCUR = s || null;
      JPILIH = new Set(); JKASKUS = []; JTAGIHAN = []; JNANTI = [];
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
          /* pulihkan draf keranjang utk santri ini (tagihan yg sudah lunas dibuang otomatis) */
          const kerK = keranjangMuat();
          if (kerK && String(kerK.santri_id) === String(s.id)) {
            const ada = new Set(JTAGIHAN.map(t => t.id));
            JPILIH = new Set((kerK.items || []).map(i => i.id).filter(id => ada.has(id)));
            JKASKUS = Array.isArray(kerK.kaskus)
              ? kerK.kaskus.filter(x => x && x.akun && Number(x.nominal) > 0).map(x => ({ akun: String(x.akun), nominal: Number(x.nominal) }))
              : [];
            const hilang = (kerK.items || []).length - JPILIH.size;
            if (hilang > 0) toast(`${hilang} tagihan di keranjang tidak berlaku lagi (sudah terbayar) & dibuang`);
          }
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
      jurnalToggleKreditur();
    };

    /* sakelar kirim info + kwitansi ke WA wali — pilihan diingat di browser */
    const cbWa = $('#j-wa-wali');
    if (cbWa) { cbWa.checked = waWaliAktif(); cbWa.onchange = () => waWaliSimpan(cbWa.checked); }

    /* tombol keranjang: Entry memakai alur entry biasa (satu nomor BKM) */
    const bKerEntry = $('#ker-entry');
    if (bKerEntry) bKerEntry.onclick = () => $('#j-entry').click();
    const bKerKosong = $('#ker-kosong');
    if (bKerKosong) bKerKosong.onclick = () => {
      if (!JPILIH.size && !JKASKUS.length && !keranjangMuat()) return;
      if (!confirm('Kosongkan keranjang pembayaran?')) return;
      JPILIH.clear();
      JKASKUS = [];
      keranjangHapus();
      const all = $('#j-pilih-semua'); if (all) all.checked = false;
      renderTagihan();
      sinkronMode();
    };

    /* setoran kas khusus (uang saku/tabungan/tagihan lain) sebagai item keranjang */
    $$('#j-kaskus-row .chip').forEach(c => c.onclick = () => {
      const akun = c.dataset.kk;
      if (STATE.jurnal.preset || !JCUR) return toast('Pilih nama santri dulu', 'error');
      openModal('🪙 Setor ' + akun, `
        <div class="field"><label>Nominal Setor (Rp)</label>
          <input type="number" id="kk-nom" min="1" step="1000" placeholder="0" style="width:100%"></div>
        <p class="muted" style="font-size:12px;margin:8px 0 0">Menambah saldo <strong>${esc(akun)}</strong> milik <strong>${esc(JCUR.nama)}</strong> — masuk keranjang & jadi satu nomor BKM dengan tagihan iuran.</p>`,
        `<button class="btn" id="kk-batal">Batal</button><button class="btn btn-primary" id="kk-ok">✔ Tambah ke Keranjang</button>`);
      const batal = $('#kk-batal'); if (batal) batal.onclick = closeModal;
      const ok = () => {
        const v = Number($('#kk-nom').value);
        if (!(v > 0)) return toast('Nominal harus lebih dari 0', 'error');
        JKASKUS.push({ akun, nominal: v });
        closeModal();
        sinkronMode();
        toast(`Setor ${akun} ${fmt(v)} masuk keranjang`);
      };
      const okBtn = $('#kk-ok'); if (okBtn) okBtn.onclick = ok;
      const inp = $('#kk-nom');
      if (inp) { inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } }; inp.focus(); }
    });

    /* pulihkan draf sesi sebelumnya — nama santri & tagihan terpilih kembali otomatis */
    if (!JEDIT) {
      const kerDraf = keranjangMuat();
      if (kerDraf) {
        $('#j-nama').value = kerDraf.nama;
        $('#j-kelas').value = kerDraf.kelas || '';
        jurnalNamaPick();
      }
    }

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

      if (JPILIH.size > 0 || JKASKUS.length > 0) {
        const dipilih = JTAGIHAN.filter(t => JPILIH.has(t.id));
        const kaskus = JKASKUS.map(x => ({ akun: x.akun, nominal: Number(x.nominal) }));
        if (kaskus.some(k => !(k.nominal > 0))) return toast('Nominal kas khusus harus > 0', 'error');
        const payload = Object.assign({}, base, {
          items: [...JPILIH].map(tid => ({ tagihan_id: tid })),
          kaskus,
          santri_id: (dipilih[0] && dipilih[0].santri_id) || (cocok ? cocok.id : ''),
          akun: $('#j-akun').value || ''
        });
        buktiKePayload(payload, 'transfer', 'bukti_transfer_b64', 'hapus_bukti_transfer');
        if (!payload.tanggal || !payload.nama) return toast('Tanggal & nama wajib diisi', 'error');
        let r = null;
        try {
          r = await API.post('/api/jurnal', payload);
          const nT = JPILIH.size, nK = kaskus.length;
          toast((nT ? `${nT} tagihan` : '') + (nT && nK ? ' + ' : '') + (nK ? `${nK} kas khusus` : '') + ` tercatat — total ${fmt(r.total)}`);
          STATE.jurnal.tanggal = payload.tanggal;
        } catch (e) { return toast(e.message, 'error'); }
        const noBkmMasuk = (Array.isArray(r.jurnal) && r.jurnal[0] && r.jurnal[0].no_bkm) || '';
        JPILIH = new Set(); JTAGIHAN = []; JKASKUS = [];
        keranjangHapus();          /* draf selesai — entry sudah jadi satu BKM */
        refreshSaldo(); pageJurnal();
        if (noBkmMasuk) kirimInfoWaWali(noBkmMasuk, payload.nama);
        return;
      }

      if (!tunggal.tanggal || !tunggal.nama || !(tunggal.nominal > 0)) return toast('Tanggal, nama & nominal wajib diisi', 'error');
      let rT = null;
      try {
        rT = await API.post('/api/jurnal', tunggal);
        toast('Entry tersimpan ke jurnal & kas');
        STATE.jurnal.tanggal = tunggal.tanggal;
      } catch (e) { return toast(e.message, 'error'); }
      refreshSaldo(); pageJurnal();
      /* kas masuk utk santri (termasuk preset kas khusus) → info + kwitansi ke WA wali */
      if (rT && rT.no_bkm && cocok) kirimInfoWaWali(rT.no_bkm, tunggal.nama);
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

    /* saldo kas khusus santri terpilih — tampil di bawah kolom nama;
       uang saku bernilai 0 → dilarang mencatat kas keluar */
    const jSaldoK = () => {
      const el = $('#j-saldo-k'); if (!el) return;
      const cfgP = MUTASI_CFG[STATE.jurnal.preset || ''];
      const v = ($('#j-nama') ? $('#j-nama').value : '').trim();
      if (!cfgP || !v) { el.textContent = ''; el.style.color = ''; return; }
      const sS = cocokSantri(v);
      if (!sS) { el.textContent = ''; el.style.color = ''; return; }
      const keyS = { us: 'saldo_us', tab: 'saldo_tab', lain: 'saldo_lain' }[cfgP.kode] || '';
      if (!keyS) { el.textContent = ''; el.style.color = ''; return; }
      const sisa = Number(sS[keyS]) || 0;
      const blok = cfgP.kode === 'us' && sisa <= 0;
      el.textContent = 'Saldo ' + cfgP.akun + ': ' + fmt(sisa)
        + (blok ? ' — saldo 0, tidak bisa mencatat kas keluar uang saku' : '');
      el.style.color = blok ? '#ef4444' : '';
    };
    const elNamaK = $('#j-nama');
    /* mode kreditur: "Dibayarkan kepada" ikut terisi nama kreditur selama belum diketik user */
    const dibEl = $('#j-dibayar');
    if (dibEl) dibEl.addEventListener('input', () => { delete dibEl.dataset.auto; });
    const syncKreditur = () => { jSaldoK(); jurnalToggleKreditur(); };
    if (elNamaK) { elNamaK.oninput = syncKreditur; elNamaK.onchange = syncKreditur; }
    jSaldoK();

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
      } else if (jurnalAkunKreditur()) {
        /* akun Biaya Angsuran Hutang — nama = kreditur, bukan santri */
        payload.nama = namaK;
        payload.santri_id = '';
        payload.kelas = '';
      }
      if (!payload.tanggal || !payload.akun || !payload.sumber_dana || !(payload.nominal > 0)) {
        return toast('Tanggal, akun pengeluaran, sumber dana & nominal wajib diisi', 'error');
      }
      if (presetKeluar && !payload.nama) return toast('Nama santri wajib diisi untuk kas keluar khusus', 'error');
      if (!presetKeluar && jurnalAkunKreditur() && !payload.nama) {
        return toast('Nama kreditur wajib diisi untuk akun ' + jurnalAkunKreditur(), 'error');
      }
      /* uang saku: saldo santri 0 → entry kas keluar ditolak (sesuai aturan backend) */
      if (!JEDIT && payload.sumber_dana === 'Uang Saku' && payload.nama) {
        const sUS = cocokK || cocokSantri(payload.nama);
        if (sUS && (Number(sUS.saldo_us) || 0) <= 0) {
          return toast('Saldo uang saku ' + sUS.nama + ' Rp 0 — tidak bisa mencatat kas keluar uang saku', 'error');
        }
      }
      try {
        if (JEDIT) {
          await API.put('/api/jurnal/' + JEDIT, payload);
          toast('Jurnal keluar diperbarui — kas ikut disesuaikan');
        } else {
          const rK = await API.post('/api/jurnal', payload);
          toast('Entry kas keluar tersimpan ke jurnal & kas'
            + (rK && rK.wa_antre ? ' • Info transaksi ke wali diantre' : ''));
          STATE.jurnal.tanggal = payload.tanggal;
        }
        JEDIT = null; refreshSaldo(); pageJurnal();
      } catch (e) { toast(e.message, 'error'); }
    };
  }
  $('#j-batal').onclick = () => { JEDIT = null; JCUR = null; pageJurnal(); };

  /* --- No BKK otomatis mengikuti seri sumber dana (kas khusus ↔ kas biasa) --- */
  const jBkkEl = $('#j-bkk');
  if (jBkkEl && !JEDIT) {
    JNO_AUTO = true;
    /* user mengetik sendiri → nomor tak lagi ditimpa; user mengosongkan lagi → otomatis aktif */
    jBkkEl.addEventListener('input', () => { JNO_AUTO = jBkkEl.value.trim() === ''; });
  }

  /* --- preset kas khusus (Uang Saku / Tabungan / Tagihan Lain) --- */
  $$('#j-preset-row .chip').forEach(c => c.onclick = () => {
    const kode = c.dataset.preset || '';
    if (f.arah === 'masuk' && kode && (JPILIH.size > 0 || JKASKUS.length)) {
      return toast('🧺 Keranjang masih berisi item — kosongkan dulu sebelum pindah ke kas khusus', 'error');
    }
    const aktifSebelum = STATE.jurnal.preset || '';
    STATE.jurnal.preset = kode;
    /* melepas preset kas khusus → sumber dana ikut dikosongkan (bila tadi dipaksa preset) */
    if (f.arah === 'keluar' && aktifSebelum && !kode) {
      const sEl = $('#j-sumber'); if (sEl) sEl.value = '';
    }
    jurnalPasangPreset(f.arah);
    if (f.arah === 'keluar') {
      const nk = $('#j-nama'); if (nk) nk.dispatchEvent(new Event('input'));   // segarkan hint saldo
      segarkanNoBkk();                                                        // ganti seri nomor BKK
    }
  });
  const jAkunEl = $('#j-akun');
  if (jAkunEl) jAkunEl.onchange = () => {
    /* keranjang tagihan masih berisi → menyalakan mode Kreditur membuangnya; tolak dulu
       (aturan sama dgn chip preset kas khusus) */
    if (f.arah === 'masuk' && jurnalAkunKreditur() && (JPILIH.size > 0 || JKASKUS.length > 0)) {
      jAkunEl.value = JAKUN_PREV;
      return toast('🧺 Keranjang masih berisi item — kosongkan dulu sebelum masuk mode Kreditur (akun Hutang)', 'error');
    }
    jurnalToggleKreditur();          // akun Hutang / Biaya Angsuran Hutang → mode kreditur
    if (masuk && JSINKRON) JSINKRON();
    const cfgP = MUTASI_CFG[STATE.jurnal.preset || ''];
    if (!cfgP) return;
    const harap = f.arah === 'keluar' ? cfgP.akunKeluar : cfgP.akun;
    if (jAkunEl.value !== harap) jurnalHapusPreset();
  };
  const jSumberEl = $('#j-sumber');
  if (jSumberEl) jSumberEl.onchange = () => {
    const cfgP = MUTASI_CFG[STATE.jurnal.preset || ''];
    if (cfgP && jSumberEl.value !== cfgP.akun) jurnalHapusPreset();
    jurnalToggleKKKeluar();
    segarkanNoBkk();   // sumber pindah antar seri → nomor BKK ikut berganti
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
    jurnalToggleKKKeluar();
    buktiPreview('j-nt-prev', 'j-nt-del', j.bukti_nota || '');
    buktiPreview('j-ttd-prev', 'j-ttd-del', j.ttd_penerima || '');
    const namaKEl = $('#j-nama');
    if (namaKEl) {
      namaKEl.value = j.nama || '';
      const fNK = $('#j-f-nama-k');
      if (fNK) fNK.hidden = !STATE.jurnal.preset && !j.nama;   // tampil bila preset aktif / entry punya nama
      namaKEl.dispatchEvent(new Event('input'));               // segarkan hint saldo kas khusus
    }
    jurnalToggleKreditur();                                    // entry berakun Biaya Angsuran Hutang → mode kreditur
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
  jurnalToggleKreditur();
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

/* =========================================================
   ENTRY KAS KELUAR KHUSUS (format Jurnal Kas admin) — halaman UPJ:
   No BKK seri per sumber (counter sama dgn admin), nama wajib +
   cek saldo, akun keluar otomatis mengikuti sumber dana
   ========================================================= */
/** peta rename akun (Pengaturan → Kelola Akun) — {} bila tak terbaca */
async function upjPetaAkun() {
  try { const a = await API.get('/api/akun'); return (a && a.peta) || {}; } catch (e) { return {}; }
}
/** sumber dana → konfigurasi kas khusus (cocok nama asli maupun nama setelah rename) */
function upjCfgDariSumber(sumber, peta) {
  let hit = null;
  Object.values(MUTASI_CFG).forEach(c => {
    const kini = (peta && peta[c.akun]) || c.akun;
    if (sumber && (sumber === c.akun || sumber === kini)) hit = c;
  });
  return hit;
}
/** nama kanonik → nama akun saat ini (ikut rename) */
function upjAkunKini(nama, peta) { return (peta && peta[nama]) || nama; }
/** No BKK berikutnya utk seri sumber dana — ditulis selama belum diketik user (autoRef.on) */
async function upjIsiNoBkk(el, sumber, autoRef) {
  if (!el || !sumber) return;
  try {
    const r = await API.get('/api/jurnal?act=next&arah=keluar&sumber=' + encodeURIComponent(sumber));
    const no = (r && r.no_bkk) || '';
    if (!no) return;
    if (autoRef.on || el.value.trim() === '') el.value = no;
  } catch (e) { /* senyap — form tetap bisa dipakai */ }
}
/** cocokkan nama santri: persis → awalan unik → mengandung unik (sama dgn Jurnal Kas admin) */
function upjCocokSantri(list, v) {
  v = String(v || '').trim().toLowerCase();
  if (!v) return null;
  const arr = Array.isArray(list) ? list : [];
  const n = x => String(x || '').trim().toLowerCase();
  const persis = arr.find(x => n(x.nama) === v);
  if (persis) return persis;
  const awal = arr.filter(x => n(x.nama).startsWith(v));
  if (awal.length === 1) return awal[0];
  const isi = arr.filter(x => n(x.nama).includes(v));
  return isi.length === 1 ? isi[0] : null;
}
/** hint saldo kas khusus santri di bawah kolom nama — Uang Saku saldo 0 ditandai merah */
function upjHintSaldo(el, cfg, v, list) {
  if (!el) return;
  const s = v ? upjCocokSantri(list, v) : null;
  if (!cfg || !s) { el.textContent = ''; el.style.color = ''; return; }
  const keyS = { us: 'saldo_us', tab: 'saldo_tab', lain: 'saldo_lain' }[cfg.kode] || '';
  if (!keyS) { el.textContent = ''; el.style.color = ''; return; }
  const sisa = Number(s[keyS]) || 0;
  const blok = cfg.kode === 'us' && sisa <= 0;
  el.textContent = 'Saldo ' + cfg.akun + ': ' + fmt(sisa)
    + (blok ? ' — saldo 0, tidak bisa mencatat kas keluar uang saku' : '');
  el.style.color = blok ? '#ef4444' : '';
}

/** Buka Jurnal Kas dengan preset akun kas khusus (entry dipindah ke sini) */
function bukaJurnalKas(cfg, arah) {
  STATE.jurnal = Object.assign({}, STATE.jurnal, { arah: arah === 'keluar' ? 'keluar' : 'masuk', preset: cfg ? cfg.kode : '' });
  JEDIT = null;
  if (location.hash.split('?')[0] === '#/jurnal') pageJurnal();
  else location.hash = '#/jurnal';
}

/* =========================================================
   PEMBAGIAN UANG SAKU KUMULATIF — 1 tombol:
   jurnal kas keluar (satu BKK) + file PDF daftar + info wali
   ========================================================= */
function modalPembagian(listSantri, kode) {
  const semua = (Array.isArray(listSantri) ? listSantri : []);
  const byId  = new Map(semua.map(s => [s.id, s]));
  const saldoOf = (s) => Number(s && s.saldo_us) || 0;
  /* saldo uang saku 0 → nama santri tidak muncul pada daftar pembagian */
  const aktif = semua.filter(s => (s.status || 'aktif') === 'aktif' && saldoOf(s) > 0);
  if (!aktif.length) return toast('Tidak ada santri dengan saldo uang saku > 0 — isi dulu Saldo Awal Uang Saku di menu Data Santri', 'error');
  const kelasList = [...new Set(aktif.map(s => String(s.kelas || '-').trim()))].sort();
  const pilih = new Set();          // id santri tercentang
  const nom   = new Map();          // id -> nominal per baris (override nominal global)
  let gNom = 50000, gQ = '', gKelas = '';
  const autoKet = (tg) => { const [y, m, d] = String(tg || '').split('-'); return `Pembagian Uang Saku ${d} - ${m} - ${y}`; };
  /* nominal OTOMATIS dari kolom "Nominal Pembagian Uang Saku" tiap santri (fallback: nominal default),
     dipatok saldo terakhir — saldo kurang dari nominal = yang terbagi hanya sisa saldonya */
  const autoOf = (s) => { const n = Number(s.nominal_us) || 0; return n > 0 ? n : gNom; };
  const valOf  = (s) => Math.min(Number(nom.has(s.id) ? nom.get(s.id) : autoOf(s)) || 0, saldoOf(s));

  openModal('💰 Pembagian Uang Saku Kumulatif', `
    <div class="filters" style="margin-bottom:6px">
      <div class="field"><label>Tanggal</label><input type="date" id="pg-tgl" value="${today()}"></div>
      <div class="field"><label>Jenis Transaksi</label><select id="pg-jenis">${['Cas', 'BRI', 'BSI', 'BPD'].map(v => `<option>${v}</option>`).join('')}</select></div>
      <div class="field"><label>Kelompok (judul PDF)</label><select id="pg-kelompok"><option value="">Tanpa label</option><option>Putra</option><option>Putri</option></select></div>
      <div class="field grow"><label>Keterangan</label><input id="pg-ket" value="${esc(autoKet(today()))}"></div>
    </div>
    <div class="filters" style="margin-bottom:6px">
      <div class="field" title="Nominal tiap santri otomatis memakai kolom 'Nominal Pembagian Uang Saku' di Data Santri — nilai ini dipakai bila kolom itu kosong"><label>Nominal default</label><input type="number" id="pg-nom" value="${gNom}" min="0" step="1000"></div>
      <div class="field"><button class="btn" id="pg-apply" style="margin-top:24px">Terapkan ke terpilih</button></div>
      <div class="field grow"><label>Cari santri</label><input id="pg-q" placeholder="nama atau NIS…"></div>
      <div class="field"><label>Kelas</label><select id="pg-kelas"><option value="">Semua kelas</option>${kelasList.map(k => `<option>${esc(k)}</option>`).join('')}</select></div>
    </div>
    <div class="table-wrap" style="max-height:300px;border:1px solid var(--border);border-radius:10px">
      <table>
        <thead><tr><th style="width:34px"><input type="checkbox" id="pg-all" title="Pilih semua hasil filter"></th><th class="num" style="width:38px">#</th><th style="width:92px">Kode</th><th>Nama Santri</th><th style="width:92px">Kelas</th><th class="num" style="width:118px">Saldo (Rp)</th><th class="num" style="width:132px">Jumlah (Rp)</th></tr></thead>
        <tbody id="pg-body"></tbody>
      </table>
    </div>
    <p id="pg-info" class="muted" style="margin:8px 0 0;font-size:13px"></p>
  `, `
    <button class="btn" onclick="closeModal()">Batal</button>
    <button class="btn btn-gold" id="pg-simpan">💰 Simpan & Buat PDF</button>
  `, 880);

  const rows = () => aktif.filter(s =>
    (!gKelas || String(s.kelas || '-').trim() === gKelas) &&
    (!gQ || (String(s.nama) + ' ' + String(s.nis || '')).toLowerCase().includes(gQ)));
  const info = () => {
    let t = 0, terbatas = 0;
    aktif.forEach(s => {
      if (!pilih.has(s.id)) return;
      t += valOf(s);
      if ((Number(nom.has(s.id) ? nom.get(s.id) : autoOf(s)) || 0) > saldoOf(s)) terbatas++;
    });
    $('#pg-info').innerHTML = `<strong>${pilih.size}</strong> santri dipilih — total pembagian <strong>${fmt(t)}</strong>`
      + (terbatas ? ` • <strong>${terbatas}</strong> santri dibatasi sisa saldo terakhir` : '')
      + ` • pesan info ke wali otomatis diantre (No WA dari Data Santri, dikirim bot)`;
  };
  const render = () => {
    const list = rows();
    $('#pg-body').innerHTML = list.length ? list.map((s, i) => `
      <tr>
        <td><input type="checkbox" data-pgid="${esc(s.id)}" ${pilih.has(s.id) ? 'checked' : ''}></td>
        <td class="num muted">${i + 1}</td>
        <td class="nowrap">${esc(s.nis || '-')}</td>
        <td>${esc(s.nama)}</td>
        <td class="nowrap">${esc(s.kelas || '-')}</td>
        <td class="num muted">${fmt(saldoOf(s))}</td>
        <td class="num"><input type="number" data-pgnom="${esc(s.id)}" value="${valOf(s)}" min="0" step="1000" style="width:114px;text-align:right"></td>
      </tr>`).join('') : `<tr><td colspan="7" class="muted" style="padding:14px;text-align:center">Tidak ada santri pada filter ini</td></tr>`;
    $$('#pg-body [data-pgid]').forEach(c => c.onchange = () => {
      if (c.checked) { pilih.add(c.dataset.pgid); } else { pilih.delete(c.dataset.pgid); }
      $('#pg-all').checked = list.length > 0 && list.every(s => pilih.has(s.id));
      info();
    });
    $$('#pg-body [data-pgnom]').forEach(inp => inp.oninput = () => {
      const s = byId.get(inp.dataset.pgnom);
      let v = Number(inp.value) || 0;
      if (s && v > saldoOf(s)) { v = saldoOf(s); inp.value = v; }   // saldo kurang → dipatok sisa saldo
      nom.set(inp.dataset.pgnom, v);
      info();
    });
    $('#pg-all').checked = list.length > 0 && list.every(s => pilih.has(s.id));
    info();
  };

  $('#pg-all').onchange = (e) => {
    rows().forEach(s => { if (e.target.checked) { pilih.add(s.id); } else { pilih.delete(s.id); } });
    render();
  };
  let qT; $('#pg-q').oninput = () => {
    clearTimeout(qT);
    qT = setTimeout(() => { gQ = $('#pg-q').value.trim().toLowerCase(); render(); }, 300);
  };
  $('#pg-kelas').onchange = (e) => { gKelas = e.target.value; render(); };
  $('#pg-nom').oninput = (e) => { gNom = Number(e.target.value) || 0; render(); };
  $('#pg-tgl').onchange = (e) => { $('#pg-ket').value = autoKet(e.target.value); };
  $('#pg-apply').onclick = () => {
    if (!pilih.size) { return toast('Centang dulu santri yang diberi nominal ini', 'error'); }
    pilih.forEach(sid => nom.set(sid, gNom));
    render();
    toast(`Nominal ${fmt(gNom)} diterapkan ke ${pilih.size} santri`);
  };
  $('#pg-simpan').onclick = async () => {
    const tanggal = $('#pg-tgl').value;
    if (!tanggal) { return toast('Tanggal wajib diisi', 'error'); }
    if (!pilih.size) { return toast('Pilih minimal satu santri', 'error'); }
    const items = [...pilih].map(sid => ({ santri_id: sid, nominal: byId.has(sid) ? valOf(byId.get(sid)) : 0 }));
    if (items.some(x => !(x.nominal > 0))) { return toast('Nominal tiap santri harus lebih dari 0', 'error'); }
    const btn = $('#pg-simpan');
    btn.disabled = true; btn.textContent = '⏳ Menyimpan…';
    try {
      const r = await API.post('/api/pembagian', {
        tanggal,
        jenis_transaksi: $('#pg-jenis').value,
        kelompok: $('#pg-kelompok').value,
        keterangan: $('#pg-ket').value.trim(),
        items
      });
      closeModal();
      toast(`Pembagian ${r.dibuat} santri • ${r.no_bkk} • total ${fmt(r.total)} — daftar tersimpan sbg PDF`
        + (r.dilewati ? ` • ${r.dilewati} dilewati (saldo 0)` : '')
        + (r.wa_antre ? ` • ${r.wa_antre} info ke wali diantre${r.wa_lewat ? ` (${r.wa_lewat} tanpa No WA)` : ''}` : ''));
      if (r.pdf) { window.open(linkAuth(r.pdf), '_blank'); }
      refreshSaldo();
      if (kode) { pageMutasi(kode); }
    } catch (e) {
      toast(e.message, 'error');
      btn.disabled = false; btn.textContent = '💰 Simpan & Buat PDF';
    }
  };
  render();
}

async function pageMutasi(kode) {
  const cfg = MUTASI_CFG[kode];
  if (!cfg) { location.hash = '#/dashboard'; return; }
  const upj = peranUpj();
  const f = Object.assign({ dari: '', sampai: '', q: '', jenis_transaksi: 'semua', santri_id: '', tab: 'mutasi' }, STATE.mutasi[kode]);
  /* UPJ: tab Rekap Saldo per Santri dipindah ke menu terpisah (#/rekap-saldo) */
  f.tab = upj ? 'mutasi' : (f.tab === 'rekap' ? 'rekap' : 'mutasi');
  STATE.mutasi[kode] = f;
  const diMutasi = f.tab === 'mutasi';

  const qs = new URLSearchParams({ sub: cfg.sub });
  if (f.dari) qs.set('dari', f.dari);
  if (f.sampai) qs.set('sampai', f.sampai);
  if (f.q) qs.set('q', f.q);
  if (f.jenis_transaksi && f.jenis_transaksi !== 'semua') qs.set('jenis_transaksi', f.jenis_transaksi);
  if (f.santri_id) qs.set('santri_id', f.santri_id);

  const [data, set, santri, pemb, akunP] = await Promise.all([
    API.get('/api/mutasi?' + qs),
    API.get('/api/pengaturan'),
    API.get('/api/santri'),
    kode === 'us' ? API.get('/api/pembagian') : Promise.resolve({ list: [] }),
    upj ? API.get('/api/akun').catch(() => ({})) : Promise.resolve({})
  ]);

  const peta = (akunP && akunP.peta) || {};
  /* UPJ — entry jurnal per-akun: sumber dana & akun keluar memakai nama saat ini
     (ikut rename), No BKK seri mengikuti counter Jurnal Kas admin */
  const sumberK = upjAkunKini(cfg.akun, peta);
  const akunKeluarK = (() => {
    const kini = upjAkunKini(cfg.akunKeluar, peta);
    const daftar = (akunP && akunP.pengeluaran) || [];
    if (daftar.includes(kini)) return kini;
    const lo = String(kini).toLowerCase();
    return daftar.find(a => String(a).toLowerCase() === lo) || kini;
  })();
  let nextBkk = '';
  if (upj) {
    try {
      const rNext = await API.get('/api/jurnal?act=next&arah=keluar&sumber=' + encodeURIComponent(sumberK));
      nextBkk = (rNext && rNext.no_bkk) || '';
    } catch (e) { nextBkk = ''; }
  }
  const seriBkk = (String(nextBkk).match(/^BKK\/([^/]+)/) || [])[1] || '-';
  /* user sudah pindah halaman saat data dimuat → jangan timpa konten halaman baru */
  if (STATE.page !== 'mutasi-' + kode) return;
  const list = Array.isArray(data.list) ? data.list : [];
  const rekap = Array.isArray(data.per_santri) ? data.per_santri : [];
  const pembList = Array.isArray(pemb.list) ? pemb.list : [];
  const badgeJenis = (v) => `<span class="badge ${v === 'Cas' ? 'cash' : 'bank'}">${esc(v)}</span>`;
  const periodeTxt = (f.dari || f.sampai)
    ? `${f.dari ? tglLabel(f.dari) : 'Awal'} s/d ${f.sampai ? tglLabel(f.sampai) : 'Sekarang'}`
    : 'Seluruh periode';

  $('#content').innerHTML = `
    <div class="print-head">
      <h2>${esc(set.nama_pesantren)}</h2>
      <p>${esc(set.alamat)}</p>
      <p><strong>${diMutasi ? 'LAPORAN MUTASI ' + esc(cfg.akun.toUpperCase()) : 'REKAP SALDO PER SANTRI — ' + esc(cfg.akun.toUpperCase())}</strong> — ${periodeTxt} (TA ${esc(set.tahun_ajaran)})</p>
      <p>Saldo awal ${fmt(data.saldo_awal)} • Masuk ${fmt(data.total_masuk)} • Keluar ${fmt(data.total_keluar)} • <strong>Saldo akhir ${fmt(data.saldo_akhir)}</strong></p>
    </div>

    <div class="grid grid-4">
      <div class="stat saldo"><div class="stat-ico">${cfg.ico}</div><div class="stat-label">Saldo ${esc(cfg.akun)}</div><div class="stat-value" style="font-size:19px">${fmt(data.saldo_akhir)}</div><div class="stat-sub">Saldo awal ${fmt(data.saldo_awal)}</div></div>
      <div class="stat masuk"><div class="stat-ico">⬆️</div><div class="stat-label">Total Masuk</div><div class="stat-value" style="font-size:19px">${fmt(data.total_masuk)}</div><div class="stat-sub">periode ditampilkan</div></div>
      <div class="stat keluar"><div class="stat-ico">⬇️</div><div class="stat-label">Total Keluar</div><div class="stat-value" style="font-size:19px">${fmt(data.total_keluar)}</div><div class="stat-sub">periode ditampilkan</div></div>
      <div class="stat iuran"><div class="stat-ico">📒</div><div class="stat-label">Jumlah Mutasi</div><div class="stat-value">${data.jumlah}</div><div class="stat-sub">baris pada filter ini</div></div>
    </div>

    ${upj ? '' : `
    <div class="card card-pad mt no-print">
      <div class="tabs" style="border:none;background:none;padding:0">
        <button type="button" class="tab ${diMutasi ? 'on' : ''}" data-mtab="mutasi">📒 Mutasi</button>
        <button type="button" class="tab ${diMutasi ? '' : 'on'}" data-mtab="rekap">🧾 Rekap Saldo per Santri (${rekap.length})</button>
        <span class="muted" style="font-size:12px;margin-left:auto">Filter tanggal & santri di bawah berlaku untuk mutasi maupun rekap</span>
      </div>
    </div>`}

    ${kode === 'us' ? `
    <div class="card card-pad mt no-print" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
      <div style="max-width:660px">
        <strong>💰 Pembagian Uang Saku kumulatif</strong>
        <p class="muted" style="margin:4px 0 0;font-size:12.5px">Satu tombol utk banyak santri — langsung menjadi <strong>jurnal kas keluar (satu nomor BKK)</strong>, daftar pembagian <strong>tersimpan sebagai file PDF</strong>, dan tiap penerima otomatis dikirimi <strong>info transaksi ke WhatsApp wali</strong> lewat bot.</p>
      </div>
      <button class="btn btn-gold" id="m-pembagian">💰 Pembagian Uang Saku</button>
    </div>

    ${pembList.length ? `<div class="card no-print">
      <div class="card-head"><h3>📄 Riwayat Pembagian (${pembList.length})</h3><span class="muted">daftar PDF bisa diunduh ulang kapan saja</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Tanggal</th><th>No BKK</th><th>Kelompok</th><th>Keterangan</th><th class="num">Santri</th><th class="num">Total</th><th class="num">Info WA</th><th></th></tr></thead>
        <tbody>${pembList.map(b => `
          <tr>
            <td class="nowrap">${tglLabel(b.tanggal)}</td>
            <td class="nowrap"><strong>${esc(b.no_bkk)}</strong></td>
            <td class="nowrap">${esc(b.kelompok || '-')}</td>
            <td>${esc(b.keterangan)}</td>
            <td class="num">${b.jumlah}</td>
            <td class="num"><strong>${fmt(b.total)}</strong></td>
            <td class="num">${b.wa_antre || 0}</td>
            <td class="actions"><button class="btn btn-sm" data-pemb-pdf="${esc(b.id)}">📥 PDF</button></td>
          </tr>`).join('')}</tbody>
        <tfoot><tr style="background:#f8fafc">
          <td colspan="5"><strong>Total ${pembList.length} pembagian</strong></td>
          <td class="num"><strong>${fmt(pembList.reduce((a, b) => a + (Number(b.total) || 0), 0))}</strong></td>
          <td class="num"><strong>${pembList.reduce((a, b) => a + (Number(b.wa_antre) || 0), 0)}</strong></td>
          <td></td>
        </tr></tfoot>
      </table></div>
    </div>` : ''}` : ''}

    ${diMutasi ? (upj ? `
    <div class="card card-pad mt no-print">
      <div class="card-head" style="border:none;padding:0 0 10px"><h3>✏️ Entry Jurnal ${esc(cfg.akun)}</h3>
        <span class="muted">sumber dana <strong>${esc(sumberK)}</strong>, akun keluar <strong>${esc(akunKeluarK)}</strong>, No BKK seri <strong>${esc(seriBkk)}</strong> — counter sama dengan Jurnal Kas admin</span></div>
      <div class="entry-grid entry-row">
        <div class="field"><label>Tanggal</label><input type="date" id="mj-tgl" value="${today()}"></div>
        <div class="field"><label>No BKK</label><input id="mj-bkk" value="${esc(nextBkk)}" placeholder="otomatis"></div>
        <div class="field grow"><label>Nama Santri</label>
          <input id="mj-nama" list="mj-dl-santri" placeholder="pilih nama santri dari data…" autocomplete="off">
          <datalist id="mj-dl-santri">${(Array.isArray(santri) ? santri : []).map(s => `<option value="${esc(s.nama)}">${esc(s.kelas || '')}</option>`).join('')}</datalist>
          <span class="hint muted" id="mj-saldo-k"></span>
        </div>
        <div class="field"><label>Nominal (Rp)</label><input type="number" id="mj-nom" min="1" step="1000" placeholder="0"></div>
        <div class="field grow"><label>Keterangan</label><input id="mj-ket" placeholder="mis. ${cfg.kode === 'us' ? 'pengambilan uang saku' : (cfg.kode === 'tab' ? 'penarikan tabungan' : 'pengembalian tagihan')}"></div>
        <div class="field field-btn"><label>&nbsp;</label>
          <div class="flex">
            <button class="btn btn-primary" id="mj-simpan">✔ Entry</button>
            <button class="btn" id="mj-reset">Reset</button>
          </div>
        </div>
      </div>
      <p class="hint muted" style="margin-top:10px">Tersimpan sebagai <strong>mutasi keluar ${esc(cfg.akun)}</strong> pada tabel di bawah; form lengkap dengan <strong>foto nota / tanda tangan &amp; jenis transaksi</strong> ada di menu <strong>Jurnal Kas Keluar</strong>.</p>
    </div>` : `
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
    </div>`) : ''}

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

    ${diMutasi ? `<div class="card">
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
              <td class="actions">${upj
                ? (m ? '' : `<button class="btn btn-sm btn-danger" data-mdel="${j.id}">Hapus</button>`)
                : `<button class="btn btn-sm" data-medit="${j.id}">Edit</button>
                   <button class="btn btn-sm btn-danger" data-mdel="${j.id}">Hapus</button>`}</td>
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
    </div>` : ''}

    ${diMutasi ? '' : `<div class="card">
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
    </div>`}`;

  /* --- submenu tab: Mutasi | Rekap Saldo per Santri --- */
  $$('[data-mtab]').forEach(b => b.onclick = () => {
    if (STATE.mutasi[kode].tab === b.dataset.mtab) return;
    STATE.mutasi[kode].tab = b.dataset.mtab;
    pageMutasi(kode);
  });

  /* --- pembagian uang saku kumulatif (khusus halaman Uang Saku) --- */
  const bPemb = $('#m-pembagian');
  if (bPemb) bPemb.onclick = () => modalPembagian(santri, kode);
  $$('[data-pemb-pdf]').forEach(b => b.onclick = () => {
    window.open(linkAuth('api.php?p=pembagian&id=' + encodeURIComponent(b.dataset.pembPdf) + '&act=pdf'), '_blank');
  });

  /* --- aksi toolbar (khusus tab Mutasi) --- */
  if (diMutasi) {
    if (upj) {
      /* --- entry jurnal per-akun: Tanggal, No BKK, Nama, Nominal, Keterangan --- */
      const bkkEl = $('#mj-bkk');
      const autoBkk = { on: true };
      /* user mengetik sendiri → nomor tak lagi ditimpa; user mengosongkan lagi → otomatis aktif */
      bkkEl.addEventListener('input', () => { autoBkk.on = bkkEl.value.trim() === ''; });
      const namaEl = $('#mj-nama');
      const hintK = () => upjHintSaldo($('#mj-saldo-k'), cfg, namaEl.value, santri);
      namaEl.oninput = hintK;
      hintK();
      $('#mj-reset').onclick = () => {
        $('#mj-tgl').value = today(); $('#mj-nom').value = ''; $('#mj-ket').value = '';
        namaEl.value = '';
        autoBkk.on = true; bkkEl.value = nextBkk;
        hintK();
      };
      $('#mj-simpan').onclick = async () => {
        const namaK = namaEl.value.trim();
        const cocokK = namaK ? upjCocokSantri(santri, namaK) : null;
        const payload = {
          arah: 'keluar',
          tanggal: $('#mj-tgl').value,
          no_bkk: bkkEl.value.trim(),
          akun: akunKeluarK,
          sumber_dana: sumberK,
          jenis_transaksi: 'Cas',
          nominal: Number($('#mj-nom').value),
          keterangan: $('#mj-ket').value.trim(),
          nama: namaK,
          santri_id: cocokK ? cocokK.id : '',
          kelas: cocokK ? (cocokK.kelas || '') : ''
        };
        if (!payload.tanggal || !(payload.nominal > 0)) return toast('Tanggal & nominal wajib diisi', 'error');
        if (!payload.nama) return toast('Nama santri wajib diisi untuk kas keluar khusus', 'error');
        /* uang saku: saldo santri 0 → entry kas keluar ditolak (sesuai aturan backend) */
        if (cfg.kode === 'us' && payload.nama) {
          const sUS = cocokK || upjCocokSantri(santri, payload.nama);
          if (sUS && (Number(sUS.saldo_us) || 0) <= 0) {
            return toast('Saldo uang saku ' + sUS.nama + ' Rp 0 — tidak bisa mencatat kas keluar uang saku', 'error');
          }
        }
        const btn = $('#mj-simpan');
        btn.disabled = true; btn.textContent = '⏳ Menyimpan…';
        try {
          const r = await API.post('/api/jurnal', payload);
          toast('Entry ' + cfg.akun + ' tersimpan — ' + (r.no_bkk || '')
            + (r && r.wa_antre ? ' • Info transaksi ke wali diantre' : ''));
          refreshSaldo();
          pageMutasi(kode);
        } catch (e) {
          btn.disabled = false; btn.textContent = '✔ Entry';
          toast(e.message, 'error');
        }
      };
    } else {
      const bMasuk = $('#m-ke-masuk'), bKeluar = $('#m-ke-keluar'), bKwit = $('#m-ke-kwitansi');
      if (bMasuk)  bMasuk.onclick  = () => bukaJurnalKas(cfg, 'masuk');
      if (bKeluar) bKeluar.onclick = () => bukaJurnalKas(cfg, 'keluar');
      if (bKwit)   bKwit.onclick   = () => { location.hash = '#/kwitansi'; };
    }
  }

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
  $('#m-reset').onclick = () => { STATE.mutasi[kode] = { tab: f.tab }; pageMutasi(kode); };
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
  const [data, set, bk] = await Promise.all([
    API.get('/api/saldo-akun' + (qs.toString() ? '?' + qs : '')),
    API.get('/api/pengaturan'),
    API.get('/api/saldo-bank')
  ]);
  const list = Array.isArray(data.list) ? data.list : [];
  const banks = Array.isArray(bk.banks) ? bk.banks : [];
  const riwayat = Array.isArray(bk.riwayat) ? bk.riwayat : [];
  const periodeTxt = (f.dari || f.sampai)
    ? `${f.dari ? tglLabel(f.dari) : 'Awal'} s/d ${f.sampai ? tglLabel(f.sampai) : 'Sekarang'}`
    : 'Seluruh periode';

  const kartuBank = [
    ...banks.map(b => `
      <div class="stat">
        <div class="stat-ico">🏦</div>
        <div class="stat-label">Saldo ${esc(b.kode)}</div>
        <div class="stat-value ${b.saldo < 0 ? 'neg' : ''}" style="font-size:19px">${fmt(b.saldo)}</div>
        <div class="stat-sub"><button class="btn btn-sm" data-tarik="${b.kode}" title="Tarik tunai dari ${b.kode} — saldo bank berkurang, saldo cash otomatis bertambah" ${b.saldo > 0 ? '' : 'disabled'}>⬇ Tarik Tunai</button></div>
      </div>`).join(''),
    `
      <div class="stat saldo">
        <div class="stat-ico">💵</div>
        <div class="stat-label">Saldo CASH</div>
        <div class="stat-value ${bk.cash < 0 ? 'neg' : ''}" style="font-size:19px">${fmt(bk.cash)}</div>
        <div class="stat-sub">kas fisik saat ini</div>
      </div>`
  ].join('');

  $('#content').innerHTML = `
    <div class="print-head">
      <h2>${esc(set.nama_pesantren)}</h2>
      <p>${esc(set.alamat)}</p>
      <p><strong>SALDO AKUN PEMASUKAN</strong> — ${periodeTxt} (TA ${esc(set.tahun_ajaran)})</p>
      <p>Saldo awal ${fmt(data.total_saldo_awal)} • Masuk ${fmt(data.total_masuk)} • Keluar ${fmt(data.total_keluar)} • <strong>Saldo akhir ${fmt(data.total_saldo_akhir)}</strong></p>
    </div>

    <div class="card">
      <div class="card-head"><h3>Saldo Bank &amp; Cash</h3><span class="muted">Saldo saat ini — tarik tunai memindahkan dana dari bank ke cash</span></div>
      <div class="card-pad">
        <div class="grid grid-4">${kartuBank}</div>
      </div>
      ${riwayat.length ? `
      <div class="card-head" style="border-top:1px solid var(--border)"><h3>Riwayat Tarik Tunai (${riwayat.length})</h3><span class="muted">saldo bank berkurang — saldo cash otomatis bertambah</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th class="num">NO</th><th>Tanggal</th><th>Bank</th><th>Keterangan</th><th class="num">Nominal</th><th></th></tr></thead>
        <tbody>${riwayat.map((r, i) => `
          <tr>
            <td class="num muted">${i + 1}</td>
            <td class="nowrap">${tglLabel(r.tanggal)}</td>
            <td><span class="badge bank">${esc(r.bank)}</span></td>
            <td>${esc(r.keterangan || '-')}</td>
            <td class="num neg">${fmt(r.nominal)}</td>
            <td class="actions"><button class="btn btn-sm btn-danger" data-ttdel="${r.id}" title="Batalkan tarik tunai">Hapus</button></td>
          </tr>`).join('')}</tbody>
        <tfoot><tr style="background:#f8fafc">
          <td colspan="4"><strong>Total ${riwayat.length} tarik tunai</strong></td>
          <td class="num neg"><strong>${fmt(riwayat.reduce((a, r) => a + (Number(r.nominal) || 0), 0))}</strong></td><td></td>
        </tr></tfoot>
      </table></div>` : ''}
    </div>

    <div class="grid grid-4 mt">
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
  $$('[data-tarik]').forEach(b => b.onclick = () => {
    const kode = b.dataset.tarik;
    const x = banks.find(v => v.kode === kode);
    modalTarikTunai(kode, x ? Number(x.saldo) : 0);
  });
  $$('[data-ttdel]').forEach(b => b.onclick = async () => {
    if (!confirm('Batalkan tarik tunai ini? Saldo bank & saldo cash akan kembali seperti semula.')) return;
    try { await API.del('/api/saldo-bank/' + b.dataset.ttdel); toast('Tarik tunai dibatalkan'); refreshSaldo(); pageSaldoAkun(); }
    catch (e) { toast(e.message, 'error'); }
  });
  $('#sa-csv').onclick = () => {
    downloadCsv(`saldo-akun-pemasukan-${today()}.csv`, [
      ['SALDO AKUN PEMASUKAN', periodeTxt],
      ['Saldo Awal', data.total_saldo_awal, 'Total Masuk', data.total_masuk, 'Total Keluar', data.total_keluar, 'Saldo Akhir', data.total_saldo_akhir],
      [],
      ['SALDO BANK & CASH', 'Saldo'],
      ...banks.map(b => [b.nama, b.saldo]),
      ['CASH', bk.cash],
      ['Total', bk.total],
      [],
      ['NO', 'Nama Akun', 'Saldo Awal', 'Masuk', 'Keluar', 'Saldo Akhir'],
      ...list.map((r, i) => [i + 1, r.nama, r.saldo_awal, r.masuk, r.keluar, r.saldo_akhir])
    ]);
  };
}

/* Modal tarik tunai dari bank — saldo bank berkurang, saldo cash otomatis bertambah */
function modalTarikTunai(bank, saldo) {
  openModal('Tarik Tunai — ' + bank, `
    <div class="field"><label>Tanggal</label><input type="date" id="tt-tgl" value="${today()}"></div>
    <div class="field"><label>Nominal (Rp)</label><input type="number" id="tt-nom" min="1" step="1000" max="${Math.floor(saldo)}" placeholder="0"></div>
    <div class="field"><label>Keterangan</label><input id="tt-ket" placeholder="mis. tarik tunai untuk kas kegiatan"></div>
    <p class="hint muted">Saldo ${esc(bank)} saat ini <strong>${fmt(saldo)}</strong> — saldo bank berkurang & saldo CASH otomatis bertambah sebesar nominal yang ditarik.</p>
  `, `<button class="btn" onclick="closeModal()">Batal</button><button class="btn btn-primary" id="tt-simpan">✔ Simpan Tarik Tunai</button>`);

  $('#tt-simpan').onclick = async () => {
    const nominal = Number($('#tt-nom').value);
    if (!nominal || nominal <= 0) return toast('Nominal harus lebih dari 0', 'error');
    const btn = $('#tt-simpan');
    btn.disabled = true;
    try {
      await API.post('/api/saldo-bank?act=tarik-tunai', {
        bank, tanggal: $('#tt-tgl').value, nominal, keterangan: $('#tt-ket').value
      });
      closeModal();
      toast(`Tarik tunai ${fmt(nominal)} dari ${bank} tersimpan — saldo cash bertambah`);
      refreshSaldo();
      pageSaldoAkun();
    } catch (e) {
      btn.disabled = false;
      toast(e.message, 'error');
    }
  };
}

/* =========================================================
   DASHBOARD UPJ — kartu Saldo Pengeluaran + tombol Tarik Tunai,
   3 kartu pot (Uang Saku / Tabungan / Tagihan Lain), jumlah
   jurnal kas keluar & pintu cepat ke mutasi kas khusus
   ========================================================= */
async function pageUpjDashboard() {
  const c = $('#content');
  c.innerHTML = `<div class="empty"><div class="empty-ico">⏳</div><p>Memuat data…</p></div>`;

  let d, set, jk;
  try {
    [d, set, jk] = await Promise.all([
      API.get('/api/kaskus-keluar'),
      API.get('/api/pengaturan'),
      API.get('/api/jurnal')     /* server: arah dipaksa keluar + kas khusus (utk sinkron) & yang dicatat UPJ */
    ]);
  } catch (e) {
    c.innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><p>${esc(e.message || e)}</p>
      <button class="btn" id="upj-ulang">Coba Lagi</button></div>`;
    const u = $('#upj-ulang'); if (u) u.onclick = () => pageUpjDashboard();
    return;
  }

  const pot       = Array.isArray(d.pot) ? d.pot : [];
  const saldo     = Number(d.saldo_pengeluaran) || 0;
  const riwayatJk = Array.isArray(jk) ? jk : [];
  const jmlJk     = riwayatJk.length;
  const totJk     = riwayatJk.reduce((a, x) => a + (Number(x.nominal) || 0), 0);
  const riil      = Number(d.saldo_kas_khusus) || 0;
  $('#sidebarSaldo').textContent = fmt(saldo);

  const potKartu = pot.map(p => `
    <div class="stat">
      <div class="stat-ico">🪙</div>
      <div class="stat-label">${esc(p.akun)}</div>
      <div class="stat-value ${p.saldo < 0 ? 'neg' : ''}" style="font-size:18px">${fmt(p.saldo)}</div>
      <div class="stat-sub">Masuk ${fmt(p.masuk)} • Keluar ${fmt(p.keluar)}</div>
    </div>`).join('');

  c.innerHTML = `
    <div class="print-head">
      <h2>${esc(set.nama_pesantren)}</h2>
      <p>${esc(set.alamat)}</p>
      <p><strong>DASHBOARD KAS KHUSUS — UPJ</strong> — Seluruh periode (TA ${esc(set.tahun_ajaran)})</p>
      <p>Saldo Pengeluaran (UPJ) <strong>${fmt(saldo)}</strong> • ${d.jumlah || 0} transaksi dicatat UPJ • Jumlah jurnal kas keluar <strong>${jmlJk}</strong> (total ${fmt(totJk)})</p>
    </div>

    <div class="card">
      <div class="card-head"><h3>📤 Saldo Pengeluaran</h3>
        <span class="muted">saldo berjalan kas keluar yang <strong>dicatat lewat halaman Jurnal Kas Keluar</strong> — mulai 0, bisa minus</span></div>
      <div class="card-pad">
        <div style="display:flex;gap:14px;align-items:stretch;flex-wrap:wrap">
          <div class="stat saldo" style="flex:1;min-width:250px">
            <div class="stat-ico">📤</div>
            <div class="stat-label">Saldo Pengeluaran</div>
            <div class="stat-value ${saldo < 0 ? 'neg' : ''}" id="kkj-saldo">${fmt(saldo)}</div>
            <div class="stat-sub">${d.jumlah || 0} transaksi dicatat UPJ • saldo riil 3 akun ${fmt(riil)} • periode Seluruh periode</div>
          </div>
          <div class="stat" style="display:flex;flex-direction:column;justify-content:center;min-width:230px">
            <div class="stat-label">Tindakan</div>
            <button class="btn btn-primary" id="kkj-tarik-admin" style="margin-top:10px" ${saldo < 0 ? '' : 'disabled'}>⬇ Tarik Tunai dari Kas Admin</button>
            <p class="hint muted" style="margin:8px 0 0">Dari <strong>Saldo Kas admin</strong> → saldo pengeluaran UPJ naik (<strong>minus menyusut</strong>).</p>
          </div>
        </div>
        <div class="grid grid-3 mt">${potKartu || '<p class="muted">Belum ada akun kas khusus.</p>'}</div>
      </div>
    </div>

    <div class="grid grid-3 mt">
      <div class="stat iuran"><div class="stat-ico">📒</div><div class="stat-label">Jumlah Jurnal Kas Keluar</div>
        <div class="stat-value">${jmlJk}</div>
        <div class="stat-sub">total keluar kas khusus + yang dicatat UPJ ${fmt(totJk)} — sinkron dengan jurnal pengurus</div></div>
      <div class="stat masuk"><div class="stat-ico">📤</div><div class="stat-label">Dicatat UPJ</div>
        <div class="stat-value">${d.jumlah || 0}</div>
        <div class="stat-sub">total ${fmt(d.total_keluar || 0)} — lewat halaman Jurnal Kas Keluar</div></div>
      <div class="stat saldo"><div class="stat-ico">🏦</div><div class="stat-label">Saldo Riil 3 Akun</div>
        <div class="stat-value ${riil < 0 ? 'neg' : ''}" style="font-size:19px">${fmt(riil)}</div>
        <div class="stat-sub">Uang Saku + Tabungan + Tagihan Lain — acuan tarik tunai</div></div>
    </div>

    <div class="card card-pad mt no-print" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
      <div style="max-width:640px">
        <strong>🗂️ Mutasi Kas Khusus</strong>
        <p class="muted" style="margin:4px 0 0;font-size:12.5px">Buka halaman mutasi (sisi masuk &amp; keluar) untuk Uang Saku, Tabungan, dan Tagihan Lain-lain — rekap saldonya ada di menu <strong>Rekap Saldo</strong>.</p>
      </div>
      <div class="flex" style="flex-wrap:wrap;gap:8px">
        <button class="btn" data-kkmenu="mutasi-us">🪙 Uang Saku</button>
        <button class="btn" data-kkmenu="mutasi-tab">🏦 Tabungan</button>
        <button class="btn" data-kkmenu="mutasi-lain">📄 Tagihan Lain</button>
      </div>
    </div>`;

  /* --- tarik tunai dari kas admin --- */
  const bTarikAdmin = $('#kkj-tarik-admin');
  if (bTarikAdmin) bTarikAdmin.onclick = () => modalTarikTunaiAdmin(saldo);
  /* --- pintu cepat ke halaman mutasi kas khusus --- */
  $$('[data-kkmenu]').forEach(b => b.onclick = () => { location.hash = '#/' + b.dataset.kkmenu; });
}

/* =========================================================
   JURNAL KAS KELUAR (halaman UPJ) — form entry satu baris +
   riwayat pencatatan UPJ; kartu saldo & tarik tunai ada di Dashboard
   ========================================================= */
async function pageKaskusKeluar() {
  const f = Object.assign({ dari: '', sampai: '', q: '' }, STATE.kaskusKeluar);
  STATE.kaskusKeluar = f;
  const c = $('#content');
  c.innerHTML = `<div class="empty"><div class="empty-ico">⏳</div><p>Memuat data…</p></div>`;

  const qs = new URLSearchParams();
  if (f.dari) qs.set('dari', f.dari);
  if (f.sampai) qs.set('sampai', f.sampai);
  if (f.q) qs.set('q', f.q);

  let d, set, akunP;
  try {
    [d, set, akunP] = await Promise.all([
      API.get('/api/kaskus-keluar' + (qs.toString() ? '?' + qs : '')),
      API.get('/api/pengaturan'),
      API.get('/api/akun').catch(() => ({}))
    ]);
  } catch (e) {
    c.innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><p>${esc(e.message || e)}</p>
      <button class="btn" id="kkj-ulang">Coba Lagi</button></div>`;
    const u = $('#kkj-ulang'); if (u) u.onclick = () => pageKaskusKeluar();
    return;
  }

  const pot         = Array.isArray(d.pot) ? d.pot : [];
  const riw         = Array.isArray(d.riwayat) ? d.riwayat : [];
  const akunKeluar  = Array.isArray(d.akun_keluar) ? d.akun_keluar : [];
  const pemasukan   = (akunP && Array.isArray(akunP.pemasukan)) ? akunP.pemasukan : [];
  const saldo       = Number(d.saldo_pengeluaran) || 0;
  const periodeTxt  = (f.dari || f.sampai)
    ? `${f.dari ? tglLabel(f.dari) : 'Awal'} s/d ${f.sampai ? tglLabel(f.sampai) : 'Sekarang'}`
    : 'Seluruh periode';
  $('#sidebarSaldo').textContent = fmt(saldo);

  const peta = (akunP && akunP.peta) || {};
  /* user sudah pindah halaman saat data dimuat → jangan timpa konten halaman baru */
  if (STATE.page !== 'kaskus-keluar') return;

  const barisRiw = (j, i) => {
    const penerima = j.dibayarkan || j.nama || '';
    const ket = (penerima ? esc(penerima) + ' • ' : '')
      + (j.keterangan ? `<br><small class="muted">${esc(j.keterangan)}</small>` : '');
    const sumberLbl = j.tipe === 'setor-admin' ? 'Kas Admin' : (j.sumber_dana || '');
    return `
      <tr>
        <td class="nowrap">${tglLabel(j.tanggal)}</td>
        <td class="nowrap"><strong>${esc(j.no_bkk || '')}</strong></td>
        <td><span class="badge cash">${esc(sumberLbl)}</span></td>
        <td>${esc(j.akun || '')}</td>
        <td>${ket || '<span class="muted">—</span>'}</td>
        <td><span class="badge ${j.jenis_transaksi === 'Cas' ? 'cash' : 'bank'}">${esc(j.jenis_transaksi || '')}</span></td>
        <td class="num neg">${fmt(j.nominal)}</td>
        <td class="actions"><button class="btn btn-sm btn-danger" data-kkdel="${esc(j.id)}" data-kktipe="${esc(j.tipe || '')}">Hapus</button></td>
      </tr>`;
  };

  c.innerHTML = `
    <div class="print-head">
      <h2>${esc(set.nama_pesantren)}</h2>
      <p>${esc(set.alamat)}</p>
      <p><strong>LAPORAN JURNAL KAS KELUAR</strong> — ${periodeTxt} (TA ${esc(set.tahun_ajaran)})</p>
      <p>Saldo Pengeluaran (UPJ) <strong>${fmt(saldo)}</strong> • ${d.jumlah || 0} transaksi dicatat UPJ • Keluar periode ${fmt(d.total_keluar || 0)}</p>
    </div>

    <div class="card card-pad mt no-print">
      <div class="card-head" style="border:none;padding:0 0 10px"><h3>✏️ Entry Kas Keluar</h3>
        <span class="muted">format <strong>Jurnal Kas admin — tanpa preset</strong>: sumber dana bebas (kas khusus maupun Kas/Bank dsb.); pilih sumber kas khusus → Akun Pengeluaran &amp; Dibayarkan mengikuti kas khusus</span></div>
      <div class="entry-grid entry-row">
        <div class="field"><label>Tanggal</label><input type="date" id="kkj-tgl" value="${today()}"></div>
        <div class="field"><label>No BKK</label><input id="kkj-bkk" placeholder="otomatis"></div>
        <div class="field grow" id="kkj-f-akun"><label>Akun Pengeluaran</label>
          <select id="kkj-akun"><option value="">— Pilih akun pengeluaran —</option>${akunKeluar.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('')}</select></div>
        <div class="field grow"><label>Kas Keluar dari Akun Pemasukan</label>
          <select id="kkj-sumber"><option value="">— Pilih sumber dana —</option>${pemasukan.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('')}</select></div>
        <div class="field"><label>Jenis Transaksi</label><select id="kkj-jenis">${['Cas', 'BRI', 'BSI', 'BPD'].map(v => `<option ${v === 'Cas' ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label>Nominal (Rp)</label><input type="number" id="kkj-nom" min="1" step="1000" placeholder="0"></div>
        <div class="field grow" id="kkj-f-dib"><label>Dibayarkan kepada</label><input id="kkj-dib" placeholder="diketik manual — tampil di kwitansi BKK"></div>
        <div class="field grow"><label>Keterangan</label><input id="kkj-ket" placeholder="mis. Listrik aula November"></div>
        <div class="field field-btn"><label>&nbsp;</label>
          <div class="flex">
            <button class="btn btn-primary" id="kkj-simpan">✔ Entry</button>
            <button class="btn" id="kkj-reset">Reset</button>
          </div>
        </div>
      </div>
      <div class="bukti-box" id="kkj-bukti-keluar">
        <div class="bukti-grid">
          <div class="bukti-col">
            <strong>📷 Foto Nota</strong>
            <div class="upload-row">
              <img class="up-prev" id="kkj-nt-prev" hidden alt="foto nota">
              <input type="file" id="kkj-nt-file" accept="image/*" hidden>
              <button type="button" class="btn btn-sm" id="kkj-nt-pick">📁 Pilih foto nota</button>
              <button type="button" class="btn btn-sm btn-danger" id="kkj-nt-del" hidden>✕ Hapus</button>
            </div>
            <span class="hint muted">Nota / str pembayaran — dicetak pada kwitansi BKK; klik pratinjau untuk memperbesar.</span>
          </div>
          <div class="bukti-col">
            <strong>✍️ Tanda Tangan Penerima <span class="muted">(bila tanpa nota)</span></strong>
            <div class="upload-row">
              <img class="up-prev ttd" id="kkj-ttd-prev" hidden alt="tanda tangan penerima">
              <button type="button" class="btn btn-sm" id="kkj-ttd-open">✍️ Buat Tanda Tangan</button>
              <button type="button" class="btn btn-sm btn-danger" id="kkj-ttd-del" hidden>✕ Hapus</button>
            </div>
            <span class="hint muted">Ditandatangani langsung di layar (canvas) — tampil pada kolom penerima kwitansi BKK.</span>
          </div>
        </div>
      </div>
      <p class="hint muted" style="margin-top:10px">Kas keluar dicatat ke rekening sesuai <strong>sumber dana</strong> &amp; <strong>akun pengeluaran</strong> yang dipilih — sumber kas khusus mengunci akun keluar otomatis; kas &amp; laporan ikut menyesuaikan.</p>
    </div>

    <div class="filters card card-pad mt no-print">
      <div class="field grow"><label>Cari</label><input id="kkj-q" value="${esc(f.q)}" placeholder="No BKK, akun, nama, atau keterangan…"></div>
      <div class="field"><label>Dari</label><input type="date" id="kkj-dari" value="${f.dari}"></div>
      <div class="field"><label>Sampai</label><input type="date" id="kkj-sampai" value="${f.sampai}"></div>
      <button class="btn" id="kkj-filter-reset">Reset</button>
      <button class="btn" id="kkj-csv">⬇ CSV</button>
      <button class="btn" onclick="window.print()">🖨️ Cetak</button>
    </div>

    <div class="card">
      <div class="card-head"><h3>📤 Riwayat Kas Keluar Dicatat UPJ (${riw.length})</h3>
        <span class="muted">Keluar periode ${fmt(d.total_keluar || 0)} — hanya yang dicatat lewat halaman ini; hapus juga membatalkan transaksinya</span></div>
      <div class="table-wrap">
        ${riw.length ? `<table>
          <thead><tr><th>Tanggal</th><th>No BKK</th><th>Sumber</th><th>Akun</th><th>Dibayarkan / Keterangan</th><th>Jenis</th><th class="num">Nominal</th><th class="actions"></th></tr></thead>
          <tbody>${riw.map(barisRiw).join('')}</tbody>
          <tfoot><tr style="background:#f8fafc">
            <td colspan="6"><strong>Total ${riw.length} transaksi</strong></td>
            <td class="num neg"><strong>${fmt(d.total_keluar || 0)}</strong></td><td class="actions"></td>
          </tr></tfoot>
        </table>` : `<div class="empty"><div class="empty-ico">📤</div><p>Belum ada kas keluar pada filter ini.</p></div>`}
      </div>
    </div>`;

  /* --- entry kas keluar: format Jurnal Kas admin — tanpa preset (sumber dana bebas, nama tak dirender) --- */
  buktiReset();
  buktiPasangFile('kkj-nt-pick', 'kkj-nt-file', 'kkj-nt-prev', 'kkj-nt-del', 'nota');
  const bTTD = $('#kkj-ttd-open');
  if (bTTD) bTTD.onclick = () => modalTandaTangan((url) => { JB64.ttd = url; JHAPUS.ttd = false; buktiPreview('kkj-ttd-prev', 'kkj-ttd-del', url); });
  const bTTDdel = $('#kkj-ttd-del');
  if (bTTDdel) bTTDdel.onclick = () => { JB64.ttd = ''; JHAPUS.ttd = true; buktiPreview('kkj-ttd-prev', 'kkj-ttd-del', ''); };

  const bkkEl = $('#kkj-bkk');
  const autoBkk = { on: true };
  /* user mengetik sendiri → nomor tak lagi ditimpa; user mengosongkan lagi → otomatis aktif */
  bkkEl.addEventListener('input', () => { autoBkk.on = bkkEl.value.trim() === ''; });
  const sumberEl = $('#kkj-sumber');
  const akunEl   = $('#kkj-akun');
  const fAkun    = $('#kkj-f-akun');
  const fDib     = $('#kkj-f-dib');
  /* akun keluar kanonik utk sumber kas khusus — resolusi rename, dicek ke daftar akun pengeluaran */
  const akunKeluarDari = (cfg) => {
    if (!cfg) return '';
    const kini = upjAkunKini(cfg.akunKeluar, peta);
    if (akunKeluar.includes(kini)) return kini;
    const lo = String(kini).toLowerCase();
    return akunKeluar.find(a => String(a).toLowerCase() === lo) || '';
  };
  /* persis jurnalToggleKKKeluar admin: sumber kas khusus → sembunyikan Akun Pengeluaran
     & Dibayarkan, akun keluar terisi otomatis; sumber lain (Kas/Bank/…) → kedua kolom tampil */
  const toggleKK = () => {
    const cfg = upjCfgDariSumber(sumberEl.value, peta);
    const isKK = !!cfg;
    if (fAkun) fAkun.hidden = isKK;
    if (fDib) fDib.hidden = isKK;
    if (isKK) {
      const harap = akunKeluarDari(cfg);
      const kini  = akunEl.value || '';
      /* isi bila kosong; ganti juga bila akun kanonik kas khusus LAIN (sisa pilihan sebelumnya) */
      const sisaKKLain = kini !== '' && kini !== harap
        && Object.values(MUTASI_CFG).some(c => kini === akunKeluarDari(c));
      if (kini === '' || sisaKKLain) akunEl.value = harap;
    }
    upjIsiNoBkk(bkkEl, sumberEl.value, autoBkk);
  };
  sumberEl.onchange = toggleKK;
  $('#kkj-reset').onclick = () => {
    $('#kkj-tgl').value = today(); $('#kkj-nom').value = ''; $('#kkj-ket').value = '';
    akunEl.value = ''; $('#kkj-dib').value = ''; sumberEl.value = '';
    $('#kkj-jenis').value = 'Cas';
    autoBkk.on = true; bkkEl.value = '';
    buktiReset();
    buktiPreview('kkj-nt-prev', 'kkj-nt-del', ''); buktiPreview('kkj-ttd-prev', 'kkj-ttd-del', '');
    toggleKK();
  };
  $('#kkj-simpan').onclick = async () => {
    const payload = {
      arah: 'keluar',
      tanggal: $('#kkj-tgl').value,
      no_bkk: bkkEl.value.trim(),
      akun: akunEl.value,
      sumber_dana: sumberEl.value,
      jenis_transaksi: $('#kkj-jenis').value,
      nominal: Number($('#kkj-nom').value),
      keterangan: $('#kkj-ket').value.trim(),
      dibayarkan: $('#kkj-dib').value.trim()
    };
    buktiKePayload(payload, 'nota', 'bukti_nota_b64', 'hapus_bukti_nota');
    buktiKePayload(payload, 'ttd', 'ttd_b64', 'hapus_ttd_penerima');
    if (!payload.tanggal || !payload.akun || !payload.sumber_dana || !(payload.nominal > 0)) {
      return toast('Tanggal, akun pengeluaran, sumber dana & nominal wajib diisi', 'error');
    }
    const btn = $('#kkj-simpan');
    btn.disabled = true; btn.textContent = '⏳ Menyimpan…';
    try {
      const r = await API.post('/api/jurnal', payload);
      toast('Entry kas keluar tersimpan — ' + (r.no_bkk || '')
        + (r && r.wa_antre ? ' • Info transaksi ke wali diantre' : ''));
      STATE.kaskusKeluar = {};
      pageKaskusKeluar();
    } catch (e) {
      btn.disabled = false; btn.textContent = '✔ Entry';
      toast(e.message, 'error');
    }
  };

  /* --- filter --- */
  let tId;
  $('#kkj-q').oninput = () => { clearTimeout(tId); tId = setTimeout(() => { STATE.kaskusKeluar.q = $('#kkj-q').value.trim(); pageKaskusKeluar(); }, 400); };
  const applyFilter = () => {
    STATE.kaskusKeluar = { dari: $('#kkj-dari').value, sampai: $('#kkj-sampai').value, q: $('#kkj-q').value.trim() };
    pageKaskusKeluar();
  };
  ['kkj-dari', 'kkj-sampai'].forEach(id => $('#' + id).onchange = applyFilter);
  $('#kkj-filter-reset').onclick = () => { STATE.kaskusKeluar = {}; pageKaskusKeluar(); };
  $('#kkj-csv').onclick = () => {
    downloadCsv(`kas-khusus-keluar-${today()}.csv`, [
      ['KAS KHUSUS KELUAR', periodeTxt],
      ['Saldo Pengeluaran', saldo, 'Total Keluar Periode', d.total_keluar || 0],
      [], ['SALDO PER AKUN KAS KHUSUS'],
      ['Akun', 'Masuk', 'Keluar', 'Saldo'], ...pot.map(p => [p.akun, p.masuk, p.keluar, p.saldo]),
      [], ['TOTAL', '', '', saldo],
      [], ['NO BKK', 'Tanggal', 'Sumber Dana', 'Akun', 'Dibayarkan', 'Jenis', 'Nominal', 'Keterangan'],
      ...riw.map((j, i) => [i + 1, j.no_bkk || '', (j.tipe === 'setor-admin' ? 'Kas Admin' : (j.sumber_dana || '')), j.akun || '', j.dibayarkan || j.nama || '',
        j.jenis_transaksi || '', j.nominal, j.keterangan || ''])
    ]);
  };

  /* --- hapus transaksi --- */
  $$('[data-kkdel]').forEach(b => b.onclick = async () => {
    const isSetor = b.dataset.kktipe === 'setor-admin';
    const msg = isSetor
      ? 'Hapus transaksi ini? Saldo pengeluaran akan kembali berkurang (kas admin ikut pulih).'
      : 'Hapus transaksi kas keluar ini? Saldo pengeluaran akan bertambah kembali.';
    if (!confirm(msg)) return;
    try { await API.del('/api/jurnal/' + b.dataset.kkdel); toast('Transaksi dihapus'); pageKaskusKeluar(); }
    catch (e) { toast(e.message, 'error'); }
  });
}

/* =========================================================
   REKAP SALDO (khusus UPJ) — saldo ketiga akun kas khusus
   SINKRON dengan jurnal pengurus (akun admin): masuk, keluar,
   saldo riil + rekap saldo per santri per akun (tab)
   ========================================================= */
async function pageRekapSaldoUpj() {
  const c = $('#content');
  c.innerHTML = `<div class="empty"><div class="empty-ico">⏳</div><p>Memuat data…</p></div>`;

  const f = Object.assign({ akun: 'us', dari: '', sampai: '' }, STATE.rekapSaldo);
  if (!MUTASI_CFG[f.akun]) f.akun = 'us';
  STATE.rekapSaldo = f;
  const cfg = MUTASI_CFG[f.akun];

  const qsM = new URLSearchParams({ sub: cfg.sub });
  if (f.dari) qsM.set('dari', f.dari);
  if (f.sampai) qsM.set('sampai', f.sampai);

  let d, mut, set;
  try {
    [d, mut, set] = await Promise.all([
      API.get('/api/kaskus-keluar'),
      API.get('/api/mutasi?' + qsM),
      API.get('/api/pengaturan')
    ]);
  } catch (e) {
    c.innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><p>${esc(e.message || e)}</p>
      <button class="btn" id="rs-ulang">Coba Lagi</button></div>`;
    const u = $('#rs-ulang'); if (u) u.onclick = () => pageRekapSaldoUpj();
    return;
  }
  /* user sudah pindah halaman saat data dimuat → jangan timpa konten halaman baru */
  if (STATE.page !== 'rekap-saldo') return;

  const pot   = Array.isArray(d.pot) ? d.pot : [];
  const rekap = Array.isArray(mut.per_santri) ? mut.per_santri : [];
  const totMasuk  = pot.reduce((a, p) => a + (Number(p.masuk) || 0), 0);
  const totKeluar = pot.reduce((a, p) => a + (Number(p.keluar) || 0), 0);
  const riil = Number(d.saldo_kas_khusus) || 0;
  const periodeTxt = (f.dari || f.sampai)
    ? `${f.dari ? tglLabel(f.dari) : 'Awal'} s/d ${f.sampai ? tglLabel(f.sampai) : 'Sekarang'}`
    : 'Seluruh periode';
  $('#sidebarSaldo').textContent = fmt(Number(d.saldo_pengeluaran) || 0);

  const barisAkun = (p, i) => `
    <tr>
      <td class="num muted">${i + 1}</td>
      <td><strong>${esc(p.akun)}</strong></td>
      <td class="num pos">${p.masuk ? fmt(p.masuk) : ''}</td>
      <td class="num neg">${p.keluar ? fmt(p.keluar) : ''}</td>
      <td class="num"><strong class="${p.saldo < 0 ? 'neg' : ''}">${fmt(p.saldo)}</strong></td>
    </tr>`;
  const barisRekap = (r, i) => `
    <tr>
      <td class="num muted">${i + 1}</td>
      <td>${esc(r.nama)}${r.santri_id ? '' : ' <span class="muted">(manual)</span>'}</td>
      <td class="nowrap">${esc(r.kelas || '-')}</td>
      <td class="num">${r.saldo_awal ? fmt(r.saldo_awal) : '<span class="muted">—</span>'}</td>
      <td class="num pos">${r.masuk ? fmt(r.masuk) : ''}</td>
      <td class="num neg">${r.keluar ? fmt(r.keluar) : ''}</td>
      <td class="num"><strong class="${r.saldo < 0 ? 'neg' : ''}">${fmt(r.saldo)}</strong></td>
    </tr>`;

  c.innerHTML = `
    <div class="print-head">
      <h2>${esc(set.nama_pesantren)}</h2>
      <p>${esc(set.alamat)}</p>
      <p><strong>REKAP SALDO KAS KHUSUS</strong> — ${periodeTxt} (TA ${esc(set.tahun_ajaran)})</p>
      <p>Saldo riil 3 akun <strong>${fmt(riil)}</strong> • Masuk total ${fmt(totMasuk)} • Keluar total ${fmt(totKeluar)} • Akun terpilih: ${esc(cfg.akun)} (saldo akhir ${fmt(mut.saldo_akhir)})</p>
    </div>

    <div class="grid grid-4">
      <div class="stat saldo"><div class="stat-ico">🏦</div><div class="stat-label">Saldo Riil 3 Akun</div><div class="stat-value ${riil < 0 ? 'neg' : ''}" style="font-size:19px">${fmt(riil)}</div><div class="stat-sub">sinkron dengan jurnal pengurus (akun admin)</div></div>
      <div class="stat masuk"><div class="stat-ico">⬆️</div><div class="stat-label">Total Masuk</div><div class="stat-value" style="font-size:19px">${fmt(totMasuk)}</div><div class="stat-sub">${pot.length} akun kas khusus</div></div>
      <div class="stat keluar"><div class="stat-ico">⬇️</div><div class="stat-label">Total Keluar</div><div class="stat-value" style="font-size:19px">${fmt(totKeluar)}</div><div class="stat-sub">${pot.length} akun kas khusus</div></div>
      <div class="stat iuran"><div class="stat-ico">📒</div><div class="stat-label">Jumlah Santri</div><div class="stat-value">${rekap.length}</div><div class="stat-sub">rekap ${esc(cfg.akun)} pada filter ini</div></div>
    </div>

    <div class="card no-print mt">
      <div class="card-head"><h3>🏦 Saldo per Akun Kas Khusus</h3>
        <span class="muted">sumber: halaman Kas Khusus Keluar = jurnal kas khusus yang sama dengan akun admin</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th class="num">NO</th><th>Akun</th><th class="num">Masuk</th><th class="num">Keluar</th><th class="num">Saldo</th></tr></thead>
        <tbody>${pot.map(barisAkun).join('') || `<tr><td colspan="5" class="muted" style="text-align:center;padding:24px">Belum ada akun kas khusus.</td></tr>`}</tbody>
        <tfoot><tr style="background:#f8fafc">
          <td colspan="2"><strong>TOTAL — ${pot.length} akun</strong></td>
          <td class="num pos"><strong>${fmt(totMasuk)}</strong></td>
          <td class="num neg"><strong>${fmt(totKeluar)}</strong></td>
          <td class="num"><strong class="${riil < 0 ? 'neg' : ''}">${fmt(riil)}</strong></td>
        </tr></tfoot>
      </table></div>
    </div>

    <div class="card no-print mt">
      <div class="card-head"><h3>🧾 Rekap Saldo per Santri — ${esc(cfg.akun)}</h3>
        <span class="muted">saldo berjalan tiap santri pada periode ${periodeTxt}</span></div>
      <div class="card-pad" style="padding-bottom:0">
        <div class="tabs" style="border:none;background:none;padding:0">
          ${Object.values(MUTASI_CFG).map(k => `<button type="button" class="tab ${k.kode === f.akun ? 'on' : ''}" data-rtab="${k.kode}">${k.ico} ${esc(k.akun)}</button>`).join('')}
          <span class="muted" style="font-size:12px;margin-left:auto">Tab &amp; filter berlaku untuk rekap santri di bawah</span>
        </div>
        <div class="flex mt" style="flex-wrap:wrap;gap:10px;align-items:flex-end">
          <div class="field"><label>Dari</label><input type="date" id="rs-dari" value="${f.dari}"></div>
          <div class="field"><label>Sampai</label><input type="date" id="rs-sampai" value="${f.sampai}"></div>
          <button class="btn" id="rs-csv">⬇ CSV</button>
          <button class="btn" id="rs-cetak" title="Cetak rekap saldo + saldo per akun (PDF lewat print dialog)">🖨️ Cetak</button>
        </div>
      </div>
      <div class="table-wrap"><table>
        ${rekap.length ? `
        <thead><tr><th class="num">#</th><th>Nama Santri</th><th>Kelas</th><th class="num">Saldo Awal</th><th class="num">Masuk</th><th class="num">Keluar</th><th class="num">Saldo Akhir</th></tr></thead>
        <tbody>${rekap.map(barisRekap).join('')}</tbody>
        <tfoot><tr style="background:#f8fafc">
          <td colspan="3"><strong>Total ${rekap.length} santri</strong></td>
          <td class="num"><strong>${fmt(mut.saldo_awal)}</strong></td>
          <td class="num pos"><strong>${fmt(rekap.reduce((a, r) => a + (Number(r.masuk) || 0), 0))}</strong></td>
          <td class="num neg"><strong>${fmt(rekap.reduce((a, r) => a + (Number(r.keluar) || 0), 0))}</strong></td>
          <td class="num"><strong class="${mut.saldo_akhir < 0 ? 'neg' : ''}">${fmt(mut.saldo_akhir)}</strong></td>
        </tr></tfoot>` : `
        <thead><tr><th>#</th><th>Nama Santri</th><th>Kelas</th><th class="num">Saldo Awal</th><th class="num">Masuk</th><th class="num">Keluar</th><th class="num">Saldo Akhir</th></tr></thead>
        <tbody><tr><td colspan="7" class="muted" style="text-align:center;padding:24px">Belum ada mutasi ${esc(cfg.akun)} pada filter ini.</td></tr></tbody>`}
      </table></div>
    </div>`;

  /* --- tab akun (mutasi per_santri ikut berganti) --- */
  $$('[data-rtab]').forEach(b => b.onclick = () => {
    if (STATE.rekapSaldo.akun === b.dataset.rtab) return;
    STATE.rekapSaldo.akun = b.dataset.rtab;
    pageRekapSaldoUpj();
  });

  /* --- filter tanggal --- */
  const applyFilter = () => {
    STATE.rekapSaldo = Object.assign({}, STATE.rekapSaldo, { dari: $('#rs-dari').value, sampai: $('#rs-sampai').value });
    pageRekapSaldoUpj();
  };
  ['rs-dari', 'rs-sampai'].forEach(id => $('#' + id).onchange = applyFilter);

  /* --- cetak --- */
  $('#rs-cetak').onclick = () => window.print();

  /* --- CSV --- */
  $('#rs-csv').onclick = () => {
    downloadCsv(`rekap-saldo-kas-khusus-${today()}.csv`, [
      ['REKAP SALDO KAS KHUSUS', periodeTxt],
      ['Saldo Riil 3 Akun', riil, 'Total Masuk', totMasuk, 'Total Keluar', totKeluar],
      [], ['SALDO PER AKUN'], ['Akun', 'Masuk', 'Keluar', 'Saldo'],
      ...pot.map(p => [p.akun, p.masuk, p.keluar, p.saldo]),
      [], ['TOTAL', totMasuk, totKeluar, riil],
      [], [`REKAP SALDO PER SANTRI — ${cfg.akun.toUpperCase()}`],
      ['Saldo Awal', mut.saldo_awal, 'Total Masuk', mut.total_masuk, 'Total Keluar', mut.total_keluar, 'Saldo Akhir', mut.saldo_akhir],
      [], ['No', 'Nama Santri', 'Kelas', 'Saldo Awal', 'Masuk', 'Keluar', 'Saldo Akhir'],
      ...rekap.map((r, i) => [i + 1, r.nama, r.kelas || '-', r.saldo_awal, r.masuk, r.keluar, r.saldo])
    ]);
  };
}

/* Tarik tunai DARI Saldo Kas admin → saldo pengeluaran UPJ naik (minus menyusut) */
function modalTarikTunaiAdmin(saldo) {
  const def = saldo < 0 ? Math.abs(Math.round(saldo)) : '';
  openModal('Tarik Tunai dari Kas Admin', `
    <div class="field"><label>Tanggal</label><input type="date" id="uta-tgl" value="${today()}"></div>
    <div class="field"><label>Nominal (Rp)</label>
      <input type="number" id="uta-nom" min="1" step="1000" value="${def}" placeholder="0"></div>
    <div class="field"><label>Keterangan</label><input id="uta-ket" placeholder="mis. tutup saldo UPJ dari kas admin"></div>
    <p class="hint muted">Mengambil dari <strong>Saldo Kas admin</strong> — saldo kas admin berkurang dan <strong>Saldo Pengeluaran UPJ naik</strong>, sehingga minus menyusut (default = seluruh saldo minus). Dicatat sebagai <strong>jurnal kas keluar</strong> akun <strong>Tarik Tunai Kas Admin</strong> &amp; jenis <strong>Cas</strong> (bukan bank).</p>
  `, `<button class="btn" onclick="closeModal()">Batal</button><button class="btn btn-primary" id="uta-simpan">✔ Simpan Tarik Tunai</button>`);

  $('#uta-simpan').onclick = async () => {
    const nominal = Number($('#uta-nom').value);
    if (!nominal || nominal <= 0) return toast('Nominal harus lebih dari 0', 'error');
    const btn = $('#uta-simpan');
    btn.disabled = true; btn.textContent = '⏳ Menyimpan…';
    try {
      const r = await API.post('/api/kaskus-keluar?act=tarik-admin', {
        tanggal: $('#uta-tgl').value, nominal, keterangan: $('#uta-ket').value.trim()
      });
      closeModal();
      toast(`Tarik tunai ${fmt(nominal)} dari kas admin tersimpan — saldo pengeluaran tinggal ${fmt(r.saldo_pengeluaran)}`);
      pageUpjDashboard();
    } catch (e) {
      btn.disabled = false; btn.textContent = '✔ Simpan Tarik Tunai';
      toast(e.message, 'error');
    }
  };
}

/* =========================================================
   KREDITUR — total masuk akun "Hutang" + keluar "Biaya Angsuran Hutang"
   + input nama kreditur
   ========================================================= */
async function pageKreditur() {
  const f = Object.assign({ dari: '', sampai: '', detail: '' }, STATE.kreditur);
  STATE.kreditur = f;
  const qs = new URLSearchParams();
  if (f.dari) qs.set('dari', f.dari);
  if (f.sampai) qs.set('sampai', f.sampai);
  if (f.detail) qs.set('id', f.detail);
  const [set, ambil] = await Promise.all([
    API.get('/api/pengaturan'),
    API.get('/api/kreditur' + (qs.toString() ? '?' + qs : ''))
      .then(d => ({ ok: true, d })).catch(e => ({ ok: false, e }))
  ]);
  if (!ambil.ok) {
    if (f.detail) {   /* kreditur sudah dihapus di tab lain → kembali ke daftar */
      toast(ambil.e.message, 'error');
      STATE.kreditur = { dari: f.dari, sampai: f.sampai };
      return pageKreditur();
    }
    throw ambil.e;
  }
  const data = ambil.d;
  const list  = Array.isArray(data.list) ? data.list : [];
  const rows  = Array.isArray(data.riwayat) ? data.riwayat : [];
  const tanpa = Array.isArray(data.tanpa) ? data.tanpa : [];
  const kr    = f.detail ? (list[0] || null) : null;
  const periodeTxt = (f.dari || f.sampai)
    ? `${f.dari ? tglLabel(f.dari) : 'Awal'} s/d ${f.sampai ? tglLabel(f.sampai) : 'Sekarang'}`
    : 'Seluruh periode';
  const sisa = Number(data.sisa) || 0;

  const theadRiwayat = (adaKred) => `<thead><tr><th class="num">NO</th><th>Tanggal</th><th>No BKM/BKK</th><th>Arah</th><th>Akun</th>${adaKred ? '<th>Kreditur</th>' : ''}<th>Keterangan</th><th class="num">Nominal</th></tr></thead>`;
  const barisRiwayat = (adaKred) => rows.map((r, i) => `
            <tr>
              <td class="num muted">${i + 1}</td>
              <td class="nowrap">${tglLabel(r.tanggal)}</td>
              <td class="nowrap">${esc(r.nomor || '-')}</td>
              <td><span class="badge ${r.arah === 'masuk' ? 'masuk' : 'keluar'}">${r.arah === 'masuk' ? '⬆ Masuk' : '⬇ Keluar'}</span></td>
              <td>${esc(r.akun)}</td>
              ${adaKred ? `<td>${r.kreditur ? esc(r.kreditur) : '<span class="muted">—</span>'}</td>` : ''}
              <td>${esc(r.keterangan || '-')}</td>
              <td class="num ${r.arah === 'masuk' ? 'pos' : 'neg'}">${fmt(r.nominal)}</td>
            </tr>`).join('');
  const footRiwayat = (adaKred) => `
          <tfoot><tr style="background:#f8fafc">
            <td colspan="${adaKred ? 6 : 5}"><strong>Total ${rows.length} transaksi</strong></td>
            <td class="num"><strong>↑ ${fmt(data.total_masuk)} · ↓ ${fmt(data.total_keluar)}</strong></td>
            <td class="num"><strong class="${sisa < 0 ? 'neg' : 'pos'}">${fmt(sisa)}</strong></td>
          </tr></tfoot>`;
  const tabelRiwayat = (adaKred) => rows.length
    ? `<table>${theadRiwayat(adaKred)}<tbody>${barisRiwayat(adaKred)}</tbody>${footRiwayat(adaKred)}</table>`
    : `<div class="empty"><div class="empty-ico">🤝</div><p>Belum ada transaksi hutang pada filter ini.</p></div>`;

  const filters = `
    <div class="filters card card-pad mt no-print">
      <div class="field"><label>Dari</label><input type="date" id="kr-dari" value="${f.dari}"></div>
      <div class="field"><label>Sampai</label><input type="date" id="kr-sampai" value="${f.sampai}"></div>
      <button class="btn" id="kr-reset">Reset</button>
      <button class="btn" id="kr-csv">⬇ CSV</button>
      <button class="btn" onclick="window.print()">🖨️ Cetak</button>
    </div>`;

  if (kr) {
    /* ===== laporan mutasi & rekap satu kreditur ===== */
    const dSisa = Number(kr.sisa) || 0;
    $('#content').innerHTML = `
    <div class="print-head">
      <h2>${esc(set.nama_pesantren)}</h2>
      <p>${esc(set.alamat)}</p>
      <p><strong>LAPORAN MUTASI KREDITUR — ${esc(kr.nama)}</strong> — ${periodeTxt} (TA ${esc(set.tahun_ajaran)})</p>
      <p>Pinjaman Masuk (${esc(data.akun_masuk)}) ${fmt(data.total_masuk)} • Angsuran Dibayar (${esc(data.akun_keluar)}) ${fmt(data.total_keluar)} • <strong>Sisa ${fmt(sisa)}</strong></p>
    </div>

    <div class="card no-print">
      <div class="card-pad flex" style="justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <button class="btn" id="kr-back">← Daftar Kreditur</button>
        <span class="muted">${kr.catatan ? esc(kr.catatan) : 'Kreditur terdaftar'}${kr.dibuat ? ' • terdaftar ' + tglLabel(String(kr.dibuat).slice(0, 10)) : ''}</span>
      </div>
    </div>

    <div class="grid grid-4">
      <div class="stat masuk"><div class="stat-ico">⬆️</div><div class="stat-label">Pinjaman Masuk — ${esc(data.akun_masuk)}</div><div class="stat-value" style="font-size:19px">${fmt(data.total_masuk)}</div><div class="stat-sub">${rows.filter(r => r.arah === 'masuk').length} transaksi</div></div>
      <div class="stat keluar"><div class="stat-ico">⬇️</div><div class="stat-label">Angsuran Dibayar — ${esc(data.akun_keluar)}</div><div class="stat-value" style="font-size:19px">${fmt(data.total_keluar)}</div><div class="stat-sub">${rows.filter(r => r.arah === 'keluar').length} transaksi</div></div>
      <div class="stat saldo"><div class="stat-ico">💰</div><div class="stat-label">Sisa Tagihan</div><div class="stat-value ${dSisa < 0 ? 'neg' : ''}" style="font-size:19px">${fmt(dSisa)}</div><div class="stat-sub">masuk − keluar</div></div>
      <div class="stat iuran"><div class="stat-ico">🧾</div><div class="stat-label">Jumlah Transaksi</div><div class="stat-value">${rows.length}</div><div class="stat-sub">pada periode ini</div></div>
    </div>

    ${filters}

    <div class="card">
      <div class="card-head"><h3>Mutasi ${esc(kr.nama)} (${rows.length})</h3><span class="muted">pinjaman dari akun <strong>${esc(data.akun_masuk)}</strong> &amp; angsuran ke akun <strong>${esc(data.akun_keluar)}</strong></span></div>
      <div class="table-wrap">${tabelRiwayat(false)}</div>
    </div>`;
  } else {
    /* ===== rekap seluruh kreditur ===== */
    $('#content').innerHTML = `
    <div class="print-head">
      <h2>${esc(set.nama_pesantren)}</h2>
      <p>${esc(set.alamat)}</p>
      <p><strong>LAPORAN KREDITUR</strong> — ${periodeTxt} (TA ${esc(set.tahun_ajaran)})</p>
      <p>Total Masuk (${esc(data.akun_masuk)}) ${fmt(data.total_masuk)} • Total Keluar (${esc(data.akun_keluar)}) ${fmt(data.total_keluar)} • <strong>Sisa ${fmt(sisa)}</strong></p>
    </div>

    <div class="grid grid-4">
      <div class="stat masuk"><div class="stat-ico">⬆️</div><div class="stat-label">Total Masuk — ${esc(data.akun_masuk)}</div><div class="stat-value" style="font-size:19px">${fmt(data.total_masuk)}</div><div class="stat-sub">kas masuk dari akun hutang</div></div>
      <div class="stat keluar"><div class="stat-ico">⬇️</div><div class="stat-label">Total Keluar — ${esc(data.akun_keluar)}</div><div class="stat-value" style="font-size:19px">${fmt(data.total_keluar)}</div><div class="stat-sub">angsuran hutang yang dibayar</div></div>
      <div class="stat saldo"><div class="stat-ico">💰</div><div class="stat-label">Sisa Kreditur</div><div class="stat-value ${sisa < 0 ? 'neg' : ''}" style="font-size:19px">${fmt(sisa)}</div><div class="stat-sub">masuk − keluar</div></div>
      <div class="stat iuran"><div class="stat-ico">🤝</div><div class="stat-label">Jumlah Kreditur</div><div class="stat-value">${list.length}</div><div class="stat-sub">nama terdaftar</div></div>
    </div>

    <div class="card mt no-print">
      <div class="card-head"><h3>✏️ Input Nama Kreditur</h3><span class="muted">pihak yang dipinjami / kreditur pesantren — namanya juga bisa dipilih langsung saat entry akun <strong>${esc(data.akun_masuk)}</strong> / <strong>${esc(data.akun_keluar)}</strong></span></div>
      <div class="card-pad">
        <div class="entry-grid">
          <div class="field grow"><label>Nama Kreditur</label><input id="kr-nama" placeholder="mis. H. Abdullah / Bank BRI / Toko Bangunan Jaya" autocomplete="off"></div>
          <div class="field grow"><label>Catatan (opsional)</label><input id="kr-catatan" placeholder="mis. no. HP, alamat, atau keterangan lain" autocomplete="off"></div>
          <div class="field field-btn"><label>&nbsp;</label>
            <div class="flex"><button class="btn btn-primary" id="kr-tambah">✔ Simpan Kreditur</button></div>
          </div>
        </div>
      </div>
      ${list.length ? `
      <div class="card-head" style="border-top:1px solid var(--border)"><h3>Rekap Kreditur (${list.length})</h3><span class="muted">klik <strong>Mutasi</strong> untuk laporan transaksi per kreditur</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th class="num">NO</th><th>Nama Kreditur</th><th>Catatan</th><th class="num">Pinjaman Masuk</th><th class="num">Angsuran Keluar</th><th class="num">Sisa</th><th class="num">Trx</th><th class="num">Ditambahkan</th><th></th></tr></thead>
        <tbody>${list.map((kk, i) => `
          <tr>
            <td class="num muted">${i + 1}</td>
            <td><strong>${esc(kk.nama)}</strong></td>
            <td>${kk.catatan ? esc(kk.catatan) : '<span class="muted">—</span>'}</td>
            <td class="num pos">${fmt(kk.total_masuk || 0)}</td>
            <td class="num neg">${fmt(kk.total_keluar || 0)}</td>
            <td class="num ${Number(kk.sisa) < 0 ? 'neg' : 'pos'}"><strong>${fmt(kk.sisa || 0)}</strong></td>
            <td class="num muted">${Number(kk.jumlah) || 0}</td>
            <td class="num muted nowrap">${kk.dibuat ? tglLabel(String(kk.dibuat).slice(0, 10)) : '—'}</td>
            <td class="actions"><button class="btn btn-sm" data-krlihat="${esc(kk.id)}">Mutasi</button><button class="btn btn-sm btn-danger" data-krhapus="${esc(kk.id)}">Hapus</button></td>
          </tr>`).join('')}</tbody>
      </table></div>` : ''}
      ${tanpa.length ? `
      <div class="card-head" style="border-top:1px solid var(--border)"><h3>Belum terdaftar sebagai kreditur (${tanpa.length})</h3><span class="muted">nama pada transaksi akun hutang yang belum ada di daftar</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th class="num">NO</th><th>Nama pada Transaksi</th><th class="num">Masuk</th><th class="num">Keluar</th><th class="num">Sisa</th><th class="num">Trx</th><th></th></tr></thead>
        <tbody>${tanpa.map((t, i) => `
          <tr>
            <td class="num muted">${i + 1}</td>
            <td><strong>${esc(t.nama)}</strong></td>
            <td class="num pos">${fmt(t.masuk || 0)}</td>
            <td class="num neg">${fmt(t.keluar || 0)}</td>
            <td class="num ${Number(t.masuk - t.keluar) < 0 ? 'neg' : 'pos'}">${fmt((Number(t.masuk) || 0) - (Number(t.keluar) || 0))}</td>
            <td class="num muted">${Number(t.jumlah) || 0}</td>
            <td class="actions"><button class="btn btn-sm btn-gold" data-krdaftar="${esc(t.nama)}">Daftarkan</button></td>
          </tr>`).join('')}</tbody>
      </table></div>` : ''}
    </div>

    ${filters}

    <div class="card">
      <div class="card-head"><h3>Riwayat Hutang (${rows.length})</h3><span class="muted">masuk dari akun <strong>${esc(data.akun_masuk)}</strong> &amp; keluar dari akun <strong>${esc(data.akun_keluar)}</strong></span></div>
      <div class="table-wrap">${tabelRiwayat(true)}</div>
    </div>`;
  }

  const applyFilter = () => {
    STATE.kreditur = { dari: $('#kr-dari').value, sampai: $('#kr-sampai').value, detail: f.detail };
    pageKreditur();
  };
  ['kr-dari', 'kr-sampai'].forEach(id => $('#' + id).onchange = applyFilter);
  $('#kr-reset').onclick = () => { STATE.kreditur = { detail: f.detail }; pageKreditur(); };

  const kembali = $('#kr-back');
  if (kembali) kembali.onclick = () => { STATE.kreditur = { dari: f.dari, sampai: f.sampai }; pageKreditur(); };
  $$('[data-krlihat]').forEach(b => b.onclick = () => {
    STATE.kreditur = Object.assign({}, STATE.kreditur, { detail: b.dataset.krlihat });
    pageKreditur();
  });
  $$('[data-krdaftar]').forEach(b => b.onclick = async () => {
    const nama = b.dataset.krdaftar;
    if (!nama) return;
    try {
      await API.post('/api/kreditur', { nama });
      toast('Kreditur "' + nama + '" terdaftar');
      pageKreditur();
    } catch (e) { toast(e.message, 'error'); }
  });

  const simpanKreditur = async () => {
    const nama = $('#kr-nama').value.trim();
    if (!nama) return toast('Nama kreditur wajib diisi', 'error');
    const btn = $('#kr-tambah');
    btn.disabled = true;
    try {
      await API.post('/api/kreditur', { nama, catatan: $('#kr-catatan').value.trim() });
      toast('Kreditur "' + nama + '" tersimpan');
      pageKreditur();
    } catch (e) { toast(e.message, 'error'); btn.disabled = false; }
  };
  const bTambah = $('#kr-tambah');
  if (bTambah) bTambah.onclick = simpanKreditur;
  const iNama = $('#kr-nama');
  if (iNama) iNama.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); simpanKreditur(); } };

  $$('[data-krhapus]').forEach(b => b.onclick = async () => {
    if (!confirm('Hapus nama kreditur ini? Transaksi jurnalnya tetap tersimpan.')) return;
    try { await API.del('/api/kreditur/' + b.dataset.krhapus); toast('Kreditur dihapus'); pageKreditur(); }
    catch (e) { toast(e.message, 'error'); }
  });

  $('#kr-csv').onclick = () => {
    if (kr) {
      return downloadCsv(`mutasi-kreditur-${today()}.csv`, [
        ['LAPORAN MUTASI KREDITUR', kr.nama],
        ['Periode', periodeTxt],
        ['Akun Pinjaman', data.akun_masuk, 'Total', data.total_masuk],
        ['Akun Angsuran', data.akun_keluar, 'Total', data.total_keluar],
        ['Sisa', sisa],
        [],
        ['NO', 'TANGGAL', 'NO BKM/BKK', 'ARAH', 'AKUN', 'KETERANGAN', 'NOMINAL'],
        ...rows.map((r, i) => [i + 1, r.tanggal, r.nomor, r.arah, r.akun, r.keterangan, r.nominal])
      ]);
    }
    downloadCsv(`kreditur-${today()}.csv`, [
      ['LAPORAN KREDITUR', periodeTxt],
      ['Akun Masuk', data.akun_masuk, 'Total Masuk', data.total_masuk],
      ['Akun Keluar', data.akun_keluar, 'Total Keluar', data.total_keluar],
      ['Sisa', sisa],
      [],
      ['NO', 'NAMA KREDITUR', 'CATATAN', 'PINJAMAN MASUK', 'ANGSURAN KELUAR', 'SISA', 'TRX', 'DITAMBAHKAN'],
      ...list.map((kk, i) => [i + 1, kk.nama, kk.catatan, kk.total_masuk, kk.total_keluar, kk.sisa, kk.jumlah, kk.dibuat]),
      ...(tanpa.length ? [[], ['NAMA BELUM TERDAFTAR', 'MASUK', 'ANGSURAN', 'TRX'],
        ...tanpa.map(t => [t.nama, t.masuk, t.keluar, t.jumlah])] : []),
      [],
      ['NO', 'TANGGAL', 'NO BKM/BKK', 'ARAH', 'AKUN', 'KREDITUR', 'KETERANGAN', 'NOMINAL'],
      ...rows.map((r, i) => [i + 1, r.tanggal, r.nomor, r.arah, r.akun, r.kreditur, r.keterangan, r.nominal])
    ]);
  };
}

/* =========================================================
   GAJI GURU & KARYAWAN — data guru, bayar per periode (1 BKK),
   slip per orang (JPG + WhatsApp) & tanda tangan penerimaan
   ========================================================= */
let GJ = { list: [], setelan: null, guru: [], jenis: [], akun: null, profil: null, batch: null, insList: [] };
/* kanvas Rekap/Data Guru belum disimpan — pindah tab/filter membuang perubahan */
var GJ_KOTOR = false;   /* var — navigate() bisa dipanggil sebelum deklarasi ini dieksekusi */
function gajiBolehPindah() {
  if (!GJ_KOTOR) { return true; }
  return confirm('Perubahan kanvas belum disimpan — pindah dan buang perubahan?');
}
/* perubahan belum disimpan → tahan sebelum halaman ditutup/dimuat ulang */
window.addEventListener('beforeunload', (e) => {
  if (!GJ_KOTOR) { return; }
  e.preventDefault();
  e.returnValue = '';
});

/** Opsi select akun pemasukan utk field Akun Pemasukan jenis insentif */
function selAkunPemasukan(sel) {
  const list = ((GJ.akun && GJ.akun.pemasukan) || []);
  const v = String(sel || '');
  return `<option value="">— ikut sumber dana —</option>`
    + list.map(a => `<option value="${esc(a)}" ${a === v ? 'selected' : ''}>${esc(a)}</option>`).join('');
}

/** Kelompok guru — dipakai utk pemisah baris pada PDF rincian gaji */
const KELOMPOK = ['SMP dan SMA', 'Kepondokan', 'Karyawan', 'Pengabdian'];
function selKelompok(sel) {
  const v = String(sel || '');
  const extra = (v && !KELOMPOK.includes(v)) ? [`<option value="${esc(v)}" selected>${esc(v)}</option>`] : [];
  return `<option value="">— tanpa kelompok —</option>`
    + KELOMPOK.map(k => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(k)}</option>`).join('')
    + extra.join('');
}

/** Link halaman tanda tangan slip gaji (slip.html — tanpa login) */
function slipTautan(id, gid) {
  const base = String(location.href).split('#')[0].split('?')[0].replace(/[^/]*$/, '');
  return base + 'slip.html?id=' + encodeURIComponent(id) + '&g=' + encodeURIComponent(gid);
}

/** Pesan WA default: slip + tautan tanda tangan penerimaan */
function pesanSlip(b, it, link) {
  const namaP = (GJ.profil && GJ.profil.nama_pesantren) || 'Pesantren';
  return 'Assalamualaikum Wr. Wb. ' + it.nama + '\n'
    + 'Terlampir slip gaji ' + periodeLabel(b.periode) + ' sebesar ' + fmt(it.total) + '.\n'
    + 'Mohon ditandatangani penerimaannya melalui tautan berikut:\n' + link + '\n'
    + 'Jazakumullahukhoiron.\n- ' + namaP;
}

/* ---------- modal tambah / ubah data guru ---------- */
function modalGuru(g) {
  const baru = !g;
  const opsiJenis = (sel) => `<option value="">— Insentif umum —</option>`
    + (GJ.jenis || []).map(j => `<option value="${esc(j.id)}" ${String(sel || '') === String(j.id) ? 'selected' : ''}>${esc(j.nama)}${j.aktif ? '' : ' (nonaktif)'}</option>`).join('');
  const barisRinci = (e) => `
    <div class="flex gg-rinci-row" style="gap:6px;margin-bottom:6px;align-items:center">
      <select class="gg-jenis" style="flex:1;min-width:0">${opsiJenis(e.jenis_id)}</select>
      <input type="number" class="gg-rvol num" min="0" step="0.5" value="${Number(e.volume) > 0 ? Number(e.volume) : ''}" placeholder="Vol" style="width:70px" title="Volume (kosongkan bila satuan sudah jumlah total)">
      <input type="number" class="gg-rins num" min="0" step="1000" value="${Number(e.nominal) || 0}" style="width:118px" title="Satuan = harga per satuan (Rp)">
      <input class="gg-rjml num" readonly tabindex="-1" value="${fmt(jmlKomp(e.nominal, e.volume))}" style="width:126px;background:#f1f5f9;cursor:default" title="Jumlah otomatis = Volume × Satuan">
      <button type="button" class="btn btn-sm gg-rdel" title="Hapus baris">✕</button>
    </div>`;
  const rAwal = (g && Array.isArray(g.insentif_rinci) && g.insentif_rinci.length) ? g.insentif_rinci
    : (g && Number(g.insentif) > 0 ? [{ jenis_id: '', nama: 'Insentif', nominal: Number(g.insentif), volume: 0, satuan: '' }] : [{ jenis_id: '', nama: '', nominal: 0, volume: 0, satuan: '' }]);
  /* Sel Vol | Satuan (Rp) | Jumlah otomatis utk 1 komponen tetap */
  const barisKomp = (label, id, vol, nom) => `
    <tr>
      <td><strong>${label}</strong></td>
      <td class="num"><input type="number" id="${id}-vol" min="0" step="0.5" value="${Number(vol) > 0 ? Number(vol) : ''}" placeholder="Vol" title="Volume — kosongkan bila satuan sudah jumlah total"></td>
      <td class="num"><input type="number" id="${id}" min="0" step="1000" value="${Number(nom) || 0}" placeholder="Rp" title="Satuan = harga per satuan (Rp)"></td>
      <td class="num"><input id="${id}-jml" readonly tabindex="-1" value="${fmt(jmlKomp(nom, vol))}" title="Jumlah otomatis = Volume × Satuan"></td>
    </tr>`;

  openModal(baru ? '➕ Tambah Guru & Karyawan' : '✏️ Ubah Data Guru — ' + g.nama, `
    <div class="form-grid">
      <div class="field full"><label>Nama Lengkap *</label><input id="gg-nama" value="${esc(g ? g.nama : '')}" placeholder="mis. Ust. Ahmad Fauzi" autocomplete="off"></div>
      <div class="field"><label>Jabatan</label><input id="gg-jabatan" value="${esc(g ? g.jabatan : '')}" placeholder="mis. Pengajar Tahfidz" autocomplete="off"></div>
      <div class="field"><label>Kelompok</label><select id="gg-kelompok">${selKelompok(g ? g.kelompok : '')}</select></div>
      <div class="field"><label>No. WhatsApp</label><input id="gg-wa" value="${esc(g ? g.no_wa : '')}" placeholder="0856… / 628…" autocomplete="off"></div>
      <div class="field full"><label>Komponen Gaji — <strong>Jumlah = Volume × Satuan</strong> (otomatis)</label>
        <div class="table-wrap"><table class="gj-komp" id="gg-komp">
          <thead><tr><th>Komponen</th><th class="num">Volume</th><th class="num">Satuan (Rp)</th><th class="num">Jumlah</th></tr></thead>
          <tbody>
            ${barisKomp('Gaji Pokok', 'gg-pokok', g ? g.gaji_pokok_vol : 0, g ? g.gaji_pokok : 0)}
            ${barisKomp('Tunjangan', 'gg-tunj', g ? g.tunjangan_vol : 0, g ? g.tunjangan : 0)}
            ${barisKomp('Potongan', 'gg-pot', g ? g.potongan_vol : 0, g ? g.potongan : 0)}
          </tbody>
        </table></div>
      </div>
      <div class="field full"><label>Rincian Insentif — <strong>Jenis | Volume | Satuan (Rp) | Jumlah</strong></label>
        <div class="flex gg-rinci-head" style="gap:6px;margin-bottom:4px;font-size:11.5px;color:var(--muted)">
          <span style="flex:1;min-width:0">Jenis Insentif</span><span style="width:70px;text-align:center">Vol</span>
          <span style="width:118px;text-align:right">Satuan (Rp)</span><span style="width:126px;text-align:right">Jumlah</span><span style="width:26px"></span>
        </div>
        <div id="gg-rinci">${rAwal.map(barisRinci).join('')}</div>
        <div class="flex" style="gap:8px;align-items:center;margin-top:4px">
          <button type="button" class="btn btn-sm" id="gg-rinci-add">＋ Tambah Baris</button>
          <span class="hint">Belum ada jenis? Buat dulu di kartu <strong>🎯 Jenis Insentif</strong> (mis. Insentif Tahfidz).</span>
        </div>
      </div>
      <div class="field full"><label class="hint" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="gg-aktif" ${(!g || g.aktif) ? 'checked' : ''}> Aktif — muncul di form bayar gaji periode</label></div>
    </div>`,
    `<button class="btn" onclick="closeModal()">Batal</button>
     <button class="btn btn-primary" id="gg-ok">${baru ? '✔ Tambah Data' : '✔ Simpan Perubahan'}</button>`, 640);

  /* Jumlah otomatis = Volume × Satuan (harga per satuan) */
  const hitungJumlah = () => {
    ['gg-pokok', 'gg-tunj', 'gg-pot'].forEach(id => {
      const el = $('#' + id + '-jml');
      if (el) { el.value = fmt(jmlKomp(Number($('#' + id).value) || 0, Number($('#' + id + '-vol').value) || 0)); }
    });
    $$('#gg-rinci .gg-rinci-row').forEach(r => {
      $('.gg-rjml', r).value = fmt(jmlKomp(Number($('.gg-rins', r).value) || 0, Number($('.gg-rvol', r).value) || 0));
    });
  };
  $('#gg-komp') && $$('#gg-komp input').forEach(i => { i.addEventListener('input', hitungJumlah); });
  $('#gg-rinci').addEventListener('input', hitungJumlah);
  hitungJumlah();

  $('#gg-rinci').addEventListener('click', (e) => {
    const del = e.target.closest('.gg-rdel');
    if (!del) { return; }
    const rows = $$('#gg-rinci .gg-rinci-row');
    if (rows.length > 1) { del.closest('.gg-rinci-row').remove(); }
    else {
      $('.gg-jenis', rows[0]).value = ''; $('.gg-rins', rows[0]).value = 0;
      $('.gg-rvol', rows[0]).value = ''; hitungJumlah();
    }
  });
  $('#gg-rinci-add').onclick = () => {
    $('#gg-rinci').insertAdjacentHTML('beforeend', barisRinci({ jenis_id: '', nama: '', nominal: 0, volume: 0, satuan: '' }));
    hitungJumlah();
  };

  $('#gg-ok').onclick = async () => {
    const nama = $('#gg-nama').value.trim();
    if (!nama) { return toast('Nama guru/karyawan wajib diisi', 'error'); }
    const rinci = [];
    $$('#gg-rinci .gg-rinci-row').forEach(r => {
      const n = Number($('.gg-rins', r).value) || 0;
      if (n <= 0) { return; }
      const jid = $('.gg-jenis', r).value;
      const jm = (GJ.jenis || []).find(x => String(x.id) === String(jid));
      rinci.push({
        jenis_id: jid, nama: jm ? jm.nama : 'Insentif', nominal: n,
        volume: Number($('.gg-rvol', r).value) || 0
      });
    });
    const body = {
      nama,
      jabatan: $('#gg-jabatan').value.trim(),
      kelompok: $('#gg-kelompok') ? $('#gg-kelompok').value : '',
      no_wa: $('#gg-wa').value.trim(),
      gaji_pokok: Number($('#gg-pokok').value) || 0,
      gaji_pokok_vol: Number($('#gg-pokok-vol').value) || 0,
      gaji_pokok_sat: '',
      tunjangan: Number($('#gg-tunj').value) || 0,
      tunjangan_vol: Number($('#gg-tunj-vol').value) || 0,
      tunjangan_sat: '',
      insentif_rinci: rinci,
      insentif: rinci.reduce((a, e) => a + jmlKomp(e.nominal, e.volume), 0),
      potongan: Number($('#gg-pot').value) || 0,
      potongan_vol: Number($('#gg-pot-vol').value) || 0,
      potongan_sat: '',
      aktif: $('#gg-aktif').checked
    };
    try {
      const guruKosong = !(GJ.guru || []).length;
      if (baru) { await API.post('/api/guru', body); }
      else { await API.put('/api/guru?id=' + encodeURIComponent(g.id), body); }
      closeModal();
      toast(baru ? 'Data guru/karyawan ditambahkan' : 'Data guru/karyawan diperbarui');
      await pageGaji();
      if (baru) { tawarLangkahBerikut('guru', guruKosong); }
    } catch (e) { toast(e.message, 'error'); }
  };
}

/* ---------- modal bayar gaji 1 periode -> 1 BKK ---------- */
/** Nilai insentif per guru → {n:{[jenis_id|'__lain__']: satuan/harga}, v:{…: volume}}.
 *  Bila >1 entri menyatu di kolom yang sama, satuan diubah jadi jumlah efektif tanpa volume */
function prefillIns(g, kolomIds, namaToId) {
  const n = {}, v = {};
  const r = (Array.isArray(g.insentif_rinci) && g.insentif_rinci.length) ? g.insentif_rinci
    : (Number(g.insentif) > 0 ? [{ jenis_id: '', nama: 'Insentif', nominal: Number(g.insentif), volume: 0, satuan: '' }] : []);
  r.forEach(e => {
    const idRaw = String(e.jenis_id || '');
    /* data lama: jenis_id kosong → cocokkan dulu berdasarkan nama jenis */
    const byNama = namaToId ? namaToId.get(String(e.nama || '').trim().toLowerCase()) : undefined;
    const k = kolomIds.has(idRaw) ? idRaw : (byNama && kolomIds.has(byNama) ? byNama : '__lain__');
    const nom = Number(e.nominal) || 0, vol = Number(e.volume) || 0;
    if (n[k] === undefined) { n[k] = nom; v[k] = vol; }
    else {   /* entri kedua di kolom sama → satukan jadi total efektif tanpa volume */
      n[k] = jmlKomp(n[k], v[k]) + jmlKomp(nom, vol);
      v[k] = 0;
    }
  });
  return { n, v };
}
function modalBayar(opt) {
  const aktif = GJ.guru.filter(g => g.aktif);
  if (!aktif.length) {
    return toast('Belum ada data guru aktif — tambahkan dulu di Data Guru & Karyawan', 'error');
  }
  const jenisAktif = (GJ.jenis || []).filter(j => j.aktif !== false);
  const kolomIds = new Set(jenisAktif.map(j => String(j.id)));
  const namaToId = new Map(jenisAktif.map(j => [String(j.nama || '').trim().toLowerCase(), String(j.id)]));
  /* nilai rincian yang tidak cocok kolom (jenis nonaktif / insentif umum) → 1 kolom gabungan */
  const namaTakCocok = [...new Set(aktif.flatMap(g => {
    const r = (Array.isArray(g.insentif_rinci) && g.insentif_rinci.length) ? g.insentif_rinci
      : (Number(g.insentif) > 0 ? [{ jenis_id: '', nama: 'Insentif', nominal: 0 }] : []);
    return r.filter(e => !kolomIds.has(String(e.jenis_id || '')) && !namaToId.has(String(e.nama || '').trim().toLowerCase()))
      .map(e => String(e.nama || '').trim()).filter(Boolean);
  }))];
  const butuhLain = aktif.some(g => (prefillIns(g, kolomIds, namaToId).n.__lain__ || 0) > 0);
  const namaLain = namaTakCocok.length === 1 ? namaTakCocok[0] : 'Lainnya';
  const kolomIns = [
    ...jenisAktif.map(j => ({ k: String(j.id), nama: String(j.nama) })),
    ...(butuhLain ? [{ k: '__lain__', nama: namaLain }] : [])
  ];
  const lebar = Math.min(1560, 1040 + kolomIns.length * 196);
  const gayaSel = 'width:100%;min-width:0;font-size:11px;padding:4px 5px';
  const gayaJml = gayaSel + ';background:#f1f5f9;cursor:default;font-weight:600';
  /* 1 komponen = 3 sel SEJAJAR: Vol | Satuan (Rp) | Jumlah — jumlah = Vol × Satuan (otomatis) */
  const selKomp = (cls, fk, nominal, vol) => `
    <td class="num"><input type="number" class="${cls}-vol num" data-f="${fk}_vol" min="0" step="0.5" value="${Number(vol) > 0 ? Number(vol) : ''}" placeholder="vol" title="Volume — kosongkan bila satuan sudah jumlah total" style="${gayaSel}"></td>
    <td class="num"><input type="number" class="${cls} num" data-f="${fk}" min="0" step="1000" value="${Number(nominal) || 0}" placeholder="Rp" title="Satuan = harga per satuan (Rp)" style="${gayaSel}"></td>
    <td class="num"><input class="${cls}-jml num" data-j="${fk}" readonly tabindex="-1" value="${fmt(jmlKomp(nominal, vol))}" title="Jumlah otomatis = Volume × Satuan" style="${gayaJml}"></td>`;
  const selIns = (k, nominal, vol) => `
    <td class="num"><input type="number" class="gj-insvol num" data-k="${esc(k)}" min="0" step="0.5" value="${Number(vol) > 0 ? Number(vol) : ''}" placeholder="vol" title="Volume" style="${gayaSel}"></td>
    <td class="num"><input type="number" class="gj-ins num" data-k="${esc(k)}" min="0" step="1000" value="${Number(nominal) || 0}" placeholder="Rp" title="Satuan = harga per satuan (Rp)" style="${gayaSel}"></td>
    <td class="num"><input class="gj-insjml num" data-jk="${esc(k)}" readonly tabindex="-1" value="${fmt(jmlKomp(nominal, vol))}" title="Jumlah otomatis = Volume × Satuan" style="${gayaJml}"></td>`;
  const thGrp = (label) => `<th colspan="3" class="num" title="Vol × Satuan = Jumlah">${esc(label)}</th>`;
  const thSub = `<th class="num">Vol</th><th class="num">Satuan</th><th class="num">Jumlah</th>`;

  const s = GJ.setelan || {};
  const akunP = ((GJ.akun && GJ.akun.pengeluaran) || []);
  const sumP = ((GJ.akun && GJ.akun.pemasukan) || []);
  const defAkun = (s.akun && akunP.includes(s.akun)) ? s.akun
    : (akunP.includes('Biaya Insentif Guru dan Karyawan') ? 'Biaya Insentif Guru dan Karyawan' : (akunP[0] || ''));
  const defSum = (s.sumber_dana && sumP.includes(s.sumber_dana)) ? s.sumber_dana : (sumP[0] || '');
  const defJenis = ['Cas', 'BRI', 'BSI', 'BPD'].includes(s.jenis_transaksi) ? s.jenis_transaksi : 'Cas';

  const drafDibuka = !!(opt && opt.editDraf);
  const srcDraf = drafDibuka ? ((GJ.list || []).find(x => String(x.id) === String(opt.editDraf)) || null) : null;
  openModal(drafDibuka ? `📝 Draf Gaji ${esc(periodeLabel(srcDraf ? srcDraf.periode : ''))}` : '💵 Bayar Gaji Periode', `
    <div class="form-grid">
      <div class="field"><label>Periode (bulan)</label><input type="month" id="gj-periode" value="${thisMonth()}"></div>
      <div class="field"><label>Tanggal Bayar</label><input type="date" id="gj-tgl" value="${today()}"></div>
      <div class="field"><label>Jenis Transaksi</label>
        <select id="gj-jenis">${['Cas', 'BRI', 'BSI', 'BPD'].map(j => `<option value="${j}" ${j === defJenis ? 'selected' : ''}>${j}</option>`).join('')}</select></div>
      <div class="field"><label>Akun Pengeluaran</label>
        <select id="gj-akun">${akunP.map(a => `<option value="${esc(a)}" ${a === defAkun ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></div>
      <div class="field"><label>Sumber Dana (akun pemasukan)</label>
        <select id="gj-sumber"><option value="">— pilih —</option>${sumP.map(a => `<option value="${esc(a)}" ${a === defSum ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></div>
      <div class="field"><label>Keterangan</label><input id="gj-ket" value="${esc(s.keterangan || '')}" placeholder="kosong → Gaji &lt;Bulan&gt; &lt;Tahun&gt;"></div>
      <div class="field full"><label>Salin dari periode (opsional)</label>
        <select id="gj-salin">
          <option value="">— tidak disalin, pakai nilai awal dari data guru —</option>
          ${(GJ.list || []).map(x => `<option value="${esc(x.id)}">${esc(periodeLabel(x.periode))} — No. ${esc(x.no_bkk || '-')} (${x.jumlah} orang)${x.status === 'draf' ? ' · DRAF' : ''}</option>`).join('')}
        </select>
        <span class="hint">Pilih periode lama → seluruh Vol, Satuan (Rp) & rincian insentif tiap guru disalin dari periode itu (hanya guru yang masih aktif).</span></div>
    </div>
    <p class="hint" style="margin:4px 0 10px">Satu kali bayar per periode = <strong>SATU nomor BKK</strong> — tiap guru jadi jurnal kas keluar, dan tiap <strong>Jenis Insentif</strong> menarik dari <strong>akun pemasukan</strong>-nya sendiri (bila kosong → sumber dana). Tiap komponen terisi <strong>Vol</strong> × <strong>Satuan (Rp)</strong> → <strong>Jumlah</strong> otomatis (mis. 30 × Rp 5.000 = Rp 150.000); biarkan Vol kosong bila Satuan sudah jumlah total. <strong>📝 Simpan Draf</strong> menyimpan slip tanpa No. BKK & jurnal — bisa dicetak kapan pun, tinggal klik <strong>✔ Bayar</strong> saat siap.</p>
    <div class="table-wrap">
      <table id="gj-pilih">
        <thead>
          <tr>
            <th rowspan="2" style="width:34px"><input type="checkbox" id="gj-cekall" checked></th>
            <th rowspan="2" class="num">NO</th><th rowspan="2">Nama</th><th rowspan="2">Jabatan</th>
            ${thGrp('Pokok')}${thGrp('Tunjangan')}
            ${kolomIns.map(c => thGrp(c.nama)).join('')}
            ${thGrp('Potongan')}
            <th rowspan="2" class="num">Total</th>
          </tr>
          <tr>${thSub}${thSub}${kolomIns.map(() => thSub).join('')}${thSub}</tr>
        </thead>
        <tbody>${aktif.map((g, i) => {
          const pf = prefillIns(g, kolomIds, namaToId);
          const sumIns = kolomIns.reduce((a, c) => a + jmlKomp(pf.n[c.k] || 0, pf.v[c.k] || 0), 0);
          const total0 = jmlKomp(g.gaji_pokok, g.gaji_pokok_vol) + jmlKomp(g.tunjangan, g.tunjangan_vol) + sumIns - jmlKomp(g.potongan, g.potongan_vol);
          return `
          <tr data-gid="${esc(g.id)}">
            <td><input type="checkbox" class="gj-cek" checked></td>
            <td class="num muted">${i + 1}</td>
            <td><strong>${esc(g.nama)}</strong></td>
            <td class="muted">${esc(g.jabatan || '-')}</td>
            ${selKomp('gj-in', 'gaji_pokok', g.gaji_pokok, g.gaji_pokok_vol)}
            ${selKomp('gj-in', 'tunjangan', g.tunjangan, g.tunjangan_vol)}
            ${kolomIns.map(c => selIns(c.k, pf.n[c.k] || 0, pf.v[c.k] || 0)).join('')}
            ${selKomp('gj-in', 'potongan', g.potongan, g.potongan_vol)}
            <td class="num neg gj-rt">${fmt(total0)}</td>
          </tr>`; }).join('')}</tbody>
        <tfoot><tr style="background:#f8fafc">
          <td colspan="${13 + kolomIns.length * 3}"><strong>Total terpilih — <span id="gj-terpilih">${aktif.length} orang</span></strong></td>
          <td class="num"><strong id="gj-total">Rp 0</strong></td>
        </tr></tfoot>
      </table>
    </div>`,
    `<button class="btn" onclick="closeModal()">Batal</button>
     <button class="btn" id="gj-draf-ok" title="Simpan draf — slip bisa dicetak, jurnal & No. BKK menyusul">📝 Simpan Draf</button>
     <button class="btn btn-primary" id="gj-bayar-ok">✔ Bayar Sekarang</button>`, lebar);

  const recalc = () => {
    let tot = 0, n = 0;
    $$('#gj-pilih tbody tr').forEach(tr => {
      const on = $('.gj-cek', tr).checked;
      const v = {}, vol = {};
      $$('.gj-in', tr).forEach(inp => { v[inp.dataset.f] = Number(inp.value) || 0; });
      $$('.gj-in-vol', tr).forEach(inp => { vol[inp.dataset.f] = Number(inp.value) || 0; });
      $$('.gj-in-jml', tr).forEach(inp => { inp.value = fmt(jmlKomp(v[inp.dataset.j] || 0, vol[inp.dataset.j + '_vol'] || 0)); });
      const iv = {}, ivol = {};
      $$('.gj-ins', tr).forEach(inp => { iv[inp.dataset.k] = Number(inp.value) || 0; });
      $$('.gj-insvol', tr).forEach(inp => { ivol[inp.dataset.k] = Number(inp.value) || 0; });
      $$('.gj-insjml', tr).forEach(inp => { inp.value = fmt(jmlKomp(iv[inp.dataset.jk] || 0, ivol[inp.dataset.jk] || 0)); });
      let ins = 0;
      Object.keys(iv).forEach(k => { ins += jmlKomp(iv[k] || 0, ivol[k] || 0); });
      let rt = 0;
      if (on) {
        rt = jmlKomp(v.gaji_pokok, vol.gaji_pokok_vol) + jmlKomp(v.tunjangan, vol.tunjangan_vol) + ins - jmlKomp(v.potongan, vol.potongan_vol);
        n++;
      }
      $('.gj-rt', tr).textContent = fmt(rt);
      tr.style.opacity = on ? '' : '.5';
      tot += rt;
    });
    $('#gj-terpilih').textContent = n + ' orang';
    $('#gj-total').textContent = fmt(tot);
  };
  const tbl = $('#gj-pilih');
  tbl.addEventListener('input', recalc);
  tbl.addEventListener('change', (e) => {
    if (e.target.id === 'gj-cekall') {
      $$('#gj-pilih .gj-cek').forEach(c => { c.checked = e.target.checked; });
    }
    recalc();
  });
  recalc();

  /* ---------- salin isi satu periode ke seluruh baris form ---------- */
  const isiDariBatch = (batch, sumberPeriode) => {
    const items = (batch && Array.isArray(batch.items)) ? batch.items : [];
    const byId = new Map(items.map(it => [String(it.guru_id || ''), it]));
    let n = 0;
    $$('#gj-pilih tbody tr').forEach(tr => {
      const it = byId.get(String(tr.dataset.gid || ''));
      if (!it) { return; }
      const fMap = {};
      $$('.gj-in, .gj-in-vol', tr).forEach(i => { fMap[i.dataset.f] = i; });
      const put = (k, v) => { if (fMap[k]) { fMap[k].value = Number(v) || 0; } };
      put('gaji_pokok', it.gaji_pokok);      put('gaji_pokok_vol', it.gaji_pokok_vol);
      put('tunjangan', it.tunjangan);        put('tunjangan_vol', it.tunjangan_vol);
      put('potongan', it.potongan);          put('potongan_vol', it.potongan_vol);
      /* rincian insentif per jenis → kolom yang sama (fallback nama bila jenis_id kosong) */
      const pf = prefillIns(it, kolomIds, namaToId);
      const volMap = {};
      $$('.gj-insvol', tr).forEach(vi => { volMap[vi.dataset.k] = vi; });
      $$('.gj-ins', tr).forEach(ni => {
        const k = ni.dataset.k;
        ni.value = Number(pf.n[k]) || 0;
        if (volMap[k]) { volMap[k].value = Number(pf.v[k]) > 0 ? Number(pf.v[k]) : ''; }
      });
      const ck = $('.gj-cek', tr); if (ck) { ck.checked = true; }
      n++;
    });
    recalc();
    if (!n) { toast('Tidak ada guru pada periode sumber yang cocok dengan data guru aktif', 'error'); }
    else { toast('Data disalin dari ' + periodeLabel(sumberPeriode || (batch && batch.periode) || '')); }
    return n;
  };

  /* dropdown "Salin dari periode" di dalam form */
  const salinSel = $('#gj-salin');
  if (salinSel) {
    salinSel.onchange = async () => {
      const id = salinSel.value;
      if (!id) { return; }
      salinSel.disabled = true;
      try {
        const d = await API.get('/api/gaji?id=' + encodeURIComponent(id));
        isiDariBatch(d.batch, d.batch && d.batch.periode);
    } catch (e) { toast(e.message, 'error'); }
    finally { if (btn.isConnected) btn.disabled = false; }
  };
}



  /* pintasan dari daftar: buka form sudah terisi & periode = bulan berikutnya */
  if (opt && opt.salin) {
    const src = opt.salin;
    const target = nextPeriode(src.periode);
    const sudahLunas = (GJ.list || []).some(x => x.periode === target && x.status !== 'draf');
    if (sudahLunas) {
      toast(`Periode ${periodeLabel(target)} sudah pernah dibayar — pilih bulan lain dulu`, 'error');
    } else {
      $('#gj-periode').value = target;
    }
    $('#gj-tgl').value = today();
    if (['Cas', 'BRI', 'BSI', 'BPD'].includes(src.jenis_transaksi)) { $('#gj-jenis').value = src.jenis_transaksi; }
    if (src.akun && akunP.includes(src.akun)) { $('#gj-akun').value = src.akun; }
    if (src.sumber_dana && sumP.includes(src.sumber_dana)) { $('#gj-sumber').value = src.sumber_dana; }
    if (salinSel) { salinSel.value = src.id; }
    isiDariBatch(src, src.periode);
  }

  /* buka kembali draf dari daftar / halaman detail → isi ulang form */
  if (opt && opt.editDraf) {
    (async () => {
      const btnD = $('#gj-draf-ok');
      if (btnD) { btnD.disabled = true; }
      try {
        const d = await API.get('/api/gaji?id=' + encodeURIComponent(opt.editDraf));
        const b = d.batch;
        if (!b) { return toast('Draf tidak ditemukan', 'error'); }
        $('#gj-periode').value = b.periode || '';
        $('#gj-tgl').value = b.tanggal || today();
        if (['Cas', 'BRI', 'BSI', 'BPD'].includes(b.jenis_transaksi)) { $('#gj-jenis').value = b.jenis_transaksi; }
        if (b.akun && akunP.includes(b.akun)) { $('#gj-akun').value = b.akun; }
        if (b.sumber_dana && sumP.includes(b.sumber_dana)) { $('#gj-sumber').value = b.sumber_dana; }
        $('#gj-ket').value = b.keterangan || '';
        isiDariBatch(b, b.periode);
      } catch (e) { toast(e.message, 'error'); }
      finally { if (btnD && btnD.isConnected) { btnD.disabled = false; } }
    })();
  }

  /* kumpulkan isi form → payload */
  const isiForm = () => {
    const items = [];
    $$('#gj-pilih tbody tr').forEach(tr => {
      if (!$('.gj-cek', tr).checked) { return; }
      const o = { guru_id: tr.dataset.gid };
      $$('.gj-in', tr).forEach(inp => { o[inp.dataset.f] = Number(inp.value) || 0; });
      $$('.gj-in-vol', tr).forEach(inp => { o[inp.dataset.f] = Number(inp.value) || 0; });
      const rinci = [];
      const ivol = {};
      $$('.gj-insvol', tr).forEach(inp => { ivol[inp.dataset.k] = Number(inp.value) || 0; });
      $$('.gj-ins', tr).forEach(inp => {
        const n = Number(inp.value) || 0;
        const k = inp.dataset.k;
        const e = { jenis_id: k === '__lain__' ? '' : k, nama: k === '__lain__' ? namaLain : '', nominal: n, volume: ivol[k] || 0 };
        if (n > 0) { rinci.push(e); }
      });
      o.insentif_rinci = rinci;
      o.insentif = rinci.reduce((a, e) => a + jmlKomp(e.nominal, e.volume), 0);
      items.push(o);
    });
    return items;
  };
  const cekForm = (items) => {
    if (!items.length) { toast('Belum ada guru yang dipilih untuk dibayar', 'error'); return false; }
    if (!$('#gj-sumber').value) { toast('Pilih sumber dana (akun pemasukan) terlebih dahulu', 'error'); return false; }
    return true;
  };

  $('#gj-draf-ok').onclick = async () => {
    const items = isiForm();
    if (!cekForm(items)) { return; }
    const btn = $('#gj-draf-ok');
    btn.disabled = true;
    try {
      const r = await API.post('/api/gaji', {
        act: 'draf',
        tanggal: $('#gj-tgl').value,
        periode: $('#gj-periode').value,
        jenis_transaksi: $('#gj-jenis').value,
        akun: $('#gj-akun').value,
        sumber_dana: $('#gj-sumber').value,
        keterangan: $('#gj-ket').value.trim(),
        items
      });
      closeModal();
      STATE.gaji = Object.assign({}, STATE.gaji, { detail: r.id });
      await pageGaji();
      toast(`Draf tersimpan — ${r.dibuat} slip siap dicetak, jurnal & No. BKK belum terbit`);
    } catch (e) { toast(e.message, 'error'); }
    finally { if (btn.isConnected) btn.disabled = false; }
  };

  $('#gj-bayar-ok').onclick = async () => {
    const items = isiForm();
    if (!cekForm(items)) { return; }
    const btn = $('#gj-bayar-ok');
    btn.disabled = true;
    try {
      const r = await API.post('/api/gaji' + (opt && opt.editDraf ? '?id=' + encodeURIComponent(opt.editDraf) : ''), {
        act: 'bayar',
        tanggal: $('#gj-tgl').value,
        periode: $('#gj-periode').value,
        jenis_transaksi: $('#gj-jenis').value,
        akun: $('#gj-akun').value,
        sumber_dana: $('#gj-sumber').value,
        keterangan: $('#gj-ket').value.trim(),
        items
      });
      closeModal();
      STATE.gaji = Object.assign({}, STATE.gaji, { detail: r.id });
      await pageGaji();
      toast(`Gaji dibayar — ${r.dibuat} slip, No. ${r.no_bkk}, total ${fmt(r.total)}`);
    } catch (e) { toast(e.message, 'error'); }
    finally { if (btn.isConnected) btn.disabled = false; }
  };
}

/* ---------- Rekap Insentif: template & import Excel flat 45 kolom (format PDF) ---------- */
function insHeaderFlat() {
  /* label unik per kolom — sejajar urut INS_LEAVES; kolom hitung ('calc') & 'no' diabaikan saat import */
  const m = {
    no: 'No', nama: 'Nama',
    psmv: 'Pokok SMP Vol', psms: 'Pokok SMP Satuan', psmj: 'Pokok SMP Jumlah',
    psav: 'Pokok SMA Vol', psas: 'Pokok SMA Satuan', psaj: 'Pokok SMA Jumlah',
    musrif: 'Musrif/fah', gurual: "Guru Al-Qur'an",
    khv: 'Kehadiran Vol', khs: 'Kehadiran Satuan', kht: 'Kehadiran Total',
    rapot: 'Rapot', asat: 'ASAT', didik: 'Pendidikan',
    jbt1n: 'Jabatan 1 Jabatan', jbt1j: 'Jabatan 1 Jumlah',
    jbt2n: 'Jabatan 2 Jabatan', jbt2j: 'Jabatan 2 Jumlah',
    piket: 'Piket', masaker: 'Masa Kerja', tamb: 'Tambahan', kel: 'Keluarga',
    i1j: 'Insentif 1 Jenis', i1v: 'Insentif 1 Vol', i1s: 'Insentif 1 Satuan', i1n: 'Insentif 1 Jumlah',
    i2j: 'Insentif 2 Jenis', i2v: 'Insentif 2 Vol', i2s: 'Insentif 2 Satuan', i2n: 'Insentif 2 Jumlah',
    i3j: 'Insentif 3 Jenis', i3v: 'Insentif 3 Vol', i3s: 'Insentif 3 Satuan', i3n: 'Insentif 3 Jumlah',
    i4j: 'Insentif 4 Jenis', i4v: 'Insentif 4 Vol', i4s: 'Insentif 4 Satuan', i4n: 'Insentif 4 Jumlah',
    ekstrak: 'Ekstrak urikuler', potj: 'Potongan Jenis', potn: 'Potongan Jumlah',
    tseb: 'Total Sebelum Potongan', tses: 'Jumlah Setelah Potongan',
  };
  return INS_LEAVES.map(l => ({ id: l.id, label: m[l.id] || l.label, t: l.t }));
}
function insNormHeader(s) {
  return String(s || '').trim().toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ');
}
function unduhTemplateRekap() {
  const flat = insHeaderFlat();
  const contoh = {
    nama: 'Ustadz Contoh', psmv: 24, psms: 23000, psmj: 552000,
    musrif: 50000, khv: 20, khs: 1000, kht: 20000, rapot: 100000,
    jbt1n: 'Mudir', jbt1j: 2300000, piket: 100000,
    i1j: 'Insentif Tahfidz', i1v: 5, i1s: 50000, i1n: 250000,
    potj: 'Infaq Sosial', potn: 10000, tseb: 3222000, tses: 3212000,
  };
  downloadCsv('template-import-rekap-insentif.csv', [
    flat.map(h => h.label),
    flat.map(h => (h.id in contoh) ? contoh[h.id] : ''),
  ]);
}
function importRekap(grid, periode) {
  let parsed = [];
  openModal('📥 Import Rekap Insentif — ' + esc(periodeLabel(periode)), `
    <p class="hint">Header baris pertama = <strong>45 kolom datar</strong> sesuai format PDF (lihat <em>⬇ Template CSV</em>). Kolom <strong>No</strong> &amp; <strong>kolom hitung</strong> (Jumlah/Total/Total Sebelum/Setelah Potongan) boleh diisi — nilai hitung diabaikan &amp; dihitung ulang. Seluruh baris di canvas akan <strong>diganti</strong> isi file (ada konfirmasi bila canvas terisi). Angka boleh memakai format <em>23.000</em> / <em>Rp 23.000</em> / <em>1.234,56</em>.</p>
    <div class="flex wrap-actions" style="margin-top:12px">
      <button class="btn" id="im-r-tpl">⬇ Template CSV</button>
      <label class="btn btn-primary" style="cursor:pointer">📥 Pilih File (.xlsx / .csv)<input type="file" id="im-r-file" accept=".xlsx,.xls,.csv" hidden></label>
    </div>
    <div id="im-r-prev" class="mt"></div>`,
    `<button class="btn" onclick="closeModal()">Tutup</button><button class="btn btn-gold" id="im-r-go" disabled>📥 Import Sekarang</button>`, 780);

  $('#im-r-tpl').onclick = () => unduhTemplateRekap();
  $('#im-r-file').onchange = async (e) => {
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
      $('#im-r-go').disabled = !parsed.length;
      if (!parsed.length) { $('#im-r-prev').innerHTML = '<p class="muted">Tidak ada baris terbaca.</p>'; return; }
      const heads = Object.keys(parsed[0]);
      const flat = insHeaderFlat();
      const dikenal = new Set(flat.map(h => insNormHeader(h.label)));
      const takDikenal = heads.filter(h => !dikenal.has(insNormHeader(h)));
      $('#im-r-prev').innerHTML = `
        <div class="card card-pad" style="box-shadow:none;background:var(--green-50);border-color:var(--green-100)">
          <strong>${parsed.length} baris terbaca</strong> — ${heads.length} kolom: ${heads.slice(0, 12).map(h => `<span class="badge lunas" style="margin:2px">${esc(h)}</span>`).join('')}${heads.length > 12 ? '…' : ''}
          ${takDikenal.length ? `<div class="hint" style="margin-top:6px">⚠ kolom tak dikenal (diabaikan): ${takDikenal.map(esc).join(', ')}</div>` : ''}
        </div>
        <div class="table-wrap mt" style="margin-top:12px;max-height:220px;overflow:auto">
          <table><thead><tr>${heads.slice(0, 8).map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${parsed.slice(0, 5).map(r => `<tr>${heads.slice(0, 8).map(h => `<td>${esc(String(r[h] ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody></table>
        </div>`;
    } catch (err) { toast(err.message, 'error'); }
    e.target.value = '';
  };
  $('#im-r-go').onclick = () => {
    if (!parsed.length) return;
    /* peta header → leaf */
    const flat = insHeaderFlat();
    const peta = new Map();
    flat.forEach(h => { if (h.t !== 'no' && h.t !== 'calc') { peta.set(insNormHeader(h.label), h); peta.set(insNormHeader(h.id), h); } });
    const baris = [];
    let tanpaNama = 0;
    parsed.forEach(r => {
      const b = { nama: '', c: {} };
      Object.keys(r).forEach(k => {
        const h = peta.get(insNormHeader(k));
        if (!h) { return; }
        const teks = String(r[k] ?? '').trim();
        if (teks === '' || teks === '-') { return; }
        if (h.id === 'nama') { b.nama = teks; return; }
        const v = insParse(teks, h.t);
        if (v !== null && v !== '') { b.c[h.id] = v; }
      });
      if (!b.nama) { if (Object.keys(b.c).length) { tanpaNama++; } return; }
      baris.push(b);
    });
    if (!baris.length) { return toast('Tidak ada baris ber-nama guru — periksa kolom "Nama"', 'error'); }
    const lama = (grid.data() || []).filter(x => String(x.nama || '').trim()).length;
    if (lama && !confirm('Ganti ' + lama + ' baris di canvas dengan ' + baris.length + ' baris dari file?')) { return; }
    grid.ganti(baris);
    closeModal();
    let pesan = baris.length + ' baris diimport — tinjau lalu klik 💾 Simpan';
    if (tanpaNama) { pesan += ' (' + tanpaNama + ' baris tanpa nama diabaikan)'; }
    toast(pesan);
  };
}

/* ---------- markup slip gaji per orang (dipakai modal slip & cetak semua slip) ---------- */
function slipHTML(b, it, elId) {
  const set = GJ.profil || {};
  const kotaTgl = [set.kota, tglPanjang(b.tanggal)].filter(Boolean).join(', ');
  const kw = (n) => 'Rp ' + angkaKw(n);                       /* Rp 3.000.000,00 */
  let hari = '';
  try { hari = new Date(b.tanggal + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long' }); } catch (e) {}
  /* 1 baris rincian: Vol | Satuan (harga per satuan) | Total = Vol × Satuan */
  const anak = (ket, nom, vol) => {
    const jum = jmlKomp(nom, vol);
    if (jum <= 0) { return ''; }
    return `<tr><td class="num muted">↳</td><td>${esc(ket)}</td>
      <td class="num">${Number(vol) > 0 ? esc(String(vol)) : ''}</td>
      <td class="num">${kw(nom)}</td>
      <td class="num">${kw(jum)}</td></tr>`;
  };
  const grup = (huruf, nama, isi) => isi ? `
      <tr class="bk-grp"><td class="num"><strong>${huruf}</strong></td><td colspan="4"><strong>${esc(nama)}</strong></td></tr>${isi}` : '';
  const rinciIns = (Array.isArray(it.insentif_rinci) ? it.insentif_rinci : [])
    .filter(e => e && Number(e.nominal) > 0)
    .map(e => anak(e.nama || 'Insentif', e.nominal, e.volume)).join('')
    || anak('Insentif', it.insentif, 0);
  const totalIns = (Array.isArray(it.insentif_rinci) && it.insentif_rinci.length)
    ? it.insentif_rinci.reduce((a, e) => a + jmlKomp(e.nominal, e.volume), 0)
    : (Number(it.insentif) || 0);
  const rPokok = anak('Gaji Pokok', it.gaji_pokok, it.gaji_pokok_vol);
  const rTunj  = anak('Tunjangan', it.tunjangan, it.tunjangan_vol);
  const rPot   = anak('Potongan', it.potongan, it.potongan_vol);

  return `
    <article class="surat" id="${elId || 'slip-body'}">
      <header class="surat-kop">
        <div class="surat-kop-logo">${set.logo ? `<img src="${esc(set.logo)}" alt="Logo">` : esc((set.logo_teks || 'PP').toUpperCase().slice(0, 3))}</div>
        <div class="surat-kop-txt">
          <h2>${esc(set.nama_pesantren || '')}</h2>
          <p>${set.alamat ? esc(set.alamat) : ''}</p>
          ${set.web || set.telp ? `<p>${[set.web, set.telp].filter(Boolean).map(esc).join(' · ')}</p>` : ''}
        </div>
      </header>

      <div class="bk-no">Nomor&nbsp;&nbsp;:&nbsp;&nbsp;<strong>${esc(b.no_bkk || '-')}</strong></div>
      <h3 class="bk-judul">BUKTI PENGELUARAN KAS<br>${esc(String(set.nama_pesantren || '').toUpperCase())}<br>GAJI GURU DAN KARYAWAN</h3>

      <table class="surat-meta bk-info">
        <tr><td class="k">Tanggal</td><td class="c">:</td><td class="v">${esc((hari ? hari + ', ' : '') + tglPanjang(b.tanggal))}</td></tr>
        <tr><td class="k">Periode</td><td class="c">:</td><td class="v">${esc(periodeLabel(b.periode))}</td></tr>
        <tr><td class="k">Jumlah</td><td class="c">:</td><td class="v"><strong>${kw(it.total)}</strong></td></tr>
        <tr><td class="k">Terbilang</td><td class="c">:</td><td class="v"><em>${esc(terbilangRapi(it.total))}</em></td></tr>
        <tr><td class="k">Dibayarkan Kepada</td><td class="c">:</td><td class="v"><strong>${esc(it.nama)}</strong>${it.jabatan ? ' — ' + esc(it.jabatan) : ''}</td></tr>
        <tr><td class="k">Keterangan</td><td class="c">:</td><td class="v">${esc([b.akun, b.sumber_dana].filter(Boolean).join(' ← '))}${b.keterangan ? ' · ' + esc(b.keterangan) : ''}</td></tr>
      </table>

      <table class="surat-tbl bk-tbl">
        <thead><tr>
          <th class="num" style="width:44px">No</th><th>Keterangan</th>
          <th class="num" style="width:70px">Vol</th>
          <th class="num" style="width:150px">Satuan</th>
          <th class="num" style="width:170px">Total</th>
        </tr></thead>
        <tbody>
          ${grup('A', 'Gaji Pokok', rPokok)}
          ${grup('B', 'Tunjangan', rTunj)}
          ${rinciIns ? `
          <tr class="bk-grp"><td class="num"><strong>C</strong></td><td colspan="4"><strong>Insentif</strong></td></tr>
          ${rinciIns}
          <tr class="bk-sub"><td></td><td colspan="3"><strong>Total Insentif</strong></td><td class="num"><strong>${kw(totalIns)}</strong></td></tr>` : ''}
          ${grup('D', 'Potongan', rPot)}
          <tr class="bk-total"><td></td><td colspan="3"><strong>Jumlah terima</strong></td><td class="num"><strong>${kw(it.total)}</strong></td></tr>
        </tbody>
      </table>

      <footer class="surat-ttd">
        <div class="bk-ttd-kiri">
          <div class="bk-h">Mengetahui</div>
          <div class="bk-dua">
            <div class="bk-satu">
              <div class="bk-jab">Mudir</div>
              <div class="st-ttd-ruang">${set.ttd_mudir ? `<img src="${esc(set.ttd_mudir)}" alt="TTD Mudir">` : ''}</div>
              <div class="st-nama">${esc(set.nama_mudir || '-')}</div>
            </div>
            <div class="bk-satu">
              <div class="bk-jab">Bendahara</div>
              <div class="st-ttd-ruang">${set.ttd_bendahara ? `<img src="${esc(set.ttd_bendahara)}" alt="TTD Bendahara">` : ''}</div>
              <div class="st-nama">${esc(set.nama_bendahara || '-')}</div>
            </div>
          </div>
        </div>
        <div class="bk-ttd-kanan">
          <div class="st-tgl">${esc(kotaTgl)}</div>
          <div class="bk-jab">Diterima</div>
          <div class="st-ttd-ruang">${it.ttd ? `<img src="${esc(it.ttd)}" alt="Tanda Tangan Penerima">` : ''}</div>
          <div class="st-nama">${esc(it.nama)}</div>
        </div>
      </footer>
    </article>`;
}

/* ---------- modal slip gaji per orang: cetak JPG + kirim WA + link ttd ---------- */
function bukaSlip(b, it) {
  const link = slipTautan(b.id, it.guru_id);
  openModal('🖨️ Slip Gaji — ' + it.nama, `
    ${slipHTML(b, it, 'slip-body')}
    <div class="form-grid" style="margin-top:12px">
      <div class="field"><label>No. WhatsApp Guru</label><input id="sl-hp" value="${esc(it.no_wa || '')}" placeholder="0856… / 628…"></div>
      <div class="field full"><label>Pesan WhatsApp</label>
        <textarea id="sl-pesan" rows="7">${esc(pesanSlip(b, it, link))}</textarea>
        <span class="hint">Slip gaji (JPG) + tautan tanda tangan penerimaan dikirim bersama pesan ini ke antrean bot WhatsApp.</span></div>
    </div>`,
    `<button class="btn" id="sl-cetak">🖨️ Cetak</button>
     <button class="btn" id="sl-jpg">⬇ JPG</button>
     <button class="btn btn-primary" id="sl-wa">📱 Kirim WhatsApp</button>
     <button class="btn" id="sl-tautan">🔗 Salin Link TTD</button>
     <button class="btn" onclick="closeModal()">Tutup</button>`, 780);

  const salin = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(link); }
      else {
        const ta = document.createElement('textarea'); ta.value = link; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy'); ta.remove();
      }
      toast('Link tanda tangan disalin');
    } catch (e) { toast('Gagal menyalin: ' + link, 'error'); }
  };
  $('#sl-tautan').onclick = salin;

  $('#sl-cetak').onclick = async () => {
    try { await cetakDokumenGambar(await slipJPG(), 'Slip Gaji'); }
    catch (e) { toast(e.message, 'error'); }
  };
  $('#sl-jpg').onclick = async () => {
    let jpg;
    try { jpg = await slipJPG(); }
    catch (e) { return toast(e.message, 'error'); }
    const a = document.createElement('a');
    a.href = jpg;
    a.download = 'SlipGaji_' + b.periode + '_' + String(it.nama || '').replace(/[^A-Za-z0-9]+/g, '_') + '.jpg';
    a.click();
    toast('Slip gaji JPG diunduh');
  };
  $('#sl-wa').onclick = async () => {
    const hp = $('#sl-hp').value.trim();
    if (!hp) { return toast('Isi No. WhatsApp guru — atau tambahkan di Data Guru', 'error'); }
    const btn = $('#sl-wa');
    btn.disabled = true;
    try {
      const gambar = await slipJPG();
      await API.post('/api/gaji', {
        act: 'kirim-wa', id: b.id, gid: it.guru_id,
        no_hp: hp, pesan: $('#sl-pesan').value, gambar
      });
      closeModal();
      toast('Slip gaji masuk antrean kirim WhatsApp');
      await pageGaji();
    } catch (e) { toast(e.message, 'error'); }
    finally { if (btn.isConnected) btn.disabled = false; }
  };
}

/* ---------- cetak SELURUH slip satu periode dalam satu sesi cetak — F4 landscape margin 0,5 cm, warna tetap ---------- */
async function cetakSlipSemua(b) {
  let batch = b;
  if (!Array.isArray(batch.items) || !batch.items.length) {
    try { batch = (await API.get('/api/gaji?id=' + encodeURIComponent(b.id))).batch; }
    catch (e) { return toast(e.message, 'error'); }
  }
  const items = (batch.items || []).filter(Boolean);
  if (!items.length) { return toast('Tidak ada slip pada periode ini', 'error'); }
  let css = '';
  try { css = await cssUntukRender(); } catch (e) {}
  const w = window.open('', '_blank');
  if (!w) { return toast('Jendela cetak diblokir browser — izinkan pop-up lalu coba lagi', 'error'); }
  const doc = w.document;
  doc.open();
  doc.write(`<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>Slip Gaji ${esc(periodeLabel(batch.periode))}</title>
<style>${css}</style>
<style>
@page { size: 330mm 215mm; margin: 0.5cm; }
*, *::before, *::after { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
html, body { margin:0; padding:0; background:#fff; }
.surat { page-break-after: always; break-after: page; box-shadow:none;
  border:0; border-radius:0; max-width:none; width:100%; margin:0 0 8mm; }
.surat:last-child { page-break-after: auto; break-after: auto; }
</style></head><body>${items.map((it, i) => slipHTML(batch, it, 'slip-body-' + i)).join('\n')}</body></html>`);
  doc.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch (e) {} }, 350);
  toast(`Membuka cetak ${items.length} slip — pilih printer atau "Simpan sebagai PDF"`);
}

/* ---------- cetak tabel Data Guru & Karyawan — kertas F4 landscape, margin 0,5 cm ---------- */
/* =========================================================
   REKAP INSENTIF BULANAN — grid spreadsheet <canvas>
   meniru format PDF "Insentif November": 45 kolom,
   header berlapis 4 baris, sel Jumlah/Total dihitung
   otomatis, cetak F4 landscape margin 0,3 cm
   ========================================================= */
const INS_H_HEAD = 22;
const INS_H_ROW = 24;

const INS_LEAVES = (() => {
  const L = [];
  const add = (id, label, w, t) => { L.push({ id, label, w, t }); };
  add('no', 'No', 34, 'no');
  add('nama', 'Nama', 150, 'text');
  add('psmv', 'Vol', 36, 'num'); add('psms', 'Satuan', 52, 'num'); add('psmj', 'Jumlah', 62, 'calc');
  add('psav', 'Vol', 36, 'num'); add('psas', 'Satuan', 52, 'num'); add('psaj', 'Jumlah', 62, 'calc');
  add('musrif', 'Musrif/fah', 58, 'num');
  add('gurual', 'Guru Al-Qur\'an', 68, 'num');
  add('khv', 'Vol', 34, 'num'); add('khs', 'Satuan', 50, 'num'); add('kht', 'Total', 58, 'calc');
  add('rapot', 'Rapot', 52, 'num'); add('asat', 'ASAT', 48, 'num'); add('didik', 'Pendidikan', 56, 'num');
  add('jbt1n', 'Jabatan', 74, 'text'); add('jbt1j', 'Jumlah', 62, 'num');
  add('jbt2n', 'Jabatan', 74, 'text'); add('jbt2j', 'Jumlah', 62, 'num');
  add('piket', 'Piket', 50, 'num'); add('masaker', 'Masa Kerja', 58, 'num'); add('tamb', 'Tambahan', 50, 'num');
  add('kel', 'Keluarga', 52, 'num');
  ['i1', 'i2', 'i3', 'i4'].forEach(pfx => {
    add(pfx + 'j', 'Jenis', 84, 'text'); add(pfx + 'v', 'Vol', 34, 'num');
    add(pfx + 's', 'Satuan', 50, 'num'); add(pfx + 'n', 'Jumlah', 58, 'calc');
  });
  add('ekstrak', 'Ekstrak urikuler', 62, 'num');
  add('potj', 'Jenis', 150, 'text'); add('potn', 'Jumlah', 70, 'num');
  add('tseb', 'Total Sebelum Potongan', 78, 'calc');
  add('tses', 'Jumlah Setelah Potongan', 86, 'calc');
  return L;
})();

const INS_HEAD = (() => {
  const H = [];
  const sel = (c0, c1, r0, r1, ...lines) => H.push({ c0, c1, r0, r1, lines });
  sel(0, 0, 0, 3, 'No');
  sel(1, 1, 0, 3, 'Nama');
  sel(2, 4, 0, 1, 'Pokok SMP'); sel(2, 2, 2, 3, 'Vol'); sel(3, 3, 2, 3, 'Satuan'); sel(4, 4, 2, 3, 'Jumlah');
  sel(5, 7, 0, 1, 'Pokok SMA'); sel(5, 5, 2, 3, 'Vol'); sel(6, 6, 2, 3, 'Satuan'); sel(7, 7, 2, 3, 'Jumlah');
  sel(8, 8, 0, 3, 'Musrif/fah');
  sel(9, 9, 0, 3, 'Guru Al-', 'Qur\'an');
  sel(10, 23, 0, 0, 'Tunjangan');
  sel(10, 12, 1, 2, 'Kehadiran'); sel(10, 10, 3, 3, 'Vol'); sel(11, 11, 3, 3, 'Satuan'); sel(12, 12, 3, 3, 'Total');
  sel(13, 15, 1, 2, 'Tunjangan'); sel(13, 13, 3, 3, 'Rapot'); sel(14, 14, 3, 3, 'ASAT'); sel(15, 15, 3, 3, 'Pendidikan');
  sel(16, 17, 1, 2, 'Jabatan 1'); sel(16, 16, 3, 3, 'Jabatan'); sel(17, 17, 3, 3, 'Jumlah');
  sel(18, 19, 1, 2, 'Jabatan 2'); sel(18, 18, 3, 3, 'Jabatan'); sel(19, 19, 3, 3, 'Jumlah');
  sel(20, 22, 1, 2, 'Tunjangan'); sel(20, 20, 3, 3, 'Piket'); sel(21, 21, 3, 3, 'Masa Kerja'); sel(22, 22, 3, 3, 'Tambahan');
  sel(23, 23, 1, 3, 'Keluarga');
  sel(24, 40, 0, 1, 'Insentif lainnya');
  for (let g = 0; g < 4; g++) {
    const b = 24 + g * 4;
    sel(b, b, 2, 3, 'Jenis'); sel(b + 1, b + 1, 2, 3, 'Vol');
    sel(b + 2, b + 2, 2, 3, 'Satuan'); sel(b + 3, b + 3, 2, 3, 'Jumlah');
  }
  sel(40, 40, 2, 3, 'Ekstrak', 'urikuler');
  sel(41, 42, 0, 1, 'Potongan'); sel(41, 41, 2, 3, 'Jenis'); sel(42, 42, 2, 3, 'Jumlah');
  sel(43, 43, 0, 3, 'Total', 'Sebelum', 'Potongan');
  sel(44, 44, 0, 3, 'Jumlah Setelah', 'Potongan');
  H.sort((a, b) => (a.c0 - b.c0) || (a.r0 - b.r0));
  return H;
})();

/* Data Guru & Karyawan — kanvas 48 kolom: 3 kolom identitas (No WA, Kelompok,
   Status) + 45 kolom komponen gaji persis urutan INS_LEAVES */
const GRU_LEAVES = (() => {
  const L = [];
  const add = (id, label, w, t) => { L.push({ id, label, w, t }); };
  add('no', 'No', 34, 'no');
  add('nama', 'Nama', 150, 'text');
  add('nowa', 'No WA', 96, 'text');
  add('kelompok', 'Kelompok', 92, 'text');
  add('aktif', 'Status', 64, 'text');
  INS_LEAVES.slice(2).forEach(l => { L.push({ id: l.id, label: l.label, w: l.w, t: l.t }); });
  return L;
})();

const GRU_HEAD = (() => {
  const H = [];
  const sel = (c0, c1, r0, r1, ...lines) => H.push({ c0, c1, r0, r1, lines });
  sel(0, 0, 0, 3, 'No');
  sel(1, 1, 0, 3, 'Nama');
  sel(2, 2, 0, 3, 'No WA');
  sel(3, 3, 0, 3, 'Kelompok');
  sel(4, 4, 0, 3, 'Status');
  INS_HEAD.forEach(hd => {
    if (hd.c0 >= 2) { H.push({ c0: hd.c0 + 3, c1: hd.c1 + 3, r0: hd.r0, r1: hd.r1, lines: hd.lines.slice() }); }
  });
  H.sort((a, b) => (a.c0 - b.c0) || (a.r0 - b.r0));
  return H;
})();

/* peta nama rincian tetap → kolom kanvas (case-insens) — dipakai guruKeBaris */
const GRU_RINCI_PETA = {
  'musrif/fah': 'musrif',
  "guru al-qur'an": 'gurual',
  'rapot': 'rapot',
  'asat': 'asat',
  'pendidikan': 'didik',
  'piket': 'piket',
  'masa kerja': 'masaker',
  'tambahan': 'tamb',
  'keluarga': 'kel',
  'ekstrak urikuler': 'ekstrak',
};

/** 1 data guru → 1 baris kanvas: identitas (No WA/Kelompok/Status) di c.*,
 *  komponen gaji mengikuti kolom rekap, rincian tak muat → b.sisa */
function guruKeBaris(g) {
  g = g || {};
  const c = {};
  const nm = String(g.nama || '').trim();
  if (String(g.no_wa || '').trim()) { c.nowa = String(g.no_wa).trim(); }
  if (String(g.kelompok || '').trim()) { c.kelompok = String(g.kelompok).trim(); }
  c.aktif = g.aktif ? 'aktif' : 'nonaktif';
  if (String(g.jabatan || '').trim()) { c.jbt1n = String(g.jabatan).trim(); }
  if (Number(g.gaji_pokok) > 0) { c.psms = Number(g.gaji_pokok); }
  if (Number(g.gaji_pokok_vol) > 0) { c.psmv = Number(g.gaji_pokok_vol); }
  const tunj = jmlKomp(Number(g.tunjangan) || 0, Number(g.tunjangan_vol) || 0);
  if (tunj > 0) { c.jbt1j = tunj; }
  const pot = jmlKomp(Number(g.potongan) || 0, Number(g.potongan_vol) || 0);
  if (pot > 0) { c.potn = pot; }
  const sisa = [];
  let slot = 0;
  const rinci = (Array.isArray(g.insentif_rinci) && g.insentif_rinci.length) ? g.insentif_rinci
    : (Number(g.insentif) > 0 ? [{ jenis_id: '', nama: 'Insentif', nominal: Number(g.insentif), volume: 0 }] : []);
  rinci.forEach(e => {
    if (!e) { return; }
    const namaJ = String(e.nama || '').trim();
    const nom = Number(e.nominal) || 0;
    const vol = Number(e.volume) || 0;
    const total = jmlKomp(nom, vol);
    if (total <= 0) { return; }
    const k = namaJ.toLowerCase();
    /* Kehadiran menyimpan Vol + Satuan (tarif), bukan total */
    if (k === 'kehadiran' && nom > 0 && c.khs === undefined) {
      c.khs = nom;
      if (vol > 0) { c.khv = vol; }
      return;
    }
    if (k === 'jabatan 2' && c.jbt2j === undefined) { c.jbt2j = total; return; }
    const kol = GRU_RINCI_PETA[k];
    if (kol && c[kol] === undefined) { c[kol] = total; return; }
    if (slot < 4) {
      const pfx = 'i' + (++slot);
      if (namaJ) { c[pfx + 'j'] = namaJ; }
      if (vol > 0) { c[pfx + 'v'] = vol; }
      if (nom > 0) { c[pfx + 's'] = nom; }
      return;
    }
    sisa.push({ nama: namaJ || 'Insentif', nominal: nom, volume: vol });
  });
  return { id: String(g.id || ''), nama: nm, c, sisa };
}

const INS_SUM_RAW = ['musrif', 'gurual', 'rapot', 'asat', 'didik', 'jbt1j', 'jbt2j', 'piket', 'masaker', 'tamb', 'kel', 'ekstrak'];
const INS_SUM_CALC = ['psmj', 'psaj', 'kht', 'i1n', 'i2n', 'i3n', 'i4n'];

function insAngka(n) {
  if (!isFinite(n)) { return '-'; }
  return Number(n).toLocaleString('id-ID', Number.isInteger(Number(n)) ? undefined : { maximumFractionDigits: 2 });
}
function insNum(b, k) {
  const c = (b && b.c) || {};
  const v = c[k];
  if (v === undefined || v === null || v === '') { return 0; }
  const n = Number(v);
  return isFinite(n) ? n : 0;
}
function insKali(b, a, d) {
  /* sama dengan jmlKomp di Data Guru/form bayar: Vol kosong → Satuan dianggap jumlah total */
  const x = insNum(b, a), y = insNum(b, d);
  return x > 0 ? x * y : y;
}
function insHitung(b, id) {
  if (id === 'psmj') { return insKali(b, 'psmv', 'psms'); }
  if (id === 'psaj') { return insKali(b, 'psav', 'psas'); }
  if (id === 'kht') { return insKali(b, 'khv', 'khs'); }
  if (id === 'i1n') { return insKali(b, 'i1v', 'i1s'); }
  if (id === 'i2n') { return insKali(b, 'i2v', 'i2s'); }
  if (id === 'i3n') { return insKali(b, 'i3v', 'i3s'); }
  if (id === 'i4n') { return insKali(b, 'i4v', 'i4s'); }
  if (id === 'tseb') {
    let s = 0;
    INS_SUM_CALC.forEach(k => { s += insHitung(b, k); });
    INS_SUM_RAW.forEach(k => { s += insNum(b, k); });
    return s;
  }
  if (id === 'tses') { return insHitung(b, 'tseb') - insNum(b, 'potn'); }
  return 0;
}
function insSelTeks(leaf, b, i) {
  if (leaf.t === 'no') { return String(i + 1); }
  if (leaf.t === 'text') {
    /* nama disimpan top-level (b.nama) — b.c.nama hanya pelengkap */
    let v = (b && b.c) ? b.c[leaf.id] : '';
    if (leaf.id === 'nama' && b && String(b.nama || '') !== '') { v = b.nama; }
    return (v !== undefined && v !== null && String(v) !== '') ? String(v) : '-';
  }
  if (leaf.t === 'num') {
    const n = insNum(b, leaf.id);
    return n ? insAngka(n) : '-';
  }
  const n = insHitung(b, leaf.id);
  return n ? insAngka(Math.round(n)) : '-';
}
function insParse(teks, t) {
  if (t === 'text') { return String(teks || '').trim(); }
  let s = String(teks || '').trim();
  if (s === '' || s === '-') { return null; }
  s = s.replace(/rp\s*/gi, '').replace(/\s/g, '');
  let n;
  if (/,\d+$/.test(s)) { n = parseFloat(s.replace(/\./g, '').replace(',', '.')); }
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) { n = parseFloat(s.replace(/\./g, '')); }
  else { n = parseFloat(s.replace(/,/g, '.')); }
  return isFinite(n) ? n : null;
}
function insPotong(ctx, teks, x, y, w) {
  if (ctx.measureText(teks).width <= w) { ctx.fillText(teks, x, y); return; }
  let s = teks;
  while (s.length > 1 && ctx.measureText(s + '…').width > w) { s = s.slice(0, -1); }
  ctx.fillText(s + '…', x, y);
}

function insBukaGrid(wrap, baris, onDirty, opt) {
  const o = opt || {};
  const leaves = Array.isArray(o.leaves) && o.leaves.length ? o.leaves : INS_LEAVES;
  const head = Array.isArray(o.head) && o.head.length ? o.head : INS_HEAD;
  const pokokRange = Array.isArray(o.pokokRange) && o.pokokRange.length === 2 ? o.pokokRange : [2, 7];
  const nC = leaves.length;
  const xOf = [];
  let acc = 0;
  for (let i = 0; i < nC; i++) { xOf.push(acc); acc += leaves[i].w; }
  const totalW = acc;
  /* kolom pertama dibekukan (No & Nama) — tetap terlihat saat kanvas digulir horizontal.
     Kanvas utama tetap menggambar konten apa adanya; overlay .ins-beku digeser sebesar
     scrollLeft lalu menggambar ulang kolom beku di tepi kiri viewport tiap gulir. */
  const freezeN = Math.max(0, Math.min(o.freeze === undefined ? 2 : (Number(o.freeze) || 0), nC));
  const freezeW = freezeN >= nC ? totalW : (freezeN > 0 ? xOf[freezeN] : 0);
  const headH = (head.reduce((m, h) => Math.max(m, h.r1), -1) + 1) * INS_H_HEAD;

  let data = Array.isArray(baris) ? baris : [];
  let sel = { r: -1, c: -1 };
  let editing = false;
  let editR = -1, editC = -1;   // sel target saat editor terbuka — nilai disimpan ke sel ASAL, bukan ke sel yang diklik berikutnya

  wrap.classList.add('ins-scroll');
  wrap.tabIndex = 0;
  /* host dipakai ulang antar muat (innerHTML = '' tidak menghapus listener elemen
     itu sendiri) — lepas dulu listener grid lama supaya tidak menumpuk */
  if (Array.isArray(wrap.__insOff)) { wrap.__insOff.forEach(a => wrap.removeEventListener(a[0], a[1], a[2])); }
  wrap.__insOff = [];
  const dengar = (ev, fn, opt) => { wrap.addEventListener(ev, fn, opt); wrap.__insOff.push([ev, fn, opt]); };
  wrap.innerHTML = '<div class="ins-beku"><canvas></canvas></div><canvas class="ins-utama"></canvas><input class="ins-edit" autocomplete="off" spellcheck="false">';
  const cv = wrap.querySelector('.ins-utama');
  const beku = wrap.querySelector('.ins-beku');
  const cvB = beku.querySelector('canvas');
  if (freezeN <= 0) { beku.style.display = 'none'; }
  const inp = wrap.querySelector('.ins-edit');
  const ctx = cv.getContext('2d');
  const ctxB = cvB.getContext('2d');

  const tandai = () => { if (onDirty) { onDirty(); } };
  const maxR = () => data.length;
  function pastikan(r) {
    while (data.length <= r) { data.push({ nama: '', c: {} }); }
  }

  /** gambar grid ke 1 konteks. batas = jumlah kolom yang digambar
   *  (nC = semua kolom untuk kanvas utama; freezeN = hanya kolom beku untuk overlay) */
  function gambarKe(cc, lebar, batas) {
    const dpr = window.devicePixelRatio || 1;
    const nTampil = Math.max(data.length, sel.r + 1, 1);
    const H = headH + nTampil * INS_H_ROW + 2;
    const wPx = Math.round(lebar * dpr), hPx = Math.round(H * dpr);
    if (cc.canvas.width !== wPx || cc.canvas.height !== hPx) {
      cc.canvas.width = wPx;
      cc.canvas.height = hPx;
    }
    cc.canvas.style.width = lebar + 'px';
    cc.canvas.style.height = H + 'px';
    cc.setTransform(dpr, 0, 0, dpr, 0, 0);
    cc.fillStyle = '#ffffff';
    cc.fillRect(0, 0, lebar, H);

    head.forEach(hd => {
      if (hd.c1 >= batas) { return; }
      const x = xOf[hd.c0], w = xOf[hd.c1] + leaves[hd.c1].w - x;
      const y = hd.r0 * INS_H_HEAD, h = (hd.r1 - hd.r0 + 1) * INS_H_HEAD;
      cc.fillStyle = (hd.lines[0] === 'No' || hd.lines[0] === 'Nama' || hd.lines[0] === 'Musrif/fah'
        || (hd.r0 === 0 && hd.r1 === 3)) ? '#e8eef6' : '#f1f5f9';
      if (hd.c0 >= pokokRange[0] && hd.c1 <= pokokRange[1]) { cc.fillStyle = '#eef2f8'; }
      cc.fillRect(x, y, w, h);
      cc.strokeStyle = '#94a3b8';
      cc.lineWidth = 1;
      cc.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      cc.fillStyle = '#0f172a';
      cc.font = '600 9.5px Arial';
      cc.textAlign = 'center';
      cc.textBaseline = 'middle';
      const cy = y + h / 2;
      const lineH = INS_H_HEAD;
      const startY = cy - (hd.lines.length - 1) * lineH / 2;
      hd.lines.forEach((ln, i) => { cc.fillText(ln, x + w / 2, startY + i * lineH); });
    });

    for (let i = 0; i <= batas && i <= nC; i++) {
      const x = i < nC ? xOf[i] : totalW;
      cc.strokeStyle = '#cbd5e1';
      cc.lineWidth = 1;
      cc.beginPath();
      cc.moveTo(x + 0.5, headH);
      cc.lineTo(x + 0.5, H);
      cc.stroke();
    }

    cc.font = '11.5px Arial';
    cc.textBaseline = 'middle';
    for (let r = 0; r < nTampil; r++) {
      const y = headH + r * INS_H_ROW;
      if (r >= data.length) { cc.fillStyle = '#fcfcfd'; cc.fillRect(0, y, lebar, INS_H_ROW); }
      const b = data[r];
      for (let c = 0; c < nC && c < batas; c++) {
        const leaf = leaves[c];
        const x = xOf[c], w = leaf.w;
        if (leaf.t === 'calc') { cc.fillStyle = '#f8fafc'; cc.fillRect(x, y, w, INS_H_ROW); }
        else if (leaf.t === 'no') { cc.fillStyle = '#f8fafc'; cc.fillRect(x, y, w, INS_H_ROW); }
        const teks = r < data.length ? insSelTeks(leaf, b, r) : (leaf.t === 'no' ? String(r + 1) : '');
        if (!teks) { continue; }
        if (leaf.t === 'text') {
          cc.fillStyle = teks === '-' ? '#94a3b8' : '#0f172a';
          cc.textAlign = 'left';
          insPotong(cc, teks, x + 6, y + INS_H_ROW / 2, w - 10);
        } else if (leaf.t === 'no') {
          cc.fillStyle = '#64748b';
          cc.textAlign = 'center';
          cc.fillText(teks, x + w / 2, y + INS_H_ROW / 2);
        } else {
          cc.fillStyle = teks === '-' ? '#94a3b8' : (leaf.t === 'calc' ? '#334155' : '#0f172a');
          cc.textAlign = 'right';
          cc.fillText(teks, x + w - 6, y + INS_H_ROW / 2);
        }
      }
      cc.strokeStyle = '#e2e8f0';
      cc.lineWidth = 1;
      cc.beginPath();
      cc.moveTo(0, y + 0.5);
      cc.lineTo(lebar, y + 0.5);
      cc.stroke();
    }

    cc.strokeStyle = '#94a3b8';
    cc.lineWidth = 1;
    cc.strokeRect(0.5, 0.5, lebar - 1, H - 1);
    cc.beginPath();
    cc.moveTo(0, headH + 0.5);
    cc.lineTo(lebar, headH + 0.5);
    cc.stroke();

    if (sel.r >= 0 && sel.r < nTampil && sel.c >= 0 && sel.c < batas) {
      const x = xOf[sel.c], y = headH + sel.r * INS_H_ROW;
      cc.fillStyle = 'rgba(37,99,235,0.12)';
      cc.fillRect(x, y, leaves[sel.c].w, INS_H_ROW);
      cc.strokeStyle = '#2563eb';
      cc.lineWidth = 2;
      cc.strokeRect(x + 1, y + 1, leaves[sel.c].w - 2, INS_H_ROW - 2);
    }

    /* batas kanan kolom beku (hanya overlay): garis tegas + bayangan halus */
    if (batas < nC) {
      const g = cc.createLinearGradient(lebar - 7, 0, lebar, 0);
      g.addColorStop(0, 'rgba(15,23,42,0)');
      g.addColorStop(1, 'rgba(15,23,42,0.13)');
      cc.fillStyle = g;
      cc.fillRect(lebar - 7, 0, 7, H);
      cc.fillStyle = '#94a3b8';
      cc.fillRect(lebar - 1.5, 0, 1.5, H);
    }
  }

  function gambarBeku() {
    if (freezeN > 0) { gambarKe(ctxB, freezeW, freezeN); }
  }

  function gambar() {
    geserBeku();
    gambarKe(ctx, totalW, nC);
    gambarBeku();
  }

  /* konversi koordinat isi kanvas -> kolom, dengan memperhitungkan strip beku:
     klik pada layar x di [scrollLeft, scrollLeft+freezeW] menunjuk kolom beku di x-scrollLeft */
  function kolomDariX(cx) {
    const s = wrap.scrollLeft || 0;
    const px = (freezeW > 0 && cx >= s && cx < s + freezeW) ? (cx - s) : cx;
    let c = 0;
    while (c < nC - 1 && px >= xOf[c + 1]) { c++; }
    return c;
  }

  /* strip beku digeser sebesar scrollLeft agar selalu berada di x=0 layar */
  let sBeku = -1;
  function geserBeku() {
    const s = (freezeN > 0 ? (wrap.scrollLeft || 0) : 0);
    if (s === sBeku) { return; }
    sBeku = s;
    beku.style.left = s + 'px';
  }

  dengar('scroll', function () {
    if (freezeN <= 0) { return; }
    const s = wrap.scrollLeft || 0;
    if (s === sBeku) { return; }          // gulir vertikal saja — strip tidak berubah
    geserBeku();
    gambarBeku();
    if (editing && sel.c >= freezeN) {
      /* sel yang sedang diedit jangan sampai tergeser ke bawah strip beku */
      const x = xOf[sel.c];
      if (x < (wrap.scrollLeft || 0) + freezeW) { wrap.scrollLeft = Math.max(0, x - freezeW); return; }
    }
    if (editing) { posEdit(); }
  }, { passive: true });

  function posEdit() {
    const s = (freezeN > 0 && sel.c < freezeN) ? (wrap.scrollLeft || 0) : 0;
    inp.style.left = (xOf[sel.c] + s) + 'px';
    inp.style.top = (headH + sel.r * INS_H_ROW) + 'px';
    inp.style.width = leaves[sel.c].w + 'px';
    inp.style.height = INS_H_ROW + 'px';
  }
  function mulaiEdit(preset) {
    if (editing) { return; }
    if (sel.r < 0 || sel.c < 0) { return; }
    const leaf = leaves[sel.c];
    if (leaf.t === 'no' || leaf.t === 'calc') { return; }
    if (sel.r >= data.length) { pastikan(sel.r); gambar(); }
    const b = data[sel.r];
    editing = true;
    editR = sel.r;
    editC = sel.c;
    posEdit();
    if (preset !== undefined) { inp.value = preset; }
    else if (leaf.id === 'nama') { inp.value = String(b.nama || ((b.c && b.c.nama) || '')); }
    else { inp.value = (b.c && b.c[leaf.id] !== undefined && b.c[leaf.id] !== null) ? String(b.c[leaf.id]) : ''; }
    inp.classList.add('on');
    inp.focus();
    if (preset === undefined) { inp.select(); }
    inp.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function tutupEdit(simpan, refokus) {
    if (!editing) { return; }
    editing = false;
    inp.classList.remove('on');
    if (simpan && editR >= 0 && editR < data.length) {
      const leaf = leaves[editC];
      const b = data[editR];
      if (!b.c) { b.c = {}; }
      const v = insParse(inp.value, leaf.t);
      if (v === null || v === '') { delete b.c[leaf.id]; }
      else { b.c[leaf.id] = v; }
      if (leaf.t === 'text' && leaf.id === 'nama') { b.nama = String(v || ''); }
      tandai();
    }
    editR = -1; editC = -1;
    if (refokus !== false) { wrap.focus(); }
    gambar();
  }
  function pilih(r, c) {
    sel = { r: Math.max(0, Math.min(r, maxR())), c: Math.max(0, Math.min(c, nC - 1)) };
    gambar();
    const y = headH + sel.r * INS_H_ROW;
    const top = wrap.scrollTop, h = wrap.clientHeight;
    if (y < top) { wrap.scrollTop = y; }
    else if (y + INS_H_ROW > top + h) { wrap.scrollTop = y + INS_H_ROW - h; }
    /* kolom beku selalu terlihat di strip kiri — jangan digeser */
    if (sel.c >= freezeN) {
      const x = xOf[sel.c];
      const kiri = wrap.scrollLeft + freezeW;   // area terlihat utk kolom biasa mulai setelah strip beku
      if (x < kiri) { wrap.scrollLeft = Math.max(0, x - freezeW); }
      else if (x + leaves[sel.c].w > wrap.scrollLeft + wrap.clientWidth) { wrap.scrollLeft = x + leaves[sel.c].w - wrap.clientWidth; }
    }
  }

  dengar('mousedown', e => {
    if (e.target === inp) { return; }            // biarkan kursor dipindah di dalam input yang sedang terbuka
    if (editing) { tutupEdit(true, false); }     // simpan dulu ke sel ASAL sebelum pindah seleksi
    const rect = cv.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (my < headH) {
      pilih(sel.r >= 0 ? sel.r : 0, kolomDariX(mx));
      wrap.focus();
      return;
    }
    const r = Math.floor((my - headH) / INS_H_ROW);
    pilih(r, kolomDariX(mx));
    wrap.focus();
  });
  dengar('dblclick', e => { if (e.target === inp) { return; } mulaiEdit(); });
  dengar('keydown', e => {
    if (e.target === inp) { return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); pilih(sel.r + 1, sel.c); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); pilih(sel.r - 1, sel.c); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); pilih(sel.r, sel.c + 1); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); pilih(sel.r, sel.c - 1); return; }
    if (e.key === 'Home') { e.preventDefault(); pilih(sel.r, 0); return; }
    if (e.key === 'End') { e.preventDefault(); pilih(sel.r, nC - 1); return; }
    if (e.key === 'PageDown') { e.preventDefault(); pilih(sel.r + 10, sel.c); return; }
    if (e.key === 'PageUp') { e.preventDefault(); pilih(sel.r - 10, sel.c); return; }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); if (sel.r >= 0) { mulaiEdit(); } return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (sel.r < 0) { pilih(0, 0); return; }
      const nc = sel.c + (e.shiftKey ? -1 : 1);
      if (nc >= nC) { pilih(sel.r + 1, 0); }
      else if (nc < 0) { pilih(Math.max(0, sel.r - 1), nC - 1); }
      else { pilih(sel.r, nc); }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (sel.r < 0 || sel.r >= data.length) { return; }
      const leaf = leaves[sel.c];
      if (leaf.t === 'no' || leaf.t === 'calc') { return; }
      const b = data[sel.r];
      if (b.c) { delete b.c[leaf.id]; }
      if (leaf.id === 'nama') { b.nama = ''; }
      tandai();
      gambar();
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (sel.r < 0) { pilih(0, 0); }
      e.preventDefault();
      mulaiEdit(e.key);
    }
  });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); tutupEdit(true); pilih(sel.r + 1, sel.c); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      tutupEdit(true);
      const nc = sel.c + (e.shiftKey ? -1 : 1);
      if (nc >= nC) { pilih(sel.r + 1, 0); }
      else if (nc < 0) { pilih(Math.max(0, sel.r - 1), nC - 1); }
      else { pilih(sel.r, nc); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); tutupEdit(false); return; }
  });
  inp.addEventListener('blur', () => { tutupEdit(true, false); });

  gambar();

  return {
    data: () => data,
    redraw: gambar,
    sel: () => sel,
    fokus: () => wrap.focus(),
    tambahBaris() {
      data.push({ nama: '', c: {} });
      sel = { r: data.length - 1, c: 1 };
      tandai();
      gambar();
      pilih(data.length - 1, 1);
      wrap.focus();
    },
    ganti(baris) {
      /* ganti seluruh baris (dipakai import Excel) — menandai kotor lalu render ulang */
      data = Array.isArray(baris) ? baris : [];
      sel = { r: data.length ? 0 : -1, c: 1 };
      tandai();
      gambar();
      if (data.length) { pilih(0, 1); }
      wrap.focus();
    },
    hapusBaris() {
      if (sel.r < 0 || sel.r >= data.length) { return false; }
      data.splice(sel.r, 1);
      sel = { r: Math.min(sel.r, Math.max(data.length - 1, 0)), c: sel.c };
      tandai();
      gambar();
      return true;
    },
    isiDariGuru(guru) {
      /* isi baris BARU dari Data Guru: pokok → Pokok SMP, tunjangan → Jabatan 1 Jumlah,
         rincian → kolom tetap / slot i1–i4, potongan → Potongan Jumlah.
         Baris yang namanya sudah ada dibiarkan (tidak ditimpa). */
      let n = 0;
      const lewat = [];
      (guru || []).forEach(g => {
        if (!g || !g.aktif) { return; }
        const nm = String(g.nama || '').trim();
        if (!nm) { return; }
        if (data.some(b => String(b.nama || '').trim() === nm)) { return; }
        const row = guruKeBaris(g);
        const c = row.c;
        delete c.nowa; delete c.kelompok; delete c.aktif;
        if (row.sisa.length) { lewat.push(nm + ' (' + row.sisa.length + ')'); }
        data.push({ id: row.id, nama: nm, c });
        n++;
      });
      if (n) { tandai(); gambar(); }
      return { n, lewat };
    }
  };
}

/** Cetak grid spreadsheet (rekap insentif / data guru) — F4 landscape margin 0,3 cm */
async function cetakGrid(leaves, head, baris, judul, info, toastTeks) {
  baris = Array.isArray(baris) ? baris : [];
  if (!baris.length) { return toast('Tidak ada baris untuk dicetak', 'error'); }
  const set = (typeof GJ !== 'undefined' && GJ && GJ.profil) || {};
  const totalW = leaves.reduce((a, l) => a + l.w, 0);
  const cols = leaves.map(l => `<col style="width:${(l.w / totalW * 100).toFixed(3)}%">`).join('');
  const maxR = head.reduce((m, h) => Math.max(m, h.r1), -1) + 1;
  const headRows = [];
  for (let r = 0; r < maxR; r++) {
    const ths = head.filter(h => h.r0 === r).map(h =>
      `<th colspan="${h.c1 - h.c0 + 1}" rowspan="${h.r1 - h.r0 + 1}">${h.lines.map(esc).join('<br>')}</th>`).join('');
    headRows.push(`<tr>${ths}</tr>`);
  }
  const rows = baris.map((b, i) => {
    const tds = leaves.map(l => {
      const teks = insSelTeks(l, b, i);
      const cls = l.t === 'no' ? 'mid' : (l.t === 'text' ? 'txt' : 'num');
      const muted = teks === '-' ? ' class="muted"' : '';
      return `<td class="${cls}"${muted}>${esc(teks)}</td>`;
    }).join('');
    return `<tr>${tds}</tr>`;
  }).join('');
  const w = window.open('', '_blank');
  if (!w) { return toast('Jendela cetak diblokir browser — izinkan pop-up lalu coba lagi', 'error'); }
  const doc = w.document;
  doc.open();
  doc.write(`<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>${esc(judul)}</title>
<style>
@page { size: 330mm 215mm; margin: 0.3cm; }
html, body { margin:0; padding:0; background:#fff; }
body { font-family: Arial, Helvetica, sans-serif; font-size:6.5pt; color:#0f172a; }
.print-head { text-align:center; margin-bottom:4px; }
.print-head h2 { margin:0; font-size:12pt; }
.print-head p { margin:1px 0; font-size:7.5pt; }
table { width:100%; border-collapse:collapse; table-layout:fixed; }
th, td { border:0.5pt solid #64748b; padding:1.5px 2px; font-size:6pt; vertical-align:middle; }
thead th { background:#eef2f7 !important; font-weight:700; text-align:center; }
td.num { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
td.mid { text-align:center; }
td.txt { text-align:left; white-space:normal; word-break:break-word; }
.muted { color:#94a3b8; }
tbody tr:nth-child(even) td { background:#fafafa; }
</style></head><body>
<div class="print-head">
  <h2>${esc(set.nama_pesantren || '')}</h2>
  <p>${esc(set.alamat || '')}</p>
  <p><strong>${esc(judul)}</strong> · ${info}</p>
</div>
<table>
<colgroup>${cols}</colgroup>
<thead>${headRows.join('')}</thead>
<tbody>${rows}</tbody>
</table>
</body></html>`);
  doc.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch (e) {} }, 400);
  toast(toastTeks);
}

async function cetakRekapInsentif(periode, baris) {
  return cetakGrid(INS_LEAVES, INS_HEAD, baris,
    'REKAP INSENTIF — ' + periodeLabel(periode).toUpperCase(),
    (Array.isArray(baris) ? baris.length : 0) + ' baris · Dicetak ' + tglLabel(today()),
    'Membuka cetak rekap insentif ' + periodeLabel(periode) + ' — F4 landscape, margin 0,3 cm');
}

async function insInitTab(f) {
  const inpPer = document.getElementById('gj-ins-periode');
  const host = document.getElementById('gj-ins-host');
  const statusEl = document.getElementById('gj-ins-status');
  if (!inpPer || !host) { return; }
  let periode = f.insPeriode || (GJ.insList[0] || {}).periode || thisMonth();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periode)) { periode = thisMonth(); }
  inpPer.value = periode;
  STATE.gaji = Object.assign({}, STATE.gaji, { insPeriode: periode });
  let gridId = null;
  let kotor = false;
  let grid = null;

  const setStatus = (teks) => { if (statusEl) { statusEl.textContent = teks; } };
  const tandaiKotor = () => {
    kotor = true;
    GJ_KOTOR = true;
    const hint = host.querySelector('.ins-kosong');
    if (hint) { hint.remove(); }
    setStatus('● Belum disimpan');
  };

  async function muat(p) {
    setStatus('Memuat…');
    try {
      const d = await API.get('/api/insentif?periode=' + encodeURIComponent(p));
      if (STATE.page !== 'gaji' || STATE.gaji.tab !== 'rekap') { return; }
      gridId = (d.grid && d.grid.id) || null;
      const baris = (d.grid && Array.isArray(d.grid.baris)) ? d.grid.baris : [];
      kotor = false;
      GJ_KOTOR = false;
      host.innerHTML = '';
      grid = insBukaGrid(host, baris, tandaiKotor);
      setStatus(gridId ? 'Tersimpan' : 'Belum ada — belum disimpan');
      if (!baris.length) {
        const hint = document.createElement('div');
        hint.className = 'ins-kosong';
        hint.textContent = 'Belum ada baris — klik "📥 Import Excel", "👥 Isi dari Guru" atau "＋ Baris"';
        host.appendChild(hint);
      }
    } catch (e) { toast(e.message, 'error'); setStatus('Gagal memuat'); }
  }

  inpPer.addEventListener('change', async () => {
    const p = inpPer.value;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p)) { return toast('Periode tidak valid', 'error'); }
    if (kotor && !confirm('Perubahan belum disimpan — pindah periode dan buang perubahan?')) {
      inpPer.value = periode;
      return;
    }
    periode = p;
    STATE.gaji = Object.assign({}, STATE.gaji, { insPeriode: p });
    await muat(p);
  });

  const btnTambah = document.getElementById('gj-ins-tambah');
  if (btnTambah) {
    btnTambah.onclick = () => {
      if (!grid) { return; }
      grid.tambahBaris();
    };
  }
  const btnGuru = document.getElementById('gj-ins-guru');
  if (btnGuru) {
    btnGuru.onclick = () => {
      if (!grid) { return; }
      const r = grid.isiDariGuru(GJ.guru || []);
      if (r.n) { toast(r.n + ' baris ditambahkan dari data guru (pokok, tunjangan, insentif, potongan terisi)'); }
      else { toast('Semua guru aktif sudah ada di baris', 'error'); }
      if (r.lewat && r.lewat.length) {
        toast('Rincian melebihi slot (i1–i4): ' + r.lewat.join(', '), 'error');
      }
    };
  }
  const btnImport = document.getElementById('gj-ins-import');
  if (btnImport) {
    btnImport.onclick = () => {
      if (!grid) { return; }
      importRekap(grid, periode);
    };
  }
  const btnHapusBaris = document.getElementById('gj-ins-hapus-baris');
  if (btnHapusBaris) {
    btnHapusBaris.onclick = () => {
      if (!grid) { return; }
      if (!grid.hapusBaris()) { return toast('Pilih baris yang akan dihapus dulu (klik sel pada baris tersebut)', 'error'); }
    };
  }
  const btnSimpan = document.getElementById('gj-ins-simpan');
  if (btnSimpan) {
    btnSimpan.onclick = async () => {
      if (!grid) { return; }
      const baris = grid.data().map(b => ({ id: String(b.id || ''), nama: String(b.nama || '').trim(), c: b.c || {} }))
        .filter(b => b.nama || Object.keys(b.c).length);
      const rekapKosong = !(GJ.insList || []).length;
      btnSimpan.disabled = true;
      try {
        const r = await API.post('/api/insentif', { periode, baris });
        GJ_KOTOR = false;
        toast(r.pesan || 'Rekap insentif disimpan');
        await pageGaji();
        tawarLangkahBerikut('rekap', rekapKosong);
      } catch (e) { toast(e.message, 'error'); }
      finally { if (btnSimpan.isConnected) { btnSimpan.disabled = false; } }
    };
  }
  const btnCetak = document.getElementById('gj-ins-cetak');
  if (btnCetak) {
    btnCetak.onclick = () => {
      if (!grid) { return; }
      cetakRekapInsentif(periode, grid.data());
    };
  }
  const btnHapus = document.getElementById('gj-ins-hapus');
  if (btnHapus) {
    btnHapus.onclick = async () => {
      if (!gridId) { return toast('Periode ini belum tersimpan', 'error'); }
      if (!confirm('Hapus seluruh rekap insentif ' + periodeLabel(periode) + '?')) { return; }
      btnHapus.disabled = true;
      try {
        await API.del('/api/insentif?id=' + encodeURIComponent(gridId));
        toast('Rekap insentif dihapus');
        GJ.insList = (GJ.insList || []).filter(x => x.id !== gridId);
        const tabN = document.querySelector('[data-gj-tab="rekap"] .tab-n');
        if (tabN) { tabN.textContent = '(' + GJ.insList.length + ')'; }
        const tabRekap = document.querySelector('[data-gj-tab="rekap"] .tab-step');
        if (tabRekap && !GJ.insList.length) { tabRekap.classList.remove('ok'); tabRekap.textContent = '1'; }
        gridId = null;
        await muat(periode);
      } catch (e) { toast(e.message, 'error'); }
      finally { if (btnHapus.isConnected) { btnHapus.disabled = false; } }
    };
  }

  await muat(periode);
  if (grid) { grid.fokus(); }
}

/* ---------- tab Data Guru & Karyawan — kanvas 48 kolom editable (upsert) ---------- */
function guruInitTab(f, tampil) {
  const host = document.getElementById('gj-guru-host');
  const statusEl = document.getElementById('gj-guru-status');
  if (!host) { return; }
  let grid = null;
  let kotor = false;

  const setStatus = (teks) => { if (statusEl) { statusEl.textContent = teks; } };
  const tandaiKotor = () => {
    kotor = true;
    GJ_KOTOR = true;
    const hint = host.querySelector('.ins-kosong');
    if (hint) { hint.remove(); }
    setStatus('● Belum disimpan');
  };

  const rows = (tampil || []).map(g => guruKeBaris(g));
  host.innerHTML = '';
  grid = insBukaGrid(host, rows, tandaiKotor, { leaves: GRU_LEAVES, head: GRU_HEAD, pokokRange: [5, 10] });
  kotor = false;
  GJ_KOTOR = false;
  setStatus('Tersimpan');
  if (!rows.length) {
    const hint = document.createElement('div');
    hint.className = 'ins-kosong';
    hint.textContent = (f.q || f.kelompok)
      ? 'Tidak ada guru pada filter ini'
      : 'Belum ada data guru — klik "➕ Tambah Guru" atau "📥 Import Excel"';
    host.appendChild(hint);
  }

  const btnTambahBaris = document.getElementById('gj-guru-tambah-baris');
  if (btnTambahBaris) { btnTambahBaris.onclick = () => { if (grid) { grid.tambahBaris(); } }; }

  const btnHapusBaris = document.getElementById('gj-guru-hapus-baris');
  if (btnHapusBaris) {
    btnHapusBaris.onclick = async () => {
      if (!grid) { return; }
      const s = grid.sel();
      const baris = grid.data();
      if (s.r < 0 || s.r >= baris.length) { return toast('Pilih baris yang akan dihapus dulu (klik sel pada baris tersebut)', 'error'); }
      const b = baris[s.r];
      if (b.id) {
        if (!confirm(`Hapus data "${b.nama || ''}"?${kotor ? '\n\n⚠ Perubahan kanvas yang belum disimpan ikut terbuang.' : ''}\n\nRiwayat slip gaji yang sudah dibayar tetap tersimpan.`)) { return; }
        try {
          await API.del('/api/guru?id=' + encodeURIComponent(b.id));
          GJ_KOTOR = false;
          toast('Data guru dihapus');
          await pageGaji();
        } catch (e) { toast(e.message, 'error'); }
        return;
      }
      grid.hapusBaris();
    };
  }

  const btnImport = document.getElementById('gj-guru-import');
  if (btnImport) { btnImport.onclick = () => { if (!gajiBolehPindah()) { return; } importGuru(); }; }

  const btnTambah = document.getElementById('gj-guru-tambah');
  if (btnTambah) { btnTambah.onclick = () => { if (!gajiBolehPindah()) { return; } modalGuru(null); }; }

  const btnCetak = document.getElementById('gj-guru-cetak');
  if (btnCetak) {
    btnCetak.onclick = () => {
      if (!grid) { return; }
      const info = grid.data().length + ' orang · Dicetak ' + tglLabel(today())
        + (f.q ? ' · hasil pencarian "' + f.q + '"' : '');
      cetakGrid(GRU_LEAVES, GRU_HEAD, grid.data(), 'DATA GURU & KARYAWAN', info,
        'Membuka cetak data guru — F4 landscape, margin 0,3 cm');
    };
  }

  const btnSimpan = document.getElementById('gj-guru-simpan');
  if (btnSimpan) {
    btnSimpan.onclick = async () => {
      if (!grid) { return; }
      const semua = grid.data();
      const baris = semua.map(b => ({
        id: String(b.id || ''),
        nama: String(b.nama || '').trim(),
        c: b.c || {},
        sisa: Array.isArray(b.sisa) ? b.sisa : []
      })).filter(b => b.nama);
      const tanpaNama = semua.filter(b => !String(b.nama || '').trim() && (b.id || Object.keys(b.c || {}).length)).length;
      if (!baris.length) { return toast('Belum ada baris dengan nama yang bisa disimpan', 'error'); }
      const guruKosong = !(GJ.guru || []).length;
      btnSimpan.disabled = true;
      try {
        const r = await API.post('/api/guru?act=baris', { baris });
        GJ_KOTOR = false;
        toast((r.pesan || 'Data guru disimpan') + (tanpaNama ? ' · ' + tanpaNama + ' baris tanpa nama dilewati' : ''));
        await pageGaji();
        tawarLangkahBerikut('guru', guruKosong);
      } catch (e) { toast(e.message, 'error'); }
      finally { if (btnSimpan.isConnected) { btnSimpan.disabled = false; } }
    };
  }
}

/* ---------- modal pilih guru → slip (pintasan dari daftar periode) ---------- */
async function pilihSlip(b) {
  let batch = null;
  try { batch = (await API.get('/api/gaji?id=' + encodeURIComponent(b.id))).batch; }
  catch (e) { return toast(e.message, 'error'); }
  const items = (batch.items || []).filter(Boolean);
  if (!items.length) { return toast('Tidak ada slip pada periode ini', 'error'); }
  openModal('🖨️ Slip Gaji — ' + periodeLabel(batch.periode), `
    <p class="hint" style="margin-bottom:10px">No. ${esc(batch.no_bkk || '-')} · ${esc([batch.akun, batch.sumber_dana].filter(Boolean).join(' ← '))} · <strong>${items.length} orang</strong> — klik tombol pada baris untuk membuka slip siap cetak / unduh JPG / kirim WhatsApp.</p>
    <div class="table-wrap"><table>
      <thead><tr><th class="num" style="width:44px">No</th><th>Nama</th><th>Jabatan</th><th class="num">Total</th><th>Status</th><th></th></tr></thead>
      <tbody>${items.map((it, i) => `
        <tr>
          <td class="num muted">${i + 1}</td>
          <td><strong>${esc(it.nama || '-')}</strong></td>
          <td class="muted">${esc(it.jabatan || '-')}</td>
          <td class="num">${fmt(Number(it.total) || 0)}</td>
          <td class="nowrap"><span class="badge ${it.ttd ? 'cash' : 'bank'}">✍️ ${it.ttd ? 'sudah' : 'belum'}</span>${it.wa ? ' <span class="badge cash">📱</span>' : ''}</td>
          <td class="nowrap"><button class="btn btn-sm" data-pslip="${i}">🖨️ Slip</button></td>
        </tr>`).join('')}</tbody>
    </table></div>`,
    `<button class="btn btn-primary" id="ps-cetak-semua">🖨️ Cetak Semua Slip</button>
     <button class="btn" onclick="closeModal()">Tutup</button>`, 780);
  $$('#modalBody [data-pslip]').forEach(el => {
    el.onclick = () => { const it = items[Number(el.dataset.pslip)]; if (it) { bukaSlip(batch, it); } };
  });
  $('#ps-cetak-semua').onclick = () => cetakSlipSemua(batch);
}

/** Buka PDF rincian gaji (1 baris per guru + pemisah kelompok) di tab baru */
function unduhPdfGaji(b) {
  const id = String((b && b.id) || '');
  if (!id) { return toast('Periode gaji tidak ditemukan', 'error'); }
  const w = window.open(apiUrl('/api/gaji?id=' + encodeURIComponent(id) + '&act=pdf'), '_blank');
  if (!w) { return toast('Jendela unduhan diblokir browser — izinkan pop-up lalu coba lagi', 'error'); }
  toast('Membuka PDF rincian gaji…');
}

/* ---------- import Excel / CSV guru & karyawan ---------- */
function headerGuru() {
  const customJenis = (GJ.jenis || []).map(j => j.nama);
  if (!customJenis.length) customJenis.push('Insentif Tahfidz');
  return ['No', 'Nama', 'Jabatan', 'Kelompok', 'No WA', 'Gaji Pokok', 'Volume Pokok', 'Tunjangan', 'Volume Tunjangan', ...customJenis, 'Potongan', 'Volume Potongan', 'Status'];
}
function unduhTemplateGuru() {
  downloadCsv('template-import-guru.csv', [
    headerGuru(),
    [1, 'Ust. Ahmad Fauzi', 'Guru Tahfidz', '081234567890', 3000000, 1, 300000, 1, 500000, 0, '', 'aktif']
  ]);
}
function importGuru() {
  let parsed = [];
  openModal('📥 Import Data Guru & Karyawan dari Excel', `
    <p class="hint">Header kolom baris pertama harus cocok: <em>Nama, Jabatan, No WA, Gaji Pokok, Volume Pokok, Tunjangan, Volume Tunjangan, Potongan, Volume Potongan, Status (aktif/nonaktif)</em>. Satuan = harga per satuan (Rp); kosongkan Volume bila kolom Nominal sudah berupa jumlah total (Jumlah = Volume × Satuan). Kolom lain yang bernilai angka otomatis dijadikan master <strong>Jenis Insentif</strong> (mis. <em>Insentif Tahfidz, Bonus Kegiatan</em>).</p>
    <div class="flex wrap-actions" style="margin-top:12px">
      <button class="btn" id="im-g-tpl">⬇ Template CSV</button>
      <label class="btn btn-primary" style="cursor:pointer">📥 Pilih File (.xlsx / .csv)<input type="file" id="im-g-file" accept=".xlsx,.xls,.csv" hidden></label>
    </div>
    <label class="flex" style="margin-top:14px;gap:8px;cursor:pointer">
      <input type="checkbox" id="im-g-ovr" checked> Perbarui data guru jika nama sudah ada
    </label>
    <div id="im-g-prev" class="mt"></div>`,
    `<button class="btn" onclick="closeModal()">Tutup</button><button class="btn btn-gold" id="im-g-go" disabled>📥 Import Sekarang</button>`, 760);

  $('#im-g-tpl').onclick = () => unduhTemplateGuru();
  $('#im-g-file').onchange = async (e) => {
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
      $('#im-g-go').disabled = !parsed.length;
      if (!parsed.length) { $('#im-g-prev').innerHTML = '<p class="muted">Tidak ada baris terbaca.</p>'; return; }
      const heads = Object.keys(parsed[0]);
      $('#im-g-prev').innerHTML = `
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
  $('#im-g-go').onclick = async () => {
    if (!parsed.length) return;
    const btn = $('#im-g-go'); btn.disabled = true;
    const guruKosong = !(GJ.guru || []).length;
    try {
      const r = await API.post('/api/guru?act=import', { rows: parsed, overwrite: $('#im-g-ovr').checked });
      toast(r.pesan);
      closeModal();
      await pageGaji();
      if (guruKosong) { tawarLangkahBerikut('guru', true); }
    } catch (e) { toast(e.message, 'error'); }
    finally { if (btn.isConnected) btn.disabled = false; }
  };
}

/* ---------- alur langkah gaji: tawarkan pindah ke langkah berikutnya saat langkah baru saja terisi pertama kali ---------- */
function tawarLangkahBerikut(setelah, baruTerisi) {
  /* urut sesuai alur: Rekap → Data Guru → Jenis Insentif → Pembayaran Gaji */
  const langkah = [
    { id: 'rekap', nama: 'Rekap Insentif', ada: () => (GJ.insList || []).length > 0 },
    { id: 'guru', nama: 'Data Guru & Karyawan', ada: () => (GJ.guru || []).length > 0 },
    { id: 'insentif', nama: 'Jenis Insentif', ada: () => (GJ.jenis || []).length > 0 },
    { id: 'bayar', nama: 'Pembayaran Gaji', ada: () => true },
  ];
  const i = langkah.findIndex(l => l.id === setelah);
  if (i < 0 || !baruTerisi) { return; }                 /* hanya saat langkah ini tadinya kosong lalu baru terisi */
  /* lompati langkah berikutnya yang sudah terisi → tawarkan yang pertama masih kosong (atau Pembayaran Gaji bila semua terisi) */
  let next = null;
  for (let j = i + 1; j < langkah.length; j++) {
    if (langkah[j].id === 'bayar') { next = (langkah[0].ada() && langkah[1].ada() && langkah[2].ada()) ? langkah[j] : null; break; }
    if (!langkah[j].ada()) { next = langkah[j]; break; }
  }
  if (!next) { return; }
  if (confirm(`✔ Langkah "${langkah[i].nama}" sudah terisi.\n\nLanjut ke ${next.id === 'bayar' ? 'menu' : 'langkah berikutnya'} — ${next.nama}?`)) {
    STATE.gaji = Object.assign({}, STATE.gaji, { tab: next.id, detail: '' });
    pageGaji();
    window.scrollTo(0, 0);
  }
}

/* ---------- halaman utama ---------- */
async function pageGaji() {
  GJ_KOTOR = false;
  const f = Object.assign({ q: '', detail: '', tab: 'rekap', kelompok: '', insPeriode: '' }, STATE.gaji);
  STATE.gaji = f;
  const qs = f.q ? '?q=' + encodeURIComponent(f.q) : '';
  const [gr, gj, akun, set, jns, det, ins] = await Promise.all([
    API.get('/api/guru' + qs),
    API.get('/api/gaji'),
    API.get('/api/akun'),
    API.get('/api/pengaturan'),
    API.get('/api/jenis-insentif').then(d => d.list || []).catch(() => []),
    f.detail ? API.get('/api/gaji?id=' + encodeURIComponent(f.detail)).then(d => d.batch).catch(e => { toast(e.message, 'error'); return null; })
             : Promise.resolve(null),
    API.get('/api/insentif').then(d => d.list || []).catch(() => [])
  ]);
  if (STATE.page !== 'gaji') { return; }
  if (f.detail && !det) {   /* batch sudah dihapus di tab lain → kembali ke daftar */
    STATE.gaji = { q: f.q, tab: f.tab, kelompok: f.kelompok || '' };
    return pageGaji();
  }
  GJ = { list: gj.list || [], setelan: gj.setelan || {}, guru: gr.list || [], jenis: jns, akun, profil: set, batch: det, insList: ins };

  const totalSemua = GJ.list.reduce((a, b) => a + (Number(b.total) || 0), 0);
  const jmlSlip = GJ.list.reduce((a, b) => a + (Number(b.jumlah) || 0), 0);
  const jmlTtd = GJ.list.reduce((a, b) => a + (Number(b.ttd) || 0), 0);
  const guruAktif = GJ.guru.filter(g => g.aktif).length;

  const stats = `
    <div class="grid grid-4">
      <div class="stat iuran"><div class="stat-ico">👥</div><div class="stat-label">Guru & Karyawan Aktif</div><div class="stat-value">${guruAktif}</div><div class="stat-sub">${GJ.guru.length} terdaftar</div></div>
      <div class="stat masuk"><div class="stat-ico">📅</div><div class="stat-label">Periode Dibayar</div><div class="stat-value">${GJ.list.length}</div><div class="stat-sub">${jmlSlip} slip gaji</div></div>
      <div class="stat keluar"><div class="stat-ico">💸</div><div class="stat-label">Total Pembayaran Gaji</div><div class="stat-value" style="font-size:19px">${fmt(totalSemua)}</div><div class="stat-sub">seluruh periode</div></div>
      <div class="stat saldo"><div class="stat-ico">✍️</div><div class="stat-label">Sudah Tanda Tangan</div><div class="stat-value">${jmlTtd}<span style="font-size:14px">/${jmlSlip}</span></div><div class="stat-sub">penerimaan slip</div></div>
    </div>`;

  if (f.detail && det) {
    /* ===== detail 1 periode: slip per orang ===== */
    const b = det;
    const draf = b.status === 'draf';
    $('#content').innerHTML = `
    <div class="print-head">
      <h2>${esc(set.nama_pesantren)}</h2>
      <p>${esc(set.alamat)}</p>
      <p><strong>SLIP GAJI ${periodeLabel(b.periode).toUpperCase()}</strong> — ${draf ? '<strong style="color:#b45309">DRAF · belum dibayar</strong>' : 'No. ' + esc(b.no_bkk)} · ${tglPanjang(b.tanggal)}</p>
      <p>${esc(b.akun)} ← ${esc(b.sumber_dana)} · ${esc(b.jenis_transaksi)} · ${b.jumlah} orang · <strong>${fmt(b.total)}</strong></p>
    </div>

    ${draf ? `<div class="card no-print" style="border-color:#fcd34d;background:#fffbeb">
      <div class="card-pad flex" style="gap:10px;align-items:center;flex-wrap:wrap">
        <span class="badge bank">📝 DRAF</span>
        <span>Belum ada <strong>No. BKK</strong> &amp; <strong>jurnal kas</strong> — slip boleh dicetak/dikirim dulu, klik <strong>✔ Bayar Sekarang</strong> saat siap menerbitkan.</span>
      </div>
    </div>` : ''}

    <div class="card no-print">
      <div class="card-pad flex" style="justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <div class="flex" style="gap:8px;flex-wrap:wrap">
          <button class="btn" id="gj-back">← Daftar Pembayaran</button>
          <button class="btn" id="gj-cetak-semua" title="Cetak seluruh slip periode ini dalam satu sesi">🖨️ Cetak Semua Slip</button>
          <button class="btn" id="gj-pdf" title="Unduh PDF rincian gaji — 1 baris per guru">⬇ PDF Rincian</button>
          ${draf ? `<button class="btn btn-primary" id="gj-bayar-draf" title="Terbitkan No. BKK &amp; jurnal kas periode ini">✔ Bayar Sekarang</button>` : ''}
        </div>
        <span class="muted">${esc(b.keterangan || '')} · ✍️ ${b.ttd}/${b.jumlah} sudah tanda tangan · 📱 ${b.wa}/${b.jumlah} dikirim via WA</span>
      </div>
    </div>

    <div class="card mt">
      <div class="card-head"><h3>Daftar Slip Gaji (${b.items.length})</h3><span class="muted">klik <strong>Slip</strong> — cetak JPG, kirim WhatsApp atau salin link tanda tangan</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th class="num">NO</th><th>Nama</th><th class="num">Pokok</th><th class="num">Tunjangan</th><th class="num">Insentif</th><th class="num">Potongan</th><th class="num">Total</th><th>Status</th><th class="tbl-aksi"></th></tr></thead>
        <tbody>${b.items.map((it, i) => `
          <tr>
            <td class="num muted">${i + 1}</td>
            <td><strong>${esc(it.nama)}</strong>${it.jabatan ? `<br><span class="muted" style="font-size:11.5px">${esc(it.jabatan)}</span>` : ''}</td>
            <td class="num"${volTitle(it.gaji_pokok_vol, it.gaji_pokok)}>${fmt(jmlKomp(it.gaji_pokok, it.gaji_pokok_vol))}</td>
            <td class="num"${volTitle(it.tunjangan_vol, it.tunjangan)}>${fmt(jmlKomp(it.tunjangan, it.tunjangan_vol))}</td>
            <td class="num" ${(Array.isArray(it.insentif_rinci) && it.insentif_rinci.length) ? `title="${esc(it.insentif_rinci.map(e => (e.nama || 'Insentif') + ': ' + fmt(jmlKomp(e.nominal, e.volume)) + (Number(e.volume) > 0 ? ` (${volTeks(e.volume, e.nominal)})` : '')).join(' • '))}"` : ''}>${fmt(it.insentif)}</td>
            <td class="num"${volTitle(it.potongan_vol, it.potongan)}>${fmt(jmlKomp(it.potongan, it.potongan_vol))}</td>
            <td class="num neg">${fmt(it.total)}</td>
            <td class="nowrap">
              ${it.ttd ? '<span class="badge cash">✍️ ditandatangani</span>' : '<span class="badge bank">⏳ belum ttd</span>'}
              ${it.wa ? ' <span class="badge cash">📱 WA</span>' : ''}
            </td>
            <td class="nowrap tbl-aksi"><button class="btn btn-sm" data-gj-slip="${i}">🖨️ Slip</button></td>
          </tr>`).join('')}</tbody>
        <tfoot><tr style="background:#f8fafc">
          <td colspan="6"><strong>Total ${b.items.length} orang</strong></td>
          <td class="num"><strong class="neg">${fmt(b.total)}</strong></td>
          <td colspan="2"></td>
        </tr></tfoot>
      </table></div>
    </div>`;

    $('#gj-back').onclick = () => { STATE.gaji = { q: f.q, tab: f.tab, kelompok: f.kelompok || '' }; pageGaji(); };
    $('#gj-cetak-semua').onclick = () => cetakSlipSemua(b);
    const pdfBtn = $('#gj-pdf');
    if (pdfBtn) { pdfBtn.onclick = () => unduhPdfGaji(b); }
    const bayarDraf = $('#gj-bayar-draf');
    if (bayarDraf) { bayarDraf.onclick = () => modalBayar({ editDraf: b.id }); }
    $$('[data-gj-slip]').forEach(el => {
      el.onclick = () => {
        const it = b.items[Number(el.dataset.gjSlip)];
        if (it) { bukaSlip(b, it); }
      };
    });
    window.scrollTo(0, 0);
    return;
  }

  /* ===== daftar pembayaran + data guru ===== */
  const barisBatch = GJ.list.map(b => {
    const draf = b.status === 'draf';
    return `
    <tr${draf ? ' style="background:#fffdf5"' : ''}>
      <td><strong>${periodeLabel(b.periode)}</strong></td>
      <td class="nowrap">${tglLabel(b.tanggal)}</td>
      <td class="nowrap">${draf ? '<span class="muted">—</span>' : esc(b.no_bkk)}</td>
      <td>${esc(b.akun)}</td>
      <td>${esc(b.sumber_dana)}</td>
      <td class="num">${b.jumlah}</td>
      <td class="num neg">${fmt(b.total)}</td>
      <td class="nowrap">${draf ? '<span class="badge bank">📝 DRAF</span> ' : '<span class="badge cash">✔ lunas</span> '}<span class="badge ${b.ttd === b.jumlah && b.jumlah > 0 ? 'cash' : 'bank'}">✍️ ${b.ttd}/${b.jumlah}</span>${b.wa ? ` <span class="badge cash">📱 ${b.wa}</span>` : ''}</td>
      <td class="nowrap tbl-aksi">
        <button class="btn btn-sm" data-gj-detail="${esc(b.id)}">👁️ Detail</button>
        ${draf ? `<button class="btn btn-sm btn-primary" data-gj-bayar="${esc(b.id)}" title="Terbitkan No. BKK &amp; jurnal kas periode ini">✔ Bayar</button>` : ''}
        <button class="btn btn-sm" data-gj-cetak="${esc(b.id)}" title="Pilih guru lalu cetak slip periode ini">🖨️ Slip</button>
        <button class="btn btn-sm" data-gj-pdf="${esc(b.id)}" title="Unduh PDF rincian gaji — 1 baris per guru">⬇</button>
        <button class="btn btn-sm" data-gj-salin="${esc(b.id)}" title="Salin isi periode ini ke form bayar bulan berikutnya">📋</button>
        <button class="btn btn-sm" data-gj-hapus="${esc(b.id)}">🗑️</button>
      </td>
    </tr>`; }).join('');

  const cardBayar = `
    <div class="card no-print">
      <div class="card-head"><h3>💵 Pembayaran Gaji Per Periode</h3><span class="muted">satu periode = <strong>satu nomor BKK</strong> → jurnal kas keluar otomatis (jurnal kas tetap bisa disunting dari menu Jurnal Kas)</span></div>
      <div class="card-pad">
        <button class="btn btn-primary" id="gj-bayar">💵 Bayar Gaji Periode…</button>
      </div>
      ${GJ.list.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>Periode</th><th>Tanggal</th><th>No BKK</th><th>Akun Pengeluaran</th><th>Sumber Dana</th><th class="num">Orang</th><th class="num">Total</th><th>Status</th><th></th></tr></thead>
        <tbody>${barisBatch}</tbody>
      </table></div>` : `
      <div class="empty"><div class="empty-ico">💼</div><p>Belum ada pembayaran gaji. Tambahkan data guru lalu klik <strong>Bayar Gaji Periode</strong>.</p></div>`}
    </div>`;

  const cardInsentif = `
    <div class="card no-print">
      <div class="card-head"><h3>🎯 Jenis Insentif (${GJ.jenis.length})</h3>
        <span class="muted">nama rincian dari Rekap &amp; Data Guru <strong>otomatis terbuat</strong> jadi master — nama jenis = kolom di form bayar &amp; baris rincian di slip gaji — <strong>Akun Pemasukan</strong> = kas yang ditarik saat bayar (jurnal dipecah per akun)</span></div>
      <div class="card-pad flex" style="gap:8px;flex-wrap:wrap;align-items:flex-end">
        <div class="field grow" style="min-width:220px"><label>Jenis baru</label>
          <input id="gj-ji-nama" placeholder="mis. Insentif Tahfidz / Bonus Kegiatan" autocomplete="off"></div>
        <div class="field" style="min-width:210px"><label>Akun Pemasukan</label>
          <select id="gj-ji-akun">${selAkunPemasukan('')}</select></div>
        <button class="btn btn-primary" id="gj-ji-tambah">＋ Tambah Jenis</button>
      </div>
      ${GJ.jenis.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th class="num">NO</th><th>Nama Jenis</th><th>Akun Pemasukan</th><th>Status</th><th></th></tr></thead>
        <tbody>${GJ.jenis.map((j, i) => `
          <tr ${j.aktif ? '' : 'style="opacity:.55"'}>
            <td class="num muted">${i + 1}</td>
            <td><input class="gj-ji-nama" data-id="${esc(j.id)}" value="${esc(j.nama)}" autocomplete="off" style="width:100%"></td>
            <td><select class="gj-ji-akun" data-id="${esc(j.id)}" style="width:100%">${selAkunPemasukan(j.akun_pemasukan || '')}</select></td>
            <td><label class="flex" style="gap:6px;cursor:pointer"><input type="checkbox" class="gj-ji-aktif" data-id="${esc(j.id)}" ${j.aktif ? 'checked' : ''}> <span>${j.aktif ? 'aktif' : 'nonaktif'}</span></label></td>
            <td class="nowrap"><button class="btn btn-sm" data-ji-hapus="${esc(j.id)}">🗑️</button></td>
          </tr>`).join('')}</tbody>
      </table></div>` : `
      <div class="empty"><div class="empty-ico">🎯</div><p>Belum ada jenis insentif. Tambahkan nama kolom (mis. <strong>Insentif Tahfidz</strong>) — kolomnya otomatis muncul di form bayar gaji.</p></div>`}
    </div>`;

  /* submenu kelompok: satu tombol per kelompok (urut daftar bawaan, lalu sisanya) — menyaring kanvas guru */
  const semuaGuru = GJ.guru;
  const hitungKel = {};
  semuaGuru.forEach(g => { const k = String(g.kelompok || '').trim(); hitungKel[k] = (hitungKel[k] || 0) + 1; });
  const kelUrut = KELOMPOK.filter(k => hitungKel[k]);
  Object.keys(hitungKel).filter(k => k && !KELOMPOK.includes(k)).sort((a, b) => a.localeCompare(b)).forEach(k => kelUrut.push(k));
  const adaKosong = !!hitungKel[''];
  const fKel = String(f.kelompok || '');
  const tampil = fKel === '' ? semuaGuru
    : fKel === '__kosong__' ? semuaGuru.filter(g => !String(g.kelompok || '').trim())
    : semuaGuru.filter(g => String(g.kelompok || '').trim() === fKel);
  const tombolKel = (label, val, n) => `<button type="button" class="tab${fKel === val ? ' on' : ''}" data-gj-kel="${esc(val)}">${label} <span style="opacity:.75">(${n})</span></button>`;
  const submenuKel = (kelUrut.length || adaKosong) ? `
      <div class="card-pad" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding-top:0;padding-bottom:4px">
        ${tombolKel('Semua', '', semuaGuru.length)}
        ${kelUrut.map(k => tombolKel(esc(k), k, hitungKel[k])).join('')}
        ${adaKosong ? tombolKel('Tanpa Kelompok', '__kosong__', hitungKel['']) : ''}
      </div>` : '';

  const cardGuru = `
    <div class="card no-print">
      <div class="card-head"><h3>👥 Data Guru & Karyawan (${fKel ? tampil.length + ' dari ' + semuaGuru.length : semuaGuru.length})</h3>
        <span class="muted">kanvas 48 kolom (No WA, Kelompok, Status + 45 kolom komponen gaji) — terisi otomatis saat Rekap disimpan; klik sel lalu ketik untuk mengedit, lalu <strong>💾 Simpan</strong> (nama baru = tambah guru)</span></div>
      ${submenuKel}
      <div class="card-pad flex" style="gap:8px;flex-wrap:wrap;align-items:flex-end">
        <div class="field grow" style="min-width:200px"><label>Cari</label><input id="gj-cari" value="${esc(f.q)}" placeholder="nama / jabatan / no. WA" autocomplete="off"></div>
        <button class="btn" id="gj-cari-btn">🔍 Cari</button>
        ${f.q ? '<button class="btn" id="gj-cari-reset">Reset</button>' : ''}
        <span class="grow"></span>
        <span class="muted" id="gj-guru-status" style="font-size:12px">…</span>
        <button class="btn" id="gj-guru-import">📥 Import Excel</button>
        <button class="btn" id="gj-guru-cetak" title="Cetak kanvas data guru — F4 landscape, margin 0,3 cm">🖨️ Cetak</button>
        <button class="btn" id="gj-guru-tambah-baris">＋ Baris</button>
        <button class="btn" id="gj-guru-hapus-baris" title="Hapus baris yang sedang dipilih">✕ Hapus Baris</button>
        <button class="btn" id="gj-guru-tambah">➕ Tambah Guru</button>
        <button class="btn btn-primary" id="gj-guru-simpan">💾 Simpan</button>
      </div>
      <div id="gj-guru-host" class="ins-host"></div>
    </div>`;

  const cardRekap = `
    <div class="card no-print">
      <div class="card-head"><h3>📋 Rekap Insentif Bulanan</h3>
        <span class="muted">spreadsheet 45 kolom sesuai format PDF — import Excel / isi dari data guru, klik sel lalu ketik untuk mengedit (Tab/Enter pindah, Esc batal), sel abu-abu = hasil hitung otomatis; saat <strong>💾 Simpan</strong> data otomatis tersinkron ke Data Guru &amp; nama rincian jadi master Jenis Insentif</span></div>
      <div class="card-pad flex" style="gap:8px;flex-wrap:wrap;align-items:flex-end">
        <div class="field" style="min-width:150px"><label>Periode</label>
          <input type="month" id="gj-ins-periode" value="${esc(f.insPeriode || '')}"></div>
        <button class="btn" id="gj-ins-guru" title="Tambahkan baris untuk tiap guru aktif (nama, pokok, tunjangan, insentif rinci, potongan)">👥 Isi dari Guru</button>
        <button class="btn" id="gj-ins-import" title="Import Excel 45 kolom sesuai format PDF">📥 Import Excel</button>
        <button class="btn" id="gj-ins-tambah">＋ Baris</button>
        <button class="btn" id="gj-ins-hapus-baris" title="Hapus baris yang sedang dipilih">✕ Hapus Baris</button>
        <span class="grow"></span>
        <span class="muted" id="gj-ins-status" style="font-size:12px">…</span>
        <button class="btn" id="gj-ins-cetak" title="Cetak F4 landscape, margin 0,3 cm">🖨️ Cetak F4</button>
        <button class="btn" id="gj-ins-hapus" title="Hapus rekap periode ini">🗑️</button>
        <button class="btn btn-primary" id="gj-ins-simpan">💾 Simpan</button>
      </div>
      <div id="gj-ins-host" class="ins-host"></div>
    </div>`;

  /* sub-menu gaji — ALUR 3 LANGKAH berurutan: Rekap Insentif → Data Guru → Jenis Insentif (hanya bagian aktif dirender) */
  const langkahGaji = [
    { id: 'rekap', ico: '📋', label: 'Rekap Insentif', n: (GJ.insList || []).length, done: (GJ.insList || []).length > 0,
      teks: 'pilih bulan → <strong>📥 Import Excel</strong> 45 kolom (format PDF) atau <strong>👥 Isi dari Guru</strong> / <strong>＋ Baris</strong> → edit sel (Tab/Enter pindah, Esc batal) → <strong>💾 Simpan</strong> — saat disimpan data <strong>otomatis tersinkron ke Data Guru</strong> &amp; nama rincian otomatis jadi master Jenis Insentif' },
    { id: 'guru', ico: '👥', label: 'Data Guru & Karyawan', n: GJ.guru.length, done: GJ.guru.length > 0,
      teks: 'terisi <strong>otomatis saat Rekap disimpan</strong> — edit langsung di kanvas 48 kolom (pokok, tunjangan, insentif, potongan, No WA, Kelompok, Status) → <strong>💾 Simpan</strong>; nama baru = tambah guru' },
    { id: 'insentif', ico: '🎯', label: 'Jenis Insentif', n: GJ.jenis.length, done: GJ.jenis.length > 0,
      teks: 'nama rincian dari Rekap <strong>otomatis terbuat</strong> jadi master jenis — tinggal atur <strong>Akun Pemasukan</strong> per jenis (kas yang ditarik saat bayar)' },
  ];
  const tabDefs = [
    ...langkahGaji.map((l, i) => Object.assign({}, l, { step: i + 1 })),
    { id: 'bayar', ico: '💵', label: 'Pembayaran Gaji', n: GJ.list.length },
  ];
  const tabsHtml = `<div class="tabs no-print" style="margin-top:14px">${tabDefs.map((t, i) => {
    const badge = t.step ? `<span class="tab-step${t.done ? ' ok' : ''}">${t.done ? '✓' : t.step}</span>` : '';
    const nx = tabDefs[i + 1];
    const panah = t.step && nx && (nx.step === t.step + 1 || (nx.id === 'bayar' && t.step === 3)) ? '<span class="tab-arrow">→</span>' : '';
    return `<button type="button" class="tab${f.tab === t.id ? ' on' : ''}" data-gj-tab="${t.id}">${badge}${t.ico} ${t.label} <span class="tab-n" style="opacity:.75">(${t.n})</span></button>${panah}`;
  }).join('')}</div>`;

  /* panduan langkah — hanya pada tab alur (guru/insentif/rekap), tidak di detail & tab bayar */
  const idxLangkah = langkahGaji.findIndex(l => l.id === f.tab);
  const panduanHtml = idxLangkah >= 0 ? (() => {
    const cur = langkahGaji[idxLangkah];
    const prev = idxLangkah > 0 ? langkahGaji[idxLangkah - 1] : null;
    const next = idxLangkah < langkahGaji.length - 1 ? langkahGaji[idxLangkah + 1] : null;
    const kurang = cur.done ? '' : ' <em style="color:#b45309;font-weight:700">— belum ada data</em>';
    return `
      <div class="gj-panduan no-print">
        <span class="gj-panduan-step">Langkah ${idxLangkah + 1} / 3</span>
        <span style="flex:1;min-width:260px"><strong>${cur.ico} ${cur.label}</strong> — ${cur.teks}${kurang}</span>
        <span class="gj-panduan-aksi">
          ${prev ? `<button type="button" class="btn btn-sm" data-gj-tab="${prev.id}">← ${prev.ico} ${prev.label}</button>` : ''}
          ${next
            ? `<button type="button" class="btn btn-sm btn-primary" data-gj-tab="${next.id}">Lanjut: ${next.ico} ${next.label} →</button>`
            : `<button type="button" class="btn btn-sm btn-primary" data-gj-tab="bayar">💵 Pembayaran Gaji →</button>`}
        </span>
      </div>`;
  })() : '';

  const kartuAktif = f.tab === 'rekap' ? cardRekap : f.tab === 'insentif' ? cardInsentif : f.tab === 'guru' ? cardGuru : cardBayar;
  $('#content').innerHTML = stats + tabsHtml + panduanHtml + kartuAktif;
  $$('[data-gj-tab]').forEach(el => {
    el.onclick = () => {
      if (el.dataset.gjTab === f.tab) return;
      if (!gajiBolehPindah()) return;
      STATE.gaji = Object.assign({}, STATE.gaji, { tab: el.dataset.gjTab });
      pageGaji();
      window.scrollTo(0, 0);
    };
  });
  if (f.tab === 'rekap') { insInitTab(f); }
  if (f.tab === 'guru') { guruInitTab(f, tampil); }

  const cari = () => {
    if (!gajiBolehPindah()) { return; }
    STATE.gaji = Object.assign({}, STATE.gaji, { q: $('#gj-cari').value.trim(), detail: '', tab: f.tab, kelompok: f.kelompok || '' });
    pageGaji();
  };
  const cariBtn = $('#gj-cari-btn');
  if (cariBtn) { cariBtn.onclick = cari; }
  const cariInp = $('#gj-cari');
  if (cariInp) { cariInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); cari(); } }); }
  const rst = $('#gj-cari-reset');
  if (rst) { rst.onclick = () => { if (!gajiBolehPindah()) { return; } STATE.gaji = Object.assign({}, STATE.gaji, { q: '', detail: '', tab: f.tab, kelompok: f.kelompok || '' }); pageGaji(); }; }
  $$('[data-gj-kel]').forEach(el => {
    el.onclick = () => {
      const val = el.dataset.gjKel || '';
      if (val === fKel) return;
      if (!gajiBolehPindah()) return;
      STATE.gaji = Object.assign({}, STATE.gaji, { kelompok: val, detail: '' });
      pageGaji();
    };
  });
  const btnBayar = $('#gj-bayar');
  if (btnBayar) { btnBayar.onclick = () => modalBayar(); }

  /* ---------- kelola jenis insentif ---------- */
  const addJi = async () => {
    const inp = $('#gj-ji-nama');
    const nm = (inp ? inp.value : '').trim();
    if (!nm) return toast('Nama jenis insentif wajib diisi', 'error');
    const sel = $('#gj-ji-akun');
    const jenisKosong = !(GJ.jenis || []).length;
    try {
      await API.post('/api/jenis-insentif', { nama: nm, akun_pemasukan: sel ? sel.value : '' });
      toast('Jenis insentif ditambahkan');
      await pageGaji();
      tawarLangkahBerikut('insentif', jenisKosong);
    } catch (e) { toast(e.message, 'error'); }
  };
  const btnJi = $('#gj-ji-tambah');
  if (btnJi) {
    btnJi.onclick = addJi;
    const inpJi = $('#gj-ji-nama');
    if (inpJi) inpJi.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addJi(); } });
  }
  $$('.gj-ji-nama').forEach(inp => {
    inp.addEventListener('change', async () => {
      const nm = inp.value.trim();
      if (!nm) return toast('Nama jenis insentif tidak boleh kosong', 'error');
      try {
        await API.put('/api/jenis-insentif?id=' + encodeURIComponent(inp.dataset.id), { nama: nm });
        toast('Jenis insentif diperbarui');
        pageGaji();
      } catch (e) { toast(e.message, 'error'); }
    });
  });
  $$('.gj-ji-aktif').forEach(chk => {
    chk.addEventListener('change', async () => {
      try {
        await API.put('/api/jenis-insentif?id=' + encodeURIComponent(chk.dataset.id), { aktif: chk.checked });
        toast('Status jenis insentif diperbarui');
        pageGaji();
      } catch (e) { toast(e.message, 'error'); chk.checked = !chk.checked; }
    });
  });
  $$('.gj-ji-akun').forEach(sel => {
    sel.addEventListener('change', async () => {
      try {
        await API.put('/api/jenis-insentif?id=' + encodeURIComponent(sel.dataset.id), { akun_pemasukan: sel.value });
        toast(sel.value ? 'Akun pemasukan jenis insentif diperbarui' : 'Jenis insentif ikut sumber dana');
        pageGaji();
      } catch (e) { toast(e.message, 'error'); pageGaji(); }
    });
  });
  $$('[data-ji-hapus]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.jiHapus;
      const j = (GJ.jenis || []).find(x => String(x.id) === String(id));
      if (!confirm(`Hapus jenis insentif "${j ? j.nama : ''}"?\n\nJika masih dipakai pada rincian data guru, sistem akan menolak (sebaiknya nonaktifkan saja).`)) return;
      try {
        await API.del('/api/jenis-insentif?id=' + encodeURIComponent(id));
        toast('Jenis insentif dihapus');
        pageGaji();
      } catch (e) { toast(e.message, 'error'); }
    };
  });
  $$('[data-gj-detail]').forEach(el => {
    el.onclick = () => { STATE.gaji = Object.assign({}, STATE.gaji, { detail: el.dataset.gjDetail }); pageGaji(); };
  });
  /* pintasan slip dari daftar: pilih guru → modal slip, atau cetak semua sekaligus */
  $$('[data-gj-cetak]').forEach(el => {
    el.onclick = () => {
      const b = GJ.list.find(x => x.id === el.dataset.gjCetak);
      if (b) { pilihSlip(b); }
    };
  });
  /* salin periode lama → form bayar bulan berikutnya (belum tersimpan apa pun) */
  $$('[data-gj-salin]').forEach(el => {
    el.onclick = async () => {
      const src0 = GJ.list.find(x => x.id === el.dataset.gjSalin);
      if (!src0) { return; }
      const btn = el; btn.disabled = true;
      try {
        const d = await API.get('/api/gaji?id=' + encodeURIComponent(src0.id));
        modalBayar({ salin: d.batch || src0 });
      } catch (e) { toast(e.message, 'error'); }
      finally { btn.disabled = false; }
    };
  });
  /* bayar draf dari daftar → buka form sudah terisi lalu terbitkan No. BKK & jurnal */
  $$('[data-gj-bayar]').forEach(el => {
    el.onclick = () => { modalBayar({ editDraf: el.dataset.gjBayar }); };
  });
  /* unduh PDF rincian gaji — 1 baris per guru, baris pemisah kelompok */
  $$('[data-gj-pdf]').forEach(el => {
    el.onclick = () => unduhPdfGaji({ id: el.dataset.gjPdf });
  });
  $$('[data-gj-hapus]').forEach(el => {
    el.onclick = async () => {
      const b = GJ.list.find(x => x.id === el.dataset.gjHapus);
      const draf = b && b.status === 'draf';
      if (!confirm(draf
        ? `Hapus draf gaji ${b ? periodeLabel(b.periode) : ''}?\n\nDraf belum punya jurnal kas — hanya data draf & slipnya yang hilang.`
        : `Hapus pembayaran gaji ${b ? periodeLabel(b.periode) : ''}?\n\nJurnal kas keluar & transaksi terkait ikut terhapus. Tanda tangan/riwayat WA pada periode ini ikut hilang.`)) return;
      try { await API.del('/api/gaji?id=' + encodeURIComponent(el.dataset.gjHapus)); toast(draf ? 'Draf gaji dihapus' : 'Pembayaran gaji dihapus'); }
      catch (e) { toast(e.message, 'error'); }
      pageGaji();
    };
  });
}

/* =========================================================
   SURAT TAGIHAN SANTRI — surat resmi tagihan belum lunas
   ========================================================= */
async function pageSuratTagihan() {
  const f = Object.assign({ santri_id: '', nomor: '', lamp: '-', hal: 'Informasi Administrasi Keuangan', tanggal: today() }, STATE.suratTagihan);
  STATE.suratTagihan = f;

  const [santriList, set, rw] = await Promise.all([
    API.get('/api/santri'),
    API.get('/api/pengaturan'),
    API.get('/api/surat-tagihan?act=riwayat').catch(() => ({ list: [] }))
  ]);
  const santriArr = Array.isArray(santriList) ? santriList : [];
  const riwayat = rw && Array.isArray(rw.list) ? rw.list : [];

  let data = null;
  if (f.santri_id) {
    try { data = await API.get('/api/surat-tagihan?' + new URLSearchParams({ santri_id: f.santri_id })); }
    catch (e) { toast(e.message, 'error'); }
  }
  if (data && !f.nomor) { f.nomor = data.nomor || ''; STATE.suratTagihan.nomor = f.nomor; }

  const namaSurat = (set.nama_lembaga || 'LEMBAGA SOSIAL, PENDIDIKAN DAN DAKWAH');
  const baris = data && Array.isArray(data.rows) ? data.rows : [];
  const total = data ? Number(data.total) || 0 : 0;
  const st = data ? data.santri : null;

  const statusTxt = (s) => s === 'lunas' ? 'Lunas' : s === 'sebagian' ? 'Sebagian Lunas' : 'Belum Lunas';

  const letterHTML = !st ? `
    <div class="empty surat-empty">
      <div class="empty-ico">✉️</div>
      <p>Pilih santri terlebih dahulu — surat tagihan akan tampil di sini.</p>
    </div>` : `
    <article class="surat" id="surat-body">
      <header class="surat-kop">
        <div class="surat-kop-logo">${set.logo ? `<img src="${esc(set.logo)}" alt="Logo">` : esc((set.logo_teks || 'PP').toUpperCase().slice(0, 3))}</div>
        <div class="surat-kop-txt">
          <h2>${esc(set.nama_pesantren)}</h2>
          <p class="surat-lembaga">${esc(namaSurat)}</p>
          <p>${set.alamat ? 'Sekretariat: ' + esc(set.alamat) : ''}</p>
          <p>${[set.web ? 'Web: ' + esc(set.web) : '', set.telp ? 'Telp/Hp: ' + esc(set.telp) : ''].filter(Boolean).join('. ')}</p>
        </div>
      </header>

      <table class="surat-meta">
        <tr><td class="k">No</td><td class="c">:</td><td class="v"><input id="st-nomor" class="st-inline" list="st-nomor-list" value="${esc(f.nomor)}" placeholder="B-3/PP-ASHSH/01/XII/2026"></td></tr>
        <tr><td class="k">Lamp</td><td class="c">:</td><td class="v"><input id="st-lamp" class="st-inline" value="${esc(f.lamp)}"></td></tr>
        <tr><td class="k">Hal</td><td class="c">:</td><td class="v"><input id="st-hal" class="st-inline st-hal" value="${esc(f.hal)}"></td></tr>
      </table>

      <div class="surat-isi">
        <p class="surat-yth">Yth. Bapak/Ibu/Wali Ananda <strong>${esc(st.nama)}</strong></p>
        <p class="surat-yth">Ditempat</p>

        <p class="surat-salam"><em>Assalamu'alaikum warahmatullahi wabarakatuh</em></p>

        <p>Puji syukur kehadirat Allah SWT yang telah melimpahkan karunia-Nya kepada kita semua. Shalawat serta salam semoga selalu tercurah kepada junjungan kita Nabi Muhammad SAW beserta sahabatnya dan semoga kita termasuk orang-orang yang mendapatkan syafa'atnya di yaumil akhir nanti. Aamiin.</p>

        <p>Demi kelancaran proses belajar mengajar, kami sangat menghargai kerjasama yang baik dari bapak/ibu untuk membayar SPP secara rutin dan pembayaran paling lambat tanggal 5 setiap bulannya. Berikut kami sampaikan tagihan administrasi yang harus dibayarkan:</p>

        ${baris.length ? `
        <table class="surat-tbl">
          <thead>
            <tr><th class="num">No</th><th>Jenis Pembayaran</th><th class="num">Jumlah</th><th>Keterangan</th></tr>
          </thead>
          <tbody>
            ${baris.map((r, i) => `
            <tr>
              <td class="num">${i + 1}</td>
              <td>${esc(r.label)}</td>
              <td class="num">Rp ${angkaKw(r.sisa)}</td>
              <td class="ket">${statusTxt(r.status)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" class="tot-label">Total tagihan yang harus dibayarkan</td>
              <td class="num tot-nilai" colspan="2">Rp ${angkaKw(total)}</td>
            </tr>
          </tfoot>
        </table>` : `<p class="surat-kosong">Tidak ada tagihan yang belum lunas untuk santri ini.</p>`}

        <p>Demikian pemberitahuan ini kami sampaikan. Atas perhatian dan kerjasama kami ucapkan terima kasih. Semoga Allah SWT memudahkan semua urusan kita.</p>

        <p class="surat-salam"><em>Wassalamu'alaikum warahmatullahi wabarakatuh</em></p>
      </div>

      <footer class="surat-ttd">
        <div class="surat-ttd-kiri">
          <div class="st-kecil">Mengetahui</div>
          <div class="st-jab">Mudir Pondok Pesantren</div>
          <div class="st-nama-jab">${esc((set.nama_pesantren || '').replace(/^Pondok Pesantren\s*/i, ''))}</div>
          <div class="st-ttd-ruang">${set.ttd_mudir ? `<img src="${esc(set.ttd_mudir)}" alt="TTD Mudir">` : ''}</div>
          <div class="st-nama">${esc(set.nama_mudir || '-')}</div>
        </div>
        <div class="surat-ttd-kanan">
          <div class="st-tgl">${esc([set.kota, tglPanjang(f.tanggal)].filter(Boolean).join(', '))}</div>
          <div class="st-jab">Bendahara,</div>
          <div class="st-ttd-ruang">${set.ttd_bendahara ? `<img src="${esc(set.ttd_bendahara)}" alt="TTD Bendahara">` : ''}</div>
          <div class="st-nama">${esc(set.nama_bendahara || '-')}</div>
        </div>
      </footer>
    </article>`;

  $('#content').innerHTML = `
    <div class="filters card card-pad no-print" style="margin-bottom:14px">
      <div class="field grow"><label>Santri</label>
        <select id="st-santri">
          <option value="">— pilih santri —</option>
          ${santriArr.map(s => `<option value="${esc(s.id)}" ${f.santri_id === s.id ? 'selected' : ''}>${esc(s.nama)} — ${esc(s.kelas || '-')}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Tanggal Surat</label><input type="date" id="st-tgl" value="${f.tanggal}"></div>
      <datalist id="st-nomor-list">${riwayat.map(r => `<option value="${esc(r.nomor)}">${esc(r.nama || '')}${r.tanggal ? ' · ' + tglLabel(r.tanggal) : ''}</option>`).join('')}</datalist>
      <button class="btn" id="st-reset">Reset</button>
      <button class="btn btn-primary" id="st-cetak" ${st ? '' : 'disabled'}>🖨️ Cetak / PDF</button>
      <button class="btn" id="st-jpg" ${st ? '' : 'disabled'}>⬇ JPG</button>
      <button class="btn" id="st-wa" ${st ? '' : 'disabled'}>📱 Kirim WhatsApp</button>
      <button class="btn" id="st-riwayat-btn">🕓 Riwayat Nomor</button>
    </div>

    ${letterHTML}

    <div class="card mt no-print" id="st-riwayat" hidden>
      <div class="card-head"><h3>🕓 Riwayat Nomor Surat Terbit</h3><button class="btn btn-sm" id="st-riwayat-close">Tutup</button></div>
      <div class="table-wrap" id="st-riwayat-body"></div>
    </div>`;

  $('#st-santri').onchange = () => {
    STATE.suratTagihan = Object.assign({}, STATE.suratTagihan, { santri_id: $('#st-santri').value, nomor: '' });
    pageSuratTagihan();
  };
  $('#st-tgl').onchange = () => { STATE.suratTagihan.tanggal = $('#st-tgl').value; pageSuratTagihan(); };
  $('#st-reset').onclick = () => { STATE.suratTagihan = {}; pageSuratTagihan(); };

  if (st) {
    const bind = (id, key) => { const el = $('#' + id); if (el) el.onchange = () => { STATE.suratTagihan[key] = el.value; }; };
    bind('st-nomor', 'nomor'); bind('st-lamp', 'lamp'); bind('st-hal', 'hal');
  }

  /* --- riwayat nomor terbit --- */
  const muatRiwayat = async () => {
    const box = $('#st-riwayat-body');
    try {
      const r = await API.get('/api/surat-tagihan?act=riwayat');
      const rl = Array.isArray(r.list) ? r.list : [];
      box.innerHTML = rl.length ? `<table>
        <thead><tr><th>Nomor</th><th>Tanggal</th><th>Santri</th><th class="num">Total</th><th></th></tr></thead>
        <tbody>${rl.map(a => `<tr>
          <td class="nowrap"><strong>${esc(a.nomor)}</strong></td>
          <td class="nowrap">${a.tanggal ? tglLabel(a.tanggal) : '-'}</td>
          <td>${esc(a.nama || '-')}${a.kelas ? ` <span class="muted">· ${esc(a.kelas)}</span>` : ''}</td>
          <td class="num pos">${fmt(a.total)}</td>
          <td class="actions"><button class="btn btn-sm" data-sid="${esc(a.santri_id || '')}" data-no="${esc(a.nomor)}">Buka</button></td>
        </tr>`).join('')}</tbody></table>` : `<div class="empty"><div class="empty-ico">🕓</div><p>Belum ada nomor surat yang diterbitkan.</p></div>`;
      $$('#st-riwayat-body [data-no]').forEach(b => b.onclick = () => {
        STATE.suratTagihan = { santri_id: b.dataset.sid, nomor: b.dataset.no };
        pageSuratTagihan();
      });
    } catch (e) { box.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; }
  };
  $('#st-riwayat-btn').onclick = () => { $('#st-riwayat').hidden = false; muatRiwayat(); $('#st-riwayat').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
  $('#st-riwayat-close').onclick = () => { $('#st-riwayat').hidden = true; };

  /* nilai input saat ini (lebih andal daripada menunggu onchange) */
  const nilaiInput = () => ({
    nomor: (($('#st-nomor') || {}).value || '').trim(),
    lamp:  (($('#st-lamp') || {}).value || '').trim(),
    hal:   (($('#st-hal') || {}).value || '').trim(),
    tanggal: (($('#st-tgl') || {}).value || '') || f.tanggal
  });

  /* --- cetak: terbitkan nomor (riwayat) lalu cetak = JPG pratinjau --- */
  $('#st-cetak').onclick = async () => {
    if (!st) return;
    const v = nilaiInput();
    const btn = $('#st-cetak');
    btn.disabled = true;
    try {
      if (v.nomor) {
        await API.post('/api/surat-tagihan?act=terbit', {
          nomor: v.nomor, santri_id: st.id, nama: st.nama, kelas: st.kelas,
          tanggal: v.tanggal, lamp: v.lamp, hal: v.hal, total
        });
        STATE.suratTagihan.nomor = v.nomor;
      }
      await cetakSuratTagihan();
    } catch (e) { toast(e.message, 'error'); }
    btn.disabled = false;
  };

  /* --- unduh JPG --- */
  $('#st-jpg').onclick = async () => {
    if (!st) return;
    const btn = $('#st-jpg');
    btn.disabled = true;
    try {
      const jpg = await suratJPG();
      const v = nilaiInput();
      const a = document.createElement('a');
      a.href = jpg;
      a.download = 'SuratTagihan_' + (v.nomor || 'tanpa-nomor').replace(/[\\/:*?"<>|]+/g, '-') + '.jpg';
      a.click();
      toast('Surat JPG diunduh');
    } catch (e) { toast(e.message, 'error'); }
    btn.disabled = false;
  };

  /* --- kirim WhatsApp --- */
  $('#st-wa').onclick = () => {
    if (!st) return;
    const v = nilaiInput();
    if (!v.nomor) return toast('Isi nomor surat dulu (klik Cetak utk menerbitkan)', 'error');
    const pesanDefault = `Assalamualaikum.${st.nama ? ' ' + st.nama : ''}\nTerlampir Surat Tagihan No. ${v.nomor}${total ? ' sebesar ' + fmt(total) : ''}.\n- ${set.nama_pesantren}`;
    openModal('Kirim Surat Tagihan ' + v.nomor, `
      <div class="form-grid">
        <div class="field full"><label>Nama Santri</label><input id="sw-nama" value="${esc(st.nama)}"></div>
        <div class="field full"><label>No. WA Wali <span class="muted">(otomatis dari Data Santri)</span></label><input id="sw-hp" value="${esc(st.no_wa || '')}" placeholder="08123456789"></div>
        <div class="field full"><label>Pesan</label><textarea id="sw-pesan" style="min-height:110px">${esc(pesanDefault)}</textarea></div>
        <div class="field full">
          <label class="gen-kolom" style="text-transform:none;font-size:13px;color:var(--text)">
            <input type="checkbox" id="sw-gambar" checked> Lampirkan gambar surat (JPG)
          </label>
          <span class="hint">Gambar disimpan di server & diambil bot dari antrean — pastikan folder <code>data/surat</code> bisa ditulis.</span>
        </div>
      </div>
      <p class="hint muted" style="margin-top:10px">Pilihan <strong>Antre ke Bot</strong> menyimpan pesan ke antrean server (diproses bot WA Web). <strong>WhatsApp (wa.me)</strong> membuka aplikasi WhatsApp; <strong>WhatsApp Web</strong> membuka web.whatsapp.com di browser — gambar dikirim manual.</p>`,
      `<button class="btn" onclick="closeModal()">Batal</button>
       <button class="btn" id="sw-web">🖥️ WhatsApp Web</button>
       <button class="btn" id="sw-open">📱 WhatsApp (wa.me)</button>
       <button class="btn btn-primary" id="sw-antre">📤 Antre ke Bot</button>`, 560);

    const bukaWa = (base) => {
      const hp = ($('#sw-hp').value || '').trim();
      if (!hp) return toast('Nomor WhatsApp wajib diisi', 'error');
      const n = normWa(hp);
      if (!n || n.length < 10) return toast('Nomor WhatsApp tidak valid', 'error');
      window.open(base + '?phone=' + n + '&text=' + encodeURIComponent($('#sw-pesan').value), '_blank');
    };
    $('#sw-web').onclick  = () => bukaWa('https://web.whatsapp.com/send');
    $('#sw-open').onclick = () => bukaWa('https://wa.me');
    $('#sw-antre').onclick = async () => {
      const hp = ($('#sw-hp').value || '').trim();
      if (!hp) return toast('Nomor WhatsApp wajib diisi', 'error');
      const lampir = $('#sw-gambar').checked;
      try {
        const btn = $('#sw-antre'); btn.disabled = true; btn.textContent = 'Mengirim…';
        const gambar = lampir ? await suratJPG() : '';
        await API.post('/api/surat-tagihan?act=kirim-wa', {
          nomor: v.nomor, santri_id: st.id,
          nama: $('#sw-nama').value.trim(), no_hp: hp,
          pesan: $('#sw-pesan').value.trim(), total, gambar
        });
        closeModal();
        toast('Surat masuk antrean kirim WhatsApp');
      } catch (e) { toast(e.message, 'error'); const b = $('#sw-antre'); if (b) { b.disabled = false; b.textContent = '📤 Antre ke Bot'; } }
    };
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
  const kolom = [...bulanan, ...KD.lain, ...custom.map(c => ({ key: c.key, nama: c.nama })), { key: 'tagihan_lain', nama: 'Tagihan Lain (saldo minus)' }];
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
          <p class="gen-grp">Tagihan khusus — dari saldo kas</p>
          <div class="gen-kolom-list">${cb({ key: 'tagihan_lain', nama: 'Tagihan Lain (saldo kas minus)' }, adaIsi('tagihan_lain'))}</div>
        </div>
        <span class="hint">Nominal tiap santri diambil dari kolomnya sendiri (mis. SPP November → kolom <strong>SPP November</strong>). Nilai 0 tidak dibuatkan tagihan & tagihan yang sudah ada tidak digandakan. Opsi <strong>Tagihan Lain</strong> mengikuti saldo kas Tagihan Lain-lain yang minus (diubah di Data Santri / jurnal) — dgn <em>regenerate</em>, baris lamanya dihapus lalu dibuat ulang.</span>
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
/* kolom kas khusus Data Santri — saldo awal uang saku/tabungan/tagihan lain + nominal pembagian uang saku */
const KASK = [
  ['saldo_awal_us', 'Saldo Awal Uang Saku'],
  ['saldo_awal_tab', 'Saldo Awal Tabungan'],
  ['saldo_awal_lain', 'Saldo Awal Tagihan Lain'],
  ['nominal_us', 'Nominal Pembagian Uang Saku']
].map(([k, n]) => ({ key: k, nama: n, singkat: n, grup: 'kas', t: 'rupiah' }));
const KASET = new Set(KASK.map(k => k.key));
/* utang Tagihan Lain-lain (saldo kas minus) — tampil sbg tagihan plus & ikut Total Tagihan */
const UTANG_TL = { key: 'tagihan_lain', nama: 'Tagihan Lain', singkat: 'Tagihan Lain', t: 'rupiah' };
const isNumSantri = (c) => !!(c && (c.cus || KD.set.has(c.key) || KASET.has(c.key) || c.key === UTANG_TL.key));
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
  const utangTl = [UTANG_TL];
  const aksi = [{ key: '_aksi', nama: '' }];
  switch (grup) {
    case 'spp': return [ident[0], ident[1], ...KD.spp, ...aksi];
    case 'infaq': return [ident[0], ident[1], ...KD.infaq, ...aksi];
    case 'laundry': return [ident[0], ident[1], ...KD.laundry, ...aksi];
    case 'lainnya': return [ident[0], ident[1], ...KD.lain, ...utangTl, ...c, ...aksi];
    case 'kas': return [ident[0], ident[1], ident[2], ...KASK, ...utangTl, ...aksi];
    case 'semua': return [...ident, ...KD.spp, ...KD.infaq, ...KD.laundry, ...KD.lain, ...KASK, ...utangTl, ...c, ...total, ...aksi];
    default: return [...ident, ...total, ...c, ...aksi];
  }
}
function nilaiSantri(s, key) {
  if (!s) return 0;
  if (key === UTANG_TL.key) return Number(s.tagihan_lain) || 0;
  if (KD.set.has(key) || KASET.has(key)) return Number(s[key]) || 0;
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
  const grupTab = [['umum', 'Umum'], ['spp', 'SPP'], ['infaq', 'Infaq Wajib'], ['laundry', 'Laundry Wajib'], ['lainnya', 'Lainnya'], ['kas', '💰 Kas Khusus'], ['semua', 'Semua']];

  const th = cols.map(c => `<th class="${c.t === 'num' || c.t === 'rupiah' ? 'num' : ''} ${c.key === 'no' || c.key === 'nama' ? 'sticky-col' + (c.key === 'nama' ? '2' : '') : ''}">${esc(c.nama)}</th>`).join('');
  const td = (s, c) => {
    const st = c.key === 'no' ? ' class="num sticky-col"' : c.key === 'nama' ? ' class="sticky-col2"' : '';
    if (c.key === '_aksi') return `<td class="actions"><button class="btn btn-sm" data-edit="${s.id}">Edit</button> <button class="btn btn-sm btn-danger" data-del="${s.id}">Hapus</button></td>`;
    if (c.t === 'num') return `<td${st}>${s.no}</td>`;
    if (c.t === 'rupiah') {
      if (c.key === UTANG_TL.key) {
        const v = Number(s.tagihan_lain) || 0;
        return `<td class="num">${v > 0 ? `<span class="neg">${fmt(v)}</span>` : '<span class="muted">·</span>'}</td>`;
      }
      return `<td class="num">${c.key === 'total_tagihan' ? fmt(s.total_tagihan) : fmt(s[c.key] ?? 0)}</td>`;
    }
    if (isNumSantri(c)) return `<td class="num">${fmtNum(nilaiSantri(s, c.key))}</td>`;
    return `<td${st}>${c.key === 'nama' ? `<strong>${esc(s[c.key])}</strong>` : esc(s[c.key] ?? '')}</td>`;
  };
  const sumCols = cols.filter(c => isNumSantri(c) && c.key !== 'no');
  const foot = sumCols.length ? `<tfoot><tr>${cols.map(c => {
    if (c.key === '_aksi') return '<td></td>';
    if (c.key === 'nama') return '<td><strong>Total</strong></td>';
    if (c.key === 'no') return '<td class="num sticky-col"></td>';
    if (!isNumSantri(c) && c.t !== 'rupiah') return '<td></td>';
    const sum = c.key === 'total_tagihan' ? totalTagihan : rows.reduce((a, s) => a + nilaiSantri(s, c.key), 0);
    return `<td class="num"><strong>${fmt(sum)}</strong></td>`;
  }).join('')}</tr></tfoot>` : '';

  $('#content').innerHTML = `
    <div class="grid grid-4">
      <div class="stat"><div class="stat-ico">👨‍🎓</div><div class="stat-label">Total Santri</div><div class="stat-value">${rows.length}</div><div class="stat-sub">dari ${list.length} terdaftar</div></div>
      <div class="stat saldo"><div class="stat-ico">🧾</div><div class="stat-label">Total Tagihan</div><div class="stat-value" style="font-size:18px">${fmt(totalTagihan)}</div><div class="stat-sub">kolom tagihan + Tagihan Lain (saldo minus)</div></div>
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
      ${blokJudul('Saldo Awal Kas Khusus & Pembagian Uang Saku')}
      <div class="grid-num n3">${KASK.map(k => inp(k, k.nama)).join('')}</div>
      <p class="hint muted" style="grid-column:1/-1;margin:-2px 0 4px">Saldo awal adalah angka pembuka saldo uang saku / tabungan / tagihan lain santri (mutasi jurnal dijumlahkan di atasnya). Nominal Pembagian dipakai otomatis sebagai nominal tiap santri pada fitur 💰 Pembagian Uang Saku.</p>
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
  return ['No', 'Nama', 'Kelas', 'No WA', ...KD.semua.map(k => k.nama), ...KASK.map(k => k.nama), ...(custom || []).map(c => c.nama)];
}
function unduhTemplateSantri(custom) {
  downloadCsv('template-import-santri.csv', [headerSantri(custom)]);
}
function exportSantriCsv(rows, custom) {
  const head = headerSantri(custom);
  const body = rows.map(s => [
    s.no, s.nama, s.kelas, s.no_wa,
    ...KD.semua.map(k => nilaiSantri(s, k.key)),
    ...KASK.map(k => nilaiSantri(s, k.key)),
    ...(custom || []).map(c => nilaiSantri(s, c.key))
  ]);
  downloadCsv(`santri-${today()}.csv`, [head, ...body]);
}

function importSantri(custom) {
  custom = custom || STATE.santriCustom || [];
  let parsed = [];
  openModal('📥 Import Data Santri dari Excel', `
    <p class="hint">Judul kolom baris pertama harus cocok (boleh potongan): <em>Nama, Kelas, No WA, SPP Januari, Infaq Wajib Januari, Laundry Wajib Januari, Administrasi Awal, Wakaf, Daftar Ulang, Bimbel, Saldo Awal Uang Saku, Nominal Pembagian Uang Saku…</em>. Kolom yang tidak dikenal otomatis jadi kolom baru.</p>
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
      <button class="btn" id="l-ke-cetak" title="Sebelas jenis laporan resmi siap cetak — berkop &amp; tanda tangan">🖨️ Laporan Cetak…</button>
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
  $('#l-ke-cetak').onclick = () => { location.hash = '#/laporan-cetak'; };
  $('#l-csv').onclick = () => exportCsv(lap.transaksi);
}

/* =========================================================
   CETAK LAPORAN — 11 jenis laporan siap cetak
   format resmi: kop pesantren, judul periode, tabel, tanda tangan
   ========================================================= */
const lp2 = (n) => angkaKw(n);                                    /* 1.234.500,00 */
const lp0 = (n) => (Number(n) || 0).toLocaleString('id-ID');       /* 1.234.500 */
const lpZ = (n) => (Number(n) ? angkaKw(n) : '–');                 /* nol → strip */
const absUrl = (u) => { try { return new URL(String(u), location.href).href; } catch (e) { return String(u || ''); } };
const tglSebelum = (d) => { const x = new Date(String(d) + 'T00:00:00'); x.setDate(x.getDate() - 1); return x.toISOString().slice(0, 10); };

/** label periode: satu bulan penuh → "BULAN OKTOBER 2026", selainnya rentang tanggal */
function lpPeriodeTeks(dari, sampai) {
  const d = String(dari), s = String(sampai);
  if (d.slice(0, 7) === s.slice(0, 7)) {
    const akhirBulan = new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)), 0).getDate();
    if (d.slice(8) === '01' && Number(s.slice(8)) === akhirBulan) {
      return 'BULAN ' + BLN[Number(d.slice(5, 7)) - 1].toUpperCase() + ' ' + d.slice(0, 4);
    }
  }
  return 'PERIODE ' + tglPanjang(d) + ' – ' + tglPanjang(s);
}

/** blok tanda tangan Mudir & Bendahara (kanan: kota + tanggal) */
function lapTtd(set, tglTtd) {
  const kotaTgl = [set.kota, tglPanjang(tglTtd)].filter(Boolean).join(', ');
  return `
  <div class="ttd">
    <div class="kiri">
      <div>Mengetahui,</div>
      <div class="jab">Mudir</div>
      <div class="ruang"></div>
      <div class="nama">${esc(set.nama_mudir || '-')}</div>
    </div>
    <div class="kanan">
      <div class="tgl">${esc(kotaTgl)}</div>
      <div class="jab">Bendahara,</div>
      <div class="ruang"></div>
      <div class="nama">${esc(set.nama_bendahara || '-')}</div>
    </div>
  </div>`;
}

/** buka jendela cetak berkop — o: {set, judul, periodeTeks, body, tglTtd, catatan, ttd} — F4 landscape margin 0,5 cm, warna tetap tercetak */
function bukaCetakLaporan(o) {
  const w = window.open('', '_blank');
  if (!w) { toast('Jendela cetak diblokir browser — izinkan pop-up lalu coba lagi', 'error'); return; }
  const set = o.set || {};
  const logo = set.logo ? absUrl(set.logo) : '';
  const doc = w.document;
  doc.open();
  doc.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(o.judul)} — ${esc(set.nama_pesantren || '')}</title>
<style>
@page { size: 330mm 215mm; margin: 0.5cm; }
*, *::before, *::after { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
* { box-sizing: border-box; }
html, body { margin:0; padding:0; background:#fff; color:#111827; }
body { font-family: Arial, Helvetica, sans-serif; font-size:10.5px; line-height:1.45; }
.kop { display:flex; align-items:center; gap:14px; border-bottom:3px double #111827; padding-bottom:6px; }
.kop-side { width:66px; flex:none; display:flex; align-items:center; justify-content:center; }
.kop-side img { max-width:66px; max-height:66px; object-fit:contain; }
.kop-side span { font-weight:800; font-size:19px; letter-spacing:1px; }
.kop-txt { flex:1; text-align:center; }
.kop-txt h1 { margin:0; font-size:16px; text-transform:uppercase; letter-spacing:.5px; }
.kop-txt p { margin:2px 0 0; font-size:11px; }
h2.judul { text-align:center; font-size:14px; margin:13px 0 2px; text-transform:uppercase; letter-spacing:.7px; }
p.periode { text-align:center; margin:0 0 9px; font-size:11.5px; font-weight:700; text-transform:uppercase; }
h3.bab { font-size:11.5px; margin:13px 0 3px; text-transform:uppercase; letter-spacing:.4px; border-bottom:1.5px solid #334155; padding-bottom:2px; }
table { width:100%; border-collapse:collapse; margin-top:3px; }
thead { display: table-header-group; }
th, td { border:1px solid #64748b; padding:3px 6px; vertical-align:top; }
th { background:#eef2f7; font-size:9.3px; text-transform:uppercase; letter-spacing:.25px; text-align:center; }
td.n, th.n { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
td.c, th.c { text-align:center; }
td.wrap, th.wrap { white-space:normal; }
tr.grp td { background:#e2e8f0; font-weight:700; }
tr.tot td { background:#f1f5f9; font-weight:700; }
tr.buka td { background:#f8fafc; font-style:italic; }
.kosong { text-align:center; color:#94a3b8; padding:16px !important; }
table.ringkas { width:auto; min-width:60%; margin:0 auto 7px; }
table.ringkas th, table.ringkas td { padding:3px 9px; }
.sec { page-break-before: always; break-before: page; }
.sec-head { display:flex; justify-content:space-between; gap:10px; font-size:11px; margin:0 0 3px; font-weight:700; text-transform:uppercase; }
.ttd { display:flex; justify-content:space-between; margin-top:22px; page-break-inside: avoid; }
.ttd .kiri, .ttd .kanan { width:240px; text-align:center; font-size:11px; }
.ttd .tgl { text-align:right; margin-bottom:4px; }
.ttd .ruang { height:50px; }
.ttd .nama { font-weight:700; text-decoration:underline; }
.catatan { margin-top:7px; font-size:9.5px; color:#475569; font-style:italic; }
</style></head><body>
<div class="kop">
  <div class="kop-side">${logo ? `<img src="${esc(logo)}" alt="Logo">` : `<span>${esc((set.logo_teks || 'PP').toUpperCase().slice(0, 3))}</span>`}</div>
  <div class="kop-txt">
    <h1>${esc(set.nama_pesantren || '')}</h1>
    <p>${esc(set.alamat || '')}</p>
    ${(set.web || set.telp) ? `<p>${[set.web, set.telp].filter(Boolean).map(esc).join(' · ')}</p>` : ''}
  </div>
  <div class="kop-side"></div>
</div>
<h2 class="judul">${esc(o.judul)}</h2>
<p class="periode">${esc(o.periodeTeks)}</p>
${o.body || ''}
${o.catatan ? `<p class="catatan">${esc(o.catatan)}</p>` : ''}
${o.ttd === false ? '' : lapTtd(set, o.tglTtd)}
</body></html>`);
  doc.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch (e) {} }, 400);
  toast('Membuka ' + o.judul + ' — pilih printer atau "Simpan sebagai PDF"');
}

/* ---------- 1. LAPORAN KEUANGAN — pemasukan & pengeluaran per akun ---------- */
async function lapKeuangan(dari, sampai, set) {
  const [sa, jk, ak] = await Promise.all([
    API.get('/api/saldo-akun?' + new URLSearchParams({ dari, sampai })),
    API.get('/api/jurnal?' + new URLSearchParams({ dari, sampai, arah: 'keluar' })),
    API.get('/api/akun'),
  ]);
  const barisA = (sa.list || []).map((r, i) => `<tr>
    <td class="c">${i + 1}</td><td>${esc(r.nama)}</td>
    <td class="n">${lpZ(r.masuk)}</td><td class="n">${lpZ(r.keluar)}</td><td class="n">${lpZ(r.saldo_akhir)}</td></tr>`).join('');
  const perKel = {};
  (jk || []).forEach(x => { const a = String(x.akun || ''); perKel[a] = (perKel[a] || 0) + (Number(x.nominal) || 0); });
  let runB = 0;
  const barisB = (ak.pengeluaran || []).map((nm, i) => {
    const v = perKel[nm] || 0;
    runB += v;
    return `<tr><td class="c">${i + 1}</td><td>${esc(nm)}</td><td class="n">${lpZ(v)}</td><td class="n">–</td><td class="n">${lpZ(runB)}</td></tr>`;
  }).join('');
  const tA = { masuk: 0, keluar: 0, akhir: 0 };
  (sa.list || []).forEach(r => { tA.masuk += Number(r.masuk) || 0; tA.keluar += Number(r.keluar) || 0; tA.akhir += Number(r.saldo_akhir) || 0; });
  const kolom = `<thead><tr><th class="c" style="width:34px">No</th><th>Keterangan</th><th class="n" style="width:120px">Debet</th><th class="n" style="width:120px">Kredit</th><th class="n" style="width:130px">Saldo</th></tr></thead>`;
  const body = `
    <h3 class="bab">A. Pemasukan</h3>
    <table>${kolom}
      <tbody>${barisA || `<tr><td colspan="5" class="kosong">Tidak ada data pemasukan pada periode ini.</td></tr>`}</tbody>
      <tfoot><tr class="tot"><td></td><td>Total Pemasukan</td><td class="n">${lp2(tA.masuk)}</td><td class="n">${lp2(tA.keluar)}</td><td class="n">${lp2(tA.akhir)}</td></tr></tfoot></table>
    <h3 class="bab">B. Pengeluaran</h3>
    <table>${kolom}
      <tbody>${barisB || `<tr><td colspan="5" class="kosong">Tidak ada data pengeluaran pada periode ini.</td></tr>`}</tbody>
      <tfoot><tr class="tot"><td></td><td>Total Pengeluaran</td><td class="n">${lp2(runB)}</td><td class="n">–</td><td class="n">${lp2(runB)}</td></tr></tfoot></table>`;
  bukaCetakLaporan({ set, judul: 'LAPORAN KEUANGAN', periodeTeks: lpPeriodeTeks(dari, sampai), body, tglTtd: sampai,
    catatan: 'Saldo pada bagian A = saldo akhir tiap akun pemasukan (termasuk saldo awal periode) · bagian B menampilkan pengeluaran per akun pengeluaran.' });
}

/* ---------- 2. LAPORAN SALDO KEUANGAN — saldo awal/akhir + rincian per kanal ---------- */
async function lapSaldo(dari, sampai, set) {
  const [sa, jr] = await Promise.all([
    API.get('/api/saldo-akun?' + new URLSearchParams({ dari, sampai })),
    API.get('/api/jurnal?' + new URLSearchParams({ sampai })),
  ]);
  const chan = {};
  (jr || []).forEach(x => {
    const arah = x.arah === 'keluar' ? 'keluar' : 'masuk';
    const nm = arah === 'masuk' ? String(x.akun || '') : String(x.sumber_dana || '');
    const jt = String(x.jenis_transaksi || '');
    if (!nm || ['BRI', 'BSI', 'BPD'].indexOf(jt) < 0) return;
    if (!chan[nm]) chan[nm] = { BRI: 0, BSI: 0, BPD: 0 };
    chan[nm][jt] += (arah === 'masuk' ? 1 : -1) * (Number(x.nominal) || 0);
  });
  const z = (v) => (Number(v) ? lp0(v) : '0');
  const t = { sa: 0, d: 0, k: 0, tot: 0, bri: 0, bsi: 0, bpd: 0, cash: 0 };
  const baris = (sa.list || []).map((r, i) => {
    const c = chan[r.nama] || { BRI: 0, BSI: 0, BPD: 0 };
    const tot = Number(r.saldo_akhir) || 0;
    const cash = tot - (c.BRI + c.BSI + c.BPD);
    t.sa += Number(r.saldo_awal) || 0; t.d += Number(r.masuk) || 0; t.k += Number(r.keluar) || 0;
    t.tot += tot; t.bri += c.BRI; t.bsi += c.BSI; t.bpd += c.BPD; t.cash += cash;
    return `<tr><td class="c">${i + 1}</td><td>${esc(r.nama)}</td>
      <td class="n">${z(r.saldo_awal)}</td><td class="n">${z(r.masuk)}</td><td class="n">${z(r.keluar)}</td><td class="n"><strong>${z(tot)}</strong></td>
      <td class="n">${z(c.BRI)}</td><td class="n">${z(c.BSI)}</td><td class="n">${z(c.BPD)}</td><td class="n">${z(cash)}</td><td class="n">${z(tot)}</td></tr>`;
  }).join('');
  const body = `
    <table><thead><tr>
      <th class="c" style="width:30px">No</th><th>Keterangan</th>
      <th class="n">Saldo Awal</th><th class="n">Debet</th><th class="n">Kredit</th><th class="n">Total</th>
      <th class="n">BRI</th><th class="n">BSI</th><th class="n">BPD</th><th class="n">Cash</th><th class="n">Total</th>
    </tr></thead>
    <tbody>${baris || `<tr><td colspan="11" class="kosong">Tidak ada data saldo pada periode ini.</td></tr>`}</tbody>
    <tfoot><tr class="tot"><td></td><td>Total</td>
      <td class="n">${z(t.sa)}</td><td class="n">${z(t.d)}</td><td class="n">${z(t.k)}</td><td class="n"><strong>${z(t.tot)}</strong></td>
      <td class="n">${z(t.bri)}</td><td class="n">${z(t.bsi)}</td><td class="n">${z(t.bpd)}</td><td class="n">${z(t.cash)}</td><td class="n">${z(t.tot)}</td></tr></tfoot></table>`;
  bukaCetakLaporan({ set, judul: 'LAPORAN SALDO KEUANGAN', periodeTeks: lpPeriodeTeks(dari, sampai), body, tglTtd: sampai,
    catatan: 'Kolom BRI/BSI/BPD/Cash = rincian saldo tiap kanal (Cash = Total − tiga bank) — dihitung dari seluruh transaksi s/d tanggal akhir periode.' });
}

/* ---------- 3. LAPORAN SALDO HUTANG — per kreditur ---------- */
async function lapHutang(dari, sampai, set) {
  const [rNow, rAwal] = await Promise.all([
    API.get('/api/kreditur?' + new URLSearchParams({ dari, sampai })),
    API.get('/api/kreditur?' + new URLSearchParams({ sampai: tglSebelum(dari) })),
  ]);
  const awalMap = {};
  (rAwal.list || []).forEach(k => { awalMap[String(k.id).toLowerCase() + '|' + String(k.nama).toLowerCase()] = Number(k.sisa) || 0; });
  const awalTanpa = {};
  (rAwal.tanpa || []).forEach(k => { awalTanpa[String(k.nama).toLowerCase()] = (Number(k.masuk) || 0) - (Number(k.keluar) || 0); });
  const riwayat = rNow.riwayat || [];
  const baris = [];
  const tot = { awal: 0, d: 0, k: 0, akhir: 0 };
  const push = (nama, awal, d, k, jmlKel) => {
    const akhir = awal - d + k;
    tot.awal += awal; tot.d += d; tot.k += k; tot.akhir += akhir;
    const angs = jmlKel > 0 ? d / jmlKel : 0;
    baris.push(`<tr><td class="c">${baris.length + 1}</td><td>${esc(nama)}</td>
      <td class="n">${angs ? lp2(angs) : '–'}</td>
      <td class="n">${lpZ(awal)}</td><td class="n">${lpZ(d)}</td><td class="n">${lpZ(k)}</td><td class="n">${lpZ(akhir)}</td></tr>`);
  };
  (rNow.list || []).forEach(k => {
    const awal = awalMap[String(k.id).toLowerCase() + '|' + String(k.nama).toLowerCase()] || 0;
    const jmlKel = riwayat.filter(r => r.arah === 'keluar' && String(r.kreditur_id) === String(k.id)).length;
    push(k.nama, awal, Number(k.total_keluar) || 0, Number(k.total_masuk) || 0, jmlKel);
  });
  (rNow.tanpa || []).forEach(k => {
    const kn = String(k.nama).toLowerCase();
    const jmlKel = riwayat.filter(r => r.arah === 'keluar' && String(r.kreditur || '').toLowerCase() === kn).length;
    push(k.nama, awalTanpa[kn] || 0, Number(k.keluar) || 0, Number(k.masuk) || 0, jmlKel);
  });
  const body = `
    <table><thead><tr>
      <th class="c" style="width:40px">Kode</th><th>Jenis Hutang</th><th class="n">Besaran Angsuran</th>
      <th class="n">Saldo Awal</th><th class="n">Debet (Rp)</th><th class="n">Kredit (Rp)</th><th class="n">Saldo Akhir (Rp)</th>
    </tr></thead>
    <tbody>${baris.join('') || `<tr><td colspan="7" class="kosong">Tidak ada data hutang pada periode ini.</td></tr>`}</tbody>
    <tfoot><tr class="tot"><td></td><td>Total</td><td></td>
      <td class="n">${lp2(tot.awal)}</td><td class="n">${lp2(tot.d)}</td><td class="n">${lp2(tot.k)}</td><td class="n">${lp2(tot.akhir)}</td></tr></tfoot></table>`;
  bukaCetakLaporan({ set, judul: 'LAPORAN SALDO HUTANG', periodeTeks: lpPeriodeTeks(dari, sampai), body, tglTtd: sampai,
    catatan: 'Debet = angsuran/hutang yang dibayar pada periode · Kredit = penambahan hutang baru · Saldo Akhir = Saldo Awal − Debet + Kredit · Besaran Angsuran = rata-rata angsuran per transaksi.' });
}

/* ---------- 4. JURNAL UMUM — seluruh transaksi + saldo berjalan ---------- */
async function lapJurnalUmum(dari, sampai, set) {
  const jr = await API.get('/api/jurnal?' + new URLSearchParams({ sampai }));
  const sebelum = (jr || []).filter(x => String(x.tanggal) < dari);
  const periode = (jr || []).filter(x => String(x.tanggal) >= dari).reverse();
  const saldoAwal = sebelum.reduce((a, x) => a + (x.arah === 'keluar' ? -1 : 1) * (Number(x.nominal) || 0), 0);
  const chM = { BRI: 0, BSI: 0, BPD: 0 };
  let tMasuk = 0, tKeluar = 0;
  periode.forEach(x => {
    const n = Number(x.nominal) || 0;
    if (x.arah === 'keluar') { tKeluar += n; return; }
    tMasuk += n;
    const jt = String(x.jenis_transaksi || '');
    if (chM[jt] !== undefined) { chM[jt] += n; }
  });
  const cashM = tMasuk - (chM.BRI + chM.BSI + chM.BPD);
  const saldoAkhir = saldoAwal + tMasuk - tKeluar;
  let run = saldoAwal;
  const baris = periode.map(x => {
    const n = Number(x.nominal) || 0;
    run += (x.arah === 'keluar' ? -n : n);
    const jt = String(x.jenis_transaksi || '');
    const kol = { BRI: '', BSI: '', BPD: '', Cas: '' };
    if (kol[jt] !== undefined) { kol[jt] = lp2(n); }
    const no = x.arah === 'keluar' ? (x.no_bkk || '') : (x.no_bkm || '');
    const ket = x.label_tagihan || x.keterangan || [x.nama, x.akun].filter(Boolean).join(' — ') || '–';
    return `<tr>
      <td class="c nowrap">${tglLabel(x.tanggal)}</td>
      <td class="c">${esc(no || '–')}</td>
      <td>${esc(ket)}</td>
      <td class="n">${kol.BRI}</td><td class="n">${kol.BSI}</td><td class="n">${kol.BPD}</td><td class="n">${kol.Cas}</td>
      <td class="n">${x.arah === 'keluar' ? '' : lp2(n)}</td>
      <td class="n">${x.arah === 'keluar' ? lp2(n) : ''}</td>
      <td class="n">${lp2(run)}</td></tr>`;
  }).join('');
  const body = `
    <table class="ringkas"><thead><tr><th>BRI</th><th>BSI</th><th>BPD</th><th>Cash</th><th>Pemasukan</th><th>Pengeluaran</th><th>Saldo Awal</th><th>Saldo Akhir</th></tr></thead>
    <tbody><tr>
      <td class="n">${lp2(chM.BRI)}</td><td class="n">${lp2(chM.BSI)}</td><td class="n">${lp2(chM.BPD)}</td><td class="n">${lp2(cashM)}</td>
      <td class="n">${lp2(tMasuk)}</td><td class="n">${lp2(tKeluar)}</td><td class="n">${lp2(saldoAwal)}</td><td class="n">${lp2(saldoAkhir)}</td>
    </tr></tbody></table>
    <table><thead><tr>
      <th class="c">Tanggal</th><th class="c">No. Kwt</th><th>Keterangan Transaksi</th>
      <th class="n">BRI</th><th class="n">BSI</th><th class="n">BPD</th><th class="n">Cash</th>
      <th class="n">Debet (Rp)</th><th class="n">Kredit (Rp)</th><th class="n">Saldo (Rp)</th>
    </tr></thead>
    <tbody><tr class="buka"><td colspan="9">Saldo Awal Periode</td><td class="n">${lp2(saldoAwal)}</td></tr>
    ${baris || `<tr><td colspan="10" class="kosong">Tidak ada transaksi pada periode ini.</td></tr>`}</tbody>
    <tfoot><tr class="tot"><td colspan="7">Total Periode</td><td class="n">${lp2(tMasuk)}</td><td class="n">${lp2(tKeluar)}</td><td class="n">${lp2(saldoAkhir)}</td></tr></tfoot></table>`;
  bukaCetakLaporan({ set, judul: 'JURNAL UMUM', periodeTeks: lpPeriodeTeks(dari, sampai), body, tglTtd: sampai });
}

/* ---------- 5. REKAP PEMBAYARAN SANTRI — santri × jenis iuran ---------- */
async function lapRekapSantri(dari, sampai, set) {
  const [santri, jenis, tags] = await Promise.all([
    API.get('/api/santri'),
    API.get('/api/jenis-tagihan'),
    API.get('/api/tagihan'),
  ]);
  const pAwal = String(dari).slice(0, 7), pAkhir = String(sampai).slice(0, 7);
  let tf = (tags || []).filter(t => String(t.periode) >= pAwal && String(t.periode) <= pAkhir);
  let catatan = '';
  if (!tf.length) { tf = tags || []; catatan = 'Tidak ada tagihan pada periode terpilih — menampilkan seluruh tagihan (kumulatif).'; }
  const agg = {}, colTot = {}, sIds = {};
  tf.forEach(t => {
    const k = t.santri_id + '|' + t.jenis_id;
    const byr = Number(t.total_bayar) || 0;
    agg[k] = (agg[k] || 0) + byr;
    colTot[t.jenis_id] = (colTot[t.jenis_id] || 0) + byr;
    sIds[t.santri_id] = 1;
  });
  const cols = (jenis || []).filter(j => colTot[j.id] !== undefined);
  const useCols = cols.length ? cols : (jenis || []);
  const rows = (santri || []).filter(s => sIds[s.id])
    .sort((a, b) => String(a.kelas).localeCompare(String(b.kelas)) || String(a.nama).localeCompare(String(b.nama)));
  const baris = rows.map((s, i) => `
    <tr><td class="c">${i + 1}</td><td class="c">${esc(s.nis || '')}</td><td>${esc(s.nama)}</td>
    ${useCols.map(j => `<td class="n">${lp0(agg[s.id + '|' + j.id] || 0)}</td>`).join('')}</tr>`).join('');
  const body = `
    <table><thead><tr><th class="c" style="width:30px">No</th><th class="c" style="width:70px">Kode</th><th class="wrap">Nama</th>
    ${useCols.map(j => `<th class="n wrap">${esc(j.nama)}</th>`).join('')}</tr></thead>
    <tbody>${baris || `<tr><td colspan="${3 + useCols.length}" class="kosong">Tidak ada data tagihan santri pada periode ini.</td></tr>`}</tbody>
    <tfoot><tr class="tot"><td></td><td></td><td>Total</td>${useCols.map(j => `<td class="n">${lp0(colTot[j.id] || 0)}</td>`).join('')}</tr></tfoot></table>`;
  bukaCetakLaporan({ set, judul: 'REKAP PEMBAYARAN SANTRI', periodeTeks: lpPeriodeTeks(dari, sampai), body, tglTtd: sampai, catatan });
}

/* ---------- 6. BUKU BESAR — per akun pemasukan & pengeluaran ---------- */
async function lapBukuBesar(dari, sampai, set) {
  const [jr, sa, ak] = await Promise.all([
    API.get('/api/jurnal?' + new URLSearchParams({ sampai })),
    API.get('/api/saldo-akun?' + new URLSearchParams({ dari, sampai })),
    API.get('/api/akun'),
  ]);
  const semua = jr || [];
  const sebelum = semua.filter(x => String(x.tanggal) < dari);
  const periode = semua.filter(x => String(x.tanggal) >= dari);
  const urut = (arr) => arr.slice().sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)) || String(a.id || '').localeCompare(String(b.id || '')));
  const sec = [];

  /* bagian akun pemasukan (dari saldo-akun) — mutasi = masuk(Debet) & tarik(Kredit) */
  const daftarMasuk = (sa.list || []).filter(r => Number(r.masuk) || Number(r.keluar) || Number(r.saldo_awal));
  daftarMasuk.forEach(r => {
    const nm = String(r.nama);
    const eD = urut(periode.filter(x => x.arah !== 'keluar' && String(x.akun || '') === nm)).map(x => ({ x, t: 'd' }));
    const eK = urut(periode.filter(x => x.arah === 'keluar' && String(x.sumber_dana || '') === nm)).map(x => ({ x, t: 'k' }));
    const gabung = eD.concat(eK).sort((a, b) => String(a.x.tanggal).localeCompare(String(b.x.tanggal)));
    let run = Number(r.saldo_awal) || 0;
    let tD = 0, tK = 0;
    const baris = [`<tr class="buka"><td colspan="3">Saldo Awal</td><td></td><td></td><td class="n">${lp2(run)}</td></tr>`];
    gabung.forEach(({ x, t }) => {
      const n = Number(x.nominal) || 0;
      const no = x.arah === 'keluar' ? (x.no_bkk || '') : (x.no_bkm || '');
      const ket = x.label_tagihan || x.keterangan || '–';
      if (t === 'd') { run += n; tD += n; } else { run -= n; tK += n; }
      baris.push(`<tr><td class="c nowrap">${tglLabel(x.tanggal)}</td><td class="c">${esc(no || '–')}</td><td>${esc(ket)}</td>
        <td class="n">${t === 'd' ? lp2(n) : ''}</td><td class="n">${t === 'k' ? lp2(n) : ''}</td><td class="n">${lp2(run)}</td></tr>`);
    });
    if (!gabung.length && !Number(r.saldo_awal)) return;
    sec.push({ nm, baris, tD, tK, run });
  });

  /* bagian akun pengeluaran — mutasi = keluar(Debet) terhadap akun biaya */
  const perKel = {}, perKelAwal = {};
  periode.forEach(x => { if (x.arah === 'keluar') { const a = String(x.akun || ''); perKel[a] = (perKel[a] || 0) + (Number(x.nominal) || 0); } });
  sebelum.forEach(x => { if (x.arah === 'keluar') { const a = String(x.akun || ''); perKelAwal[a] = (perKelAwal[a] || 0) + (Number(x.nominal) || 0); } });
  (ak.pengeluaran || []).forEach(nm => {
    if (!perKel[nm] && !perKelAwal[nm]) return;
    const eD = urut(periode.filter(x => x.arah === 'keluar' && String(x.akun || '') === nm));
    let run = Number(perKelAwal[nm]) || 0;
    let tD = 0;
    const baris = [`<tr class="buka"><td colspan="3">Saldo Awal</td><td></td><td></td><td class="n">${lp2(run)}</td></tr>`];
    eD.forEach(x => {
      const n = Number(x.nominal) || 0;
      run += n; tD += n;
      const ket = x.label_tagihan || x.keterangan || [x.sumber_dana].filter(Boolean).join(' ← ') || '–';
      baris.push(`<tr><td class="c nowrap">${tglLabel(x.tanggal)}</td><td class="c">${esc(x.no_bkk || '–')}</td><td>${esc(ket)}</td>
        <td class="n">${lp2(n)}</td><td></td><td class="n">${lp2(run)}</td></tr>`);
    });
    sec.push({ nm, baris, tD, tK: 0, run });
  });

  const lembar = sec.map((s, i) => `
    <div${i ? ' class="sec"' : ''}>
      <div class="sec-head"><span>No Akun : ${i + 1}</span><span>Nama Akun : ${esc(s.nm)}</span></div>
      <table><thead><tr><th class="c">Tanggal</th><th class="c">No Kwitansi</th><th>Jenis Transaksi</th><th class="n">Debet (Rp)</th><th class="n">Kredit (Rp)</th><th class="n">Saldo (Rp)</th></tr></thead>
      <tbody>${s.baris.join('')}</tbody>
      <tfoot><tr class="tot"><td colspan="3">TOTAL</td><td class="n">${lp2(s.tD)}</td><td class="n">${lp2(s.tK)}</td><td class="n">${lp2(s.run)}</td></tr></tfoot></table>
      ${lapTtd(set, sampai)}
    </div>`).join('');
  const body = lembar || `<p class="catatan">Tidak ada mutasi akun pada periode ini.</p>`;
  bukaCetakLaporan({ set, judul: 'BUKU BESAR', periodeTeks: lpPeriodeTeks(dari, sampai), body, tglTtd: sampai, ttd: false,
    catatan: 'Bagian akun pemasukan: Debet = pemasukan, Kredit = pengeluaran dari akun tersebut · bagian akun pengeluaran: Debet = beban periode.' });
}

/* ---------- 7/9. JURNAL KAS MASUK & KELUAR ---------- */
async function lapJurnalKas(dari, sampai, set, arah) {
  const jr = await API.get('/api/jurnal?' + new URLSearchParams({ sampai }));
  const sebelum = (jr || []).filter(x => String(x.tanggal) < dari);
  const saldoAwal = sebelum.reduce((a, x) => a + (x.arah === 'keluar' ? -1 : 1) * (Number(x.nominal) || 0), 0);
  const periode = (jr || []).filter(x => String(x.tanggal) >= dari && (x.arah === 'keluar') === (arah === 'keluar')).reverse();
  let run = saldoAwal, total = 0;
  const baris = periode.map(x => {
    const n = Number(x.nominal) || 0;
    run += (arah === 'keluar' ? -n : n);
    total += n;
    const no = arah === 'keluar' ? (x.no_bkk || '') : (x.no_bkm || '');
    const ket = x.label_tagihan || x.keterangan || [x.nama, x.akun].filter(Boolean).join(' — ') || '–';
    return `<tr><td class="c nowrap">${tglLabel(x.tanggal)}</td><td class="c">${esc(no || '–')}</td><td>${esc(ket)}</td>
      <td class="c">${esc(x.jenis_transaksi || '-')}</td><td class="n">${lp2(n)}</td><td class="n">${lp2(run)}</td></tr>`;
  }).join('');
  const judul = arah === 'keluar' ? 'JURNAL KAS KELUAR' : 'JURNAL KAS MASUK';
  const body = `
    <table><thead><tr>
      <th class="c">Tanggal</th><th class="c">${arah === 'keluar' ? 'No. BKK' : 'No. BKM'}</th><th>Keterangan</th><th class="c">Jenis</th>
      <th class="n">${arah === 'keluar' ? 'Kredit (Rp)' : 'Debet (Rp)'}</th><th class="n">Saldo (Rp)</th>
    </tr></thead>
    <tbody><tr class="buka"><td colspan="5">Saldo Awal Periode</td><td class="n">${lp2(saldoAwal)}</td></tr>
    ${baris || `<tr><td colspan="6" class="kosong">Tidak ada transaksi kas ${arah} pada periode ini.</td></tr>`}</tbody>
    <tfoot><tr class="tot"><td colspan="4">Total Kas ${arah === 'keluar' ? 'Keluar' : 'Masuk'} Periode</td><td class="n">${lp2(total)}</td><td class="n">${lp2(run)}</td></tr></tfoot></table>`;
  bukaCetakLaporan({ set, judul, periodeTeks: lpPeriodeTeks(dari, sampai), body, tglTtd: sampai,
    catatan: 'Saldo mengikuti saldo berjalan kas pesantren (masuk − keluar) s/d setiap transaksi.' });
}

/* ---------- KWITANSI KAS — kumpulan dokumen kwitansi per halaman (arah: masuk = BKM, keluar = BKK) ---------- */
/** CSS cetak 3 kwitansi per halaman — F4 potrait margin 0,5 cm, warna tetap; 1 lembar = tepat 3 kwitansi */
const KW3_CSS = `
@page { size: 215mm 330mm; margin: 0.5cm; }
*, *::before, *::after { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
html, body { margin:0; padding:0; background:#fff; }
.kw3-hal { display:flex; flex-direction:column; height:319mm; width:205mm; margin:0 auto; page-break-after: always; break-after: page;
  page-break-inside: avoid; break-inside: avoid; }
.kw3-hal:last-child { page-break-after: auto; break-after: auto; }
.kw3-slot { flex:1 1 0; min-height:0; overflow:hidden; position:relative; }
.kw3-slot .kw-receipt { transform-origin: top left; border-radius:0; margin:0; }
`;

/** Paksa muat 3 kwitansi tiap halaman: skala tiap kwitansi (transform) agar pas memenuhi slot-nya */
function fitKwitansi3(doc) {
  try {
    const root = doc || document;
    root.querySelectorAll('.kw3-slot').forEach(slot => {
      const rc = slot.querySelector('.kw-receipt');
      if (!rc) return;
      const sw = slot.clientWidth, sh = slot.clientHeight;
      if (!sw || !sh) return;
      rc.style.transform = 'none';
      rc.style.width = sw + 'px';
      let s = 1;
      for (let i = 0; i < 4; i++) {
        const h = rc.offsetHeight;
        if (!h) break;
        s = sh / h;
        if (!isFinite(s) || s <= 0) break;
        rc.style.width = Math.round(sw / s) + 'px';   /* lebar diperbesar dulu agar setelah diskalakan pas selebar halaman */
        rc.style.transform = 'scale(' + s + ')';
      }
    });
  } catch (e) {}
}

async function lapKwitansi(dari, sampai, set, arah, mode) {
  let masuk = [];
  let keluar = [];

  if (arah === 'masuk') {
    /* dokumen BKM: persis tampilan kwitansi penerimaan (kop hijau + rincian + tanda tangan) */
    const kw = await API.get('/api/kwitansi?' + new URLSearchParams({ dari, sampai, limit: 500 }));
    masuk = ((kw && kw.list) || []).slice()
      .sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)) || String(a.no_bkm).localeCompare(String(b.no_bkm)));
  } else {
    /* dokumen BKK: grup jurnal kas keluar per nomor BKK (1 kwitansi = 1 nomor) */
    const jr = await API.get('/api/jurnal?' + new URLSearchParams({ dari, sampai, arah: 'keluar' }));
    const grp = {};
    (jr || []).forEach(x => {
      const no = String(x.no_bkk || '(tanpa nomor)');
      if (!grp[no]) grp[no] = { no_bkk: no, tanggal: String(x.tanggal), nominal: 0, akun: '', sumber_dana: '', keterangan: '', dibayarkan: '', buki_nota: '', ttd_penerima: '' };
      const g = grp[no];
      if (String(x.tanggal) < g.tanggal) { g.tanggal = String(x.tanggal); }
      g.nominal += Number(x.nominal) || 0;
      if (!g.akun && x.akun) { g.akun = String(x.akun); }
      if (!g.sumber_dana && x.sumber_dana) { g.sumber_dana = String(x.sumber_dana); }
      if (!g.keterangan && x.keterangan) { g.keterangan = String(x.keterangan); }
      if (!g.dibayarkan) { g.dibayarkan = String(x.dibayarkan || x.nama || ''); }
      if (!g.buki_nota && x.bukti_nota) { g.buki_nota = String(x.bukti_nota); }
      if (!g.ttd_penerima && x.ttd_penerima) { g.ttd_penerima = String(x.ttd_penerima); }
    });
    keluar = Object.keys(grp).map(k => grp[k])
      .sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.no_bkk.localeCompare(b.no_bkk));
  }

  const dok = arah === 'masuk'
    ? masuk.map(x => kwReceiptHTML(x, set))
    : keluar.map(j => kwBkkHTML(j, set));
  if (!dok.length) { return toast('Tidak ada kwitansi kas ' + arah + ' pada periode ini', 'error'); }

  /* mode '3': paksakan 3 kwitansi per halaman F4 potrait, sisanya halaman terakhir */
  const mode3 = mode === '3';
  let hal;
  if (mode3) {
    hal = [];
    for (let i = 0; i < dok.length; i += 3) {
      hal.push('<div class="kw3-hal">' + dok.slice(i, i + 3).map(h => `<div class="kw3-slot">${h}</div>`).join('') + '</div>');
    }
  } else {
    hal = dok.map(h => `<div class="kw-hal">${h}</div>`);
  }

  let css = '';
  try { css = await cssUntukRender(); } catch (e) {}
  const w = window.open('', '_blank');
  if (!w) { return toast('Jendela cetak diblokir browser — izinkan pop-up lalu coba lagi', 'error'); }
  const doc = w.document;
  doc.open();
  doc.write(`<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>Kwitansi Kas ${arah === 'masuk' ? 'Masuk' : 'Keluar'}${mode3 ? ' — 3/Halaman' : ''} ${esc(lpPeriodeTeks(dari, sampai))}</title>
<style>${css}</style>
<style>${mode3 ? KW3_CSS : `
@page { size: 330mm 215mm; margin: 0.5cm; }
*, *::before, *::after { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
html, body { margin:0; padding:0; background:#fff; }
.kw-hal { page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid; margin:0 auto 6mm; }
.kw-hal:last-child { page-break-after: auto; break-after: auto; margin-bottom:0; }
.kw-receipt { width:100%; max-width:none; border-radius:0; }`}</style></head><body>
${hal.join('\n')}
</body></html>`);
  doc.close();
  w.focus();
  if (mode3) {
    /* skala setelah SEMUA gambar (logo/TTD/cap) termuat agar 1 lembar F4 tepat berisi 3 kwitansi */
    let selesai = false;
    const go = () => {
      if (selesai) return;
      selesai = true;
      try { fitKwitansi3(w.document); } catch (e) {}
      setTimeout(() => { try { w.print(); } catch (e) {} }, 200);
    };
    try { w.addEventListener('load', go); } catch (e) {}
    setTimeout(go, 1500);   /* jaring pengaman bila load tak datang */
  } else {
    setTimeout(() => { try { w.print(); } catch (e) {} }, 500);
  }
  toast(mode3
    ? `Membuka ${dok.length} kwitansi kas ${arah} — 1 lembar F4 berisi 3 kwitansi`
    : `Membuka ${hal.length} kwitansi kas ${arah} — pilih printer atau "Simpan sebagai PDF"`);
}

/* ---------- halaman pemilih: 11 jenis laporan ---------- */
async function pageLaporanCetak() {
  const d = new Date();
  const awal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  if (!STATE.lapCetak) STATE.lapCetak = { dari: awal, sampai: today() };
  const f = STATE.lapCetak;
  const [set, gj] = await Promise.all([
    API.get('/api/pengaturan'),
    API.get('/api/gaji').catch(() => ({ list: [] })),
  ]);
  if (STATE.page !== 'laporan-cetak') { return; }
  GJ.profil = set;   /* slip gaji cetak dari sini ikut berkop pesantren */
  const batches = (gj && gj.list) || [];
  const DAFTAR = [
    { id: 'keuangan', no: 1, ico: '📗', nama: 'Laporan Keuangan', desc: 'Pemasukan & pengeluaran per akun — Debet, Kredit, Saldo + total' },
    { id: 'saldo', no: 2, ico: '📙', nama: 'Laporan Saldo', desc: 'Saldo awal, debet, kredit & saldo akhir tiap akun + rincian BRI/BSI/BPD/Cash' },
    { id: 'hutang', no: 3, ico: '📘', nama: 'Laporan Saldo Hutang', desc: 'Saldo awal, angsuran, penambahan & saldo akhir tiap kreditur' },
    { id: 'jurnal', no: 4, ico: '📔', nama: 'Jurnal Umum', desc: 'Seluruh transaksi kas masuk & keluar — kolom kanal bank + Debet/Kredit/Saldo' },
    { id: 'rekap', no: 5, ico: '📋', nama: 'Rekap Pembayaran Santri', desc: 'Matriks santri × jenis iuran — nominal yang sudah dibayar' },
    { id: 'besar', no: 6, ico: '📓', nama: 'Buku Besar Akun', desc: 'Buku besar per akun pemasukan & pengeluaran — saldo awal, mutasi, TOTAL' },
    { id: 'jmasuk', no: 7, ico: '📥', nama: 'Jurnal Kas Masuk', desc: 'Daftar penerimaan kas (BKM) — Debet & saldo berjalan' },
    { id: 'kmasuk', no: 8, ico: '🧾', nama: 'Kwitansi Kas Masuk', desc: 'Kumpulan dokumen kwitansi penerimaan (BKM) — 1 lembar F4 potrait berisi 3 kwitansi (opsi: 1/halaman F4 landscape)' },
    { id: 'jkeluar', no: 9, ico: '📤', nama: 'Jurnal Kas Keluar', desc: 'Daftar pengeluaran kas (BKK) — Kredit & saldo berjalan' },
    { id: 'kkeluar', no: 10, ico: '📑', nama: 'Kwitansi Kas Keluar', desc: 'Kumpulan dokumen kwitansi pengeluaran (BKK) — 1 lembar F4 potrait berisi 3 kwitansi (opsi: 1/halaman F4 landscape)' },
    { id: 'slip', no: 11, ico: '💼', nama: 'Slip Gaji', desc: 'Slip BUKTI PENGELUARAN KAS per periode — pilih periode lalu cetak semua slip' },
  ];
  $('#content').innerHTML = `
    <div class="print-head">
      <h2>${esc(set.nama_pesantren)}</h2>
      <p>${esc(set.alamat)}</p>
      <p><strong>CETAK LAPORAN KEUANGAN</strong> — 11 jenis laporan resmi berkop &amp; tanda tangan Mudir/Bendahara · kertas F4 landscape margin 0,5 cm, warna tetap tercetak</p>
    </div>

    <div class="filters card card-pad no-print">
      <div class="field"><label>Dari</label><input type="date" id="lc-dari" value="${esc(f.dari)}"></div>
      <div class="field"><label>Sampai</label><input type="date" id="lc-sampai" value="${esc(f.sampai)}"></div>
      <button class="btn" id="lc-bulan">📅 Bulan Ini</button>
      <button class="btn" id="lc-kembali">← Laporan Keuangan</button>
      <span class="grow"></span>
      <span class="muted" style="font-size:12px">Periode berlaku untuk seluruh laporan · Slip Gaji memakai periode pada kartunya</span>
    </div>

    <div class="grid grid-3 mt no-print">
      ${DAFTAR.map(x => `
      <div class="card">
        <div class="card-pad">
          <div class="flex" style="gap:10px;align-items:center;margin-bottom:6px">
            <span style="font-size:24px;line-height:1">${x.ico}</span>
            <strong style="font-size:14.5px">${x.no}. ${x.nama}</strong>
          </div>
          <p class="muted" style="font-size:12px;margin:0 0 12px;min-height:34px">${x.desc}</p>
          ${x.id === 'slip' ? `
          <div class="field" style="margin-bottom:8px"><label>Periode Slip</label>
            <select id="lc-slip">${batches.length
              ? batches.map(b => `<option value="${esc(b.id)}">${esc(periodeLabel(b.periode))}${b.status === 'draf' ? ' (draf)' : ''}</option>`).join('')
              : '<option value="">— belum ada periode gaji —</option>'}</select></div>` : ''}
          <button class="btn btn-primary" style="width:100%" data-lc="${x.id}"${(x.id === 'kmasuk' || x.id === 'kkeluar') ? ' title="1 lembar F4 potrait = 3 kwitansi"' : ''}>🖨️ Cetak</button>
          ${(x.id === 'kmasuk' || x.id === 'kkeluar') ? `
          <button class="btn" style="width:100%;margin-top:6px" data-lc3="${x.id}" title="1 kwitansi per halaman F4 landscape">🖨️ 1/Halaman (F4 Landscape)</button>` : ''}
        </div>
      </div>`).join('')}
    </div>`;

  const apply = () => {
    STATE.lapCetak = { dari: $('#lc-dari').value || f.dari, sampai: $('#lc-sampai').value || f.sampai };
    pageLaporanCetak();
  };
  $('#lc-dari').onchange = apply;
  $('#lc-sampai').onchange = apply;
  $('#lc-bulan').onclick = () => { STATE.lapCetak = { dari: awal, sampai: today() }; pageLaporanCetak(); };
  $('#lc-kembali').onclick = () => { location.hash = '#/laporan'; };

  const PETA = {
    keuangan: lapKeuangan,
    saldo: lapSaldo,
    hutang: lapHutang,
    jurnal: lapJurnalUmum,
    rekap: lapRekapSantri,
    besar: lapBukuBesar,
    jmasuk: (a, b, s) => lapJurnalKas(a, b, s, 'masuk'),
    kmasuk: (a, b, s) => lapKwitansi(a, b, s, 'masuk', '3'),
    jkeluar: (a, b, s) => lapJurnalKas(a, b, s, 'keluar'),
    kkeluar: (a, b, s) => lapKwitansi(a, b, s, 'keluar', '3'),
  };
  $$('[data-lc]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.lc;
      const dari = f.dari, sampai = f.sampai;
      if (id === 'slip') {
        const bid = $('#lc-slip') ? $('#lc-slip').value : '';
        if (!bid) { return toast('Belum ada periode slip gaji untuk dicetak', 'error'); }
        btn.disabled = true;
        try { await cetakSlipSemua({ id: bid }); }
        catch (e) { toast(e.message || 'Gagal memuat slip gaji', 'error'); }
        finally { btn.disabled = false; }
        return;
      }
      const fn = PETA[id];
      if (!fn) { return; }
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = '⏳ Menyiapkan…';
      try { await fn(dari, sampai, set); }
      catch (e) { toast(e.message || 'Gagal menyiapkan laporan', 'error'); }
      finally { btn.disabled = false; btn.textContent = label; }
    };
  });

  /* opsi kwitansi: 1 kwitansi per halaman F4 landscape (utama = 3/halaman F4 potrait) */
  $$('[data-lc3]').forEach(btn => {
    btn.onclick = async () => {
      const arah = btn.dataset.lc3 === 'kkeluar' ? 'keluar' : 'masuk';
      btn.disabled = true;
      try { await lapKwitansi(f.dari, f.sampai, set, arah); }
      catch (e) { toast(e.message || 'Gagal menyiapkan kwitansi', 'error'); }
      finally { btn.disabled = false; }
    };
  });
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
  const ket = x.keterangan || '';                // dari keterangan entry — kosong bila tidak diisi
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
  const ketStr = x.keterangan || '';             // dari keterangan entry — kosong bila tidak diisi
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

/* Cetak = gambar dokumen (JPG/PNG) lewat #kw-print-img — sama dgn tampilan pratinjau */
function cetakDokumenGambar(src, alt) {
  return new Promise((resolve) => {
    let box = document.getElementById('kw-print-img');
    if (!box) {
      box = document.createElement('div');
      box.id = 'kw-print-img';
      document.body.appendChild(box);
    }
    box.innerHTML = '';
    const img = document.createElement('img');
    img.alt = alt || 'Dokumen';
    img.src = src;
    box.appendChild(img);
    document.body.classList.add('print-kwitansi-img');
    let sudah = false;
    const selesai = () => { if (sudah) return; sudah = true; resolve(); };
    const bersih = () => {
      document.body.classList.remove('print-kwitansi-img');
      box.remove();
      window.removeEventListener('afterprint', bersih);
      selesai();
    };
    window.addEventListener('afterprint', bersih);
    const mulai = () => {
      try { window.print(); } catch (e) {}
      selesai();
      /* fallback bila afterprint tidak terpicu */
      setTimeout(() => { if (document.body.classList.contains('print-kwitansi-img')) bersih(); }, 8000);
    };
    if (img.complete) { img.naturalWidth ? mulai() : bersih(); }
    else { img.onload = mulai; img.onerror = () => bersih(); }
  });
}

/* Cetak kwitansi = PNG yang sama dengan tombol Simpan PNG (gambar canvas penuh) */
async function cetakKwitansiCanvas(buatCanvas) {
  let cv;
  try { cv = await buatCanvas(); }
  catch (e) { return toast('Gagal membuat gambar kwitansi: ' + e.message, 'error'); }
  return cetakDokumenGambar(cv.toDataURL('image/png'), 'Kwitansi');
}

/* =========================================================
   RENDER SURAT TAGIHAN → JPG
   Clone DOM #surat-body (input → teks), gambar → data URL,
   CSS halaman di-embed tanpa blok @media → SVG foreignObject
   → canvas skala 2 → JPEG. Dipakai utk cetak, unduh JPG & lampiran WA.
   ========================================================= */
let cssRenderCache = '';
async function cssUntukRender() {
  if (cssRenderCache) return cssRenderCache;
  let css = '';
  try { css = await fetch('assets/style.css').then(r => (r.ok ? r.text() : '')); } catch (e) {}
  /* buang semua blok @media (print & layar) — render JPG selalu gaya layar */
  let out = '';
  for (let i = 0; i < css.length;) {
    const at = css.indexOf('@media', i);
    if (at < 0) { out += css.slice(i); break; }
    out += css.slice(i, at);
    let j = css.indexOf('{', at);
    if (j < 0) { break; }
    let depth = 0, k = j;
    for (; k < css.length; k++) {
      if (css[k] === '{') depth++;
      else if (css[k] === '}') { depth--; if (!depth) { k++; break; } }
    }
    i = k;
  }
  cssRenderCache = out;
  return cssRenderCache;
}

/* src → data URL tanpa navigasi (aman dari CORS); SVG dikonversi ke PNG
   supaya selalu bisa dirender di dalam SVG foreignObject */
async function imgKeDataURL(src) {
  if (!src) return '';
  if (/^data:image\/(png|jpe?g|webp|gif);/i.test(src)) return src;
  if (/^data:image\/svg/i.test(src)) return svgKePNG(src);
  try {
    const b = await fetch(src).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); });
    const url = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => rej(new Error('gagal baca gambar'));
      fr.readAsDataURL(b);
    });
    if (/^data:image\/svg/i.test(url)) return svgKePNG(url);
    return url;
  } catch (e) { return ''; }
}

async function svgKePNG(url) {
  try {
    const im = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('svg gagal dimuat'));
      i.src = url;
    });
    const w = im.naturalWidth || 200, h = im.naturalHeight || 200;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(im, 0, 0, w, h);
    return c.toDataURL('image/png');
  } catch (e) { return ''; }
}

async function domJPG(elId, label) {
  const asli = document.getElementById(elId);
  if (!asli) { throw new Error(label + ' belum dipilih'); }
  const W = Math.max(320, Math.round(asli.getBoundingClientRect().width));

  const clone = asli.cloneNode(true);
  /* input → teks biasa supaya nilai ikut terekam */
  clone.querySelectorAll('input, textarea').forEach(inp => {
    const sp = document.createElement('span');
    sp.className = inp.className;
    sp.textContent = inp.value != null ? inp.value : '';
    inp.replaceWith(sp);
  });
  /* gambar → data URL; gagal → hilangkan (cegah canvas tainted) */
  const imgsAsli = [...asli.querySelectorAll('img')];
  const imgsClone = [...clone.querySelectorAll('img')];
  await Promise.all(imgsClone.map(async (im, i) => {
    const s = await imgKeDataURL(imgsAsli[i] ? (imgsAsli[i].currentSrc || imgsAsli[i].src) : im.src);
    if (s) im.src = s; else im.remove();
  }));

  const css  = await cssUntukRender();
  const sb   = getComputedStyle(document.body);
  const rs   = getComputedStyle(document.documentElement);
  let vars = '';
  try {
    for (const p of rs) { if (p.startsWith('--')) vars += p + ':' + rs.getPropertyValue(p).trim() + ';'; }
  } catch (e) {}
  const wrapStyle = vars
    + 'box-sizing:border-box;margin:0;padding:0;background:#fff;color:' + sb.color
    + ';font-family:' + sb.fontFamily + ';font-size:' + sb.fontSize + ';line-height:' + sb.lineHeight + ';';

  /* ukur tinggi clone pada container offscreen (lebar eksplisit) */
  const box = document.createElement('div');
  box.style.cssText = 'position:absolute;left:-10000px;top:0;width:' + W + 'px;visibility:hidden;';
  const root = document.createElement('div');
  root.setAttribute('style', wrapStyle);
  root.appendChild(clone);
  box.appendChild(root);
  document.body.appendChild(box);
  const H = Math.max(40, Math.ceil(clone.getBoundingClientRect().height));
  box.remove();

  const isi = new XMLSerializer().serializeToString(clone);
  const svg = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '">'
    + '<style>' + css.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</style>'
    + '<foreignObject width="' + W + '" height="' + H + '">'
    + '<div xmlns="http://www.w3.org/1999/xhtml" style="' + wrapStyle.replace(/"/g, '&quot;') + '">' + isi + '</div>'
    + '</foreignObject></svg>';

  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const im = await new Promise((res, rej) => {
    const i2 = new Image();
    i2.onload = () => res(i2);
    i2.onerror = () => rej(new Error('render SVG ke gambar gagal'));
    i2.src = url;
  });
  const S = 2;
  const cv = document.createElement('canvas');
  cv.width = W * S; cv.height = H * S;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
  g.drawImage(im, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.92);
}

/* JPG elemen #surat-body (surat tagihan) & #slip-body (slip gaji) — pipeline render sama */
async function suratJPG() { return domJPG('surat-body', 'Surat tagihan'); }
function slipJPG() { return domJPG('slip-body', 'Slip gaji'); }

/* Cetak surat tagihan = JPG yang sama persis dgn pratinjau */
async function cetakSuratTagihan() {
  const jpg = await suratJPG();
  return cetakDokumenGambar(jpg, 'Surat Tagihan');
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
  const f = STATE.kwitansi = Object.assign({ q: '', dari: '', sampai: '', pilih: '', lihat: false }, STATE.kwitansi);
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
        <div class="card-head">
          <div class="flex" style="gap:8px;flex-wrap:wrap;min-width:0">
            <h3>🧾 Pratinjau Kwitansi</h3>
            <span class="muted">${it ? esc(it.no_bkm) + ' — ' + esc(it.nama) + (f.lihat ? '' : ' · tersembunyi') : 'belum dipilih'}</span>
          </div>
          <div class="flex no-print" style="gap:2px">
            <button class="btn-icon" id="k-lihat" ${it ? '' : 'disabled'} title="${it ? (f.lihat ? 'Sembunyikan pratinjau' : 'Lihat pratinjau ' + esc(it.no_bkm)) : 'Pilih dulu salah satu BKM'}">${f.lihat ? '🙈' : '👁️'}</button>
            <button class="btn-icon" id="k-cetak" ${it ? '' : 'disabled'} title="Cetak kwitansi">🖨️</button>
            <button class="btn-icon" id="k-wa" ${it ? '' : 'disabled'} title="Kirim WhatsApp ke wali">📱</button>
            <button class="btn-icon" id="k-png" ${it ? '' : 'disabled'} title="Simpan PNG">⬇️</button>
            <button class="btn-icon" id="k-riwayat" title="Riwayat kirim WhatsApp">🕓</button>
          </div>
        </div>
        ${it ? (f.lihat ? `<div class="card-pad">${kwReceiptHTML(it, set)}</div>` : '')
            : `<div class="card-pad">${kwReceiptHTML(null, set)}</div>`}
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
  $$('[data-kw]').forEach(r => r.onclick = () => { f.pilih = r.dataset.kw; f.lihat = false; pageKwitansi(); });

  /* --- riwayat --- */
  const muatRiwayat = async () => {
    const box = $('#k-riwayat-body');
    try {
      const r = await API.get('/api/kwitansi?act=riwayat');
      const rl = Array.isArray(r.list) ? r.list : [];
      box.innerHTML = rl.length ? `<table>
        <thead><tr><th>Dibuat</th><th>Dokumen</th><th>Nama</th><th>No HP</th><th>Status</th><th>Catatan</th></tr></thead>
        <tbody>${rl.map(a => `<tr>
          <td class="nowrap">${a.dibuat ? tglLabel(String(a.dibuat).slice(0, 10)) : '-'} <span class="muted">${String(a.dibuat || '').slice(11, 16)}</span></td>
          <td class="nowrap"><span class="badge ${a.tipe === 'surat' ? 'sebagian' : 'lunas'}">${a.tipe === 'surat' ? 'Surat' : 'Kwitansi'}</span><br><strong>${esc(a.ref || a.no_bkm || '-')}</strong></td>
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

  /* --- lihat / sembunyikan pratinjau --- */
  const btnLihat = $('#k-lihat');
  if (btnLihat && it) btnLihat.onclick = () => { f.lihat = !f.lihat; pageKwitansi(); };

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

  /* --- kirim WhatsApp: langsung antre + gambar kwitansi, tanpa dialog pilihan --- */
  const btnWa = $('#k-wa');
  if (btnWa && it) btnWa.onclick = async () => {
    const hp = String(it.no_wa || it.no_wa_santri || '').trim();
    if (!hp) return toast('Tidak ada No WA wali untuk BKM ini — isi dulu di Data Santri', 'error');
    btnWa.disabled = true;
    try {
      const pesan = `Assalamualaikum.${it.nama ? ' ' + it.nama : ''}\nTerlampir kwitansi penerimaan No. ${it.no_bkm} sebesar ${fmt(it.nominal)}${it.label_tagihan ? ' untuk ' + it.label_tagihan : ''}.\n- ${set.nama_pesantren}`;
      const gambar = (await kwitansiCanvas(it, set)).toDataURL('image/png');
      await API.post('/api/kwitansi', {
        act: 'kirim-wa', no_bkm: it.no_bkm,
        nama: it.nama || '', no_hp: hp,
        pesan, gambar
      });
      toast('Kwitansi masuk antrean kirim WhatsApp');
      await pageKwitansi();
      const rw = $('#kw-riwayat');
      if (rw) { rw.hidden = false; muatRiwayat(); }
    } catch (e) { toast(e.message, 'error'); }
    finally { if (btnWa.isConnected) btnWa.disabled = false; }
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
            <div class="field full"><label>Alamat / Sekretariat</label><textarea id="p-alamat">${esc(p.alamat)}</textarea></div>
            <div class="field"><label>Web (kop surat)</label><input id="p-web" value="${esc(p.web || '')}" placeholder="ponpesashshidiq.com"></div>
            <div class="field"><label>Telp/Hp (kop surat)</label><input id="p-telp" value="${esc(p.telp || '')}" placeholder="085642010902"></div>
            <div class="field"><label>Tahun Ajaran</label><input id="p-ta" value="${esc(p.tahun_ajaran)}" placeholder="2025/2026"></div>
            <div class="field"><label>Logo Teks (2-3 huruf)</label><input id="p-logo" value="${esc(p.logo_teks)}" maxlength="3" placeholder="PP"></div>
            <div class="field"><label>Kota (footer kwitansi)</label><input id="p-kota" value="${esc(p.kota || '')}" placeholder="Ngawen"><span class="hint">Dipakai utk "Kota, tanggal" pada kwitansi.</span></div>
            <div class="field"><label>Saldo Awal Kas (Rp)</label><input type="number" id="p-saldo" value="${p.saldo_awal}" step="1000"><span class="hint">Saldo sebelum semua transaksi dicatat.</span></div>

            <div class="field full"><label>🖼️ Logo Pesantren (gambar)</label>
              <div class="upload-row">
                <img class="up-prev" id="p-logo-prev" src="${esc(p.logo || '')}" ${p.logo ? '' : 'hidden'} alt="logo">
                <input type="file" id="p-logo-file" accept="image/*" hidden>
                <button type="button" class="btn btn-sm" id="p-logo-pick">Pilih gambar logo</button>
                <button type="button" class="btn btn-sm btn-danger" id="p-logo-del" ${p.logo ? '' : 'hidden'}>Hapus logo</button>
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

    <div class="card mt">
      <div class="card-head"><h3>📚 Akun Pemasukan &amp; Pengeluaran</h3>
        <button class="btn btn-sm btn-primary" id="ak-add">＋ Tambah Akun</button></div>
      <div class="card-pad">
        <p class="hint" style="margin-top:0">Kelola daftar akun yang muncul pada form Jurnal Kas
          (<strong>Akun Pemasukan</strong>, <strong>Akun Pengeluaran</strong> &amp; <strong>Sumber Dana</strong>).
          Akun baru langsung bisa dipakai; mengubah nama ikut menyesuaikan seluruh jurnal lama.
          Kolom <strong>Saldo Awal</strong> pada akun pemasukan diisi angka saldo sebelum periode — ikut menambah
          <strong>Saldo Akhir</strong> pada Laporan Saldo, Laporan Keuangan &amp; Buku Besar (akun 🔒 kas khusus diatur per santri di Data Santri).
          Akun bertanda 🔒 tidak bisa diubah/dihapus.</p>
        <div class="grid grid-2">
          <div>
            <strong>⬆️ Akun Pemasukan</strong>
            <div class="table-wrap mt" id="ak-tb-masuk"></div>
          </div>
          <div>
            <strong>⬇️ Akun Pengeluaran</strong>
            <div class="table-wrap mt" id="ak-tb-keluar"></div>
          </div>
        </div>
      </div>
    </div>

    <div id="akun-login" class="mt"></div>

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
      <div class="card-head"><h3>🔗 Koneksi WA Bridge</h3><span class="badge belum" id="wa-status">…</span></div>
      <div class="card-pad">
        <p class="hint" style="margin-top:0">Hubungkan ke WA Bridge (Node) agar laporan terkirim ke WhatsApp wali.<br>
          Bridge: <code>npm install</code> lalu <code>npm start</code> di folder <code>bot/</code> (isi <code>API_URL</code> &amp; <code>PORT</code>, opsional <code>WA_KEY</code>), lalu tekan <strong>Cek Status Bridge</strong> dan scan QR.<br>
          Panggilan ke bridge diteruskan server (<code>api.php</code>), jadi bridge diakses dari server — bukan langsung dari browser.</p>
        <div class="form-grid">
          <div class="field"><label>URL Bridge (contoh: http://127.0.0.1:3210 atau https://wa.example.com)</label>
            <input id="wb-url" placeholder="http://127.0.0.1:3210" value="${esc(p.wa_bridge_url || '')}" autocomplete="off"></div>
          <div class="field"><label>Key Bridge (X-WA-Key)</label>
            <input id="wb-key" placeholder="WA_KEY di bot (opsional)" value="${esc(p.wa_bridge_key || '')}" autocomplete="off"></div>
        </div>
        <div class="wb-baris">
          <span class="wb-switch" id="wb-switch"></span>
          <span id="wb-aktif-label">WhatsApp Aktif: <strong>—</strong></span>
        </div>
        <div class="flex" style="gap:8px;flex-wrap:wrap">
          <button class="btn" id="wb-cek">🔍 Cek Status Bridge</button>
          <button class="btn" id="wb-tes">⚡ Tes Koneksi</button>
          <button class="btn btn-primary" id="wb-rekap-pilih">📤 Tes Kirim Rekap (Pilih Santri)</button>
          <button class="btn btn-success" id="wb-rekap-semua">📣 Kirim Rekap Sekarang (Semua)</button>
        </div>
        <div class="wb-antrian">
          <div style="flex:1;min-width:260px">
            <div style="font-size:13.5px">Status Antrian Pengiriman: <span id="wb-antri-txt">memuat…</span></div>
            <p class="hint" id="wb-antri-sub" style="margin:4px 0 0">—</p>
          </div>
          <div class="flex" style="gap:8px">
            <button class="btn" id="wb-antri-refresh">Perbarui Antrian</button>
            <button class="btn btn-danger" id="wb-antri-batal" disabled>Batalkan Pengiriman</button>
          </div>
        </div>
      </div>
      <div class="card-pad" style="border-top:1px solid var(--border);padding-bottom:0"><strong>🔑 Login / QR &amp; Kode Pairing</strong></div>
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

  /* --- unggah gambar (logo / TTD / cap) ---
     Gambar dikompres dulu di browser (maks sisi 900px, PNG/JPEG) supaya body JSON
     tetap kecil — upload besar sering ditolak server (post_max_size) dan dulu
     gagal diam-diam dengan toast "tersimpan" palsu. */
  const gambarKeDataUri = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const maks = 900;
        const skala = Math.min(1, maks / Math.max(im.naturalWidth, im.naturalHeight));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(im.naturalWidth * skala));
        cv.height = Math.max(1, Math.round(im.naturalHeight * skala));
        const g = cv.getContext('2d');
        /* PNG/WebP/GIF/SVG boleh punya transparansi → latar putih hanya utk JPEG */
        const pakaiPng = !/^image\/jpe?g$/i.test(file.type || '');
        if (!pakaiPng) { g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); }
        g.drawImage(im, 0, 0, cv.width, cv.height);
        let out = cv.toDataURL(pakaiPng ? 'image/png' : 'image/jpeg', 0.85);
        /* PNG bisa membengkak → turunkan dimensi sampai muat ~600 KB */
        for (let i = 0; i < 3 && out.length > 600 * 1024; i++) {
          cv.width = Math.max(1, Math.round(cv.width * 0.65));
          cv.height = Math.max(1, Math.round(cv.height * 0.65));
          g.drawImage(im, 0, 0, cv.width, cv.height);
          out = cv.toDataURL(pakaiPng ? 'image/png' : 'image/jpeg', 0.85);
        }
        if (out.length > 4 * 1024 * 1024) return reject(new Error('Gambar terlalu besar — pilih gambar lain'));
        resolve(out);
      } catch (e) { reject(new Error('Gagal memproses gambar: ' + (e.message || e))); }
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('File bukan gambar yang bisa dibaca')); };
    im.src = url;
  });

  const pasangUnggah = (pick, file, prev) => {
    const bPick = $('#' + pick), bFile = $('#' + file), bPrev = $('#' + prev);
    if (!bPick || !bFile || !bPrev) return;
    bPick.onclick = () => bFile.click();
    bFile.onchange = async () => {
      const f = bFile.files[0];
      bFile.value = '';
      if (!f) return;
      const tipe = f.type || ('x/' + (f.name.split('.').pop() || ''));
      if (!/^image\//i.test(tipe)) return toast('File harus berupa gambar', 'error');
      if (f.size > 8 * 1024 * 1024) return toast('Ukuran gambar maks 8 MB', 'error');
      const label = bPick.textContent;
      bPick.disabled = true; bPick.textContent = 'Memproses…';
      try {
        const b64 = await gambarKeDataUri(f);
        bPrev.src = b64; bPrev.hidden = false; bPrev.dataset.b64 = b64;
        const err = bPrev.nextElementSibling;
        if (err && err.classList.contains('up-err')) err.remove();
      } catch (e) { toast(e.message, 'error'); }
      finally { bPick.disabled = false; bPick.textContent = label; }
    };
  };
  pasangUnggah('p-logo-pick', 'p-logo-file', 'p-logo-prev');
  pasangUnggah('p-ttdm-pick', 'p-ttdm-file', 'p-ttdm-prev');
  pasangUnggah('p-ttdb-pick', 'p-ttdb-file', 'p-ttdb-prev');
  pasangUnggah('p-cap-pick', 'p-cap-file', 'p-cap-prev');

  /* --- hapus logo: langsung ke server, tampilan kembali ke logo teks --- */
  const btnHapusLogo = $('#p-logo-del');
  if (btnHapusLogo) btnHapusLogo.onclick = async () => {
    const prev = $('#p-logo-prev');
    btnHapusLogo.disabled = true;
    try {
      await API.put('/api/pengaturan', { logo: '' });
      if (prev) { prev.removeAttribute('src'); delete prev.dataset.b64; prev.hidden = true; }
      const err = prev && prev.nextElementSibling;
      if (err && err.classList.contains('up-err')) err.remove();
      btnHapusLogo.hidden = true;
      loadHeader();
      toast('Logo dihapus — kembali ke logo teks');
    } catch (e) { toast(e.message, 'error'); }
    finally { if (btnHapusLogo.isConnected) btnHapusLogo.disabled = false; }
  };

  /* path tersimpan menunjuk file yang tak ada (404) → sembunyikan gambar rusak,
     tampilkan petunjuk supaya user tahu harus memilih ulang */
  $$('.up-prev').forEach((im) => {
    const tandai = () => {
      if (!im.getAttribute('src') || im.dataset.b64) return;
      im.hidden = true;
      if (im.nextElementSibling && im.nextElementSibling.classList.contains('up-err')) return;
      const s = document.createElement('span');
      s.className = 'hint up-err';
      s.textContent = '⚠ Gambar tidak ditemukan di server — pilih ulang lalu Simpan.';
      im.insertAdjacentElement('afterend', s);
    };
    im.addEventListener('error', tandai);
    if (im.complete && im.naturalWidth === 0) tandai();
  });

  $('#p-save').onclick = async () => {
    try {
      const payload = {
        nama_pesantren: $('#p-nama').value.trim(), alamat: $('#p-alamat').value.trim(),
        kota: ($('#p-kota') ? $('#p-kota').value.trim() : ''),
        web: ($('#p-web') ? $('#p-web').value.trim() : ''),
        telp: ($('#p-telp') ? $('#p-telp').value.trim() : ''),
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

      const tombol = $('#p-save');
      const teks = tombol.textContent;
      tombol.disabled = true; tombol.textContent = 'Menyimpan…';
      let hasil;
      try { hasil = await API.put('/api/pengaturan', payload); }
      finally { tombol.disabled = false; tombol.textContent = teks; }

      /* pastikan gambar benar-benar diterima server, bukan hanya "tersimpan" */
      const cek = [
        ['logo', bLogo, '#p-logo-prev'], ['ttd_mudir', bTtdM, '#p-ttdm-prev'],
        ['ttd_bendahara', bTtdB, '#p-ttdb-prev'], ['cap', bCap, '#p-cap-prev']
      ];
      const gagal = cek.filter(([k, kirim]) => kirim && (!hasil || !hasil[k]));
      if (gagal.length) {
        toast('Teks tersimpan, tapi gambar (' + gagal.map(g => g[0]).join(', ') + ') ditolak server', 'error');
      } else {
        toast('Pengaturan tersimpan');
      }
      /* gambar sudah tersimpan di server → buang salinan base64 di halaman */
      cek.forEach(([, , sel]) => { const el = $(sel); if (el) delete el.dataset.b64; });
      const delLogo = $('#p-logo-del');
      if (delLogo) delLogo.hidden = !(hasil && hasil.logo);
      loadHeader(); refreshSaldo();
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

  /* --- WA Bridge: proxy status (server ke bridge) + rekap + status antrian --- */
  const wbSetAktif = (aktif, teks) => {
    const sw = $('#wb-switch'); if (sw) sw.classList.toggle('on', !!aktif);
    const lb = $('#wb-aktif-label');
    if (lb) lb.innerHTML = 'WhatsApp Aktif: <strong>' + esc(teks || (aktif ? 'Aktif' : 'Tidak Aktif')) + '</strong>';
  };
  const wbSimpan = async () => {
    const url = ($('#wb-url').value || '').trim(), key = ($('#wb-key').value || '').trim();
    if ((p.wa_bridge_url || '') !== url || (p.wa_bridge_key || '') !== key) {
      await API.put('/api/pengaturan', { wa_bridge_url: url, wa_bridge_key: key });
      p.wa_bridge_url = url; p.wa_bridge_key = key;
    }
  };
  const wbCek = async (senyap) => {
    await wbSimpan();
    const r = await API.get('/api/wa?act=bridge');
    const d = r.data || {};
    const login = !!d.login;
    wbSetAktif(login, login ? ('Aktif' + (d.no ? ' · ' + d.no : '')) : 'Tidak Aktif');
    if (!senyap) {
      if (r.ok && login) toast('Bridge aktif — bot login' + (d.no ? ' (' + d.no + ')' : ''));
      else if (r.ok) toast('Bridge terhubung, tetapi bot BELUM login — scan QR di bawah', 'error');
      else toast('Bridge HTTP ' + (r.http || '?') + (r.error ? ': ' + r.error : (r.teks ? ' — ' + r.teks : '')), 'error');
    }
    return r;
  };
  $('#wb-cek').onclick = async () => {
    const b = $('#wb-cek'); b.disabled = true;
    try { await wbCek(false); } catch (e) { toast(e.message, 'error'); wbSetAktif(false, 'Tidak Aktif'); }
    finally { b.disabled = false; }
  };
  $('#wb-tes').onclick = async () => {
    const b = $('#wb-tes'); b.disabled = true;
    try {
      await wbSimpan();
      const r = await API.get('/api/wa?act=bridge');
      if (r.ok) toast('Bridge terhubung — HTTP ' + r.http + ', ' + r.rtt_ms + ' ms' + (r.data && r.data.login ? ' (bot login)' : ''));
      else toast('Gagal: ' + (r.error || ('HTTP ' + r.http)) + (r.teks ? ' — ' + r.teks : ''), 'error');
    } catch (e) { toast(e.message, 'error'); }
    finally { b.disabled = false; }
  };

  const wbAntrian = async () => {
    try {
      const r = await API.get('/api/kwitansi?act=status-antre');
      const n = (r.antre || 0) + (r.proses || 0);
      const txt = $('#wb-antri-txt');
      if (txt) txt.innerHTML = n
        ? '<strong>Antrian: ' + n + ' Pesan</strong> (' + (r.antre || 0) + ' antre, ' + (r.proses || 0) + ' proses)'
        : '<strong>Antrian Kosong (0 Pesan)</strong>';
      const sub = $('#wb-antri-sub');
      if (sub) sub.textContent = n
        ? (r.pending || []).map(x => (x.tipe === 'surat' ? 'Surat ' : x.tipe === 'rekap' ? 'Rekap ' : 'Kwitansi ') + (x.ref || '-') + ' → ' + x.no_hp + ' (' + x.status + ')').join(' · ')
        : 'Tidak ada pesan dalam antrian pengiriman.';
      const bBatal = $('#wb-antri-batal');
      if (bBatal) bBatal.disabled = !n;
    } catch (e) {
      const txt = $('#wb-antri-txt');
      if (txt) txt.textContent = 'Gagal memuat: ' + e.message;
    }
  };
  $('#wb-antri-refresh').onclick = wbAntrian;
  $('#wb-antri-batal').onclick = async () => {
    if (!confirm('Batalkan semua pesan yang masih dalam antrian pengiriman?')) return;
    try {
      const r = await API.post('/api/kwitansi', { act: 'batal-antre' });
      toast((r.dibatalkan || 0) + ' pesan dibatalkan');
      wbAntrian();
    } catch (e) { toast(e.message, 'error'); }
  };

  $('#wb-rekap-pilih').onclick = async () => {
    try {
      const santri = await API.get('/api/santri');
      if (!santri.length) return toast('Belum ada santri', 'error');
      openModal('Tes Kirim Rekap (Pilih Santri)', `
        <div class="field full"><label>Santri</label>
          <select id="wr-santri">${santri.map(s => `<option value="${esc(s.id)}">${esc(s.nama)} — ${esc(s.kelas || '-')}</option>`).join('')}</select></div>
        <p class="hint" style="margin-top:10px">Pesan berisi ringkasan tagihan sisa (per hari ini) + total, dikirim ke <strong>No WA wali</strong> dari Data Santri melalui antrean bot. Pastikan bridge &amp; bot sudah login.</p>`,
        `<button class="btn" onclick="closeModal()">Batal</button><button class="btn btn-primary" id="wr-kirim">📤 Antrekan Rekap</button>`);
      $('#wr-kirim').onclick = async () => {
        const b = $('#wr-kirim'); b.disabled = true;
        try {
          const r = await API.post('/api/wa', { act: 'rekap', santri_ids: [$('#wr-santri').value] });
          closeModal();
          toast(r.dibuat ? 'Rekap masuk antrean kirim WhatsApp' : 'Tidak dibuat — santri tanpa No WA', r.dibuat ? '' : 'error');
          wbAntrian();
        } catch (e) { toast(e.message, 'error'); b.disabled = false; }
      };
    } catch (e) { toast(e.message, 'error'); }
  };
  $('#wb-rekap-semua').onclick = async () => {
    if (!confirm('Kirim rekap tagihan ke SEMUA santri yang masih punya tagihan sisa (melalui antrean bot)?')) return;
    const b = $('#wb-rekap-semua'); b.disabled = true;
    try {
      const r = await API.post('/api/wa', { act: 'rekap', semua: true });
      toast(r.dibuat + ' rekap masuk antrean' + (r.dilewati ? ' · ' + r.dilewati + ' dilewati (tanpa tagihan sisa / tanpa No WA)' : ''));
      wbAntrian();
    } catch (e) { toast(e.message, 'error'); }
    finally { b.disabled = false; }
  };

  wbAntrian();
  if (p.wa_bridge_url) { wbCek(true).catch(() => {}); }

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

  /* --- Kelola akun pemasukan / pengeluaran --- */
  let AKUN = null;
  const loadAkun = async () => {
    try { AKUN = await API.get('/api/akun'); }
    catch (e) { return toast(e.message, 'error'); }
    const sistem = new Set(AKUN.sistem || []), terikat = new Set(AKUN.terikat || []), baru = new Set(AKUN.baru || []);
    const saldoMap = AKUN.saldo || {};
    const barisAkun = (nama, jenis) => {
      const kS = sistem.has(nama), kT = terikat.has(nama);
      const label = [
        baru.has(nama) ? '<span class="badge cash" title="Akun tambahan">baru</span>' : '',
        kS ? '<span class="badge bank" title="Akun sistem kas khusus — tidak bisa diubah/dihapus">🔒 sistem</span>' : '',
        (!kS && kT) ? '<span class="badge belum" title="Dipakai pemetaan tagihan iuran — tidak bisa dihapus">🏷️ tagihan</span>' : ''
      ].filter(Boolean).join(' ');
      /* kolom Saldo Awal hanya di tabel pemasukan — menambah saldo akhir laporan */
      const kolomSaldo = jenis !== 'masuk' ? '' : (kS
        ? `<td class="muted" style="font-size:12px;white-space:nowrap" title="Saldo awal akun kas khusus diatur per santri pada menu Data Santri">per santri</td>`
        : `<td style="white-space:nowrap"><input type="number" class="ak-saldo" data-nama="${esc(nama)}" value="${Number(saldoMap[nama]) || 0}" step="any" min="0"
             style="width:120px;padding:5px 7px" title="Saldo awal akun ini — menambah saldo akhir pada Laporan Saldo &amp; Buku Besar"></td>`);
      return `<tr>
        <td>${esc(nama)} ${label}</td>
        ${kolomSaldo}
        <td class="actions">
          ${kS ? '' : `<button class="btn btn-sm" data-akun-ubah="${esc(nama)}" title="Ubah nama akun">Ubah</button>`}
          ${(kS || kT) ? '' : `<button class="btn btn-sm btn-danger" data-akun-hapus="${esc(nama)}" title="Hapus akun">Hapus</button>`}
        </td></tr>`;
    };
    const isiKolom = (list, jenis) => {
      if (!list || !list.length) { return '<p class="hint muted" style="padding:8px 0">Belum ada akun.</p>'; }
      const head = jenis === 'masuk'
        ? '<thead><tr><th>Akun</th><th>Saldo Awal (Rp)</th><th></th></tr></thead>'
        : '<thead><tr><th>Akun</th><th></th></tr></thead>';
      return `<table>${head}<tbody>${list.map(n => barisAkun(n, jenis)).join('')}</tbody></table>`;
    };
    $('#ak-tb-masuk').innerHTML   = isiKolom(AKUN.pemasukan, 'masuk');
    $('#ak-tb-keluar').innerHTML  = isiKolom(AKUN.pengeluaran, 'keluar');
    $$('[data-akun-ubah]').forEach(b => b.onclick = () => modalUbahAkun(b.dataset.akunUbah));
    $$('[data-akun-hapus]').forEach(b => b.onclick = () => hapusAkun(b.dataset.akunHapus));
    $$('.ak-saldo').forEach(inp => {
      inp.onchange = async () => {
        const nama = inp.dataset.nama;
        const v = Math.max(0, Number(inp.value) || 0);
        inp.disabled = true;
        try {
          await API.put('/api/akun', { nama_lama: nama, saldo_awal: v });
          toast('Saldo awal "' + nama + '" = ' + fmt(v) + ' — menambah saldo akhir laporan');
          loadAkun();
        } catch (e) { toast(e.message, 'error'); inp.disabled = false; }
      };
    });
  };

  const modalUbahAkun = (nama) => {
    openModal('Ubah Nama Akun', `
      <div class="field full"><label>Nama saat ini</label><input value="${esc(nama)}" disabled></div>
      <div class="field full"><label>Nama baru</label><input id="ak-nama-baru" value="${esc(nama)}"></div>
      <p class="hint" style="margin-bottom:0">Perubahan nama ikut diterapkan ke seluruh jurnal, pembagian &amp; riwayat kas yang memakai akun ini — termasuk pemetaan tagihan iuran.</p>`,
      `<button class="btn" onclick="closeModal()">Batal</button><button class="btn btn-primary" id="ak-ubah-ok">Simpan</button>`);
    $('#ak-ubah-ok').onclick = async () => {
      const baruNama = $('#ak-nama-baru').value.trim();
      if (!baruNama) return toast('Nama baru wajib diisi', 'error');
      if (baruNama === nama) return toast('Nama baru sama dengan nama lama', 'error');
      const b = $('#ak-ubah-ok'); b.disabled = true;
      try {
        const r = await API.put('/api/akun', { nama_lama: nama, nama_baru: baruNama });
        toast('Akun diubah → ' + r.nama_baru + (r.jurnal ? ' • ' + r.jurnal + ' jurnal disesuaikan' : ''));
        closeModal(); loadAkun();
      } catch (e) { toast(e.message, 'error'); b.disabled = false; }
    };
  };

  const hapusAkun = async (nama) => {
    if (!confirm('Hapus akun "' + nama + '"?\n\nAkun yang masih dipakai transaksi tidak bisa dihapus.')) return;
    try {
      const r = await API.del('/api/akun?nama=' + encodeURIComponent(nama));
      toast('Akun "' + r.nama + '" dihapus'); loadAkun();
    } catch (e) { toast(e.message, 'error'); }
  };

  $('#ak-add').onclick = () => {
    openModal('Tambah Akun', `
      <div class="form-grid">
        <div class="field"><label>Jenis</label><select id="ak-jenis"><option value="masuk">Pemasukan</option><option value="keluar">Pengeluaran</option></select></div>
        <div class="field grow"><label>Nama Akun</label><input id="ak-nama" placeholder="mis. Biaya Keamanan"></div>
      </div>
      <p class="hint" style="margin-bottom:0">Akun baru langsung muncul pada pilihan di form Jurnal Kas.</p>`,
      `<button class="btn" onclick="closeModal()">Batal</button><button class="btn btn-primary" id="ak-tambah-ok">Simpan</button>`);
    $('#ak-tambah-ok').onclick = async () => {
      const nama = $('#ak-nama').value.trim();
      if (!nama) return toast('Nama akun wajib diisi', 'error');
      const b = $('#ak-tambah-ok'); b.disabled = true;
      try {
        await API.post('/api/akun', { jenis: $('#ak-jenis').value, nama });
        toast('Akun "' + nama + '" ditambahkan'); closeModal(); loadAkun();
      } catch (e) { toast(e.message, 'error'); b.disabled = false; }
    };
  };
  loadAkun();

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

  pageAkun();
}

/* =========================================================
   AKUN LOGIN — ganti sandi admin + kelola akun wali santri
   ========================================================= */
async function pageAkun() {
  const box = $('#akun-login');
  if (!box) return;
  box.innerHTML = `<div class="card card-pad muted">Memuat daftar akun…</div>`;
  let d;
  try { d = await API.get('/api/pengguna'); }
  catch (e) { box.innerHTML = `<div class="card card-pad">⚠️ ${esc(e.message)}</div>`; return; }

  const list = d.list || [];
  const admin = list.find(x => x.peran === 'admin' && x.username === SESI.username) || list.find(x => x.peran === 'admin');
  const wali = list.filter(x => x.peran === 'wali');
  const upjList = list.filter(x => x.peran === 'upj');
  const barisWali = wali.length ? wali.map(u => `
    <tr>
      <td><strong>${esc(u.nama)}</strong><br><small class="muted">@${esc(u.username)}</small></td>
      <td>${esc(u.nama_santri || '—')}${u.kelas ? `<br><small class="muted">${esc(u.kelas)}</small>` : ''}</td>
      <td>${u.aktif ? '<span class="badge aktif">aktif</span>' : '<span class="badge cuti">nonaktif</span>'}</td>
      <td class="no-print" style="text-align:right;white-space:nowrap">
        <button class="btn btn-sm" data-pret="${esc(u.santri_id)}" ${u.santri_id ? '' : 'disabled'}>Pratinjau</button>
        <button class="btn btn-sm" data-edit="${esc(u.id)}">Ubah</button>
        <button class="btn btn-sm btn-danger" data-hapus="${esc(u.id)}">Hapus</button>
      </td>
    </tr>`).join('') : `<tr><td colspan="4" class="muted">Belum ada akun wali. Buat satu agar orang tua santri bisa melihat tagihan & saldo.</td></tr>`;

  const barisUpj = upjList.length ? upjList.map(u => `
    <tr>
      <td><strong>${esc(u.nama)}</strong><br><small class="muted">@${esc(u.username)}</small></td>
      <td>Kas Khusus Keluar</td>
      <td>${u.aktif ? '<span class="badge aktif">aktif</span>' : '<span class="badge cuti">nonaktif</span>'}</td>
      <td class="no-print" style="text-align:right;white-space:nowrap">
        <button class="btn btn-sm" data-editupj="${esc(u.id)}">Ubah</button>
        <button class="btn btn-sm btn-danger" data-hapusupj="${esc(u.id)}">Hapus</button>
      </td>
    </tr>`).join('') : `<tr><td colspan="4" class="muted">Belum ada akun UPJ. Buat satu untuk petugas yang hanya boleh mencatat Kas Khusus Keluar.</td></tr>`;

  box.innerHTML = `
    <div class="card">
      <div class="card-head">
        <div><h3>🔐 Akun Login &amp; Hak Akses</h3>
          <span class="muted">Akun admin untuk pengurus · akun wali untuk portal orang tua · akun UPJ untuk Kas Khusus Keluar</span></div>
        <div class="flex" style="gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm btn-primary" id="a-tambah">＋ Akun Wali</button>
          <button class="btn btn-sm" id="a-tambah-upj">＋ Akun UPJ</button>
        </div>
      </div>
      <div class="card-pad">
        <div class="grid grid-2">
          <div class="akun-box">
            <strong>👤 Akun Admin Anda</strong>
            <p class="muted" style="font-size:12.5px;margin:6px 0 12px">Nama pengguna &amp; kata sandi utk masuk ke aplikasi pengurus.</p>
            <div class="form-grid">
              <div class="field full"><label>Nama Pengguna</label>
                <input id="a-user" value="${esc(admin ? admin.username : SESI.username || '')}" autocapitalize="none" autocomplete="off"></div>
              <div class="field"><label>Kata Sandi Baru</label>
                <input type="password" id="a-sandi-baru" placeholder="kosongkan bila tidak diganti" autocomplete="new-password"></div>
              <div class="field"><label>Ulangi Sandi Baru</label>
                <input type="password" id="a-sandi-ulang" placeholder="••••••••" autocomplete="new-password"></div>
            </div>
            <button class="btn btn-primary" style="margin-top:12px" id="a-simpan">💾 Simpan Akun Admin</button>
          </div>
          <div class="akun-box">
            <strong>🛡️ Hak Akses</strong>
            <div class="akun-hak">
              <div><span class="badge aktif">admin</span><p>Semua menu: jurnal kas, santri, laporan, pengaturan, backup, kelola akun.</p></div>
              <div><span class="badge sebagian">wali</span><p>Hanya portal santri anaknya: tagihan bulanan, tunggakan, saldo &amp; mutasi uang saku/tabungan/tagihan lain, ganti sandi sendiri.</p></div>
              <div><span class="badge sebagian">upj</span><p>Hanya <strong>Kas Khusus Keluar</strong>: saldo pengeluaran (gabungan kas khusus), tarik tunai, entry kas keluar kas khusus, mutasi &amp; rekap Uang Saku / Tabungan / Tagihan Lain.</p></div>
            </div>
            <p class="hint" style="margin-top:10px">Akun dibuat → pemiliknya masuk lewat halaman yang sama (nama pengguna &amp; sandi dari pesantren).</p>
          </div>
        </div>

        <div class="table-wrap" style="margin-top:16px">
          <table>
            <thead><tr><th>Akun Wali</th><th>Santri</th><th>Status</th><th class="no-print" style="text-align:right">Aksi</th></tr></thead>
            <tbody>${barisWali}</tbody>
          </table>
        </div>

        <div class="table-wrap" style="margin-top:16px">
          <table>
            <thead><tr><th>Akun UPJ</th><th>Hak Akses</th><th>Status</th><th class="no-print" style="text-align:right">Aksi</th></tr></thead>
            <tbody>${barisUpj}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  $('#a-simpan').onclick = async () => {
    if (!admin) return toast('Akun admin tidak ditemukan', 'error');
    const user = $('#a-user').value.trim();
    const s1 = $('#a-sandi-baru').value, s2 = $('#a-sandi-ulang').value;
    if (s1 && s1 !== s2) return toast('Ulangi kata sandi tidak sama', 'error');
    const body = {};
    if (user && user !== admin.username) body.username = user;
    if (s1) body.sandi = s1;
    if (!Object.keys(body).length) return toast('Tidak ada perubahan', 'error');
    try {
      const r = await API.put('/api/pengguna/' + admin.id, body);
      toast(r.pesan);
      $('#a-sandi-baru').value = ''; $('#a-sandi-ulang').value = '';
      if (body.username) SESI.username = body.username;
      if (SESI.sandi_default && body.sandi) { SESI.sandi_default = false; $('#sandiBanner').hidden = true; }
      pageAkun();
    } catch (e) { toast(e.message, 'error'); }
  };

  $('#a-tambah').onclick = () => formAkunWali(null, list, () => pageAkun());
  $('#a-tambah-upj').onclick = () => formAkunUpj(null, list, () => pageAkun());

  $$('[data-editupj]', box).forEach(b => b.onclick = () => formAkunUpj(b.dataset.editupj, list, () => pageAkun()));
  $$('[data-hapusupj]', box).forEach(b => b.onclick = async () => {
    const u = list.find(x => x.id === b.dataset.hapusupj);
    if (!confirm(`Hapus akun UPJ "${u ? u.nama : ''}"? Petugas tersebut tidak bisa lagi membuka Kas Khusus Keluar.`)) return;
    try { const r = await API.del('/api/pengguna/' + b.dataset.hapusupj); toast(r.pesan); pageAkun(); }
    catch (e) { toast(e.message, 'error'); }
  });

  $$('[data-edit]', box).forEach(b => b.onclick = () => formAkunWali(b.dataset.edit, list, () => pageAkun()));
  $$('[data-pret]', box).forEach(b => b.onclick = () => pratinjauPortal(b.dataset.pret));
  $$('[data-hapus]', box).forEach(b => b.onclick = async () => {
    const u = list.find(x => x.id === b.dataset.hapus);
    if (!confirm(`Hapus akun wali "${u ? u.nama : ''}"? Santri tersebut tidak bisa lagi membuka portal.`)) return;
    try { const r = await API.del('/api/pengguna/' + b.dataset.hapus); toast(r.pesan); pageAkun(); }
    catch (e) { toast(e.message, 'error'); }
  });
}

/* form tambah/ubah akun wali — pilih santri + username (default no. WA) */
async function formAkunWali(id, list, selesai) {
  let santri = [];
  try { santri = await API.get('/api/santri'); } catch (e) { return toast('Gagal memuat data santri: ' + e.message, 'error'); }
  const lama = id ? list.find(x => x.id === id) : null;
  const dipakai = {};
  list.forEach(u => { if (u.peran === 'wali' && u.santri_id && u.id !== (id || '')) dipakai[u.santri_id] = true; });
  const opsi = santri.map(s => `<option value="${esc(s.id)}" ${lama && lama.santri_id === s.id ? 'selected' : (dipakai[s.id] ? 'disabled' : '')}>
      ${esc(s.nama)} — ${esc(s.kelas || '')}${dipakai[s.id] ? ' (sudah punya akun)' : ''}</option>`).join('');

  openModal(lama ? 'Ubah Akun Wali' : 'Tambah Akun Wali', `
    <div class="form-grid">
      <div class="field full"><label>Santri</label>
        <select id="f-santri">${opsi || '<option value="">Belum ada data santri</option>'}</select>
        <span class="hint">Portal hanya menampilkan tagihan &amp; saldo santri ini.</span></div>
      <div class="field"><label>Nama Pengguna</label>
        <input id="f-user" value="${esc(lama ? lama.username : '')}" placeholder="otomatis dari no. WA" autocapitalize="none" autocomplete="off"></div>
      <div class="field"><label>Nama Tampilan</label>
        <input id="f-nama" value="${esc(lama ? lama.nama : '')}" placeholder="Wali Ahmad"></div>
      <div class="field"><label>${lama ? 'Kata Sandi Baru (opsional)' : 'Kata Sandi'}</label>
        <input type="password" id="f-sandi" placeholder="min. 4 karakter" autocomplete="new-password"></div>
      <div class="field"><label>Status</label>
        <select id="f-aktif">
          <option value="1" ${!lama || lama.aktif ? 'selected' : ''}>Aktif</option>
          <option value="0" ${lama && !lama.aktif ? 'selected' : ''}>Nonaktif</option>
        </select></div>
    </div>`,
    `<button class="btn" onclick="closeModal()">Batal</button>
     <button class="btn btn-primary" id="f-simpan">${lama ? 'Simpan Perubahan' : 'Buat Akun'}</button>`, 560);

  const sel = $('#f-santri');
  const isiUserDariSantri = () => {
    if (lama || $('#f-user').value.trim()) return;
    const s = santri.find(x => x.id === sel.value);
    const wa = String((s && (s.no_wa || s.telepon)) || '').replace(/\D/g, '');
    if (wa) $('#f-user').value = wa;
    if (s && !$('#f-nama').value.trim()) $('#f-nama').value = 'Wali ' + s.nama;
  };
  sel.onchange = isiUserDariSantri;
  isiUserDariSantri();

  $('#f-simpan').onclick = async () => {
    const body = {
      peran: 'wali',
      santri_id: sel.value,
      username: $('#f-user').value.trim(),
      nama: $('#f-nama').value.trim(),
      aktif: $('#f-aktif').value === '1'
    };
    const s = $('#f-sandi').value;
    if (s) body.sandi = s;
    if (!body.santri_id) return toast('Pilih santri terlebih dahulu', 'error');
    if (!body.username) return toast('Nama pengguna wajib diisi', 'error');
    try {
      const r = lama ? await API.put('/api/pengguna/' + id, body) : await API.post('/api/pengguna', body);
      toast(r.pesan || (lama ? 'Akun diperbarui' : 'Akun dibuat'));
      closeModal();
      selesai && selesai();
    } catch (e) { toast(e.message, 'error'); }
  };
}

/* form tambah/ubah akun UPJ — petugas Kas Khusus Keluar (tanpa santri) */
function formAkunUpj(id, list, selesai) {
  const lama = id ? list.find(x => x.id === id) : null;
  openModal(lama ? 'Ubah Akun UPJ' : 'Tambah Akun UPJ', `
    <div class="form-grid">
      <div class="field"><label>Nama Pengguna</label>
        <input id="fu-user" value="${esc(lama ? lama.username : '')}" placeholder="mis. upj1" autocapitalize="none" autocomplete="off"></div>
      <div class="field"><label>Nama Tampilan</label>
        <input id="fu-nama" value="${esc(lama ? lama.nama : '')}" placeholder="Petugas UPJ"></div>
      <div class="field"><label>${lama ? 'Kata Sandi Baru (opsional)' : 'Kata Sandi'}</label>
        <input type="password" id="fu-sandi" placeholder="min. 4 karakter" autocomplete="new-password"></div>
      <div class="field"><label>Status</label>
        <select id="fu-aktif">
          <option value="1" ${!lama || lama.aktif ? 'selected' : ''}>Aktif</option>
          <option value="0" ${lama && !lama.aktif ? 'selected' : ''}>Nonaktif</option>
        </select></div>
    </div>
    <p class="hint">Akun UPJ <strong>hanya bisa membuka Kas Khusus Keluar</strong> — saldo pengeluaran (gabungan Uang Saku + Tabungan + Tagihan Lain), tarik tunai, entry kas keluar kas khusus, serta mutasi &amp; rekap ketiganya. Menu lain tidak muncul dan ditolak server.</p>`,
    `<button class="btn" onclick="closeModal()">Batal</button>
     <button class="btn btn-primary" id="fu-simpan">${lama ? 'Simpan Perubahan' : 'Buat Akun'}</button>`, 560);

  $('#fu-simpan').onclick = async () => {
    const body = {
      peran: 'upj',
      username: $('#fu-user').value.trim(),
      nama: $('#fu-nama').value.trim(),
      aktif: $('#fu-aktif').value === '1'
    };
    const s = $('#fu-sandi').value;
    if (s) body.sandi = s;
    if (!body.username) return toast('Nama pengguna wajib diisi', 'error');
    if (!lama && !body.sandi) return toast('Kata sandi wajib diisi', 'error');
    try {
      const r = lama ? await API.put('/api/pengguna/' + id, body) : await API.post('/api/pengguna', body);
      toast(r.pesan || (lama ? 'Akun diperbarui' : 'Akun dibuat'));
      closeModal();
      selesai && selesai();
    } catch (e) { toast(e.message, 'error'); }
  };
}

/* pratinjau portal wali oleh admin (data pakai &santri_id=) */
async function pratinjauPortal(idSantri) {
  openModal('Pratinjau Portal Wali', `<div class="empty"><div class="empty-ico">⏳</div><p>Memuat…</p></div>`, `<button class="btn" onclick="closeModal()">Tutup</button>`, 560);
  try {
    const [ring, tg] = await Promise.all([
      API.get('/api/wali?santri_id=' + encodeURIComponent(idSantri)),
      API.get('/api/wali?sub=tagihan&santri_id=' + encodeURIComponent(idSantri))
    ]);
    const s = ring.santri || {}, saldo = ring.saldo || {}, tb = ring.tagihan_bulan || {};
    const rows = (tg.list || []).slice(0, 8).map(r => waliBarisTagihan(r)).join('')
      || '<p class="muted" style="font-size:13px">Tidak ada tagihan.</p>';
    $('#modalBody').innerHTML = `
      <div class="wali-hero">
        <div><span class="wali-hero-label">Portal milik</span>
          <strong>${esc(s.nama)}</strong>
          <span class="wali-hero-sub">${esc(s.kelas || '')}${s.asrama ? ' · ' + esc(s.asrama) : ''}</span></div>
        <span class="badge ${s.status === 'aktif' ? 'aktif' : 'cuti'}">${esc(s.status || '-')}</span>
      </div>
      <div class="wali-saldo-grid">
        ${WALI_AKUN.map(a => `<div class="wali-saldo"><span class="wali-saldo-ico">${a.ico}</span>
          <span class="wali-saldo-nama">${a.nama}</span><strong>${fmt(saldo[a.key] || 0)}</strong></div>`).join('')}
      </div>
      <div class="wali-total">
        <div><span>Tagihan ${esc(periodeLabel(tb.periode || thisMonth()))}</span><strong>${fmt(tb.sisa || 0)}</strong></div>
        <div><span>Total Belum Lunas</span><strong class="merah">${fmt(ring.sisa_semua || 0)}</strong></div>
      </div>
      <div class="card" style="margin-top:12px"><div class="card-pad"><div class="wali-rows">${rows}</div></div></div>
      <p class="hint" style="margin-top:10px">Itu tampilan yang dilihat wali — hanya data santri ini, tanpa menu pengurus.</p>`;
  } catch (e) {
    $('#modalBody').innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><p>${esc(e.message)}</p></div>`;
  }
}

/* =========================================================
   PORTAL WALI SANTRI — mobile first
   ========================================================= */
const WALI_AKUN = [
  { k: 'uang-saku',    ico: '🪙', nama: 'Uang Saku',    key: 'uang_saku' },
  { k: 'tabungan',     ico: '🏦', nama: 'Tabungan',     key: 'tabungan' },
  { k: 'tagihan-lain', ico: '📄', nama: 'Tagihan Lain', key: 'tagihan_lain' }
];
const WALI_STATE = { akun: 'uang-saku', arah: 'semua', periode: '', status: '', dari: '', sampai: '' };
let WALI_RINGKAS = null;

function waliMuat() {
  $('#waliContent').innerHTML = `<div class="empty"><div class="empty-ico">⏳</div><p>Memuat data…</p></div>`;
}
function waliGagal(e) {
  $('#waliContent').innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><p>${esc(e.message || e)}</p>
    <button class="btn" id="wali-ulang">Coba Lagi</button></div>`;
  $('#wali-ulang').onclick = () => navigate();
}
async function waliAmbil(sub, params) {
  const q = new URLSearchParams(Object.assign({ sub: sub || 'ringkas' }, params || {}));
  const d = await API.get('/api/wali?' + q.toString());
  if (d.santri && d.santri.nama) $('#waliNamaSantri').textContent = d.santri.nama;
  if (sub === 'ringkas' || !sub) WALI_RINGKAS = d;
  return d;
}
function waliNavAktif(key) { $$('#waliNav a').forEach(a => a.classList.toggle('active', a.dataset.w === key)); }

function waliBarisTagihan(r, bisaKlik) {
  return `<div class="wali-row${bisaKlik ? ' klik' : ''}" ${bisaKlik ? `data-tag="${esc(r.id)}"` : ''}>
    <div class="wali-row-utama">
      <strong>${esc(r.label)}</strong>
      <span class="muted">${esc(r.periode)}${(r.dibayar || 0) > 0 ? ' · dibayar ' + fmt(r.dibayar) : ''}</span>
    </div>
    <div class="wali-row-kanan">
      <strong class="${r.sisa > 0 ? 'merah' : 'hijau'}">${r.sisa > 0 ? fmt(r.sisa) : 'Lunas'}</strong>
      <span class="badge ${esc(r.status)}">${esc(r.status)}</span>
    </div>
  </div>`;
}

/* ---------------- Beranda ---------------- */
async function waliBeranda() {
  waliMuat();
  let d;
  try { d = await waliAmbil('ringkas'); } catch (e) { return waliGagal(e); }
  const c = $('#waliContent');
  const s = d.santri || {}, saldo = d.saldo || {}, tb = d.tagihan_bulan || {}, tg = d.tunggakan || {};
  const kartuSaldo = WALI_AKUN.map(a => `
    <button class="wali-saldo" type="button" data-akun="${a.k}">
      <span class="wali-saldo-ico">${a.ico}</span>
      <span class="wali-saldo-nama">${a.nama}</span>
      <strong>${fmt(saldo[a.key] || 0)}</strong>
      <span class="wali-saldo-sub">Lihat mutasi ›</span>
    </button>`).join('');
  const rowsBulan = (tb.rows || []).slice(0, 4).map(r => waliBarisTagihan(r)).join('')
    || `<p class="muted" style="font-size:13px;margin:0">Tidak ada tagihan pada bulan ini.</p>`;
  const rowsTunggak = (tg.rows || []).slice(0, 3).map(r => waliBarisTagihan(r, true)).join('');

  c.innerHTML = `
    <div class="wali-hero">
      <div>
        <span class="wali-hero-label">Assalamu'alaikum</span>
        <strong>${esc(s.nama || SESI.nama || '')}</strong>
        <span class="wali-hero-sub">${esc(s.kelas || '')}${s.asrama ? ' · ' + esc(s.asrama) : ''}${s.nis ? ' · NIS ' + esc(s.nis) : ''}</span>
      </div>
      <span class="badge ${s.status === 'aktif' ? 'aktif' : 'cuti'}">${esc(s.status || '-')}</span>
    </div>

    <div class="wali-saldo-grid">${kartuSaldo}</div>

    <div class="wali-total">
      <div><span>Total Saldo Kas Khusus</span><strong class="hijau">${fmt(saldo.total || 0)}</strong></div>
      <div><span>Total Tagihan Belum Lunas</span><strong class="merah">${fmt(d.sisa_semua || 0)}</strong></div>
    </div>

    <div class="card">
      <div class="card-head">
        <div><h3>🧾 Tagihan ${esc(periodeLabel(tb.periode || thisMonth()))}</h3>
          <span class="muted">${tb.jumlah || 0} tagihan · sisa ${fmt(tb.sisa || 0)}</span></div>
        <a class="btn btn-sm" href="#/wali/tagihan">Lihat Semua</a>
      </div>
      <div class="card-pad">
        <div class="wali-progress">
          <div class="progress"><span style="width:${tb.persen || 0}%"></span></div>
          <span class="muted">Lunas ${tb.persen || 0}% — dibayar ${fmt(tb.dibayar || 0)} dari ${fmt(tb.total || 0)}</span>
        </div>
        <div class="wali-rows">${rowsBulan}</div>
      </div>
    </div>

    ${tg.jumlah ? `
    <div class="card">
      <div class="card-head">
        <div><h3>⏰ Tunggakan</h3><span class="muted">${tg.jumlah} tagihan · ${fmt(tg.total)}</span></div>
        <a class="btn btn-sm" href="#/wali/tagihan">Detail</a>
      </div>
      <div class="card-pad"><div class="wali-rows">${rowsTunggak}</div></div>
    </div>` : ''}

    <p class="wali-footer muted">Data diperbarui langsung dari pesantren · akun <strong>${esc(SESI.username || '')}</strong></p>
  `;
  $$('.wali-saldo', c).forEach(b => b.onclick = () => { WALI_STATE.akun = b.dataset.akun; location.hash = '#/wali/mutasi'; });
  $$('[data-tag]', c).forEach(el => el.onclick = () => waliRiwayat(d.tunggakan.rows.find(r => r.id === el.dataset.tag)));
}

/* ---------------- Tagihan ---------------- */
async function waliTagihan() {
  waliMuat();
  let d;
  const q = {};
  if (WALI_STATE.periode) q.periode = WALI_STATE.periode;
  if (WALI_STATE.status) q.status = WALI_STATE.status;
  try { d = await waliAmbil('tagihan', q); } catch (e) { return waliGagal(e); }
  const c = $('#waliContent');
  const ring = d.ringkas || {};
  const chipPeriode = [{ p: '', label: 'Semua' }].concat((d.rekap || []).map(r => ({ p: r.periode, label: periodeLabel(r.periode) })))
    .map(x => `<button class="chip${WALI_STATE.periode === x.p ? ' aktif' : ''}" data-periode="${esc(x.p)}">${esc(x.label)}</button>`).join('');
  const chipStatus = [['', 'Semua'], ['belum', 'Belum'], ['sebagian', 'Sebagian'], ['lunas', 'Lunas']]
    .map(([v, l]) => `<button class="chip${WALI_STATE.status === v ? ' aktif' : ''}" data-status="${esc(v)}">${l}</button>`).join('');
  const rows = (d.list || []).map(r => waliBarisTagihan(r, true)).join('')
    || `<div class="empty"><div class="empty-ico">🧾</div><p>Tidak ada tagihan pada filter ini.</p></div>`;

  c.innerHTML = `
    <div class="wali-total">
      <div><span>Total Tagihan</span><strong>${fmt(ring.total || 0)}</strong></div>
      <div><span>Sudah Dibayar</span><strong class="hijau">${fmt(ring.dibayar || 0)}</strong></div>
      <div><span>Sisa</span><strong class="merah">${fmt(ring.sisa || 0)}</strong></div>
    </div>
    <div class="wali-filter">
      <span class="wali-filter-label">Periode</span>
      <div class="wali-chips">${chipPeriode}</div>
      <span class="wali-filter-label">Status</span>
      <div class="wali-chips">${chipStatus}</div>
    </div>
    <div class="card"><div class="card-pad"><div class="wali-rows">${rows}</div>
      <p class="muted" style="font-size:12px;margin-top:10px">Menampilkan ${d.jumlah || 0} dari ${ring.jumlah || 0} tagihan — tap baris utk riwayat pembayaran.</p>
    </div></div>
  `;
  $$('[data-periode]', c).forEach(b => b.onclick = () => { WALI_STATE.periode = b.dataset.periode; waliTagihan(); });
  $$('[data-status]', c).forEach(b => b.onclick = () => { WALI_STATE.status = b.dataset.status; waliTagihan(); });
  $$('[data-tag]', c).forEach(el => el.onclick = () => {
    const r = (d.list || []).find(x => x.id === el.dataset.tag);
    waliRiwayat(r);
  });
}

function waliRiwayat(r) {
  if (!r) return;
  const riw = (r.riwayat || []);
  const body = `
    <div class="wali-riwayat">
      <div class="flex" style="justify-content:space-between">
        <div><strong>${esc(r.label)}</strong><br><span class="muted">${esc(r.periode)} · ${esc(r.jenis || '')}</span></div>
        <span class="badge ${esc(r.status)}">${esc(r.status)}</span>
      </div>
      <div class="wali-total" style="margin-top:12px">
        <div><span>Tagihan</span><strong>${fmt(r.nominal || 0)}</strong></div>
        <div><span>Dibayar</span><strong class="hijau">${fmt(r.dibayar || 0)}</strong></div>
        <div><span>Sisa</span><strong class="${r.sisa > 0 ? 'merah' : 'hijau'}">${fmt(r.sisa || 0)}</strong></div>
      </div>
      <h4 style="margin:14px 0 8px;font-size:13px">Riwayat Pembayaran</h4>
      ${riw.length ? riw.map(p => `
        <div class="wali-row">
          <div class="wali-row-utama"><strong>${fmt(p.jumlah)}</strong>
            <span class="muted">${tglLabel(p.tanggal)}${p.metode ? ' · ' + esc(p.metode) : ''}</span></div>
          <div class="wali-row-kanan"><span class="muted">${esc(p.keterangan || '')}</span></div>
        </div>`).join('') : '<p class="muted" style="font-size:13px">Belum ada pembayaran.</p>'}
    </div>`;
  openModal('Riwayat Tagihan', body, `<button class="btn" onclick="closeModal()">Tutup</button>`, 480);
}

/* ---------------- Mutasi uang saku / tabungan / tagihan lain ---------------- */
async function waliMutasi() {
  waliMuat();
  const akun = WALI_AKUN.find(a => a.k === WALI_STATE.akun) || WALI_AKUN[0];
  const q = { akun: akun.k };
  if (WALI_STATE.arah && WALI_STATE.arah !== 'semua') q.arah = WALI_STATE.arah;
  if (WALI_STATE.dari) q.dari = WALI_STATE.dari;
  if (WALI_STATE.sampai) q.sampai = WALI_STATE.sampai;
  let d;
  try { d = await waliAmbil('mutasi', q); } catch (e) { return waliGagal(e); }
  const c = $('#waliContent');
  const tabAkun = WALI_AKUN.map(a => `<button class="chip${a.k === akun.k ? ' aktif' : ''}" data-akun="${a.k}">${a.ico} ${a.nama}</button>`).join('');
  const chipArah = [['', 'Semua'], ['masuk', 'Masuk'], ['keluar', 'Keluar']]
    .map(([v, l]) => `<button class="chip${WALI_STATE.arah === (v || 'semua') ? ' aktif' : ''}" data-arah="${esc(v)}">${l}</button>`).join('');
  const rows = (d.list || []).map(x => `
    <div class="wali-row">
      <div class="wali-row-utama">
        <strong>${esc(x.label_tagihan || x.keterangan || (x.arah === 'masuk' ? 'Pemasukan' : 'Pengeluaran'))}</strong>
        <span class="muted">${tglLabel(x.tanggal)}${x.no_bkm ? ' · ' + esc(x.no_bkm) : (x.no_bkk ? ' · ' + esc(x.no_bkk) : '')}</span>
      </div>
      <div class="wali-row-kanan">
        <strong class="${x.arah === 'masuk' ? 'hijau' : 'merah'}">${x.arah === 'masuk' ? '+' : '−'}${fmt(x.nominal)}</strong>
        <span class="muted">Saldo ${fmt(x.saldo)}</span>
      </div>
    </div>`).join('')
    || `<div class="empty"><div class="empty-ico">📒</div><p>Belum ada mutasi ${esc(akun.nama)}.</p></div>`;

  c.innerHTML = `
    <div class="wali-filter">
      <div class="wali-chips">${tabAkun}</div>
      <span class="wali-filter-label">Arah Transaksi</span>
      <div class="wali-chips">${chipArah}</div>
      <span class="wali-filter-label">Rentang Tanggal</span>
      <div class="wali-tanggal">
        <input type="date" id="m-dari" value="${esc(WALI_STATE.dari)}">
        <span class="muted">s/d</span>
        <input type="date" id="m-sampai" value="${esc(WALI_STATE.sampai)}">
        <button class="btn btn-sm" id="m-terapkan">Terapkan</button>
        ${(WALI_STATE.dari || WALI_STATE.sampai) ? '<button class="btn btn-sm" id="m-reset">Reset</button>' : ''}
      </div>
    </div>

    <div class="wali-total">
      <div><span>Saldo Awal</span><strong>${fmt(d.saldo_awal || 0)}</strong></div>
      <div><span>Masuk</span><strong class="hijau">${fmt(d.total_masuk || 0)}</strong></div>
      <div><span>Keluar</span><strong class="merah">${fmt(d.total_keluar || 0)}</strong></div>
      <div><span>Saldo Akhir</span><strong>${fmt(d.saldo_akhir || 0)}</strong></div>
    </div>

    <div class="card">
      <div class="card-head"><div><h3>${akun.ico} Mutasi ${esc(akun.nama)}</h3>
        <span class="muted">${d.jumlah || 0} transaksi ditampilkan</span></div></div>
      <div class="card-pad"><div class="wali-rows">${rows}</div></div>
    </div>
  `;
  $$('[data-akun]', c).forEach(b => b.onclick = () => { WALI_STATE.akun = b.dataset.akun; waliMutasi(); });
  $$('[data-arah]', c).forEach(b => b.onclick = () => { WALI_STATE.arah = b.dataset.arah || 'semua'; waliMutasi(); });
  const terapkan = () => {
    WALI_STATE.dari = $('#m-dari').value;
    WALI_STATE.sampai = $('#m-sampai').value;
    waliMutasi();
  };
  $('#m-terapkan').onclick = terapkan;
  if ($('#m-reset')) $('#m-reset').onclick = () => { WALI_STATE.dari = ''; WALI_STATE.sampai = ''; waliMutasi(); };
}

/* ---------------- Akun wali ---------------- */
function waliAkun() {
  waliNavAktif('akun');
  const s = (WALI_RINGKAS && WALI_RINGKAS.santri) || null;
  const c = $('#waliContent');
  c.innerHTML = `
    <div class="card"><div class="card-pad wali-profil">
      <div class="wali-avatar">${esc((SESI.nama || 'W').trim().slice(0, 1).toUpperCase())}</div>
      <strong>${esc(SESI.nama || '')}</strong>
      <span class="muted">@${esc(SESI.username || '')}</span>
      ${s ? `<span class="wali-profil-santri">${esc(s.nama)} · ${esc(s.kelas || '')}</span>` : ''}
    </div></div>

    <div class="card">
      <div class="card-head"><h3>🔑 Ganti Kata Sandi</h3></div>
      <div class="card-pad">
        <div class="form-grid">
          <div class="field full"><label>Kata Sandi Lama</label>
            <input type="password" id="ak-lama" autocomplete="current-password" placeholder="••••••••"></div>
          <div class="field full"><label>Kata Sandi Baru (min. 4 karakter)</label>
            <input type="password" id="ak-baru" autocomplete="new-password" placeholder="••••••••"></div>
          <div class="field full"><button class="btn btn-primary btn-block" id="ak-save">💾 Simpan Kata Sandi</button></div>
        </div>
      </div>
    </div>

    <div class="card card-pad wali-keluar">
      <strong>🚪 Keluar dari Akun</strong>
      <p class="muted" style="font-size:12.5px;margin:6px 0 12px">Anda akan keluar dari portal wali di perangkat ini.</p>
      <button class="btn btn-danger btn-block" id="ak-keluar">Keluar</button>
    </div>
  `;
  $('#ak-save').onclick = async () => {
    const lama = $('#ak-lama').value, baru = $('#ak-baru').value;
    if (lama.length < 1) return toast('Isi kata sandi lama', 'error');
    if (baru.length < 4) return toast('Kata sandi baru minimal 4 karakter', 'error');
    try {
      const r = await API.post('/api/auth?act=ganti-sandi', { sandi_lama: lama, sandi_baru: baru });
      toast(r.pesan); $('#ak-lama').value = ''; $('#ak-baru').value = '';
    } catch (e) { toast(e.message, 'error'); }
  };
  $('#ak-keluar').onclick = () => logout();
}

const WALI_ROUTES = {
  'wali': waliBeranda,
  'wali/tagihan': waliTagihan,
  'wali/mutasi': waliMutasi,
  'wali/akun': waliAkun
};

function waliNavigate(hash) {
  if (window.__waPoll) { clearInterval(window.__waPoll); window.__waPoll = null; }
  const key = WALI_ROUTES[hash] ? hash : 'wali';
  waliNavAktif(key === 'wali/akun' ? 'akun' : (key.split('/')[1] || 'beranda'));
  WALI_ROUTES[key]();
  window.scrollTo(0, 0);
}

/* =========================================================
   INIT
   ========================================================= */
(async function init() {
  const ok = await muatSesi();
  if (!ok) return;              // layar login sudah tampil
  await masukAplikasi();
})();
