<?php
/**
 * Aplikasi Keuangan Pondok Pesantren — API
 * Satu titik akhir: api.php?p=<resource>[&id=..][&act=..][&sub=..]
 * Metode: GET / POST / PUT / DELETE  (body JSON)
 */
require __DIR__ . '/db.php';
require __DIR__ . '/pdf.php';

header('Content-Type: application/json; charset=utf-8');

function out($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(string $msg, int $code = 400): void { out(['error' => $msg], $code); }

/* ---------- Helper import Excel ---------- */
function lower(string $s): string {
    return function_exists('strtolower') ? strtolower($s) : strtolower($s);
}

function norm_header(string $h): string {
    $h = lower(trim($h));
    $h = str_replace(['.', ',', ':', '/', '\\', '(', ')', '#'], ' ', $h);
    $h = preg_replace('/\s+/', ' ', $h);
    return trim((string)$h);
}

function angka_import($v): ?float {
    if ($v === null) { return null; }
    if (is_int($v) || is_float($v)) { return (float)$v; }
    $s = str_ireplace(['rp', 'idr'], '', (string)$v);
    $s = preg_replace('/\s+/', '', $s);
    if ($s === '') { return null; }
    if (preg_match('/^-?\d{1,3}([.,]\d{3})+$/', $s)) {
        $s = str_replace(['.', ','], '', $s);          // 1.500.000 / 1,500,000
    } elseif (preg_match('/^-?\d+,\d+$/', $s)) {
        $s = str_replace(',', '.', $s);                // desimal koma: 1,5
    } else {
        $s = str_replace(',', '', $s);
    }
    return is_numeric($s) ? (float)$s : null;
}

/** Peta header Excel (sudah dinormalkan) -> field santri */
function import_peta_header(array $db): array {
    $bulan = [
        'jan' => '01', 'januari' => '01', 'feb' => '02', 'februari' => '02', 'mar' => '03', 'maret' => '03',
        'apr' => '04', 'april' => '04', 'mei' => '05', 'jun' => '06', 'juni' => '06', 'jul' => '07', 'juli' => '07',
        'agu' => '08', 'agustus' => '08', 'sep' => '09', 'september' => '09', 'okt' => '10', 'oktober' => '10',
        'nov' => '11', 'november' => '11', 'des' => '12', 'desember' => '12',
    ];
    $peta = [
        'nama' => 'nama', 'nama lengkap' => 'nama', 'nama santri' => 'nama', 'santri' => 'nama',
        'kelas' => 'kelas', 'rombel' => 'kelas',
        'no wa' => 'no_wa', 'nowa' => 'no_wa', 'no wa ' => 'no_wa', 'nomor wa' => 'no_wa', 'nomor whatsapp' => 'no_wa',
        'whatsapp' => 'no_wa', 'wa' => 'no_wa', 'no hp' => 'no_wa', 'no hp ' => 'no_wa', 'telepon' => 'no_wa', 'telp' => 'no_wa',
        'nis' => 'nis', 'nisn' => 'nis',
    ];
    $abaikan = ['no', 'nomor', 'no urut', 'urut', 'no seri', 'total', 'total tagihan', 'jumlah total'];
    foreach ($abaikan as $a) { $peta[$a] = '__abaikan__'; }

    foreach (tagihan_kolom() as $k) {
        $n = norm_header($k['nama']);
        $peta[$n] = $k['key'];
        $peta[norm_header(str_replace(' Wajib', '', $k['nama']))] = $k['key'];
    }
    foreach (kas_khusus_kolom() as $k) {
        $peta[norm_header($k['nama'])] = $k['key'];
    }
    foreach (['spp', 'infaq', 'laundry'] as $pre) {
        foreach ($bulan as $al => $mm) {
            $peta[$pre . ' ' . $al]            = $pre . '_' . $mm;
            $peta[$pre . ' wajib ' . $al]      = $pre . '_' . $mm;
            $peta[$pre . ' bulan ' . $al]      = $pre . '_' . $mm;
            $peta[$pre . ' wajib bulan ' . $al]= $pre . '_' . $mm;
        }
    }
    foreach (($db['kolom_custom'] ?? []) as $c) {
        $peta[norm_header($c['nama'])] = $c['key'];
    }
    return $peta;
}

function jurnal_label_tagihan(array $db, string $key): string {
    if ($key === '') { return ''; }
    foreach (jenis_tagihan_list($db) as $j) {
        if ($j['key'] === $key) { return $j['nama']; }
    }
    return $key;
}

/** Label baris jurnal: prioritas tagihan iuran (tagihan_id) → kolom tagihan santri */
function jurnal_label_full(array $db, array $j): string {
    $tid = (string)($j['tagihan_id'] ?? '');
    if ($tid !== '') {
        $t = find_by_id($db['tagihan'], $tid);
        if ($t) {
            $jn  = find_by_id($db['jenis_tagihan'], (string)($t['jenis_id'] ?? ''));
            $lbl = $jn ? (string)$jn['nama'] : 'Tagihan';
            $p   = explode('-', (string)($t['periode'] ?? ''));
            if (count($p) === 2 && (int)$p[1] >= 1 && (int)$p[1] <= 12) {
                $lbl .= ' ' . bulan_nama()[(int)$p[1] - 1] . ' ' . $p[0];
            }
            return $lbl;
        }
    }
    return jurnal_label_tagihan($db, (string)($j['tagihan_jenis'] ?? ''));
}

/**
 * Hapus tagihan massal satu periode.
 * $kolom (kunci kolom Data Santri) & $santri_ids menyaring cakupan; kosong = semua.
 * Tagihan yang sudah memiliki pembayaran selalu dilewati.
 */
function tagihan_hapus_bulk(array &$db, string $periode, array $kolom = [], array $santri_ids = []): array {
    $kolom      = array_map('strval', $kolom);
    $santri_ids = array_map('strval', $santri_ids);
    $jenisIds = null;
    if ($kolom) {
        $jenisIds = jenis_ids_untuk_kolom($db, $kolom);
        if (!$jenisIds) { return ['dihapus' => 0, 'dilewati_bayar' => 0]; }
    }
    $adaBayar = [];
    foreach ($db['pembayaran'] as $p) { $adaBayar[(string)($p['tagihan_id'] ?? '')] = true; }

    $sisa = []; $dihapus = 0; $lewati = 0;
    foreach ($db['tagihan'] as $t) {
        $cocok = (string)($t['periode'] ?? '') === $periode
            && ($jenisIds === null || in_array((string)$t['jenis_id'], $jenisIds, true))
            && (!$santri_ids || in_array((string)$t['santri_id'], $santri_ids, true));
        if (!$cocok) { $sisa[] = $t; continue; }
        if (isset($adaBayar[(string)$t['id']])) { $lewati++; $sisa[] = $t; continue; }
        $dihapus++;
    }
    $db['tagihan'] = array_values($sisa);
    return ['dihapus' => $dihapus, 'dilewati_bayar' => $lewati];
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$p      = (string)($_GET['p'] ?? '');
$id     = isset($_GET['id']) ? (string)$_GET['id'] : null;
$act    = isset($_GET['act']) ? (string)$_GET['act'] : null;
$sub    = isset($_GET['sub']) ? (string)$_GET['sub'] : null;
$body   = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($body)) { $body = []; }

$db = db_load();

/** Nomor HP → format internasional utk wa.me (62…) — definisi di luar try agar tersedia utk semua blok */
function wa_format_hp(string $hp): string {
    $n = preg_replace('/[^0-9]/', '', $hp);
    if ($n === '') { return ''; }
    if (strncmp($n, '62', 2) === 0) { return $n; }
    if (strncmp($n, '0', 1) === 0) { return '62' . substr($n, 1); }
    if (strncmp($n, '8', 1) === 0) { return '62' . $n; }
    return $n;
}

/* =========================================================
 * INFO OTOMATIS KE WALI — kas keluar uang saku / tabungan / tagihan lain
 * ========================================================= */
/** Sumber dana kas khusus yang pesannya diantre ke wali */
function kas_khusus_akun_list(): array {
    return ['Uang Saku', 'Tabungan', 'Tagihan Lain-lain'];
}

/** Judul pesan per sumber dana (lihat format: "Informasi Transaksi ... Santri") */
function kas_khusus_judul(string $sumber): string {
    $judul = [
        'Uang Saku'        => 'Informasi Transaksi Uang Saku Santri',
        'Tabungan'         => 'Informasi Transaksi Tabungan Santri',
        'Tagihan Lain-lain' => 'Informasi Transaksi Tagihan Lain Santri',
    ];
    return $judul[$sumber] ?? ('Informasi Transaksi ' . $sumber . ' Santri');
}

/** Saldo berjalan kas khusus SEBUAH santri (saldo awal kolom Data Santri + seluruh riwayat jurnal) */
function saldo_kas_khusus_santri(array $db, string $akun, string $santriId, string $nama): float {
    $key = $santriId !== '' ? 's:' . $santriId : (trim($nama) !== '' ? 'n:' . lower(trim($nama)) : '__tanpa');
    $saldo = 0.0;
    foreach ($db['jurnal'] as $x) {
        $arah  = ($x['arah'] ?? 'masuk') === 'keluar' ? 'keluar' : 'masuk';
        $cocok = ($arah === 'masuk' && (string)($x['akun'] ?? '') === $akun)
              || ($arah === 'keluar' && (string)($x['sumber_dana'] ?? '') === $akun);
        if (!$cocok) { continue; }
        $xs = trim((string)($x['santri_id'] ?? ''));
        $xn = trim((string)($x['nama'] ?? ''));
        $rowKey = $xs !== '' ? 's:' . $xs : ($xn !== '' ? 'n:' . lower($xn) : '__tanpa');
        if ($rowKey !== $key) { continue; }
        $saldo += $arah === 'masuk' ? (float)$x['nominal'] : -(float)$x['nominal'];
    }
    return $saldo + saldo_awal_kas_khusus_santri($db, $akun, $santriId, $nama);
}

/** Total saldo awal (kolom Data Santri) utk santri tsb — 0 bila santri tak dikenal / akun bukan kas khusus */
function saldo_awal_kas_khusus_santri(array $db, string $akun, string $santriId, string $nama): float {
    $kunci = kas_khusus_saldo_awal_key($akun);
    if ($kunci === '') { return 0.0; }
    $raw = $santriId !== '' ? find_by_id($db['santri'], $santriId) : null;
    if (!$raw && trim($nama) !== '') {
        foreach ($db['santri'] as $sX) {
            if (lower(trim((string)($sX['nama'] ?? ''))) === lower(trim($nama))) { $raw = $sX; break; }
        }
    }
    return $raw ? (float)($raw[$kunci] ?? 0) : 0.0;
}

/** Total seluruh saldo awal sebuah akun kas khusus (semua santri / satu santri bila $santriId diisi) */
function saldo_awal_kas_khusus(array $db, string $akun, string $santriId = ''): float {
    $kunci = kas_khusus_saldo_awal_key($akun);
    if ($kunci === '') { return 0.0; }
    $t = 0.0;
    foreach ($db['santri'] as $s) {
        if ($santriId !== '' && (string)($s['id'] ?? '') !== $santriId) { continue; }
        $t += (float)($s[$kunci] ?? 0);
    }
    return $t;
}

/** Saldo kas khusus tiap santri dalam satu scan jurnal — [santri_id => saldo awal + mutasi] */
function saldo_kas_khusus_semua(array $db, string $akun): array {
    $jml = [];
    foreach ($db['jurnal'] as $x) {
        $arah  = ($x['arah'] ?? 'masuk') === 'keluar' ? 'keluar' : 'masuk';
        $cocok = ($arah === 'masuk' && (string)($x['akun'] ?? '') === $akun)
              || ($arah === 'keluar' && (string)($x['sumber_dana'] ?? '') === $akun);
        if (!$cocok) { continue; }
        $xs = trim((string)($x['santri_id'] ?? ''));
        $xn = trim((string)($x['nama'] ?? ''));
        $rowKey = $xs !== '' ? 's:' . $xs : ($xn !== '' ? 'n:' . lower($xn) : '__tanpa');
        $jml[$rowKey] = ($jml[$rowKey] ?? 0) + ($arah === 'masuk' ? (float)$x['nominal'] : -(float)$x['nominal']);
    }
    $kunci = kas_khusus_saldo_awal_key($akun);
    $out = [];
    foreach ($db['santri'] as $s) {
        $id = (string)($s['id'] ?? '');
        if ($id === '') { continue; }
        $out[$id] = ($kunci !== '' ? (float)($s[$kunci] ?? 0) : 0.0) + (float)($jml['s:' . $id] ?? 0);
    }
    return $out;
}

/** Teks pesan info transaksi utk wali (format: Nama/Tanggal/Waktu/Keterangan/Nominal/Sisa Saldo) */
function wa_pesan_kas(array $db, array $j, float $sisa): string {
    $sumber = (string)($j['sumber_dana'] ?? '');
    $lines   = [kas_khusus_judul($sumber), ''];
    $lines[] = str_pad('Nama', 11) . ': ' . (string)($j['nama'] ?? '-');
    $lines[] = str_pad('Tanggal', 11) . ': ' . tgl_panjang_id((string)($j['tanggal'] ?? ''));
    $ts = (int)strtotime((string)($j['dibuat'] ?? ''));
    $lines[] = str_pad('Waktu', 11) . ': ' . ($ts > 0 ? date('G:i:s', $ts) : date('G:i:s'));
    $ket = trim((string)($j['keterangan'] ?? ''));
    if ($ket === '') { $ket = (string)($j['akun'] ?? ''); }
    $lines[] = str_pad('Keterangan', 11) . ': ' . $ket;
    $lines[] = str_pad('Nominal', 11) . ': ' . rupiah((float)($j['nominal'] ?? 0));
    $lines[] = '';
    $lines[] = str_pad('Sisa Saldo', 11) . ': ' . ($sisa > 0 ? rupiah($sisa) : ($sisa == 0 ? 'Rp -' : rupiah($sisa)));
    $lines[] = '';
    $lines[] = 'Jazakumullahukhoiron';
    $lines[] = 'Pesan ini tidak perlu dibalas';
    return implode("\n", $lines);
}

/** Antrekan info kas keluar ke wali (No WA dari Data Santri) — true bila pesan dibuat */
function wa_antre_kas_keluar(array &$db, array $j): bool {
    if ((string)($j['arah'] ?? '') !== 'keluar') { return false; }
    $sumber = (string)($j['sumber_dana'] ?? '');
    if (!in_array($sumber, kas_khusus_akun_list(), true)) { return false; }

    $sid  = trim((string)($j['santri_id'] ?? ''));
    $nama = trim((string)($j['nama'] ?? ''));
    $raw  = $sid !== '' ? find_by_id($db['santri'], $sid) : null;
    if (!$raw && $nama !== '') {
        foreach ($db['santri'] as $sX) {
            if (lower(trim((string)($sX['nama'] ?? ''))) === lower($nama)) { $raw = $sX; break; }
        }
    }
    if (!$raw) { return false; }
    $s  = santri_bersih($raw, $db);
    $hp = wa_format_hp((string)($s['no_wa'] ?? ''));
    if ($hp === '') { return false; }

    $sisa = saldo_kas_khusus_santri($db, $sumber, $sid !== '' ? $sid : (string)($s['id'] ?? ''), $nama);
    $db['antre_wa'][] = [
        'id'        => uid($db, 'antre'),
        'tipe'      => 'kas',
        'ref'       => (string)($j['id'] ?? ''),
        'ref_tipe'  => 'jurnal',
        'no_bkm'    => (string)($j['no_bkk'] ?? ''),
        'nama'      => (string)($s['nama'] ?? $nama),
        'no_hp'     => $hp,
        'pesan'     => wa_pesan_kas($db, $j, $sisa),
        'gambar'    => '',
        'status'    => 'antre',
        'percobaan' => 0,
        'dibuat'    => date('c'),
    ];
    return true;
}

/** Antrean info wali (tipe kas) utk satu jurnal — dipakai utk ganti/batal saat edit/hapus */
function wa_pending_kas(array $db, string $jid): array {
    $out = [];
    foreach ($db['antre_wa'] as $i => $t) {
        if ((string)($t['ref'] ?? '') === $jid && (string)($t['ref_tipe'] ?? '') === 'jurnal'
            && (string)($t['tipe'] ?? '') === 'kas'
            && in_array((string)($t['status'] ?? ''), ['antre', 'proses'], true)) {
            $out[] = $i;
        }
    }
    return $out;
}

try {

/* =========================================================
 * AUTH — login ADMIN & WALI SANTRI
 * GET  p=auth                                  status sesi + profil publik (layar login)
 * POST p=auth {act:'login', username, sandi}   buat sesi → token
 * POST p=auth {act:'logout'}                   hapus sesi
 * POST p=auth {act:'ganti-sandi', sandi_lama, sandi_baru}
 * Token dikirim sebagai parameter ?auth= (tautan/unduh) atau header X-Auth.
 * ========================================================= */
function sandi_hash_baru(string $s): string { return password_hash($s, PASSWORD_DEFAULT); }

/** token sesi dari request — query ?auth= atau header X-Auth */
function auth_token_request(): string {
    $t = trim((string)($_GET['auth'] ?? ''));
    if ($t === '' && !empty($_SERVER['HTTP_X_AUTH'])) { $t = trim((string)$_SERVER['HTTP_X_AUTH']); }
    return $t;
}

/** sesi aktif dari token — token kedaluwarsa dibersihkan otomatis */
function auth_sesi(array &$db, string $token): ?array {
    if ($token === '') { return null; }
    $sesi = isset($db['sesi']) && is_array($db['sesi']) ? $db['sesi'] : [];
    if (!isset($sesi[$token])) { return null; }
    if ((int)($sesi[$token]['kadaluarsa'] ?? 0) < time()) {
        unset($sesi[$token]);
        $db['sesi'] = $sesi;
        db_save($db);
        return null;
    }
    return $sesi[$token];
}

/** akun admin — dibuat otomatis (admin / admin) bila belum pernah ada */
function auth_admin(array &$db): array {
    foreach (($db['pengguna'] ?? []) as $u) {
        if ((string)($u['peran'] ?? '') === 'admin') { return $u; }
    }
    $u = [
        'id'        => uid($db, 'pengguna'),
        'peran'     => 'admin',
        'username'  => 'admin',
        'sandi'     => sandi_hash_baru('admin'),
        'nama'      => 'Administrator',
        'santri_id' => '',
        'aktif'     => true,
        'dibuat'    => date('c'),
    ];
    $db['pengguna'][] = $u;
    db_save($db);
    return $u;
}

/** profil publik utk layar login (tanpa data keuangan) */
function auth_profil(array $db): array {
    $p = $db['pengaturan'];
    return [
        'nama_pesantren' => (string)($p['nama_pesantren'] ?? ''),
        'logo_teks'      => (string)($p['logo_teks'] ?? 'PP'),
        'logo'           => (string)($p['logo'] ?? ''),
        'alamat'         => (string)($p['alamat'] ?? ''),
        'tahun_ajaran'   => (string)($p['tahun_ajaran'] ?? ''),
    ];
}

/** buat sesi login baru (berlaku 7 hari) + bersihkan sesi kadaluwarsa */
function auth_buat_sesi(array &$db, array $akun): string {
    foreach (($db['sesi'] ?? []) as $tL => $sL) {
        if ((int)($sL['kadaluarsa'] ?? 0) < time()) { unset($db['sesi'][$tL]); }
    }
    $token = bin2hex(random_bytes(24));
    $db['sesi'][$token] = [
        'peran'       => (string)($akun['peran'] ?? ''),
        'pengguna_id' => (string)($akun['id'] ?? ''),
        'santri_id'   => (string)($akun['santri_id'] ?? ''),
        'nama'        => (string)($akun['nama'] ?? ''),
        'username'    => (string)($akun['username'] ?? ''),
        'dibuat'      => date('c'),
        'kadaluarsa'  => time() + 604800,
    ];
    db_save($db);
    return $token;
}

/** endpoint yang boleh diakses tanpa login (layar login + bot WA) */
function auth_publik(string $p, string $method, ?string $act, array $body): bool {
    if ($p === 'auth') { return true; }
    if ($p === 'wa') {
        if ($method === 'POST' && (string)($body['act'] ?? '') === 'rekap') { return false; }  // antre rekap = admin
        if ($method === 'GET' && $act === 'bridge') { return false; }                         // pakai key bridge
        return true;
    }
    if ($p === 'kwitansi') {
        if ($method === 'GET' && in_array($act, ['antre', 'gambar'], true)) { return true; }   // token bot dicek di handler
        if ($method === 'POST' && in_array((string)($body['act'] ?? ''), ['selesai', 'gagal'], true)) { return true; }
        if ($method === 'GET' && ($act === null || $act === '')) { return true; }             // bootstrap token bot (daftar disensor)
        return false;
    }
    return false;
}

/** baris akun login tanpa hash sandi */
function pengguna_bersih(array $u, array $db): array {
    $sid = (string)($u['santri_id'] ?? '');
    $s   = $sid !== '' ? find_by_id($db['santri'], $sid) : null;
    return [
        'id'          => (string)($u['id'] ?? ''),
        'peran'       => (string)($u['peran'] ?? 'wali'),
        'username'    => (string)($u['username'] ?? ''),
        'nama'        => (string)($u['nama'] ?? ''),
        'santri_id'   => $sid,
        'nama_santri' => $s ? (string)$s['nama'] : '',
        'kelas'       => $s ? (string)$s['kelas'] : '',
        'no_wa'       => $s ? (string)$s['no_wa'] : '',
        'aktif'       => (bool)($u['aktif'] ?? true),
        'dibuat'      => (string)($u['dibuat'] ?? ''),
        'ubah'        => (string)($u['ubah'] ?? ''),
    ];
}

/** samakan counter pengguna dgn id terbesar — cegah id ganda setelah restore/demo/reset */
function pengguna_sinkron_counter(array &$db): void {
    $n = (int)($db['counters']['pengguna'] ?? 0);
    foreach (($db['pengguna'] ?? []) as $u) {
        if (preg_match('/(\d+)$/', (string)($u['id'] ?? ''), $m)) { $n = max($n, (int)$m[1]); }
    }
    $db['counters']['pengguna'] = $n;
}

/* ---------- status / login / logout / ganti sandi ---------- */
$SESI  = auth_sesi($db, auth_token_request());
$PERAN = $SESI ? (string)$SESI['peran'] : '';
/* salinan awal — dipertahankan saat reset / demo / restore agar tidak keluar sendiri */
$SESI_LAMA     = isset($db['sesi']) && is_array($db['sesi']) ? $db['sesi'] : [];
$PENGGUNA_LAMA = isset($db['pengguna']) && is_array($db['pengguna']) ? $db['pengguna'] : [];

if ($p === 'auth') {
    if ($method === 'GET') {
        if (!$SESI) { out(['login' => false, 'profil' => auth_profil($db)]); }
        $rS = [
            'login'     => true,
            'peran'     => (string)$SESI['peran'],
            'nama'      => (string)$SESI['nama'],
            'username'  => (string)$SESI['username'],
            'santri_id' => (string)$SESI['santri_id'],
            'profil'    => auth_profil($db),
        ];
        if ((string)$SESI['peran'] === 'admin') {
            $admX = auth_admin($db);
            $rS['sandi_default'] = password_verify('admin', (string)$admX['sandi']);
        }
        out($rS);
    }

    if ($method === 'POST') {
        $actA = (string)($body['act'] ?? ($act !== null ? $act : ''));

        if ($actA === 'login') {
            $user = lower(trim((string)($body['username'] ?? '')));
            $sandi = (string)($body['sandi'] ?? '');
            if ($user === '' || $sandi === '') { fail('Nama pengguna & kata sandi wajib diisi'); }
            $akun = null;
            foreach (($db['pengguna'] ?? []) as $uL) {
                if (lower(trim((string)($uL['username'] ?? ''))) === $user) { $akun = $uL; break; }
            }
            if (!$akun && $user === 'admin') { $akun = auth_admin($db); }   // akun bawaan bila belum dibuat
            $gagal = !$akun || empty($akun['aktif']) || !password_verify($sandi, (string)($akun['sandi'] ?? ''));
            if ($gagal) {
                usleep(400000);   // jeda anti brute-force
                fail('Nama pengguna atau kata sandi salah', 401);
            }
            $token = auth_buat_sesi($db, $akun);
            out([
                'ok' => true, 'token' => $token,
                'peran' => (string)$akun['peran'], 'nama' => (string)$akun['nama'],
                'santri_id' => (string)($akun['santri_id'] ?? ''), 'profil' => auth_profil($db),
            ], 201);
        }

        if ($actA === 'logout') {
            $tk = auth_token_request();
            if ($tk === '' && isset($body['token'])) { $tk = trim((string)$body['token']); }
            if ($tk !== '' && isset($db['sesi'][$tk])) { unset($db['sesi'][$tk]); db_save($db); }
            out(['ok' => true, 'pesan' => 'Berhasil keluar']);
        }

        if ($actA === 'ganti-sandi') {
            if (!$SESI) { fail('Sesi berakhir — silakan login kembali', 401); }
            $lama = (string)($body['sandi_lama'] ?? '');
            $baru = (string)($body['sandi_baru'] ?? '');
            if (strlen($baru) < 4) { fail('Kata sandi baru minimal 4 karakter'); }
            $idxU = null;
            foreach (($db['pengguna'] ?? []) as $iU => $uU) {
                if ((string)($uU['id'] ?? '') === (string)$SESI['pengguna_id']) { $idxU = $iU; break; }
            }
            if ($idxU === null) { fail('Akun tidak ditemukan', 404); }
            if (!password_verify($lama, (string)$db['pengguna'][$idxU]['sandi'])) { fail('Kata sandi lama salah', 401); }
            $db['pengguna'][$idxU]['sandi'] = sandi_hash_baru($baru);
            $db['pengguna'][$idxU]['ubah']  = date('c');
            db_save($db);
            out(['ok' => true, 'pesan' => 'Kata sandi berhasil diganti']);
        }

        fail('act tidak dikenal (login | logout | ganti-sandi)', 400);
    }
    fail('Method tidak diizinkan', 405);
}

/* ---------- gerbang otorisasi untuk seluruh endpoint lain ---------- */
if (!auth_publik($p, $method, $act, $body)) {
    if (!$SESI) { fail('Sesi berakhir — silakan login kembali', 401); }
    if ((string)$SESI['peran'] !== 'admin' && $p !== 'wali') {
        fail('Maaf, menu ini hanya untuk admin', 403);
    }
}

/* =========================================================
 * AKUN LOGIN (ADMIN & WALI SANTRI) — kelola dari Pengaturan
 * GET    p=pengguna                       daftar akun (tanpa hash sandi)
 * POST   p=pengguna {peran, username, sandi, nama, santri_id, aktif}
 * PUT    p=pengguna&id=USN-00001 {…}      ubah (sandi opsional)
 * DELETE p=pengguna&id=USN-00001          hapus
 * ========================================================= */
if ($p === 'pengguna') {
    if ($PERAN !== 'admin') { fail('Hanya admin yang boleh mengelola akun', 403); }

    if ($method === 'GET') {
        auth_admin($db);
        $list = [];
        foreach (($db['pengguna'] ?? []) as $uG) { $list[] = pengguna_bersih($uG, $db); }
        usort($list, function ($a, $b) {
            if ($a['peran'] !== $b['peran']) { return $a['peran'] === 'admin' ? -1 : 1; }
            return strcasecmp($a['nama_santri'] ?: $a['nama'], $b['nama_santri'] ?: $b['nama']);
        });
        out(['list' => $list, 'jumlah' => count($list)]);
    }

    if ($method === 'POST') {
        $peran   = (string)($body['peran'] ?? 'wali');
        $user    = lower(preg_replace('/\s+/', '', trim((string)($body['username'] ?? ''))));
        $sandi   = (string)($body['sandi'] ?? '');
        $nama    = trim((string)($body['nama'] ?? ''));
        $sidU    = trim((string)($body['santri_id'] ?? ''));
        $aktif   = !isset($body['aktif']) || (bool)$body['aktif'];
        if (!in_array($peran, ['admin', 'wali'], true)) { fail('Peran tidak valid (admin | wali)'); }
        if (strlen($user) < 3) { fail('Nama pengguna minimal 3 karakter — huruf/angka tanpa spasi'); }
        if (strlen($sandi) < 4) { fail('Kata sandi minimal 4 karakter'); }
        if ($peran === 'wali' && $sidU === '') { fail('Pilih santri untuk akun wali'); }
        foreach (($db['pengguna'] ?? []) as $uC) {
            if (lower(trim((string)($uC['username'] ?? ''))) === $user) { fail('Nama pengguna sudah dipakai', 409); }
        }
        if ($peran === 'wali') {
            if (!find_by_id($db['santri'], $sidU)) { fail('Santri tidak ditemukan', 404); }
            if ($nama === '') { $sW = find_by_id($db['santri'], $sidU); $nama = 'Wali ' . ($sW ? (string)$sW['nama'] : ''); }
        }
        if ($nama === '') { $nama = $user; }
        $rec = [
            'id'        => uid($db, 'pengguna'),
            'peran'     => $peran,
            'username'  => $user,
            'sandi'     => sandi_hash_baru($sandi),
            'nama'      => $nama,
            'santri_id' => $peran === 'wali' ? $sidU : '',
            'aktif'     => $aktif,
            'dibuat'    => date('c'),
        ];
        $db['pengguna'][] = $rec;
        db_save($db);
        out(['ok' => true, 'pengguna' => pengguna_bersih($rec, $db), 'pesan' => 'Akun berhasil dibuat'], 201);
    }

    if ($method === 'PUT' && $id) {
        $idxU = null;
        foreach (($db['pengguna'] ?? []) as $iU => $uU) { if ((string)($uU['id'] ?? '') === $id) { $idxU = $iU; break; } }
        if ($idxU === null) { fail('Akun tidak ditemukan', 404); }
        $uU = $db['pengguna'][$idxU];

        if (isset($body['username'])) {
            $user = lower(preg_replace('/\s+/', '', trim((string)$body['username'])));
            if (strlen($user) < 3) { fail('Nama pengguna minimal 3 karakter'); }
            foreach (($db['pengguna'] ?? []) as $cek) {
                if ((string)$cek['id'] !== $id && lower(trim((string)($cek['username'] ?? ''))) === $user) {
                    fail('Nama pengguna sudah dipakai', 409);
                }
            }
            $uU['username'] = $user;
        }
        if (isset($body['nama']))       { $uU['nama'] = trim((string)$body['nama']); }
        if (isset($body['sandi']) && (string)$body['sandi'] !== '') {
            if (strlen((string)$body['sandi']) < 4) { fail('Kata sandi minimal 4 karakter'); }
            $uU['sandi'] = sandi_hash_baru((string)$body['sandi']);
        }
        if (isset($body['aktif']))      { $uU['aktif'] = (bool)$body['aktif']; }
        if (isset($body['santri_id']) && $uU['peran'] === 'wali') {
            $sidU = trim((string)$body['santri_id']);
            if ($sidU !== '' && !find_by_id($db['santri'], $sidU)) { fail('Santri tidak ditemukan', 404); }
            $uU['santri_id'] = $sidU;
        }
        if (isset($body['peran'])) {
            $peran = (string)$body['peran'];
            if (!in_array($peran, ['admin', 'wali'], true)) { fail('Peran tidak valid'); }
            if ($peran === 'wali' && empty($uU['santri_id'])) { fail('Akun wali harus terhubung ke santri'); }
            if ($uU['peran'] === 'admin' && $peran === 'wali') {
                $adm = 0;
                foreach (($db['pengguna'] ?? []) as $uK) { if ((string)($uK['peran'] ?? '') === 'admin' && !empty($uK['aktif'])) { $adm++; } }
                if ($adm <= 1) { fail('Tidak bisa menurunkan peran — tersisa satu admin aktif'); }
            }
            $uU['peran'] = $peran;
        }
        if ($uU['peran'] === 'wali' && empty($uU['santri_id'])) { fail('Akun wali harus terhubung ke santri'); }
        $uU['ubah'] = date('c');
        $db['pengguna'][$idxU] = $uU;
        db_save($db);
        out(['ok' => true, 'pengguna' => pengguna_bersih($uU, $db), 'pesan' => 'Akun diperbarui']);
    }

    if ($method === 'DELETE' && $id) {
        $idxU = null;
        foreach (($db['pengguna'] ?? []) as $iU => $uU) { if ((string)($uU['id'] ?? '') === $id) { $idxU = $iU; break; } }
        if ($idxU === null) { fail('Akun tidak ditemukan', 404); }
        $uU = $db['pengguna'][$idxU];
        if ((string)$uU['id'] === (string)($SESI['pengguna_id'] ?? '')) { fail('Tidak bisa menghapus akun yang sedang login'); }
        if ((string)$uU['peran'] === 'admin') {
            $adm = 0;
            foreach (($db['pengguna'] ?? []) as $uK) { if ((string)($uK['peran'] ?? '') === 'admin') { $adm++; } }
            if ($adm <= 1) { fail('Tidak bisa menghapus akun admin terakhir'); }
        }
        array_splice($db['pengguna'], $idxU, 1);
        foreach (($db['sesi'] ?? []) as $tD => $sD) {
            if ((string)($sD['pengguna_id'] ?? '') === $id) { unset($db['sesi'][$tD]); }
        }
        db_save($db);
        out(['ok' => true, 'pesan' => 'Akun dihapus']);
    }

    fail('Method tidak diizinkan', 405);
}

/* =========================================================
 * PORTAL WALI SANTRI — tagihan bulanan, saldo & mutasi kas khusus
 * GET p=wali                                    ringkas: santri, saldo 3 akun, tagihan bulan ini
 * GET p=wali&sub=tagihan&periode=&status=       daftar tagihan + rekap per periode
 * GET p=wali&sub=mutasi&akun=uang-saku|tabungan|tagihan-lain&dari=&sampai=&arah=
 * Wali hanya melihat data santrinya sendiri — admin memakai &santri_id=
 * ========================================================= */
function wali_tagihan_row(array $db, array $t, bool $riwayat = false): array {
    $jn    = find_by_id($db['jenis_tagihan'], (string)($t['jenis_id'] ?? ''));
    $sisa  = tagihan_sisa($db, $t);
    $nom   = (float)($t['nominal'] ?? 0);
    $row   = [
        'id'      => (string)($t['id'] ?? ''),
        'periode' => (string)($t['periode'] ?? ''),
        'label'   => tagihan_label($jn, (string)($t['periode'] ?? '')),
        'jenis'   => $jn ? (string)$jn['nama'] : 'Tagihan',
        'nominal' => $nom,
        'dibayar' => $nom - $sisa,
        'sisa'    => $sisa,
        'status'  => tagihan_status($db, $t),
    ];
    if ($riwayat) {
        $bayar = [];
        foreach (($db['pembayaran'] ?? []) as $pb) {
            if ((string)($pb['tagihan_id'] ?? '') !== $row['id']) { continue; }
            $bayar[] = [
                'tanggal'     => (string)($pb['tanggal'] ?? ''),
                'jumlah'      => (float)($pb['jumlah'] ?? 0),
                'metode'      => (string)($pb['metode'] ?? ''),
                'keterangan'  => (string)($pb['keterangan'] ?? ''),
            ];
        }
        usort($bayar, function ($a, $b) { return strcmp((string)$b['tanggal'], (string)$a['tanggal']); });
        $row['riwayat'] = $bayar;
    }
    return $row;
}

if ($p === 'wali') {
    if ($method !== 'GET') { fail('Method tidak diizinkan', 405); }

    $sidW = $PERAN === 'wali' ? (string)$SESI['santri_id'] : trim((string)($_GET['santri_id'] ?? ''));
    if ($sidW === '' && $PERAN === 'wali') { fail('Akun wali ini belum terhubung ke santri — hubungi pengurus pesantren', 400); }
    if ($sidW === '') { fail('Parameter santri_id wajib diisi', 400); }
    $rawW = find_by_id($db['santri'], $sidW);
    if (!$rawW) { fail('Data santri tidak ditemukan', 404); }
    $sW    = santri_bersih($rawW, $db);
    $namaW = (string)$sW['nama'];
    $subW  = (string)($sub ?? 'ringkas');

    $profil = auth_profil($db);

    /* ---------- ringkas beranda ---------- */
    if ($subW === 'ringkas') {
        $periode = date('Y-m');
        $saldo = [
            'uang_saku'    => saldo_kas_khusus_santri($db, 'Uang Saku', $sidW, $namaW),
            'tabungan'     => saldo_kas_khusus_santri($db, 'Tabungan', $sidW, $namaW),
            'tagihan_lain' => saldo_kas_khusus_santri($db, 'Tagihan Lain-lain', $sidW, $namaW),
        ];
        $saldo['total'] = $saldo['uang_saku'] + $saldo['tabungan'] + $saldo['tagihan_lain'];

        $bulan = []; $tunggak = [];
        $totBulan = 0.0; $bayarBulan = 0.0; $tunggakTot = 0.0; $sisaSemua = 0.0;
        foreach (($db['tagihan'] ?? []) as $tW) {
            if ((string)($tW['santri_id'] ?? '') !== $sidW) { continue; }
            $r = wali_tagihan_row($db, $tW);
            $sisaSemua += $r['sisa'];
            if ($r['periode'] === $periode) {
                $bulan[]    = $r;
                $totBulan  += $r['nominal'];
                $bayarBulan += $r['dibayar'];
            } elseif ($r['sisa'] > 0 && $r['periode'] < $periode) {
                $tunggak[]   = $r;
                $tunggakTot += $r['sisa'];
            }
        }
        usort($bulan, function ($a, $b) { return strcmp($a['label'], $b['label']); });
        usort($tunggak, function ($a, $b) {
            $c = strcmp($b['periode'], $a['periode']);
            return $c !== 0 ? $c : strcmp($a['label'], $b['label']);
        });

        out([
            'santri' => [
                'id' => $sidW, 'nis' => (string)$sW['nis'], 'nama' => $namaW,
                'kelas' => (string)$sW['kelas'], 'asrama' => (string)$sW['asrama'],
                'no_wa' => (string)$sW['no_wa'], 'status' => (string)$sW['status'],
            ],
            'profil'         => $profil,
            'periode'        => $periode,
            'saldo'          => $saldo,
            'tagihan_bulan'  => [
                'periode' => $periode, 'jumlah' => count($bulan),
                'total' => $totBulan, 'dibayar' => $bayarBulan, 'sisa' => max(0, $totBulan - $bayarBulan),
                'persen' => $totBulan > 0 ? (int)round($bayarBulan / $totBulan * 100) : 100,
                'rows'   => $bulan,
            ],
            'tunggakan'      => ['jumlah' => count($tunggak), 'total' => $tunggakTot, 'rows' => array_slice($tunggak, 0, 8)],
            'sisa_semua'     => $sisaSemua,
        ]);
    }

    /* ---------- daftar tagihan ---------- */
    if ($subW === 'tagihan') {
        $periodeF = trim((string)($_GET['periode'] ?? ''));
        $statusF  = trim((string)($_GET['status'] ?? ''));
        $semua = [];
        foreach (($db['tagihan'] ?? []) as $tW) {
            if ((string)($tW['santri_id'] ?? '') !== $sidW) { continue; }
            $semua[] = wali_tagihan_row($db, $tW, true);
        }
        /* rekap per periode (selalu utuh — dipakai pilihan filter) */
        $rekap = [];
        foreach ($semua as $rW) {
            $p = $rW['periode'];
            if (!isset($rekap[$p])) {
                $rekap[$p] = ['periode' => $p, 'jumlah' => 0, 'total' => 0.0, 'dibayar' => 0.0, 'sisa' => 0.0,
                              'lunas' => 0, 'belum' => 0, 'sebagian' => 0];
            }
            $rekap[$p]['jumlah']++;
            $rekap[$p]['total']   += $rW['nominal'];
            $rekap[$p]['dibayar'] += $rW['dibayar'];
            $rekap[$p]['sisa']    += $rW['sisa'];
            $rekap[$p][$rW['status']] = ($rekap[$p][$rW['status']] ?? 0) + 1;
        }
        $rekapList = array_values($rekap);
        usort($rekapList, function ($a, $b) { return strcmp($b['periode'], $a['periode']); });

        $rows = $semua;
        if ($periodeF !== '') { $rows = array_values(array_filter($rows, function ($r) use ($periodeF) { return $r['periode'] === $periodeF; })); }
        if ($statusF !== '' && $statusF !== 'semua') {
            $rows = array_values(array_filter($rows, function ($r) use ($statusF) { return $r['status'] === $statusF; }));
        }
        usort($rows, function ($a, $b) {
            $c = strcmp($b['periode'], $a['periode']);
            return $c !== 0 ? $c : strcmp($a['label'], $b['label']);
        });

        $tot = 0.0; $bayarTot = 0.0; $sisaTot = 0.0;
        foreach ($semua as $rW) { $tot += $rW['nominal']; $bayarTot += $rW['dibayar']; $sisaTot += $rW['sisa']; }

        out([
            'santri'       => ['id' => $sidW, 'nama' => $namaW, 'kelas' => (string)$sW['kelas']],
            'profil'       => $profil,
            'periode_aktif'=> date('Y-m'),
            'filter'       => ['periode' => $periodeF, 'status' => $statusF],
            'rekap'        => $rekapList,
            'ringkas'      => ['jumlah' => count($semua), 'total' => $tot, 'dibayar' => $bayarTot, 'sisa' => $sisaTot],
            'jumlah'       => count($rows),
            'list'         => $rows,
        ]);
    }

    /* ---------- mutasi uang saku / tabungan / tagihan lain ---------- */
    if ($subW === 'mutasi') {
        $petaAkun = ['uang-saku' => 'Uang Saku', 'tabungan' => 'Tabungan', 'tagihan-lain' => 'Tagihan Lain-lain'];
        $kodeW = (string)($_GET['akun'] ?? 'uang-saku');
        $akunW = $petaAkun[$kodeW] ?? '';
        if ($akunW === '') { fail('Jenis mutasi tidak dikenal', 404); }
        $dariW   = trim((string)($_GET['dari'] ?? ''));
        $sampaiW = trim((string)($_GET['sampai'] ?? ''));
        $arahW   = trim((string)($_GET['arah'] ?? ''));
        $namaKey = lower(trim($namaW));

        $kumpul = [];
        foreach (($db['jurnal'] ?? []) as $ordW => $xW) {
            $arahX = ($xW['arah'] ?? 'masuk') === 'keluar' ? 'keluar' : 'masuk';
            $cocok = ($arahX === 'masuk' && (string)($xW['akun'] ?? '') === $akunW)
                  || ($arahX === 'keluar' && (string)($xW['sumber_dana'] ?? '') === $akunW);
            if (!$cocok) { continue; }
            $sidX = trim((string)($xW['santri_id'] ?? ''));
            if ($sidX !== '') { if ($sidX !== $sidW) { continue; } }
            elseif (lower(trim((string)($xW['nama'] ?? ''))) !== $namaKey) { continue; }
            $kumpul[] = ['ord' => $ordW, 'j' => $xW, 'arah' => $arahX];
        }
        usort($kumpul, function ($a, $b) {
            $c = strcmp((string)$a['j']['tanggal'], (string)$b['j']['tanggal']);
            return $c !== 0 ? $c : ($a['ord'] <=> $b['ord']);
        });

        $jalan  = saldo_awal_kas_khusus_santri($db, $akunW, $sidW, $namaW);
        $awalW  = $jalan;
        $listW  = []; $masukW = 0.0; $keluarW = 0.0;
        foreach ($kumpul as $mW) {
            $xW = $mW['j'];
            $tg = (string)$xW['tanggal'];
            $n  = (float)$xW['nominal'];
            if ($dariW !== '' && $tg < $dariW) { $jalan += $mW['arah'] === 'masuk' ? $n : -$n; $awalW = $jalan; continue; }
            if ($sampaiW !== '' && $tg > $sampaiW) { continue; }
            $jalan += $mW['arah'] === 'masuk' ? $n : -$n;

            $akunX = (string)($xW['akun'] ?? '');
            if ($akunX === '' && $mW['arah'] === 'masuk') { $akunX = akun_dari_tagihan((string)($xW['tagihan_jenis'] ?? ''), $db); }
            $rowW = array_merge($xW, [
                'arah'          => $mW['arah'],
                'akun'          => $akunX,
                'label_tagihan' => jurnal_label_full($db, $xW),
                'saldo'         => $jalan,
            ]);
            if ($arahW !== '' && $arahW !== 'semua' && $rowW['arah'] !== $arahW) { continue; }
            if ($rowW['arah'] === 'masuk') { $masukW += $n; } else { $keluarW += $n; }
            $listW[] = $rowW;
        }

        out([
            'akun'         => $akunW,
            'kode'         => $kodeW,
            'santri'       => ['id' => $sidW, 'nama' => $namaW, 'kelas' => (string)$sW['kelas']],
            'profil'       => $profil,
            'saldo_awal'   => $awalW,
            'saldo_akhir'  => $jalan,
            'total_masuk'  => $masukW,
            'total_keluar' => $keluarW,
            'jumlah'       => count($listW),
            'list'         => $listW,
        ]);
    }

    fail('Sub-resources tidak dikenal (ringkas | tagihan | mutasi)', 404);
}

/* =========================================================
 * PENGATURAN
 * ========================================================= */
/** Simpan gambar base64 (data URI) ke assets/img/ — kembalikan path relatif */
function simpan_gambar(string $dataUri, string $namaFile): string {
    if ($dataUri === '') { return ''; }
    $koma    = strpos($dataUri, ',');
    $meta    = $koma !== false ? substr($dataUri, 0, $koma) : '';
    $bin     = $koma !== false ? substr($dataUri, $koma + 1) : $dataUri;
    $ext     = 'png';
    if (preg_match('#data:image/([a-zA-Z0-9]+)#', $meta, $mm)) {
        $e = strtolower($mm[1]);
        $ext = in_array($e, ['jpg', 'jpeg', 'gif', 'webp'], true) ? ($e === 'jpeg' ? 'jpg' : $e) : 'png';
    }
    $bin = base64_decode($bin, true);
    if ($bin === false || $bin === '') { fail('Data gambar tidak valid'); }
    $dir = __DIR__ . '/assets/img';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) { fail('Folder assets/img tidak bisa dibuat'); }
    foreach (['png', 'jpg', 'gif', 'webp'] as $e) {
        $lama = $dir . '/' . $namaFile . '.' . $e;
        if (is_file($lama)) { @unlink($lama); }
    }
    $path = $dir . '/' . $namaFile . '.' . $ext;
    if (@file_put_contents($path, $bin) === false) { fail('Gagal menyimpan gambar'); }
    return 'assets/img/' . $namaFile . '.' . $ext;
}

/** Simpan bukti jurnal (foto transfer / foto nota / tanda tangan penerima) — nama file mengikuti nomor voucher */
function bukti_simpan(string $dataUri, string $prefix, string $nomor): string {
    if ($dataUri === '') { return ''; }
    $safe = preg_replace('/[^A-Za-z0-9_-]/', '_', $nomor);
    return simpan_gambar($dataUri, $prefix . '_' . ($safe !== '' ? $safe : 'tanpa-nomor'));
}
/** Hapus file bukti jurnal hanya bila tidak lagi dipakai jurnal lain */
function bukti_hapus(array $db, string $path): void {
    if ($path === '') { return; }
    foreach (($db['jurnal'] ?? []) as $x) {
        foreach (['bukti_transfer', 'bukti_nota', 'ttd_penerima'] as $f) {
            if ((string)($x[$f] ?? '') === $path) { return; }
        }
    }
    $f = __DIR__ . '/' . ltrim($path, '/');
    if (is_file($f)) { @unlink($f); }
}

/* =========================================================
 * LOGIN WHATSAPP BOT — state QR barcode & kode pairing (data/wa.json)
 * Dipakai bot eksternal (Baileys / whatsapp-web.js):
 *   POST p=wa {"act":"qr","qr":"..."}          -> QR baru / refresh
 *   POST p=wa {"act":"pair","no":"628.."}      -> aplikasi minta kode pairing (input nomor di Pengaturan)
 *   POST p=wa {"act":"kodepair","kode":"......"} -> bot mengirim kode resmi (requestPairingCode)
 *   POST p=wa {"act":"status","status":"login","no":"628.."}
 *   POST p=wa {"act":"logout"}                 -> reset sesi
 *   GET  p=wa                                  -> state utk ditampilkan di Pengaturan
 * ========================================================= */
/* =========================================================
 * WA BRIDGE — proxy status bridge (Node) dari server + antre rekap
 * GET  p=wa&act=bridge          → GET wa_bridge_url (header X-WA-Key) — server ke server
 * POST p=wa {act:'rekap', santri_ids[]|santri_id, semua} → antre pesan rekap tagihan
 * ========================================================= */

/** GET sederhana ke bridge — cURL bila tersedia, else stream allow_url_fopen */
function bridge_http_get(string $url, string $key): array {
    $url = trim($url);
    if ($url === '') { fail('URL Bridge belum diisi — isi dulu kolom URL Bridge'); }
    if (!preg_match('#^https?://#i', $url)) { fail('URL Bridge harus diawali http:// atau https://'); }
    $header = ['Accept: application/json'];
    if ($key !== '') { $header[] = 'X-WA-Key: ' . $key; }
    $t0   = microtime(true);
    $body = ''; $http = 0; $err = '';
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT         => 6,
            CURLOPT_CONNECTTIMEOUT  => 4,
            CURLOPT_HTTPHEADER      => $header,
            CURLOPT_FOLLOWLOCATION  => true,
            CURLOPT_MAXREDIRS       => 2,
        ]);
        $hasil = curl_exec($ch);
        $http  = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        if ($hasil === false) { $err = curl_error($ch); } else { $body = (string)$hasil; }
        curl_close($ch);
    } else {
        $ctx = stream_context_create(['http' => [
            'method'        => 'GET',
            'header'        => implode("\r\n", $header),
            'timeout'       => 6,
            'ignore_errors' => true,
        ]]);
        $hasil = @file_get_contents($url, false, $ctx);
        if ($hasil === false) {
            $err = 'gagal terhubung ke bridge (URL salah / bot tidak berjalan / allow_url_fopen mati)';
        } else {
            $body = (string)$hasil;
            if (isset($http_response_header[0]) && preg_match('#HTTP/\S+\s+(\d{3})#', $http_response_header[0], $m)) {
                $http = (int)$m[1];
            }
        }
    }
    return ['http' => $http, 'body' => $body, 'error' => $err, 'rtt_ms' => (int)round((microtime(true) - $t0) * 1000)];
}

