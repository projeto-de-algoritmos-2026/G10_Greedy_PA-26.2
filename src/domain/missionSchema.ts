import type {
  MissionDefinition,
  MissionPacketDefinition,
  MissionValidationIssue,
  MissionValidationResult,
  OriginalSymbolFormat,
  TelemetrySymbolDefinition,
} from './types';

/** Versão do documento de missão. Mudanças incompatíveis no formato exigem um novo número. */
export const MISSION_SCHEMA_VERSION = 1;

/**
 * Limites do schema v1. Mantêm a missão jogável na interface (árvore e Gantt legíveis) e o
 * progresso salvo dentro da cota do armazenamento local.
 */
export const MISSION_LIMITS = Object.freeze({
  maxIdLength: 48,
  maxTitleLength: 80,
  maxBriefingLength: 600,
  maxObjectives: 6,
  maxObjectiveLength: 200,
  maxBandwidth: 1_000_000,
  minAlphabetSize: 2,
  maxAlphabetSize: 16,
  maxLabelLength: 40,
  maxBitsPerSymbol: 32,
  maxPackets: 12,
  maxDeadline: 1_000_000,
  maxPayloadSymbols: 2048,
  maxTotalSymbols: 8192,
  maxDocumentLength: 256 * 1024,
});

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ROOT = 'missão';

const MISSION_KEYS = [
  'schemaVersion',
  'id',
  'title',
  'briefing',
  'objectives',
  'bandwidthBitsPerTimeUnit',
  'telemetry',
  'packets',
] as const;
const TELEMETRY_KEYS = ['alphabet', 'originalFormat'] as const;
const FORMAT_KEYS = ['encoding', 'bitsPerSymbol', 'sizeUnit'] as const;
const SYMBOL_KEYS = ['value', 'label'] as const;
const PACKET_KEYS = ['id', 'deadline', 'payload'] as const;

type JsonObject = Readonly<Record<string, unknown>>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Acumula todos os problemas de um documento para que o editor os mostre de uma só vez. */
class IssueCollector {
  readonly issues: MissionValidationIssue[] = [];

  add(path: string, message: string): void {
    this.issues.push(Object.freeze({ path, message }));
  }

  object(value: unknown, path: string, allowedKeys: readonly string[]): JsonObject | null {
    if (!isObject(value)) {
      this.add(path, 'deve ser um objeto.');
      return null;
    }
    for (const key of Object.keys(value)) {
      if (!allowedKeys.includes(key)) this.add(`${path}.${key}`, 'campo desconhecido no schema.');
    }
    return value;
  }

  array(value: unknown, path: string, min: number, max: number): readonly unknown[] | null {
    if (!Array.isArray(value)) {
      this.add(path, 'deve ser uma lista.');
      return null;
    }
    if (value.length < min || value.length > max) {
      this.add(path, `deve ter entre ${min} e ${max} itens; possui ${value.length}.`);
      return null;
    }
    return value;
  }

  text(value: unknown, path: string, maxLength: number): string | null {
    if (typeof value !== 'string' || value.trim().length === 0) {
      this.add(path, 'deve ser um texto não vazio.');
      return null;
    }
    if (value.length > maxLength) {
      this.add(path, `deve ter no máximo ${maxLength} caracteres; possui ${value.length}.`);
      return null;
    }
    return value;
  }

  id(value: unknown, path: string): string | null {
    if (
      typeof value !== 'string' ||
      !ID_PATTERN.test(value) ||
      value.length > MISSION_LIMITS.maxIdLength
    ) {
      this.add(
        path,
        `deve usar letras minúsculas, números e hífens, com até ${MISSION_LIMITS.maxIdLength} caracteres.`,
      );
      return null;
    }
    return value;
  }
}

