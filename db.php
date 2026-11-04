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
            'nama_pesantren' => 'Pondok Pesantren Ash-Shiddiq',
            'alamat'         => 'Jl. Raya Sukamaju No. 12, Bogor, Jawa Barat',
            'tahun_ajaran'   => '2025/2026',
            'saldo_awal'     => 5000000,
            'logo_teks'      => 'PP',
        ],
        'kategori'      => [],
        'santri'        => [],
        'kolom_custom'  => [],
        'jurnal'        => [],
        'jenis_tagihan' => [],
        'tagihan'       => [],
        'pembayaran'    => [],
        'transaksi'     => [],
        'counters' => [
            'santri' => 0, 'transaksi' => 0, 'tagihan' => 0,
            'pembayaran' => 0, 'kategori' => 0, 'jenis_tagihan' => 0,
            'jurnal' => 0, 'kolom_custom' => 0,
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

/* ---------------------------------------------------------------
 * Kolom tagihan bawaan (Data Santri)
 * --------------------------------------------------------------- */
function bulan_nama(): array {
    return ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
}

function tagihan_kolom(): array {
    $bln   = bulan_nama();
    $kolom = [];
    foreach (['spp' => 'SPP', 'infaq' => 'Infaq Wajib', 'laundry' => 'Laundry Wajib'] as $pre => $nama) {
        for ($i = 1; $i <= 12; $i++) {
            $suf = str_pad((string)$i, 2, '0', STR_PAD_LEFT);
            $kolom[] = ['key' => $pre . '_' . $suf, 'nama' => $nama . ' ' . $bln[$i - 1], 'grup' => $pre, 'singkat' => $bln[$i - 1]];
        }
    }
    $lain = [
        'administrasi_awal'      => 'Administrasi Awal',
        'wakaf'                  => 'Wakaf',
        'daftar_ulang'           => 'Daftar Ulang',
        'tunggakan_spp'          => 'Tunggakan SPP',
        'tunggakan_infaq'        => 'Tunggakan Infaq Wajib',
        'tunggakan_laundry'      => 'Tunggakan Laundry Wajib',
        'tunggakan_daftar_ulang' => 'Tunggakan Daftar Ulang',
        'akhirusanah'            => 'Akhirusanah',
        'study_tour'             => 'Study Tour',
        'bimbel'                 => 'Bimbel',
        'rihlah'                 => 'Rihlah',
    ];
    foreach ($lain as $k => $n) {
        $kolom[] = ['key' => $k, 'nama' => $n, 'grup' => 'lainnya', 'singkat' => $n];
    }
    return $kolom;
}

/** Daftar jenis tagihan untuk jurnal = kolom bawaan + kolom custom bernilai angka */
function jenis_tagihan_list(array $db): array {
    $list = tagihan_kolom();
    foreach (($db['kolom_custom'] ?? []) as $c) {
        $list[] = ['key' => $c['key'], 'nama' => $c['nama'], 'grup' => 'custom', 'singkat' => $c['nama']];
    }
    return $list;
}

/** Akun pemasukan — pilihan pada jurnal kas masuk */
function akun_pemasukan_list(): array {
    return [
        'Administrasi', 'SPP', 'Infaq Wajib', 'Laundry Wajib', 'Wakaf', 'Tunggakan SPP',
        'Daftar Ulang', 'Infaq & Shodaqoh', 'Tunggakan Infaq Wajib', 'Tunggakan Daftar Ulang',
        'SPP TPA', 'Ifthor', 'CashBack', 'Dana UPJ', 'Dana BOS', 'Dana Lazis',
        'Akhirussanah', 'Pengembangan pendidikan', 'Hutang', 'Zakat Mal', 'Pendaftaran',
        'Peralatan Santri Baru', 'Kalender', 'Selisih Kas', 'Tunggakan Laundry Wajib',
        'Study Tour', 'Bimbel', 'Zakat Fitrah', 'Rihlah', 'Wakaf Masjid', 'Qurban', 'Orang Tua Asuh',
    ];
}

/** Akun pengeluaran — pilihan pada jurnal kas keluar */
function akun_pengeluaran_list(): array {
    return [
        'Biaya Insentif Guru dan Karyawan', 'Biaya Listrik', 'Biaya Angsuran Hutang',
        'Biaya Konsumsi Santri', 'Biaya Konsumsi Tamu', 'Biaya Konsumsi Guru',
        'Biaya Transport', 'Biaya Perlengkapan', 'Biaya Dana Sosial', 'Biaya Peralatan',
        'Biaya Bahan Bangunan', 'Biaya Bensin', 'Biaya Iuran', 'Biaya Service',
        'Dana dibantukan/Hibahkan', 'Biaya Konsumsi Buka Puasa', 'Biaya Pembelian Buku',
        'Penyesuaian', 'Biaya Pajak', 'Biaya Administrasi', 'Biaya P3K', 'Biaya Tukang',
        'Biaya Penunjang Pembelajaran', 'Biaya Sewa', 'Biaya Iklan', 'Biaya Jasa',
        'Biaya Renovasi', 'Biaya FotoCopy', 'Biaya Air', 'Biaya Kain/Seragam',
        'Biaya Hadiah', 'Biaya Kegiatan Santri', 'Biaya Cetak', 'Biaya Pulsa/Data',
        'Biaya Lain-lain', 'Setor ke Pondok', 'Konsumsi Rapat', 'Biaya Kebersihan',
    ];
}

/** Saran akun pemasukan dari key tagihan (mis. spp_11 → SPP) */
function akun_dari_tagihan(string $key, array $db = []): string {
    if ($key === '') { return ''; }
    if (preg_match('/^(spp|infaq|laundry)_\d{2}$/', $key, $m)) {
        return ['spp' => 'SPP', 'infaq' => 'Infaq Wajib', 'laundry' => 'Laundry Wajib'][$m[1]];
    }
    $map = [
        'administrasi_awal' => 'Administrasi', 'wakaf' => 'Wakaf', 'daftar_ulang' => 'Daftar Ulang',
        'tunggakan_spp' => 'Tunggakan SPP', 'tunggakan_infaq' => 'Tunggakan Infaq Wajib',
        'tunggakan_laundry' => 'Tunggakan Laundry Wajib', 'tunggakan_daftar_ulang' => 'Tunggakan Daftar Ulang',
        'akhirusanah' => 'Akhirussanah', 'study_tour' => 'Study Tour', 'bimbel' => 'Bimbel', 'rihlah' => 'Rihlah',
    ];
    if (isset($map[$key])) { return $map[$key]; }
    $nama = $key;
    foreach (($db['kolom_custom'] ?? []) as $c) {
        if ($c['key'] === $key) { $nama = (string)$c['nama']; break; }
    }
    foreach (akun_pemasukan_list() as $a) {
        if (strtolower($a) === strtolower($nama)) { return $a; }
    }
    return '';
}

/** Saran akun pemasukan dari nama jenis iuran (mis. "Uang Sekolah" → SPP) */
function akun_dari_jenis_iuran(string $nama): string {
    $n = strtolower(trim($nama));
    if ($n === '') { return ''; }
    foreach (akun_pemasukan_list() as $a) {
        if (strtolower($a) === $n) { return $a; }
    }
    $map = [
        'sekolah' => 'SPP', 'spp' => 'SPP',
        'infaq' => 'Infaq Wajib', 'infak' => 'Infaq Wajib',
        'laundry' => 'Laundry Wajib', 'bimbel' => 'Bimbel',
        'wakaf' => 'Wakaf', 'waqaf' => 'Wakaf',
        'study tour' => 'Study Tour', 'rihlah' => 'Rihlah',
        'akhirusanah' => 'Akhirussanah', 'akhirussanah' => 'Akhirussanah',
        'daftar ulang' => 'Daftar Ulang', 'pendaftaran' => 'Pendaftaran',
        'administrasi' => 'Administrasi', 'zakat' => 'Zakat Mal',
        'tunggakan' => 'Tunggakan SPP', 'makan' => 'Ifthor',
    ];
    foreach ($map as $k => $akun) {
        if (strpos($n, $k) !== false) { return $akun; }
    }
    return '';
}

/** Lengkapi record santri: field wajib + tagihan default + kolom custom */
function santri_bersih(array $s, array $db = []): array {
    $out = [
        'id'     => (string)($s['id'] ?? ''),
        'no'     => (int)($s['no'] ?? 0),
        'nis'    => (string)($s['nis'] ?? ''),
        'nama'   => (string)($s['nama'] ?? ''),
        'kelas'  => (string)($s['kelas'] ?? '-'),
        'no_wa'  => (string)($s['no_wa'] ?? ($s['telepon'] ?? '')),
        'status' => (string)($s['status'] ?? 'aktif'),
        'asrama' => (string)($s['asrama'] ?? '-'),
        'custom' => is_array($s['custom'] ?? null) ? $s['custom'] : [],
        'dibuat' => (string)($s['dibuat'] ?? ''),
    ];
    foreach (tagihan_kolom() as $k) {
        $out[$k['key']] = (float)($s[$k['key']] ?? 0);
    }
    if (!empty($db)) {
        foreach (($db['kolom_custom'] ?? []) as $c) {
            if (!isset($out['custom'][$c['key']])) { $out['custom'][$c['key']] = 0; }
        }
    }
    return $out;
}

/** Total seluruh tagihan seorang santri (kolom bawaan + custom angka) */
function santri_total_tagihan(array $s, array $db): float {
    $total = 0.0;
    foreach (tagihan_kolom() as $k) { $total += (float)($s[$k['key']] ?? 0); }
    foreach (($db['kolom_custom'] ?? []) as $c) {
        $total += (float)($s['custom'][$c['key']] ?? 0);
    }
    return $total;
}

/** Nilai satu jenis tagihan milik santri */
function santri_nilai_tagihan(array $s, string $jenisKey, array $db): float {
    foreach (tagihan_kolom() as $k) {
        if ($k['key'] === $jenisKey) { return (float)($s[$jenisKey] ?? 0); }
    }
    return (float)($s['custom'][$jenisKey] ?? 0);
}

/** Nomor BKM: BKM/TAHUN/0001 — $terbitkan=true menaikkan counter */
function bkm_nomor(array &$db, bool $terbitkan = false): string {
    $y   = date('Y');
    $key = 'bkm_' . $y;
    $n   = (int)($db['counters'][$key] ?? 0) + 1;
    if ($terbitkan) { $db['counters'][$key] = $n; }
    return 'BKM/' . $y . '/' . str_pad((string)$n, 4, '0', STR_PAD_LEFT);
}

/** Nomor BKK (bukti pengeluaran kas): BKK/TAHUN/0001 */
function bkk_nomor(array &$db, bool $terbitkan = false): string {
    $y   = date('Y');
    $key = 'bkk_' . $y;
    $n   = (int)($db['counters'][$key] ?? 0) + 1;
    if ($terbitkan) { $db['counters'][$key] = $n; }
    return 'BKK/' . $y . '/' . str_pad((string)$n, 4, '0', STR_PAD_LEFT);
}

/** Kategori pemasukan untuk jurnal — dibuat bila belum ada */
function kategori_jurnal(array &$db): array {
    foreach ($db['kategori'] as $k) {
        if ($k['nama'] === 'Jurnal Pemasukan' && $k['jenis'] === 'masuk') { return $k; }
    }
    $k = ['id' => uid($db, 'kategori'), 'nama' => 'Jurnal Pemasukan', 'jenis' => 'masuk', 'warna' => '#0ea5e9'];
    $db['kategori'][] = $k;
    return $k;
}

/** Kategori pengeluaran untuk jurnal keluar — dibuat bila belum ada */
function kategori_jurnal_keluar(array &$db): array {
    foreach ($db['kategori'] as $k) {
        if ($k['nama'] === 'Jurnal Pengeluaran' && $k['jenis'] === 'keluar') { return $k; }
    }
    $k = ['id' => uid($db, 'kategori'), 'nama' => 'Jurnal Pengeluaran', 'jenis' => 'keluar', 'warna' => '#f43f5e'];
    $db['kategori'][] = $k;
    return $k;
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
        $s = [
            'id'      => uid($db, 'santri'),
            'no'      => $i + 1,
            'nis'     => '25' . str_pad((string)($i + 1), 4, '0', STR_PAD_LEFT),
            'nama'    => $n,
            'kelas'   => $kelas[$i % count($kelas)],
            'no_wa'   => '08' . substr((string)(1200000000 + $i * 137), 0, 10),
            'telepon' => '08' . substr((string)(1200000000 + $i * 137), 0, 10),
            'asrama'  => $asrama[$i % count($asrama)],
            'status'  => $i < 26 ? 'aktif' : 'cuti',
            'custom'  => [],
            'dibuat'  => date('c', mktime(0, 0, 0, $m + 1, 1, $y)),
        ];
        // tagihan bulanan contoh: 3 bulan terakhir (termasuk bulan ini)
        $bulanIni = (int)date('n');
        for ($b = max(1, $bulanIni - 2); $b <= $bulanIni; $b++) {
            $suf = str_pad((string)$b, 2, '0', STR_PAD_LEFT);
            $s['spp_' . $suf]     = 650000;
            $s['infaq_' . $suf]   = 150000;
            $s['laundry_' . $suf] = 50000;
        }
        $s['administrasi_awal'] = 250000;
        $s['daftar_ulang']      = 300000;
        if ($i % 5 === 0) { $s['tunggakan_spp'] = 650000; }
        if ($i % 7 === 0) { $s['wakaf'] = 100000; $s['study_tour'] = 200000; }
        if ($i % 4 === 0) { $s['bimbel'] = 350000; $s['rihlah'] = 150000; $s['akhirusanah'] = 500000; }
        $db['santri'][] = $s;
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
    // jurnal pemasukan contoh
    $katJurnal  = kategori_jurnal($db);
    $jenisList  = jenis_tagihan_list($db);
    $metodeSeed = ['Cas', 'BRI', 'BSI', 'BPD'];
    $bulanTag   = str_pad((string)max(1, (int)date('n')), 2, '0', STR_PAD_LEFT);
    for ($ji = 0; $ji < 8; $ji++) {
        $s   = $db['santri'][$ji];
        $key = ['spp_' . $bulanTag, 'infaq_' . $bulanTag, 'daftar_ulang', 'bimbel'][$ji % 4];
        $nilai = santri_nilai_tagihan($s, $key, $db);
        if ($nilai <= 0) { $nilai = 50000; }
        $label = $key;
        foreach ($jenisList as $jl) { if ($jl['key'] === $key) { $label = $jl['nama']; break; } }
        $no = bkm_nomor($db, true);
        $tg = date('Y-m-d', mktime(0, 0, 0, $m + 1, min(25, $ji * 3 + 2), $y));
        $j  = [
            'id'             => uid($db, 'jurnal'),
            'tanggal'        => $tg,
            'no_bkm'         => $no,
            'arah'           => 'masuk',
            'santri_id'      => $s['id'],
            'nama'           => $s['nama'],
            'kelas'          => $s['kelas'],
            'jenis_transaksi'=> $metodeSeed[$ji % 4],
            'tagihan_jenis'  => $key,
            'akun'           => akun_dari_tagihan($key, $db),
            'nominal'        => $nilai,
            'keterangan'     => '',
            'dibuat'         => date('c'),
        ];
        $db['jurnal'][] = $j;
        $db['transaksi'][] = [
            'id'          => uid($db, 'transaksi'),
            'tanggal'     => $tg,
            'jenis'       => 'masuk',
            'kategori_id' => $katJurnal['id'],
            'jumlah'      => $nilai,
            'keterangan'  => $no . ' • ' . $s['nama'] . ' • ' . $label,
            'ref'         => $j['id'],
            'ref_tipe'    => 'jurnal',
            'dibuat'      => date('c'),
        ];
    }

    // jurnal kas keluar contoh
    $katJurnalKeluar = kategori_jurnal_keluar($db);
    $keluarSeed = [
        [3, 'Biaya Listrik', 'Dana BOS', 'Cas', 950000, 'Listrik aula & asrama'],
        [8, 'Biaya Konsumsi Santri', 'Dana Lazis', 'BRI', 2500000, 'Konsumsi mingguan dapur'],
        [14, 'Biaya Kebersihan', 'Dana BOS', 'Cas', 350000, 'Perlengkapan kebersihan'],
    ];
    foreach ($keluarSeed as $ks) {
        $no  = bkk_nomor($db, true);
        $tg  = date('Y-m-d', mktime(0, 0, 0, $m + 1, $ks[0], $y));
        $j   = [
            'id'             => uid($db, 'jurnal'),
            'tanggal'        => $tg,
            'no_bkk'         => $no,
            'arah'           => 'keluar',
            'santri_id'      => '',
            'nama'           => '',
            'kelas'          => '-',
            'jenis_transaksi'=> $ks[3],
            'tagihan_jenis'  => '',
            'akun'           => $ks[1],
            'sumber_dana'    => $ks[2],
            'nominal'        => $ks[4],
            'keterangan'     => $ks[5],
            'dibuat'         => date('c'),
        ];
        $db['jurnal'][] = $j;
        $db['transaksi'][] = [
            'id'          => uid($db, 'transaksi'),
            'tanggal'     => $tg,
            'jenis'       => 'keluar',
            'kategori_id' => $katJurnalKeluar['id'],
            'jumlah'      => $ks[4],
            'keterangan'  => $no . ' • ' . $ks[1] . ' ← ' . $ks[2] . ' • ' . $ks[5],
            'ref'         => $j['id'],
            'ref_tipe'    => 'jurnal',
            'dibuat'      => date('c'),
        ];
    }

    usort($db['transaksi'], function ($a, $b) { return strcmp($b['tanggal'], $a['tanggal']); });
    return $db;
}
