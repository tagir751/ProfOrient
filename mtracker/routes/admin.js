const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db/database');

// Дашборд администратора
router.get('/dashboard', async (req, res) => {
    try {
        const stats = await Promise.all([
            db.all('SELECT COUNT(*) as count FROM users WHERE role = ?', ['student']),
            db.all('SELECT COUNT(*) as count FROM users WHERE role = ?', ['mentor']),
            db.all('SELECT COUNT(*) as count FROM projects'),
            db.all('SELECT COUNT(*) as count FROM sessions')
        ]);
        
        const data = {
            studentsCount: stats[0][0].count,
            mentorsCount: stats[1][0].count,
            projectsCount: stats[2][0].count,
            sessionsCount: stats[3][0].count
        };
        
        res.render('admin/dashboard', data);
    } catch (err) {
        console.error('Ошибка дашборда:', err);
        res.status(500).send('Ошибка сервера');
    }
});

// Управление пользователями
router.get('/users', async (req, res) => {
    try {
        const users = await db.all(`
            SELECT u.*, m.full_name as mentor_name 
            FROM users u 
            LEFT JOIN users m ON u.mentor_id = m.id 
            ORDER BY u.role, u.login
        `);
        res.render('admin/users', { users });
    } catch (err) {
        console.error('Ошибка получения пользователей:', err);
        res.status(500).send('Ошибка сервера');
    }
});

// Страница создания пользователя
router.get('/users/create', async (req, res) => {
    try {
        const mentors = await db.all('SELECT id, full_name, login FROM users WHERE role = ?', ['mentor']);
        res.render('admin/user-form', { user: null, mentors, action: 'create' });
    } catch (err) {
        console.error('Ошибка формы пользователя:', err);
        res.status(500).send('Ошибка сервера');
    }
});

// Создание пользователя
router.post('/users', async (req, res) => {
    try {
        const { login, password, full_name, role, mentor_id } = req.body;
        
        if (!login || !password || !role) {
            return res.status(400).send('Заполните обязательные поля');
        }
        
        // Проверка длины пароля
        if (password.length < 4) {
            return res.status(400).send('Пароль должен быть не менее 4 символов');
        }
        
        // Проверка наличия букв и цифр в пароле
        if (!/[a-zA-Zа-яА-Я]/.test(password) || !/[0-9]/.test(password)) {
            return res.status(400).send('Пароль должен содержать буквы и цифры');
        }
        
        const hash = bcrypt.hashSync(password, 10);
        const result = await db.run(
            'INSERT INTO users (login, password_hash, full_name, role, mentor_id) VALUES (?, ?, ?, ?, ?)',
            [login, hash, full_name || null, role, mentor_id || null]
        );
        
        // Логирование в историю
        await db.logHistory('users', result.lastID, req.session.userId, 'INSERT', null, {
            login, full_name, role, mentor_id
        }, 'Создание пользователя');
        
        res.redirect('/admin/users');
    } catch (err) {
        console.error('Ошибка создания пользователя:', err);
        if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).send('Пользователь с таким логином уже существует');
        }
        res.status(500).send('Ошибка сервера');
    }
});

// Страница редактирования пользователя
router.get('/users/:id/edit', async (req, res) => {
    try {
        const user = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
        if (!user) {
            return res.status(404).send('Пользователь не найден');
        }
        
        const mentors = await db.all('SELECT id, full_name, login FROM users WHERE role = ?', ['mentor']);
        res.render('admin/user-form', { user, mentors, action: 'edit' });
    } catch (err) {
        console.error('Ошибка формы редактирования:', err);
        res.status(500).send('Ошибка сервера');
    }
});

// Обновление пользователя
router.put('/users/:id', async (req, res) => {
    try {
        const { login, password, full_name, role, mentor_id } = req.body;
        const userId = parseInt(req.params.id);
        
        const oldUser = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        if (!oldUser) {
            return res.status(404).send('Пользователь не найден');
        }
        
        let updateQuery = 'UPDATE users SET login = ?, full_name = ?, role = ?, mentor_id = ?, updated_at = CURRENT_TIMESTAMP';
        let params = [login, full_name || null, role, mentor_id || null];
        
        if (password && password.trim() !== '') {
            if (password.length < 4) {
                return res.status(400).send('Пароль должен быть не менее 4 символов');
            }
            if (!/[a-zA-Zа-яА-Я]/.test(password) || !/[0-9]/.test(password)) {
                return res.status(400).send('Пароль должен содержать буквы и цифры');
            }
            const hash = bcrypt.hashSync(password, 10);
            updateQuery += ', password_hash = ?';
            params.push(hash);
        }
        
        params.push(userId);
        updateQuery += ' WHERE id = ?';
        
        await db.run(updateQuery, params);
        
        // Логирование в историю
        const newUser = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        await db.logHistory('users', userId, req.session.userId, 'UPDATE', {
            login: oldUser.login,
            full_name: oldUser.full_name,
            role: oldUser.role,
            mentor_id: oldUser.mentor_id
        }, {
            login: newUser.login,
            full_name: newUser.full_name,
            role: newUser.role,
            mentor_id: newUser.mentor_id
        }, 'Редактирование пользователя');
        
        res.redirect('/admin/users');
    } catch (err) {
        console.error('Ошибка обновления пользователя:', err);
        if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).send('Пользователь с таким логином уже существует');
        }
        res.status(500).send('Ошибка сервера');
    }
});

// Удаление пользователя
router.delete('/users/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        
        if (!user) {
            return res.status(404).send('Пользователь не найден');
        }
        
        // Нельзя удалить самого себя
        if (userId === req.session.userId) {
            return res.status(400).send('Нельзя удалить свою учетную запись');
        }
        
        await db.run('DELETE FROM users WHERE id = ?', [userId]);
        
        // Логирование в историю
        await db.logHistory('users', userId, req.session.userId, 'DELETE', {
            login: user.login,
            full_name: user.full_name,
            role: user.role
        }, null, 'Удаление пользователя');
        
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка удаления пользователя:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Изменение пароля пользователя (быстрое)
router.post('/users/:id/change-password', async (req, res) => {
    try {
        const { password } = req.body;
        const userId = parseInt(req.params.id);
        
        if (!password || password.length < 4) {
            return res.status(400).send('Пароль должен быть не менее 4 символов');
        }
        
        if (!/[a-zA-Zа-яА-Я]/.test(password) || !/[0-9]/.test(password)) {
            return res.status(400).send('Пароль должен содержать буквы и цифры');
        }
        
        const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) {
            return res.status(404).send('Пользователь не найден');
        }
        
        const hash = bcrypt.hashSync(password, 10);
        await db.run('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [hash, userId]);
        
        // Логирование в историю
        await db.logHistory('users', userId, req.session.userId, 'UPDATE', 
            { password_changed: true }, 
            { password_changed: true }, 
            `Изменение пароля для пользователя ${user.login}`);
        
        res.json({ success: true, message: 'Пароль изменён' });
    } catch (err) {
        console.error('Ошибка изменения пароля:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;
