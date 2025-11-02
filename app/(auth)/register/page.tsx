'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import ConfirmEmailNotice from '@/app/(auth)/components/ConfirmEmailNotice';
import { autoConfirmUserServerAction } from '@/app/(auth)/actions';
import { supabase } from '@/lib/supabaseClient';
import { requireEmailConfirmation as requireEmailConfirmationFlag } from '@/lib/env';

async function hashPassword(password: string) {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('A API de criptografia não está disponível neste navegador.');
  }

  const encoder = new TextEncoder();
  const encodedPassword = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encodedPassword);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function mapSignUpError(message: string) {
  if (message.toLowerCase().includes('user already registered')) {
    return 'Este e-mail já está em uso. Faça login ou tente recuperar a senha.';
  }

  if (message.toLowerCase().includes('password should be at least')) {
    return 'A senha deve ter no mínimo 6 caracteres.';
  }

  return 'Não foi possível criar a conta. Tente novamente.';
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [view, setView] = useState<'form' | 'confirm'>('form');
  const [confirmationEmail, setConfirmationEmail] = useState('');

  const requireConfirmation = requireEmailConfirmationFlag;

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

    const sanitizedName = name.trim();
    const sanitizedEmail = email.trim();

    if (!sanitizedName || !sanitizedEmail || !password.trim()) {
      setError('Preencha todos os campos obrigatórios.');
      return;
    }

    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    setSuccessMessage(null);

    try {
      const passwordHash = await hashPassword(password);

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: sanitizedEmail,
        password,
      });

      if (signUpError) {
        throw new Error(mapSignUpError(signUpError.message));
      }

      const userId = data.user?.id;

      if (!userId) {
        throw new Error('Não foi possível concluir o cadastro. Tente novamente.');
      }

      const { error: insertError } = await supabase.from('users').insert({
        id: userId,
        name: sanitizedName,
        email: sanitizedEmail,
        password_hash: passwordHash,
        created_at: new Date().toISOString(),
      });

      if (insertError) {
        console.error('Erro ao salvar usuário no banco de dados:', insertError);
        throw new Error('Não foi possível salvar seus dados. Tente novamente.');
      }

      if (data.session) {
        setSuccessMessage('Conta criada com sucesso! Redirecionando...');
        if (typeof window !== 'undefined') {
          window.alert('Conta criada com sucesso!');
        }
        router.replace('/dashboard');
        return;
      }

      if (!requireConfirmation) {
        const autoConfirmResult = await autoConfirmUserServerAction({
          email: sanitizedEmail,
          userId,
        });

        if (!autoConfirmResult.success) {
          throw new Error(
            autoConfirmResult.error ??
              'Não foi possível ativar sua conta automaticamente. Tente novamente.',
          );
        }

        const { error: signInAfterConfirmError } =
          await supabase.auth.signInWithPassword({
            email: sanitizedEmail,
            password,
          });

        if (signInAfterConfirmError) {
          throw new Error(
            'Sua conta foi confirmada, mas não foi possível autenticar automaticamente. Tente fazer login.',
          );
        }

        setSuccessMessage('Conta criada com sucesso! Redirecionando...');
        if (typeof window !== 'undefined') {
          window.alert('Conta criada com sucesso!');
        }

        router.replace('/dashboard');
        return;
      }

      setConfirmationEmail(sanitizedEmail);
      setView('confirm');
    } catch (signUpException) {
      const message = signUpException instanceof Error
        ? signUpException.message
        : 'Não foi possível criar a conta. Tente novamente.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        {view === 'confirm' ? (
          <ConfirmEmailNotice
            email={confirmationEmail}
            onResend={handleResendConfirmation}
            onChangeEmail={() => {
              setView('form');
              setError(null);
              setSuccessMessage(null);
            }}
          />
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-slate-900">Criar conta</h1>
            <p className="mt-2 text-sm text-slate-600">
              Cadastre-se para acessar o painel de reservas.
            </p>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-700">
                  Nome completo
                </label>
                <input
                  id="name"
                  type="text"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="Maria Silva"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError(null);
                  }}
                  required
                />
              </div>

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
                  autoComplete="new-password"
                  required
                />
              </div>

              {error ? (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              ) : null}
              {successMessage ? (
                <p className="text-sm text-green-600" role="status">
                  {successMessage}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? 'Criando conta...' : 'Cadastrar'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-600">
              Já possui uma conta?{' '}
              <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
                Faça login
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
