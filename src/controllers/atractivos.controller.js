const prisma = require('../config/database');
const { cloudinary } = require('../config/cloudinary');
const { slugify } = require('../utils/slugify');
const { badRequest, notFound } = require('../utils/errors');

// Extrae el public_id de Cloudinary desde la URL (mismo patrón que noticias/funcionarios),
// para poder borrar la imagen al reemplazar o eliminar el atractivo.
function extractPublicId(url) {
  if (!url) return null;
  const m = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
  return m && m[1] ? m[1] : null;
}

function parseBool(value, def) {
  if (value === undefined || value === '') return def;
  return value === true || value === 'true' || value === 'on' || value === '1';
}

function parseNum(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

// Lista de public_ids a eliminar de la galería: acepta CSV o JSON array.
function parseLista(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  const s = String(value).trim();
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

// Normaliza un archivo subido a { url, publicId } para la galería (Json).
function toGaleriaItem(file) {
  return { url: file.path, publicId: file.filename || extractPublicId(file.path) };
}

async function list(req, res, next) {
  try {
    const atractivos = await prisma.atractivo.findMany({
      where: { municipioId: req.municipio.id, publicado: true },
      orderBy: [{ orden: 'asc' }, { creadoEn: 'desc' }],
    });
    res.json(atractivos);
  } catch (err) {
    next(err);
  }
}

async function detail(req, res, next) {
  try {
    const atractivo = await prisma.atractivo.findUnique({
      where: {
        municipioId_slug: { municipioId: req.municipio.id, slug: req.params.slug },
      },
    });
    if (!atractivo || !atractivo.publicado) {
      throw notFound('Atractivo no encontrado');
    }
    res.json(atractivo);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const {
      nombre, tipo, ubicacion, descripcionCorta, descripcionLarga,
      horario, lat, lon, destacado, publicado, orden, slug,
    } = req.body;

    if (!nombre) throw badRequest('El nombre es obligatorio.');

    const portada = req.files?.portada?.[0] || null;
    const galeriaFiles = req.files?.galeria || [];

    let finalSlug = slug ? slugify(slug) : slugify(nombre);
    if (!finalSlug) throw badRequest('No se pudo generar un slug válido.');
    const existe = (s) =>
      prisma.atractivo.findUnique({
        where: { municipioId_slug: { municipioId: req.municipio.id, slug: s } },
      });
    if (await existe(finalSlug)) {
      let counter = 2;
      while (await existe(`${finalSlug}-${counter}`)) counter += 1;
      finalSlug = `${finalSlug}-${counter}`;
    }

    const atractivo = await prisma.atractivo.create({
      data: {
        municipioId: req.municipio.id,
        slug: finalSlug,
        nombre,
        tipo: tipo || null,
        ubicacion: ubicacion || null,
        descripcionCorta: descripcionCorta || null,
        descripcionLarga: descripcionLarga || null,
        imagenUrl: portada ? portada.path : null,
        cloudinaryPublicId: portada ? (portada.filename || extractPublicId(portada.path)) : null,
        galeria: galeriaFiles.map(toGaleriaItem),
        lat: parseNum(lat),
        lon: parseNum(lon),
        horario: horario || null,
        destacado: parseBool(destacado, false),
        publicado: parseBool(publicado, true),
        orden: orden !== undefined && orden !== '' ? parseInt(orden, 10) : 0,
      },
    });

    res.status(201).json(atractivo);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const atractivo = await prisma.atractivo.findUnique({ where: { id: req.params.id } });
    if (!atractivo || atractivo.municipioId !== req.municipio.id) {
      throw notFound('Atractivo no encontrado');
    }

    const {
      nombre, tipo, ubicacion, descripcionCorta, descripcionLarga,
      horario, lat, lon, destacado, publicado, orden, slug, galeriaEliminar,
    } = req.body;

    const data = {};
    if (nombre !== undefined) data.nombre = nombre;
    if (tipo !== undefined) data.tipo = tipo || null;
    if (ubicacion !== undefined) data.ubicacion = ubicacion || null;
    if (descripcionCorta !== undefined) data.descripcionCorta = descripcionCorta || null;
    if (descripcionLarga !== undefined) data.descripcionLarga = descripcionLarga || null;
    if (horario !== undefined) data.horario = horario || null;
    if (lat !== undefined) data.lat = parseNum(lat);
    if (lon !== undefined) data.lon = parseNum(lon);
    if (destacado !== undefined) data.destacado = parseBool(destacado, false);
    if (publicado !== undefined) data.publicado = parseBool(publicado, true);
    if (orden !== undefined) data.orden = orden === '' ? 0 : parseInt(orden, 10);
    if (slug !== undefined && slug) data.slug = slugify(slug);

    // Portada nueva → reemplaza y borra la anterior de Cloudinary.
    const portada = req.files?.portada?.[0] || null;
    let oldPortadaPublicId = null;
    if (portada) {
      oldPortadaPublicId = atractivo.cloudinaryPublicId || extractPublicId(atractivo.imagenUrl);
      data.imagenUrl = portada.path;
      data.cloudinaryPublicId = portada.filename || extractPublicId(portada.path);
    }

    // Galería: quitar las marcadas (por public_id) + agregar las nuevas.
    const galeriaActual = Array.isArray(atractivo.galeria) ? atractivo.galeria : [];
    const aEliminar = parseLista(galeriaEliminar);
    const publicIdsBorrados = [];
    let nuevaGaleria = galeriaActual;
    if (aEliminar.length > 0) {
      nuevaGaleria = galeriaActual.filter((g) => {
        const conservar = !aEliminar.includes(g.publicId);
        if (!conservar && g.publicId) publicIdsBorrados.push(g.publicId);
        return conservar;
      });
    }
    const galeriaFiles = req.files?.galeria || [];
    if (galeriaFiles.length > 0) {
      nuevaGaleria = nuevaGaleria.concat(galeriaFiles.map(toGaleriaItem));
    }
    if (aEliminar.length > 0 || galeriaFiles.length > 0) {
      data.galeria = nuevaGaleria;
    }

    const actualizado = await prisma.atractivo.update({
      where: { id: atractivo.id },
      data,
    });

    // Limpieza de Cloudinary (no bloquea la respuesta).
    if (oldPortadaPublicId) {
      try { await cloudinary.uploader.destroy(oldPortadaPublicId); } catch (e) {
        console.error('Error al borrar portada vieja de Cloudinary:', e.message);
      }
    }
    for (const pid of publicIdsBorrados) {
      try { await cloudinary.uploader.destroy(pid); } catch (e) {
        console.error('Error al borrar imagen de galería de Cloudinary:', e.message);
      }
    }

    res.json(actualizado);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const atractivo = await prisma.atractivo.findUnique({ where: { id: req.params.id } });
    if (!atractivo || atractivo.municipioId !== req.municipio.id) {
      throw notFound('Atractivo no encontrado');
    }

    const publicIds = [];
    const portadaPid = atractivo.cloudinaryPublicId || extractPublicId(atractivo.imagenUrl);
    if (portadaPid) publicIds.push(portadaPid);
    const galeria = Array.isArray(atractivo.galeria) ? atractivo.galeria : [];
    for (const g of galeria) {
      if (g && g.publicId) publicIds.push(g.publicId);
    }

    await prisma.atractivo.delete({ where: { id: atractivo.id } });

    for (const pid of publicIds) {
      try { await cloudinary.uploader.destroy(pid); } catch (e) {
        console.error('Error al borrar imagen de Cloudinary:', e.message);
      }
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, detail, create, update, remove };