function validateFormat(issues: IssueCollector, value: unknown): OriginalSymbolFormat | null {
  const path = 'telemetry.originalFormat';
  const format = issues.object(value, path, FORMAT_KEYS);
  if (format === null) return null;

  const { encoding, bitsPerSymbol, sizeUnit } = format;
  let valid = true;
  if (encoding !== 'unsigned-integer') {
    issues.add(`${path}.encoding`, 'deve ser "unsigned-integer".');
    valid = false;
  }
  if (sizeUnit !== 'bit') {
    issues.add(`${path}.sizeUnit`, 'deve ser "bit".');
    valid = false;
  }
  if (
    typeof bitsPerSymbol !== 'number' ||
    !Number.isSafeInteger(bitsPerSymbol) ||
    bitsPerSymbol <= 0 ||
    bitsPerSymbol > MISSION_LIMITS.maxBitsPerSymbol
  ) {
    issues.add(
      `${path}.bitsPerSymbol`,
      `deve ser um inteiro entre 1 e ${MISSION_LIMITS.maxBitsPerSymbol}.`,
    );
    return null;
  }
  return valid
    ? Object.freeze({ encoding: 'unsigned-integer', bitsPerSymbol, sizeUnit: 'bit' })
    : null;
}

function validateAlphabet(
  issues: IssueCollector,
  value: unknown,
  format: OriginalSymbolFormat | null,
): readonly TelemetrySymbolDefinition[] | null {
  const path = 'telemetry.alphabet';
  const entries = issues.array(
    value,
    path,
    MISSION_LIMITS.minAlphabetSize,
    MISSION_LIMITS.maxAlphabetSize,
  );
  if (entries === null) return null;

  const values = new Set<number>();
  const labels = new Set<string>();
  const alphabet: TelemetrySymbolDefinition[] = [];
  entries.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const symbol = issues.object(entry, entryPath, SYMBOL_KEYS);
    if (symbol === null) return;

    const label = issues.text(symbol.label, `${entryPath}.label`, MISSION_LIMITS.maxLabelLength);
    if (label !== null && labels.has(label)) {
      issues.add(`${entryPath}.label`, `rótulo duplicado no alfabeto: "${label}".`);
    }
    if (label !== null) labels.add(label);

    const symbolValue = symbol.value;
    if (
      typeof symbolValue !== 'number' ||
      !Number.isInteger(symbolValue) ||
      symbolValue < 0 ||
      symbolValue > 255
    ) {
      issues.add(`${entryPath}.value`, 'deve ser um inteiro entre 0 e 255 (um byte do codec).');
      return;
    }
    if (values.has(symbolValue)) {
      issues.add(`${entryPath}.value`, `símbolo duplicado no alfabeto: ${symbolValue}.`);
      return;
    }
    values.add(symbolValue);
    // Sem esta verificação o tamanho "original" declarado seria menor que o necessário para
    // representar o símbolo, inflando artificialmente a comparação a favor do formato original.
    if (format !== null && symbolValue >= 2 ** format.bitsPerSymbol) {
      issues.add(
        `${entryPath}.value`,
        `o valor ${symbolValue} não cabe em ${format.bitsPerSymbol} bits por símbolo.`,
      );
      return;
    }
    if (label !== null) alphabet.push(Object.freeze({ value: symbolValue, label }));
  });

  return alphabet.length === entries.length ? Object.freeze(alphabet) : null;
}

