'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import { FileText, Image as ImageIcon, Loader2, RefreshCcw, Upload, X } from 'lucide-react';
import { UNKNOWN_PASSEIO_TYPE, VALID_PASSEIO_TYPES } from '@/lib/passeios/prompt';
import type { NormalizedPasseio } from '@/lib/passeios/normalizePasseio';

export type ImportPasseioModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onNotify?: (payload: { type: 'success' | 'error'; message: string }) => void;
};

type PasseioFormState = {
  id_externo: string;
  data_passeio: string;
  tipo_passeio: string;
  descricao: string;
};

type PasseioFormErrors = Partial<Record<keyof PasseioFormState, string>>;

type ExtractionState = 'idle' | 'processing' | 'success' | 'incomplete' | 'error';

type ExtractResponse = {
  ok: boolean;
  data?: NormalizedPasseio;
  error?: { code?: string; message?: string; hint?: string };
  message?: string;
  model?: string | null;
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
  { value: 'OB_QUADRADO', label: 'OB_QUADRADO – Praia do Espelho + visita ao Quadrado' },
];

const EMPTY_FORM: PasseioFormState = {
  id_externo: '',
  data_passeio: '',
  tipo_passeio: '',
  descricao: '',
};

function formatDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join('/');
}

function parseIsoToBr(value: string | null) {
  if (!value) {
    return '';
  }
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}/${month}/${year}`;
  }
  return value;
}

function normalizePreview(data: NormalizedPasseio): PasseioFormState {
  return {
    id_externo: data.id_externo ?? '',
    data_passeio: parseIsoToBr(data.data_passeio),
    tipo_passeio:
      data.tipo_passeio && data.tipo_passeio !== UNKNOWN_PASSEIO_TYPE ? data.tipo_passeio : '',
    descricao: data.descricao ?? '',
  };
}

function toIsoDate(value: string) {
  const trimmed = value.trim();
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return `${year}-${month}-${day}`;
  }
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return trimmed;
  }
  return null;
}

function validateForm(state: PasseioFormState): PasseioFormErrors {
  const errors: PasseioFormErrors = {};

  if (!state.id_externo.trim()) {
    errors.id_externo = 'Campo obrigatório';
  }

  if (!state.data_passeio.trim()) {
    errors.data_passeio = 'Campo obrigatório';
  } else if (!toIsoDate(state.data_passeio)) {
    errors.data_passeio = 'Data inválida';
  }

  if (!state.tipo_passeio.trim()) {
    errors.tipo_passeio = 'Selecione o tipo de passeio';
  } else if (!VALID_PASSEIO_TYPES.includes(state.tipo_passeio as (typeof VALID_PASSEIO_TYPES)[number])) {
    errors.tipo_passeio = 'Tipo inválido';
  }

  return errors;
}

function hasErrors(errors: PasseioFormErrors) {
  return Object.values(errors).some(Boolean);
}

export function ImportPasseioModal({ isOpen, onClose, onNotify }: ImportPasseioModalProps) {
  const [activeTab, setActiveTab] = useState<'text' | 'image'>('text');
  const [textInput, setTextInput] = useState('');
  const [formState, setFormState] = useState<PasseioFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<PasseioFormErrors>({});
  const [extractionState, setExtractionState] = useState<ExtractionState>('idle');
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastFileName, setLastFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const hasPendingFields = useMemo(() => hasErrors(validateForm(formState)), [formState]);

  useEffect(() => {
    if (!isOpen) {
      setFormState(EMPTY_FORM);
      setErrors({});
      setExtractionState('idle');
      setIsSaving(false);
      setIsProcessing(false);
      setErrorMessage(null);
      setSuccessMessage(null);
      setTextInput('');
      setLastFileName(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [isOpen]);

  const handleClose = () => {
    if (isSaving || isProcessing) {
      return;
    }
    onClose();
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (isProcessing) {
      return;
    }
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void handleFile(file);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = event.target.files ?? [];
    if (file) {
      void handleFile(file);
    }
  };

  const handleFile = async (file: File) => {
    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setExtractionState('processing');
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
        setExtractionState('error');
        onNotify?.({ type: 'error', message });
        return;
      }

      const mapped = normalizePreview(payload.data);
      setFormState(mapped);
      const validationErrors = validateForm(mapped);
      setErrors(validationErrors);
      setExtractionState(hasErrors(validationErrors) ? 'incomplete' : 'success');
      setSuccessMessage('Extração concluída. Revise e ajuste se necessário.');
      onNotify?.({ type: 'success', message: 'Campos importados com sucesso. Revise antes de salvar.' });
    } catch (error) {
      console.error('Erro ao extrair passeio', error);
      setErrorMessage('Não foi possível extrair os dados do passeio.');
      setExtractionState('error');
      onNotify?.({ type: 'error', message: 'Não foi possível extrair os dados do passeio.' });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleTextExtraction = async () => {
    if (!textInput.trim()) {
      setErrorMessage('Cole o conteúdo do documento antes de extrair.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setExtractionState('processing');

    try {
      const response = await fetch('/api/passeios/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conteudo: textInput.trim() }),
      });

      const payload = (await response.json()) as ExtractResponse;
      if (!payload.ok || !payload.data) {
        const message = payload.error?.message || payload.message || 'Não foi possível extrair os dados do passeio.';
        setErrorMessage(message);
        setExtractionState('error');
        onNotify?.({ type: 'error', message });
        return;
      }

      const mapped = normalizePreview(payload.data);
      setFormState(mapped);
      const validationErrors = validateForm(mapped);
      setErrors(validationErrors);
      setExtractionState(hasErrors(validationErrors) ? 'incomplete' : 'success');
      setSuccessMessage('Extração concluída. Revise e ajuste se necessário.');
      onNotify?.({ type: 'success', message: 'Campos importados com sucesso. Revise antes de salvar.' });
    } catch (error) {
      console.error('Erro ao extrair passeio via texto', error);
      setErrorMessage('Não foi possível extrair os dados do passeio.');
      setExtractionState('error');
      onNotify?.({ type: 'error', message: 'Não foi possível extrair os dados do passeio.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInputChange = (
    field: keyof PasseioFormState,
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const value = field === 'data_passeio' ? formatDateInput(event.target.value) : event.target.value;
    const nextState = { ...formState, [field]: value };
    setFormState(nextState);
    setErrors(validateForm(nextState));
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    const validationErrors = validateForm(formState);
    setErrors(validationErrors);
    if (hasErrors(validationErrors)) {
      setErrorMessage('Revise os campos destacados antes de salvar.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const payload = {
      id_externo: formState.id_externo.trim(),
      tipo_passeio: formState.tipo_passeio.trim(),
      data_passeio: formState.data_passeio.trim(),
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
        onNotify?.({ type: 'error', message: body.error || 'Não foi possível salvar o passeio.' });
        return;
      }

      setSuccessMessage('Passeio salvo com sucesso.');
      onNotify?.({ type: 'success', message: 'Passeio salvo com sucesso.' });
      setExtractionState('idle');
      setFormState(EMPTY_FORM);
      setErrors({});
      setTextInput('');
      setLastFileName(null);
      setTimeout(() => handleClose(), 400);
    } catch (error) {
      console.error('Erro ao salvar passeio', error);
      setErrorMessage('Não foi possível salvar o passeio.');
      onNotify?.({ type: 'error', message: 'Não foi possível salvar o passeio.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRetry = () => {
    setFormState(EMPTY_FORM);
    setErrors({});
    setExtractionState('idle');
    setErrorMessage(null);
    setSuccessMessage(null);
    setTextInput('');
    setLastFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (!isOpen) {
    return null;
  }

  const statusLabel = {
    idle: 'Aguardando extração',
    processing: 'Processando...',
    success: 'Extração concluída com sucesso',
    incomplete: 'Extração incompleta (dados pendentes)',
    error: 'Falha na extração',
  }[extractionState];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-passeio-title"
    >
      <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div className="space-y-1">
            <h2 id="import-passeio-title" className="text-xl font-semibold text-slate-900">
              Importar passeios
            </h2>
            <p className="text-sm text-slate-600">Use texto ou imagem para extrair os dados do passeio e revisar antes de salvar.</p>
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

        <div className="flex border-b border-slate-100 px-6 pt-4">
          <button
            type="button"
            onClick={() => setActiveTab('text')}
            className={`flex items-center gap-2 border-b-2 px-3 pb-3 text-sm font-medium transition ${
              activeTab === 'text'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileText className="h-4 w-4" /> Texto
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('image')}
            className={`flex items-center gap-2 border-b-2 px-3 pb-3 text-sm font-medium transition ${
              activeTab === 'image'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <ImageIcon className="h-4 w-4" /> Imagem (OCR)
          </button>
        </div>

        <form onSubmit={handleSave} className="grid gap-6 px-6 py-5 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-5">
            {activeTab === 'text' ? (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Colar texto</p>
                    <p className="text-xs text-slate-600">Cole o e-mail ou voucher completo do passeio.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleTextExtraction}
                    disabled={isProcessing}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Extrair dados
                  </button>
                </div>
                <textarea
                  value={textInput}
                  onChange={(event) => setTextInput(event.target.value)}
                  className="min-h-[220px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
                  placeholder="Cole aqui o texto completo do documento"
                />
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Upload de imagem/PDF</p>
                    <p className="text-xs text-slate-600">Suporte a PNG, JPG ou PDF de até 10 MB.</p>
                    {lastFileName ? <p className="text-xs text-slate-700">Último arquivo: {lastFileName}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isProcessing}
                    >
                      {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
                      {isProcessing ? 'Processando...' : 'Enviar arquivo'}
                    </button>
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
                    >
                      <RefreshCcw className="h-4 w-4" /> Refazer
                    </button>
                  </div>
                </div>

                <label
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDrop}
                  className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                >
                  <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,application/pdf" className="hidden" onChange={handleFileChange} />
                  <ImageIcon className="h-10 w-10 text-slate-400" aria-hidden="true" />
                  <div>
                    <p className="font-semibold text-slate-800">Arraste um arquivo ou clique para selecionar</p>
                    <p className="text-xs text-slate-600">Imagens (PNG/JPG) ou PDF até 10 MB.</p>
                  </div>
                </label>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                {statusLabel}
              </div>
              {errorMessage ? <p className="mt-2 text-sm font-medium text-rose-600">{errorMessage}</p> : null}
              {successMessage ? <p className="mt-2 text-sm font-medium text-emerald-700">{successMessage}</p> : null}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Dados do passeio</p>
                  <p className="text-xs text-slate-600">Revise e ajuste antes de salvar.</p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {extractionState === 'processing' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-3.5 w-3.5" />
                  )}
                  {statusLabel}
                </div>
              </div>

              <div className="mt-4 space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-800" htmlFor="passeio-id-externo">
                    ID externo*
                  </label>
                  <input
                    id="passeio-id-externo"
                    value={formState.id_externo}
                    onChange={(event) => handleInputChange('id_externo', event)}
                    className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none ${
                      errors.id_externo ? 'border-rose-300' : 'border-slate-200'
                    }`}
                    placeholder="Identificador externo do passeio"
                  />
                  {errors.id_externo ? <p className="text-xs font-medium text-rose-600">{errors.id_externo}</p> : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-800" htmlFor="passeio-data">
                      Data do passeio*
                    </label>
                    <input
                      id="passeio-data"
                      value={formState.data_passeio}
                      onChange={(event) => handleInputChange('data_passeio', event)}
                      className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none ${
                        errors.data_passeio ? 'border-rose-300' : 'border-slate-200'
                      }`}
                      placeholder="dd/mm/aaaa"
                    />
                    {errors.data_passeio ? <p className="text-xs font-medium text-rose-600">{errors.data_passeio}</p> : null}
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-800" htmlFor="passeio-tipo">
                      Tipo de passeio*
                    </label>
                    <select
                      id="passeio-tipo"
                      value={formState.tipo_passeio}
                      onChange={(event) => handleInputChange('tipo_passeio', event)}
                      className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none ${
                        errors.tipo_passeio ? 'border-rose-300' : 'border-slate-200'
                      }`}
                    >
                      <option value="">Selecione</option>
                      <option value={UNKNOWN_PASSEIO_TYPE}>Desconhecido / ajustar depois</option>
                      {TIPO_PASSEIO_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {errors.tipo_passeio ? <p className="text-xs font-medium text-rose-600">{errors.tipo_passeio}</p> : null}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-800" htmlFor="passeio-descricao">
                    Descrição
                  </label>
                  <textarea
                    id="passeio-descricao"
                    value={formState.descricao}
                    onChange={(event) => handleInputChange('descricao', event)}
                    className="min-h-[90px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
                    placeholder="Nome do passeio e detalhes relevantes"
                  />
                </div>

                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  ID externo da reserva de traslado (informativo): <strong>{formState.id_externo || '—'}</strong>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={handleRetry}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
              >
                <RefreshCcw className="h-4 w-4" /> Refazer extração
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
                disabled={isSaving || isProcessing}
              >
                Descartar
              </button>
              <button
                type="submit"
                disabled={isSaving || isProcessing || hasPendingFields}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {hasPendingFields ? 'Complete os dados' : isSaving ? 'Salvando...' : 'Salvar passeio'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
