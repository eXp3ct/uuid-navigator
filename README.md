# UUID Navigator для VS Code

![Логотип](https://raw.githubusercontent.com/eXp3ct/uuid-navigator/master/images/icon.png)\
Расширение для удобной работы с UUID в SQL-файлах: подсветка, навигация и поиск.

## 📦 Установка

1. **Магазин VS Code**:  
   Найти "UUID Navigator" в Marketplace и установить.

2. **Вручную (из .vsix)**:
   ```bash
   code --install-extension uuid-navigator-{{version}}.vsix
   ```

## 🚀 Возможности

### Основные функции
1. Подсветка UUID в SQL-файлах

2. Навигация по Ctrl+ЛКМ (показывает все вхождения UUID)

3. Дерево классов и свойств с возможностью вставки UUID

4. Информация при наведении (класс, свойство, тип данных, описание)

5. Быстрая навигация к определению UUID
  
6. Валидация внутренних json конфигураций

### Дополнительные возможности
1. Автоматическое обновление кэша при изменении SQL-файлов

2. Поддержка работы с большими проектами (оптимизированный парсинг)

3. Гибкая настройка отображения информации

4. Команды для работы с UUID через Command Palette

### Сниппеты
Для перемещения по заглушкам используйте `Tab`

1. `bmc-class` - Добавление класса
   
2. `bmc-prop` - Добавление свойства
   
3. `bmc-link` - Добавление привязки свойства к классу
   
4. `bmc-main-forms` - Добавление формы просмотра, создания и редактирования
   
5. `bmc-form` - Добавление формы, с заданным названием
    
6.  `bmc-grid` - Добавление грида
    
7.  `bmc-workflow` - Добавление workflow

## 🛠 Настройки
Откройте `Настройки → Расширения → UUID Navigator:`

| Настройка           | По умолчанию | Описание |
| ------------------- | ------------ | -------- |
| `highlightColor`    | `#569CD6` | Цвет текста UUID |
| `backgroundColor`   | `#64c8ff1a` | Фон UUID (HEX с прозрачностью) |
| `underline`         | `true` | Подчеркивание UUID |
| `showNotifications` | `false` | Показывать уведомления при поиске |
| `showBlameOnHover`  | `true` | Показывать информацию при наведении |
| `blameTemplate`     | `['type', 'className', 'classUuid', 'uuid', 'propertyName', 'description', 'dataType', 'goToButton']` | Шаблон отображения информации |
| `cursorPointer` | `true` | Курсор-указатель при наведеннии на uuid |
| `enableValidation` | `true` | Проверка синтаксиса |
| `validateJson` | `true` | Проверка синтаксиса json |

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
### Command Palette (Ctrl+Shift+P)
* **Find all UUIDs** - подсветить все UUID в текущем файле

* **UUID Navigator: Show Explorer** - показать дерево классов и свойств

* **UUID Navigator: Refresh Explorer** - обновить данные

* **UUID Navigator: Clear Highlights** - очистить подсветку

### Работа с деревом
* **Вставка UUID** - кликните на элемент в дереве для вставки его UUID

* **Обновление данных** - кнопка обновления или команда "Refresh Explorer"

* **Фильтрация** - используйте поиск в верхней части дерева

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
