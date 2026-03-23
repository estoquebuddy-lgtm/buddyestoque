
-- Create profiles for existing users who don't have one yet
INSERT INTO public.profiles (id, email, approved)
SELECT id, email, true FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;

-- Set first user as admin
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users ORDER BY created_at ASC LIMIT 1
ON CONFLICT (user_id, role) DO NOTHING;
