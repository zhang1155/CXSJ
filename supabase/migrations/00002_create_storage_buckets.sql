
-- 创建上传参考素材存储桶
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'uploads',
  'uploads',
  true,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf']
);

-- 创建PPT缩略图存储桶
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ppt-thumbnails',
  'ppt-thumbnails',
  true,
  2097152,
  ARRAY['image/jpeg','image/png','image/webp']
);

-- uploads 存储桶策略
CREATE POLICY "认证用户可上传文件" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "所有人可查看上传文件" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'uploads');

CREATE POLICY "上传者可删除自己的文件" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ppt-thumbnails 存储桶策略
CREATE POLICY "认证用户可上传缩略图" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ppt-thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "所有人可查看缩略图" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'ppt-thumbnails');

CREATE POLICY "上传者可删除缩略图" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'ppt-thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "上传者可更新缩略图" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'ppt-thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);
