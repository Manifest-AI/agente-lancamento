import { supabase } from '@/lib/supabaseClient';
import type { ReservationFilters } from '@/lib/queries/reservas';
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

export type PasseiosSortField = 'data_passeio' | 'created_at' | 'tipo_passeio';

export type PasseiosSort = {
  field: PasseiosSortField;
  direction: 'asc' | 'desc';
};

export type PasseioListParams = {
  page: number;
  pageSize?: number;
  sort?: PasseiosSort;
  filters?: ReservationFilters;
  applyRange?: boolean;
};

export type PasseioListResult = {
  data: Passeio[];
  total: number;
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

export async function fetchPasseios({
  page,
  pageSize = 20,
  sort = { field: 'created_at', direction: 'desc' },
  filters = {},
  applyRange = true,
}: PasseioListParams): Promise<PasseioListResult> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from('passeios').select('*', { count: 'exact' });

  if (filters.query && filters.query.trim()) {
    const sanitizedQuery = filters.query.trim();
    const likeValue = `%${sanitizedQuery}%`;
    query = query.or(
      [
        `id_externo.ilike.${likeValue}`,
        `descricao.ilike.${likeValue}`,
        `hotel.ilike.${likeValue}`,
        `regime.ilike.${likeValue}`,
        `tipo_passeio.ilike.${likeValue}`,
        `passageiros::text.ilike.${likeValue}`,
      ].join(','),
    );
  }

  if (filters.hotel) {
    query = query.eq('hotel', filters.hotel);
  }

  if (filters.ident) {
    query = query.ilike('id_externo', `%${filters.ident}%`);
  }

  if (filters.startDate || filters.endDate) {
    const start = filters.startDate ?? '1900-01-01';
    const end = filters.endDate ?? '9999-12-31';
    query = query.gte('data_passeio', start).lte('data_passeio', end);
  }

  query = query.order(sort.field, { ascending: sort.direction === 'asc', nullsFirst: false });

  if (applyRange) {
    query = query.range(from, to);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('Erro ao buscar passeios com filtros', error);
    throw new Error(PASSEIOS_LOAD_ERROR);
  }

  return {
    data: data ?? [],
    total: count ?? 0,
  };
}

export async function fetchPasseioOptions(): Promise<{ operators: string[]; hotels: string[] }> {
  const hotelsQuery = supabase.from('passeios').select('hotel').order('hotel');
  const { data, error } = await hotelsQuery;

  if (error) {
    throw error;
  }

  const hotels = (data ?? [])
    .map((item) => item.hotel)
    .filter((value): value is string => Boolean(value))
    .filter((value, index, array) => array.indexOf(value) === index);

  return { operators: [], hotels };
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
