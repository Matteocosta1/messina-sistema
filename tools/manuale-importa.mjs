// Trasforma le bozze di docs/manuale-messina.md in righe della tabella «manuale» (una volta sola, per partire).
// Uso: node tools/manuale-importa.mjs docs/manuale-messina.md trasporti > manuale-bozze.sql
// Lo SQL si esegue dal pannello SQL di Supabase (come sistema): le schede entrano Bozza o Da chiarire,
// senza «Approvata da». Dopo l'importazione la fonte unica è Supabase; il file .md resta solo come archivio.
import { readFileSync } from 'node:fs';

const [file, azienda] = process.argv.slice(2);
if (!file || !['trasporti', 'corporation'].includes(azienda)) {
  console.error('Uso: node tools/manuale-importa.mjs <file.md> <trasporti|corporation>'); process.exit(1);
}
const CAPITOLI = ['Azienda', 'Clienti', 'Procedure', 'Regole', 'Tariffe', 'Glossario'];
const q = (v) => (v == null ? 'null' : "'" + v.replace(/'/g, "''") + "'");
const vuoto = (v) => (!v || v.trim() === '—' || v.trim() === '' ? null : v.trim());

const righe = []; let capitolo = null, s = null;
const chiudi = () => { if (s) righe.push(s); s = null; };
for (const l of readFileSync(file, 'utf8').split('\n')) {
  const h2 = l.match(/^## (.+)$/);
  if (h2) { chiudi(); capitolo = CAPITOLI.includes(h2[1].trim()) ? h2[1].trim() : null; continue; }
  const h3 = l.match(/^### ([A-Z]\d+) · (.+)$/);
  if (h3 && capitolo) { chiudi(); s = { codice: h3[1], titolo: h3[2].trim(), capitolo }; continue; }
  const c = s && l.match(/^- \*\*(Tipo|Reparto|Testo|Esempio|Fonte|Stato):\*\* ?(.*)$/);
  if (c) s[c[1].toLowerCase()] = c[2];
}
chiudi();

const sql = righe.map((r) => {
  if (!r.tipo || !r.reparto || !r.testo || !r.fonte || !r.stato) throw new Error(`Scheda ${r.codice}: manca un campo`);
  if (r.codice[0] !== r.capitolo[0]) throw new Error(`Scheda ${r.codice}: la lettera non è del capitolo ${r.capitolo}`);
  const [stato, ...domanda] = r.stato.split(' — ');
  if (!['Bozza', 'Da chiarire'].includes(stato.trim())) throw new Error(`Scheda ${r.codice}: stato «${stato}» non ammesso in importazione`);
  const dc = stato.trim() === 'Da chiarire' ? domanda.join(' — ').trim() : null;
  if (stato.trim() === 'Da chiarire' && !dc) throw new Error(`Scheda ${r.codice}: Da chiarire senza domanda`);
  return `  (${q(azienda)}, ${q(r.codice)}, ${q(r.capitolo)}, ${q(r.tipo.trim())}, ${q(r.reparto.trim())}, ${q(r.titolo)}, ` +
         `${q(r.testo.trim())}, ${q(vuoto(r.esempio))}, ${q(r.fonte.trim())}, ${q(stato.trim())}, ${q(dc)})`;
});
process.stdout.write(`-- ${righe.length} schede da ${file}\nbegin;\n` +
  `insert into public.manuale (azienda, codice, capitolo, tipo, reparto, titolo, testo, esempio, fonte, stato, da_chiarire) values\n` +
  sql.join(',\n') + ';\ncommit;\n');
console.error(`${righe.length} schede pronte`);
