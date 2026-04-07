const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { verifyPassword } = require('../utils/password');

/**
 * Страница входа
 */
router.get('/', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/');
  }
  res.render('login', { error: null });
});

/**
 * Обработка входа
 */
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
    
    const isValid = verifyPassword(password, user.password_hash);
    
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
    const redirectPaths = {
      admin: '/admin/dashboard',
      mentor: '/mentor/dashboard',
      student: '/student/dashboard'
    };
    
    res.redirect(redirectPaths[user.role] || '/');
  } catch (err) {
    console.error('Ошибка входа:', err);
    res.render('login', { error: 'Произошла ошибка при входе' });
  }
});

/**
 * Выход
 */
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Ошибка выхода:', err);
    }
    res.redirect('/login');
  });
});

module.exports = router;
