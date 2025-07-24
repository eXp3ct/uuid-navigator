# UUID Navigator для VS Code

![Логотип](https://raw.githubusercontent.com/eXp3ct/uuid-navigator/master/images/icon.png)\
Расширение для удобной работы с UUID в SQL-файлах: подсветка, навигация и поиск.

## 📦 Установка

1. **Магазин VS Code**:  
   Найти "UUID Navigator" в Marketplace и установить.

2. **Вручную (из .vsix)**:
   ```bash
   code --install-extension uuid-navigator-1.0.0.vsix
   ```

## 🚀 Возможности
1. Подсветка UUID в SQL-файлах

2. Навигация по Ctrl+ЛКМ (показывает все вхождения UUID)

3. Поиск всех UUID в файле через Command Palette

4. Гибкие настройки цветов и стилей

## 🛠 Настройки
Откройте `Настройки → Расширения → UUID Navigator:`

| Настройка	| По умолчанию |Описание |
|-----------|--------------|---------|
| `highlightColor`|	`#569CD6` | Цвет текста UUID | 
| `backgroundColor` |`#64c8ff1a` | Фон UUID (HEX с прозрачностью) |
| `underline`	| `true`	| Подчеркивание UUID |
| `showNotifications` | `true` |	Показывать уведомления при поиске |

**Пример настроек**
```json
{
  "uuidNavigator.highlightColor": "#C586C0",
  "uuidNavigator.backgroundColor": "#ff69b410",
  "uuidNavigator.underline": false
}
```

## 🎯 Как пользоваться
1. **Автоподсветка:**
UUID автоматически выделяются в SQL-файлах.

2. **Навигация:**
Нажмите Ctrl+ЛКМ на UUID → откроется список всех его вхождений.

2. **Поиск в файле:**
Откройте Command Palette (`Ctrl+Shift+P`) → `Find all UUIDs.`


## 🔨 Разработка
1. **Клонируйте репозиторий**:

```bash
git clone https://github.com/your-repo/uuid-navigator.git
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
