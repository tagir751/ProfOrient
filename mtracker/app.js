const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./db/database');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const mentorRoutes = require('./routes/mentor');
const studentRoutes = require('./routes/student');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Настройка шаблонизатора EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// Парсинг тела запроса
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Инициализация сессий с хранением в SQLite
const sessionOptions = {
    store: new SQLiteStore({ db: 'sessions.db', dir: './db' }),
    secret: 'mtracker-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // установите true при использовании HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 часа
    }
};

app.use(session(sessionOptions));

// Middleware для проверки авторизации
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    res.redirect('/login');
}

// Middleware для проверки роли администратора
function requireAdmin(req, res, next) {
    if (req.session && req.session.role === 'admin') {
        return next();
    }
    res.status(403).send('Доступ запрещён');
}

// Middleware для проверки роли наставника или администратора
function requireMentorOrAdmin(req, res, next) {
    if (req.session && (req.session.role === 'admin' || req.session.role === 'mentor')) {
        return next();
    }
    res.status(403).send('Доступ запрещён');
}

// Передача пользователя во все шаблоны
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.role = req.session.role || null;
    next();
});

// Маршруты
app.get('/', (req, res) => {
    if (req.session.userId) {
        if (req.session.role === 'admin') {
            res.redirect('/admin/dashboard');
        } else if (req.session.role === 'mentor') {
            res.redirect('/mentor/dashboard');
        } else {
            res.redirect('/student/dashboard');
        }
    } else {
        res.redirect('/login');
    }
});

app.use('/login', authRoutes);
app.use('/admin', requireAuth, requireAdmin, adminRoutes);
app.use('/mentor', requireAuth, requireMentorOrAdmin, mentorRoutes);
app.use('/student', requireAuth, studentRoutes);
app.use('/api', apiRoutes);

// Обработка ошибок 404
app.use((req, res) => {
    res.status(404).render('error', { message: 'Страница не найдена' });
});

// Инициализация БД и запуск сервера
db.initialize().then(() => {
    app.listen(PORT, () => {
        console.log(`Сервер запущен на порту ${PORT}`);
    });
}).catch(err => {
    console.error('Ошибка инициализации БД:', err);
    process.exit(1);
});

module.exports = app;
