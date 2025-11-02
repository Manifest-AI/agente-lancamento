'use client';

import { useEffect, useState } from 'react';

type ConfirmEmailNoticeProps = {
  email: string;
  onResend: () => Promise<void>;
  onChangeEmail?: () => void;
  title?: string;
  description?: string;
  hint?: string;
  actionLabel?: string;
  changeEmailLabel?: string;
};

type Status = {
  tone: 'success' | 'error';
  message: string;
};

const RESEND_COOLDOWN_SECONDS = 60;

export default function ConfirmEmailNotice({
  email,
  onResend,
  onChangeEmail,
  title = 'Confirme seu e-mail',
  description = `Enviamos um link para ${email}. Clique para ativar sua conta.`,
  hint = 'Dica: confira também as pastas Spam e Lixo eletrônico.',
  actionLabel = 'Reenviar link',
  changeEmailLabel = 'Trocar e-mail',
}: ConfirmEmailNoticeProps) {
  const [status, setStatus] = useState<Status | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    const interval = setInterval(() => {
      setCooldown((current) => {
        if (current <= 1) {
          clearInterval(interval);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [cooldown]);

  const handleResend = async () => {
    if (isResending || cooldown > 0) {
      return;
    }

    setIsResending(true);
    setStatus(null);

    try {
      await onResend();
      setStatus({
        tone: 'success',
        message: 'Enviamos um novo link. Ele expira em poucos minutos.',
      });
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível reenviar agora.';
      setStatus({
        tone: 'error',
        message,
      });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="space-y-5">
      <header className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-600">{description}</p>
      </header>

      <div className="space-y-4 rounded-xl border border-blue-100 bg-blue-50 p-5 text-center">
        <p className="text-sm text-slate-700">
          Não recebeu o e-mail? Nós podemos enviar novamente para <span className="font-medium">{email}</span>.
        </p>

        <button
          type="button"
          onClick={handleResend}
          disabled={isResending || cooldown > 0}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isResending
            ? 'Enviando...'
            : cooldown > 0
            ? `${actionLabel} (${cooldown}s)`
            : actionLabel}
        </button>

        {status ? (
          <p
            className={`text-sm ${status.tone === 'success' ? 'text-green-600' : 'text-red-600'}`}
            role={status.tone === 'error' ? 'alert' : 'status'}
          >
            {status.message}
          </p>
        ) : null}

        {onChangeEmail ? (
          <button
            type="button"
            onClick={onChangeEmail}
            className="text-sm font-medium text-blue-600 hover:text-blue-500"
          >
            {changeEmailLabel}
          </button>
        ) : null}
      </div>

      <p className="text-center text-xs text-slate-500">{hint}</p>
    </div>
  );
}
