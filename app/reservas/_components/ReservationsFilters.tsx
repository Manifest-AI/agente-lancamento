'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReservationFilters, ReservationOptions } from '@/lib/queries/reservas';

type ReservationsFiltersProps = {
  filters: ReservationFilters;
  options: ReservationOptions;
  isLoading?: boolean;
  onChange: (filters: ReservationFilters) => void;
};

type LocalFilters = {
  query: string;
  operadora: string;
  hotel: string;
  ident: string;
  startDate: string;
  endDate: string;
};

const emptyLocalFilters: LocalFilters = {
  query: '',
  operadora: '',
  hotel: '',
  ident: '',
  startDate: '',
  endDate: '',
};

function toLocalFilters(filters: ReservationFilters): LocalFilters {
  return {
    query: filters.query ?? '',
    operadora: filters.operadora ?? '',
    hotel: filters.hotel ?? '',
    ident: filters.ident ?? '',
    startDate: filters.startDate ?? '',
    endDate: filters.endDate ?? '',
  };
}

function toReservationFilters(filters: LocalFilters): ReservationFilters {
  return {
    query: filters.query.trim() ? filters.query.trim() : undefined,
    operadora: filters.operadora || undefined,
    hotel: filters.hotel || undefined,
    ident: filters.ident.trim() ? filters.ident.trim() : undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
  };
}

export default function ReservationsFilters({ filters, options, isLoading, onChange }: ReservationsFiltersProps) {
  const [localFilters, setLocalFilters] = useState<LocalFilters>(toLocalFilters(filters));

  useEffect(() => {
    setLocalFilters(toLocalFilters(filters));
  }, [filters]);

  const isPristine = useMemo(() => {
    const normalized = toReservationFilters(localFilters);
    const incoming = toReservationFilters(toLocalFilters(filters));

    return (
      normalized.query === incoming.query &&
      normalized.operadora === incoming.operadora &&
      normalized.hotel === incoming.hotel &&
      normalized.ident === incoming.ident &&
      normalized.startDate === incoming.startDate &&
      normalized.endDate === incoming.endDate
    );
  }, [filters, localFilters]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onChange(toReservationFilters(localFilters));
  };

  const handleReset = () => {
    setLocalFilters(emptyLocalFilters);
    onChange({});
  };

  const handleChange = (field: keyof LocalFilters) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { value } = event.target;
      setLocalFilters((previous) => ({ ...previous, [field]: value }));
    };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Busca rápida</span>
          <input
            name="query"
            value={localFilters.query}
            onChange={handleChange('query')}
            placeholder="Passageiro, código, IDENT ou localizador"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 shadow-sm transition placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            aria-label="Buscar reservas"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Operadora</span>
          <select
            name="operadora"
            value={localFilters.operadora}
            onChange={handleChange('operadora')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            aria-label="Filtrar por operadora"
          >
            <option value="">Todas</option>
            {options.operators.map((operator) => (
              <option key={operator} value={operator}>
                {operator}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Hotel</span>
          <select
            name="hotel"
            value={localFilters.hotel}
            onChange={handleChange('hotel')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            aria-label="Filtrar por hotel"
          >
            <option value="">Todos</option>
            {options.hotels.map((hotel) => (
              <option key={hotel} value={hotel}>
                {hotel}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">IDENT</span>
          <input
            name="ident"
            value={localFilters.ident}
            onChange={handleChange('ident')}
            placeholder="Ex.: ABC123"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 shadow-sm transition placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            aria-label="Filtrar por IDENT"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Data inicial</span>
          <input
            type="date"
            name="startDate"
            value={localFilters.startDate}
            onChange={handleChange('startDate')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            aria-label="Data inicial"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Data final</span>
          <input
            type="date"
            name="endDate"
            value={localFilters.endDate}
            onChange={handleChange('endDate')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            aria-label="Data final"
          />
        </label>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {isLoading ? (
          <p className="text-xs text-slate-400">Carregando filtros disponíveis...</p>
        ) : (
          <p className="text-xs text-slate-400">
            {options.operators.length} operadora(s) e {options.hotels.length} hotel(is) disponíveis.
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Limpar filtros
          </button>
          <button
            type="submit"
            disabled={isPristine}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Aplicar filtros
          </button>
        </div>
      </div>
    </form>
  );
}
