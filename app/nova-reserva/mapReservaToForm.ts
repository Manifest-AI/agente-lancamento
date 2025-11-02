import type { ExtractedReservation } from '@/types/ocr-gpt';

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

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}$/;
const FLIGHT_REGEX = /^[A-Z]{2}\d{3,4}$/;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeFlightCode(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const trimmed = value.replace(/\s+/g, '').toUpperCase();
  return FLIGHT_REGEX.test(trimmed) ? trimmed : trimmed;
}

function extractDateCandidates(...values: Array<string | null | undefined>) {
  const regex = /\b\d{4}-\d{2}-\d{2}\b/g;
  const candidates = new Set<string>();

  values.forEach((value) => {
    if (!value) {
      return;
    }
    const matches = value.match(regex);
    if (matches) {
      matches.forEach((match) => candidates.add(match));
    }
  });

  return Array.from(candidates);
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

    if (['ADT', 'ADULTO', 'ADULT'].includes(normalized)) {
      return 'A';
    }
    if (['CHD', 'CHILD', 'CRIANCA', 'CH'].includes(normalized)) {
      return 'C';
    }
    if (['INF', 'INFANT', 'BEBE', 'IN'].includes(normalized)) {
      return 'I';
    }
  }

  return null;
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

export function extractFlights(data: ExtractedReservation) {
  const vooChegada = normalizeFlightCode(data.voo_chegada);
  const vooSaida = normalizeFlightCode(data.voo_partida);

  const horaChegada = TIME_REGEX.test(data.hora_coleta ?? '')
    ? (data.hora_coleta as string)
    : '';
  const horaSaida = TIME_REGEX.test(data.hora_retorno ?? '')
    ? (data.hora_retorno as string)
    : '';

  const dateCandidates = extractDateCandidates(
    data.data,
    data.observacoes,
    data.servico,
    ...(Array.isArray(data.segmentos)
      ? data.segmentos.map((segmento) => segmento?.data ?? null)
      : []),
  );

  const dataChegada = DATE_REGEX.test(data.data ?? '')
    ? (data.data as string)
    : dateCandidates[0] ?? '';
  const dataSaida = dateCandidates[1] ?? dataChegada ?? '';

  return {
    vooChegada,
    vooSaida,
    horaChegada,
    horaSaida,
    dataChegada,
    dataSaida,
  };
}

function ensurePassengerArray(length: number) {
  if (length <= 0) {
    return [{ nome: '', classificacao: '' as const }];
  }

  return Array.from({ length }, () => ({ nome: '', classificacao: '' as const }));
}

function parsePassengerNames(data: ExtractedReservation) {
  const names: string[] = [];

  const structuredNames = Array.isArray(data.passageiros)
    ? data.passageiros
        .map((passageiro) => passageiro?.full_name || passageiro?.nome || null)
        .filter(Boolean)
        .map((value) => String(value))
    : [];

  if (structuredNames.length) {
    structuredNames.forEach((name) => {
      const normalized = normalizeWhitespace(name);
      if (normalized) {
        names.push(normalized);
      }
    });
  }

  const fullName = data.passageiro_full_name?.trim();
  if (fullName) {
    fullName
      .split(/[\n;,/]+/)
      .map((value) => normalizeWhitespace(value))
      .filter(Boolean)
      .forEach((name) => {
        if (!names.includes(name)) {
          names.push(name);
        }
      });
  }

  const composedName = normalizeWhitespace(
    [data.passageiro_nome, data.passageiro_sobrenome].filter(Boolean).join(' '),
  );
  if (composedName && !names.includes(composedName)) {
    names.push(composedName);
  }

  return names;
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
  const { vooChegada, vooSaida, horaChegada, horaSaida, dataChegada, dataSaida } = extractFlights(data);
  const regime = detectRegime((data.servico ?? '') + ' ' + (data.observacoes ?? ''));
  const isArgentino = isArgentineReservation(data);
  const ident = deriveIdent({ hotel: data.hotel, isArgentino });
  const hotel = normalizeWhitespace(data.hotel ?? '');

  const numeroReserva = normalizeWhitespace(
    (data.id_externo ?? data.localizador ?? data.booking_code ?? data.id_externo2 ?? '') as string,
  );

  const passengerNames = parsePassengerNames(data);
  const passengerCount = Math.max(
    passengerNames.length,
    coerceNumber(data.pax_adulto) + coerceNumber(data.pax_crianca) + coerceNumber(data.pax_bebe),
    1,
  );

  const passengers = ensurePassengerArray(passengerCount).map((_, index) => {
    const rawName = passengerNames[index] ?? '';
    const { first, last } = parseNameToFirstLast(rawName);
    const composed = normalizeWhitespace([first, last].filter(Boolean).join(' '));

    let classificacao: PassageiroCategoria | '' = '';

    const structuredPassenger = Array.isArray(data.passageiros) ? data.passageiros[index] : undefined;
    if (structuredPassenger) {
      classificacao =
        classifyPaxByAge(structuredPassenger.tipo ?? structuredPassenger.age ?? structuredPassenger.idade ?? null) ?? '';
      if (!classificacao) {
        classificacao = classifyPaxByAge(structuredPassenger?.classificacao) ?? '';
      }
    }

    if (!classificacao) {
      const classifications = buildPassengerClassifications(data, passengerCount);
      classificacao = classifications[index] ?? '';
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
    departureDate: data.dataChegada || undefined,
    departureTime: data.horarioChegada || undefined,
    returnDate: data.dataSaida || undefined,
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
  } else if (!DATE_REGEX.test(data.dataChegada.trim())) {
    errors.dataChegada = 'Use o formato YYYY-MM-DD.';
  }

  if (!data.dataSaida.trim()) {
    errors.dataSaida = 'Campo obrigatório.';
  } else if (!DATE_REGEX.test(data.dataSaida.trim())) {
    errors.dataSaida = 'Use o formato YYYY-MM-DD.';
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

