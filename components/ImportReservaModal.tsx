'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { FileText, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { DetectedFieldsPreview } from './DetectedFieldsPreview';
import type { ReservaFieldKey, ReservaFields, ReservaExtractionResult } from '@/lib/extractors/reserva';
import { extractReservaFromText } from '@/lib/extractors/reserva';
import { ocrImage, type OcrProgressUpdate } from '@/lib/ocr';

export type ImportReservaModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (fields: ReservaFields) => void;
  onNotify?: (payload: { type: 'success' | 'error'; message: string }) => void;
};

const defaultConfidence: Record<ReservaFieldKey, number> = {
  passengerName: 0,
  document: 0,
  passengerType: 0,
  airline: 0,
  origin: 0,
  destination: 0,
  departureDate: 0,
  departureTime: 0,
  returnDate: 0,
  returnTime: 0,
  reservationCode: 0,
  hotel: 0,
  operator: 0,
  ident: 0,
  notes: 0,
};

const MAX_FILE_SIZE_MB = 10;

function formatFileSize(bytes: number) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(1)} ${units[index]}`;
}

export function ImportReservaModal({ isOpen, onClose, onApply, onNotify }: ImportReservaModalProps) {
  const [activeTab, setActiveTab] = useState<'text' | 'image'>('text');
  const [textInput, setTextInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<OcrProgressUpdate | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [extractionResult, setExtractionResult] = useState<ReservaExtractionResult | null>(null);
  const [editableFields, setEditableFields] = useState<ReservaFields>({});
  const [confidence, setConfidence] = useState<Record<ReservaFieldKey, number>>(defaultConfidence);

  const hasResult = useMemo(() => Boolean(extractionResult), [extractionResult]);
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

  useEffect(() => {
    if (extractionResult) {
      setEditableFields(extractionResult.fields);
      setConfidence(extractionResult.confidence);
    }
  }, [extractionResult]);

  const resetState = useCallback(() => {
    setActiveTab('text');
    setTextInput('');
    setSelectedFile(null);
    setFilePreviewUrl(null);
    setIsProcessing(false);
    setProgress(null);
    setErrorMessage(null);
    setExtractionResult(null);
    setEditableFields({});
    setConfidence(defaultConfidence);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const handleTabChange = (tab: 'text' | 'image') => {
    setActiveTab(tab);
    setErrorMessage(null);
  };

  const runExtraction = useCallback(
    (text: string) => {
      const result = extractReservaFromText(text);
      setExtractionResult(result);
      const detectedValues = Object.values(result.fields).filter((value) => Boolean(value && value.trim()));
      if (!detectedValues.length) {
        setErrorMessage('Não encontramos campos válidos. Ajuste o conteúdo e tente novamente.');
      } else {
        setErrorMessage(null);
      }
    },
    [],
  );

  const handleExtractFromText = async () => {
    const trimmed = textInput.trim();
    if (!trimmed) {
      setErrorMessage('Cole o conteúdo completo do e-mail de confirmação.');
      setExtractionResult(null);
      return;
    }

    setIsProcessing(true);
    try {
      runExtraction(trimmed);
    } catch (error) {
      console.error('Erro ao processar texto', error);
      setErrorMessage('Não foi possível analisar o texto informado.');
      setExtractionResult(null);
    } finally {
      setIsProcessing(false);
    }
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
    setProgress(null);
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

  const handleExtractFromImage = async () => {
    if (!selectedFile) {
      setErrorMessage('Selecione um arquivo de imagem ou PDF.');
      return;
    }

    setIsProcessing(true);
    setProgress(null);
    setErrorMessage(null);

    try {
      const text = await ocrImage(selectedFile, {
        onProgress(update) {
          setProgress(update);
        },
      });

      if (!text) {
        setErrorMessage('Não foi possível ler o arquivo enviado.');
        setExtractionResult(null);
        return;
      }

      runExtraction(text);
    } catch (error) {
      console.error('Erro no OCR', error);
      setErrorMessage('Não foi possível processar o arquivo. Tente novamente.');
      setExtractionResult(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditableFieldChange = (key: ReservaFieldKey, value: string) => {
    setEditableFields((previous) => ({ ...previous, [key]: value }));
  };

  const handleApplyToForm = () => {
    onApply(editableFields);
    onNotify?.({ type: 'success', message: 'Campos aplicados ao formulário. Revise antes de salvar.' });
    handleClose();
  };

  const handleRetry = () => {
    setExtractionResult(null);
    setEditableFields({});
    setConfidence(defaultConfidence);
    setErrorMessage(null);
    setProgress(null);
  };

  const hasPreview = Boolean(filePreviewUrl && selectedFile && selectedFile.type.startsWith('image/'));
  const isPdf = selectedFile?.type === 'application/pdf';

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4 py-6 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Importar reserva</h2>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Beta</span>
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
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
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
                    <p className="text-slate-700">
                      Arraste e solte o arquivo aqui
                    </p>
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
                      <p className="text-xs text-slate-500">{formatFileSize(selectedFile.size)}</p>
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
                      <img src={filePreviewUrl} alt="Pré-visualização do arquivo" className="h-48 w-full object-contain bg-slate-100" />
                    </div>
                  )}

                  {isPdf && (
                    <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
                      Pré-visualização indisponível para PDF. O OCR utilizará a primeira página do arquivo.
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

              {progress && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  <p className="font-medium text-slate-700">{progress.status}</p>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all"
                      style={{ width: `${Math.min(100, Math.round((progress.progress ?? 0) * 100))}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {hasResult && (
            <DetectedFieldsPreview
              fields={editableFields}
              confidence={confidence}
              onChange={handleEditableFieldChange}
              onApply={handleApplyToForm}
              onRetry={handleRetry}
              onDiscard={handleClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}
