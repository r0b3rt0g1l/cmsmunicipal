const express = require('express');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const resolveMunicipio = require('../middleware/municipio');
const assertSameTenant = require('../middleware/assertSameTenant');
const { upload } = require('../config/cloudinary');
const { list, detail, create, update, remove } = require('../controllers/atractivos.controller');

const router = express.Router({ mergeParams: true });

router.use(resolveMunicipio);

// Subida: portada (1) + galería (varias imágenes).
const subirImagenes = upload.fields([
  { name: 'portada', maxCount: 1 },
  { name: 'galeria', maxCount: 12 },
]);

router.get('/', list);
router.get('/:slug', detail);
router.post('/', auth, requireRole('admin', 'editor'), assertSameTenant, subirImagenes, create);
router.patch('/:id', auth, requireRole('admin', 'editor'), assertSameTenant, subirImagenes, update);
router.delete('/:id', auth, requireRole('admin', 'editor'), assertSameTenant, remove);

module.exports = router;
