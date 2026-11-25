# Il mio portafoglio

App personale (PWA) per censire investimenti su più piattaforme, vedere scadenze e proiezioni nette, spostare soldi tra posizioni e ricevere avvisi a regole.

- Funziona offline e si installa dal browser (Chrome: menu ⋮ → Installa app).
- Nessun account, nessun server: i dati restano nel browser del dispositivo. Questo repository contiene solo il codice.
- Backup: dalla sezione Dati, "Scarica file di backup".

Strumento di calcolo personale, non è consulenza finanziaria.

## Automazione (GitHub Actions)

- `offerte.yml` (9:43 e 18:43, ora di Roma): legge le pagine ufficiali, aggiorna `offerte.json` e invia una notifica solo per i tassi lordi sopra 2,5% (titoli di Stato e buoni: sopra 3%) mai segnalati prima, o saliti. Le fonti sono in `automazione/fonti.js`, lo storico delle notifiche in `automazione/stato.json`.
- `promemoria.yml`: spese ogni sera alle 21:17, stipendio il 10 alle 9:41.
- Serve il secret `PUSH_CONFIG`, generato dall'app (Dati → Notifiche). Test: `node automazione/test.js`.
