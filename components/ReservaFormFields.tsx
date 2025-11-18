'use client';

import type { ChangeEvent } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import type {
  ReservaPreviewDraft,
  ReservaPreviewErrors,
  ReservaPreviewPassenger,
} from '@/app/nova-reserva/mapReservaToForm';

const baseFieldConfigs: Array<{
  key: keyof Omit<ReservaPreviewDraft, 'passageiros' | 'regime'>;
  label: string;
  placeholder: string;
}> = [
  { key: 'operadora', label: 'Operadora', placeholder: 'Nome da operadora' },
  { key: 'numeroReserva', label: 'N° da reserva (ID externo)', placeholder: 'Código da reserva' },
  { key: 'dataChegada', label: 'Data de chegada (em Porto Seguro)', placeholder: 'dd/MM/aaaa' },
  { key: 'dataSaida', label: 'Data de saída (de Porto Seguro)', placeholder: 'dd/MM/aaaa' },
  { key: 'vooChegada', label: 'Voo de chegada (em Porto Seguro)', placeholder: 'Ex.: LA3600' },
  { key: 'vooSaida', label: 'Voo de saída (de Porto Seguro)', placeholder: 'Ex.: LA3343' },
  { key: 'horarioChegada', label: 'Horário do voo (Chegada em Porto Seguro)', placeholder: 'HH:mm' },
  { key: 'horarioSaida', label: 'Horário do voo (Saída de Porto Seguro)', placeholder: 'HH:mm' },
  { key: 'hotel', label: 'Nome do Hotel', placeholder: 'Nome do hotel' },
  { key: 'ident', label: 'IDENT', placeholder: 'Ex.: BPS, AA/TR, BUE' },
];

const passengerClassOptions = [
  { value: '', label: 'Selecione' },
  { value: 'A', label: 'ADT' },
  { value: 'C', label: 'CHD' },
  { value: 'I', label: 'INF' },
];

type FocusKey =
  | 'operadora'
  | 'dataChegada'
  | 'dataSaida'
  | 'ident'
  | 'vooChegada'
  | 'vooSaida'
  | 'horarioChegada'
  | 'horarioSaida'
  | 'hotel'
  | 'numeroReserva'
  | 'regime'
  | `passageiro-${number}-nome`
  | `passageiro-${number}-classificacao`;

function isMissingValue(value: string) {
  return !value.trim();
}

type ReservaFormFieldsProps = {
  data: ReservaPreviewDraft;
  errors: ReservaPreviewErrors;
  onFieldChange: <T extends keyof Omit<ReservaPreviewDraft, 'passageiros'>>(field: T, value: string) => void;
  onPassengerChange: (index: number, field: keyof ReservaPreviewPassenger, value: string) => void;
  onPassengerAdd: () => void;
  onPassengerRemove: (index: number) => void;
  showMissingIndicators?: boolean;
  autoFocusOnErrors?: boolean;
  idPrefix?: string;
  passengerSectionTitle?: string;
  addPassengerLabel?: string;
};

