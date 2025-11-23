import {
  RESERVATIONS_DEFAULT_PAGE_SIZE,
  deleteReservation,
  fetchReservationOptions,
  fetchReservations,
  type ReservationFilters,
  type ReservationOptions,
  type ReservationRecord,
  type ReservationsSort,
  type ReservationsSortField,
} from '@/lib/queries/reservas';
import { fetchPasseioOptions, fetchPasseios, type PasseioListResult, type PasseiosSort } from '@/lib/queries/passeios';
import type { Passeio } from '@/types/supabase';

export type ReservationViewMode = 'traslados' | 'passeios' | 'ambos';

export type ReservationsViewSortField = ReservationsSortField | 'data_passeio' | 'tipo_passeio';

export type ReservationsViewSort = {
  field: ReservationsViewSortField;
  direction: 'asc' | 'desc';
};

export type ReservationTableRecord = {
  id: string;
  idExterno: string | null;
  source: 'traslado' | 'passeio' | 'ambos';
  reservation?: ReservationRecord;
  passeio?: Passeio;
  operadora?: string | null;
  regime?: string | null;
  numeroReserva?: string | null;
  nomePax?: string | null;
  ident?: string | null;
  hotel?: string | null;
  dataChegada?: string | null;
  dataSaida?: string | null;
  status?: string | null;
  createdAt?: string | null;
  dataPasseio?: string | null;
  tipoPasseio?: Passeio['tipo_passeio'] | null;
  descricaoPasseio?: string | null;
  passageiros?: Passeio['passageiros'] | null;
};

export type ReservationViewListResult = {
  data: ReservationTableRecord[];
  total: number;
};

export async function fetchOptionsByMode(mode: ReservationViewMode, userId?: string): Promise<ReservationOptions> {
  if (mode === 'passeios') {
    return fetchPasseioOptions();
  }

  if (mode === 'ambos') {
    const [reservationOptions, passeioOptions] = await Promise.all([
      fetchReservationOptions(userId),
      fetchPasseioOptions(),
    ]);

    const hotels = Array.from(new Set([...reservationOptions.hotels, ...passeioOptions.hotels]));

    return {
      operators: reservationOptions.operators,
      hotels,
    };
  }

  return fetchReservationOptions(userId);
}

function normalizeReservationExternalId(reservation: ReservationRecord): string | null {
  return reservation.numero_reserva ?? reservation.codigo_reserva ?? reservation.id ?? null;
}

function mapReservationToTableRecord(reservation: ReservationRecord): ReservationTableRecord {
  return {
    id: reservation.id,
    idExterno: normalizeReservationExternalId(reservation),
    source: 'traslado',
    reservation,
    operadora: reservation.operadora,
    regime: reservation.regime,
    numeroReserva: reservation.numero_reserva ?? reservation.codigo_reserva ?? null,
    nomePax: reservation.nome_pax ?? reservation.passageiro ?? null,
    ident: reservation.ident,
    hotel: reservation.hotel,
    dataChegada: reservation.data_chegada ?? reservation.data_voo_ida ?? null,
    dataSaida: reservation.data_saida ?? reservation.data_voo_volta ?? null,
    status: reservation.status,
    createdAt: reservation.created_at,
  };
}

function mapPasseioToTableRecord(passeio: Passeio): ReservationTableRecord {
  return {
    id: `passeio-${passeio.id}`,
    idExterno: passeio.id_externo ?? null,
    source: 'passeio',
    passeio,
    regime: passeio.regime,
    numeroReserva: passeio.id_externo,
    hotel: passeio.hotel,
    dataPasseio: passeio.data_passeio,
    tipoPasseio: passeio.tipo_passeio,
    descricaoPasseio: passeio.descricao,
    passageiros: passeio.passageiros,
    createdAt: passeio.created_at,
  };
}

