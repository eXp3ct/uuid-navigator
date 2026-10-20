import { isMap, isSeq, parseDocument, YAMLMap } from 'yaml';
import { ParsedFile } from '../models';
import { PositionLookup } from '../positionLookup';
import { ConfigFileParser } from './configParser';
import { parseClassDocument } from './structured/classDocument';
import { parseObjectDocument } from './structured/objectDocument';
import { parseRoleDocument } from './structured/roleDocument';
import { ParseContext, warn } from './structured/yamlAccess';

type Kind = 'class' | 'object' | 'role';

// .yml платформа не загружает, поэтому его тоже не обрабатываем
const KIND_SUFFIX = /\.(class|object|role)\.(yaml|json)$/i;

function emptyParsedFile(): ParsedFile {
  return { classes: [], properties: [], links: [], objects: [], roles: [] };
}

/**
 * Парсер *.class|object|role.(yaml|json). Семантика повторяет загрузчик платформы:
 * корень-маппинг — один документ, корень-последовательность — документ на каждый элемент.
 * Файл разбирается целиком одним вызовом parseDocument (он читает и JSON).
 */
export class StructuredConfigParser implements ConfigFileParser {
  public canHandle(filePath: string): boolean {
    return KIND_SUFFIX.test(filePath);
  }

  public parseFile(filePath: string, content: string, document: PositionLookup): ParsedFile {
    const parsed = emptyParsedFile();
    const kind = KIND_SUFFIX.exec(filePath)?.[1].toLowerCase() as Kind | undefined;
    if (!kind) { return parsed; }

    const ctx: ParseContext = { filePath, document };
    try {
      const doc = parseDocument(content);
      for (const error of doc.errors) {
        warn(ctx, `parse error: ${error.message}`);
      }

      for (const map of this.rootDocuments(doc.contents, ctx)) {
        this.collect(kind, map, ctx, parsed);
      }
    } catch (error) {
      console.warn(`[uuid-navigator] ${filePath}: failed to process:`, error);
    }

    return parsed;
  }

  private rootDocuments(root: unknown, ctx: ParseContext): YAMLMap[] {
    if (isMap(root)) { return [root]; }
    if (isSeq(root)) {
      const maps: YAMLMap[] = [];
      for (const item of root.items) {
        if (isMap(item)) {
          maps.push(item);
        } else {
          warn(ctx, 'sequence item skipped: not a mapping');
        }
      }
      return maps;
    }
    if (root !== null && root !== undefined) {
      warn(ctx, 'root must be a mapping or a sequence of mappings');
    }
    return [];
  }

  private collect(kind: Kind, map: YAMLMap, ctx: ParseContext, parsed: ParsedFile): void {
    if (kind === 'class') {
      const result = parseClassDocument(map, ctx);
      if (result) {
        parsed.classes.push(result.classInfo);
        parsed.properties.push(...result.properties);
        parsed.links.push(...result.links);
      }
    } else if (kind === 'object') {
      const object = parseObjectDocument(map, ctx);
      if (object) { parsed.objects.push(object); }
    } else {
      parsed.roles.push(...parseRoleDocument(map, ctx));
    }
  }
}
