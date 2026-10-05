/** Chave única do progresso; a versão do conteúdo fica no próprio documento salvo. */
export const PROGRESS_STORAGE_KEY = 'deepspace-mission-control:progress';

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem'>;

/**
 * Devolve o armazenamento local do navegador ou `null` quando ele está indisponível. O acesso
 * pode lançar em navegação privada ou com cookies bloqueados; o jogo segue funcionando sem
 * salvar.
 */
export function getBrowserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Lê o progresso bruto. O conteúdo ainda não é confiável: quem chama deve validá-lo. */
export function readStoredProgress(storage: ReadableStorage | null): unknown {
  if (storage === null) return null;
  try {
    const text = storage.getItem(PROGRESS_STORAGE_KEY);
    return text === null ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

/** Grava o progresso e informa se a gravação aconteceu (cota excedida ou bloqueio = `false`). */
export function writeStoredProgress(storage: WritableStorage | null, progress: unknown): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}
