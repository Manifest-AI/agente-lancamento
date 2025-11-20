'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import {
  ROAMING_LIST_PAGE_SIZE,
  fetchRoamingList,
  type RoamingListParams,
} from '@/lib/queries/relatorios';
import { formatDate, formatTime, getStatusStyle, type StatusVariant } from '@/app/reservas/_components/reservationUtils';
import type { ReservationRecord } from '@/lib/queries/reservas';

function buildInitialDate(): string {
  // Usando a data atual para iniciar o relatório com um período válido por padrão
  return new Date().toISOString().slice(0, 10);
}

function buildFlightInfo(date: string | null | undefined, time: string | null | undefined, flight: string | null | undefined) {
  const formattedDate = formatDate(date);
  const formattedTime = formatTime(time);

  const datePart = formattedDate !== '-' ? formattedDate : '';
  const timePart = formattedTime !== '-' ? formattedTime : '';
  const base = [datePart, timePart].filter(Boolean).join(' ').trim();

  if (flight && flight.trim()) {
    return `${base || '-'} – ${flight}`;
  }

  return base || '-';
}

function formatReservationPassenger(reservation: ReservationRecord) {
  const reservationNumber = reservation.numero_reserva?.trim();
  const passengerName = (reservation.nome_pax ?? reservation.passageiro)?.trim();

  if (reservationNumber && passengerName) {
    return `${reservationNumber} – ${passengerName}`;
  }

  if (reservationNumber) {
    return reservationNumber;
  }

  if (passengerName) {
    return passengerName;
  }

  return '-';
}

export default function RoamingListPageContent() {
  const { user } = useAuth();
  const initialDate = buildInitialDate();
  const [startDateInput, setStartDateInput] = useState(initialDate);
  const [endDateInput, setEndDateInput] = useState(initialDate);
  const [filters, setFilters] = useState<Pick<RoamingListParams, 'startDate' | 'endDate'>>({
    startDate: initialDate,
    endDate: initialDate,
  });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<ReservationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / ROAMING_LIST_PAGE_SIZE)), [total]);

  useEffect(() => {
    const fetchData = async () => {
      if (!user || !filters.startDate || !filters.endDate) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchRoamingList({
          startDate: filters.startDate,
          endDate: filters.endDate,
          page,
          pageSize: ROAMING_LIST_PAGE_SIZE,
          userId: user.id,
        });

        const computedTotalPages = Math.max(1, Math.ceil((result.total ?? 0) / ROAMING_LIST_PAGE_SIZE));
        if (page > computedTotalPages && result.total > 0) {
          setPage(computedTotalPages);
          return;
        }

        setItems(result.data);
        setTotal(result.total);
      } catch (err) {
        console.error(err);
        setError('Não foi possível carregar o relatório. Tente novamente.');
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [filters, page, user]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!startDateInput || !endDateInput) {
      setError('Informe a data inicial e final para gerar o relatório.');
      return;
    }

    if (startDateInput > endDateInput) {
      setError('A data inicial deve ser anterior ou igual à data final.');
      return;
    }

    setPage(1);
    setFilters({ startDate: startDateInput, endDate: endDateInput });
  };

  const handlePageChange = (direction: 'next' | 'prev') => {
    setPage((current) => {
      if (direction === 'next') {
        return Math.min(totalPages, current + 1);
      }
      return Math.max(1, current - 1);
    });
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Roaming List – Chegada de Passageiros</h1>
          <p className="text-sm text-slate-600">
            Visualize as chegadas de passageiros em um determinado período, organizadas por operadora.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/dashboard"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Voltar ao painel
          </Link>
          <Link
            href="/reservas"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
          >
            Ver reservas
          </Link>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Data inicial *</span>
              <input
                type="date"
                required
                value={startDateInput}
                onChange={(event) => setStartDateInput(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                aria-label="Data inicial"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Data final *</span>
              <input
                type="date"
                required
                value={endDateInput}
                onChange={(event) => setEndDateInput(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                aria-label="Data final"
              />
            </label>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-400">
              Selecione um intervalo para listar as chegadas. Os resultados são ordenados por operadora e horário de chegada.
            </p>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
            >
              Aplicar filtros
            </button>
          </div>
        </form>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Operadora</th>
                <th className="px-4 py-3">Seq</th>
                <th className="px-4 py-3">Chegada</th>
                <th className="px-4 py-3">Saída</th>
                <th className="px-4 py-3">Hotel</th>
                <th className="px-4 py-3">Reserva / Passageiro</th>
                <th className="px-4 py-3">Ident</th>
                <th className="px-4 py-3">Regime</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading ? (
                <tr>
                  <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={9}>
                    Carregando chegadas...
                  </td>
                </tr>
              ) : items.length > 0 ? (
                items.map((reservation, index) => {
                  const sequence = (page - 1) * ROAMING_LIST_PAGE_SIZE + index + 1;
                  return (
                    <tr key={reservation.id} className="text-sm text-slate-700">
                      <td className="max-w-[180px] px-4 py-3">
                        <span className="block truncate" title={reservation.operadora ?? '-'}>
                          {reservation.operadora ?? '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{sequence}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {buildFlightInfo(reservation.data_chegada, reservation.horario_voo_chegada, reservation.voo_chegada)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {buildFlightInfo(reservation.data_saida, reservation.horario_voo_saida, reservation.voo_saida)}
                      </td>
                      <td className="max-w-[180px] px-4 py-3">
                        <span className="block truncate" title={reservation.hotel ?? '-'}>
                          {reservation.hotel ?? '-'}
                        </span>
                      </td>
                      <td className="max-w-[260px] px-4 py-3">
                        <span className="block truncate" title={formatReservationPassenger(reservation)}>
                          {formatReservationPassenger(reservation)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{reservation.ident ?? '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{reservation.regime ?? '–'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex min-w-[120px] items-center justify-center rounded-full px-3 py-1 text-xs font-semibold ${getStatusStyle((reservation.status as StatusVariant) ?? 'Pendente')}`}
                        >
                          {reservation.status ?? 'Sem status'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={9}>
                    Nenhuma chegada encontrada para o período selecionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="flex flex-col gap-4 border-t border-slate-200 px-4 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Exibindo {(page - 1) * ROAMING_LIST_PAGE_SIZE + (items.length ? 1 : 0)} -
            {(page - 1) * ROAMING_LIST_PAGE_SIZE + items.length} de {total} chegada(s)
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handlePageChange('prev')}
              disabled={page <= 1 || isLoading}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Anterior
            </button>
            <span className="text-xs text-slate-500">
              Página {total > 0 ? page : 0} de {total > 0 ? totalPages : 0}
            </span>
            <button
              type="button"
              onClick={() => handlePageChange('next')}
              disabled={page >= totalPages || isLoading || total === 0}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Próxima
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}
