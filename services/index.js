// services/index.js
const config = require('../config');
const DashboardService = require('./dashboard-service');
const OpportunityService = require('./opportunity-service');
const CompanyService = require('./company-service');
const EventLogService = require('./event-log-service');
const WeeklyBusinessService = require('./weekly-business-service');
const SalesAnalysisService = require('./sales-analysis-service');

// 日期輔助函式
const dateHelpers = {
    getWeekId: (d) => {
        if (!(d instanceof Date)) {
            try {
                d = new Date(d);
                if (isNaN(d.getTime())) throw new Error();
            } catch {
                d = new Date();
                console.warn("Invalid date passed to getWeekId, using current date.");
            }
        }
        // 使用 UTC 計算以避免時區問題
        d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
    },
    getWeekInfo: (weekId) => {
        const [year, week] = weekId.split('-W').map(Number);
        const d = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
        const day = d.getUTCDay() || 7;
        if (day !== 1) d.setUTCDate(d.getUTCDate() - day + 1);
        const start = d;
        const end = new Date(start);
        end.setUTCDate(start.getUTCDate() + 4);
        const weekOfMonth = Math.ceil(start.getUTCDate() / 7);
        const month = start.toLocaleString('zh-TW', { month: 'long', timeZone: 'UTC' });
        const formatDate = (dt) => `${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${String(dt.getUTCDate()).padStart(2, '0')}`;
        const days = Array.from({length: 5}, (_, i) => {
            const dayDate = new Date(start);
            dayDate.setUTCDate(start.getUTCDate() + i);
            return {
                dayIndex: i + 1,
                date: dayDate.toISOString().split('T')[0],
                displayDate: formatDate(dayDate)
            };
        });
        return {
            title: `${year}年 ${month}, 第 ${weekOfMonth} 週`,
            dateRange: `(${formatDate(start)} - ${formatDate(end)})`,
            month, weekOfMonth, shortDateRange: `${formatDate(start)} - ${formatDate(end)}`, days
        };
    }
};

function initializeBusinessServices(coreServices) {
    // 將 config 和 dateHelpers 加入核心服務
    const servicesWithUtils = { ...coreServices, config, dateHelpers };

    // 1. 實例化服務
    const opportunityService = new OpportunityService(servicesWithUtils);
    const companyService = new CompanyService(servicesWithUtils);
    const eventLogService = new EventLogService(servicesWithUtils);
    const weeklyBusinessService = new WeeklyBusinessService(servicesWithUtils);
    const salesAnalysisService = new SalesAnalysisService(servicesWithUtils);

    // 2. 準備包含所有服務的物件 (供 Dashboard 使用)
    const allInitializedServices = {
        ...servicesWithUtils,
        opportunityService,
        companyService,
        eventLogService,
        weeklyBusinessService,
        salesAnalysisService
    };

    // 3. 實例化 DashboardService
    const dashboardService = new DashboardService(allInitializedServices);

    // 回傳完整的服務容器
    return {
        // Google API 客戶端
        sheets: coreServices.sheets,
        calendar: coreServices.calendar,
        drive: coreServices.drive,

        // 工具函式 (【重要】這裡必須匯出，Controller 才能拿到！)
        dateHelpers, 

        // 業務邏輯服務
        dashboardService,
        opportunityService,
        companyService,
        eventLogService,
        weeklyBusinessService,
        salesAnalysisService,

        // 核心工作流服務
        workflowService: coreServices.workflowService,
        calendarService: coreServices.calendarService,

        // 資料層 Readers
        contactReader: coreServices.contactReader,
        opportunityReader: coreServices.opportunityReader,
        companyReader: coreServices.companyReader,
        interactionReader: coreServices.interactionReader,
        systemReader: coreServices.systemReader,
        weeklyBusinessReader: coreServices.weeklyBusinessReader,
        eventLogReader: coreServices.eventLogReader,
        announcementReader: coreServices.announcementReader,

        // 資料層 Writers
        companyWriter: coreServices.companyWriter,
        contactWriter: coreServices.contactWriter,
        opportunityWriter: coreServices.opportunityWriter,
        interactionWriter: coreServices.interactionWriter,
        eventLogWriter: coreServices.eventLogWriter,
        weeklyBusinessWriter: coreServices.weeklyBusinessWriter,
        announcementWriter: coreServices.announcementWriter,

        // ★★★ 關鍵修正：補上 SystemWriter ★★★
        systemWriter: coreServices.systemWriter
    };
}

module.exports = initializeBusinessServices;