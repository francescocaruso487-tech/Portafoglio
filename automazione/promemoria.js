// Uso: node promemoria.js spese|stipendio|prova
'use strict';
const { leggiConfig, invia } = require('./push');
const TESTI = {
  spese: { title: 'Spese di oggi?', body: 'Registra quello che hai speso (benzina, tabacco, cene, altro).', tag: 'promemoria-spese', url: './#spese' },
  stipendio: { title: 'È arrivato lo stipendio?', body: 'Registralo: lascia 100 € su Intesa e sposta il resto su Trade Republic.', tag: 'promemoria-stipendio', url: './#stipendio' },
  prova: { title: 'Notifiche attive', body: 'Portafoglio ti avvisa da solo: offerte sopra i tuoi tassi, spese e stipendio.', tag: 'prova', url: './#spese' }
};
(async () => {
  const msg = TESTI[process.argv[2]];
  if (!msg) throw new Error('Tipo sconosciuto: ' + process.argv[2]);
  const config = leggiConfig(process.env.PUSH_CONFIG);
  if (!config) {
    console.log('::warning::Secret PUSH_CONFIG non ancora impostato: nessuna notifica inviata.');
    return;
  }
  await invia(config, msg, 12);
  console.log('Inviata: ' + msg.tag);
})().catch(e => { console.error('::error::' + e.message); process.exit(1); });
