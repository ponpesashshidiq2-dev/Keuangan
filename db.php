<?php
/**
 * Aplikasi Keuangan Pondok Pesantren
 * Helper penyimpanan JSON — tanpa database, ramah shared hosting.
 */

function db_file(): string {
    return __DIR__ . '/data/db.json';
}

function db_default(): array {
    return [
        'pengaturan' => [
            'nama_pesantren' => 'Pondok Pesantren Darul Hikmah',
            'alamat'         => 'Jl. Raya Sukamaju No. 12, Bogor, Jawa Barat',
            'tahun_ajaran'   => '2025/2026',
            'saldo_awal'     => 5000000,
            'logo_teks'      => 'PP',
        ],
        'kategori'      => [],
        'santri'        => [],
        'jenis_tagihan' => [],
        'tagihan'       => [],
        'pembayaran'    => [],
        'transaksi'     => [],
        'counters' => [
            'santri' => 0, 'transaksi' => 0, 'tagihan' => 0,
            'pembayaran' => 0, 'kategori' => 0, 'jenis_tagihan' => 0,
        ],
    ];
}

function db_load(): array {
    $f   = db_file();
    $dir = dirname($f);
    if (!is_dir($dir)) { @mkdir($dir, 0755, true); }
    if (file_exists($f)) {
        $j = json_decode((string)file_get_contents($f), true);
        if (is_array($j)) {
            $d = db_default();
            foreach ($j as $k => $v) { $d[$k] = $v; }
            foreach (db_default()['counters'] as $k => $v) {
                if (!isset($d['counters'][$k])) { $d['counters'][$k] = 0; }
            }
            return $d;
        }
    }
    return db_default();
}

