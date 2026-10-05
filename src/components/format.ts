/** Formata unidades de tempo/bits sem casas decimais quando o valor é inteiro. */
export const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

export const formatPercent = (ratio: number): string => `${formatNumber(ratio * 100)}%`;

export const formatByteHex = (byte: number): string =>
  `0x${byte.toString(16).toUpperCase().padStart(2, '0')}`;

const CONTROL_BYTE_NAMES: Readonly<Partial<Record<number, string>>> = {
  0x09: 'tabulação',
  0x0a: 'quebra de linha',
  0x0d: 'retorno de carro',
  0x20: 'espaço',
};

/** Nome legível de um byte: caractere ASCII imprimível, controle comum ou "—" para os demais. */
export function describeByte(byte: number): string {
  const name = CONTROL_BYTE_NAMES[byte];
  if (name !== undefined) return name;
  return byte > 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '—';
}
