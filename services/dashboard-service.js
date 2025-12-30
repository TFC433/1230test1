// services/dashboard-service.js

/**
 * 專門負責處理所有儀表板資料組合的業務邏輯
 * 【Phase 3 更新】：實作請求分批 (Request Batching) 以降低瞬間併發量
 */
class DashboardService {
    /**
     * @param {object} services - 包含所有已初始化服務的容器
     */
    constructor(services) {
        this.config = services.config;
        this.opportunityReader = services.opportunityReader;
        this.contactReader = services.contactReader;
        this.interactionReader = services.interactionReader;
        this.eventLogReader = services.eventLogReader;
        this.systemReader = services.systemReader;
        this.weeklyBusinessService = services.weeklyBusinessService;
        this.companyReader = services.companyReader;
        this.calendarService = services.calendarService;
        this.dateHelpers = services.dateHelpers;
    }

    async getDashboardData() {
        console.log('📊 [DashboardService] 執行主儀表板資料整合 (分批優化模式)...');

        const today = new Date();
        const thisWeekId = this.dateHelpers.getWeekId(today);

        // =================================================================
        // 【Phase 3 核心優化】分批請求機制
        // 將原本同時發出的 7 個 API 請求拆分為兩批，大幅降低瞬間 429 風險
        // =================================================================

        // --- Batch 1: 核心業務資料 (優先執行) ---
        // 這些是用戶進入儀表板後最想立刻看到的數據
        // 預期併發數: 3
        console.log('   ↳ 正在載入核心資料 (Batch 1)...');
        const [
            opportunitiesRaw,
            contacts,
            interactions
        ] = await Promise.all([
            this.opportunityReader.getOpportunities(),
            this.contactReader.getContacts(),
            this.interactionReader.getInteractions()
        ]);

        // --- Batch 2: 次要/參考資料 (接續執行) ---
        // 等待 Batch 1 完成後才發起，錯開流量峰值
        // 日曆服務現在已有快取保護，但放在第二批更安全
        // 預期併發數: 4
        console.log('   ↳ 正在載入參考資料 (Batch 2)...');
        const [
            calendarData,
            eventLogs,
            systemConfig,
            companies
        ] = await Promise.all([
            this.calendarService.getThisWeekEvents(),
            this.eventLogReader.getEventLogs(),
            this.systemReader.getSystemConfig(),
            this.companyReader.getCompanyList()
        ]);

        // 週間業務資料通常依賴於本地計算或簡單讀取，影響較小
        const thisWeekDetails = await this.weeklyBusinessService.getWeeklyDetails(thisWeekId);
        const thisWeeksEntries = thisWeekDetails.entries || [];

        // =================================================================
        // 以下邏輯保持不變 (資料處理與統計)
        // =================================================================

        // 1. 計算機會最後活動時間 (用於排序)
        const latestInteractionMap = new Map();
        interactions.forEach(interaction => {
            const existingTimestamp = latestInteractionMap.get(interaction.opportunityId) || 0;
            const currentTimestamp = new Date(interaction.interactionTime || interaction.createdTime).getTime();
            if (currentTimestamp > existingTimestamp) {
                latestInteractionMap.set(interaction.opportunityId, currentTimestamp);
            }
        });

        opportunitiesRaw.forEach(opp => {
            const selfUpdateTime = new Date(opp.lastUpdateTime || opp.createdTime).getTime();
            const lastInteractionTime = latestInteractionMap.get(opp.opportunityId) || 0;
            opp.effectiveLastActivity = Math.max(selfUpdateTime, lastInteractionTime);
        });

        const opportunities = opportunitiesRaw.sort((a, b) => b.effectiveLastActivity - a.effectiveLastActivity);

        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        const contactsCountMonth = contacts.filter(c => new Date(c.createdTime) >= startOfMonth).length;
        const opportunitiesCountMonth = opportunities.filter(o => new Date(o.createdTime) >= startOfMonth).length;
        const eventLogsCountMonth = eventLogs.filter(e => new Date(e.createdTime) >= startOfMonth).length;

        // MTU/SI 活躍與家數統計邏輯
        const normalize = (name) => (name || '').trim().toLowerCase();
        
        // 準備工具: Name -> ID 對照表
        const companyNameMap = new Map();
        companies.forEach(c => {
            if (c.companyName) {
                companyNameMap.set(normalize(c.companyName), c.companyId);
            }
        });

        // 找出所有定義上的 MTU 公司 (靜態)
        const isStrictMTU = (type) => normalize(type) === 'mtu';
        const isSI = (type) => /SI|系統整合|System Integrator/i.test(type || '');
        
        const staticMtuList = companies.filter(c => isStrictMTU(c.companyType));

        // 找出所有活躍公司 (動態)
        const activeCompanyIds = new Set();
        const earliestActivityMap = new Map();

        const recordActivity = (cId, timeStr) => {
            if (!cId) return;
            activeCompanyIds.add(cId);
            
            const time = new Date(timeStr).getTime();
            if (isNaN(time)) return;
            
            const currentEarliest = earliestActivityMap.get(cId);
            if (!currentEarliest || time < currentEarliest) {
                earliestActivityMap.set(cId, time);
            }
        };

        interactions.forEach(i => i.companyId && recordActivity(i.companyId, i.interactionTime || i.createdTime));
        eventLogs.forEach(e => e.companyId && recordActivity(e.companyId, e.createdTime));
        opportunities.forEach(opp => {
            const cId = companyNameMap.get(normalize(opp.customerCompany));
            if (cId) recordActivity(cId, opp.createdTime);
        });

        // 交叉比對：計算活躍 MTU 與 不活躍 MTU
        let mtuCount = 0;
        let mtuNewMonth = 0;
        let siCount = 0;
        let siNewMonth = 0;

        const activeMtuNames = [];
        const inactiveMtuNames = [];

        staticMtuList.forEach(comp => {
            const cId = comp.companyId;
            const name = comp.companyName;

            if (activeCompanyIds.has(cId)) {
                mtuCount++;
                activeMtuNames.push(name);
                
                const firstTime = earliestActivityMap.get(cId);
                if (firstTime >= startOfMonth.getTime()) {
                    mtuNewMonth++;
                }
            } else {
                inactiveMtuNames.push(name);
            }
        });

        // 計算 SI
        companies.forEach(comp => {
             if (activeCompanyIds.has(comp.companyId) && isSI(comp.companyType)) {
                 siCount++;
                 const firstTime = earliestActivityMap.get(comp.companyId);
                 if (firstTime >= startOfMonth.getTime()) siNewMonth++;
             }
        });

        // 成交案件統計
        const WON_STAGE = '受注';
        const wonOpportunities = opportunities.filter(o => o.currentStage === WON_STAGE);
        const wonCount = wonOpportunities.length;
        const wonCountMonth = wonOpportunities.filter(o => {
            const dateStr = o.expectedCloseDate || o.lastUpdateTime;
            if(!dateStr) return false;
            return new Date(dateStr) >= startOfMonth;
        }).length;

        const followUps = this._getFollowUpOpportunities(opportunities, interactions);

        const stats = {
            contactsCount: contacts.length,
            opportunitiesCount: opportunities.length,
            eventLogsCount: eventLogs.length,
            
            wonCount: wonCount,
            wonCountMonth: wonCountMonth,
            
            mtuCount: mtuCount,
            mtuCountMonth: mtuNewMonth,
            siCount: siCount,
            siCountMonth: siNewMonth,

            mtuDetails: {
                totalMtu: staticMtuList.length,
                activeCount: mtuCount,
                inactiveCount: inactiveMtuNames.length,
                activeNames: activeMtuNames,     
                inactiveNames: inactiveMtuNames
            },

            todayEventsCount: calendarData.todayCount,
            weekEventsCount: calendarData.weekCount,
            followUpCount: followUps.length,
            
            contactsCountMonth,
            opportunitiesCountMonth,
            eventLogsCountMonth,
        };

        const kanbanData = this._prepareKanbanData(opportunities, systemConfig);
        const recentActivity = this._prepareRecentActivity(interactions, contacts, opportunities, companies, 5);
        
        const weekInfo = thisWeekDetails;

        const thisWeekInfoForDashboard = {
            weekId: thisWeekId,
            title: `(${weekInfo.month}第${weekInfo.weekOfMonth}週，${weekInfo.shortDateRange})`,
            days: weekInfo.days
        };

        return {
            stats,
            kanbanData,
            followUpList: followUps.slice(0, 5),
            todaysAgenda: calendarData.todayEvents,
            recentActivity,
            weeklyBusiness: thisWeeksEntries,
            thisWeekInfo: thisWeekInfoForDashboard
        };
    }

