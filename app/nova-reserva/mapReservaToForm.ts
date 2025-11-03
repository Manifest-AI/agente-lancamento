import type { ExtractedReservation, ExtractedFlightSegment } from '@/types/ocr-gpt';
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
const FLIGHT_REGEX = /^[A-Z]{2}\d{3,4}$/;
const DATE_CANDIDATE_REGEX = /\b(\d{4}-\d{2}-\d{2}|\d{2}[/-]\d{2}[/-]\d{4})\b/g;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeFlightCode(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const trimmed = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return FLIGHT_REGEX.test(trimmed) ? trimmed : trimmed;
}

function extractDateCandidates(...values: Array<string | null | undefined>) {
  const candidates = new Set<string>();

  values.forEach((value) => {
    if (!value) {
      return;
    }
    const matches = value.match(DATE_CANDIDATE_REGEX);
    if (matches) {
      matches.forEach((match) => candidates.add(match));
    }
  });

  return Array.from(candidates);
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

function parseTimeToComponents(value: string | null | undefined) {
  const normalized = normalizeTime(value);
  if (!normalized) {
    return null;
  }

  const [hourString, minuteString] = normalized.split(':');
  const hour = Number(hourString);
  const minute = Number(minuteString);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }

  return { hour, minute } as const;
}

function resolveAirportCode(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const upper = value.toUpperCase();
  if (upper.includes('BPS')) {
    return 'BPS';
  }

  const match = upper.match(/\b[A-Z]{3}\b/);
  return match ? match[0] : '';
}

type NormalizedSegment = {
  origem: string;
  destino: string;
  data: string;
  horarioPartida: string;
  horarioChegada: string;
  voo: string;
};

function toComparableTimestamp(segment: NormalizedSegment, variant: 'arrival' | 'departure') {
  const date = parseFlexibleToDate(segment.data);
  if (!date) {
    return Number.POSITIVE_INFINITY;
  }

  const timeComponents =
    variant === 'arrival'
      ? parseTimeToComponents(segment.horarioChegada) ?? parseTimeToComponents(segment.horarioPartida)
      : parseTimeToComponents(segment.horarioPartida) ?? parseTimeToComponents(segment.horarioChegada);

  const hours = timeComponents?.hour ?? 0;
  const minutes = timeComponents?.minute ?? 0;

  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes);
}

export function extractSegments(data: ExtractedReservation) {
  const segments = Array.isArray(data.segmentos) ? (data.segmentos as ExtractedFlightSegment[]) : [];
  const normalized: NormalizedSegment[] = segments
    .filter(Boolean)
    .map((segment) => ({
      origem: segment?.origem ? String(segment.origem) : '',
      destino: segment?.destino ? String(segment.destino) : '',
      data: segment?.data ? String(segment.data) : '',
      horarioPartida: segment?.horario_partida ? String(segment.horario_partida) : '',
      horarioChegada: segment?.horario_chegada ? String(segment.horario_chegada) : '',
      voo: segment?.voo ? String(segment.voo) : '',
    }));

  const arrivalCandidates = normalized
    .filter((segment) => segment.destino.toUpperCase().includes('BPS'))
    .sort((a, b) => toComparableTimestamp(a, 'arrival') - toComparableTimestamp(b, 'arrival'));

  const departureCandidates = normalized
    .filter((segment) => segment.origem.toUpperCase().includes('BPS'))
    .sort((a, b) => toComparableTimestamp(a, 'departure') - toComparableTimestamp(b, 'departure'));

  const arrivalSegment = arrivalCandidates[0];
  const departureSegment = departureCandidates[0];

  const ida = {
    voo: arrivalSegment ? normalizeFlightCode(arrivalSegment.voo) : '',
    data: arrivalSegment ? formatBR(arrivalSegment.data) : '',
    hora:
      arrivalSegment
        ? normalizeTime(arrivalSegment.horarioChegada) || normalizeTime(arrivalSegment.horarioPartida)
        : '',
    destino: arrivalSegment ? resolveAirportCode(arrivalSegment.destino) : '',
  } as const;

  const volta = {
    voo: departureSegment ? normalizeFlightCode(departureSegment.voo) : '',
    data: departureSegment ? formatBR(departureSegment.data) : '',
    hora:
      departureSegment
        ? normalizeTime(departureSegment.horarioPartida) || normalizeTime(departureSegment.horarioChegada)
        : '',
    origem: departureSegment ? resolveAirportCode(departureSegment.origem) : '',
  } as const;

  return { ida, volta };
}

function coerceNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  }

  const numeric = Number(String(value).replace(/[^0-9-]+/g, ''));
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}

function isArgentineReservation(data: ExtractedReservation) {
  const text = [
    data.observacoes,
    data.servico,
    data.origem_operadora,
    data.operador,
    Array.isArray(data.passageiros)
      ? data.passageiros
          .map((passageiro) =>
            [
              passageiro?.nacionalidade,
              passageiro?.documento,
              passageiro?.telefone,
              passageiro?.origem,
            ]
              .filter(Boolean)
              .join(' '),
          )
          .join(' ')
      : null,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!text) {
    return false;
  }

  return /argentin|\barg\b|\b\+54|buenos\s+aires|\bbue\b/.test(text);
}