export function ReservaFormFields({
  data,
  errors,
  onFieldChange,
  onPassengerChange,
  onPassengerAdd,
  onPassengerRemove,
  showMissingIndicators = false,
  autoFocusOnErrors = false,
  idPrefix = 'reserva',
  passengerSectionTitle = 'Passageiros',
  addPassengerLabel = 'Adicionar passageiro',
}: ReservaFormFieldsProps) {
  const focusRefs = useRef<Partial<Record<FocusKey, HTMLInputElement | HTMLSelectElement | null>>>({});
  const focusHandledRef = useRef(false);

  const orderedFields = useMemo(() => {
    const entries: Array<{ key: FocusKey; value: string; error?: string }> = [
      { key: 'operadora', value: data.operadora, error: errors.operadora },
      { key: 'dataChegada', value: data.dataChegada, error: errors.dataChegada },
      { key: 'dataSaida', value: data.dataSaida, error: errors.dataSaida },
      { key: 'ident', value: data.ident, error: errors.ident },
      { key: 'vooChegada', value: data.vooChegada, error: errors.vooChegada },
      { key: 'vooSaida', value: data.vooSaida, error: errors.vooSaida },
      { key: 'horarioChegada', value: data.horarioChegada, error: errors.horarioChegada },
      { key: 'horarioSaida', value: data.horarioSaida, error: errors.horarioSaida },
      { key: 'hotel', value: data.hotel, error: errors.hotel },
      { key: 'numeroReserva', value: data.numeroReserva, error: errors.numeroReserva },
    ];

    data.passageiros.forEach((passageiro, index) => {
      entries.push({
        key: `passageiro-${index}-nome`,
        value: passageiro.nome,
        error: errors.passageiros[index]?.nome,
      });
      entries.push({
        key: `passageiro-${index}-classificacao`,
        value: passageiro.classificacao,
        error: errors.passageiros[index]?.classificacao,
      });
    });

    entries.push({ key: 'regime', value: data.regime, error: errors.regime });

    return entries;
  }, [data, errors]);

  useEffect(() => {
    focusHandledRef.current = false;
  }, [data, errors]);

  useEffect(() => {
    if (!autoFocusOnErrors || focusHandledRef.current) {
      return;
    }

    const target = orderedFields.find((field) => field.error || isMissingValue(field.value));
    if (!target) {
      focusHandledRef.current = true;
      return;
    }

    const element = focusRefs.current[target.key];
    if (element && document.activeElement !== element) {
      element.focus();
      focusHandledRef.current = true;
    }
  }, [orderedFields, autoFocusOnErrors]);

  const handleTopLevelChange = (field: keyof Omit<ReservaPreviewDraft, 'passageiros'>) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      onFieldChange(field, event.target.value);
    };

  const handlePassengerInputChange = (index: number, field: keyof ReservaPreviewPassenger) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      onPassengerChange(index, field, event.target.value);
    };

  const buildInputClasses = (value: string, error?: string) => {
    if (error) {
      return 'border-rose-300 focus:border-rose-400 focus:ring-rose-200';
    }

    if (showMissingIndicators && isMissingValue(value)) {
      return 'border-amber-300 focus:border-amber-400 focus:ring-amber-200';
    }

    return 'border-slate-300 focus:border-blue-500 focus:ring-blue-200';
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2">
        {baseFieldConfigs.map((field) => {
          const value = data[field.key];
          const error = errors[field.key as keyof typeof errors] as string | undefined;
          const inputKey = field.key as FocusKey;
          const inputId = `${idPrefix}-${field.key}`;

          return (
            <div key={field.key} className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700" htmlFor={inputId}>
                <span>{field.label}</span>
                {showMissingIndicators && isMissingValue(value) ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                    Faltando
                  </span>
                ) : null}
              </label>
              <input
                id={inputId}
                type="text"
                value={value}
                onChange={handleTopLevelChange(field.key)}
                ref={(element) => {
                  focusRefs.current[inputKey] = element;
                }}
                className={`w-full rounded-xl border px-3 py-2 text-sm shadow-sm transition focus:outline-none focus:ring-2 ${buildInputClasses(value, error)}`}
                placeholder={field.placeholder}
                aria-invalid={Boolean(error)}
                aria-errormessage={error ? `${inputId}-error` : undefined}
              />
              {error ? (
                <span id={`${inputId}-error`} className="text-xs font-medium text-rose-600">
                  {error}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{passengerSectionTitle}</h3>
          <button
            type="button"
            onClick={onPassengerAdd}
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            {addPassengerLabel}
          </button>
        </div>

        <div className="space-y-3">
          {data.passageiros.map((passageiro, index) => {
            const passengerErrors = errors.passageiros[index] ?? {};
            const nameKey = `passageiro-${index}-nome` as FocusKey;
            const classKey = `passageiro-${index}-classificacao` as FocusKey;
            const inputNameId = `${idPrefix}-passenger-name-${index}`;
            const inputClassId = `${idPrefix}-passenger-class-${index}`;

            return (
              <div key={`passageiro-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <span>{`Passageiro ${index + 1}`}</span>
                    {showMissingIndicators && (isMissingValue(passageiro.nome) || isMissingValue(passageiro.classificacao)) ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                        Faltando
                      </span>
                    ) : null}
                  </div>
                  {data.passageiros.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => onPassengerRemove(index)}
                      className="text-xs font-medium text-rose-600 transition hover:text-rose-700"
                    >
                      Remover
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[2fr_1fr]">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor={inputNameId}>
                      Nome (primeiro e último)
                    </label>
                    <input
                      id={inputNameId}
                      type="text"
                      value={passageiro.nome}
                      onChange={handlePassengerInputChange(index, 'nome')}
                      ref={(element) => {
                        focusRefs.current[nameKey] = element;
                      }}
                      className={`w-full rounded-xl border px-3 py-2 text-sm shadow-sm transition focus:outline-none focus:ring-2 ${buildInputClasses(passageiro.nome, passengerErrors.nome)}`}
                      placeholder="Ex.: MARTA BRANDAO"
                      aria-invalid={Boolean(passengerErrors.nome)}
                      aria-errormessage={passengerErrors.nome ? `${inputNameId}-error` : undefined}
                    />
                    {passengerErrors.nome ? (
                      <span id={`${inputNameId}-error`} className="text-xs font-medium text-rose-600">
                        {passengerErrors.nome}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor={inputClassId}>
                      (ADT/CHD/INF)
                    </label>
                    <select
                      id={inputClassId}
                      value={passageiro.classificacao}
                      onChange={handlePassengerInputChange(index, 'classificacao')}
                      ref={(element) => {
                        focusRefs.current[classKey] = element;
                      }}
                      className={`w-full rounded-xl border px-3 py-2 text-sm shadow-sm transition focus:outline-none focus:ring-2 ${buildInputClasses(passageiro.classificacao, passengerErrors.classificacao)}`}
                      aria-invalid={Boolean(passengerErrors.classificacao)}
                      aria-errormessage={passengerErrors.classificacao ? `${inputClassId}-error` : undefined}
                    >
                      {passengerClassOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {passengerErrors.classificacao ? (
                      <span id={`${inputClassId}-error`} className="text-xs font-medium text-rose-600">
                        {passengerErrors.classificacao}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 md:w-1/2">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700" htmlFor={`${idPrefix}-regime`}>
          <span>Regime</span>
          {showMissingIndicators && isMissingValue(data.regime) ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
              Faltando
            </span>
          ) : null}
        </label>
        <select
          id={`${idPrefix}-regime`}
          value={data.regime}
          onChange={handleTopLevelChange('regime')}
          ref={(element) => {
            focusRefs.current.regime = element;
          }}
          className={`rounded-xl border px-3 py-2 text-sm shadow-sm transition focus:outline-none focus:ring-2 ${buildInputClasses(data.regime, errors.regime)}`}
          aria-invalid={Boolean(errors.regime)}
          aria-errormessage={errors.regime ? `${idPrefix}-regime-error` : undefined}
        >
          <option value="">Selecione</option>
          <option value="Privativo">Privativo</option>
          <option value="REGULAR">REGULAR</option>
        </select>
        {errors.regime ? (
          <span id={`${idPrefix}-regime-error`} className="text-xs font-medium text-rose-600">
            {errors.regime}
          </span>
        ) : null}
      </div>
    </div>
  );
}