/** Sisa tagihan per santri — label + sisa (utk pesan rekap WhatsApp) */
function sisa_tagihan(array $db, string $sid): array {
    $bayarPer = [];
    foreach ($db['pembayaran'] as $pb) {
        $tid = (string)($pb['tagihan_id'] ?? '');
        if ($tid === '') { continue; }
        $bayarPer[$tid] = ($bayarPer[$tid] ?? 0.0) + (float)($pb['jumlah'] ?? 0);
    }
    $rows = []; $total = 0.0;
    foreach ($db['tagihan'] as $t) {
        if ((string)($t['santri_id'] ?? '') !== $sid) { continue; }
        $sisa = max(0.0, (float)($t['nominal'] ?? 0) - ($bayarPer[(string)$t['id']] ?? 0.0));
        if ($sisa <= 0) { continue; }
        $jn = find_by_id($db['jenis_tagihan'], (string)($t['jenis_id'] ?? ''));
        $rows[] = ['label' => tagihan_label($jn, (string)($t['periode'] ?? '')), 'sisa' => $sisa];
        $total += $sisa;
    }
    return ['rows' => $rows, 'total' => $total];
}

/** Teks pesan rekap tagihan utk WhatsApp wali */
function rekap_pesan(array $db, array $s, array $sisa): string {
    $bln = bulan_nama();
    $tgl = (int)date('j') . ' ' . $bln[(int)date('n') - 1] . ' ' . date('Y');
    $kelas = (string)($s['kelas'] ?? '');
    $lines = ['Assalamualaikum Wr. Wb.'];
    $lines[] = 'Rekap tagihan ' . (string)($s['nama'] ?? '') . ($kelas !== '' ? ' (' . $kelas . ')' : '') . ' per ' . $tgl . ':';
    if (!$sisa['rows']) {
        $lines[] = 'Saat ini tidak ada tagihan yang belum lunas — semua tagihan LUNAS. Terima kasih.';
    } else {
        foreach ($sisa['rows'] as $r) { $lines[] = '• ' . $r['label'] . ' — ' . rupiah($r['sisa']); }
        $lines[] = 'Total sisa: ' . rupiah($sisa['total']);
    }
    $lines[] = 'Terima kasih.';
    $lines[] = '- ' . (string)($db['pengaturan']['nama_pesantren'] ?? '');
    return implode("\n", $lines);
}

