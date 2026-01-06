import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { generateUUID } from "@/lib/utils";

export default async function PlayPage() {
  const cookieStore = await cookies();
  const lastPlayId = cookieStore.get("last-play-id");

  // If user has a previous play session, try to resume it
  if (lastPlayId?.value) {
    redirect(`/play/${lastPlayId.value}`);
  }

  // Otherwise, start a new game
  const id = generateUUID();
  redirect(`/play/${id}`);
}

