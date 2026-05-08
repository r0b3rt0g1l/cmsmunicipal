const prisma = require('../config/database');
const { cloudinary } = require('../config/cloudinary');
const { badRequest, notFound } = require('../utils/errors');

async function list(req, res, next) {
  try {
    const { galeria } = req.query;

    const where = { municipioId: req.municipio.id };
    if (galeria) {
      where.galeria = galeria;
    }

    const imagenes = await prisma.imagen.findMany({
      where,
      orderBy: [{ orden: 'asc' }, { creadoEn: 'desc' }],
    });

    res.json(imagenes);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    if (!req.file) {
      throw badRequest('No se recibio ningun archivo');
    }

    const { titulo, descripcion, altText, galeria, orden } = req.body;

    const imagen = await prisma.imagen.create({
      data: {
        municipioId: req.municipio.id,
        titulo: titulo || null,
        descripcion: descripcion || null,
        url: req.file.path,
        urlThumbnail: req.file.path,
        altText: altText || null,
        galeria: galeria || 'general',
        orden: orden ? parseInt(orden, 10) : 0,
      },
    });

    res.status(201).json(imagen);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const imagen = await prisma.imagen.findUnique({ where: { id: req.params.id } });
    if (!imagen || imagen.municipioId !== req.municipio.id) {
      throw notFound('Imagen no encontrada');
    }

    const { titulo, descripcion, altText, galeria, orden } = req.body;

    const data = {};
    if (titulo !== undefined) data.titulo = titulo;
    if (descripcion !== undefined) data.descripcion = descripcion;
    if (altText !== undefined) data.altText = altText;
    if (galeria !== undefined) data.galeria = galeria;
    if (orden !== undefined) data.orden = parseInt(orden, 10);

    const actualizada = await prisma.imagen.update({
      where: { id: imagen.id },
      data,
    });

    res.json(actualizada);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const imagen = await prisma.imagen.findUnique({ where: { id: req.params.id } });
    if (!imagen || imagen.municipioId !== req.municipio.id) {
      throw notFound('Imagen no encontrada');
    }

    const match = imagen.url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
    if (match && match[1]) {
      try {
        await cloudinary.uploader.destroy(match[1]);
      } catch (cloudErr) {
        console.error('Error al borrar de Cloudinary:', cloudErr.message);
      }
    }

    await prisma.imagen.delete({ where: { id: imagen.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
async function replace(req, res, next) {
  try {
    if (!req.file) {
      throw badRequest('No se recibio ningun archivo');
    }

    const imagen = await prisma.imagen.findUnique({ where: { id: req.params.id } });
    if (!imagen || imagen.municipioId !== req.municipio.id) {
      throw notFound('Imagen no encontrada');
    }

    const oldUrl = imagen.url;

    const actualizada = await prisma.imagen.update({
      where: { id: imagen.id },
      data: {
        url: req.file.path,
        urlThumbnail: req.file.path,
      },
    });

    const match = oldUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
    if (match && match[1]) {
      try {
        await cloudinary.uploader.destroy(match[1]);
      } catch (cloudErr) {
        console.error('Error al borrar imagen vieja de Cloudinary:', cloudErr.message);
      }
    }

    res.json(actualizada);
  } catch (err) {
    next(err);
  }
}
module.exports = { list, create, update, replace, remove };