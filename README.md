# UUID Navigator для VS Code

![Логотип](https://raw.githubusercontent.com/eXp3ct/uuid-navigator/master/images/icon.png)  
Расширение для работы с UUID в SQL-файлах: подсветка, навигация и управление связями объектов.

## 📦 Установка

1. **Магазин VS Code**:  
   Найти "UUID Navigator" в Marketplace и установить.

2. **Вручную (из .vsix)**:
   ```bash
   code --install-extension uuid-navigator-1.13.0.vsix
   ```

## 🚀 Возможности

### Основной функционал
- **Интеллектуальная подсветка** UUID с настройкой цветов
- **Поддержка форматов конфигов**: `.sql`-миграции, а также YAML и JSON конфиги `*.class.yaml|json`, `*.object.yaml|json`, `*.role.yaml|json` (подробнее — в разделе «Поддерживаемые форматы»)
- **Полноценное дерево классов**:
  - Иерархическое отображение классов/свойств/объектов
  - Управление алиасами (ПКМ на класс → "Установить алиас")
  - Автоматическая привязка объектов и свойств: явный class_id, класс из того же каталога, имя папки/алиас, fuzzy-фолбэк по схожести имён (порядок — в разделе «Привязка объектов и свойств к классам»)
- **Глубокая навигация**:
  - Переход к определению из дерева и по Ctrl+ЛКМ — в SQL, YAML и JSON
  - Поиск всех вхождений UUID (Ctrl+ЛКМ)
- **Контекстная информация**:
  - Подробные tooltip'ы при наведении
  - Настраиваемый шаблон отображения

### Дополнительные возможности
1. Автоматическое обновление кэша при изменении SQL-файлов

2. Поддержка работы с большими проектами (оптимизированный парсинг)

3. Гибкая настройка отображения информации


### Сниппеты
Для перемещения по заглушкам используйте `Tab`

1. `bmc-class` - Добавление класса
   
2. `bmc-prop` - Добавление свойства
   
3. `bmc-link` - Добавление привязки свойства к классу
   
4. `bmc-main-forms` - Добавление формы просмотра, создания и редактирования
   
5. `bmc-form` - Добавление формы, с заданным названием
    
6. `bmc-grid` - Добавление грида
    
7. `bmc-workflow` - Добавление workflow

## 📂 Поддерживаемые форматы
Расширение читает те же файлы, что и загрузчик конфигураций платформы:

| Формат | Файлы |
| ------ | ----- |
| SQL | `*.sql` (`INSERT` в `classes`, `property_definitions`, `classes_property_definitions`, `objects`, `public.roles`) |
| YAML | `*.class.yaml`, `*.object.yaml`, `*.role.yaml` |
| JSON | `*.class.json`, `*.object.json`, `*.role.json` |

- Корень файла может быть как одним объектом, так и списком объектов (в YAML — `- id: ...`, в JSON — массив)
- Имена полей не зависят от регистра (`classId` и `ClassId`), локализованные `name`/`description` читаются как строка или как словарь `ru-RU` → `ru` → `__default` → первое значение
- Определения свойств в классе могут быть заданы как по GUID, так и по алиасу из секции `aliases`; если `type` класса не указан, используется `2`
- Расширение `.yml` **не поддерживается**: платформа такие файлы не загружает, поэтому и расширение их игнорирует
- Если один и тот же id описан и в SQL, и в YAML/JSON, приоритет у YAML/JSON; файлы в `bin/`, `obj/`, `node_modules/` и `.git/` не читаются

## 🔗 Привязка объектов и свойств к классам
Объекты привязываются к классу в таком порядке (берётся первый подходящий вариант):

1. Явный `classId` (`class_id` в SQL). Класс статусов из настройки `ignoreUuid` пропускается, если включён `ignoreStatus`
2. Класс, определённый в том же каталоге, что и файл объекта (если в каталоге ровно один класс)
3. Имя папки, совпадающее с именем класса или алиасом
4. Fuzzy-поиск по имени папки (если включён `fuzzyClassMatching`)
5. Объекты, которым не нашёлся класс, попадают в класс статусов

Свойства без явной связи в `classes_property_definitions` привязываются по тому же принципу: класс из того же каталога → имя папки/алиас → fuzzy.

## 🛠 Настройки
Откройте `Настройки → Расширения → UUID Navigator:`

| Настройка           | По умолчанию | Описание |
| ------------------- | ------------ | -------- |
| `highlightColor`    | `#569CD6` | Цвет текста UUID |
| `backgroundColor`   | `#64c8ff1a` | Фон UUID (HEX с прозрачностью) |
| `underline`         | `true` | Подчеркивание UUID |
| `showNotifications` | `false` | Показывать уведомления при поиске |
| `showBlameOnHover`  | `true` | Показывать информацию при наведении |
| `blameTemplate`     | `['type', 'className', 'classUuid', 'classType','uuid', 'propertyName', 'description', 'dataType', 'goToButton']` | Шаблон отображения информации |
| `cursorPointer` | `true` | Курсор-указатель при наведеннии на uuid |
| `enableValidation` | `true` | Проверка синтаксиса |
| `validateJson` | `true` | Проверка синтаксиса json |
| `ignoreStatus` | `true` | Игнорирование класса `Статусы` при привязке объектов |
| `ignoreUuid` | `b2d437bc-af8e-4d75-ac25-70f481251233` | UUID класса `Статусы` |
| `fuzzyClassMatching` | `true` | Fuzzy-поиск класса по имени папки/алиасу, если точное совпадение не найдено |
| `fuzzyClassMatchThreshold` | `0.82` | Порог схожести (0-1) для fuzzy-поиска класса |
| `autoLinking` | `true` | Автоматическая привязка специальных свойств ко всем справочным классам |
| `autoLinkedProperties` | `{name: string, uuid: string: classId: string \| null}` | Перечень свойств для автоматической привязки |

**Пример настроек**
```json
{
  "uuidNavigator.highlightColor": "#C586C0",
  "uuidNavigator.backgroundColor": "#ff69b410",
  "uuidNavigator.underline": false,
  "uuidNavigator.blameTemplate": [
    "type",
    "className",
    "propertyName",
    "goToButton"
  ]
}
```

## 🎯 Как пользоваться
### Основные команды
1. **Автоподсветка UUID**\
UUID автоматически выделяются в SQL-файлах.

2. **Навигация по UUID**\
Нажмите Ctrl+ЛКМ на UUID → откроется список всех его вхождений. Переход к определению (Go to definition / Ctrl+ЛКМ) работает в SQL, YAML и JSON файлах.

3. **Дерево классов и свойств**\
Откройте боковую панель "UUID Explorer" для просмотра всех классов и свойств.

4. **Информация при наведении**\
Наведите курсор на UUID, чтобы увидеть детальную информацию.

5. **Сниппеты**\
Начните писать `bmc...` и `vscode` выдаст предложенные сниппеты
### Все команды (Command Palette)
| Команда | Назначение |
|---------|------------|
| `uuid-navigator.findUuids` | Подсветить UUID в текущем файле |
| `uuid-navigator.clearHighlights` | Очистить подсветку |
| `uuid-navigator.refreshBlameCache` | Обновить кэш метаданных |
| `uuid-navigator.showExplorer` | Показать панель навигации |
| `uuid-navigator.refreshExplorer` | Перезагрузить дерево классов |
| `uuid-navigator.insertUuid` | Вставить UUID в редактор |
| `uuid-navigator.focusTreeView` | Фокус на дерево навигации |
| `uuid-navigator.goToDefinition` | Перейти к определению |
| `uuid-navigator.validateCurrentFile` | Проверить текущий файл |
| `uuid-navigator.showValidatorLogs` | Показать логи валидации |
| `uuid-navigator.manageClassAliases` | Управление алиасами класса |
| `uuid-navigator.clearAllAliases` | Очистить все алиасы |

### Работа с деревом
* **Вставка UUID** - кликните на элемент в дереве для вставки его UUID

* **Обновление данных** - кнопка обновления или команда "Refresh Explorer"

* **Переход к определению** - ПКМ по записи -> Go to definition 
* **Установка alias** - ПКМ по записи -> Mange class alias

## 🔨 Разработка
1. **Клонируйте репозиторий**:

```bash
git clone https://github.com/eXp3ct/uuid-navigator.git
cd uuid-navigator
```
2. **Установите зависимости:**

```bash
yarn install
```
3. Запустите в режиме разработки:

4. Нажмите F5 в VS Code

Нужен Node.js 20 (`.nvmrc`). Проверки локально: `yarn lint`, `yarn unit-test`, `yarn build`.

### Релизы
Версию и CHANGELOG руками поднимать не нужно. Изменения пишутся в секцию `## [Unreleased]` в `CHANGELOG.md`, а после слияния PR в `main` workflow **Release**:
- поднимает версию от опубликованной в Marketplace: `minor`, если в `[Unreleased]` есть `### Added`, иначе `patch` (версия, уже поднятая руками в `package.json`, сохраняется);
- переименовывает `[Unreleased]` в выпускаемую версию, публикует расширение, ставит тег и создаёт GitHub Release с заметками только этой версии;
- коммитит версию в `main` и подтягивает `main` в `dev`.

Переопределить уровень — лейблы PR `release:major` / `release:minor` / `release:patch`; не выпускать — лейбл `release:skip` или `[skip publish]` в заголовке PR. Выпустить вручную — **Actions → Release → Run workflow**.

📜 Лицензия
[MIT](LICENSE) 
