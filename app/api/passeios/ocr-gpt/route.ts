import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import type { ExtractedPasseio } from '@/types/ocr-gpt';
import { normalizeExtractedPasseio, type NormalizedPasseio } from '@/lib/passeios/normalizePasseio';
import { PROMPT_PASSEIOS_SYSTEM } from '@/lib/passeios/prompt';

export const runtime = 'nodejs';

const SUPPORTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MODEL_TIMEOUT_MS = 25_000;
const RETRY_DELAYS_MS = [500, 1_500, 3_000];

type ErrorResponsePayload = {
  ok: false;
  error: { code: string; message: string; hint?: string };
  requestId: string;
};

type SuccessResponsePayload = {
  ok: true;
  data: NormalizedPasseio;
  requestId: string;
  model?: string | null;
};

function makeJsonError(status: number, code: string, message: string, requestId: string, hint?: string) {
  const body: ErrorResponsePayload = { ok: false, error: hint ? { code, message, hint } : { code, message }, requestId };
  return NextResponse.json(body, { status });
}

function extractJsonBlock(text: string) {
  const start = text.indexOf('{');
  if (start === -1) {
    return null;
  }
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }
  return null;
}

async function fileToDataURL(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');
  const mimeType = file.type || 'application/octet-stream';
  return `data:${mimeType};base64,${base64}`;
}

async function callModelWithTimeout(
  openai: OpenAI,
  payload: ChatCompletionCreateParamsNonStreaming,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);

  try {
    return await openai.chat.completions.create({ ...payload, stream: false }, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function extractPasseioFromFile(openai: OpenAI, model: string, file: File) {
  const dataUrl = await fileToDataURL(file);

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: PROMPT_PASSEIOS_SYSTEM },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Leia o documento de PASSEIO enviado e retorne apenas o JSON solicitado.' },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    },
  ];

  const response = await callModelWithTimeout(openai, { model, temperature: 0, messages });
  const content = response.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('Resposta sem conteúdo do provedor de IA.');
  }

  const jsonBlock = extractJsonBlock(content);
  if (!jsonBlock) {
    throw new Error('Não foi possível localizar JSON válido na resposta.');
  }

  try {
    const extracted = JSON.parse(jsonBlock) as ExtractedPasseio;
    return { extracted, model: response.model ?? null };
  } catch (error) {
    throw new Error('Falha ao interpretar o JSON retornado pelo provedor.');
  }
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return makeJsonError(500, 'missing_api_key', 'OPENAI_API_KEY não configurada.', requestId);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    return makeJsonError(400, 'invalid_form', 'Corpo da requisição deve ser multipart/form-data.', requestId);
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return makeJsonError(400, 'bad_request', 'Campo "file" é obrigatório.', requestId);
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return makeJsonError(413, 'payload_too_large', 'Arquivo maior que 10 MB.', requestId);
  }

  if (!SUPPORTED_MIME_TYPES.includes(file.type)) {
    return makeJsonError(415, 'unsupported_media_type', 'Formato não suportado (use PNG, JPG ou PDF).', requestId);
  }

  const model = process.env.OPENAI_VISION_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  const openai = new OpenAI({ apiKey });

  let extracted: ExtractedPasseio;
  let modelName: string | null = null;

  try {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        const result = await extractPasseioFromFile(openai, model, file);
        extracted = result.extracted;
        modelName = result.model;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Erro desconhecido na extração.');
        const delay = RETRY_DELAYS_MS[attempt];
        if (!delay) {
          throw lastError;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  } catch (error) {
    console.error({ requestId, route: 'passeios/ocr-gpt', error });
    const message = error instanceof Error ? error.message : 'Falha ao extrair dados do passeio.';
    return makeJsonError(502, 'openai_error', message, requestId);
  }

  let normalized: NormalizedPasseio;
  try {
    normalized = normalizeExtractedPasseio(extracted!);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Dados de passeio inválidos.';
    return makeJsonError(400, 'invalid_payload', message, requestId);
  }

  const payload: SuccessResponsePayload = { ok: true, data: normalized, requestId, model: modelName };
  return NextResponse.json(payload, { status: 200 });
}
