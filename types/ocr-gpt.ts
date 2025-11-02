export type IdentValue = 'BPS' | 'AA/TR' | 'BUE' | 'BUE/A' | 'BUE/T';

export type PassageiroTipo = 'A' | 'C' | 'I';

export type ExtractedReservation = {
  operadora: string | null;
  data_chegada_bps: string | null;
  data_saida_bps: string | null;
  ident: IdentValue | null;
  voo_chegada: string | null;
  voo_saida: string | null;
  hora_chegada: string | null;
  hora_saida: string | null;
  hotel: string | null;
  id_reserva: string | null;
  nome: string | null;
  tipo: PassageiroTipo | null;
  observacao: string | null;
};

export type ExtractedReservationFieldKey = keyof ExtractedReservation;

export type ExtractedReservationDraft = Record<ExtractedReservationFieldKey, string>;

export type ExtractedReservationErrors = Partial<Record<ExtractedReservationFieldKey, string>>;
