const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const fs = require('fs');
const db = require('./db/database');
const config = require('./config');
const { requireAuth, requireAdmin, requireMentorOrAdmin } = require('./middleware/auth');

// Логирование в файл для отладки на хостинге
const logFile = path.join(__dirname, 'debug.log');
const log = (message) => {
  try {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
  } catch (e) {
    // Игнорируем ошибки логирования
  }
};

// Импорт маршрутов
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const mentorRoutes = require('./routes/mentor');
const studentRoutes = require('./routes/student');
const apiRoutes = require('./routes/api');

const app = express();

// Логирование запуска
log('=== MTRACKER APP START ===');
log(`ENV: PORT=${process.env.PORT}, HOSTNAME=${process.env.HOSTNAME}, NODE_ENV=${process.env.NODE_ENV}`);
log(`Config: port=${config.port}, hostname=${config.hostname}`);

// Настройка шаблонизатора EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// Парсинг тела запроса
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Инициализация сессий с хранением в SQLite
const sessionOptions = {
  store: new SQLiteStore({ 
    db: 'sessions.db', 
    dir: './db' 
  }),
  secret: config.session.secret,
  resave: config.session.resave,
  saveUninitialized: config.session.saveUninitialized,
  cookie: config.session.cookie
};

app.use(session(sessionOptions));

// Передача пользователя во все шаблоны
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.role = req.session.role || null;
  next();
});

// Маршруты
app.get('/', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  
  const redirectPaths = {
    admin: '/admin/dashboard',
    mentor: '/mentor/dashboard',
    student: '/student/dashboard'
  };
  
  res.redirect(redirectPaths[req.session.role] || '/login');
});

app.use('/login', authRoutes);
app.use('/admin', requireAuth, requireAdmin, adminRoutes);
app.use('/mentor', requireAuth, requireMentorOrAdmin, mentorRoutes);
app.use('/student', requireAuth, studentRoutes);
app.use('/api', apiRoutes);

// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
  log('Ошибка: ' + err.message);
  log(err.stack);
  res.status(500).render('error', { message: 'Внутренняя ошибка сервера' });
});

// Инициализация БД и запуск сервера
db.initialize()
  .then(() => {
    log('База данных инициализирована');
    app.listen(config.port, config.hostname, () => {
      log(`Сервер запущен на ${config.hostname}:${config.port}`);
      console.log(`Сервер запущен на порту ${config.port}`);
    });
  })
  .catch(err => {
    log('КРИТИЧЕСКАЯ ОШИБКА инициализации БД: ' + err.message);
    log(err.stack);
    console.error('Ошибка инициализации БД:', err);
    process.exit(1);
  });

// Обработка неза пойманных исключений
process.on('uncaughtException', (err) => {
  log('UNCAUGHT EXCEPTION: ' + err.message);
  log(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log('UNHANDLED REJECTION: ' + (reason && reason.message ? reason.message : reason));
  process.exit(1);
});

module.exports = app;
