import { useEffect, useRef } from 'react';
import type { MissionReport } from '../domain';
import type { GameCommand, GameState, HuffmanProgress, MissionCatalogEntry } from '../game';
import { ControlRoom } from './ControlRoom';
import { HuffmanTerminal } from './HuffmanTerminal';
import { MissionReportTerminal } from './MissionReportTerminal';
import { SchedulerTerminal } from './SchedulerTerminal';
import { TERMINALS } from './terminals';
import type { TerminalId } from './terminals';

interface MissionViewProps {
  readonly entry: MissionCatalogEntry;
  readonly state: GameState;
  readonly huffmanProgress: HuffmanProgress;
  readonly report: MissionReport | null;
  readonly error: string | null;
  readonly openTerminal: TerminalId | null;
  /** Missão oficial liberada pela conclusão desta, se houver. */
  readonly nextMissionTitle: string | null;
  readonly onOpenTerminal: (id: TerminalId | null) => void;
  readonly onOpenMissions: () => void;
  readonly dispatch: (command: GameCommand) => void;
}

/** Sala de controle e terminais de uma missão; todo o estado vem de fora, já calculado. */
export function MissionView({
  entry,
  state,
  huffmanProgress,
  report,
  error,
  openTerminal,
  nextMissionTitle,
  onOpenTerminal,
  onOpenMissions,
  dispatch,
}: MissionViewProps) {
  const { mission } = entry;
  const terminalWorkspaceRef = useRef<HTMLDivElement>(null);
  const lastTerminalRef = useRef<TerminalId | null>(null);
  const terminal = TERMINALS.find((candidate) => candidate.id === openTerminal);

  useEffect(() => {
    if (openTerminal !== null) {
      lastTerminalRef.current = openTerminal;
      terminalWorkspaceRef.current?.focus();
      return;
    }

    const lastTerminal = lastTerminalRef.current;
    if (lastTerminal !== null) {
      document.querySelector<HTMLElement>(`[data-terminal-id="${lastTerminal}"]`)?.focus();
      lastTerminalRef.current = null;
    }
  }, [openTerminal]);

  const restartMission = () => {
    // O terminal é fechado: seleções feitas nele referenciam nós que o reinício descarta, e
    // sem terminal aberto não há para onde devolver o foco.
    lastTerminalRef.current = null;
    onOpenTerminal(null);
    dispatch({ type: 'RESTART_MISSION' });
  };

  return (
    <>
      {error !== null && (
        <p className="system-message system-message-error" role="alert">
          ⚠ {error}
        </p>
      )}
      <ControlRoom
        mission={mission}
        state={state}
        openTerminal={openTerminal}
        onOpenTerminal={onOpenTerminal}
        onStartMission={() => dispatch({ type: 'ACKNOWLEDGE_BRIEFING' })}
        onRestartMission={restartMission}
      />
      {state.phase === 'report' && (
        <div className="system-message mission-outcome">
          <p>
            ✔ Resultado registrado neste navegador.{' '}
            {nextMissionTitle === null
              ? 'Você pode repetir a missão para melhorar suas marcas.'
              : `Próxima missão liberada: ${nextMissionTitle}.`}
          </p>
          <button type="button" onClick={onOpenMissions}>
            Ver missões
          </button>
        </div>
      )}
      {terminal !== undefined && (
        <div
          className="terminal-slot"
          ref={terminalWorkspaceRef}
          tabIndex={-1}
          aria-label={`Terminal aberto: ${terminal.name}`}
        >
          <div className="terminal-toolbar">
            <button type="button" onClick={() => onOpenTerminal(null)}>
              <span aria-hidden="true">←</span> Voltar à sala de controle
            </button>
            <span className="terminal-connection">
              <span aria-hidden="true">●</span> Terminal conectado
            </span>
          </div>
          {terminal.id === 'scheduler' && report !== null && (
            <SchedulerTerminal state={state} report={report} dispatch={dispatch} />
          )}
          {terminal.id === 'telemetry' && (
            <section className="terminal">
              <p className="terminal-code" aria-hidden="true">
                TRM-01 // SENSOR ARRAY
              </p>
              <h2>Telemetria</h2>
              <p>Terminal de investigação ainda não implementado.</p>
              {state.phase === 'investigation' && (
                <button
                  type="button"
                  className="primary"
                  onClick={() => dispatch({ type: 'FINISH_INVESTIGATION' })}
                >
                  Concluir investigação
                </button>
              )}
            </section>
          )}
          {terminal.id === 'huffman' && (
            <HuffmanTerminal
              mission={mission}
              state={state}
              progress={huffmanProgress}
              report={report}
              dispatch={dispatch}
            />
          )}
          {terminal.id === 'report' && report !== null && (
            <MissionReportTerminal report={report} onRestart={restartMission} />
          )}
        </div>
      )}
    </>
  );
}
