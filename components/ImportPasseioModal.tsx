'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { AlertTriangle, CheckCircle2, Eye, FileText, Image as ImageIcon, Loader2, RefreshCcw, Upload, X } from 'lucide-react';
import { UNKNOWN_PASSEIO_TYPE, VALID_PASSEIO_TYPES } from '@/lib/passeios/prompt';
import type { NormalizedPasseio } from '@/lib/passeios/normalizePasseio';

export type ImportPasseioModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (message?: string) => void;
  onNotify?: (payload: { type: 'success' | 'error'; message: string }) => void;
};

type PasseioPassengerDraft = {
  nome: string;
  tipo: 'ADT' | 'CHD' | 'INF' | '';
};

type PasseioFormState = {
  id_externo: string;
  data_passeio: string;
  tipo_passeio: string;
  descricao: string;
  hotel: string;
  regime: string;
  passageiros: PasseioPassengerDraft[];
};

type PasseioFormErrors = Partial<Omit<PasseioFormState, 'passageiros'>> & {
  passageiros?: Array<Partial<PasseioPassengerDraft>>;
};

type ExtractionStatus = 'pending' | 'processing' | 'success' | 'incomplete' | 'error';

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

type PasseioQueueItem = {
  id: string;
  file: File;
  fileName: string;
  status: ExtractionStatus;
  data?: NormalizedPasseio | null;
  draft: PasseioFormState;
  errors: PasseioFormErrors;
  errorMessage?: string | null;
  model?: string | null;
  isSaving?: boolean;
};

const MAX_FILES = 10;

const TIPO_PASSEIO_OPTIONS: { value: PasseioFormState['tipo_passeio']; label: string }[] = [
  { value: 'AR', label: 'AR – Arraial D\'Ajuda' },
  { value: 'TR', label: 'TR – Trancoso' },
  { value: 'CA', label: 'CA – Caraíva' },
  { value: 'RF', label: 'RF – Recife de Fora' },
  { value: 'FL', label: 'FL – Fluvial' },
  { value: 'OB', label: 'OB – Praia do Espelho' },
  { value: 'OB_QUADRADO', label: 'OB_QUADRADO – Praia do Espelho + visita ao Quadrado' },
];

const REGIME_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Não informado' },
  { value: 'PRIVATIVO', label: 'PRIVATIVO' },
  { value: 'REGULAR', label: 'REGULAR' },
];

const EMPTY_DRAFT: PasseioFormState = {
  id_externo: '',
  data_passeio: '',
  tipo_passeio: '',
  descricao: '',
  hotel: '',
  regime: '',
  passageiros: [],
};

const STATUS_LABEL: Record<ExtractionStatus, string> = {
  pending: 'Aguardando OCR',
  processing: 'Processando...',
  success: 'Extração concluída com sucesso',
  incomplete: 'Extração incompleta (dados pendentes)',
  error: 'Falha na extração',
};

const STATUS_CLASSES: Record<ExtractionStatus, string> = {
  pending: 'border-slate-200 bg-slate-50 text-slate-700',
  processing: 'border-amber-200 bg-amber-50 text-amber-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  incomplete: 'border-amber-200 bg-amber-50 text-amber-700',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
};

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}

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

function normalizePreview(data: NormalizedPasseio): PasseioFormState {
  return {
    id_externo: data.id_externo ?? '',
    data_passeio: parseIsoToBr(data.data_passeio),
    tipo_passeio: data.tipo_passeio && data.tipo_passeio !== UNKNOWN_PASSEIO_TYPE ? data.tipo_passeio : '',
    descricao: data.descricao ?? '',
    hotel: data.hotel ?? '',
    regime: data.regime ?? '',
    passageiros: Array.isArray(data.passageiros)
      ? data.passageiros.map((passageiro) => ({
          nome: passageiro.nome ?? '',
          tipo: passageiro.tipo ?? '',
        }))
      : [],
  };
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

  if (state.passageiros.length) {
    errors.passageiros = state.passageiros.map((passageiro) => {
      const passengerErrors: Partial<PasseioPassengerDraft> = {};
      if (passageiro.nome && !passageiro.tipo) {
        passengerErrors.tipo = 'Informe o tipo';
      }
      if (passageiro.tipo && !passageiro.nome) {
        passengerErrors.nome = 'Informe o nome';
      }
      return passengerErrors;
    });
  }

  return errors;
}

function hasErrors(errors: PasseioFormErrors) {
  if (Object.values(errors).some(Boolean)) {
    return true;
  }
  if (!errors.passageiros) {
    return false;
  }
  return errors.passageiros.some((passenger) => Boolean(passenger?.nome || passenger?.tipo));
}

function buildPassengerPlaceholder(index: number) {
  return `Passageiro ${index + 1}`;
}

