# Architecture







The Chat SDK is powered by several open source libraries to support the different functionalities of the chatbot application like authentication, persistence, text generation, etc. The following is a brief overview of the architecture.

<img alt="Simplified Architecture" src={__img0} placeholder="blur" />

## Application Framework

The Chat SDK is built to run fast on the web, so it is powered by [Next.js](http://next.org). It uses the [App Router](https://nextjs.org/docs/app) with two main route segments – `(chat)/` and `(auth)/`. The api endpoints are located in the `api/` folder of each route segment as [route handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) which gets converted into serverless functions upon deployment.

## Model Providers

The primary user experience of the chatbot application is to simulate a conversation with a model that exhibits near [general intelligence](https://en.wikipedia.org/wiki/Artificial_general_intelligence) and can respond to user queries to help accomplish a task. The Chat SDK uses the [AI SDK](https://ai-sdk.dev) to connect to these models deployed by [various providers](https://ai-sdk.dev/providers/ai-sdk-providers).

Language Models are the most primitive types of models used in the application. It is used for generating [text](https://ai-sdk.dev/docs/ai-sdk-core/generating-text) and [structured data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data). The AI SDK ships with many features that you can use to amplify your usage of these models like [Tool Use](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage), [Retrieval Augmented Generation](https://ai-sdk.dev/cookbook/node/retrieval-augmented-generation), [Reasoning](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot#reasoning), etc. Image Models and Embedding Models are the other types of models that can be used in the application, like for image generation and document retrieval, respectively.

One of the main advantages of using the AI SDK is that it allows you to be specific with the kind of model and provider you'd like to use in a specific part of the application. You can learn more about it in the [Models and Providers](/docs/concepts/models-and-providers) section.

## Authentication

The Chat SDK uses [Auth.js](https://authjs.dev) for authentication. The Chat SDK requires authentication by default to start new chats and also save them in history.

## Persistence

Persistence is the ability to save and restore data from a database. The Chat SDK uses PostgreSQL as its database to store things like chat history, user accounts, application-wide administrative settings, etc. In order to communicate with the database from route handlers and server actions, the Chat SDK uses [Drizzle ORM](https://orm.drizzle.team) to connect to the database and run [queries](https://github.com/vercel/ai-chatbot/blob/main/lib/db/queries.ts).

Since Drizzle ORM supports multiple [database providers](https://orm.drizzle.team/docs/get-started) like [Neon](https://orm.drizzle.team/docs/get-started/neon-new) and [Supabase](https://orm.drizzle.team/docs/get-started/supabase-new), it makes it possible for you to swap between databases of your choice without having to modify your queries or schema.

## Blob Storage

Blob storage allows your chatbot application to support file uploads to and retrievals from an object store. The Chat SDK uses [Vercel Blob](https://vercel.com/docs/vercel-blob) to support sending files as attachments in a chat conversation. It can also be used for storing static assets that serve different purposes like uploading an avatar for a user's profile page.

## Firewall and Rate Limiting

The API endpoints that the Chat SDK uses have a higher runtime duration and process expensive model tokens (depending on the model). So, any abuse or bot attacks on these endpoints can rack up significant costs quickly. As a result, it is recommended to enable the Vercel Firewall and add rate limiting rules to endpoints like `/api/chat`.

Alternatively, you can use also use a key value store to track requests and define thresholds to limit usage, you can read more about it [here](https://ai-sdk.dev/docs/advanced/rate-limiting#rate-limiting).

## Testing

The Chat SDK uses playwright to run E2E tests to simulate the possible user flows in the application and identify any breaking changes as you customize the application. The Chat SDK ships with a few test cases for the most important user flows and we're constantly working on improving the coverage. You can learn more about adding a new test case in the [Testing](/docs/concepts/testing) section.

## A Closer Look at the Chatbot

<img alt="Complex Architecture" src={__img1} placeholder="blur" />

**1. Initial Navigation to Home Page:**

* When the user first navigates to the home page and goes through Next.js middleware.
* The middleware checks session status:
  * If no session is found, the user is redirected to `/login`, authenticating the user with email and password via the `/api/auth` endpoint.
  * If a session is available, the user reaches the chat interface with their history restored in the sidebar.

**2. Sending a Message:**

* User composes and submits a message within the chat interface.
* Optionally, the user can attach files, which uploads via `/api/files/upload`, storing the file in Vercel Blob storage. Attachments become accessible through secure URLs returned by Vercel Blob.
* Upon submission, the `append` function from the `useChat` hook triggers the `/api/chat` endpoint
* After passing the Vercel firewall and its rate limit rules, the message payload is sent to `/api/chat`.

**3. Processing and Model Interaction:**

* The request to `/api/chat` routes to a custom model provider, which specifies which models to use for specific parts of the applcation. In this instance, there is one model for title generation and another for chat completion.
* Using the AI SDK's `streamText` function, the chat model is then prompted with the submitted `messages` and returns the response as a [data stream](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol#data-stream-protocol).
* The `useChat` hook on the client reads the data stream and constructs the response to be rendered as assistant messages to the user.
* The response messages, now visible to the user, appears within the chat interface.

**4. Persisting Response Messages:**

* After the stream has finished, the `onFinish` callback is triggered and saves the response messages to the database.

**5. User Interaction with Message:**

* The user can then interact with any of the messages present in the history, performing actions like voting and editing.

# Resumable Streams



The `useChat` hook has experimental support for resuming an ongoing chat generation stream by any client, either after a network disconnect or by reloading the chat page. This can be useful for building applications that involve long-running conversations or for ensuring that messages are not lost in case of network failures.

The following are the pre-requisities for your chat application to support resumable streams:

* Installing the [`resumable-stream`](https://www.npmjs.com/package/resumable-stream) package that helps create and manage the publisher/subscriber mechanism of the streams.
* Creating a [Redis](https://vercel.com/marketplace/redis) instance to store the stream state and setting either `REDIS_URL` or `KV_URL`.
* Creating a table that tracks the stream IDs associated with a chat.

To resume a chat stream, you will use the experimental\_resume function returned by the useChat hook. You will call this function during the initial mount of the hook inside the main chat component.

```tsx title="components/chat.tsx"
'use client'

import { useChat } from "@ai-sdk/react";
import { Input } from "@/components/input";
import { Messages } from "@/components/messages";

export function Chat() {
  const { experimental_resume } = useChat({id});

  useEffect(() => {
    experimental_resume();

    // we use an empty dependency array to
    // ensure this effect runs only once
  }, [])

  return (
    <div>
      <Messages>
      <Input/>
    </div>
  )
}
```

The experimental\_resume function makes a `GET` request to your configured chat endpoint (or `/api/chat` by default) whenever your client calls it. If there’s an active stream, it will pick up where it left off, otherwise it simply finishes without error.

The `GET` request automatically appends the chatId query parameter to the URL to help identify the chat the request belongs to. Using the `chatId`, you can look up the most recent stream ID from the database and resume the stream.

# Testing



Testing your Chat SDK application involves two key components:

* **E2E Tests**: End-to-end tests simulate the full lifecycle of the application, from user interactions to server responses.
* **Mock Models**: Mock language models simulate responses based on different prompts.

## End-to-End Testing With Playwright

Chat SDK ships with [Playwright](https://playwright.dev) for end-to-end testing. Playwright is a powerful tool for automating web browsers and testing web applications, so it's a great choice for testing your Chat SDK application as well. Playwright also provides a simple API for writing tests, and it supports multiple browsers, including Chrome, Firefox, and WebKit.

Your project already comes with a set of tests that check the basic functionality of the Chat SDK. These tests can be found in the `tests` directory of your project.

Along with these tests, there are also a few helper classes that you can use to make your tests more readable and maintainable. These classes provide a set of common actions that you can use to interact with the Chat SDK application, such as logging in, creating a new chat, and sending a message. These helper classes are located in the `tests/pages` directory of your project.

### Writing a Test

The following is an example of a test that uses the helper classes to create a new chat and send a message.

```ts title="tests/chat.test.ts"
import { ChatPage } from './pages/chat';
import { test, expect } from '@playwright/test';

test.describe('chat activity', () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    chatPage = new ChatPage(page);
    await chatPage.createNewChat();
  });

  test('send a user message and receive response', async () => {
    await chatPage.sendUserMessage('Why is grass green?');
    await chatPage.isGenerationComplete();

    const assistantMessage = await chatPage.getRecentAssistantMessage();
    expect(assistantMessage.content).toContain("It's just green duh!");
  });
});
```

### Creating Mock Models

Testing language models can be challenging, because they are non-deterministic and calling them is slow and expensive.

Chat SDK uses a test provider with mock models to simulate the behavior of the different language models. These models are defined in `lib/ai/models.test.ts`.

```ts title="lib/ai/models.test.ts"
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV1 } from 'ai/test';
import { getResponseChunksByPrompt } from '@/tests/prompts/utils';

export const chatModel = new MockLanguageModelV1({
  doStream: async ({ prompt }) => ({
    stream: simulateReadableStream({
      chunkDelayInMs: 50,
      initialDelayInMs: 100,
      chunks: getResponseChunksByPrompt(prompt),
    }),
    rawCall: { rawPrompt: null, rawSettings: {} },
  }),
});
```

You also have the ability to define the response outputs based on the input prompt. This allows you to test different capabilities like tool calling, artifacts, reasoning, etc. You can define the response outputs in `tests/prompts/utils.ts`.

```ts title="tests/prompts/utils.ts"
if (compareMessages(recentMessage, TEST_PROMPTS.USER_SKY)) {
  return [
    ...reasoningToDeltas('The sky is blue because of rayleigh scattering!'),
    ...textToDeltas("It's just blue duh!"),
    {
      type: 'finish',
      finishReason: 'stop',
      logprobs: undefined,
      usage: { completionTokens: 10, promptTokens: 3 },
    },
  ];
}
```

# Theming



Chat SDK uses [Tailwind](https://tailwindcss.com) for styling and [shadcn/ui](https://ui.shadcn.com) for components. Since most of the components used in the Chat SDK like buttons and inputs are built using shadcn/ui primitives, you can collectively customize the appearance of the components to follow the theme of your application by modifying the CSS variables in `app/global.css`.

## Convention

You can use a simple `background` and `foreground` convention for colors. The `background` variable is used for the background color of the component and the `foreground` variable is used for the text color.

<Callout className="mt-4 shadow-none bg-background" type="info">
  The `background` suffix is omitted when the variable is used for the background color of the component.
</Callout>

Given the following CSS variables:

```css
--primary: 240 5.9% 10%;
--primary-foreground: 0 0% 98%;
```

The `background` color of the following component will be `var(--primary)` and the `foreground` color will be `var(--primary-foreground)`.

```tsx
<div className="bg-primary text-primary-foreground">Hello</div>
```

## List of variables

Here's the list of variables available for customization:

```css title="app/globals.css"
@layer base {
    :root {
        --background: 0 0% 100%;
        --foreground: 240 10% 3.9%;
        --card: 0 0% 100%;
        --card-foreground: 240 10% 3.9%;
        --popover: 0 0% 100%;
        --popover-foreground: 240 10% 3.9%;
        --primary: 240 5.9% 10%;
        --primary-foreground: 0 0% 98%;
        --secondary: 240 4.8% 95.9%;
        --secondary-foreground: 240 5.9% 10%;
        --muted: 240 4.8% 95.9%;
        --muted-foreground: 240 3.8% 46.1%;
        --accent: 240 4.8% 95.9%;
        --accent-foreground: 240 5.9% 10%;
        --destructive: 0 84.2% 60.2%;
        --destructive-foreground: 0 0% 98%;
        --border: 240 5.9% 90%;
        --input: 240 5.9% 90%;
        --ring: 240 10% 3.9%;
        --chart-1: 12 76% 61%;
        --chart-2: 173 58% 39%;
        --chart-3: 197 37% 24%;
        --chart-4: 43 74% 66%;
        --chart-5: 27 87% 67%;
        --radius: 0.5rem;
        --sidebar-background: 0 0% 98%;
        --sidebar-foreground: 240 5.3% 26.1%;
        --sidebar-primary: 240 5.9% 10%;
        --sidebar-primary-foreground: 0 0% 98%;
        --sidebar-accent: 240 4.8% 95.9%;
        --sidebar-accent-foreground: 240 5.9% 10%;
        --sidebar-border: 220 13% 91%;
        --sidebar-ring: 217.2 91.2% 59.8%;
    }
    .dark {
        --background: 240 10% 3.9%;
        --foreground: 0 0% 98%;
        --card: 240 10% 3.9%;
        --card-foreground: 0 0% 98%;
        --popover: 240 10% 3.9%;
        --popover-foreground: 0 0% 98%;
        --primary: 0 0% 98%;
        --primary-foreground: 240 5.9% 10%;
        --secondary: 240 3.7% 15.9%;
        --secondary-foreground: 0 0% 98%;
        --muted: 240 3.7% 15.9%;
        --muted-foreground: 240 5% 64.9%;
        --accent: 240 3.7% 15.9%;
        --accent-foreground: 0 0% 98%;
        --destructive: 0 62.8% 30.6%;
        --destructive-foreground: 0 0% 98%;
        --border: 240 3.7% 15.9%;
        --input: 240 3.7% 15.9%;
        --ring: 240 4.9% 83.9%;
        --chart-1: 220 70% 50%;
        --chart-2: 160 60% 45%;
        --chart-3: 30 80% 55%;
        --chart-4: 280 65% 60%;
        --chart-5: 340 75% 55%;
        --sidebar-background: 240 5.9% 10%;
        --sidebar-foreground: 240 4.8% 95.9%;
        --sidebar-primary: 224.3 76.3% 48%;
        --sidebar-primary-foreground: 0 0% 100%;
        --sidebar-accent: 240 3.7% 15.9%;
        --sidebar-accent-foreground: 240 4.8% 95.9%;
        --sidebar-border: 240 3.7% 15.9%;
        --sidebar-ring: 217.2 91.2% 59.8%;
    }
}
```

# Migrating to Message Parts



The release of [`@ai-sdk/react@1.1.10`](https://github.com/vercel/ai/pull/4670) introduced a new property called `parts` to messages in the `useChat` hook. We recommend rendering the messages using the `parts` property instead of the `content` property. The parts property supports different message types, including text, tool invocation, and tool result, and allows for more flexible and complex chat and agent-like user interfaces.

You can read the API reference for the `parts` property [here](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat#messages.ui-message.parts).

## Migrating your existing project to use the `parts` property

Your existing project must already have messages stored in the database. To migrate your messages to use `parts`, you will have to create new tables for `Message` and `Vote`, backfill the new tables with transformed messages, and delete (optional) the old tables.

These are the following steps:

1. Create tables `Message_v2` and `Vote_v2` with updated schemas at `/lib/db/schema.ts`
2. Update the `Message` component at `/components/message.tsx` to use parts and render content.
3. Run migration script at `src/lib/db/helpers/01-migrate-to-parts.ts`

***

### 1. Creating Tables with Updated Schemas

You will mark the earlier tables as deprecated and create two new tables, `Message_v2` and `Vote_v2`. Table `Message_v2` contains the updated schema that includes the `parts` property. Table `Vote_v2` does not contain schema changes but will contain votes that point to the transformed messages in `Message_v2`.

Before creating the new tables, you will need to update the variables of existing tables to indicate that they are deprecated.

```tsx title="/lib/db/schema.ts"
export const messageDeprecated = pgTable("Message", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  content: json("content").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type MessageDeprecated = InferSelectModel<typeof messageDeprecated>;

export const voteDeprecated = pgTable(
  "Vote",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => messageDeprecated.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  },
);

export type VoteDeprecated = InferSelectModel<typeof voteDeprecated>;
```

After deprecating the current table schemas, you can now proceed to create schemas for the new tables.

```ts title="/lib/db/schema.ts"
export const message = pgTable("Message_v2", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  parts: json("parts").notNull(),
  attachments: json("attachments").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type Message = InferSelectModel<typeof message>;

export const vote = pgTable(
  "Vote_v2",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  },
);

export type Vote = InferSelectModel<typeof vote>;
```

### 2. Updating the Message Component

Previously you were using content types to render messages and tool invocations. Now you will use the `parts` property to render messages and tool invocations.

```tsx title="components/message.tsx"
{message.parts?.map((part, index) => {
  const { type } = part;
  const key = `message-${message.id}-part-${index}`;

  if (type === "reasoning") {
    return (
      <MessageReasoning
        key={key}
        isLoading={isLoading}
        reasoning={part.reasoning}
      />
    );
  }

  if (type === "text") {
    if (mode === "view") {
      return (
        <div key={key} className="flex flex-row gap-2 items-start">
          {message.role === "user" && !isReadonly && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  data-testid="message-edit-button"
                  variant="ghost"
                  className="px-2 h-fit rounded-full text-muted-foreground opacity-0 group-hover/message:opacity-100"
                  onClick={() => {
                    setMode("edit");
                  }}
                >
                  <PencilEditIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit message</TooltipContent>
            </Tooltip>
          )}

          <div
            data-testid="message-content"
            className={cn("flex flex-col gap-4", {
              "bg-primary text-primary-foreground px-3 py-2 rounded-xl":
                message.role === "user",
            })}
          >
            <Markdown>{part.text}</Markdown>
          </div>
        </div>
      );
    }

    if (mode === "edit") {
      return (
        <div key={key} className="flex flex-row gap-2 items-start">
          <div className="size-8" />

          <MessageEditor
            key={message.id}
            message={message}
            setMode={setMode}
            setMessages={setMessages}
            reload={reload}
          />
        </div>
      );
    }
  }

  if (type === "tool-invocation") {
    const { toolInvocation } = part;
    const { toolName, toolCallId, state } = toolInvocation;

    if (state === "call") {
      const { args } = toolInvocation;

      return (
        <div
          key={toolCallId}
          className={cx({
            skeleton: ["getWeather"].includes(toolName),
          })}
        >
          {toolName === "getWeather" ? (
            <Weather />
          ) : toolName === "createDocument" ? (
            <DocumentPreview isReadonly={isReadonly} args={args} />
          ) : toolName === "updateDocument" ? (
            <DocumentToolCall
              type="update"
              args={args}
              isReadonly={isReadonly}
            />
          ) : toolName === "requestSuggestions" ? (
            <DocumentToolCall
              type="request-suggestions"
              args={args}
              isReadonly={isReadonly}
            />
          ) : null}
        </div>
      );
    }

    if (state === "result") {
      const { result } = toolInvocation;

      return (
        <div key={toolCallId}>
          {toolName === "getWeather" ? (
            <Weather weatherAtLocation={result} />
          ) : toolName === "createDocument" ? (
            <DocumentPreview
              isReadonly={isReadonly}
              result={result}
            />
          ) : toolName === "updateDocument" ? (
            <DocumentToolResult
              type="update"
              result={result}
              isReadonly={isReadonly}
            />
          ) : toolName === "requestSuggestions" ? (
            <DocumentToolResult
              type="request-suggestions"
              result={result}
              isReadonly={isReadonly}
            />
          ) : (
            <pre>{JSON.stringify(result, null, 2)}</pre>
          )}
        </div>
      );
    }
  }
})}
```

### 3. Running the Migration Script

At this point, you can deploy your application so new messages can be stored in the new format.

To restore messages of previous chat conversations, you can run the following script that applies a transformation to the old messages and stores them in the new format.

```zsh title="shell"
pnpm exec tsx lib/db/helpers/01-core-to-parts.ts
```

This script will take some time to complete based on the number of messages to be migrated. After completion, you can verify that the messages have been successfully migrated by checking the database.
