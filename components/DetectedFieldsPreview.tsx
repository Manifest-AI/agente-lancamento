'use client';

import { useMemo } from 'react';
import type { ChangeEvent } from 'react';
import type { ReservaFieldKey, ReservaFields } from '@/lib/extractors/reserva';

export type DetectedFieldsPreviewProps = {
  fields: ReservaFields;
  confidence: Record<ReservaFieldKey, number>;
  onChange: (key: ReservaFieldKey, value: string) => void;
  onApply: () => void;
  onRetry: () => void;
  onDiscard: () => void;
};

const fieldConfigurations: Array<{
  key: ReservaFieldKey;
  label: string;
  placeholder?: string;
  type?: 'text' | 'textarea';
}> = [
  { key: 'passengerName', label: 'Passageiro', placeholder: 'Nome completo' },
  { key: 'document', label: 'Documento', placeholder: 'RG ou CPF' },
  { key: 'passengerType', label: 'Tipo passageiro', placeholder: 'adulto | crianca | bebe' },
  { key: 'airline', label: 'Companhia aérea', placeholder: 'Latam, Azul...' },
  { key: 'origin', label: 'Origem (IATA)', placeholder: 'GRU' },
  { key: 'destination', label: 'Destino (IATA)', placeholder: 'BSB' },
  { key: 'departureDate', label: 'Data ida', placeholder: 'yyyy-mm-dd' },
  { key: 'departureTime', label: 'Hora ida', placeholder: 'hh:mm' },
  { key: 'returnDate', label: 'Data volta', placeholder: 'yyyy-mm-dd' },
  { key: 'returnTime', label: 'Hora volta', placeholder: 'hh:mm' },
  { key: 'reservationCode', label: 'Código reserva / PNR', placeholder: 'ABC123' },
  { key: 'hotel', label: 'Hotel', placeholder: 'Nome do hotel' },
  { key: 'operator', label: 'Operadora', placeholder: 'Operadora / fornecedor' },
  { key: 'ident', label: 'IDENT', placeholder: 'Identificador interno' },
  { key: 'notes', label: 'Observações', placeholder: 'Observações adicionais', type: 'textarea' },
];

function getConfidenceBadgeClasses(value: number) {
  if (value >= 0.75) {
    return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
  }
  if (value >= 0.5) {
    return 'bg-amber-100 text-amber-700 border border-amber-200';
  }
  return 'bg-slate-100 text-slate-600 border border-slate-200';
}

function formatConfidenceLabel(value: number) {
  if (value === 0) {
    return 'Sem confiança';
  }
  return `${Math.round(value * 100)}%`;
}

export function DetectedFieldsPreview({
  fields,
  confidence,
  onChange,
  onApply,
  onRetry,
  onDiscard,
}: DetectedFieldsPreviewProps) {
  const hasAnyField = useMemo(() => Object.values(fields).some((value) => Boolean(value && value.trim())), [fields]);

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

  const handleInputChange = (key: ReservaFieldKey) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange(key, event.target.value);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {fieldConfigurations.map((field) => {
          const value = fields[field.key] ?? '';
          const confidenceValue = confidence[field.key] ?? 0;

          return (
            <div key={field.key} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-slate-700" htmlFor={`detected-${field.key}`}>
                  {field.label}
                </label>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${getConfidenceBadgeClasses(confidenceValue)}`}>
                  {formatConfidenceLabel(confidenceValue)}
                </span>
              </div>
              {field.type === 'textarea' ? (
                <textarea
                  id={`detected-${field.key}`}
                  value={value}
                  onChange={handleInputChange(field.key)}
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder={field.placeholder}
                />
              ) : (
                <input
                  id={`detected-${field.key}`}
                  type="text"
                  value={value}
                  onChange={handleInputChange(field.key)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder={field.placeholder}
                />
              )}
            </div>
          );
        })}
      </div>

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
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
        >
          Aplicar ao formulário
        </button>
      </div>
    </div>
  );
}
