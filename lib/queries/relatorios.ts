import { supabase } from '@/lib/supabaseClient';
import type { ReservationRecord } from './reservas';

export const ROAMING_LIST_PAGE_SIZE = 50;

export type RoamingListParams = {
  startDate: string;
  endDate: string;
  reportType?: 'in' | 'out' | 'both';
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

  let query = supabase.from('reservas').select('*', { count: 'exact' });

  if (reportType === 'both') {
    query = query.or(
      `and(data_chegada.gte.${startDate},data_chegada.lte.${endDate}),and(data_saida.gte.${startDate},data_saida.lte.${endDate})`,
    );
  } else {
    const dateField = reportType === 'out' ? 'data_saida' : 'data_chegada';
    query = query.gte(dateField, startDate).lte(dateField, endDate);
  }

  if (userId) {
    query = query.eq('user_id', userId);
  }

  query = query.limit(10000);

  const { data, error, count } = await query;

  if (error) {
    throw error;
  }

  const regimeOrder = (regime: string | null) => {
    const normalized = regime?.trim().toUpperCase();
    if (normalized === 'PRIVATIVO') return 0;
    if (normalized === 'REGULAR') return 1;
    return 2;
  };

  const parseDateTime = (date: string | null | undefined, time: string | null | undefined) => {
    if (!date) return null;
    const timeValue = time?.trim() || '00:00';
    const parsed = Date.parse(`${date}T${timeValue}`);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const buildSortTimestamps = (reservation: ReservationRecord) => {
    const arrival = parseDateTime(reservation.data_chegada, reservation.horario_voo_chegada);
    const departure = parseDateTime(reservation.data_saida, reservation.horario_voo_saida);

    if (reportType === 'in') {
      return { primary: arrival };
    }

    if (reportType === 'out') {
      return { primary: departure };
    }

    return { primary: arrival ?? departure, secondary: departure ?? arrival };
  };

  const compareTimestamps = (a: number | null | undefined, b: number | null | undefined) => {
    if (a === b) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return a - b;
  };

  const sortedData = (data ?? []).sort((first, second) => {
    const regimeDiff = regimeOrder(first.regime) - regimeOrder(second.regime);
    if (regimeDiff !== 0) {
      return regimeDiff;
    }

    const operatorDiff = (first.operadora ?? '').localeCompare(second.operadora ?? '', 'pt-BR', {
      sensitivity: 'base',
    });
    if (operatorDiff !== 0) {
      return operatorDiff;
    }

    const { primary: firstPrimary, secondary: firstSecondary } = buildSortTimestamps(first);
    const { primary: secondPrimary, secondary: secondSecondary } = buildSortTimestamps(second);

    const primaryDiff = compareTimestamps(firstPrimary, secondPrimary);
    if (primaryDiff !== 0) {
      return primaryDiff;
    }

    return compareTimestamps(firstSecondary, secondSecondary);
  });

  const paginatedData = sortedData.slice(from, to + 1);

  return {
    data: paginatedData,
    total: count ?? sortedData.length,
  };
}
