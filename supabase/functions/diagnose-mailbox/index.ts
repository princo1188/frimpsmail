import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Test IMAP login using raw Deno TLS (avoids imapflow Node.js compat issues in Deno) */
async function testImap(host: string, port: number, tlsServerName: string, user: string, pass: string): Promise<{ ok: boolean; folders?: number; error?: string }> {
  let conn: Deno.TlsConn | null = null;
  try {
    conn = await Deno.connectTls({ hostname: tlsServerName, port, caCerts: [] });

    const enc = new TextEncoder();
    const dec = new TextDecoder();

    const readLine = async (): Promise<string> => {
      const buf = new Uint8Array(4096);
      const n = await conn!.read(buf);
      return dec.decode(buf.subarray(0, n ?? 0));
    };

    // Read greeting
    const greeting = await readLine();
    if (!greeting.includes('OK')) throw new Error(`Unexpected IMAP greeting: ${greeting.trim()}`);

    // LOGIN
    await conn.write(enc.encode(`A1 LOGIN "${user}" "${pass}"\r\n`));
    const loginResp = await readLine();
    if (!loginResp.includes('A1 OK')) {
      const msg = loginResp.trim();
      throw new Error(`IMAP LOGIN failed: ${msg}`);
    }

    // LIST folders
    await conn.write(enc.encode('A2 LIST "" "*"\r\n'));
    let listResp = '';
    let folderCount = 0;
    // read until we see A2 OK
    for (let i = 0; i < 50; i++) {
      const chunk = await readLine();
      listResp += chunk;
      folderCount += (chunk.match(/\* LIST/g) || []).length;
      if (chunk.includes('A2 OK')) break;
    }

    // LOGOUT
    await conn.write(enc.encode('A3 LOGOUT\r\n'));
    conn.close();
    return { ok: true, folders: folderCount };
  } catch (err) {
    try { conn?.close(); } catch { /* ignore */ }
    return { ok: false, error: (err as Error).message };
  }
}

/** Test SMTP STARTTLS auth using Deno native TCP + upgradeToTls */
async function testSmtp(host: string, port: number, tlsServerName: string, user: string, pass: string): Promise<{ ok: boolean; error?: string; banner?: string }> {
  let conn: Deno.Conn | null = null;
  try {
    conn = await Deno.connect({ hostname: host, port });
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    const readResponse = async (): Promise<string> => {
      const buf = new Uint8Array(4096);
      const n = await conn!.read(buf);
      return dec.decode(buf.subarray(0, n ?? 0));
    };

    // Read banner
    const banner = await readResponse();
    if (!banner.startsWith('220')) throw new Error(`SMTP banner: ${banner.trim()}`);

    // EHLO
    await conn.write(enc.encode(`EHLO diagnose.frimpsoil.com.gh\r\n`));
    const ehloResp = await readResponse();
    if (!ehloResp.includes('250')) throw new Error(`EHLO failed: ${ehloResp.trim()}`);

    let tlsConn: Deno.TlsConn | null = null;

    if (port === 587 && ehloResp.includes('STARTTLS')) {
      // STARTTLS upgrade
      await conn.write(enc.encode('STARTTLS\r\n'));
      const stls = await readResponse();
      if (!stls.includes('220')) throw new Error(`STARTTLS: ${stls.trim()}`);
      tlsConn = await Deno.startTls(conn as Deno.TcpConn, { hostname: tlsServerName, caCerts: [] });
      conn = null;

      const tlsRead = async (): Promise<string> => {
        const buf = new Uint8Array(4096);
        const n = await tlsConn!.read(buf);
        return dec.decode(buf.subarray(0, n ?? 0));
      };

      await tlsConn.write(enc.encode(`EHLO diagnose.frimpsoil.com.gh\r\n`));
      await tlsRead(); // EHLO after TLS

      // AUTH LOGIN
      await tlsConn.write(enc.encode('AUTH LOGIN\r\n'));
      await tlsRead(); // 334
      await tlsConn.write(enc.encode(btoa(user) + '\r\n'));
      await tlsRead(); // 334
      await tlsConn.write(enc.encode(btoa(pass) + '\r\n'));
      const authResp = await tlsRead();
      if (!authResp.includes('235')) throw new Error(`SMTP AUTH failed: ${authResp.trim()}`);

      await tlsConn.write(enc.encode('QUIT\r\n'));
      tlsConn.close();
    } else if (port === 465) {
      // Pure TLS — shouldn't reach here since we used Deno.connect, but handle gracefully
      throw new Error('Port 465 requires direct TLS; use imap test path');
    } else {
      throw new Error(`Server does not advertise STARTTLS on port ${port}`);
    }

    return { ok: true, banner: banner.trim().substring(0, 80) };
  } catch (err) {
    try { conn?.close(); } catch { /* ignore */ }
    return { ok: false, error: (err as Error).message };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { mailbox_id } = await req.json() as { mailbox_id: string };
    if (!mailbox_id) {
      return new Response(JSON.stringify({ error: 'mailbox_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: mailbox, error: mbError } = await supabase
      .from('mailboxes')
      .select('*')
      .eq('id', mailbox_id)
      .single();
    if (mbError || !mailbox) throw new Error('Mailbox not found');

    const { data: password, error: vaultError } = await supabase
      .rpc('vault_read_secret', { secret_id: mailbox.credential_vault_ref });
    if (vaultError) throw new Error(`Vault error: ${vaultError.message}`);
    if (!password) throw new Error('Password not found in Vault');

    // Run IMAP and SMTP tests in parallel with 25s timeout each
    const [imapResult, smtpResult] = await Promise.all([
      Promise.race([
        testImap(mailbox.imap_host, mailbox.imap_port, mailbox.imap_tls_server_name ?? mailbox.imap_host, mailbox.email_address, password),
        new Promise<{ ok: boolean; error: string }>(res =>
          setTimeout(() => res({ ok: false, error: 'IMAP test timed out after 25s' }), 25000)
        ),
      ]),
      Promise.race([
        testSmtp(mailbox.smtp_host, mailbox.smtp_port, mailbox.smtp_tls_server_name ?? mailbox.smtp_host, mailbox.email_address, password),
        new Promise<{ ok: boolean; error: string }>(res =>
          setTimeout(() => res({ ok: false, error: 'SMTP test timed out after 25s' }), 25000)
        ),
      ]),
    ]);

    return new Response(JSON.stringify({
      mailbox_id,
      email_address: mailbox.email_address,
      imap_host: `${mailbox.imap_host}:${mailbox.imap_port}`,
      smtp_host: `${mailbox.smtp_host}:${mailbox.smtp_port}`,
      sync_status: mailbox.sync_status,
      vault_password_set: !!password,
      vault_password_length: (password as string).length,
      imap: imapResult,
      smtp: smtpResult,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
