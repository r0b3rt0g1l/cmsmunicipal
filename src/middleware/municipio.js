const prisma = require('../config/database');
const { notFound } = require('../utils/errors');

async function resolveMunicipio(req, res, next) {
  try {
    const slug = req.params.municipio;
    if (!slug) {
      return next(notFound('Municipio no especificado'));
    }

    const municipio = await prisma.municipio.findUnique({ where: { slug } });
    if (!municipio || !municipio.activo) {
      return next(notFound(`Municipio '${slug}' no encontrado`));
    }

    req.municipio = municipio;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = resolveMunicipio;
