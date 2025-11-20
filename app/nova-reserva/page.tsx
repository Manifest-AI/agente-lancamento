'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { RefreshCcw } from 'lucide-react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabaseClient';
import { ImportReservaButton } from '@/components/ImportReservaButton';
import { ImportReservaModal } from '@/components/ImportReservaModal';
import { ReservaFormFields } from '@/components/ReservaFormFields';
import {
  createEmptyPreview,
  createEmptyPreviewErrors,
  hasPreviewErrors,
  sanitizePreviewDraft,
  validatePreview,
} from './mapReservaToForm';
import type { ReservaPreviewDraft, ReservaPreviewErrors } from './mapReservaToForm';
import { saveReservation } from '@/lib/reservas/saveReservation';

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

function formatFlightCodeInput(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 7);
}

function formatIdentInput(value: string) {
  return value.replace(/[^A-Za-z/]/g, '').toUpperCase().slice(0, 5);
}

export default function NovaReservaPage() {
  const { user } = useAuth();
  const [formData, setFormData] = useState<ReservaPreviewDraft>(() => createEmptyPreview());
  const [errors, setErrors] = useState<ReservaPreviewErrors>(() => createEmptyPreviewErrors(1));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importMode, setImportMode] = useState<'initial' | 'adjustment'>('initial');
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

  const resetFeedback = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleFieldChange = <T extends keyof Omit<ReservaPreviewDraft, 'passageiros'>>(field: T, value: string) => {
    resetFeedback();
    setFormData((previous) => {
      let nextValue = value;

      if (field === 'dataChegada' || field === 'dataSaida') {
        nextValue = formatDateInput(value);
      } else if (field === 'horarioChegada' || field === 'horarioSaida') {
        nextValue = formatTimeInput(value);
      } else if (field === 'vooChegada' || field === 'vooSaida') {
        nextValue = formatFlightCodeInput(value);
      } else if (field === 'ident') {
        nextValue = formatIdentInput(value);
      }

      const updated = { ...previous, [field]: nextValue } as ReservaPreviewDraft;
      setErrors(validatePreview(updated));
      return updated;
    });
  };

  const handlePassengerChange = (
    index: number,
    field: keyof ReservaPreviewDraft['passageiros'][number],
    value: string,
  ) => {
    resetFeedback();
    setFormData((previous) => {
      const passengers = previous.passageiros.map((passageiro, passengerIndex) => {
        if (passengerIndex !== index) {
          return passageiro;
        }

        if (field === 'classificacao') {
          return {
            ...passageiro,
            classificacao: value as ReservaPreviewDraft['passageiros'][number]['classificacao'],
          };
        }

        return { ...passageiro, nome: value.toUpperCase() };
      });

      const updated = { ...previous, passageiros: passengers };
      setErrors(validatePreview(updated));
      return updated;
    });
  };

  const handlePassengerAdd = () => {
    resetFeedback();
    setFormData((previous) => {
      const passengers = [
        ...previous.passageiros,
        { nome: '', classificacao: '' as ReservaPreviewDraft['passageiros'][number]['classificacao'] },
      ];
      const updated = { ...previous, passageiros: passengers };
      setErrors(validatePreview(updated));
      return updated;
    });
  };

  const handlePassengerRemove = (index: number) => {
    resetFeedback();
    setFormData((previous) => {
      if (previous.passageiros.length <= 1) {
        return previous;
      }
      const passengers = previous.passageiros.filter((_, passengerIndex) => passengerIndex !== index);
      const updated = { ...previous, passageiros: passengers };
      setErrors(validatePreview(updated));
      return updated;
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const validationErrors = validatePreview(formData);
    setErrors(validationErrors);

    if (hasPreviewErrors(validationErrors)) {
      setErrorMessage('Revise os campos destacados antes de salvar.');
      return;
    }

    setIsSubmitting(true);

    const sanitized = sanitizePreviewDraft(formData);

    const { error } = await saveReservation(sanitized, { userId: user?.id ?? null, client: supabase });

    setIsSubmitting(false);

    if (error) {
      console.error('Erro ao salvar reserva', error);
      setErrorMessage('Não foi possível salvar a reserva. Tente novamente em instantes.');
      return;
    }

    setSuccessMessage('Reserva cadastrada com sucesso!');
    setFormData(createEmptyPreview());
    setErrors(createEmptyPreviewErrors(1));
  };

  const handleApplyImportedFields = (data: ReservaPreviewDraft) => {
    resetFeedback();
    setFormData(data);
    setErrors(validatePreview(data));
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
              Preencha os mesmos campos exibidos no fluxo de importação para registrar uma nova reserva manualmente. Todos os campos são obrigatórios.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <div className="flex flex-col gap-2">
              <ImportReservaButton
                onClick={() => {
                  setImportMode('initial');
                  setIsImportModalOpen(true);
                }}
              />
              <ImportReservaButton
                onClick={() => {
                  setImportMode('adjustment');
                  setIsImportModalOpen(true);
                }}
                label="Alterações e Cancelamentos"
                icon={RefreshCcw}
              />
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Voltar ao painel
            </Link>
          </div>
        </header>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <ReservaFormFields
            data={formData}
            errors={errors}
            onFieldChange={handleFieldChange}
            onPassengerChange={handlePassengerChange}
            onPassengerAdd={handlePassengerAdd}
            onPassengerRemove={handlePassengerRemove}
            idPrefix="manual"
            passengerSectionTitle="Passageiros"
            addPassengerLabel="Adicionar passageiro"
          />

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
          mode={importMode}
        />
      </main>
    </ProtectedRoute>
  );
}
