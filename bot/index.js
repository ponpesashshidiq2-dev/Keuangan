/**
 * Bot WhatsApp Web utk aplikasi Keuangan Pondok Pesantren.
 *
 * Cara pakai (komputer lokal / VPS):
 *   1. npm install          (di folder bot/)
 *   2. API_URL=https://domainanda/api.php node index.js
 *      atau buat bot/config.json berisi { "api_url": "https://domainanda/api.php" }
 *   3. QR muncul di menu Pengaturan aplikasi (panel Login WhatsApp) — scan dari
 *      HP: WhatsApp -> Perangkat tertaut -> Tautkan perangkat; ATAU isi nomor
 *      telepon di panel -> "Minta Kode Pairing" -> masukkan kode 8 karakter di
 *      HP: WhatsApp -> Perangkat tertaut -> Tautkan dengan nomor telepon.
 *
 * Shared hosting (Node.js tersedia, mis. cPanel "Setup Node.js App"):
 *   - upload folder bot/ ke hosting, jalankan `npm install` lewat terminal hosting
 *   - set environment API_URL & PORT (PORT = port yang diberi host) supaya proses
 *     dianggap aplikasi web hidup; server status merespons GET / dgn JSON status
 *   - opsional: set WA_KEY (atau status_key di config.json) — bila diisi, server
 *     status hanya menerima request dengan header X-WA-Key yang sama (panel
 *     Pengaturan aplikasi mengirimnya lewat server aplikasi)
 *   - kredensial WhatsApp ada di bot/sesi/ — jangan dibagikan; logout otomatis
 *     menghapus folder ini lalu proses memulai ulang (QR baru)
 *
 * Tugas bot:
 *   - mengirim QR / status login ke aplikasi  -> POST api.php?p=wa
 *   - mengirim kwitansi/surat tagihan dari antrean kirim -> GET/POST api.php?p=kwitansi
 */
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const KONFIG = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); }
  catch (e) { return {}; }
})();
const API = String(process.env.API_URL || KONFIG.api_url || '').replace(/\/+$/, '');
const SEKSI = path.join(__dirname, 'sesi');

if (!API) {
  console.error('API belum diatur. Jalankan:  API_URL=https://domain.com/api.php node index.js');
  console.error('atau buat file bot/config.json berisi { "api_url": "https://domain.com/api.php" }');
  process.exit(1);
}

async function api(qs, body) {
  const url = API + '?' + new URLSearchParams(qs);
  const opt = body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : {};
  const r = await fetch(url, opt);
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch (e) { throw new Error('Respons API tidak valid: ' + t.slice(0, 160)); }
  if (!r.ok) throw new Error(j.pesan || j.error || ('HTTP ' + r.status));
  return j;
}

function normHp(hp) {
  let n = String(hp || '').replace(/\D/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  else if (n.startsWith('8')) n = '62' + n;
  return n;
}

let token = '';
let jalanAntre = false;
let loginNo = '';

/* key utk server status (X-WA-Key) — kosong = server status terbuka */
const KEY = String(process.env.WA_KEY || process.env.STATUS_KEY || KONFIG.wa_key || KONFIG.status_key || '');

/* ---------- server status (wajib di shared hosting: host butuh proses listen port) ---------- */
function jalankanStatusServer() {
  const port = Number(process.env.PORT || KONFIG.status_port || 0);
  if (!port) return;
  const srv = http.createServer((req, res) => {
    const kirim = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(obj, null, 2));
    };
    if (KEY) {
      const hk = String(req.headers['x-wa-key'] || '');
      const sama = hk.length === KEY.length && crypto.timingSafeEqual(Buffer.from(hk), Buffer.from(KEY));
      if (!sama) { console.log('[status] akses ditolak — X-WA-Key salah'); return kirim(401, { error: 'key tidak valid' }); }
    }
    return kirim(200, {
      ok: true,
      login: !!loginNo,
      no: loginNo || null,
      antre: jalanAntre,
      api: API,
      waktu: new Date().toISOString(),
    });
  });
  srv.on('error', (e) => console.error('[status] server status tidak bisa berjalan: ' + e.message));
  srv.listen(port, () => console.log('[status] server status berjalan di port ' + port + (KEY ? ' (dikunci X-WA-Key)' : ' (tanpa key)')));
}