if ($p === 'wa') {
    $fileWa = __DIR__ . '/data/wa.json';
    $state  = ['status' => 'logout', 'qr' => '', 'kode' => '', 'no' => '', 'mintakode' => 0, 'diperbarui' => ''];
    if (is_file($fileWa)) {
        $isi = json_decode((string)@file_get_contents($fileWa), true);
        if (is_array($isi)) { $state = array_merge($state, $isi); }
    }

    /* ---------- proxy status bridge (server → bridge, bukan dari browser) ---------- */
    if ($method === 'GET' && $act === 'bridge') {
        $r    = bridge_http_get((string)($db['pengaturan']['wa_bridge_url'] ?? ''), (string)($db['pengaturan']['wa_bridge_key'] ?? ''));
        $data = json_decode((string)$r['body'], true);
        out([
            'ok'      => $r['http'] >= 200 && $r['http'] < 300,
            'http'    => $r['http'],
            'rtt_ms'  => $r['rtt_ms'],
            'error'   => $r['error'],
            'data'    => is_array($data) ? $data : null,
            'teks'    => substr(preg_replace('/\s+/', ' ', strip_tags((string)$r['body'])), 0, 240),
        ]);
    }

    /* ---------- antre pesan rekap tagihan per santri ---------- */
    if ($method === 'POST' && (string)($body['act'] ?? '') === 'rekap') {
        $semua = !empty($body['semua']);
        $ids   = [];
        if (is_array($body['santri_ids'] ?? null)) {
            foreach ($body['santri_ids'] as $x) { $x = trim((string)$x); if ($x !== '') { $ids[] = $x; } }
        }
        if (!$ids) {
            $one = trim((string)($body['santri_id'] ?? ''));
            if ($one !== '') { $ids[] = $one; }
        }
        if ($semua) {
            $ids = [];
            foreach ($db['santri'] as $sX) { $ids[] = (string)$sX['id']; }
        }
        if (!$ids) { fail('Pilih santri dulu'); }

        $dibuat = 0; $lewat = 0;
        foreach (array_values(array_unique($ids)) as $sid) {
            $raw = find_by_id($db['santri'], $sid);
            if (!$raw) { $lewat++; continue; }
            $s  = santri_bersih($raw, $db);
            $hp = wa_format_hp((string)($s['no_wa'] ?? ''));
            if ($hp === '') { $lewat++; continue; }
            $sisa = sisa_tagihan($db, $sid);
            /* mode "Semua" hanya santri yang masih punya tagihan sisa */
            if ($semua && !$sisa['rows']) { $lewat++; continue; }
            $db['antre_wa'][] = [
                'id'        => uid($db, 'antre'),
                'tipe'      => 'rekap',
                'ref'       => $sid,
                'no_bkm'    => '',
                'nama'      => (string)$s['nama'],
                'no_hp'     => $hp,
                'pesan'     => rekap_pesan($db, $s, $sisa),
                'gambar'    => '',
                'status'    => 'antre',
                'percobaan' => 0,
                'dibuat'    => date('c'),
            ];
            $dibuat++;
        }
        db_save($db);
        out(['ok' => true, 'dibuat' => $dibuat, 'dilewati' => $lewat], 201);
    }

    if ($method === 'GET') {
        /* QR & kode pairing hanya utk admin login — pembaca tanpa sesi (poll bot) cukup
           melihat status/mintakode, sehingga QR tidak bisa dibajak pihak luar */
        if (!$SESI) { $state['qr'] = ''; $state['kode'] = ''; }
        out($state);
    }
    if ($method === 'POST') {
        $actW = (string)($body['act'] ?? '');
        if ($actW === 'qr') {
            $state['qr']     = (string)($body['qr'] ?? '');
            $state['status'] = $state['qr'] !== '' ? 'menunggu_scan' : 'logout';
            if ($state['qr'] === '') { $state['kode'] = ''; }
        } elseif ($actW === 'pair') {
            /* minta KODE PAIRING RESMI dari WhatsApp — diproses bot (Baileys requestPairingCode) */
            $no = preg_replace('/[^0-9]/', '', (string)($body['no'] ?? ''));
            if (strncmp($no, '0', 1) === 0) { $no = '62' . substr($no, 1); }
            elseif (strncmp($no, '8', 1) === 0) { $no = '62' . $no; }
            if (strlen($no) < 10 || strlen($no) > 15) { fail('Nomor telepon tidak valid (mis. 081234567890)'); }
            $state['no']        = $no;
            $state['mintakode'] = time();     // penanda permintaan — dibaca bot
            $state['kode']      = '';
            $state['status']    = 'meminta_kode';
        } elseif ($actW === 'kodepair') {
            /* kode resmi hasil requestPairingCode dari bot */
            $kode = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)($body['kode'] ?? '')));
            if (strlen($kode) < 4) { fail('Kode pairing tidak valid'); }
            $state['kode']      = $kode;
            $state['mintakode'] = 0;
            $state['status']    = 'kode_aktif';
        } elseif ($actW === 'status') {
            $state['status'] = (string)($body['status'] ?? $state['status']);
            if (array_key_exists('no', $body)) { $state['no'] = (string)$body['no']; }
            if (array_key_exists('qr', $body)) { $state['qr'] = (string)$body['qr']; }
        } elseif ($actW === 'logout') {
            $state = ['status' => 'logout', 'qr' => '', 'kode' => '', 'no' => '', 'diperbarui' => ''];
        } else {
            fail('act tidak dikenal (qr | kode | status | logout)');
        }
        $state['diperbarui'] = date('c');
        if (@file_put_contents($fileWa, json_encode($state, JSON_PRETTY_PRINT)) === false) {
            fail('Gagal menyimpan state WhatsApp (folder data tidak bisa ditulis)');
        }
        out($state);
    }
    fail('Method tidak diizinkan', 405);
}

if ($p === 'pengaturan') {
    if ($method === 'GET') { out($db['pengaturan']); }
    if ($method === 'PUT') {
        foreach (['nama_pesantren', 'alamat', 'kota', 'tahun_ajaran', 'logo_teks', 'nama_mudir', 'nama_bendahara', 'web', 'telp', 'wa_bridge_url', 'wa_bridge_key'] as $k) {
            if (isset($body[$k])) { $db['pengaturan'][$k] = (string)$body[$k]; }
        }
        if (isset($body['saldo_awal'])) { $db['pengaturan']['saldo_awal'] = (float)$body['saldo_awal']; }
        /* upload gambar: logo, TTD mudir, TTD bendahara, cap (data URI base64) */
        $uploads = ['logo_b64' => 'logo', 'ttd_mudir_b64' => 'ttd_mudir', 'ttd_bendahara_b64' => 'ttd_bendahara', 'cap_b64' => 'cap'];
        foreach ($uploads as $field => $namaFile) {
            if (isset($body[$field]) && is_string($body[$field]) && $body[$field] !== '') {
                $db['pengaturan'][$namaFile] = simpan_gambar($body[$field], $namaFile);
            }
        }
        db_save($db);
        out($db['pengaturan']);
    }
    fail('Method tidak diizinkan', 405);
}

/* =========================================================
 * KATEGORI
 * ========================================================= */
if ($p === 'kategori') {
    if ($method === 'GET') { out($db['kategori']); }
    if ($method === 'POST') {
        $nama  = trim((string)($body['nama'] ?? ''));
        $jenis = (string)($body['jenis'] ?? '');
        if ($nama === '' || !in_array($jenis, ['masuk', 'keluar'], true)) {
            fail('nama & jenis wajib diisi');
        }
        $k = [
            'id'    => uid($db, 'kategori'),
            'nama'  => $nama,
            'jenis' => $jenis,
            'warna' => (string)($body['warna'] ?? ($jenis === 'masuk' ? '#16a34a' : '#ef4444')),
        ];
        $db['kategori'][] = $k;
        db_save($db);
        out($k, 201);
    }
    if ($method === 'DELETE' && $id) {
        foreach ($db['transaksi'] as $t) {
            if (($t['kategori_id'] ?? '') === $id) { fail('Kategori dipakai transaksi, tidak bisa dihapus'); }
        }
        $db['kategori'] = array_values(array_filter($db['kategori'], function ($k) use ($id) { return $k['id'] !== $id; }));
        db_save($db);
        out(['ok' => true]);
    }
    fail('Method tidak diizinkan', 405);
}

/* =========================================================
 * AKUN PEMASUKAN / PENGELUARAN
 * ========================================================= */
if ($p === 'akun') {
    if ($method === 'GET') {
        out(['pemasukan' => akun_pemasukan_list(), 'pengeluaran' => akun_pengeluaran_list()]);
    }
    fail('Method tidak diizinkan', 405);
}

/* =========================================================
 * SANTRI (kolom tagihan lengkap)
 * ========================================================= */
if ($p === 'santri') {
    /* ---------- Import Excel ---------- */
    if ($method === 'POST' && $act === 'import') {
        $rows      = isset($body['rows']) && is_array($body['rows']) ? $body['rows'] : [];
        $overwrite = (bool)($body['overwrite'] ?? true);
        if (!$rows) { fail('Tidak ada baris untuk diimport'); }
        $peta      = import_peta_header($db);
        $dibuat    = 0; $diperbarui = 0; $dilewati = 0; $kolomBaru = [];
        $noUrut    = count($db['santri']);

        foreach ($rows as $row) {
            if (!is_array($row)) { $dilewati++; continue; }
            $isi   = ['nama' => '', 'kelas' => '', 'no_wa' => '', 'nis' => ''];
            $tagih = []; $custom = []; $adaIsi = false;

            foreach ($row as $h => $v) {
                $nk = norm_header((string)$h);
                if ($nk === '') { continue; }
                if (!isset($peta[$nk])) {
                    // header baru -> jadikan kolom custom
                    $asli  = trim((string)$h);
                    $key   = uid($db, 'kolom_custom');
                    $db['kolom_custom'][] = ['key' => $key, 'nama' => $asli];
                    $peta[$nk] = $key;
                    $kolomBaru[] = $asli;
                }
                $target = $peta[$nk];
                if ($target === '__abaikan__') { continue; }

                if (in_array($target, ['nama', 'kelas', 'no_wa', 'nis'], true)) {
                    $t = trim((string)$v);
                    if ($t !== '') { $isi[$target] = $t; $adaIsi = true; }
                } else {
                    $n = angka_import($v);
                    if ($n !== null) { $tagih[$target] = $n; $adaIsi = true; }
                }
            }
            if ($isi['nama'] === '' || !$adaIsi) { $dilewati++; continue; }

            $idx = null;
            foreach ($db['santri'] as $i => $s) {
                if (lower(trim((string)$s['nama'])) === lower($isi['nama'])) { $idx = $i; break; }
            }

            if ($idx === null) {
                $noUrut++;
                $s = santri_bersih([
                    'id'     => uid($db, 'santri'),
                    'no'     => $noUrut,
                    'nis'    => $isi['nis'] !== '' ? $isi['nis'] : 'SAN' . str_pad((string)$db['counters']['santri'], 5, '0', STR_PAD_LEFT),
                    'nama'   => $isi['nama'],
                    'kelas'  => $isi['kelas'] !== '' ? $isi['kelas'] : '-',
                    'no_wa'  => $isi['no_wa'],
                    'status' => 'aktif',
                    'dibuat' => date('c'),
                ], $db);
                foreach ($tagih as $k => $v) {
                    if (isset($s[$k])) { $s[$k] = $v; } else { $s['custom'][$k] = $v; }
                }
                foreach ($custom as $k => $v) { $s['custom'][$k] = $v; }
                $db['santri'][] = $s;
                $dibuat++;
            } elseif ($overwrite) {
                $s = santri_bersih($db['santri'][$idx], $db);
                if ($isi['kelas'] !== '')  { $s['kelas'] = $isi['kelas']; }
                if ($isi['no_wa'] !== '')  { $s['no_wa'] = $isi['no_wa']; $s['telepon'] = $isi['no_wa']; }
                if ($isi['nis'] !== '')    { $s['nis'] = $isi['nis']; }
                foreach ($tagih as $k => $v) {
                    if (isset($s[$k])) { $s[$k] = $v; } else { $s['custom'][$k] = $v; }
                }
                foreach ($custom as $k => $v) { $s['custom'][$k] = $v; }
                $db['santri'][$idx] = $s;
                $diperbarui++;
            } else {
                $dilewati++;
            }
        }
        db_save($db);
        $pesan = $dibuat . ' santri baru, ' . $diperbarui . ' diperbarui';
        if ($kolomBaru) { $pesan .= ', ' . count($kolomBaru) . ' kolom baru (' . implode(', ', $kolomBaru) . ')'; }
        if ($dilewati)  { $pesan .= ', ' . $dilewati . ' baris dilewati'; }
        out(['ok' => true, 'dibuat' => $dibuat, 'diperbarui' => $diperbarui, 'dilewati' => $dilewati, 'kolom_baru' => $kolomBaru, 'pesan' => $pesan]);
    }

    if ($method === 'GET') {
        $q      = isset($_GET['q']) ? trim((string)$_GET['q']) : '';
        $status = isset($_GET['status']) ? (string)$_GET['status'] : '';
        $kelas  = isset($_GET['kelas']) ? trim((string)$_GET['kelas']) : '';
        /* saldo berjalan kas khusus per santri — utk pemilihan pembagian & validasi kas keluar */
        $saldoUS  = saldo_kas_khusus_semua($db, 'Uang Saku');
        $saldoTab = saldo_kas_khusus_semua($db, 'Tabungan');
        $saldoLain= saldo_kas_khusus_semua($db, 'Tagihan Lain-lain');
        $out = []; $no = 0;
        foreach ($db['santri'] as $raw) {
            $no++;
            $s = santri_bersih($raw, $db);
            $s['no'] = $no;
            if ($q !== '' && stripos($s['nama'], $q) === false && stripos($s['nis'], $q) === false && stripos($s['no_wa'], $q) === false) { continue; }
            if ($status !== '' && $status !== 'semua' && $s['status'] !== $status) { continue; }
            if ($kelas !== '' && $kelas !== 'semua' && strcasecmp($s['kelas'], $kelas) !== 0) { continue; }
            $s['saldo_us']   = (float)($saldoUS[$s['id']] ?? 0);
            $s['saldo_tab']  = (float)($saldoTab[$s['id']] ?? 0);
            $s['saldo_lain'] = (float)($saldoLain[$s['id']] ?? 0);
            /* saldo Tagihan Lain-lain MINUS = utang santri → ditampilkan sbg tagihan plus (positif) di Data Santri */
            $s['tagihan_lain'] = $s['saldo_lain'] < 0 ? abs($s['saldo_lain']) : 0.0;
            $s['total_tagihan'] = santri_total_tagihan($s, $db) + $s['tagihan_lain'];
            $out[] = $s;
        }
        usort($out, function ($a, $b) { return strcmp($a['nama'], $b['nama']); });
        out($out);
    }

    if ($method === 'POST') {
        $nama = trim((string)($body['nama'] ?? ''));
        if ($nama === '') { fail('Nama wajib diisi'); }
        $s = santri_bersih([
            'id'     => uid($db, 'santri'),
            'no'     => count($db['santri']) + 1,
            'nis'    => trim((string)($body['nis'] ?? '')) !== '' ? trim((string)$body['nis']) : 'SAN' . str_pad((string)$db['counters']['santri'], 5, '0', STR_PAD_LEFT),
            'nama'   => $nama,
            'kelas'  => (string)($body['kelas'] ?? '-'),
            'no_wa'  => (string)($body['no_wa'] ?? ($body['telepon'] ?? '')),
            'telepon'=> (string)($body['no_wa'] ?? ($body['telepon'] ?? '')),
            'status' => (string)($body['status'] ?? 'aktif'),
            'dibuat' => date('c'),
        ], $db);
        foreach (jenis_tagihan_list($db) as $k) {
            if (isset($body[$k['key']])) {
                $v = angka_import($body[$k['key']]);
                if ($v !== null) {
                    if (isset($s[$k['key']])) { $s[$k['key']] = $v; } else { $s['custom'][$k['key']] = $v; }
                }
            }
        }
        foreach (kas_khusus_kolom() as $k) {
            if (array_key_exists($k['key'], $body)) {
                $v = angka_import($body[$k['key']]);
                if ($v !== null) { $s[$k['key']] = $v; }
            }
        }
        if (isset($body['custom']) && is_array($body['custom'])) {
            foreach ($body['custom'] as $k => $v) {
                $n = angka_import($v);
                if ($n !== null) { $s['custom'][(string)$k] = $n; }
            }
        }
        $db['santri'][] = $s;
        db_save($db);
        out($s, 201);
    }

    if ($method === 'PUT' && $id) {
        $idx = null;
        foreach ($db['santri'] as $i => $x) { if ($x['id'] === $id) { $idx = $i; break; } }
        if ($idx === null) { fail('Santri tidak ditemukan', 404); }
        $s = santri_bersih($db['santri'][$idx], $db);
        foreach (['nama', 'kelas', 'no_wa', 'nis', 'status'] as $k) {
            if (isset($body[$k])) { $s[$k] = (string)$body[$k]; }
        }
        if (isset($body['no_wa'])) { $s['telepon'] = (string)$body['no_wa']; }
        foreach (jenis_tagihan_list($db) as $k) {
            if (array_key_exists($k['key'], $body)) {
                $v = angka_import($body[$k['key']]);
                if ($v !== null) {
                    if (isset($s[$k['key']])) { $s[$k['key']] = $v; } else { $s['custom'][$k['key']] = $v; }
                }
            }
        }
        foreach (kas_khusus_kolom() as $k) {
            if (array_key_exists($k['key'], $body)) {
                $v = angka_import($body[$k['key']]);
                if ($v !== null) { $s[$k['key']] = $v; }
            }
        }
        if (isset($body['custom']) && is_array($body['custom'])) {
            foreach ($body['custom'] as $k => $v) {
                $n = angka_import($v);
                if ($n !== null) { $s['custom'][(string)$k] = $n; }
            }
        }
        $utangTl = saldo_kas_khusus_santri($db, 'Tagihan Lain-lain', $s['id'], $s['nama']);
        $s['tagihan_lain'] = $utangTl < 0 ? abs($utangTl) : 0.0;
        $s['total_tagihan'] = santri_total_tagihan($s, $db) + $s['tagihan_lain'];
        $db['santri'][$idx] = $s;
        db_save($db);
        out($s);
    }

    if ($method === 'DELETE' && $id) {
        foreach ($db['tagihan'] as $t) {
            if (($t['santri_id'] ?? '') === $id) { fail('Santri memiliki riwayat tagihan, tidak bisa dihapus'); }
        }
        $db['santri'] = array_values(array_filter($db['santri'], function ($x) use ($id) { return $x['id'] !== $id; }));
        db_save($db);
        out(['ok' => true]);
    }
    fail('Method tidak diizinkan', 405);
}

