import { trimTrailingSlashes } from "@workspace/vnccs/http";
import {
  Bot,
  Copy,
  Images,
  type LucideIcon,
  Settings,
  Shirt,
  Smile,
  Truck,
  UserPlus,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";

/** The app's router link (Next `Link` with prefetch off on desktop) or a plain anchor. */
export type LinkComponent =
  | ComponentType<{
      children: ReactNode;
      className?: string;
      href: string;
      onClick?: () => void;
    }>
  | "a";

export interface NavItem {
  description: string;
  href: string;
  icon: LucideIcon;
  title: string;
}

export interface NavGroup {
  items: NavItem[];
  label: string;
}

export const navigation: NavGroup[] = [
  {
    label: "Setup",
    items: [
      {
        title: "Control Center",
        href: "/control-center",
        icon: Bot,
        description: "Models, LoRAs and dependencies",
      },
    ],
  },
  {
    label: "Character",
    items: [
      {
        title: "Create",
        href: "/create",
        icon: UserPlus,
        description: "Step 1: design a character and generate sheets",
      },
      {
        title: "Clone",
        href: "/clone",
        icon: Copy,
        description: "Step 1.1: rebuild a character from images",
      },
      {
        title: "Clothes",
        href: "/clothes",
        icon: Shirt,
        description: "Step 2: costumes",
      },
      {
        title: "Emotions",
        href: "/emotions",
        icon: Smile,
        description: "Step 3: expressions",
      },
    ],
  },
  {
    label: "Library",
    items: [
      {
        title: "Sprites",
        href: "/sprites",
        icon: Images,
        description: "Browse and export sprites",
      },
      {
        title: "Migration",
        href: "/migration",
        icon: Truck,
        description: "Upgrade characters from older VNCCS versions",
      },
    ],
  },
];

export const settingsItem: NavItem = {
  title: "Settings",
  href: "/settings",
  icon: Settings,
  description: "Runtime and connection",
};

/** Route path without the trailing slash the static export adds. */
export function normalizePath(pathname: string): string {
  return trimTrailingSlashes(pathname) || "/";
}

export function findNavItem(pathname: string): NavItem | undefined {
  const path = normalizePath(pathname);
  return [...navigation.flatMap((group) => group.items), settingsItem].find(
    (item) => item.href === path
  );
}
