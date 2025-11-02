import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { ExtractedReservation } from '@/types/ocr-gpt';

export const runtime = 'nodejs';

const SYSTEM_PROMPT = `Você extrai dados de reservas (prints/sistemas de operadoras como Taípe).
Retorne SOMENTE JSON válido. Datas YYYY-MM-DD, horas HH:mm.
Campos:
- operadora
- data_chegada_bps
- data_saida_bps
- ident (BPS | AA/TR | BUE | BUE/A | BUE/T)
- voo_chegada (ex: "LA 3600")
- voo_saida (ex: "LA 3601")
- hora_chegada
- hora_saida
- hotel
- id_reserva   // use sempre o "ID Externo" quando houver
- nome         // apenas primeiro e último
- tipo         // A (>=11), C (6–10), I (<=5)
- observacao   // "Privativo" se for privativo; "" se REGULAR
Regras IDENT:
- Hotel em Porto Seguro → BPS
- Hotel em Arraial/Trancoso/Caraíva → AA/TR
- Passageiro argentino em Porto Seguro → BUE
- Argentino em Arraial → BUE/A ; em Trancoso → BUE/T
Se um campo não constar, use null. Não invente valores.`;

const SUPPORTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MODEL_TIMEOUT_MS = 25_000;
const RETRY_DELAYS_MS = [500, 1_500, 3_000];

type JsonErrorCode =
  | 'bad_request'
  | 'missing_api_key'
  | 'invalid_api_key'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'openai_invalid_response'
  | 'rate_limited'
  | 'openai_upstream_error'
  | 'internal_error';

type ErrorResponsePayload = {
  ok: false;
  error: { code: JsonErrorCode; message: string; hint?: string };
  requestId: string;
};

type SuccessResponsePayload = {
  ok: true;
  data: ExtractedReservation;
  requestId: string;
  model?: string | null;
};

function makeJsonError(
  status: number,
  code: JsonErrorCode,
  message: string,
  requestId: string,
  hint?: string,
) {
  const body: ErrorResponsePayload = {
    ok: false,
    error: hint ? { code, message, hint } : { code, message },
    requestId,
  };
  return NextResponse.json(body, { status });
}

