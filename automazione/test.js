// Test senza rete: node automazione/test.js
'use strict';
const assert = require('assert');
const { REGOLE, iso } = require('./fonti');
const L = require('./logica');
const R = id => REGOLE.find(r => r.id === id);
const leggi = (id, t) => R(id).leggi(t);

assert.strictEqual(iso('29 dicembre 2026'), '2026-12-29');
assert.deepStrictEqual(leggi('bfp-premium4', 'Rendimento annuo lordo a scadenza 4,00% ... entro il 29 dicembre 2026 (salvo chiusura anticipata)'), { tasso: 4, promoFine: '2026-12-29' });
assert.strictEqual(leggi('bfp-3x4', 'Il rendimento annuo lordo a scadenza con premio: 2,99% Rendimento annuo lordo a scadenza senza premio 2,50%').tasso, 2.99);
assert.strictEqual(leggi('klarna-18', 'Conto deposito vincolato Tasso di interesse 3 mesi 3,30% all\'anno 18 mesi 3,70% all\'anno').tasso, 3.7);
assert.strictEqual(leggi('ifis-rendimax', 'Durata del vincolo 60 mesi 48 mesi 36 mesi 24 mesi 18 mesi 12 mesi 9 mesi 6 mesi Vincolato posticipato 3,75% 3,75% 3,50% 3,50% 3,25% 4,00% 3,00% 2,75%').tasso, 4);
assert.deepStrictEqual(leggi('bot-12m', 'BOT 12 MESI R 14/12/2026 Asta del 28/10/2026 Emesso 2.563 Richiesto 4.062 Rendimento 2,567% BOT 12 MESI 12/11/2027 Asta del 11/11/2026 Emesso 8.549 Richiesto 12.479 Rendimento 3,207%'), { tasso: 3.21, dataTasso: '2026-11-11' });
assert.strictEqual(leggi('bfp-premium4', 'pagina cambiata'), null);

const base = { offerte: [{ id: 'a', cat: 'deposito', tasso: 3, nome: 'A', emittente: 'X', mesi: 12 }, { id: 'b', cat: 'stato', tasso: 3, nome: 'B', emittente: 'Y', mesi: 12 }] };
const c = JSON.parse(JSON.stringify(base)); const note = { a: 3 };
assert.deepStrictEqual(L.daNotificare(c, note, '2026-11-25'), [], 'già avvisata o non sopra soglia');
L.applica(c, [{ id: 'a', url: 'u' }], { a: { tasso: 3.5 } }, '2026-11-25', []);
assert.deepStrictEqual(L.daNotificare(c, note, '2026-11-25').map(o => o.id), ['a'], 'tasso salito');
note.a = 3.5;
L.applica(c, [{ id: 'a', url: 'u' }], { a: { tasso: 3.2 } }, '2026-11-25', []);
L.applica(c, [{ id: 'a', url: 'u' }], { a: { tasso: 3.5 } }, '2026-11-26', []);
assert.deepStrictEqual(L.daNotificare(c, note, '2026-11-26'), [], 'mai ripetuta');
const ctl = [];
L.applica(c, [{ id: 'a', url: 'u' }], { a: { tasso: 7 } }, '2026-11-26', ctl);
assert.strictEqual(c.offerte[0].tasso, 3.5); assert.strictEqual(ctl.length, 1);
c.offerte[0].promoFine = '2026-11-01';
L.applica(c, [], {}, '2026-11-26', []);
assert.deepStrictEqual(c.offerte.map(o => o.id), ['b'], 'le scadute escono');
console.log('Test superati');