    async getCompaniesDashboardData() {
        const companies = await this.companyReader.getCompanyList();

        return {
            chartData: {
                trend: this._prepareTrendData(companies),
                type: this._prepareCompanyTypeData(companies),
                stage: this._prepareCustomerStageData(companies),
                rating: this._prepareEngagementRatingData(companies),
            }
        };
    }

    async getEventsDashboardData() {
        const [eventLogs, opportunities, companies] = await Promise.all([
            this.eventLogReader.getEventLogs(),
            this.opportunityReader.getOpportunities(),
            this.companyReader.getCompanyList(),
        ]);

        const opportunityMap = new Map(opportunities.map(opp => [opp.opportunityId, opp]));
        const companyMap = new Map(companies.map(comp => [comp.companyId, comp]));

        const eventList = eventLogs.map(log => {
            const relatedOpp = opportunityMap.get(log.opportunityId);
            const relatedComp = companyMap.get(log.companyId);

            return {
                ...log,
                opportunityName: relatedOpp ? relatedOpp.opportunityName : (relatedComp ? relatedComp.companyName : null),
                companyName: relatedComp ? relatedComp.companyName : null,
                opportunityType: relatedOpp ? relatedOpp.opportunityType : null
            };
        });

        eventList.sort((a, b) => {
            const timeA = new Date(a.lastModifiedTime || a.createdTime).getTime();
            const timeB = new Date(b.lastModifiedTime || b.createdTime).getTime();
            if (isNaN(timeA)) return 1;
            if (isNaN(timeB)) return -1;
            return timeB - timeA;
        });

        return {
            eventList,
            chartData: {
                trend: this._prepareTrendData(eventLogs),
                eventType: this._prepareEventTypeData(eventLogs),
                size: this._prepareSizeData(eventLogs),
            }
        };
    }

