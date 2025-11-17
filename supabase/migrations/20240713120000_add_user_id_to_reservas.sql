-- Ensure reservas has a user_id column that matches the new frontend payload
alter table if exists public.reservas
  add column if not exists user_id uuid references auth.users (id);

-- Backfill user_id based on the legacy usuario_id column when present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reservas'
      AND column_name = 'usuario_id'
  ) THEN
    UPDATE public.reservas
    SET user_id = COALESCE(user_id, usuario_id)
    WHERE usuario_id IS NOT NULL
      AND user_id IS NULL;
  END IF;
END $$;
