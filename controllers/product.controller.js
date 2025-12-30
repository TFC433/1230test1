// controllers/product.controller.js
const productService = require('../services/product-service');
const config = require('../config');
// 我們需要用 System Service 來存取設定表
const getServices = (req) => req.app.get('services');

class ProductController {
    
    async getProducts(req, res) {
        try {
            if (req.user.role !== 'admin') {
                return res.status(403).json({ success: false, error: config.ERROR_MESSAGES.ADMIN_ONLY });
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

    async batchUpdate(req, res) {
        try {
            if (req.user.role !== 'admin') {
                return res.status(403).json({ success: false, error: '權限不足，無法執行寫入操作' });
            }
            const products = req.body.products;
            if (!Array.isArray(products)) return res.status(400).json({ success: false, error: '資料格式錯誤' });

            const result = await productService.saveAll(products, req.user);
            res.json({ success: true, message: `儲存成功 (更新: ${result.updated}, 新增: ${result.appended})`, result });
        } catch (error) {
            console.error('[ProductController] 批次更新失敗:', error);
            res.status(500).json({ success: false, error: '儲存失敗: ' + error.message });
        }
    }

    // ★★★ 新增：獲取分類排序 ★★★
    async getCategoryOrder(req, res) {
        try {
            // 利用 SystemReader 讀取設定
            const { systemReader } = getServices(req);
            const systemConfig = await systemReader.getSystemConfig();
            
            // 我們約定在 SYSTEM_CONFIG 表中，有一個特定的設定項目叫 'PRODUCT_CATEGORY_ORDER'
            // 它的結構可能是：Type='SystemPref', Item='PRODUCT_CATEGORY_ORDER', Note='["IoT", "Software"]'
            
            let order = [];
            if (systemConfig['SystemPref']) {
                const pref = systemConfig['SystemPref'].find(p => p.value === 'PRODUCT_CATEGORY_ORDER');
                if (pref && pref.note) {
                    try {
                        order = JSON.parse(pref.note);
                    } catch (e) {
                        console.warn('[ProductController] 解析分類排序 JSON 失敗:', e);
                    }
                }
            }
            res.json({ success: true, order });
        } catch (error) {
            console.error('[ProductController] 獲取分類排序失敗:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // ★★★ 新增：儲存分類排序 (寫入 SYSTEM_CONFIG) ★★★
    async saveCategoryOrder(req, res) {
        try {
            if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: '權限不足' });
            
            const { order } = req.body;
            if (!Array.isArray(order)) return res.status(400).json({ success: false, error: '格式錯誤' });

            const { systemWriter } = getServices(req);
            
            // 這裡我們假設 SystemWriter 有一個通用的 updateConfig 方法，或者我們直接用 updateSystemConfigRow
            // 為了簡化，我們擴充 SystemWriter (見下一步)
            
            // 呼叫 SystemWriter 寫入 (Key: PRODUCT_CATEGORY_ORDER, Value: JSON string)
            await systemWriter.updateSystemPref('PRODUCT_CATEGORY_ORDER', JSON.stringify(order));
            
            // 清除 SystemReader 的快取，確保下次讀取是新的
            const { systemReader } = getServices(req);
            if(systemReader.cache['systemConfig']) delete systemReader.cache['systemConfig'];

            res.json({ success: true, message: '分類排序已更新' });
        } catch (error) {
            console.error('[ProductController] 儲存分類排序失敗:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
}

module.exports = new ProductController();