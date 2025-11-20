'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { FileText, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { DetectedFieldsPreview } from './DetectedFieldsPreview';
import { AlterationPreviewPanel } from './AlterationPreviewPanel';
import { CancellationPreviewPanel } from './CancellationPreviewPanel';
import type { ExtractedReservation } from '@/types/ocr-gpt';
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
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabaseClient';
import type { ReservationRecord } from '@/lib/queries/reservas';
import type { ExtractedAlteration } from '@/lib/reservas/alteracao';
import type { ExtractedCancellation } from '@/lib/reservas/cancelamento';
import type {
  ApplyAlterationPayload,
  ApplyCancellationPayload,
  ReservationLookupState,
} from '@/types/reservation-adjustments';
import { saveReservation } from '@/lib/reservas/saveReservation';

export type ImportReservaModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (data: ReservaPreviewDraft) => void;
  onNotify?: (payload: { type: 'success' | 'error'; message: string }) => void;
  mode?: 'initial' | 'adjustment';
};

const MAX_FILE_SIZE_MB = 10;
const MAX_FILES = 10;

async function readFileAsFormData(file: File) {
  const formData = new FormData();
  formData.append('type', 'image');
  formData.append('file', file);
  return formData;
}

type ExtractorErrorDetails = {
  code: string;
  message: string;
  hint?: string;
  requestId?: string;
  status?: number;
};

type FileExtractionState = {
  id: string;
  file: File;
  previewUrl: string | null;
  status: 'pending' | 'processing' | 'success' | 'error';
  errorMessage?: string | null;
  errorDetails?: ExtractorErrorDetails | null;
  extractedReservation?: ExtractedReservation | null;
  alterationResult?: ExtractedAlteration | null;
  cancellationResult?: ExtractedCancellation | null;
  preview?: ReservaPreviewDraft;
  errors?: ReservaPreviewErrors;
  modelName?: string | null;
  isSaving?: boolean;
  isSaved?: boolean;
};

function toExtractorErrorDetails(value: unknown): ExtractorErrorDetails | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const details = value as Partial<ExtractorErrorDetails>;
  if (typeof details.code !== 'string' || typeof details.message !== 'string') {
    return null;
  }
  return {
    code: details.code,
    message: details.message,
    hint: typeof details.hint === 'string' ? details.hint : undefined,
    requestId: typeof details.requestId === 'string' ? details.requestId : undefined,
    status: typeof details.status === 'number' ? details.status : undefined,
  };
}

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

