'use client';

import { useEffect, useState } from 'react';

import { listPasseiosByReservaId } from '@/lib/queries/passeios';
import type { Passeio } from '@/types/supabase';

// Hook de leitura para futura UI de passeios integrada às reservas.
export function usePasseiosByReservaId(reservaId?: string) {
  const [data, setData] = useState<Passeio[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reservaId) {
      setData([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    listPasseiosByReservaId(reservaId)
      .then(setData)
      .catch((err) => {
        console.error(err);
        setError('Não foi possível carregar os passeios. Tente novamente.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [reservaId]);

  return { data, isLoading, error };
}
