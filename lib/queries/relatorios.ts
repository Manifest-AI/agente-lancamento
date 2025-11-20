import { supabase } from '@/lib/supabaseClient';
import type { ReservationRecord } from './reservas';

export const ROAMING_LIST_PAGE_SIZE = 50;

export type RoamingListParams = {
  startDate: string;
  endDate: string;
  reportType?: 'in' | 'out';
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
  reportType = 'in',
  page = 1,
  pageSize = ROAMING_LIST_PAGE_SIZE,
  userId,
}: RoamingListParams): Promise<RoamingListResult> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const dateField = reportType === 'out' ? 'data_saida' : 'data_chegada';
  const timeField = reportType === 'out' ? 'horario_voo_saida' : 'horario_voo_chegada';

  let query = supabase
    .from('reservas')
    .select('*', { count: 'exact' })
    .gte(dateField, startDate)
    .lte(dateField, endDate);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  query = query
    .order('operadora', { ascending: true, nullsFirst: false })
    .order(dateField, { ascending: true, nullsFirst: false })
    .order(timeField, { ascending: true, nullsFirst: true })
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