export function ImportReservaModal({ isOpen, onClose, onApply: _onApply, onNotify, mode = 'initial' }: ImportReservaModalProps) {
  const { user, session } = useAuth();
  const [activeTab, setActiveTab] = useState<'text' | 'image'>('text');
  const [textInput, setTextInput] = useState('');
  const [fileItems, setFileItems] = useState<FileExtractionState[]>([]);
  const [activePreviewFileId, setActivePreviewFileId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<ExtractorErrorDetails | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [preview, setPreview] = useState<ReservaPreviewDraft>(() => createEmptyPreview());
  const [errors, setErrors] = useState<ReservaPreviewErrors>(() => createEmptyPreviewErrors(1));
  const [extractedData, setExtractedData] = useState<ExtractedReservation | null>(null);
  const [alterationResult, setAlterationResult] = useState<ExtractedAlteration | null>(null);
  const [cancellationResult, setCancellationResult] = useState<ExtractedCancellation | null>(null);
  const [alterationMatches, setAlterationMatches] = useState<ReservationRecord[]>([]);
  const [cancellationMatches, setCancellationMatches] = useState<ReservationRecord[]>([]);
  const [alterationLookupState, setAlterationLookupState] = useState<ReservationLookupState>('idle');
  const [cancellationLookupState, setCancellationLookupState] = useState<ReservationLookupState>('idle');
  const [isApplyingAction, setIsApplyingAction] = useState(false);
  const [modelName, setModelName] = useState<string | null>(null);
  const [clipboardSupport, setClipboardSupport] = useState<'unknown' | 'supported' | 'unsupported'>('unknown');
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewOrigin, setPreviewOrigin] = useState<'text' | 'file' | null>(null);
  const [isSavingPreview, setIsSavingPreview] = useState(false);
  const [savingFileId, setSavingFileId] = useState<string | null>(null);
  const errorDetailsRef = useRef<HTMLPreElement | null>(null);

  const hasResult = useMemo(() => {
    if (mode === 'adjustment') {
      return Boolean(alterationResult || cancellationResult);
    }
    return Boolean(extractedData);
  }, [alterationResult, cancellationResult, extractedData, mode]);
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
    if (!isOpen || mode !== 'adjustment') {
      setAlterationLookupState('idle');
      setAlterationMatches([]);
      return;
    }

    const numero = alterationResult?.referencia_reserva.numero_reserva?.trim();
    if (!alterationResult || !numero || !user) {
      setAlterationLookupState(alterationResult && !numero ? 'not_found' : 'idle');
      setAlterationMatches([]);
      return;
    }

    let cancelled = false;
    setAlterationLookupState('loading');
    void supabase
      .from('reservas')
      .select('*')
      .eq('user_id', user.id)
      .eq('numero_reserva', numero)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) {
          return;
        }
        if (error) {
          console.error('Falha ao buscar reserva para alteração', error);
          setAlterationMatches([]);
          setAlterationLookupState('error');
          return;
        }
        if (!data || data.length === 0) {
          setAlterationMatches([]);
          setAlterationLookupState('not_found');
          return;
        }
        setAlterationMatches(data as ReservationRecord[]);
        setAlterationLookupState('loaded');
      });

    return () => {
      cancelled = true;
    };
  }, [alterationResult, isOpen, mode, user?.id]);

  useEffect(() => {
    if (!isOpen || mode !== 'adjustment') {
      setCancellationLookupState('idle');
      setCancellationMatches([]);
      return;
    }

    const numero = cancellationResult?.referencia_reserva.numero_reserva?.trim();
    if (!cancellationResult || !numero || !user) {
      setCancellationLookupState(cancellationResult && !numero ? 'not_found' : 'idle');
      setCancellationMatches([]);
      return;
    }

    let cancelled = false;
    setCancellationLookupState('loading');
    void supabase
      .from('reservas')
      .select('*')
      .eq('user_id', user.id)
      .eq('numero_reserva', numero)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) {
          return;
        }
        if (error) {
          console.error('Falha ao buscar reserva para cancelamento', error);
          setCancellationMatches([]);
          setCancellationLookupState('error');
          return;
        }
        if (!data || data.length === 0) {
          setCancellationMatches([]);
          setCancellationLookupState('not_found');
          return;
        }
        setCancellationMatches(data as ReservationRecord[]);
        setCancellationLookupState('loaded');
      });

    return () => {
      cancelled = true;
    };
  }, [cancellationResult, isOpen, mode, user?.id]);

  const clearPreviewState = useCallback(() => {
    setPreview(createEmptyPreview());
    setErrors(createEmptyPreviewErrors(1));
    setExtractedData(null);
    setAlterationResult(null);
    setCancellationResult(null);
    setAlterationMatches([]);
    setCancellationMatches([]);
    setAlterationLookupState('idle');
    setCancellationLookupState('idle');
    setIsApplyingAction(false);
    setIsSavingPreview(false);
    setSavingFileId(null);
    setModelName(null);
    setErrorMessage(null);
    setErrorDetails(null);
    setShowErrorDetails(false);
    setIsPreviewModalOpen(false);
    setPreviewOrigin(null);
    errorDetailsRef.current = null;
  }, []);

  const resetState = useCallback(() => {
    setActiveTab('text');
    setTextInput('');
    setIsProcessing(false);
    clearPreviewState();
    setActivePreviewFileId(null);
    setClipboardSupport('unknown');
    setIsPreviewModalOpen(false);
    setPreviewOrigin(null);
    setSavingFileId(null);
    setFileItems((items) => {
      items.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
      return [];
    });
  }, [clearPreviewState]);

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

  const createFileItem = (file: File): FileExtractionState => ({
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    file,
    previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    status: 'pending',
    errorMessage: null,
    errorDetails: null,
    extractedReservation: null,
    alterationResult: null,
    cancellationResult: null,
    preview: undefined,
    errors: undefined,
    modelName: null,
    isSaving: false,
    isSaved: false,
  });

  const handleFilesAdd = (files: FileList | File[]) => {
    const incoming = Array.from(files ?? []);
    if (!incoming.length) {
      return;
    }

    const availableSlots = MAX_FILES - fileItems.length;
    if (availableSlots <= 0) {
      onNotify?.({ type: 'error', message: `Limite de ${MAX_FILES} arquivos atingido.` });
      return;
    }

    const acceptedItems: FileExtractionState[] = [];
    let rejected = false;

    for (const file of incoming.slice(0, availableSlots)) {
      if (!acceptedTypes.includes(file.type)) {
        rejected = true;
        continue;
      }
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        rejected = true;
        continue;
      }
      acceptedItems.push(createFileItem(file));
    }

    if (incoming.length > availableSlots) {
      onNotify?.({ type: 'error', message: `Apenas ${MAX_FILES} arquivos podem ser enviados por vez.` });
    }

    if (rejected) {
      setErrorMessage('Alguns arquivos foram ignorados por formato ou tamanho inválido.');
      setErrorDetails(null);
      setShowErrorDetails(false);
    } else {
      setErrorMessage(null);
      setErrorDetails(null);
      setShowErrorDetails(false);
    }

    if (acceptedItems.length) {
      setFileItems((previous) => [...previous, ...acceptedItems]);
    }
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const files = event.dataTransfer.files;
    if (files && files.length) {
      handleFilesAdd(files);
    }
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      handleFilesAdd(event.target.files);
      event.target.value = '';
    }
  };

  const handleRemoveFile = (fileId: string) => {
    setFileItems((previous) => {
      const next = previous.filter((item) => item.id !== fileId);
      const removed = previous.find((item) => item.id === fileId);
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return next;
    });

    if (activePreviewFileId === fileId) {
      clearPreviewState();
      setActivePreviewFileId(null);
      setIsPreviewModalOpen(false);
      setPreviewOrigin(null);
    }
  };


  const runTextIngestion = useCallback(
    async (textContent: string, options?: { manageProcessingState?: boolean }) => {
      const manageProcessingState = options?.manageProcessingState ?? true;
      if (manageProcessingState) {
        setIsProcessing(true);
      }
      setErrorMessage(null);
      setErrorDetails(null);
      setShowErrorDetails(false);
      errorDetailsRef.current = null;
      try {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 30_000);
        let response: Response;
        try {
          response = await fetch('/api/reservas/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conteudo: textContent }),
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

        type IngestSuccessResponse = {
          ok: true;
          classificacao?: Record<string, unknown> | null;
          reserva?: ExtractedReservation | null;
          suportado?: boolean;
          model?: string | null;
          requestId?: string;
          alteracao?: ExtractedAlteration | null;
          cancelamento?: ExtractedCancellation | null;
        };

        type IngestErrorResponse = {
          ok: false;
          error?: { code?: string; message?: string; hint?: string };
          requestId?: string;
        };

        const parsed = payload as IngestSuccessResponse | IngestErrorResponse | undefined;

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

        const suportado = parsed.suportado ?? false;
        const data = parsed.reserva ?? null;
        const alteration = parsed.alteracao ?? null;
        const cancellation = parsed.cancelamento ?? null;
        const tipoDocumento =
          (parsed.classificacao as { tipo_documento?: string } | undefined)?.tipo_documento ?? null;
        setModelName(parsed?.model ?? null);

        if (mode === 'adjustment') {
          setPreview(createEmptyPreview());
          setErrors(createEmptyPreviewErrors(1));
          setExtractedData(null);

          if (tipoDocumento === 'alteracao' && alteration) {
            setAlterationResult(alteration);
            setCancellationResult(null);
            setErrorMessage(null);
            onNotify?.({ type: 'success', message: 'Alteração identificada. Revise antes de aplicar.' });
            return;
          }

          if (tipoDocumento === 'cancelamento' && cancellation) {
            setCancellationResult(cancellation);
            setAlterationResult(null);
            setErrorMessage(null);
            onNotify?.({ type: 'success', message: 'Cancelamento identificado. Revise antes de aplicar.' });
            return;
          }

          if (tipoDocumento === 'reserva_inicial' && data) {
            setErrorMessage('Este documento parece ser uma reserva inicial. Utilize o botão "Importar reserva" para cadastrá-la.');
            setAlterationResult(null);
            setCancellationResult(null);
            setErrorDetails(null);
            setShowErrorDetails(false);
            return;
          }

          setAlterationResult(null);
          setCancellationResult(null);
          setErrorMessage('Não foi possível identificar alterações ou cancelamentos neste documento.');
          setErrorDetails(null);
          setShowErrorDetails(false);
          return;
        }

        if (!suportado || !data || tipoDocumento !== 'reserva_inicial') {
          let message = 'Não foi possível identificar uma reserva inicial neste documento.';
          if (tipoDocumento === 'alteracao') {
            message = 'Este documento parece uma alteração. Use o botão "Alterações e Cancelamentos".';
          } else if (tipoDocumento === 'cancelamento') {
            message = 'Este documento parece um cancelamento. Use o botão "Alterações e Cancelamentos".';
          }
          setErrorMessage(message);
          setErrorDetails(null);
          setShowErrorDetails(false);
          setExtractedData(null);
          setAlterationResult(null);
          setCancellationResult(null);
          return;
        }

        const normalizedData = normalizeExtractedReservationDates(data);
        const nextPreview = mapReservaToForm(normalizedData);
        const nextErrors = validatePreview(nextPreview);
        setPreview(nextPreview);
        setErrors(nextErrors);
        setExtractedData(normalizedData);
        setAlterationResult(null);
        setCancellationResult(null);
        setErrorDetails(null);
        setShowErrorDetails(false);
        setPreviewOrigin('text');
        setActivePreviewFileId(null);
        setIsPreviewModalOpen(false);

        if (hasPreviewErrors(nextErrors)) {
          onNotify?.({ type: 'error', message: 'Revise os campos destacados antes de aplicar.' });
        } else {
          onNotify?.({ type: 'success', message: 'Extração concluída. Revise e aplique os dados.' });
        }
      } catch (error) {
        console.error('Erro ao chamar o ingestor de reservas', error);
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
        if (manageProcessingState) {
          setIsProcessing(false);
        }
      }
    },
    [mode, onNotify],
  );

  const runExtraction = useCallback(
    async (formData: FormData, options?: { fileId?: string }) => {
      const targetFileId = options?.fileId ?? null;
      if (targetFileId) {
            setFileItems((previous) =>
              previous.map((item) =>
                item.id === targetFileId
                  ? {
                      ...item,
                      status: 'processing',
                      errorMessage: null,
                      errorDetails: null,
                      isSaving: false,
                      isSaved: false,
                    }
                  : item,
              ),
            );
          }
      const updateFileState = (
        status: FileExtractionState['status'],
        extra?: Partial<FileExtractionState>,
      ) => {
        if (!targetFileId) {
          return;
        }
        setFileItems((previous) =>
          previous.map((item) =>
                item.id === targetFileId
                  ? {
                      ...item,
                      status,
                      ...extra,
                      isSaved: status === 'pending' ? false : item.isSaved,
                    }
                  : item,
              ),
        );
      };
      if (mode === 'adjustment') {
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
            response = await fetch('/api/reservas/ocr-text', {
              method: 'POST',
              body: formData,
              signal: controller.signal,
            });
          } finally {
            window.clearTimeout(timeoutId);
          }

          type OcrTextSuccess = { ok: true; conteudo: string; model?: string | null };
          type OcrTextError = { ok: false; error?: string };

          let payload: OcrTextSuccess | OcrTextError | undefined;
          try {
            payload = (await response.json()) as OcrTextSuccess | OcrTextError | undefined;
          } catch {
            setErrorMessage('Resposta inválida do servidor.');
            setErrorDetails(null);
            setShowErrorDetails(false);
            updateFileState('error', { errorMessage: 'Resposta inválida do servidor.' });
            return;
          }

          if (!response.ok || !payload?.ok || typeof payload.conteudo !== 'string') {
            const message = payload && 'error' in payload && payload.error
              ? payload.error
              : 'Não foi possível transcrever o arquivo enviado.';
            setErrorMessage(message);
            setErrorDetails(null);
            setShowErrorDetails(false);
            updateFileState('error', { errorMessage: message });
            return;
          }

          await runTextIngestion(payload.conteudo, { manageProcessingState: false });
          if (targetFileId) {
            setActivePreviewFileId(targetFileId);
            updateFileState('success', { modelName: payload?.model ?? null });
          }
        } catch (error) {
          console.error('Erro ao executar OCR de texto', error);
          setErrorMessage('Falha ao processar o arquivo. Tente novamente.');
          setErrorDetails(null);
          setShowErrorDetails(false);
          updateFileState('error', { errorMessage: 'Falha ao processar o arquivo. Tente novamente.' });
        } finally {
          setIsProcessing(false);
        }
        return;
      }

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
          updateFileState('error', { errorMessage: userMessage, errorDetails: details });
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
          updateFileState('error', { errorMessage: userMessage, errorDetails: details });
          return;
        }

        const data = parsed.data as ExtractedReservation | undefined;
        if (!data) {
          setErrorMessage('A IA não retornou dados válidos.');
          setErrorDetails(null);
          setShowErrorDetails(false);
          setExtractedData(null);
          setModelName(null);
          updateFileState('error', { errorMessage: 'A IA não retornou dados válidos.' });
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
        setPreviewOrigin('file');
        updateFileState('success', {
          extractedReservation: normalizedData,
          preview: nextPreview,
          errors: nextErrors,
          modelName: parsed?.model ?? null,
        });

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
          updateFileState('error', { errorMessage: userMessage, errorDetails: details });
        } else {
          const details: ExtractorErrorDetails = {
            code: 'network_error',
            message: error instanceof Error ? error.message : 'Erro de rede ao contatar o servidor.',
          };
          const userMessage = mapErrorCodeToMessage(details.code);
          setErrorMessage(userMessage);
          setErrorDetails(details);
          setShowErrorDetails(false);
          updateFileState('error', { errorMessage: userMessage, errorDetails: details });
        }
        setExtractedData(null);
        setModelName(null);
      } finally {
        setIsProcessing(false);
      }
    },
    [mode, onNotify, runTextIngestion],
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

    await runTextIngestion(trimmed);
  };

  const resetFileExtraction = (fileId: string) => {
    setFileItems((previous) =>
      previous.map((item) =>
        item.id === fileId
          ? {
              ...item,
              status: 'pending',
              errorMessage: null,
              errorDetails: null,
              extractedReservation: null,
              alterationResult: null,
              cancellationResult: null,
              preview: undefined,
              errors: undefined,
              modelName: null,
              isSaving: false,
              isSaved: false,
            }
          : item,
      ),
    );
  };

  const validateAndPreparePreview = (draft: ReservaPreviewDraft) => {
    const validationErrors = validatePreview(draft);
    const hasErrors = hasPreviewErrors(validationErrors);
    const sanitized = sanitizePreviewDraft(draft);

    return { validationErrors, hasErrors, sanitized };
  };

  const handleExtractFromFile = async (fileId: string) => {
    const fileEntry = fileItems.find((item) => item.id === fileId);
    if (!fileEntry) {
      return;
    }

    const formData = await readFileAsFormData(fileEntry.file);
    await runExtraction(formData, { fileId });
  };

  const handleOpenPreview = (fileId: string) => {
    const fileEntry = fileItems.find((item) => item.id === fileId);
    if (!fileEntry) {
      return;
    }

    clearPreviewState();
    setActivePreviewFileId(fileId);
    setModelName(fileEntry.modelName ?? null);
    setErrorMessage(fileEntry.errorMessage ?? null);
    setErrorDetails(fileEntry.errorDetails ?? null);
    setPreviewOrigin('file');
    setIsPreviewModalOpen(true);

    if (mode === 'adjustment') {
      setAlterationResult(fileEntry.alterationResult ?? null);
      setCancellationResult(fileEntry.cancellationResult ?? null);
    } else if (fileEntry.preview && fileEntry.errors && fileEntry.extractedReservation) {
      setPreview(fileEntry.preview);
      setErrors(fileEntry.errors);
      setExtractedData(fileEntry.extractedReservation);
    }
  };

  const handleRetry = (fileId?: string | null) => {
    const target = fileId ?? activePreviewFileId;
    clearPreviewState();
    setActivePreviewFileId(target ?? null);
    setIsProcessing(false);
    if (target) {
      resetFileExtraction(target);
    }
  };

  const handleDiscard = () => {
    if (activePreviewFileId) {
      resetFileExtraction(activePreviewFileId);
      clearPreviewState();
      setActivePreviewFileId(null);
      setIsPreviewModalOpen(false);
      setPreviewOrigin(null);
      return;
    }

    handleClose();
  };

  const handleSaveFileReservation = async (fileId: string) => {
    const fileEntry = fileItems.find((item) => item.id === fileId);
    if (!fileEntry?.preview) {
      return;
    }

    const { validationErrors, hasErrors, sanitized } = validateAndPreparePreview(fileEntry.preview);

    setFileItems((previous) =>
      previous.map((item) => (item.id === fileId ? { ...item, errors: validationErrors } : item)),
    );

    if (hasErrors) {
      setErrorMessage('Revise os campos destacados antes de salvar.');
      setErrorDetails(null);
      setShowErrorDetails(false);
      errorDetailsRef.current = null;
      onNotify?.({ type: 'error', message: 'Revise os campos destacados antes de salvar.' });
      handleOpenPreview(fileId);
      return;
    }

    setSavingFileId(fileId);
    setFileItems((previous) =>
      previous.map((item) => (item.id === fileId ? { ...item, isSaving: true } : item)),
    );

    let hasSaved = false;

    try {
      const { error } = await saveReservation(sanitized, { userId: user?.id ?? null, client: supabase });
      if (error) {
        console.error('Erro ao salvar reserva importada', error);
        onNotify?.({ type: 'error', message: 'Não foi possível salvar a reserva. Tente novamente.' });
        return;
      }

      setFileItems((previous) => previous.filter((item) => item.id !== fileId));
      hasSaved = true;
      onNotify?.({ type: 'success', message: 'Reserva salva com sucesso.' });
    } catch (error) {
      console.error('Erro inesperado ao salvar reserva importada', error);
      onNotify?.({ type: 'error', message: 'Não foi possível salvar a reserva. Tente novamente.' });
    } finally {
      setSavingFileId(null);
      if (!hasSaved) {
        setFileItems((previous) =>
          previous.some((item) => item.id === fileId)
            ? previous.map((item) => (item.id === fileId ? { ...item, isSaving: false } : item))
            : previous,
        );
      }
    }
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

  const handleSavePreview = async () => {
    const { validationErrors, hasErrors, sanitized } = validateAndPreparePreview(preview);
    setErrors(validationErrors);

    if (hasErrors) {
      setErrorMessage('Revise os campos destacados antes de salvar.');
      setErrorDetails(null);
      setShowErrorDetails(false);
      errorDetailsRef.current = null;
      return;
    }

    setIsSavingPreview(true);
    setErrorMessage(null);
    setErrorDetails(null);
    setShowErrorDetails(false);
    errorDetailsRef.current = null;
    try {
      const { error } = await saveReservation(sanitized, { userId: user?.id ?? null, client: supabase });

      if (error) {
        console.error('Erro ao salvar reserva importada', error);
        setErrorMessage('Não foi possível salvar a reserva. Tente novamente.');
        onNotify?.({ type: 'error', message: 'Não foi possível salvar a reserva. Tente novamente.' });
        return;
      }

      if (activePreviewFileId) {
        setFileItems((previous) =>
          previous.filter((item) => item.id !== activePreviewFileId),
        );
      }

      onNotify?.({ type: 'success', message: 'Reserva salva com sucesso.' });
      setIsPreviewModalOpen(false);
      setActivePreviewFileId(null);
    } catch (error) {
      console.error('Erro inesperado ao salvar reserva importada', error);
      setErrorMessage('Não foi possível salvar a reserva. Tente novamente.');
      onNotify?.({ type: 'error', message: 'Não foi possível salvar a reserva. Tente novamente.' });
    } finally {
      setIsSavingPreview(false);
    }
  };

  const handleApplyAlteration = useCallback(
    async (payload: ApplyAlterationPayload) => {
      if (!session?.access_token) {
        setErrorMessage('Sessão expirada. Faça login novamente.');
        setErrorDetails(null);
        setShowErrorDetails(false);
        errorDetailsRef.current = null;
        return;
      }

      setIsApplyingAction(true);
      setErrorMessage(null);
      setErrorDetails(null);
      setShowErrorDetails(false);
      errorDetailsRef.current = null;
      try {
        const response = await fetch('/api/reservas/alterar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        });
        const result = (await response.json()) as { ok?: boolean; error?: string; details?: unknown };
        if (!response.ok || !result?.ok) {
          const details = toExtractorErrorDetails(result?.details);
          setErrorMessage(result?.error ?? 'Não foi possível aplicar a alteração.');
          setErrorDetails(details);
          setShowErrorDetails(Boolean(details));
          return;
        }

        onNotify?.({ type: 'success', message: 'Alteração aplicada com sucesso.' });
        handleClose();
      } catch (error) {
        console.error('Erro ao aplicar alteração', error);
        setErrorMessage('Não foi possível aplicar a alteração. Tente novamente.');
        setErrorDetails(null);
        setShowErrorDetails(false);
      } finally {
        setIsApplyingAction(false);
      }
    },
    [handleClose, onNotify, session?.access_token],
  );

  const handleApplyCancellation = useCallback(
    async (payload: ApplyCancellationPayload) => {
      if (!session?.access_token) {
        setErrorMessage('Sessão expirada. Faça login novamente.');
        setErrorDetails(null);
        setShowErrorDetails(false);
        errorDetailsRef.current = null;
        return;
      }

      setIsApplyingAction(true);
      setErrorMessage(null);
      setErrorDetails(null);
      setShowErrorDetails(false);
      errorDetailsRef.current = null;
      try {
        const response = await fetch('/api/reservas/cancelar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        });
        const result = (await response.json()) as { ok?: boolean; error?: string; details?: unknown };
        if (!response.ok || !result?.ok) {
          const details = toExtractorErrorDetails(result?.details);
          setErrorMessage(result?.error ?? 'Não foi possível aplicar o cancelamento.');
          setErrorDetails(details);
          setShowErrorDetails(Boolean(details));
          return;
        }

        onNotify?.({ type: 'success', message: 'Cancelamento aplicado com sucesso.' });
        handleClose();
      } catch (error) {
        console.error('Erro ao aplicar cancelamento', error);
        setErrorMessage('Não foi possível aplicar o cancelamento. Tente novamente.');
        setErrorDetails(null);
        setShowErrorDetails(false);
      } finally {
        setIsApplyingAction(false);
      }
    },
    [handleClose, onNotify, session?.access_token],
  );

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

  const activeFileIndex = useMemo(
    () => fileItems.findIndex((item) => item.id === activePreviewFileId),
    [activePreviewFileId, fileItems],
  );

  const activeReservationLabel = useMemo(() => {
    if (activeFileIndex === -1) {
      return null;
    }

    return `Reserva ${activeFileIndex + 1}`;
  }, [activeFileIndex]);

  const shouldRenderInlinePreview = mode === 'initial' && hasResult && previewOrigin === 'text';
  const shouldRenderInlineAdjustment =
    mode === 'adjustment' && hasResult && !isPreviewModalOpen && previewOrigin !== 'file';
  const shouldRenderDetailModal = isPreviewModalOpen && Boolean(activePreviewFileId) && hasResult;

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4 py-6 backdrop-blur-sm">
        <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex max-h-[calc(100vh-2rem)] flex-col md:max-h-[min(78vh,860px)]">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {mode === 'adjustment' ? 'Alterações e cancelamentos' : 'Importar reserva'}
                  </h2>
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

          {mode === 'adjustment' ? (
            <p className="text-xs text-slate-500">
              Cole o e-mail ou documento de alteração/cancelamento e confirme os dados antes de aplicar ao banco.
            </p>
          ) : null}

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

          {activeTab === 'image' && (
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
                  multiple
                  className="sr-only"
                  onChange={handleFileInputChange}
                />
              </label>

              {fileItems.length > 0 ? (
                <div className="space-y-3">
                  {fileItems.map((item, index) => {
                    const isPdfFile = item.file.type === 'application/pdf';
                    const isIncompleteExtraction = item.status === 'success' && item.errors
                      ? hasPreviewErrors(item.errors)
                      : false;
                    const statusLabel = item.status === 'processing'
                      ? 'Processando...'
                      : item.status === 'success'
                        ? isIncompleteExtraction
                          ? 'Extração incompleta (dados pendentes)'
                          : 'Extração concluída com sucesso'
                        : item.status === 'error'
                          ? 'Erro na extração'
                          : 'Aguardando OCR';
                    const statusTone = item.status === 'success'
                      ? isIncompleteExtraction
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : item.status === 'error'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : item.status === 'processing'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-slate-100 text-slate-700 border-slate-200';

                    return (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-slate-800">Reserva {index + 1}</p>
                              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusTone}`}>
                                {statusLabel}
                              </span>
                            </div>
                            <p className="break-words text-sm text-slate-800">{item.file.name}</p>
                            <p className="text-xs text-slate-500">{(item.file.size / (1024 * 1024)).toFixed(2)} MB</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(item.id)}
                            className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                          >
                            Remover
                          </button>
                        </div>

                        <div className="mt-3 grid gap-4 sm:grid-cols-3 sm:items-center">
                          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 sm:col-span-2">
                            {item.previewUrl && !isPdfFile ? (
                              <img
                                src={item.previewUrl}
                                alt={`Pré-visualização de ${item.file.name}`}
                                className="h-40 w-full object-contain"
                              />
                            ) : (
                              <div className="flex h-40 items-center justify-center gap-2 text-slate-500">
                                <FileText className="h-5 w-5" aria-hidden="true" />
                                <span className="text-xs">Pré-visualização indisponível para PDF</span>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => handleExtractFromFile(item.id)}
                              disabled={item.status === 'processing'}
                              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {item.status === 'processing' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                              {item.status === 'processing' ? 'Processando…' : 'Executar OCR'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenPreview(item.id)}
                              disabled={item.status !== 'success'}
                              className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Ver dados extraídos
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveFileReservation(item.id)}
                              disabled={item.status !== 'success' || item.isSaving}
                              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {(savingFileId === item.id || item.isSaving) && (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                              )}
                              {savingFileId === item.id || item.isSaving ? 'Salvando…' : 'Salvar reserva'}
                            </button>
                            {item.isSaved ? (
                              <span className="text-xs font-medium text-emerald-600">Reserva salva</span>
                            ) : null}
                          </div>
                        </div>

                        {item.errorMessage ? (
                          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{item.errorMessage}</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Nenhum arquivo selecionado.</p>
              )}
            </div>
          )}

          {shouldRenderInlinePreview ? (
            <DetectedFieldsPreview
              data={preview}
              errors={errors}
              onFieldChange={handleFieldChange}
              onPassengerChange={handlePassengerChange}
              onPassengerAdd={handlePassengerAdd}
              onPassengerRemove={handlePassengerRemove}
              onApply={handleSavePreview}
              onRetry={() => handleRetry(activePreviewFileId)}
              onDiscard={handleDiscard}
              isApplying={isSavingPreview}
            />
          ) : null}

          {shouldRenderInlineAdjustment && alterationResult ? (
            <AlterationPreviewPanel
              alteration={alterationResult}
              reservations={alterationMatches}
              lookupStatus={alterationLookupState}
              onApply={handleApplyAlteration}
              onRetry={() => handleRetry(activePreviewFileId)}
              onDiscard={handleDiscard}
              isApplying={isApplyingAction}
            />
          ) : null}

          {shouldRenderInlineAdjustment && !alterationResult && cancellationResult ? (
            <CancellationPreviewPanel
              cancellation={cancellationResult}
              reservations={cancellationMatches}
              lookupStatus={cancellationLookupState}
              onApply={handleApplyCancellation}
              onRetry={() => handleRetry(activePreviewFileId)}
              onDiscard={handleDiscard}
              isApplying={isApplyingAction}
            />
          ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {shouldRenderDetailModal ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 px-4 py-6 backdrop-blur-sm">
          <div className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold text-slate-900">
                  Dados extraídos{activeReservationLabel ? ` – ${activeReservationLabel}` : ''}
                </h3>
                {activeReservationLabel ? (
                  <p className="text-xs text-slate-500">Revise e edite os dados extraídos desta reserva.</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewModalOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Fechar pré-visualização"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="max-h-[calc(100vh-6rem)] overflow-y-auto px-6 py-6">
              {mode === 'initial' && hasResult ? (
                <DetectedFieldsPreview
                  data={preview}
                  errors={errors}
                  onFieldChange={handleFieldChange}
                  onPassengerChange={handlePassengerChange}
                  onPassengerAdd={handlePassengerAdd}
                  onPassengerRemove={handlePassengerRemove}
                  onApply={handleSavePreview}
                  onRetry={() => handleRetry(activePreviewFileId)}
                  onDiscard={handleDiscard}
                  isApplying={isSavingPreview}
                />
              ) : null}

              {mode === 'adjustment' && alterationResult ? (
                <AlterationPreviewPanel
                  alteration={alterationResult}
                  reservations={alterationMatches}
                  lookupStatus={alterationLookupState}
                  onApply={handleApplyAlteration}
                  onRetry={() => handleRetry(activePreviewFileId)}
                  onDiscard={handleDiscard}
                  isApplying={isApplyingAction}
                />
              ) : null}

              {mode === 'adjustment' && !alterationResult && cancellationResult ? (
                <CancellationPreviewPanel
                  cancellation={cancellationResult}
                  reservations={cancellationMatches}
                  lookupStatus={cancellationLookupState}
                  onApply={handleApplyCancellation}
                  onRetry={() => handleRetry(activePreviewFileId)}
                  onDiscard={handleDiscard}
                  isApplying={isApplyingAction}
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
