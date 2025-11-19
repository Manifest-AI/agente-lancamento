'use client';

import { useMemo } from 'react';
import type { ExtractedAlteration, AlterationFieldChange } from '@/lib/reservas/alteracao';
import type { ReservationRecord } from '@/lib/queries/reservas';
import type {
  ApplyAlterationPayload,
  ReservationFieldUpdateField,
  ReservationLookupState,
  ReservationPassengerChange,
} from '@/types/reservation-adjustments';
import { formatBR, parseStrictBrDate } from '@/lib/dateBr';

function toIsoDate(value: string | null) {
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
  const parsed = parseStrictBrDate(trimmed);
  if (!parsed) {
    return trimmed;
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toTime(value: string | null) {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(/^(\d{2})([:h]?(\d{2}))?/i);
  if (!match) {
    return trimmed;
  }
  const hours = match[1];
  const minutes = match[3] ?? '00';
  return `${hours}:${minutes}`;
}

function formatTimeDisplay(value: string | null | undefined) {
  if (!value) {
    return '-';
  }
  if (/^\d{2}:\d{2}$/.test(value)) {
    return value;
  }
  if (/^\d{2}:\d{2}:\d{2}$/.test(value)) {
    return value.slice(0, 5);
  }
  const normalized = toTime(value);
  return normalized ?? '-';
}

function formatFieldValue(field: ReservationFieldUpdateField, value: string | null | undefined) {
  switch (field) {
    case 'data_chegada':
    case 'data_saida':
      return formatBR(value ?? null) || '-';
    case 'horario_voo_chegada':
    case 'horario_voo_saida':
      return formatTimeDisplay(value);
    default:
      return value?.toString() || '-';
  }
}

function normalizePassengerType(value?: string | null): 'A' | 'C' | 'I' | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toUpperCase();
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

const FIELD_LABELS: Record<AlterationFieldChange['campo'], { label: string; field?: ReservationFieldUpdateField }> = {
  data_chegada_bps: { label: 'Data de chegada', field: 'data_chegada' },
  data_saida_bps: { label: 'Data de saída', field: 'data_saida' },
  voo_chegada_codigo: { label: 'Voo de chegada', field: 'voo_chegada' },
  voo_saida_codigo: { label: 'Voo de saída', field: 'voo_saida' },
  hora_chegada_bps: { label: 'Horário de chegada', field: 'horario_voo_chegada' },
  hora_saida_bps: { label: 'Horário de saída', field: 'horario_voo_saida' },
  hotel: { label: 'Hotel', field: 'hotel' },
  regime: { label: 'Regime' },
  ident: { label: 'IDENT', field: 'ident' },
  outro: { label: 'Outro campo' },
};

function mapFieldChange(
  change: AlterationFieldChange,
  baseReservation: ReservationRecord | null,
):
  | {
      label: string;
      field?: ReservationFieldUpdateField;
      before: string;
      after: string;
      value: string | null;
    }
  | null {
  const meta = FIELD_LABELS[change.campo];
  if (!meta) {
    return null;
  }

  if (!meta.field) {
    return {
      label: meta.label,
      before: '-',
      after: change.para ?? change.de ?? '-',
      value: null,
    };
  }

  const beforeValue = baseReservation ? (baseReservation as Record<string, string | null | undefined>)[meta.field] : null;

  let normalized: string | null = change.para ?? null;
  if (meta.field === 'data_chegada' || meta.field === 'data_saida') {
    normalized = toIsoDate(change.para ?? null);
  } else if (meta.field === 'horario_voo_chegada' || meta.field === 'horario_voo_saida') {
    normalized = toTime(change.para ?? null);
  } else if (meta.field === 'voo_chegada' || meta.field === 'voo_saida') {
    normalized = change.para?.trim().toUpperCase() ?? null;
  } else if (meta.field === 'ident') {
    normalized = change.para?.trim().toUpperCase() ?? null;
  } else if (meta.field === 'hotel') {
    normalized = change.para?.trim() || null;
  }

  return {
    label: meta.label,
    field: meta.field,
    before: formatFieldValue(meta.field, typeof beforeValue === 'string' ? beforeValue : null),
    after: meta.field?.startsWith('data')
      ? formatBR(change.para ?? null) || '-'
      : meta.field?.startsWith('horario')
        ? formatTimeDisplay(change.para ?? null)
        : change.para?.toString() || '-',
    value: normalized,
  };
}

type AlterationPreviewPanelProps = {
  alteration: ExtractedAlteration;
  reservations: ReservationRecord[];
  lookupStatus: ReservationLookupState;
  onApply: (payload: ApplyAlterationPayload) => void;
  onRetry: () => void;
  onDiscard: () => void;
  isApplying: boolean;
};

export function AlterationPreviewPanel({
  alteration,
  reservations,
  lookupStatus,
  onApply,
  onRetry,
  onDiscard,
  isApplying,
}: AlterationPreviewPanelProps) {
  const baseReservation = reservations[0] ?? null;
  const numeroReserva = alteration.referencia_reserva.numero_reserva?.trim() || baseReservation?.numero_reserva || '';

  const fieldChanges = useMemo(() => {
    return alteration.mudancas
      .filter((change): change is AlterationFieldChange => change.tipo === 'alteracao_campo')
      .map((change) => mapFieldChange(change, baseReservation))
      .filter((change): change is NonNullable<typeof change> => Boolean(change?.field));
  }, [alteration.mudancas, baseReservation]);

  const addPassengers = useMemo<
    (ReservationPassengerChange & { displayTipo: string })[]
  >(() => {
    return alteration.mudancas
      .filter((change) => change.tipo === 'adicionar_pax')
      .map((change) => ({
        nome: change.nome?.trim() || null,
        tipo: normalizePassengerType(change.tipo_pax),
        quantidade: Math.max(1, change.quantidade ?? 1),
        displayTipo: change.tipo_pax ?? '-',
      }));
  }, [alteration.mudancas]);

  const removePassengers = useMemo<
    (ReservationPassengerChange & { displayTipo: string })[]
  >(() => {
    return alteration.mudancas
      .filter((change) => change.tipo === 'remover_pax')
      .map((change) => ({
        nome: change.nome?.trim() || null,
        tipo: normalizePassengerType(change.tipo_pax),
        quantidade: Math.max(1, change.quantidade ?? 1),
        displayTipo: change.tipo_pax ?? '-',
      }));
  }, [alteration.mudancas]);

  const otherChanges = useMemo(
    () =>
      alteration.mudancas.filter(
        (change): change is AlterationFieldChange =>
          change.tipo === 'alteracao_campo' && !FIELD_LABELS[change.campo]?.field,
      ),
    [alteration.mudancas],
  );

  const canApply =
    Boolean(numeroReserva) &&
    lookupStatus === 'loaded' &&
    (fieldChanges.length > 0 || addPassengers.length > 0 || removePassengers.length > 0);

  const applyPayload: ApplyAlterationPayload = useMemo(
    () => ({
      numeroReserva: numeroReserva || '',
      updates: fieldChanges.map((change) => ({ field: change.field!, value: change.value })),
      addPassengers: addPassengers.flatMap((passenger) => {
        const quantity = passenger.quantidade ?? 1;
        return Array.from({ length: quantity }).map(() => ({
          nome: passenger.nome,
          tipo: passenger.tipo,
          quantidade: 1,
        }));
      }),
      removePassengers: removePassengers.flatMap((passenger) => {
        const quantity = passenger.quantidade ?? 1;
        return Array.from({ length: quantity }).map(() => ({
          nome: passenger.nome,
          tipo: passenger.tipo,
          quantidade: 1,
        }));
      }),
    }),
    [addPassengers, fieldChanges, numeroReserva, removePassengers],
  );

  const lookupMessage = useMemo(() => {
    switch (lookupStatus) {
      case 'loading':
        return 'Buscando reserva correspondente...';
      case 'not_found':
        return 'Reserva não localizada para o número informado.';
      case 'error':
        return 'Falha ao consultar o banco. Tente novamente.';
      case 'loaded':
        return `Encontramos ${reservations.length} registro(s) dessa reserva.`;
      default:
        return null;
    }
  }, [lookupStatus, reservations.length]);

  const passengerList = reservations.map((reservation) => reservation.nome_pax).filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase text-slate-500">Número da reserva</p>
          <p className="text-lg font-semibold text-slate-900">{numeroReserva || 'Não identificado'}</p>
          <p className="text-sm text-slate-600">
            Operadora: {alteration.referencia_reserva.operadora || baseReservation?.operadora || 'Não informado'}
          </p>
          {lookupMessage ? <p className="text-sm text-slate-500">{lookupMessage}</p> : null}
          {passengerList.length > 0 ? (
            <p className="text-xs text-slate-500">
              Passageiros cadastrados: {passengerList.join(', ')}
            </p>
          ) : null}
        </div>
      </div>

      {fieldChanges.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase text-slate-500">Campos alterados</h3>
          <dl className="mt-4 divide-y divide-slate-100">
            {fieldChanges.map((change) => (
              <div key={change.label} className="grid gap-2 py-3 sm:grid-cols-3 sm:items-center">
                <dt className="text-sm font-medium text-slate-600">{change.label}</dt>
                <dd className="text-sm text-slate-500">{change.before}</dd>
                <dd className="text-sm font-semibold text-slate-900">{change.after}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {addPassengers.length > 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase text-emerald-700">Passageiros a adicionar</h3>
          <ul className="mt-3 space-y-2 text-sm text-emerald-800">
            {addPassengers.map((passenger, index) => (
              <li key={`add-${index}`} className="flex items-center justify-between">
                <span>{passenger.nome || 'Nome não informado'}</span>
                <span className="text-xs font-semibold">{passenger.quantidade}x {passenger.displayTipo}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {removePassengers.length > 0 ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase text-rose-700">Passageiros a remover</h3>
          <ul className="mt-3 space-y-2 text-sm text-rose-800">
            {removePassengers.map((passenger, index) => (
              <li key={`remove-${index}`} className="flex items-center justify-between">
                <span>{passenger.nome || 'Nome não informado'}</span>
                <span className="text-xs font-semibold">{passenger.quantidade}x {passenger.displayTipo}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {otherChanges.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase text-slate-500">Outras observações</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
            {otherChanges.map((change, index) => (
              <li key={`other-${index}`}>{change.campo}: {change.para ?? change.de ?? '-'}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {alteration.observacoes ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase text-slate-500">Observações do e-mail</h3>
          <p className="mt-2 text-sm text-slate-700">{alteration.observacoes}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Refazer extração
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="inline-flex items-center justify-center rounded-xl border border-transparent bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onApply(applyPayload)}
          disabled={!canApply || isApplying}
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isApplying ? 'Aplicando...' : 'Aplicar alteração'}
        </button>
      </div>
    </div>
  );
}
