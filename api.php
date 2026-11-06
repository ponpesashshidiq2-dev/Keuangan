<?php
/**
 * Aplikasi Keuangan Pondok Pesantren â€” API
 * Satu titik akhir: api.php?p=<resource>[&id=..][&act=..][&sub=..]
 * Metode: GET / POST / PUT / DELETE  (body JSON)
 */
require __DIR__ . '/db.php';

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

/** Label baris jurnal: prioritas tagihan iuran (tagihan_id) â†’ kolom tagihan santri */
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

try {

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
if ($p === 'wa') {
    $fileWa = __DIR__ . '/data/wa.json';
    $state  = ['status' => 'logout', 'qr' => '', 'kode' => '', 'no' => '', 'mintakode' => 0, 'diperbarui' => ''];
    if (is_file($fileWa)) {
        $isi = json_decode((string)@file_get_contents($fileWa), true);
        if (is_array($isi)) { $state = array_merge($state, $isi); }
    }
    if ($method === 'GET') { out($state); }
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
        foreach (['nama_pesantren', 'alamat', 'kota', 'tahun_ajaran', 'logo_teks', 'nama_mudir', 'nama_bendahara'] as $k) {
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
        $out = []; $no = 0;
        foreach ($db['santri'] as $raw) {
            $no++;
            $s = santri_bersih($raw, $db);
            $s['no'] = $no;
            if ($q !== '' && stripos($s['nama'], $q) === false && stripos($s['nis'], $q) === false && stripos($s['no_wa'], $q) === false) { continue; }
            if ($status !== '' && $status !== 'semua' && $s['status'] !== $status) { continue; }
            if ($kelas !== '' && $kelas !== 'semua' && strcasecmp($s['kelas'], $kelas) !== 0) { continue; }
            $s['total_tagihan'] = santri_total_tagihan($s, $db);
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
        if (isset($body['custom']) && is_array($body['custom'])) {
            foreach ($body['custom'] as $k => $v) {
                $n = angka_import($v);
                if ($n !== null) { $s['custom'][(string)$k] = $n; }
            }
        }
        $s['total_tagihan'] = santri_total_tagihan($s, $db);
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

        $items = (isset($body['items']) && is_array($body['items'])) ? $body['items'] : [];

        /* ---- Multi: entry beberapa tagihan iuran sekaligus ---- */
        if ($arah === 'masuk' && $items) {
            if ($akun !== '' && !in_array($akun, akun_pemasukan_list(), true)) { fail('Akun pemasukan tidak valid'); }
            $santriId = (string)($body['santri_id'] ?? '');
            $nama     = trim((string)($body['nama'] ?? ''));
            $kelas    = (string)($body['kelas'] ?? '');
            if ($santriId !== '') {
                $s = find_by_id($db['santri'], $santriId);
                if ($s) { $nama = $s['nama']; if ($kelas === '') { $kelas = $s['kelas']; } }
            }
            if ($nama === '') { fail('Nama wajib diisi'); }

            // validasi semua tagihan dulu â€” belum ada data ditulis
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
            if (!$siap) { fail('Tidak ada tagihan dipilih'); }

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
                    'keterangan'  => $noBkm . ' â€¢ ' . $nama . ($label !== '' ? ' â€¢ ' . $label : ''),
                    'ref'         => $j['id'],
                    'ref_tipe'    => 'jurnal',
                    'dibuat'      => date('c'),
                ];

                $j['label_tagihan'] = $label;
                $buat[] = $j;
                $tot   += $sisa;
            }
            db_save($db);
            out(['ok' => true, 'dibuat' => count($buat), 'total' => $tot, 'jurnal' => $buat], 201);
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
            $kt  = $noBkm . ' â€¢ ' . $nama . ($label !== '' ? ' â€¢ ' . $label : '');
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

        // penerima (santri) â€” opsional, dipakai mutasi uang saku / tabungan / tagihan lain
        $santriIdK = (string)($body['santri_id'] ?? '');
        $namaK     = trim((string)($body['nama'] ?? ''));
        $kelasK    = (string)($body['kelas'] ?? '');
        if ($santriIdK !== '') {
            $s = find_by_id($db['santri'], $santriIdK);
            if ($s) { $namaK = $s['nama']; if ($kelasK === '') { $kelasK = $s['kelas']; } }
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
        $kt  = $noBkk . ' â€¢ ' . $akun . ' â† ' . $sumber . ($namaK !== '' ? ' â€¢ ' . $namaK : '') . ($ket !== '' ? ' â€¢ ' . $ket : '');
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
        db_save($db);
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
                    $kt  = $no . ' â€¢ ' . (string)$j['akun'] . ' â† ' . (string)($j['sumber_dana'] ?? '');
                    $pnh = trim((string)($j['nama'] ?? ''));
                    $ket = trim((string)($j['keterangan'] ?? ''));
                    $db['transaksi'][$i]['keterangan'] = $kt . ($pnh !== '' ? ' â€¢ ' . $pnh : '') . ($ket !== '' ? ' â€¢ ' . $ket : '');
                } else {
                    $db['transaksi'][$i]['keterangan'] = $j['no_bkm'] . ' â€¢ ' . $nama . ($label !== '' ? ' â€¢ ' . $label : '');
                }
                $db['transaksi'][$i]['tanggal'] = $tanggal;
                $db['transaksi'][$i]['jumlah']  = $nominal;
                break;
            }
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
        db_save($db);
        out(['ok' => true]);
    }
    fail('Method tidak diizinkan', 405);
}