function validatePackets(
  issues: IssueCollector,
  value: unknown,
  alphabet: readonly TelemetrySymbolDefinition[] | null,
): readonly MissionPacketDefinition[] | null {
  const entries = issues.array(value, 'packets', 1, MISSION_LIMITS.maxPackets);
  if (entries === null) return null;

  const knownSymbols = alphabet === null ? null : new Set(alphabet.map((symbol) => symbol.value));
  const usedSymbols = new Set<number>();
  const ids = new Set<string>();
  const packets: MissionPacketDefinition[] = [];
  let totalSymbols = 0;

  entries.forEach((entry, index) => {
    const path = `packets[${index}]`;
    if (isObject(entry)) {
      const extraKeys = Object.keys(entry).filter(
        (key) => !(PACKET_KEYS as readonly string[]).includes(key),
      );
      if (extraKeys.length > 0) {
        // A otimalidade de EDD foi analisada apenas para este modelo; aceitar outros atributos
        // de escalonamento os apresentaria, incorretamente, como parte da mesma regra.
        issues.add(
          `${path}.${extraKeys[0]}`,
          'campo desconhecido no schema. O pacote aceita apenas id, deadline e payload: datas de liberação, prioridades ou preempção exigem outro modelo de escalonamento, não EDD.',
        );
        return;
      }
    }
    const packet = issues.object(entry, path, PACKET_KEYS);
    if (packet === null) return;

    const id = issues.id(packet.id, `${path}.id`);
    const duplicated = id !== null && ids.has(id);
    if (duplicated) issues.add(`${path}.id`, `ID de pacote duplicado: ${id}.`);
    if (id !== null) ids.add(id);

    const { deadline } = packet;
    const deadlineValid =
      typeof deadline === 'number' &&
      Number.isFinite(deadline) &&
      deadline >= 0 &&
      deadline <= MISSION_LIMITS.maxDeadline;
    if (!deadlineValid) {
      issues.add(`${path}.deadline`, `deve ser um número entre 0 e ${MISSION_LIMITS.maxDeadline}.`);
    }

    const payload = issues.array(
      packet.payload,
      `${path}.payload`,
      1,
      MISSION_LIMITS.maxPayloadSymbols,
    );
    if (payload === null) return;
    totalSymbols += payload.length;

    const invalidIndex = payload.findIndex(
      (symbol) =>
        typeof symbol !== 'number' ||
        !Number.isInteger(symbol) ||
        (knownSymbols !== null && !knownSymbols.has(symbol)),
    );
    if (invalidIndex !== -1) {
      issues.add(
        `${path}.payload[${invalidIndex}]`,
        `símbolo ${JSON.stringify(payload[invalidIndex])} não pertence ao alfabeto da telemetria.`,
      );
      return;
    }
    const symbols = payload as readonly number[];
    for (const symbol of symbols) usedSymbols.add(symbol);

    if (id !== null && !duplicated && deadlineValid) {
      packets.push(Object.freeze({ id, deadline, payload: Object.freeze([...symbols]) }));
    }
  });

  if (totalSymbols > MISSION_LIMITS.maxTotalSymbols) {
    issues.add(
      'packets',
      `a soma dos payloads deve ter no máximo ${MISSION_LIMITS.maxTotalSymbols} símbolos; possui ${totalSymbols}.`,
    );
  }
  // Um símbolo sem ocorrência não recebe folha nem código: declará-lo seria prometer ao jogador
  // uma decisão de Huffman que nunca acontece.
  if (alphabet !== null && packets.length === entries.length) {
    alphabet.forEach((symbol, index) => {
      if (!usedSymbols.has(symbol.value)) {
        issues.add(
          `telemetry.alphabet[${index}]`,
          `o símbolo ${symbol.value} ("${symbol.label}") não aparece em nenhum payload.`,
        );
      }
    });
  }

  return packets.length === entries.length ? Object.freeze(packets) : null;
}

/**
 * Valida um documento de missão de origem não confiável (JSON importado, armazenamento local)
 * e devolve uma definição normalizada e imutável ou a lista completa de problemas encontrados.
 */
