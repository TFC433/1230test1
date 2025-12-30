// controllers/product.controller.js
const productService = require('../services/product-service');
const config = require('../config');

class ProductController {
    
    async getProducts(req, res) {
        try {
            if (req.user.role !== 'admin') {
                return res.status(403).json({ 
                    success: false, 
                    error: config.ERROR_MESSAGES.ADMIN_ONLY 
                });
            }
            const { q } = req.query;
            const data = await productService.getProducts(q);
            res.json({ success: true, data: data, count: data.length });
        } catch (error) {
            console.error('[ProductController] 獲取失敗:', error);
            res.status(500).json({ success: false, error: config.ERROR_MESSAGES.NETWORK_ERROR });
        }
    }

    async refresh(req, res) {
        try {
            if (req.user.role !== 'admin') {
                return res.status(403).json({ success: false, error: 'Forbidden' });
            }
            await productService.refreshCache();
            res.json({ success: true, message: '商品資料已重新同步' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // ★ 新增：批次更新 API
    async batchUpdate(req, res) {
        try {
            // 1. 嚴格權限檢查
            if (req.user.role !== 'admin') {
                console.warn(`[Security] 非 Admin 嘗試寫入商品資料: ${req.user.name}`);
                return res.status(403).json({ success: false, error: '權限不足，無法執行寫入操作' });
            }

            const products = req.body.products;
            if (!Array.isArray(products)) {
                return res.status(400).json({ success: false, error: '資料格式錯誤 (應為陣列)' });
            }

            // 2. 呼叫 Service
            const result = await productService.saveAll(products, req.user);

            res.json({
                success: true,
                message: `儲存成功 (更新: ${result.updated}, 新增: ${result.appended})`,
                result
            });

        } catch (error) {
            console.error('[ProductController] 批次更新失敗:', error);
            res.status(500).json({ success: false, error: '儲存失敗: ' + error.message });
        }
    }
}

module.exports = new ProductController();