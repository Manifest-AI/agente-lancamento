'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import type { ReservaPreviewDraft } from '@/app/nova-reserva/mapReservaToForm';

function toDatabaseDate(value: string) {
  const [day, month, year] = value.split('/');
  if (!day || !month || !year) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

function mapClassificationToTipoPax(
  classificacao?: ReservaPreviewDraft['passageiros'][number]['classificacao'],
) {
  if (classificacao === 'A' || classificacao === 'C' || classificacao === 'I') {
    return classificacao;
  }
  return null;
}

export function buildReservationPayload(preview: ReservaPreviewDraft, userId?: string | null) {
  const basePayload = {
    operadora: preview.operadora || null,
    data_chegada: toDatabaseDate(preview.dataChegada),
    data_saida: toDatabaseDate(preview.dataSaida),
    ident: preview.ident || null,
    voo_chegada: preview.vooChegada || null,
    voo_saida: preview.vooSaida || null,
    horario_voo_chegada: preview.horarioChegada || null,
    horario_voo_saida: preview.horarioSaida || null,
    hotel: preview.hotel || null,
    numero_reserva: preview.numeroReserva || null,
    obs: null,
    user_id: userId ?? null,
  };

  return preview.passageiros.map((passageiro) => ({
    ...basePayload,
    nome_pax: passageiro?.nome || null,
    tipo_pax: mapClassificationToTipoPax(passageiro?.classificacao) || null,
  }));
}

export async function saveReservation(
  preview: ReservaPreviewDraft,
  options?: { userId?: string | null; client?: SupabaseClient },
) {
  const client = options?.client ?? supabase;
  const payload = buildReservationPayload(preview, options?.userId ?? null);

  return client.from('reservas').insert(payload);
}
