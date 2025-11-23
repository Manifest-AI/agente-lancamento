import { supabase } from '@/lib/supabaseClient';
import type { Passeio } from '@/types/supabase';

const PASSEIOS_LOAD_ERROR = 'Não foi possível carregar os passeios. Tente novamente.';
const PASSEIOS_SAVE_ERROR = 'Não foi possível salvar o passeio. Tente novamente.';

export type CreatePasseioInput = {
  reserva_id?: string | null;
  id_externo: string;
  tipo_passeio: Passeio['tipo_passeio'];
  descricao: string;
  hotel: string;
  regime: string;
  passageiros: Passeio['passageiros'];
  data_passeio: string;
};

// Funções de passeios para futura integração com OCR e telas dedicadas.
export async function listPasseiosByReservaId(reservaId: string): Promise<Passeio[]> {
  const { data, error } = await supabase
    .from('passeios')
    .select('*')
    .eq('reserva_id', reservaId)
    .order('data_passeio', { ascending: true });

  if (error) {
    console.error('Erro ao buscar passeios por reserva', error);
    throw new Error(PASSEIOS_LOAD_ERROR);
  }

  return data ?? [];
}

export async function listPasseiosByIdExterno(idExterno: string): Promise<Passeio[]> {
  const { data, error } = await supabase
    .from('passeios')
    .select('*')
    .eq('id_externo', idExterno)
    .order('data_passeio', { ascending: true });

  if (error) {
    console.error('Erro ao buscar passeios por identificador externo', error);
    throw new Error(PASSEIOS_LOAD_ERROR);
  }

  return data ?? [];
}

export async function createPasseio(input: CreatePasseioInput): Promise<Passeio> {
  const { data, error } = await supabase
    .from('passeios')
    .insert({
      reserva_id: input.reserva_id ?? null,
      id_externo: input.id_externo,
      tipo_passeio: input.tipo_passeio,
      descricao: input.descricao,
      hotel: input.hotel,
      regime: input.regime,
      passageiros: input.passageiros,
      data_passeio: input.data_passeio,
    })
    .select('*')
    .single();

  if (error) {
    console.error('Erro ao criar passeio', error);
    throw new Error(PASSEIOS_SAVE_ERROR);
  }

  return data as Passeio;
}

export async function linkPasseiosToReservaByIdExterno(reservaId: string, idExterno: string): Promise<Passeio[]> {
  const { data, error } = await supabase
    .from('passeios')
    .update({ reserva_id: reservaId })
    .eq('id_externo', idExterno)
    .is('reserva_id', null)
    .select('*')
    .order('data_passeio', { ascending: true });

  if (error) {
    console.error('Erro ao vincular passeios a uma reserva', error);
    throw new Error('Não foi possível atualizar os passeios. Tente novamente.');
  }

  return data ?? [];
}
