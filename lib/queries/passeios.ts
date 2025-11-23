import { supabase } from '@/lib/supabaseClient';
import type { Passeio } from '@/types/supabase';

const PASSEIOS_LOAD_ERROR = 'Não foi possível carregar os passeios. Tente novamente.';
const PASSEIOS_SAVE_ERROR = 'Não foi possível salvar o passeio. Tente novamente.';

export type CreatePasseioInput = {
  id_externo: string;
  tipo_passeio: Passeio['tipo_passeio'];
  descricao: string;
  hotel: string;
  regime: string;
  passageiros: Passeio['passageiros'];
  data_passeio: string;
  tipo_pax?: Passeio['tipo_pax'];
};

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
      id_externo: input.id_externo,
      tipo_passeio: input.tipo_passeio,
      descricao: input.descricao,
      hotel: input.hotel,
      regime: input.regime,
      passageiros: input.passageiros,
      data_passeio: input.data_passeio,
      tipo_pax: input.tipo_pax ?? null,
    })
    .select('*')
    .single();

  if (error) {
    console.error('Erro ao criar passeio', error);
    throw new Error(PASSEIOS_SAVE_ERROR);
  }

  return data as Passeio;
}
