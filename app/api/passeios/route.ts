import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { normalizePasseioDate, normalizePasseioType, type PasseioTipo } from '@/lib/passeios/normalizePasseio';
import { UNKNOWN_PASSEIO_TYPE, VALID_PASSEIO_TYPES } from '@/lib/passeios/prompt';
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

function normalizePasseioDateOnly(value?: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const datetimeMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (datetimeMatch) {
    return datetimeMatch[1];
  }

  const normalized = normalizePasseioDate(trimmed);
  if (normalized && normalized.includes('T')) {
    return normalized.split('T')[0];
  }

  return normalized;
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
  const rawPassengers = Array.isArray(body.passageiros) ? body.passageiros : [];

  const missingFields: string[] = [];
  const invalidFields: string[] = [];

  if (!idExterno) missingFields.push('id_externo');

  if (!body.data_passeio) {
    missingFields.push('data_passeio');
  }

  const dataPasseio = normalizePasseioDateOnly(body.data_passeio);
  if (body.data_passeio && !dataPasseio) {
    invalidFields.push('data_passeio');
  }

  if (!tipoPasseioRaw) {
    missingFields.push('tipo_passeio');
  }

  if (tipoPasseioRaw && !VALID_PASSEIO_TYPES.includes(tipoPasseioRaw.toUpperCase() as PasseioTipo)) {
    invalidFields.push('tipo_passeio');
  }

  if (!descricao) missingFields.push('descricao');
  if (!hotel) missingFields.push('hotel');

  if (!sanitizeString(body.regime ?? null)) {
    missingFields.push('regime');
  }
  if (sanitizeString(body.regime ?? null) && !regime) {
    invalidFields.push('regime');
  }

  const hasInvalidPassenger = rawPassengers.some((passageiro) => {
    const nome = sanitizeString(passageiro?.nome);
    const tipo = sanitizeString(passageiro?.tipo).toUpperCase();
    if (!nome || !tipo) {
      return true;
    }
    return !(tipo === 'ADT' || tipo === 'CHD' || tipo === 'INF');
  });

  if (passageiros.length === 0) {
    missingFields.push('passageiros');
  }

  if (hasInvalidPassenger) {
    invalidFields.push('passageiros');
  }

  if (missingFields.length > 0 || invalidFields.length > 0) {
    return NextResponse.json(
      {
        error: 'Campos obrigatórios ausentes ou inválidos.',
        missingFields,
        invalidFields,
        requestId,
        ok: false,
      },
      { status: 400 },
    );
  }

  let tipoPasseio: PasseioTipo;
  try {
    tipoPasseio = assertPasseioType(tipoPasseioRaw);
  } catch (error) {
    const details = error instanceof Error ? error.message : undefined;
    return makeError(400, 'Tipo de passeio inválido.', requestId, details);
  }

  if (!dataPasseio) {
    return makeError(400, 'Data do passeio em formato inválido.', requestId);
  }

  const tipoPax = passageiros[0]?.tipo ?? null;

  const supabase = getSupabaseAdminClient();

  const { data, error: insertError } = await supabase
    .from('passeios')
    .insert({
      id_externo: idExterno,
      tipo_passeio: tipoPasseio,
      descricao,
      data_passeio: dataPasseio,
      hotel,
      regime,
      passageiros,
      tipo_pax: tipoPax,
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

    if (insertError.code === '23505') {
      return makeError(409, 'Já existe um passeio com os mesmos dados.', requestId, insertError.message);
    }

    if (insertError.code && insertError.code.startsWith('23')) {
      return makeError(400, 'Violação de integridade ao salvar o passeio.', requestId, insertError.message);
    }

    if (insertError.code === '42703') {
      return makeError(
        500,
        'Estrutura da tabela de passeios incompatível com os dados enviados.',
        requestId,
        insertError.message,
      );
    }

    if (isSupabaseValidationError(insertError.code)) {
      return makeError(400, 'Dados inválidos para salvar o passeio.', requestId, insertError.message);
    }

    return makeError(500, 'Não foi possível salvar o passeio.', requestId, insertError.message);
  }

  const payload: SuccessResponse = { ok: true, data, requestId };
  return NextResponse.json(payload, { status: 201 });
}
