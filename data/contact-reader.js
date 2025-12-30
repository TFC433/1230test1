// data/contact-reader.js

const BaseReader = require('./base-reader');

/**
 * 專門負責讀取所有與「聯絡人」相關資料的類別
 */
class ContactReader extends BaseReader {
    constructor(sheets) {
        super(sheets);
    }

    /**
     * 【新增】內部輔助函式，用於建立標準化的 JOIN Key
     */
    _normalizeKey(str = '') {
        return String(str).toLowerCase().trim();
    }

    /**
     * 取得原始名片資料 (潛在客戶)
     * @param {number} [limit=2000] - 讀取上限
     * @returns {Promise<Array<object>>}
     */
    async getContacts(limit = 2000) {
        const cacheKey = 'contacts';
        const range = `${this.config.SHEETS.CONTACTS}!A:Y`;

        const rowParser = (row, index) => ({
            rowIndex: index + 2,
            createdTime: row[this.config.CONTACT_FIELDS.TIME] || '',
            name: row[this.config.CONTACT_FIELDS.NAME] || '',
            company: row[this.config.CONTACT_FIELDS.COMPANY] || '',
            position: row[this.config.CONTACT_FIELDS.POSITION] || '',
            department: row[this.config.CONTACT_FIELDS.DEPARTMENT] || '',
            phone: row[this.config.CONTACT_FIELDS.PHONE] || '',
            mobile: row[this.config.CONTACT_FIELDS.MOBILE] || '',
            email: row[this.config.CONTACT_FIELDS.EMAIL] || '',
            website: row[this.config.CONTACT_FIELDS.WEBSITE] || '',
            address: row[this.config.CONTACT_FIELDS.ADDRESS] || '',
            confidence: row[this.config.CONTACT_FIELDS.CONFIDENCE] || '',
            driveLink: row[this.config.CONTACT_FIELDS.DRIVE_LINK] || '',
            status: row[this.config.CONTACT_FIELDS.STATUS] || '',
            
            // 【修正重點】讀取 LINE User ID，用於前端篩選 "我的名片"
            lineUserId: row[this.config.CONTACT_FIELDS.LINE_USER_ID] || '',
            
            // 讀取使用者暱稱，用於前端顯示 "👤 Kevin"
            userNickname: row[this.config.CONTACT_FIELDS.USER_NICKNAME] || ''
        });
        
        const sorter = (a, b) => {
            const dateA = new Date(a.createdTime);
            const dateB = new Date(b.createdTime);
            if (isNaN(dateB)) return -1;
            if (isNaN(dateA)) return 1;
            return dateB - dateA;
        };

        const allData = await this._fetchAndCache(cacheKey, range, rowParser, sorter);
        
        // 直接回傳完整資料 (不在此處過濾空名片，讓前端決定顯示方式)
        return allData.slice(0, limit);
    }

    /**
     * 取得聯絡人總表 (已建檔聯絡人)
     */
    async getContactList() {
        const cacheKey = 'contactList';
        const range = `${this.config.SHEETS.CONTACT_LIST}!A:M`;

        const rowParser = (row) => ({
            contactId: row[0] || '',
            sourceId: row[1] || '',
            name: row[2] || '',
            companyId: row[3] || '',
            department: row[4] || '',
            position: row[5] || '',
            mobile: row[6] || '',
            phone: row[7] || '',
            email: row[8] || '',
            createdTime: row[9] || '',
            lastUpdateTime: row[10] || '',
            creator: row[11] || '',
            lastModifier: row[12] || ''
        });

        return this._fetchAndCache(cacheKey, range, rowParser);
    }
    
    /**
     * 讀取並快取所有的「機會-聯絡人」關聯
     */
    async getAllOppContactLinks() {
        const cacheKey = 'oppContactLinks';
        const range = `${this.config.SHEETS.OPPORTUNITY_CONTACT_LINK}!A:F`;

        const rowParser = (row) => ({
            linkId: row[this.config.OPP_CONTACT_LINK_FIELDS.LINK_ID] || '',
            opportunityId: row[this.config.OPP_CONTACT_LINK_FIELDS.OPPORTUNITY_ID] || '',
            contactId: row[this.config.OPP_CONTACT_LINK_FIELDS.CONTACT_ID] || '',
            createTime: row[this.config.OPP_CONTACT_LINK_FIELDS.CREATE_TIME] || '',
            status: row[this.config.OPP_CONTACT_LINK_FIELDS.STATUS] || '',
            creator: row[this.config.OPP_CONTACT_LINK_FIELDS.CREATOR] || '',
        });

        return this._fetchAndCache(cacheKey, range, rowParser);
    }

