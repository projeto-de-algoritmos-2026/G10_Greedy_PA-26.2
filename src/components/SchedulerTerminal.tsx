import { useState } from 'react';
import type { MissionReport } from '../domain';
import type { GameCommand, GameState } from '../game';
import { GanttChart } from './GanttChart';
import { formatNumber } from './format';

interface SchedulerTerminalProps {
  readonly state: GameState;
  readonly report: MissionReport;
  readonly dispatch: (command: GameCommand) => void;
}

/** Reordenação por botões (teclado/leitor de tela) e por arrastar-e-soltar (mouse). */
export function SchedulerTerminal({ state, report, dispatch }: SchedulerTerminalProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const editable = state.phase === 'scheduling';
  const { manual, referenceEdd } = report.compressed.schedules;
  const order = state.packetOrder;
  const timeAxisEnd = Math.max(
    manual.totalCompletionTime,
    referenceEdd.totalCompletionTime,
    ...manual.packets.map((packet) => packet.dueDate),
  );
  const delta = report.compressed.schedules.maxLatenessDelta;
  const isEddOrder = order.every((id, index) => id === referenceEdd.packets[index]?.id);

  const setOrder = (packetIds: readonly string[]) =>
    dispatch({ type: 'SET_PACKET_ORDER', packetIds });
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    if (item === undefined) return;
    next.splice(to, 0, item);
    setOrder(next);
  };

  return (
    <section className="terminal" aria-labelledby="scheduler-title">
      <h2 id="scheduler-title">Scheduler de transmissão</h2>
      <p className="assumption">
        <strong>EDD (Earliest Due Date)</strong> ordena por prazo crescente e minimiza o atraso
        máximo T<sub>max</sub> sob estas hipóteses: um único canal, todos os pacotes disponíveis em
        t = 0, sem preempção. O cabeçalho da árvore Huffman é um custo inicial comum e não altera a
        ordem EDD.
      </p>

      <h3>Ordem de transmissão</h3>
      <ol className="order-list" aria-label="Ordem de transmissão dos pacotes">
        {order.map((id, index) => (
          <li
            key={id}
            draggable={editable}
            className={dragIndex === index ? 'dragging' : undefined}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null) move(dragIndex, index);
              setDragIndex(null);
            }}
            onDragEnd={() => setDragIndex(null)}
          >
            <span className="order-id">
              {index + 1}. {id}
            </span>
            <button
              type="button"
              disabled={!editable || index === 0}
              aria-label={`Mover ${id} para cima`}
              onClick={() => move(index, index - 1)}
            >
              ↑
            </button>
            <button
              type="button"
              disabled={!editable || index === order.length - 1}
              aria-label={`Mover ${id} para baixo`}
              onClick={() => move(index, index + 1)}
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={!editable || isEddOrder}
        onClick={() => setOrder(referenceEdd.packets.map((packet) => packet.id))}
      >
        Aplicar ordem EDD
      </button>

      <h3>Comparação</h3>
      <table>
        <caption>Ordem manual × referência EDD (cenário comprimido)</caption>
        <thead>
          <tr>
            <th scope="col">Ordem</th>
            <th scope="col">
              T<sub>max</sub>
            </th>
            <th scope="col">Conclusão total</th>
            <th scope="col">No prazo</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Manual</th>
            <td>{formatNumber(manual.maxLateness)}</td>
            <td>{formatNumber(manual.totalCompletionTime)}</td>
            <td>
              {report.compressed.manualDeliveredWithinDeadline}/{report.packetCount}
            </td>
          </tr>
          <tr>
            <th scope="row">EDD (referência)</th>
            <td>{formatNumber(referenceEdd.maxLateness)}</td>
            <td>{formatNumber(referenceEdd.totalCompletionTime)}</td>
            <td>
              {report.compressed.eddDeliveredWithinDeadline}/{report.packetCount}
            </td>
          </tr>
        </tbody>
      </table>
      <p role="status">
        {delta === 0
          ? 'Sua ordem atinge o mesmo atraso máximo que EDD.'
          : `Sua ordem tem atraso máximo ${formatNumber(delta)} maior que EDD.`}
      </p>

      <GanttChart title="Ordem manual" schedule={manual} timeAxisEnd={timeAxisEnd} />
      <GanttChart title="Referência EDD" schedule={referenceEdd} timeAxisEnd={timeAxisEnd} />

      <table>
        <caption>Detalhe da ordem manual</caption>
        <thead>
          <tr>
            <th scope="col">Pacote</th>
            <th scope="col">Duração</th>
            <th scope="col">Conclusão</th>
            <th scope="col">Prazo</th>
            <th scope="col">Situação</th>
          </tr>
        </thead>
        <tbody>
          {manual.packets.map((packet) => (
            <tr key={packet.id}>
              <th scope="row">{packet.id}</th>
              <td>{formatNumber(packet.processingTime)}</td>
              <td>{formatNumber(packet.completionTime)}</td>
              <td>{formatNumber(packet.dueDate)}</td>
              <td>
                {packet.lateness > 0
                  ? `⚠ Atrasado (+${formatNumber(packet.lateness)})`
                  : '✔ No prazo'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editable && (
        <button
          type="button"
          className="primary"
          onClick={() => dispatch({ type: 'CONFIRM_SCHEDULE' })}
        >
          Confirmar ordem e transmitir
        </button>
      )}
      {state.phase === 'transmission' && (
        <button
          type="button"
          className="primary"
          onClick={() => dispatch({ type: 'COMPLETE_TRANSMISSION' })}
        >
          Concluir transmissão
        </button>
      )}
    </section>
  );
}
