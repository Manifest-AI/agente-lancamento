'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import type { ReservationRecord } from '@/lib/queries/reservas';
import {
  type ReservationTableRecord,
  type ReservationViewMode,
  type ReservationsViewSort,
  type ReservationsViewSortField,
} from '@/lib/queries/reservationsView';
import ReservationDetailsModal from './ReservationDetailsModal';
import {
  formatDate,
  formatPasseioPassengerSummary,
  formatPasseioTipoLabel,
  formatRegimeLabel,
  getStatusStyle,
  type StatusVariant,
} from './reservationUtils';

type ReservationsTableProps = {
  reservations: ReservationTableRecord[];
  viewMode: ReservationViewMode;
  isLoading: boolean;
  page: number;
  pageSize: number;
  total: number;
  sort: ReservationsViewSort;
  onSortChange: (field: ReservationsViewSortField) => void;
  onPageChange: (page: number) => void;
  onDelete: (id: string) => void;
  onReservationUpdate: (reservation: ReservationRecord) => void;
  userId?: string;
};

type ColumnConfig = {
  key: string;
  label: string;
  field?: ReservationsViewSortField;
  render: (record: ReservationTableRecord) => ReactNode;
  className?: string;
};

function SortButton({
  label,
  field,
  currentSort,
  onClick,
}: {
  label: string;
  field: ReservationsViewSortField;
  currentSort: ReservationsViewSort;
  onClick: (field: ReservationsViewSortField) => void;
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
      <span className="text-[10px] font-semibold">{isActive ? (direction === 'asc' ? '▲' : '▼') : '↕'}</span>
    </button>
  );
}

