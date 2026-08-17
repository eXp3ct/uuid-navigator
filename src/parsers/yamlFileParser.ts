import * as vscode from 'vscode';
import { isMap, parseDocument, Scalar } from 'yaml';
import { ClassInfo, ClassPropertyLink, ObjectInfo, ParsedFile, PropertyInfo } from '../models';
import { ConfigFileParser } from './configParser';

const CLASS_SUFFIX = /\.class\.(yaml|yml|json)$/i;
const OBJECT_SUFFIX = /\.object\.(yaml|yml|json)$/i;

function emptyParsedFile(): ParsedFile {
  return { classes: [], properties: [], links: [], objects: [], roles: [] };
}

/**
 * *.object.yaml/json files are several blank-line-separated records, each independently
 * valid YAML, with no `---` document separators. Parsing the whole file as one document
 * throws (duplicate keys), so each record has to be split out and parsed on its own.
 */
function splitBlocks(content: string): { start: number; text: string }[] {
  const lines = content.split('\n');
  const blocks: { start: number; text: string }[] = [];
  let offset = 0;
  let blockStart = -1;
  let blockLines: string[] = [];

  for (const line of lines) {
    if (line.trim() === '') {
      if (blockLines.length > 0) {
        blocks.push({ start: blockStart, text: blockLines.join('\n') });
        blockLines = [];
      }
      blockStart = -1;
    } else {
      if (blockStart === -1) { blockStart = offset; }
      blockLines.push(line);
    }
    offset += line.length + 1;
  }

  if (blockLines.length > 0) {
    blocks.push({ start: blockStart, text: blockLines.join('\n') });
  }

  return blocks;
}

export class YamlFileParser implements ConfigFileParser {
  public canHandle(filePath: string): boolean {
    return CLASS_SUFFIX.test(filePath) || OBJECT_SUFFIX.test(filePath);
  }

  public parseFile(filePath: string, content: string, document: vscode.TextDocument): ParsedFile {
    try {
      if (CLASS_SUFFIX.test(filePath)) { return this.parseClassFile(filePath, content, document); }
      if (OBJECT_SUFFIX.test(filePath)) { return this.parseObjectFile(filePath, content, document); }
    } catch (error) {
      console.error(`Error processing ${filePath}:`, error);
    }

    return emptyParsedFile();
  }

  private parseClassFile(filePath: string, content: string, document: vscode.TextDocument): ParsedFile {
    const doc = parseDocument(content);
    if (doc.errors.length > 0) {
      console.warn(`Invalid class config in ${filePath}:`, doc.errors[0].message);
      return emptyParsedFile();
    }

    const id = doc.get('id') as string | undefined;
    const name = doc.get('name') as string | undefined;
    if (!id || !name) { return emptyParsedFile(); }

    const description = (doc.get('description') as string) || '';
    const classType = Number(doc.get('type') ?? 0);
    const position = this.rangeStart(doc.get('id', true));

    const classInfo: ClassInfo = {
      id,
      name,
      description,
      classType,
      properties: [],
      objects: [],
      filePath,
      lineNumber: document.positionAt(position).line + 1,
      position
    };

    const properties: PropertyInfo[] = [];
    const links: ClassPropertyLink[] = [];
    const definitions = doc.get('definitions', true);

    if (isMap(definitions)) {
      for (const pair of definitions.items) {
        const property = this.parseDefinition(pair, filePath, document);
        if (!property) { continue; }

        properties.push(property);
        links.push({ classId: id, propertyId: property.id });
      }
    }

    return { classes: [classInfo], properties, links, objects: [], roles: [] };
  }

  private parseDefinition(
    pair: { key: unknown; value: unknown },
    filePath: string,
    document: vscode.TextDocument
  ): PropertyInfo | null {
    if (!(pair.key instanceof Scalar) || !isMap(pair.value)) { return null; }

    const id = String(pair.key.value ?? '');
    const valueMap = pair.value;
    const name = valueMap.get('name') as string | undefined;
    if (!id || !name) { return null; }

    const description = (valueMap.get('description') as string) || '';
    const dataType = Number(valueMap.get('type') ?? 0);
    const sourceClassId = (valueMap.get('sourceClassId') as string) || undefined;
    const position = this.rangeStart(pair.key);

    return {
      id,
      name,
      description,
      dataType,
      sourceClassId,
      filePath,
      lineNumber: document.positionAt(position).line + 1,
      position
    };
  }

  private parseObjectFile(filePath: string, content: string, document: vscode.TextDocument): ParsedFile {
    const objects: ObjectInfo[] = [];

    for (const block of splitBlocks(content)) {
      const doc = parseDocument(block.text);
      if (doc.errors.length > 0) {
        console.warn(`Invalid object record in ${filePath}:`, doc.errors[0].message);
        continue;
      }

      const id = doc.get('id') as string | undefined;
      const classId = doc.get('classId') as string | undefined;
      const name = doc.get('name') as string | undefined;
      if (!id || !classId || !name) { continue; }

      const description = (doc.get('description') as string) || '';
      const parentIdRaw = doc.get('parentId');
      const parentId = parentIdRaw === undefined || parentIdRaw === null ? null : String(parentIdRaw);
      const position = block.start + this.rangeStart(doc.get('id', true));

      objects.push({
        id,
        name,
        description,
        classId,
        parentId,
        filePath,
        lineNumber: document.positionAt(position).line + 1,
        position
      });
    }

    return { classes: [], properties: [], links: [], objects, roles: [] };
  }

  private rangeStart(node: unknown): number {
    if (node instanceof Scalar && node.range) { return node.range[0]; }
    return 0;
  }
}
