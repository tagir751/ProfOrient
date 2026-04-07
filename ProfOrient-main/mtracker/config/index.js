module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  hostname: process.env.HOSTNAME || '127.0.0.1',
  session: {
    secret: process.env.SESSION_SECRET || 'mtracker-secret-key-change-in-production',
    cookie: {
      secure: false, // На Beget HTTPS может быть не настроен
      maxAge: 24 * 60 * 60 * 1000 // 24 часа
    },
    resave: false,
    saveUninitialized: false
  },
  db: {
    path: process.env.DB_PATH || './db/mtracker.db'
  }
};
