// Controllo offerte: legge le fonti ufficiali, aggiorna offerte.json e invia le notifiche.
'use strict';
const fs = require('fs');
const path = require('path');
const { REGOLE, SCOPERTA, LORDO, PREMIO, iso, n } = require('./fonti');
const L = require('./logica');
const { leggiConfig, invia } = require('./push');

const F_CAT = path.join(__dirname, '..', 'offerte.json');
const F_STATO = path.join(__dirname, 'stato.json');
const UA = 'Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36';
const pulisci = s => s.replace(/[\s ​‍]+/g, ' ');

const turni = new Map();
function ritmo(host, extra) {
  const prima = turni.get(host) || Promise.resolve();
  const ora = prima.then(() => new Promise(ok => setTimeout(ok, extra + 4000)));
  turni.set(host, ora);
  return ora;
}

function lettore(browser) {
  const cache = new Map();
  return (url, grezza) => {
    if (!cache.has(url)) cache.set(url, (async () => {
      for (let giro = 0; giro < 3; giro++) {
        // alcuni siti rifiutano richieste ravvicinate: si distanziano e si ritenta con calma
        await ritmo(new URL(url).host, giro * 20000);
        try {
          if (grezza) {
            const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
            if (r.ok) return { testo: await r.text(), link: [] };
          } else {
            const ctx = await browser.newContext({ userAgent: UA, locale: 'it-IT' });
            try {
              const p = await ctx.newPage();
              const r = await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
              if (r && r.status() < 400) {
                await p.waitForTimeout(5000);
                const testo = await p.evaluate(() => (document.body ? document.body.innerText : ''));
                const link = await p.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => ({ t: a.innerText.trim(), u: a.href })));
                return { testo: pulisci(testo), link };
              }
            } finally { await ctx.close(); }
          }
        } catch (e) { /* secondo tentativo */ }
      }
      return null;
    })());
    return cache.get(url);
  };
}

