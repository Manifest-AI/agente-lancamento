'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { FileText, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { DetectedFieldsPreview } from './DetectedFieldsPreview';
import type {
  ExtractedReservation,
  ExtractedReservationDraft,
  ExtractedReservationErrors,
  ExtractedReservationFieldKey,
} from '@/types/ocr-gpt';

export type ImportReservaModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (data: ExtractedReservation) => void;
  onNotify?: (payload: { type: 'success' | 'error'; message: string }) => void;
};

const MAX_FILE_SIZE_MB = 10;
const IDENT_VALUES: ExtractedReservation['ident'][] = ['BPS', 'AA/TR', 'BUE', 'BUE/A', 'BUE/T'];
const TIPO_VALUES: ExtractedReservation['tipo'][] = ['A', 'C', 'I'];

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}$/;
const FLIGHT_REGEX = /^[A-Z]{2}\s?\d{3,4}$/;

const emptyDraft: ExtractedReservationDraft = {
  operadora: '',
  data_chegada_bps: '',
  data_saida_bps: '',
  ident: '',
  voo_chegada: '',
  voo_saida: '',
  hora_chegada: '',
  hora_saida: '',
  hotel: '',
  id_reserva: '',
  nome: '',
  tipo: '',
  observacao: '',
};

function toDraft(data: ExtractedReservation): ExtractedReservationDraft {
  return {
    operadora: data.operadora ?? '',
    data_chegada_bps: data.data_chegada_bps ?? '',
    data_saida_bps: data.data_saida_bps ?? '',
    ident: data.ident ?? '',
    voo_chegada: data.voo_chegada ?? '',
    voo_saida: data.voo_saida ?? '',
    hora_chegada: data.hora_chegada ?? '',
    hora_saida: data.hora_saida ?? '',
    hotel: data.hotel ?? '',
    id_reserva: data.id_reserva ?? '',
    nome: data.nome ?? '',
    tipo: data.tipo ?? '',
    observacao: data.observacao ?? '',
  };
}

function fromDraft(draft: ExtractedReservationDraft): ExtractedReservation {
  return {
    operadora: draft.operadora.trim() || null,
    data_chegada_bps: draft.data_chegada_bps.trim() || null,
    data_saida_bps: draft.data_saida_bps.trim() || null,
    ident: (draft.ident.trim().toUpperCase() as ExtractedReservation['ident']) || null,
    voo_chegada: draft.voo_chegada.trim() || null,
    voo_saida: draft.voo_saida.trim() || null,
    hora_chegada: draft.hora_chegada.trim() || null,
    hora_saida: draft.hora_saida.trim() || null,
    hotel: draft.hotel.trim() || null,
    id_reserva: draft.id_reserva.trim() || null,
    nome: draft.nome.trim() || null,
    tipo: (draft.tipo.trim().toUpperCase() as ExtractedReservation['tipo']) || null,
    observacao: draft.observacao.trim() || null,
  };
}

function validateDraft(draft: ExtractedReservationDraft): ExtractedReservationErrors {
  const errors: ExtractedReservationErrors = {};

  const maybeDateFields: Array<ExtractedReservationFieldKey> = ['data_chegada_bps', 'data_saida_bps'];
  maybeDateFields.forEach((field) => {
    const value = draft[field].trim();
    if (value && !DATE_REGEX.test(value)) {
      errors[field] = 'Use o formato yyyy-mm-dd.';
    }
  });

  const maybeTimeFields: Array<ExtractedReservationFieldKey> = ['hora_chegada', 'hora_saida'];
  maybeTimeFields.forEach((field) => {
    const value = draft[field].trim();
    if (value && !TIME_REGEX.test(value)) {
      errors[field] = 'Use o formato hh:mm.';
    }
  });

  const maybeFlightFields: Array<ExtractedReservationFieldKey> = ['voo_chegada', 'voo_saida'];
  maybeFlightFields.forEach((field) => {
    const value = draft[field].trim();
    if (value && !FLIGHT_REGEX.test(value.toUpperCase())) {
      errors[field] = 'Informe o código do voo (ex.: LA 3600).';
    }
  });

  const identValue = draft.ident.trim();
  if (identValue && !IDENT_VALUES.includes(identValue.toUpperCase() as ExtractedReservation['ident'])) {
    errors.ident = 'IDENT inválido.';
  }

  const tipoValue = draft.tipo.trim();
  if (tipoValue && !TIPO_VALUES.includes(tipoValue.toUpperCase() as ExtractedReservation['tipo'])) {
    errors.tipo = 'Use A, C ou I.';
  }

  const nomeValue = draft.nome.trim();
  if (nomeValue) {
    const parts = nomeValue.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      errors.nome = 'Informe primeiro e último nome.';
    }
  }

  const observacaoValue = draft.observacao.trim();
  if (observacaoValue && observacaoValue.toLowerCase() !== 'privativo') {
    errors.observacao = 'Use "Privativo" ou deixe em branco para regular.';
  }

  return errors;
}

