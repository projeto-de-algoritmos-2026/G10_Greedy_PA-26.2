import type { Schedule } from '../algorithms/scheduling';
import { formatNumber } from './format';

interface GanttChartProps {
  readonly title: string;
  readonly schedule: Schedule;
  /** Fim do eixo de tempo, compartilhado entre gráficos para permitir comparação visual. */
  readonly timeAxisEnd: number;
}

/** Barras posicionadas exclusivamente a partir dos valores calculados pelo scheduler. */
export function GanttChart({ title, schedule, timeAxisEnd }: GanttChartProps) {
  const pct = (time: number) => `${(time / timeAxisEnd) * 100}%`;
  return (
    <figure className="gantt">
      <figcaption>
        {title} — atraso máximo T<sub>max</sub> = {formatNumber(schedule.maxLateness)}
      </figcaption>
      <ol className="gantt-rows">
        {schedule.initialTime > 0 && (
          <li className="gantt-row">
            <span className="gantt-label">cabeçalho</span>
            <span className="gantt-track">
              <span
                className="gantt-bar gantt-header"
                style={{ left: 0, width: pct(schedule.initialTime) }}
                title={`Cabeçalho Huffman: 0 → ${formatNumber(schedule.initialTime)}`}
              />
            </span>
          </li>
        )}
        {schedule.packets.map((packet) => {
          const late = packet.lateness > 0;
          return (
            <li key={packet.id} className="gantt-row">
              <span className="gantt-label">{packet.id}</span>
              <span className="gantt-track">
                <span
                  className={`gantt-bar${late ? ' gantt-late' : ''}`}
                  style={{ left: pct(packet.startTime), width: pct(packet.processingTime) }}
                  role="img"
                  aria-label={`${packet.id}: início ${formatNumber(packet.startTime)}, duração ${formatNumber(packet.processingTime)}, conclusão ${formatNumber(packet.completionTime)}, prazo ${formatNumber(packet.dueDate)}, ${late ? `atrasado em ${formatNumber(packet.lateness)}` : 'no prazo'}`}
                >
                  {late ? `⚠ +${formatNumber(packet.lateness)}` : '✔'}
                </span>
                <span
                  className="gantt-deadline"
                  style={{ left: pct(packet.dueDate) }}
                  title={`Prazo de ${packet.id}: ${formatNumber(packet.dueDate)}`}
                  aria-hidden="true"
                />
              </span>
            </li>
          );
        })}
      </ol>
      <p className="gantt-axis">
        Eixo: 0 → {formatNumber(timeAxisEnd)} unidades de tempo · linha vertical = prazo · ⚠ =
        atraso (barra hachurada)
      </p>
    </figure>
  );
}