type PreviewModalProps = {
  itemLabel: string;
  draft: PasseioFormState;
  errors: PasseioFormErrors;
  onClose: () => void;
  onChange: (draft: PasseioFormState, errors: PasseioFormErrors) => void;
};

function PasseioPreviewModal({ itemLabel, draft, errors, onClose, onChange }: PreviewModalProps) {
  const handleInputChange = (
    field: keyof Omit<PasseioFormState, 'passageiros'>,
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const value = field === 'data_passeio' ? formatDateInput(event.target.value) : event.target.value;
    const nextDraft = { ...draft, [field]: value };
    onChange(nextDraft, validateForm(nextDraft));
  };

  const handlePassengerChange = (index: number, field: keyof PasseioPassengerDraft) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const passageiros = [...draft.passageiros];
      passageiros[index] = { ...passageiros[index], [field]: event.target.value };
      const nextDraft = { ...draft, passageiros };
      onChange(nextDraft, validateForm(nextDraft));
    };

  const handleAddPassenger = () => {
    const passageiros = [...draft.passageiros, { nome: '', tipo: '' }];
    const nextDraft = { ...draft, passageiros };
    onChange(nextDraft, validateForm(nextDraft));
  };

  const handleRemovePassenger = (index: number) => {
    const passageiros = draft.passageiros.filter((_, current) => current !== index);
    const nextDraft = { ...draft, passageiros };
    onChange(nextDraft, validateForm(nextDraft));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-600">Dados extraídos — {itemLabel}</p>
            <h3 className="text-xl font-semibold text-slate-900">Revise o passeio antes de salvar</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 p-2 text-slate-600 transition hover:border-slate-400 hover:bg-slate-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Fechar</span>
          </button>
        </div>

        <div className="max-h-[75vh] space-y-6 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-800" htmlFor="passeio-id-externo">
                ID externo*
              </label>
              <input
                id="passeio-id-externo"
                value={draft.id_externo}
                onChange={(event) => handleInputChange('id_externo', event)}
                className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none ${
                  errors.id_externo ? 'border-rose-300' : 'border-slate-200'
                }`}
                placeholder="Identificador externo do passeio"
              />
              {errors.id_externo ? <p className="text-xs font-medium text-rose-600">{errors.id_externo}</p> : null}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-800" htmlFor="passeio-data">
                Data do passeio*
              </label>
              <input
                id="passeio-data"
                value={draft.data_passeio}
                onChange={(event) => handleInputChange('data_passeio', event)}
                className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none ${
                  errors.data_passeio ? 'border-rose-300' : 'border-slate-200'
                }`}
                placeholder="dd/mm/aaaa"
              />
              {errors.data_passeio ? <p className="text-xs font-medium text-rose-600">{errors.data_passeio}</p> : null}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-800" htmlFor="passeio-tipo">
                Tipo de passeio*
              </label>
              <select
                id="passeio-tipo"
                value={draft.tipo_passeio}
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

            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-800" htmlFor="passeio-regime">
                Regime
              </label>
              <select
                id="passeio-regime"
                value={draft.regime}
                onChange={(event) => handleInputChange('regime', event)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
              >
                {REGIME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-800" htmlFor="passeio-hotel">
                Hotel
              </label>
              <input
                id="passeio-hotel"
                value={draft.hotel}
                onChange={(event) => handleInputChange('hotel', event)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
                placeholder="Nome do hotel"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-slate-800" htmlFor="passeio-descricao">
              Descrição
            </label>
            <textarea
              id="passeio-descricao"
              value={draft.descricao}
              onChange={(event) => handleInputChange('descricao', event)}
              className="min-h-[90px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
              placeholder="Nome do passeio e detalhes relevantes"
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Passageiros</p>
              <button
                type="button"
                onClick={handleAddPassenger}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                <Upload className="h-4 w-4" /> Adicionar passageiro
              </button>
            </div>

            {draft.passageiros.length === 0 ? (
              <p className="text-sm text-slate-600">Nenhum passageiro listado.</p>
            ) : (
              <div className="space-y-3">
                {draft.passageiros.map((passageiro, index) => {
                  const passengerErrors = errors.passageiros?.[index] ?? {};
                  return (
                    <div key={`passageiro-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-800">{buildPassengerPlaceholder(index)}</div>
                        <button
                          type="button"
                          onClick={() => handleRemovePassenger(index)}
                          className="text-xs font-semibold text-rose-600 transition hover:text-rose-700"
                        >
                          Remover
                        </button>
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Nome
                          </label>
                          <input
                            value={passageiro.nome}
                            onChange={handlePassengerChange(index, 'nome')}
                            className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none ${
                              passengerErrors.nome ? 'border-rose-300' : 'border-slate-200'
                            }`}
                            placeholder="Nome do passageiro"
                          />
                          {passengerErrors.nome ? (
                            <p className="text-[11px] font-semibold text-rose-600">{passengerErrors.nome}</p>
                          ) : null}
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Tipo
                          </label>
                          <select
                            value={passageiro.tipo}
                            onChange={handlePassengerChange(index, 'tipo')}
                            className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none ${
                              passengerErrors.tipo ? 'border-rose-300' : 'border-slate-200'
                            }`}
                          >
                            <option value="">Selecione</option>
                            <option value="ADT">ADT</option>
                            <option value="CHD">CHD</option>
                            <option value="INF">INF</option>
                          </select>
                          {passengerErrors.tipo ? (
                            <p className="text-[11px] font-semibold text-rose-600">{passengerErrors.tipo}</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

export function ImportPasseioModal({ isOpen, onClose, onSaved, onNotify }: ImportPasseioModalProps) {
  const [fileItems, setFileItems] = useState<PasseioQueueItem[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activePreviewItemId, setActivePreviewItemId] = useState<string | null>(null);
  const [previewDraft, setPreviewDraft] = useState<PasseioFormState>(EMPTY_DRAFT);
  const [previewErrors, setPreviewErrors] = useState<PasseioFormErrors>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setFileItems([]);
      setUploadError(null);
      setActivePreviewItemId(null);
      setPreviewDraft(EMPTY_DRAFT);
      setPreviewErrors({});
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [isOpen]);

  const hasItems = useMemo(() => fileItems.length > 0, [fileItems]);

  const handleFiles = (files: FileList | File[]) => {
    const current = [...fileItems];
    const allowed = Math.max(0, MAX_FILES - current.length);
    const selected = Array.from(files).slice(0, allowed);

    if (selected.length === 0) {
      setUploadError('Limite máximo de arquivos atingido. Remova algum item para adicionar novos.');
      return;
    }

    const newItems = selected.map((file) => ({
      id: createId(),
      file,
      fileName: file.name,
      status: 'pending' as ExtractionStatus,
      draft: { ...EMPTY_DRAFT },
      errors: {},
      data: null,
      errorMessage: null,
      model: null,
    }));

    setFileItems([...current, ...newItems]);
    setUploadError(null);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (!event.dataTransfer?.files?.length) {
      return;
    }
    handleFiles(event.dataTransfer.files);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) {
      return;
    }
    handleFiles(event.target.files);
  };

  const updateItem = (itemId: string, updater: (item: PasseioQueueItem) => PasseioQueueItem) => {
    setFileItems((items) => items.map((item) => (item.id === itemId ? updater(item) : item)));
  };

  const handleExtract = async (item: PasseioQueueItem) => {
    updateItem(item.id, (current) => ({ ...current, status: 'processing', errorMessage: null }));

    const formData = new FormData();
    formData.append('type', 'image');
    formData.append('file', item.file);

    try {
      const response = await fetch('/api/passeios/ocr-gpt', { method: 'POST', body: formData });
      const payload = (await response.json()) as ExtractResponse;

      if (!payload.ok || !payload.data) {
        const message = payload.error?.message || payload.message || 'Não foi possível extrair os dados do passeio.';
        updateItem(item.id, (current) => ({ ...current, status: 'error', errorMessage: message }));
        onNotify?.({ type: 'error', message });
        return;
      }

      const mapped = normalizePreview(payload.data);
      const validationErrors = validateForm(mapped);
      const status: ExtractionStatus = hasErrors(validationErrors) ? 'incomplete' : 'success';

      updateItem(item.id, (current) => ({
        ...current,
        status,
        data: payload.data,
        draft: mapped,
        errors: validationErrors,
        model: payload.model ?? null,
        errorMessage: null,
      }));

      onNotify?.({ type: 'success', message: 'Campos importados com sucesso. Revise antes de salvar.' });
    } catch (error) {
      console.error('Erro ao extrair passeio', error);
      updateItem(item.id, (current) => ({ ...current, status: 'error', errorMessage: 'Não foi possível extrair os dados do passeio.' }));
      onNotify?.({ type: 'error', message: 'Não foi possível extrair os dados do passeio.' });
    }
  };

  const handleOpenPreview = (item: PasseioQueueItem) => {
    setActivePreviewItemId(item.id);
    setPreviewDraft(item.draft);
    setPreviewErrors(item.errors);
  };

  const handlePreviewChange = (draft: PasseioFormState, errors: PasseioFormErrors) => {
    setPreviewDraft(draft);
    setPreviewErrors(errors);
    if (activePreviewItemId) {
      updateItem(activePreviewItemId, (current) => ({
        ...current,
        draft,
        errors,
        status: hasErrors(errors) ? 'incomplete' : current.status === 'pending' ? 'pending' : 'success',
      }));
    }
  };

  const handleSavePasseio = async (item: PasseioQueueItem) => {
    const errors = validateForm(item.draft);
    if (hasErrors(errors)) {
      updateItem(item.id, (current) => ({ ...current, errors, status: 'incomplete', errorMessage: 'Revise os campos antes de salvar.' }));
      onNotify?.({ type: 'error', message: 'Revise os campos destacados antes de salvar.' });
      return;
    }

    const payload = {
      id_externo: item.draft.id_externo.trim(),
      tipo_passeio: item.draft.tipo_passeio.trim(),
      data_passeio: toIsoDate(item.draft.data_passeio)?.trim() ?? '',
      descricao: item.draft.descricao.trim() || null,
    };

    updateItem(item.id, (current) => ({ ...current, isSaving: true, errorMessage: null }));

    try {
      const response = await fetch('/api/passeios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = (await response.json()) as SaveResponse;
      if (!body.ok) {
        const message = body.error || 'Não foi possível salvar o passeio.';
        updateItem(item.id, (current) => ({ ...current, isSaving: false, errorMessage: message }));
        onNotify?.({ type: 'error', message });
        return;
      }

      updateItem(item.id, (current) => ({ ...current, isSaving: false, status: 'success' }));
      onNotify?.({ type: 'success', message: 'Passeio salvo com sucesso.' });
      onSaved?.('Passeio salvo com sucesso.');
    } catch (error) {
      console.error('Erro ao salvar passeio', error);
      updateItem(item.id, (current) => ({ ...current, isSaving: false, errorMessage: 'Não foi possível salvar o passeio.' }));
      onNotify?.({ type: 'error', message: 'Não foi possível salvar o passeio.' });
    }
  };

  const statusIcon = (status: ExtractionStatus) => {
    if (status === 'success') return <CheckCircle2 className="h-4 w-4" />;
    if (status === 'error' || status === 'incomplete') return <AlertTriangle className="h-4 w-4" />;
    return <Loader2 className="h-4 w-4 animate-spin" />;
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-slate-900">Importar passeios</h2>
            <p className="text-sm text-slate-600">Envie vários vouchers de passeio, execute o OCR e revise antes de salvar.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 p-2 text-slate-600 transition hover:border-slate-400 hover:bg-slate-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Fechar</span>
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">Upload de imagens/PDF</p>
                <p className="text-xs text-slate-600">Envie até {MAX_FILES} arquivos (PNG, JPG ou PDF) para processar em fila.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Adicionar arquivos
                </button>
              </div>
            </div>

            <label
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              className="mt-4 flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,application/pdf"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
              <ImageIcon className="h-10 w-10 text-slate-400" aria-hidden="true" />
              <div>
                <p className="font-semibold text-slate-800">Arraste arquivos ou clique para selecionar</p>
                <p className="text-xs text-slate-600">Suporte a PNG, JPG ou PDF de até 10 MB cada.</p>
              </div>
            </label>
            {uploadError ? <p className="mt-2 text-sm font-semibold text-rose-600">{uploadError}</p> : null}
          </div>

          {hasItems ? (
            <div className="space-y-3">
              {fileItems.map((item, index) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                        <FileText className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Passeio {index + 1}</p>
                        <p className="text-xs text-slate-600">{item.fileName}</p>
                        {item.model ? (
                          <p className="text-[11px] text-slate-500">Modelo de IA: {item.model}</p>
                        ) : null}
                      </div>
                    </div>

                    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_CLASSES[item.status]}`}>
                      {item.status === 'pending' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : statusIcon(item.status)}
                      {STATUS_LABEL[item.status]}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleExtract(item)}
                      disabled={item.status === 'processing'}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {item.status === 'processing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                      Executar OCR
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenPreview(item)}
                      disabled={!item.draft}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Eye className="h-4 w-4" /> Ver dados extraídos
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSavePasseio(item)}
                      disabled={item.isSaving || item.status === 'processing' || hasErrors(item.errors)}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {item.isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {item.isSaving ? 'Salvando...' : 'Salvar passeio'}
                    </button>
                  </div>

                  {item.errorMessage ? (
                    <p className="mt-2 text-sm font-semibold text-rose-600">{item.errorMessage}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
              Nenhum arquivo enviado ainda. Adicione vouchers de passeio para iniciar a extração.
            </div>
          )}
        </div>
      </div>

      {activePreviewItemId ? (
        <PasseioPreviewModal
          itemLabel={`Passeio ${fileItems.findIndex((item) => item.id === activePreviewItemId) + 1}`}
          draft={previewDraft}
          errors={previewErrors}
          onClose={() => setActivePreviewItemId(null)}
          onChange={(draft, nextErrors) => handlePreviewChange(draft, nextErrors)}
        />
      ) : null}
    </div>
  );
}
