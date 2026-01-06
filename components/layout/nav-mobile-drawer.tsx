"use client";

import { Menu, MessageSquare, Settings2, ScrollText, Sliders } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navigationItems = [
  {
    icon: MessageSquare,
    label: "Play",
    route: "/play",
    testId: "nav-play",
  },
  {
    icon: Settings2,
    label: "World Editor",
    route: "/editor",
    testId: "nav-editor",
  },
  {
    icon: ScrollText,
    label: "Event Log",
    route: "/log",
    testId: "nav-log",
  },
  {
    icon: Sliders,
    label: "Prompts",
    route: "/prompts",
    testId: "nav-prompts",
  },
] as const;

export function NavMobileDrawer() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger asChild>
        <Button
          className="md:hidden"
          data-testid="mobile-menu-trigger"
          size="icon"
          type="button"
          variant="ghost"
        >
          <Menu />
          <span className="sr-only">Toggle navigation menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        className="w-[240px] sm:w-[300px]"
        data-testid="mobile-drawer"
        side="left"
      >
        <SheetHeader>
          <SheetTitle>SAIRPG</SheetTitle>
        </SheetHeader>
        <nav className="mt-6">
          <ul className="flex flex-col gap-1">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.route ||
                pathname.startsWith(`${item.route}/`);

              return (
                <li key={item.route}>
                  <Link
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      isActive &&
                        "bg-accent text-accent-foreground font-semibold"
                    )}
                    data-testid={item.testId}
                    href={item.route}
                    onClick={() => setOpen(false)}
                  >
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

