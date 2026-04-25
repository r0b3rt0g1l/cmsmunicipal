const express = require('express');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const { register, login, me } = require('../controllers/auth.controller');

const router = express.Router();

router.post('/register', auth, requireRole('admin'), register);
router.post('/login', login);
router.get('/me', auth, me);

module.exports = router;
