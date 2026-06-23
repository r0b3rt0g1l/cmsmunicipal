const prisma = require('../config/database');
const { cloudinary } = require('../config/cloudinary');
const { badRequest, notFound } = require('../utils/errors');

function extractPublicId(url) {
  if (!url) return null;
  const m = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
  return m && m[1] ? m[1] : null;
}

async function destroyCloudinary(publicId) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error('Cloudinary destroy (estadisticas):', err.message);
  }
}

function coerceBool(v, def = true) {
  if (v === undefined) return def;
  return v === 'true' || v === true || v === 'on';
}

// GET / — público: lista las estadísticas del municipio por orden.
async function list(req, res, next) {
  try {
    const items = await prisma.estadistica.findMany({
      where: { municipioId: req.municipio.id },
      orderBy: { orden: 'asc' },
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
}

// POST / — protegido: crea una estadística. El icono (archivo) es opcional.
async function create(req, res, next) {
  try {
    const { titulo, valor, orden, activo } = req.body;
    if (!titulo) throw badRequest('El titulo es requerido');

    const item = await prisma.estadistica.create({
      data: {
        municipioId: req.municipio.id,
        titulo,
        valor: valor !== undefined ? String(valor) : '',
        iconoUrl: req.file ? req.file.path : null,
        cloudinaryPublicId: req.file ? extractPublicId(req.file.path) : null,
        orden: orden !== undefined ? parseInt(orden, 10) : 0,
        activo: coerceBool(activo),
      },
    });

    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
}

// PUT /:id — protegido: actualiza metadatos (no el icono).
async function update(req, res, next) {
  try {
    const item = await prisma.estadistica.findUnique({ where: { id: req.params.id } });
    if (!item || item.municipioId !== req.municipio.id) {
      throw notFound('Estadistica no encontrada');
    }

    const { titulo, valor, orden, activo } = req.body;
    const data = {};
    if (titulo !== undefined) data.titulo = titulo;
    if (valor !== undefined) data.valor = String(valor);
    if (orden !== undefined) data.orden = parseInt(orden, 10);
    if (activo !== undefined) data.activo = coerceBool(activo);

    const actualizado = await prisma.estadistica.update({ where: { id: item.id }, data });
    res.json(actualizado);
  } catch (err) {
    next(err);
  }
}

// PUT /:id/archivo — protegido: reemplaza el icono y borra el anterior.
async function replace(req, res, next) {
  try {
    if (!req.file) throw badRequest('No se recibio ningun archivo');

    const item = await prisma.estadistica.findUnique({ where: { id: req.params.id } });
    if (!item || item.municipioId !== req.municipio.id) {
      throw notFound('Estadistica no encontrada');
    }

    const oldPublicId = item.cloudinaryPublicId || extractPublicId(item.iconoUrl);
    const newUrl = req.file.path;
    const newPublicId = extractPublicId(newUrl);

    const actualizado = await prisma.estadistica.update({
      where: { id: item.id },
      data: { iconoUrl: newUrl, cloudinaryPublicId: newPublicId },
    });

    if (oldPublicId && oldPublicId !== newPublicId) await destroyCloudinary(oldPublicId);
    res.json(actualizado);
  } catch (err) {
    next(err);
  }
}

// DELETE /:id — protegido.
async function remove(req, res, next) {
  try {
    const item = await prisma.estadistica.findUnique({ where: { id: req.params.id } });
    if (!item || item.municipioId !== req.municipio.id) {
      throw notFound('Estadistica no encontrada');
    }

    const oldPublicId = item.cloudinaryPublicId || extractPublicId(item.iconoUrl);
    await prisma.estadistica.delete({ where: { id: item.id } });
    await destroyCloudinary(oldPublicId);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, replace, remove };
