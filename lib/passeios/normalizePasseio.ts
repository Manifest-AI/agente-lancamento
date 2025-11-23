import type { ExtractedPasseio } from '@/types/ocr-gpt';
import { VALID_PASSEIO_TYPES } from './prompt';

export type NormalizedPasseio = {
  operadora: string;
  id_externo: string;
  data_passeio: string;
  tipo_passeio: (typeof VALID_PASSEIO_TYPES)[number];
  descricao: string | null;
};

export function normalizePasseioDate(value: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error('Data do passeio ausente.');
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

  throw new Error('Data do passeio em formato inválido.');
}

export function normalizePasseioType(value: string): NormalizedPasseio['tipo_passeio'] {
  const normalized = value?.trim().toUpperCase();
  if (!normalized || !VALID_PASSEIO_TYPES.includes(normalized as NormalizedPasseio['tipo_passeio'])) {
    throw new Error('Tipo de passeio não reconhecido.');
  }
  return normalized as NormalizedPasseio['tipo_passeio'];
}

export function normalizeExtractedPasseio(data: ExtractedPasseio): NormalizedPasseio {
  const operadora = data.operadora?.trim();
  const idExterno = data.id_externo?.trim();

  if (!operadora) {
    throw new Error('Operadora é obrigatória.');
  }

  if (!idExterno) {
    throw new Error('ID externo é obrigatório.');
  }

  const dataPasseio = normalizePasseioDate(data.data_passeio);
  const tipoPasseio = normalizePasseioType(data.tipo_passeio);
  const descricao = data.descricao?.trim() || null;

  return {
    operadora,
    id_externo: idExterno,
    data_passeio: dataPasseio,
    tipo_passeio: tipoPasseio,
    descricao,
  };
}
