/** Um pacote a transmitir em um único canal, não preemptivo, disponível em t=0. */
export interface Packet {
  readonly id: string;
  /** p_j: duração de transmissão, em unidades de tempo. */
  readonly processingTime: number;
  /** d_j: prazo de entrega, na mesma unidade de tempo. */
  readonly dueDate: number;
}

/** Um pacote após o cálculo do cronograma. */
export interface ScheduledPacket extends Packet {
  /** Instante em que a transmissão começa. */
  readonly startTime: number;
  /** C_j: instante em que a transmissão termina. */
  readonly completionTime: number;
  /** T_j = max(0, C_j - d_j). */
  readonly lateness: number;
}

export interface Schedule {
  readonly packets: readonly ScheduledPacket[];
  /** T_max = max(T_j) do cronograma. */
  readonly maxLateness: number;
  /** Instante de conclusão do último pacote; equivale ao tempo total do canal. */
  readonly totalCompletionTime: number;
}

export interface ScheduleComparison {
  readonly manual: Schedule;
  readonly referenceEdd: Schedule;
  /** manual.maxLateness - referenceEdd.maxLateness; nunca negativo (EDD é ótimo para T_max). */
  readonly maxLatenessDelta: number;
  readonly totalCompletionTimeDelta: number;
  /** Verdadeiro quando a ordem manual já alcança o T_max ótimo. */
  readonly matchesReferenceMaxLateness: boolean;
}
