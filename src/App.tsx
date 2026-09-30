import { useState } from 'react';
import { ControlRoom } from './components/ControlRoom';
import { SchedulerTerminal } from './components/SchedulerTerminal';
import { TERMINALS } from './components/terminals';
import type { TerminalId } from './components/terminals';
import { deepSpaceMission } from './data';
import { loadMission } from './domain';
import { applyGameCommand, createInitialGameState, selectMissionReport } from './game';
import type { GameCommand, GameState } from './game';

const mission = loadMission(deepSpaceMission);

export default function App() {
  const [state, setState] = useState<GameState>(() => createInitialGameState(mission));
  const [openTerminal, setOpenTerminal] = useState<TerminalId | null>(null);
  const [error, setError] = useState<string | null>(null);

  // O estado da missão vive aqui: abrir/fechar terminais só muda `openTerminal`.
  const dispatch = (command: GameCommand) => {
    const result = applyGameCommand(mission, state, command);
    setState(result.state);
    setError(result.ok ? null : result.error.message);
  };

  const applyReferenceHuffman = () => {
    let current = state;
    for (const step of mission.telemetry.referenceMergeHistory) {
      const result = applyGameCommand(mission, current, {
        type: 'MERGE_HUFFMAN_NODES',
        firstNodeId: step.firstExtracted.id,
        secondNodeId: step.secondExtracted.id,
      });
      if (!result.ok) return setError(result.error.message);
      current = result.state;
    }
    const confirmed = applyGameCommand(mission, current, { type: 'CONFIRM_COMPRESSION' });
    setState(confirmed.state);
    setError(confirmed.ok ? null : confirmed.error.message);
  };

  const report = state.phase === 'briefing' ? null : selectMissionReport(mission, state);
  const terminal = TERMINALS.find((entry) => entry.id === openTerminal);

  return (
    <main>
      <h1>DeepSpace: Mission Control</h1>
      <p>Comprima a telemetria com Huffman e escalone a transmissão com EDD.</p>
      {error !== null && <p role="alert">{error}</p>}
      <ControlRoom
        mission={mission}
        state={state}
        openTerminal={openTerminal}
        onOpenTerminal={setOpenTerminal}
        onStartMission={() => dispatch({ type: 'ACKNOWLEDGE_BRIEFING' })}
      />
      {terminal !== undefined && (
        <div className="terminal-slot">
          <button type="button" onClick={() => setOpenTerminal(null)}>
            ← Voltar à sala de controle
          </button>
          {terminal.id === 'scheduler' && report !== null && (
            <SchedulerTerminal state={state} report={report} dispatch={dispatch} />
          )}
          {terminal.id === 'telemetry' && (
            <section className="terminal">
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
            <section className="terminal">
              <h2>Huffman</h2>
              <p>Terminal interativo de Huffman ainda não implementado.</p>
              {state.phase === 'compression' && (
                <button type="button" className="primary" onClick={applyReferenceHuffman}>
                  Usar árvore de referência (provisório)
                </button>
              )}
            </section>
          )}
          {terminal.id === 'report' && (
            <section className="terminal">
              <h2>Relatório</h2>
              <p>Terminal de relatório ainda não implementado.</p>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
