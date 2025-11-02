'use client';

import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';

export default function ReservasPage() {
  return (
    <ProtectedRoute>
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-12">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Reservas</h1>
            <p className="text-sm text-slate-600">Consulte e acompanhe suas reservas cadastradas.</p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Voltar ao painel
          </Link>
        </header>

        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          Em breve você verá a lista de reservas nesta área.
        </div>
      </main>
    </ProtectedRoute>
  );
}
