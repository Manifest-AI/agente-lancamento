import { supabase } from '@/lib/supabaseClient';
import type { ReservationRecord } from './reservas';

export const ROAMING_LIST_PAGE_SIZE = 50;

export type RoamingListParams = {
  startDate: string;
  endDate: string;
  page?: number;
  pageSize?: number;
  userId?: string;
};

export type RoamingListResult = {
  data: ReservationRecord[];
  total: number;
};

export async function fetchRoamingList({
  startDate,
  endDate,
  page = 1,
  pageSize = ROAMING_LIST_PAGE_SIZE,
  userId,
}: RoamingListParams): Promise<RoamingListResult> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('reservas')
    .select('*', { count: 'exact' })
    .gte('data_chegada', startDate)
    .lte('data_chegada', endDate);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  query = query
    .order('operadora', { ascending: true, nullsFirst: false })
    .order('data_chegada', { ascending: true, nullsFirst: false })
    .order('horario_voo_chegada', { ascending: true, nullsFirst: true })
    .range(from, to);

  const { data, error, count } = await query;

  if (error) {
    throw error;
  }

  return {
    data: data ?? [],
    total: count ?? 0,
  };
}
