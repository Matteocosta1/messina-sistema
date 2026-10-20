// Tipi dei dati, uguali alle tabelle e viste del database (supabase/migrations).

export type Azienda = 'trasporti' | 'corporation';
export type Ruolo = 'direzione' | 'amministrazione' | 'commerciale' | 'bolle' | 'traffico' | 'magazzino'
  | 'autista' | 'vendite' | 'stage' | 'cliente';

export interface Utente { id: string; nome: string; ruolo: Ruolo; azienda: Azienda; cliente_id: string | null }

export interface Cliente { id: string; nome: string; portale_live: boolean; tramite: string | null; azienda_collegata: Azienda | null }
export interface Tariffa { id: string; cliente_id: string; voce: string; unita: string; prezzo: number }

export type StatoBolla = 'Nuova' | 'Confermata' | 'In giro' | 'Consegnata' | 'Non consegnata' | 'Giacenza' | 'Fatturata' | 'Annullata';
export interface Bolla {
  id: string; numero: string | null; cliente_id: string; cliente: string; tipo: string;
  data_consegna: string | null; fascia: string | null; destinatario: string | null; indirizzo: string | null; citta: string | null;
  colli_previsti: number | null; accessori: string[]; dati_mancanti: string[]; stato: StatoBolla;
  operatore: string | null; creata_il: string;
}

export interface Anomalia { sezione: string; cosa: string; chi: string; da: string | null; dove: string; rif: string }

export interface ControlloRiga { bolla_id: string; numero: string | null; cliente: string; tipo: string; attesi: number; letti: number; ultima_lettura: string | null }

export interface Posto { id: string; codice: string; scaffale: number | null; piano: number | null; numero: number | null; zona: string }
export interface Bancale { id: string; codice: string; cliente: string; posto: string | null }
export interface Contenuto { id: string; bancale_id: string; articolo: string; quantita: number; codici: string[]; inserito: string; il: string }

export type StatoPostoMissione = 'Da fare' | 'Fatto' | 'Bloccato' | 'Sbloccato';
export interface PostoMissione {
  id: string; posto: string; stato: StatoPostoMissione; attesi: { articolo: string; codice: string }[];
  letti: string[]; mancanti: { articolo: string; codice: string }[]; extra: string[]; motivo: string | null;
}

export interface Storico { id: number; quando: string; chi_nome: string | null; operazione: string; cosa: string; dove: string | null; come: string | null }

export type StatoFattura = 'Bozza' | 'Da controllare' | 'Pronta' | 'Inviata' | 'Pagata';
export interface Fattura { id: string; cliente: string; periodo: string | null; imponibile: number; stato: StatoFattura; problema: string | null; numero: string | null }

export interface IncassiTrasporti { fatturato_oggi: number; fatturato_mese: number; incassato_mese: number }
export interface IncassiCorporation { incassato_oggi: number; incassato_mese: number }

export interface Device {
  id: string; seriale: string; tipo: string; marca: string | null; modello: string | null; cpu: string | null; gpu: string | null;
  ram: string | null; disco: string | null; schermo: string | null; grado: string | null; difetti: string[];
  lotto: string | null; bancale: string | null; posto: string | null; costo: number | null; prezzo: number | null;
  stato: 'Disponibile' | 'Venduto' | 'Fermo' | 'Reso' | 'In carico'; siti: string[]; giorni: number;
}
export interface LottoConti { id: string; codice: string; acquistato_il: string; pezzi: number; costo: number; venduti: number; incassato: number; recuperato_pct: number }
export type StatoTelefono = 'Reset' | 'Sblocco' | 'Ticket' | 'Chiuso';
export interface Telefono { id: string; imei: string; marca: string | null; modello: string | null; cliente: string | null; ticket: string | null; operatore: string | null; stato: StatoTelefono }

/** Tutto quello che le pagine chiedono al sistema. Due versioni: Supabase (vera) e Prova (dati finti in memoria). */
export interface Api {
  modo: 'supabase' | 'prova';
  login(email: string, password: string): Promise<Utente>;
  logout(): Promise<void>;
  utente(): Promise<Utente | null>;

  anomalie(): Promise<Anomalia[]>;
  incassiTrasporti(): Promise<IncassiTrasporti>;
  bolle(): Promise<Bolla[]>;
  completaBolla(id: string, campo: string, valore: string): Promise<void>;
  confermaBolla(id: string): Promise<void>;
  controllo(): Promise<ControlloRiga[]>;
  posti(): Promise<Posto[]>;
  bancali(): Promise<Bancale[]>;
  contenuto(bancaleId: string): Promise<Contenuto[]>;
  missione(): Promise<PostoMissione[]>;
  lanciaMissione(ambito: string, filtro: string): Promise<void>;
  sbloccaPosto(id: string, motivo: string): Promise<void>;
  storico(): Promise<Storico[]>;
  clienti(): Promise<Cliente[]>;
  tariffe(clienteId: string): Promise<Tariffa[]>;
  fatture(): Promise<Fattura[]>;
  inviaPronte(): Promise<number>;
  segnaPagata(id: string): Promise<void>;

  incassiCorporation(): Promise<IncassiCorporation>;
  device(): Promise<Device[]>;
  lotti(): Promise<LottoConti[]>;
  telefoni(): Promise<Telefono[]>;
}
