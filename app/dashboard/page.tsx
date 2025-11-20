'use client';

import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';

type SummaryMetric = {
  title: string;
  value: string;
  description: string;
  accent: string;
};

type RecentReservation = {
  passenger: string;
  route: string;
  dates: string;
  status: 'Confirmada' | 'Em análise' | 'Pendente' | 'Cancelada';
};

const summaryMetrics: SummaryMetric[] = [
  {
    title: 'Solicitar Autorização',
    value: '69',
    description: 'Novos pedidos aguardando aprovação',
    accent: 'from-amber-200 via-amber-300 to-amber-400',
  },
  {
    title: 'Pré-reserva',
    value: '45',
    description: 'Reservas em fase de pré-confirmação',
    accent: 'from-sky-200 via-sky-300 to-sky-400',
  },
  {
    title: 'Devoluções não confirmadas',
    value: '10',
    description: 'Itens que precisam da sua atenção',
    accent: 'from-rose-200 via-rose-300 to-rose-400',
  },
  {
    title: 'Pagamentos Pendentes',
    value: 'R$ 81.819,10',
    description: 'Total aguardando liquidação',
    accent: 'from-emerald-200 via-emerald-300 to-emerald-400',
  },
];

const recentReservations: RecentReservation[] = [
  {
    passenger: 'Mariana Souza',
    route: 'GRU → LIS',
    dates: '12/05/2024 · 19/05/2024',
    status: 'Confirmada',
  },
  {
    passenger: 'Lucas Andrade',
    route: 'SDU → BSB',
    dates: '08/05/2024 · 10/05/2024',
    status: 'Em análise',
  },
  {
    passenger: 'Carla Menezes',
    route: 'CNF → CDG',
    dates: '02/05/2024 · 09/05/2024',
    status: 'Pendente',
  },
  {
    passenger: 'Júlia Campos',
    route: 'GRU → MIA',
    dates: '28/04/2024 · 05/05/2024',
    status: 'Confirmada',
  },
  {
    passenger: 'Eduardo Lima',
    route: 'POA → GIG',
    dates: '25/04/2024 · 28/04/2024',
    status: 'Cancelada',
  },
];

const statusStyles: Record<RecentReservation['status'], string> = {
  Confirmada: 'text-emerald-600 bg-emerald-100/70',
  'Em análise': 'text-amber-600 bg-amber-100/70',
  Pendente: 'text-sky-600 bg-sky-100/70',
  Cancelada: 'text-rose-600 bg-rose-100/70',
};

