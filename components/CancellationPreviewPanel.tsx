'use client';

import { useMemo } from 'react';
import type { ExtractedCancellation } from '@/lib/reservas/cancelamento';
import type { ReservationRecord } from '@/lib/queries/reservas';
import type { ApplyCancellationPayload, ReservationLookupState } from '@/types/reservation-adjustments';

function normalizeName(value?: string | null) {
  if (!value) {
    return null;
  }
  return value.trim();
}

type CancellationPreviewPanelProps = {
  cancellation: ExtractedCancellation;
  reservations: ReservationRecord[];
  lookupStatus: ReservationLookupState;
  onApply: (payload: ApplyCancellationPayload) => void;
  onRetry: () => void;
  onDiscard: () => void;
  isApplying: boolean;
};

export function CancellationPreviewPanel({
  cancellation,
  reservations,
  lookupStatus,
  onApply,
  onRetry,
  onDiscard,
  isApplying,
}: CancellationPreviewPanelProps) {
  const numeroReserva = cancellation.referencia_reserva.numero_reserva?.trim() || reservations[0]?.numero_reserva || '';
  const scope = cancellation.escopo ?? 'total';
  const targetPassengers = useMemo(
    () =>
      (cancellation.passageiros ?? [])
        .map((passenger) => normalizeName(passenger.nome))
        .filter((nome): nome is string => Boolean(nome)),
    [cancellation.passageiros],
  );

  const canApply =
    Boolean(numeroReserva) &&
    lookupStatus === 'loaded' &&
    (scope !== 'parcial' || targetPassengers.length > 0);

  const payload: ApplyCancellationPayload = useMemo(
    () => ({
      numeroReserva: numeroReserva || '',
      escopo: scope,
      passageiros: targetPassengers,
    }),
    [numeroReserva, scope, targetPassengers],
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
            Operadora: {cancellation.referencia_reserva.operadora || reservations[0]?.operadora || 'Não informado'}
          </p>
          <p className="text-sm text-rose-600 font-semibold">Escopo do cancelamento: {scope === 'parcial' ? 'Parcial' : 'Total'}</p>
          {lookupMessage ? <p className="text-sm text-slate-500">{lookupMessage}</p> : null}
          {passengerList.length > 0 ? (
            <p className="text-xs text-slate-500">
              Passageiros cadastrados: {passengerList.join(', ')}
            </p>
          ) : null}
        </div>
      </div>

      {targetPassengers.length > 0 ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase text-rose-700">Passageiros a cancelar</h3>
          <ul className="mt-3 space-y-2 text-sm text-rose-800">
            {targetPassengers.map((name, index) => (
              <li key={`${name}-${index}`}>{name}</li>
            ))}
          </ul>
        </div>
      ) : scope === 'parcial' ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm text-sm text-amber-800">
          Nenhum passageiro específico foi identificado. Liste os nomes no documento para confirmar um cancelamento parcial.
        </div>
      ) : null}

      {cancellation.trechos_afetados && cancellation.trechos_afetados.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase text-slate-500">Trechos afetados</h3>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {cancellation.trechos_afetados.map((trecho, index) => (
              <li key={`trecho-${index}`}>
                {trecho.descricao}
                {trecho.data ? ` - ${trecho.data}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {cancellation.observacoes ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase text-slate-500">Observações do e-mail</h3>
          <p className="mt-2 text-sm text-slate-700">{cancellation.observacoes}</p>
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
          onClick={() => onApply(payload)}
          disabled={!canApply || isApplying}
          className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isApplying ? 'Aplicando...' : 'Confirmar cancelamento'}
        </button>
      </div>
    </div>
  );
}
