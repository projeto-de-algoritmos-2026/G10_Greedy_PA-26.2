/** Repete um padrão de símbolos; mantém as definições de missão curtas e auditáveis. */
export const repeat = (pattern: readonly number[], times: number): readonly number[] =>
  Array.from({ length: times }, () => pattern).flat();