/* =========================================================
 * KOLOM CUSTOM (Data Santri)
 * ========================================================= */
if ($p === 'kolom-custom') {
    if ($method === 'GET') { out($db['kolom_custom']); }
    if ($method === 'POST') {
        $nama = trim((string)($body['nama'] ?? ''));
        if ($nama === '') { fail('Nama kolom wajib diisi'); }
        foreach ($db['kolom_custom'] as $c) {
            if (strcasecmp($c['nama'], $nama) === 0) { fail('Nama kolom sudah ada'); }
        }
        foreach (tagihan_kolom() as $k) {
            if (strcasecmp($k['nama'], $nama) === 0) { fail('Nama kolom sudah dipakai kolom bawaan'); }
        }
        $c = ['key' => uid($db, 'kolom_custom'), 'nama' => $nama];
        $db['kolom_custom'][] = $c;
        db_save($db);
        out($c, 201);
    }
    if ($method === 'PUT' && $id) {
        foreach ($db['kolom_custom'] as $i => $c) {
            if ($c['key'] === $id) {
                $nama = trim((string)($body['nama'] ?? ''));
                if ($nama === '') { fail('Nama kolom wajib diisi'); }
                $db['kolom_custom'][$i]['nama'] = $nama;
                db_save($db);
                out($db['kolom_custom'][$i]);
            }
        }
        fail('Kolom tidak ditemukan', 404);
    }
    if ($method === 'DELETE' && $id) {
        $db['kolom_custom'] = array_values(array_filter($db['kolom_custom'], function ($c) use ($id) { return $c['key'] !== $id; }));
        foreach ($db['santri'] as $i => $s) {
            if (isset($s['custom'][$id])) { unset($db['santri'][$i]['custom'][$id]); }
        }
        db_save($db);
        out(['ok' => true]);
    }
    fail('Method tidak diizinkan', 405);
}

/* =========================================================
 * JURNAL PEMASUKAN
 * ========================================================= */
if ($p === 'jurnal') {
    if ($method === 'GET') {
        if ($act === 'next') {
            $arahNext = isset($_GET['arah']) ? (string)$_GET['arah'] : 'masuk';
            if ($arahNext === 'keluar') { out(['no_bkk' => bkk_nomor($db)]); }
            out(['no_bkm' => bkm_nomor($db)]);
        }

        $dari   = isset($_GET['dari']) ? (string)$_GET['dari'] : '';
        $sampai = isset($_GET['sampai']) ? (string)$_GET['sampai'] : '';
        $q      = isset($_GET['q']) ? trim((string)$_GET['q']) : '';
        $jt     = isset($_GET['jenis_transaksi']) ? (string)$_GET['jenis_transaksi'] : '';
        $arah   = isset($_GET['arah']) ? (string)$_GET['arah'] : '';
        $list   = $db['jurnal'];
        if ($arah !== '' && $arah !== 'semua') {
            $list = array_values(array_filter($list, function ($x) use ($arah) {
                return (($x['arah'] ?? 'masuk') === 'keluar' ? 'keluar' : 'masuk') === $arah;
            }));
        }
        if ($dari !== '')   { $list = array_values(array_filter($list, function ($x) use ($dari) { return $x['tanggal'] >= $dari; })); }
        if ($sampai !== '') { $list = array_values(array_filter($list, function ($x) use ($sampai) { return $x['tanggal'] <= $sampai; })); }
        if ($jt !== '' && $jt !== 'semua') { $list = array_values(array_filter($list, function ($x) use ($jt) { return $x['jenis_transaksi'] === $jt; })); }
        if ($q !== '') {
            $list = array_values(array_filter($list, function ($x) use ($q) {
                foreach (['nama', 'no_bkm', 'no_bkk', 'akun', 'sumber_dana', 'keterangan'] as $fld) {
                    if (stripos((string)($x[$fld] ?? ''), $q) !== false) { return true; }
                }
                return false;
            }));
        }
        $out = [];
        foreach ($list as $x) {
            $arahX = ($x['arah'] ?? 'masuk') === 'keluar' ? 'keluar' : 'masuk';
            $akun  = (string)($x['akun'] ?? '');
            if ($akun === '' && $arahX === 'masuk') { $akun = akun_dari_tagihan((string)($x['tagihan_jenis'] ?? ''), $db); }
            $out[] = array_merge($x, [
                'arah'          => $arahX,
                'akun'          => $akun,
                'label_tagihan' => jurnal_label_full($db, $x),
            ]);
        }
        usort($out, function ($a, $b) {
            $c = strcmp($b['tanggal'], $a['tanggal']);
            return $c !== 0 ? $c : strcmp((string)($b['id'] ?? ''), (string)($a['id'] ?? ''));
        });
        out($out);
    }

    if ($method === 'POST') {
        $arah   = (string)($body['arah'] ?? 'masuk') === 'keluar' ? 'keluar' : 'masuk';
        $tanggal = (string)($body['tanggal'] ?? '');
        $jt      = (string)($body['jenis_transaksi'] ?? '');
        $nominal = angka_import($body['nominal'] ?? null);
        $akun    = trim((string)($body['akun'] ?? ''));
        $sumber  = trim((string)($body['sumber_dana'] ?? ''));
        $ket     = trim((string)($body['keterangan'] ?? ''));
        if ($tanggal === '') { fail('Tanggal wajib diisi'); }
        if (!in_array($jt, ['Cas', 'BRI', 'BSI', 'BPD'], true)) { fail('Jenis transaksi tidak valid'); }

        $items  = (isset($body['items']) && is_array($body['items'])) ? $body['items'] : [];
        $kaskus = (isset($body['kaskus']) && is_array($body['kaskus'])) ? $body['kaskus'] : [];

        /* ---- Multi: entry beberapa tagihan iuran + setoran kas khusus sekaligus ---- */
        if ($arah === 'masuk' && ($items || $kaskus)) {
            /* kas khusus bukan akun pembayaran tagihan iuran — buang sebagai fallback */
            if (in_array($akun, kas_khusus_akun_list(), true)) { $akun = ''; }
            if ($akun !== '' && !in_array($akun, akun_pemasukan_list(), true)) { fail('Akun pemasukan tidak valid'); }
            $santriId = (string)($body['santri_id'] ?? '');
            $nama     = trim((string)($body['nama'] ?? ''));
            $kelas    = (string)($body['kelas'] ?? '');
            if ($santriId !== '') {
                $s = find_by_id($db['santri'], $santriId);
                if ($s) { $nama = $s['nama']; if ($kelas === '') { $kelas = $s['kelas']; } }
            }
            if ($nama === '') { fail('Nama wajib diisi'); }

            /* validasi setoran kas khusus — akun wajib dari daftar kas khusus, nominal > 0 */
            $kkSiap = [];
            foreach ($kaskus as $k) {
                $ka = is_array($k) ? trim((string)($k['akun'] ?? '')) : '';
                $kn = (is_array($k) && isset($k['nominal'])) ? (float)$k['nominal'] : 0;
                if (!in_array($ka, kas_khusus_akun_list(), true)) { fail('Akun kas khusus tidak valid'); }
                if ($kn <= 0) { fail('Nominal kas khusus harus > 0'); }
                $kkSiap[] = ['akun' => $ka, 'nominal' => $kn];
            }

            // validasi semua tagihan dulu — belum ada data ditulis
            $siap = [];
            foreach ($items as $it) {
                $tid = is_array($it) ? (string)($it['tagihan_id'] ?? '') : (string)$it;
                if ($tid === '') { continue; }
                $t = find_by_id($db['tagihan'], $tid);
                if (!$t) { fail('Tagihan tidak ditemukan (' . $tid . ')', 404); }
                if ($santriId !== '' && (string)$t['santri_id'] !== $santriId) { fail('Tagihan bukan milik santri yang dipilih'); }
                $sisa = tagihan_sisa($db, $t);
                if ($sisa <= 0) { fail('Tagihan sudah terbayar: ' . jurnal_label_full($db, ['tagihan_id' => $t['id']])); }
                foreach ($siap as $ada) { if ($ada['t']['id'] === $t['id']) { fail('Ada tagihan terpilih ganda'); } }
                $siap[] = ['t' => $t, 'sisa' => $sisa];
            }
            if (!$siap && !$kkSiap) { fail('Tidak ada tagihan atau setoran dipilih'); }

            $kat  = kategori_jurnal($db);
            $noBkm = bkm_nomor($db, true);   // satu entry multi-tagihan = SATU nomor BKM
            /* foto bukti transfer bank — dipakai utk kwitansi BKM */
            $buktiTransfer = bukti_simpan((string)($body['bukti_transfer_b64'] ?? ''), 'bukti_transfer', $noBkm);
            $buat = [];
            $tot  = 0.0;
            foreach ($siap as $row) {
                $t    = $row['t'];
                $sisa = $row['sisa'];
                $jn  = find_by_id($db['jenis_tagihan'], (string)($t['jenis_id'] ?? ''));
                $akunItem = akun_dari_jenis_iuran($jn ? (string)$jn['nama'] : '');
                if ($akunItem === '') { $akunItem = $akun; }
                $label = jurnal_label_full($db, ['tagihan_id' => $t['id']]);

                $j = [
                    'id'              => uid($db, 'jurnal'),
                    'tanggal'         => $tanggal,
                    'no_bkm'          => $noBkm,
                    'arah'            => 'masuk',
                    'santri_id'       => $santriId,
                    'nama'            => $nama,
                    'kelas'           => $kelas !== '' ? $kelas : '-',
                    'jenis_transaksi' => $jt,
                    'tagihan_jenis'   => '',
                    'tagihan_id'      => $t['id'],
                    'akun'            => $akunItem,
                    'nominal'         => $sisa,
                    'keterangan'      => $ket,
                    'dibuat'          => date('c'),
                ];
                if ($buktiTransfer !== '') { $j['bukti_transfer'] = $buktiTransfer; }
                $db['jurnal'][] = $j;

                // tandai tagihan terbayar (terhubung ke jurnal ini)
                $db['pembayaran'][] = [
                    'id'         => uid($db, 'pembayaran'),
                    'tagihan_id' => $t['id'],
                    'tanggal'    => $tanggal,
                    'jumlah'     => $sisa,
                    'metode'     => $jt,
                    'petugas'    => '',
                    'keterangan' => $noBkm,
                    'jurnal_id'  => $j['id'],
                ];

                $db['transaksi'][] = [
                    'id'          => uid($db, 'transaksi'),
                    'tanggal'     => $tanggal,
                    'jenis'       => 'masuk',
                    'kategori_id' => $kat['id'],
                    'jumlah'      => $sisa,
                    'keterangan'  => $noBkm . ' • ' . $nama . ($label !== '' ? ' • ' . $label : ''),
                    'ref'         => $j['id'],
                    'ref_tipe'    => 'jurnal',
                    'dibuat'      => date('c'),
                ];

                $j['label_tagihan'] = $label;
                $buat[] = $j;
                $tot   += $sisa;
            }

            /* setoran kas khusus — jurnal masuk tanpa tagihan (menambah saldo kas khusus santri) */
            $dibuatKk = 0;
            foreach ($kkSiap as $k) {
                $j = [
                    'id'              => uid($db, 'jurnal'),
                    'tanggal'         => $tanggal,
                    'no_bkm'          => $noBkm,
                    'arah'            => 'masuk',
                    'santri_id'       => $santriId,
                    'nama'            => $nama,
                    'kelas'           => $kelas !== '' ? $kelas : '-',
                    'jenis_transaksi' => $jt,
                    'tagihan_jenis'   => '',
                    'tagihan_id'      => '',
                    'akun'            => $k['akun'],
                    'nominal'         => $k['nominal'],
                    'keterangan'      => $ket,
                    'dibuat'          => date('c'),
                ];
                if ($buktiTransfer !== '') { $j['bukti_transfer'] = $buktiTransfer; }
                $db['jurnal'][] = $j;

                $db['transaksi'][] = [
                    'id'          => uid($db, 'transaksi'),
                    'tanggal'     => $tanggal,
                    'jenis'       => 'masuk',
                    'kategori_id' => $kat['id'],
                    'jumlah'      => $k['nominal'],
                    'keterangan'  => $noBkm . ' • ' . $nama . ' • Setor ' . $k['akun'],
                    'ref'         => $j['id'],
                    'ref_tipe'    => 'jurnal',
                    'dibuat'      => date('c'),
                ];

                $j['label_tagihan'] = '';
                $buat[] = $j;
                $tot   += $k['nominal'];
                $dibuatKk++;
            }
            db_save($db);
            out(['ok' => true, 'dibuat' => count($buat) - $dibuatKk, 'dibuat_kk' => $dibuatKk, 'total' => $tot, 'jurnal' => $buat], 201);
        }

        if ($nominal === null || $nominal <= 0) { fail('Nominal harus > 0'); }

        if ($arah === 'masuk') {
            $santriId = (string)($body['santri_id'] ?? '');
            $nama     = trim((string)($body['nama'] ?? ''));
            $kelas    = (string)($body['kelas'] ?? '');
            if ($santriId !== '') {
                $s = find_by_id($db['santri'], $santriId);
                if ($s) { $nama = $s['nama']; if ($kelas === '') { $kelas = $s['kelas']; } }
            }
            if ($nama === '') { fail('Nama wajib diisi'); }

            $noBkm = trim((string)($body['no_bkm'] ?? ''));
            if ($noBkm === '') { $noBkm = bkm_nomor($db, true); }
            else { nomor_sinkron($db, $noBkm); }

            $tagihanKey = (string)($body['tagihan_jenis'] ?? '');
            $label      = jurnal_label_tagihan($db, $tagihanKey);
            if ($akun === '') { $akun = akun_dari_tagihan($tagihanKey, $db); }
            if ($akun !== '' && !in_array($akun, akun_pemasukan_list(), true)) { fail('Akun pemasukan tidak valid'); }

            $j = [
                'id'              => uid($db, 'jurnal'),
                'tanggal'         => $tanggal,
                'no_bkm'          => $noBkm,
                'arah'            => 'masuk',
                'santri_id'       => $santriId,
                'nama'            => $nama,
                'kelas'           => $kelas !== '' ? $kelas : '-',
                'jenis_transaksi' => $jt,
                'tagihan_jenis'   => $tagihanKey,
                'akun'            => $akun,
                'nominal'         => $nominal,
                'keterangan'      => $ket,
                'dibuat'          => date('c'),
            ];
            $buktiTransfer = bukti_simpan((string)($body['bukti_transfer_b64'] ?? ''), 'bukti_transfer', $noBkm);
            if ($buktiTransfer !== '') { $j['bukti_transfer'] = $buktiTransfer; }
            $db['jurnal'][] = $j;

            $kat = kategori_jurnal($db);
            $kt  = $noBkm . ' • ' . $nama . ($label !== '' ? ' • ' . $label : '');
            $db['transaksi'][] = [
                'id'          => uid($db, 'transaksi'),
                'tanggal'     => $tanggal,
                'jenis'       => 'masuk',
                'kategori_id' => $kat['id'],
                'jumlah'      => $nominal,
                'keterangan'  => $kt,
                'ref'         => $j['id'],
                'ref_tipe'    => 'jurnal',
                'dibuat'      => date('c'),
            ];
            db_save($db);
            $j['label_tagihan'] = $label;
            out($j, 201);
        }

        // ---- kas keluar ----
        if ($akun === '' || !in_array($akun, akun_pengeluaran_list(), true)) { fail('Akun pengeluaran wajib dipilih'); }
        if ($sumber === '' || !in_array($sumber, akun_pemasukan_list(), true)) { fail('Sumber dana (akun pemasukan) wajib dipilih'); }

        // penerima (santri) — opsional, dipakai mutasi uang saku / tabungan / tagihan lain
        $santriIdK = (string)($body['santri_id'] ?? '');
        $namaK     = trim((string)($body['nama'] ?? ''));
        $kelasK    = (string)($body['kelas'] ?? '');
        if ($santriIdK !== '') {
            $s = find_by_id($db['santri'], $santriIdK);
            if ($s) { $namaK = $s['nama']; if ($kelasK === '') { $kelasK = $s['kelas']; } }
        }

        // uang saku: saldo santri Rp 0 → tidak boleh ada jurnal kas keluar
        if ($sumber === 'Uang Saku' && ($santriIdK !== '' || $namaK !== '')) {
            $sisaUS = saldo_kas_khusus_santri($db, 'Uang Saku', $santriIdK, $namaK);
            if ($sisaUS <= 0) {
                fail('Saldo uang saku ' . ($namaK !== '' ? $namaK : 'santri') . ' Rp 0 — tidak bisa mencatat kas keluar uang saku');
            }
        }

        $noBkk = trim((string)($body['no_bkk'] ?? ''));
        if ($noBkk === '') { $noBkk = bkk_nomor($db, true); }
        else { nomor_sinkron($db, $noBkk); }

        $j = [
            'id'              => uid($db, 'jurnal'),
            'tanggal'         => $tanggal,
            'no_bkk'          => $noBkk,
            'arah'            => 'keluar',
            'santri_id'       => $santriIdK,
            'nama'            => $namaK,
            'kelas'           => $kelasK !== '' ? $kelasK : '-',
            'jenis_transaksi' => $jt,
            'tagihan_jenis'   => '',
            'akun'            => $akun,
            'sumber_dana'     => $sumber,
            'nominal'         => $nominal,
            'keterangan'      => $ket,
            'dibayarkan'      => trim((string)($body['dibayarkan'] ?? '')),
            'dibuat'          => date('c'),
        ];
        /* foto bukti nota & tanda tangan penerima (bila tanpa nota) — utk kwitansi BKK */
        $nota = bukti_simpan((string)($body['bukti_nota_b64'] ?? ''), 'bukti_nota', $noBkk);
        $ttdP = bukti_simpan((string)($body['ttd_b64'] ?? ''), 'ttd_penerima', $noBkk);
        if ($nota !== '') { $j['bukti_nota'] = $nota; }
        if ($ttdP !== '') { $j['ttd_penerima'] = $ttdP; }
        $db['jurnal'][] = $j;

        $kat = kategori_jurnal_keluar($db);
        $kt  = $noBkk . ' • ' . $akun . ' ← ' . $sumber . ($namaK !== '' ? ' • ' . $namaK : '') . ($ket !== '' ? ' • ' . $ket : '');
        $db['transaksi'][] = [
            'id'          => uid($db, 'transaksi'),
            'tanggal'     => $tanggal,
            'jenis'       => 'keluar',
            'kategori_id' => $kat['id'],
            'jumlah'      => $nominal,
            'keterangan'  => $kt,
            'ref'         => $j['id'],
            'ref_tipe'    => 'jurnal',
            'dibuat'      => date('c'),
        ];
        $waAntre        = wa_antre_kas_keluar($db, $j);
        db_save($db);
        $j['wa_antre']  = $waAntre;
        out($j, 201);
    }

    if ($method === 'PUT' && $id) {
        $idx = null;
        foreach ($db['jurnal'] as $i => $x) { if ($x['id'] === $id) { $idx = $i; break; } }
        if ($idx === null) { fail('Jurnal tidak ditemukan', 404); }
        $j    = $db['jurnal'][$idx];
        $arah = ($j['arah'] ?? 'masuk') === 'keluar' ? 'keluar' : 'masuk';

        $tanggal = isset($body['tanggal']) ? (string)$body['tanggal'] : $j['tanggal'];
        $jt      = isset($body['jenis_transaksi']) ? (string)$body['jenis_transaksi'] : $j['jenis_transaksi'];
        $nominal = array_key_exists('nominal', $body) ? angka_import($body['nominal']) : (float)$j['nominal'];
        if ($tanggal === '') { fail('Tanggal wajib diisi'); }
        if (!in_array($jt, ['Cas', 'BRI', 'BSI', 'BPD'], true)) { fail('Jenis transaksi tidak valid'); }
        if ($nominal === null || $nominal <= 0) { fail('Nominal harus > 0'); }

        $nama = isset($body['nama']) ? trim((string)$body['nama']) : (string)$j['nama'];
        if ($arah === 'masuk' && $nama === '') { fail('Nama wajib diisi'); }

        $j['tanggal']         = $tanggal;
        $j['jenis_transaksi'] = $jt;
        $j['nominal']         = $nominal;
        $hapusLama = [];   // file bukti lama yang boleh dihapus (bila tak dipakai jurnal lain)

        if ($arah === 'masuk') {
            $j['nama'] = $nama;
            if (array_key_exists('no_bkm', $body))     { $j['no_bkm'] = trim((string)$body['no_bkm']) !== '' ? trim((string)$body['no_bkm']) : $j['no_bkm']; }
            nomor_sinkron($db, (string)$j['no_bkm']);
            if (array_key_exists('kelas', $body))      { $j['kelas'] = (string)$body['kelas']; }
            if (array_key_exists('santri_id', $body))  { $j['santri_id'] = (string)$body['santri_id']; }
            if (array_key_exists('tagihan_jenis', $body)) { $j['tagihan_jenis'] = (string)$body['tagihan_jenis']; }
            if (array_key_exists('akun', $body)) {
                $akun = trim((string)$body['akun']);
                if ($akun === '') { $akun = akun_dari_tagihan((string)($j['tagihan_jenis'] ?? ''), $db); }
                if ($akun !== '' && !in_array($akun, akun_pemasukan_list(), true)) { fail('Akun pemasukan tidak valid'); }
                $j['akun'] = $akun;
            } elseif (array_key_exists('tagihan_jenis', $body)) {
                $j['akun'] = akun_dari_tagihan((string)$j['tagihan_jenis'], $db);
            }
            /* foto bukti transfer bank (untuk kwitansi BKM) */
            if (array_key_exists('bukti_transfer_b64', $body) && is_string($body['bukti_transfer_b64']) && $body['bukti_transfer_b64'] !== '') {
                $baru = bukti_simpan((string)$body['bukti_transfer_b64'], 'bukti_transfer', (string)$j['no_bkm']);
                $lama = (string)($j['bukti_transfer'] ?? '');
                if ($baru !== '' && $lama !== '' && $lama !== $baru) { $hapusLama[] = $lama; }
                if ($baru !== '') { $j['bukti_transfer'] = $baru; }
            }
            if (!empty($body['hapus_bukti_transfer'])) {
                $lama = (string)($j['bukti_transfer'] ?? '');
                if ($lama !== '') { $hapusLama[] = $lama; }
                unset($j['bukti_transfer']);
            }
        } else {
            if (array_key_exists('no_bkk', $body))    { $j['no_bkk'] = trim((string)$body['no_bkk']) !== '' ? trim((string)$body['no_bkk']) : $j['no_bkk']; }
            if (array_key_exists('akun', $body)) {
                $akun = trim((string)$body['akun']);
                if ($akun === '' || !in_array($akun, akun_pengeluaran_list(), true)) { fail('Akun pengeluaran wajib dipilih'); }
                $j['akun'] = $akun;
            }
            if (array_key_exists('sumber_dana', $body)) {
                $sumber = trim((string)$body['sumber_dana']);
                if ($sumber === '' || !in_array($sumber, akun_pemasukan_list(), true)) { fail('Sumber dana (akun pemasukan) wajib dipilih'); }
                $j['sumber_dana'] = $sumber;
            }
            if (array_key_exists('nama', $body)) {
                $j['nama']      = trim((string)$body['nama']);
                $j['santri_id'] = array_key_exists('santri_id', $body) ? (string)$body['santri_id'] : (string)($j['santri_id'] ?? '');
                if ($j['santri_id'] !== '') {
                    $s = find_by_id($db['santri'], $j['santri_id']);
                    if ($s) { $j['nama'] = $s['nama']; $j['kelas'] = $s['kelas']; }
                }
                if (array_key_exists('kelas', $body) && trim((string)$body['kelas']) !== '') { $j['kelas'] = (string)$body['kelas']; }
            }
            /* foto bukti nota & tanda tangan penerima (bila tanpa nota) — utk kwitansi BKK */
            if (array_key_exists('bukti_nota_b64', $body) && is_string($body['bukti_nota_b64']) && $body['bukti_nota_b64'] !== '') {
                $baru = bukti_simpan((string)$body['bukti_nota_b64'], 'bukti_nota', (string)$j['no_bkk']);
                $lama = (string)($j['bukti_nota'] ?? '');
                if ($baru !== '' && $lama !== '' && $lama !== $baru) { $hapusLama[] = $lama; }
                if ($baru !== '') { $j['bukti_nota'] = $baru; }
            }
            if (array_key_exists('ttd_b64', $body) && is_string($body['ttd_b64']) && $body['ttd_b64'] !== '') {
                $baru = bukti_simpan((string)$body['ttd_b64'], 'ttd_penerima', (string)$j['no_bkk']);
                $lama = (string)($j['ttd_penerima'] ?? '');
                if ($baru !== '' && $lama !== '' && $lama !== $baru) { $hapusLama[] = $lama; }
                if ($baru !== '') { $j['ttd_penerima'] = $baru; }
            }
            if (!empty($body['hapus_bukti_nota'])) {
                $lama = (string)($j['bukti_nota'] ?? '');
                if ($lama !== '') { $hapusLama[] = $lama; }
                unset($j['bukti_nota']);
            }
            if (!empty($body['hapus_ttd_penerima'])) {
                $lama = (string)($j['ttd_penerima'] ?? '');
                if ($lama !== '') { $hapusLama[] = $lama; }
                unset($j['ttd_penerima']);
            }
            /* "Dibayarkan kepada" — teks manual, bukan diambil dari data santri */
            if (array_key_exists('dibayarkan', $body)) { $j['dibayarkan'] = trim((string)$body['dibayarkan']); }
        }
        if (array_key_exists('keterangan', $body)) { $j['keterangan'] = (string)$body['keterangan']; }
        $db['jurnal'][$idx] = $j;
        foreach (array_unique($hapusLama) as $pathLama) { bukti_hapus($db, $pathLama); }
        $label = jurnal_label_full($db, $j);

        // sinkronkan pembayaran iuran yang dibuat dari jurnal ini
        foreach ($db['pembayaran'] as $i => $pb) {
            if (($pb['jurnal_id'] ?? '') === $id) {
                $db['pembayaran'][$i]['tanggal'] = $tanggal;
                $db['pembayaran'][$i]['jumlah']  = $nominal;
            }
        }

        // sinkronkan transaksi kas terkait
        foreach ($db['transaksi'] as $i => $t) {
            if (($t['ref'] ?? '') === $id) {
                if ($arah === 'keluar') {
                    $no  = (string)($j['no_bkk'] ?? '');
                    $kt  = $no . ' • ' . (string)$j['akun'] . ' ← ' . (string)($j['sumber_dana'] ?? '');
                    $pnh = trim((string)($j['nama'] ?? ''));
                    $ket = trim((string)($j['keterangan'] ?? ''));
                    $db['transaksi'][$i]['keterangan'] = $kt . ($pnh !== '' ? ' • ' . $pnh : '') . ($ket !== '' ? ' • ' . $ket : '');
                } else {
                    $db['transaksi'][$i]['keterangan'] = $j['no_bkm'] . ' • ' . $nama . ($label !== '' ? ' • ' . $label : '');
                }
                $db['transaksi'][$i]['tanggal'] = $tanggal;
                $db['transaksi'][$i]['jumlah']  = $nominal;
                break;
            }
        }
        /* info wali (kas khusus): bila pesannya masih antre, ganti dgn pesan terbaru */
        $pendingWa = wa_pending_kas($db, $id);
        if ($pendingWa) {
            foreach (array_reverse($pendingWa) as $pi) { unset($db['antre_wa'][$pi]); }
            $db['antre_wa'] = array_values($db['antre_wa']);
            wa_antre_kas_keluar($db, $j);
        }
        db_save($db);
        $j['label_tagihan'] = $label;
        out($j);
    }

    if ($method === 'DELETE' && $id) {
        $j = find_by_id($db['jurnal'], $id);
        if (!$j) { fail('Jurnal tidak ditemukan', 404); }
        $db['jurnal']     = array_values(array_filter($db['jurnal'], function ($x) use ($id) { return $x['id'] !== $id; }));
        $db['transaksi']  = array_values(array_filter($db['transaksi'], function ($t) use ($id) {
            return !(($t['ref'] ?? '') === $id && ($t['ref_tipe'] ?? '') === 'jurnal');
        }));
        // pembayaran iuran yang dibuat dari jurnal ini ikut dibatalkan
        $db['pembayaran'] = array_values(array_filter($db['pembayaran'], function ($pb) use ($id) {
            return ($pb['jurnal_id'] ?? '') !== $id;
        }));
        // file bukti (foto transfer / nota / tanda tangan) ikut dihapus bila tak dipakai jurnal lain
        foreach (['bukti_transfer', 'bukti_nota', 'ttd_penerima'] as $fB) {
            bukti_hapus($db, (string)($j[$fB] ?? ''));
        }
        // antrean info wali utk jurnal ini ikut dibatalkan (belum terkirim)
        $pendingWa = wa_pending_kas($db, $id);
        foreach (array_reverse($pendingWa) as $pi) { unset($db['antre_wa'][$pi]); }
        if ($pendingWa) { $db['antre_wa'] = array_values($db['antre_wa']); }
        db_save($db);
        out(['ok' => true]);
    }
    fail('Method tidak diizinkan', 405);
}

