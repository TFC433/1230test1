-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Companies
CREATE TABLE companies (
    company_id TEXT PRIMARY KEY,
    company_name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    created_time TIMESTAMP WITH TIME ZONE,
    last_update_time TIMESTAMP WITH TIME ZONE,
    county TEXT,
    creator TEXT,
    last_modifier TEXT,
    introduction TEXT,
    company_type TEXT,
    customer_stage TEXT,
    engagement_rating TEXT
);

-- 2. Contacts (Managed)
CREATE TABLE contacts (
    contact_id TEXT PRIMARY KEY,
    source_id TEXT,
    name TEXT NOT NULL,
    company_id TEXT REFERENCES companies(company_id),
    department TEXT,
    position TEXT,
    mobile TEXT,
    phone TEXT,
    email TEXT,
    created_time TIMESTAMP WITH TIME ZONE,
    last_update_time TIMESTAMP WITH TIME ZONE,
    creator TEXT,
    last_modifier TEXT
);

-- 3. Potential Contacts (Raw Cards)
-- Using SERIAL for id to mimic the 1-based rowIndex behavior if needed,
-- or just unique integer ID.
CREATE TABLE potential_contacts (
    id SERIAL PRIMARY KEY,
    created_time TIMESTAMP WITH TIME ZONE,
    name TEXT,
    company TEXT,
    position TEXT,
    department TEXT,
    phone TEXT,
    mobile TEXT,
    email TEXT,
    website TEXT,
    address TEXT,
    confidence TEXT,
    drive_link TEXT,
    status TEXT,
    line_user_id TEXT,
    user_nickname TEXT
);

-- 4. Opportunities
CREATE TABLE opportunities (
    opportunity_id TEXT PRIMARY KEY,
    opportunity_name TEXT,
    customer_company TEXT, -- Storing name as per legacy logic, ideally FK but keeping text for safety
    sales_model TEXT,
    sales_channel TEXT, -- channelDetails/salesChannel
    channel_contact TEXT,
    main_contact TEXT,
    assignee TEXT,
    opportunity_type TEXT,
    opportunity_source TEXT,
    current_stage TEXT,
    expected_close_date TIMESTAMP WITH TIME ZONE,
    opportunity_value TEXT,
    opportunity_value_type TEXT,
    order_probability TEXT,
    potential_specification TEXT,
    device_scale TEXT,
    notes TEXT,
    drive_folder_link TEXT,
    current_status TEXT,
    stage_history TEXT, -- JSON string or text
    created_time TIMESTAMP WITH TIME ZONE,
    last_update_time TIMESTAMP WITH TIME ZONE,
    last_modifier TEXT,
    parent_opportunity_id TEXT
);

-- 5. Opportunity Contact Links
CREATE TABLE opportunity_contact_links (
    link_id TEXT PRIMARY KEY,
    opportunity_id TEXT REFERENCES opportunities(opportunity_id),
    contact_id TEXT REFERENCES contacts(contact_id),
    create_time TIMESTAMP WITH TIME ZONE,
    status TEXT,
    creator TEXT
);

-- 6. Interactions
CREATE TABLE interactions (
    interaction_id TEXT PRIMARY KEY,
    opportunity_id TEXT REFERENCES opportunities(opportunity_id),
    company_id TEXT REFERENCES companies(company_id),
    interaction_time TIMESTAMP WITH TIME ZONE,
    event_type TEXT,
    event_title TEXT,
    content_summary TEXT,
    participants TEXT,
    next_action TEXT,
    attachment_link TEXT,
    calendar_event_id TEXT,
    recorder TEXT,
    created_time TIMESTAMP WITH TIME ZONE,
    last_modifier TEXT
);

-- 7. Event Logs
CREATE TABLE event_logs (
    event_id TEXT PRIMARY KEY,
    event_type TEXT, -- 'general', 'iot', 'dt', 'dx', 'legacy'
    event_name TEXT,
    opportunity_id TEXT REFERENCES opportunities(opportunity_id),
    company_id TEXT REFERENCES companies(company_id),
    creator TEXT,
    created_time TIMESTAMP WITH TIME ZONE,
    last_modified_time TIMESTAMP WITH TIME ZONE,
    last_modifier TEXT,
    our_participants TEXT,
    client_participants TEXT,
    visit_place TEXT,
    event_content TEXT,
    client_questions TEXT,
    client_intelligence TEXT,
    event_notes TEXT,
    edit_count INTEGER DEFAULT 1,

    -- IoT Specific
    iot_device_scale TEXT,
    iot_line_features TEXT,
    iot_production_status TEXT,
    iot_iot_status TEXT,
    iot_pain_points TEXT,
    iot_pain_point_details TEXT,
    iot_pain_point_analysis TEXT,
    iot_system_architecture TEXT,

    -- DT Specific
    dt_processing_type TEXT,
    dt_industry TEXT,

    -- Legacy Fields
    order_probability TEXT,
    potential_quantity TEXT,
    sales_channel TEXT,
    company_size TEXT,
    external_systems TEXT,
    hardware_scale TEXT,
    fanuc_expectation TEXT
);
