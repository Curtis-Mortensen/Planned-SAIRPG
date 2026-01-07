import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { generateUUID } from "@/lib/utils";

interface PlayPageProps {
  searchParams: Promise<{ new?: string }>;
}

export default async function PlayPage({ searchParams }: PlayPageProps) {
  const params = await searchParams;
  const forceNew = params.new === "true";
  
  const cookieStore = await cookies();
  const lastPlayId = cookieStore.get("last-play-id");

  // If user has a previous play session and not forcing new, try to resume it
  if (lastPlayId?.value && !forceNew) {
    redirect(`/play/${lastPlayId.value}`);
  }

  // Otherwise, start a new game
  const id = generateUUID();
  redirect(`/play/${id}`);
}