/* =========================================================
 * PEMBAGIAN UANG SAKU KUMULATIF — 1 tombol utk banyak santri
 * GET  p=pembagian                     riwayat batch (terbaru dulu)
 * GET  p=pembagian&id=..&act=pdf       unduh / regenerate PDF daftar pembagian
 * POST p=pembagian {tanggal, jenis_transaksi, kelompok, keterangan,
 *                   items:[{santri_id, nominal}]}
 *      -> SATU nomor BKK utk semua baris jurnal kas keluar, tersimpan sebagai
 *         file PDF (data/pembagian/<id>.pdf, format tabel spt cetak) +
 *         info transaksi diantre otomatis ke wali tiap santri
 * ========================================================= */
if ($p === 'pembagian') {

    if ($method === 'GET' && $id !== null && $act === 'pdf') {
        $b = find_by_id($db['pembagian'], (string)$id);
        if (!$b) { fail('Pembagian tidak ditemukan', 404); }
        $f = __DIR__ . '/data/pembagian/' . (string)$b['id'] . '.pdf';
        if (!is_file($f)) {                                   // file hilang — buat ulang dari record
            $isi = pdf_pembagian($b, $db['pengaturan']);
            $d   = dirname($f);
            if (!is_dir($d)) { @mkdir($d, 0775, true); }
            if (@file_put_contents($f, $isi) === false) { fail('Folder data/pembagian tidak bisa ditulis (permission 755/775)'); }
        }
        header('Content-Type: application/pdf');
        header('Content-Length: ' . filesize($f));
        header('Content-Disposition: inline; filename="Pembagian-Uang-Saku-' . preg_replace('/[^0-9-]/', '', (string)$b['tanggal']) . '.pdf"');
        readfile($f);
        exit;
    }

    if ($method === 'GET') {
        $list = [];
        foreach (array_reverse($db['pembagian']) as $b) {
            $list[] = [
                'id'        => (string)$b['id'],
                'no_bkk'    => (string)($b['no_bkk'] ?? ''),
                'tanggal'   => (string)($b['tanggal'] ?? ''),
                'kelompok'  => (string)($b['kelompok'] ?? ''),
                'keterangan'=> (string)($b['keterangan'] ?? ''),
                'jenis_transaksi' => (string)($b['jenis_transaksi'] ?? ''),
                'jumlah'    => count((array)($b['items'] ?? [])),
                'total'     => (float)($b['total'] ?? 0),
                'wa_antre'  => (int)($b['wa_antre'] ?? 0),
                'dibuat'    => (string)($b['dibuat'] ?? ''),
                'pdf'       => 'api.php?p=pembagian&id=' . urlencode((string)$b['id']) . '&act=pdf',
            ];
        }
        out(['list' => $list, 'jumlah' => count($list)]);
    }

    if ($method === 'POST') {
        $tanggal = trim((string)($body['tanggal'] ?? ''));
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggal)) { fail('Tanggal wajib diisi (format YYYY-MM-DD)'); }
        $jt = (string)($body['jenis_transaksi'] ?? 'Cas');
        if (!in_array($jt, ['Cas', 'BRI', 'BSI', 'BPD'], true)) { fail('Jenis transaksi tidak valid'); }

        $sumber = trim((string)($body['sumber_dana'] ?? ''));
        if ($sumber === '') { $sumber = 'Uang Saku'; }
        elseif (!in_array($sumber, akun_pemasukan_list(), true)) { fail('Sumber dana tidak valid'); }
        $akun = trim((string)($body['akun'] ?? ''));
        if ($akun === '') { $akun = 'Pembagian Uang Saku'; }
        elseif (!in_array($akun, akun_pengeluaran_list(), true)) { fail('Akun pengeluaran tidak valid'); }

        $kelompok = (string)preg_replace('/[^A-Za-z0-9 \/\\\\-]/', '', trim((string)($body['kelompok'] ?? '')));
        if (strlen($kelompok) > 40) { $kelompok = substr($kelompok, 0, 40); }

        $itemsIn = is_array($body['items'] ?? null) ? $body['items'] : [];
        if (!$itemsIn) { fail('Belum ada santri dipilih'); }

        // validasi seluruh baris dulu — belum ada data yang ditulis
        $siap = []; $ada = []; $lewati = [];
        foreach ($itemsIn as $it) {
            if (!is_array($it)) { continue; }
            $sid = trim((string)($it['santri_id'] ?? ''));
            if ($sid === '') { continue; }
            $n = angka_import($it['nominal'] ?? null);
            if ($n === null || $n <= 0) { fail('Nominal pembagian harus > 0'); }
            if (isset($ada[$sid])) { fail('Ada santri terpilih ganda'); }
            $raw = find_by_id($db['santri'], $sid);
            if (!$raw) { fail('Santri tidak ditemukan (' . $sid . ')', 404); }
            $ada[$sid] = true;
            $s = santri_bersih($raw, $db);
            /* saldo 0 → tidak dibagikan; saldo kurang dari nominal → dibagikan sisa saldo terakhir */
            $sisa = saldo_kas_khusus_santri($db, $sumber, $sid, (string)$s['nama']);
            if ($sisa <= 0) { $lewati[] = (string)$s['nama']; continue; }
            if ($n > $sisa) { $n = $sisa; }
            $siap[] = ['s' => $s, 'nominal' => $n];
        }
        if (!$siap) {
            fail($lewati
                ? 'Semua santri terpilih saldo uang sakunya 0 — tidak ada yang bisa dibagikan'
                : 'Tidak ada santri dipilih');
        }

        $ket = trim((string)($body['keterangan'] ?? ''));
        if ($ket === '') {
            $pT = explode('-', $tanggal);
            $ket = $akun . ' ' . $pT[2] . ' - ' . $pT[1] . ' - ' . $pT[0];   // spt "Pembagian Uang Saku 02 - 11 - 2026"
        }

        $batchId = uid($db, 'pembagian');
        $noBkk   = bkk_nomor($db, true);      // satu pembagian kumulatif = SATU nomor BKK
        $kat     = kategori_jurnal_keluar($db);
        $baris = []; $rowsJ = []; $total = 0.0;
        foreach ($siap as $row) {
            $s = $row['s'];
            $j = [
                'id'              => uid($db, 'jurnal'),
                'tanggal'         => $tanggal,
                'no_bkk'          => $noBkk,
                'arah'            => 'keluar',
                'santri_id'       => (string)$s['id'],
                'nama'            => (string)$s['nama'],
                'kelas'           => (string)($s['kelas'] !== '' ? $s['kelas'] : '-'),
                'jenis_transaksi' => $jt,
                'tagihan_jenis'   => '',
                'akun'            => $akun,
                'sumber_dana'     => $sumber,
                'nominal'         => $row['nominal'],
                'keterangan'      => $ket,
                'dibayarkan'      => '',
                'pembagian'       => $batchId,
                'dibuat'          => date('c'),
            ];
            $db['jurnal'][] = $j;
            $kt = $noBkk . ' • ' . $akun . ' ← ' . $sumber . ' • ' . $s['nama'] . ' • ' . $ket;
            $db['transaksi'][] = [
                'id'          => uid($db, 'transaksi'),
                'tanggal'     => $tanggal,
                'jenis'       => 'keluar',
                'kategori_id' => $kat['id'],
                'jumlah'      => $row['nominal'],
                'keterangan'  => $kt,
                'ref'         => $j['id'],
                'ref_tipe'    => 'jurnal',
                'dibuat'      => date('c'),
            ];
            $rowsJ[]  = $j;
            $baris[]  = [
                'santri_id' => (string)$s['id'],
                'nama'      => (string)$s['nama'],
                'kelas'     => (string)$s['kelas'],
                'kode'      => (string)($s['nis'] !== '' ? $s['nis'] : $s['no']),
                'nominal'   => $row['nominal'],
                'jurnal_id' => (string)$j['id'],
            ];
            $total += $row['nominal'];
        }

        // info otomatis ke wali — saldonya sudah mencakup seluruh baris pembagian ini
        $waA = 0; $waL = 0;
        foreach ($rowsJ as $jr) {
            if (wa_antre_kas_keluar($db, $jr)) { $waA++; } else { $waL++; }
        }

        $batch = [
            'id'        => $batchId,
            'no_bkk'    => $noBkk,
            'tanggal'   => $tanggal,
            'kelompok'  => $kelompok,
            'keterangan'=> $ket,
            'jenis_transaksi' => $jt,
            'akun'      => $akun,
            'sumber_dana'=> $sumber,
            'items'     => $baris,
            'total'     => $total,
            'wa_antre'  => $waA,
            'wa_lewat'  => $waL,
            'dibuat'    => date('c'),
        ];

        // simpan daftar pembagian sebagai file PDF
        $d = __DIR__ . '/data/pembagian';
        if (!is_dir($d)) { @mkdir($d, 0775, true); }
        $f = $d . '/' . $batchId . '.pdf';
        if (@file_put_contents($f, pdf_pembagian($batch, $db['pengaturan'])) === false) {
            fail('Folder data/pembagian tidak bisa ditulis (permission 755/775)');
        }

        $db['pembagian'][] = $batch;
        db_save($db);
        out([
            'ok' => true, 'id' => $batchId, 'no_bkk' => $noBkk,
            'dibuat' => count($baris), 'total' => $total, 'dilewati' => count($lewati),
            'wa_antre' => $waA, 'wa_lewat' => $waL,
            'pdf' => 'api.php?p=pembagian&id=' . urlencode($batchId) . '&act=pdf',
        ], 201);
    }
    fail('Method tidak diizinkan', 405);
}

/* =========================================================
 * MUTASI KAS PER AKUN — Uang Saku / Tabungan / Tagihan Lain-lain
 * GET  p=mutasi&sub=<kode>&dari=&sampai=&q=&jenis_transaksi=&arah=masuk|keluar
 * ========================================================= */
