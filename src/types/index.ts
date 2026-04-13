// Capability Types
export type Capability =
  | 'llm.ollama'
  | 'llm.litellm'
  | 'llm.anthropic'
  | 'db.pg_main'
  | 'db.pg_vector'
  | 'mcp.filesystem'
  | 'mcp.browser'
  | 'agent.n8n';

export type CapabilityStatus = 'connected' | 'disconnected' | 'error';

export interface CapabilityState {
  capability: Capability;
  status: CapabilityStatus;
  message?: string;
  lastChecked: string;
}

// Config Types
export interface ConfigEntry {
  key: string;
  value: string;
  updated_at: string;
}

// LLM Types
export interface LLMProvider {
  type: 'ollama' | 'litellm' | 'anthropic';
  url?: string;
  apiKey?: string;
  model?: string;
  available: boolean;
}

export interface LLMTestResult {
  success: boolean;
  models?: string[];
  error?: string;
}

// Settings Types
export interface Settings {
  llm: {
    ollama?: {
      url: string;
      model?: string;
    };
    litellm?: {
      url: string;
      apiKey: string;
    };
    anthropic?: {
      apiKey: string;
    };
  };
  database: {
    sqlite: {
      path: string;
    };
    pgMain?: {
      url: string;
    };
    pgVector?: {
      url: string;
    };
  };
  mcp: {
    filesystem?: {
      enabled: boolean;
      root: string;
    };
    browser?: {
      url: string;
    };
  };
  agents: {
    n8n?: {
      webhookUrl: string;
    };
  };
}
