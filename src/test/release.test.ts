const { nextVersion, bumpVersion, inferBump, updateChangelog } = require('../../scripts/release.js');

describe('release script', () => {
  describe('nextVersion', () => {
    it('bumps from the published version when package.json was not bumped', () => {
      expect(nextVersion({ current: '1.13.0', published: ['1.13.0', '1.11.0'], bump: 'patch' })).toBe('1.13.1');
      expect(nextVersion({ current: '1.13.0', published: ['1.13.0'], bump: 'minor' })).toBe('1.14.0');
      expect(nextVersion({ current: '1.13.0', published: ['1.13.0'], bump: 'major' })).toBe('2.0.0');
    });

    it('keeps a manual bump that is already above everything released', () => {
      expect(nextVersion({ current: '1.15.0', published: ['1.13.0', '1.11.0'], bump: 'patch' })).toBe('1.15.0');
    });

    it('bumps from the highest released version even if package.json is behind', () => {
      expect(nextVersion({ current: '1.11.0', published: ['1.11.0', '1.13.0'], bump: 'patch' })).toBe('1.13.1');
    });

    it('compares versions numerically, not as strings', () => {
      expect(nextVersion({ current: '1.9.0', published: ['1.10.0', '1.9.1'], bump: 'patch' })).toBe('1.10.1');
    });

    it('ignores garbage among released versions', () => {
      expect(nextVersion({ current: '1.0.0', published: ['', 'latest', '1.2.3'], bump: 'patch' })).toBe('1.2.4');
    });

    it('uses package.json as is when nothing was released yet', () => {
      expect(nextVersion({ current: '0.1.0', published: [], bump: 'patch' })).toBe('0.1.0');
    });
  });

  it('bumpVersion resets lower parts', () => {
    expect(bumpVersion('1.9.7', 'minor')).toBe('1.10.0');
    expect(bumpVersion('1.9.7', 'major')).toBe('2.0.0');
  });

  describe('inferBump', () => {
    it('is minor when Unreleased has an Added section', () => {
      expect(inferBump('# Changelog\n\n## [Unreleased]\n### Fixed\n- a\n### Added\n- b\n')).toBe('minor');
    });

    it('is patch for fixes/changes only, or without Unreleased', () => {
      expect(inferBump('# Changelog\n\n## [Unreleased]\n### Fixed\n- a\n\n## [1.0.0] - x\n### Added\n- old\n')).toBe('patch');
      expect(inferBump('# Changelog\n\n## [1.0.0] - x\n### Added\n- old\n')).toBe('patch');
    });
  });

  describe('updateChangelog', () => {
    const DATE = '2026-10-20';

    it('turns the Unreleased section into the release section and returns only its notes', () => {
      const text = [
        '# Changelog',
        '',
        '## [Unreleased]',
        '### Fixed',
        '- Исправлено А',
        '',
        '## [1.13.0] - 2026-08-17',
        '### Fixed',
        '- Старое',
        ''
      ].join('\n');

      const { changelog, notes } = updateChangelog(text, '1.13.1', DATE, 'PR title');

      expect(changelog).toContain('## [1.13.1] - 2026-10-20\n### Fixed\n- Исправлено А');
      expect(changelog).not.toContain('Unreleased');
      expect(changelog).toContain('## [1.13.0] - 2026-08-17');
      expect(notes).toBe('### Fixed\n- Исправлено А');
    });

    it('adds a section from the PR title when there is no Unreleased section', () => {
      const text = '# Changelog\n\n## [1.13.0] - 2026-08-17\n- Старое\n';

      const { changelog, notes } = updateChangelog(text, '1.13.1', DATE, 'Обновил зависимости');

      expect(changelog.indexOf('## [1.13.1]')).toBeLessThan(changelog.indexOf('## [1.13.0]'));
      expect(notes).toBe('### Changed\n- Обновил зависимости');
    });

    it('replaces an empty Unreleased section', () => {
      const text = '# Changelog\n\n## [Unreleased]\n\n## [1.13.0] - 2026-08-17\n- Старое\n';

      const { changelog } = updateChangelog(text, '1.13.1', DATE, '');

      expect(changelog).not.toContain('Unreleased');
      expect(changelog).toContain('## [1.13.1] - 2026-10-20\n### Changed\n- Мелкие исправления');
    });

    it('uses a section that was already written for this version', () => {
      const text = '# Changelog\n\n## [1.14.0] - 2026-10-19\n### Added\n- Фича\n\n## [1.13.0] - 2026-08-17\n';

      const { changelog, notes } = updateChangelog(text, '1.14.0', DATE, 'ignored');

      expect(changelog).toBe(text);
      expect(notes).toBe('### Added\n- Фича');
    });
  });
});
