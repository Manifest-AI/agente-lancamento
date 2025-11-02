'use client';

import { Upload } from 'lucide-react';

export type ImportReservaButtonProps = {
  onClick: () => void;
};

export function ImportReservaButton({ onClick }: ImportReservaButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
    >
      <Upload className="h-4 w-4" aria-hidden="true" />
      Importar reserva
    </button>
  );
}
