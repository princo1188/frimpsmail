DELETE FROM public.contacts
WHERE name IN ('Abena Frimpong', 'Akosua Boateng', 'David Asante')
   OR email IN (
     'abena.frimpong@example.com',
     'akosua.boateng@example.com',
     'david.asante@example.com'
   );

DELETE FROM public.calendar_events
WHERE title IN ('Tanker GH-4421', 'GCB Bank signing', 'NPA Inspections');

UPDATE public.staff_users
SET role = 'admin'
WHERE id IN (
  SELECT id
  FROM auth.users
  WHERE email IN ('paakwesi@frimpsoil.com.gh', 'prince@frimpsoil.com.gh')
);
