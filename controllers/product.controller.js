// controllers/product.controller.js
const productService = require('../services/product-service');
const config = require('../config');

class ProductController {
    
    /**
     * 取得商品列表 (僅限 Admin)
     * GET /api/products
     */
    async getProducts(req, res) {
        try {
            // 1. 第二道防線：再次確認權限 (雖然 Route 層已有 Middleware)
            if (req.user.role !== 'admin') {
                return res.status(403).json({ 
                    success: false, 
                    error: config.ERROR_MESSAGES.ADMIN_ONLY 
                });
            }

            const { q } = req.query; // 搜尋參數
            
            // 2. 獲取資料
            const data = await productService.getProducts(q);
            
            res.json({
                success: true,
                data: data,
                count: data.length
            });

        } catch (error) {
            console.error('[ProductController] 獲取失敗:', error);
            res.status(500).json({ 
                success: false, 
                error: config.ERROR_MESSAGES.NETWORK_ERROR 
            });
        }
    }

    /**
     * 強制刷新
     * POST /api/products/refresh
     */
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
}

module.exports = new ProductController();