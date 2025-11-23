import { supabase } from '@/lib/supabaseClient';

export const RESERVATIONS_DEFAULT_PAGE_SIZE = 20;

export type ReservationRecord = {
  id: string;
  user_id?: string | null;
  passageiro: string | null;
  nome_pax?: string | null;
  id_externo?: string | null;
  operadora: string | null;
  ident: string | null;
  numero_reserva?: string | null;
  hotel: string | null;
  origem: string | null;
  destino: string | null;
  cia_aerea: string | null;
  data_voo_ida: string | null;
  hora_voo_ida: string | null;
  data_voo_volta?: string | null;
  hora_voo_volta?: string | null;
  data_chegada?: string | null;
  data_saida?: string | null;
  voo_chegada?: string | null;
  voo_saida?: string | null;
  horario_voo_chegada?: string | null;
  horario_voo_saida?: string | null;
  regime?: string | null;
  status: string | null;
  codigo_reserva: string | null;
  localizador?: string | null;
  tipo_pax?: string | null;
  obs?: string | null;
  created_at: string;
};

export type ReservationsSortField =
  | 'data_chegada'
  | 'data_saida'
  | 'created_at'
  | 'nome_pax'
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
  data: ReservationListItem[];
  total: number;
};

export type PasseioPassenger = {
  nome: string;
  tipo_pax: 'ADT' | 'CHD' | 'INF' | string;
};

export type PasseioListItem = {
  id: string;
  id_externo: string;
  data_passeio: string | null;
  descricao: string | null;
  hotel: string | null;
  regime: string | null;
  passageiros: PasseioPassenger[];
  tipo_passeio: string;
  created_at: string;
};

