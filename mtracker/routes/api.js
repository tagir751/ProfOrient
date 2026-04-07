const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('../db/database');
const path = require('path');
const fs = require('fs');

const upload = multer({ dest: 'uploads/' });

// Получить всех студентов (для админа) или своих (для наставника)
router.get('/students', async (req, res) => {
    try {
        let query;
        if (req.session.role === 'admin') {
            query = 'SELECT id, login, full_name FROM users WHERE role = ? ORDER BY login';
            const students = await db.all(query, ['student']);
            return res.json(students);
        } else if (req.session.role === 'mentor') {
            query = 'SELECT id, login, full_name FROM users WHERE role = ? AND mentor_id = ? ORDER BY login';
            const students = await db.all(query, ['student', req.session.userId]);
            return res.json(students);
        }
        res.status(403).json({ error: 'Доступ запрещён' });
    } catch (err) {
        console.error('Ошибка получения студентов:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить сессии студента
router.get('/sessions/:userId', async (req, res) => {
    try {
        const sessions = await db.all(
            'SELECT * FROM sessions WHERE user_id = ? ORDER BY session_date DESC',
            [req.params.userId]
        );
        res.json(sessions);
    } catch (err) {
        console.error('Ошибка получения сессий:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Создать действие
router.post('/actions', async (req, res) => {
    try {
        const { user_id, session_id, project_id, description, status, priority, due_date } = req.body;
        
        const result = await db.run(
            'INSERT INTO actions (user_id, session_id, project_id, description, status, priority, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [user_id, session_id || null, project_id || null, description, status || 'pending', priority || 'medium', due_date || null]
        );
        
        res.json({ id: result.lastID, success: true });
    } catch (err) {
        console.error('Ошибка создания действия:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить метрики студента
router.get('/metrics/:userId', async (req, res) => {
    try {
        const metrics = await db.all(
            'SELECT * FROM metrics WHERE user_id = ? ORDER BY created_at ASC',
            [req.params.userId]
        );
        res.json(metrics);
    } catch (err) {
        console.error('Ошибка получения метрик:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Экспорт всех данных в Excel
router.get('/export/all', async (req, res) => {
    try {
        if (req.session.role !== 'admin') {
            return res.status(403).json({ error: 'Доступ запрещён' });
        }
        
        const workbook = XLSX.utils.book_new();
        
        // Пользователи
        const users = await db.all('SELECT * FROM users ORDER BY role, login');
        const wsUsers = XLSX.utils.json_to_sheet(users);
        XLSX.utils.book_append_sheet(workbook, wsUsers, 'Пользователи');
        
        // Проекты
        const projects = await db.all('SELECT * FROM projects ORDER BY created_at DESC');
        const wsProjects = XLSX.utils.json_to_sheet(projects);
        XLSX.utils.book_append_sheet(workbook, wsProjects, 'Проекты');
        
        // Сессии
        const sessions = await db.all('SELECT * FROM sessions ORDER BY session_date DESC');
        const wsSessions = XLSX.utils.json_to_sheet(sessions);
        XLSX.utils.book_append_sheet(workbook, wsSessions, 'Сессии');
        
        // Действия
        const actions = await db.all('SELECT * FROM actions ORDER BY created_at DESC');
        const wsActions = XLSX.utils.json_to_sheet(actions);
        XLSX.utils.book_append_sheet(workbook, wsActions, 'Действия');
        
        // Метрики
        const metrics = await db.all('SELECT * FROM metrics ORDER BY created_at DESC');
        const wsMetrics = XLSX.utils.json_to_sheet(metrics);
        XLSX.utils.book_append_sheet(workbook, wsMetrics, 'Метрики');
        
        // История
        const history = await db.all('SELECT * FROM history ORDER BY changed_at DESC LIMIT 1000');
        const wsHistory = XLSX.utils.json_to_sheet(history);
        XLSX.utils.book_append_sheet(workbook, wsHistory, 'История');
        
        const fileName = `mtracker_full_export_${new Date().toISOString().split('T')[0]}.xlsx`;
        const filePath = path.join(__dirname, '..', 'uploads', fileName);
        
        XLSX.writeFile(workbook, filePath);
        
        res.download(filePath, fileName, () => {
            fs.unlinkSync(filePath);
        });
    } catch (err) {
        console.error('Ошибка экспорта:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Экспорт карточки студента в HTML (для печати)
router.get('/export/student/:id/html', async (req, res) => {
    try {
        const studentId = parseInt(req.params.id);
        
        const student = await db.get('SELECT * FROM users WHERE id = ?', [studentId]);
        if (!student) {
            return res.status(404).json({ error: 'Студент не найден' });
        }
        
        const sessions = await db.all('SELECT * FROM sessions WHERE user_id = ? ORDER BY session_date DESC', [studentId]);
        const actions = await db.all('SELECT * FROM actions WHERE user_id = ? ORDER BY created_at DESC', [studentId]);
        const metrics = await db.all('SELECT * FROM metrics WHERE user_id = ? ORDER BY created_at ASC', [studentId]);
        const projects = await db.all(`
            SELECT p.* FROM projects p 
            JOIN project_members pm ON p.id = pm.project_id 
            WHERE pm.user_id = ?`, [studentId]);
        
        res.render('student/print-card', { student, sessions, actions, metrics, projects });
    } catch (err) {
        console.error('Ошибка генерации карточки:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Импорт базы из Excel
router.post('/import', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не загружен' });
        }
        
        const filePath = req.file.path;
        const workbook = XLSX.readFile(filePath);
        
        // Предпросмотр данных
        const preview = {};
        
        if (workbook.Sheets['Пользователи']) {
            preview.users = XLSX.utils.sheet_to_json(workbook.Sheets['Пользователи']);
        }
        if (workbook.Sheets['Сессии']) {
            preview.sessions = XLSX.utils.sheet_to_json(workbook.Sheets['Сессии']);
        }
        if (workbook.Sheets['Действия']) {
            preview.actions = XLSX.utils.sheet_to_json(workbook.Sheets['Действия']);
        }
        if (workbook.Sheets['Проекты']) {
            preview.projects = XLSX.utils.sheet_to_json(workbook.Sheets['Проекты']);
        }
        if (workbook.Sheets['Метрики']) {
            preview.metrics = XLSX.utils.sheet_to_json(workbook.Sheets['Метрики']);
        }
        
        res.json({ 
            success: true, 
            preview,
            message: 'Предпросмотр данных. Выберите режим импорта.'
        });
        
        // Файл будет удалён позже после импорта
    } catch (err) {
        console.error('Ошибка импорта:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Подтверждение импорта с выбором режима
router.post('/import/confirm', upload.single('file'), async (req, res) => {
    try {
        const { mode } = req.body; // 'replace' или 'merge'
        
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не загружен' });
        }
        
        const filePath = req.file.path;
        const workbook = XLSX.readFile(filePath);
        const bcrypt = require('bcryptjs');
        
        if (workbook.Sheets['Пользователи']) {
            const users = XLSX.utils.sheet_to_json(workbook.Sheets['Пользователи']);
            
            for (const userData of users) {
                if (mode === 'replace') {
                    // Проверяем существование
                    const existing = await db.get('SELECT * FROM users WHERE login = ?', [userData.login]);
                    
                    if (existing) {
                        // Обновляем
                        const hash = bcrypt.hashSync(userData.password_hash || 'temp123', 10);
                        await db.run(
                            'UPDATE users SET password_hash = ?, full_name = ?, role = ?, mentor_id = ?, updated_at = CURRENT_TIMESTAMP WHERE login = ?',
                            [hash, userData.full_name, userData.role, userData.mentor_id, userData.login]
                        );
                    } else {
                        // Создаём
                        const hash = bcrypt.hashSync(userData.password_hash || 'temp123', 10);
                        await db.run(
                            'INSERT INTO users (login, password_hash, full_name, role, mentor_id) VALUES (?, ?, ?, ?, ?)',
                            [userData.login, hash, userData.full_name, userData.role, userData.mentor_id]
                        );
                    }
                } else if (mode === 'merge') {
                    // Только добавляем новых
                    const existing = await db.get('SELECT * FROM users WHERE login = ?', [userData.login]);
                    if (!existing) {
                        const hash = bcrypt.hashSync(userData.password_hash || 'temp123', 10);
                        await db.run(
                            'INSERT INTO users (login, password_hash, full_name, role, mentor_id) VALUES (?, ?, ?, ?, ?)',
                            [userData.login, hash, userData.full_name, userData.role, userData.mentor_id]
                        );
                    }
                }
            }
        }
        
        // Аналогично для других таблиц (упрощённо)
        if (workbook.Sheets['Сессии']) {
            const sessions = XLSX.utils.sheet_to_json(workbook.Sheets['Сессии']);
            for (const sessionData of sessions) {
                if (mode === 'merge' || !await db.get('SELECT id FROM sessions WHERE user_id = ? AND session_date = ?', [sessionData.user_id, sessionData.session_date])) {
                    await db.run(
                        'INSERT OR IGNORE INTO sessions (user_id, session_date, topic, notes) VALUES (?, ?, ?, ?)',
                        [sessionData.user_id, sessionData.session_date, sessionData.topic, sessionData.notes]
                    );
                }
            }
        }
        
        // Удаляем файл
        fs.unlinkSync(filePath);
        
        res.json({ success: true, message: 'Импорт завершён успешно' });
    } catch (err) {
        console.error('Ошибка подтверждения импорта:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;
