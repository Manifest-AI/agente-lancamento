import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { normalizePasseioDate, normalizePasseioType } from '@/lib/passeios/normalizePasseio';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdminClient';

export const runtime = 'nodejs';

type PasseioRequestBody = {
  operadora: string;
  id_externo: string;
  data_passeio: string;
  tipo_passeio: string;
  descricao?: string | null;
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

export async function POST(request: Request) {
  const requestId = randomUUID();
  let body: PasseioRequestBody;

  try {
    body = (await request.json()) as PasseioRequestBody;
  } catch (error) {
    return makeError(400, 'Corpo da requisição inválido.', requestId);
  }

  const operadora = sanitizeString(body.operadora);
  const idExterno = sanitizeString(body.id_externo);
  const tipoPasseioRaw = sanitizeString(body.tipo_passeio);
  const descricao = sanitizeString(body.descricao ?? null) || null;

  if (!operadora || !idExterno || !body.data_passeio) {
    return makeError(400, 'Campos obrigatórios ausentes.', requestId);
  }

  let dataPasseio: string;
  let tipoPasseio: string;
  try {
    dataPasseio = normalizePasseioDate(body.data_passeio);
    tipoPasseio = normalizePasseioType(tipoPasseioRaw);
  } catch (error) {
    const details = error instanceof Error ? error.message : undefined;
    return makeError(400, 'Dados de passeio inválidos.', requestId, details);
  }

  const supabase = getSupabaseAdminClient();

  const { data: reservas, error: reservasError } = await supabase
    .from('reservas')
    .select('id, created_at, numero_reserva')
    // "id_externo" das reservas é armazenado em "numero_reserva".
    .eq('numero_reserva', idExterno)
    .order('created_at', { ascending: false });

  if (reservasError) {
    console.error({ requestId, route: 'passeios', error: reservasError });
    return makeError(500, 'Erro ao consultar reservas para vincular o passeio.', requestId);
  }

  const reservaId = reservas?.[0]?.id ?? null;

  const { data, error: insertError } = await supabase
    .from('passeios')
    .insert({
      // Campo "operadora" ainda não existe na tabela, mas é preservado no payload para compatibilidade com a extração.
      reserva_id: reservaId,
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

  const payload: SuccessResponse = { ok: true, data: { ...data, operadora }, requestId };
  return NextResponse.json(payload, { status: 201 });
}
