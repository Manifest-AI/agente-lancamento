import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { ExtractedAlteration } from '@/lib/reservas/alteracao';
import { extractAlterationFromText } from '@/lib/reservas/alteracao';

export const runtime = 'nodejs';

type ErrorResponse = {
  ok: false;
  error: string;
  details?: Record<string, unknown>;
};

type SuccessResponse = {
  ok: true;
  data: ExtractedAlteration;
};

function makeErrorResponse(status: number, message: string, details?: Record<string, unknown>) {
  const payload: ErrorResponse = {
    ok: false,
    error: message,
    ...(details ? { details } : {}),
  };
  return NextResponse.json(payload, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    return makeErrorResponse(400, 'Corpo da requisição deve ser um JSON válido.');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return makeErrorResponse(400, 'Corpo da requisição deve ser um JSON com o campo "conteudo".');
  }

  const conteudo = typeof (body as { conteudo?: unknown }).conteudo === 'string'
    ? (body as { conteudo: string }).conteudo.trim()
    : '';

  if (!conteudo) {
    return makeErrorResponse(400, 'conteudo obrigatório');
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return makeErrorResponse(500, 'OPENAI_API_KEY não configurada.');
  }

  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  const openai = new OpenAI({ apiKey });

  try {
    const data = await extractAlterationFromText(openai, model, conteudo);
    const payload: SuccessResponse = { ok: true, data };
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    const details = error instanceof Error ? { message: error.message } : undefined;
    return makeErrorResponse(500, 'falha ao extrair alteração', details);
  }
}
