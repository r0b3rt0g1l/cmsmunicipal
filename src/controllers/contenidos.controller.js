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
    console.error('Cloudinary destroy (contenidos):', err.message);
  }
}

function coerceBool(v, def = true) {
  if (v === undefined) return def;
  return v === 'true' || v === true || v === 'on';
}

// GET / — público: lista todos los bloques de contenido del municipio.
async function list(req, res, next) {
  try {
    const items = await prisma.contenidoEditable.findMany({
      where: { municipioId: req.municipio.id },
      orderBy: { clave: 'asc' },
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
}

// GET /:clave — público: un bloque por clave (404 si no existe).
async function getByClave(req, res, next) {
  try {
    const item = await prisma.contenidoEditable.findUnique({
      where: {
        municipioId_clave: { municipioId: req.municipio.id, clave: req.params.clave },
      },
    });
    if (!item) throw notFound('Contenido no encontrado');
    res.json(item);
  } catch (err) {
    next(err);
  }
}

// PUT /:clave — protegido: upsert por clave. Si llega archivo, actualiza la
// imagen y borra la anterior de Cloudinary tras guardar en BD.
async function upsertByClave(req, res, next) {
  try {
    const { clave } = req.params;
    if (!clave) throw badRequest('Falta la clave');

    const { titulo, descripcion, activo } = req.body;

    const existente = await prisma.contenidoEditable.findUnique({
      where: { municipioId_clave: { municipioId: req.municipio.id, clave } },
    });

    const data = {};
    if (titulo !== undefined) data.titulo = titulo || null;
    if (descripcion !== undefined) data.descripcion = descripcion || null;
    if (activo !== undefined) data.activo = coerceBool(activo);

    let oldPublicId = null;
    if (req.file) {
      oldPublicId = existente?.cloudinaryPublicId || extractPublicId(existente?.imagenUrl);
      data.imagenUrl = req.file.path;
      data.cloudinaryPublicId = extractPublicId(req.file.path);
    }

    const saved = await prisma.contenidoEditable.upsert({
      where: { municipioId_clave: { municipioId: req.municipio.id, clave } },
      update: data,
      create: {
        municipioId: req.municipio.id,
        clave,
        titulo: data.titulo ?? null,
        descripcion: data.descripcion ?? null,
        imagenUrl: data.imagenUrl ?? null,
        cloudinaryPublicId: data.cloudinaryPublicId ?? null,
        activo: data.activo ?? true,
      },
    });

    if (req.file && oldPublicId && oldPublicId !== saved.cloudinaryPublicId) {
      await destroyCloudinary(oldPublicId);
    }

    res.json(saved);
  } catch (err) {
    next(err);
  }
}

// DELETE /:clave — protegido.
async function remove(req, res, next) {
  try {
    const existente = await prisma.contenidoEditable.findUnique({
      where: {
        municipioId_clave: { municipioId: req.municipio.id, clave: req.params.clave },
      },
    });
    if (!existente) throw notFound('Contenido no encontrado');

    const oldPublicId = existente.cloudinaryPublicId || extractPublicId(existente.imagenUrl);
    await prisma.contenidoEditable.delete({ where: { id: existente.id } });
    await destroyCloudinary(oldPublicId);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getByClave, upsertByClave, remove };
