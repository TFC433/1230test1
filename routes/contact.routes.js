// routes/contact.routes.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/contact.controller');

// GET /api/contacts/
router.get('/', controller.searchContacts);

// GET /api/contacts/list (舊 API 路由是 /api/contact-list)
// 為了保持 API URL 不變，我們在總路由 (index.js) 中單獨處理
// 這裡我們先定義好 /:rowIndex/upgrade 等
router.post('/:rowIndex/upgrade', controller.upgradeContact);
router.post('/:contactId/link-card', controller.linkCardToContact);
router.post('/:rowIndex/file', controller.fileContact);
router.put('/:contactId', controller.updateContact);


module.exports = router;