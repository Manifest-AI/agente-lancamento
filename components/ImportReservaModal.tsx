'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { FileText, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { DetectedFieldsPreview } from './DetectedFieldsPreview';
import type {
  ExtractedReservation,
} from '@/types/ocr-gpt';
import {
  createEmptyPreview,
  createEmptyPreviewErrors,
  hasPreviewErrors,
  mapReservaToForm,
  sanitizePreviewDraft,
  validatePreview,
} from '@/app/nova-reserva/mapReservaToForm';
import type { ReservaPreviewDraft, ReservaPreviewErrors } from '@/app/nova-reserva/mapReservaToForm';
import { normalizeExtractedReservationDates } from '@/lib/ocr/normalizeReservation';

export type ImportReservaModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (data: ReservaPreviewDraft) => void;
  onNotify?: (payload: { type: 'success' | 'error'; message: string }) => void;
};

const MAX_FILE_SIZE_MB = 10;

async function readFileAsFormData(file: File) {
  const formData = new FormData();
  formData.append('type', 'image');
  formData.append('file', file);
  return formData;
}

function buildTextFormData(text: string) {
  const formData = new FormData();
  formData.append('type', 'text');
  formData.append('text', text);
  return formData;
}

type ExtractorErrorDetails = {
  code: string;
  message: string;
  hint?: string;
  requestId?: string;
  status?: number;
};

function mapErrorCodeToMessage(code: string | undefined) {
  const normalized = code?.toLowerCase();

  switch (normalized) {
    case 'missing_api_key':
    case 'invalid_api_key':
      return 'Chave da IA ausente/ inválida. Verifique as variáveis de ambiente.';
    case 'payload_too_large':
      return 'Arquivo maior que 10 MB.';
    case 'unsupported_media_type':
      return 'Formato não suportado (use PNG, JPG ou PDF).';
    case 'rate_limited':
      return 'Muitas tentativas agora. Tente novamente em instantes.';
    case 'openai_upstream_error':
    case 'timeout':
      return 'Falha temporária no provedor de IA.';
    case 'openai_invalid_response':
      return 'A IA não retornou dados válidos.';
    default:
      return 'Não foi possível concluir a extração.';
  }
}

