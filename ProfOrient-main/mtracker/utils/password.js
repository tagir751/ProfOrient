const bcrypt = require('bcryptjs');

/**
 * Хеширование пароля
 */
function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

/**
 * Проверка пароля
 */
function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

/**
 * Валидация пароля
 */
function validatePassword(password) {
  if (!password || password.length < 4) {
    return { valid: false, message: 'Пароль должен быть не менее 4 символов' };
  }
  if (!/[a-zA-Zа-яА-Я]/.test(password) || !/[0-9]/.test(password)) {
    return { valid: false, message: 'Пароль должен содержать буквы и цифры' };
  }
  return { valid: true };
}

module.exports = {
  hashPassword,
  verifyPassword,
  validatePassword
};
