const express = require('express');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const resolveMunicipio = require('../middleware/municipio');
const assertSameTenant = require('../middleware/assertSameTenant');
const { upload } = require('../config/cloudinary');
const { detail, replace, remove } = require('../controllers/portada-historia.controller');

const router = express.Router({ mergeParams: true });

router.use(resolveMunicipio);

// GET público — el sitio lo consume para decidir entre la URL del CMS y
// el fallback estático del repo.
router.get('/', detail);

// Subir/reemplazar la imagen. Multipart: campo `archivo`.
router.put('/', auth, requireRole('admin', 'editor'), assertSameTenant, upload.single('archivo'), replace);

// Quitar la imagen actual. El sitio caerá al fallback estático.
router.delete('/', auth, requireRole('admin', 'editor'), assertSameTenant, remove);

module.exports = router;
