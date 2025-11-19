export const RESERVA_STATUS = {
  ATIVO: 'Ativo',
  CANCELADA: 'Cancelada',
} as const;

export type ReservaStatus = (typeof RESERVA_STATUS)[keyof typeof RESERVA_STATUS];
