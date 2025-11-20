import type { ReservationRecord } from '@/lib/queries/reservas';
import type { ReservationPassengerChange } from '@/types/reservation-adjustments';

export function normalizeName(value?: string | null) {
  if (!value) {
    return null;
  }
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function mapPassengerType(tipo?: string | null) {
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

export type SwapPair = {
  target: ReservationRecord;
  newPassenger: ReservationPassengerChange;
  newName: string;
  effectiveType: string | null;
};

export type SwapPreparationResult =
  | {
      pairs: SwapPair[];
    }
  | {
      error: { status: number; message: string };
    };

export type SwapApplicationResult =
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

      return { error: { status: 400, message, details: swapError.details ?? swapError.message } };
    }
  }

  return { success: true };
}
