import { PositionLookup } from '../../positionLookup';
import { isMap, isScalar, Pair, YAMLMap } from 'yaml';

export interface ParseContext {
  filePath: string;
  document: PositionLookup;
}

export interface Located {
  position: number;
  lineNumber: number;
}

export const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCALE_PRIORITY = ['ru-ru', 'ru', '__default'];

export function isGuid(value: string): boolean {
  return GUID_PATTERN.test(value);
}

export function warn(ctx: ParseContext, message: string): void {
  console.warn(`[uuid-navigator] ${ctx.filePath}: ${message}`);
}

/** Имена свойств платформа сравнивает без учёта регистра (JsonSerializerOptions.Web). */
export function findPair(map: YAMLMap, key: string): Pair | undefined {
  const wanted = key.toLowerCase();
  for (const pair of map.items) {
    const name = pairKey(pair);
    if (name !== undefined && name.toLowerCase() === wanted) { return pair; }
  }
  return undefined;
}

export function pairKey(pair: Pair): string | undefined {
  const key = isScalar(pair.key) ? pair.key.value : pair.key;
  return key === null || key === undefined || typeof key === 'object' ? undefined : String(key);
}

export function getNode(map: YAMLMap, key: string): unknown {
  return findPair(map, key)?.value;
}

export function getMap(map: YAMLMap, key: string): YAMLMap | undefined {
  const node = getNode(map, key);
  return isMap(node) ? node : undefined;
}

/** Строка из скаляра; пустое значение (null/пустая строка) считается отсутствующим. */
export function scalarString(node: unknown): string | undefined {
  if (!isScalar(node)) { return undefined; }
  const value = node.value;
  if (value === null || value === undefined || typeof value === 'object') { return undefined; }
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

export function getString(map: YAMLMap, key: string): string | undefined {
  return scalarString(getNode(map, key));
}

export function getNumber(map: YAMLMap, key: string, fallback: number): number {
  const node = getNode(map, key);
  if (!isScalar(node) || node.value === null || node.value === undefined) { return fallback; }
  const value = Number(node.value);
  return Number.isFinite(value) ? value : fallback;
}

/** Локализованное значение: строка или { 'ru-RU': ..., ru: ..., __default: ... }. */
export function localizedString(node: unknown): string | undefined {
  if (isScalar(node)) { return scalarString(node); }
  if (!isMap(node)) { return undefined; }

  const byLocale = new Map<string, string>();
  let first: string | undefined;
  for (const pair of node.items) {
    const locale = pairKey(pair);
    const text = scalarString(pair.value);
    if (locale === undefined || text === undefined) { continue; }
    byLocale.set(locale.toLowerCase(), text);
    first ??= text;
  }

  for (const locale of LOCALE_PRIORITY) {
    const text = byLocale.get(locale);
    if (text !== undefined) { return text; }
  }
  return first;
}

export function getLocalized(map: YAMLMap, key: string): string | undefined {
  return localizedString(getNode(map, key));
}

/** Смещение начала токена в исходном тексте и номер строки (с 1). */
export function locate(ctx: ParseContext, node: unknown): Located {
  const position = isScalar(node) && node.range ? node.range[0] : 0;
  return { position, lineNumber: ctx.document.positionAt(position).line + 1 };
}
