// routes/system.routes.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/system.controller');

// 系統設定
// GET /api/config
router.get('/config', controller.getSystemConfig);

// 清除快取
// POST /api/cache/invalidate
router.post('/cache/invalidate', controller.invalidateCache);

// --- 【*** 新增：系統狀態輪詢路由 ***】 ---
// GET /api/system/status
router.get('/system/status', controller.getSystemStatus);
// --- 【*** 新增結束 ***】 ---

// 儀表板
// GET /api/dashboard
router.get('/dashboard', controller.getDashboardData);

// GET /api/contacts/dashboard
router.get('/contacts/dashboard', controller.getContactsDashboardData);

// GET /api/events/dashboard
router.get('/events/dashboard', controller.getEventsDashboardData);

// GET /api/companies/dashboard
router.get('/companies/dashboard', controller.getCompaniesDashboardData);

module.exports = router;