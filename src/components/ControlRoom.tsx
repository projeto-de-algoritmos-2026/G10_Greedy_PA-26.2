import type { LoadedMission } from '../domain';
import type { GameState } from '../game';
import { TERMINALS, terminalStatus } from './terminals';
import type { TerminalId, TerminalStatus } from './terminals';

const STATUS_LABEL: Readonly<Record<TerminalStatus, string>> = {
  locked: 'Bloqueado',
  available: 'Disponível',
  completed: 'Concluído',
};

interface ControlRoomProps {
  readonly mission: LoadedMission;
  readonly state: GameState;
  readonly openTerminal: TerminalId | null;
  readonly onOpenTerminal: (id: TerminalId) => void;
  readonly onStartMission: () => void;
}

/** Sala única de navegação: cada terminal é um botão nativo, alcançável por Tab/Enter/Espaço. */
export function ControlRoom({
  mission,
  state,
  openTerminal,
  onOpenTerminal,
  onStartMission,
}: ControlRoomProps) {
  return (
    <section className="control-room" aria-labelledby="room-title">
      <h2 id="room-title">Sala de controle</h2>
      {state.phase === 'briefing' && (
        <div className="briefing">
          <h3>{mission.title}</h3>
          <p>{mission.briefing}</p>
          <ul>
            {mission.objectives.map((objective) => (
              <li key={objective}>{objective}</li>
            ))}
          </ul>
          <button type="button" className="primary" onClick={onStartMission}>
            Iniciar missão
          </button>
        </div>
      )}
      <ul className="hotspots">
        {TERMINALS.map((terminal) => {
          const status = terminalStatus(terminal, state);
          const locked = status === 'locked';
          const hintId = `hotspot-hint-${terminal.id}`;
          return (
            <li key={terminal.id}>
              {/* aria-disabled (e não disabled) mantém o terminal focável para leitores de tela
                  anunciarem o pré-requisito. */}
              <button
                type="button"
                className={`hotspot hotspot-${status}`}
                aria-disabled={locked}
                aria-current={openTerminal === terminal.id ? 'true' : undefined}
                aria-describedby={hintId}
                onClick={() => {
                  if (!locked) onOpenTerminal(terminal.id);
                }}
              >
                <span className="hotspot-name">{terminal.name}</span>
                <span className="hotspot-status">
                  {status === 'completed' ? '✔ ' : locked ? '🔒 ' : '● '}
                  {STATUS_LABEL[status]}
                </span>
              </button>
              <p id={hintId} className="hotspot-hint">
                {locked ? terminal.prerequisite : terminal.description}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
