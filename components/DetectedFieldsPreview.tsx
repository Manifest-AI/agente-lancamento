'use client';

import type { ChangeEvent } from 'react';
import { useMemo } from 'react';
import type {
  ExtractedReservationDraft,
  ExtractedReservationErrors,
  ExtractedReservationFieldKey,
} from '@/types/ocr-gpt';

export type DetectedFieldsPreviewProps = {
  data: ExtractedReservationDraft;
  errors: ExtractedReservationErrors;
  onChange: (key: ExtractedReservationFieldKey, value: string) => void;
  onApply: () => void;
  onRetry: () => void;
  onDiscard: () => void;
  isApplying?: boolean;
};

const fieldConfigurations: Array<{
  key: ExtractedReservationFieldKey;
  label: string;
  placeholder?: string;
  type?: 'text' | 'textarea';
}> = [
  { key: 'operadora', label: 'Operadora', placeholder: 'Nome da operadora' },
  { key: 'data_chegada_bps', label: 'Data de chegada (BPS)', placeholder: 'yyyy-mm-dd' },
  { key: 'data_saida_bps', label: 'Data de saída (BPS)', placeholder: 'yyyy-mm-dd' },
  { key: 'ident', label: 'IDENT', placeholder: 'BPS, AA/TR, BUE, BUE/A ou BUE/T' },
  { key: 'voo_chegada', label: 'Voo de chegada', placeholder: 'Ex.: LA 3600' },
  { key: 'voo_saida', label: 'Voo de saída', placeholder: 'Ex.: LA 3601' },
  { key: 'hora_chegada', label: 'Hora de chegada', placeholder: 'hh:mm' },
  { key: 'hora_saida', label: 'Hora de saída', placeholder: 'hh:mm' },
  { key: 'hotel', label: 'Hotel', placeholder: 'Nome do hotel' },
  { key: 'id_reserva', label: 'ID da reserva', placeholder: 'Identificador externo' },
  { key: 'nome', label: 'Passageiro', placeholder: 'Primeiro e último nome' },
  { key: 'tipo', label: 'Tipo de passageiro', placeholder: 'A, C ou I' },
  { key: 'observacao', label: 'Observação', placeholder: 'Privativo ou vazio', type: 'textarea' },
];

export function DetectedFieldsPreview({
  data,
  errors,
  onChange,
  onApply,
  onRetry,
  onDiscard,
  isApplying = false,
}: DetectedFieldsPreviewProps) {
  const hasAnyField = useMemo(() => Object.values(data).some((value) => Boolean(value && value.trim())), [data]);

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

  const handleInputChange = (key: ExtractedReservationFieldKey) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(key, event.target.value);
    };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {fieldConfigurations.map((field) => {
          const value = data[field.key] ?? '';
          const error = errors[field.key];
          const hasError = Boolean(error);

          return (
            <div key={field.key} className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-700" htmlFor={`detected-${field.key}`}>
                {field.label}
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  id={`detected-${field.key}`}
                  value={value}
                  onChange={handleInputChange(field.key)}
                  rows={3}
                  className={`w-full rounded-xl border px-3 py-2 text-sm shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-200 ${
                    hasError
                      ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-200'
                      : 'border-slate-300 focus:border-blue-500'
                  }`}
                  placeholder={field.placeholder}
                  aria-invalid={hasError}
                  aria-errormessage={hasError ? `detected-${field.key}-error` : undefined}
                />
              ) : (
                <input
                  id={`detected-${field.key}`}
                  type="text"
                  value={value}
                  onChange={handleInputChange(field.key)}
                  className={`w-full rounded-xl border px-3 py-2 text-sm shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-200 ${
                    hasError
                      ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-200'
                      : 'border-slate-300 focus:border-blue-500'
                  }`}
                  placeholder={field.placeholder}
                  aria-invalid={hasError}
                  aria-errormessage={hasError ? `detected-${field.key}-error` : undefined}
                />
              )}
              {hasError ? (
                <span id={`detected-${field.key}-error`} className="text-xs font-medium text-rose-600">
                  {error}
                </span>
              ) : null}
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
          disabled={isApplying}
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isApplying ? 'Aplicando...' : 'Aplicar ao formulário'}
        </button>
      </div>
    </div>
  );
}
