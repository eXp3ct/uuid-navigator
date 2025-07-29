import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';
import { getConfig } from './settings';

export class SqlValidator {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private statusBarItem: vscode.StatusBarItem;
  private outputChannel: vscode.OutputChannel;
  private config: ReturnType<typeof getConfig>;

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('sql-validator');
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.text = '$(database) SQL Validator';
    this.outputChannel = vscode.window.createOutputChannel('SQL Validator');
    this.config = getConfig();

    // Подписываемся на изменения конфигурации
    vscode.workspace.onDidChangeConfiguration(() => {
      this.config = getConfig();
    });
  }

  public async validateDocument(document: vscode.TextDocument): Promise<void> {
    // Проверяем глобальный флаг валидации
    if (!this.config.enableValidation || document.languageId !== 'sql') {
      this.clearDiagnostics(document.uri);
      return;
    }

    this.statusBarItem.show();
    this.outputChannel.clear();
    this.diagnosticCollection.delete(document.uri);

    try {
      const startTime = Date.now();
      const diagnostics: vscode.Diagnostic[] = [];

      // Проверяем JSON только если включено в настройках
      if (this.config.validateJson) {
        this.validateJsonStructures(document, diagnostics);
      }

      this.diagnosticCollection.set(document.uri, diagnostics);

      const elapsedTime = Date.now() - startTime;
      const issueCount = diagnostics.length;

      this.outputChannel.appendLine(`Validation completed in ${elapsedTime}ms`);
      this.outputChannel.appendLine(`Found ${issueCount} issues`);

      this.updateStatusBar(issueCount);
    } catch (error) {
      this.outputChannel.appendLine(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
      this.statusBarItem.text = '$(error) SQL Validator: Error';
      this.statusBarItem.tooltip = 'Error during validation';
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }
  }

  private validateJsonStructures(document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
    const text = document.getText();
    const jsonPattern = /'((?:[^']|'')*?)'\s*::\s*jsonb/gi;
    let match: RegExpExecArray | null;

    while ((match = jsonPattern.exec(text)) !== null) {
      try {
        const jsonStr = match[1].replace(/''/g, "'");
        const errors: jsonc.ParseError[] = [];
        jsonc.parse(jsonStr, errors);

        if (errors.length > 0) {
          const error = errors[0];
          const jsonStartPos = match.index + 1; // +1 чтобы пропустить первую кавычку

          // Находим строку с ошибкой в исходном документе
          const errorLine = this.getLineAtPosition(document, jsonStartPos + error.offset);
          const range = new vscode.Range(
            new vscode.Position(errorLine.line, 0),
            new vscode.Position(errorLine.line, errorLine.text.length)
          );

          const diagnostic = new vscode.Diagnostic(
            range,
            `Invalid JSON: ${this.formatJsonError(error, jsonStr)}`,
            vscode.DiagnosticSeverity.Error
          );
          diagnostic.source = 'sql-validator';
          diagnostics.push(diagnostic);
        }
      } catch (error) {
        console.error('Error validating JSON:', error);
      }
    }
  }

  private getLineAtPosition(document: vscode.TextDocument, position: number): { line: number, text: string } {
    const line = document.positionAt(position).line;
    return {
      line,
      text: document.lineAt(line).text
    };
  }

  private formatJsonError(error: jsonc.ParseError, jsonStr: string): string {
    // Вычисляем строку и колонку ошибки вручную
    let line = 1;
    let column = 1;

    for (let i = 0; i < error.offset && i < jsonStr.length; i++) {
      if (jsonStr[i] === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
    }

    // Получаем строку с ошибкой
    const lines = jsonStr.split('\n');
    const errorLine = lines[line - 1] || '';

    return `${jsonc.printParseErrorCode(error.error)} at position ${error.offset} (line ${line}, column ${column}): ${errorLine}`;
  }

  private updateStatusBar(issueCount: number): void {
    if (issueCount === 0) {
      this.statusBarItem.text = '$(pass-filled) SQL Valid: No issues';
      this.statusBarItem.tooltip = 'No validation issues found';
      this.statusBarItem.backgroundColor = undefined;
    } else {
      this.statusBarItem.text = `$(error) SQL Valid: ${issueCount} issues`;
      this.statusBarItem.tooltip = `${issueCount} validation issues found`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }
  }

  public clearDiagnostics(uri: vscode.Uri): void {
    this.diagnosticCollection.delete(uri);
  }

  public showOutput(): void {
    this.outputChannel.show();
  }

  public dispose(): void {
    this.diagnosticCollection.dispose();
    this.statusBarItem.dispose();
    this.outputChannel.dispose();
  }
}