export function validateMissionDocument(input: unknown): MissionValidationResult {
  const issues = new IssueCollector();
  const fail = (): MissionValidationResult =>
    Object.freeze({ ok: false, issues: Object.freeze(issues.issues) });

  if (!isObject(input)) {
    issues.add(ROOT, 'o documento deve ser um objeto JSON.');
    return fail();
  }
  // Sem uma versão conhecida não há como interpretar os demais campos com segurança.
  if (input.schemaVersion === undefined) {
    issues.add(
      'schemaVersion',
      `é obrigatório; esta aplicação lê a versão ${MISSION_SCHEMA_VERSION}.`,
    );
    return fail();
  }
  if (input.schemaVersion !== MISSION_SCHEMA_VERSION) {
    issues.add(
      'schemaVersion',
      `versão ${JSON.stringify(input.schemaVersion)} não suportada; esta aplicação lê a versão ${MISSION_SCHEMA_VERSION}.`,
    );
    return fail();
  }

  const mission = issues.object(input, ROOT, MISSION_KEYS);
  if (mission === null) return fail();

  const id = issues.id(mission.id, 'id');
  const title = issues.text(mission.title, 'title', MISSION_LIMITS.maxTitleLength);
  const briefing = issues.text(mission.briefing, 'briefing', MISSION_LIMITS.maxBriefingLength);

  const objectiveEntries = issues.array(
    mission.objectives,
    'objectives',
    1,
    MISSION_LIMITS.maxObjectives,
  );
  const objectives: string[] = [];
  objectiveEntries?.forEach((entry, index) => {
    const objective = issues.text(entry, `objectives[${index}]`, MISSION_LIMITS.maxObjectiveLength);
    if (objective === null) return;
    if (objectives.includes(objective)) {
      issues.add(`objectives[${index}]`, 'objetivo duplicado.');
      return;
    }
    objectives.push(objective);
  });

  const bandwidth = mission.bandwidthBitsPerTimeUnit;
  const bandwidthValid =
    typeof bandwidth === 'number' &&
    Number.isFinite(bandwidth) &&
    bandwidth > 0 &&
    bandwidth <= MISSION_LIMITS.maxBandwidth;
  if (!bandwidthValid) {
    issues.add(
      'bandwidthBitsPerTimeUnit',
      `deve ser um número maior que 0 e de no máximo ${MISSION_LIMITS.maxBandwidth}.`,
    );
  }

  const telemetry = issues.object(mission.telemetry, 'telemetry', TELEMETRY_KEYS);
  const format = telemetry === null ? null : validateFormat(issues, telemetry.originalFormat);
  const alphabet = telemetry === null ? null : validateAlphabet(issues, telemetry.alphabet, format);
  const packets = validatePackets(issues, mission.packets, alphabet);

  if (
    issues.issues.length > 0 ||
    id === null ||
    title === null ||
    briefing === null ||
    !bandwidthValid ||
    format === null ||
    alphabet === null ||
    packets === null
  ) {
    return fail();
  }

  const definition: MissionDefinition = Object.freeze({
    schemaVersion: MISSION_SCHEMA_VERSION,
    id,
    title,
    briefing,
    objectives: Object.freeze(objectives),
    bandwidthBitsPerTimeUnit: bandwidth,
    telemetry: Object.freeze({ alphabet, originalFormat: format }),
    packets,
  });
  return Object.freeze({ ok: true, definition });
}

/** Interpreta o texto de um arquivo `.json` de missão e o valida contra o schema. */
export function parseMissionJson(text: string): MissionValidationResult {
  const failure = (message: string): MissionValidationResult =>
    Object.freeze({ ok: false, issues: Object.freeze([Object.freeze({ path: ROOT, message })]) });

  if (text.trim().length === 0) return failure('o documento está vazio.');
  if (text.length > MISSION_LIMITS.maxDocumentLength) {
    return failure(
      `o documento tem ${text.length} caracteres; o limite é ${MISSION_LIMITS.maxDocumentLength}.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return failure(`JSON inválido: ${error instanceof Error ? error.message : 'erro de sintaxe'}.`);
  }
  return validateMissionDocument(parsed);
}

/** Gera o JSON de uma missão com os payloads em uma única linha, para edição manual. */
export function serializeMission(definition: MissionDefinition): string {
  const ordered = {
    schemaVersion: definition.schemaVersion,
    id: definition.id,
    title: definition.title,
    briefing: definition.briefing,
    objectives: definition.objectives,
    bandwidthBitsPerTimeUnit: definition.bandwidthBitsPerTimeUnit,
    telemetry: {
      alphabet: definition.telemetry.alphabet.map(({ value, label }) => ({ value, label })),
      originalFormat: definition.telemetry.originalFormat,
    },
    packets: definition.packets.map(({ id, deadline, payload }) => ({ id, deadline, payload })),
  };
  return `${JSON.stringify(ordered, null, 2).replace(
    /\[\s*((?:-?\d+(?:\.\d+)?,\s*)*-?\d+(?:\.\d+)?)\s*\]/gu,
    (_match, numbers: string) => `[${numbers.replace(/\s+/gu, ' ')}]`,
  )}\n`;
}
