const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hgzyypyqawcppivnghpr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhnenl5cHlxYXdjcHBpdm5naHByIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzA0NDE3MCwiZXhwIjoyMDk4NjIwMTcwfQ.U8lrNfsqklbAzYa0jmjo3wWPpWmFazWDeRY47kGhYBs';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ORG_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const APP_PASSWORD = 'OilFrimps@2026$$$';
const IMAP_PASSWORD = 'Frimps@2026';
const IMAP_HOST = 'mail.frimpsoil.com.gh';
const SMTP_HOST = 'mail.frimpsoil.com.gh';

const ACCOUNTS = [
  { email: 'administration@frimpsoil.com.gh', name: 'Administration', role: 'shared' },
  { email: 'audit@frimpsoil.com.gh', name: 'Audit', role: 'shared' },
  { email: 'daniel.yekple@frimpsoil.com.gh', name: 'Daniel Yekple', role: 'staff' },
  { email: 'david.ajera@frimpsoil.com.gh', name: 'David Ajera', role: 'staff' },
  { email: 'depot@frimpsoil.com.gh', name: 'Depot', role: 'shared' },
  { email: 'derrick.dwamenadebrah@frimpsoil.com.gh', name: 'Derrick Dwamena-Debrah', role: 'staff' },
  { email: 'edmund.dwamena@frimpsoil.com.gh', name: 'Edmund Dwamena', role: 'staff' },
  { email: 'emmanuel.okyere@frimpsoil.com.gh', name: 'Emmanuel Okyere', role: 'staff' },
  { email: 'erika.frimpong@frimpsoil.com.gh', name: 'Erika Frimpong', role: 'staff' },
  { email: 'finance@frimpsoil.com.gh', name: 'Finance', role: 'shared' },
  { email: 'gifty.kyeibaffour@frimpsoil.com.gh', name: 'Gifty Kyei-Baffour', role: 'staff' },
  { email: 'godfred.obeng@frimpsoil.com.gh', name: 'Godfred Obeng', role: 'staff' },
  { email: 'hr@frimpsoil.com.gh', name: 'HR', role: 'shared' },
  { email: 'ivan.banang@frimpsoil.com.gh', name: 'Ivan Banang', role: 'staff' },
  { email: 'james.tagoe@frimpsoil.com.gh', name: 'James Tagoe', role: 'staff' },
  { email: 'jamila.gado@frimpsoil.com.gh', name: 'Jamila Gado', role: 'staff' },
  { email: 'johannes.tenzagh@frimpsoil.com.gh', name: 'Johannes Tenzagh', role: 'staff' },
  { email: 'kingsley.frimpong@frimpsoil.com.gh', name: 'Kingsley Frimpong', role: 'staff' },
  { email: 'marketing-distribution@frimpsoil.com.gh', name: 'Marketing/Distribution', role: 'shared' },
  { email: 'mavis.frimpong@frimpsoil.com.gh', name: 'Mavis Frimpong', role: 'staff' },
  { email: 'miracle.lartey@frimpsoil.com.gh', name: 'Miracle Lartey', role: 'staff' },
  { email: 'operations@frimpsoil.com.gh', name: 'Operations', role: 'shared' },
  { email: 'peter.nyamaah@frimpsoil.com.gh', name: 'Peter Nyamaah', role: 'staff' },
  { email: 'phinehas.pappoe@frimpsoil.com.gh', name: 'Phinehas Pappoe', role: 'staff' },
  { email: 'raphael.teye@frimpsoil.com.gh', name: 'Raphael Teye', role: 'staff' },
  { email: 'samuel.agama@frimpsoil.com.gh', name: 'Samuel Agama', role: 'staff' },
  { email: 'samuel.marlaidickson@frimpsoil.com.gh', name: 'Samuel Marlai-Dickson', role: 'staff' },
  { email: 'sandra.omane@frimpsoil.com.gh', name: 'Sandra Omane', role: 'staff' },
  { email: 'siaw.appiahfrimpong@frimpsoil.com.gh', name: 'Siaw Appiah-Frimpong', role: 'staff' },
  { email: 'siddique.abubakariissaka@frimpsoil.com.gh', name: 'Siddique Abubakari-Issaka', role: 'staff' },
  { email: 'stephen.commey@frimpsoil.com.gh', name: 'Stephen Commey', role: 'staff' },
  { email: 'support@frimpsoil.com.gh', name: 'Support', role: 'shared' },
  { email: 'vincent.jojoboadu@frimpsoil.com.gh', name: 'Vincent Jojo-Boadu', role: 'staff' },
  { email: 'vintbaffour@frimpsoil.com.gh', name: 'Vint Baffour', role: 'staff' },
  { email: 'yaaopokuaddai@frimpsoil.com.gh', name: 'Yaa Opoku-Addai', role: 'staff' },
];

