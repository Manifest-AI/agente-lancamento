import { supabase } from '@/lib/supabaseClient';

export const RESERVATIONS_DEFAULT_PAGE_SIZE = 20;

export type ReservationRecord = {
  id: string;
  user_id?: string | null;
  passageiro: string | null;
  operadora: string | null;
  ident: string | null;
  hotel: string | null;
  origem: string | null;
  destino: string | null;
  cia_aerea: string | null;
  data_voo_ida: string | null;
  hora_voo_ida: string | null;
  data_voo_volta?: string | null;
  hora_voo_volta?: string | null;
  status: string | null;
  codigo_reserva: string | null;
  localizador?: string | null;
  created_at: string;
};

export type ReservationsSortField =
  | 'data_voo_ida'
  | 'created_at'
  | 'passageiro'
  | 'status';

export type ReservationsSort = {
  field: ReservationsSortField;
  direction: 'asc' | 'desc';
};

export type ReservationFilters = {
  query?: string;
  operadora?: string;
  hotel?: string;
  ident?: string;
  startDate?: string; // ISO date string (yyyy-mm-dd)
  endDate?: string; // ISO date string (yyyy-mm-dd)
};

export type ReservationsListParams = {
  page: number;
  pageSize?: number;
  sort?: ReservationsSort;
  filters?: ReservationFilters;
  userId?: string;
};

export type ReservationsListResult = {
  data: ReservationRecord[];
  total: number;
};

export async function fetchReservations({
  page,
  pageSize = RESERVATIONS_DEFAULT_PAGE_SIZE,
  sort = { field: 'created_at', direction: 'desc' },
  filters = {},
  userId,
}: ReservationsListParams): Promise<ReservationsListResult> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from('reservas').select('*', { count: 'exact' });

  if (userId) {
    query = query.eq('user_id', userId);
  }

  if (filters.query && filters.query.trim()) {
    const sanitizedQuery = filters.query.trim();
    const likeValue = `%${sanitizedQuery}%`;
    query = query.or(
      ['passageiro', 'codigo_reserva', 'ident', 'localizador']
        .map((field) => `${field}.ilike.${likeValue}`)
        .join(','),
    );
  }

  if (filters.operadora) {
    query = query.eq('operadora', filters.operadora);
  }

  if (filters.hotel) {
    query = query.eq('hotel', filters.hotel);
  }

  if (filters.ident) {
    query = query.ilike('ident', `%${filters.ident}%`);
  }

  if (filters.startDate || filters.endDate) {
    const start = filters.startDate ?? '1900-01-01';
    const end = filters.endDate ?? '9999-12-31';
    const orConditions = [
      `and(data_voo_ida.gte.${start},data_voo_ida.lte.${end})`,
      `and(created_at.gte.${start},created_at.lte.${end})`,
    ];

    query = query.or(orConditions.join(','));
  }

  query = query.order(sort.field, { ascending: sort.direction === 'asc', nullsFirst: false });
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    throw error;
  }

  return {
    data: data ?? [],
    total: count ?? 0,
  };
}

export type ReservationOptions = {
  operators: string[];
  hotels: string[];
};

export async function fetchReservationOptions(userId?: string): Promise<ReservationOptions> {
  let operatorsQuery = supabase.from('reservas').select('operadora').order('operadora');
  let hotelsQuery = supabase.from('reservas').select('hotel').order('hotel');

  if (userId) {
    operatorsQuery = operatorsQuery.eq('user_id', userId);
    hotelsQuery = hotelsQuery.eq('user_id', userId);
  }

  const [operatorsResponse, hotelsResponse] = await Promise.all([operatorsQuery, hotelsQuery]);

  if (operatorsResponse.error) {
    throw operatorsResponse.error;
  }

  if (hotelsResponse.error) {
    throw hotelsResponse.error;
  }

  const operators = (operatorsResponse.data ?? [])
    .map((item) => item.operadora)
    .filter((value): value is string => Boolean(value))
    .filter((value, index, array) => array.indexOf(value) === index);

  const hotels = (hotelsResponse.data ?? [])
    .map((item) => item.hotel)
    .filter((value): value is string => Boolean(value))
    .filter((value, index, array) => array.indexOf(value) === index);

  return { operators, hotels };
}

export async function deleteReservation(id: string, userId?: string) {
  let query = supabase.from('reservas').delete().eq('id', id);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { error } = await query;

  if (error) {
    throw error;
  }
}
