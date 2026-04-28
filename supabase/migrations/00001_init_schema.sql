
-- 创建用户角色枚举
CREATE TYPE public.user_role AS ENUM ('user', 'admin');

-- 创建用户档案表
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE,
  username text UNIQUE,
  role public.user_role NOT NULL DEFAULT 'user',
  api_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 创建PPT项目表
CREATE TABLE public.ppt_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '未命名PPT',
  data jsonb NOT NULL DEFAULT '{}',
  thumbnail_url text,
  template_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER ppt_projects_updated_at
  BEFORE UPDATE ON public.ppt_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 新用户自动同步 handle_new_user
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_count int;
  uname text;
BEGIN
  SELECT COUNT(*) INTO user_count FROM profiles;
  -- 从 email 中提取用户名 (去掉 @miaoda.com)
  uname := split_part(NEW.email, '@', 1);
  INSERT INTO public.profiles (id, email, username, role)
  VALUES (
    NEW.id,
    NEW.email,
    uname,
    CASE WHEN user_count = 0 THEN 'admin'::public.user_role ELSE 'user'::public.user_role END
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (OLD.confirmed_at IS NULL AND NEW.confirmed_at IS NOT NULL)
  EXECUTE FUNCTION handle_new_user();

-- 启用 RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ppt_projects ENABLE ROW LEVEL SECURITY;

-- Helper: 是否为 admin
CREATE OR REPLACE FUNCTION is_admin(uid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = uid AND role = 'admin');
$$;

-- Profiles 策略
CREATE POLICY "管理员完全访问" ON public.profiles
  FOR ALL TO authenticated USING (is_admin(auth.uid()));

CREATE POLICY "用户查看自己档案" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "用户更新自己档案(除角色)" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- PPT 项目策略
CREATE POLICY "用户管理自己的PPT" ON public.ppt_projects
  FOR ALL TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "管理员查看所有PPT" ON public.ppt_projects
  FOR SELECT TO authenticated USING (is_admin(auth.uid()));

-- 启用 Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.ppt_projects;
