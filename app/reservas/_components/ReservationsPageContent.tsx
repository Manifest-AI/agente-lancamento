'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation';
import {
  RESERVATIONS_DEFAULT_PAGE_SIZE,
  deleteReservation,
  fetchReservationOptions,
  fetchReservations,
  type ReservationListItem,
  type ReservationFilters,
  type ReservationOptions,
  type ReservationRecord,
  type ReservationsSort,
  type ReservationsSortField,
} from '@/lib/queries/reservas';
import { useAuth } from '@/hooks/useAuth';
import { ImportPasseioModal } from '@/components/ImportPasseioModal';
import ReservationsFilters from './ReservationsFilters';
import ReservationsTable from './ReservationsTable';
import DeleteReservationDialog from './DeleteReservationDialog';

const DEFAULT_SORT: ReservationsSort = { field: 'created_at', direction: 'desc' };

function parseNumber(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

function parseSort(value: string | null): ReservationsSort {
  if (!value) {
    return DEFAULT_SORT;
  }

  const [field, direction] = value.split(':');
  const allowedFields: ReservationsSortField[] = ['data_chegada', 'data_saida', 'created_at', 'nome_pax', 'status'];

  if (!allowedFields.includes(field as ReservationsSortField)) {
    return DEFAULT_SORT;
  }

  if (direction !== 'asc' && direction !== 'desc') {
    return DEFAULT_SORT;
  }

  return { field: field as ReservationsSortField, direction };
}

function formatSort(sort: ReservationsSort) {
  return `${sort.field}:${sort.direction}`;
}

function parseFiltersFromSearchParams(searchParams: URLSearchParams | ReadonlyURLSearchParams): ReservationFilters {
  const query = searchParams.get('q') ?? undefined;
  const operadora = searchParams.get('operadora') ?? undefined;
  const hotel = searchParams.get('hotel') ?? undefined;
  const ident = searchParams.get('ident') ?? undefined;
  const startDate = searchParams.get('startDate') ?? undefined;
  const endDate = searchParams.get('endDate') ?? undefined;

  return {
    query,
    operadora,
    hotel,
    ident,
    startDate,
    endDate,
  };
}

function formatQueryString({
  page,
  filters,
  sort,
}: {
  page: number;
  filters: ReservationFilters;
  sort: ReservationsSort;
}) {
  const params = new URLSearchParams();

  if (page > 1) {
    params.set('page', String(page));
  }

  if (filters.query) {
    params.set('q', filters.query);
  }

  if (filters.operadora) {
    params.set('operadora', filters.operadora);
  }

  if (filters.hotel) {
    params.set('hotel', filters.hotel);
  }

  if (filters.ident) {
    params.set('ident', filters.ident);
  }

  if (filters.startDate) {
    params.set('startDate', filters.startDate);
  }

  if (filters.endDate) {
    params.set('endDate', filters.endDate);
  }

  const sortValue = formatSort(sort);
  if (sortValue !== formatSort(DEFAULT_SORT)) {
    params.set('sort', sortValue);
  }

  return params.toString();
}

export default function ReservationsPageContent() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [reservations, setReservations] = useState<ReservationListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [options, setOptions] = useState<ReservationOptions>({ operators: [], hotels: [] });
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
  const [isPasseioModalOpen, setIsPasseioModalOpen] = useState(false);

  const page = useMemo(() => parseNumber(searchParams.get('page'), 1), [searchParams]);
  const filters = useMemo(() => parseFiltersFromSearchParams(searchParams), [searchParams]);
  const sort = useMemo(() => parseSort(searchParams.get('sort')), [searchParams]);

  const handleNavigate = useCallback(
    (next: { page?: number; filters?: ReservationFilters; sort?: ReservationsSort }) => {
      const nextPage = next.page ?? 1;
      const nextFilters = next.filters ?? filters;
      const nextSort = next.sort ?? sort;
      const query = formatQueryString({ page: nextPage, filters: nextFilters, sort: nextSort });
      const target = query ? `${pathname}?${query}` : pathname;
      setFeedback(null);
      setError(null);
      router.push(target);
    },
    [filters, pathname, router, sort],
  );

  const handleFiltersChange = useCallback(
    (nextFilters: ReservationFilters) => {
      handleNavigate({ page: 1, filters: nextFilters });
    },
    [handleNavigate],
  );

  const refreshData = useCallback(async () => {
    if (!user) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [listResult, filterOptions] = await Promise.all([
        fetchReservations({
          page,
          pageSize: RESERVATIONS_DEFAULT_PAGE_SIZE,
          sort,
          filters,
          userId: user.id,
        }),
        fetchReservationOptions(user.id),
      ]);

      if (page > 1 && listResult.data.length === 0 && listResult.total > 0) {
        const lastPage = Math.max(1, Math.ceil(listResult.total / RESERVATIONS_DEFAULT_PAGE_SIZE));
        setIsLoading(false);
        handleNavigate({ page: lastPage, filters, sort });
        return;
      }

      setReservations(listResult.data);
      setTotal(listResult.total);
      setOptions(filterOptions);
    } catch (err) {
      console.error(err);
      setError('Não foi possível carregar as reservas. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  }, [filters, handleNavigate, page, sort, user]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const handleSortChange = useCallback(
    (field: ReservationsSortField) => {
      const nextDirection =
        sort.field === field ? (sort.direction === 'asc' ? 'desc' : 'asc') : field === 'nome_pax' ? 'asc' : 'desc';

      handleNavigate({ page: 1, sort: { field, direction: nextDirection } });
    },
    [handleNavigate, sort],
  );

  const handlePageChange = useCallback(
    (nextPage: number) => {
      handleNavigate({ page: nextPage });
    },
    [handleNavigate],
  );

  const handleDeleteRequest = useCallback((id: string) => {
    setSelectedReservationId(id);
  }, []);

  const handleDeleteCancel = useCallback(() => {
    setSelectedReservationId(null);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!selectedReservationId || !user) {
      return;
    }

    setIsDeleting(true);
    setFeedback(null);
    setError(null);

    try {
      await deleteReservation(selectedReservationId, user.id);
      setFeedback('Reserva excluída com sucesso.');
      setSelectedReservationId(null);
      await refreshData();
    } catch (err) {
      console.error(err);
      setError('Não foi possível excluir a reserva. Tente novamente.');
    } finally {
      setIsDeleting(false);
    }
  }, [refreshData, selectedReservationId, user]);

  const handleReservationUpdate = useCallback((updated: ReservationRecord) => {
    setReservations((previous) =>
      previous.map((reservation) => {
        const hasReservation = reservation.itens.some(
          (item) => item.tipo === 'RESERVA' && item.id === updated.id,
        );

        if (!hasReservation) {
          return reservation;
        }

        const updatedItems = reservation.itens.map((item) =>
          item.tipo === 'RESERVA' && item.id === updated.id ? { ...item, ...updated } : item,
        );

        return {
          ...reservation,
          id: reservation.id.startsWith('passeio-') ? updated.id : reservation.id,
          id_externo: updated.id_externo ?? reservation.id_externo,
          operadora: updated.operadora,
          regime: updated.regime ?? reservation.regime,
          numero_reserva: updated.numero_reserva ?? reservation.numero_reserva,
          hotel: updated.hotel ?? reservation.hotel,
          data_chegada: updated.data_chegada ?? reservation.data_chegada,
          data_saida: updated.data_saida ?? reservation.data_saida,
          status: updated.status ?? reservation.status,
          nome_pax: updated.nome_pax ?? updated.passageiro ?? reservation.nome_pax,
          passageiro: updated.passageiro ?? reservation.passageiro,
          ident: updated.ident ?? reservation.ident,
          created_at: updated.created_at ?? reservation.created_at,
          itens: updatedItems,
          isPasseioSolo: false,
        };
      }),
    );
  }, []);

  const handlePasseioSaved = useCallback(
    (message?: string) => {
      setFeedback(message ?? 'Passeio salvo com sucesso.');
      setError(null);
    },
    [],
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Reservas</h1>
          <p className="text-sm text-slate-600">Consulte e acompanhe suas reservas cadastradas.</p>
        </div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
          <Link
            href="/dashboard"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Voltar ao painel
          </Link>
          <button
            type="button"
            onClick={() => setIsPasseioModalOpen(true)}
            className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
          >
            Importar passeios
          </button>
          <Link
            href="/nova-reserva"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
          >
            Criar nova reserva
          </Link>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <ReservationsFilters
          filters={filters}
          options={options}
          isLoading={isLoading && reservations.length === 0}
          onChange={handleFiltersChange}
        />
      </section>

      {feedback ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{feedback}</div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <ReservationsTable
          reservations={reservations}
          isLoading={isLoading}
          page={page}
          pageSize={RESERVATIONS_DEFAULT_PAGE_SIZE}
          total={total}
          sort={sort}
          onSortChange={handleSortChange}
          onPageChange={handlePageChange}
          onDelete={handleDeleteRequest}
          onReservationUpdate={handleReservationUpdate}
          userId={user?.id}
        />
      </section>

      <DeleteReservationDialog
        open={Boolean(selectedReservationId)}
        onCancel={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        loading={isDeleting}
      />
      <ImportPasseioModal
        isOpen={isPasseioModalOpen}
        onClose={() => setIsPasseioModalOpen(false)}
        onSaved={handlePasseioSaved}
      />
    </main>
  );
}