const columnDefinitions: Record<ReservationViewMode, ColumnConfig[]> = {
  traslados: [
    {
      key: 'operadora',
      label: 'OPERADORA',
      render: (record) => (
        <span className="block truncate" title={record.operadora ?? '-'}>
          {record.operadora ?? '-'}
        </span>
      ),
    },
    {
      key: 'regime',
      label: 'REGIME',
      render: (record) => formatRegimeLabel(record.regime),
    },
    {
      key: 'numero_reserva',
      label: 'Nº RESERVA',
      render: (record) => record.numeroReserva ?? '-',
    },
    {
      key: 'passageiro',
      label: 'PASSAGEIRO',
      field: 'nome_pax',
      render: (record) => record.nomePax ?? '-',
    },
    {
      key: 'hotel',
      label: 'HOTEL',
      render: (record) => (
        <span className="block truncate" title={record.hotel ?? '-'}>
          {record.hotel ?? '-'}
        </span>
      ),
    },
    {
      key: 'data_chegada',
      label: 'DATA CHEGADA',
      field: 'data_chegada',
      render: (record) => formatDate(record.dataChegada),
    },
    {
      key: 'data_saida',
      label: 'DATA SAÍDA',
      field: 'data_saida',
      render: (record) => formatDate(record.dataSaida),
    },
    {
      key: 'status',
      label: 'STATUS',
      field: 'status',
      render: (record) => (
        <span
          className={`inline-flex min-w-[120px] items-center justify-center rounded-full px-3 py-1 text-xs font-semibold ${getStatusStyle(
            (record.status as StatusVariant) ?? 'Pendente',
          )}`}
        >
          {record.status ?? 'Sem status'}
        </span>
      ),
    },
  ],
  passeios: [
    {
      key: 'numero_reserva',
      label: 'Nº RESERVA',
      render: (record) => record.numeroReserva ?? '-',
    },
    {
      key: 'tipo_passeio',
      label: 'TIPO DE PASSEIO',
      field: 'tipo_passeio',
      render: (record) => formatPasseioTipoLabel(record.tipoPasseio),
    },
    {
      key: 'data_passeio',
      label: 'DATA DO PASSEIO',
      field: 'data_passeio',
      render: (record) => formatDate(record.dataPasseio),
    },
    {
      key: 'regime',
      label: 'REGIME',
      render: (record) => formatRegimeLabel(record.regime),
    },
    {
      key: 'hotel',
      label: 'HOTEL',
      render: (record) => (
        <span className="block truncate" title={record.hotel ?? '-'}>
          {record.hotel ?? '-'}
        </span>
      ),
    },
    {
      key: 'passageiros',
      label: 'PASSAGEIRO',
      render: (record) => formatPasseioPassengerSummary(record.passageiros),
    },
    {
      key: 'descricao',
      label: 'DESCRIÇÃO',
      render: (record) => (
        <span className="block truncate" title={record.descricaoPasseio ?? '-'}>
          {record.descricaoPasseio ?? '-'}
        </span>
      ),
    },
  ],
  ambos: [
    {
      key: 'tipo',
      label: 'TIPO',
      render: (record) => {
        const variant = record.source === 'ambos' ? 'Traslado + Passeio' : record.source === 'traslado' ? 'Traslado' : 'Passeio';
        const styles =
          record.source === 'ambos'
            ? 'bg-indigo-100 text-indigo-700'
            : record.source === 'traslado'
              ? 'bg-sky-100 text-sky-700'
              : 'bg-amber-100 text-amber-700';

        return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${styles}`}>{variant}</span>;
      },
    },
    {
      key: 'operadora',
      label: 'OPERADORA',
      render: (record) => (
        <span className="block truncate" title={record.operadora ?? '-'}>
          {record.operadora ?? '-'}
        </span>
      ),
    },
    {
      key: 'regime',
      label: 'REGIME',
      render: (record) => formatRegimeLabel(record.regime),
    },
    {
      key: 'numero_reserva',
      label: 'Nº RESERVA',
      render: (record) => record.numeroReserva ?? '-',
    },
    {
      key: 'passageiro',
      label: 'PASSAGEIRO',
      field: 'nome_pax',
      render: (record) => record.nomePax ?? formatPasseioPassengerSummary(record.passageiros),
    },
    {
      key: 'hotel',
      label: 'HOTEL',
      render: (record) => (
        <span className="block truncate" title={record.hotel ?? '-'}>
          {record.hotel ?? '-'}
        </span>
      ),
    },
    {
      key: 'data_chegada',
      label: 'DATA CHEGADA',
      field: 'data_chegada',
      render: (record) => formatDate(record.dataChegada),
    },
    {
      key: 'data_saida',
      label: 'DATA SAÍDA',
      field: 'data_saida',
      render: (record) => formatDate(record.dataSaida),
    },
    {
      key: 'data_passeio',
      label: 'DATA PASSEIO',
      field: 'data_passeio',
      render: (record) => formatDate(record.dataPasseio),
    },
    {
      key: 'tipo_passeio',
      label: 'TIPO PASSEIO',
      field: 'tipo_passeio',
      render: (record) => formatPasseioTipoLabel(record.tipoPasseio),
    },
    {
      key: 'descricao',
      label: 'DESCRIÇÃO PASSEIO',
      render: (record) => (
        <span className="block truncate" title={record.descricaoPasseio ?? '-'}>
          {record.descricaoPasseio ?? '-'}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'STATUS',
      field: 'status',
      render: (record) => (
        <span
          className={`inline-flex min-w-[120px] items-center justify-center rounded-full px-3 py-1 text-xs font-semibold ${getStatusStyle(
            (record.status as StatusVariant) ?? 'Pendente',
          )}`}
        >
          {record.status ?? 'Sem status'}
        </span>
      ),
    },
  ],
};

function TableHead({
  sort,
  onSortChange,
  viewMode,
}: {
  sort: ReservationsViewSort;
  onSortChange: (field: ReservationsViewSortField) => void;
  viewMode: ReservationViewMode;
}) {
  const columns = columnDefinitions[viewMode];

  return (
    <thead className="bg-slate-50">
      <tr>
        {columns.map((column) => (
          <th key={column.key} className="px-4 py-3 text-left align-middle text-xs uppercase tracking-wide text-slate-500">
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

function SkeletonRow({ columnsCount }: { columnsCount: number }) {
  return (
    <tr className="animate-pulse border-b border-slate-100 last:border-0">
      {Array.from({ length: columnsCount }).map((_, index) => (
        <td key={index} className="px-4 py-4">
          <div className="h-4 w-full rounded bg-slate-200" />
        </td>
      ))}
    </tr>
  );
}

function EmptyState({ viewMode }: { viewMode: ReservationViewMode }) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      <p className="text-sm text-slate-500">
        {viewMode === 'passeios'
          ? 'Nenhum passeio encontrado para os filtros aplicados.'
          : 'Nenhum registro encontrado para os filtros aplicados.'}
      </p>
      <Link
        href="/nova-reserva"
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
      >
        Criar nova reserva
      </Link>
    </div>
  );
}

function renderActions(
  record: ReservationTableRecord,
  onView: (reservation: ReservationRecord) => void,
  onDelete: (id: string) => void,
) {
  if (!record.reservation) {
    return <span className="text-xs text-slate-400">-</span>;
  }

  return (
    <div className="flex justify-end gap-2 text-xs font-semibold">
      <button
        type="button"
        onClick={() => onView(record.reservation as ReservationRecord)}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-600 transition hover:border-slate-400 hover:bg-slate-50"
      >
        Ver detalhes
      </button>
      <button
        type="button"
        onClick={() => onDelete(record.reservation!.id)}
        className="rounded-lg border border-rose-200 px-3 py-1.5 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50"
      >
        Excluir
      </button>
    </div>
  );
}

export default function ReservationsTable({
  reservations,
  viewMode,
  isLoading,
  page,
  pageSize,
  total,
  sort,
  onSortChange,
  onPageChange,
  onDelete,
  onReservationUpdate,
  userId,
}: ReservationsTableProps) {
  const [selectedReservation, setSelectedReservation] = useState<ReservationRecord | null>(null);
  const columns = columnDefinitions[viewMode];

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const fromItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toItem = Math.min(total, page * pageSize);

  const content = useMemo(() => {
    if (isLoading) {
      return (
        <tbody>
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonRow key={index} columnsCount={columns.length + 1} />
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
            {columns.map((column) => (
              <td key={column.key} className="px-4 py-3 align-middle">
                {column.render(reservation)}
              </td>
            ))}
            <td className="px-4 py-3 text-right">
              {renderActions(reservation, (item) => setSelectedReservation(item), onDelete)}
            </td>
          </tr>
        ))}
      </tbody>
    );
  }, [columns, isLoading, onDelete, reservations]);

  const handleCloseDetails = () => setSelectedReservation(null);

  const handleReservationUpdated = (reservation: ReservationRecord) => {
    onReservationUpdate(reservation);
    setSelectedReservation(reservation);
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <TableHead sort={sort} onSortChange={onSortChange} viewMode={viewMode} />
          {content}
        </table>
      </div>

      <ReservationDetailsModal
        reservation={selectedReservation}
        open={Boolean(selectedReservation)}
        onClose={handleCloseDetails}
        onUpdate={handleReservationUpdated}
        userId={userId}
      />

      {!isLoading && reservations.length === 0 ? <EmptyState viewMode={viewMode} /> : null}

      <footer className="flex flex-col gap-4 border-t border-slate-200 px-4 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Exibindo {fromItem} - {toItem} de {total} registro(s)
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
