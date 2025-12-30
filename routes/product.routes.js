// routes/product.routes.js
const express = require('express');
const router = express.Router();
const productController = require('../controllers/product.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');

// 所有路由都必須通過 Token 驗證
router.use(authMiddleware.verifyToken);

// 所有路由都必須具備 Admin 角色
// 這是一道全域閘門，確保任何掛載於此的 API 都受到保護
router.use(roleMiddleware.requireRole('admin'));

// 取得列表
router.get('/', productController.getProducts);

// 強制刷新
router.post('/refresh', productController.refresh);

module.exports = router;