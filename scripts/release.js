#!/usr/bin/env node
/**
 * Подготовка релиза для CI (без зависимостей).
 *
 * Версия: берётся максимум из опубликованной в Marketplace и последнего тега vX.Y.Z.
 * Если в package.json уже стоит версия выше — её и используем (подняли руками),
 * иначе поднимаем patch/minor/major от опубликованной. BUMP=auto (по умолчанию): minor,
 * если в `## [Unreleased]` есть `### Added`, иначе patch.
 *
 * CHANGELOG: секция `## [Unreleased]` превращается в `## [X.Y.Z] - YYYY-MM-DD`.
 * Если её нет (или она пустая) — добавляется секция с заголовком PR.
 * Заметки к релизу (только эта версия) пишутся в RELEASE_NOTES.md.
 *
 * Использование:
 *   BUMP=auto|patch|minor|major PUBLISHED_VERSION=1.13.0 RELEASE_TITLE="..." node scripts/release.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function parseVersion(value) {
  const match = SEMVER.exec(String(value || '').trim().replace(/^v/, ''));
  return match ? match.slice(1, 4).map(Number) : null;
}

function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) { return left[i] - right[i]; }
  }
  return 0;
}

function maxVersion(versions) {
  return versions.filter(parseVersion).reduce((max, v) => (!max || compareVersions(v, max) > 0 ? v : max), null);
}

function bumpVersion(version, bump) {
  const [major, minor, patch] = parseVersion(version);
  if (bump === 'major') { return `${major + 1}.0.0`; }
  if (bump === 'minor') { return `${major}.${minor + 1}.0`; }
  return `${major}.${minor}.${patch + 1}`;
}

/** Следующая версия: ручная, если она выше уже выпущенных, иначе bump от максимальной выпущенной. */
function nextVersion({ current, published = [], bump = 'patch' }) {
  const released = maxVersion(published);
  if (!released) { return current; }
  return compareVersions(current, released) > 0 ? current : bumpVersion(released, bump);
}

const VERSION_HEADER = /^## \[([^\]]+)\]/;

/** Делит CHANGELOG на шапку и секции `## [...]`. */
function splitChangelog(text) {
  const lines = text.split('\n');
  const sections = [];
  let head = [];
  let current = null;

  for (const line of lines) {
    const match = VERSION_HEADER.exec(line);
    if (match) {
      current = { name: match[1], header: line, body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    } else {
      head.push(line);
    }
  }

  return { head, sections };
}

function joinChangelog({ head, sections }) {
  return [...head, ...sections.flatMap(s => [s.header, ...s.body])].join('\n');
}

function hasContent(lines) {
  return lines.some(line => line.trim() !== '');
}

/** auto: новая функциональность (`### Added` в Unreleased) — minor, остальное — patch. */
function inferBump(text) {
  const unreleased = splitChangelog(text).sections.find(s => s.name.toLowerCase() === 'unreleased');
  return unreleased && unreleased.body.some(line => /^###\s+Added\b/i.test(line)) ? 'minor' : 'patch';
}

/** Возвращает обновлённый CHANGELOG и заметки к релизу этой версии. */
function updateChangelog(text, version, date, title) {
  const changelog = splitChangelog(text);
  const existing = changelog.sections.find(s => s.name === version);
  if (existing) {
    // Секцию версии уже написали руками
    changelog.sections = changelog.sections.filter(s => s.name.toLowerCase() !== 'unreleased' || hasContent(s.body));
    return { changelog: joinChangelog(changelog), notes: existing.body.join('\n').trim() };
  }

  const header = `## [${version}] - ${date}`;
  const unreleased = changelog.sections.find(s => s.name.toLowerCase() === 'unreleased');

  if (unreleased && hasContent(unreleased.body)) {
    unreleased.name = version;
    unreleased.header = header;
    return { changelog: joinChangelog(changelog), notes: unreleased.body.join('\n').trim() };
  }

  const body = ['### Changed', `- ${title || 'Мелкие исправления'}`, ''];
  const section = { name: version, header, body };
  changelog.sections = [section, ...changelog.sections.filter(s => s !== unreleased)];
  return { changelog: joinChangelog(changelog), notes: body.join('\n').trim() };
}

function gitTags(cwd) {
  try {
    return execSync('git tag --list "v*"', { cwd, encoding: 'utf8' }).split('\n').map(t => t.trim().replace(/^v/, ''));
  } catch {
    return [];
  }
}

function main() {
  const root = path.resolve(__dirname, '..');
  const packagePath = path.join(root, 'package.json');
  const changelogPath = path.join(root, 'CHANGELOG.md');

  const changelogText = fs.readFileSync(changelogPath, 'utf8');
  const requested = (process.env.BUMP || 'auto').toLowerCase();
  if (!['auto', 'patch', 'minor', 'major'].includes(requested)) {
    throw new Error(`Unknown BUMP "${requested}", expected auto|patch|minor|major`);
  }
  const bump = requested === 'auto' ? inferBump(changelogText) : requested;

  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const published = [process.env.PUBLISHED_VERSION, ...gitTags(root)].filter(Boolean);
  const version = nextVersion({ current: pkg.version, published, bump });
  const date = new Date().toISOString().slice(0, 10);

  if (pkg.version !== version) {
    pkg.version = version;
    fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
  }

  const { changelog, notes } = updateChangelog(changelogText, version, date, process.env.RELEASE_TITLE);
  fs.writeFileSync(changelogPath, changelog);
  fs.writeFileSync(path.join(root, 'RELEASE_NOTES.md'), notes + '\n');

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  }
  console.log(`${version} (bump: ${bump})`);
}

if (require.main === module) {
  main();
}

module.exports = { nextVersion, bumpVersion, compareVersions, inferBump, updateChangelog };