if ($p === 'mutasi') {
    if ($method === 'GET') {
        $peta = [
            'uang-saku'    => 'Uang Saku',
            'tabungan'     => 'Tabungan',
            'tagihan-lain' => 'Tagihan Lain-lain',
        ];
        $kode = (string)($sub ?? '');
        $akun = $peta[$kode] ?? '';
        if ($akun === '' && isset($_GET['akun'])) {
            $cand = trim((string)$_GET['akun']);
            if (in_array($cand, akun_pemasukan_list(), true)) { $akun = $cand; }
        }
        if ($akun === '') { fail('Jenis mutasi tidak dikenal', 404); }

        $dari   = isset($_GET['dari']) ? (string)$_GET['dari'] : '';
        $sampai = isset($_GET['sampai']) ? (string)$_GET['sampai'] : '';
        $q      = isset($_GET['q']) ? trim((string)$_GET['q']) : '';
        $jt     = isset($_GET['jenis_transaksi']) ? (string)$_GET['jenis_transaksi'] : '';
        $arah   = isset($_GET['arah']) ? (string)$_GET['arah'] : '';

        // seluruh mutasi utk akun ini (tanpa filter tanggal) — utk saldo awal
        $semua = [];
        foreach ($db['jurnal'] as $ord => $x) {
            $arahX = ($x['arah'] ?? 'masuk') === 'keluar' ? 'keluar' : 'masuk';
            $cocok = ($arahX === 'masuk' && (string)($x['akun'] ?? '') === $akun)
                  || ($arahX === 'keluar' && (string)($x['sumber_dana'] ?? '') === $akun);
            if (!$cocok) { continue; }
            $semua[] = ['ord' => $ord, 'j' => $x, 'arah' => $arahX];
        }
        usort($semua, function ($a, $b) {
            $c = strcmp((string)$a['j']['tanggal'], (string)$b['j']['tanggal']);
            return $c !== 0 ? $c : ($a['ord'] <=> $b['ord']);
        });

        /* filter per santri — seluruh perhitungan (saldo awal, list, rekap) ikut menyempit */
        $sidF = isset($_GET['santri_id']) ? trim((string)$_GET['santri_id']) : '';
        if ($sidF !== '') {
            $namaF = '';
            foreach ($db['santri'] as $s) {
                if ((string)$s['id'] === $sidF) { $namaF = lower(trim((string)$s['nama'])); break; }
            }
            if ($namaF === '') { fail('Santri tidak ditemukan', 404); }
            $semua = array_values(array_filter($semua, function ($m) use ($sidF, $namaF) {
                $x   = $m['j'];
                $sid = trim((string)($x['santri_id'] ?? ''));
                if ($sid !== '') { return $sid === $sidF; }
                return lower(trim((string)($x['nama'] ?? ''))) === $namaF;
            }));
        }

        // saldo awal kolom Data Santri (uang saku / tabungan / tagihan lain) + mutasi sebelum periode `dari`
        $saldo = saldo_awal_kas_khusus($db, $akun, $sidF);
        if ($dari !== '') {
            foreach ($semua as $m) {
                if ((string)$m['j']['tanggal'] < $dari) {
                    $saldo += $m['arah'] === 'masuk' ? (float)$m['j']['nominal'] : -(float)$m['j']['nominal'];
                }
            }
        }
        $saldoAwal = $saldo;

        $list = []; $totMasuk = 0.0; $totKeluar = 0.0;
        foreach ($semua as $m) {
            $x  = $m['j'];
            $tg = (string)$x['tanggal'];
            if ($dari !== '' && $tg < $dari) { continue; }
            if ($sampai !== '' && $tg > $sampai) { continue; }
            $n = (float)$x['nominal'];
            $saldo += $m['arah'] === 'masuk' ? $n : -$n;

            $akunX = (string)($x['akun'] ?? '');
            if ($akunX === '' && $m['arah'] === 'masuk') { $akunX = akun_dari_tagihan((string)($x['tagihan_jenis'] ?? ''), $db); }
            $row = array_merge($x, [
                'arah'          => $m['arah'],
                'akun'          => $akunX,
                'label_tagihan' => jurnal_label_full($db, $x),
                'saldo'         => $saldo,
            ]);
            if ($jt !== '' && $jt !== 'semua' && (string)$row['jenis_transaksi'] !== $jt) { continue; }
            if ($arah !== '' && $arah !== 'semua' && $row['arah'] !== $arah) { continue; }
            if ($q !== '') {
                $hit = false;
                foreach (['nama', 'no_bkm', 'no_bkk', 'akun', 'sumber_dana', 'keterangan', 'label_tagihan'] as $fld) {
                    if (stripos((string)($row[$fld] ?? ''), $q) !== false) { $hit = true; break; }
                }
                if (!$hit) { continue; }
            }
            if ($m['arah'] === 'masuk') { $totMasuk += $n; } else { $totKeluar += $n; }
            $list[] = $row;
        }

        // rekap SALDO AKHIR PER SANTRI pada periode yang sama (tanpa filter q/jenis/arah)
        $perSantri = [];
        /* saldo awal kolom Data Santri — santri tanpa mutasi pun tetap muncul bila saldo awalnya isi */
        foreach ($db['santri'] as $sAw) {
            $idAw = (string)($sAw['id'] ?? '');
            if ($idAw === '') { continue; }
            if ($sidF !== '' && $idAw !== $sidF) { continue; }
            $nAw = saldo_awal_kas_khusus_santri($db, $akun, $idAw, '');
            if ($nAw == 0) { continue; }
            $perSantri['s:' . $idAw] = [
                'santri_id' => $idAw, 'nama' => (string)($sAw['nama'] ?? ''), 'kelas' => (string)($sAw['kelas'] ?? ''),
                'saldo_awal' => $nAw, 'masuk' => 0.0, 'keluar' => 0.0, 'saldo' => 0.0, 'jumlah' => 0,
            ];
        }
        foreach ($semua as $m) {
            $x   = $m['j'];
            $tg  = (string)$x['tanggal'];
            if ($dari !== '' && $tg < $dari) { $bagian = 'awal'; }
            elseif ($sampai !== '' && $tg > $sampai) { continue; }
            else { $bagian = 'periode'; }

            $sid  = trim((string)($x['santri_id'] ?? ''));
            $nama = trim((string)($x['nama'] ?? ''));
            if ($sid !== '')      { $key = 's:' . $sid; }
            elseif ($nama !== '') { $key = 'n:' . lower($nama); }
            else                  { $key = '__tanpa'; $nama = 'Tanpa Nama Santri'; }

            if (!isset($perSantri[$key])) {
                $perSantri[$key] = [
                    'santri_id' => $sid, 'nama' => $nama, 'kelas' => trim((string)($x['kelas'] ?? '')),
                    'saldo_awal' => 0.0, 'masuk' => 0.0, 'keluar' => 0.0, 'saldo' => 0.0, 'jumlah' => 0,
                ];
            }
            if ($perSantri[$key]['kelas'] === '' || $perSantri[$key]['kelas'] === '-') {
                $kl = trim((string)($x['kelas'] ?? ''));
                if ($kl !== '') { $perSantri[$key]['kelas'] = $kl; }
            }
            $n = (float)$x['nominal'];
            if ($bagian === 'awal') {
                $perSantri[$key]['saldo_awal'] += $m['arah'] === 'masuk' ? $n : -$n;
            } else {
                if ($m['arah'] === 'masuk') { $perSantri[$key]['masuk'] += $n; }
                else                        { $perSantri[$key]['keluar'] += $n; }
                $perSantri[$key]['jumlah']++;
            }
        }
        $rekapSantri = [];
        foreach ($perSantri as $r) {
            $r['saldo'] = $r['saldo_awal'] + $r['masuk'] - $r['keluar'];
            if ($r['masuk'] == 0 && $r['keluar'] == 0 && $r['saldo'] == 0) { continue; }
            $rekapSantri[] = $r;
        }
        usort($rekapSantri, function ($a, $b) {
            if ($a['saldo'] != $b['saldo']) { return $b['saldo'] <=> $a['saldo']; }
            return strcasecmp($a['nama'], $b['nama']);
        });

        out([
            'akun'          => $akun,
            'kode'          => $kode !== '' ? $kode : $akun,
            'saldo_awal'    => $saldoAwal,
            'saldo_akhir'   => $saldo,
            'total_masuk'   => $totMasuk,
            'total_keluar'  => $totKeluar,
            'jumlah'        => count($list),
            'per_santri'    => $rekapSantri,
            'total_saldo_santri' => array_sum(array_map(function ($r) { return $r['saldo']; }, $rekapSantri)),
            'list'          => $list,
        ]);
    }
    fail('Method tidak diizinkan', 405);
}

/* =========================================================
 * KWITANSI PENERIMAAN (nomor BKM) + ANTREAN KIRIM WHATSAPP
 * GET  p=kwitansi&q=&limit=            daftar BKM + token bot
 * GET  p=kwitansi&act=antre&token=     antrean utk bot WA Web (tipe/ref/gambar_url)
 * GET  p=kwitansi&act=gambar&token=&tipe=&ref=   PNG kwitansi / JPG surat utk bot
 * GET  p=kwitansi&act=riwayat          riwayat kirim (lokal)
 * POST p=kwitansi {act:'kirim-wa', no_bkm, no_hp, nama, pesan, gambar, tipe, ref}
 * POST p=kwitansi {act:'selesai'|'gagal', id, token, pesan}
 * ========================================================= */
function kwitansi_dir(): string {
    $d = __DIR__ . '/data/kwitansi';
    if (!is_dir($d)) { @mkdir($d, 0755, true); }
    return $d;
}
function kwitansi_file(string $noBkm): string {
    $safe = preg_replace('/[^A-Za-z0-9_-]/', '_', $noBkm);
    return kwitansi_dir() . '/' . $safe . '.png';
}
/** Folder gambar surat tagihan (JPG hasil render browser) */
function surat_dir(): string {
    $d = __DIR__ . '/data/surat';
    if (!is_dir($d)) { @mkdir($d, 0755, true); }
    return $d;
}
function surat_file(string $nomor): string {
    $safe = preg_replace('/[^A-Za-z0-9_-]/', '_', $nomor);
    return surat_dir() . '/' . $safe . '.jpg';
}
/** Token rahasia utk bot WA Web — dibuat otomatis saat pertama diminta */
function wa_token(array &$db): string {
    $t = (string)($db['pengaturan']['wa_token'] ?? '');
    if ($t === '') {
        $t = bin2hex(random_bytes(16));
        $db['pengaturan']['wa_token'] = $t;
        db_save($db);
    }
    return $t;
}
function wa_token_ok(array $db, string $token): bool {
    return $token !== '' && hash_equals((string)($db['pengaturan']['wa_token'] ?? ''), $token);
}

/* =========================================================
 * SALDO AKUN PEMASUKAN — rekap saldo awal/masuk/keluar/akhir per akun
 * GET p=saldo-akun&dari=&sampai=
 * ========================================================= */
if ($p === 'saldo-akun') {
    if ($method === 'GET') {
        $dari   = isset($_GET['dari']) ? (string)$_GET['dari'] : '';
        $sampai = isset($_GET['sampai']) ? (string)$_GET['sampai'] : '';

        $rows = [];
        foreach (akun_pemasukan_list() as $nama) {
            $rows[$nama] = ['nama' => $nama, 'saldo_awal' => 0.0, 'masuk' => 0.0, 'keluar' => 0.0];
        }

        foreach ($db['jurnal'] as $x) {
            $arah = ($x['arah'] ?? 'masuk') === 'keluar' ? 'keluar' : 'masuk';
            if ($arah === 'masuk') {
                $akunX = trim((string)($x['akun'] ?? ''));
                if ($akunX === '') { $akunX = akun_dari_tagihan((string)($x['tagihan_jenis'] ?? ''), $db); }
                $sign = 1;
            } else {
                $akunX = trim((string)($x['sumber_dana'] ?? ''));
                $sign  = -1;
            }
            if ($akunX === '') { continue; }
            if (!isset($rows[$akunX])) {
                $rows[$akunX] = ['nama' => $akunX, 'saldo_awal' => 0.0, 'masuk' => 0.0, 'keluar' => 0.0];
            }

            $tg = (string)$x['tanggal'];
            $n  = (float)$x['nominal'];
            if ($sampai !== '' && $tg > $sampai) { continue; }
            if ($dari !== '' && $tg < $dari) {
                $rows[$akunX]['saldo_awal'] += $sign * $n;
                continue;
            }
            if ($sign > 0) { $rows[$akunX]['masuk']  += $n; }
            else           { $rows[$akunX]['keluar'] += $n; }
        }

        /* saldo awal kolom Data Santri utk akun kas khusus (uang saku / tabungan / tagihan lain) */
        foreach (kas_khusus_akun_list() as $akunK) {
            if (!isset($rows[$akunK])) { continue; }
            $rows[$akunK]['saldo_awal'] += saldo_awal_kas_khusus($db, $akunK);
        }

        $list = [];
        foreach ($rows as $r) {
            $r['saldo_akhir'] = $r['saldo_awal'] + $r['masuk'] - $r['keluar'];
            if ($r['masuk'] == 0 && $r['keluar'] == 0 && $r['saldo_awal'] == 0 && $r['saldo_akhir'] == 0) { continue; }
            $list[] = $r;
        }
        usort($list, function ($a, $b) { return strcasecmp($a['nama'], $b['nama']); });

        out([
            'dari'           => $dari,
            'sampai'         => $sampai,
            'list'           => $list,
            'total_saldo_awal'  => array_sum(array_column($list, 'saldo_awal')),
            'total_masuk'       => array_sum(array_column($list, 'masuk')),
            'total_keluar'      => array_sum(array_column($list, 'keluar')),
            'total_saldo_akhir' => array_sum(array_column($list, 'saldo_akhir')),
        ]);
    }
    fail('Method tidak diizinkan', 405);
}

/* =========================================================
 * SALDO BANK & CASH — kartu saldo per kanal + tarik tunai bank → cash
 * GET    p=saldo-bank                                  → banks[], cash, total, riwayat[]
 * POST   p=saldo-bank&act=tarik-tunai {bank,tanggal,nominal,keterangan}
 * DELETE p=saldo-bank&id=TRK-00001                     → batalkan tarik tunai
 * ========================================================= */
if ($p === 'saldo-bank') {
    if ($method === 'GET') {
        $s = saldo_bank_cash($db);
        $banks = [];
        foreach (['BRI', 'BSI', 'BPD'] as $kode) {
            $banks[] = ['kode' => $kode, 'nama' => 'Bank ' . $kode, 'saldo' => $s[$kode]];
        }
        out([
            'banks'   => $banks,
            'cash'    => $s['Cas'],
            'total'   => $s['total'],
            'riwayat' => array_reverse($db['tarik_tunai'] ?? []),
        ]);
    }

    if ($method === 'POST' && $act === 'tarik-tunai') {
        $bank   = strtoupper(trim((string)($body['bank'] ?? '')));
        $tanggal = trim((string)($body['tanggal'] ?? ''));
        $nominal = angka_import($body['nominal'] ?? null);
        $ket     = trim((string)($body['keterangan'] ?? ''));
        if (!in_array($bank, ['BRI', 'BSI', 'BPD'], true)) { fail('Bank tidak valid'); }
        if ($tanggal === '') { $tanggal = date('Y-m-d'); }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggal)) { fail('Tanggal tidak valid'); }
        if ($nominal === null || $nominal <= 0) { fail('Nominal harus > 0'); }

        $s = saldo_bank_cash($db);
        if ($nominal > $s[$bank]) {
            fail('Saldo ' . $bank . ' tidak mencukupi — saldo saat ini ' . rupiah($s[$bank]));
        }

        $rec = [
            'id'         => uid($db, 'tarik_tunai'),
            'tanggal'    => $tanggal,
            'bank'       => $bank,
            'nominal'    => $nominal,
            'keterangan' => $ket,
            'dibuat'     => date('c'),
        ];
        $db['tarik_tunai'][] = $rec;
        db_save($db);
        out($rec, 201);
    }

    if ($method === 'DELETE' && $id) {
        $sebelum = count($db['tarik_tunai'] ?? []);
        $db['tarik_tunai'] = array_values(array_filter($db['tarik_tunai'] ?? [], function ($x) use ($id) {
            return (string)($x['id'] ?? '') !== $id;
        }));
        if (count($db['tarik_tunai']) === $sebelum) { fail('Riwayat tarik tunai tidak ditemukan', 404); }
        db_save($db);
        out(['ok' => true]);
    }
    fail('Method tidak diizinkan', 405);
}

/* =========================================================
 * SURAT TAGIHAN SANTRI — rekap tagihan belum lunas per santri utk dicetak
 * GET  p=surat-tagihan&act=riwayat      → riwayat nomor surat terbit (terbaru dulu)
 * GET  p=surat-tagihan&santri_id=       → data surat + nomor berikutnya
 * POST p=surat-tagihan&act=terbit       → terbitkan/sinkronkan nomor + simpan riwayat
 * POST p=surat-tagihan&act=kirim-wa     → simpan JPG surat + antre kirim WhatsApp
 * ========================================================= */
if ($p === 'surat-tagihan') {
    /* ---------- riwayat nomor terbit (untuk pilih ulang / info WA) ---------- */
    if ($method === 'GET' && $act === 'riwayat') {
        out(['list' => array_slice(array_reverse($db['surat_terbit'] ?? []), 0, 300)]);
    }

    if ($method === 'GET') {
        $sid = isset($_GET['santri_id']) ? trim((string)$_GET['santri_id']) : '';
        $raw = $sid !== '' ? find_by_id($db['santri'], $sid) : null;
        if (!$raw) { fail('Santri tidak ditemukan', 404); }
        $s = santri_bersih($raw, $db);

        /* semua tagihan sisa > 0 — termasuk jenis/custom apa pun ("tagihan lain" ikut bila ada saldonya) */
        $bayarPer = [];
        foreach ($db['pembayaran'] as $pb) {
            $tid = (string)($pb['tagihan_id'] ?? '');
            if ($tid === '') { continue; }
            $bayarPer[$tid] = ($bayarPer[$tid] ?? 0.0) + (float)($pb['jumlah'] ?? 0);
        }
        $rows = [];
        foreach ($db['tagihan'] as $t) {
            if ((string)($t['santri_id'] ?? '') !== $sid) { continue; }
            $sisa = max(0.0, (float)($t['nominal'] ?? 0) - ($bayarPer[(string)$t['id']] ?? 0.0));
            if ($sisa <= 0) { continue; }
            $jn = find_by_id($db['jenis_tagihan'], (string)($t['jenis_id'] ?? ''));
            $namaJenis = $jn ? (string)$jn['nama'] : 'Tagihan';
            $periode   = (string)($t['periode'] ?? '');
            /* label bulanan: "Infaq Wajib September" — sisanya nama jenis saja */
            $label = tagihan_label($jn, $periode);
            $dibayar = (float)($t['nominal'] ?? 0) - $sisa;
            $rows[] = [
                'label'     => $label,
                'jenis'     => $namaJenis,
                'periode'   => $periode,
                'nominal'   => (float)($t['nominal'] ?? 0),
                'dibayar'   => $dibayar,
                'sisa'      => $sisa,
                'status'    => $dibayar <= 0 ? 'belum' : ($dibayar >= (float)$t['nominal'] ? 'lunas' : 'sebagian'),
            ];
        }
        usort($rows, function ($a, $b) {
            $c = strcmp($a['periode'], $b['periode']);
            return $c !== 0 ? $c : strcmp($a['label'], $b['label']);
        });
        $total = array_sum(array_column($rows, 'sisa'));

        out([
            'santri' => [
                'id' => $s['id'], 'nis' => $s['nis'], 'nama' => $s['nama'],
                'kelas' => $s['kelas'], 'no_wa' => $s['no_wa'], 'status' => $s['status'],
            ],
            'rows'  => $rows,
            'total' => $total,
            'nomor' => surat_tagihan_nomor($db, false),
        ]);
    }

    if ($method === 'POST' && $act === 'terbit') {
        $no = trim((string)($body['nomor'] ?? ''));
        if ($no === '') { fail('Nomor surat wajib diisi'); }
        surat_tagihan_sinkron($db, $no);

        $sid     = trim((string)($body['santri_id'] ?? ''));
        $nama    = trim((string)($body['nama'] ?? ''));
        $kelas   = trim((string)($body['kelas'] ?? ''));
        $tanggal = trim((string)($body['tanggal'] ?? ''));
        if ($tanggal === '') { $tanggal = date('Y-m-d'); }
        $lamp  = trim((string)($body['lamp'] ?? ''));
        $hal   = trim((string)($body['hal'] ?? ''));
        $total = (float)($body['total'] ?? 0);
        $now   = date('c');

        /* upsert riwayat berdasarkan nomor — cetak ulang tidak menggandakan entri */
        $idx = null;
        foreach (($db['surat_terbit'] ?? []) as $i => $st) {
            if ((string)($st['nomor'] ?? '') === $no) { $idx = $i; break; }
        }
        if ($idx !== null) {
            $e = $db['surat_terbit'][$idx];
            $entry = array_merge($e, [
                'santri_id' => $sid    !== '' ? $sid  : (string)($e['santri_id'] ?? ''),
                'nama'      => $nama   !== '' ? $nama : (string)($e['nama'] ?? ''),
                'kelas'     => $kelas  !== '' ? $kelas: (string)($e['kelas'] ?? ''),
                'tanggal'   => $tanggal,
                'lamp'      => $lamp   !== '' ? $lamp : (string)($e['lamp'] ?? '-'),
                'hal'       => $hal    !== '' ? $hal  : (string)($e['hal'] ?? ''),
                'total'     => $total  > 0    ? $total: (float)($e['total'] ?? 0),
                'diubah'    => $now,
            ]);
            $db['surat_terbit'][$idx] = $entry;
        } else {
            $entry = [
                'id'        => uid($db, 'surat'),
                'santri_id' => $sid,
                'nama'      => $nama,
                'kelas'     => $kelas,
                'nomor'     => $no,
                'tanggal'   => $tanggal,
                'lamp'      => $lamp !== '' ? $lamp : '-',
                'hal'       => $hal,
                'total'     => $total,
                'dibuat'    => $now,
                'diubah'    => $now,
            ];
            $db['surat_terbit'][] = $entry;
        }
        db_save($db);
        out(['ok' => true, 'nomor' => $no, 'riwayat' => $entry]);
    }

    /* ---------- simpan JPG surat + antre kirim WhatsApp ---------- */
    if ($method === 'POST' && $act === 'kirim-wa') {
        $no = trim((string)($body['nomor'] ?? ''));
        if ($no === '') { fail('Nomor surat wajib diisi'); }
        $hp = wa_format_hp((string)($body['no_hp'] ?? ''));
        if ($hp === '') { fail('Nomor WhatsApp penerima wajib diisi'); }

        $nama  = trim((string)($body['nama'] ?? ''));
        $total = (float)($body['total'] ?? 0);
        if ($nama === '' || $total <= 0) {
            foreach (($db['surat_terbit'] ?? []) as $st) {
                if ((string)($st['nomor'] ?? '') !== $no) { continue; }
                if ($nama === '')  { $nama  = (string)($st['nama'] ?? ''); }
                if ($total <= 0)   { $total = (float)($st['total'] ?? 0); }
                break;
            }
        }

        $pesan = trim((string)($body['pesan'] ?? ''));
        if ($pesan === '') {
            $pesan = "Assalamualaikum Wr. Wb." . ($nama !== '' ? ' ' . $nama : '') . "\n";
            $pesan .= "Terlampir Surat Tagihan No. " . $no;
            if ($total > 0) { $pesan .= " sebesar " . rupiah($total); }
            $pesan .= ".\nMohon pembayarannya diproses. Terima kasih.\n- " . (string)($db['pengaturan']['nama_pesantren'] ?? '');
        }

        /* simpan gambar surat (dataURL → JPG) */
        $gambar = (string)($body['gambar'] ?? '');
        $file   = '';
        if ($gambar !== '') {
            $raw = $gambar;
            if (preg_match('/^data:image\/[a-zA-Z0-9.+-]+;base64,/', $raw)) { $raw = substr($raw, strpos($raw, ',') + 1); }
            $bin = base64_decode($raw, true);
            if ($bin === false || strlen($bin) < 100) { fail('Gambar surat tidak valid'); }
            $f = surat_file($no);
            if (@file_put_contents($f, $bin) === false) { fail('Folder data/surat tidak bisa ditulis (permission 755/775)'); }
            $file = basename($f);
        }

        $item = [
            'id'        => uid($db, 'antre'),
            'tipe'      => 'surat',
            'ref'       => $no,
            'no_bkm'    => '',
            'nama'      => $nama,
            'no_hp'     => $hp,
            'pesan'     => $pesan,
            'gambar'    => $file,
            'status'    => 'antre',
            'percobaan' => 0,
            'dibuat'    => date('c'),
        ];
        $db['antre_wa'][] = $item;
        db_save($db);
        out(['ok' => true, 'antre' => $item], 201);
    }

    fail('Method tidak diizinkan', 405);
}

