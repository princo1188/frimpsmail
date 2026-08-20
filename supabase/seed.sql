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
      'staff'
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;
