# Инструкция по установке на Beget (mtrecker.tagir75.ru)

## 📋 Предварительные требования

1. У вас уже создан поддомен `mtrecker.tagir75.ru` в панели Beget
2. Сайт привязан к поддомену в разделе "Сайты"
3. Node.js v20 установлен в `~/.local/bin/node` (инструкция ниже)

---

## 🔧 Шаг 0: Подготовка окружения (один раз)

### 0.1 Установка Node.js на Beget

Подключитесь по SSH:
```bash
ssh tagir7ow@tagir7ow.beget.tech
```

Перейдите в Docker-окружение:
```bash
ssh localhost -p 222
```

Проверьте версию Node.js:
```bash
node -v
```

Если версия старая (< 18) или отсутствует, установите актуальную:

```bash
# Создайте директорию .local если нет
mkdir -p ~/.local
cd ~/.local

# Скачайте Node.js 20.5.0 (специальная сборка для Beget)
wget "https://cp.beget.com/shared/H1crojipLBTHZbxHTvYA-ro_JXppCrB-/node-v20.5.0-bionic.tar.xz"

# Распакуйте
tar -xJf node-v20.5.0-bionic.tar.xz --strip 1

# Удалите архив
rm node-v20.5.0-bionic.tar.xz

# Проверьте установку
node -v && npm -v
```

### 0.2 Откройте доступ к ~/.local

Важно! Без этого сайт не сможет запустить Node.js:

1. В панели Beget перейдите в "Файловый менеджер"
2. Включите "Показать скрытые файлы"
3. Найдите папку `.local`
4. Выделите её → "Инструменты" → "Настроить общий доступ"
5. ✅ Поставьте галочки:
   - Чтение и запись
   - Включая вложенные папки
6. Нажмите "Открыть доступ"

### 0.3 Создайте структуру папок

```bash
cd ~/mtrecker.tagir75.ru/public_html
mkdir -p data tmp logs
chmod 755 data
chmod 755 tmp
chmod 755 logs
touch tmp/restart.txt
```

---

## 📦 Шаг 1: Загрузка проекта на хостинг

### Вариант A: Через Git (рекомендуется)

```bash
cd ~/mtrecker.tagir75.ru/public_html
git clone <URL_вашего_репозитория> .
```

### Вариант B: Через FTP/FileZilla

1. Подключитесь по FTP к `mtrecker.tagir75.ru`
2. Загрузите ВСЕ файлы из папки `mtracker/`, кроме:
   - `node_modules/`
   - `.env`
   - `db/*.db`
   - `.git/`

---

## ⚙️ Шаг 2: Настройка конфигурации

### 2.1 Отредактируйте .htaccess

Файл уже создан в репозитории, но нужно проверить пути!

Откройте `.htaccess` и убедитесь, что путь содержит **ВАШ логин Beget**:

```apache
PassengerNodejs /home/t/tagir7ow/.local/bin/node
PassengerAppRoot /home/t/tagir7ow/mtrecker.tagir75.ru/public_html
```

⚠️ **Замените `tagir7ow` на ваш фактический логин Beget!**

Узнать логин можно:
- В панели Beget (верхний правый угол)
- Командой в SSH: `whoami`

### 2.2 Настройте переменные окружения

Создайте файл `.env` в корне проекта:

```bash
nano .env
```

Содержимое:
```env
NODE_ENV=production
PORT=3000
HOSTNAME=127.0.0.1
SESSION_SECRET=<случайная_длинная_строка>
DB_PATH=/home/t/tagir7ow/mtrecker.tagir75.ru/public_html/db/mtracker.db
```

⚠️ **Замените:**
- `SESSION_SECRET` на случайную строку (например: `openssl rand -hex 32`)
- `tagir7ow` на ваш логин Beget

Или настройте переменные в панели Beget:
- Node.js → Переменные окружения
- Добавьте: `NODE_ENV`, `PORT`, `HOSTNAME`, `SESSION_SECRET`, `DB_PATH`

---

## 🚀 Шаг 3: Установка зависимостей и запуск

```bash
# Перейдите в директорию проекта
cd ~/mtrecker.tagir75.ru/public_html

# Установите зависимости (production режим)
npm ci --production

# Инициализируйте базу данных (создастся автоматически при первом запуске)

# Перезапустите приложение
touch tmp/restart.txt
```

