const prisma = require('../config/database');
const { cloudinary } = require('../config/cloudinary');
const { badRequest, notFound } = require('../utils/errors');

async function list(req, res, next) {
  try {
    const slides = await prisma.heroSlide.findMany({
      where: { municipioId: req.municipio.id },
      orderBy: { orden: 'asc' },
    });
    res.json(slides);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    if (!req.file) {
      throw badRequest('No se recibio ningun archivo');
    }

    const { titulo, etiqueta, subtitulo, textoBoton, linkBoton, orden, activo } = req.body;

    if (!titulo) {
      throw badRequest('El titulo es requerido');
    }

    const slide = await prisma.heroSlide.create({
      data: {
        municipioId: req.municipio.id,
        imagenUrl: req.file.path,
        etiqueta: etiqueta || null,
        titulo,
        subtitulo: subtitulo || null,
        textoBoton: textoBoton || null,
        linkBoton: linkBoton || null,
        orden: orden !== undefined ? parseInt(orden, 10) : 0,
        activo: activo === undefined ? true : activo === 'true' || activo === true || activo === 'on',
      },
    });

    res.status(201).json(slide);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const slide = await prisma.heroSlide.findUnique({ where: { id: req.params.id } });
    if (!slide || slide.municipioId !== req.municipio.id) {
      throw notFound('Slide no encontrado');
    }

    const { titulo, etiqueta, subtitulo, textoBoton, linkBoton, orden, activo } = req.body;

    const data = {};
    if (titulo !== undefined) data.titulo = titulo;
    if (etiqueta !== undefined) data.etiqueta = etiqueta;
    if (subtitulo !== undefined) data.subtitulo = subtitulo;
    if (textoBoton !== undefined) data.textoBoton = textoBoton;
    if (linkBoton !== undefined) data.linkBoton = linkBoton;
    if (orden !== undefined) data.orden = parseInt(orden, 10);
    if (activo !== undefined) {
      data.activo = activo === 'true' || activo === true || activo === 'on';
    }

    const actualizado = await prisma.heroSlide.update({
      where: { id: slide.id },
      data,
    });

    res.json(actualizado);
  } catch (err) {
    next(err);
  }
}

async function replace(req, res, next) {
  try {
    if (!req.file) {
      throw badRequest('No se recibio ningun archivo');
    }

    const slide = await prisma.heroSlide.findUnique({ where: { id: req.params.id } });
    if (!slide || slide.municipioId !== req.municipio.id) {
      throw notFound('Slide no encontrado');
    }

    const oldUrl = slide.imagenUrl;

    const actualizado = await prisma.heroSlide.update({
      where: { id: slide.id },
      data: { imagenUrl: req.file.path },
    });

    const match = oldUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
    if (match && match[1]) {
      try {
        await cloudinary.uploader.destroy(match[1]);
      } catch (cloudErr) {
        console.error('Error al borrar imagen vieja de Cloudinary:', cloudErr.message);
      }
    }

    res.json(actualizado);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const slide = await prisma.heroSlide.findUnique({ where: { id: req.params.id } });
    if (!slide || slide.municipioId !== req.municipio.id) {
      throw notFound('Slide no encontrado');
    }

    const match = slide.imagenUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
    if (match && match[1]) {
      try {
        await cloudinary.uploader.destroy(match[1]);
      } catch (cloudErr) {
        console.error('Error al borrar de Cloudinary:', cloudErr.message);
      }
    }

    await prisma.heroSlide.delete({ where: { id: slide.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, replace, remove };