    async getOpportunitiesDashboardData() {
        const [opportunities, systemConfig] = await Promise.all([
            this.opportunityReader.getOpportunities(),
            this.systemReader.getSystemConfig(),
        ]);

        return {
            chartData: {
                trend: this._prepareTrendData(opportunities),
                source: this._prepareCategoricalData(opportunities, 'opportunitySource', '機會來源', systemConfig),
                type: this._prepareCategoricalData(opportunities, 'opportunityType', '機會種類', systemConfig),
                stage: this._prepareOpportunityStageData(opportunities, systemConfig),
                probability: this._prepareCategoricalData(opportunities, 'orderProbability', '下單機率', systemConfig),
                specification: this._prepareSpecificationData(opportunities, '可能下單規格', systemConfig),
                channel: this._prepareCategoricalData(opportunities, 'salesChannel', '可能銷售管道', systemConfig),
                scale: this._prepareCategoricalData(opportunities, 'deviceScale', '設備規模', systemConfig),
            }
        };
    }

    async getContactsDashboardData() {
        const contacts = await this.contactReader.getContacts();
        return {
            chartData: {
                trend: this._prepareTrendData(contacts),
            }
        };
    }

    _getFollowUpOpportunities(opportunities, interactions) {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - this.config.FOLLOW_UP.DAYS_THRESHOLD);

