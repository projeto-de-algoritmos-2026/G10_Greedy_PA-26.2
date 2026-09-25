import { describe, expect, it } from 'vitest';
import {
  earliestDueDateOrder,
  scheduleEarliestDueDate,
  scheduleInGivenOrder,
} from './earliestDueDate';
import { InvalidPacketError } from './errors';
import { compareToEarliestDueDate } from './metrics';
import type { Packet } from './types';

const packet = (id: string, processingTime: number, dueDate: number): Packet =>
  Object.freeze({ id, processingTime, dueDate });

/** Gera todas as permutações de um array pequeno (força bruta, usada só em teste). */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) => {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    return permutations(rest).map((tail) => [item, ...tail]);
  });
}

describe('earliestDueDateOrder', () => {
  it('ordena os pacotes por prazo não decrescente', () => {
    const packets = [packet('c', 3, 10), packet('a', 1, 2), packet('b', 2, 5)];

    expect(earliestDueDateOrder(packets).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('desempata prazos iguais pela ordem de entrada', () => {
    const packets = [packet('first', 4, 10), packet('second', 1, 10), packet('third', 2, 5)];

    expect(earliestDueDateOrder(packets).map((p) => p.id)).toEqual(['third', 'first', 'second']);
  });

  it('não modifica o array de entrada', () => {
    const packets = [packet('b', 1, 5), packet('a', 1, 1)];
    const original = [...packets];

    earliestDueDateOrder(packets);

    expect(packets).toEqual(original);
  });
});

describe('scheduleInGivenOrder', () => {
  it('calcula início, conclusão e atraso cumulativos para cada pacote', () => {
    const packets = [packet('a', 3, 2), packet('b', 2, 4), packet('c', 4, 5)];

    const schedule = scheduleInGivenOrder(packets);

    expect(schedule.packets).toEqual([
      { id: 'a', processingTime: 3, dueDate: 2, startTime: 0, completionTime: 3, lateness: 1 },
      { id: 'b', processingTime: 2, dueDate: 4, startTime: 3, completionTime: 5, lateness: 1 },
      { id: 'c', processingTime: 4, dueDate: 5, startTime: 5, completionTime: 9, lateness: 4 },
    ]);
    expect(schedule.totalCompletionTime).toBe(9);
  });

  it('nunca produz atraso negativo, mesmo quando o pacote termina antes do prazo', () => {
    const schedule = scheduleInGivenOrder([packet('a', 1, 100)]);

    expect(schedule.packets[0]?.lateness).toBe(0);
    expect(schedule.maxLateness).toBe(0);
  });

  it('deriva o maior atraso do cronograma calculado, não de um valor separado', () => {
    const packets = [packet('a', 5, 1), packet('b', 1, 100), packet('c', 3, 2)];

    const schedule = scheduleInGivenOrder(packets);
    const expectedMax = Math.max(...schedule.packets.map((p) => p.lateness));

    expect(schedule.maxLateness).toBe(expectedMax);
  });

  it('produz um cronograma vazio para nenhum pacote', () => {
    const schedule = scheduleInGivenOrder([]);

    expect(schedule.packets).toEqual([]);
    expect(schedule.maxLateness).toBe(0);
    expect(schedule.totalCompletionTime).toBe(0);
  });

  it('rejeita duração de transmissão inválida', () => {
    expect(() => scheduleInGivenOrder([packet('a', 0, 5)])).toThrowError(InvalidPacketError);
    expect(() => scheduleInGivenOrder([packet('a', -1, 5)])).toThrowError(InvalidPacketError);
    expect(() => scheduleInGivenOrder([packet('a', Number.NaN, 5)])).toThrowError(
      InvalidPacketError,
    );
  });

  it('rejeita prazo não finito', () => {
    expect(() => scheduleInGivenOrder([packet('a', 1, Number.POSITIVE_INFINITY)])).toThrowError(
      InvalidPacketError,
    );
  });

  it('rejeita identificador vazio ou duplicado', () => {
    expect(() => scheduleInGivenOrder([packet('', 1, 5)])).toThrowError(InvalidPacketError);
    expect(() => scheduleInGivenOrder([packet('a', 1, 5), packet('a', 2, 6)])).toThrowError(
      InvalidPacketError,
    );
  });
});

describe('scheduleEarliestDueDate', () => {
  it('trata conjuntos vazio e unitário', () => {
    expect(scheduleEarliestDueDate([])).toEqual({
      packets: [],
      maxLateness: 0,
      totalCompletionTime: 0,
    });

    const singleton = scheduleEarliestDueDate([packet('only', 4, 3)]);
    expect(singleton.packets).toEqual([
      {
        id: 'only',
        processingTime: 4,
        dueDate: 3,
        startTime: 0,
        completionTime: 4,
        lateness: 1,
      },
    ]);
    expect(singleton.maxLateness).toBe(1);
  });

  it('agenda os pacotes na ordem EDD e calcula o cronograma resultante', () => {
    const packets = [packet('late', 2, 10), packet('urgent', 3, 4)];

    const schedule = scheduleEarliestDueDate(packets);

    expect(schedule.packets.map((p) => p.id)).toEqual(['urgent', 'late']);
    expect(schedule.packets[0]).toMatchObject({ startTime: 0, completionTime: 3, lateness: 0 });
    expect(schedule.packets[1]).toMatchObject({ startTime: 3, completionTime: 5, lateness: 0 });
  });

  it('minimiza o maior atraso frente a todas as 720 permutações de seis pacotes', () => {
    const packets = [
      packet('p1', 5, 8),
      packet('p2', 2, 3),
      packet('p3', 7, 20),
      packet('p4', 1, 5),
      packet('p5', 4, 12),
      packet('p6', 3, 9),
    ];

    const orders = permutations(packets);
    const distinctOrders = new Set(orders.map((order) => order.map(({ id }) => id).join(',')));
    const eddMaxLateness = scheduleEarliestDueDate(packets).maxLateness;
    const candidateMaxLatenesses = orders.map((order) => scheduleInGivenOrder(order).maxLateness);

    expect(orders).toHaveLength(720);
    expect(distinctOrders.size).toBe(720);
    expect(candidateMaxLatenesses.every((lateness) => lateness >= eddMaxLateness)).toBe(true);
    expect(eddMaxLateness).toBe(Math.min(...candidateMaxLatenesses));
  });
});

describe('compareToEarliestDueDate', () => {
  it('reporta uma ordem manual pior que a referência EDD', () => {
    const packets = [packet('late', 2, 10), packet('urgent', 3, 4)];

    const comparison = compareToEarliestDueDate(packets);

    expect(comparison.manual.maxLateness).toBeGreaterThan(comparison.referenceEdd.maxLateness);
    expect(comparison.maxLatenessDelta).toBeGreaterThan(0);
    expect(comparison.matchesReferenceMaxLateness).toBe(false);
  });

  it('reporta igualdade quando a ordem manual já é EDD', () => {
    const packets = [packet('urgent', 3, 4), packet('late', 2, 10)];

    const comparison = compareToEarliestDueDate(packets);

    expect(comparison.maxLatenessDelta).toBe(0);
    expect(comparison.matchesReferenceMaxLateness).toBe(true);
  });

  it('nunca produz um delta de maior atraso negativo, para qualquer ordem', () => {
    const packets = [
      packet('p1', 5, 8),
      packet('p2', 2, 3),
      packet('p3', 7, 20),
      packet('p4', 1, 5),
      packet('p5', 4, 12),
    ];

    for (const order of permutations(packets)) {
      expect(compareToEarliestDueDate(order).maxLatenessDelta).toBeGreaterThanOrEqual(0);
    }
  });
});
