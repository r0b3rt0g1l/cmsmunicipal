const prisma = require('../config/database');
const { cloudinary } = require('../config/cloudinary');
const { badRequest, notFound } = require('../utils/errors');

const TIPOS_VALIDOS = ['PRESIDENTE', 'SINDICA', 'REGIDOR', 'DIF', 'SECRETARIO', 'TESORERO', 'CONTRALOR', 'OTRO'];

// Deriva la categoria/tipo (que el portal usa para AGRUPAR) a partir del texto
// libre del cargo. Es la garantia de que tipo y cargo no queden desfasados: si
// el cargo implica claramente una categoria, esa gana sobre lo que mande el
// cliente. El orden importa ("DIF" y "control" antes que "presiden"). Devuelve
// null cuando el cargo no contiene ninguna palabra clave conocida (cargos
// libres como comisarias rurales), y el llamador cae a la categoria elegida u 'OTRO'.
function deriveTipo(cargo) {
  const c = (cargo || '').toLowerCase();
  if (!c) return null;
  if (c.includes('dif')) return 'DIF';
  if (c.includes('sindic') || c.includes('síndic')) return 'SINDICA';
  if (c.includes('regidor') || c.includes('regidur')) return 'REGIDOR';
  if (c.includes('secretari')) return 'SECRETARIO';
  if (c.includes('tesorer')) return 'TESORERO';
  if (
    c.includes('contralor') ||
    c.includes('control') ||
    c.includes('organo interno') ||
    c.includes('órgano interno')
  ) {
    return 'CONTRALOR';
  }
  if (c.includes('comisar')) return 'OTRO';
  if (c.includes('presiden')) return 'PRESIDENTE';
  return null;
}

// Resuelve el tipo final sincronizado con el cargo. Regla: si el cargo implica
// una categoria conocida, esa manda (corrige desfases al re-guardar); si no,
// respeta la categoria elegida por el operador; en ultimo caso 'OTRO'.
function resolveTipo(cargo, requestedTipo) {
  const derived = deriveTipo(cargo);
  if (derived) return derived;
  if (requestedTipo && TIPOS_VALIDOS.includes(requestedTipo)) return requestedTipo;
  return 'OTRO';
}

function parseBool(v, def) {
  if (v === undefined) return def;
  return v === true || v === 'true' || v === 'on';
}

function extractPublicId(url) {
  if (!url) return null;
  const m = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
  return m && m[1] ? m[1] : null;
}

async function list(req, res, next) {
  try {
    const { tipo, activo } = req.query;
    const where = { municipioId: req.municipio.id };
    if (tipo) {
      if (!TIPOS_VALIDOS.includes(tipo)) throw badRequest('tipo invalido');
      where.tipo = tipo;
    }
    if (activo !== undefined) where.activo = activo === 'true';
    const items = await prisma.funcionario.findMany({
      where,
      orderBy: [{ orden: 'asc' }, { creadoEn: 'asc' }],
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
}

async function detail(req, res, next) {
  try {
    const item = await prisma.funcionario.findUnique({ where: { id: req.params.id } });
    if (!item || item.municipioId !== req.municipio.id) {
      throw notFound('Funcionario no encontrado');
    }
    res.json(item);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { nombre, cargo, tipo, area, email, telefono, bio, administracion, orden, activo } =
      req.body;

    if (!nombre || !cargo) {
      throw badRequest('nombre y cargo son requeridos');
    }

    // tipo se sincroniza con el cargo: no puede quedar desfasado.
    const finalTipo = resolveTipo(cargo, tipo);

    const fotoUrl = req.file ? req.file.path : null;
    const cloudinaryPublicId = fotoUrl ? extractPublicId(fotoUrl) : null;

    const item = await prisma.funcionario.create({
      data: {
        municipioId: req.municipio.id,
        nombre,
        cargo,
        tipo: finalTipo,
        area: area || null,
        email: email || null,
        telefono: telefono || null,
        bio: bio || null,
        administracion: administracion || null,
        fotoUrl,
        cloudinaryPublicId,
        orden: orden !== undefined && orden !== '' ? parseInt(orden, 10) : 0,
        activo: parseBool(activo, true),
      },
    });
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const item = await prisma.funcionario.findUnique({ where: { id: req.params.id } });
    if (!item || item.municipioId !== req.municipio.id) {
      throw notFound('Funcionario no encontrado');
    }

    const data = {};
    const stringKeys = ['nombre', 'cargo', 'area', 'email', 'telefono', 'bio', 'administracion'];
    for (const k of stringKeys) {
      if (req.body[k] !== undefined) {
        const val = typeof req.body[k] === 'string' ? req.body[k].trim() : req.body[k];
        data[k] = val === '' ? null : val;
      }
    }
    if (req.body.orden !== undefined && req.body.orden !== '') {
      data.orden = parseInt(req.body.orden, 10);
    }
    if (req.body.activo !== undefined) {
      data.activo = parseBool(req.body.activo, item.activo);
    }

    if (data.nombre === null) throw badRequest('nombre es requerido');
    if (data.cargo === null) throw badRequest('cargo es requerido');

    // Re-sincroniza tipo con el cargo en CADA guardado (aunque el cliente no
    // toque tipo): asi los registros viejos mal tipados se auto-corrigen al
    // re-guardarse y nunca quedan desfasados. cargo efectivo = el nuevo si vino
    // en el body, si no el ya almacenado.
    const effectiveCargo = data.cargo !== undefined ? data.cargo : item.cargo;
    const requestedTipo = req.body.tipo !== undefined ? (req.body.tipo || null) : item.tipo;
    data.tipo = resolveTipo(effectiveCargo, requestedTipo);

    const updated = await prisma.funcionario.update({
      where: { id: item.id },
      data,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

async function replaceFoto(req, res, next) {
  try {
    if (!req.file) {
      throw badRequest('No se recibio ningun archivo');
    }
    const item = await prisma.funcionario.findUnique({ where: { id: req.params.id } });
    if (!item || item.municipioId !== req.municipio.id) {
      throw notFound('Funcionario no encontrado');
    }

    const oldPublicId = item.cloudinaryPublicId || extractPublicId(item.fotoUrl);

    const updated = await prisma.funcionario.update({
      where: { id: item.id },
      data: {
        fotoUrl: req.file.path,
        cloudinaryPublicId: extractPublicId(req.file.path),
      },
    });

    if (oldPublicId) {
      try {
        await cloudinary.uploader.destroy(oldPublicId);
      } catch (cloudErr) {
        console.error('Error al borrar foto vieja de Cloudinary:', cloudErr.message);
      }
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const item = await prisma.funcionario.findUnique({ where: { id: req.params.id } });
    if (!item || item.municipioId !== req.municipio.id) {
      throw notFound('Funcionario no encontrado');
    }
    const publicId = item.cloudinaryPublicId || extractPublicId(item.fotoUrl);

    await prisma.funcionario.delete({ where: { id: item.id } });

    if (publicId) {
      try {
        await cloudinary.uploader.destroy(publicId);
      } catch (cloudErr) {
        console.error('Error al borrar de Cloudinary:', cloudErr.message);
      }
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, detail, create, update, replaceFoto, remove };
