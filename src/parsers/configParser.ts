import { ParsedFile } from '../models';
import { PositionLookup } from '../positionLookup';

export interface ConfigFileParser {
  canHandle(filePath: string): boolean;
  parseFile(filePath: string, content: string, document: PositionLookup): ParsedFile;
}
