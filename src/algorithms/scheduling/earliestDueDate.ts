import { InvalidPacketError } from './errors';
import type { Packet, Schedule, ScheduledPacket } from './types';

function validatePackets(packets: readonly Packet[]): void {
  const seenIds = new Set<string>();
  for (const packet of packets) {
    if (packet.id.length === 0) {
      throw new InvalidPacketError('O identificador do pacote não pode ser vazio.');
    }
    if (seenIds.has(packet.id)) {
      throw new InvalidPacketError(`Identificador de pacote duplicado: ${packet.id}.`);
    }
    seenIds.add(packet.id);

    if (!Number.isFinite(packet.processingTime) || packet.processingTime <= 0) {
      throw new InvalidPacketError(
        `Duração de transmissão inválida para o pacote ${packet.id}: ${packet.processingTime}.`,
      );
    }
    if (!Number.isFinite(packet.dueDate)) {
      throw new InvalidPacketError(`Prazo inválido para o pacote ${packet.id}: ${packet.dueDate}.`);
    }
  }
}

/**
 * Ordena os pacotes por prazo (`dueDate`) não decrescente — Earliest Due Date, também
 * apresentada nos slides da disciplina como Earliest Deadline First (EDD/EDF).
 *
 * `Array.prototype.sort` é estável desde o ES2019: pacotes com o mesmo prazo preservam a ordem
 * de entrada, o que torna o desempate determinístico sem precisar de uma chave extra.
 */
export function earliestDueDateOrder(packets: readonly Packet[]): readonly Packet[] {
  validatePackets(packets);
  return Object.freeze([...packets].sort((a, b) => a.dueDate - b.dueDate));
}

/**
 * Calcula o cronograma de um único canal não preemptivo na ordem recebida.
 *
 * Todos os pacotes estão disponíveis em t=0, então o início de cada um coincide com a conclusão
 * do anterior. `T_max` é derivado dos `T_j` calculados, nunca informado separadamente.
 */
export function scheduleInGivenOrder(packets: readonly Packet[]): Schedule {
  validatePackets(packets);

  let time = 0;
  let maxLateness = 0;
  const scheduled: ScheduledPacket[] = packets.map((packet) => {
    const startTime = time;
    const completionTime = startTime + packet.processingTime;
    const lateness = Math.max(0, completionTime - packet.dueDate);
    time = completionTime;
    maxLateness = Math.max(maxLateness, lateness);
    return Object.freeze({ ...packet, startTime, completionTime, lateness });
  });

  return Object.freeze({
    packets: Object.freeze(scheduled),
    maxLateness,
    totalCompletionTime: time,
  });
}

/**
 * Aplica EDD e devolve o cronograma de referência.
 *
 * **Hipótese de otimalidade.** Para uma única máquina, com todos os pacotes disponíveis em t=0 e
 * transmissão não preemptiva, ordenar por prazo não decrescente minimiza o maior atraso
 * (`T_max`). Prova por troca (exchange argument): em qualquer cronograma ótimo que tenha dois
 * pacotes adjacentes fora de ordem de prazo (`d_i > d_j` com `i` transmitido antes de `j`),
 * trocar as posições desses dois pacotes não piora o atraso de nenhum outro pacote e não
 * aumenta o atraso do par trocado — logo existe um cronograma ótimo em ordem EDD. A compressão
 * de Huffman altera `p_j` e, portanto, `C_j` e `T_max`, mas não altera essa regra de ordenação.
 */
export function scheduleEarliestDueDate(packets: readonly Packet[]): Schedule {
  return scheduleInGivenOrder(earliestDueDateOrder(packets));
}
