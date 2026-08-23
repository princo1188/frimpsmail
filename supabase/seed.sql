-- Confirmed Frimps Mail staff accounts for local and database-reset environments.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE
  v_email text;
  v_user_id uuid;
BEGIN
  FOREACH v_email IN ARRAY ARRAY[
    'administration@frimpsoil.com.gh', 'audit@frimpsoil.com.gh',
    'daniel.yekple@frimpsoil.com.gh', 'david.ajera@frimpsoil.com.gh',
    'depot@frimpsoil.com.gh', 'derrick.dwamenadebrah@frimpsoil.com.gh',
    'edmund.dwamena@frimpsoil.com.gh', 'emmanuel.okyere@frimpsoil.com.gh',
    'erika.frimpong@frimpsoil.com.gh', 'finance@frimpsoil.com.gh',
    'gifty.kyeibaffour@frimpsoil.com.gh', 'godfred.obeng@frimpsoil.com.gh',
    'hr@frimpsoil.com.gh', 'ivan.banang@frimpsoil.com.gh',
    'james.tagoe@frimpsoil.com.gh', 'jamila.gado@frimpsoil.com.gh',
    'johannes.tenzagh@frimpsoil.com.gh', 'kingsley.frimpong@frimpsoil.com.gh',
    'marketing-distribution@frimpsoil.com.gh', 'mavis.frimpong@frimpsoil.com.gh',
    'miracle.lartey@frimpsoil.com.gh', 'operations@frimpsoil.com.gh',
    'peter.nyamaah@frimpsoil.com.gh', 'phinehas.pappoe@frimpsoil.com.gh',
    'paakwesi@frimpsoil.com.gh', 'prince@frimpsoil.com.gh',
    'raphael.teye@frimpsoil.com.gh', 'samuel.agama@frimpsoil.com.gh',
    'samuel.marlaidickson@frimpsoil.com.gh', 'sandra.omane@frimpsoil.com.gh',
    'siaw.appiahfrimpong@frimpsoil.com.gh', 'siddique.abubakariissaka@frimpsoil.com.gh',
    'stephen.commey@frimpsoil.com.gh', 'support@frimpsoil.com.gh',
    'vincent.jojoboadu@frimpsoil.com.gh', 'vintbaffour@frimpsoil.com.gh',
    'yaaopokuaddai@frimpsoil.com.gh'
  ]
  LOOP
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_email LIMIT 1;

    IF v_user_id IS NULL THEN
      INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data,
        is_super_admin, confirmation_token, recovery_token,
        email_change_token_new, email_change
      ) VALUES (
        gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', v_email,
        extensions.crypt('OilFrimps@2026$$$', extensions.gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', initcap(replace(replace(split_part(v_email, '@', 1), '.', ' '), '-', ' '))),
        false, '', '', '', ''
      ) RETURNING id INTO v_user_id;
    ELSE
      UPDATE auth.users
      SET encrypted_password = extensions.crypt('OilFrimps@2026$$$', extensions.gen_salt('bf')),
          email_confirmed_at = now(),
          updated_at = now()
      WHERE id = v_user_id;
    END IF;

    INSERT INTO public.staff_users (id, organization_id, full_name, role)
    VALUES (
      v_user_id,
      'aaaaaaaa-0000-0000-0000-000000000001',
      initcap(replace(replace(split_part(v_email, '@', 1), '.', ' '), '-', ' ')),
      CASE WHEN v_email IN ('audit@frimpsoil.com.gh', 'paakwesi@frimpsoil.com.gh', 'prince@frimpsoil.com.gh') THEN 'admin' ELSE 'staff' END
    )
    ON CONFLICT (id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      full_name = EXCLUDED.full_name,
      -- The seed must be safe to re-run without revoking an existing admin role.
      role = CASE WHEN EXCLUDED.role = 'admin' THEN 'admin' ELSE public.staff_users.role END;
  END LOOP;
END $$;

DELETE FROM public.contacts
WHERE name IN (
     'Abena Frimpong',
     'Akosua Boateng',
     'David Asante',
     'Emmanuel Tetteh',
     'Inspector Mensah',
     'James Quaye',
     'Kwesi Asiedu'
   )
   OR email IN (
     'abena.frimpong@example.com',
     'akosua.boateng@example.com',
     'david.asante@example.com'
   );

-- Mailboxes for all reset-seeded staff users. Credentials are kept in Vault so
-- the persistent sync service can connect without exposing webmail passwords.
DO $$
DECLARE
  v_email text;
  v_user_id uuid;
  v_mailbox_id uuid;
  v_vault_ref uuid;
BEGIN
  FOREACH v_email IN ARRAY ARRAY[
    'administration@frimpsoil.com.gh', 'audit@frimpsoil.com.gh',
    'daniel.yekple@frimpsoil.com.gh', 'david.ajera@frimpsoil.com.gh',
    'depot@frimpsoil.com.gh', 'derrick.dwamenadebrah@frimpsoil.com.gh',
    'edmund.dwamena@frimpsoil.com.gh', 'emmanuel.okyere@frimpsoil.com.gh',
    'erika.frimpong@frimpsoil.com.gh', 'finance@frimpsoil.com.gh',
    'gifty.kyeibaffour@frimpsoil.com.gh', 'godfred.obeng@frimpsoil.com.gh',
    'hr@frimpsoil.com.gh', 'ivan.banang@frimpsoil.com.gh',
    'james.tagoe@frimpsoil.com.gh', 'jamila.gado@frimpsoil.com.gh',
    'johannes.tenzagh@frimpsoil.com.gh', 'kingsley.frimpong@frimpsoil.com.gh',
    'marketing-distribution@frimpsoil.com.gh', 'mavis.frimpong@frimpsoil.com.gh',
    'miracle.lartey@frimpsoil.com.gh', 'operations@frimpsoil.com.gh',
    'peter.nyamaah@frimpsoil.com.gh', 'phinehas.pappoe@frimpsoil.com.gh',
    'paakwesi@frimpsoil.com.gh', 'prince@frimpsoil.com.gh',
    'raphael.teye@frimpsoil.com.gh', 'samuel.agama@frimpsoil.com.gh',
    'samuel.marlaidickson@frimpsoil.com.gh', 'sandra.omane@frimpsoil.com.gh',
    'siaw.appiahfrimpong@frimpsoil.com.gh', 'siddique.abubakariissaka@frimpsoil.com.gh',
    'stephen.commey@frimpsoil.com.gh', 'support@frimpsoil.com.gh',
    'vincent.jojoboadu@frimpsoil.com.gh', 'vintbaffour@frimpsoil.com.gh',
    'yaaopokuaddai@frimpsoil.com.gh'
  ] LOOP
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_email LIMIT 1;
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'Cannot seed mailbox: auth user % is missing', v_email;
    END IF;

    v_vault_ref := public.vault_upsert_secret(
      'Frimps@2026',
      format('mailbox_%s_password', lower(regexp_replace(v_email, '[^a-zA-Z0-9]', '_', 'g'))),
      format('IMAP/SMTP password for %s', v_email)
    );

    INSERT INTO public.mailboxes (
      organization_id, staff_user_id, email_address, display_name,
      imap_host, imap_port, smtp_host, smtp_port,
      credential_vault_ref, sync_status, last_error
    ) VALUES (
      'aaaaaaaa-0000-0000-0000-000000000001', v_user_id, v_email,
      initcap(replace(replace(split_part(v_email, '@', 1), '.', ' '), '-', ' ')),
      'mail.frimpsoil.com.gh', 993, 'mail.frimpsoil.com.gh', 587,
      v_vault_ref, 'pending', NULL
    )
    ON CONFLICT (email_address) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      staff_user_id = EXCLUDED.staff_user_id,
      display_name = EXCLUDED.display_name,
      imap_host = EXCLUDED.imap_host,
      imap_port = EXCLUDED.imap_port,
      smtp_host = EXCLUDED.smtp_host,
      smtp_port = EXCLUDED.smtp_port,
      credential_vault_ref = EXCLUDED.credential_vault_ref,
      sync_status = 'pending',
      last_error = NULL
    RETURNING id INTO v_mailbox_id;

    INSERT INTO public.mailbox_folders (mailbox_id, imap_folder_name, normalized_type, display_name)
    SELECT v_mailbox_id, folder.imap_folder_name, folder.normalized_type, folder.display_name
    FROM (VALUES
      ('INBOX', 'inbox', 'Inbox'), ('Sent', 'sent', 'Sent'),
      ('Drafts', 'drafts', 'Drafts'), ('Archive', 'archive', 'Archive'),
      ('Spam', 'spam', 'Spam'), ('Trash', 'trash', 'Trash')
    ) AS folder(imap_folder_name, normalized_type, display_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.mailbox_folders existing
      WHERE existing.mailbox_id = v_mailbox_id
        AND existing.normalized_type = folder.normalized_type
    );
  END LOOP;
END $$;
