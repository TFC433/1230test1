// data/company-reader.js

const supabase = require('../config/supabase');

/**
 * 專門負責讀取所有與「公司總表」相關資料的類別
 */
class CompanyReader {
    constructor(sheets) {
        // No longer using Google Sheets, but keeping signature compatible if needed,
        // though strictly we don't need 'sheets' anymore.
        this.cache = {};
    }

    /**
     * 取得公司總表列表
     * @returns {Promise<Array<object>>}
     */
    async getCompanyList() {
        try {
            const { data, error } = await supabase
                .from('companies')
                .select('*');

            if (error) throw error;

            return data.map(row => ({
                companyId: row.company_id || '',
                companyName: row.company_name || '',
                phone: row.phone || '',
                address: row.address || '',
                createdTime: row.created_time || '',
                lastUpdateTime: row.last_update_time || '',
                county: row.county || '',
                creator: row.creator || '',
                lastModifier: row.last_modifier || '',
                introduction: row.introduction || '',
                companyType: row.company_type || '',
                customerStage: row.customer_stage || '',
                engagementRating: row.engagement_rating || '',
                // Maintaining fake rowIndex for compatibility with writers if they use it strictly as a handle
                rowIndex: 0
            }));
        } catch (error) {
            console.error('❌ [CompanyReader] Error fetching companies:', error);
            return [];
        }
    }

    // Helper for Writer (replacing findRowByValue)
    async findRowByValue(range, colIndex, value) {
        // In SQL world, we query by field.
        // colIndex 1 -> companyName, 0 -> companyId.
        // range is ignored.
        let field = 'company_id';
        if (colIndex === 1) field = 'company_name';

        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .eq(field, value)
            .single();

        if (error || !data) return null;

        return {
            rowIndex: 0, // Mock index
            rowData: [
                data.company_id, data.company_name, data.phone, data.address,
                data.created_time, data.last_update_time, data.county, data.creator,
                data.last_modifier, data.introduction, data.company_type,
                data.customer_stage, data.engagement_rating
            ]
        };
    }

    invalidateCache(key) {
        // No-op or simple local cache clear
        if (this.cache) delete this.cache[key];
    }
}

module.exports = CompanyReader;
