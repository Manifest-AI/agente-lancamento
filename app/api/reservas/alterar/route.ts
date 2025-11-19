import { NextResponse } from 'next/server';
import type { ReservationRecord } from '@/lib/queries/reservas';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdminClient';
import type {
  ApplyAlterationPayload,
  ReservationFieldUpdate,
  ReservationPassengerChange,
} from '@/types/reservation-adjustments';

function getAccessToken(headers: Headers) {
  const authorization = headers.get('Authorization');
  if (!authorization) {
    return null;
  }

  const [, token] = authorization.split(' ');
  return token?.trim() || null;
}

function normalizeDate(value: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
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

  return trimmed;
}

function normalizeTime(value: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const fullMatch = trimmed.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (fullMatch) {
    return `${fullMatch[1]}:${fullMatch[2]}`;
  }

  return trimmed;
}

function mapFieldUpdate(update: ReservationFieldUpdate) {
  switch (update.field) {
    case 'data_chegada':
    case 'data_saida':
      return { field: update.field, value: normalizeDate(update.value) };
    case 'horario_voo_chegada':
    case 'horario_voo_saida':
      return { field: update.field, value: normalizeTime(update.value) };
    case 'hotel':
    case 'ident':
      return { field: update.field, value: update.value?.trim() || null };
    case 'voo_chegada':
    case 'voo_saida':
    default:
      return { field: update.field, value: update.value?.trim().toUpperCase() || null };
  }
}

function mapPassengerType(tipo?: string | null) {
  if (!tipo) {
    return null;
  }

  const normalized = tipo.trim().toUpperCase();
  if (normalized === 'ADT' || normalized === 'A') {
    return 'A';
  }
  if (normalized === 'CHD' || normalized === 'C') {
    return 'C';
  }
  if (normalized === 'INF' || normalized === 'I') {
    return 'I';
  }
  return null;
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

type AlterationStats = {
  updated: number;
  added: number;
  removed: number;
};

function buildSuccessResponse(stats: AlterationStats) {
  return NextResponse.json(
    {
      ok: true,
      stats,
    },
    { status: 200 },
  );
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

function resolveFieldUpdates(updates?: ReservationFieldUpdate[]) {
  if (!updates) {
    return [];
  }

  return updates.map(mapFieldUpdate).filter((item) => Boolean(item.field));
}

function expandPassengers(changes?: ReservationPassengerChange[]) {
  if (!changes) {
    return [];
  }

  const expanded: ReservationPassengerChange[] = [];
  changes.forEach((change) => {
    const quantity = Math.max(1, change.quantidade ?? 1);
    for (let index = 0; index < quantity; index += 1) {
      expanded.push({
        nome: change.nome?.trim() || null,
        tipo: mapPassengerType(change.tipo),
        quantidade: 1,
      });
    }
  });
  return expanded;
}

export async function POST(request: Request) {
  const token = getAccessToken(request.headers);
  if (!token) {
    return buildErrorResponse(401, 'Não autenticado.');
  }

  let body: ApplyAlterationPayload;
  try {
    body = (await request.json()) as ApplyAlterationPayload;
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
    .select('*')
    .eq('numero_reserva', numeroReserva)
    .eq('user_id', userId);

  if (fetchError) {
    return buildErrorResponse(500, 'Falha ao carregar a reserva alvo.', { message: fetchError.message });
  }

  if (!reservations || reservations.length === 0) {
    return buildErrorResponse(404, 'Reserva não encontrada para este usuário.');
  }

  const updates = resolveFieldUpdates(body.updates);
  const addPassengers = expandPassengers(body.addPassengers);
  const removePassengers = expandPassengers(body.removePassengers);

  const stats: AlterationStats = { updated: 0, added: 0, removed: 0 };

  if (updates.length > 0) {
    const updatePayload = updates.reduce<Record<string, string | null>>((acc, update) => {
      acc[update.field] = update.value;
      return acc;
    }, {});

    const { error: updateError } = await adminClient
      .from('reservas')
      .update(updatePayload)
      .eq('numero_reserva', numeroReserva)
      .eq('user_id', userId);

    if (updateError) {
      return buildErrorResponse(500, 'Falha ao aplicar atualização.', { message: updateError.message });
    }

    stats.updated = reservations.length;
  }

  if (removePassengers.length > 0) {
    const usedIds = new Set<string>();
    const targetIds: string[] = [];

    removePassengers.forEach((change) => {
      const normalizedName = normalizeName(change.nome);
      if (!normalizedName) {
        return;
      }

      reservations.forEach((reservation) => {
        if (usedIds.has(reservation.id)) {
          return;
        }

        if (normalizeName(reservation.nome_pax) === normalizedName) {
          usedIds.add(reservation.id);
          targetIds.push(reservation.id);
        }
      });
    });

    if (targetIds.length > 0) {
      const { error: cancelError } = await adminClient
        .from('reservas')
        .update({ status: 'Cancelado' })
        .in('id', targetIds)
        .eq('user_id', userId);

      if (cancelError) {
        return buildErrorResponse(500, 'Falha ao atualizar passageiros removidos.', { message: cancelError.message });
      }

      stats.removed = targetIds.length;
    }
  }

  if (addPassengers.length > 0) {
    const baseReservation = reservations[0] as ReservationRecord;
    const basePayload = {
      operadora: baseReservation.operadora,
      data_chegada: updates.find((item) => item.field === 'data_chegada')?.value ?? baseReservation.data_chegada,
      data_saida: updates.find((item) => item.field === 'data_saida')?.value ?? baseReservation.data_saida,
      ident: updates.find((item) => item.field === 'ident')?.value ?? baseReservation.ident,
      voo_chegada: updates.find((item) => item.field === 'voo_chegada')?.value ?? baseReservation.voo_chegada,
      voo_saida: updates.find((item) => item.field === 'voo_saida')?.value ?? baseReservation.voo_saida,
      horario_voo_chegada:
        updates.find((item) => item.field === 'horario_voo_chegada')?.value ?? baseReservation.horario_voo_chegada,
      horario_voo_saida:
        updates.find((item) => item.field === 'horario_voo_saida')?.value ?? baseReservation.horario_voo_saida,
      hotel: updates.find((item) => item.field === 'hotel')?.value ?? baseReservation.hotel,
      numero_reserva: numeroReserva,
      user_id: userId,
      status: 'Ativo',
      obs: baseReservation.obs ?? null,
    } as Record<string, string | null>;

    const insertPayload = addPassengers.map((passenger) => ({
      ...basePayload,
      nome_pax: passenger.nome ?? null,
      tipo_pax: passenger.tipo ?? null,
    }));

    const { error: insertError } = await adminClient.from('reservas').insert(insertPayload);

    if (insertError) {
      return buildErrorResponse(500, 'Falha ao adicionar passageiros.', { message: insertError.message });
    }

    stats.added = insertPayload.length;
  }

  return buildSuccessResponse(stats);
}
