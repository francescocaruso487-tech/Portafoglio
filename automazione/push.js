// Invio Web Push. La configurazione arriva dal secret PUSH_CONFIG, creato dall'app (sezione Dati).
'use strict';
function leggiConfig(testo) {
  if (!testo || !testo.trim()) return null;
  let c;
  try { c = JSON.parse(testo); } catch (e) { throw new Error('PUSH_CONFIG non è un codice valido: ricopialo dall\'app'); }
  if (!c.sub || !c.sub.endpoint || !c.sub.keys || !c.pub || !c.priv) throw new Error('PUSH_CONFIG incompleto: ricopialo dall\'app');
  return c;
}

async function invia(config, msg, ore) {
  const webpush = require('web-push');
  try {
    await webpush.sendNotification(config.sub, JSON.stringify(msg), {
      vapidDetails: { subject: 'https://francescocaruso487-tech.github.io/Portafoglio/', publicKey: config.pub, privateKey: config.priv },
      TTL: ore * 3600, urgency: 'high'
    });
  } catch (e) {
    // mai stampare endpoint o chiavi nei log (il repository è pubblico)
    if (e.statusCode === 404 || e.statusCode === 410) throw new Error('Iscrizione scaduta: nell\'app tocca "Attiva notifiche" e aggiorna il secret PUSH_CONFIG');
    throw new Error('Invio non riuscito' + (e.statusCode ? ' (codice ' + e.statusCode + ')' : ''));
  }
}
// L'app pubblica da sola la sua iscrizione come segnalazione (issue) intitolata "iscrizione".
// Si accetta solo se l'autore e' il proprietario del repository e l'indirizzo e' di un servizio push noto.
const HOST_OK = /(^|\.)(googleapis\.com|mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;
async function iscrizioneAttuale() {
  const repo = process.env.GITHUB_REPOSITORY, tok = process.env.GITHUB_TOKEN;
  if (!repo || !tok) return null;
  try {
    const r = await fetch('https://api.github.com/repos/' + repo + '/issues?state=all&sort=created&direction=desc&per_page=15', {
      headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) { console.log('Iscrizione da GitHub non letta (codice ' + r.status + ')'); return null; }
    const owner = repo.split('/')[0].toLowerCase();
    for (const i of await r.json()) {
      if (i.pull_request || !/^iscrizione/i.test(i.title || '') || String((i.user || {}).login).toLowerCase() !== owner) continue;
      try {
        const m = /\{[\s\S]*\}/.exec(i.body || '');
        const s = JSON.parse(m[0]);
        const u = new URL(s.endpoint);
        if (u.protocol !== 'https:' || !HOST_OK.test(u.hostname) || !s.keys || !s.keys.p256dh || !s.keys.auth) continue;
        console.log('Iscrizione presa da GitHub (' + String(i.created_at).slice(0, 16) + ')');
        return { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
      } catch (e) { /* segnalazione non valida: si prova la precedente */ }
    }
  } catch (e) { console.log('Iscrizione da GitHub non letta'); }
  return null;
}
async function configAggiornata(config) {
  if (!config) return config;
  const s = await iscrizioneAttuale();
  return s ? Object.assign({}, config, { sub: s }) : config;
}
module.exports = { leggiConfig, invia, iscrizioneAttuale, configAggiornata };
