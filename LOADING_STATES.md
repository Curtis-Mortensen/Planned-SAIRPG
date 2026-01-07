# Loading States Implementation

This document describes the loading states implementation for the SAIRPG application.

## Overview

The application now implements comprehensive loading states using React Suspense boundaries and skeleton components. This provides users with immediate visual feedback while pages and components are loading, improving perceived performance.

## Implementation Details

### 1. Loading Skeleton Components

Created a centralized `components/loading-skeletons.tsx` file containing reusable skeleton components:

- **LandingPageSkeleton**: For the marketing/landing page
- **ChatPageSkeleton**: For chat and play pages with messages
- **SettingsPageSkeleton**: For settings pages with tabs and forms
- **EditorPageSkeleton**: For the world editor with graph visualization
- **PromptsPageSkeleton**: For the prompts management page
- **AppShellSkeleton**: Generic skeleton with sidebar for app pages

### 2. Next.js Loading UI

Added `loading.tsx` files to key routes for automatic loading states:

- `app/(chat)/loading.tsx` - Chat list page loading
- `app/(chat)/chat/[id]/loading.tsx` - Individual chat loading
- `app/play/[id]/loading.tsx` - Game session loading
- `app/settings/loading.tsx` - Settings page loading
- `app/editor/loading.tsx` - Editor page loading
- `app/prompts/loading.tsx` - Prompts page loading

### 3. Staged Loading for Landing Page

The landing page (`app/page.tsx`) now loads in stages:

1. **Hero Section** - Loads immediately (synchronous)
2. **Features Section** - Loads with skeleton fallback
3. **Architecture Section** - Loads with skeleton fallback
4. **CTA Section** - Loads with skeleton fallback

Each section is wrapped in a `Suspense` boundary with an appropriate skeleton fallback, allowing users to see and interact with content progressively.

### 4. Improved Layout Suspense Boundaries

Updated all layout files to use rich skeleton components instead of empty divs:

- `app/(chat)/layout.tsx`
- `app/play/layout.tsx`
- `app/settings/layout.tsx`
- `app/editor/layout.tsx`
- `app/prompts/layout.tsx`

Changed from:
```tsx
<Suspense fallback={<div className="flex h-dvh" />}>
```

To:
```tsx
<Suspense fallback={<AppShellSkeleton />}>
```

### 5. Page-Level Suspense Improvements

Updated page components to use specific loading skeletons:

- `app/(chat)/page.tsx` - Uses `ChatPageSkeleton`
- `app/(chat)/chat/[id]/page.tsx` - Uses `ChatPageSkeleton`
- `app/play/[id]/page.tsx` - Uses `ChatPageSkeleton`

## Benefits

1. **Improved Perceived Performance**: Users see content structure immediately instead of blank screens
2. **Progressive Enhancement**: Content loads in stages, allowing users to interact with loaded sections
3. **Consistent UX**: All pages have consistent loading patterns using skeleton components
4. **Better Mobile Experience**: Faster initial render on slower connections
5. **SEO Friendly**: Next.js can optimize loading states for better Core Web Vitals

## Usage

The loading states are automatic - no additional code is needed when navigating between pages. The Next.js router and Suspense boundaries handle showing the appropriate loading UI automatically.

## Testing

To test the loading states:

1. Start the development server: `pnpm dev`
2. Navigate to different pages and observe the loading skeletons
3. Use browser DevTools to throttle network speed (Slow 3G) to see loading states more clearly
4. Observe how the landing page loads progressively from top to bottom

## Future Enhancements

Potential improvements for loading states:

- Add skeleton animations (pulse, shimmer effects)
- Implement streaming SSR for faster initial loads
- Add optimistic UI updates for user actions
- Create loading states for specific components (sidebar, chat messages, etc.)
- Add loading progress indicators for long operations
