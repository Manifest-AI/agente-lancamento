import { NextResponse } from 'next/server';
import type { ReservationRecord } from '@/lib/queries/reservas';
import { CANCELLATION_STATUS, sanitizeReservationStatus } from '@/lib/reservas/status';
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

function buildPassengerSwapPlan(
  addPassengers: ReservationPassengerChange[],
  removePassengers: ReservationPassengerChange[],
  reservations: ReservationRecord[],
) {
  if (addPassengers.length === 0 || removePassengers.length === 0) {
    return { swaps: [], remainingAdds: addPassengers, remainingRemoves: removePassengers };
  }

  const usedIds = new Set<string>();
  const swapPairs: { target: ReservationRecord; passenger: ReservationPassengerChange }[] = [];
  const maxPairs = Math.min(addPassengers.length, removePassengers.length);

  for (let index = 0; index < maxPairs; index += 1) {
    const removalCandidate = removePassengers[index];
    const normalizedName = normalizeName(removalCandidate.nome);

    if (!normalizedName) {
      return {
        error: buildErrorResponse(404, 'Passageiro para substituição não encontrado.'),
      } as const;
    }

    const targetReservation = reservations.find((reservation) => {
      return !usedIds.has(reservation.id) && normalizeName(reservation.nome_pax) === normalizedName;
    });

    if (!targetReservation) {
      return {
        error: buildErrorResponse(404, 'Passageiro para substituição não encontrado.'),
      } as const;
    }

    usedIds.add(targetReservation.id);
    swapPairs.push({ target: targetReservation, passenger: addPassengers[index] });
  }

  return {
    swaps: swapPairs,
    remainingAdds: addPassengers.slice(maxPairs),
    remainingRemoves: removePassengers.slice(maxPairs),
  } as const;
}

const REQUIRED_RESERVATION_FIELDS: { field: string; label: string; validator?: (value: string) => boolean }[] = [
  { field: 'operadora', label: 'Operadora' },
  { field: 'origem', label: 'Origem' },
  { field: 'destino', label: 'Destino' },
  { field: 'cia_aerea', label: 'Companhia aérea' },
  { field: 'data_voo_ida', label: 'Data do voo de ida' },
  { field: 'hora_voo_ida', label: 'Hora do voo de ida' },
  { field: 'data_voo_volta', label: 'Data do voo de volta' },
  { field: 'hora_voo_volta', label: 'Hora do voo de volta' },
  { field: 'localizador', label: 'Localizador' },
  { field: 'codigo_reserva', label: 'Código da reserva' },
  { field: 'regime', label: 'Regime', validator: (value) => ['PRIVATIVO', 'REGULAR'].includes(value.trim().toUpperCase()) },
  {
    field: 'ident',
    label: 'Ident',
    validator: (value) => ['BPS', 'AA/TR', 'BUE', 'BUE/A', 'BUE/T'].includes(value.trim().toUpperCase()),
  },
];

