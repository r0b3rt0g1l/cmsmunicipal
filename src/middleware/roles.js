const { forbidden, unauthorized } = require('../utils/errors');

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(unauthorized('Autenticacion requerida'));
    }
    if (!roles.includes(req.user.rol)) {
      return next(forbidden('Permisos insuficientes'));
    }
    next();
  };
}

module.exports = requireRole;
