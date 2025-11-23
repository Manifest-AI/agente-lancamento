export type ExtractedPassenger = {
  nome_completo?: string | null;
  primeiro_ultimo_nome?: string | null;
  tipo?: 'ADT' | 'CHD' | 'INF' | null;
  data_nascimento?: string | null;
};

export type ExtractedReservation = {
  operadora: string | null;
  id_externo: string | null;
  data_chegada_bps: string | null;
  data_saida_bps: string | null;
  voo_chegada_codigo: string | null;
  voo_saida_codigo: string | null;
  hora_chegada_bps: string | null;
  hora_saida_bps: string | null;
  hotel: string | null;
  ident: 'BPS' | 'AA/TR' | 'BUE' | 'BUE/A' | 'BUE/T' | null;
  regime: 'PRIVATIVO' | 'REGULAR' | null;
  passageiros: ExtractedPassenger[] | null;
  observacoes: string | null;
};

export type ExtractedReservationFieldKey = keyof ExtractedReservation;

export type ExtractedReservationDraft = Record<ExtractedReservationFieldKey, string>;

export type ExtractedReservationErrors = Partial<Record<ExtractedReservationFieldKey, string>>;

export type ExtractedPasseio = {
  id_externo: string | null;
  data_passeio: string | null;
  tipo_passeio: 'AR' | 'TR' | 'CA' | 'RF' | 'FL' | 'OB' | 'OB_QUADRADO' | 'desconhecido' | null;
  descricao: string | null;
};
