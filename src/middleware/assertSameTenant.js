const { forbidden, unauthorized } = require('../utils/errors');

// Aislamiento de tenants. Debe correr DESPUES de `auth` (setea req.user con su
// municipioId) y de `resolveMunicipio` (setea req.municipio desde el slug de la
// URL). Sin esta validacion un admin autenticado de un municipio podria escribir
// en otro cambiando el slug de la ruta. Los checks por-item de cada controlador
// se mantienen como defensa en profundidad.
//
// Escape hatch para superadmin: el rol no existe hoy en el modelo Usuario, pero
// dejamos el bypass listo para cuando se introduzca administracion global.
function assertSameTenant(req, res, next) {
  if (!req.user) {
    return next(unauthorized('Autenticacion requerida'));
  }
  if (req.user.rol === 'superadmin') {
    return next();
  }
  if (!req.municipio || req.user.municipioId !== req.municipio.id) {
    return next(forbidden('No autorizado para este municipio'));
  }
  next();
}

module.exports = assertSameTenant;
