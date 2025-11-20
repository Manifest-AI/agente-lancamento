'use client';

import { useEffect } from 'react';
import type { ReservationRecord } from '@/lib/queries/reservas';
import { formatDate, formatDateTime, formatTime, getStatusStyle, type StatusVariant } from './reservationUtils';

type ReservationDetailsModalProps = {
  reservation: ReservationRecord | null;
  open: boolean;
  onClose: () => void;
};

export default function ReservationDetailsModal({ reservation, open, onClose }: ReservationDetailsModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open || !reservation) {
    return null;
  }

  const details = [
    { label: 'IDENT', value: reservation.ident ?? '-' },
    { label: 'Nº RESERVA', value: reservation.numero_reserva ?? '-' },
    { label: 'OPERADORA', value: reservation.operadora ?? '-' },
    { label: 'HOTEL', value: reservation.hotel ?? '-' },
    { label: 'PASSAGEIRO', value: reservation.nome_pax ?? reservation.passageiro ?? '-' },
    { label: 'DATA CHEGADA', value: formatDate(reservation.data_chegada) },
    { label: 'DATA SAÍDA', value: formatDate(reservation.data_saida) },
    { label: 'VOO CHEGADA', value: reservation.voo_chegada ?? '-' },
    { label: 'HORÁRIO CHEGADA', value: formatTime(reservation.horario_voo_chegada) },
    { label: 'VOO SAÍDA', value: reservation.voo_saida ?? '-' },
    { label: 'HORÁRIO SAÍDA', value: formatTime(reservation.horario_voo_saida) },
    { label: 'STATUS', value: reservation.status ?? 'Sem status', isStatus: true },
    { label: 'CRIADO EM', value: formatDateTime(reservation.created_at) },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reservation-details-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="reservation-details-title" className="text-lg font-semibold text-slate-900">
              Detalhes da reserva {reservation.numero_reserva ? `#${reservation.numero_reserva}` : ''}
            </h2>
            <p className="text-sm text-slate-600">Visualize todas as informações da reserva selecionada.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Fechar
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {details.map((detail) => (
            <div key={detail.label} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{detail.label}</p>
              {detail.isStatus ? (
                <span
                  className={`mt-1 inline-flex min-w-[120px] items-center justify-center rounded-full px-3 py-1 text-xs font-semibold ${getStatusStyle((reservation.status as StatusVariant) ?? 'Pendente')}`}
                >
                  {detail.value}
                </span>
              ) : (
                <p className="mt-1 text-sm text-slate-700">{detail.value}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