/* ---------- kirim kwitansi dari antrean (poll tiap 5 detik) ---------- */
function mulaiAntre(sock) {
  if (jalanAntre) return;
  jalanAntre = true;
  setInterval(async () => {
    if (!sock.user) return;
    if (!token) {                                              // token belum ada / ditolak server — ambil ulang
      try { token = (await api({ p: 'kwitansi', limit: '1' })).token || ''; }
      catch (e) { return; }
      if (!token) return;
    }
    let r;
    try { r = await api({ p: 'kwitansi', act: 'antre', token }); }
    catch (e) {
      if (/token/i.test(String(e.message || ''))) { token = ''; }   // token tidak valid — reset, putaran berikut ambil baru
      return;                                                        // server sibuk/matikan — coba lagi nanti
    }
    for (const it of (r.list || [])) {
      try {
        const jid = normHp(it.no_hp) + '@s.whatsapp.net';
        let pesan = { text: String(it.pesan || '') };
        if (it.gambar_url) {
          const imgUrl = new URL(it.gambar_url, API).href;
          const g = await fetch(imgUrl);
          if (g.ok) {
            const buf = Buffer.from(await g.arrayBuffer());
            if (buf.length > 100) pesan = { image: buf, caption: String(it.pesan || '') };
          }
        }
        await sock.sendMessage(jid, pesan);
        await api({ p: 'kwitansi' }, { act: 'selesai', token, id: it.id });
        console.log('[kirim] ' + it.no_hp + ' (' + (it.tipe || 'kwitansi') + ' ' + (it.ref || it.no_bkm || '-') + ')');
      } catch (e) {
        try { await api({ p: 'kwitansi' }, { act: 'gagal', token, id: it.id, pesan: String(e.message || e).slice(0, 200) }); }
        catch (e2) {}
        console.error('[gagal] ' + it.no_hp + ': ' + e.message);
      }
    }
  }, 5000);
}

/* ---------- pairing code: aplikasi minta nomor -> bot minta kode resmi ke WhatsApp ---------- */
let lastMintakode = 0;
let tungguUlang = 0;
function mulaiPollKode(sock) {
  setInterval(async () => {
    if (sock.user) return;                                  // sudah login — tak perlu kode
    if (Date.now() < tungguUlang) return;                   // jeda anti-spam setelah gagal
    let st;
    try { st = await api({ p: 'wa' }); }
    catch (e) { return; }
    const mk = Number(st.mintakode || 0);
    if (mk > 0 && mk !== lastMintakode && st.no) {
      try {
        console.log('[pair] minta kode pairing untuk ' + st.no + ' …');
        const kode = await sock.requestPairingCode(String(st.no));
        lastMintakode = mk;
        await api({ p: 'wa' }, { act: 'kodepair', kode });
        console.log('[pair] kode pairing: ' + kode + ' (masukkan di HP: WhatsApp > Perangkat tertaut > Tautkan dengan nomor telepon)');
      } catch (e) {
        console.error('[pair] gagal: ' + e.message);
        tungguUlang = Date.now() + 15000;                   // coba lagi 15 detik kemudian
      }
    }
  }, 2500);
}

/* ---------- koneksi WhatsApp ---------- */
async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(SEKSI);
  let version;
  try { version = (await fetchLatestBaileysVersion()).version; } catch (e) {}

  const sock = makeWASocket({
    auth: state,
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Keuangan Pondok', 'Chrome', '1.0.0']
  });

  sock.ev.on('creds.update', saveCreds);
  mulaiPollKode(sock);

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u;

    if (qr) {
      console.log('[qr] QR baru diterima — dikirim ke aplikasi (buka menu Pengaturan)');
      try { await api({ p: 'wa' }, { act: 'qr', qr }); }
      catch (e) { console.error('[qr] gagal kirim ke aplikasi: ' + e.message); }
    }

    if (connection === 'open') {
      const no = (sock.user && sock.user.id) || '';
      loginNo = no;
      console.log('[open] Tersambung sebagai ' + (sock.user && sock.user.name ? sock.user.name : no));
      try { await api({ p: 'wa' }, { act: 'status', status: 'login', no }); } catch (e) {}
      if (!token) {
        try { token = (await api({ p: 'kwitansi', limit: '1' })).token || ''; } catch (e) {}
      }
      mulaiAntre(sock);
    }

    if (connection === 'close') {
      const code = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output
        ? lastDisconnect.error.output.statusCode : 0;
      const keluar = code === DisconnectReason.loggedOut;
      loginNo = '';
      console.log('[close] Terputus (' + code + ')' + (keluar ? ' — sudah keluar' : ' — menyambung ulang…'));
      try { await api({ p: 'wa' }, keluar ? { act: 'logout' } : { act: 'status', status: 'terputus' }); } catch (e) {}
      if (!keluar) { setTimeout(() => { start().catch(e => console.error(e)); }, 3000); }
      else {
        /* logout: hapus kredensial lalu mulai ulang — QR baru muncul tanpa perlu
           restart manual (penting di shared hosting yang tak punya akses terminal) */
        console.log('Sesi keluar — menghapus bot/sesi lalu memulai ulang untuk QR baru…');
        try { fs.rmSync(SEKSI, { recursive: true, force: true }); } catch (e) {}
        setTimeout(() => { start().catch(e => console.error(e)); }, 1500);
      }
    }
  });
}

jalankanStatusServer();
start().catch((e) => { console.error(e); process.exit(1); });
