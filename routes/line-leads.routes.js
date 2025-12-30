// routes/line-leads.routes.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/line-leads.controller');

router.get('/leads', controller.getAllLeads);
router.put('/leads/:rowIndex', controller.updateLead);

module.exports = router;