function logRouteError(code: JsonErrorCode, requestId: string, message: string, err?: unknown) {
  const errorToLog = err ?? new Error(message);
  console.error({ requestId, route: 'ocr-gpt', code, err: errorToLog });
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
  payload: Parameters<OpenAI['chat']['completions']['create']>[0],
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  try {
    return await openai.chat.completions.create(payload, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function callModelWithRetry(
  openai: OpenAI,
  payload: Parameters<OpenAI['chat']['completions']['create']>[0],
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await callModelWithTimeout(openai, payload);
    } catch (error) {
      lastError = error;
      const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: number }).status) : undefined;
      const isAbortError = error instanceof Error && error.name === 'AbortError';
      if (isAbortError) {
        break;
      }
      if (!status || ![429, 500, 502].includes(status) || attempt === RETRY_DELAYS_MS.length - 1) {
        break;
      }
      const delay = RETRY_DELAYS_MS[attempt];
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    logRouteError('missing_api_key', requestId, 'OPENAI_API_KEY não configurada.');
    return makeJsonError(401, 'missing_api_key', 'OPENAI_API_KEY não configurada.', requestId);
  }

  const formData = await request.formData();
  const textEntry = formData.get('text');
  const fileEntry = formData.get('file');

  if (textEntry && fileEntry) {
    logRouteError('bad_request', requestId, 'Envie apenas texto ou arquivo por vez.');
    return makeJsonError(400, 'bad_request', 'Envie apenas texto ou arquivo por vez.', requestId);
  }

  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  const openai = new OpenAI({ apiKey });

  let messages: ChatCompletionMessageParam[];

  if (typeof textEntry === 'string' && textEntry.trim()) {
    messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: textEntry.trim() },
    ];
  } else if (fileEntry instanceof File) {
    const mimeType = fileEntry.type || 'application/octet-stream';
    if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
      logRouteError('unsupported_media_type', requestId, 'Formato não suportado. Utilize PNG, JPG, JPEG ou PDF.');
      return makeJsonError(415, 'unsupported_media_type', 'Formato não suportado. Utilize PNG, JPG, JPEG ou PDF.', requestId);
    }
    if (fileEntry.size > MAX_FILE_SIZE_BYTES) {
      logRouteError('payload_too_large', requestId, 'Arquivo muito grande. Limite de 10MB.');
      return makeJsonError(413, 'payload_too_large', 'Arquivo muito grande. Limite de 10MB.', requestId);
    }

    const dataUrl = await fileToDataURL(fileEntry);
    messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extraia e normalize conforme regras.' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ];
  } else {
    logRouteError('bad_request', requestId, 'Envie um texto ou arquivo válido para processamento.');
    return makeJsonError(400, 'bad_request', 'Envie um texto ou arquivo válido para processamento.', requestId);
  }

  try {
    const response = await callModelWithRetry(openai, {
      model,
      temperature: 0,
      messages,
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      logRouteError('openai_upstream_error', requestId, 'Resposta sem conteúdo do provedor de IA.');
      return makeJsonError(502, 'openai_upstream_error', 'Resposta sem conteúdo do provedor de IA.', requestId);
    }

    const jsonBlock = extractJsonBlock(content);
    if (!jsonBlock) {
      logRouteError('openai_invalid_response', requestId, 'Não foi possível localizar JSON válido na resposta.');
      return makeJsonError(422, 'openai_invalid_response', 'Não foi possível localizar JSON válido na resposta.', requestId);
    }

    let data: ExtractedReservation;
    try {
      data = JSON.parse(jsonBlock) as ExtractedReservation;
    } catch (error) {
      logRouteError('openai_invalid_response', requestId, 'Falha ao interpretar o JSON retornado pelo provedor.', error);
      return makeJsonError(422, 'openai_invalid_response', 'Falha ao interpretar o JSON retornado pelo provedor.', requestId);
    }

    const successPayload: SuccessResponsePayload = {
      ok: true,
      data,
      requestId,
      model: response.model,
    };
    return NextResponse.json(successPayload, { status: 200 });
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: number }).status) : undefined;
    const hint = error instanceof Error && error.name === 'AbortError' ? 'timeout' : undefined;

    if (hint === 'timeout') {
      logRouteError('openai_upstream_error', requestId, 'Timeout ao consultar o provedor de IA.', error);
      return makeJsonError(502, 'openai_upstream_error', 'Timeout ao consultar o provedor de IA.', requestId, 'timeout');
    }

    if (status === 401) {
      logRouteError('invalid_api_key', requestId, 'Chave da OpenAI inválida.', error);
      return makeJsonError(401, 'invalid_api_key', 'Chave da OpenAI inválida.', requestId);
    }

    if (status === 429) {
      logRouteError('rate_limited', requestId, 'Limite de requisições excedido pelo provedor de IA.', error);
      return makeJsonError(429, 'rate_limited', 'Limite de requisições excedido pelo provedor de IA.', requestId);
    }

    if (status === 500 || status === 502) {
      logRouteError('openai_upstream_error', requestId, 'Falha temporária ao consultar o provedor de IA.', error);
      return makeJsonError(502, 'openai_upstream_error', 'Falha temporária ao consultar o provedor de IA.', requestId);
    }

    if (status && status >= 400 && status < 500) {
      logRouteError('bad_request', requestId, 'Falha na solicitação ao provedor de IA.', error);
      return makeJsonError(status, 'bad_request', 'Falha na solicitação ao provedor de IA.', requestId);
    }

    logRouteError('internal_error', requestId, 'Erro interno ao processar a solicitação.', error);
    return makeJsonError(500, 'internal_error', 'Erro interno ao processar a solicitação.', requestId);
  }
}