function mergeRecords(reservations: ReservationRecord[], passeios: Passeio[]): ReservationTableRecord[] {
  const combined = new Map<string, ReservationTableRecord>();

  for (const reservation of reservations) {
    const record = mapReservationToTableRecord(reservation);
    const key = record.idExterno ?? record.id;
    combined.set(key, record);
  }

  for (const passeio of passeios) {
    const record = mapPasseioToTableRecord(passeio);
    const key = record.idExterno ?? record.id;
    const existing = combined.get(key);

    if (existing) {
      combined.set(key, {
        ...existing,
        source: existing.reservation ? 'ambos' : 'passeio',
        passeio,
        dataPasseio: record.dataPasseio,
        tipoPasseio: record.tipoPasseio,
        descricaoPasseio: record.descricaoPasseio,
        passageiros: record.passageiros,
        numeroReserva: existing.numeroReserva ?? record.numeroReserva,
        createdAt: existing.createdAt ?? record.createdAt,
        hotel: existing.hotel ?? record.hotel,
      });
      continue;
    }

    combined.set(key, record);
  }

  return Array.from(combined.values());
}

function getSortValue(record: ReservationTableRecord, field: ReservationsViewSortField): string {
  switch (field) {
    case 'data_chegada':
      return record.dataChegada ?? '';
    case 'data_saida':
      return record.dataSaida ?? '';
    case 'nome_pax':
      return record.nomePax ?? '';
    case 'status':
      return record.status ?? '';
    case 'data_passeio':
      return record.dataPasseio ?? '';
    case 'tipo_passeio':
      return record.tipoPasseio ?? '';
    default:
      return record.createdAt ?? '';
  }
}

function sortCombinedRecords(records: ReservationTableRecord[], sort: ReservationsViewSort) {
  return [...records].sort((a, b) => {
    const aValue = getSortValue(a, sort.field);
    const bValue = getSortValue(b, sort.field);

    if (aValue === bValue) {
      return 0;
    }

    if (sort.direction === 'asc') {
      return aValue > bValue ? 1 : -1;
    }

    return aValue < bValue ? 1 : -1;
  });
}

export async function fetchReservationsView({
  mode,
  page,
  pageSize = RESERVATIONS_DEFAULT_PAGE_SIZE,
  sort,
  filters,
  userId,
}: {
  mode: ReservationViewMode;
  page: number;
  pageSize?: number;
  sort: ReservationsViewSort;
  filters: ReservationFilters;
  userId?: string;
}): Promise<ReservationViewListResult> {
  if (mode === 'traslados') {
    const reservationSort: ReservationsSort =
      sort.field === 'data_chegada' || sort.field === 'data_saida' || sort.field === 'nome_pax' || sort.field === 'status'
        ? (sort as ReservationsSort)
        : { field: 'created_at', direction: sort.direction };

    const result = await fetchReservations({ page, pageSize, sort: reservationSort, filters, userId });

    return {
      data: result.data.map(mapReservationToTableRecord),
      total: result.total,
    };
  }

  if (mode === 'passeios') {
    const passeioSort: PasseiosSort =
      sort.field === 'data_passeio' || sort.field === 'tipo_passeio'
        ? (sort as PasseiosSort)
        : { field: 'created_at', direction: sort.direction };

    const result: PasseioListResult = await fetchPasseios({
      page,
      pageSize,
      sort: passeioSort,
      filters,
    });

    return {
      data: result.data.map(mapPasseioToTableRecord),
      total: result.total,
    };
  }

  const [reservationsResult, passeiosResult] = await Promise.all([
    fetchReservations({
      page: 1,
      pageSize: 1000,
      sort:
        sort.field === 'data_chegada' || sort.field === 'data_saida' || sort.field === 'nome_pax' || sort.field === 'status'
          ? (sort as ReservationsSort)
          : { field: 'created_at', direction: sort.direction },
      filters,
      userId,
      applyRange: false,
    }),
    fetchPasseios({
      page: 1,
      pageSize: 1000,
      sort:
        sort.field === 'data_passeio' || sort.field === 'tipo_passeio'
          ? (sort as PasseiosSort)
          : { field: 'created_at', direction: sort.direction },
      filters,
      applyRange: false,
    }),
  ]);

  const combined = mergeRecords(reservationsResult.data, passeiosResult.data);
  const sorted = sortCombinedRecords(combined, sort);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return {
    data: sorted.slice(start, end),
    total: combined.length,
  };
}

export { deleteReservation };
