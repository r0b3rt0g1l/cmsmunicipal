const prisma = require('../config/database');
const { cloudinary } = require('../config/cloudinary');
const { badRequest, notFound } = require('../utils/errors');
const { slugify } = require('../utils/slugify');

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_MIME = 'application/pdf';

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
    if (!req.file) {
      throw badRequest('No se recibio ningun archivo');
    }
    if (req.file.mimetype !== ALLOWED_MIME) {
      throw badRequest('El archivo debe ser PDF (application/pdf)');
    }
    if (req.file.size > MAX_FILE_SIZE) {
      throw badRequest('El archivo excede el tamano maximo de 25 MB');
    }

    const { titulo, descripcion, tipo, categoria, anio, trimestre, ambito, publicado, orden } = req.body;

    if (!titulo || !String(titulo).trim()) {
      throw badRequest('El titulo es requerido');
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
        archivoUrl: req.file.path,
        tipo: tipo || null,
        categoria: categoria || null,
        anio: anioInt,
        trimestre: trimestreInt,
        ambito: ambito || null,
        slug,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        fileName: req.file.originalname,
        cloudinaryPublicId: req.file.filename || null,
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

    const { titulo, descripcion, tipo, categoria, anio, trimestre, ambito, publicado, orden } = req.body;
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
    if (req.file) {
      if (req.file.mimetype !== ALLOWED_MIME) {
        throw badRequest('El archivo debe ser PDF (application/pdf)');
      }
      if (req.file.size > MAX_FILE_SIZE) {
        throw badRequest('El archivo excede el tamano maximo de 25 MB');
      }
      publicIdAntiguo = existente.cloudinaryPublicId;
      mimeAntiguo = existente.mimeType;
      data.archivoUrl = req.file.path;
      data.fileSize = req.file.size;
      data.mimeType = req.file.mimetype;
      data.fileName = req.file.originalname;
      data.cloudinaryPublicId = req.file.filename || null;
    }

    const actualizado = await prisma.documento.update({
      where: { id: existente.id },
      data,
    });

    if (publicIdAntiguo) {
      await destroyConFallback(publicIdAntiguo, mimeAntiguo);
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

    await prisma.documento.delete({ where: { id: documento.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
