'use client';

import type { LoggerMessage } from 'tesseract.js';

export type OcrProgressUpdate = {
  status: string;
  progress: number;
};

export type OcrOptions = {
  onProgress?: (update: OcrProgressUpdate) => void;
  languages?: string;
};

export async function ocrImage(file: File, options: OcrOptions = {}): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('OCR só está disponível no client.');
  }

  const { onProgress, languages = 'por+eng' } = options;

  const { default: Tesseract } = await import('tesseract.js');

  const { data } = await Tesseract.recognize(file, languages, {
    logger(message: LoggerMessage) {
      if (onProgress) {
        onProgress({ status: message.status, progress: message.progress ?? 0 });
      }
    },
  });

  return data.text.trim();
}