function normalizeFieldValue(key: ExtractedReservationFieldKey, value: string) {
  const trimmed = value;
  if (key === 'ident' || key === 'voo_chegada' || key === 'voo_saida' || key === 'tipo') {
    return trimmed.toUpperCase();
  }
  return trimmed;
}

async function readFileAsFormData(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return formData;
}

function buildTextFormData(text: string) {
  const formData = new FormData();
  formData.append('text', text);
  return formData;
}

export function ImportReservaModal({ isOpen, onClose, onApply, onNotify }: ImportReservaModalProps) {
  const [activeTab, setActiveTab] = useState<'text' | 'image'>('text');
  const [textInput, setTextInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExtractedReservationDraft>(emptyDraft);
  const [errors, setErrors] = useState<ExtractedReservationErrors>({});
  const [extractedData, setExtractedData] = useState<ExtractedReservation | null>(null);
  const [modelName, setModelName] = useState<string | null>(null);

  const hasResult = useMemo(() => Boolean(extractedData), [extractedData]);
  const acceptedTypes = useMemo(() => ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'], []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleClose();
      }
    }
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      resetState();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!selectedFile) {
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl);
      }
      setFilePreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(selectedFile);
    setFilePreviewUrl(previewUrl);
    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [selectedFile]);

  const resetState = useCallback(() => {
    setActiveTab('text');
    setTextInput('');
    setSelectedFile(null);
    setFilePreviewUrl(null);
    setIsProcessing(false);
    setErrorMessage(null);
    setDraft(emptyDraft);
    setErrors({});
    setExtractedData(null);
    setModelName(null);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const handleTabChange = (tab: 'text' | 'image') => {
    setActiveTab(tab);
    setErrorMessage(null);
  };

  const handleFileSelect = (file: File | null) => {
    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!acceptedTypes.includes(file.type)) {
      setErrorMessage('Formato não suportado. Utilize PNG, JPG, JPEG ou PDF.');
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setErrorMessage(`Arquivo muito grande. Limite de ${MAX_FILE_SIZE_MB}MB.`);
      setSelectedFile(null);
      return;
    }

    setErrorMessage(null);
    setSelectedFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const runExtraction = useCallback(
    async (formData: FormData) => {
      setIsProcessing(true);
      setErrorMessage(null);
      try {
        const response = await fetch('/api/ocr-gpt', {
          method: 'POST',
          body: formData,
        });

        let payload: unknown;
        try {
          payload = await response.json();
        } catch (parseError) {
          console.error('Resposta inválida do extrator', parseError);
          setErrorMessage('Falha na comunicação com o extrator. Tente novamente.');
          setExtractedData(null);
          return;
        }

        if (!response.ok) {
          if (
            payload &&
            typeof payload === 'object' &&
            'error' in payload &&
            typeof (payload as { error?: unknown }).error === 'string'
          ) {
            setErrorMessage((payload as { error: string }).error);
          } else {
            setErrorMessage('Falha na comunicação com o extrator. Tente novamente.');
          }
          setExtractedData(null);
          return;
        }

        const payloadData = payload as {
          ok?: boolean;
          error?: string;
          data?: ExtractedReservation;
          model?: string;
        };
        if (!payloadData?.ok) {
          setErrorMessage(payloadData?.error ?? 'Não foi possível processar os dados.');
          setExtractedData(null);
          return;
        }

        const data = payloadData.data as ExtractedReservation | undefined;
        if (!data) {
          setErrorMessage('A resposta não contém dados reconhecíveis.');
          setExtractedData(null);
          return;
        }

        const nextDraft = toDraft(data);
        const nextErrors = validateDraft(nextDraft);
        setDraft(nextDraft);
        setErrors(nextErrors);
        setExtractedData(data);
        setModelName(payloadData?.model ?? null);

        if (Object.keys(nextErrors).length) {
          onNotify?.({ type: 'error', message: 'Revise os campos destacados antes de aplicar.' });
        } else {
          onNotify?.({ type: 'success', message: 'Extração concluída. Revise e aplique os dados.' });
        }
      } catch (error) {
        console.error('Erro ao chamar o extrator', error);
        setErrorMessage('Não foi possível processar a solicitação. Verifique a conexão e tente novamente.');
        setExtractedData(null);
      } finally {
        setIsProcessing(false);
      }
    },
    [onNotify],
  );

  const handleExtractFromText = async () => {
    const trimmed = textInput.trim();
    if (!trimmed) {
      setErrorMessage('Cole o conteúdo completo do e-mail de confirmação.');
      setExtractedData(null);
      return;
    }

    const formData = buildTextFormData(trimmed);
    await runExtraction(formData);
  };

  const handleExtractFromImage = async () => {
    if (!selectedFile) {
      setErrorMessage('Selecione um arquivo de imagem ou PDF.');
      return;
    }

    const formData = await readFileAsFormData(selectedFile);
    await runExtraction(formData);
  };

  const handleRetry = () => {
    setDraft(emptyDraft);
    setErrors({});
    setExtractedData(null);
    setErrorMessage(null);
    setModelName(null);
  };

  const handleEditableFieldChange = (key: ExtractedReservationFieldKey, value: string) => {
    setDraft((previous) => {
      const nextValue = normalizeFieldValue(key, value);
      const updated = { ...previous, [key]: nextValue };
      setErrors(validateDraft(updated));
      return updated;
    });
    setErrorMessage(null);
  };

  const handleApplyToForm = () => {
    const validationErrors = validateDraft(draft);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      setErrorMessage('Revise os campos destacados antes de aplicar.');
      return;
    }

    const sanitized = fromDraft(draft);
    onApply(sanitized);
    onNotify?.({ type: 'success', message: 'Campos aplicados ao formulário. Revise antes de salvar.' });
    handleClose();
  };

  const hasPreview = useMemo(
    () => Boolean(filePreviewUrl && selectedFile && selectedFile.type.startsWith('image/')),
    [filePreviewUrl, selectedFile],
  );
  const isPdf = selectedFile?.type === 'application/pdf';

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4 py-6 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Importar reserva</h2>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Beta</span>
            </div>
            {modelName ? (
              <span className="text-xs font-medium uppercase text-slate-400">Modelo: {modelName}</span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fechar modal"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-6 px-6 py-6">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => handleTabChange('text')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 transition ${
                activeTab === 'text' ? 'bg-white text-slate-900 shadow-sm' : 'hover:bg-white/60'
              }`}
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              Texto
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('image')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 transition ${
                activeTab === 'image' ? 'bg-white text-slate-900 shadow-sm' : 'hover:bg-white/60'
              }`}
            >
              <ImageIcon className="h-4 w-4" aria-hidden="true" />
              Imagem
            </button>
          </div>

          {errorMessage && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div>
          )}

          {!hasResult && activeTab === 'text' && (
            <div className="space-y-4">
              <label htmlFor="import-textarea" className="text-sm font-medium text-slate-700">
                Cole o e-mail ou texto completo
              </label>
              <textarea
                id="import-textarea"
                className="h-52 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                value={textInput}
                onChange={(event) => setTextInput(event.target.value)}
                placeholder="Cole aqui o conteúdo da reserva..."
              />
              <button
                type="button"
                onClick={handleExtractFromText}
                disabled={isProcessing}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isProcessing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Extrair dados
              </button>
            </div>
          )}

          {!hasResult && activeTab === 'image' && (
            <div className="space-y-4">
              <label className="text-sm font-medium text-slate-700">Faça upload de uma imagem ou PDF</label>
              <label
                htmlFor="import-file"
                onDrop={handleDrop}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                className="flex h-52 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center text-sm text-slate-500 transition hover:border-blue-400 hover:bg-blue-50/50"
              >
                <div className="flex flex-col items-center gap-2">
                  <ImageIcon className="h-8 w-8 text-slate-400" aria-hidden="true" />
                  <div className="space-y-1">
                    <p className="text-slate-700">Arraste e solte o arquivo aqui</p>
                    <p className="text-xs text-slate-500">PNG, JPG, JPEG ou PDF até {MAX_FILE_SIZE_MB}MB</p>
                  </div>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">Selecionar arquivo</span>
                <input
                  id="import-file"
                  name="import-file"
                  type="file"
                  accept={acceptedTypes.join(',')}
                  className="sr-only"
                  onChange={handleFileInputChange}
                />
              </label>

              {selectedFile && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium text-slate-800">{selectedFile.name}</p>
                      <p className="text-xs text-slate-500">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleFileSelect(null)}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                    >
                      Remover arquivo
                    </button>
                  </div>

                  {hasPreview && filePreviewUrl && (
                    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                      <img src={filePreviewUrl} alt="Pré-visualização do arquivo" className="h-48 w-full bg-slate-100 object-contain" />
                    </div>
                  )}

                  {isPdf && (
                    <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
                      Pré-visualização indisponível para PDF. A extração utilizará a primeira página do arquivo.
                    </p>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={handleExtractFromImage}
                disabled={isProcessing || !selectedFile}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isProcessing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Executar OCR
              </button>
            </div>
          )}

          {hasResult && (
            <DetectedFieldsPreview
              data={draft}
              errors={errors}
              onChange={handleEditableFieldChange}
              onApply={handleApplyToForm}
              onRetry={handleRetry}
              onDiscard={handleClose}
              isApplying={isProcessing}
            />
          )}
        </div>
      </div>
    </div>
  );
}
