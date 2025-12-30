// routes/product.routes.js
const express = require('express');
const router = express.Router();
const productController = require('../controllers/product.controller');
const authMiddleware = require('../middleware/auth.middleware');
// 注意：roleMiddleware 可能需要依照您的專案路徑引入，這裡假設您有做全域或個別檢查

// 所有 /api/products 路由都需要登入
router.use(authMiddleware);

// 讀取列表
router.get('/', productController.getProducts);

// 強制刷新
router.post('/refresh', productController.refresh);

// ★ 新增：批次更新 (Batch Update)
router.post('/batch', productController.batchUpdate);

module.exports = router;