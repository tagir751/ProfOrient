/**
 * Middleware для проверки авторизации
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/login');
}

/**
 * Middleware для проверки роли администратора
 */
function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') {
    return next();
  }
  res.status(403).send('Доступ запрещён');
}

/**
 * Middleware для проверки роли наставника или администратора
 */
function requireMentorOrAdmin(req, res, next) {
  if (req.session && (req.session.role === 'admin' || req.session.role === 'mentor')) {
    return next();
  }
  res.status(403).send('Доступ запрещён');
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireMentorOrAdmin
};
