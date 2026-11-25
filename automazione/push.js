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
module.exports = { leggiConfig, invia };
