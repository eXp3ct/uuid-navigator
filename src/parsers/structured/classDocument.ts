import { isMap, YAMLMap } from 'yaml';
import { ClassInfo, ClassPropertyLink, PropertyInfo } from '../../models';
import {
  EMPTY_GUID, findPair, getLocalized, getMap, getNumber, getString, isGuid, locate,
  pairKey, ParseContext, scalarString, warn
} from './yamlAccess';

const DEFAULT_CLASS_TYPE = 2;
const DEFAULT_DATA_TYPE = 0;

export interface ParsedClassDocument {
  classInfo: ClassInfo;
  properties: PropertyInfo[];
  links: ClassPropertyLink[];
}

export function parseClassDocument(map: YAMLMap, ctx: ParseContext): ParsedClassDocument | null {
  const idNode = findPair(map, 'id')?.value;
  const id = scalarString(idNode);
  const name = getLocalized(map, 'name');
  if (!id || !name) {
    warn(ctx, 'class document skipped: "id" and "name" are required');
    return null;
  }

  const classInfo: ClassInfo = {
    id,
    name,
    description: getLocalized(map, 'description') ?? '',
    classType: getNumber(map, 'type', DEFAULT_CLASS_TYPE),
    properties: [],
    objects: [],
    filePath: ctx.filePath,
    ...locate(ctx, idNode)
  };

  const properties: PropertyInfo[] = [];
  const links: ClassPropertyLink[] = [];
  const seen = new Set<string>();
  const aliases = readAliases(map);

  const definitions = getMap(map, 'definitions');
  for (const pair of definitions?.items ?? []) {
    const key = pairKey(pair);
    if (key === undefined || !isMap(pair.value)) {
      warn(ctx, `class ${id}: invalid definition entry skipped`);
      continue;
    }

    // Ключ — GUID либо алиас из aliases. Для алиаса id лежит в значении aliases, туда и указываем позицию.
    let propertyId = key;
    let idToken: unknown = pair.key;
    if (!isGuid(key)) {
      const alias = aliases.get(key.toLowerCase());
      if (!alias) {
        warn(ctx, `class ${id}: definition key "${key}" is neither a GUID nor a known alias, skipped`);
        continue;
      }
      propertyId = alias.id;
      idToken = alias.node;
    }

    const propertyName = getLocalized(pair.value, 'name');
    if (!propertyName) {
      warn(ctx, `class ${id}: definition ${propertyId} skipped: "name" is required`);
      continue;
    }
    if (seen.has(propertyId)) { continue; }
    seen.add(propertyId);

    const sourceClassId = getString(pair.value, 'sourceClassId');

    properties.push({
      id: propertyId,
      name: propertyName,
      description: getLocalized(pair.value, 'description') ?? '',
      dataType: getNumber(pair.value, 'type', DEFAULT_DATA_TYPE),
      sourceClassId: sourceClassId && sourceClassId !== EMPTY_GUID ? sourceClassId : undefined,
      filePath: ctx.filePath,
      ...locate(ctx, idToken)
    });
    links.push({ classId: id, propertyId });
  }

  return { classInfo, properties, links };
}

function readAliases(map: YAMLMap): Map<string, { id: string; node: unknown }> {
  const result = new Map<string, { id: string; node: unknown }>();
  for (const pair of getMap(map, 'aliases')?.items ?? []) {
    const name = pairKey(pair);
    const value = scalarString(pair.value);
    if (name !== undefined && value !== undefined && isGuid(value)) {
      result.set(name.toLowerCase(), { id: value, node: pair.value });
    }
  }
  return result;
}

