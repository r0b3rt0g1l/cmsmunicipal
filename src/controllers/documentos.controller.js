const prisma = require('../config/database');
const { cloudinary } = require('../config/cloudinary');
const { badRequest, notFound } = require('../utils/errors');
const { slugify } = require('../utils/slugify');

const MAX_FILE_SIZE = 25 * 1024 * 1024;
// PDF e imágenes (la seccion "Informacion Importante" del portal acepta ambos).
// Cloudinary ya admite estos formatos (resource_type:'auto', allowed_formats).
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);
// La portada (caratula) es SIEMPRE imagen, nunca PDF.
const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);
// Categoria con regla "PDF requiere portada". No aplica a Leyes/SEvAC.
const CATEGORIA_PORTADA_OBLIGATORIA_PDF = 'informacion-relevante';

async function generarSlugUnico(municipioId, titulo, excludeId) {
  const base = slugify(titulo);
  if (!base) return null;
  let candidato = base;
  let n = 1;
  while (true) {
    const where = { municipioId, slug: candidato };
    if (excludeId) where.NOT = { id: excludeId };
    const existe = await prisma.documento.findFirst({ where });
    if (!existe) return candidato;
    n += 1;
    candidato = `${base}-${n}`;
  }
}

function parsePublicado(v, defaultValue) {
  if (v === undefined) return defaultValue;
  if (v === false || v === 'false' || v === '0' || v === 0) return false;
  return true;
}

async function destroyConFallback(publicId, mimeType) {
  if (!publicId) return;
  const candidatos = mimeType && mimeType.includes('pdf') ? ['image', 'raw'] : ['image'];
  for (const resourceType of candidatos) {
    try {
      const r = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
      if (r && r.result === 'ok') return;
    } catch (err) {
      console.error(`Cloudinary destroy (${resourceType}) fallo:`, err.message);
    }
  }
}

