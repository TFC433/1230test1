// data/event-log-reader.js

const supabase = require('../config/supabase');

class EventLogReader {
    constructor(sheets) {
        this.sheets = sheets;
        this.cache = {};
        this.CACHE_DURATION = 60000;
        const OpportunityReader = require('./opportunity-reader');
        const CompanyReader = require('./company-reader');
        this.opportunityReader = new OpportunityReader(sheets);
        this.companyReader = new CompanyReader(sheets);
    }

    async getEventLogs() {
        try {
            const { data, error } = await supabase
                .from('event_logs')
                .select('*');

            if (error) throw error;

            return data.map(row => ({
                rowIndex: row.event_id, // Use ID as fake row index
                eventId: row.event_id,
                eventType: row.event_type,
                eventName: row.event_name || '',
                opportunityId: row.opportunity_id || '',
                companyId: row.company_id || '',
                creator: row.creator || '',
                createdTime: row.created_time || '',
                lastModifiedTime: row.last_modified_time || '',
                lastModifier: row.last_modifier || '',
                ourParticipants: row.our_participants || '',
                clientParticipants: row.client_participants || '',
                visitPlace: row.visit_place || '',
                eventContent: row.event_content || '',
                clientQuestions: row.client_questions || '',
                clientIntelligence: row.client_intelligence || '',
                eventNotes: row.event_notes || '',
                editCount: row.edit_count || 1,

                // IoT
                iot_deviceScale: row.iot_device_scale || '',
                iot_lineFeatures: row.iot_line_features || '',
                iot_productionStatus: row.iot_production_status || '',
                iot_iotStatus: row.iot_iot_status || '',
                iot_painPoints: row.iot_pain_points || '',
                iot_painPointDetails: row.iot_pain_point_details || '',
                iot_painPointAnalysis: row.iot_pain_point_analysis || '',
                iot_systemArchitecture: row.iot_system_architecture || '',

                // DT
                dt_processingType: row.dt_processing_type || '',
                dt_industry: row.dt_industry || '',

                // Legacy
                orderProbability: row.order_probability || '',
                potentialQuantity: row.potential_quantity || '',
                salesChannel: row.sales_channel || '',
                companySize: row.company_size || '',
                externalSystems: row.external_systems || '',
                hardwareScale: row.hardware_scale || '',
                fanucExpectation: row.fanuc_expectation || ''
            }));

        } catch (error) {
            console.error('❌ [EventLogReader] Error fetching event logs:', error);
            return [];
        }
    }

    async getEventLogById(eventId) {
        // Optimized: just query DB
        try {
             const { data, error } = await supabase
                .from('event_logs')
                .select('*')
                .eq('event_id', eventId)
                .single();

             if (error || !data) return null;

             const row = data;
             const log = {
                rowIndex: row.event_id,
                eventId: row.event_id,
                eventType: row.event_type,
                eventName: row.event_name || '',
                opportunityId: row.opportunity_id || '',
                companyId: row.company_id || '',
                creator: row.creator || '',
                createdTime: row.created_time || '',
                lastModifiedTime: row.last_modified_time || '',
                lastModifier: row.last_modifier || '',
                ourParticipants: row.our_participants || '',
                clientParticipants: row.client_participants || '',
                visitPlace: row.visit_place || '',
                eventContent: row.event_content || '',
                clientQuestions: row.client_questions || '',
                clientIntelligence: row.client_intelligence || '',
                eventNotes: row.event_notes || '',
                editCount: row.edit_count || 1,

                iot_deviceScale: row.iot_device_scale || '',
                iot_lineFeatures: row.iot_line_features || '',
                iot_productionStatus: row.iot_production_status || '',
                iot_iotStatus: row.iot_iot_status || '',
                iot_painPoints: row.iot_pain_points || '',
                iot_painPointDetails: row.iot_pain_point_details || '',
                iot_painPointAnalysis: row.iot_pain_point_analysis || '',
                iot_systemArchitecture: row.iot_system_architecture || '',

                dt_processingType: row.dt_processing_type || '',
                dt_industry: row.dt_industry || '',

                orderProbability: row.order_probability || '',
                potentialQuantity: row.potential_quantity || '',
                salesChannel: row.sales_channel || '',
                companySize: row.company_size || '',
                externalSystems: row.external_systems || '',
                hardwareScale: row.hardware_scale || '',
                fanucExpectation: row.fanuc_expectation || ''
             };

            try {
                const [allOpportunities, allCompanies] = await Promise.all([
                    this.opportunityReader.getOpportunities(),
                    this.companyReader.getCompanyList()
                ]);

                if (log.opportunityId) {
                    const relatedOpportunity = allOpportunities.find(opp => opp.opportunityId === log.opportunityId);
                    log.opportunityName = relatedOpportunity ? relatedOpportunity.opportunityName : log.opportunityId;
                } else if (log.companyId) {
                    const relatedCompany = allCompanies.find(comp => comp.companyId === log.companyId);
                    log.companyName = relatedCompany ? relatedCompany.companyName : log.companyId;
                }
            } catch (error) {
                console.error(`[EventLogReader] 為事件 ${eventId} 獲取關聯名稱時出錯:`, error);
            }

            return log;

        } catch (error) {
             console.error('❌ [EventLogReader] Error fetching event log by ID:', error);
             return null;
        }
    }

    invalidateCache(key) {}
}

module.exports = EventLogReader;