export default function DashboardPage() {
  const { user } = useAuth();
  const displayName =
    user?.user_metadata?.full_name?.split(' ')[0] ??
    user?.user_metadata?.name?.split(' ')[0] ??
    user?.email ??
    'Usuário';

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen bg-slate-100">
        <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white px-6 py-8 shadow-lg lg:flex">
          <div className="text-lg font-semibold text-slate-900">Agente de Lançamento</div>

          <nav className="mt-10 flex flex-1 flex-col gap-1 text-sm font-medium text-slate-600">
            <Link
              href="/dashboard"
              className="rounded-xl px-3 py-2 text-slate-900 transition hover:bg-slate-50 hover:text-slate-900"
            >
              Home
            </Link>
            <Link
              href="/nova-reserva"
              className="rounded-xl px-3 py-2 transition hover:bg-slate-50 hover:text-slate-900"
            >
              Criar nova reserva
            </Link>
            <Link
              href="/reservas"
              className="rounded-xl px-3 py-2 transition hover:bg-slate-50 hover:text-slate-900"
            >
              Reservas
            </Link>
            <Link
              href="/relatorios"
              className="rounded-xl px-3 py-2 transition hover:bg-slate-50 hover:text-slate-900"
            >
              Relatórios
            </Link>
            <button
              type="button"
              className="rounded-xl px-3 py-2 text-left transition hover:bg-slate-50 hover:text-slate-900"
            >
              Perfil
            </button>
            <Link
              href="/logout"
              className="mt-auto rounded-xl px-3 py-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
            >
              Sair
            </Link>
          </nav>
        </aside>

        <main className="flex-1">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Bem-vindo(a) de volta</p>
                <h1 className="mt-1 text-3xl font-semibold text-slate-900 lg:text-4xl">Olá, {displayName} 👋</h1>
                <p className="mt-3 max-w-2xl text-sm text-slate-600">
                  Acompanhe o andamento das reservas, visualize métricas prioritárias e avance com as próximas ações
                  do dia.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/nova-reserva"
                  className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
                >
                  Criar nova reserva
                </Link>
                <Link
                  href="/reservas"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Ver todas as reservas
                </Link>
              </div>
            </div>

            <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
              <section className="space-y-8">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Atenções do dia</p>
                    <h2 className="mt-2 text-xl font-semibold text-slate-900">Resumo rápido</h2>
                    <p className="mt-2 text-sm text-slate-600">
                      Fique de olho nas autorizações pendentes e nos pagamentos para manter o fluxo operacional em dia.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Acesso rápido</p>
                    <ul className="mt-3 space-y-2 text-sm text-slate-700">
                      <li className="flex justify-between">
                        <span>Últimas aprovações</span>
                        <span className="text-slate-400">Atualizado há 2h</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Alertas de política</span>
                        <span className="text-slate-400">4 novos</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Viagens em andamento</span>
                        <span className="text-slate-400">9 passageiros</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <header className="flex flex-col gap-2 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">Reservas recentes</h2>
                      <p className="text-sm text-slate-500">Monitoramento rápido das solicitações mais atuais.</p>
                    </div>
                    <Link
                      href="/reservas"
                      className="text-sm font-semibold text-blue-600 transition hover:text-blue-500"
                    >
                      Ver todas
                    </Link>
                  </header>

                  <div className="divide-y divide-slate-200">
                    {recentReservations.map((reservation) => (
                      <div key={reservation.passenger} className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{reservation.passenger}</p>
                          <p className="text-sm text-slate-500">{reservation.route}</p>
                        </div>
                        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-6">
                          <span className="text-sm text-slate-500">{reservation.dates}</span>
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[reservation.status]}`}>
                            {reservation.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-sm font-medium text-slate-500">Aderência às políticas</p>
                    <p className="mt-4 text-3xl font-semibold text-slate-900">92%</p>
                    <p className="mt-2 text-xs text-slate-500">Meta: &gt; 85% de conformidade com políticas de viagem.</p>
                    <div className="mt-4 h-2 w-full rounded-full bg-slate-200">
                      <div className="h-full w-[92%] rounded-full bg-emerald-400" />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-sm font-medium text-slate-500">Planejamento x Despesas</p>
                    <p className="mt-4 text-3xl font-semibold text-slate-900">78%</p>
                    <p className="mt-2 text-xs text-slate-500">R$ 612.450 planejado · R$ 476.800 realizado.</p>
                    <div className="mt-4 grid grid-cols-4 gap-1">
                      {[70, 85, 60, 95].map((value) => (
                        <div key={value} className="flex h-16 items-end rounded bg-slate-100">
                          <div className="w-full rounded bg-blue-400" style={{ height: `${value}%` }} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-sm font-medium text-slate-500">Andamento dos planos</p>
                    <ul className="mt-4 space-y-3 text-sm text-slate-600">
                      <li className="flex items-center justify-between">
                        <span>Implantação LATAM</span>
                        <span className="text-emerald-600">Concluído</span>
                      </li>
                      <li className="flex items-center justify-between">
                        <span>Revisão política 2024</span>
                        <span className="text-amber-600">Em curso</span>
                      </li>
                      <li className="flex items-center justify-between">
                        <span>Negociação hotéis SP</span>
                        <span className="text-slate-500">Planejado</span>
                      </li>
                    </ul>
                  </div>
                </section>
              </section>

              <aside className="space-y-4">
                {summaryMetrics.map((metric) => (
                  <div key={metric.title} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className={`rounded-t-2xl bg-gradient-to-r ${metric.accent} p-6`}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-700/80">{metric.title}</p>
                      <p className="mt-2 text-3xl font-semibold text-slate-900">{metric.value}</p>
                    </div>
                    <p className="px-6 py-4 text-sm text-slate-600">{metric.description}</p>
                  </div>
                ))}

                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
                  <p className="text-sm font-medium text-slate-700">Precisa de suporte?</p>
                  <p className="mt-1 text-sm text-slate-500">Fale com a equipe de operações para agilizar suas demandas.</p>
                  <button
                    type="button"
                    className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                  >
                    Abrir chamado
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
