'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation';
import { RESERVATIONS_DEFAULT_PAGE_SIZE, type ReservationFilters, type ReservationOptions, type ReservationRecord } from '@/lib/queries/reservas';
import {
  deleteReservation,
  fetchOptionsByMode,
  fetchReservationsView,
  type ReservationTableRecord,
  type ReservationViewMode,
  type ReservationsViewSort,
  type ReservationsViewSortField,
} from '@/lib/queries/reservationsView';
import { useAuth } from '@/hooks/useAuth';
import { ImportPasseioModal } from '@/components/ImportPasseioModal';
import ReservationsFilters from './ReservationsFilters';
import ReservationsTable from './ReservationsTable';
import DeleteReservationDialog from './DeleteReservationDialog';

const DEFAULT_SORT: ReservationsViewSort = { field: 'created_at', direction: 'desc' };
const DEFAULT_VIEW_MODE: ReservationViewMode = 'traslados';

function parseNumber(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

function parseSort(value: string | null, viewMode: ReservationViewMode): ReservationsViewSort {
  if (!value) {
    return DEFAULT_SORT;
  }

  const [field, direction] = value.split(':');

  const commonFields: ReservationsViewSortField[] = ['created_at'];
  const allowedByMode: Record<ReservationViewMode, ReservationsViewSortField[]> = {
    traslados: ['data_chegada', 'data_saida', 'created_at', 'nome_pax', 'status'],
    passeios: ['created_at', 'data_passeio', 'tipo_passeio'],
    ambos: ['data_chegada', 'data_saida', 'created_at', 'nome_pax', 'status', 'data_passeio', 'tipo_passeio'],
  };

  const allowedFields: ReservationsViewSortField[] = Array.from(
    new Set([...(allowedByMode[viewMode] ?? []), ...commonFields]),
  );

  if (!allowedFields.includes(field as ReservationsViewSortField)) {
    return DEFAULT_SORT;
  }

  if (direction !== 'asc' && direction !== 'desc') {
    return DEFAULT_SORT;
  }

  return { field: field as ReservationsViewSortField, direction };
}

function formatSort(sort: ReservationsViewSort) {
  return `${sort.field}:${sort.direction}`;
}

function parseViewMode(value: string | null): ReservationViewMode {
  if (value === 'passeios' || value === 'ambos' || value === 'traslados') {
    return value;
  }

  return DEFAULT_VIEW_MODE;
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
  viewMode,
}: {
  page: number;
  filters: ReservationFilters;
  sort: ReservationsViewSort;
  viewMode: ReservationViewMode;
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

  if (viewMode !== DEFAULT_VIEW_MODE) {
    params.set('mode', viewMode);
  }

  return params.toString();
}

export default function ReservationsPageContent() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [reservations, setReservations] = useState<ReservationTableRecord[]>([]);
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
  const [viewMode, setViewMode] = useState<ReservationViewMode>(() => parseViewMode(searchParams.get('mode')));
  const sort = useMemo(() => parseSort(searchParams.get('sort'), viewMode), [searchParams, viewMode]);

  useEffect(() => {
    setViewMode(parseViewMode(searchParams.get('mode')));
  }, [searchParams]);

  const handleNavigate = useCallback(
    (next: { page?: number; filters?: ReservationFilters; sort?: ReservationsViewSort; viewMode?: ReservationViewMode }) => {
      const nextPage = next.page ?? 1;
      const nextFilters = next.filters ?? filters;
      const nextSort = next.sort ?? sort;
      const nextViewMode = next.viewMode ?? viewMode;
      const query = formatQueryString({ page: nextPage, filters: nextFilters, sort: nextSort, viewMode: nextViewMode });
      const target = query ? `${pathname}?${query}` : pathname;
      setFeedback(null);
      setError(null);
      router.push(target);
    },
    [filters, pathname, router, sort, viewMode],
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
        fetchReservationsView({
          mode: viewMode,
          page,
          pageSize: RESERVATIONS_DEFAULT_PAGE_SIZE,
          sort,
          filters,
          userId: user.id,
        }),
        fetchOptionsByMode(viewMode, user.id),
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
  }, [filters, handleNavigate, page, sort, user, viewMode]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const handleSortChange = useCallback(
    (field: ReservationsViewSortField) => {
      const defaultDirection = ['nome_pax', 'tipo_passeio'].includes(field) ? 'asc' : 'desc';
      const nextDirection = sort.field === field ? (sort.direction === 'asc' ? 'desc' : 'asc') : defaultDirection;

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

  const handleGoToDashboard = useCallback(() => {
    router.push('/dashboard');
  }, [router]);

  const handleGoToNovaReserva = useCallback(() => {
    router.push('/nova-reserva');
  }, [router]);

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
        if (reservation.reservation?.id !== updated.id) {
          return reservation;
        }

        return {
          ...reservation,
          reservation: updated,
          source: reservation.passeio ? 'ambos' : 'traslado',
          operadora: updated.operadora,
          regime: updated.regime,
          numeroReserva: updated.numero_reserva ?? updated.codigo_reserva ?? reservation.numeroReserva ?? null,
          nomePax: updated.nome_pax ?? updated.passageiro ?? reservation.nomePax ?? null,
          hotel: updated.hotel ?? reservation.hotel ?? null,
          dataChegada: updated.data_chegada ?? updated.data_voo_ida ?? reservation.dataChegada ?? null,
          dataSaida: updated.data_saida ?? updated.data_voo_volta ?? reservation.dataSaida ?? null,
          status: updated.status ?? reservation.status ?? null,
          createdAt: updated.created_at ?? reservation.createdAt ?? null,
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

  const handleViewModeChange = useCallback(
    (mode: ReservationViewMode) => {
      setViewMode(mode);
      handleNavigate({ page: 1, sort: DEFAULT_SORT, viewMode: mode });
    },
    [handleNavigate],
  );

  const viewModeOptions: { value: ReservationViewMode; label: string }[] = useMemo(
    () => [
      { value: 'traslados', label: 'Traslados' },
      { value: 'passeios', label: 'Passeios' },
      { value: 'ambos', label: 'Ambos (traslados + passeios)' },
    ],
    [],
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-none flex-col gap-8 px-6 py-12">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Reservas</h1>
          <p className="text-sm text-slate-600">Consulte e acompanhe suas reservas cadastradas.</p>
        </div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleGoToDashboard}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Voltar ao painel
          </button>
          <button
            type="button"
            onClick={() => setIsPasseioModalOpen(true)}
            className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
          >
            Importar passeios
          </button>
          <button
            type="button"
            onClick={handleGoToNovaReserva}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
          >
            Criar nova reserva
          </button>
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

      <section className="flex items-center justify-start">
        <div className="inline-flex gap-2 rounded-full border border-slate-200 bg-slate-50 p-1 text-sm font-semibold text-slate-700 shadow-sm">
          {viewModeOptions.map((option) => {
            const isActive = option.value === viewMode;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleViewModeChange(option.value)}
                className={`rounded-full px-4 py-2 transition ${
                  isActive
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
                aria-pressed={isActive}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <ReservationsTable
          reservations={reservations}
          viewMode={viewMode}
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
