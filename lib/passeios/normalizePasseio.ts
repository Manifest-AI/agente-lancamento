import type { ExtractedPasseio, ExtractedPasseioPassenger } from '@/types/ocr-gpt';
import { UNKNOWN_PASSEIO_TYPE, VALID_PASSEIO_TYPES } from './prompt';

export type PasseioTipo = (typeof VALID_PASSEIO_TYPES)[number];
export type PasseioRegime = ExtractedPasseio['regime'];
export type NormalizedPasseioPassenger = {
  nome: string | null;
  tipo: ExtractedPasseioPassenger['tipo'];
};

export type NormalizedPasseio = {
  id_externo: string | null;
  data_passeio: string | null;
  tipo_passeio: PasseioTipo | typeof UNKNOWN_PASSEIO_TYPE | null;
  descricao: string | null;
  hotel: string | null;
  regime: PasseioRegime;
  passageiros: NormalizedPasseioPassenger[];
};

const VALID_REGIMES: PasseioRegime[] = ['PRIVATIVO', 'REGULAR'];

function normalizeWhitespace(value?: string | null) {
  return value?.replace(/\s+/g, ' ').trim();
}

export function normalizePasseioDate(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return trimmed;
  }

  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return `${year}-${month}-${day}`;
  }

  return null;
}

export function normalizePasseioType(value?: string | null): NormalizedPasseio['tipo_passeio'] {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) {
    return UNKNOWN_PASSEIO_TYPE;
  }

  if (!VALID_PASSEIO_TYPES.includes(normalized as PasseioTipo)) {
    return UNKNOWN_PASSEIO_TYPE;
  }

  return normalized as PasseioTipo;
}

function normalizePasseioRegime(value?: PasseioRegime | null): PasseioRegime {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase() as PasseioRegime;
  if (!VALID_REGIMES.includes(normalized)) {
    return null;
  }

  return normalized;
}

function normalizePasseioPassenger(passenger?: ExtractedPasseioPassenger | null): NormalizedPasseioPassenger | null {
  if (!passenger) {
    return null;
  }

  const nome = normalizeWhitespace(passenger.nome);
  const tipo = passenger.tipo ? passenger.tipo.toUpperCase() : null;
  const validTipo = tipo === 'ADT' || tipo === 'CHD' || tipo === 'INF' ? (tipo as ExtractedPasseioPassenger['tipo']) : null;

  if (!nome && !validTipo) {
    return null;
  }

  return {
    nome: nome ? nome.toUpperCase() : null,
    tipo: validTipo,
  };
}

export function normalizeExtractedPasseio(data: ExtractedPasseio): NormalizedPasseio {
  const passengerList = Array.isArray(data.passageiros) ? data.passageiros : [];
  const passageiros = passengerList
    .map((passenger) => normalizePasseioPassenger(passenger))
    .filter((passenger): passenger is NormalizedPasseioPassenger => Boolean(passenger));

  return {
    id_externo: data.id_externo?.trim() || null,
    data_passeio: normalizePasseioDate(data.data_passeio),
    tipo_passeio: normalizePasseioType(data.tipo_passeio),
    descricao: data.descricao?.trim() || null,
    hotel: normalizeWhitespace(data.hotel) || null,
    regime: normalizePasseioRegime(data.regime),
    passageiros,
  };
}
