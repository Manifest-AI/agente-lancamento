import type { ExtractedPasseio } from '@/types/ocr-gpt';
import { UNKNOWN_PASSEIO_TYPE, VALID_PASSEIO_TYPES } from './prompt';

export type PasseioTipo = (typeof VALID_PASSEIO_TYPES)[number];

export type NormalizedPasseio = {
  id_externo: string | null;
  data_passeio: string | null;
  tipo_passeio: PasseioTipo | typeof UNKNOWN_PASSEIO_TYPE | null;
  descricao: string | null;
};

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

export function normalizeExtractedPasseio(data: ExtractedPasseio): NormalizedPasseio {
  return {
    id_externo: data.id_externo?.trim() || null,
    data_passeio: normalizePasseioDate(data.data_passeio),
    tipo_passeio: normalizePasseioType(data.tipo_passeio),
    descricao: data.descricao?.trim() || null,
  };
}
