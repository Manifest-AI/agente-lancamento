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

type SwapPair = {
  target: ReservationRecord;
  newPassenger: ReservationPassengerChange;
  newName: string;
  effectiveType: string | null;
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

function canUsePassengerSwap(addPassengers: ReservationPassengerChange[], removePassengers: ReservationPassengerChange[]) {
  if (addPassengers.length === 0 || removePassengers.length === 0) {
    return false;
  }

  if (addPassengers.length !== removePassengers.length) {
    return false;
  }

  const allNamesPresent = [...addPassengers, ...removePassengers].every((passenger) =>
    Boolean(passenger.nome && passenger.nome.trim()),
  );

  return allNamesPresent;
}

type SwapPreparationResult =
  | {
      pairs: SwapPair[];
    }
  | {
      error: { status: number; message: string };
    };

type SwapApplicationResult =
  | { success: true }
  | { error: { status: number; message: string; details?: unknown } };

export function preparePassengerSwaps(
  reservations: ReservationRecord[],
  removePassengers: ReservationPassengerChange[],
  addPassengers: ReservationPassengerChange[],
): SwapPreparationResult {
  const usedIds = new Set<string>();
  const swapTargets: ReservationRecord[] = [];

  for (const change of removePassengers) {
    const normalizedName = normalizeName(change.nome);
    if (!normalizedName) {
      continue;
    }

    const targetReservation = reservations.find((reservation) => {
      return !usedIds.has(reservation.id) && normalizeName(reservation.nome_pax) === normalizedName;
    });

    if (!targetReservation) {
      return { error: { status: 404, message: 'Passageiro para substituição não encontrado.' } };
    }

    usedIds.add(targetReservation.id);
    swapTargets.push(targetReservation);
  }

  const remainingReservations = reservations.filter((reservation) => !usedIds.has(reservation.id));
  const remainingNames = new Set(
    remainingReservations.map((reservation) => normalizeName(reservation.nome_pax)).filter(Boolean) as string[],
  );

  const finalNames = new Set<string>();
  const pairs: SwapPair[] = [];

  for (let index = 0; index < swapTargets.length; index += 1) {
    const target = swapTargets[index];
    const newPassenger = addPassengers[index];
    const newName = newPassenger.nome?.trim().replace(/\s+/g, ' ');

    if (!newName) {
      return { error: { status: 400, message: 'Nome do passageiro é obrigatório para troca.' } };
    }

    const normalizedNewName = normalizeName(newName);

    if (normalizedNewName && finalNames.has(normalizedNewName)) {
      return {
        error: { status: 400, message: `Nomes duplicados na troca: "${newName}" já foi informado.` },
      };
    }

    if (normalizedNewName && remainingNames.has(normalizedNewName)) {
      return {
        error: {
          status: 400,
          message: `Não é possível trocar o passageiro: o nome "${newName}" já está em uso na reserva.`,
        },
      };
    }

    const normalizedType = mapPassengerType(newPassenger.tipo);

    if (newPassenger.tipo && !normalizedType) {
      return { error: { status: 400, message: 'Tipo de passageiro inválido para troca.' } };
    }

    if (normalizedNewName) {
      finalNames.add(normalizedNewName);
    }

    const targetType = mapPassengerType(target.tipo_pax);
    const effectiveType = normalizedType ?? targetType ?? null;

    pairs.push({ target, newPassenger, newName, effectiveType });
  }

  return { pairs };
}

export async function applyPassengerSwaps(
  pairs: SwapPair[],
  updatePassenger: (target: ReservationRecord, payload: Record<string, string>) => Promise<{
    error: { message: string; details?: unknown } | null;
  }>,
  numeroReserva: string,
): Promise<SwapApplicationResult> {
  const swapMarker = `__swap__${Date.now()}`;

  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index];
    const tempName = `${pair.target.nome_pax ?? 'passageiro'} ${swapMarker}_${index}`;
    const tempPayload: Record<string, string> = {
      nome_pax: tempName,
      passageiro: tempName,
    };

    const { error: tempError } = await updatePassenger(pair.target, tempPayload);

    if (tempError) {
      console.error('[reservas/alterar] Falha na etapa temporária da troca de passageiro.', {
        numeroReserva,
        message: tempError.message,
        details: tempError.details,
      });
      return {
        error: {
          status: 500,
          message: 'Falha ao preparar troca de passageiro.',
          details: tempError.message,
        },
      };
    }
  }

  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index];
    const swapPayload: Record<string, string> = {
      nome_pax: pair.newName,
      passageiro: pair.newName,
    };

    if (pair.effectiveType) {
      swapPayload.tipo_pax = pair.effectiveType;
    }

    const { error: swapError } = await updatePassenger(pair.target, swapPayload);

    if (swapError) {
      console.error('[reservas/alterar] Falha ao trocar passageiro.', {
        numeroReserva,
        message: swapError.message,
        details: swapError.details,
      });

      const swapMessage = swapError.message?.toLowerCase() || '';
      const isValidationError =
        swapMessage.includes('duplicate key value') ||
        swapMessage.includes('tipo_pax') ||
        swapMessage.includes('nome_pax') ||
        swapMessage.includes('not-null') ||
        swapMessage.includes('invalid input value for enum');

      const message = isValidationError
        ? 'Não foi possível trocar o passageiro: verifique nome e tipo informados.'
        : 'Falha ao trocar passageiro.';

      return { error: { status: isValidationError ? 400 : 500, message, details: swapError.message } };
    }
  }

  return { success: true };
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
  const shouldSwapPassengers = canUsePassengerSwap(addPassengers, removePassengers);

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

  if (shouldSwapPassengers) {
    const swapPreparation = preparePassengerSwaps(reservations, removePassengers, addPassengers);

    if ('error' in swapPreparation) {
      return buildErrorResponse(swapPreparation.error.status, swapPreparation.error.message);
    }

    const swapResult = await applyPassengerSwaps(
      swapPreparation.pairs,
      (target, payload) =>
        adminClient.from('reservas').update(payload).eq('id', target.id).eq('user_id', userId),
      numeroReserva,
    );

    if ('error' in swapResult) {
      return buildErrorResponse(swapResult.error.status, swapResult.error.message, swapResult.error.details);
    }

    stats.updated += swapPreparation.pairs.length;

    return buildSuccessResponse(stats);
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
        .update({ status: CANCELLATION_STATUS })
        .in('id', targetIds)
        .eq('user_id', userId);

      if (cancelError) {
        return buildErrorResponse(500, 'Falha ao atualizar passageiros removidos.', { message: cancelError.message });
      }

      stats.removed = targetIds.length;
    }
  }

  if (addPassengers.length > 0) {
    const invalidPassenger = addPassengers.find((passenger) => !passenger.nome || !passenger.nome.trim());

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

    const insertPayload = addPassengers.map((passenger) => {
      const passengerName = passenger.nome?.trim() as string;
      const passengerType = mapPassengerType(passenger.tipo) ?? basePassengerType;

      return {
        ...enrichedBasePayload,
        nome_pax: passengerName,
        passageiro: passengerName,
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
