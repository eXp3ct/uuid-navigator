import { YAMLMap } from 'yaml';
import { ObjectInfo } from '../../models';
import { findPair, getLocalized, getString, locate, ParseContext, scalarString, warn } from './yamlAccess';

export function parseObjectDocument(map: YAMLMap, ctx: ParseContext): ObjectInfo | null {
  const idNode = findPair(map, 'id')?.value;
  const id = scalarString(idNode);
  const classId = getString(map, 'classId');
  const name = getLocalized(map, 'name');
  if (!id || !classId || !name) {
    warn(ctx, 'object document skipped: "id", "classId" and "name" are required');
    return null;
  }

  return {
    id,
    name,
    description: getLocalized(map, 'description') ?? '',
    classId,
    parentId: getString(map, 'parentId') ?? null,
    filePath: ctx.filePath,
    ...locate(ctx, idNode)
  };
}
