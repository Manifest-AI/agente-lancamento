export type ExtractedPassenger = {
  nome?: string | null;
  full_name?: string | null;
  idade?: number | null;
  age?: number | null;
  tipo?: string | null;
  classificacao?: string | null;
  nacionalidade?: string | null;
  documento?: string | null;
  telefone?: string | null;
  origem?: string | null;
};

export type ExtractedFlightSegment = {
  origem?: string | null;
  destino?: string | null;
  data?: string | null;
  horario_partida?: string | null;
  horario_chegada?: string | null;
  voo?: string | null;
};

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
  id_externo?: string | null;
  id_externo2?: string | null;
  passageiros?: ExtractedPassenger[] | null;
  segmentos?: ExtractedFlightSegment[] | null;
};

export type ExtractedReservationFieldKey = keyof ExtractedReservation;

export type ExtractedReservationDraft = Record<ExtractedReservationFieldKey, string>;

export type ExtractedReservationErrors = Partial<Record<ExtractedReservationFieldKey, string>>;
