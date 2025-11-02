import { NextRequest, NextResponse } from 'next/server';

import { confirmUserEmail } from '@/lib/server/confirmUserEmail';
import {
  internalApiSecret,
  nodeEnv,
  requireEmailConfirmationServer,
} from '@/lib/env.server';

type AutoConfirmPayload = {
  email?: string;
  user_id?: string;
  userId?: string;
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;

const rateLimitStore = new Map<string, { count: number; expiresAt: number }>();

function getClientIdentifier(request: NextRequest) {
  return (
    request.ip ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

function isRateLimited(identifier: string) {
  const entry = rateLimitStore.get(identifier);
  const now = Date.now();

  if (!entry || entry.expiresAt < now) {
    rateLimitStore.set(identifier, {
      count: 1,
      expiresAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return false;
  }

  entry.count += 1;

  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  rateLimitStore.set(identifier, entry);
  return false;
}

export async function POST(request: NextRequest) {
  if (nodeEnv === 'production' && requireEmailConfirmationServer) {
    return NextResponse.json(
      { error: 'Confirmação automática desabilitada em produção.' },
      { status: 403 },
    );
  }

  if (!internalApiSecret) {
    return NextResponse.json(
      { error: 'INTERNAL_API_SECRET não configurado.' },
      { status: 500 },
    );
  }

  const providedSecret = request.headers.get('x-internal-api-secret');

  if (providedSecret !== internalApiSecret) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const clientIdentifier = getClientIdentifier(request);

  if (isRateLimited(clientIdentifier)) {
    return NextResponse.json(
      { error: 'Limite de requisições excedido.' },
      { status: 429 },
    );
  }

  let payload: AutoConfirmPayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Corpo da requisição inválido.' },
      { status: 400 },
    );
  }

  const { email, user_id, userId } = payload ?? {};

  const result = await confirmUserEmail({
    email,
    userId: user_id ?? userId,
  });

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true, userId: result.userId });
}
