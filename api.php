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
 * SANTRI
 * ========================================================= */
if ($p === 'santri') {
    if ($method === 'GET') {
        $q      = isset($_GET['q']) ? trim((string)$_GET['q']) : '';
        $status = isset($_GET['status']) ? (string)$_GET['status'] : '';
        $list   = $db['santri'];
        if ($q !== '') {
            $list = array_values(array_filter($list, function ($x) use ($q) {
                return stripos($x['nama'], $q) !== false || stripos((string)$x['nis'], $q) !== false;
            }));
        }
        if ($status !== '' && $status !== 'semua') {
            $list = array_values(array_filter($list, function ($x) use ($status) { return $x['status'] === $status; }));
        }
        $out = [];
        foreach ($list as $s) {
            $total = 0.0; $sisa = 0.0;
            foreach ($db['tagihan'] as $t) {
                if ($t['santri_id'] === $s['id']) {
                    $total += (float)$t['nominal'];
                    $sisa  += tagihan_sisa($db, $t);
                }
            }
            $out[] = array_merge($s, [
                'total_tagihan' => $total,
                'sisa_tagihan'  => $sisa,
                'lunas'         => $total - $sisa,
                'status_bayar'  => $sisa === 0 ? 'lunas' : ((($total - $sisa) > 0) ? 'sebagian' : 'belum'),
            ]);
        }
        usort($out, function ($a, $b) { return strcmp($a['nama'], $b['nama']); });
        out($out);
    }
    if ($method === 'POST') {
        $nama = trim((string)($body['nama'] ?? ''));
        if ($nama === '') { fail('Nama wajib diisi'); }
        $s = [
            'id'      => uid($db, 'santri'),
            'nis'     => trim((string)($body['nis'] ?? '')) !== '' ? trim((string)$body['nis']) : 'SAN' . str_pad((string)$db['counters']['santri'], 5, '0', STR_PAD_LEFT),
            'nama'    => $nama,
            'kelas'   => (string)($body['kelas'] ?? '-'),
            'asrama'  => (string)($body['asrama'] ?? '-'),
            'status'  => (string)($body['status'] ?? 'aktif'),
            'telepon' => (string)($body['telepon'] ?? ''),
            'dibuat'  => date('c'),
        ];
        $db['santri'][] = $s;
        db_save($db);
        out($s, 201);
    }
    if ($method === 'PUT' && $id) {
        $s = find_by_id($db['santri'], $id);
        if (!$s) { fail('Santri tidak ditemukan', 404); }
        foreach ($db['santri'] as $i => $x) {
            if ($x['id'] === $id) {
                foreach (['nama', 'nis', 'kelas', 'asrama', 'status', 'telepon'] as $k) {
                    if (isset($body[$k])) { $db['santri'][$i][$k] = (string)$body[$k]; }
                }
                $s = $db['santri'][$i];
                break;
            }
        }
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
        if (isset($t['ref'])) { fail('Transaksi ini otomatis dibuat dari pembayaran iuran. Hapus melalui menu Iuran.'); }
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
