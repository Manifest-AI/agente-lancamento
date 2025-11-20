'use client';

import { useMemo } from 'react';
import type { ReservaPreviewDraft, ReservaPreviewErrors, ReservaPreviewPassenger } from '@/app/nova-reserva/mapReservaToForm';
import { ReservaFormFields } from './ReservaFormFields';

export type DetectedFieldsPreviewProps = {
  data: ReservaPreviewDraft;
  errors: ReservaPreviewErrors;
  onFieldChange: <T extends keyof Omit<ReservaPreviewDraft, 'passageiros'>>(field: T, value: string) => void;
  onPassengerChange: (index: number, field: keyof ReservaPreviewPassenger, value: string) => void;
  onPassengerAdd: () => void;
  onPassengerRemove: (index: number) => void;
  onApply: () => void;
  onRetry: () => void;
  onDiscard: () => void;
  isApplying?: boolean;
};

function isMissingValue(value: string) {
  return !value.trim();
}

export function DetectedFieldsPreview({
  data,
  errors,
  onFieldChange,
  onPassengerChange,
  onPassengerAdd,
  onPassengerRemove,
  onApply,
  onRetry,
  onDiscard,
  isApplying = false,
}: DetectedFieldsPreviewProps) {
  const hasAnyField = useMemo(() => {
    const baseFields = [
      data.operadora,
      data.dataChegada,
      data.dataSaida,
      data.ident,
      data.vooChegada,
      data.vooSaida,
      data.horarioChegada,
      data.horarioSaida,
      data.hotel,
      data.numeroReserva,
      data.regime,
    ].some((value) => Boolean(value && value.trim()));

    const passengerFields = data.passageiros.some(
      (passageiro) => passageiro.nome.trim() || passageiro.classificacao.trim(),
    );

    return baseFields || passengerFields;
  }, [data]);

  if (!hasAnyField) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Não encontramos campos válidos. Ajuste o conteúdo e tente novamente.</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
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
            Descartar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ReservaFormFields
        data={data}
        errors={errors}
        onFieldChange={onFieldChange}
        onPassengerChange={onPassengerChange}
        onPassengerAdd={onPassengerAdd}
        onPassengerRemove={onPassengerRemove}
        showMissingIndicators
        autoFocusOnErrors
        idPrefix="detected"
      />

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
          Descartar
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={isApplying}
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isApplying ? 'Salvando...' : 'Salvar reserva'}
        </button>
      </div>
    </div>
  );
}
