const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const { badRequest, unauthorized, notFound, conflict } = require('../utils/errors');

async function register(req, res, next) {
  try {
    const { municipioId, nombre, email, password, rol } = req.body;

    if (!municipioId || !nombre || !email || !password) {
      throw badRequest('municipioId, nombre, email y password son requeridos');
    }

    const municipio = await prisma.municipio.findUnique({ where: { id: municipioId } });
    if (!municipio) {
      throw notFound('Municipio no encontrado');
    }

    const existente = await prisma.usuario.findUnique({ where: { email } });
    if (existente) {
      throw conflict('Ya existe un usuario con ese email');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const usuario = await prisma.usuario.create({
      data: {
        municipioId,
        nombre,
        email,
        passwordHash,
        rol: rol === 'admin' ? 'admin' : 'editor',
      },
      select: {
        id: true,
        municipioId: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        creadoEn: true,
      },
    });

    res.status(201).json(usuario);
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw badRequest('email y password son requeridos');
    }

    const usuario = await prisma.usuario.findUnique({
      where: { email },
      include: { municipio: { select: { slug: true, nombre: true } } },
    });
    if (!usuario || !usuario.activo) {
      throw unauthorized('Credenciales invalidas');
    }

    const ok = await bcrypt.compare(password, usuario.passwordHash);
    if (!ok) {
      throw unauthorized('Credenciales invalidas');
    }

    if (!usuario.municipio) {
      throw badRequest('Usuario sin municipio asociado');
    }

    const token = jwt.sign(
      { id: usuario.id, rol: usuario.rol, municipioId: usuario.municipioId },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { ultimoLogin: new Date() },
    });

    res.json({
      token,
      usuario: {
        id: usuario.id,
        municipioId: usuario.municipioId,
        municipioSlug: usuario.municipio.slug,
        municipioNombre: usuario.municipio.nombre,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const { id, municipioId, nombre, email, rol, activo, creadoEn, ultimoLogin, municipio } = req.user;
    res.json({
      id,
      municipioId,
      nombre,
      email,
      rol,
      activo,
      creadoEn,
      ultimoLogin,
      municipioSlug: municipio?.slug ?? null,
      municipioNombre: municipio?.nombre ?? null,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, me };
