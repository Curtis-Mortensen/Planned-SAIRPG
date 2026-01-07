Here's your updated docker-compose.yml:
Summary of fixes:
Added the dev command via entrypoint - The Inngest image needs explicit instruction to run inngest dev to start the dev server
Added -u flag - Points Inngest to your app's API endpoint (http://host.docker.internal:3000/api/inngest) so it can discover your functions when your Next.js app is running
Added restart: unless-stopped - Container will restart on failures
Removed deprecated version attribute - Cleans up the warning
You can now access the Inngest dashboard at http://localhost:8288. When you run your Next.js app (pnpm dev), Inngest will automatically discover your functions at /api/inngest.

Yay Opus. 