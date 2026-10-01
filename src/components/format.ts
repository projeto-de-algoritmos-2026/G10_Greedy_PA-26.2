/** Formata unidades de tempo/bits sem casas decimais quando o valor é inteiro. */
export const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);
