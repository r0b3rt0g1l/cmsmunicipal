const express = require('express');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const resolveMunicipio = require('../middleware/municipio');
const { upload } = require('../config/cloudinary');
const { list, create, remove } = require('../controllers/sevac.controller');

const router = express.Router({ mergeParams: true });

router.use(resolveMunicipio);

router.get('/', list);
router.post('/', auth, requireRole('admin', 'editor'), upload.single('archivo'), create);
router.delete('/:id', auth, requireRole('admin', 'editor'), remove);

module.exports = router;