async function storeMailboxCredentials(email, password, mailboxId) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/store-mailbox-credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify({ email, password, mailbox_id: mailboxId })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`store-mailbox-credentials failed: ${res.status} ${text}`);
  }
  return await res.json();
}

async function triggerMailboxSync(mailboxId) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/trigger-mailbox-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify({ mailbox_id: mailboxId })
  });
  if (!res.ok) {
    console.warn(`trigger-mailbox-sync failed (non-fatal): ${res.status}`);
  }
}

async function processAccount(acc) {
  try {
    // 1. Check if user already exists
    let userId;
    const { data: usersData, error: usersErr } = await supabase.auth.admin.listUsers();
    if (usersErr) throw new Error(`List users error: ${usersErr.message}`);
    
    const existingUser = usersData.users.find(u => u.email === acc.email);
    if (existingUser) {
      userId = existingUser.id;
      // Update password just in case
      await supabase.auth.admin.updateUserById(userId, { password: APP_PASSWORD, email_confirm: true });
    } else {
      // Create user
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: acc.email,
        password: APP_PASSWORD,
        email_confirm: true,
      });
      if (authErr) throw new Error(`Create user error: ${authErr.message}`);
      userId = authData.user.id;
    }

    // 2. Upsert staff_users
    // Map shared/dept mailboxes to just regular staff role, since role only has 'admin'|'staff' in schema
    // and multi-mailbox delegation is not fully built out. We just create them as regular users so they can log in.
    const { error: staffErr } = await supabase
      .from('staff_users')
      .upsert({
        id: userId,
        organization_id: ORG_ID,
        full_name: acc.name,
        role: 'staff' // only admin|staff are allowed by schema constraints
      }, { onConflict: 'id' });
    if (staffErr) throw new Error(`staff_users upsert error: ${staffErr.message}`);

    // 3. Check if mailbox exists
    let mailboxId;
    const { data: existingMb, error: mbLookupErr } = await supabase
      .from('mailboxes')
      .select('id')
      .eq('email_address', acc.email)
      .maybeSingle();
      
    if (mbLookupErr) throw new Error(`Mailbox lookup error: ${mbLookupErr.message}`);
    
    if (existingMb) {
      mailboxId = existingMb.id;
      await supabase.from('mailboxes').update({
        staff_user_id: userId,
        display_name: acc.name,
        imap_host: IMAP_HOST,
        imap_port: 993,
        smtp_host: SMTP_HOST,
        smtp_port: 587,
      }).eq('id', mailboxId);
    } else {
      const { data: mbData, error: mbErr } = await supabase
        .from('mailboxes')
        .insert({
          organization_id: ORG_ID,
          staff_user_id: userId,
          email_address: acc.email,
          display_name: acc.name,
          imap_host: IMAP_HOST,
          imap_port: 993,
          smtp_host: SMTP_HOST,
          smtp_port: 587,
          sync_status: 'pending'
        })
        .select()
        .single();
      if (mbErr) throw new Error(`Mailbox insert error: ${mbErr.message}`);
      mailboxId = mbData.id;
    }

    // 4. Store IMAP credentials in Vault via Edge Function
    await storeMailboxCredentials(acc.email, IMAP_PASSWORD, mailboxId);
    
    // 5. Trigger sync
    await triggerMailboxSync(mailboxId);

    return { ...acc, createdAppUser: 'Y', createdMailbox: 'Y', status: 'Success (Sync Pending)' };
  } catch (e) {
    console.error(`Error processing ${acc.email}:`, e);
    return { ...acc, createdAppUser: 'Error', createdMailbox: 'Error', status: e.message };
  }
}

async function run() {
  console.log('Starting bulk creation of 34 accounts...');
  const results = [];
  
  for (const acc of ACCOUNTS) {
    console.log(`Processing: ${acc.email} (${acc.name})...`);
    const res = await processAccount(acc);
    results.push(res);
  }

  console.log('\n--- Summary Table ---');
  console.log('| Email | Display Name | cPanel Server MB Created? | Frimps Mail App User Created? | IMAP Sync Status |');
  console.log('|---|---|---|---|---|');
  for (const r of results) {
    console.log(`| ${r.email} | ${r.name} | N (Manual step needed) | ${r.createdAppUser} | ${r.status} |`);
  }
}

run();
