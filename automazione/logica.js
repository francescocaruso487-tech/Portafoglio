// Calcoli senza rete: applicazione dei tassi letti, soglie, notifiche senza ripetizioni.
'use strict';
const SOGLIE = { stato: 3.0, altri: 2.5 }; // lordo annuo: si avvisa solo SOPRA questi valori
const SALTO_SOSPETTO = 1.5;

const soglia = o => (o.cat === 'stato' ? SOGLIE.stato : SOGLIE.altri);
const scaduta = (o, oggi) => !!o.promoFine && o.promoFine < oggi;
const pct = x => x.toFixed(2).replace('.', ',') + '%';
const gma = d => d.split('-').reverse().join('/');

function aggiungiControllo(lista, voce, oggi) {
  if (!lista.some(x => x.chiave === voce.chiave)) lista.push(Object.assign({ data: oggi }, voce));
}

// letture: { idRegola: risultato | null }
function applica(catalogo, regole, letture, oggi, controlli) {
  for (const r of regole) {
    const v = letture[r.id];
    if (!v) continue;
    let o = catalogo.offerte.find(x => x.id === r.id);
    if (!(v.tasso > 0 && v.tasso <= 8)) continue;
    if (v.promoFine && v.promoFine < oggi) continue;
    if (!o) {
      if (!r.nuova) continue;
      o = Object.assign({ id: r.id, tasso: v.tasso, req: '' }, r.nuova);
      catalogo.offerte.push(o);
    } else {
      // un'asta più vecchia del dato già in catalogo non lo sovrascrive
      if (v.dataTasso && o.dataTasso && v.dataTasso < o.dataTasso) continue;
      if (Math.abs(v.tasso - o.tasso) > SALTO_SOSPETTO) {
        aggiungiControllo(controlli, { chiave: `salto:${r.id}:${v.tasso}`, titolo: `${o.emittente}, ${o.nome}: letto ${pct(v.tasso)} contro ${pct(o.tasso)}, da controllare`, url: r.url }, oggi);
        continue;
      }
      if (v.tasso !== o.tasso) o.prima = o.tasso;
      o.tasso = v.tasso;
    }
    if (v.promoFine) o.promoFine = v.promoFine;
    if (v.dataTasso) o.dataTasso = v.dataTasso;
    if (v.req || r.req) o.req = v.req || r.req;
    if (r.nome) o.nome = r.nome(v);
    o.fonte = r.url;
    o.ok = true;
    o.verificato = oggi;
  }
  catalogo.offerte = catalogo.offerte.filter(o => !scaduta(o, oggi));
  return catalogo;
}

function daNotificare(catalogo, notificate, oggi) {
  return catalogo.offerte.filter(o => !o.non_per_me && !scaduta(o, oggi) && o.tasso > soglia(o) && (notificate[o.id] === undefined || o.tasso > notificate[o.id]));
}

function messaggio(o, prima) {
  const parti = [o.emittente, o.mesi ? `vincolo/durata ${o.mesi} mesi` : 'senza vincolo'];
  if (prima !== undefined) parti.push(`era ${pct(prima)}`);
  if (o.promoFine) parti.push(`DATA LIMITE/fine promo ${gma(o.promoFine)}`);
  if (o.ok === false) parti.push('dato non confermato');
  parti.push('verifica le condizioni ufficiali');
  return { title: `${pct(o.tasso)} lordo · ${o.nome}`, body: parti.join(' · '), tag: `offerta-${o.id}`, url: `./#offerta=${o.id}` };
}

const dataRoma = (d = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(d);

module.exports = { SOGLIE, soglia, scaduta, applica, daNotificare, messaggio, aggiungiControllo, dataRoma, pct };
