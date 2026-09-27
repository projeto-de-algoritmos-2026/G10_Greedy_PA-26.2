export class InvalidMissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMissionError';
  }
}