// Buoni postali mai visti prima
async function nuoviBuoni(leggi, catalogo, stato, oggi) {
  const trovati = new Set();
  for (const u of SCOPERTA.poste) {
    const pg = await leggi(u);
    if (!pg) continue;
    for (const a of pg.link) {
      const m = /^https:\/\/buonielibretti\.poste\.it\/buoni-fruttiferi-postali\/(buono-[a-z0-9-]+)\/?(?:[?#].*)?$/.exec(a.u);
      if (m) trovati.add(m[1]);
    }
  }
  for (const slug of trovati) {
    if (SCOPERTA.posteNoti.includes(slug) || stato.visti[slug]) continue;
    const url = SCOPERTA.poste[0] + '/' + slug;
    const pg = await leggi(url);
    if (!pg) continue; // si ritenta al prossimo giro
    const m = PREMIO.exec(pg.testo) || LORDO.exec(pg.testo);
    const dur = /Durata:? (\d+) (anni|mesi)/i.exec(pg.testo);
    const fine = /entro il (\d{1,2} [a-z]+ \d{4})/i.exec(pg.testo);
    const nome = slug.replace(/-/g, ' ').replace(/^b/, 'B');
    if (m && n(m[1]) > 0 && n(m[1]) <= 8) {
      const o = { id: 'bfp-nuovo-' + slug, nome, emittente: 'Poste Italiane (CDP)', cat: 'stato', tasso: n(m[1]), tassa: 12.5,
        mesi: dur ? +dur[1] * (dur[2].toLowerCase() === 'anni' ? 12 : 1) : 0, min: 50, max: 0, rischio: 1,
        garanzia: 'Garantito dallo Stato (emesso da CDP)', bollo: true, req: 'Nuovo buono letto in automatico: controlla requisiti e durata sulla pagina ufficiale',
        fonte: url, ok: true, verificato: oggi };
      if (fine && iso(fine[1])) o.promoFine = iso(fine[1]);
      if (!L.scaduta(o, oggi)) catalogo.offerte.push(o);
    } else {
      L.aggiungiControllo(stato.controlli, { chiave: 'poste:' + slug, titolo: 'Nuova pagina Poste: ' + nome + ' (tasso non letto)', url }, oggi);
    }
    stato.visti[slug] = oggi;
  }
}

// Annunci del Tesoro sui titoli per i risparmiatori
async function annunciTesoro(leggi, stato, oggi) {
  const avvisi = [];
  const pg = await leggi(SCOPERTA.tesoro);
  if (!pg) return avvisi;
  for (const a of pg.link) {
    if (!/\/news_debito_pubblico\/\d{4}\//i.test(a.u) || !/BTP ?(Valore|Italia S|Futura|Pi[uù])|risparmiator|retail/i.test(a.t)) continue;
    if (stato.annunci[a.u]) continue;
    let tasso = null;
    const pdf = /\.pdf($|\?)/i.test(a.u);
    const art = pdf ? null : await leggi(a.u);
    if (!pdf && !art) continue; // si ritenta al prossimo giro
    if (art && /tass[oi][^.]{0,60}minim/i.test(art.testo)) {
      const v = [...art.testo.matchAll(/(\d(?:,\d+)?) ?%/g)].map(m => n(m[1])).filter(x => x <= 8);
      if (v.length) tasso = Math.max(...v);
    }
    L.aggiungiControllo(stato.controlli, { chiave: 'tesoro:' + a.u, titolo: a.t, url: a.u }, oggi);
    if (tasso !== null && tasso > L.SOGLIE.stato) {
      avvisi.push({ url: a.u, msg: { title: `Titoli di Stato: tassi minimi fino a ${L.pct(tasso)}`, body: a.t + ' · verifica le condizioni ufficiali', tag: 'tesoro-' + a.u.slice(-40), url: './#offerte' } });
    } else stato.annunci[a.u] = oggi;
  }
  return avvisi;
}

async function sentinelle(leggi, stato, oggi) {
  const avvisi = [];
  stato.sentinelle = stato.sentinelle || {};
  for (const s of SCOPERTA.sentinelle || []) {
    const pg = await leggi(s.url);
    if (!pg) { console.log(`sentinella ${s.id}: PAGINA NON LETTA`); continue; }
    const set = [...new Set([...pg.testo.matchAll(/\d{1,2},\d{1,2} ?%/g)].map(m => m[0].replace(' ', '')))].sort();
    if (!set.length) { console.log(`sentinella ${s.id}: nessun tasso in pagina`); continue; }
    const firma = set.join(' ');
    const prima = stato.sentinelle[s.id];
    console.log(`sentinella ${s.id}: ${firma}`);
    if (!prima) { stato.sentinelle[s.id] = { firma, data: oggi }; continue; }
    if (prima.firma === firma) continue;
    L.aggiungiControllo(stato.controlli, { chiave: 'sent:' + s.id + ':' + firma, titolo: s.nome + ': i tassi in pagina sono cambiati (' + set.slice(0, 6).join(', ') + ')', url: s.url }, oggi);
    avvisi.push({ id: s.id, firma, msg: { title: s.nome + ': tassi cambiati in pagina', body: 'Ora: ' + set.slice(0, 6).join(', ') + ' · verifica sul sito', tag: 'sent-' + s.id, url: './#offerte' } });
  }
  return avvisi;
}

(async () => {
  const oggi = L.dataRoma();
  const catalogo = JSON.parse(fs.readFileSync(F_CAT, 'utf8'));
  const stato = JSON.parse(fs.readFileSync(F_STATO, 'utf8'));
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const leggi = lettore(browser);

  const letture = {}, nonLette = [];
  for (const r of REGOLE) {
    const pg = await leggi(r.url, r.grezza);
    const v = pg ? r.leggi(pg.testo) : null;
    letture[r.id] = v;
    if (!v) nonLette.push(r.id);
    console.log(`${r.id}: ${v ? v.tasso + (v.promoFine ? ' fino al ' + v.promoFine : '') + (v.dataTasso ? ' (' + v.dataTasso + ')' : '') : pg ? 'TESTO NON RICONOSCIUTO' : 'PAGINA NON LETTA'}`);
  }
  L.applica(catalogo, REGOLE, letture, oggi, stato.controlli);
  await nuoviBuoni(leggi, catalogo, stato, oggi);
  const avvisi = await annunciTesoro(leggi, stato, oggi);
  const sent = await sentinelle(leggi, stato, oggi);
  await browser.close();

  const limite = L.dataRoma(new Date(Date.now() - 30 * 864e5));
  stato.controlli = stato.controlli.filter(x => x.data >= limite).slice(-12);
  catalogo.aggiornato = oggi;
  catalogo.note = 'Aggiornato in automatico dalle fonti ufficiali leggibili. Le voci senza data di verifica vanno controllate sul sito dell\'emittente.';
  catalogo.controllo = { quando: new Date().toISOString(), lette: REGOLE.length - nonLette.length, totali: REGOLE.length, nonLette };
  catalogo.soglie = L.SOGLIE;
  catalogo.daControllare = stato.controlli.slice().reverse();

  // Notifiche: si segna come inviata solo quella partita davvero
  const nuove = L.daNotificare(catalogo, stato.notificate, oggi);
  let errore = null, config = null;
  try { config = leggiConfig(process.env.PUSH_CONFIG); } catch (e) { errore = e.message; }
  for (const o of nuove) console.log(`DA NOTIFICARE: ${o.id} ${o.tasso}`);
  for (const a of avvisi) console.log(`DA NOTIFICARE: ${a.msg.title}`);
  for (const a of sent) console.log(`DA NOTIFICARE: ${a.msg.title}`);
  if (!config && !errore) console.log('::warning::Secret PUSH_CONFIG non impostato: le notifiche restano in attesa.');
  if (config) {
    try {
      for (const o of nuove) { await invia(config, L.messaggio(o, stato.notificate[o.id]), 72); stato.notificate[o.id] = o.tasso; }
      for (const a of avvisi) { await invia(config, a.msg, 72); stato.annunci[a.url] = oggi; }
      for (const a of sent) { await invia(config, a.msg, 72); stato.sentinelle[a.id] = { firma: a.firma, data: oggi }; }
    } catch (e) { errore = e.message; }
  }

  const righe = '[\n' + catalogo.offerte.map(o => JSON.stringify(o)).join(',\n') + '\n ]';
  const testo = JSON.stringify(Object.assign({}, catalogo, { offerte: '@@' }), null, 1).replace('"@@"', () => righe);
  JSON.parse(testo);
  fs.writeFileSync(F_CAT, testo + '\n');
  fs.writeFileSync(F_STATO, JSON.stringify(stato, null, 1) + '\n');

  console.log(`Fonti lette: ${catalogo.controllo.lette}/${REGOLE.length}`);
  if (errore) throw new Error(errore);
  if (nonLette.length > REGOLE.length / 2) throw new Error('Più di metà delle fonti non si leggono: controllare il workflow');
})().catch(e => { console.error('::error::' + e.message); process.exit(1); });
