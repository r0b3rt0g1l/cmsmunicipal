const prisma = require('../config/database');
const { cloudinary } = require('../config/cloudinary');
const { badRequest, notFound } = require('../utils/errors');

async function list(req, res, next) {
  try {
    const { categoria, anio } = req.query;

    const where = { municipioId: req.municipio.id };
    if (categoria) where.categoria = categoria;
    if (anio) where.anio = parseInt(anio, 10);

    const documentos = await prisma.documento.findMany({
      where,
      orderBy: { creadoEn: 'desc' },
    });

    res.json(documentos);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    if (!req.file) {
      throw badRequest('No se recibio ningun archivo');
    }

    const { titulo, descripcion, tipo, categoria, anio, trimestre } = req.body;

    if (!titulo) {
      throw badRequest('El titulo es requerido');
    }

    const documento = await prisma.documento.create({
      data: {
        municipioId: req.municipio.id,
        titulo,
        descripcion: descripcion || null,
        archivoUrl: req.file.path,
        tipo: tipo || null,
        categoria: categoria || null,
        anio: anio ? parseInt(anio, 10) : null,
        trimestre: trimestre ? parseInt(trimestre, 10) : null,
      },
    });

    res.status(201).json(documento);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const documento = await prisma.documento.findUnique({ where: { id: req.params.id } });
    if (!documento || documento.municipioId !== req.municipio.id) {
      throw notFound('Documento no encontrado');
    }

    const match = documento.archivoUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
    if (match && match[1]) {
      try {
        await cloudinary.uploader.destroy(match[1]);
      } catch (cloudErr) {
        console.error('Error al borrar de Cloudinary:', cloudErr.message);
      }
    }

    await prisma.documento.delete({ where: { id: documento.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, remove };
