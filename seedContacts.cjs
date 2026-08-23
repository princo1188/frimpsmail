const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.SUPABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const contacts = [
  { name: 'Erika Frimpong', designation: 'Managing Director', phone: '+233544527519', email: 'erika.frimpong@frimpsoil.com.gh', department: 'Admin' },
  { name: 'Jamila Gado', designation: 'Human Resource Manager', phone: '+233244824414', email: 'jamila.gado@frimpsoil.com.gh', department: 'Admin & HR' },
  { name: 'Yaa Opoku-Addai', designation: 'Finance Manager', phone: '+233240123223', email: 'yaaopokuaddai@frimpsoil.com.gh', department: 'Finance' },
  { name: 'Edmund Dwamena', designation: 'Deputy Finance Manager', phone: '+233243286321', email: 'edmund.dwamena@frimpsoil.com.gh', department: 'Finance' },
  { name: 'Siaw Appiah Frimpong', designation: 'Accounts Officer', phone: '+233246857827', email: 'siaw.appiahfrimpong@frimpsoil.com.gh', department: 'Finance' },
  { name: 'Daniel Yekple', designation: 'Accounts Officer', phone: '+233546406855', email: 'daniel.yekple@frimpsoil.com.gh', department: 'Finance' },
  { name: 'Johannes Tenzagh', designation: 'Accounts Officer', phone: '+233542535998', email: 'johannes.tenzagh@frimpsoil.com.gh', department: 'Finance' },
  { name: 'Samuel Marlai Dickson', designation: 'Accounts Officer', phone: '+233545275321', email: 'samuel.marlaidickson@frimpsoil.com.gh', department: 'Finance' },
  { name: 'Emmanuel Okyere', designation: 'Transport Manager', phone: '+233599622099', email: 'emmanuel.okyere@frimpsoil.com.gh', department: 'Marketing & Distribution' },
  { name: 'Phinehas Pappoe', designation: 'Marketing Officer', phone: '+233555561419', email: 'phinehas.pappoe@frimpsoil.com.gh', department: 'Marketing & Distribution' },
  { name: 'Derrick Dwamena Debrah', designation: 'Deputy Operations Manager', phone: '+233244371040', email: 'derrick.dwamenadebrah@frimpsoil.com.gh', department: 'Operations' },
  { name: 'Kingsley Frimpong', designation: 'Operations officer', phone: '+233249627966', email: 'kingsley.frimpong@frimpsoil.com.gh', department: 'Operations' },
  { name: 'Godfred Obeng', designation: 'Head of Audit', phone: '+233240132471', email: 'godfred.obeng@frimpsoil.com.gh', department: 'Audit' },
  { name: 'Ivan Banang', designation: 'Auditor', phone: '+233235227898', email: 'ivan.banang@frimpsoil.com.gh', department: 'Audit' },
  { name: 'Siddique Abubakari Issaka', designation: 'Auditor', phone: '+233245764779', email: 'siddique.abubakariissaka@frimpsoil.com.gh', department: 'Audit' },
  { name: 'Miracle Lartey', designation: 'Auditor', phone: '+233546245539', email: 'miracle.lartey@frimpsoil.com.gh', department: 'Audit' },
  { name: 'Stephen Commey', designation: 'Auditor', phone: '+233208333293', email: 'stephen.commey@frimpsoil.com.gh', department: 'Audit' },
  { name: 'Peter Nyamaah', designation: 'Auditor', phone: '+233243578546', email: 'peter.nyamaah@frimpsoil.com.gh', department: 'Audit' },
  { name: 'Raphael Teye', designation: 'Auditor', phone: '+233545509293', email: 'raphael.teye@frimpsoil.com.gh', department: 'Audit' },
  { name: 'Vincent Jojo Boadu', designation: 'Auditor', phone: '+233543086850', email: 'vincent.jojoboadu@frimpsoil.com.gh', department: 'Audit' },
  { name: 'David Ajera', designation: 'Auditor', phone: '+233241127197', email: 'david.ajera@frimpsoil.com.gh', department: 'Audit' },
  { name: 'Samuel Agama', designation: 'Liaison Officer', phone: '+233240116982', email: 'samuel.agama@frimpsoil.com.gh', department: 'Depot' },
  { name: 'Mavis Frimpong', designation: 'Liaison Officer', phone: '+233244991755', email: 'mavis.frimpong@frimpsoil.com.gh', department: 'Depot' },
  { name: 'Gifty Kyei Baffour', designation: 'Liaison Officer', phone: '+233244718256', email: 'gifty.kyeibaffour@frimpsoil.com.gh', department: 'Depot' },
  { name: 'Bismark Baffour Akoto', designation: 'Operations Manager', phone: '+233246233086', email: 'vintbaffour@frimpsoil.com.gh', department: 'Operations' },
  { name: 'James Tagoe', designation: 'Finance Officer', phone: '+233244844737', email: 'james.tagoe@frimpsoil.com.gh', department: 'Finance' },
  { name: 'Sandra Omane', designation: 'Front Desk Officer', phone: '+233241849803', email: 'sandra.omane@frimpsoil.com.gh', department: 'Admin' }
];

async function seed() {
  await client.connect();
  
  // Create table if not exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS contacts (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      designation TEXT,
      phone TEXT,
      email TEXT UNIQUE,
      department TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // Enable RLS and create policy
  await client.query(`
    ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "select_policy" ON contacts FOR SELECT USING (true);
  `);
  
  // Insert contacts
  for (const contact of contacts) {
    await client.query(`
      INSERT INTO contacts (name, designation, phone, email, department)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO NOTHING;
    `, [contact.name, contact.designation, contact.phone, contact.email, contact.department]);
  }
  
  // Verify count
  const res = await client.query('SELECT COUNT(*) FROM contacts;');
  console.log(`Successfully seeded ${res.rows[0].count} contacts`);
  
  await client.end();
}

seed().catch(console.error);