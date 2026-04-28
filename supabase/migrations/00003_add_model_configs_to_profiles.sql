
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS model_configs jsonb DEFAULT '[]'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_model_id text DEFAULT 'gpt-image-2';
