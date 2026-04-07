const express = require('express');
const router = express.Router();
const db = require('../db/database');

// Дашборд ученика
router.get('/dashboard', async (req, res) => {
    try {
        const studentId = req.session.userId;
        
        // Получение последних сессий
        const sessions = await db.all(
            'SELECT * FROM sessions WHERE user_id = ? ORDER BY session_date DESC LIMIT 5',
            [studentId]
        );
        
        // Получение активных действий
        const actions = await db.all(
            `SELECT a.*, p.name as project_name 
             FROM actions a 
             LEFT JOIN projects p ON a.project_id = p.id 
             WHERE a.user_id = ? AND a.status != 'completed' AND a.status != 'cancelled'
             ORDER BY a.created_at DESC LIMIT 10`,
            [studentId]
        );
        
        // Получение проектов
        const projects = await db.all(
            `SELECT p.* FROM projects p 
             JOIN project_members pm ON p.id = pm.project_id 
             WHERE pm.user_id = ?`,
            [studentId]
        );
        
        // Получение последних метрик
        const metrics = await db.all(
            'SELECT * FROM metrics WHERE user_id = ? ORDER BY created_at DESC LIMIT 5',
            [studentId]
        );
        
        res.render('student/dashboard', { sessions, actions, projects, metrics });
    } catch (err) {
        console.error('Ошибка дашборда ученика:', err);
        res.status(500).send('Ошибка сервера');
    }
});

// Мои сессии
router.get('/sessions', async (req, res) => {
    try {
        const sessions = await db.all(
            'SELECT * FROM sessions WHERE user_id = ? ORDER BY session_date DESC',
            [req.session.userId]
        );
        res.render('student/sessions', { sessions });
    } catch (err) {
        console.error('Ошибка получения сессий:', err);
        res.status(500).send('Ошибка сервера');
    }
});

// Создание сессии
router.post('/sessions', async (req, res) => {
    try {
        const { session_date, topic, notes } = req.body;
        
        const result = await db.run(
            'INSERT INTO sessions (user_id, session_date, topic, notes) VALUES (?, ?, ?, ?)',
            [req.session.userId, session_date, topic || null, notes || null]
        );
        
        // Логирование в историю
        await db.logHistory('sessions', result.lastID, req.session.userId, 'INSERT', null, {
            session_date, topic, notes
        }, 'Создание сессии');
        
        res.redirect('/student/sessions');
    } catch (err) {
        console.error('Ошибка создания сессии:', err);
        res.status(500).send('Ошибка сервера');
    }
});

// Мои действия
router.get('/actions', async (req, res) => {
    try {
        const actions = await db.all(
            `SELECT a.*, s.session_date, p.name as project_name 
             FROM actions a 
             LEFT JOIN sessions s ON a.session_id = s.id 
             LEFT JOIN projects p ON a.project_id = p.id 
             WHERE a.user_id = ? 
             ORDER BY a.created_at DESC`,
            [req.session.userId]
        );
        res.render('student/actions', { actions });
    } catch (err) {
        console.error('Ошибка получения действий:', err);
        res.status(500).send('Ошибка сервера');
    }
});

// Создание действия
router.post('/actions', async (req, res) => {
    try {
        const { session_id, project_id, description, status, priority, due_date } = req.body;
        
        const result = await db.run(
            'INSERT INTO actions (user_id, session_id, project_id, description, status, priority, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [req.session.userId, session_id || null, project_id || null, description, status || 'pending', priority || 'medium', due_date || null]
        );
        
        // Логирование в историю
        await db.logHistory('actions', result.lastID, req.session.userId, 'INSERT', null, {
            session_id, project_id, description, status, priority, due_date
        }, 'Создание действия');
        
        res.redirect('/student/actions');
    } catch (err) {
        console.error('Ошибка создания действия:', err);
        res.status(500).send('Ошибка сервера');
    }
});

// Обновление статуса действия
router.put('/actions/:id', async (req, res) => {
    try {
        const { status } = req.body;
        const actionId = parseInt(req.params.id);
        
        const oldAction = await db.get('SELECT * FROM actions WHERE id = ? AND user_id = ?', [actionId, req.session.userId]);
        if (!oldAction) {
            return res.status(404).send('Действие не найдено');
        }
        
        let completedAt = null;
        if (status === 'completed' && oldAction.status !== 'completed') {
            completedAt = new Date().toISOString().split('T')[0];
        }
        
        await db.run(
            'UPDATE actions SET status = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [status, completedAt, actionId]
        );
        
        // Логирование в историю
        await db.logHistory('actions', actionId, req.session.userId, 'UPDATE', {
            status: oldAction.status
        }, {
            status, completed_at: completedAt
        }, 'Обновление статуса действия');
        
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка обновления действия:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Мои проекты
router.get('/projects', async (req, res) => {
    try {
        const projects = await db.all(
            `SELECT p.*, GROUP_CONCAT(u.full_name) as member_names 
             FROM projects p 
             JOIN project_members pm ON p.id = pm.project_id 
             JOIN users u ON pm.user_id = u.id 
             WHERE pm.user_id = ? OR p.created_by = ?
             GROUP BY p.id`,
            [req.session.userId, req.session.userId]
        );
        res.render('student/projects', { projects });
    } catch (err) {
        console.error('Ошибка получения проектов:', err);
        res.status(500).send('Ошибка сервера');
    }
});

// Детали проекта
router.get('/projects/:id', async (req, res) => {
    try {
        const projectId = parseInt(req.params.id);
        
        const project = await db.get(
            `SELECT p.* FROM projects p 
             JOIN project_members pm ON p.id = pm.project_id 
             WHERE pm.user_id = ? AND p.id = ?`,
            [req.session.userId, projectId]
        );
        
        if (!project) {
            return res.status(404).send('Проект не найден');
        }
        
        const members = await db.all(
            `SELECT u.id, u.login, u.full_name FROM users u 
             JOIN project_members pm ON u.id = pm.user_id 
             WHERE pm.project_id = ?`,
            [projectId]
        );
        
        const actions = await db.all(
            `SELECT a.*, s.session_date 
             FROM actions a 
             LEFT JOIN sessions s ON a.session_id = s.id 
             WHERE a.project_id = ? AND a.user_id = ?
             ORDER BY a.created_at DESC`,
            [projectId, req.session.userId]
        );
        
        res.render('student/project-detail', { project, members, actions });
    } catch (err) {
        console.error('Ошибка просмотра проекта:', err);
        res.status(500).send('Ошибка сервера');
    }
});

// Мой прогресс (графики)
router.get('/progress', async (req, res) => {
    try {
        const metrics = await db.all(
            'SELECT * FROM metrics WHERE user_id = ? ORDER BY created_at ASC',
            [req.session.userId]
        );
        
        res.render('student/progress', { metrics });
    } catch (err) {
        console.error('Ошибка получения прогресса:', err);
        res.status(500).send('Ошибка сервера');
    }
});

module.exports = router;
