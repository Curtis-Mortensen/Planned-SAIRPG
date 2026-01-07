import type { UseChatHelpers } from "@ai-sdk/react";
import equal from "fast-deep-equal";
import { ArrowDownIcon } from "lucide-react";
import { memo } from "react";
import { useMessages } from "@/hooks/use-messages";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { useDataStream } from "./data-stream-provider";
import { Greeting } from "./greeting";
import { PreviewMessage, ThinkingMessage } from "./message";
import { SuggestedActions } from "./suggested-actions";
import type { VisibilityType } from "./visibility-selector";

type MessagesProps = {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  chatId: string;
  status: UseChatHelpers<ChatMessage>["status"];
  votes: Vote[] | undefined;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  isReadonly: boolean;
  isArtifactVisible: boolean;
  selectedModelId: string;
  selectedVisibilityType?: VisibilityType;
};

function PureMessages({
  addToolApprovalResponse,
  chatId,
  status,
  votes,
  messages,
  setMessages,
  regenerate,
  sendMessage,
  isReadonly,
  selectedModelId: _selectedModelId,
  selectedVisibilityType = "private",
}: MessagesProps) {
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    isAtBottom,
    scrollToBottom,
    hasSentMessage,
  } = useMessages({
    status,
  });

  useDataStream();

  return (
    <div className="relative flex-1">
      <div
        className="absolute inset-0 touch-pan-y overflow-y-auto"
        ref={messagesContainerRef}
      >
        <div className="mx-auto flex min-w-0 max-w-4xl flex-col gap-4 px-2 py-4 md:gap-6 md:px-4">
          {messages.length === 0 && <Greeting />}

          {messages.map((message, index) => {
            const isLastMessage = index === messages.length - 1;
            // Check if this is the opening scene: first assistant message and no user messages yet
            // Note: there may be system messages before the opening scene (e.g., lore loaded)
            const isFirstAssistantMessage = 
              message.role === "assistant" && 
              messages.findIndex((msg) => msg.role === "assistant") === index;
            const isOpeningScene = 
              isFirstAssistantMessage && 
              !messages.some((msg) => msg.role === "user");

            return (
              <div key={message.id}>
                <PreviewMessage
                  addToolApprovalResponse={addToolApprovalResponse}
                  chatId={chatId}
                  isLoading={
                    status === "streaming" && isLastMessage
                  }
                  isReadonly={isReadonly}
                  message={message}
                  regenerate={regenerate}
                  requiresScrollPadding={
                    hasSentMessage && isLastMessage
                  }
                  setMessages={setMessages}
                  vote={
                    votes
                      ? votes.find((vote) => vote.messageId === message.id)
                      : undefined
                  }
                />
                {isOpeningScene && !isReadonly && (
                  <div className="px-2 md:px-4">
                    <SuggestedActions
                      chatId={chatId}
                      selectedVisibilityType={selectedVisibilityType}
                      sendMessage={sendMessage}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {status === "submitted" &&
            !messages.some((msg) =>
              msg.parts?.some(
                (part) => "state" in part && part.state === "approval-responded"
              )
            ) && <ThinkingMessage />}

          <div
            className="min-h-[24px] min-w-[24px] shrink-0"
            ref={messagesEndRef}
          />
        </div>
      </div>

      <button
        aria-label="Scroll to bottom"
        className={`-translate-x-1/2 absolute bottom-4 left-1/2 z-10 rounded-full border bg-background p-2 shadow-lg transition-all hover:bg-muted ${
          isAtBottom
            ? "pointer-events-none scale-0 opacity-0"
            : "pointer-events-auto scale-100 opacity-100"
        }`}
        onClick={() => scrollToBottom("smooth")}
        type="button"
      >
        <ArrowDownIcon className="size-4" />
      </button>
    </div>
  );
}

export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (prevProps.isArtifactVisible && nextProps.isArtifactVisible) {
    return true;
  }

  if (prevProps.status !== nextProps.status) {
    return false;
  }
  if (prevProps.selectedModelId !== nextProps.selectedModelId) {
    return false;
  }
  if (prevProps.messages.length !== nextProps.messages.length) {
    return false;
  }
  if (!equal(prevProps.messages, nextProps.messages)) {
    return false;
  }
  if (!equal(prevProps.votes, nextProps.votes)) {
    return false;
  }

  return false;
});
