// routes/external.routes.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/external.controller');

// GET /api/drive/thumbnail
router.get('/drive/thumbnail', controller.getDriveThumbnail);

// POST /api/companies/:companyName/generate-profile
// 注意：因為這個路由依賴於 :companyName，我們必須在 company.routes.js 中定義它
// 我們將在下一步驟中處理

module.exports = router;