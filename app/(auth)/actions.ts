'use server';

import { confirmUserEmail } from '@/lib/server/confirmUserEmail';

export async function autoConfirmUserServerAction({
  email,
  userId,
}: {
  email?: string;
  userId?: string;
}) {
  try {
    return await confirmUserEmail({ email, userId });
  } catch (error) {
    console.error('Erro ao confirmar usuário automaticamente:', error);
    return {
      success: false as const,
      error: 'Não foi possível confirmar o usuário automaticamente.',
    };
  }
}
