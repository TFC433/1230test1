// routes/announcement.routes.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/announcement.controller');

// GET /api/announcements/
router.get('/', controller.getAnnouncements);

// POST /api/announcements/
router.post('/', controller.createAnnouncement);

// PUT /api/announcements/:id
router.put('/:id', controller.updateAnnouncement);

// DELETE /api/announcements/:id
router.delete('/:id', controller.deleteAnnouncement);

module.exports = router;