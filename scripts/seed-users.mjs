import { createClient } from '@supabase/supabase-js';

const defaultPassword = 'OilFrimps@2026$$$';
const passwordsByEmail = new Map([
  ['prince@frimpsoil.com.gh', 'Frimps@2026'],
]);
const emails = [
  'administration@frimpsoil.com.gh',
  'audit@frimpsoil.com.gh',
  'daniel.yekple@frimpsoil.com.gh',
  'david.ajera@frimpsoil.com.gh',
  'depot@frimpsoil.com.gh',
  'derrick.dwamenadebrah@frimpsoil.com.gh',
  'edmund.dwamena@frimpsoil.com.gh',
  'emmanuel.okyere@frimpsoil.com.gh',
  'erika.frimpong@frimpsoil.com.gh',
  'finance@frimpsoil.com.gh',
  'gifty.kyeibaffour@frimpsoil.com.gh',
  'godfred.obeng@frimpsoil.com.gh',
  'hr@frimpsoil.com.gh',
  'ivan.banang@frimpsoil.com.gh',
  'james.tagoe@frimpsoil.com.gh',
  'jamila.gado@frimpsoil.com.gh',
  'johannes.tenzagh@frimpsoil.com.gh',
  'kingsley.frimpong@frimpsoil.com.gh',
  'marketing-distribution@frimpsoil.com.gh',
  'mavis.frimpong@frimpsoil.com.gh',
  'miracle.lartey@frimpsoil.com.gh',
  'operations@frimpsoil.com.gh',
  'peter.nyamaah@frimpsoil.com.gh',
  'phinehas.pappoe@frimpsoil.com.gh',
  'paakwesi@frimpsoil.com.gh',
  'prince@frimpsoil.com.gh',
  'raphael.teye@frimpsoil.com.gh',
  'samuel.agama@frimpsoil.com.gh',
  'samuel.marlaidickson@frimpsoil.com.gh',
  'sandra.omane@frimpsoil.com.gh',
  'siaw.appiahfrimpong@frimpsoil.com.gh',
  'siddique.abubakariissaka@frimpsoil.com.gh',
  'stephen.commey@frimpsoil.com.gh',
  'support@frimpsoil.com.gh',
  'vincent.jojoboadu@frimpsoil.com.gh',
  'vintbaffour@frimpsoil.com.gh',
  'yaaopokuaddai@frimpsoil.com.gh',
];

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY are required.');
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const displayName = (email) => email
  .split('@')[0]
  .replace(/[.-]/g, ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

const adminEmails = new Set([
  'audit@frimpsoil.com.gh',
  'paakwesi@frimpsoil.com.gh',
  'prince@frimpsoil.com.gh',
]);
const isAdmin = (email) => adminEmails.has(email);
const selectedEmail = process.env.SEED_USER_EMAIL?.toLowerCase();
const targetEmails = selectedEmail
  ? emails.filter((email) => email === selectedEmail)
  : emails;

if (selectedEmail && targetEmails.length === 0) {
  throw new Error(`Unknown seeded user: ${selectedEmail}`);
}

const { data: organization, error: organizationError } = await supabase
  .from('organizations')
  .select('id')
  .eq('domain', 'frimpsoil.com.gh')
  .maybeSingle();

if (organizationError || !organization) {
  throw new Error(`Could not find the Frimps Oil organization: ${organizationError?.message ?? 'missing organization'}`);
}

const { error: contactNameCleanupError } = await supabase
  .from('contacts')
  .delete()
  .in('name', [
    'Abena Frimpong',
    'Akosua Boateng',
    'David Asante',
    'Emmanuel Tetteh',
    'Inspector Mensah',
    'James Quaye',
    'Kwesi Asiedu',
  ]);
if (contactNameCleanupError) throw new Error(`Could not clean demo contacts by name: ${contactNameCleanupError.message}`);

const { error: contactEmailCleanupError } = await supabase
  .from('contacts')
  .delete()
  .in('email', ['abena.frimpong@example.com', 'akosua.boateng@example.com', 'david.asante@example.com']);
if (contactEmailCleanupError) throw new Error(`Could not clean demo contacts by email: ${contactEmailCleanupError.message}`);

const { error: calendarCleanupError } = await supabase
  .from('calendar_events')
  .delete()
  .in('title', ['Tanker GH-4421', 'GCB Bank signing', 'NPA Inspections']);
if (calendarCleanupError) throw new Error(`Could not clean demo calendar events: ${calendarCleanupError.message}`);

const { data: listedUsers, error: listError } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});

if (listError) throw listError;

const usersByEmail = new Map(
  listedUsers.users.map((user) => [user.email?.toLowerCase(), user]),
);
const summary = { created: 0, updated: 0, profilesCreated: 0 };

for (const email of targetEmails) {
  const password = passwordsByEmail.get(email) ?? defaultPassword;
  const existingUser = usersByEmail.get(email);
  const result = existingUser
    ? await supabase.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
    })
    : await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (result.error || !result.data.user) {
    throw new Error(`Could not seed ${email}: ${result.error?.message ?? 'no user returned'}`);
  }

  if (existingUser) summary.updated += 1;
  else summary.created += 1;

  if (isAdmin(email)) {
    const { error: profileError } = await supabase.from('staff_users').upsert({
      id: result.data.user.id,
      organization_id: organization.id,
      full_name: displayName(email),
      role: 'admin',
    }, { onConflict: 'id' });
    if (profileError) throw new Error(`Could not grant admin profile for ${email}: ${profileError.message}`);
  } else {
    const { data: profile, error: profileLookupError } = await supabase
      .from('staff_users')
      .select('id')
      .eq('id', result.data.user.id)
      .maybeSingle();

    if (profileLookupError) throw profileLookupError;
    if (!profile) {
    const { error: profileError } = await supabase.from('staff_users').insert({
      id: result.data.user.id,
      organization_id: organization.id,
      full_name: displayName(email),
      role: 'staff',
    });
    if (profileError) throw new Error(`Could not create staff profile for ${email}: ${profileError.message}`);
    summary.profilesCreated += 1;
    }
  }
}

console.log(JSON.stringify({ total: targetEmails.length, ...summary }));
