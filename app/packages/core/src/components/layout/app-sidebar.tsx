"use client";

import {
  type LinkComponent,
  type NavItem,
  navigation,
  normalizePath,
  settingsItem,
} from "@workspace/core/config/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar";
import { Sparkles } from "lucide-react";

interface AppSidebarProps {
  LinkComponent: LinkComponent;
  pathname: string;
}

function isActive(pathname: string, href: string): boolean {
  const path = normalizePath(pathname);
  return path === href || path.startsWith(`${href}/`);
}

function NavLink({
  item,
  LinkComponent: Link,
  pathname,
}: AppSidebarProps & { item: NavItem }) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild={true}
        isActive={isActive(pathname, item.href)}
        tooltip={item.title}
      >
        <Link href={item.href}>
          <Icon />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar({ LinkComponent, pathname }: AppSidebarProps) {
  const Link = LinkComponent;
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild={true} size="lg">
              <Link href="/control-center">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Sparkles className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">VNCCS Studio</span>
                  <span className="truncate text-muted-foreground text-xs">
                    Visual novel character creation
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {navigation.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <NavLink
                    item={item}
                    key={item.href}
                    LinkComponent={LinkComponent}
                    pathname={pathname}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <NavLink
            item={settingsItem}
            LinkComponent={LinkComponent}
            pathname={pathname}
          />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
