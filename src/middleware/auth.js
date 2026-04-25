const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const { unauthorized } = require('../utils/errors');

async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw unauthorized('Token no provisto');
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      throw unauthorized('Token invalido o expirado');
    }

    const usuario = await prisma.usuario.findUnique({ where: { id: payload.id } });
    if (!usuario || !usuario.activo) {
      throw unauthorized('Usuario no encontrado o inactivo');
    }

    req.user = usuario;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = auth;
