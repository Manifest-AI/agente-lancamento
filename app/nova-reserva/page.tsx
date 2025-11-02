'use client';

import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabaseClient';
import { ImportReservaButton } from '@/components/ImportReservaButton';
import { ImportReservaModal } from '@/components/ImportReservaModal';
import type { ReservaPreviewDraft } from './mapReservaToForm';
import { mapPreviewToReservationForm } from './mapReservaToForm';

type ReservationFormData = {
  passengerName: string;
  document: string;
  passengerType: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime: string;
  returnDate: string;
  returnTime: string;
  airline: string;
  reservationCode: string;
  notes: string;
};

const initialFormState: ReservationFormData = {
  passengerName: '',
  document: '',
  passengerType: '',
  origin: '',
  destination: '',
  departureDate: '',
  departureTime: '',
  returnDate: '',
  returnTime: '',
  airline: '',
  reservationCode: '',
  notes: '',
};

const passengerTypes = [
  { label: 'Adulto', value: 'adulto' },
  { label: 'Criança', value: 'crianca' },
  { label: 'Bebê', value: 'bebe' },
];

function formatDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join('/');
}

function formatTimeInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  const parts = [digits.slice(0, 2), digits.slice(2, 4)].filter(Boolean);
  return parts.join(':');
}

function formatDocumentInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);

  if (digits.length <= 9) {
    return digits;
  }

  return digits.replace(
    /(\d{3})(\d{3})(\d{3})(\d{0,2})/,
    (_match, group1, group2, group3, group4) =>
      group4 ? `${group1}.${group2}.${group3}-${group4}` : `${group1}.${group2}.${group3}`,
  );
}

function toDatabaseDate(value: string) {
  const [day, month, year] = value.split('/');
  if (!day || !month || !year) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

function fromDatabaseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split('-');
  if (!year || !month || !day) {
    return null;
  }

  return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
}

function normalizePassengerType(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();
  if (normalized.includes('adult')) {
    return 'adulto';
  }

  if (normalized.includes('cri')) {
    return 'crianca';
  }

  if (normalized.includes('beb')) {
    return 'bebe';
  }

  return null;
}

