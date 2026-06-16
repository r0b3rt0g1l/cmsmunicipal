const prisma = require('../config/database');
const { cloudinary } = require('../config/cloudinary');
const { slugify } = require('../utils/slugify');
const { badRequest, notFound, forbidden } = require('../utils/errors');

// Extrae el public_id de Cloudinary desde la URL (mismo patrón que funcionarios),
// para poder borrar la imagen al reemplazar o eliminar la noticia.
function extractPublicId(url) {
  if (!url) return null;
  const m = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
  return m && m[1] ? m[1] : null;
}

async function list(req, res, next) {
  try {
    const noticias = await prisma.noticia.findMany({
      where: {
        municipioId: req.municipio.id,
        estado: 'publicado',
      },
      orderBy: { creadoEn: 'desc' },
      select: {
        id: true,
        titulo: true,
        slug: true,
        extracto: true,
        imagenUrl: true,
        categoria: true,
        publicarEn: true,
        creadoEn: true,
      },
    });
    res.json(noticias);
  } catch (err) {
    next(err);
  }
}

async function detail(req, res, next) {
  try {
    const noticia = await prisma.noticia.findUnique({
      where: {
        municipioId_slug: {
          municipioId: req.municipio.id,
          slug: req.params.slug,
        },
      },
      include: {
        autor: { select: { id: true, nombre: true } },
      },
    });

    if (!noticia || noticia.estado !== 'publicado') {
      throw notFound('Noticia no encontrada');
    }

    res.json(noticia);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { titulo, contenido, extracto, categoria, estado, publicarEn, slug } = req.body;

    if (!titulo || !contenido) {
      throw badRequest('titulo y contenido son requeridos');
    }
    // La imagen es OBLIGATORIA al crear (regla autoritativa del backend, no solo del navegador).
    if (!req.file) {
      throw badRequest('La imagen es obligatoria para crear una noticia.');
    }
    const imagenUrl = req.file.path;
    const cloudinaryPublicId = extractPublicId(imagenUrl);

    let finalSlug = slug ? slugify(slug) : slugify(titulo);
    if (!finalSlug) {
      throw badRequest('No se pudo generar un slug valido');
    }

    const existente = await prisma.noticia.findUnique({
      where: { municipioId_slug: { municipioId: req.municipio.id, slug: finalSlug } },
    });
    if (existente) {
      let counter = 2;
      while (
        await prisma.noticia.findUnique({
          where: { municipioId_slug: { municipioId: req.municipio.id, slug: `${finalSlug}-${counter}` } },
        })
      ) {
        counter += 1;
      }
      finalSlug = `${finalSlug}-${counter}`;
    }

    const noticia = await prisma.noticia.create({
      data: {
        municipioId: req.municipio.id,
        titulo,
        slug: finalSlug,
        contenido,
        extracto: extracto || null,
        imagenUrl,
        cloudinaryPublicId,
        categoria: categoria || null,
        estado: estado === 'publicado' ? 'publicado' : 'borrador',
        publicarEn: publicarEn ? new Date(publicarEn) : null,
        autorId: req.user.id,
      },
    });

    res.status(201).json(noticia);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const noticia = await prisma.noticia.findUnique({ where: { id: req.params.id } });
    if (!noticia || noticia.municipioId !== req.municipio.id) {
      throw notFound('Noticia no encontrada');
    }

    if (req.user.rol !== 'admin' && noticia.autorId !== req.user.id) {
      throw forbidden('Solo puedes editar tus propias noticias');
    }

    const { titulo, contenido, extracto, categoria, estado, publicarEn, slug } = req.body;

    const data = {};
    if (titulo !== undefined) data.titulo = titulo;
    if (contenido !== undefined) data.contenido = contenido;
    if (extracto !== undefined) data.extracto = extracto;
    if (categoria !== undefined) data.categoria = categoria;
    if (estado !== undefined) data.estado = estado === 'publicado' ? 'publicado' : 'borrador';
    if (publicarEn !== undefined) data.publicarEn = publicarEn ? new Date(publicarEn) : null;
    if (slug !== undefined) data.slug = slugify(slug);

    // Imagen OPCIONAL al editar: si llega un archivo nuevo, reemplaza y borra el anterior
    // de Cloudinary; si no llega, se conservan imagenUrl y cloudinaryPublicId actuales.
    let oldPublicId = null;
    if (req.file) {
      oldPublicId = noticia.cloudinaryPublicId || extractPublicId(noticia.imagenUrl);
      data.imagenUrl = req.file.path;
      data.cloudinaryPublicId = extractPublicId(req.file.path);
    }

    const actualizada = await prisma.noticia.update({
      where: { id: noticia.id },
      data,
    });

    if (oldPublicId) {
      try {
        await cloudinary.uploader.destroy(oldPublicId);
      } catch (cloudErr) {
        console.error('Error al borrar imagen vieja de Cloudinary:', cloudErr.message);
      }
    }

    res.json(actualizada);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const noticia = await prisma.noticia.findUnique({ where: { id: req.params.id } });
    if (!noticia || noticia.municipioId !== req.municipio.id) {
      throw notFound('Noticia no encontrada');
    }

    if (req.user.rol !== 'admin' && noticia.autorId !== req.user.id) {
      throw forbidden('Solo puedes eliminar tus propias noticias');
    }

    const publicId = noticia.cloudinaryPublicId || extractPublicId(noticia.imagenUrl);

    await prisma.noticia.delete({ where: { id: noticia.id } });

    if (publicId) {
      try {
        await cloudinary.uploader.destroy(publicId);
      } catch (cloudErr) {
        console.error('Error al borrar imagen de Cloudinary:', cloudErr.message);
      }
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, detail, create, update, remove };
