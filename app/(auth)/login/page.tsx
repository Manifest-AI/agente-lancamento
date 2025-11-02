'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import ConfirmEmailNotice from '@/app/(auth)/components/ConfirmEmailNotice';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabaseClient';

function mapSignInError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes('invalid login credentials')) {
    return 'E-mail ou senha inválidos.';
  }

  if (normalized.includes('email not confirmed') || normalized.includes('must confirm your email')) {
    return 'confirm-email';
  }

  return 'Não foi possível entrar. Tente novamente.';
}

export default function LoginPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmNotice, setShowConfirmNotice] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState('');

  useEffect(() => {
    if (user) {
      router.replace('/dashboard');
    }
  }, [router, user]);

  const handleResendConfirmation = async () => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: confirmationEmail,
    });

    if (error) {
      if (error.message.toLowerCase().includes('rate limit')) {
        throw new Error('Você solicitou muitos envios. Aguarde alguns minutos.');
      }

      throw new Error('Não foi possível reenviar agora. Tente novamente em instantes.');
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const sanitizedEmail = email.trim();

    if (!sanitizedEmail || !password.trim()) {
      setError('Preencha e-mail e senha para continuar.');
      return;
    }

    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }

    setError(null);
    setShowConfirmNotice(false);
    setIsSubmitting(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: sanitizedEmail,
        password,
      });

      if (signInError) {
        const mappedError = mapSignInError(signInError.message);

        if (mappedError === 'confirm-email') {
          setConfirmationEmail(sanitizedEmail);
          setShowConfirmNotice(true);
          return;
        }

        setError(mappedError);
        return;
      }

      router.replace('/dashboard');
    } catch (signInException) {
      const message = signInException instanceof Error
        ? signInException.message
        : 'Não foi possível entrar. Tente novamente.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-semibold text-slate-900">Entrar</h1>
        <p className="mt-2 text-sm text-slate-600">
          Acesse sua conta para gerenciar reservas.
        </p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="nome@email.com"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError(null);
                setShowConfirmNotice(false);
              }}
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Senha
            </label>
            <input
              id="password"
              type="password"
              className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="mínimo de 6 caracteres"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
              }}
              autoComplete="current-password"
              required
            />
          </div>

          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        {showConfirmNotice ? (
          <div className="mt-8">
            <ConfirmEmailNotice
              email={confirmationEmail}
              onResend={handleResendConfirmation}
              onChangeEmail={() => {
                setShowConfirmNotice(false);
                setError(null);
              }}
              title="Confirme seu e-mail para entrar"
              description="Sua conta ainda não foi ativada. Reenvie a confirmação para continuar."
              actionLabel="Reenviar confirmação"
            />
          </div>
        ) : null}

        <p className="mt-6 text-center text-sm text-slate-600">
          Ainda não tem conta?{' '}
          <Link href="/register" className="font-medium text-blue-600 hover:text-blue-500">
            Cadastre-se
          </Link>
        </p>
      </div>
    </main>
  );
}
