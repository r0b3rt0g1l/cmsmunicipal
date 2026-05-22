const prisma = require('../config/database');
const { cloudinary } = require('../config/cloudinary');
const { badRequest, notFound } = require('../utils/errors');

const TIPOS_VALIDOS = ['PRESIDENTE', 'SINDICA', 'REGIDOR', 'DIF'];

function parseBool(v, def) {
  if (v === undefined) return def;
  return v === true || v === 'true' || v === 'on';
}

function extractPublicId(url) {
  if (!url) return null;
  const m = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
  return m && m[1] ? m[1] : null;
}

async function list(req, res, next) {
  try {
    const { tipo, activo } = req.query;
    const where = { municipioId: req.municipio.id };
    if (tipo) {
      if (!TIPOS_VALIDOS.includes(tipo)) throw badRequest('tipo invalido');
      where.tipo = tipo;
    }
    if (activo !== undefined) where.activo = activo === 'true';
    const items = await prisma.funcionario.findMany({
      where,
      orderBy: [{ orden: 'asc' }, { creadoEn: 'asc' }],
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
}

async function detail(req, res, next) {
  try {
    const item = await prisma.funcionario.findUnique({ where: { id: req.params.id } });
    if (!item || item.municipioId !== req.municipio.id) {
      throw notFound('Funcionario no encontrado');
    }
    res.json(item);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { nombre, cargo, tipo, area, email, telefono, bio, administracion, orden, activo } =
      req.body;

    if (!nombre || !cargo) {
      throw badRequest('nombre y cargo son requeridos');
    }
    if (tipo && !TIPOS_VALIDOS.includes(tipo)) {
      throw badRequest('tipo invalido');
    }

    const fotoUrl = req.file ? req.file.path : null;
    const cloudinaryPublicId = fotoUrl ? extractPublicId(fotoUrl) : null;

    const item = await prisma.funcionario.create({
      data: {
        municipioId: req.municipio.id,
        nombre,
        cargo,
        tipo: tipo || null,
        area: area || null,
        email: email || null,
        telefono: telefono || null,
        bio: bio || null,
        administracion: administracion || null,
        fotoUrl,
        cloudinaryPublicId,
        orden: orden !== undefined && orden !== '' ? parseInt(orden, 10) : 0,
        activo: parseBool(activo, true),
      },
    });
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const item = await prisma.funcionario.findUnique({ where: { id: req.params.id } });
    if (!item || item.municipioId !== req.municipio.id) {
      throw notFound('Funcionario no encontrado');
    }

    const data = {};
    const stringKeys = ['nombre', 'cargo', 'area', 'email', 'telefono', 'bio', 'administracion'];
    for (const k of stringKeys) {
      if (req.body[k] !== undefined) {
        const val = typeof req.body[k] === 'string' ? req.body[k].trim() : req.body[k];
        data[k] = val === '' ? null : val;
      }
    }
    if (req.body.tipo !== undefined) {
      const t = req.body.tipo || null;
      if (t && !TIPOS_VALIDOS.includes(t)) throw badRequest('tipo invalido');
      data.tipo = t;
    }
    if (req.body.orden !== undefined && req.body.orden !== '') {
      data.orden = parseInt(req.body.orden, 10);
    }
    if (req.body.activo !== undefined) {
      data.activo = parseBool(req.body.activo, item.activo);
    }

    if (data.nombre === null) throw badRequest('nombre es requerido');
    if (data.cargo === null) throw badRequest('cargo es requerido');

    const updated = await prisma.funcionario.update({
      where: { id: item.id },
      data,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

async function replaceFoto(req, res, next) {
  try {
    if (!req.file) {
      throw badRequest('No se recibio ningun archivo');
    }
    const item = await prisma.funcionario.findUnique({ where: { id: req.params.id } });
    if (!item || item.municipioId !== req.municipio.id) {
      throw notFound('Funcionario no encontrado');
    }

    const oldPublicId = item.cloudinaryPublicId || extractPublicId(item.fotoUrl);

    const updated = await prisma.funcionario.update({
      where: { id: item.id },
      data: {
        fotoUrl: req.file.path,
        cloudinaryPublicId: extractPublicId(req.file.path),
      },
    });

    if (oldPublicId) {
      try {
        await cloudinary.uploader.destroy(oldPublicId);
      } catch (cloudErr) {
        console.error('Error al borrar foto vieja de Cloudinary:', cloudErr.message);
      }
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const item = await prisma.funcionario.findUnique({ where: { id: req.params.id } });
    if (!item || item.municipioId !== req.municipio.id) {
      throw notFound('Funcionario no encontrado');
    }
    const publicId = item.cloudinaryPublicId || extractPublicId(item.fotoUrl);

    await prisma.funcionario.delete({ where: { id: item.id } });

    if (publicId) {
      try {
        await cloudinary.uploader.destroy(publicId);
      } catch (cloudErr) {
        console.error('Error al borrar de Cloudinary:', cloudErr.message);
      }
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, detail, create, update, replaceFoto, remove };
