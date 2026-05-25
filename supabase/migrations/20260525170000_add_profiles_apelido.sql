-- Add nickname (apelido) column to public.profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS apelido TEXT;
