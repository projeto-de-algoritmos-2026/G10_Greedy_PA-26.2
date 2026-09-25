import { scheduleEarliestDueDate, scheduleInGivenOrder } from './earliestDueDate';
import type { Packet, Schedule, ScheduleComparison } from './types';

/**
 * Compara uma ordem manual de pacotes com a referência EDD calculada a partir dos mesmos
 * pacotes. Como EDD é ótimo para `T_max` (ver `scheduleEarliestDueDate`), `maxLatenessDelta`
 * nunca é negativo: a ordem manual só pode igualar ou piorar o maior atraso de referência.
 */
export function compareToEarliestDueDate(packets: readonly Packet[]): ScheduleComparison {
  const manual: Schedule = scheduleInGivenOrder(packets);
  const referenceEdd: Schedule = scheduleEarliestDueDate(packets);

  return Object.freeze({
    manual,
    referenceEdd,
    maxLatenessDelta: manual.maxLateness - referenceEdd.maxLateness,
    totalCompletionTimeDelta: manual.totalCompletionTime - referenceEdd.totalCompletionTime,
    matchesReferenceMaxLateness: manual.maxLateness === referenceEdd.maxLateness,
  });
}
