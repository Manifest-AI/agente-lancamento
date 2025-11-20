'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ReservationRecord, ReservationsSort, ReservationsSortField } from '@/lib/queries/reservas';
import ReservationDetailsModal from './ReservationDetailsModal';
import { formatDate, getStatusStyle, type StatusVariant } from './reservationUtils';

type ReservationsTableProps = {
  reservations: ReservationRecord[];
  isLoading: boolean;
  page: number;
  pageSize: number;
  total: number;
  sort: ReservationsSort;
  onSortChange: (field: ReservationsSortField) => void;
  onPageChange: (page: number) => void;
  onDelete: (id: string) => void;
};

function SortButton({
  label,
  field,
  currentSort,
  onClick,
}: {
  label: string;
  field: ReservationsSortField;
  currentSort: ReservationsSort;
  onClick: (field: ReservationsSortField) => void;
}) {
  const isActive = currentSort.field === field;
  const direction = isActive ? currentSort.direction : undefined;
  const ariaSort = isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none';

  return (
    <button
      type="button"
      onClick={() => onClick(field)}
      className="flex items-center gap-1 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 transition hover:text-slate-700"
      aria-sort={ariaSort}
    >
      {label}
      <span className="text-[10px] font-semibold">
        {isActive ? (direction === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </button>
  );
}

const headerCells: { label: string; field?: ReservationsSortField }[] = [
  { label: 'OPERADORA' },
  { label: 'Nº RESERVA' },
  { label: 'PASSAGEIRO', field: 'nome_pax' },
  { label: 'HOTEL' },
  { label: 'DATA CHEGADA', field: 'data_chegada' },
  { label: 'DATA SAÍDA', field: 'data_saida' },
  { label: 'STATUS', field: 'status' },
];

function TableHead({ sort, onSortChange }: { sort: ReservationsSort; onSortChange: (field: ReservationsSortField) => void }) {
  return (
    <thead className="bg-slate-50">
      <tr>
        {headerCells.map((column) => (
          <th key={column.label} className="px-4 py-3 text-left align-middle text-xs uppercase tracking-wide text-slate-500">
            {column.field ? (
              <SortButton label={column.label} field={column.field} currentSort={sort} onClick={onSortChange} />
            ) : (
              column.label
            )}
          </th>
        ))}
        <th className="px-4 py-3 text-right text-xs uppercase tracking-wide text-slate-500">Ações</th>
      </tr>
    </thead>
  );
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse border-b border-slate-100 last:border-0">
      {Array.from({ length: headerCells.length + 1 }).map((_, index) => (
        <td key={index} className="px-4 py-4">
          <div className="h-4 w-full rounded bg-slate-200" />
        </td>
      ))}
    </tr>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      <p className="text-sm text-slate-500">Nenhuma reserva encontrada para os filtros aplicados.</p>
      <Link
        href="/nova-reserva"
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
      >
        Criar nova reserva
      </Link>
    </div>
  );
}

export default function ReservationsTable({
  reservations,
  isLoading,
  page,
  pageSize,
  total,
  sort,
  onSortChange,
  onPageChange,
  onDelete,
}: ReservationsTableProps) {
  const [selectedReservation, setSelectedReservation] = useState<ReservationRecord | null>(null);
  const handleCloseDetails = () => setSelectedReservation(null);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const fromItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toItem = Math.min(total, page * pageSize);

  const content = useMemo(() => {
    if (isLoading && reservations.length === 0) {
      return (
        <tbody>
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonRow key={index} />
          ))}
        </tbody>
      );
    }

    if (!isLoading && reservations.length === 0) {
      return <tbody />;
    }

    return (
      <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
        {reservations.map((reservation) => (
          <tr key={reservation.id} className="transition hover:bg-slate-50">
            <td className="max-w-[160px] px-4 py-3">
              <span className="block truncate" title={reservation.operadora ?? '-'}>
                {reservation.operadora ?? '-'}
              </span>
            </td>
            <td className="px-4 py-3 text-sm text-slate-700" title={reservation.numero_reserva ?? '-'}>
              {reservation.numero_reserva ?? '-'}
            </td>
            <td className="max-w-[200px] px-4 py-3">
              <span className="block truncate" title={reservation.nome_pax ?? '-'}>
                {reservation.nome_pax ?? '-'}
              </span>
            </td>
            <td className="max-w-[180px] px-4 py-3">
              <span className="block truncate" title={reservation.hotel ?? '-'}>
                {reservation.hotel ?? '-'}
              </span>
            </td>
            <td className="px-4 py-3 text-sm text-slate-600">{formatDate(reservation.data_chegada)}</td>
            <td className="px-4 py-3 text-sm text-slate-600">{formatDate(reservation.data_saida)}</td>
            <td className="px-4 py-3">
              <span
                className={`inline-flex min-w-[120px] items-center justify-center rounded-full px-3 py-1 text-xs font-semibold ${getStatusStyle(
                  (reservation.status as StatusVariant) ?? 'Pendente',
                )}`}
              >
                {reservation.status ?? 'Sem status'}
              </span>
            </td>
            <td className="px-4 py-3 text-right">
              <div className="flex justify-end gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setSelectedReservation(reservation)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-600 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Ver detalhes
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(reservation.id)}
                  className="rounded-lg border border-rose-200 px-3 py-1.5 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50"
                >
                  Excluir
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    );
  }, [isLoading, reservations, onDelete]);

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <TableHead sort={sort} onSortChange={onSortChange} />
          {content}
        </table>
      </div>

      <ReservationDetailsModal reservation={selectedReservation} open={Boolean(selectedReservation)} onClose={handleCloseDetails} />

      {!isLoading && reservations.length === 0 ? <EmptyState /> : null}

      <footer className="flex flex-col gap-4 border-t border-slate-200 px-4 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Exibindo {fromItem} - {toItem} de {total} reserva(s)
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1 || isLoading}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Anterior
          </button>
          <span className="text-xs text-slate-500">
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages || isLoading}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Próxima
          </button>
        </div>
      </footer>
    </div>
  );
}
