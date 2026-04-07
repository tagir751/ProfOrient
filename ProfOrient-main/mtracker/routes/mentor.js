const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { hashPassword, validatePassword } = require('../utils/password');

/**
 * Дашборд наставника
 */
router.get('/dashboard', async (req, res) => {
  try {
    const mentorId = req.session.userId;
    
    // Получение всех учеников этого наставника
    const students = await db.all(
      'SELECT id, login, full_name FROM users WHERE role = ? AND mentor_id = ?',
      ['student', mentorId]
    );
    
    // Статистика по ученикам
    const statsPromises = students.map(student => 
      Promise.all([
        db.get('SELECT COUNT(*) as count FROM sessions WHERE user_id = ?', [student.id]),
        db.get('SELECT COUNT(*) as count FROM actions WHERE user_id = ?', [student.id]),
        db.get('SELECT COUNT(*) as count FROM projects p JOIN project_members pm ON p.id = pm.project_id WHERE pm.user_id = ?', [student.id])
      ])
    );
    
    const statsResults = await Promise.all(statsPromises);
    
    const studentsWithStats = students.map((student, index) => ({
      ...student,
      sessionsCount: statsResults[index][0].count,
      actionsCount: statsResults[index][1].count,
      projectsCount: statsResults[index][2].count
    }));
    
    res.render('mentor/dashboard', { students: studentsWithStats });
  } catch (err) {
    console.error('Ошибка дашборда наставника:', err);
    res.status(500).send('Ошибка сервера');
  }
});

/**
 * Создание нового ученика
 */
router.get('/students/create', async (req, res) => {
  res.render('mentor/student-form', { student: null, action: 'create' });
});

router.post('/students', async (req, res) => {
  try {
    const { login, password, full_name } = req.body;
    
    if (!login || !password) {
      return res.status(400).send('Заполните обязательные поля');
    }
    
    const validation = validatePassword(password);
    if (!validation.valid) {
      return res.status(400).send(validation.message);
    }
    
    const hash = hashPassword(password);
    const result = await db.run(
      'INSERT INTO users (login, password_hash, full_name, role, mentor_id) VALUES (?, ?, ?, ?, ?)',
      [login, hash, full_name || null, 'student', req.session.userId]
    );
    
    // Логирование в историю
    await db.logHistory('users', result.lastID, req.session.userId, 'INSERT', null, {
      login, full_name, role: 'student', mentor_id: req.session.userId
    }, 'Создание ученика');
    
    res.redirect('/mentor/students/' + result.lastID);
  } catch (err) {
    console.error('Ошибка создания ученика:', err);
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).send('Ученик с таким логином уже существует');
    }
    res.status(500).send('Ошибка сервера');
  }
});

/**
 * Просмотр ученика
 */
router.get('/students/:id', async (req, res) => {
  try {
    const studentId = parseInt(req.params.id);
    
    const student = await db.get(
      'SELECT * FROM users WHERE id = ? AND role = ? AND mentor_id = ?',
      [studentId, 'student', req.session.userId]
    );
    
    if (!student) {
      return res.status(404).send('Ученик не найден');
    }
    
    const [sessions, actions, metrics] = await Promise.all([
      db.all(
        'SELECT * FROM sessions WHERE user_id = ? ORDER BY session_date DESC LIMIT 10',
        [studentId]
      ),
      db.all(
        `SELECT a.*, s.session_date, p.name as project_name 
         FROM actions a 
         LEFT JOIN sessions s ON a.session_id = s.id 
         LEFT JOIN projects p ON a.project_id = p.id 
         WHERE a.user_id = ? 
         ORDER BY a.created_at DESC LIMIT 10`,
        [studentId]
      ),
      db.all(
        'SELECT * FROM metrics WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
        [studentId]
      )
    ]);
    
    res.render('mentor/student-detail', { 
      student, 
      sessions, 
      actions, 
      metrics 
    });
  } catch (err) {
    console.error('Ошибка просмотра ученика:', err);
    res.status(500).send('Ошибка сервера');
  }
});

/**
 * Редактирование ученика
 */
router.get('/students/:id/edit', async (req, res) => {
  try {
    const student = await db.get(
      'SELECT * FROM users WHERE id = ? AND role = ? AND mentor_id = ?',
      [parseInt(req.params.id), 'student', req.session.userId]
    );
    
    if (!student) {
      return res.status(404).send('Ученик не найден');
    }
    
    res.render('mentor/student-form', { student, action: 'edit' });
  } catch (err) {
    console.error('Ошибка формы редактирования:', err);
    res.status(500).send('Ошибка сервера');
  }
});

router.put('/students/:id', async (req, res) => {
  try {
    const { login, password, full_name } = req.body;
    const studentId = parseInt(req.params.id);
    
    const oldStudent = await db.get('SELECT * FROM users WHERE id = ?', [studentId]);
    if (!oldStudent || oldStudent.mentor_id !== req.session.userId) {
      return res.status(404).send('Ученик не найден');
    }
    
    let updateQuery = 'UPDATE users SET login = ?, full_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    let params = [login, full_name || null, studentId];
    
    if (password && password.trim() !== '') {
      const validation = validatePassword(password);
      if (!validation.valid) {
        return res.status(400).send(validation.message);
      }
      const hash = hashPassword(password);
      updateQuery = 'UPDATE users SET login = ?, full_name = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
      params = [login, full_name || null, hash, studentId];
    }
    
    await db.run(updateQuery, params);
    
    // Логирование в историю
    const newStudent = await db.get('SELECT * FROM users WHERE id = ?', [studentId]);
    await db.logHistory('users', studentId, req.session.userId, 'UPDATE', {
      login: oldStudent.login,
      full_name: oldStudent.full_name
    }, {
      login: newStudent.login,
      full_name: newStudent.full_name
    }, 'Редактирование ученика');
    
    res.redirect('/mentor/students/' + studentId);
  } catch (err) {
    console.error('Ошибка обновления ученика:', err);
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).send('Ученик с таким логином уже существует');
    }
    res.status(500).send('Ошибка сервера');
  }
});

/**
 * Добавление метрик
 */
router.post('/students/:id/metrics', async (req, res) => {
  try {
    const { independence_score, thinking_depth_score, completion_rate, notes, session_id } = req.body;
    const studentId = parseInt(req.params.id);
    
    await db.run(
      `INSERT INTO metrics (user_id, session_id, independence_score, thinking_depth_score, completion_rate, notes, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [studentId, session_id || null, independence_score, thinking_depth_score, completion_rate, notes, req.session.userId]
    );
    
    res.redirect('/mentor/students/' + studentId);
  } catch (err) {
    console.error('Ошибка добавления метрик:', err);
    res.status(500).send('Ошибка сервера');
  }
});

module.exports = router;
