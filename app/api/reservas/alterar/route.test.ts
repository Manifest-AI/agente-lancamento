import { describe, expect, it } from 'vitest';
import type { ReservationRecord } from '@/lib/queries/reservas';
import type { ReservationPassengerChange } from '@/types/reservation-adjustments';
import { applyPassengerSwaps, preparePassengerSwaps } from './route';

function createReservation(id: string, name: string): ReservationRecord {
  return {
    id,
    user_id: 'user-1',
    passageiro: name,
    nome_pax: name,
    operadora: 'Operadora',
    ident: 'BPS',
    numero_reserva: 'ABC123',
    hotel: 'Hotel',
    origem: 'Origem',
    destino: 'Destino',
    cia_aerea: 'CIA',
    data_voo_ida: '2024-01-01',
    hora_voo_ida: '12:00',
    data_voo_volta: null,
    hora_voo_volta: null,
    data_chegada: null,
    data_saida: null,
    voo_chegada: null,
    voo_saida: null,
    horario_voo_chegada: null,
    horario_voo_saida: null,
    status: 'ATIVO',
    codigo_reserva: 'COD123',
    localizador: null,
    tipo_pax: 'A',
    obs: null,
    created_at: '2024-01-01T00:00:00Z',
  };
}

class FakeUpdateManager {
  records: Map<string, ReservationRecord>;
  history: { id: string; payload: Record<string, string> }[] = [];

  constructor(reservations: ReservationRecord[]) {
    this.records = new Map(reservations.map((reservation) => [reservation.id, reservation]));
  }

  async update(target: ReservationRecord, payload: Record<string, string>) {
    const nextName = payload.nome_pax;

    if (nextName) {
      for (const [id, reservation] of this.records.entries()) {
        if (id !== target.id && reservation.nome_pax === nextName) {
          return { error: { message: 'duplicate key value violates unique constraint "reservas_nome_pax"' } };
        }
      }
    }

    const current = this.records.get(target.id);
    if (current) {
      this.records.set(target.id, { ...current, ...payload });
    }

    this.history.push({ id: target.id, payload });

    return { error: null };
  }
}

describe('preparePassengerSwaps', () => {
  const reservations = [
    createReservation('1', 'Alice'),
    createReservation('2', 'Bob'),
    createReservation('3', 'Carol'),
  ];

  it('rejects swaps that collide with remaining passengers', () => {
    const removePassengers: ReservationPassengerChange[] = [{ nome: 'Alice', quantidade: 1 }];
    const addPassengers: ReservationPassengerChange[] = [{ nome: 'Carol', quantidade: 1 }];

    const result = preparePassengerSwaps(reservations, removePassengers, addPassengers);

    expect('error' in result && result.error.status).toBe(400);
    expect('error' in result && result.error.message).toContain('já está em uso');
  });

  it('rejects swaps with duplicated final names', () => {
    const removePassengers: ReservationPassengerChange[] = [
      { nome: 'Alice', quantidade: 1 },
      { nome: 'Bob', quantidade: 1 },
    ];
    const addPassengers: ReservationPassengerChange[] = [
      { nome: 'Carol', quantidade: 1 },
      { nome: 'Carol', quantidade: 1 },
    ];

    const result = preparePassengerSwaps(reservations, removePassengers, addPassengers);

    expect('error' in result && result.error.status).toBe(400);
    expect('error' in result && result.error.message).toContain('Nomes duplicados');
  });
});

describe('applyPassengerSwaps', () => {
  it('performs circular swap without transient collisions', async () => {
    const reservations = [
      createReservation('1', 'Alice'),
      createReservation('2', 'Bob'),
      createReservation('3', 'Carol'),
    ];

    const removePassengers: ReservationPassengerChange[] = [
      { nome: 'Alice', quantidade: 1 },
      { nome: 'Bob', quantidade: 1 },
    ];
    const addPassengers: ReservationPassengerChange[] = [
      { nome: 'Bob', quantidade: 1 },
      { nome: 'Alice', quantidade: 1 },
    ];

    const preparation = preparePassengerSwaps(reservations, removePassengers, addPassengers);
    if ('error' in preparation) {
      throw new Error('Expected swap preparation to succeed');
    }

    const manager = new FakeUpdateManager(reservations);
    const swapResult = await applyPassengerSwaps(preparation.pairs, (target, payload) => manager.update(target, payload), 'ABC123');

    expect(swapResult).toEqual({ success: true });

    const finalNames = Array.from(manager.records.values()).map((record) => record.nome_pax);
    expect(new Set(finalNames).size).toBe(finalNames.length);
    expect(finalNames).toEqual(['Bob', 'Alice', 'Carol']);

    const temporaryUpdates = manager.history.slice(0, preparation.pairs.length);
    temporaryUpdates.forEach(({ payload }) => {
      expect(payload.nome_pax).toMatch(/__swap__/);
    });
  });
});
