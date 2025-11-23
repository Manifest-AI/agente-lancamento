import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { normalizePasseioDate, normalizePasseioType, type PasseioTipo } from '@/lib/passeios/normalizePasseio';
import { UNKNOWN_PASSEIO_TYPE } from '@/lib/passeios/prompt';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdminClient';

export const runtime = 'nodejs';

type PasseioRequestBody = {
  id_externo: string;
  data_passeio: string;
  tipo_passeio: string;
  descricao?: string | null;
  hotel?: string | null;
  regime?: string | null;
  passageiros?: { nome?: string | null; tipo?: string | null }[];
  reserva_id?: string | null;
};

type SuccessResponse = {
  ok: true;
  data: unknown;
  requestId: string;
};

type ErrorResponse = {
  ok: false;
  error: string;
  requestId: string;
  details?: string;
};

function makeError(status: number, error: string, requestId: string, details?: string) {
  const payload: ErrorResponse = details
    ? { ok: false, error, requestId, details }
    : { ok: false, error, requestId };
  return NextResponse.json(payload, { status });
}

function sanitizeString(value?: string | null) {
  return value?.trim() ?? '';
}

function normalizeRegime(value?: string | null) {
  const normalized = sanitizeString(value).toUpperCase();
  return normalized === 'PRIVATIVO' || normalized === 'REGULAR' ? normalized : '';
}

function normalizePassengers(passageiros?: PasseioRequestBody['passageiros']) {
  if (!Array.isArray(passageiros)) {
    return [] as { nome: string; tipo: 'ADT' | 'CHD' | 'INF' }[];
  }

  return passageiros
    .map((passageiro) => ({
      nome: sanitizeString(passageiro?.nome).toUpperCase(),
      tipo: sanitizeString(passageiro?.tipo).toUpperCase() as 'ADT' | 'CHD' | 'INF' | '',
    }))
    .filter((passageiro) =>
      Boolean(
        passageiro.nome &&
          (passageiro.tipo === 'ADT' || passageiro.tipo === 'CHD' || passageiro.tipo === 'INF'),
      ),
    )
    .map((passageiro) => ({ nome: passageiro.nome, tipo: passageiro.tipo }));
}

function assertPasseioType(value: string): PasseioTipo {
  const normalized = normalizePasseioType(value);
  if (!normalized || normalized === UNKNOWN_PASSEIO_TYPE) {
    throw new Error('Tipo de passeio inválido.');
  }
  return normalized;
}

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isSupabaseValidationError(code?: string) {
  const validationCodes = new Set(['22P02', '23502', '23514', 'PGRST302', 'PGRST303', 'PGRST304']);
  return code ? validationCodes.has(code) : false;
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  let body: PasseioRequestBody;

  try {
    body = (await request.json()) as PasseioRequestBody;
  } catch (error) {
    return makeError(400, 'Corpo da requisição inválido.', requestId);
  }

  const idExterno = sanitizeString(body.id_externo);
  const tipoPasseioRaw = sanitizeString(body.tipo_passeio);
  const descricao = sanitizeString(body.descricao ?? null);
  const hotel = sanitizeString(body.hotel ?? null);
  const regime = normalizeRegime(body.regime ?? null);
  const passageiros = normalizePassengers(body.passageiros);
  const reservaId = sanitizeString(body.reserva_id ?? null) || null;

  if (reservaId && !isValidUuid(reservaId)) {
    return makeError(400, 'Reserva associada inválida.', requestId);
  }

  if (
    !idExterno ||
    !body.data_passeio ||
    !tipoPasseioRaw ||
    !descricao ||
    !hotel ||
    !regime ||
    passageiros.length === 0
  ) {
    return makeError(400, 'Campos obrigatórios ausentes.', requestId);
  }

  const dataPasseio = normalizePasseioDate(body.data_passeio);
  if (!dataPasseio) {
    return makeError(400, 'Data do passeio em formato inválido.', requestId);
  }

  let tipoPasseio: PasseioTipo;
  try {
    tipoPasseio = assertPasseioType(tipoPasseioRaw);
  } catch (error) {
    const details = error instanceof Error ? error.message : undefined;
    return makeError(400, 'Tipo de passeio inválido.', requestId, details);
  }

  const supabase = getSupabaseAdminClient();

  const { data, error: insertError } = await supabase
    .from('passeios')
    .insert({
      reserva_id: reservaId || null,
      id_externo: idExterno,
      tipo_passeio: tipoPasseio,
      descricao,
      data_passeio: dataPasseio,
      hotel,
      regime,
      passageiros,
    })
    .select('*')
    .single();

  if (insertError) {
    console.error('Erro ao inserir passeio no Supabase', {
      requestId,
      route: 'passeios',
      code: insertError.code,
      message: insertError.message,
      details: insertError.details,
      hint: insertError.hint,
    });

    if (isSupabaseValidationError(insertError.code)) {
      return makeError(400, 'Dados inválidos para salvar o passeio.', requestId, insertError.message);
    }

    return makeError(500, 'Não foi possível salvar o passeio.', requestId);
  }

  const payload: SuccessResponse = { ok: true, data, requestId };
  return NextResponse.json(payload, { status: 201 });
}
