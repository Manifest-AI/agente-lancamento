import type { ExtractedReservation, ExtractedPassenger } from '@/types/ocr-gpt';
import { formatBR, parseFlexibleToDate } from '@/lib/dateBr';

export type PassageiroCategoria = 'A' | 'C' | 'I';

export type ReservaPreviewPassenger = {
  nome: string;
  classificacao: PassageiroCategoria | '';
};

export type ReservaPreviewDraft = {
  operadora: string;
  dataChegada: string;
  dataSaida: string;
  ident: '' | 'BPS' | 'AA/TR' | 'BUE' | 'BUE/A' | 'BUE/T';
  vooChegada: string;
  vooSaida: string;
  horarioChegada: string;
  horarioSaida: string;
  hotel: string;
  numeroReserva: string;
  regime: '' | 'Privativo' | 'REGULAR';
  passageiros: ReservaPreviewPassenger[];
};

export type ReservaPreviewErrors = {
  operadora?: string;
  dataChegada?: string;
  dataSaida?: string;
  ident?: string;
  vooChegada?: string;
  vooSaida?: string;
  horarioChegada?: string;
  horarioSaida?: string;
  hotel?: string;
  numeroReserva?: string;
  regime?: string;
  passageiros: Array<{ nome?: string; classificacao?: string }>;
};

const TIME_REGEX = /^\d{2}:\d{2}$/;
const FLIGHT_REGEX = /^[A-Z0-9]{2,3}\d{3,4}$/;
const VALID_IDENTS: Array<NonNullable<ReservaPreviewDraft['ident']>> = ['BPS', 'AA/TR', 'BUE', 'BUE/A', 'BUE/T'];
const VALID_IDENT_SET = new Set(VALID_IDENTS);

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeFlightCode(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const trimmed = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return trimmed;
}

