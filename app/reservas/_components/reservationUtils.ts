export type StatusVariant =
  | 'Confirmada'
  | 'Em análise'
  | 'Pendente'
  | 'Cancelada'
  | 'Reembolsada'
  | 'Finalizada'
  | string;

const statusStyles: Record<string, string> = {
  Confirmada: 'bg-emerald-100/80 text-emerald-700',
  'Em análise': 'bg-amber-100/80 text-amber-700',
  Pendente: 'bg-sky-100/80 text-sky-700',
  Cancelada: 'bg-rose-100/80 text-rose-700',
  Cancelado: 'bg-rose-100/80 text-rose-700',
  Reembolsada: 'bg-purple-100/80 text-purple-700',
  Finalizada: 'bg-slate-200 text-slate-700',
  Ativo: 'bg-emerald-100/80 text-emerald-700',
};

export function getStatusStyle(status: StatusVariant) {
  return statusStyles[status] ?? 'bg-slate-200 text-slate-700';
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '-';
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}/${month}/${year}`;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    return trimmed;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function formatTime(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  if (/^\d{2}:\d{2}$/.test(value)) {
    return value;
  }

  if (/^\d{2}:\d{2}:\d{2}$/.test(value)) {
    return value.slice(0, 5);
  }

  const date = new Date(`1970-01-01T${value}`);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
