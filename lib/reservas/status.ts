export const RESERVATION_STATUS = {
  CONFIRMED: 'Confirmada',
  UNDER_REVIEW: 'Em análise',
  PENDING: 'Pendente',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Reembolsada',
  COMPLETED: 'Finalizada',
} as const;

export type ReservationStatus = (typeof RESERVATION_STATUS)[keyof typeof RESERVATION_STATUS];

export const RESERVATION_STATUS_VALUES: ReservationStatus[] = Object.values(RESERVATION_STATUS);

export const CANCELLATION_STATUS = RESERVATION_STATUS.CANCELLED;
