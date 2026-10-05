import { scheduleEarliestDueDate, scheduleInGivenOrder, timeDifference } from './earliestDueDate';
import type { Packet, Schedule, ScheduleComparison, ScheduleOptions } from './types';

/**
 * Compara uma ordem manual de pacotes com a referência EDD calculada a partir dos mesmos
 * pacotes. Como EDD é ótimo para `T_max` (ver `scheduleEarliestDueDate`), `maxLatenessDelta`
 * nunca é negativo: a ordem manual só pode igualar ou piorar o maior atraso de referência.
 * As diferenças usam `timeDifference` para que essa garantia não seja quebrada pelo
 * arredondamento de somas feitas em ordens diferentes.
 */
export function compareToEarliestDueDate(
  packets: readonly Packet[],
  options: ScheduleOptions = {},
): ScheduleComparison {
  const manual: Schedule = scheduleInGivenOrder(packets, options);
  const referenceEdd: Schedule = scheduleEarliestDueDate(packets, options);

  const scale = manual.totalCompletionTime;
  const maxLatenessDelta = timeDifference(manual.maxLateness, referenceEdd.maxLateness, scale);
  return Object.freeze({
    manual,
    referenceEdd,
    maxLatenessDelta,
    totalCompletionTimeDelta: timeDifference(
      manual.totalCompletionTime,
      referenceEdd.totalCompletionTime,
      scale,
    ),
    matchesReferenceMaxLateness: maxLatenessDelta === 0,
  });
}
