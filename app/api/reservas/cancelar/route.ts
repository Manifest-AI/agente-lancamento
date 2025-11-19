import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdminClient';
import type { ApplyCancellationPayload } from '@/types/reservation-adjustments';

function getAccessToken(headers: Headers) {
  const authorization = headers.get('Authorization');
  if (!authorization) {
    return null;
  }

  const [, token] = authorization.split(' ');
  return token?.trim() || null;
}

function normalizeName(value?: string | null) {
  if (!value) {
    return null;
  }
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function buildErrorResponse(status: number, message: string, details?: Record<string, unknown>) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      ...(details ? { details } : {}),
    },
    { status },
  );
}

export async function POST(request: Request) {
  const token = getAccessToken(request.headers);
  if (!token) {
    return buildErrorResponse(401, 'Não autenticado.');
  }

  let body: ApplyCancellationPayload;
  try {
    body = (await request.json()) as ApplyCancellationPayload;
  } catch (error) {
    return buildErrorResponse(400, 'JSON inválido.');
  }

  const numeroReserva = body.numeroReserva?.trim();
  if (!numeroReserva) {
    return buildErrorResponse(400, 'numeroReserva obrigatório.');
  }

  const adminClient = getSupabaseAdminClient();
  const {
    data: userData,
    error: userError,
  } = await adminClient.auth.getUser(token);

  if (userError || !userData?.user) {
    return buildErrorResponse(401, 'Sessão inválida.');
  }

  const userId = userData.user.id;

  const { data: reservations, error: fetchError } = await adminClient
    .from('reservas')
    .select('id, nome_pax')
    .eq('numero_reserva', numeroReserva)
    .eq('user_id', userId);

  if (fetchError) {
    return buildErrorResponse(500, 'Falha ao localizar a reserva.', { message: fetchError.message });
  }

  if (!reservations || reservations.length === 0) {
    return buildErrorResponse(404, 'Reserva não encontrada para este usuário.');
  }

  const scope = body.escopo === 'parcial' ? 'parcial' : 'total';
  const targetNames = (body.passageiros ?? [])
    .map((nome) => normalizeName(nome))
    .filter((nome): nome is string => Boolean(nome));

  let targetIds: string[] = [];

  if (scope === 'parcial' && targetNames.length > 0) {
    targetIds = reservations
      .filter((reservation) => {
        const normalized = normalizeName(reservation.nome_pax);
        return normalized ? targetNames.includes(normalized) : false;
      })
      .map((reservation) => reservation.id);

    if (targetIds.length === 0) {
      return buildErrorResponse(404, 'Nenhum passageiro informado foi localizado na reserva.');
    }
  } else {
    targetIds = reservations.map((reservation) => reservation.id);
  }

  const { error: updateError } = await adminClient
    .from('reservas')
    .update({ status: 'Cancelado' })
    .in('id', targetIds)
    .eq('user_id', userId);

  if (updateError) {
    return buildErrorResponse(500, 'Falha ao cancelar a reserva.', { message: updateError.message });
  }

  return NextResponse.json(
    {
      ok: true,
      stats: {
        cancelados: targetIds.length,
        escopo: scope,
      },
    },
    { status: 200 },
  );
}
