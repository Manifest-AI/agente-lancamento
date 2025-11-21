'use client';

import { useCallback, useEffect, useState } from 'react';
import { parseFlexibleToDate } from '@/lib/dateBr';
import { updateReservation, type ReservationRecord, type UpdateReservationPayload } from '@/lib/queries/reservas';
import {
  formatDate,
  formatDateTime,
  formatRegimeLabel,
  formatTime,
  getStatusStyle,
  type StatusVariant,
} from './reservationUtils';

type ReservationDetailsModalProps = {
  reservation: ReservationRecord | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (reservation: ReservationRecord) => void;
  userId?: string;
};

type FormState = {
  operadora: string;
  numeroReserva: string;
  dataChegada: string;
  dataSaida: string;
  vooChegada: string;
  vooSaida: string;
  horarioChegada: string;
  horarioSaida: string;
  hotel: string;
  ident: string;
  passageiro: string;
  status: string;
  regime: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const TIME_REGEX = /^\d{2}:\d{2}$/;
const FLIGHT_REGEX = /^[A-Z0-9]{2,3}\d{3,4}$/;

function toDatabaseDate(value: string) {
  const [day, month, year] = value.split('/');
  if (!day || !month || !year) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

function formatDisplayDate(value: string | null | undefined) {
  const formatted = formatDate(value);
  return formatted === '-' ? '' : formatted;
}

function formatDisplayTime(value: string | null | undefined) {
  const formatted = formatTime(value);
  return formatted === '-' ? '' : formatted;
}

function mapReservationToForm(reservation: ReservationRecord): FormState {
  return {
    operadora: reservation.operadora ?? '',
    numeroReserva: reservation.numero_reserva ?? '',
    dataChegada: formatDisplayDate(reservation.data_chegada),
    dataSaida: formatDisplayDate(reservation.data_saida),
    vooChegada: reservation.voo_chegada ?? '',
    vooSaida: reservation.voo_saida ?? '',
    horarioChegada: formatDisplayTime(reservation.horario_voo_chegada),
    horarioSaida: formatDisplayTime(reservation.horario_voo_saida),
    hotel: reservation.hotel ?? '',
    ident: reservation.ident ?? '',
    passageiro: reservation.nome_pax ?? reservation.passageiro ?? '',
    status: reservation.status ?? '',
    regime: reservation.regime ?? '',
  };
}

function sanitizeForm(values: FormState): FormState {
  return {
    operadora: values.operadora.trim(),
    numeroReserva: values.numeroReserva.trim(),
    dataChegada: values.dataChegada.trim(),
    dataSaida: values.dataSaida.trim(),
    vooChegada: values.vooChegada.trim().toUpperCase(),
    vooSaida: values.vooSaida.trim().toUpperCase(),
    horarioChegada: values.horarioChegada.trim(),
    horarioSaida: values.horarioSaida.trim(),
    hotel: values.hotel.trim(),
    ident: values.ident.trim().toUpperCase(),
    passageiro: values.passageiro.trim().toUpperCase(),
    status: values.status.trim(),
    regime: values.regime.trim().toUpperCase(),
  };
}

function validateForm(values: FormState): FormErrors {
  const errors: FormErrors = {};

  if (!values.operadora) {
    errors.operadora = 'Campo obrigatório.';
  }

  if (!values.numeroReserva) {
    errors.numeroReserva = 'Campo obrigatório.';
  }

  if (!values.dataChegada) {
    errors.dataChegada = 'Campo obrigatório.';
  } else if (!parseFlexibleToDate(values.dataChegada)) {
    errors.dataChegada = 'Use o formato dd/MM/aaaa.';
  }

  if (!values.dataSaida) {
    errors.dataSaida = 'Campo obrigatório.';
  } else if (!parseFlexibleToDate(values.dataSaida)) {
    errors.dataSaida = 'Use o formato dd/MM/aaaa.';
  }

  if (!values.ident) {
    errors.ident = 'Campo obrigatório.';
  }

  if (!values.vooChegada) {
    errors.vooChegada = 'Campo obrigatório.';
  } else if (!FLIGHT_REGEX.test(values.vooChegada)) {
    errors.vooChegada = 'Informe o código do voo (ex.: LA3600).';
  }

  if (!values.vooSaida) {
    errors.vooSaida = 'Campo obrigatório.';
  } else if (!FLIGHT_REGEX.test(values.vooSaida)) {
    errors.vooSaida = 'Informe o código do voo (ex.: LA3343).';
  }

  if (!values.horarioChegada) {
    errors.horarioChegada = 'Campo obrigatório.';
  } else if (!TIME_REGEX.test(values.horarioChegada)) {
    errors.horarioChegada = 'Use o formato HH:mm.';
  }

  if (!values.horarioSaida) {
    errors.horarioSaida = 'Campo obrigatório.';
  } else if (!TIME_REGEX.test(values.horarioSaida)) {
    errors.horarioSaida = 'Use o formato HH:mm.';
  }

  if (!values.hotel) {
    errors.hotel = 'Campo obrigatório.';
  }

  if (!values.passageiro) {
    errors.passageiro = 'Campo obrigatório.';
  }

  const normalizedRegime = values.regime.trim().toUpperCase();
  if (!normalizedRegime) {
    errors.regime = 'Campo obrigatório.';
  } else if (!['PRIVATIVO', 'REGULAR'].includes(normalizedRegime)) {
    errors.regime = 'Use PRIVATIVO ou REGULAR.';
  }

  return errors;
}

export default function ReservationDetailsModal({ reservation, open, onClose, onUpdate, userId }: ReservationDetailsModalProps) {
  const [formState, setFormState] = useState<FormState | null>(reservation ? mapReservationToForm(reservation) : null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    setIsEditing(false);
    setErrors({});
    setSaveError(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open || !reservation) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, open, reservation]);

  useEffect(() => {
    if (!reservation) {
      setFormState(null);
      setIsEditing(false);
      setErrors({});
      setSaveError(null);
      return;
    }

    setFormState(mapReservationToForm(reservation));
    setErrors({});
    setIsEditing(false);
    setSaveError(null);
  }, [reservation]);

  if (!open || !reservation || !formState) {
    return null;
  }

  const handleFieldChange = (field: keyof FormState, value: string) => {
    setFormState((previous) => (previous ? { ...previous, [field]: value } : previous));
  };

  const handleCancelEditing = () => {
    setFormState(mapReservationToForm(reservation));
    setErrors({});
    setSaveError(null);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!reservation || !formState) {
      return;
    }

    const sanitized = sanitizeForm(formState);
    const validationErrors = validateForm(sanitized);

    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      setSaveError('Revise os campos destacados antes de salvar.');
      return;
    }

    const payload = {
      operadora: sanitized.operadora || null,
      numero_reserva: sanitized.numeroReserva || null,
      data_chegada: toDatabaseDate(sanitized.dataChegada),
      data_saida: toDatabaseDate(sanitized.dataSaida),
      voo_chegada: sanitized.vooChegada || null,
      voo_saida: sanitized.vooSaida || null,
      horario_voo_chegada: sanitized.horarioChegada || null,
      horario_voo_saida: sanitized.horarioSaida || null,
      hotel: sanitized.hotel || null,
      ident: sanitized.ident || null,
      status: sanitized.status || null,
      nome_pax: sanitized.passageiro || null,
      regime: sanitized.regime || null,
    } satisfies UpdateReservationPayload;

    setIsSaving(true);
    setSaveError(null);

    try {
      const updated = await updateReservation(reservation.id, payload, userId);
      setFormState(mapReservationToForm(updated));
      setIsEditing(false);
      setErrors({});
      onUpdate(updated);
    } catch (error) {
      console.error('Erro ao atualizar reserva', error);
      setSaveError('Não foi possível salvar as alterações. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  type DetailField =
    | { key: keyof FormState; label: string; value: string; isStatus?: boolean; fullWidth?: boolean }
    | { key: 'createdAt'; label: string; value: string; fullWidth?: boolean; isStatus?: boolean };

  const detailFields: DetailField[] = [
    { key: 'operadora', label: 'OPERADORA', value: reservation.operadora ?? '-' },
    { key: 'regime', label: 'REGIME', value: formatRegimeLabel(reservation.regime) },
    { key: 'numeroReserva', label: 'Nº RESERVA', value: reservation.numero_reserva ?? '-' },
    { key: 'dataChegada', label: 'DATA CHEGADA', value: formatDate(reservation.data_chegada) },
    { key: 'dataSaida', label: 'DATA SAÍDA', value: formatDate(reservation.data_saida) },
    { key: 'vooChegada', label: 'VOO CHEGADA', value: reservation.voo_chegada ?? '-' },
    { key: 'vooSaida', label: 'VOO SAÍDA', value: reservation.voo_saida ?? '-' },
    { key: 'horarioChegada', label: 'HORÁRIO CHEGADA', value: formatTime(reservation.horario_voo_chegada) },
    { key: 'horarioSaida', label: 'HORÁRIO SAÍDA', value: formatTime(reservation.horario_voo_saida) },
    { key: 'hotel', label: 'HOTEL', value: reservation.hotel ?? '-' },
    { key: 'ident', label: 'IDENT', value: reservation.ident ?? '-' },
    { key: 'passageiro', label: 'PASSAGEIRO', value: reservation.nome_pax ?? reservation.passageiro ?? '-' },
    { key: 'status', label: 'STATUS', value: reservation.status ?? 'Sem status', isStatus: true },
    { key: 'createdAt', label: 'CRIADO EM', value: formatDateTime(reservation.created_at), fullWidth: true },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reservation-details-title"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div className="space-y-1">
            <h2 id="reservation-details-title" className="text-xl font-semibold text-slate-900">
              Detalhes da reserva {reservation.numero_reserva ? `#${reservation.numero_reserva}` : ''}
            </h2>
            <p className="text-sm text-slate-600">Informações completas da reserva selecionada.</p>
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <button
                type="button"
                onClick={handleCancelEditing}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Cancelar edição
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Editar
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Fechar
            </button>
          </div>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 py-6">
          <div className="grid gap-4 md:grid-cols-2">
            {isEditing
              ? detailFields.map((field) => {
                  if (field.key === 'createdAt') {
                    return (
                      <div key={field.label} className="flex flex-col gap-2 md:col-span-2">
                        <p className="text-sm font-medium text-slate-700">{field.label}</p>
                        <div className="min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 shadow-sm">
                          {field.value}
                        </div>
                      </div>
                    );
                  }

                  const value = formState[field.key as keyof FormState];
                  const error = errors[field.key as keyof FormErrors];

                  return (
                    <div key={field.label} className={`flex flex-col gap-2 ${field.fullWidth ? 'md:col-span-2' : ''}`}>
                      <label className="text-sm font-medium text-slate-700" htmlFor={`edit-${field.key}`}>
                        {field.label}
                      </label>
                      <input
                        id={`edit-${field.key}`}
                        type="text"
                        value={value ?? ''}
                        onChange={(event) => handleFieldChange(field.key as keyof FormState, event.target.value)}
                        className={`w-full rounded-xl border px-3 py-2 text-sm shadow-sm transition focus:outline-none focus:ring-2 ${
                          error ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-200' : 'border-slate-300 focus:border-blue-500 focus:ring-blue-200'
                        }`}
                        aria-invalid={Boolean(error)}
                        aria-errormessage={error ? `edit-${field.key}-error` : undefined}
                      />
                      {error ? (
                        <span id={`edit-${field.key}-error`} className="text-xs font-medium text-rose-600">
                          {error}
                        </span>
                      ) : null}
                    </div>
                  );
                })
              : detailFields.map((detail) => (
                  <div
                    key={detail.label}
                    className={`flex flex-col gap-2 ${detail.fullWidth ? 'md:col-span-2' : ''}`}
                  >
                    <p className="text-sm font-medium text-slate-700">{detail.label}</p>
                    {detail.isStatus ? (
                      <span
                        className={`inline-flex min-h-[42px] min-w-[120px] items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold ${
                          getStatusStyle((reservation.status as StatusVariant) ?? 'Pendente')
                        }`}
                      >
                        {detail.value}
                      </span>
                    ) : (
                      <div className="min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 shadow-sm">
                        {detail.value}
                      </div>
                    )}
                  </div>
                ))}
          </div>

          {saveError ? <p className="mt-4 text-sm font-medium text-rose-600">{saveError}</p> : null}

          {isEditing ? (
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
