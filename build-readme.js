const fs = require('fs');

// Читаем package.json
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Читаем README.md
let readme = fs.readFileSync('README.md', 'utf8');

// Заменяем версию в команде установки
readme = readme.replace(
  /code --install-extension uuid-navigator-\d+\.\d+\.\d+\.vsix/g,
  `code --install-extension uuid-navigator-${pkg.version}.vsix`
);

// Записываем обновленный README.md
fs.writeFileSync('README.md', readme);

console.log(`Updated install command to version ${pkg.version}`);