'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Loader2, RefreshCcw, Upload, X } from 'lucide-react';
import { VALID_PASSEIO_TYPES } from '@/lib/passeios/prompt';

type ImportPasseioModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (message?: string) => void;
};

type PasseioFormState = {
  operadora: string;
  id_externo: string;
  data_passeio: string;
  tipo_passeio: string;
  descricao: string;
};

type ExtractResponse = {
  ok: boolean;
  data?: PasseioFormState;
  error?: { code?: string; message?: string; hint?: string };
  message?: string;
};

type SaveResponse = {
  ok: boolean;
  error?: string;
};

const TIPO_PASSEIO_OPTIONS: { value: PasseioFormState['tipo_passeio']; label: string }[] = [
  { value: 'AR', label: 'AR – Arraial D\'Ajuda' },
  { value: 'TR', label: 'TR – Trancoso' },
  { value: 'CA', label: 'CA – Caraíva' },
  { value: 'RF', label: 'RF – Recife de Fora' },
  { value: 'FL', label: 'FL – Fluvial' },
  { value: 'OB', label: 'OB – Praia do Espelho' },
  { value: 'OB_COM_QUADRADO', label: 'OB_COM_QUADRADO – Praia do Espelho + Quadrado' },
];

const EMPTY_FORM: PasseioFormState = {
  operadora: '',
  id_externo: '',
  data_passeio: '',
  tipo_passeio: '',
  descricao: '',
};

function toDateInputValue(value: string) {
  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return trimmed;
  }

  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return `${year}-${month}-${day}`;
  }

  return trimmed;
}

export function ImportPasseioModal({ isOpen, onClose, onSaved }: ImportPasseioModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [formState, setFormState] = useState<PasseioFormState>(EMPTY_FORM);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastFileName, setLastFileName] = useState<string | null>(null);

  const isFormValid = useMemo(() => {
    return (
      formState.operadora.trim() &&
      formState.id_externo.trim() &&
      formState.data_passeio.trim() &&
      VALID_PASSEIO_TYPES.includes(formState.tipo_passeio as (typeof VALID_PASSEIO_TYPES)[number])
    );
  }, [formState.data_passeio, formState.id_externo, formState.operadora, formState.tipo_passeio]);

  useEffect(() => {
    if (!isOpen) {
      setFormState(EMPTY_FORM);
      setIsExtracting(false);
      setErrorMessage(null);
      setSuccessMessage(null);
      setLastFileName(null);
    }
  }, [isOpen]);

  const handleClose = () => {
    if (isSaving) {
      return;
    }
    onClose();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = event.target.files ?? [];
    if (!file) {
      return;
    }

    setIsExtracting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setLastFileName(file.name);

    try {
      const formData = new FormData();
      formData.append('type', 'image');
      formData.append('file', file);

      const response = await fetch('/api/passeios/ocr-gpt', { method: 'POST', body: formData });
      const payload = (await response.json()) as ExtractResponse;

      if (!payload.ok || !payload.data) {
        const message = payload.error?.message || payload.message || 'Não foi possível extrair os dados do passeio.';
        setErrorMessage(message);
        return;
      }

      setFormState({
        operadora: payload.data.operadora,
        id_externo: payload.data.id_externo,
        data_passeio: toDateInputValue(payload.data.data_passeio),
        tipo_passeio: payload.data.tipo_passeio,
        descricao: payload.data.descricao ?? '',
      });
      setSuccessMessage('Dados extraídos com sucesso. Confira e salve o passeio.');
    } catch (error) {
      console.error('Erro ao extrair passeio', error);
      setErrorMessage('Erro ao processar o arquivo. Tente novamente.');
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleInputChange = (
    field: keyof PasseioFormState,
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const value = event.target.value;
    setFormState((previous) => ({ ...previous, [field]: value }));
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!isFormValid) {
      setErrorMessage('Preencha todos os campos obrigatórios.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const payload = {
      operadora: formState.operadora.trim(),
      id_externo: formState.id_externo.trim(),
      data_passeio: formState.data_passeio.trim(),
      tipo_passeio: formState.tipo_passeio.trim(),
      descricao: formState.descricao.trim() || null,
    };

    try {
      const response = await fetch('/api/passeios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = (await response.json()) as SaveResponse;
      if (!body.ok) {
        setErrorMessage(body.error || 'Não foi possível salvar o passeio.');
        return;
      }

      setSuccessMessage('Passeio salvo com sucesso.');
      onSaved?.('Passeio salvo com sucesso.');
      setTimeout(() => {
        handleClose();
      }, 500);
    } catch (error) {
      console.error('Erro ao salvar passeio', error);
      setErrorMessage('Não foi possível salvar o passeio.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRetry = () => {
    setFormState(EMPTY_FORM);
    setErrorMessage(null);
    setSuccessMessage(null);
    setLastFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-passeio-title"
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div className="space-y-1">
            <h2 id="import-passeio-title" className="text-xl font-semibold text-slate-900">
              Importar passeios
            </h2>
            <p className="text-sm text-slate-600">Envie o voucher ou preencha os dados do passeio manualmente.</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-slate-300 p-2 text-slate-600 transition hover:border-slate-400 hover:bg-slate-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Fechar</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 px-6 py-5">
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-800">Upload de imagem/PDF</p>
                <p className="text-xs text-slate-600">Suporte a PNG, JPG ou PDF de até 10 MB.</p>
                {lastFileName ? <p className="text-xs text-slate-700">Último arquivo: {lastFileName}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
                  disabled={isExtracting}
                >
                  {isExtracting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
                  {isExtracting ? 'Processando...' : 'Enviar arquivo'}
                </button>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                  disabled={isExtracting}
                >
                  <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                  Refazer extração
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-800">
              Operadora*
              <input
                type="text"
                value={formState.operadora}
                onChange={(event) => handleInputChange('operadora', event)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Nome da operadora"
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-slate-800">
              ID externo*
              <input
                type="text"
                value={formState.id_externo}
                onChange={(event) => handleInputChange('id_externo', event)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Código de referência"
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-slate-800">
              Data do passeio*
              <input
                type="date"
                value={formState.data_passeio}
                onChange={(event) => handleInputChange('data_passeio', event)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-slate-800">
              Tipo de passeio*
              <select
                value={formState.tipo_passeio}
                onChange={(event) => handleInputChange('tipo_passeio', event)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                required
              >
                <option value="">Selecione</option>
                {TIPO_PASSEIO_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-800">
            Descrição (opcional)
            <textarea
              value={formState.descricao}
              onChange={(event) => handleInputChange('descricao', event)}
              className="min-h-[96px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Informações adicionais do passeio"
            />
          </label>

          {errorMessage ? <p className="text-sm font-medium text-rose-600">{errorMessage}</p> : null}
          {successMessage ? <p className="text-sm font-medium text-emerald-600">{successMessage}</p> : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Descartar
            </button>
            <button
              type="submit"
              disabled={isSaving || !isFormValid}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? 'Salvando...' : 'Salvar passeio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
