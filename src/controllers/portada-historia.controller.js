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
    console.error('Cloudinary destroy (portada-historia):', err.message);
  }
}

// GET — público. Devuelve la URL actual o `{ url: null }` si el municipio
// no ha subido portada propia (el sitio cae al fallback estático del repo).
async function detail(req, res, next) {
  try {
    const m = req.municipio;
    res.json({
      url: m.portadaHistoriaUrl || null,
      publicId: m.portadaHistoriaPublicId || null,
    });
  } catch (err) {
    next(err);
  }
}

// PUT — protegido. Sube/reemplaza la portada. Si había una previa, la
// borra de Cloudinary tras actualizar BD.
async function replace(req, res, next) {
  try {
    if (!req.file) {
      throw badRequest('No se recibio ningun archivo');
    }

    const m = req.municipio;
    const oldPublicId = m.portadaHistoriaPublicId || extractPublicId(m.portadaHistoriaUrl);

    const newUrl = req.file.path;
    const newPublicId = extractPublicId(newUrl);

    const updated = await prisma.municipio.update({
      where: { id: m.id },
      data: {
        portadaHistoriaUrl: newUrl,
        portadaHistoriaPublicId: newPublicId,
      },
    });

    // Borrar la imagen vieja DESPUÉS de actualizar BD para no perder la
    // referencia si Cloudinary falla.
    if (oldPublicId && oldPublicId !== newPublicId) {
      await destroyCloudinary(oldPublicId);
    }

    res.json({
      url: updated.portadaHistoriaUrl,
      publicId: updated.portadaHistoriaPublicId,
    });
  } catch (err) {
    next(err);
  }
}

// DELETE — protegido. Borra la imagen actual (vuelve a null en BD y
// se elimina de Cloudinary). El sitio cae al fallback estático.
async function remove(req, res, next) {
  try {
    const m = req.municipio;
    const oldPublicId = m.portadaHistoriaPublicId || extractPublicId(m.portadaHistoriaUrl);

    if (!m.portadaHistoriaUrl && !oldPublicId) {
      throw notFound('No hay portada de Historia para eliminar');
    }

    await prisma.municipio.update({
      where: { id: m.id },
      data: {
        portadaHistoriaUrl: null,
        portadaHistoriaPublicId: null,
      },
    });

    await destroyCloudinary(oldPublicId);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { detail, replace, remove };
