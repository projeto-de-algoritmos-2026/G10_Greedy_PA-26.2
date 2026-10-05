import type { MissionValidationIssue } from './types';

export class InvalidMissionError extends Error {
  constructor(
    message: string,
    /** Todos os problemas do documento, quando o erro vem da validação do schema. */
    readonly issues: readonly MissionValidationIssue[] = [],
  ) {
    super(message);
    this.name = 'InvalidMissionError';
  }
}
