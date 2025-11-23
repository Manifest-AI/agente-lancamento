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

function assertPasseioType(value: string): PasseioTipo {
  const normalized = normalizePasseioType(value);
  if (!normalized || normalized === UNKNOWN_PASSEIO_TYPE) {
    throw new Error('Tipo de passeio inválido.');
  }
  return normalized;
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
  const descricao = sanitizeString(body.descricao ?? null) || null;
  const reservaId = sanitizeString(body.reserva_id ?? null) || null;

  if (!idExterno || !body.data_passeio || !tipoPasseioRaw) {
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
    })
    .select('*')
    .single();

  if (insertError) {
    console.error({ requestId, route: 'passeios', error: insertError });
    return makeError(500, 'Não foi possível salvar o passeio.', requestId);
  }

  const payload: SuccessResponse = { ok: true, data, requestId };
  return NextResponse.json(payload, { status: 201 });
}