        return opportunities.filter(opp => {
            if (opp.currentStatus !== '進行中' || !this.config.FOLLOW_UP.ACTIVE_STAGES.includes(opp.currentStage)) {
                return false;
            }
            const oppInteractions = interactions.filter(i => i.opportunityId === opp.opportunityId);
            if (oppInteractions.length === 0) {
                const createdDate = new Date(opp.createdTime);
                return createdDate < sevenDaysAgo;
            }
            const lastInteractionDate = new Date(oppInteractions.sort((a,b) => new Date(b.interactionTime || b.createdTime) - new Date(a.interactionTime || a.createdTime))[0].interactionTime || oppInteractions[0].createdTime);
            return lastInteractionDate < sevenDaysAgo;
        });
    }

    _prepareKanbanData(opportunities, systemConfig) {
        const stages = systemConfig['機會階段'] || [];
        const stageGroups = {};
        stages.forEach(stage => { stageGroups[stage.value] = { name: stage.note || stage.value, opportunities: [], count: 0 }; });
        opportunities.forEach(opp => {
            if (opp.currentStatus === '進行中') {
                const stageKey = opp.currentStage;
                if (stageGroups[stageKey]) {
                    stageGroups[stageKey].opportunities.push(opp);
                    stageGroups[stageKey].count++;
                }
            }
        });
        return stageGroups;
    }

    _prepareRecentActivity(interactions, contacts, opportunities, companies, limit) {
        const contactFeed = contacts.map(item => {
            const ts = new Date(item.createdTime);
            return { type: 'new_contact', timestamp: isNaN(ts.getTime()) ? 0 : ts.getTime(), data: item };
        });
        const interactionFeed = interactions.map(item => {
            const ts = new Date(item.interactionTime || item.createdTime);
            return { type: 'interaction', timestamp: isNaN(ts.getTime()) ? 0 : ts.getTime(), data: item };
        });

        const combinedFeed = [...interactionFeed, ...contactFeed]
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);

        const opportunityMap = new Map(opportunities.map(opp => [opp.opportunityId, opp.opportunityName]));
        const companyMap = new Map(companies.map(comp => [comp.companyId, comp.companyName]));

        return combinedFeed.map(item => {
            if (item.type === 'interaction') {
                let contextName = opportunityMap.get(item.data.opportunityId);
                if (!contextName && item.data.companyId) {
                    contextName = companyMap.get(item.data.companyId);
                }

                return {
                    ...item,
                    data: {
                        ...item.data,
                        contextName: contextName || '系統活動'
                    }
                };
            }
            return item;
        });
    }

    _prepareTrendData(data, days = 30) {
        const trend = {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < days; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            trend[date.toISOString().split('T')[0]] = 0;
        }

        data.forEach(item => {
            if (item.createdTime) {
                try {
                    const itemDate = new Date(item.createdTime);
                    const dateString = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate()).toISOString().split('T')[0];
                    if (trend.hasOwnProperty(dateString)) trend[dateString]++;
                } catch(e) { /* ignore */ }
            }
        });
        return Object.entries(trend).sort(([dateA], [dateB]) => new Date(dateA) - new Date(dateB));
    }

    _prepareEventTypeData(eventLogs) {
        const counts = eventLogs.reduce((acc, log) => {
            const key = log.eventType || 'general';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(counts).map(([name, y]) => ({ name, y }));
    }

    _prepareSizeData(eventLogs) {
        const counts = eventLogs.reduce((acc, log) => {
            const key = log.companySize || log.iot_deviceScale || '未填寫';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
    }

    _prepareCategoricalData(data, fieldKey, configKey, systemConfig) {
        const nameMap = new Map((systemConfig[configKey] || []).map(item => [item.value, item.note]));
        const counts = data.reduce((acc, item) => {
            const value = item[fieldKey];
            const key = nameMap.get(value) || value || '未分類';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(counts).map(([name, y]) => ({ name, y }));
    }

    _prepareSpecificationData(opportunities, configKey, systemConfig) {
        const nameMap = new Map((systemConfig[configKey] || []).map(item => [item.value, item.note]));
        const counts = {};

        opportunities.forEach(item => {
            const value = item.potentialSpecification;
            if (!value) return;

            let keys = [];
            
            try {
                const parsedJson = JSON.parse(value);
                if (parsedJson && typeof parsedJson === 'object') {
                    keys = Object.keys(parsedJson).filter(k => parsedJson[k] > 0);
                } else {
                    throw new Error('Not an object');
                }
            } catch (e) {
                if (typeof value === 'string') {
                    keys = value.split(',').map(s => s.trim()).filter(Boolean);
                }
            }
            
            keys.forEach(key => {
                const displayName = nameMap.get(key) || key;
                counts[displayName] = (counts[displayName] || 0) + 1;
            });
        });

        return Object.entries(counts).map(([name, y]) => ({ name, y }));
    }

    _prepareOpportunityStageData(opportunities, systemConfig) {
        const stageMapping = new Map((systemConfig['機會階段'] || []).map(item => [item.value, item.note]));
        const counts = opportunities.reduce((acc, opp) => {
            if (opp.currentStatus === '進行中') {
                const key = stageMapping.get(opp.currentStage) || opp.currentStage || '未分類';
                acc[key] = (acc[key] || 0) + 1;
            }
            return acc;
        }, {});
        return Object.entries(counts);
    }

    _prepareCompanyTypeData(companies) {
        const counts = companies.reduce((acc, company) => {
            const key = company.companyType || '未分類';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(counts).map(([name, y]) => ({ name, y }));
    }

    _prepareCustomerStageData(companies) {
        const counts = companies.reduce((acc, company) => {
            const key = company.customerStage || '未分類';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(counts).map(([name, y]) => ({ name, y }));
    }

    _prepareEngagementRatingData(companies) {
        const counts = companies.reduce((acc, company) => {
            const key = company.engagementRating || '未評級';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(counts).map(([name, y]) => ({ name, y }));
    }
}

module.exports = DashboardService;