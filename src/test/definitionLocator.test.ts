import { findDefinitionOffset } from '../definitionLocator';

const ID = 'a5b6c7d8-e9f0-4a1b-2c3d-4e5f6a7b8c9d';
const OTHER = '67900f8f-2200-4806-9e94-ee882eeb5851';

describe('findDefinitionOffset', () => {
  it('находит uuid в SQL в одинарных кавычках (offset без кавычки)', () => {
    const text = `INSERT INTO t VALUES ('${OTHER}', '${ID}')`;
    const offset = findDefinitionOffset(text, ID);
    expect(offset).toBe(text.indexOf(ID));
    expect(text.slice(offset, offset! + ID.length)).toBe(ID);
  });

  it('предпочитает значение в кавычках голому вхождению', () => {
    const text = `-- ${ID}\nSELECT '${ID}'`;
    expect(findDefinitionOffset(text, ID)).toBe(text.indexOf(`'${ID}'`) + 1);
  });

  it('находит неквотированный id в YAML', () => {
    const text = `-\n  id: ${ID}\n  name: Создана\n`;
    expect(findDefinitionOffset(text, ID)).toBe(text.indexOf(ID));
  });

  it('находит id в JSON с двойными кавычками', () => {
    const text = `{\n  "Id": "${ID}",\n  "Name": "X"\n}`;
    expect(findDefinitionOffset(text, ID)).toBe(text.indexOf(ID));
  });

  it('принимает корректный hint (на uuid)', () => {
    const text = `a: ${ID}\nb: ${ID}\n`;
    const second = text.lastIndexOf(ID);
    expect(findDefinitionOffset(text, ID, second)).toBe(second);
  });

  it('принимает hint на открывающей кавычке и возвращает старт uuid', () => {
    const text = `{"id": "${ID}", "ref": "${ID}"}`;
    const second = text.lastIndexOf(`"${ID}"`);
    expect(findDefinitionOffset(text, ID, second)).toBe(second + 1);
  });

  it('принимает hint на одинарной кавычке', () => {
    const text = `x '${ID}' y '${ID}'`;
    const second = text.lastIndexOf(`'${ID}'`);
    expect(findDefinitionOffset(text, ID, second)).toBe(second + 1);
  });

  it('игнорирует устаревший/неверный hint и ищет по тексту', () => {
    const text = `-- comment\nINSERT VALUES ('${ID}')`;
    expect(findDefinitionOffset(text, ID, 3)).toBe(text.indexOf(ID));
  });

  it('hint, указывающий на другой uuid, игнорируется', () => {
    const text = `id: ${OTHER}\nid: ${ID}\n`;
    expect(findDefinitionOffset(text, ID, text.indexOf(OTHER))).toBe(text.indexOf(ID));
  });

  it('hint за пределами текста и отрицательный игнорируются', () => {
    const text = `id: ${ID}`;
    expect(findDefinitionOffset(text, ID, 10_000)).toBe(text.indexOf(ID));
    expect(findDefinitionOffset(text, ID, -5)).toBe(text.indexOf(ID));
    expect(findDefinitionOffset(text, ID, text.length)).toBe(text.indexOf(ID));
  });

  it('регистронезависимый поиск', () => {
    const text = `id: ${ID.toUpperCase()}`;
    expect(findDefinitionOffset(text, ID)).toBe(text.indexOf(ID.toUpperCase()));
    expect(findDefinitionOffset(text, ID.toUpperCase(), 4)).toBe(4);
  });

  it('возвращает undefined, если uuid нет', () => {
    expect(findDefinitionOffset(`id: ${OTHER}`, ID)).toBeUndefined();
    expect(findDefinitionOffset('', ID)).toBeUndefined();
    expect(findDefinitionOffset(`id: ${ID}`, '')).toBeUndefined();
  });

  it('не матчит uuid как часть более длинной hex-последовательности', () => {
    expect(findDefinitionOffset(`id: ${ID}0`, ID)).toBeUndefined();
    expect(findDefinitionOffset(`id: f${ID}`, ID)).toBeUndefined();
    expect(findDefinitionOffset(`id: ${ID}-1234`, ID)).toBeUndefined();
    expect(findDefinitionOffset(`id: 0-${ID}`, ID)).toBeUndefined();
  });

  it('пропускает вложенное вхождение и находит настоящее', () => {
    const text = `a: ${ID}0\nb: ${ID}\n`;
    expect(findDefinitionOffset(text, ID)).toBe(text.lastIndexOf(ID));
  });
});
