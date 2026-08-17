-- Add optional TLS server name for cPanel/shared hosting where cert CN differs from mail hostname
ALTER TABLE public.mailboxes
  ADD COLUMN IF NOT EXISTS imap_tls_server_name text,
  ADD COLUMN IF NOT EXISTS smtp_tls_server_name text;

-- Update Frimps Oil mailboxes with the actual cert hostname (usnyc.aveshost.net)
UPDATE public.mailboxes
SET imap_tls_server_name = 'usnyc.aveshost.net',
    smtp_tls_server_name = 'usnyc.aveshost.net'
WHERE imap_host = 'mail.frimpsoil.com.gh'
   OR smtp_host = 'mail.frimpsoil.com.gh';