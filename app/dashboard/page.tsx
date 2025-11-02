'use client';

import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <ProtectedRoute>
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-12">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Painel</h1>
            <p className="text-sm text-slate-600">Bem-vindo(a), {user?.email}</p>
          </div>
          <Link
            href="/logout"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Sair
          </Link>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <Link
            href="/nova-reserva"
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-200 hover:shadow-md"
          >
            <h2 className="text-xl font-semibold text-slate-900">Nova reserva</h2>
            <p className="mt-2 text-sm text-slate-600">
              Cadastre uma nova reserva no sistema.
            </p>
          </Link>

          <Link
            href="/reservas"
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-200 hover:shadow-md"
          >
            <h2 className="text-xl font-semibold text-slate-900">Minhas reservas</h2>
            <p className="mt-2 text-sm text-slate-600">
              Consulte e gerencie reservas existentes.
            </p>
          </Link>
        </section>
      </main>
    </ProtectedRoute>
  );
}
