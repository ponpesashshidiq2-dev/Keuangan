/**
 * Bot WhatsApp Web utk aplikasi Keuangan Pondok Pesantren.
 *
 * Cara pakai (di komputer yang menjalankan Node.js, bukan di hosting):
 *   1. npm install          (di folder bot/)
 *   2. API_URL=https://domainanda/api.php node index.js
 *      atau buat bot/config.json berisi { "api_url": "https://domainanda/api.php" }
 *   3. QR muncul di menu Pengaturan aplikasi (panel Login WhatsApp) — scan dari
 *      HP: WhatsApp -> Perangkat tertaut -> Tautkan perangkat; ATAU isi nomor
 *      telepon di panel -> "Minta Kode Pairing" -> masukkan kode 8 karakter di
 *      HP: WhatsApp -> Perangkat tertaut -> Tautkan dengan nomor telepon.
 *
 * Tugas bot:
 *   - mengirim QR / status login ke aplikasi  -> POST api.php?p=wa
 *   - mengirim kwitansi dari antrean kirim     -> GET/POST api.php?p=kwitansi
 */
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

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

/* ---------- kirim kwitansi dari antrean (poll tiap 5 detik) ---------- */
function mulaiAntre(sock) {
  if (jalanAntre) return;
  jalanAntre = true;
  setInterval(async () => {
    if (!sock.user) return;
    let r;
    try { r = await api({ p: 'kwitansi', act: 'antre', token }); }
    catch (e) { return; }                                   // server sibuk/matikan — coba lagi nanti
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
        console.log('[kirim] ' + it.no_hp + ' (' + it.no_bkm + ')');
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
      console.log('[close] Terputus (' + code + ')' + (keluar ? ' — sudah keluar' : ' — menyambung ulang…'));
      try { await api({ p: 'wa' }, keluar ? { act: 'logout' } : { act: 'status', status: 'terputus' }); } catch (e) {}
      if (!keluar) { setTimeout(() => { start().catch(e => console.error(e)); }, 3000); }
      else {
        console.log('Hapus folder bot/sesi lalu jalankan lagi untuk QR baru.');
        process.exit(0);
      }
    }
  });
}

start().catch((e) => { console.error(e); process.exit(1); });
