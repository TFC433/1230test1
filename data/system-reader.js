// data/system-reader.js

const BaseReader = require('./base-reader');

/**
 * 專門負責讀取系統級資料的類別 (系統設定、使用者)
 */
class SystemReader extends BaseReader {
    constructor(sheets) {
        super(sheets);
    }

    /**
     * 取得系統設定工作表內容
     * @returns {Promise<object>}
     */
    async getSystemConfig() {
        const cacheKey = 'systemConfig';
        const now = Date.now();
        
        if (this.cache[cacheKey] && this.cache[cacheKey].data && (now - this.cache[cacheKey].timestamp < this.CACHE_DURATION)) {
            return this.cache[cacheKey].data;
        }

        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.config.SPREADSHEET_ID,
                range: `${this.config.SHEETS.SYSTEM_CONFIG}!A:I`,
            });
            
            const rows = response.data.values || [];
            const settings = {};
            
            // 初始化預設值
            if (!settings['事件類型']) {
                settings['事件類型'] = [
                    { value: 'general', note: '一般', order: 1, color: '#6c757d' },
                    { value: 'iot', note: 'IOT', order: 2, color: '#007bff' },
                    { value: 'dt', note: 'DT', order: 3, color: '#28a745' },
                    { value: 'dx', note: 'DX', order: 4, color: '#ffc107' },
                    { value: 'legacy', note: '舊事件', order: 5, color: '#dc3545' }
                ];
            }
            if (!settings['日曆篩選規則']) settings['日曆篩選規則'] = []; 
            
            if (rows.length > 1) {
                rows.slice(1).forEach(row => {
                    const [type, item, order, enabled, note, color, value2, value3, category] = row;
                    
                    if (enabled === 'TRUE' && type && item) {
                        if (!settings[type]) settings[type] = [];
                        
                        const exists = settings[type].find(i => i.value === item);
                        if (exists) {
                            exists.note = note || item;
                            exists.order = parseInt(order) || 99;
                        } else {
                            settings[type].push({
                                value: item,
                                note: note || item,
                                order: parseInt(order) || 99,
                                color: color || null,
                                value2: value2 || null, 
                                value3: value3 || null, 
                                category: category || '其他' 
                            });
                        }
                    }
                });
            }
            
            Object.keys(settings).forEach(type => settings[type].sort((a, b) => a.order - b.order));
            
            this.cache[cacheKey] = { data: settings, timestamp: now };
            return settings;

        } catch (error) {
            console.error('❌ [DataReader] 讀取系統設定失敗:', error);
            return this.config.DEFAULT_SETTINGS || {};
        }
    }

    /**
     * 取得使用者名冊
     * (★ 修改重點：讀取範圍擴大至 D 欄，新增 Role 解析)
     * @returns {Promise<Array<object>>}
     */
    async getUsers() {
        const cacheKey = 'users';
        // ★★★ 修改：讀取範圍改為 A:D (增加第4欄 Role) ★★★
        const range = '使用者名冊!A:D';
        
        const targetSheetId = this.config.AUTH_SPREADSHEET_ID || this.config.SPREADSHEET_ID;

        const now = Date.now();
        if (this.cache[cacheKey] && this.cache[cacheKey].data && (now - this.cache[cacheKey].timestamp < this.CACHE_DURATION)) {
            return this.cache[cacheKey].data;
        }

        console.log(`🔐 [Auth] 讀取使用者名冊 (Sheet ID: ...${targetSheetId.slice(-6)})...`);

        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: targetSheetId,
                range: range,
            });

            const rows = response.data.values || [];
            
            const allUsers = rows.map((row, index) => {
                // 防呆：處理可能為 undefined 的欄位
                const username = row[0] ? row[0].trim() : '';
                const passwordHash = row[1] ? row[1].trim() : '';
                const displayName = row[2] ? row[2].trim() : '';
                // ★★★ 新增：解析 Role，預設為 'sales' ★★★
                const role = row[3] ? row[3].trim().toLowerCase() : 'sales';

                return {
                    rowIndex: index + 1,
                    username,
                    passwordHash,
                    displayName,
                    role // 加入 role 屬性
                };
            }).filter(user => user.username && user.passwordHash);

            this.cache[cacheKey] = { data: allUsers, timestamp: now };
            return allUsers;

        } catch (error) {
            console.error('❌ [DataReader] 讀取使用者名冊失敗:', error.message);
            return [];
        }
    }
}

module.exports = SystemReader;