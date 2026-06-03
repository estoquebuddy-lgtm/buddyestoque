-- Add destino column to saidas table
-- This records who received the item or where it was sent on a quick exit
ALTER TABLE saidas ADD COLUMN IF NOT EXISTS destino text;