function deriveFieldFromReservations(field: string, reservations: ReservationRecord[]) {
  for (const reservation of reservations) {
    const value = (reservation as Record<string, string | null | undefined>)[field];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return null;
}

function fillMissingRequiredFields(
  payload: Record<string, string | null>,
  reservations: ReservationRecord[],
): Record<string, string | null> {
  const filledPayload: Record<string, string | null> = { ...payload };

  REQUIRED_RESERVATION_FIELDS.forEach(({ field }) => {
    const value = filledPayload[field];
    if (!value || !`${value}`.trim()) {
      const derived = deriveFieldFromReservations(field, reservations);
      if (derived) {
        filledPayload[field] = derived;
      }
    }
  });

  return filledPayload;
}

function validateRequiredFields(payload: Record<string, string | null>) {
  const missing: string[] = [];
  const invalid: string[] = [];

  REQUIRED_RESERVATION_FIELDS.forEach(({ field, label, validator }) => {
    const value = payload[field];
    if (!value || !`${value}`.trim()) {
      missing.push(label);
      return;
    }

    if (validator && !validator(value)) {
      invalid.push(label);
    }
  });

  if (missing.length > 0 || invalid.length > 0) {
    const parts: string[] = [];
    if (missing.length > 0) {
      parts.push(`Campos obrigatórios ausentes: ${missing.join(', ')}.`);
    }
    if (invalid.length > 0) {
      parts.push(`Campos com valores inválidos: ${invalid.join(', ')}.`);
    }

    return {
      message: parts.join(' '),
      details: { missing, invalid },
    };
  }

  return null;
}

function isActiveReservation(reservation: ReservationRecord) {
  return sanitizeReservationStatus(reservation.status) !== CANCELLATION_STATUS;
}

function buildReservationTemplate(reservations: ReservationRecord[]) {
  const [primaryReservation, ...otherReservations] = [...reservations].sort((current, next) => {
    return Number(isActiveReservation(next)) - Number(isActiveReservation(current));
  });

  const template: ReservationRecord = { ...primaryReservation };

  otherReservations.forEach((reservation) => {
    if (isActiveReservation(reservation) && !isActiveReservation(template)) {
      template.status = reservation.status;
    }

    Object.entries(reservation).forEach(([key, value]) => {
      if (key === 'id' || key === 'created_at' || key === 'status') {
        return;
      }

      if (value === null || value === undefined) {
        return;
      }

      const stringValue = typeof value === 'string' ? value.trim() : `${value}`;
      if (!stringValue) {
        return;
      }

      const currentValue = (template as Record<string, string | null | undefined>)[key];
      if (!currentValue || !`${currentValue}`.trim()) {
        (template as Record<string, string | null | undefined>)[key] = value;
      }
    });
  });

  return template;
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
  const updatePayload = updates.reduce<Record<string, string | null>>((acc, update) => {
    acc[update.field] = update.value;
    return acc;
  }, {});

  const swapPlan = buildPassengerSwapPlan(addPassengers, removePassengers, reservations as ReservationRecord[]);

  if ('error' in swapPlan) {
    return swapPlan.error;
  }

  const stats: AlterationStats = { updated: 0, added: 0, removed: 0 };

  if (updates.length > 0) {
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

  if (swapPlan.swaps.length > 0) {
    // Atualiza os passageiros em place para evitar cancelamento e recriação
    for (const swapPair of swapPlan.swaps) {
      const newPassenger = swapPair.passenger;
      const newName = newPassenger.nome?.trim().replace(/\s+/g, ' ');

      if (!newName) {
        return buildErrorResponse(400, 'Nome do passageiro é obrigatório para troca.');
      }

      const normalizedType = mapPassengerType(newPassenger.tipo);

      if (newPassenger.tipo && !normalizedType) {
        return buildErrorResponse(400, 'Tipo de passageiro inválido para troca.');
      }

      const swapPayload: Record<string, string> = {
        nome_pax: newName,
      };

      const targetType = mapPassengerType(swapPair.target.tipo_pax);
      const effectiveType = normalizedType ?? targetType ?? 'A';

      if (!effectiveType) {
        return buildErrorResponse(400, 'Tipo de passageiro inválido para troca.');
      }

      swapPayload.tipo_pax = effectiveType;

      const { error: swapError } = await adminClient
        .from('reservas')
        .update(swapPayload)
        .eq('id', swapPair.target.id)
        .eq('user_id', userId);

      if (swapError) {
        console.error('[reservas/alterar] Falha ao trocar passageiro.', {
          numeroReserva,
          message: swapError.message,
          details: swapError.details,
          payload: swapPayload,
          effectiveType,
          code: swapError.code,
        });

        const swapMessage = swapError.message?.toLowerCase() || '';
        const isEnumViolation =
          swapError.code === '22P02' || swapMessage.includes('invalid input value for enum');
        const isNotNullViolation = swapError.code === '23502' || swapMessage.includes('not-null');
        const isValidationError =
          swapMessage.includes('tipo_pax') || swapMessage.includes('nome_pax') || isEnumViolation || isNotNullViolation;

        const status = isValidationError ? 400 : 500;
        const message = isEnumViolation
          ? 'Tipo de passageiro inválido: use A (Adulto), C (Criança) ou I (Bebê).'
          : isNotNullViolation
            ? 'Dados obrigatórios ausentes ao trocar passageiro. Confira nome e tipo.'
            : isValidationError
              ? 'Não foi possível trocar o passageiro: verifique nome e tipo informados.'
              : 'Falha ao trocar passageiro.';

        return buildErrorResponse(status, message, {
          message: swapError.message,
          code: swapError.code,
        });
      }
    }

    stats.updated += swapPlan.swaps.length;
  }

  const remainingRemovals = swapPlan.remainingRemoves;

  if (remainingRemovals.length > 0) {
    const usedIds = new Set<string>();
    const targetIds: string[] = [];

    remainingRemovals.forEach((change) => {
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
        .update({ status: CANCELLATION_STATUS })
        .in('id', targetIds)
        .eq('user_id', userId);

      if (cancelError) {
        return buildErrorResponse(500, 'Falha ao atualizar passageiros removidos.', { message: cancelError.message });
      }

      stats.removed = targetIds.length;
    }
  }

  const remainingAdds = swapPlan.remainingAdds;

  if (remainingAdds.length > 0) {
    const invalidPassenger = remainingAdds.find((passenger) => !passenger.nome || !passenger.nome.trim());

    if (invalidPassenger) {
      return buildErrorResponse(400, 'Nome do passageiro é obrigatório para adicionar um novo passageiro.');
    }

    const templateReservation = buildReservationTemplate(reservations as ReservationRecord[]);
    const { id: _id, created_at: _createdAt, ...restReservation } = templateReservation;
    const sanitizedStatus = sanitizeReservationStatus(templateReservation.status, (rejectedStatus) => {
      console.error('[reservas/alterar] Ignorando status inválido ao adicionar passageiros.', {
        numeroReserva,
        rejectedStatus,
      });
    });
    const basePassengerType = mapPassengerType(templateReservation.tipo_pax) ?? 'A';
    const basePayload = {
      ...restReservation,
      ...updatePayload,
      numero_reserva: numeroReserva,
      user_id: userId,
      status: sanitizedStatus,
      obs: restReservation.obs ?? null,
    } as Record<string, string | null>;

    const validationIssues = validateRequiredFields(basePayload);

    if (validationIssues) {
      return buildErrorResponse(400, validationIssues.message, validationIssues.details);
    }

    const enrichedBasePayload = fillMissingRequiredFields(basePayload, reservations);
    const enrichedValidationIssues = validateRequiredFields(enrichedBasePayload);

    if (enrichedValidationIssues) {
      return buildErrorResponse(400, enrichedValidationIssues.message, enrichedValidationIssues.details);
    }

      const insertPayload = remainingAdds.map((passenger) => {
        const passengerName = passenger.nome?.trim() as string;
        const passengerType = mapPassengerType(passenger.tipo) ?? basePassengerType;

        return {
          ...enrichedBasePayload,
          nome_pax: passengerName,
          tipo_pax: passengerType,
        };
      });

    const { error: insertError } = await adminClient.from('reservas').insert(insertPayload);

    if (insertError) {
      console.error('[reservas/alterar] Falha ao adicionar passageiros.', {
        numeroReserva,
        message: insertError.message,
        details: insertError.details,
      });
      return buildErrorResponse(500, 'Falha ao adicionar passageiros.', { message: insertError.message });
    }

    stats.added = insertPayload.length;
  }

  return buildSuccessResponse(stats);
}
