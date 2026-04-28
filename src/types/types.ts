// 应用类型定义

export interface Profile {
  id: string;
  email: string | null;
  username: string | null;
  role: 'user' | 'admin';
  api_key: string | null;
  model_configs: ModelConfig[];
  active_model_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModelConfig {
  id: string;
  name: string;
  modelName: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  isDefault?: boolean;
  type: 'gpt-image' | 'dalle' | 'tongyi' | 'custom' | 'video';
}

export interface GenerateImageParams {
  prompt: string;
  size: string;          // GrsAI gpt-image-2 使用比例格式，如 '3:2'、'1:1'
  variants?: number;     // 生成数量（原 n，GrsAI 参数名为 variants）
}

export interface GenerateImageResponse {
  success: boolean;
  url?: string;
  images?: Array<{ url?: string; b64_json?: string }>;
  error?: string;
}

export interface GenerateVideoParams {
  prompt: string;
  negativePrompt?: string;
  resolution: string;
  duration: 5 | 10 | 15;
  style: string;
  fps?: number;
  motionStrength?: number;
  quality?: number;
}

export interface GenerateVideoResponse {
  success: boolean;
  url?: string;
  error?: string;
}

export type ElementType = 'text' | 'image' | 'shape' | 'background' | 'video';

export interface SlideElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  rotation?: number;
  // 文本
  text?: string;
  fontSize?: number;
  fontColor?: string;
  fontWeight?: 'normal' | 'bold';
  fontAlign?: 'left' | 'center' | 'right';
  // 图片
  imageUrl?: string;
  // 视频
  videoUrl?: string;
  // 形状
  shapeType?: string;
  fillColor?: string;
  borderColor?: string;
  borderWidth?: number;
}

export interface Slide {
  id: string;
  background: string;
  elements: SlideElement[];
  order: number;
}

export interface PPTData {
  slides: Slide[];
  aspectRatio: '16:9' | '4:3' | '9:16' | '1:1' | '2.35:1' | 'custom';
  theme?: string;
  customWidth?: number;
  customHeight?: number;
}

export interface PPTProject {
  id: string;
  user_id: string;
  title: string;
  data: PPTData;
  thumbnail_url: string | null;
  template_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PPTTemplate {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  preview: string[];
  data: PPTData;
  category: string;
  styleTags?: string[];
  scenario?: string;
}

export interface SizePreset {
  label: string;
  value: string;
  ratio: string;
  width: number;
  height: number;
  apiSize: string;
}

export interface GenerateImageRequest {
  prompt: string;
  size: string;
  n?: number;
}

