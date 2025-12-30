// routes/product.routes.js
const express = require('express');
const router = express.Router();
const productController = require('../controllers/product.controller');
const authMiddleware = require('../middleware/auth.middleware');

// 注意：roleMiddleware 可能需要依照您的專案路徑引入，這裡假設您有做全域或個別檢查

// 修正：必須調用 authMiddleware 物件中的 verifyToken 方法
// 錯誤寫法: router.use(authMiddleware); 
// 正確寫法:
router.use(authMiddleware.verifyToken);

// 讀取列表
router.get('/', productController.getProducts);

// 強制刷新
router.post('/refresh', productController.refresh);

// 批次更新 (Batch Update)
router.post('/batch', productController.batchUpdate);

// ★★★ 新增：分類排序設定 API (上一回新增的功能) ★★★
router.get('/category-order', productController.getCategoryOrder);
router.post('/category-order', productController.saveCategoryOrder);

module.exports = router;