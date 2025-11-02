const rawRequireEmailConfirmation =
  process.env.NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION ??
  process.env.REQUIRE_EMAIL_CONFIRMATION ??
  'true';

export const requireEmailConfirmation = rawRequireEmailConfirmation !== 'false';

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
