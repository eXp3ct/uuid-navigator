import { isMap, isSeq, YAMLMap } from 'yaml';
import { RoleInfo } from '../../models';
import { findPair, getLocalized, locate, ParseContext, scalarString, warn } from './yamlAccess';

/** Группа ролей { id, name, roles: [...] }: RoleInfo создаётся для каждого элемента roles, не для группы. */
export function parseRoleDocument(map: YAMLMap, ctx: ParseContext): RoleInfo[] {
  const rolesNode = findPair(map, 'roles')?.value;
  if (!isSeq(rolesNode)) { return []; }

  const roles: RoleInfo[] = [];
  for (const item of rolesNode.items) {
    if (!isMap(item)) {
      warn(ctx, 'role entry skipped: not a mapping');
      continue;
    }

    const idNode = findPair(item, 'id')?.value;
    const id = scalarString(idNode);
    const name = getLocalized(item, 'name');
    if (!id || !name) {
      warn(ctx, 'role entry skipped: "id" and "name" are required');
      continue;
    }

    roles.push({
      id,
      name,
      description: getLocalized(item, 'description') ?? '',
      filePath: ctx.filePath,
      ...locate(ctx, idNode)
    });
  }
  return roles;
}
