function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function startsWithUuidAt(text: string, offset: number, uuid: string): boolean {
  return text.slice(offset, offset + uuid.length).toLowerCase() === uuid.toLowerCase();
}

/**
 * Находит смещение первого символа uuid (не кавычки) в тексте файла.
 * hintOffset — позиция из парсера; для SQL она может быть сдвинута
 * (парсер работает по нормализованному тексту), поэтому проверяется.
 */
export function findDefinitionOffset(text: string, uuid: string, hintOffset?: number): number | undefined {
  if (!uuid) {
    return undefined;
  }

  if (hintOffset !== undefined && Number.isInteger(hintOffset) && hintOffset >= 0 && hintOffset < text.length) {
    if (startsWithUuidAt(text, hintOffset, uuid)) {
      return hintOffset;
    }
    const first = text[hintOffset];
    if ((first === '\'' || first === '"') && startsWithUuidAt(text, hintOffset + 1, uuid)) {
      return hintOffset + 1;
    }
  }

  const escaped = escapeRegExp(uuid);

  const quoted = new RegExp(`'${escaped}'`, 'i').exec(text);
  if (quoted) {
    return quoted.index + 1;
  }

  const bare = new RegExp(`(?<![0-9a-f-])${escaped}(?![0-9a-f-])`, 'i').exec(text);
  return bare ? bare.index : undefined;
}
