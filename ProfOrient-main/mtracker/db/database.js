const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('../config');

let db;

// Логирование для отладки
const logFile = path.join(__dirname, 'debug.log');
const log = (message) => {
  try {
    const fs = require('fs');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `[${timestamp}] [DB] ${message}\n`);
  } catch (e) {
    // Игнорируем ошибки логирования
  }
};

/**
 * Инициализация базы данных
 */
function initialize() {
  return new Promise((resolve, reject) => {
    // Используем абсолютный путь для хостинга
    let dbPath = config.db.path;
    
    // Если путь относительный, делаем его абсолютным
    if (!path.isAbsolute(dbPath)) {
      dbPath = path.resolve(__dirname, dbPath);
    }
    
    log('Инициализация БД: ' + dbPath);
    
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        log('Ошибка подключения к SQLite: ' + err.message);
        reject(err);
        return;
      }
      console.log('Подключено к SQLite');
      createTables().then(resolve).catch(reject);
    });
  });
}

/**
 * Создание таблиц базы данных
 */
function createTables() {
  return new Promise((resolve, reject) => {
    const queries = [
      // Таблица пользователей
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        login TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'mentor', 'student')),
        full_name TEXT,
        mentor_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (mentor_id) REFERENCES users(id)
      )`,
      
      // Таблица проектов
      `CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id)
      )`,
      
      // Таблица участников проекта
      `CREATE TABLE IF NOT EXISTS project_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(project_id, user_id)
      )`,
      
      // Таблица сессий
      `CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        session_date DATETIME NOT NULL,
        topic TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
      
      // Таблица действий
      `CREATE TABLE IF NOT EXISTS actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        project_id INTEGER,
        user_id INTEGER NOT NULL,
        description TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'cancelled')),
        priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
        due_date DATETIME,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
      
      // Таблица метрик
      `CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        session_id INTEGER,
        independence_score INTEGER CHECK(independence_score >= 0 AND independence_score <= 100),
        thinking_depth_score INTEGER CHECK(thinking_depth_score >= 0 AND thinking_depth_score <= 100),
        completion_rate INTEGER CHECK(completion_rate >= 0 AND completion_rate <= 100),
        notes TEXT,
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id)
      )`,
      
      // Таблица истории изменений
      `CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        record_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        action TEXT NOT NULL CHECK(action IN ('INSERT', 'UPDATE', 'DELETE')),
        old_values TEXT,
        new_values TEXT,
        comment TEXT,
        changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,
      
      // Индексы для производительности
      `CREATE INDEX IF NOT EXISTS idx_users_login ON users(login)`,
      `CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_actions_user ON actions(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_metrics_user ON metrics(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_history_record ON history(table_name, record_id)`
    ];

    let completed = 0;
    
    queries.forEach((query) => {
      db.run(query, (err) => {
        if (err) {
          reject(err);
          return;
        }
        completed++;
        if (completed === queries.length) {
          console.log('Все таблицы созданы');
          createDefaultAdmin().then(resolve).catch(reject);
        }
      });
    });
  });
}

/**
 * Создание администратора по умолчанию
 */
function createDefaultAdmin() {
  return new Promise((resolve, reject) => {
    const defaultPassword = 'admin123';
    const hash = bcrypt.hashSync(defaultPassword, 10);
    
    db.get('SELECT id FROM users WHERE login = ?', ['admin'], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (!row) {
        db.run(
          'INSERT INTO users (login, password_hash, role, full_name) VALUES (?, ?, ?, ?)',
          ['admin', hash, 'admin', 'Администратор'],
          (err) => {
            if (err) {
              reject(err);
              return;
            }
            console.log('Создан пользователь admin с паролем: admin123');
            resolve();
          }
        );
      } else {
        resolve();
      }
    });
  });
}

/**
 * Выполнение запроса (INSERT, UPDATE, DELETE)
 */
function run(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

/**
 * Получение одной записи
 */
function get(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

/**
 * Получение всех записей
 */
function all(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

/**
 * Запись в историю изменений
 */
async function logHistory(tableName, recordId, userId, action, oldValues, newValues, comment = '') {
  const oldValuesStr = oldValues ? JSON.stringify(oldValues) : null;
  const newValuesStr = newValues ? JSON.stringify(newValues) : null;
  
  await run(
    'INSERT INTO history (table_name, record_id, user_id, action, old_values, new_values, comment) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [tableName, recordId, userId, action, oldValuesStr, newValuesStr, comment]
  );
}

module.exports = {
  initialize,
  run,
  get,
  all,
  logHistory,
  close: () => new Promise(resolve => db.close(resolve))
};
