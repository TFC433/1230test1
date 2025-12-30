// services/product-service.js
const { google } = require('googleapis');
const config = require('../config');
const authService = require('./auth-service');
const ProductReader = require('../data/product-reader');

class ProductService {
    constructor() {
        this.reader = null;
    }

    async _getReader() {
        if (!this.reader) {
            const auth = await authService.getGoogleAuth();
            const sheets = google.sheets({ version: 'v4', auth });
            this.reader = new ProductReader(sheets);
        }
        return this.reader;
    }

    /**
     * 獲取商品列表
     * @param {string} query - 搜尋關鍵字 (可選)
     */
    async getProducts(query = '') {
        const reader = await this._getReader();
        let products = await reader.getAllProducts();

        // 簡單的關鍵字過濾 (搜尋 ID, 名稱, 規格, 供應商)
        if (query) {
            const q = query.toLowerCase();
            products = products.filter(p => 
                (p.name && p.name.toLowerCase().includes(q)) ||
                (p.id && p.id.toLowerCase().includes(q)) ||
                (p.spec && p.spec.toLowerCase().includes(q)) ||
                (p.supplier && p.supplier.toLowerCase().includes(q))
            );
        }

        // 可以在此加入排序邏輯，例如按建立時間倒序
        products.sort((a, b) => {
            return (b.id || '').localeCompare(a.id || '');
        });

        return products;
    }

    /**
     * 強制重新整理快取
     */
    async refreshCache() {
        const reader = await this._getReader();
        reader.invalidateCache('marketProducts');
        return await this.getProducts();
    }
}

module.exports = new ProductService();