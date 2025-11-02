import { createClient } from '@supabase/supabase-js';

import { supabaseUrl } from '@/lib/env';
import {
  requireEmailConfirmationServer,
  supabaseServiceRoleKey,
} from '@/lib/env.server';

type ConfirmUserParams = {
  email?: string;
  userId?: string;
};

type ConfirmUserResult =
  | { success: true; userId: string }
  | { success: false; error: string };

function createAdminClient() {
  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured');
  }

  if (!supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function confirmUserEmail({
  email,
  userId,
}: ConfirmUserParams): Promise<ConfirmUserResult> {
  if (requireEmailConfirmationServer) {
    return {
      success: false,
      error: 'Auto confirmação desabilitada.',
    };
  }

  if (!userId && !email) {
    return {
      success: false,
      error: 'É necessário informar o usuário para confirmação automática.',
    };
  }

  const adminClient = createAdminClient();

  let targetUserId = userId ?? null;

  if (!targetUserId && email) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 100,
    });

    if (error) {
      return {
        success: false,
        error: 'Não foi possível localizar o usuário para confirmação automática.',
      };
    }

    const normalizedEmail = email.toLowerCase();
    const foundUser = data?.users?.find((user) =>
      user.email?.toLowerCase() === normalizedEmail,
    );

    if (!foundUser) {
      return {
        success: false,
        error: 'Usuário não encontrado para confirmação automática.',
      };
    }

    targetUserId = foundUser.id;
  }

  if (!targetUserId) {
    return {
      success: false,
      error: 'Usuário não encontrado para confirmação automática.',
    };
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(
    targetUserId,
    { email_confirm: true },
  );

  if (updateError) {
    return {
      success: false,
      error: 'Falha ao confirmar o usuário automaticamente.',
    };
  }

  return {
    success: true,
    userId: targetUserId,
  };
}