export type ReservationListItem = {
  id: string;
  id_externo: string;
  operadora: string | null;
  regime: string | null;
  numero_reserva: string | null;
  hotel: string | null;
  data_chegada: string | null;
  data_saida: string | null;
  status: string | null;
  nome_pax: string | null;
  passageiro: string | null;
  ident: string | null;
  created_at: string;
  itens: Array<({ tipo: 'RESERVA' } & ReservationRecord) | ({ tipo: 'PASSEIO' } & PasseioListItem)>;
  isPasseioSolo: boolean;
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

  let query = supabase.from('reservas').select('*');

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

  const [reservasResponse, passeiosResponse] = await Promise.all([
    query,
    supabase.from('passeios').select('*'),
  ]);

  if (reservasResponse.error) {
    throw reservasResponse.error;
  }

  if (passeiosResponse.error) {
    throw passeiosResponse.error;
  }

  const reservas = (reservasResponse.data ?? []) as ReservationRecord[];
  const passeios = (passeiosResponse.data ?? []).map((passeio) => ({
    ...passeio,
    passageiros: Array.isArray(passeio.passageiros)
      ? (passeio.passageiros as PasseioPassenger[]).filter((pax) => Boolean(pax.nome))
      : [],
  })) as PasseioListItem[];

  const grouped = new Map<string, ReservationListItem>();

  const ensureGroup = (idExterno: string, seed?: Partial<ReservationListItem>) => {
    const existing = grouped.get(idExterno);
    if (existing) {
      const merged: ReservationListItem = {
        ...existing,
        ...seed,
        itens: seed?.itens ? seed.itens : existing.itens,
      };
      grouped.set(idExterno, merged);
      return merged;
    }

    const created: ReservationListItem = {
      id: `passeio-${idExterno}`,
      id_externo: idExterno,
      operadora: seed?.operadora ?? null,
      regime: seed?.regime ?? null,
      numero_reserva: seed?.numero_reserva ?? idExterno,
      hotel: seed?.hotel ?? null,
      data_chegada: seed?.data_chegada ?? null,
      data_saida: seed?.data_saida ?? null,
      status: seed?.status ?? null,
      nome_pax: seed?.nome_pax ?? null,
      passageiro: seed?.passageiro ?? null,
      ident: seed?.ident ?? null,
      created_at: seed?.created_at ?? new Date().toISOString(),
      itens: seed?.itens ?? [],
      isPasseioSolo: true,
    };

    grouped.set(idExterno, created);
    return created;
  };

  reservas.forEach((reserva) => {
    const idExterno = reserva.id_externo ?? reserva.numero_reserva ?? reserva.id;
    const current = ensureGroup(idExterno);

    const reservaItem = { tipo: 'RESERVA' as const, ...reserva };
    const updatedItens = [reservaItem, ...current.itens.filter((item) => item.tipo !== 'RESERVA')];

    grouped.set(idExterno, {
      ...current,
      id: reserva.id,
      id_externo: idExterno,
      operadora: reserva.operadora,
      regime: reserva.regime ?? current.regime,
      numero_reserva: reserva.numero_reserva ?? current.numero_reserva,
      hotel: reserva.hotel ?? current.hotel,
      data_chegada: reserva.data_chegada ?? current.data_chegada,
      data_saida: reserva.data_saida ?? current.data_saida,
      status: reserva.status ?? current.status,
      nome_pax: reserva.nome_pax ?? reserva.passageiro ?? current.nome_pax,
      passageiro: reserva.passageiro ?? current.passageiro,
      ident: reserva.ident ?? current.ident,
      created_at: reserva.created_at ?? current.created_at,
      itens: updatedItens,
      isPasseioSolo: false,
    });
  });

  passeios.forEach((passeio) => {
    const current = ensureGroup(passeio.id_externo, {
      hotel: passeio.hotel ?? undefined,
      regime: passeio.regime ?? undefined,
      created_at: passeio.created_at,
      nome_pax: passeio.passageiros?.[0]?.nome ?? undefined,
      passageiro: passeio.passageiros?.[0]?.nome ?? undefined,
    });

    const passeioItem = { tipo: 'PASSEIO' as const, ...passeio };

    const createdAt = passeio.created_at ?? current.created_at;
    const earliestCreated = new Date(createdAt) < new Date(current.created_at) ? createdAt : current.created_at;

    grouped.set(passeio.id_externo, {
      ...current,
      hotel: current.hotel ?? passeio.hotel,
      regime: current.regime ?? passeio.regime,
      numero_reserva: current.numero_reserva ?? passeio.id_externo,
      nome_pax: current.nome_pax ?? passeio.passageiros?.[0]?.nome ?? null,
      passageiro: current.passageiro ?? passeio.passageiros?.[0]?.nome ?? null,
      data_chegada: current.data_chegada ?? passeio.data_passeio ?? null,
      data_saida: current.data_saida ?? passeio.data_passeio ?? null,
      created_at: earliestCreated,
      itens: [...current.itens, passeioItem],
    });
  });

  const matchesFilters = (item: ReservationListItem) => {
    const normalizedQuery = filters.query?.trim().toLowerCase();

    if (normalizedQuery) {
      const inTopFields = [
        item.operadora,
        item.numero_reserva,
        item.id_externo,
        item.hotel,
        item.nome_pax,
        item.passageiro,
        item.ident,
      ].some((field) => field?.toLowerCase().includes(normalizedQuery));

      const inPasseios = item.itens
        .filter((entry) => entry.tipo === 'PASSEIO')
        .some((entry) => {
          const passeio = entry as PasseioListItem & { tipo: 'PASSEIO' };
          return [passeio.descricao, passeio.hotel, passeio.regime, passeio.id_externo]
            .filter(Boolean)
            .some((field) => (field as string).toLowerCase().includes(normalizedQuery));
        });

      if (!inTopFields && !inPasseios) {
        return false;
      }
    }

    if (filters.operadora && (item.operadora ?? '').toLowerCase() !== filters.operadora.toLowerCase()) {
      return false;
    }

    if (filters.hotel) {
      const matchesHotel =
        (item.hotel ?? '').toLowerCase() === filters.hotel.toLowerCase() ||
        item.itens
          .filter((entry) => entry.tipo === 'PASSEIO')
          .some((entry) => (entry.hotel ?? '').toLowerCase() === filters.hotel?.toLowerCase());

      if (!matchesHotel) {
        return false;
      }
    }

    if (filters.ident) {
      const identMatches = (item.ident ?? '').toLowerCase().includes(filters.ident.toLowerCase());
      const idExternoMatches = item.id_externo.toLowerCase().includes(filters.ident.toLowerCase());

      if (!identMatches && !idExternoMatches) {
        return false;
      }
    }

    if (filters.startDate || filters.endDate) {
      const start = filters.startDate ? Date.parse(filters.startDate) : null;
      const end = filters.endDate ? Date.parse(filters.endDate) : null;

      const relevantDates: (string | null | undefined)[] = [item.data_chegada, item.data_saida];

      item.itens
        .filter((entry) => entry.tipo === 'PASSEIO')
        .forEach((entry) => {
          relevantDates.push((entry as PasseioListItem & { tipo: 'PASSEIO' }).data_passeio);
        });

      const matchesDate = relevantDates.some((date) => {
        if (!date) return false;
        const parsed = Date.parse(date);
        if (Number.isNaN(parsed)) return false;

        if (start != null && parsed < start) return false;
        if (end != null && parsed > end) return false;
        return true;
      });

      if (!matchesDate) {
        return false;
      }
    }

    return true;
  };

  const data = Array.from(grouped.values()).filter(matchesFilters);

  const getComparableDate = (value: string | null | undefined) => {
    if (!value) return null;
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : timestamp;
  };

  const getSortValue = (item: ReservationListItem, field: ReservationsSortField) => {
    if (field === 'data_chegada') {
      return getComparableDate(item.data_chegada) ??
        item.itens
          .filter((entry) => entry.tipo === 'PASSEIO')
          .map((entry) => getComparableDate((entry as PasseioListItem & { tipo: 'PASSEIO' }).data_passeio))
          .find((value) => value != null) ?? null;
    }

    if (field === 'data_saida') {
      return getComparableDate(item.data_saida) ??
        item.itens
          .filter((entry) => entry.tipo === 'PASSEIO')
          .map((entry) => getComparableDate((entry as PasseioListItem & { tipo: 'PASSEIO' }).data_passeio))
          .find((value) => value != null) ?? null;
    }

    if (field === 'created_at') {
      return getComparableDate(item.created_at);
    }

    if (field === 'nome_pax') {
      return (item.nome_pax ?? item.passageiro ?? '').toLowerCase();
    }

    if (field === 'status') {
      return (item.status ?? '').toLowerCase();
    }

    return null;
  };

  const sorted = data.sort((first, second) => {
    const firstValue = getSortValue(first, sort.field);
    const secondValue = getSortValue(second, sort.field);

    if (typeof firstValue === 'number' && typeof secondValue === 'number') {
      return firstValue - secondValue;
    }

    const firstString = (firstValue ?? '').toString();
    const secondString = (secondValue ?? '').toString();

    const diff = firstString.localeCompare(secondString, 'pt-BR', { sensitivity: 'base' });
    return diff;
  });

  if (sort.direction === 'desc') {
    sorted.reverse();
  }

  const paginated = sorted.slice(from, to + 1);

  return {
    data: paginated,
    total: sorted.length,
  };
}

