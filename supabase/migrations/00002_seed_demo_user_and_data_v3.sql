
-- ============================================================
-- DEMO SEED v3  (sync_status uses valid enum: 'active')
-- ============================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Auth user
DO $$
DECLARE v_user_id uuid := 'd0000000-0000-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at,
      created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      is_super_admin, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      v_user_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'demo@frimpsoil.com.gh',
      extensions.crypt('Demo1234!', extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Kofi Mensah"}'::jsonb,
      false, '', '', '', ''
    );
  END IF;
END $$;

-- 2. Staff user
INSERT INTO public.staff_users (id, organization_id, full_name, role, created_at)
VALUES ('d0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Kofi Mensah','admin',now())
ON CONFLICT (id) DO UPDATE SET full_name = 'Kofi Mensah', role = 'admin';

-- 3. Mailbox  (sync_status = 'active' per check constraint)
INSERT INTO public.mailboxes (id, organization_id, staff_user_id, email_address, display_name, imap_host, imap_port, smtp_host, smtp_port, sync_status, last_synced_at, created_at)
VALUES ('b0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001',
  'kofi.mensah@frimpsoil.com.gh','Kofi Mensah',
  'mail.frimpsoil.com.gh',993,'mail.frimpsoil.com.gh',587,
  'active', now() - interval '5 minutes', now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- THREADS + MESSAGES (12 realistic oil-company emails)
-- ============================================================

INSERT INTO public.threads (id,mailbox_id,subject,participants,last_message_at,is_read,is_starred,labels,created_at) VALUES
('a1000001-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','Re: Fuel Delivery Confirmation – Order #FO-2874',ARRAY['logistics@totalenergies.com','kofi.mensah@frimpsoil.com.gh'],now()-interval'22 minutes',false,false,ARRAY['logistics'],now()-interval'2 hours'),
('a1000002-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','Q3 Board Meeting – Agenda & Pre-read Materials',ARRAY['ceo@frimpsoil.com.gh','kofi.mensah@frimpsoil.com.gh','finance@frimpsoil.com.gh'],now()-interval'1 hour',false,true,ARRAY['important'],now()-interval'1 hour'),
('a1000003-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','Invoice INV-2024-0892 – Shell Ghana Limited',ARRAY['invoicing@shell.com.gh','kofi.mensah@frimpsoil.com.gh'],now()-interval'3 hours',true,false,ARRAY['finance'],now()-interval'3 hours'),
('a1000004-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','New Driver Onboarding – Emmanuel Tetteh',ARRAY['hr@frimpsoil.com.gh','kofi.mensah@frimpsoil.com.gh'],now()-interval'4 hours',false,false,ARRAY['hr'],now()-interval'4 hours'),
('a1000005-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','Supply Contract Renewal – Goil Company Ltd',ARRAY['contracts@goil.com.gh','kofi.mensah@frimpsoil.com.gh'],now()-interval'1 day',true,true,ARRAY['contracts'],now()-interval'1 day'),
('a1000006-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','Safety Inspection Notice – Accra Depot (July 10)',ARRAY['hse@energycom.gov.gh','kofi.mensah@frimpsoil.com.gh'],now()-interval'5 hours',false,false,ARRAY['compliance'],now()-interval'5 hours'),
('a1000007-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','Fleet Maintenance Due – Tankers GH-4421 & GH-4498',ARRAY['workshop@frimpsoil.com.gh','kofi.mensah@frimpsoil.com.gh'],now()-interval'1 day 3 hours',true,false,ARRAY['fleet'],now()-interval'1 day 3 hours'),
('a1000008-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','Complaint: Late Delivery to Kumasi Station (Ref #C-0091)',ARRAY['info@kwesifillingstation.com','kofi.mensah@frimpsoil.com.gh'],now()-interval'2 hours',false,false,ARRAY['support'],now()-interval'2 hours'),
('a1000009-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','Credit Facility Renewal – GCB Bank (GHS 2.5M)',ARRAY['corporate@gcbbank.com.gh','kofi.mensah@frimpsoil.com.gh'],now()-interval'2 days',true,false,ARRAY['finance'],now()-interval'2 days'),
('a1000010-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','Company Welfare Day – Save the Date (July 20)',ARRAY['welfare@frimpsoil.com.gh','all@frimpsoil.com.gh'],now()-interval'3 days',true,false,ARRAY['internal'],now()-interval'3 days'),
('a1000011-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','REMINDER: Q2 NPA Returns Due 15 July',ARRAY['returns@npa.gov.gh','kofi.mensah@frimpsoil.com.gh'],now()-interval'6 hours',false,false,ARRAY['compliance'],now()-interval'6 hours'),
('a1000012-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','Planned System Downtime – ERP Upgrade (Sat 6 July, 10 PM)',ARRAY['it@frimpsoil.com.gh','kofi.mensah@frimpsoil.com.gh'],now()-interval'4 days',true,false,ARRAY['it'],now()-interval'4 days')
ON CONFLICT DO NOTHING;

INSERT INTO public.messages (id,thread_id,mailbox_id,imap_uid,imap_uidvalidity,subject,from_address,from_name,to_addresses,body_html,body_text,sent_at,is_read,is_flagged) VALUES
('c1000001-0000-0000-0000-000000000001','a1000001-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',1001,1,'Re: Fuel Delivery Confirmation – Order #FO-2874','logistics@totalenergies.com','TotalEnergies Logistics',ARRAY['kofi.mensah@frimpsoil.com.gh'],'<p>Dear Kofi,</p><p>Your order <strong>#FO-2874</strong> (10,000 litres AGO) has been dispatched from our Tema depot. ETA: <strong>Thursday 9 AM</strong>. Please ensure your tanker bay is clear and a rep is on-site for sign-off.</p><p>Regards,<br/>David Asante<br/>TotalEnergies Logistics GH</p>','Order #FO-2874 (10,000L AGO) dispatched. ETA Thursday 9 AM.',now()-interval'22 minutes',false,false),
('c1000002-0000-0000-0000-000000000001','a1000002-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',1002,1,'Q3 Board Meeting – Agenda & Pre-read Materials','ceo@frimpsoil.com.gh','Frimpong Boateng (CEO)',ARRAY['kofi.mensah@frimpsoil.com.gh','finance@frimpsoil.com.gh'],'<p>Team,</p><p>Agenda for our <strong>Q3 Board Meeting</strong> on Friday 11 July at 10:00 AM:</p><ol><li>Q2 Revenue Review</li><li>Fleet Expansion Proposal</li><li>New Depot – Cape Coast Site Selection</li><li>AOB</li></ol><p>Pre-reads circulated by Wednesday. Come prepared.</p><p>– CEO</p>','Q3 Board Meeting Friday 11 July 10 AM. Items: Q2 Revenue, Fleet Expansion, Cape Coast Depot.',now()-interval'1 hour',false,true),
('c1000003-0000-0000-0000-000000000001','a1000003-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',1003,1,'Invoice INV-2024-0892 – Shell Ghana Limited','invoicing@shell.com.gh','Shell Ghana – Accounts',ARRAY['kofi.mensah@frimpsoil.com.gh'],'<p>Dear Kofi,</p><p>Invoice <strong>INV-2024-0892</strong> for GHS 187,500 covering 15,000L PMS supplied 28 June 2024. Payment due within 30 days. Reference PO #FO-PO-1142.</p><p>Shell Ghana Accounts Team</p>','Invoice INV-2024-0892 for GHS 187,500 – due in 30 days. Ref PO #FO-PO-1142.',now()-interval'3 hours',true,false),
('c1000004-0000-0000-0000-000000000001','a1000004-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',1004,1,'New Driver Onboarding – Emmanuel Tetteh','hr@frimpsoil.com.gh','Frimps Oil HR',ARRAY['kofi.mensah@frimpsoil.com.gh'],'<p>Kofi,</p><p>Background checks for <strong>Emmanuel Tetteh</strong> (Tanker Driver) are complete. Please approve system access and fuel card issuance for his first assignment on Monday.</p><p>HR Team</p>','Emmanuel Tetteh onboarding done. Awaiting approval for system access and fuel card.',now()-interval'4 hours',false,false),
('c1000005-0000-0000-0000-000000000001','a1000005-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',1005,1,'Supply Contract Renewal – Goil Company Ltd','contracts@goil.com.gh','Goil Contracts Team',ARRAY['kofi.mensah@frimpsoil.com.gh'],'<p>Dear Mr. Mensah,</p><p>Our supply agreement expires <strong>31 August 2024</strong>. We propose a 24-month renewal at revised rates. Review the attached term sheet and revert by <strong>15 July</strong>.</p>','Supply contract expiring 31 Aug. 24-month renewal proposed – revert by 15 July.',now()-interval'1 day',true,true),
('c1000006-0000-0000-0000-000000000001','a1000006-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',1006,1,'Safety Inspection Notice – Accra Depot (July 10)','hse@energycom.gov.gh','NPA Health, Safety & Environment',ARRAY['kofi.mensah@frimpsoil.com.gh'],'<p>Dear Operator,</p><p>Routine NPA safety inspection at your Accra depot on <strong>Wednesday, 10 July at 9:00 AM</strong>. Ensure HSE docs, fire suppression systems and spill records are ready. Non-compliance may result in operational suspension.</p>','NPA inspection Accra depot 10 July 9 AM. HSE docs must be ready.',now()-interval'5 hours',false,false),
('c1000007-0000-0000-0000-000000000001','a1000007-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',1007,1,'Fleet Maintenance Due – Tankers GH-4421 & GH-4498','workshop@frimpsoil.com.gh','Frimps Oil Workshop',ARRAY['kofi.mensah@frimpsoil.com.gh'],'<p>Kofi,</p><p>Service due: <strong>GH-4421</strong> (oil change + brake check) and <strong>GH-4498</strong> (50,000 km full service). Confirm off-route days. Est. downtime: 1 day each.</p>','Service due for GH-4421 and GH-4498. Confirm downtime. Est. 1 day each.',now()-interval'1 day 3 hours',true,false),
('c1000008-0000-0000-0000-000000000001','a1000008-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',1008,1,'Complaint: Late Delivery to Kumasi Station (Ref #C-0091)','info@kwesifillingstation.com','Kwesi Filling Station – Manager',ARRAY['kofi.mensah@frimpsoil.com.gh'],'<p>Dear Kofi,</p><p>Formal complaint: our last two deliveries were <strong>over 6 hours late</strong>, causing us to run dry. Third time in two months. We expect an explanation and a service credit. Please escalate urgently.</p>','Formal complaint: 2 late deliveries >6h, 3rd time in 2 months. Requesting credit + explanation.',now()-interval'2 hours',false,false),
('c1000009-0000-0000-0000-000000000001','a1000009-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',1009,1,'Credit Facility Renewal – GCB Bank (GHS 2.5M)','corporate@gcbbank.com.gh','GCB Bank – Corporate Banking',ARRAY['kofi.mensah@frimpsoil.com.gh'],'<p>Dear Mr. Mensah,</p><p>Your <strong>GHS 2.5M revolving credit facility</strong> is approved for renewal (12 months, 28% p.a.). Please visit our Accra Central branch to sign the facility letter.</p>','GHS 2.5M revolving credit approved for renewal at 28% p.a. Visit branch to sign.',now()-interval'2 days',true,false),
('c1000010-0000-0000-0000-000000000001','a1000010-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',1010,1,'Company Welfare Day – Save the Date (July 20)','welfare@frimpsoil.com.gh','Frimps Oil Welfare Committee',ARRAY['all@frimpsoil.com.gh'],'<p>Dear Colleagues,</p><p>Annual <strong>Staff Welfare Day</strong> – <strong>Saturday 20 July</strong> at Golden Tulip Accra. Gala dinner, awards, team-building. RSVP by 12 July. Dress: Smart Casual.</p>','Staff Welfare Day Saturday 20 July at Golden Tulip. RSVP by 12 July.',now()-interval'3 days',true,false),
('c1000011-0000-0000-0000-000000000001','a1000011-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',1011,1,'REMINDER: Q2 NPA Returns Due 15 July','returns@npa.gov.gh','National Petroleum Authority',ARRAY['kofi.mensah@frimpsoil.com.gh'],'<p>Dear Licensee,</p><p><strong>Q2 2024 Petroleum Returns</strong> are due by <strong>15 July 2024</strong>. Submit via the NPA e-portal (returns.npa.gov.gh). GHS 5,000/day penalty for late submission.</p>','Q2 NPA returns due 15 July. GHS 5k/day penalty. Submit at returns.npa.gov.gh.',now()-interval'6 hours',false,false),
('c1000012-0000-0000-0000-000000000001','a1000012-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',1012,1,'Planned System Downtime – ERP Upgrade (Sat 6 July, 10 PM)','it@frimpsoil.com.gh','Frimps Oil IT Department',ARRAY['kofi.mensah@frimpsoil.com.gh'],'<p>All Staff,</p><p>ERP upgrade: <strong>Saturday 6 July 10 PM – 2 AM</strong>. Fuel dispensing portal, payroll and inventory offline. Complete all critical transactions before 9:30 PM.</p>','ERP downtime Sat 6 July 10 PM – 2 AM. Complete critical tasks before 9:30 PM.',now()-interval'4 days',true,false)
ON CONFLICT DO NOTHING;

-- ============================================================
-- CONTACTS
-- ============================================================
INSERT INTO public.contacts (id,organization_id,name,email,company,phone,notes,created_by,created_at) VALUES
(gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','David Asante','logistics@totalenergies.com','TotalEnergies Ghana','+233 20 123 4567','Primary logistics contact. Very responsive.','d0000000-0000-0000-0000-000000000001',now()),
(gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','Akosua Boateng','contracts@goil.com.gh','Goil Company Ltd','+233 24 765 4321','Contract renewal due Aug 2024.','d0000000-0000-0000-0000-000000000001',now()),
(gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','James Quaye','invoicing@shell.com.gh','Shell Ghana Ltd','+233 26 555 9090','Accounts contact for PMS supply invoices.','d0000000-0000-0000-0000-000000000001',now()),
(gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','Abena Frimpong','hr@frimpsoil.com.gh','Frimps Oil Company','+233 30 999 0001','Internal HR lead.','d0000000-0000-0000-0000-000000000001',now()),
(gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','Nana Acheampong','corporate@gcbbank.com.gh','GCB Bank','+233 30 221 0000','Relationship manager for our credit facility.','d0000000-0000-0000-0000-000000000001',now()),
(gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','Kwesi Asiedu','info@kwesifillingstation.com','Kwesi Filling Station','+233 54 812 3456','Major Kumasi customer. Delivery complaints – handle carefully.','d0000000-0000-0000-0000-000000000001',now()),
(gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','Inspector Mensah','hse@energycom.gov.gh','National Petroleum Authority','+233 30 277 3000','NPA compliance inspector for Accra region.','d0000000-0000-0000-0000-000000000001',now()),
(gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','Emmanuel Tetteh','e.tetteh@frimpsoil.com.gh','Frimps Oil Company','+233 55 331 7788','New tanker driver – onboarding in progress.','d0000000-0000-0000-0000-000000000001',now())
ON CONFLICT DO NOTHING;

-- ============================================================
-- CALENDAR EVENTS (10 events across next 3 weeks)
-- ============================================================
INSERT INTO public.calendar_events (id,organization_id,created_by,title,description,start_at,end_at,location,attendees,created_at) VALUES
(gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','AGO Delivery – Tema Depot (#FO-2874)','Receive 10,000L AGO from TotalEnergies. QC team on site, tanker bay cleared.',now()+interval'12 hours',now()+interval'13 hours','Frimps Oil Accra Depot, Ring Road East',ARRAY['kofi.mensah@frimpsoil.com.gh','logistics@frimpsoil.com.gh'],now()),
(gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','NPA Safety Inspection – Accra Depot','Routine NPA HSE inspection. All documentation, fire suppression and spill records must be available.',now()+interval'7 days'+interval'9 hours',now()+interval'7 days'+interval'12 hours','Frimps Oil Accra Depot',ARRAY['kofi.mensah@frimpsoil.com.gh','hse@energycom.gov.gh'],now()),
(gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','Q3 Board Meeting','Q2 revenue review, fleet expansion, Cape Coast depot site selection.',now()+interval'8 days'+interval'10 hours',now()+interval'8 days'+interval'13 hours','Frimps Oil HQ Boardroom, Accra',ARRAY['ceo@frimpsoil.com.gh','kofi.mensah@frimpsoil.com.gh','finance@frimpsoil.com.gh'],now()),
(gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','ERP Upgrade – System Downtime','SAP B1 upgrade. Fuel dispensing, payroll, inventory offline 10 PM – 2 AM.',now()+interval'2 days'+interval'22 hours',now()+interval'3 days'+interval'2 hours','IT Server Room (Remote)',ARRAY['it@frimpsoil.com.gh','kofi.mensah@frimpsoil.com.gh'],now()),
(gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','Goil Contract Negotiation','24-month supply contract renewal. Review and agree revised rates.',now()+interval'11 days'+interval'14 hours',now()+interval'11 days'+interval'16 hours','Goil Head Office, Kokomlemle',ARRAY['kofi.mensah@frimpsoil.com.gh','contracts@goil.com.gh'],now()),
(gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','Tanker GH-4421 – Workshop Service','Oil change and full brake check. Off route for the day.',now()+interval'3 days'+interval'8 hours',now()+interval'3 days'+interval'17 hours','Frimps Oil Workshop, Spintex Road',ARRAY['workshop@frimpsoil.com.gh'],now()),
(gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','NPA Q2 Returns Deadline','Submit Q2 2024 petroleum returns via NPA e-portal. GHS 5,000/day late penalty.',now()+interval'12 days'+interval'17 hours',now()+interval'12 days'+interval'17 hours 30 minutes','NPA e-Portal (Online)',ARRAY['kofi.mensah@frimpsoil.com.gh'],now()),
(gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','GCB Bank – Facility Letter Signing','Execute GHS 2.5M credit facility renewal at GCB Accra Central.',now()+interval'5 days'+interval'10 hours',now()+interval'5 days'+interval'11 hours','GCB Bank, Accra Central Branch',ARRAY['kofi.mensah@frimpsoil.com.gh','corporate@gcbbank.com.gh'],now()),
(gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','Annual Staff Welfare Day','Gala dinner and awards night. Dress code: Smart Casual.',now()+interval'17 days'+interval'18 hours',now()+interval'17 days'+interval'23 hours','Golden Tulip Accra',ARRAY['all@frimpsoil.com.gh'],now()),
(gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','Customer Visit – Kwesi Filling Station, Kumasi','On-site visit re: delivery complaint #C-0091. Bring credit note and revised SLA proposal.',now()+interval'6 days'+interval'10 hours',now()+interval'6 days'+interval'12 hours','Kwesi Filling Station, Kumasi Adum',ARRAY['kofi.mensah@frimpsoil.com.gh','info@kwesifillingstation.com'],now())
ON CONFLICT DO NOTHING;
