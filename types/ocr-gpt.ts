export type ExtractedReservation = {
  operador: string | null;
  origem_operadora: string | null;
  localizador: string | null;
  booking_code: string | null;
  passageiro_nome: string | null;
  passageiro_sobrenome: string | null;
  passageiro_full_name: string | null;
  servico: string | null;
  data: string | null;
  hora_coleta: string | null;
  hora_retorno: string | null;
  voo_chegada: string | null;
  voo_partida: string | null;
  hotel: string | null;
  endereco: string | null;
  pax_adulto: string | number | null;
  pax_crianca: string | number | null;
  pax_bebe: string | number | null;
  observacoes: string | null;
};

export type ExtractedReservationFieldKey = keyof ExtractedReservation;

export type ExtractedReservationDraft = Record<ExtractedReservationFieldKey, string>;

export type ExtractedReservationErrors = Partial<Record<ExtractedReservationFieldKey, string>>;