function normalizeTime(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const trimmed = value.trim();
  if (TIME_REGEX.test(trimmed)) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 4) {
    const candidate = `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
    if (TIME_REGEX.test(candidate)) {
      return candidate;
    }
  }

  return '';
}

function normalizeRegime(value: string | null | undefined): ReservaPreviewDraft['regime'] {
  const normalized = (value ?? '').trim().toUpperCase();

  if (normalized === 'PRIVATIVO') {
    return 'Privativo';
  }
  if (normalized === 'REGULAR') {
    return 'REGULAR';
  }
  return '';
}

function normalizeIdent(value: ExtractedReservation['ident']): ReservaPreviewDraft['ident'] {
  if (!value) {
    return '';
  }

  const normalized = value.trim().toUpperCase() as ReservaPreviewDraft['ident'];
  return VALID_IDENT_SET.has(normalized) ? normalized : '';
}

function mapPassengerTypeToClassification(value: string | null | undefined): PassageiroCategoria | '' {
  const normalized = (value ?? '').trim().toUpperCase();

  if (normalized === 'ADT') {
    return 'A';
  }
  if (normalized === 'CHD') {
    return 'C';
  }
  if (normalized === 'INF') {
    return 'I';
  }
  return '';
}

function normalizePassengerName(passenger?: ExtractedPassenger | null) {
  const candidate = passenger?.primeiro_ultimo_nome ?? passenger?.nome_completo ?? '';
  return candidate ? normalizeWhitespace(candidate).toUpperCase() : '';
}

function ensurePassengerArray(length: number) {
  if (length <= 0) {
    return [{ nome: '', classificacao: '' as const }];
  }

  return Array.from({ length }, () => ({ nome: '', classificacao: '' as const }));
}

export function createEmptyPreview(): ReservaPreviewDraft {
  return {
    operadora: '',
    dataChegada: '',
    dataSaida: '',
    ident: '',
    vooChegada: '',
    vooSaida: '',
    horarioChegada: '',
    horarioSaida: '',
    hotel: '',
    numeroReserva: '',
    regime: '',
    passageiros: [{ nome: '', classificacao: '' }],
  };
}

export function mapReservaToForm(data: ExtractedReservation): ReservaPreviewDraft {
  const operadora = normalizeWhitespace(data.operadora ?? '');
  const dataChegada = formatBR(data.data_chegada_bps);
  const dataSaida = formatBR(data.data_saida_bps);
  const ident = normalizeIdent(data.ident);
  const vooChegada = normalizeFlightCode(data.voo_chegada_codigo);
  const vooSaida = normalizeFlightCode(data.voo_saida_codigo);
  const horarioChegada = normalizeTime(data.hora_chegada_bps);
  const horarioSaida = normalizeTime(data.hora_saida_bps);
  const hotel = normalizeWhitespace(data.hotel ?? '');
  const numeroReserva = normalizeWhitespace(data.id_externo ?? '');
  const regime = normalizeRegime(data.regime);

  const passengerSource = Array.isArray(data.passageiros) ? data.passageiros : [];
  const passengerCount = Math.max(passengerSource.length, 1);
  const passengers = ensurePassengerArray(passengerCount).map((_, index) => {
    const passenger = passengerSource[index];
    const nome = passenger ? normalizePassengerName(passenger) : '';
    const classificacao = passenger ? mapPassengerTypeToClassification(passenger.tipo ?? null) : '';
    return {
      nome,
      classificacao,
    };
  });

  return {
    operadora,
    dataChegada,
    dataSaida,
    ident,
    vooChegada,
    vooSaida,
    horarioChegada,
    horarioSaida,
    hotel,
    numeroReserva,
    regime,
    passageiros,
  };
}

export function mapPreviewToReservationForm(data: ReservaPreviewDraft) {
  const firstPassenger = data.passageiros[0];
  const passengerName = firstPassenger?.nome ?? '';
  const passengerType = firstPassenger?.classificacao ?? '';

  const airlineCodeCandidate = data.vooChegada || data.vooSaida;
  const airline = airlineCodeCandidate ? airlineCodeCandidate.slice(0, 2) : '';

  const formattedDepartureDate = formatBR(data.dataChegada);
  const formattedReturnDate = formatBR(data.dataSaida);

  return {
    passengerName: passengerName || undefined,
    passengerType:
      passengerType === 'A'
        ? 'adulto'
        : passengerType === 'C'
          ? 'crianca'
          : passengerType === 'I'
            ? 'bebe'
            : undefined,
    origin: data.ident ? data.ident : undefined,
    destination: data.hotel ? data.hotel : undefined,
    departureDate: formattedDepartureDate || undefined,
    departureTime: data.horarioChegada || undefined,
    returnDate: formattedReturnDate || undefined,
    returnTime: data.horarioSaida || undefined,
    airline: airline || undefined,
    reservationCode: data.numeroReserva || undefined,
    notes:
      data.regime || data.operadora
        ? [
            data.regime ? `Regime: ${data.regime}` : null,
            data.operadora ? `Operadora: ${data.operadora}` : null,
          ]
            .filter(Boolean)
            .join('\n') || undefined
        : undefined,
  } as const;
}

export function validatePreview(data: ReservaPreviewDraft): ReservaPreviewErrors {
  const errors: ReservaPreviewErrors = {
    passageiros: data.passageiros.map(() => ({})),
  };

  if (!data.operadora.trim()) {
    errors.operadora = 'Campo obrigatório.';
  }

  if (!data.dataChegada.trim()) {
    errors.dataChegada = 'Campo obrigatório.';
  } else if (!parseFlexibleToDate(data.dataChegada.trim())) {
    errors.dataChegada = 'Use o formato dd/MM/aaaa.';
  }

  if (!data.dataSaida.trim()) {
    errors.dataSaida = 'Campo obrigatório.';
  } else if (!parseFlexibleToDate(data.dataSaida.trim())) {
    errors.dataSaida = 'Use o formato dd/MM/aaaa.';
  }

  if (!data.ident.trim()) {
    errors.ident = 'Campo obrigatório.';
  }

  if (!data.vooChegada.trim()) {
    errors.vooChegada = 'Campo obrigatório.';
  } else if (!FLIGHT_REGEX.test(data.vooChegada.trim())) {
    errors.vooChegada = 'Informe o código do voo (ex.: LA3600).';
  }

  if (!data.vooSaida.trim()) {
    errors.vooSaida = 'Campo obrigatório.';
  } else if (!FLIGHT_REGEX.test(data.vooSaida.trim())) {
    errors.vooSaida = 'Informe o código do voo (ex.: LA3343).';
  }

  if (!data.horarioChegada.trim()) {
    errors.horarioChegada = 'Campo obrigatório.';
  } else if (!TIME_REGEX.test(data.horarioChegada.trim())) {
    errors.horarioChegada = 'Use o formato HH:mm.';
  }

  if (!data.horarioSaida.trim()) {
    errors.horarioSaida = 'Campo obrigatório.';
  } else if (!TIME_REGEX.test(data.horarioSaida.trim())) {
    errors.horarioSaida = 'Use o formato HH:mm.';
  }

  if (!data.hotel.trim()) {
    errors.hotel = 'Campo obrigatório.';
  }

  if (!data.numeroReserva.trim()) {
    errors.numeroReserva = 'Campo obrigatório.';
  }

  if (!data.regime.trim()) {
    errors.regime = 'Campo obrigatório.';
  }

  data.passageiros.forEach((passageiro, index) => {
    if (!passageiro.nome.trim()) {
      errors.passageiros[index].nome = 'Informe o nome.';
    }
    if (!passageiro.classificacao.trim()) {
      errors.passageiros[index].classificacao = 'Informe a classificação (A/C/I).';
    }
  });

  return errors;
}

export function hasPreviewErrors(errors: ReservaPreviewErrors) {
  if (
    errors.operadora ||
    errors.dataChegada ||
    errors.dataSaida ||
    errors.ident ||
    errors.vooChegada ||
    errors.vooSaida ||
    errors.horarioChegada ||
    errors.horarioSaida ||
    errors.hotel ||
    errors.numeroReserva ||
    errors.regime
  ) {
    return true;
  }

  return errors.passageiros.some((passageiro) => passageiro.nome || passageiro.classificacao);
}