if ($p === 'kwitansi') {
    $actG = $act ?? '';
    $actB = (string)($body['act'] ?? '');

    /* ---------- daftar BKM utk dipilih ---------- */
    if ($method === 'GET' && $actG === '') {
        $q     = isset($_GET['q']) ? trim((string)$_GET['q']) : '';
        $dari  = isset($_GET['dari']) ? (string)$_GET['dari'] : '';
        $sampai= isset($_GET['sampai']) ? (string)$_GET['sampai'] : '';
        $limit = min(500, max(1, (int)(isset($_GET['limit']) ? $_GET['limit'] : 300)));
        $santriById = [];
        foreach ($db['santri'] as $s) { $santriById[(string)$s['id']] = $s; }
        $santriByNama = [];
        foreach ($db['santri'] as $s) { $santriByNama[strtolower(trim((string)$s['nama']))] = $s; }

        $groups = [];
        foreach ($db['jurnal'] as $x) {
            if (($x['arah'] ?? 'masuk') !== 'masuk') { continue; }
            $noBkm = (string)($x['no_bkm'] ?? '');
            if ($noBkm === '') { continue; }
            $tg = (string)$x['tanggal'];
            if ($dari !== '' && $tg < $dari) { continue; }
            if ($sampai !== '' && $tg > $sampai) { continue; }

            if (!isset($groups[$noBkm])) {
                $sid = (string)($x['santri_id'] ?? '');
                $s   = $sid !== '' ? ($santriById[$sid] ?? null) : null;
                /* entry lama sering tanpa santri_id — cocokkan nama utk ambil no WA wali */
                if (!$s) {
                    $nmKey = strtolower(trim((string)($x['nama'] ?? '')));
                    $s = ($nmKey !== '' ? ($santriByNama[$nmKey] ?? null) : null);
                }
                $waRaw = '';
                if ($s) {
                    $waRaw = trim((string)($s['no_wa'] ?? ''));
                    if ($waRaw === '') { $waRaw = trim((string)($s['telepon'] ?? '')); }   // no WA wali — fallback kolom telepon
                }
                $groups[$noBkm] = [
                    'no_bkm'         => $noBkm,
                    'tanggal'        => $tg,
                    'santri_id'      => $sid !== '' ? $sid : ($s ? (string)$s['id'] : ''),
                    'nama'           => (string)($x['nama'] ?? ''),
                    'kelas'          => (string)($x['kelas'] ?? ''),
                    'jenis_transaksi'=> (string)($x['jenis_transaksi'] ?? ''),
                    'akun'           => '',
                    'keterangan'     => '',
                    'label_tagihan'  => '',
                    'nominal'        => 0.0,
                    'jumlah_item'    => 0,
                    'no_wa'          => wa_format_hp($waRaw),
                    'no_wa_santri'   => $waRaw,
                    'ada_gambar'     => file_exists(kwitansi_file($noBkm)),
                    'bukti_transfer' => '',
                    'kekurangan'     => [],
                    'kekurangan_total' => 0.0,
                    'items'          => [],
                ];
            }

            $g =& $groups[$noBkm];
            if ($g['bukti_transfer'] === '' && (string)($x['bukti_transfer'] ?? '') !== '') {
                $g['bukti_transfer'] = (string)$x['bukti_transfer'];
            }
            $akunX = (string)($x['akun'] ?? '');
            if ($akunX === '') { $akunX = akun_dari_tagihan((string)($x['tagihan_jenis'] ?? ''), $db); }
            if ($g['akun'] === '') { $g['akun'] = $akunX; }

            $label = jurnal_label_full($db, $x);
            $g['items'][] = [
                'id'           => (string)($x['id'] ?? ''),
                'label_tagihan'=> $label,
                'akun'         => $akunX,
                'nominal'      => (float)($x['nominal'] ?? 0),
            ];
            $g['nominal']     += (float)($x['nominal'] ?? 0);
            $g['jumlah_item'] += 1;
            if ($label !== '' && stripos($g['label_tagihan'], $label) === false) {
                $g['label_tagihan'] = $g['label_tagihan'] === '' ? $label : $g['label_tagihan'] . ' • ' . $label;
            }
            $ketX = trim((string)($x['keterangan'] ?? ''));
            if ($ketX !== '' && stripos($g['keterangan'], $ketX) === false) {
                $g['keterangan'] = $g['keterangan'] === '' ? $ketX : $g['keterangan'] . ' • ' . $ketX;
            }
            unset($g);
        }

        /* kekurangan biaya pendidikan — sisa tagihan santri yang belum lunas (utk kwitansi BKM) */
        $bayarPerTagihan = [];
        foreach ($db['pembayaran'] as $pbK) {
            $tidK = (string)($pbK['tagihan_id'] ?? '');
            if ($tidK === '') { continue; }
            $bayarPerTagihan[$tidK] = ($bayarPerTagihan[$tidK] ?? 0.0) + (float)($pbK['jumlah'] ?? 0);
        }
        foreach ($groups as &$gK) {
            $sidK = (string)($gK['santri_id'] ?? '');
            if ($sidK === '') { continue; }
            $perK = [];
            foreach ($db['tagihan'] as $tK) {
                if ((string)($tK['santri_id'] ?? '') !== $sidK) { continue; }
                $sisaK = max(0.0, (float)($tK['nominal'] ?? 0) - ($bayarPerTagihan[(string)$tK['id']] ?? 0.0));
                if ($sisaK <= 0) { continue; }
                $jnK = find_by_id($db['jenis_tagihan'], (string)($tK['jenis_id'] ?? ''));
                $nmK = $jnK ? (string)$jnK['nama'] : 'Tagihan';
                $perK[$nmK] = ($perK[$nmK] ?? 0.0) + $sisaK;
            }
            $listK = []; $totK = 0.0;
            foreach ($perK as $nm2 => $val2) { $listK[] = ['nama' => (string)$nm2, 'nominal' => (float)$val2]; $totK += $val2; }
            usort($listK, function ($a, $b) { return strcmp((string)$a['nama'], (string)$b['nama']); });
            $gK['kekurangan']       = $listK;
            $gK['kekurangan_total'] = $totK;
        }
        unset($gK);

        $list = [];
        foreach ($groups as $g) {
            if ($q !== '') {
                $hit = false;
                foreach (['no_bkm', 'nama', 'kelas', 'akun', 'keterangan', 'label_tagihan', 'no_wa_santri'] as $fld) {
                    if (stripos((string)($g[$fld] ?? ''), $q) !== false) { $hit = true; break; }
                }
                if (!$hit) {
                    foreach ($g['items'] as $it) {
                        if (stripos((string)($it['label_tagihan'] . ' ' . $it['akun']), $q) !== false) { $hit = true; break; }
                    }
                }
                if (!$hit) { continue; }
            }
            $list[] = $g;
        }
        usort($list, function ($a, $b) {
            $c = strcmp((string)$b['tanggal'], (string)$a['tanggal']);
            return $c !== 0 ? $c : strcmp((string)($b['no_bkm'] ?? ''), (string)($a['no_bkm'] ?? ''));
        });
        $list = array_slice($list, 0, $limit);
        /* bootstrap token bot (tanpa sesi) hanya menerima token — daftar BKM disensor */
        $boleh = (bool)$SESI;
        out(['list' => $boleh ? $list : [], 'token' => wa_token($db), 'jumlah' => $boleh ? count($list) : 0]);
    }

    /* ---------- antrean utk bot ---------- */
    if ($method === 'GET' && $actG === 'antre') {
        if (!wa_token_ok($db, (string)($_GET['token'] ?? ''))) { fail('Token tidak valid', 401); }
        $kirim = [];
        foreach ($db['antre_wa'] as $i => $it) {
            if ((string)($it['status'] ?? '') !== 'antre') { continue; }
            $db['antre_wa'][$i]['status']    = 'proses';
            $db['antre_wa'][$i]['percobaan'] = (int)($it['percobaan'] ?? 0) + 1;
            $db['antre_wa'][$i]['dikirim']   = date('c');
            $it = $db['antre_wa'][$i];
            $it['tipe'] = (string)($it['tipe'] ?? 'kwitansi');
            $it['ref']  = (string)($it['ref'] ?? ($it['no_bkm'] ?? ''));
            $it['gambar_url'] = '';
            if ((string)($it['gambar'] ?? '') !== '') {
                $it['gambar_url'] = 'api.php?p=kwitansi&act=gambar&token=' . urlencode((string)($_GET['token'] ?? ''))
                                  . '&tipe=' . urlencode($it['tipe'])
                                  . '&ref=' . urlencode($it['ref'] !== '' ? $it['ref'] : (string)($it['no_bkm'] ?? ''));
            }
            $kirim[] = $it;
        }
        if ($kirim) { db_save($db); }
        out(['list' => $kirim]);
    }

    /* ---------- PNG kwitansi / JPG surat utk bot ---------- */
    if ($method === 'GET' && $actG === 'gambar') {
        if (!wa_token_ok($db, (string)($_GET['token'] ?? ''))) { fail('Token tidak valid', 401); }
        $tipe = (string)($_GET['tipe'] ?? 'kwitansi');
        $ref  = (string)($_GET['ref'] ?? '');
        if ($ref === '') { $ref = (string)($_GET['no_bkm'] ?? ''); }   // kompatibel URL lama
        $f = $tipe === 'surat' ? surat_file($ref) : kwitansi_file($ref);
        if (!is_file($f)) { fail($tipe === 'surat' ? 'Gambar surat tidak ditemukan' : 'Gambar kwitansi tidak ditemukan', 404); }
        header('Content-Type: ' . (substr($f, -4) === '.jpg' ? 'image/jpeg' : 'image/png'));
        header('Content-Length: ' . filesize($f));
        header('Cache-Control: private, max-age=3600');
        readfile($f);
        exit;
    }

    /* ---------- riwayat kirim (lokal) ---------- */
    if ($method === 'GET' && $actG === 'riwayat') {
        $riwayat = array_reverse($db['antre_wa']);
        out(['list' => array_slice($riwayat, 0, 100)]);
    }

    /* ---------- status antrian utk panel Pengaturan ---------- */
    if ($method === 'GET' && $actG === 'status-antre') {
        $c = ['antre' => 0, 'proses' => 0, 'terkirim' => 0, 'gagal' => 0, 'batal' => 0];
        $pending = [];
        foreach ($db['antre_wa'] as $it) {
            $st = (string)($it['status'] ?? 'antre');
            if (!isset($c[$st])) { $c[$st] = 0; }
            $c[$st]++;
            if (($st === 'antre' || $st === 'proses') && count($pending) < 8) {
                $pending[] = [
                    'tipe'   => (string)($it['tipe'] ?? 'kwitansi'),
                    'ref'    => (string)($it['ref'] ?? ($it['no_bkm'] ?? '')),
                    'nama'   => (string)($it['nama'] ?? ''),
                    'no_hp'  => (string)($it['no_hp'] ?? ''),
                    'status' => $st,
                    'dibuat' => (string)($it['dibuat'] ?? ''),
                ];
            }
        }
        $c['total'] = count($db['antre_wa']);
        out(['counts' => $c, 'pending' => $pending, 'antre' => $c['antre'], 'proses' => $c['proses']]);
    }

    /* ---------- batalkan semua pesan antre ---------- */
    if ($method === 'POST' && $actB === 'batal-antre') {
        $n = 0;
        foreach ($db['antre_wa'] as $i => $it) {
            if (!in_array((string)($it['status'] ?? ''), ['antre', 'proses'], true)) { continue; }
            $db['antre_wa'][$i]['status']  = 'batal';
            $db['antre_wa'][$i]['catatan'] = 'Dibatalkan dari panel Pengaturan';
            $db['antre_wa'][$i]['selesai'] = date('c');
            $n++;
        }
        db_save($db);
        out(['ok' => true, 'dibatalkan' => $n]);
    }

    /* ---------- simpan gambar + antre kirim ---------- */
    if ($method === 'POST' && $actB === 'kirim-wa') {
        $noBkm = trim((string)($body['no_bkm'] ?? ''));
        if ($noBkm === '') { fail('Nomor BKM wajib diisi'); }
        $j = null;
        foreach ($db['jurnal'] as $x) {
            if (($x['arah'] ?? 'masuk') === 'masuk' && (string)($x['no_bkm'] ?? '') === $noBkm) { $j = $x; break; }
        }
        if (!$j) { fail('BKM tidak ditemukan: ' . $noBkm, 404); }

        $nama = trim((string)($body['nama'] ?? '')) !== '' ? trim((string)$body['nama']) : (string)($j['nama'] ?? '');
        $hp   = wa_format_hp((string)($body['no_hp'] ?? ''));
        if ($hp === '') { fail('Nomor WhatsApp penerima wajib diisi'); }
        $pesan = trim((string)($body['pesan'] ?? ''));
        if ($pesan === '') { $pesan = 'Terlampir kwitansi penerimaan No. ' . $noBkm; }

        // simpan gambar kwitansi (dataURL → PNG)
        $gambar = (string)($body['gambar'] ?? '');
        $file   = '';
        if ($gambar !== '') {
            $raw = $gambar;
            if (preg_match('/^data:image\/[a-zA-Z0-9.+-]+;base64,/', $raw)) { $raw = substr($raw, strpos($raw, ',') + 1); }
            $bin = base64_decode($raw, true);
            if ($bin === false || strlen($bin) < 100) { fail('Gambar kwitansi tidak valid'); }
            $f = kwitansi_file($noBkm);
            if (@file_put_contents($f, $bin) === false) { fail('Folder data/kwitansi tidak bisa ditulis (permission 755/775)'); }
            $file = basename($f);
        }

        $item = [
            'id'        => uid($db, 'antre'),
            'tipe'      => 'kwitansi',
            'ref'       => $noBkm,
            'no_bkm'    => $noBkm,
            'nama'      => $nama,
            'no_hp'     => $hp,
            'pesan'     => $pesan,
            'gambar'    => $file,
            'status'    => 'antre',
            'percobaan' => 0,
            'dibuat'    => date('c'),
        ];
        $db['antre_wa'][] = $item;
        db_save($db);
        out(['ok' => true, 'antre' => $item], 201);
    }

    /* ---------- penanda bot: selesai / gagal ---------- */
    if ($method === 'POST' && ($actB === 'selesai' || $actB === 'gagal')) {
        if (!wa_token_ok($db, (string)($body['token'] ?? ''))) { fail('Token tidak valid', 401); }
        $idx = null;
        foreach ($db['antre_wa'] as $i => $it) { if ((string)$it['id'] === (string)($body['id'] ?? '')) { $idx = $i; break; } }
        if ($idx === null) { fail('Antrean tidak ditemukan', 404); }
        $db['antre_wa'][$idx]['status'] = $actB === 'selesai' ? 'terkirim' : 'gagal';
        $db['antre_wa'][$idx]['catatan'] = trim((string)($body['pesan'] ?? ''));
        $db['antre_wa'][$idx]['selesai'] = date('c');
        db_save($db);
        out(['ok' => true, 'status' => $db['antre_wa'][$idx]['status']]);
    }

    fail('Method tidak diizinkan', 405);
}

/* =========================================================
 * JENIS TAGIHAN (IURAN)
 * ========================================================= */
if ($p === 'jenis-tagihan') {
    if ($method === 'GET') { out($db['jenis_tagihan']); }
    if ($method === 'POST') {
        $nama = trim((string)($body['nama'] ?? ''));
        if ($nama === '') { fail('Nama wajib diisi'); }
        $j = ['id' => uid($db, 'jenis_tagihan'), 'nama' => $nama, 'nominal' => (float)($body['nominal'] ?? 0), 'aktif' => true];
        $db['jenis_tagihan'][] = $j;
        db_save($db);
        out($j, 201);
    }
    if ($method === 'PUT' && $id) {
        foreach ($db['jenis_tagihan'] as $i => $x) {
            if ($x['id'] === $id) {
                if (isset($body['nama']))    { $db['jenis_tagihan'][$i]['nama'] = (string)$body['nama']; }
                if (isset($body['nominal'])) { $db['jenis_tagihan'][$i]['nominal'] = (float)$body['nominal']; }
                if (isset($body['aktif']))   { $db['jenis_tagihan'][$i]['aktif'] = (bool)$body['aktif']; }
                db_save($db);
                out($db['jenis_tagihan'][$i]);
            }
        }
        fail('Jenis tidak ditemukan', 404);
    }
    if ($method === 'DELETE' && $id) {
        foreach ($db['tagihan'] as $t) {
            if (($t['jenis_id'] ?? '') === $id) { fail('Jenis dipakai tagihan, tidak bisa dihapus'); }
        }
        $db['jenis_tagihan'] = array_values(array_filter($db['jenis_tagihan'], function ($x) use ($id) { return $x['id'] !== $id; }));
        db_save($db);
        out(['ok' => true]);
    }
    fail('Method tidak diizinkan', 405);
}

/* =========================================================
 * TRANSAKSI (KAS)
 * ========================================================= */
if ($p === 'transaksi') {
    if ($method === 'GET') {
        $dari   = isset($_GET['dari']) ? (string)$_GET['dari'] : '';
        $sampai = isset($_GET['sampai']) ? (string)$_GET['sampai'] : '';
        $jenis  = isset($_GET['jenis']) ? (string)$_GET['jenis'] : '';
        $kat    = isset($_GET['kategori_id']) ? (string)$_GET['kategori_id'] : '';
        $q      = isset($_GET['q']) ? trim((string)$_GET['q']) : '';
        $list   = $db['transaksi'];
        if ($dari !== '')   { $list = array_values(array_filter($list, function ($t) use ($dari) { return $t['tanggal'] >= $dari; })); }
        if ($sampai !== '') { $list = array_values(array_filter($list, function ($t) use ($sampai) { return $t['tanggal'] <= $sampai; })); }
        if ($jenis !== '' && $jenis !== 'semua') { $list = array_values(array_filter($list, function ($t) use ($jenis) { return $t['jenis'] === $jenis; })); }
        if ($kat !== '')    { $list = array_values(array_filter($list, function ($t) use ($kat) { return $t['kategori_id'] === $kat; })); }
        if ($q !== '')      { $list = array_values(array_filter($list, function ($t) use ($q) { return stripos((string)($t['keterangan'] ?? ''), $q) !== false; })); }
        $km = kategori_map($db);
        $out = [];
        foreach ($list as $t) {
            $out[] = array_merge($t, [
                'kategori' => isset($km[$t['kategori_id']]) ? $km[$t['kategori_id']]['nama'] : '-',
                'warna'    => isset($km[$t['kategori_id']]) ? $km[$t['kategori_id']]['warna'] : '#94a3b8',
            ]);
        }
        usort($out, function ($a, $b) {
            $c = strcmp($b['tanggal'], $a['tanggal']);
            return $c !== 0 ? $c : strcmp((string)($b['id'] ?? ''), (string)($a['id'] ?? ''));
        });
        out($out);
    }
    if ($method === 'POST') {
        $tanggal  = (string)($body['tanggal'] ?? '');
        $jenis    = (string)($body['jenis'] ?? '');
        $kat      = (string)($body['kategori_id'] ?? '');
        $jumlah   = (float)($body['jumlah'] ?? 0);
        if ($tanggal === '' || !in_array($jenis, ['masuk', 'keluar'], true) || $kat === '') {
            fail('tanggal, jenis, kategori wajib diisi');
        }
        if ($jumlah <= 0) { fail('Jumlah harus > 0'); }
        $t = [
            'id'          => uid($db, 'transaksi'),
            'tanggal'     => $tanggal,
            'jenis'       => $jenis,
            'kategori_id' => $kat,
            'jumlah'      => $jumlah,
            'keterangan'  => (string)($body['keterangan'] ?? ''),
            'dibuat'      => date('c'),
        ];
        $db['transaksi'][] = $t;
        db_save($db);
        out($t, 201);
    }
    if ($method === 'DELETE' && $id) {
        $t = find_by_id($db['transaksi'], $id);
        if (!$t) { fail('Transaksi tidak ditemukan', 404); }
        if (isset($t['ref'])) { fail('Transaksi ini otomatis dibuat dari Jurnal/Iuran. Hapus melalui menu tersebut.'); }
        $db['transaksi'] = array_values(array_filter($db['transaksi'], function ($x) use ($id) { return $x['id'] !== $id; }));
        db_save($db);
        out(['ok' => true]);
    }
    fail('Method tidak diizinkan', 405);
}

/* =========================================================
 * TAGIHAN / IURAN
 * ========================================================= */
