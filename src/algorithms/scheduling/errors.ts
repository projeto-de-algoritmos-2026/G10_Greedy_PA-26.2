/** Lançado quando um pacote de entrada viola as hipóteses do modelo de escalonamento. */
export class InvalidPacketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPacketError';
  }
}