function db_save(array $db): void {
    $f   = db_file();
    $dir = dirname($f);
    if (!is_dir($dir)) { @mkdir($dir, 0755, true); }
    $json = json_encode($db, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    $tmp  = $f . '.' . uniqid('', true) . '.tmp';
    if (@file_put_contents($tmp, $json, LOCK_EX) === false) {
        throw new RuntimeException('Folder data/ tidak bisa ditulis. Ubah permission folder data/ menjadi 755 atau 775.');
    }
    if (!@rename($tmp, $f)) {
        @copy($tmp, $f);
        @unlink($tmp);
    }
}

function uid(array &$db, string $prefix): string {
    $db['counters'][$prefix] = (int)($db['counters'][$prefix] ?? 0) + 1;
    return strtoupper(substr($prefix, 0, 3)) . '-' . str_pad((string)$db['counters'][$prefix], 5, '0', STR_PAD_LEFT);
}

function rupiah($n): string {
    return 'Rp ' . number_format((float)$n, 0, ',', '.');
}

function hitung_saldo(array $db): array {
    $awal  = (float)($db['pengaturan']['saldo_awal'] ?? 0);
    $masuk = 0.0;
    $keluar = 0.0;
    foreach ($db['transaksi'] as $t) {
        if (($t['jenis'] ?? '') === 'masuk') { $masuk += (float)$t['jumlah']; }
        else { $keluar += (float)$t['jumlah']; }
    }
    return [
        'saldo_awal'   => $awal,
        'total_masuk'  => $masuk,
        'total_keluar' => $keluar,
        'saldo'        => $awal + $masuk - $keluar,
    ];
}

function tagihan_sisa(array $db, array $tagihan): float {
    $bayar = 0.0;
    foreach ($db['pembayaran'] as $p) {
        if (($p['tagihan_id'] ?? '') === $tagihan['id']) { $bayar += (float)$p['jumlah']; }
    }
    return max(0, (float)$tagihan['nominal'] - $bayar);
}

function tagihan_status(array $db, array $tagihan): string {
    $nominal = (float)$tagihan['nominal'];
    $dibayar = $nominal - tagihan_sisa($db, $tagihan);
    if ($dibayar <= 0) { return 'belum'; }
    if ($dibayar >= $nominal) { return 'lunas'; }
    return 'sebagian';
}

function kategori_map(array $db): array {
    $m = [];
    foreach ($db['kategori'] as $k) { $m[$k['id']] = $k; }
    return $m;
}

function find_by_id(array $list, string $id) {
    foreach ($list as $x) { if (($x['id'] ?? '') === $id) { return $x; } }
    return null;
}

function ringkas_tagihan(array $db, array $t): array {
    $s = find_by_id($db['santri'], $t['santri_id']);
    $j = find_by_id($db['jenis_tagihan'], $t['jenis_id']);
    $riwayat = [];
    $totalBayar = 0.0;
    foreach ($db['pembayaran'] as $p) {
        if (($p['tagihan_id'] ?? '') === $t['id']) {
            $riwayat[]  = $p;
            $totalBayar += (float)$p['jumlah'];
        }
    }
    usort($riwayat, function ($a, $b) { return strcmp($b['tanggal'] ?? '', $a['tanggal'] ?? ''); });
    $sisa = tagihan_sisa($db, $t);
    return array_merge($t, [
        'nama_santri' => $s ? $s['nama'] : '(dihapus)',
        'nis'         => $s ? $s['nis'] : '-',
        'kelas'       => $s ? $s['kelas'] : '-',
        'jenis'       => $j ? $j['nama'] : '-',
        'total_bayar' => $totalBayar,
        'sisa'        => $sisa,
        'status'      => tagihan_status($db, $t),
        'riwayat'     => $riwayat,
    ]);
}

/* ---------------------------------------------------------------
 * Data demo — 30 santri, kas & iuran 3 bulan terakhir
 * --------------------------------------------------------------- */
function seed_demo(): array {
    $db = db_default();
    $y  = (int)date('Y');
    $m  = (int)date('n') - 1; // 0-11 seperti JavaScript

    $katDefs = [
        ['Sumbangan', 'masuk', '#16a34a'],
        ['Bazar / Kegiatan', 'masuk', '#0ea5e9'],
        ['Iuran Santri', 'masuk', '#22c55e'],
        ['Zakat / Infaq', 'masuk', '#84cc16'],
        ['Makan Santri', 'keluar', '#ef4444'],
        ['Gaji Pengajar', 'keluar', '#f97316'],
        ['Operasional', 'keluar', '#eab308'],
        ['Sarana & Prasarana', 'keluar', '#a855f7'],
        ['Kegiatan Santri', 'keluar', '#ec4899'],
    ];
    foreach ($katDefs as $kd) {
        $db['kategori'][] = ['id' => uid($db, 'kategori'), 'nama' => $kd[0], 'jenis' => $kd[1], 'warna' => $kd[2]];
    }
    $katIuranId = $db['kategori'][2]['id'];

    $asrama = ['Asrama Al-Fatih', 'Asrama Al-Hikmah', 'Asrama An-Nur', 'Asrama Ar-Rahman'];
    $kelas  = ['TMI 1', 'TMI 2', 'TMI 3', 'TMI 4', 'MTs 1', 'MTs 2', 'MA 1', 'MA 2'];
    $nama = [
        'Ahmad Fauzi', 'Muhammad Rizki', 'Abdul Rahman', 'Yusuf Maulana', 'Hafidz Alfarizi',
        'Zainal Abidin', 'Umar Said', 'Hamzah Ridwan', 'Bilal Hakim', 'Farhan Nugroha',
        'Ikhwan Setiawan', 'Rasyid Pratama', 'Galih Ramadhan', 'Ilham Maulana', 'Ridwan Kamil',
        'Deni Hermawan', 'Fajar Nurcahyo', 'Andi Saputra', 'Bagus Wicaksono', 'Chandra Kirana',
        'Dzikri Ramadhan', 'Eko Prasetyo', 'Faisal Hakim', 'Ghali Izuddin', 'Hasan Basri',
        'Irfan Hakim', 'Jamal Mirdad', 'Lukman Hakim', 'Mansur Shiddiq', 'Naufal Rasyid',
    ];
    foreach ($nama as $i => $n) {
        $db['santri'][] = [
            'id'      => uid($db, 'santri'),
            'nis'     => '25' . str_pad((string)($i + 1), 4, '0', STR_PAD_LEFT),
            'nama'    => $n,
            'kelas'   => $kelas[$i % count($kelas)],
            'asrama'  => $asrama[$i % count($asrama)],
            'status'  => $i < 26 ? 'aktif' : 'cuti',
            'telepon' => '08' . substr((string)(1200000000 + $i * 137), 0, 10),
            'dibuat'  => date('c', mktime(0, 0, 0, $m + 1, 1, $y)),
        ];
    }

    $db['jenis_tagihan'] = [
        ['id' => uid($db, 'jenis_tagihan'), 'nama' => 'Uang Makan', 'nominal' => 400000, 'aktif' => true],
        ['id' => uid($db, 'jenis_tagihan'), 'nama' => 'Uang Sekolah', 'nominal' => 250000, 'aktif' => true],
        ['id' => uid($db, 'jenis_tagihan'), 'nama' => 'Uang Kegiatan', 'nominal' => 100000, 'aktif' => true],
        ['id' => uid($db, 'jenis_tagihan'), 'nama' => 'Uang Asrama', 'nominal' => 150000, 'aktif' => true],
    ];

    // 3 periode terakhir
    $periodes = [];
    for ($i = 2; $i >= 0; $i--) {
        $periodes[] = date('Y-m', mktime(0, 0, 0, $m - $i + 1, 1, $y));
    }
    $aktif = array_values(array_filter($db['santri'], function ($s) { return $s['status'] === 'aktif'; }));
    foreach ($periodes as $p) {
        foreach ($aktif as $s) {
            foreach ($db['jenis_tagihan'] as $jt) {
                $db['tagihan'][] = [
                    'id'        => uid($db, 'tagihan'),
                    'santri_id' => $s['id'],
                    'periode'   => $p,
                    'jenis_id'  => $jt['id'],
                    'nominal'   => $jt['nominal'],
                    'dibuat'    => date('c'),
                ];
            }
        }
    }

    // periode paling lama: lunas; periode tengah: setengah dibayar
    foreach ($db['tagihan'] as $t) {
        if ($t['periode'] === $periodes[0]) {
            $s = find_by_id($db['santri'], $t['santri_id']);
            $db['pembayaran'][] = [
                'id' => uid($db, 'pembayaran'), 'tagihan_id' => $t['id'],
                'tanggal' => $periodes[0] . '-05', 'jumlah' => $t['nominal'],
                'metode' => 'Tunai', 'petugas' => 'Bendahara', 'keterangan' => 'Lunas',
            ];
            $db['transaksi'][] = [
                'id' => uid($db, 'transaksi'), 'tanggal' => $periodes[0] . '-05', 'jenis' => 'masuk',
                'kategori_id' => $katIuranId, 'jumlah' => $t['nominal'],
                'keterangan' => 'Iuran ' . $periodes[0] . ' - ' . ($s ? $s['nama'] : ''),
                'ref' => $t['id'], 'dibuat' => date('c'),
            ];
        } elseif ($t['periode'] === $periodes[1]) {
            $s   = find_by_id($db['santri'], $t['santri_id']);
            $jml = (int)(round($t['nominal'] / 2 / 5000) * 5000);
            $db['pembayaran'][] = [
                'id' => uid($db, 'pembayaran'), 'tagihan_id' => $t['id'],
                'tanggal' => $periodes[1] . '-10', 'jumlah' => $jml,
                'metode' => 'Transfer', 'petugas' => 'Bendahara', 'keterangan' => 'Angsuran',
            ];
            $db['transaksi'][] = [
                'id' => uid($db, 'transaksi'), 'tanggal' => $periodes[1] . '-10', 'jenis' => 'masuk',
                'kategori_id' => $katIuranId, 'jumlah' => $jml,
                'keterangan' => 'Iuran ' . $periodes[1] . ' - ' . ($s ? $s['nama'] : ''),
                'ref' => $t['id'], 'dibuat' => date('c'),
            ];
        }
    }

    // transaksi operasional manual
    $manual = [
        [0, 3, 'keluar', 'Makan Santri', 12500000, 'Belanja beras & lauk mingguan'],
        [0, 6, 'keluar', 'Gaji Pengajar', 18000000, 'Gaji bulanan 12 guru'],
        [0, 9, 'keluar', 'Operasional', 1250000, 'Listrik & air'],
        [0, 12, 'masuk', 'Sumbangan', 15000000, 'Donatur H. Sofyan'],
        [0, 15, 'keluar', 'Sarana & Prasarana', 3500000, 'Renovasi kamar mandi'],
        [0, 20, 'masuk', 'Sumbangan', 45000000, 'Waqaf Keluarga H. Abdurrahman'],
        [1, 2, 'keluar', 'Makan Santri', 11800000, 'Belanja beras & lauk mingguan'],
        [1, 5, 'keluar', 'Gaji Pengajar', 18000000, 'Gaji bulanan 12 guru'],
        [1, 8, 'masuk', 'Zakat / Infaq', 12500000, 'Infaq jamaah Jumat & donatur kecil'],
        [1, 14, 'keluar', 'Kegiatan Santri', 2200000, 'Lomba keagamaan'],
        [1, 20, 'masuk', 'Bazar / Kegiatan', 8600000, 'Bazar Ramadhan pesantren'],
        [2, 2, 'keluar', 'Makan Santri', 13200000, 'Belanja beras & lauk mingguan'],
        [2, 5, 'keluar', 'Gaji Pengajar', 18000000, 'Gaji bulanan 12 guru'],
        [2, 11, 'keluar', 'Operasional', 980000, 'Perlengkapan dapur'],
        [2, 18, 'masuk', 'Sumbangan', 30000000, 'Donatur Yayasan Al-Ihsan'],
        [2, 22, 'keluar', 'Sarana & Prasarana', 6400000, 'Perbaikan atap aula'],
    ];
    foreach ($manual as $mn) {
        $ds  = date('Y-m-d', mktime(0, 0, 0, $m - $mn[0] + 1, $mn[1], $y));
        $kid = null;
        foreach ($db['kategori'] as $k) { if ($k['nama'] === $mn[3]) { $kid = $k['id']; break; } }
        $db['transaksi'][] = [
            'id' => uid($db, 'transaksi'), 'tanggal' => $ds, 'jenis' => $mn[2],
            'kategori_id' => $kid, 'jumlah' => $mn[4], 'keterangan' => $mn[5], 'dibuat' => date('c'),
        ];
    }
    usort($db['transaksi'], function ($a, $b) { return strcmp($b['tanggal'], $a['tanggal']); });
    return $db;
}
