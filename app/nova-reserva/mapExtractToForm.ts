import type { ExtractedReservation } from '@/types/ocr-gpt';

export type ReservationFormMapping = {
  passengerName?: string;
  passengerType?: 'adulto' | 'crianca' | 'bebe';
  origin?: string;
  destination?: string;
  departureDate?: string;
  departureTime?: string;
  returnDate?: string;
  returnTime?: string;
  airline?: string;
  reservationCode?: string;
  notes?: string;
};

function coerceToNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
}

function resolvePassengerType(data: ExtractedReservation): ReservationFormMapping['passengerType'] {
  const adult = coerceToNumber(data.pax_adulto) ?? 0;
  const child = coerceToNumber(data.pax_crianca) ?? 0;
  const baby = coerceToNumber(data.pax_bebe) ?? 0;

  if (adult > 0) {
    return 'adulto';
  }

  if (child > 0) {
    return 'crianca';
  }

  if (baby > 0) {
    return 'bebe';
  }

  return undefined;
}

function resolvePassengerName(data: ExtractedReservation) {
  const fullName = data.passageiro_full_name?.trim();
  if (fullName) {
    return fullName;
  }

  const firstName = data.passageiro_nome?.trim();
  const lastName = data.passageiro_sobrenome?.trim();
  const composed = [firstName, lastName].filter(Boolean).join(' ');
  return composed ? composed.trim() : undefined;
}

function resolveAirline(data: ExtractedReservation) {
  const flight = data.voo_partida || data.voo_chegada;
  if (!flight) {
    return undefined;
  }

  const trimmed = flight.trim();
  if (!trimmed) {
    return undefined;
  }

  const matches = trimmed.match(/^([A-Z]{2})/i);
  if (matches?.[1]) {
    return matches[1].toUpperCase();
  }

  return trimmed;
}

function resolveNotes(data: ExtractedReservation) {
  const parts = [
    data.servico?.trim() ? `Serviço: ${data.servico.trim()}` : null,
    data.hotel?.trim() ? `Hotel: ${data.hotel.trim()}` : null,
    data.endereco?.trim() ? `Endereço: ${data.endereco.trim()}` : null,
    data.observacoes?.trim() ? data.observacoes.trim() : null,
  ].filter(Boolean);

  if (!parts.length) {
    return undefined;
  }

  return parts.join('\n');
}

export function mapExtractToForm(data: ExtractedReservation): ReservationFormMapping {
  const mapped: ReservationFormMapping = {};

  const passengerName = resolvePassengerName(data);
  if (passengerName) {
    mapped.passengerName = passengerName;
  }

  const passengerType = resolvePassengerType(data);
  if (passengerType) {
    mapped.passengerType = passengerType;
  }

  const origin = data.origem_operadora?.trim() || data.operador?.trim();
  if (origin) {
    mapped.origin = origin;
  }

  const destination = data.hotel?.trim() || data.endereco?.trim();
  if (destination) {
    mapped.destination = destination;
  }

  if (data.data) {
    mapped.departureDate = data.data;
    mapped.returnDate = data.data;
  }

  if (data.hora_coleta) {
    mapped.departureTime = data.hora_coleta;
  }

  if (data.hora_retorno) {
    mapped.returnTime = data.hora_retorno;
  }

  const airline = resolveAirline(data);
  if (airline) {
    mapped.airline = airline;
  }

  const reservationCode = data.localizador?.trim() || data.booking_code?.trim();
  if (reservationCode) {
    mapped.reservationCode = reservationCode;
  }

  const notes = resolveNotes(data);
  if (notes) {
    mapped.notes = notes;
  }

  return mapped;
}
