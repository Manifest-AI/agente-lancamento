export const rawRequireEmailConfirmation =
  process.env.REQUIRE_EMAIL_CONFIRMATION ??
  process.env.NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION ??
  'true';

export const requireEmailConfirmationServer = rawRequireEmailConfirmation !== 'false';

export const internalApiSecret = process.env.INTERNAL_API_SECRET ?? '';

export const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export const nodeEnv = process.env.NODE_ENV ?? 'development';
