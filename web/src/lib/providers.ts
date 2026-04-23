/**
 * Provider Configuration for Onboarding Wizard
 *
 * Defines the structure and metadata for LLM providers available in the onboarding flow.
 */

export interface ProviderField {
  key: string;                   // Environment variable name
  label: string;                 // Form label
  type: "text" | "password" | "url";
  required: boolean;
  placeholder?: string;
  defaultValue?: string;
  hint?: string;
}

export interface ProviderConfig {
  id: string;                    // "volcengine", "openrouter", etc.
  name: string;                  // Display name
  emoji: string;                 // Visual identifier
  description: string;           // One-line description
  docsUrl: string;               // Link to get API key
  fields: ProviderField[];       // Dynamic form fields
  isOAuth?: boolean;             // Special OAuth handling
  oauthCommand?: string;         // CLI command for OAuth login
  supportsVision?: boolean;      // Provider has native vision/multimodal support
}

export const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    id: "volcengine",
    name: "火山引擎（豆包/Doubao）",
    emoji: "🔥",
    description: "字节跳动 ARK API，支持豆包系列模型",
    docsUrl: "https://console.volcengine.com/ark",
    supportsVision: false,
    fields: [
      {
        key: "ARK_API_KEY",
        label: "ARK API Key",
        type: "password",
        required: true,
        placeholder: "输入你的 ARK API Key",
      },
      {
        key: "ARK_BASE_URL",
        label: "Base URL (可选)",
        type: "url",
        required: false,
        defaultValue: "https://ark.cn-beijing.volces.com/api/v3",
        hint: "默认使用 OpenAI 兼容协议端点",
      },
    ],
  },
  {
    id: "zai",
    name: "智谱 GLM / Z.AI",
    emoji: "🤖",
    description: "GLM-4-Plus, GLM-4 等模型",
    docsUrl: "https://open.bigmodel.cn",
    supportsVision: true,
    fields: [
      {
        key: "GLM_API_KEY",
        label: "GLM API Key",
        type: "password",
        required: true,
        placeholder: "输入你的 GLM API Key",
      },
      {
        key: "GLM_BASE_URL",
        label: "Base URL (可选)",
        type: "url",
        required: false,
        defaultValue: "https://api.z.ai/api/paas/v4",
      },
    ],
  },
  {
    id: "kimi",
    name: "Kimi / 月之暗面",
    emoji: "🌙",
    description: "Kimi K2.5, Moonshot 系列模型",
    docsUrl: "https://platform.kimi.ai",
    supportsVision: false,
    fields: [
      {
        key: "KIMI_API_KEY",
        label: "Kimi API Key",
        type: "password",
        required: true,
        placeholder: "输入你的 Kimi API Key",
      },
      {
        key: "KIMI_BASE_URL",
        label: "Base URL (可选)",
        type: "url",
        required: false,
        defaultValue: "https://api.kimi.com/coding/v1",
      },
    ],
  },
  {
    id: "qwen",
    name: "通义千问 (Qwen OAuth)",
    emoji: "🌟",
    description: "通过 OAuth 登录，无需 API Key",
    docsUrl: "https://help.aliyun.com/zh/model-studio/",
    isOAuth: true,
    oauthCommand: "hermes auth qwen-oauth",
    supportsVision: false,
    fields: [],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    emoji: "🧠",
    description: "DeepSeek-V3, DeepSeek-Coder",
    docsUrl: "https://platform.deepseek.com",
    supportsVision: false,
    fields: [
      {
        key: "DEEPSEEK_API_KEY",
        label: "DeepSeek API Key",
        type: "password",
        required: true,
        placeholder: "输入你的 DeepSeek API Key",
      },
    ],
  },
  {
    id: "minimax",
    name: "MiniMax",
    emoji: "🚀",
    description: "MiniMax-M2.5 系列",
    docsUrl: "https://www.minimax.io",
    supportsVision: false,
    fields: [
      {
        key: "MINIMAX_API_KEY",
        label: "MiniMax API Key",
        type: "password",
        required: true,
        placeholder: "输入你的 MiniMax API Key",
      },
      {
        key: "MINIMAX_BASE_URL",
        label: "Base URL (可选)",
        type: "url",
        required: false,
        defaultValue: "https://api.minimax.io/v1",
      },
    ],
  },
  {
    id: "xiaomi",
    name: "小米 MiMo",
    emoji: "📱",
    description: "MiMo-v2-Pro 等模型",
    docsUrl: "https://platform.xiaomimimo.com",
    supportsVision: true,
    fields: [
      {
        key: "XIAOMI_API_KEY",
        label: "Xiaomi API Key",
        type: "password",
        required: true,
        placeholder: "输入你的 Xiaomi API Key",
      },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    emoji: "🔀",
    description: "聚合型平台，一个密钥访问 50+ 模型",
    docsUrl: "https://openrouter.ai/keys",
    supportsVision: true,
    fields: [
      {
        key: "OPENROUTER_API_KEY",
        label: "OpenRouter API Key",
        type: "password",
        required: true,
        placeholder: "输入你的 OpenRouter API Key",
        hint: "可访问 Claude、GPT、Gemini 等所有模型",
      },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    emoji: "🤖",
    description: "Claude 官方 API",
    docsUrl: "https://console.anthropic.com",
    supportsVision: true,
    fields: [
      {
        key: "ANTHROPIC_API_KEY",
        label: "Anthropic API Key",
        type: "password",
        required: true,
        placeholder: "输入你的 Anthropic API Key",
      },
    ],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    emoji: "🔍",
    description: "Gemini 系列模型",
    docsUrl: "https://aistudio.google.com/apikey",
    supportsVision: true,
    fields: [
      {
        key: "GOOGLE_API_KEY",
        label: "Google API Key",
        type: "password",
        required: true,
        placeholder: "输入你的 Google API Key",
      },
    ],
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    emoji: "🤗",
    description: "Hugging Face Inference API",
    docsUrl: "https://huggingface.co/settings/tokens",
    supportsVision: false,
    fields: [
      {
        key: "HF_TOKEN",
        label: "Hugging Face Token",
        type: "password",
        required: true,
        placeholder: "输入你的 HF Token",
      },
    ],
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    emoji: "🟢",
    description: "NVIDIA NIM / build.nvidia.com",
    docsUrl: "https://build.nvidia.com",
    supportsVision: false,
    fields: [
      {
        key: "NVIDIA_API_KEY",
        label: "NVIDIA API Key",
        type: "password",
        required: true,
        placeholder: "输入你的 NVIDIA API Key",
      },
    ],
  },
  {
    id: "ollama",
    name: "Ollama Cloud",
    emoji: "🦙",
    description: "Ollama 云端服务",
    docsUrl: "https://ollama.com/settings",
    supportsVision: false,
    fields: [
      {
        key: "OLLAMA_API_KEY",
        label: "Ollama API Key",
        type: "password",
        required: true,
        placeholder: "输入你的 Ollama API Key",
      },
    ],
  },
];

/**
 * Get provider configuration by ID
 */
export function getProviderById(id: string): ProviderConfig | undefined {
  return PROVIDER_CONFIGS.find((p) => p.id === id);
}

/**
 * Get default provider ID by language
 */
export function getDefaultProviderId(locale: string): string {
  if (locale === "zh") {
    // Chinese default: Volcano Engine (Bytedance)
    return "volcengine";
  } else {
    // English default: Anthropic
    return "anthropic";
  }
}
