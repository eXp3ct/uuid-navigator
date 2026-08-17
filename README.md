# UUID Navigator для VS Code

![Логотип](https://raw.githubusercontent.com/eXp3ct/uuid-navigator/master/images/icon.png)  
Расширение для работы с UUID в SQL-файлах: подсветка, навигация и управление связями объектов.

## 📦 Установка

1. **Магазин VS Code**:  
   Найти "UUID Navigator" в Marketplace и установить.

2. **Вручную (из .vsix)**:
   ```bash
   code --install-extension uuid-navigator-1.12.0.vsix
   ```

## 🚀 Возможности

### Основной функционал
- **Интеллектуальная подсветка** UUID с настройкой цветов
- **Поддержка форматов конфигов**: `.sql`-миграции, а также YAML (`*.class.yaml`, `*.object.yaml`) и JSON (`*.class.json`, `*.object.json`)
- **Полноценное дерево классов**:
  - Иерархическое отображение классов/свойств/объектов
  - Управление алиасами (ПКМ на класс → "Установить алиас")
  - Автоматическая привязка объектов и свойств через class_id/алиасы/имена папок, с fuzzy-фолбэком по схожести имён
- **Глубокая навигация**:
  - Переход к определению из дерева
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
Нажмите Ctrl+ЛКМ на UUID → откроется список всех его вхождений.

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

📜 Лицензия
[MIT](LICENSE) 
