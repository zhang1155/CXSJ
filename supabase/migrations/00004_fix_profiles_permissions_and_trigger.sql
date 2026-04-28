
-- 1. 给 profiles 表增加 INSERT 策略（认证用户只能插入自己的行）
CREATE POLICY "用户创建自己的档案"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- 2. 创建 handle_new_user 触发器函数（注册时自动创建 profile）
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username)
  VALUES (
    NEW.id,
    NEW.email,
    -- 从 email 中提取 @ 前缀作为用户名（如 test@miaoda.com → test）
    split_part(NEW.email, '@', 1)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 3. 绑定触发器到 auth.users（注册时触发）
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
