'use client';

import { useEffect, useState } from 'react';

import { listPasseiosByIdExterno } from '@/lib/queries/passeios';
import type { Passeio } from '@/types/supabase';

// Hook de leitura para futura UI de passeios.
export function usePasseiosByIdExterno(idExterno?: string) {
  const [data, setData] = useState<Passeio[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!idExterno) {
      setData([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    listPasseiosByIdExterno(idExterno)
      .then(setData)
      .catch((err) => {
        console.error(err);
        setError('Não foi possível carregar os passeios. Tente novamente.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [idExterno]);

  return { data, isLoading, error };
}