if ($p === 'tagihan') {
    if ($method === 'GET') {
        $periode  = isset($_GET['periode']) ? (string)$_GET['periode'] : '';
        $periodeSampai = isset($_GET['periode_sampai']) ? (string)$_GET['periode_sampai'] : '';
        $status   = isset($_GET['status']) ? (string)$_GET['status'] : '';
        $jenisId  = isset($_GET['jenis_id']) ? (string)$_GET['jenis_id'] : '';
        $santriId = isset($_GET['santri_id']) ? (string)$_GET['santri_id'] : '';
        $q        = isset($_GET['q']) ? trim((string)$_GET['q']) : '';
        $list = $db['tagihan'];
        if ($periode !== '')  { $list = array_values(array_filter($list, function ($t) use ($periode) { return $t['periode'] === $periode; })); }
        if ($periodeSampai !== '') { $list = array_values(array_filter($list, function ($t) use ($periodeSampai) { return (string)$t['periode'] <= $periodeSampai; })); }
        if ($jenisId !== '')  { $list = array_values(array_filter($list, function ($t) use ($jenisId) { return $t['jenis_id'] === $jenisId; })); }
        if ($santriId !== '') { $list = array_values(array_filter($list, function ($t) use ($santriId) { return $t['santri_id'] === $santriId; })); }
        $out = array_map(function ($t) use ($db) { return ringkas_tagihan($db, $t); }, $list);
        if ($status !== '' && $status !== 'semua') {
            $out = array_values(array_filter($out, function ($t) use ($status) { return $t['status'] === $status; }));
        }
        if ($q !== '') {
            $out = array_values(array_filter($out, function ($t) use ($q) {
                return stripos($t['nama_santri'], $q) !== false || stripos((string)$t['nis'], $q) !== false;
            }));
        }
        usort($out, function ($a, $b) {
            $c = strcmp($b['periode'], $a['periode']);
            return $c !== 0 ? $c : strcmp($a['nama_santri'], $b['nama_santri']);
        });
        out($out);
    }

    if ($method === 'POST' && $act === 'generate') {
        $periode = (string)($body['periode'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}$/', $periode)) { fail('Format periode harus YYYY-MM'); }
        $bulan = (int)substr($periode, 5, 2);

        /* sumber tagihan = kolom Data Santri (nominal per santri), bukan jenis iuran */
        $dikenal = ['spp', 'infaq', 'laundry'];
        foreach (jenis_tagihan_list($db) as $k) { $dikenal[] = $k['key']; }
        $pilih = isset($body['kolom']) && is_array($body['kolom']) && $body['kolom']
            ? array_values(array_unique(array_intersect(array_map('strval', $body['kolom']), $dikenal)))
            : [];
        if (!$pilih) { fail('Pilih kolom tagihan dari Data Santri'); }

        $sids = isset($body['santri_ids']) && is_array($body['santri_ids']) && $body['santri_ids']
            ? $body['santri_ids']
            : array_values(array_filter(array_map(function ($s) { return santri_bersih($s)['status'] === 'aktif' ? $s['id'] : null; }, $db['santri'])));
        if (!$sids) { fail('Tidak ada santri aktif — tambah/ubah status santri di menu Data Santri'); }

        /* hapus & regenerate: buang tagihan lama periode ini (yang belum dibayar) sebelum membuat ulang */
        $hasilHapus = ['dihapus' => 0, 'dilewati_bayar' => 0];
        if (!empty($body['hapus_dulu'])) {
            $hasilHapus = tagihan_hapus_bulk($db, $periode, $pilih, $sids);
        }

        $dibuat = 0; $sudah = 0; $kosong = 0;
        foreach ($sids as $sid) {
            $raw = find_by_id($db['santri'], $sid);
            if (!$raw) { continue; }
            $s = santri_bersih($raw, $db);
            foreach ($pilih as $key) {
                /* kolom bulanan menyesuaikan periode: spp → spp_11 (November) */
                $eff   = preg_match('/^(spp|infaq|laundry)$/', $key)
                    ? $key . '_' . str_pad((string)$bulan, 2, '0', STR_PAD_LEFT)
                    : $key;
                $nilai = isset($s[$eff]) ? (float)$s[$eff] : (float)($s['custom'][$eff] ?? 0);
                if ($nilai <= 0) { $kosong++; continue; }
                $jid  = jenis_untuk_kolom($db, $eff);
                $ada  = false;
                foreach ($db['tagihan'] as $t) {
                    if ($t['santri_id'] === $sid && $t['periode'] === $periode && $t['jenis_id'] === $jid) { $ada = true; break; }
                }
                if ($ada) { $sudah++; continue; }
                $db['tagihan'][] = [
                    'id'        => uid($db, 'tagihan'),
                    'santri_id' => $sid,
                    'periode'   => $periode,
                    'jenis_id'  => $jid,
                    'nominal'   => $nilai,
                    'dibuat'    => date('c'),
                ];
                $dibuat++;
            }
        }

        /* tagihan "Tagihan Lain" bulanan — dari saldo MINUS kas khusus Tagihan Lain-lain (utang santri);
           saldo positif = simpanan milik santri, tidak ditagih */
        $dibuatTl = 0; $jidTl = '';
        foreach ($sids as $sid) {
            $raw = find_by_id($db['santri'], $sid);
            if (!$raw) { continue; }
            $saldoTl = saldo_kas_khusus_santri($db, 'Tagihan Lain-lain', $sid, (string)($raw['nama'] ?? ''));
            if ($saldoTl >= 0) { continue; }
            if ($jidTl === '') { $jidTl = jenis_tagihan_untuk_nama($db, 'Tagihan Lain', 'tagihan_lain'); }
            /* sudah ditagih periode ini ATAU tagihan lama masih belum lunas → jangan dobel */
            $adaTl = false;
            foreach ($db['tagihan'] as $t) {
                if ((string)($t['santri_id'] ?? '') !== $sid || (string)($t['jenis_id'] ?? '') !== $jidTl) { continue; }
                if ((string)($t['periode'] ?? '') === $periode || tagihan_status($db, $t) !== 'lunas') { $adaTl = true; break; }
            }
            if ($adaTl) { continue; }
            $db['tagihan'][] = [
                'id'        => uid($db, 'tagihan'),
                'santri_id' => $sid,
                'periode'   => $periode,
                'jenis_id'  => $jidTl,
                'nominal'   => (float)abs($saldoTl),
                'dibuat'    => date('c'),
            ];
            $dibuatTl++;
        }
        db_save($db);
        $pesan = '';
        if (!empty($body['hapus_dulu'])) {
            $pesan .= $hasilHapus['dihapus'] . ' tagihan lama dihapus';
            if ($hasilHapus['dilewati_bayar']) { $pesan .= ' • ' . $hasilHapus['dilewati_bayar'] . ' dilewati (sudah ada pembayaran)'; }
            $pesan .= ' • ';
        }
        $pesan .= $dibuat . ' tagihan dibuat untuk periode ' . $periode;
        if ($sudah)  { $pesan .= ' • ' . $sudah . ' sudah ada'; }
        if ($dibuatTl) { $pesan .= ' • ' . $dibuatTl . ' tagihan Tagihan Lain (saldo minus)'; }
        if ($kosong && !$dibuat && !$sudah) { $pesan .= ' • nilai kolom di Data Santri masih 0'; }
        out(['ok' => true, 'dibuat' => $dibuat, 'dibuat_tagihan_lain' => $dibuatTl, 'sudah' => $sudah, 'dihapus' => $hasilHapus['dihapus'], 'dilewati_bayar' => $hasilHapus['dilewati_bayar'], 'pesan' => $pesan]);
    }

    if ($method === 'POST' && $act === 'hapus') {
        $periode = (string)($body['periode'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}$/', $periode)) { fail('Format periode harus YYYY-MM'); }
        $kolom = (isset($body['kolom']) && is_array($body['kolom'])) ? array_map('strval', $body['kolom']) : [];
        $sids  = (isset($body['santri_ids']) && is_array($body['santri_ids'])) ? array_map('strval', $body['santri_ids']) : [];
        $r = tagihan_hapus_bulk($db, $periode, $kolom, $sids);
        if (!$r['dihapus'] && !$r['dilewati_bayar']) { fail('Tidak ada tagihan pada periode ' . $periode, 404); }
        db_save($db);
        $pesan = $r['dihapus'] . ' tagihan dihapus untuk periode ' . $periode;
        if ($r['dilewati_bayar']) { $pesan .= ' • ' . $r['dilewati_bayar'] . ' dilewati (sudah ada pembayaran)'; }
        out(['ok' => true, 'dihapus' => $r['dihapus'], 'dilewati_bayar' => $r['dilewati_bayar'], 'pesan' => $pesan]);
    }

    if ($method === 'POST' && $act === 'bayar' && $id) {
        $t = find_by_id($db['tagihan'], $id);
        if (!$t) { fail('Tagihan tidak ditemukan', 404); }
        $sisa   = tagihan_sisa($db, $t);
        $jumlah = (float)($body['jumlah'] ?? 0);
        if ($jumlah <= 0) { fail('Jumlah pembayaran harus > 0'); }
        if ($jumlah > $sisa) { fail('Jumlah melebihi sisa tagihan (' . rupiah($sisa) . ')'); }
        $s = find_by_id($db['santri'], $t['santri_id']);
        $j = find_by_id($db['jenis_tagihan'], $t['jenis_id']);
        $bayar = [
            'id'          => uid($db, 'pembayaran'),
            'tagihan_id'  => $t['id'],
            'tanggal'     => (string)($body['tanggal'] ?? '') !== '' ? (string)$body['tanggal'] : date('Y-m-d'),
            'jumlah'      => $jumlah,
            'metode'      => (string)($body['metode'] ?? 'Tunai'),
            'petugas'     => (string)($body['petugas'] ?? 'Bendahara'),
            'keterangan'  => (string)($body['keterangan'] ?? ''),
        ];
        $db['pembayaran'][] = $bayar;
        // catat ke kas
        $katIuran = null;
        foreach ($db['kategori'] as $k) { if ($k['nama'] === 'Iuran Santri') { $katIuran = $k; break; } }
        if (!$katIuran) {
            foreach ($db['kategori'] as $k) { if ($k['jenis'] === 'masuk') { $katIuran = $k; break; } }
        }
        if ($katIuran) {
            $db['transaksi'][] = [
                'id'          => uid($db, 'transaksi'),
                'tanggal'     => $bayar['tanggal'],
                'jenis'       => 'masuk',
                'kategori_id' => $katIuran['id'],
                'jumlah'      => $jumlah,
                'keterangan'  => 'Iuran ' . ($j ? $j['nama'] : '') . ' ' . $t['periode'] . ' - ' . ($s ? $s['nama'] : ''),
                'ref'         => $t['id'],
                'dibuat'      => date('c'),
            ];
        }
        db_save($db);
        out(['ok' => true, 'pembayaran' => $bayar, 'tagihan' => ringkas_tagihan($db, $t), 'pesan' => 'Pembayaran tercatat di kas'], 201);
    }

    if ($method === 'DELETE' && $id) {
        foreach ($db['pembayaran'] as $pb) {
            if (($pb['tagihan_id'] ?? '') === $id) { fail('Tagihan sudah memiliki pembayaran'); }
        }
        $db['tagihan'] = array_values(array_filter($db['tagihan'], function ($t) use ($id) { return $t['id'] !== $id; }));
        db_save($db);
        out(['ok' => true]);
    }
    fail('Method tidak diizinkan', 405);
}

/* =========================================================
 * PEMBAYARAN (hapus)
 * ========================================================= */
if ($p === 'pembayaran') {
    if ($method === 'DELETE' && $id) {
        $pby = find_by_id($db['pembayaran'], $id);
        if (!$pby) { fail('Pembayaran tidak ditemukan', 404); }
        // pembayaran hasil entry jurnal (BKM) — cabut juga jurnal & kas terkait
        $jid = (string)($pby['jurnal_id'] ?? '');
        if ($jid !== '') {
            $db['jurnal'] = array_values(array_filter($db['jurnal'], function ($x) use ($jid) { return $x['id'] !== $jid; }));
            $db['transaksi'] = array_values(array_filter($db['transaksi'], function ($t) use ($jid) {
                return !(($t['ref'] ?? '') === $jid && ($t['ref_tipe'] ?? '') === 'jurnal');
            }));
        }
        $db['pembayaran'] = array_values(array_filter($db['pembayaran'], function ($x) use ($id) { return $x['id'] !== $id; }));
        $db['transaksi']  = array_values(array_filter($db['transaksi'], function ($t) use ($pby) {
            return !(
                isset($t['ref']) && $t['ref'] === $pby['tagihan_id']
                && (float)$t['jumlah'] === (float)$pby['jumlah']
                && ($t['tanggal'] ?? '') === ($pby['tanggal'] ?? '')
            );
        }));
        db_save($db);
        out(['ok' => true]);
    }
    fail('Method tidak diizinkan', 405);
}

/* =========================================================
 * DASHBOARD
 * ========================================================= */
if ($p === 'dashboard' && $method === 'GET') {
    $bulanIni = date('Y-m');
    $saldo    = hitung_saldo($db);

    $masukBulan = 0.0; $keluarBulan = 0.0;
    foreach ($db['transaksi'] as $t) {
        if (strpos($t['tanggal'], $bulanIni) === 0) {
            if ($t['jenis'] === 'masuk') { $masukBulan += (float)$t['jumlah']; }
            else { $keluarBulan += (float)$t['jumlah']; }
        }
    }

    $BLN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    $tren = [];
    for ($i = 5; $i >= 0; $i--) {
        $ts  = mktime(0, 0, 0, (int)date('n') - $i, 1, (int)date('Y'));
        $pp  = date('Y-m', $ts);
        $m = 0.0; $k = 0.0;
        foreach ($db['transaksi'] as $t) {
            if (strpos($t['tanggal'], $pp) === 0) {
                if ($t['jenis'] === 'masuk') { $m += (float)$t['jumlah']; } else { $k += (float)$t['jumlah']; }
            }
        }
        $tren[] = ['periode' => $pp, 'label' => $BLN_SHORT[(int)date('n', $ts) - 1], 'masuk' => $m, 'keluar' => $k];
    }

    $km = kategori_map($db);
    $perKat = [];
    foreach ($db['transaksi'] as $t) {
        if ($t['jenis'] === 'keluar' && strpos($t['tanggal'], $bulanIni) === 0) {
            $kid = $t['kategori_id'];
            $perKat[$kid] = ($perKat[$kid] ?? 0) + (float)$t['jumlah'];
        }
    }
    $topKategori = [];
    foreach ($perKat as $kid => $jml) {
        $topKategori[] = [
            'nama'   => isset($km[$kid]) ? $km[$kid]['nama'] : 'Lainnya',
            'warna'  => isset($km[$kid]) ? $km[$kid]['warna'] : '#94a3b8',
            'jumlah' => $jml,
        ];
    }
    usort($topKategori, function ($a, $b) { return $b['jumlah'] <=> $a['jumlah']; });
    $topKategori = array_slice($topKategori, 0, 6);

    $tagsBulan = array_values(array_filter($db['tagihan'], function ($t) use ($bulanIni) { return $t['periode'] === $bulanIni; }));
    $totalIuran = 0.0; $terkumpul = 0.0;
    foreach ($tagsBulan as $t) {
        $totalIuran += (float)$t['nominal'];
        $terkumpul  += (float)$t['nominal'] - tagihan_sisa($db, $t);
    }
    $tunggakan = array_values(array_filter($db['tagihan'], function ($t) use ($bulanIni, $db) {
        return $t['periode'] < $bulanIni && tagihan_sisa($db, $t) > 0;
    }));
    $jumlahTunggakan = 0.0;
    foreach ($tunggakan as $t) { $jumlahTunggakan += tagihan_sisa($db, $t); }

    $aktif = 0;
    foreach ($db['santri'] as $s) { if ($s['status'] === 'aktif') { $aktif++; } }
    $hariIni = date('Y-m-d');
    $trxHari = 0;
    foreach ($db['transaksi'] as $t) { if ($t['tanggal'] === $hariIni) { $trxHari++; } }

    out([
        'saldo'        => $saldo['saldo'],
        'saldo_awal'   => $saldo['saldo_awal'],
        'total_masuk'  => $saldo['total_masuk'],
        'total_keluar' => $saldo['total_keluar'],
        'bulan_ini'    => ['periode' => $bulanIni, 'masuk' => $masukBulan, 'keluar' => $keluarBulan, 'saldo_bulan' => $masukBulan - $keluarBulan],
        'tren'         => $tren,
        'topKategori'  => $topKategori,
        'iuran'        => [
            'periode'   => $bulanIni,
            'total'     => $totalIuran,
            'terkumpul' => $terkumpul,
            'sisa'      => $totalIuran - $terkumpul,
            'persen'    => $totalIuran > 0 ? (int)round($terkumpul / $totalIuran * 100) : 0,
        ],
        'tunggakan'    => ['jumlah_item' => count($tunggakan), 'total' => $jumlahTunggakan],
        'santri'       => ['total' => count($db['santri']), 'aktif' => $aktif],
        'transaksi_hari_ini' => $trxHari,
    ]);
}

/* =========================================================
 * LAPORAN
 * ========================================================= */
if ($p === 'laporan' && $method === 'GET') {
    if ($sub === 'iuran') {
        $periode = isset($_GET['periode']) ? (string)$_GET['periode'] : '';
        $list = $db['tagihan'];
        if ($periode !== '') {
            $list = array_values(array_filter($list, function ($t) use ($periode) { return $t['periode'] === $periode; }));
        }
        $per = [];
        foreach ($list as $t) {
            $pp = $t['periode'];
            if (!isset($per[$pp])) {
                $per[$pp] = ['periode' => $pp, 'total' => 0.0, 'terkumpul' => 0.0, 'sisa' => 0.0,
                             'jumlah_tagihan' => 0, 'lunas' => 0, 'belum' => 0, 'sebagian' => 0];
            }
            $r    = &$per[$pp];
            $r['total']         += (float)$t['nominal'];
            $r['sisa']          += tagihan_sisa($db, $t);
            $r['jumlah_tagihan'] += 1;
            $st = tagihan_status($db, $t);
            $r[$st] += 1;
            unset($r);
        }
        foreach ($per as $k => $r) { $per[$k]['terkumpul'] = $r['total'] - $r['sisa']; }
        $arr = array_values($per);
        usort($arr, function ($a, $b) { return strcmp($b['periode'], $a['periode']); });
        out($arr);
    }

    $dari   = isset($_GET['dari']) ? (string)$_GET['dari'] : '0000-01-01';
    $sampai = isset($_GET['sampai']) ? (string)$_GET['sampai'] : '9999-12-31';
    $jenis  = isset($_GET['jenis']) ? (string)$_GET['jenis'] : 'semua';
    $rows = array_values(array_filter($db['transaksi'], function ($t) use ($dari, $sampai) {
        return $t['tanggal'] >= $dari && $t['tanggal'] <= $sampai;
    }));
    if ($jenis !== '' && $jenis !== 'semua') {
        $rows = array_values(array_filter($rows, function ($t) use ($jenis) { return $t['jenis'] === $jenis; }));
    }
    $km = kategori_map($db);
    $perKat = []; $masuk = 0.0; $keluar = 0.0;
    foreach ($rows as $t) {
        $kid = $t['kategori_id'];
        if (!isset($perKat[$kid])) {
            $perKat[$kid] = [
                'kategori' => isset($km[$kid]) ? $km[$kid]['nama'] : '-',
                'jenis'    => $t['jenis'],
                'warna'    => isset($km[$kid]) ? $km[$kid]['warna'] : '#94a3b8',
                'jumlah'   => 0.0, 'jumlah_item' => 0,
            ];
        }
        $perKat[$kid]['jumlah'] += (float)$t['jumlah'];
        $perKat[$kid]['jumlah_item'] += 1;
        if ($t['jenis'] === 'masuk') { $masuk += (float)$t['jumlah']; } else { $keluar += (float)$t['jumlah']; }
    }
    $rincian = array_values($perKat);
    usort($rincian, function ($a, $b) { return $b['jumlah'] <=> $a['jumlah']; });

    $trx = [];
    foreach ($rows as $t) {
        $trx[] = array_merge($t, [
            'kategori' => isset($km[$t['kategori_id']]) ? $km[$t['kategori_id']]['nama'] : '-',
            'warna'    => isset($km[$t['kategori_id']]) ? $km[$t['kategori_id']]['warna'] : '#94a3b8',
        ]);
    }
    usort($trx, function ($a, $b) { return strcmp($b['tanggal'], $a['tanggal']); });

    out([
        'periode' => ['dari' => $dari, 'sampai' => $sampai],
        'ringkas' => ['masuk' => $masuk, 'keluar' => $keluar, 'selisih' => $masuk - $keluar, 'jumlah_transaksi' => count($rows)],
        'rincian_kategori' => $rincian,
        'transaksi' => $trx,
    ]);
}

/* =========================================================
 * BACKUP / RESTORE / RESET / DEMO
 * ========================================================= */
if ($p === 'backup' && $method === 'GET') {
    header('Content-Type: application/json');
    header('Content-Disposition: attachment; filename="backup-keuangan-' . date('Y-m-d') . '.json"');
    echo json_encode($db, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}
if ($p === 'restore' && $method === 'POST') {
    if (!isset($body['pengaturan'])) { fail('File backup tidak valid'); }
    $db = array_merge(db_default(), $body);
    /* akun login & sesi aktif tidak ikut ditimpa backup (agar tidak keluar sendiri) */
    $db['sesi'] = $SESI_LAMA;
    if (empty($db['pengguna'])) { $db['pengguna'] = $PENGGUNA_LAMA; }
    pengguna_sinkron_counter($db);
    auth_admin($db);          // pastikan selalu ada akun admin
    db_save($db);
    out(['ok' => true, 'pesan' => 'Backup berhasil dipulihkan']);
}
if ($p === 'reset' && $method === 'POST') {
    $db = db_default();
    $db['pengguna'] = $PENGGUNA_LAMA;   // akun login tetap dipertahankan
    $db['sesi']     = $SESI_LAMA;
    pengguna_sinkron_counter($db);
    auth_admin($db);                 // pastikan selalu ada akun admin
    db_save($db);
    out(['ok' => true, 'pesan' => 'Data dikosongkan']);
}
if ($p === 'demo' && $method === 'POST') {
    $db = seed_demo();
    $db['pengguna'] = $PENGGUNA_LAMA;   // akun login tetap dipertahankan
    $db['sesi']     = $SESI_LAMA;
    pengguna_sinkron_counter($db);
    auth_admin($db);                 // pastikan selalu ada akun admin
    db_save($db);
    out(['ok' => true, 'pesan' => 'Data demo berhasil dimuat']);
}

fail('Endpoint tidak ditemukan', 404);

} catch (Throwable $e) {
    fail('Kesalahan server: ' . $e->getMessage(), 500);
}

