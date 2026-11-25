// Pagine ufficiali lette in automatico. Ogni regola estrae un tasso dal testo visibile della pagina.
// Se il testo non corrisponde, l'offerta resta com'era: nessun dato viene inventato.
'use strict';
const POSTE = 'https://buonielibretti.poste.it/buoni-fruttiferi-postali';
const DT = 'https://www.dt.mef.gov.it/it/debito_pubblico/';
const AIDEXA = 'https://www.aidexa.it/';
const KL = 'https://www.klarna.com/it/conti-di-risparmio/';
const ECB = 'https://data-api.ecb.europa.eu/service/data/EST/B.EU000A2X2A25.WT?lastNObservations=1&format=csvdata';

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const n = s => parseFloat(String(s).replace(',', '.'));
const p2 = x => String(x).padStart(2, '0');
// "29 dicembre 2026" oppure "09/12/2026" -> "2026-12-29"
function iso(s) {
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${p2(m[2])}-${p2(m[1])}`;
  m = /^(\d{1,2})\s+([a-zà]+)\s+(\d{4})$/i.exec(s);
  const k = m ? MESI.indexOf(m[2].toLowerCase()) : -1;
  return k < 0 ? null : `${m[3]}-${p2(k + 1)}-${p2(m[1])}`;
}
// regola semplice: primo gruppo = tasso, scadenza facoltativa
const re = (tasso, scad) => t => {
  const m = tasso.exec(t);
  if (!m) return null;
  const r = { tasso: n(m[1]) };
  if (scad) { const s = scad.exec(t); if (s) { const d = iso(s[1]); if (d) r.promoFine = d; } }
  return r;
};
const klarnaVinc = mesi => t => {
  const b = /Conto deposito vincolato Tasso di interesse (.{0,400})/i.exec(t);
  const m = b && new RegExp(`(?:^| )${mesi} mesi (\\d+,\\d+)%`).exec(b[1]);
  return m ? { tasso: n(m[1]) } : null;
};
const ifis12 = t => {
  if (!/Durata del vincolo 60 mesi 48 mesi 36 mesi 24 mesi 18 mesi 12 mesi/i.test(t)) return null;
  const m = /Vincolato posticipato((?: \d+,\d+%){8})/i.exec(t);
  return m ? { tasso: n(m[1].trim().split(' ')[5]) } : null;
};
const asta = tipo => t => {
  const m = new RegExp(`${tipo} \\d\\d/\\d\\d/\\d{4} Asta del (\\d\\d/\\d\\d/\\d{4}) Emesso [\\d.]+ Richiesto [\\d.]+ Rendimento (\\d+,\\d+)%`).exec(t);
  if (!m) return null;
  return { tasso: Math.round(n(m[2]) * 100) / 100, dataTasso: iso(m[1]) };
};
const estr = t => {
  const m = /,(\d{4}-\d\d-\d\d),(\d+\.\d+),/.exec(t);
  return m ? { tasso: Math.round(n(m[2]) * 100) / 100, dataTasso: m[1] } : null;
};

const LORDO = /Rendimento annuo lordo(?: a scadenza)? (\d+,\d+) ?%/i;
const PREMIO = /rendimento annuo lordo a scadenza con premio: ?(\d+,\d+) ?%/i;

const banca = (nome, emittente, cat, mesi, extra) => Object.assign(
  { nome, emittente, cat, tassa: 26, mesi, min: 0, max: 0, rischio: 1, garanzia: 'FITD fino a 100.000 €', bollo: true }, extra);

const REGOLE = [
  { id: 'bfp-premium4', url: POSTE + '/buono-premium-4-anni', leggi: re(LORDO, /entro il (\d{1,2} [a-z]+ \d{4}) \(salvo/i) },
  { id: 'bfp-6m', url: POSTE + '/buono-per-un-buono-6-mesi', leggi: re(LORDO) },
  { id: 'bfp-4plus', url: POSTE + '/buono-4-anni-plus', leggi: re(LORDO) },
  { id: 'bfp-cedola8', url: POSTE + '/buono-a-cedola-8-anni', leggi: re(LORDO) },
  { id: 'bfp-ord', url: POSTE + '/buono-ordinario', leggi: re(LORDO) },
  { id: 'bfp-3x4', url: POSTE + '/buono-3x4-con-premio', leggi: re(PREMIO) },
  { id: 'bfp-rinnova', url: POSTE + '/buono-rinnova-3x4-con-premio', leggi: re(PREMIO) },
  { id: 'bfp-eredita', url: POSTE + '/buono-soluzione-eredita', leggi: re(LORDO) },
  { id: 'bfp-minori', url: POSTE + '/buono-minori', leggi: re(LORDO) },

  { id: 'bot-12m', url: DT, leggi: asta('BOT 12 MESI'), nome: r => `BOT a 12 mesi (asta del ${r.dataTasso.split('-').reverse().join('/')})` },
  { id: 'bot-6m', url: DT, leggi: asta('BOT 6 MESI'),
    nuova: { nome: 'BOT a 6 mesi', emittente: 'Stato italiano', cat: 'stato', tassa: 12.5, mesi: 6, min: 1000, max: 0, rischio: 1, garanzia: 'Titolo di Stato italiano', bollo: true, req: 'Rendimento dell\'ultima asta; si compra dalla banca o dal broker' },
    nome: r => `BOT a 6 mesi (asta del ${r.dataTasso.split('-').reverse().join('/')})` },
  { id: 'btp-st-ott28', url: DT, leggi: asta('BTP ST 2 ANNI'), req: 'Rendimento dell\'ultima asta del Tesoro. Si compra sul mercato, il prezzo (e quindi il rendimento) varia' },
  { id: 'xeon', url: ECB, grezza: true, leggi: estr, req: 'Il numero è il tasso overnight in euro (€STR, fonte BCE), non un rendimento garantito del fondo. Costo del fondo circa 0,10% annuo' },

  { id: 'ing-arancio', url: 'https://www.ing.it/conto-corrente-arancio/promo-4-per-12.html',
    leggi: re(/Per te: (\d+(?:,\d+)?)% annuo lordo per 12 mesi/i, /4% per 12 mesi con Conto Corrente Arancio.{0,120}?valida fino al (\d\d\/\d\d\/\d{4})/i) },
  { id: 'klarna-18', url: KL, leggi: klarnaVinc(18) },
  { id: 'klarna-24', url: KL, leggi: klarnaVinc(24) },
  { id: 'klarna-libero', url: 'https://www.klarna.com/it/deposito-flessibile/', leggi: re(/Ottieni il (\d+,\d+)% ?¹? di interessi sui tuoi risparmi/i) },
  { id: 'ca-auto-promo', url: 'https://www.ca-autobank.it/conto-remunerato/',
    leggi: re(/(\d+,\d+)% ?1? DI REMUNERAZIONE FINO AL \d\d\/\d\d\/\d{4}/i, /DI REMUNERAZIONE FINO AL (\d\d\/\d\d\/\d{4})/i) },
  { id: 'ca-auto-12', url: 'https://www.ca-autobank.it/conto-deposito/', leggi: re(/ 12 MESI (\d+,\d+)% \d+,\d+%/) },
  { id: 'tr-nuovi4', url: 'https://traderepublic.com/it-it', leggi: t => {
    const m = /Attiva il (\d+(?:,\d+)?) ?% di interessi sulla liquidità per i nuovi clienti/i.exec(t);
    if (!m) return null;
    const d = /nuovi clienti.{0,160}?Fino al (\d\d)\.(\d\d)\.(\d{4})/i.exec(t);
    return Object.assign({ tasso: n(m[1]) }, d ? { promoFine: `${d[3]}-${d[2]}-${d[1]}` } : {});
  } },
  { id: 'ifis-rendimax', url: 'https://www.illimity.bancaifis.it/conto-deposito-rendimax/', leggi: ifis12 },
  { id: 'sistema-12', url: 'https://www.bancasistema.it/conto-deposito', leggi: re(/Vincolato Ottieni il (\d+,\d+)% annuo lordo \*? ?sulla scadenza a 12 mesi/i) },
  { id: 'solution-yes12', url: 'https://contoyes.it/', leggi: re(/Rendimento fino al (\d+,\d+)%/i) },
  { id: 'tyche-12', url: 'https://www.contote.it/', leggi: re(/(\d+,\d+)% per 12 mesi/i) },
  { id: 'bunq-nuova', url: 'https://www.bunq.com/it-it/savings', leggi: re(/interessi fino al (\d+,\d+)%/i) },
  { id: 'aidexa-cedola', url: AIDEXA + 'conto-deposito-cedola', leggi: re(/ 12 mesi Tasso annuo lordo (\d+(?:,\d+)?)%/i),
    req: 'Interessi mensili, nessuno svincolo' },
  { id: 'aidexa-pronto', url: AIDEXA + 'depositi', leggi: re(/ 12 mesi Tasso annuo lordo (\d+(?:,\d+)?)%/i),
    req: 'Si apre online; svincolo con 32 giorni di preavviso, senza interessi sulle somme ritirate' },
  { id: 'aidexa-libero', url: AIDEXA + 'conto-deposito-libero',
    leggi: t => { const m = /tasso annuo lordo del (\d+,\d+)% fino al (\d{1,2} [a-z]+ \d{4})/i.exec(t); return m ? { tasso: n(m[1]), promoFine: iso(m[2]) } : null; },
    nuova: banca('X Risparmio Libero', 'Banca AideXa', 'libero', 0, { req: 'Tasso promozionale solo per nuovi clienti di X Risparmio Libero; prelievi liberi' }) },
  { id: 'progetto-key', url: 'https://www.bancaprogetto.it/it', leggi: re(/12 mesi al (\d+(?:,\d+)?)% non svincolabile/i),
    req: 'Vincolo non svincolabile. Banca uscita dall\'amministrazione straordinaria ad aprile 2026 (Banca d\'Italia)' },
  { id: 'progetto-conto', url: 'https://www.bancaprogetto.it/it',
    leggi: t => { const m = /tasso lordo al (\d+(?:,\d+)?)% fino al (\d{1,2} [a-z]+ \d{4}), poi al (\d+(?:,\d+)?)% dal .{0,30}?al (\d{1,2} [a-z]+ \d{4})/i.exec(t);
      return m ? { tasso: n(m[3]), primo: m[1], promoFine: iso(m[4]), req: `${m[1]}% fino al ${m[2]}, poi ${m[3]}% fino al ${m[4]}. Banca uscita dall\'amministrazione straordinaria ad aprile 2026 (Banca d\'Italia)` } : null; },
    nuova: banca('Conto Progetto (deposito libero in promo)', 'Banca Progetto', 'libero', 0, {}),
    nome: r => `Conto Progetto libero (${r.primo}% poi ${String(r.tasso).replace('.', ',')}%)` }
];
// Pagine dove compaiono i prodotti nuovi
const SCOPERTA = {
  poste: [POSTE, 'https://buonielibretti.poste.it/'],
  posteNoti: ['buono-premium-4-anni', 'buono-per-un-buono-6-mesi', 'buono-a-cedola-8-anni', 'buono-4-anni-risparmiosemplice', 'buono-4-anni-plus', 'buono-ordinario',
    'buono-3x4-con-premio', 'buono-rinnova-3x4-con-premio', 'buono-soluzione-eredita', 'buono-minori'],
  tesoro: DT,
  // pagine senza regola precisa: si guardano i tassi (%) scritti in pagina e si avvisa quando l'insieme cambia
  sentinelle: [
    { id: 'bbva', nome: 'BBVA', url: 'https://www.bbva.it/' },
    { id: 'guber', nome: 'Banca Guber', url: 'https://www.bancaguber.it/' },
    { id: 'revolut', nome: 'Revolut', url: 'https://www.revolut.com/it-IT/savings/' },
    { id: 'trade-republic', nome: 'Trade Republic', url: 'https://traderepublic.com/it-it/interessi' },
    { id: 'confronto-depositi', nome: 'Confronto conti deposito (Facile.it)', url: 'https://www.facile.it/conti-deposito.html' }
  ]
};
module.exports = { REGOLE, SCOPERTA, LORDO, PREMIO, iso, n };
