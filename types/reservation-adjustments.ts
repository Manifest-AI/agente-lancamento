export type ReservationFieldUpdateField =
  | 'data_chegada'
  | 'data_saida'
  | 'voo_chegada'
  | 'voo_saida'
  | 'horario_voo_chegada'
  | 'horario_voo_saida'
  | 'hotel'
  | 'ident';

export type ReservationFieldUpdate = {
  field: ReservationFieldUpdateField;
  value: string | null;
};

export type ReservationPassengerChange = {
  nome?: string | null;
  tipo?: 'A' | 'C' | 'I' | null;
  quantidade?: number;
};

export type ApplyAlterationPayload = {
  numeroReserva: string;
  updates?: ReservationFieldUpdate[];
  addPassengers?: ReservationPassengerChange[];
  removePassengers?: ReservationPassengerChange[];
};

export type ApplyCancellationPayload = {
  numeroReserva: string;
  escopo?: 'total' | 'parcial';
  passageiros?: string[];
};

export type ReservationLookupState = 'idle' | 'loading' | 'loaded' | 'not_found' | 'error';
