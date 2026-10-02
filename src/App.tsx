import { useEffect, useRef, useState } from 'react';
import { ControlRoom } from './components/ControlRoom';
import { HuffmanTerminal } from './components/HuffmanTerminal';
import { MissionReportTerminal } from './components/MissionReportTerminal';
import { SchedulerTerminal } from './components/SchedulerTerminal';
import { TERMINALS } from './components/terminals';
import type { TerminalId } from './components/terminals';
import { deepSpaceMission } from './data';
import { loadMission } from './domain';
import {
  applyGameCommand,
  createInitialGameState,
  selectHuffmanProgress,
  selectMissionReport,
} from './game';
import type { GameCommand, GameState } from './game';

const mission = loadMission(deepSpaceMission);

const PHASE_LABEL: Readonly<Record<GameState['phase'], string>> = {
  briefing: 'Aguardando autorização',
  investigation: 'Investigação de telemetria',
  compression: 'Compressão Huffman',
  scheduling: 'Escalonamento EDD',
  transmission: 'Transmissão em curso',
  report: 'Missão concluída',
};

export default function App() {
  const [state, setState] = useState<GameState>(() => createInitialGameState(mission));
  const [openTerminal, setOpenTerminal] = useState<TerminalId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const terminalWorkspaceRef = useRef<HTMLDivElement>(null);
  const lastTerminalRef = useRef<TerminalId | null>(null);

  // O estado da missão vive aqui: abrir/fechar terminais só muda `openTerminal`.
  const dispatch = (command: GameCommand) => {
    const result = applyGameCommand(mission, state, command);
    setState(result.state);
    setError(result.ok ? null : result.error.message);
  };

  const huffmanProgress = selectHuffmanProgress(mission, state);
  const report = state.phase === 'briefing' ? null : selectMissionReport(mission, state);
  const terminal = TERMINALS.find((entry) => entry.id === openTerminal);
  const missionStarted = state.phase !== 'briefing';

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

  const closeTerminal = () => {
    setOpenTerminal(null);
  };

  const restartMission = () => {
    const result = applyGameCommand(mission, state, { type: 'RESTART_MISSION' });
    setState(result.state);
    setError(result.ok ? null : result.error.message);
    if (result.ok) {
      lastTerminalRef.current = null;
      setOpenTerminal(null);
    }
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Pular para o conteúdo principal
      </a>
      <header className="mission-header">
        <div>
          <p className="eyebrow">DSMC // SETOR ORBITAL 07</p>
          <h1>DeepSpace: Mission Control</h1>
          <p className="mission-subtitle">
            Comprima a telemetria com Huffman e escalone a transmissão com EDD.
          </p>
        </div>
        <dl className="system-status" aria-label="Estado atual do sistema">
          <div>
            <dt>Enlace</dt>
            <dd>
              <span aria-hidden="true">●</span> Estável
            </dd>
          </div>
          <div>
            <dt>Fase</dt>
            <dd aria-live="polite">{PHASE_LABEL[state.phase]}</dd>
          </div>
          <div>
            <dt>Protocolo</dt>
            <dd>{missionStarted ? 'Operacional' : 'Em espera'}</dd>
          </div>
        </dl>
      </header>

      <main id="main-content" tabIndex={-1}>
        {error !== null && (
          <p className="system-message system-message-error" role="alert">
            ⚠ {error}
          </p>
        )}
        <ControlRoom
          mission={mission}
          state={state}
          openTerminal={openTerminal}
          onOpenTerminal={setOpenTerminal}
          onStartMission={() => dispatch({ type: 'ACKNOWLEDGE_BRIEFING' })}
        />
        {terminal !== undefined && (
          <div
            className="terminal-slot"
            ref={terminalWorkspaceRef}
            tabIndex={-1}
            aria-label={`Terminal aberto: ${terminal.name}`}
          >
            <div className="terminal-toolbar">
              <button type="button" onClick={closeTerminal}>
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
      </main>
      <footer className="mission-footer">
        <span>DSMC v1.0</span>
        <span>Canal seguro // simulação acadêmica</span>
      </footer>
    </div>
  );
}