export function deriveIdent({
  hotel,
  isArgentino,
}: {
  hotel: string | null | undefined;
  isArgentino: boolean;
}): 'BPS' | 'AA/TR' | 'BUE' | 'BUE/A' | 'BUE/T' {
  const normalizedHotel = normalizeWhitespace((hotel ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')).toLowerCase();

  const isPortoSeguro = /porto\s*seguro|terra\s*brasil|ondamar|porto\s*calem/.test(normalizedHotel);
  const isArraial = /arraial|ajuda/.test(normalizedHotel);
  const isTrancoso = /trancoso/.test(normalizedHotel);
  const isCaraiva = /caraiva/.test(normalizedHotel);

  if (isArgentino) {
    if (isPortoSeguro || (!isArraial && !isTrancoso && !isCaraiva)) {
      return 'BUE';
    }
    if (isArraial) {
      return 'BUE/A';
    }
    if (isTrancoso || isCaraiva) {
      return 'BUE/T';
    }
  }

  if (isArraial || isTrancoso || isCaraiva) {
    return 'AA/TR';
  }

  return 'BPS';
}

export function parseNameToFirstLast(fullName: string) {
  const tokens = normalizeWhitespace(fullName)
    .split(' ')
    .filter(Boolean);

  if (!tokens.length) {
    return { first: '', last: '' };
  }

  if (tokens.length === 1) {
    return { first: tokens[0], last: '' };
  }

  return { first: tokens[0], last: tokens[tokens.length - 1] };
}

export function classifyPaxByAge(ageOrType: unknown): PassageiroCategoria | null {
  if (typeof ageOrType === 'number' && Number.isFinite(ageOrType)) {
    if (ageOrType <= 5) {
      return 'I';
    }
    if (ageOrType <= 10) {
      return 'C';
    }
    return 'A';
  }

  if (typeof ageOrType === 'string') {
    const normalized = ageOrType.trim().toUpperCase();
    if (!normalized) {
      return null;
    }

    if (['ADT', 'ADULTO', 'ADULT', 'A'].includes(normalized)) {
      return 'A';
    }
    if (['CHD', 'CHILD', 'CRIANCA', 'CH', 'C'].includes(normalized)) {
      return 'C';
    }
    if (['INF', 'INFANT', 'BEBE', 'IN', 'I'].includes(normalized)) {
      return 'I';
    }
  }

  return null;
}

function detectPassengerTypeFromName(fullName: string): PassageiroCategoria | null {
  const match = fullName.match(/\b(ADT|ADULTO|ADULT|CHD|CHILD|CRIANCA|INF|INFANT|BEBE)\b/i);
  if (!match) {
    return null;
  }

  return classifyPaxByAge(match[1]);
}

function sanitizePassengerName(fullName: string) {
  const withoutType = fullName.replace(
    /(?:[-\/\s]*\(?\b(ADT|ADULTO|ADULT|CHD|CHILD|CRIANCA|INF|INFANT|BEBE)\b\)?)+$/i,
    '',
  );

  return normalizeWhitespace(withoutType);
}

type ExtractedPassengerInfo = {
  first: string;
  last: string;
  type: PassageiroCategoria | '';
};

export function extractPassengers(data: ExtractedReservation): ExtractedPassengerInfo[] {
  const passengers: ExtractedPassengerInfo[] = [];
  const seen = new Set<string>();

  const pushPassenger = (fullName: string | null | undefined, classificationSource?: unknown) => {
    if (!fullName) {
      return;
    }

    const normalizedName = normalizeWhitespace(String(fullName));
    if (!normalizedName) {
      return;
    }

    const typeFromName = detectPassengerTypeFromName(normalizedName);
    const cleaned = sanitizePassengerName(normalizedName);
    if (!cleaned) {
      return;
    }

    const { first, last } = parseNameToFirstLast(cleaned);
    if (!first && !last) {
      return;
    }

    const canonical = cleaned.toUpperCase();
    if (canonical && seen.has(canonical)) {
      return;
    }

    const classification =
      classifyPaxByAge(classificationSource ?? typeFromName ?? null) ?? '';

    passengers.push({ first, last, type: classification });
    if (canonical) {
      seen.add(canonical);
    }
  };

  if (Array.isArray(data.passageiros)) {
    data.passageiros.forEach((passageiro) => {
      if (!passageiro) {
        return;
      }

      const surnameCandidate =
        typeof (passageiro as Record<string, unknown>)?.['sobrenome'] === 'string'
          ? String((passageiro as Record<string, unknown>)['sobrenome'])
          : null;

      const structuredFullName =
        (typeof passageiro.full_name === 'string' && passageiro.full_name) ||
        normalizeWhitespace([passageiro.nome, surnameCandidate].filter(Boolean).join(' '));

      if (structuredFullName) {
        pushPassenger(
          structuredFullName,
          passageiro.tipo ?? passageiro.classificacao ?? passageiro.idade ?? passageiro.age ?? null,
        );
      }
    });
  }

  const compositeName = normalizeWhitespace(
    [data.passageiro_nome, data.passageiro_sobrenome].filter(Boolean).join(' '),
  );
  if (compositeName) {
    pushPassenger(compositeName);
  }

  const listFromFullName = typeof data.passageiro_full_name === 'string' ? data.passageiro_full_name : '';
  if (listFromFullName) {
    listFromFullName
      .split(/[\n;,/]+/)
      .map((value) => normalizeWhitespace(value))
      .filter(Boolean)
      .forEach((name) => {
        pushPassenger(name);
      });
  }

  return passengers;
}

export function detectRegime(serviceText: string | null | undefined): 'Privativo' | 'REGULAR' {
  const normalized = (serviceText ?? '').toLowerCase();

  if (!normalized) {
    return 'REGULAR';
  }

  if (/(privativo|exclusive|exclusivo|private)/.test(normalized)) {
    return 'Privativo';
  }

  if (/(regular|compartilhado|shuttle)/.test(normalized)) {
    return 'REGULAR';
  }

  return 'REGULAR';
}

function ensurePassengerArray(length: number) {
  if (length <= 0) {
    return [{ nome: '', classificacao: '' as const }];
  }

  return Array.from({ length }, () => ({ nome: '', classificacao: '' as const }));
}

function buildPassengerClassifications(data: ExtractedReservation, total: number) {
  const adult = coerceNumber(data.pax_adulto);
  const child = coerceNumber(data.pax_crianca);
  const infant = coerceNumber(data.pax_bebe);

  const classifications: PassageiroCategoria[] = [];
  classifications.push(...Array(Math.min(adult, total)).fill('A'));
  classifications.push(...Array(Math.min(child, Math.max(total - classifications.length, 0))).fill('C'));
  classifications.push(...Array(Math.min(infant, Math.max(total - classifications.length, 0))).fill('I'));

  while (classifications.length < total) {
    classifications.push('A');
  }

  return classifications.slice(0, total);
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
  const operadora = normalizeWhitespace(data.operador ?? '');
  const { ida, volta } = extractSegments(data);
  const dateCandidates = extractDateCandidates(
    data.data,
    data.observacoes,
    data.servico,
    ...(Array.isArray(data.segmentos)
      ? data.segmentos.map((segmento) => segmento?.data ?? null)
      : []),
  )
    .map((candidate) => formatBR(candidate))
    .filter((value) => Boolean(value));

  const fallbackArrivalDate = formatBR(data.data ?? '') || dateCandidates[0] || '';
  const fallbackDepartureDate = dateCandidates.length > 1 ? dateCandidates[1] : dateCandidates[0] || '';

  const dataChegada = ida.data || fallbackArrivalDate;
  const dataSaida = volta.data || fallbackDepartureDate;
  const vooChegada = ida.voo || normalizeFlightCode(data.voo_chegada);
  const vooSaida = volta.voo || normalizeFlightCode(data.voo_partida);
  const horaChegada = ida.hora || normalizeTime(data.hora_coleta);
  const horaSaida = volta.hora || normalizeTime(data.hora_retorno);
  const regime = detectRegime((data.servico ?? '') + ' ' + (data.observacoes ?? ''));
  const isArgentino = isArgentineReservation(data);
  const ident = deriveIdent({ hotel: data.hotel, isArgentino });
  const hotel = normalizeWhitespace(data.hotel ?? '');

  const numeroReserva = normalizeWhitespace(
    (data.id_externo ?? data.localizador ?? data.booking_code ?? data.id_externo2 ?? '') as string,
  );

  const extractedPassengers = extractPassengers(data);
  const passengerCount = Math.max(
    extractedPassengers.length,
    coerceNumber(data.pax_adulto) + coerceNumber(data.pax_crianca) + coerceNumber(data.pax_bebe),
    1,
  );

  const fallbackClassifications = buildPassengerClassifications(data, passengerCount);
  const passengers = ensurePassengerArray(passengerCount).map((_, index) => {
    const passengerInfo = extractedPassengers[index];
    const composed = normalizeWhitespace(
      [passengerInfo?.first ?? '', passengerInfo?.last ?? ''].filter(Boolean).join(' '),
    ).toUpperCase();

    let classificacao: PassageiroCategoria | '' = passengerInfo?.type ?? '';

    if (!classificacao) {
      classificacao = fallbackClassifications[index] ?? '';
    }

    return {
      nome: composed,
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
    horarioChegada: horaChegada,
    horarioSaida: horaSaida,
    hotel,
    numeroReserva,
    regime,
    passageiros: passengers,
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

