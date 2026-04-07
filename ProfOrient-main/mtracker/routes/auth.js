const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db/database');

// Страница входа
router.get('/', (req, res) => {
    if (req.session.userId) {
        res.redirect('/');
    } else {
        res.render('login', { error: null });
    }
});

// Обработка входа
router.post('/', async (req, res) => {
    try {
        const { login, password } = req.body;
        
        if (!login || !password) {
            return res.render('login', { error: 'Введите логин и пароль' });
        }
        
        const user = await db.get('SELECT * FROM users WHERE login = ?', [login]);
        
        if (!user) {
            return res.render('login', { error: 'Неверный логин или пароль' });
        }
        
        const isValid = bcrypt.compareSync(password, user.password_hash);
        
        if (!isValid) {
            return res.render('login', { error: 'Неверный логин или пароль' });
        }
        
        // Сохранение сессии
        req.session.userId = user.id;
        req.session.role = user.role;
        req.session.user = {
            id: user.id,
            login: user.login,
            fullName: user.full_name,
            role: user.role
        };
        
        // Перенаправление в зависимости от роли
        if (user.role === 'admin') {
            res.redirect('/admin/dashboard');
        } else if (user.role === 'mentor') {
            res.redirect('/mentor/dashboard');
        } else {
            res.redirect('/student/dashboard');
        }
    } catch (err) {
        console.error('Ошибка входа:', err);
        res.render('login', { error: 'Произошла ошибка при входе' });
    }
});

// Выход
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Ошибка выхода:', err);
        }
        res.redirect('/login');
    });
});

module.exports = router;
