import * as vscode from 'vscode';
import { ParsedFile } from '../models';

export interface ConfigFileParser {
  canHandle(filePath: string): boolean;
  parseFile(filePath: string, content: string, document: vscode.TextDocument): ParsedFile;
}
