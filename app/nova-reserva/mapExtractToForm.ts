import type { ExtractedReservation } from '@/types/ocr-gpt';

export type ReservationFormMapping = {
  passengerName?: string;
  passengerType?: 'adulto' | 'crianca' | 'bebe';
  departureDate?: string;
  departureTime?: string;
  returnDate?: string;
  returnTime?: string;
  reservationCode?: string;
  notes?: string;
};

const passengerTypeMap: Record<string, ReservationFormMapping['passengerType']> = {
  A: 'adulto',
  C: 'crianca',
  I: 'bebe',
};

export function mapExtractToForm(data: ExtractedReservation): ReservationFormMapping {
  const mapped: ReservationFormMapping = {};

  if (data.nome) {
    mapped.passengerName = data.nome.trim();
  }

  if (data.tipo) {
    const normalized = passengerTypeMap[data.tipo.toUpperCase()];
    if (normalized) {
      mapped.passengerType = normalized;
    }
  }

  if (data.data_chegada_bps) {
    mapped.departureDate = data.data_chegada_bps;
  }

  if (data.hora_chegada) {
    mapped.departureTime = data.hora_chegada;
  }

  if (data.data_saida_bps) {
    mapped.returnDate = data.data_saida_bps;
  }

  if (data.hora_saida) {
    mapped.returnTime = data.hora_saida;
  }

  if (data.id_reserva) {
    mapped.reservationCode = data.id_reserva.trim();
  }

  if (data.observacao) {
    mapped.notes = data.observacao.trim();
  }

  return mapped;
}