export type ReservationOptions = {
  operators: string[];
  hotels: string[];
};

export async function fetchReservationOptions(userId?: string): Promise<ReservationOptions> {
  let operatorsQuery = supabase.from('reservas').select('operadora').order('operadora');
  let hotelsQuery = supabase.from('reservas').select('hotel').order('hotel');
  const passeiosHotelsQuery = supabase.from('passeios').select('hotel').order('hotel');

  if (userId) {
    operatorsQuery = operatorsQuery.eq('user_id', userId);
    hotelsQuery = hotelsQuery.eq('user_id', userId);
  }

  const [operatorsResponse, hotelsResponse, passeiosHotelsResponse] = await Promise.all([
    operatorsQuery,
    hotelsQuery,
    passeiosHotelsQuery,
  ]);

  if (operatorsResponse.error) {
    throw operatorsResponse.error;
  }

  if (hotelsResponse.error) {
    throw hotelsResponse.error;
  }

  if (passeiosHotelsResponse.error) {
    throw passeiosHotelsResponse.error;
  }

  const operators = (operatorsResponse.data ?? [])
    .map((item) => item.operadora)
    .filter((value): value is string => Boolean(value))
    .filter((value, index, array) => array.indexOf(value) === index);

  const hotels = [...(hotelsResponse.data ?? []), ...(passeiosHotelsResponse.data ?? [])]
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

export type UpdateReservationPayload = Partial<
  Pick<
    ReservationRecord,
    | 'operadora'
    | 'data_chegada'
    | 'data_saida'
    | 'ident'
    | 'voo_chegada'
    | 'voo_saida'
    | 'horario_voo_chegada'
    | 'horario_voo_saida'
    | 'hotel'
    | 'numero_reserva'
    | 'status'
    | 'nome_pax'
    | 'regime'
  >
>;

export async function updateReservation(
  id: string,
  payload: UpdateReservationPayload,
  userId?: string,
): Promise<ReservationRecord> {
  let query = supabase.from('reservas').update(payload).eq('id', id);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query.select('*').single();

  if (error) {
    throw error;
  }

  return data as ReservationRecord;
}