    /**
     * 根據機會 ID 取得關聯的聯絡人詳細資料
     */
    async getLinkedContacts(opportunityId) {
        const [allLinks, allContacts, allCompanies, allPotentialContacts] = await Promise.all([
            this.getAllOppContactLinks(),
            this.getContactList(),
            this.getCompanyList(), 
            this.getContacts(9999)    
        ]);

        const linkedContactIds = new Set();
        for (const link of allLinks) {
            if (link.opportunityId === opportunityId && link.status === 'active') {
                linkedContactIds.add(link.contactId);
            }
        }
        
        if (linkedContactIds.size === 0) return [];
        
        const companyNameMap = new Map(allCompanies.map(c => [c.companyId, c.companyName]));
        
        const potentialCardMap = new Map();
        allPotentialContacts.forEach(pc => {
            if (pc.name && pc.company && pc.driveLink) {
                const key = this._normalizeKey(pc.name) + '|' + this._normalizeKey(pc.company);
                if (!potentialCardMap.has(key)) {
                    potentialCardMap.set(key, pc.driveLink);
                }
            }
        });

        const linkedContacts = allContacts
            .filter(contact => linkedContactIds.has(contact.contactId))
            .map(contact => {
                let driveLink = ''; 
                const companyName = companyNameMap.get(contact.companyId) || '';

                if (contact.name && companyName) {
                    const key = this._normalizeKey(contact.name) + '|' + this._normalizeKey(companyName);
                    driveLink = potentialCardMap.get(key) || ''; 
                }

                return {
                    contactId: contact.contactId,
                    sourceId: contact.sourceId, 
                    name: contact.name,
                    companyId: contact.companyId,
                    department: contact.department,
                    position: contact.position,
                    mobile: contact.mobile,
                    phone: contact.phone,
                    email: contact.email,
                    companyName: companyNameMap.get(contact.companyId) || contact.companyId,
                    driveLink: driveLink 
                };
            });
        
        return linkedContacts;
    }

    /**
     * 搜尋潛在客戶
     */
    async searchContacts(query) {
        let contacts = await this.getContacts();
        
        contacts = contacts.filter(contact => 
            (contact.name || contact.company)
        );

        if (query) {
            const searchTerm = query.toLowerCase();
            contacts = contacts.filter(c =>
                (c.name && c.name.toLowerCase().includes(searchTerm)) ||
                (c.company && c.company.toLowerCase().includes(searchTerm))
            );
        }
        return { data: contacts };
    }

    /**
     * 搜尋已建檔聯絡人並分頁
     */
    async searchContactList(query, page = 1) {
        const [allContacts, allCompanies] = await Promise.all([
            this.getContactList(),
            this.getCompanyList() 
        ]);
    
        const companyNameMap = new Map(allCompanies.map(c => [c.companyId, c.companyName]));
    
        let contacts = allContacts.map(contact => ({
            ...contact,
            companyName: companyNameMap.get(contact.companyId) || contact.companyId 
        }));
    
        if (query) {
            const searchTerm = query.toLowerCase();
            contacts = contacts.filter(c =>
                (c.name && c.name.toLowerCase().includes(searchTerm)) ||
                (c.companyName && c.companyName.toLowerCase().includes(searchTerm))
            );
        }
        
        const pageSize = this.config.PAGINATION.CONTACTS_PER_PAGE;
        const startIndex = (page - 1) * pageSize;
        const paginated = contacts.slice(startIndex, startIndex + pageSize);
        return {
            data: paginated,
            pagination: { current: page, total: Math.ceil(contacts.length / pageSize), totalItems: contacts.length, hasNext: (startIndex + pageSize) < contacts.length, hasPrev: page > 1 }
        };
    }

    async getCompanyList() {
        const CompanyReader = require('./company-reader'); 
        const companyReader = new CompanyReader(this.sheets);
        return companyReader.getCompanyList();
    }
}

module.exports = ContactReader;