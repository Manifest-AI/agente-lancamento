import Link from 'next/link';

export default function Page() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-slate-100 to-slate-200 p-6 text-center">
      <div className="max-w-lg rounded-2xl bg-white p-10 shadow-xl">
        <h1 className="text-3xl font-semibold text-slate-900">Agente de Lançamento</h1>
        <p className="mt-4 text-base text-slate-600">
          Sistema de autenticação com Supabase para controle de acesso às reservas.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-center text-sm font-medium text-white shadow-sm transition hover:bg-blue-500"
          >
            Acessar painel
          </Link>
          <Link
            href="/register"
            className="rounded-lg border border-slate-200 px-5 py-2.5 text-center text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Criar uma conta
          </Link>
        </div>
      </div>
    </main>
  );
}
