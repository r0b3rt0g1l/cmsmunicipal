const prisma = require('../config/database');
const { slugify } = require('../utils/slugify');
const { badRequest, notFound, conflict, forbidden } = require('../utils/errors');

async function list(req, res, next) {
  try {
    const municipios = await prisma.municipio.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    });
    res.json(municipios);
  } catch (err) {
    next(err);
  }
}

async function detail(req, res, next) {
  try {
    const municipio = await prisma.municipio.findUnique({ where: { slug: req.params.slug } });
    if (!municipio) {
      throw notFound('Municipio no encontrado');
    }
    res.json(municipio);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { nombre, slug, estado, escudoUrl, dominio } = req.body;

    if (!nombre) {
      throw badRequest('nombre es requerido');
    }

    const finalSlug = slug ? slugify(slug) : slugify(nombre);
    if (!finalSlug) {
      throw badRequest('No se pudo generar un slug valido');
    }

    const existente = await prisma.municipio.findUnique({ where: { slug: finalSlug } });
    if (existente) {
      throw conflict(`Ya existe un municipio con slug '${finalSlug}'`);
    }

    const municipio = await prisma.municipio.create({
      data: {
        nombre,
        slug: finalSlug,
        estado: estado || 'Sonora',
        escudoUrl: escudoUrl || null,
        dominio: dominio || null,
      },
    });

    res.status(201).json(municipio);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const existente = await prisma.municipio.findUnique({ where: { slug: req.params.slug } });
    if (!existente) {
      throw notFound('Municipio no encontrado');
    }

    // Aislamiento de tenants: un admin solo puede editar SU propio municipio.
    // Este router no pasa por resolveMunicipio (usa :slug), asi que validamos
    // contra el registro recien cargado. Escape hatch para superadmin (rol no
    // existe hoy en el modelo Usuario; queda listo para administracion global).
    if (req.user.rol !== 'superadmin' && req.user.municipioId !== existente.id) {
      throw forbidden('No autorizado para este municipio');
    }

    const { nombre, slug, estado, escudoUrl, dominio, activo } = req.body;

    const data = {};
    if (nombre !== undefined) data.nombre = nombre;
    if (slug !== undefined) data.slug = slugify(slug);
    if (estado !== undefined) data.estado = estado;
    if (escudoUrl !== undefined) data.escudoUrl = escudoUrl;
    if (dominio !== undefined) data.dominio = dominio;
    if (activo !== undefined) data.activo = Boolean(activo);

    const municipio = await prisma.municipio.update({
      where: { id: existente.id },
      data,
    });

    res.json(municipio);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, detail, create, update };
