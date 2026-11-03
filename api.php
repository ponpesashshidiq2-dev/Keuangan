<?php
/**
 * Aplikasi Keuangan Pondok Pesantren — API
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
    return function_exists('mb_strtolower') ? mb_strtolower($s) : strtolower($s);
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
if ($p === 'pengaturan') {
    if ($method === 'GET') { out($db['pengaturan']); }
    if ($method === 'PUT') {
        foreach (['nama_pesantren', 'alamat', 'tahun_ajaran', 'logo_teks'] as $k) {
            if (isset($body[$k])) { $db['pengaturan'][$k] = (string)$body[$k]; }
        }
        if (isset($body['saldo_awal'])) { $db['pengaturan']['saldo_awal'] = (float)$body['saldo_awal']; }
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
        if ($act === 'next') { out(['no_bkm' => bkm_nomor($db)]); }

        $dari   = isset($_GET['dari']) ? (string)$_GET['dari'] : '';
        $sampai = isset($_GET['sampai']) ? (string)$_GET['sampai'] : '';
        $q      = isset($_GET['q']) ? trim((string)$_GET['q']) : '';
        $jt     = isset($_GET['jenis_transaksi']) ? (string)$_GET['jenis_transaksi'] : '';
        $list   = $db['jurnal'];
        if ($dari !== '')   { $list = array_values(array_filter($list, function ($x) use ($dari) { return $x['tanggal'] >= $dari; })); }
        if ($sampai !== '') { $list = array_values(array_filter($list, function ($x) use ($sampai) { return $x['tanggal'] <= $sampai; })); }
        if ($jt !== '' && $jt !== 'semua') { $list = array_values(array_filter($list, function ($x) use ($jt) { return $x['jenis_transaksi'] === $jt; })); }
        if ($q !== '') {
            $list = array_values(array_filter($list, function ($x) use ($q) {
                return stripos((string)$x['nama'], $q) !== false || stripos((string)$x['no_bkm'], $q) !== false;
            }));
        }
        $out = [];
        foreach ($list as $x) {
            $out[] = array_merge($x, ['label_tagihan' => jurnal_label_tagihan($db, (string)($x['tagihan_jenis'] ?? ''))]);
        }
        usort($out, function ($a, $b) {
            $c = strcmp($b['tanggal'], $a['tanggal']);
            return $c !== 0 ? $c : strcmp((string)($b['id'] ?? ''), (string)($a['id'] ?? ''));
        });
        out($out);
    }

    if ($method === 'POST') {
        $tanggal = (string)($body['tanggal'] ?? '');
        $jt      = (string)($body['jenis_transaksi'] ?? '');
        $nominal = angka_import($body['nominal'] ?? null);
        $santriId = (string)($body['santri_id'] ?? '');
        $nama    = trim((string)($body['nama'] ?? ''));
        $kelas   = (string)($body['kelas'] ?? '');
        if ($santriId !== '') {
            $s = find_by_id($db['santri'], $santriId);
            if ($s) { $nama = $s['nama']; if ($kelas === '') { $kelas = $s['kelas']; } }
        }
        if ($tanggal === '' || $nama === '') { fail('Tanggal & nama wajib diisi'); }
        if (!in_array($jt, ['Cas', 'BRI', 'BSI', 'BPD'], true)) { fail('Jenis transaksi tidak valid'); }
        if ($nominal === null || $nominal <= 0) { fail('Nominal harus > 0'); }

        $noBkm = trim((string)($body['no_bkm'] ?? ''));
        if ($noBkm === '') { $noBkm = bkm_nomor($db, true); }

        $tagihanKey = (string)($body['tagihan_jenis'] ?? '');
        $label = jurnal_label_tagihan($db, $tagihanKey);

        $j = [
            'id'              => uid($db, 'jurnal'),
            'tanggal'         => $tanggal,
            'no_bkm'          => $noBkm,
            'santri_id'       => $santriId,
            'nama'            => $nama,
            'kelas'           => $kelas !== '' ? $kelas : '-',
            'jenis_transaksi' => $jt,
            'tagihan_jenis'   => $tagihanKey,
            'nominal'         => $nominal,
            'keterangan'      => (string)($body['keterangan'] ?? ''),
            'dibuat'          => date('c'),
        ];
        $db['jurnal'][] = $j;

        $kat  = kategori_jurnal($db);
        $ket  = $noBkm . ' • ' . $nama . ($label !== '' ? ' • ' . $label : '');
        $db['transaksi'][] = [
            'id'          => uid($db, 'transaksi'),
            'tanggal'     => $tanggal,
            'jenis'       => 'masuk',
            'kategori_id' => $kat['id'],
            'jumlah'      => $nominal,
            'keterangan'  => $ket,
            'ref'         => $j['id'],
            'ref_tipe'    => 'jurnal',
            'dibuat'      => date('c'),
        ];
        db_save($db);
        $j['label_tagihan'] = $label;
        out($j, 201);
    }

    if ($method === 'PUT' && $id) {
        $idx = null;
        foreach ($db['jurnal'] as $i => $x) { if ($x['id'] === $id) { $idx = $i; break; } }
        if ($idx === null) { fail('Jurnal tidak ditemukan', 404); }
        $j = $db['jurnal'][$idx];

        $tanggal = isset($body['tanggal']) ? (string)$body['tanggal'] : $j['tanggal'];
        $nama    = isset($body['nama']) ? trim((string)$body['nama']) : $j['nama'];
        $jt      = isset($body['jenis_transaksi']) ? (string)$body['jenis_transaksi'] : $j['jenis_transaksi'];
        $nominal = array_key_exists('nominal', $body) ? angka_import($body['nominal']) : (float)$j['nominal'];
        if ($tanggal === '' || $nama === '') { fail('Tanggal & nama wajib diisi'); }
        if (!in_array($jt, ['Cas', 'BRI', 'BSI', 'BPD'], true)) { fail('Jenis transaksi tidak valid'); }
        if ($nominal === null || $nominal <= 0) { fail('Nominal harus > 0'); }

        $j['tanggal']         = $tanggal;
        $j['nama']            = $nama;
        $j['jenis_transaksi'] = $jt;
        $j['nominal']         = $nominal;
        if (array_key_exists('no_bkm', $body))     { $j['no_bkm'] = trim((string)$body['no_bkm']) !== '' ? trim((string)$body['no_bkm']) : $j['no_bkm']; }
        if (array_key_exists('kelas', $body))      { $j['kelas'] = (string)$body['kelas']; }
        if (array_key_exists('santri_id', $body))  { $j['santri_id'] = (string)$body['santri_id']; }
        if (array_key_exists('tagihan_jenis', $body)) { $j['tagihan_jenis'] = (string)$body['tagihan_jenis']; }
        if (array_key_exists('keterangan', $body)) { $j['keterangan'] = (string)$body['keterangan']; }
        $db['jurnal'][$idx] = $j;
        $label = jurnal_label_tagihan($db, (string)$j['tagihan_jenis']);

        // sinkronkan transaksi kas terkait
        foreach ($db['transaksi'] as $i => $t) {
            if (($t['ref'] ?? '') === $id) {
                $db['transaksi'][$i]['tanggal']    = $tanggal;
                $db['transaksi'][$i]['jumlah']     = $nominal;
                $db['transaksi'][$i]['keterangan'] = $j['no_bkm'] . ' • ' . $nama . ($label !== '' ? ' • ' . $label : '');
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
        db_save($db);
        out(['ok' => true]);
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
        $status   = isset($_GET['status']) ? (string)$_GET['status'] : '';
        $jenisId  = isset($_GET['jenis_id']) ? (string)$_GET['jenis_id'] : '';
        $santriId = isset($_GET['santri_id']) ? (string)$_GET['santri_id'] : '';
        $q        = isset($_GET['q']) ? trim((string)$_GET['q']) : '';
        $list = $db['tagihan'];
        if ($periode !== '')  { $list = array_values(array_filter($list, function ($t) use ($periode) { return $t['periode'] === $periode; })); }
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
        $jids = isset($body['jenis_ids']) && is_array($body['jenis_ids']) && $body['jenis_ids']
            ? $body['jenis_ids']
            : array_values(array_filter(array_map(function ($j) { return $j['aktif'] ? $j['id'] : null; }, $db['jenis_tagihan'])));
        $sids = isset($body['santri_ids']) && is_array($body['santri_ids']) && $body['santri_ids']
            ? $body['santri_ids']
            : array_values(array_filter(array_map(function ($s) { return $s['status'] === 'aktif' ? $s['id'] : null; }, $db['santri'])));
        if (!$jids || !$sids) { fail('Tidak ada jenis tagihan atau santri aktif'); }
        $dibuat = 0;
        foreach ($sids as $sid) {
            foreach ($jids as $jid) {
                $dup = false;
                foreach ($db['tagihan'] as $t) {
                    if ($t['santri_id'] === $sid && $t['periode'] === $periode && $t['jenis_id'] === $jid) { $dup = true; break; }
                }
                if ($dup) { continue; }
                $jt = find_by_id($db['jenis_tagihan'], $jid);
                $db['tagihan'][] = [
                    'id'        => uid($db, 'tagihan'),
                    'santri_id' => $sid,
                    'periode'   => $periode,
                    'jenis_id'  => $jid,
                    'nominal'   => $jt ? (float)$jt['nominal'] : 0,
                    'dibuat'    => date('c'),
                ];
                $dibuat++;
            }
        }
        db_save($db);
        out(['ok' => true, 'dibuat' => $dibuat, 'pesan' => $dibuat . ' tagihan dibuat untuk periode ' . $periode]);
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
