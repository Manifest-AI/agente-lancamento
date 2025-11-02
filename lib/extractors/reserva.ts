export type ReservaFieldKey =
  | 'passengerName'
  | 'document'
  | 'passengerType'
  | 'airline'
  | 'origin'
  | 'destination'
  | 'departureDate'
  | 'departureTime'
  | 'returnDate'
  | 'returnTime'
  | 'reservationCode'
  | 'hotel'
  | 'operator'
  | 'ident'
  | 'notes';

export type ReservaFields = Partial<Record<ReservaFieldKey, string>>;

export type ReservaExtractionResult = {
  fields: ReservaFields;
  confidence: Record<ReservaFieldKey, number>;
  raw: string;
};

const monthMap: Record<string, string> = {
  jan: '01',
  fev: '02',
  feb: '02',
  mar: '03',
  abr: '04',
  apr: '04',
  mai: '05',
  may: '05',
  jun: '06',
  jul: '07',
  ago: '08',
  aug: '08',
  set: '09',
  sep: '09',
  out: '10',
  oct: '10',
  nov: '11',
  dez: '12',
  dec: '12',
};

const airlineList = [
  'Azul',
  'Gol',
  'Latam',
  'TAP',
  'Ita',
  'Voepass',
  'Passaredo',
  'Avianca',
  'Air Europa',
  'American Airlines',
  'United',
  'Delta',
  'Lufthansa',
  'Air France',
  'KLM',
];

const passengerTypeMap: Record<string, string> = {
  adt: 'adulto',
  adulto: 'adulto',
  chd: 'crianca',
  criança: 'crianca',
  crianca: 'crianca',
  inf: 'bebe',
  bebê: 'bebe',
  bebe: 'bebe',
};

function clampConfidence(value: number) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(2));
}

export function normalizeIata(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(trimmed) ? trimmed : null;
}

export function normalizeTime(value: string | undefined | null): string | null {
  if (!value) return null;
  const match = value.match(/(\d{1,2})[:h\s]?(\d{2})/i);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (hour > 23 || minute > 59) return null;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

export function normalizeDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const normalized = value.toLowerCase();

  const numericMatch = normalized.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (numericMatch) {
    const day = numericMatch[1].padStart(2, '0');
    const month = numericMatch[2].padStart(2, '0');
    const year = numericMatch[3].length === 2 ? `20${numericMatch[3]}` : numericMatch[3];
    return `${year}-${month}-${day}`;
  }

  const textMatch = normalized.match(/(\d{1,2})\s+([a-zç]{3})[a-zç]*\s+(\d{2,4})/i);
  if (textMatch) {
    const day = textMatch[1].padStart(2, '0');
    const month = monthMap[textMatch[2].slice(0, 3)];
    if (!month) return null;
    const year = textMatch[3].length === 2 ? `20${textMatch[3]}` : textMatch[3];
    return `${year}-${month}-${day}`;
  }

  return null;
}

