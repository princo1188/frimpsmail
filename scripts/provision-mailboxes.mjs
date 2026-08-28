import { createClient } from '@supabase/supabase-js';

const organizationDomain = 'frimpsoil.com.gh';
const mailboxPassword = process.env.MAILBOX_PASSWORD;
if (!mailboxPassword) throw new Error('MAILBOX_PASSWORD is required.');
const emails = [
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
  'yaaopokuaddai@frimpsoil.com.gh',
];

const folders = [
  ['INBOX', 'inbox', 'Inbox'],
  ['Sent', 'sent', 'Sent'],
  ['Drafts', 'drafts', 'Drafts'],
  ['Archive', 'archive', 'Archive'],
  ['Spam', 'spam', 'Spam'],
  ['Trash', 'trash', 'Trash'],
];

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY are required.');

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const displayName = (email) => email.split('@')[0]
  .replace(/[.-]/g, ' ')
  .replace(/\b\w/g, character => character.toUpperCase());

const adminEmails = new Set([
  'audit@frimpsoil.com.gh',
  'paakwesi@frimpsoil.com.gh',
  'prince@frimpsoil.com.gh',
]);
const isAdmin = (email) => adminEmails.has(email);
const selectedEmail = process.env.SEED_USER_EMAIL?.toLowerCase();
const retiredUserEmail = process.env.RETIRED_USER_EMAIL?.toLowerCase();
const targetEmails = selectedEmail
  ? emails.filter((email) => email === selectedEmail)
  : emails;

if (selectedEmail && targetEmails.length === 0) {
  throw new Error(`Unknown mailbox user: ${selectedEmail}`);
}

const { data: organization, error: organizationError } = await supabase
  .from('organizations').select('id').eq('domain', organizationDomain).maybeSingle();
if (organizationError || !organization) throw new Error(`Organization lookup failed: ${organizationError?.message ?? 'missing'}`);

const { data: authData, error: authError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (authError) throw authError;
const usersByEmail = new Map(authData.users.map(user => [user.email?.toLowerCase(), user]));

const retiredUser = retiredUserEmail ? usersByEmail.get(retiredUserEmail) : null;
const cleanup = { retiredMailboxesDeleted: 0, retiredUserDeleted: false };
if (retiredUser) {
  const { data: deletedMailboxes, error: mailboxCleanupError } = await supabase
    .from('mailboxes')
    .delete()
    .eq('staff_user_id', retiredUser.id)
    .select('id');
  if (mailboxCleanupError) throw new Error(`Could not remove retired mailboxes: ${mailboxCleanupError.message}`);
  cleanup.retiredMailboxesDeleted = deletedMailboxes?.length ?? 0;

  const { error: retiredUserCleanupError } = await supabase.auth.admin.deleteUser(retiredUser.id);
  if (retiredUserCleanupError) throw new Error(`Could not remove retired user: ${retiredUserCleanupError.message}`);
  cleanup.retiredUserDeleted = true;
}

const { data: existingMailboxes, error: existingError } = await supabase
  .from('mailboxes').select('id, email_address').in('email_address', targetEmails);
if (existingError) throw existingError;
const existingEmails = new Set((existingMailboxes ?? []).map(mailbox => mailbox.email_address.toLowerCase()));

const summary = { total: targetEmails.length, created: 0, updated: 0, foldersCreated: 0, missingUsers: [] };

const concurrency = 5;
for (let offset = 0; offset < targetEmails.length; offset += concurrency) {
  await Promise.all(targetEmails.slice(offset, offset + concurrency).map(async (email) => {
  const user = usersByEmail.get(email);
  if (!user) {
    summary.missingUsers.push(email);
    return;
  }

  const { error: staffError } = await supabase.from('staff_users').upsert({
    id: user.id,
    organization_id: organization.id,
    full_name: displayName(email),
    role: isAdmin(email) ? 'admin' : 'staff',
  }, { onConflict: 'id', ignoreDuplicates: !isAdmin(email) });
  if (staffError) throw new Error(`Could not link staff profile for ${email}: ${staffError.message}`);

  const secretName = `mailbox_${email.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_password`;
  const { data: vaultRef, error: vaultError } = await supabase.rpc('vault_upsert_secret', {
    p_secret: mailboxPassword,
    p_name: secretName,
    p_description: `IMAP/SMTP password for ${email}`,
  });
  if (vaultError || !vaultRef) throw new Error(`Could not store credentials for ${email}: ${vaultError?.message ?? 'no vault reference'}`);

  const { data: mailbox, error: mailboxError } = await supabase.from('mailboxes').upsert({
    organization_id: organization.id,
    staff_user_id: user.id,
    email_address: email,
    display_name: displayName(email),
    imap_host: 'mail.frimpsoil.com.gh',
    imap_port: 993,
    smtp_host: 'mail.frimpsoil.com.gh',
    smtp_port: 587,
    credential_vault_ref: vaultRef,
    sync_status: 'pending',
    last_error: null,
  }, { onConflict: 'email_address' }).select('id').single();
  if (mailboxError || !mailbox) throw new Error(`Could not provision ${email}: ${mailboxError?.message ?? 'no mailbox returned'}`);
  if (existingEmails.has(email)) summary.updated += 1;
  else summary.created += 1;

  const { data: existingFolders, error: folderLookupError } = await supabase
    .from('mailbox_folders').select('normalized_type').eq('mailbox_id', mailbox.id);
  if (folderLookupError) throw folderLookupError;
  const existingTypes = new Set((existingFolders ?? []).map(folder => folder.normalized_type));
  const missingFolders = folders
    .filter(([, normalizedType]) => !existingTypes.has(normalizedType))
    .map(([imap_folder_name, normalized_type, display_name]) => ({ mailbox_id: mailbox.id, imap_folder_name, normalized_type, display_name }));
  if (missingFolders.length) {
    const { error: folderError } = await supabase.from('mailbox_folders').insert(missingFolders);
    if (folderError) throw new Error(`Could not create folders for ${email}: ${folderError.message}`);
    summary.foldersCreated += missingFolders.length;
  }
  }));
}

if (summary.missingUsers.length) throw new Error(`Missing auth users: ${summary.missingUsers.join(', ')}`);
console.log(JSON.stringify({ ...summary, cleanup }));
