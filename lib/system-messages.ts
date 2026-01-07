/**
 * System Messages Framework
 * 
 * System messages are displayed as notification boxes in the chat UI.
 * They are distinct from AI narration and user messages.
 * 
 * Use cases:
 * - Game state notifications (e.g., "World Lore Loaded", "Save Point Created")
 * - Session events (e.g., "Session Resumed", "Branch Created")
 * - Module status (e.g., "Constraint Module Active", "Combat Mode Enabled")
 */

import { generateUUID } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";

export type SystemMessageType = 
  | "world_lore_loaded"
  | "session_started"
  | "session_resumed"
  | "save_point"
  | "branch_created"
  | "module_status"
  | "custom";

interface SystemMessageConfig {
  type: SystemMessageType;
  text: string;
  icon?: string;
}

const SYSTEM_MESSAGE_CONFIGS: Record<SystemMessageType, Omit<SystemMessageConfig, "type">> = {
  world_lore_loaded: {
    text: "World Lore Loaded",
    icon: "📜",
  },
  session_started: {
    text: "New Adventure Started",
    icon: "🎮",
  },
  session_resumed: {
    text: "Session Resumed",
    icon: "▶️",
  },
  save_point: {
    text: "Save Point Created",
    icon: "💾",
  },
  branch_created: {
    text: "Timeline Branch Created",
    icon: "🌿",
  },
  module_status: {
    text: "Module Status Changed",
    icon: "⚙️",
  },
  custom: {
    text: "System Notice",
    icon: "ℹ️",
  },
};

/**
 * Creates a system message for display in the chat
 */
export function createSystemMessage(
  type: SystemMessageType,
  customText?: string
): ChatMessage {
  const config = SYSTEM_MESSAGE_CONFIGS[type];
  const text = customText ?? config.text;
  const displayText = config.icon ? `${config.icon} ${text}` : text;

  return {
    id: generateUUID(),
    role: "system",
    parts: [
      {
        type: "text",
        text: displayText,
      },
    ],
    metadata: {
      createdAt: new Date().toISOString(),
      systemMessageType: type,
    },
  } as ChatMessage;
}

/**
 * Checks if a message is a system message
 */
export function isSystemMessage(message: ChatMessage): boolean {
  return message.role === "system";
}

/**
 * Checks if a system message of a specific type exists in the messages array
 */
export function hasSystemMessage(
  messages: ChatMessage[],
  type?: SystemMessageType
): boolean {
  return messages.some((msg) => {
    if (msg.role !== "system") return false;
    if (!type) return true;
    
    const metadata = msg.metadata as { systemMessageType?: SystemMessageType } | undefined;
    return metadata?.systemMessageType === type;
  });
}

