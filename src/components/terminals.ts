import type { GamePhase, GameState } from '../game';

export type TerminalId = 'telemetry' | 'huffman' | 'scheduler' | 'report';
export type TerminalStatus = 'locked' | 'available' | 'completed';

export interface TerminalDefinition {
  readonly id: TerminalId;
  readonly name: string;
  readonly description: string;
  /** Fase do jogo em que o terminal é o objetivo atual; fases posteriores o concluem. */
  readonly phase: GamePhase;
  /** Última fase conduzida neste terminal, quando ele cobre mais de uma. */
  readonly lastPhase?: GamePhase;
  readonly prerequisite: string;
}

export const TERMINALS: readonly TerminalDefinition[] = Object.freeze([
  {
    id: 'telemetry',
    name: 'Telemetria',
    description: 'Investigar os pacotes recebidos da sonda.',
    phase: 'investigation',
    prerequisite: 'Leia o briefing e inicie a missão para liberar.',
  },
  {
    id: 'huffman',
    name: 'Huffman',
    description: 'Construir a árvore de compressão compartilhada.',
    phase: 'compression',
    prerequisite: 'Conclua a investigação da telemetria para liberar.',
  },
  {
    id: 'scheduler',
    name: 'Scheduler',
    description: 'Ordenar os pacotes e comparar com EDD.',
    phase: 'scheduling',
    // "Concluir transmissão" fica neste terminal: ele só termina quando o relatório é liberado.
    lastPhase: 'transmission',
    prerequisite: 'Confirme a árvore de Huffman completa para liberar.',
  },
  {
    id: 'report',
    name: 'Relatório',
    description: 'Comparar cenários original e comprimido.',
    phase: 'report',
    prerequisite: 'Confirme o escalonamento e conclua a transmissão para liberar.',
  },
]);

const PHASE_ORDER: readonly GamePhase[] = [
  'briefing',
  'investigation',
  'compression',
  'scheduling',
  'transmission',
  'report',
];

export function terminalStatus(terminal: TerminalDefinition, state: GameState): TerminalStatus {
  const current = PHASE_ORDER.indexOf(state.phase);
  if (current < PHASE_ORDER.indexOf(terminal.phase)) return 'locked';
  // O relatório é o último passo: alcançá-lo o deixa disponível, não concluído.
  return current > PHASE_ORDER.indexOf(terminal.lastPhase ?? terminal.phase)
    ? 'completed'
    : 'available';
}
