const fs = require('fs');
const path = require('path');

// Читаем package.json
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Читаем README.md
let readme = fs.readFileSync('README.md', 'utf8');

// Заменяем шаблон на версию
readme = readme.replace(/\{\{version\}\}/g, pkg.version);

// Записываем обновленный README.md
fs.writeFileSync('README.md', readme);

console.log(`Updated README.md with version ${pkg.version}`);