/* =========================================================
 * MUTASI KAS PER AKUN â€” Uang Saku / Tabungan / Tagihan Lain-lain
 * GET p=mutasi&sub=<kode>&dari=&sampai=&q=&jenis_transaksi=&arah=
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

        // seluruh mutasi utk akun ini (tanpa filter tanggal) â€” utk saldo awal
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

        // saldo sebelum periode `dari`
        $saldo = 0.0;
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
 * GET  p=kwitansi&act=antre&token=     antrean utk bot WA Web
 * GET  p=kwitansi&act=gambar&token=&no_bkm=   PNG kwitansi utk bot
 * GET  p=kwitansi&act=riwayat          riwayat kirim (lokal)
 * POST p=kwitansi {act:'kirim-wa', no_bkm, no_hp, nama, pesan, gambar}
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
/** Token rahasia utk bot WA Web â€” dibuat otomatis saat pertama diminta */
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
/** Nomor HP â†’ format internasional utk wa.me (62â€¦) */
function wa_format_hp(string $hp): string {
    $n = preg_replace('/[^0-9]/', '', $hp);
    if ($n === '') { return ''; }
    if (strncmp($n, '62', 2) === 0) { return $n; }
    if (strncmp($n, '0', 1) === 0) { return '62' . substr($n, 1); }
    if (strncmp($n, '8', 1) === 0) { return '62' . $n; }
    return $n;
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
                /* entry lama sering tanpa santri_id â€” cocokkan nama utk ambil no WA wali */
                if (!$s) {
                    $nmKey = strtolower(trim((string)($x['nama'] ?? '')));
                    $s = ($nmKey !== '' ? ($santriByNama[$nmKey] ?? null) : null);
                }
                $waRaw = '';
                if ($s) {
                    $waRaw = trim((string)($s['no_wa'] ?? ''));
                    if ($waRaw === '') { $waRaw = trim((string)($s['telepon'] ?? '')); }   // no WA wali â€” fallback kolom telepon
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
                $g['label_tagihan'] = $g['label_tagihan'] === '' ? $label : $g['label_tagihan'] . ' â€¢ ' . $label;
            }
            $ketX = trim((string)($x['keterangan'] ?? ''));
            if ($ketX !== '' && stripos($g['keterangan'], $ketX) === false) {
                $g['keterangan'] = $g['keterangan'] === '' ? $ketX : $g['keterangan'] . ' â€¢ ' . $ketX;
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
        out(['list' => $list, 'token' => wa_token($db), 'jumlah' => count($list)]);
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
            $it['gambar_url'] = 'api.php?p=kwitansi&act=gambar&token=' . urlencode((string)($_GET['token'] ?? ''))
                              . '&no_bkm=' . urlencode((string)($it['no_bkm'] ?? ''));
            $kirim[] = $it;
        }
        if ($kirim) { db_save($db); }
        out(['list' => $kirim]);
    }

    /* ---------- PNG kwitansi utk bot ---------- */
    if ($method === 'GET' && $actG === 'gambar') {
        if (!wa_token_ok($db, (string)($_GET['token'] ?? ''))) { fail('Token tidak valid', 401); }
        $f = kwitansi_file((string)($_GET['no_bkm'] ?? ''));
        if (!is_file($f)) { fail('Gambar kwitansi tidak ditemukan', 404); }
        header('Content-Type: image/png');
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

        // simpan gambar kwitansi (dataURL â†’ PNG)
        $gambar = (string)($body['gambar'] ?? '');
        $file   = '';
        if ($gambar !== '') {
            $raw = $gambar;
            if (preg_match('/^data:image\/png;base64,/', $raw)) { $raw = substr($raw, strpos($raw, ',') + 1); }
            $bin = base64_decode($raw, true);
            if ($bin === false || strlen($bin) < 100) { fail('Gambar kwitansi tidak valid'); }
            $f = kwitansi_file($noBkm);
            if (@file_put_contents($f, $bin) === false) { fail('Folder data/kwitansi tidak bisa ditulis (permission 755/775)'); }
            $file = basename($f);
        }

        $item = [
            'id'        => uid($db, 'antre'),
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
        if (!$sids) { fail('Tidak ada santri aktif â€” tambah/ubah status santri di menu Data Santri'); }

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
                /* kolom bulanan menyesuaikan periode: spp â†’ spp_11 (November) */
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
        db_save($db);
        $pesan = '';
        if (!empty($body['hapus_dulu'])) {
            $pesan .= $hasilHapus['dihapus'] . ' tagihan lama dihapus';
            if ($hasilHapus['dilewati_bayar']) { $pesan .= ' â€¢ ' . $hasilHapus['dilewati_bayar'] . ' dilewati (sudah ada pembayaran)'; }
            $pesan .= ' â€¢ ';
        }
        $pesan .= $dibuat . ' tagihan dibuat untuk periode ' . $periode;
        if ($sudah)  { $pesan .= ' â€¢ ' . $sudah . ' sudah ada'; }
        if ($kosong && !$dibuat && !$sudah) { $pesan .= ' â€¢ nilai kolom di Data Santri masih 0'; }
        out(['ok' => true, 'dibuat' => $dibuat, 'sudah' => $sudah, 'dihapus' => $hasilHapus['dihapus'], 'dilewati_bayar' => $hasilHapus['dilewati_bayar'], 'pesan' => $pesan]);
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
        if ($r['dilewati_bayar']) { $pesan .= ' â€¢ ' . $r['dilewati_bayar'] . ' dilewati (sudah ada pembayaran)'; }
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
        // pembayaran hasil entry jurnal (BKM) â€” cabut juga jurnal & kas terkait
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
    db_save($db);
    out(['ok' => true, 'pesan' => 'Backup berhasil dipulihkan']);
}
if ($p === 'reset' && $method === 'POST') {
    db_save(db_default());
    out(['ok' => true, 'pesan' => 'Data dikosongkan']);
}
if ($p === 'demo' && $method === 'POST') {
    db_save(seed_demo());
    out(['ok' => true, 'pesan' => 'Data demo berhasil dimuat']);
}

fail('Endpoint tidak ditemukan', 404);

} catch (Throwable $e) {
    fail('Kesalahan server: ' . $e->getMessage(), 500);
}

