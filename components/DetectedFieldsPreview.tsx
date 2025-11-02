'use client';

import type { ChangeEvent } from 'react';
import { useEffect, useMemo, useRef } from 'react';
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
  { key: 'operador', label: 'Operador', placeholder: 'Nome do operador' },
  { key: 'origem_operadora', label: 'Origem (operadora)', placeholder: 'Origem fornecida pela operadora' },
  { key: 'localizador', label: 'Localizador', placeholder: 'Código localizador' },
  { key: 'booking_code', label: 'Booking code', placeholder: 'Código alternativo da reserva' },
  { key: 'passageiro_nome', label: 'Nome do passageiro', placeholder: 'Primeiro nome' },
  { key: 'passageiro_sobrenome', label: 'Sobrenome do passageiro', placeholder: 'Último nome' },
  { key: 'passageiro_full_name', label: 'Nome completo', placeholder: 'Nome completo do passageiro' },
  { key: 'servico', label: 'Serviço', placeholder: 'Transfer, passeio, etc.' },
  { key: 'data', label: 'Data', placeholder: 'yyyy-mm-dd' },
  { key: 'hora_coleta', label: 'Hora de coleta', placeholder: 'hh:mm' },
  { key: 'hora_retorno', label: 'Hora de retorno', placeholder: 'hh:mm' },
  { key: 'voo_chegada', label: 'Voo de chegada', placeholder: 'Ex.: LA3600' },
  { key: 'voo_partida', label: 'Voo de partida', placeholder: 'Ex.: LA3601' },
  { key: 'hotel', label: 'Hotel', placeholder: 'Nome do hotel' },
  { key: 'endereco', label: 'Endereço', placeholder: 'Endereço completo' },
  { key: 'pax_adulto', label: 'Qtd. adultos', placeholder: 'Quantidade de adultos' },
  { key: 'pax_crianca', label: 'Qtd. crianças', placeholder: 'Quantidade de crianças' },
  { key: 'pax_bebe', label: 'Qtd. bebês', placeholder: 'Quantidade de bebês' },
  { key: 'observacoes', label: 'Observações', placeholder: 'Detalhes adicionais', type: 'textarea' },
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
  const inputRefs = useRef<
    Partial<Record<ExtractedReservationFieldKey, HTMLInputElement | HTMLTextAreaElement | null>>
  >({});
  const focusHandledRef = useRef(false);

  useEffect(() => {
    focusHandledRef.current = false;
  }, [data]);

  useEffect(() => {
    if (focusHandledRef.current) {
      return;
    }

    const missingField = fieldConfigurations.find((field) => {
      const currentValue = data[field.key] ?? '';
      return !currentValue.trim();
    });
    if (!missingField) {
      focusHandledRef.current = true;
      return;
    }

    const target = inputRefs.current[missingField.key];
    if (target && document.activeElement !== target) {
      target.focus();
      focusHandledRef.current = true;
    }
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
          const isMissing = !value.trim();

          return (
            <div key={field.key} className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700" htmlFor={`detected-${field.key}`}>
                <span>{field.label}</span>
                {isMissing ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                    Faltando
                  </span>
                ) : null}
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  id={`detected-${field.key}`}
                  value={value}
                  onChange={handleInputChange(field.key)}
                  ref={(element) => {
                    inputRefs.current[field.key] = element;
                  }}
                  rows={3}
                  className={`w-full rounded-xl border px-3 py-2 text-sm shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-200 ${
                    hasError
                      ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-200'
                      : isMissing
                        ? 'border-amber-300 focus:border-amber-400 focus:ring-amber-200'
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
                  ref={(element) => {
                    inputRefs.current[field.key] = element;
                  }}
                  className={`w-full rounded-xl border px-3 py-2 text-sm shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-200 ${
                    hasError
                      ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-200'
                      : isMissing
                        ? 'border-amber-300 focus:border-amber-400 focus:ring-amber-200'
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
