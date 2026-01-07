"use client";

import { useRouter } from "next/navigation";
import { Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NewGameButtonProps {
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
}

export function NewGameButton({ className, size = "lg" }: NewGameButtonProps) {
  const router = useRouter();

  const handleNewGame = () => {
    // Clear cached input for fresh start
    localStorage.removeItem("input");
    // Clear last-play-id cookie
    document.cookie = "last-play-id=; path=/; max-age=0";
    router.push("/play?new=true");
  };

  return (
    <Button className={className} onClick={handleNewGame} size={size}>
      <Gamepad2 className="mr-2 size-5" />
      Start a New Game
    </Button>
  );
}