---

## ✅ Шаг 4: Проверка работы

### 4.1 Проверьте логи

```bash
# Логи приложения
cat debug.log | tail -50

# Логи Passenger
cat ~/mtrecker.tagir75.ru/logs/passenger.log | tail -50
```

Ожидаемые сообщения:
```
=== MTRACKER APP START ===
ENV: PORT=3000, HOSTNAME=127.0.0.1, NODE_ENV=production
Подключено к SQLite
Все таблицы созданы
Создан пользователь admin с паролем admin123
База данных инициализирована
Сервер запущен на 127.0.0.1:3000
```

### 4.2 Откройте сайт

Перейдите в браузере: `http://mtrecker.tagir75.ru`

Должна открыться страница входа.

### 4.3 Первый вход

- Логин: `admin`
- Пароль: `admin123`

⚠️ **Сразу смените пароль после первого входа!**

---

## 🛠️ Обновление проекта

При внесении изменений в код:

```bash
# На хостинге
cd ~/mtrecker.tagir75.ru/public_html

# Если используете Git
git pull

# Переустановите зависимости (если обновлялся package.json)
npm ci --production

# Перезапустите приложение
touch tmp/restart.txt

# Проверьте логи
tail -f debug.log
```

---

## 🚨 Решение проблем

### Белый экран / 502 Bad Gateway

1. Проверьте логи:
   ```bash
   cat debug.log
   cat ~/mtrecker.tagir75.ru/logs/passenger.log
   ```

2. Проверьте процесс:
   ```bash
   ps aux | grep node
   ```

3. Проверьте права доступа:
   ```bash
   ls -la
   ls -la db/
   ls -la tmp/
   ```

4. Убедитесь, что `.local` открыт (шаг 0.2)

### Ошибка "Cannot find module"

```bash
npm ci --production
```

### Ошибка базы данных

Проверьте путь в `.env` или `.htaccess`:
```bash
echo $DB_PATH
cat .htaccess | grep DB_PATH
```

Убедитесь, что папка `db/` существует и имеет права 755:
```bash
ls -la db/
```

### Сессии не сохраняются

Проверьте, что папка `db/` доступна для записи:
```bash
chmod 755 db/
```

### Ошибка "EPERM: Operation not permitted"

Это ошибка потоков. Убедитесь, что:
1. Используете Node.js 20.x
2. В `.htaccess` указано `PassengerMaxPoolSize 1`

---

## 📊 Структура проекта на хостинге

```
/home/t/tagir7ow/mtrecker.tagir75.ru/
├── public_html/
│   ├── .htaccess              # Конфиг Passenger
│   ├── app.js                 # Точка входа
│   ├── package.json
│   ├── config/
│   ├── db/
│   │   ├── mtracker.db        # База данных (создается автоматически)
│   │   └── sessions.db*       # Сессии (создается автоматически)
│   ├── routes/
│   ├── middleware/
│   ├── utils/
│   ├── views/
│   ├── public/
│   ├── tmp/
│   │   └── restart.txt        # Для перезапуска
│   ├── logs/
│   └── debug.log              # Логи приложения
├── .local/                    # Node.js (в корне аккаунта)
└── logs/                      # Логи Passenger
```

---

## 💡 Полезные команды

```bash
# Просмотр логов в реальном времени
tail -f debug.log

# Перезапуск приложения
touch tmp/restart.txt

# Проверка процесса
ps aux | grep node

# Остановка всех Node.js процессов
pkill -f node

# Проверка места на диске
df -h

# Проверка размера базы
du -sh db/
```

---

## 🔐 Безопасность

1. ✅ Смените пароль администратора после первого входа
2. ✅ Установите уникальный `SESSION_SECRET`
3. ✅ Не коммитьте `.env` в Git
4. ✅ Регулярно делайте бэкап базы данных:
   ```bash
   cp db/mtracker.db db/mtracker.backup.$(date +%Y%m%d).db
   ```

---

## 📞 Контакты

Если возникли проблемы:
1. Проверьте логи (`debug.log`, `passenger.log`)
2. Убедитесь, что все шаги выполнены
3. Проверьте, что домен направлен на NS сервера Beget

Документация Beget: https://www.beget.com/ru/handbook
