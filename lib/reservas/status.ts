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

export function sanitizeReservationStatus(
  status: string | null | undefined,
  onReject?: (rejected: string | null | undefined) => void,
): ReservationStatus {
  const normalized = status?.trim();

  if (!normalized) {
    return RESERVATION_STATUS.CONFIRMED;
  }

  if (normalized === 'Cancelada') {
    return RESERVATION_STATUS.CANCELLED;
  }

  if (RESERVATION_STATUS_VALUES.includes(normalized as ReservationStatus)) {
    return normalized as ReservationStatus;
  }

  onReject?.(status);
  return RESERVATION_STATUS.CONFIRMED;
}