async function list(req, res, next) {
  try {
    const { categoria, anio, trimestre, ambito } = req.query;

    const where = { municipioId: req.municipio.id, publicado: true };
    if (categoria) where.categoria = categoria;
    if (anio) where.anio = parseInt(anio, 10);
    if (trimestre) where.trimestre = parseInt(trimestre, 10);
    if (ambito) where.ambito = ambito;

    const documentos = await prisma.documento.findMany({
      where,
      orderBy: [
        { orden: 'asc' },
        { anio: 'desc' },
        { trimestre: 'desc' },
        { creadoEn: 'desc' },
      ],
    });

    res.json(documentos);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const archivo = req.files?.archivo?.[0];
    const portada = req.files?.portada?.[0];

    if (!archivo) {
      throw badRequest('No se recibio ningun archivo');
    }
    if (!ALLOWED_MIMES.has(archivo.mimetype)) {
      throw badRequest('El archivo debe ser PDF o imagen (JPG, PNG, GIF, WebP)');
    }
    if (archivo.size > MAX_FILE_SIZE) {
      throw badRequest('El archivo excede el tamano maximo de 25 MB');
    }
    if (portada && !ALLOWED_IMAGE_MIMES.has(portada.mimetype)) {
      throw badRequest('La portada debe ser una imagen (JPG, PNG, GIF, WebP)');
    }
    if (portada && portada.size > MAX_FILE_SIZE) {
      throw badRequest('La portada excede el tamano maximo de 25 MB');
    }

    const { titulo, descripcion, tipo, categoria, anio, trimestre, ambito, publicado, orden } = req.body;

    if (!titulo || !String(titulo).trim()) {
      throw badRequest('El titulo es requerido');
    }

    // Regla (solo Informacion Relevante): un PDF debe traer portada (caratula).
    if (categoria === CATEGORIA_PORTADA_OBLIGATORIA_PDF
        && archivo.mimetype === 'application/pdf'
        && !portada) {
      throw badRequest('Un PDF requiere imagen de portada');
    }

    let anioInt = null;
    if (anio !== undefined && anio !== '') {
      anioInt = parseInt(anio, 10);
      if (Number.isNaN(anioInt)) throw badRequest('anio invalido');
    }

    let trimestreInt = null;
    if (trimestre !== undefined && trimestre !== '') {
      trimestreInt = parseInt(trimestre, 10);
      if (![1, 2, 3, 4].includes(trimestreInt)) {
        throw badRequest('trimestre debe ser 1, 2, 3 o 4');
      }
    }

    const slug = await generarSlugUnico(req.municipio.id, titulo);

    const documento = await prisma.documento.create({
      data: {
        municipioId: req.municipio.id,
        titulo: String(titulo).trim(),
        descripcion: descripcion || null,
        archivoUrl: archivo.path,
        tipo: tipo || null,
        categoria: categoria || null,
        anio: anioInt,
        trimestre: trimestreInt,
        ambito: ambito || null,
        slug,
        fileSize: archivo.size,
        mimeType: archivo.mimetype,
        fileName: archivo.originalname,
        cloudinaryPublicId: archivo.filename || null,
        portadaUrl: portada ? portada.path : null,
        portadaPublicId: portada ? (portada.filename || null) : null,
        publicado: parsePublicado(publicado, true),
        orden: orden !== undefined && orden !== '' ? parseInt(orden, 10) : 0,
      },
    });

    res.status(201).json(documento);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const existente = await prisma.documento.findUnique({ where: { id: req.params.id } });
    if (!existente || existente.municipioId !== req.municipio.id) {
      throw notFound('Documento no encontrado');
    }

    const archivo = req.files?.archivo?.[0];
    const portada = req.files?.portada?.[0];

    const { titulo, descripcion, tipo, categoria, anio, trimestre, ambito, publicado, orden, quitarPortada } = req.body;
    const data = {};

    if (titulo !== undefined) {
      if (!String(titulo).trim()) throw badRequest('titulo no puede estar vacio');
      data.titulo = String(titulo).trim();
      data.slug = await generarSlugUnico(req.municipio.id, titulo, existente.id);
    }
    if (descripcion !== undefined) data.descripcion = descripcion || null;
    if (tipo !== undefined) data.tipo = tipo || null;
    if (categoria !== undefined) data.categoria = categoria || null;
    if (ambito !== undefined) data.ambito = ambito || null;
    if (anio !== undefined) {
      if (anio === '' || anio === null) {
        data.anio = null;
      } else {
        const n = parseInt(anio, 10);
        if (Number.isNaN(n)) throw badRequest('anio invalido');
        data.anio = n;
      }
    }
    if (trimestre !== undefined) {
      if (trimestre === '' || trimestre === null) {
        data.trimestre = null;
      } else {
        const t = parseInt(trimestre, 10);
        if (![1, 2, 3, 4].includes(t)) throw badRequest('trimestre debe ser 1, 2, 3 o 4');
        data.trimestre = t;
      }
    }
    if (publicado !== undefined) data.publicado = parsePublicado(publicado, true);
    if (orden !== undefined) data.orden = parseInt(orden, 10);

    let publicIdAntiguo = null;
    let mimeAntiguo = null;
    if (archivo) {
      if (!ALLOWED_MIMES.has(archivo.mimetype)) {
        throw badRequest('El archivo debe ser PDF o imagen (JPG, PNG, GIF, WebP)');
      }
      if (archivo.size > MAX_FILE_SIZE) {
        throw badRequest('El archivo excede el tamano maximo de 25 MB');
      }
      publicIdAntiguo = existente.cloudinaryPublicId;
      mimeAntiguo = existente.mimeType;
      data.archivoUrl = archivo.path;
      data.fileSize = archivo.size;
      data.mimeType = archivo.mimetype;
      data.fileName = archivo.originalname;
      data.cloudinaryPublicId = archivo.filename || null;
    }

    // Portada: subir una nueva imagen, o quitarla (quitarPortada).
    let portadaPublicIdAntiguo = null;
    const quitar = quitarPortada === true || quitarPortada === 'true' || quitarPortada === '1';
    if (portada) {
      if (!ALLOWED_IMAGE_MIMES.has(portada.mimetype)) {
        throw badRequest('La portada debe ser una imagen (JPG, PNG, GIF, WebP)');
      }
      if (portada.size > MAX_FILE_SIZE) {
        throw badRequest('La portada excede el tamano maximo de 25 MB');
      }
      portadaPublicIdAntiguo = existente.portadaPublicId;
      data.portadaUrl = portada.path;
      data.portadaPublicId = portada.filename || null;
    } else if (quitar) {
      portadaPublicIdAntiguo = existente.portadaPublicId;
      data.portadaUrl = null;
      data.portadaPublicId = null;
    }

    // Regla "PDF requiere portada" sobre el estado RESULTANTE (solo Informacion
    // Relevante): cubre cambiar a PDF sin portada o quitar la portada de un PDF.
    const categoriaFinal = categoria !== undefined ? categoria : existente.categoria;
    const mimeFinal = archivo ? archivo.mimetype : existente.mimeType;
    const portadaFinal = data.portadaUrl !== undefined ? data.portadaUrl : existente.portadaUrl;
    if (categoriaFinal === CATEGORIA_PORTADA_OBLIGATORIA_PDF
        && mimeFinal === 'application/pdf'
        && !portadaFinal) {
      throw badRequest('Un PDF requiere imagen de portada');
    }

    const actualizado = await prisma.documento.update({
      where: { id: existente.id },
      data,
    });

    if (publicIdAntiguo) {
      await destroyConFallback(publicIdAntiguo, mimeAntiguo);
    }
    if (portadaPublicIdAntiguo) {
      await destroyConFallback(portadaPublicIdAntiguo, 'image/jpeg');
    }

    res.json(actualizado);
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

    if (documento.cloudinaryPublicId) {
      await destroyConFallback(documento.cloudinaryPublicId, documento.mimeType);
    } else {
      const match = documento.archivoUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
      if (match && match[1]) {
        await destroyConFallback(match[1], documento.mimeType);
      }
    }

    if (documento.portadaPublicId) {
      await destroyConFallback(documento.portadaPublicId, 'image/jpeg');
    }

    await prisma.documento.delete({ where: { id: documento.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
