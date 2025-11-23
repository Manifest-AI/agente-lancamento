import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { ExtractedPasseio } from '@/types/ocr-gpt';
import { normalizeExtractedPasseio, type NormalizedPasseio } from '@/lib/passeios/normalizePasseio';
import { PROMPT_PASSEIOS_SYSTEM } from '@/lib/passeios/prompt';

export const runtime = 'nodejs';

type ErrorResponse = {
  ok: false;
  error: string;
  message: string;
  requestId: string;
};

type SuccessResponse = {
  ok: true;
  data: NormalizedPasseio;
  requestId: string;
  model?: string | null;
};

function makeError(status: number, error: string, message: string, requestId: string) {
  const payload: ErrorResponse = { ok: false, error, message, requestId };
  return NextResponse.json(payload, { status });
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

async function extractPasseioFromText(openai: OpenAI, model: string, conteudo: string) {
  const userContent = ['Leia o texto de passeio delimitado a seguir e devolva apenas o JSON solicitado.', '<<<PASSEIO>>>', conteudo, '<<<FIM>>>'].join('\n');

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: PROMPT_PASSEIOS_SYSTEM },
    { role: 'user', content: userContent },
  ];

  const response = await openai.chat.completions.create({
    model,
    temperature: 0,
    messages,
  });

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
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    return makeError(400, 'invalid_json', 'Corpo da requisição deve ser um JSON válido.', requestId);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return makeError(400, 'invalid_body', 'Corpo da requisição deve ser um JSON com o campo "conteudo".', requestId);
  }

  const conteudo = typeof (body as { conteudo?: unknown }).conteudo === 'string'
    ? (body as { conteudo: string }).conteudo.trim()
    : '';

  if (!conteudo) {
    return makeError(400, 'missing_content', 'O campo "conteudo" é obrigatório e não pode ser vazio.', requestId);
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return makeError(500, 'missing_api_key', 'OPENAI_API_KEY não configurada.', requestId);
  }

  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  const openai = new OpenAI({ apiKey });

  let extracted: ExtractedPasseio;
  let modelName: string | null = null;

  try {
    const result = await extractPasseioFromText(openai, model, conteudo);
    extracted = result.extracted;
    modelName = result.model;
  } catch (error) {
    console.error({ requestId, route: 'passeios/ingest', error });
    return makeError(500, 'openai_error', 'Falha ao extrair dados do passeio.', requestId);
  }

  let normalized: NormalizedPasseio;
  try {
    normalized = normalizeExtractedPasseio(extracted);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Dados de passeio inválidos.';
    return makeError(400, 'invalid_payload', message, requestId);
  }

  const payload: SuccessResponse = { ok: true, data: normalized, requestId, model: modelName };
  return NextResponse.json(payload, { status: 200 });
}
