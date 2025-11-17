import type { ExtractedReservation } from '@/types/ocr-gpt';
import { parseStrictBrDate } from '@/lib/dateBr';

export function normalizeExtractedReservationDates(
  reservation: ExtractedReservation,
): ExtractedReservation {
  const normalized: ExtractedReservation = {
    ...reservation,
    data_chegada_bps:
      typeof reservation.data_chegada_bps === 'string'
        ? reservation.data_chegada_bps.trim() || null
        : reservation.data_chegada_bps ?? null,
    data_saida_bps:
      typeof reservation.data_saida_bps === 'string'
        ? reservation.data_saida_bps.trim() || null
        : reservation.data_saida_bps ?? null,
  };

  const arrivalDate = parseStrictBrDate(normalized.data_chegada_bps);
  const departureDate = parseStrictBrDate(normalized.data_saida_bps);

  if (!departureDate) {
    normalized.data_saida_bps = null;
    return normalized;
  }

  if (arrivalDate && departureDate.getTime() < arrivalDate.getTime()) {
    normalized.data_saida_bps = null;
  }

  return normalized;
}