export function ImportReservaModal({ isOpen, onClose, onApply, onNotify }: ImportReservaModalProps) {
  const [activeTab, setActiveTab] = useState<'text' | 'image'>('text');
  const [textInput, setTextInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<ExtractorErrorDetails | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [preview, setPreview] = useState<ReservaPreviewDraft>(() => createEmptyPreview());
  const [errors, setErrors] = useState<ReservaPreviewErrors>(() => createEmptyPreviewErrors(1));
  const [extractedData, setExtractedData] = useState<ExtractedReservation | null>(null);
  const [modelName, setModelName] = useState<string | null>(null);
  const [clipboardSupport, setClipboardSupport] = useState<'unknown' | 'supported' | 'unsupported'>('unknown');
  const errorDetailsRef = useRef<HTMLPreElement | null>(null);

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
    if (!isOpen) {
      setClipboardSupport('unknown');
      return;
    }

    try {
      const hasWindow = typeof window !== 'undefined';
      const hasNavigator = typeof navigator !== 'undefined';
      const supported = Boolean(
        hasWindow &&
          window.isSecureContext &&
          hasNavigator &&
          'clipboard' in navigator &&
          navigator.clipboard &&
          typeof navigator.clipboard.writeText === 'function',
      );
      setClipboardSupport(supported ? 'supported' : 'unsupported');
    } catch {
      setClipboardSupport('unsupported');
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
    setErrorDetails(null);
    setShowErrorDetails(false);
    setPreview(createEmptyPreview());
    setErrors(createEmptyPreviewErrors(1));
    setExtractedData(null);
    setModelName(null);
    setClipboardSupport('unknown');
    errorDetailsRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const handleTabChange = (tab: 'text' | 'image') => {
    setActiveTab(tab);
    setErrorMessage(null);
    setErrorDetails(null);
    setShowErrorDetails(false);
    errorDetailsRef.current = null;
  };

  const handleFileSelect = (file: File | null) => {
    if (!file) {
      setSelectedFile(null);
      errorDetailsRef.current = null;
      return;
    }

    if (!acceptedTypes.includes(file.type)) {
      setErrorMessage('Formato não suportado (use PNG, JPG ou PDF).');
      setErrorDetails(null);
      setShowErrorDetails(false);
      setSelectedFile(null);
      errorDetailsRef.current = null;
      return;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setErrorMessage('Arquivo maior que 10 MB.');
      setErrorDetails(null);
      setShowErrorDetails(false);
      setSelectedFile(null);
      errorDetailsRef.current = null;
      return;
    }

    setErrorMessage(null);
    setErrorDetails(null);
    setShowErrorDetails(false);
    setSelectedFile(file);
    errorDetailsRef.current = null;
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
      setErrorDetails(null);
      setShowErrorDetails(false);
      errorDetailsRef.current = null;
      try {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 30_000);
        let response: Response;
        try {
          response = await fetch('/api/ocr-gpt', {
            method: 'POST',
            body: formData,
            signal: controller.signal,
          });
        } finally {
          window.clearTimeout(timeoutId);
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          const status = response.status || undefined;
          const details: ExtractorErrorDetails = {
            code: 'invalid_json_response',
            message: 'Resposta inválida do servidor.',
            hint: 'Não foi possível ler a resposta do servidor.',
            status,
          };
          const userMessage = mapErrorCodeToMessage(details.code);
          setErrorMessage(userMessage);
          setErrorDetails(details);
          setShowErrorDetails(false);
          setExtractedData(null);
          setModelName(null);
          return;
        }

        const parsed = payload as
          | { ok: true; data?: ExtractedReservation; model?: string | null; requestId?: string }
          | { ok: false; error?: { code?: string; message?: string; hint?: string }; requestId?: string };

        if (!response.ok || !parsed?.ok) {
          const errorPayload = !parsed || typeof parsed !== 'object' ? undefined : (parsed as any).error;
          const code = typeof errorPayload?.code === 'string' ? errorPayload.code : 'unknown_error';
          const message = typeof errorPayload?.message === 'string' ? errorPayload.message : 'Não foi possível concluir a extração.';
          const hint = typeof errorPayload?.hint === 'string' ? errorPayload.hint : undefined;
          const details: ExtractorErrorDetails = {
            code,
            message,
            hint,
            requestId: typeof parsed?.requestId === 'string' ? parsed.requestId : undefined,
            status: response.status || undefined,
          };
          const userMessage = mapErrorCodeToMessage(code);
          setErrorMessage(userMessage);
          setErrorDetails(details);
          setShowErrorDetails(false);
          setExtractedData(null);
          setModelName(null);
          return;
        }

        const data = parsed.data as ExtractedReservation | undefined;
        if (!data) {
          setErrorMessage('A IA não retornou dados válidos.');
          setErrorDetails(null);
          setShowErrorDetails(false);
          setExtractedData(null);
          setModelName(null);
          return;
        }

        const normalizedData = normalizeExtractedReservationDates(data);
        const nextPreview = mapReservaToForm(normalizedData);
        const nextErrors = validatePreview(nextPreview);
        setPreview(nextPreview);
        setErrors(nextErrors);
        setExtractedData(normalizedData);
        setModelName(parsed?.model ?? null);
        setErrorDetails(null);
        setShowErrorDetails(false);

        if (hasPreviewErrors(nextErrors)) {
          onNotify?.({ type: 'error', message: 'Revise os campos destacados antes de aplicar.' });
        } else {
          onNotify?.({ type: 'success', message: 'Extração concluída. Revise e aplique os dados.' });
        }
      } catch (error) {
        console.error('Erro ao chamar o extrator', error);
        if (error instanceof DOMException && error.name === 'AbortError') {
          const details: ExtractorErrorDetails = {
            code: 'timeout',
            message: 'Tempo limite atingido na solicitação.',
            hint: 'timeout',
          };
          const userMessage = mapErrorCodeToMessage(details.code);
          setErrorMessage(userMessage);
          setErrorDetails(details);
          setShowErrorDetails(false);
        } else {
          const details: ExtractorErrorDetails = {
            code: 'network_error',
            message: error instanceof Error ? error.message : 'Erro de rede ao contatar o servidor.',
          };
          const userMessage = mapErrorCodeToMessage(details.code);
          setErrorMessage(userMessage);
          setErrorDetails(details);
          setShowErrorDetails(false);
        }
        setExtractedData(null);
        setModelName(null);
      } finally {
        setIsProcessing(false);
      }
    },
    [onNotify],
  );

  const handleExtractFromText = async () => {
    const trimmed = textInput.trim();
    if (trimmed.length < 20) {
      setErrorMessage('Texto insuficiente. Cole o conteúdo completo.');
      setErrorDetails(null);
      setShowErrorDetails(false);
      setExtractedData(null);
      errorDetailsRef.current = null;
      return;
    }

    const formData = buildTextFormData(trimmed);
    await runExtraction(formData);
  };

  const handleExtractFromImage = async () => {
    if (!selectedFile) {
      setErrorMessage('Selecione um arquivo de imagem ou PDF.');
      setErrorDetails(null);
      setShowErrorDetails(false);
      errorDetailsRef.current = null;
      return;
    }

    const formData = await readFileAsFormData(selectedFile);
    await runExtraction(formData);
  };

  const handleRetry = () => {
    setPreview(createEmptyPreview());
    setErrors(createEmptyPreviewErrors(1));
    setExtractedData(null);
    setErrorMessage(null);
    setErrorDetails(null);
    setShowErrorDetails(false);
    setModelName(null);
    errorDetailsRef.current = null;
  };

  const handleFieldChange = (field: keyof Omit<ReservaPreviewDraft, 'passageiros'>, value: string) => {
    setPreview((previous) => {
      const updated: ReservaPreviewDraft = { ...previous, [field]: value } as ReservaPreviewDraft;
      setErrors(validatePreview(updated));
      return updated;
    });
    setErrorMessage(null);
    setErrorDetails(null);
    setShowErrorDetails(false);
    errorDetailsRef.current = null;
  };

  const handlePassengerChange = (index: number, field: keyof ReservaPreviewDraft['passageiros'][number], value: string) => {
    setPreview((previous) => {
      const nextPassengers: ReservaPreviewDraft['passageiros'] = previous.passageiros.map(
        (passageiro, passengerIndex) => {
          if (passengerIndex !== index) {
            return passageiro;
          }

          if (field === 'classificacao') {
            return {
              ...passageiro,
              classificacao: value as ReservaPreviewDraft['passageiros'][number]['classificacao'],
            };
          }

          return { ...passageiro, nome: value };
        },
      );
      const updated: ReservaPreviewDraft = { ...previous, passageiros: nextPassengers };
      setErrors(validatePreview(updated));
      return updated;
    });
    setErrorMessage(null);
    setErrorDetails(null);
    setShowErrorDetails(false);
    errorDetailsRef.current = null;
  };

  const handlePassengerAdd = () => {
    setPreview((previous) => {
      const nextPassengers: ReservaPreviewDraft['passageiros'] = [
        ...previous.passageiros,
        { nome: '', classificacao: '' as const },
      ];
      const updated: ReservaPreviewDraft = { ...previous, passageiros: nextPassengers };
      setErrors(validatePreview(updated));
      return updated;
    });
    setErrorMessage(null);
    setErrorDetails(null);
    setShowErrorDetails(false);
    errorDetailsRef.current = null;
  };

  const handlePassengerRemove = (index: number) => {
    setPreview((previous) => {
      if (previous.passageiros.length <= 1) {
        return previous;
      }
      const nextPassengers = previous.passageiros.filter((_, passengerIndex) => passengerIndex !== index);
      const updated: ReservaPreviewDraft = { ...previous, passageiros: nextPassengers };
      setErrors(validatePreview(updated));
      return updated;
    });
    setErrorMessage(null);
    setErrorDetails(null);
    setShowErrorDetails(false);
    errorDetailsRef.current = null;
  };

  const handleApplyToForm = () => {
    const validationErrors = validatePreview(preview);
    setErrors(validationErrors);

    if (hasPreviewErrors(validationErrors)) {
      setErrorMessage('Revise os campos destacados antes de aplicar.');
      setErrorDetails(null);
      setShowErrorDetails(false);
      errorDetailsRef.current = null;
      return;
    }

    const sanitized = sanitizePreviewDraft(preview);

    onApply(sanitized);
    onNotify?.({ type: 'success', message: 'Campos aplicados ao formulário. Revise antes de salvar.' });
    handleClose();
  };

  const hasPreview = useMemo(
    () => Boolean(filePreviewUrl && selectedFile && selectedFile.type.startsWith('image/')),
    [filePreviewUrl, selectedFile],
  );
  const isPdf = selectedFile?.type === 'application/pdf';
  const canUseClipboard = clipboardSupport === 'supported';

  const handleCopyErrorDetails = useCallback(async () => {
    if (!errorDetails) {
      return;
    }

    if (clipboardSupport !== 'supported') {
      onNotify?.({ type: 'error', message: 'Copiar não suportado neste navegador.' });
      return;
    }

    const payload = {
      code: errorDetails.code,
      message: errorDetails.message,
      ...(errorDetails.hint ? { hint: errorDetails.hint } : {}),
      ...(errorDetails.requestId ? { requestId: errorDetails.requestId } : {}),
      ...(typeof errorDetails.status === 'number' ? { status: errorDetails.status } : {}),
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(payload));
      onNotify?.({ type: 'success', message: 'Copiado para a área de transferência.' });
    } catch (clipError) {
      console.error('Falha ao copiar detalhes de erro', clipError);
      onNotify?.({ type: 'error', message: 'Não foi possível copiar.' });
    }
  }, [clipboardSupport, errorDetails, onNotify]);

  const handleSelectErrorDetails = useCallback(() => {
    if (!errorDetailsRef.current) {
      return;
    }

    try {
      const selection = window.getSelection();
      if (!selection) {
        return;
      }
      selection.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(errorDetailsRef.current);
      selection.addRange(range);
      onNotify?.({ type: 'success', message: 'Detalhes selecionados. Use Ctrl/Cmd+C para copiar.' });
    } catch (selectionError) {
      console.error('Falha ao selecionar detalhes', selectionError);
      onNotify?.({ type: 'error', message: 'Não foi possível selecionar o texto.' });
    }
  }, [onNotify]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4 py-6 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex max-h-[calc(100vh-2rem)] flex-col md:max-h-[min(78vh,860px)]">
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

          <div className="flex-1 overflow-y-auto px-6 py-6 overscroll-contain">
            <div className="flex flex-col gap-6">
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
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <div className="flex flex-col gap-3">
                <p className="font-semibold text-rose-800">{errorMessage}</p>
                {errorDetails && (
                  <div className="rounded-lg border border-rose-200 bg-white/70 p-3 text-xs text-rose-700">
                    <dl className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <dt className="font-semibold uppercase tracking-wide text-rose-600">Código</dt>
                        <dd className="font-mono text-rose-700">{errorDetails.code}</dd>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <dt className="font-semibold uppercase tracking-wide text-rose-600">Mensagem</dt>
                        <dd className="text-rose-700">{errorDetails.message}</dd>
                      </div>
                      {errorDetails.hint ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <dt className="font-semibold uppercase tracking-wide text-rose-600">Hint</dt>
                          <dd className="text-rose-700">{errorDetails.hint}</dd>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2">
                        <dt className="font-semibold uppercase tracking-wide text-rose-600">Request ID</dt>
                        <dd className="font-mono text-rose-700">{errorDetails.requestId ?? 'N/A'}</dd>
                      </div>
                      {typeof errorDetails.status === 'number' ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <dt className="font-semibold uppercase tracking-wide text-rose-600">Status</dt>
                          <dd className="font-mono text-rose-700">{errorDetails.status}</dd>
                        </div>
                      ) : null}
                    </dl>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {canUseClipboard ? (
                        <button
                          type="button"
                          onClick={handleCopyErrorDetails}
                          className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-1 text-[11px] font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
                        >
                          Copiar detalhes
                        </button>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-medium text-rose-600">
                            {clipboardSupport === 'unsupported'
                              ? 'Copiar não suportado neste navegador.'
                              : 'Verificando suporte ao copiar...'}
                          </span>
                          <button
                            type="button"
                            onClick={handleSelectErrorDetails}
                            className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-1 text-[11px] font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
                          >
                            Selecionar tudo
                          </button>
                          <span className="text-[11px] text-rose-500">Depois, pressione Ctrl/Cmd+C.</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowErrorDetails((previous) => !previous)}
                        className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-1 text-[11px] font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
                      >
                        {showErrorDetails ? 'Ocultar JSON' : 'Ver JSON'}
                      </button>
                    </div>
                    {showErrorDetails ? (
                      <pre
                        ref={errorDetailsRef}
                        className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-rose-50/70 p-3 font-mono text-[11px]"
                      >
                        {JSON.stringify(
                          {
                            code: errorDetails.code,
                            message: errorDetails.message,
                            ...(errorDetails.hint ? { hint: errorDetails.hint } : {}),
                            ...(errorDetails.requestId ? { requestId: errorDetails.requestId } : {}),
                            ...(typeof errorDetails.status === 'number' ? { status: errorDetails.status } : {}),
                          },
                          null,
                          2,
                        )}
                      </pre>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
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
                {isProcessing ? 'Processando…' : 'Extrair dados'}
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
                {isProcessing ? 'Processando…' : 'Executar OCR'}
              </button>
            </div>
          )}

          {hasResult && (
            <DetectedFieldsPreview
              data={preview}
              errors={errors}
              onFieldChange={handleFieldChange}
              onPassengerChange={handlePassengerChange}
              onPassengerAdd={handlePassengerAdd}
              onPassengerRemove={handlePassengerRemove}
              onApply={handleApplyToForm}
              onRetry={handleRetry}
              onDiscard={handleClose}
              isApplying={isProcessing}
            />
          )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