function isValidDate(value: string) {
  const [day, month, year] = value.split('/').map(Number);
  if (!day || !month || !year) {
    return false;
  }

  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isValidTime(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return false;
  }

  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function isValidCPF(value: string) {
  const digits = value.replace(/\D/g, '');

  if (digits.length !== 11 || /^([0-9])\1+$/.test(digits)) {
    return false;
  }

  const calculateDigit = (slice: number) => {
    const numbers = digits.slice(0, slice).split('').map(Number);
    const weight = numbers.map((number, index) => number * (slice + 1 - index));
    const sum = weight.reduce((accumulator, current) => accumulator + current, 0);
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };

  const digit1 = calculateDigit(9);
  const digit2 = calculateDigit(10);

  return digit1 === Number(digits[9]) && digit2 === Number(digits[10]);
}

function validateDocument(value: string) {
  const digits = value.replace(/\D/g, '');

  if (!digits) {
    return 'Informe o documento do passageiro.';
  }

  if (digits.length === 11) {
    return isValidCPF(digits) ? null : 'CPF inválido. Verifique os números informados.';
  }

  if (digits.length >= 8 && digits.length <= 10) {
    return null;
  }

  return 'Documento inválido. Informe um RG ou CPF válido.';
}

export default function NovaReservaPage() {
  const { user } = useAuth();
  const [formData, setFormData] = useState<ReservationFormData>(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 5000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [toast]);

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;

    setFormData((previous) => {
      if (name === 'departureDate' || name === 'returnDate') {
        return { ...previous, [name]: formatDateInput(value) };
      }

      if (name === 'departureTime' || name === 'returnTime') {
        return { ...previous, [name]: formatTimeInput(value) };
      }

      if (name === 'document') {
        return { ...previous, [name]: formatDocumentInput(value) };
      }

      if (name === 'origin' || name === 'destination' || name === 'reservationCode') {
        return { ...previous, [name]: value.toUpperCase() };
      }

      return { ...previous, [name]: value };
    });
  };

  const validateForm = (data: ReservationFormData) => {
    if (!data.passengerName.trim()) {
      return 'Informe o nome do passageiro.';
    }

    const documentValidation = validateDocument(data.document);
    if (documentValidation) {
      return documentValidation;
    }

    if (!data.passengerType) {
      return 'Selecione o tipo de passageiro.';
    }

    if (!data.origin.trim() || data.origin.trim().length < 3) {
      return 'Informe a origem com pelo menos 3 caracteres.';
    }

    if (!data.destination.trim() || data.destination.trim().length < 3) {
      return 'Informe o destino com pelo menos 3 caracteres.';
    }

    if (!data.departureDate || !isValidDate(data.departureDate)) {
      return 'Informe uma data de ida válida no formato dd/mm/aaaa.';
    }

    if (!data.departureTime || !isValidTime(data.departureTime)) {
      return 'Informe um horário de ida válido no formato hh:mm.';
    }

    if (!data.returnDate || !isValidDate(data.returnDate)) {
      return 'Informe uma data de volta válida no formato dd/mm/aaaa.';
    }

    if (!data.returnTime || !isValidTime(data.returnTime)) {
      return 'Informe um horário de volta válido no formato hh:mm.';
    }

    const departureDateISO = toDatabaseDate(data.departureDate);
    const returnDateISO = toDatabaseDate(data.returnDate);

    if (!departureDateISO || !returnDateISO) {
      return 'Verifique as datas informadas.';
    }

    if (new Date(`${departureDateISO}T${data.departureTime}:00`) > new Date(`${returnDateISO}T${data.returnTime}:00`)) {
      return 'A data de volta deve ser posterior à data de ida.';
    }

    if (!data.airline.trim()) {
      return 'Informe a companhia aérea.';
    }

    if (!data.reservationCode.trim()) {
      return 'Informe o código da reserva.';
    }

    return null;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const validationError = validateForm(formData);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSubmitting(true);

    const payload = {
      nome_passageiro: formData.passengerName.trim(),
      documento: formData.document.replace(/\D/g, ''),
      tipo_passageiro: formData.passengerType,
      origem: formData.origin.trim(),
      destino: formData.destination.trim(),
      data_ida: toDatabaseDate(formData.departureDate),
      hora_ida: formData.departureTime,
      data_volta: toDatabaseDate(formData.returnDate),
      hora_volta: formData.returnTime,
      companhia_aerea: formData.airline.trim(),
      codigo_reserva: formData.reservationCode.trim(),
      observacoes: formData.notes.trim() || null,
      usuario_id: user?.id ?? null,
    };

    const { error } = await supabase.from('reservas').insert([payload]);

    setIsSubmitting(false);

    if (error) {
      console.error('Erro ao salvar reserva', error);
      setErrorMessage('Não foi possível salvar a reserva. Tente novamente em instantes.');
      return;
    }

    setSuccessMessage('Reserva cadastrada com sucesso!');
    setFormData(initialFormState);
  };

  const handleApplyImportedFields = (data: ReservaPreviewDraft) => {
    const mapped = mapPreviewToReservationForm(data);

    setFormData((previous) => {
      const updated = { ...previous };

      if (mapped.passengerName) {
        updated.passengerName = mapped.passengerName.trim();
      }

      if (mapped.passengerType) {
        updated.passengerType = mapped.passengerType;
      }

      if (mapped.origin) {
        updated.origin = mapped.origin.toUpperCase();
      }

      if (mapped.destination) {
        updated.destination = mapped.destination.toUpperCase();
      }

      if (mapped.departureDate) {
        const displayDepartureDate = fromDatabaseDate(mapped.departureDate);
        if (displayDepartureDate) {
          updated.departureDate = displayDepartureDate;
        }
      }

      if (mapped.departureTime) {
        updated.departureTime = formatTimeInput(mapped.departureTime);
      }

      if (mapped.returnDate) {
        const displayReturnDate = fromDatabaseDate(mapped.returnDate);
        if (displayReturnDate) {
          updated.returnDate = displayReturnDate;
        }
      }

      if (mapped.returnTime) {
        updated.returnTime = formatTimeInput(mapped.returnTime);
      }

      if (mapped.reservationCode) {
        updated.reservationCode = mapped.reservationCode.toUpperCase();
      }

      if (mapped.airline) {
        updated.airline = mapped.airline.trim();
      }

      if (mapped.notes) {
        updated.notes = mapped.notes;
      }

      return updated;
    });

    setToast({ type: 'success', message: 'Campos importados com sucesso. Revise antes de salvar.' });
  };

  const handleModalNotify = (payload: { type: 'success' | 'error'; message: string }) => {
    setToast(payload);
  };

  return (
    <ProtectedRoute>
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
        {toast && (
          <div
            role="status"
            className={`fixed right-6 top-6 z-50 flex max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-lg transition ${
              toast.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            <div className="flex-1">{toast.message}</div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-2 text-xs font-medium text-slate-500 transition hover:text-slate-700"
            >
              Fechar
            </button>
          </div>
        )}

        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Cadastro manual</p>
            <h1 className="text-3xl font-semibold text-slate-900">Nova reserva</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Preencha as informações abaixo para registrar uma nova reserva no sistema. Todos os campos são obrigatórios,
              com exceção das observações.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <ImportReservaButton onClick={() => setIsImportModalOpen(true)} />
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Voltar ao painel
            </Link>
          </div>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <section className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="passengerName" className="text-sm font-medium text-slate-700">
                Nome do passageiro
              </label>
              <input
                id="passengerName"
                name="passengerName"
                type="text"
                value={formData.passengerName}
                onChange={handleChange}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Nome completo"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="document" className="text-sm font-medium text-slate-700">
                Documento (RG ou CPF)
              </label>
              <input
                id="document"
                name="document"
                type="text"
                value={formData.document}
                onChange={handleChange}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="000.000.000-00"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="passengerType" className="text-sm font-medium text-slate-700">
                Tipo de passageiro
              </label>
              <select
                id="passengerType"
                name="passengerType"
                value={formData.passengerType}
                onChange={handleChange}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                required
              >
                <option value="" disabled>
                  Selecione uma opção
                </option>
                {passengerTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="airline" className="text-sm font-medium text-slate-700">
                Companhia aérea
              </label>
              <input
                id="airline"
                name="airline"
                type="text"
                value={formData.airline}
                onChange={handleChange}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Ex.: Azul Linhas Aéreas"
                required
              />
            </div>
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="origin" className="text-sm font-medium text-slate-700">
                Origem
              </label>
              <input
                id="origin"
                name="origin"
                type="text"
                value={formData.origin}
                onChange={handleChange}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm uppercase shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Ex.: GRU"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="destination" className="text-sm font-medium text-slate-700">
                Destino
              </label>
              <input
                id="destination"
                name="destination"
                type="text"
                value={formData.destination}
                onChange={handleChange}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm uppercase shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Ex.: LIS"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="departureDate" className="text-sm font-medium text-slate-700">
                Data do voo de ida
              </label>
              <input
                id="departureDate"
                name="departureDate"
                type="text"
                inputMode="numeric"
                value={formData.departureDate}
                onChange={handleChange}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="dd/mm/aaaa"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="departureTime" className="text-sm font-medium text-slate-700">
                Horário do voo de ida
              </label>
              <input
                id="departureTime"
                name="departureTime"
                type="text"
                inputMode="numeric"
                value={formData.departureTime}
                onChange={handleChange}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="hh:mm"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="returnDate" className="text-sm font-medium text-slate-700">
                Data do voo de volta
              </label>
              <input
                id="returnDate"
                name="returnDate"
                type="text"
                inputMode="numeric"
                value={formData.returnDate}
                onChange={handleChange}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="dd/mm/aaaa"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="returnTime" className="text-sm font-medium text-slate-700">
                Horário do voo de volta
              </label>
              <input
                id="returnTime"
                name="returnTime"
                type="text"
                inputMode="numeric"
                value={formData.returnTime}
                onChange={handleChange}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="hh:mm"
                required
              />
            </div>
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="reservationCode" className="text-sm font-medium text-slate-700">
                Código da reserva
              </label>
              <input
                id="reservationCode"
                name="reservationCode"
                type="text"
                value={formData.reservationCode}
                onChange={handleChange}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm uppercase shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Ex.: ABC123"
                required
              />
            </div>

            <div className="flex flex-col gap-2 md:col-span-1">
              <label htmlFor="notes" className="text-sm font-medium text-slate-700">
                Observações
              </label>
              <textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                className="h-24 rounded-xl border border-slate-300 px-4 py-2.5 text-sm shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Anotações adicionais sobre a reserva (opcional)"
              />
            </div>
          </section>

          {errorMessage ? <p className="text-sm font-medium text-rose-600">{errorMessage}</p> : null}
          {successMessage ? <p className="text-sm font-medium text-emerald-600">{successMessage}</p> : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Salvando...' : 'Salvar reserva'}
            </button>
          </div>
        </form>
        <ImportReservaModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onApply={handleApplyImportedFields}
          onNotify={handleModalNotify}
        />
      </main>
    </ProtectedRoute>
  );
}