export function normalizeDocument(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const cpfMatch = trimmed.match(/(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/);
  if (cpfMatch) {
    const digits = cpfMatch[1].replace(/\D/g, '');
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  }

  const rgMatch = trimmed.match(/(\d{1,3}(?:\.\d{3}){1,2}-?[\dkx]{0,2})/i);
  if (rgMatch) {
    return rgMatch[1];
  }

  const onlyDigits = trimmed.replace(/\D/g, '');
  if (onlyDigits.length >= 6 && onlyDigits.length <= 12) {
    return onlyDigits;
  }

  return null;
}

function makeEmptyConfidence(): Record<ReservaFieldKey, number> {
  return {
    passengerName: 0,
    document: 0,
    passengerType: 0,
    airline: 0,
    origin: 0,
    destination: 0,
    departureDate: 0,
    departureTime: 0,
    returnDate: 0,
    returnTime: 0,
    reservationCode: 0,
    hotel: 0,
    operator: 0,
    ident: 0,
    notes: 0,
  };
}

function extractPassengerName(text: string) {
  const match = text.match(/(?:passageiro|hóspede|viajante)[:\s-]+([\p{L}'\s]{5,})/iu);
  if (!match) return null;
  return match[1].replace(/\s+/g, ' ').trim();
}

function extractOperadora(text: string) {
  const match = text.match(/(?:operadora|fornecedor)[:\s-]+([^\n]+)/i);
  return match ? match[1].trim() : null;
}

function extractHotel(text: string) {
  const match = text.match(/(?:hotel|hospedagem)[:\s-]+([^\n]+)/i);
  return match ? match[1].trim() : null;
}

function extractIdent(text: string) {
  const match = text.match(/(?:ident|identificador)[:\s-]+([^\n]+)/i);
  return match ? match[1].trim() : null;
}

function extractNotes(text: string) {
  const match = text.match(/(?:obs|observações?|comentários?)[:\s-]+([^\n]+)/i);
  return match ? match[1].trim() : null;
}

function extractPassengerType(text: string) {
  const match = text.match(/\b(ADT|ADULTO|CHD|CRIANÇA|CRIANC[AE]|INF|INFANTIL|BEBÊ|BEBE)\b/i);
  if (!match) return null;
  const key = match[1].normalize('NFD').replace(/[^a-zA-Z]/g, '').toLowerCase();
  return passengerTypeMap[key] ?? null;
}

function extractAirline(text: string) {
  const upper = text.toUpperCase();
  for (const airline of airlineList) {
    if (upper.includes(airline.toUpperCase())) {
      return airline;
    }
  }
  return null;
}

function extractReservationCode(text: string) {
  const matches = [...text.matchAll(/\b([A-Z0-9]{5,7})\b/g)];
  const filtered = matches
    .map((match) => match[1])
    .filter((value) => !/^[A-Z]{3}$/.test(value));
  return filtered.length ? filtered[0] : null;
}

function extractIataPairs(text: string) {
  const matches = [...text.matchAll(/\b([A-Z]{3})\b\s*(?:-|–|>|→|para|até|a)\s*\b([A-Z]{3})\b/g)];
  if (matches.length) {
    return { origin: matches[0][1], destination: matches[0][2] };
  }
  const allCodes = [...new Set([...text.matchAll(/\b([A-Z]{3})\b/g)].map((match) => match[1]))];
  if (allCodes.length >= 2) {
    return { origin: allCodes[0], destination: allCodes[1] };
  }
  return null;
}

function extractDates(text: string) {
  const matches = [...text.matchAll(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{1,2}\s+[a-zç]{3,9}\s+\d{2,4})/gi)];
  const [first, second] = matches.map((match) => match[0]);
  return { departure: first ?? null, return: second ?? null };
}

function extractTimes(text: string) {
  const matches = [...text.matchAll(/\b(\d{1,2}[:h]\d{2})\b/g)];
  const [first, second] = matches.map((match) => match[1]);
  return { departure: first ?? null, return: second ?? null };
}

function extractDocument(text: string) {
  const cpf = text.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/);
  if (cpf) return cpf[0];
  const rg = text.match(/\b\d{1,3}(?:\.\d{3}){1,2}-?[\dkx]{0,2}\b/i);
  if (rg) return rg[0];
  return null;
}

export function extractReservaFromText(text: string): ReservaExtractionResult {
  const cleanedText = text.replace(/\r/g, ' ').trim();
  const fields: ReservaFields = {};
  const confidence = makeEmptyConfidence();

  if (!cleanedText) {
    return { fields, confidence, raw: text };
  }

  const passengerName = extractPassengerName(cleanedText);
  if (passengerName) {
    fields.passengerName = passengerName;
    confidence.passengerName = clampConfidence(0.8);
  }

  const document = extractDocument(cleanedText);
  const normalizedDocument = normalizeDocument(document);
  if (normalizedDocument) {
    fields.document = normalizedDocument;
    confidence.document = clampConfidence(document?.includes('.') || document?.includes('-') ? 0.9 : 0.7);
  }

  const passengerType = extractPassengerType(cleanedText);
  if (passengerType) {
    fields.passengerType = passengerType;
    confidence.passengerType = clampConfidence(0.65);
  }

  const airline = extractAirline(cleanedText);
  if (airline) {
    fields.airline = airline;
    confidence.airline = clampConfidence(0.7);
  }

  const iataPair = extractIataPairs(cleanedText.toUpperCase());
  if (iataPair) {
    const normalizedOrigin = normalizeIata(iataPair.origin);
    const normalizedDestination = normalizeIata(iataPair.destination);
    if (normalizedOrigin) {
      fields.origin = normalizedOrigin;
      confidence.origin = clampConfidence(0.75);
    }
    if (normalizedDestination) {
      fields.destination = normalizedDestination;
      confidence.destination = clampConfidence(0.75);
    }
  }

  const { departure: departureDateRaw, return: returnDateRaw } = extractDates(cleanedText);
  const normalizedDepartureDate = normalizeDate(departureDateRaw);
  if (normalizedDepartureDate) {
    fields.departureDate = normalizedDepartureDate;
    confidence.departureDate = clampConfidence(0.7);
  }
  const normalizedReturnDate = normalizeDate(returnDateRaw);
  if (normalizedReturnDate) {
    fields.returnDate = normalizedReturnDate;
    confidence.returnDate = clampConfidence(0.7);
  }

  const { departure: departureTimeRaw, return: returnTimeRaw } = extractTimes(cleanedText);
  const normalizedDepartureTime = normalizeTime(departureTimeRaw);
  if (normalizedDepartureTime) {
    fields.departureTime = normalizedDepartureTime;
    confidence.departureTime = clampConfidence(0.6);
  }
  const normalizedReturnTime = normalizeTime(returnTimeRaw);
  if (normalizedReturnTime) {
    fields.returnTime = normalizedReturnTime;
    confidence.returnTime = clampConfidence(0.6);
  }

  const reservationCode = extractReservationCode(cleanedText.toUpperCase());
  if (reservationCode) {
    fields.reservationCode = reservationCode;
    confidence.reservationCode = clampConfidence(0.7);
  }

  const hotel = extractHotel(cleanedText);
  if (hotel) {
    fields.hotel = hotel;
    confidence.hotel = clampConfidence(0.5);
  }

  const operator = extractOperadora(cleanedText);
  if (operator) {
    fields.operator = operator;
    confidence.operator = clampConfidence(0.5);
  }

  const ident = extractIdent(cleanedText);
  if (ident) {
    fields.ident = ident;
    confidence.ident = clampConfidence(0.4);
  }

  const notes = extractNotes(cleanedText);
  if (notes) {
    fields.notes = notes;
    confidence.notes = clampConfidence(0.4);
  }

  return { fields, confidence, raw: text };
}
