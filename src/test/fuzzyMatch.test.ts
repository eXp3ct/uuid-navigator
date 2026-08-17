import { findBestFuzzyMatch, levenshteinDistance, normalizeForMatching, similarity } from '../fuzzyMatch';

describe('normalizeForMatching', () => {
  it('lowercases, trims, collapses whitespace and turns punctuation into a separator', () => {
    expect(normalizeForMatching('  Работа-Заявки!!  ')).toBe('работа заявки');
    expect(normalizeForMatching('Тип   обращения')).toBe('тип обращения');
  });
});

describe('levenshteinDistance', () => {
  it('is 0 for identical strings', () => {
    expect(levenshteinDistance('abc', 'abc')).toBe(0);
  });

  it('handles empty strings', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });

  it('counts single-character edits', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });
});

describe('similarity', () => {
  it('is 1 for identical text after normalization (case/whitespace/punctuation)', () => {
    expect(similarity('Работы', 'работы')).toBe(1);
    expect(similarity('Тип обращения', 'Тип  обращения')).toBe(1);
    expect(similarity('Отдел-Продаж', 'отдел продаж')).toBe(1);
  });

  it('gives a high score for a typo', () => {
    expect(similarity('Сотрудники', 'Сотрудннки')).toBeGreaterThan(0.85);
  });

  it('gives a high score when one name fully contains the other', () => {
    expect(similarity('Отпуска', 'Мои отпуска')).toBeGreaterThanOrEqual(0.85);
  });

  it('scores unrelated names low', () => {
    expect(similarity('Сотрудники', 'Финансы')).toBeLessThan(0.5);
  });

  it('does not consider genuinely different words a match, even related ones', () => {
    // Реальный случай из конфигов: папка "Работа заявки", класс "Работы" — разные
    // слова, а не опечатка/регистр/пунктуация. Это специально НЕ должно матчиться
    // фаззи-порогом по умолчанию — для таких случаев остаётся ручной alias.
    expect(similarity('Работа заявки', 'Работы')).toBeLessThan(0.7);
  });
});

describe('findBestFuzzyMatch', () => {
  const candidates = [
    { key: 'работы', item: 'cls-works' },
    { key: 'сотрудники', item: 'cls-employees' },
    { key: 'финансы', item: 'cls-finance' }
  ];

  it('returns the best match above threshold', () => {
    expect(findBestFuzzyMatch('Сотрудннки', candidates, 0.8)).toBe('cls-employees');
  });

  it('returns null when nothing clears the threshold', () => {
    expect(findBestFuzzyMatch('Совершенно другое', candidates, 0.8)).toBeNull();
  });

  it('picks the highest-scoring candidate when multiple qualify', () => {
    const closeCandidates = [
      { key: 'работа', item: 'a' },
      { key: 'работы', item: 'b' }
    ];
    expect(findBestFuzzyMatch('работы', closeCandidates, 0.5)).toBe('b');
  });
});
