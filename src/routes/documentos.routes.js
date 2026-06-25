const express = require('express');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const resolveMunicipio = require('../middleware/municipio');
const assertSameTenant = require('../middleware/assertSameTenant');
const { upload } = require('../config/cloudinary');
const { list, create, update, remove } = require('../controllers/documentos.controller');

const router = express.Router({ mergeParams: true });

router.use(resolveMunicipio);

router.get('/', list);
router.post('/', auth, requireRole('admin', 'editor'), assertSameTenant, upload.fields([{ name: 'archivo', maxCount: 1 }, { name: 'portada', maxCount: 1 }]), create);
router.patch('/:id', auth, requireRole('admin', 'editor'), assertSameTenant, upload.fields([{ name: 'archivo', maxCount: 1 }, { name: 'portada', maxCount: 1 }]), update);
router.delete('/:id', auth, requireRole('admin', 'editor'), assertSameTenant, remove);

module.exports = router;
