"use client";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
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
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { HomeIcon } from "@/components/heroicons";
import { Squares2x2Icon } from "@/components/heroicons";
import { ClipboardDocumentIcon } from "@/components/heroicons";
import { SparklesIcon } from "@/components/heroicons";
import { UserIcon } from "@/components/heroicons";
import { DocumentDuplicateIcon } from "@/components/heroicons";
import { ArrowRightOnRectangleIcon } from "@/components/heroicons";
import { useAuth } from "@/lib/hooks/useAuth";

const items = [
  {
    href: "/home",
    label: "Home",
    icon: HomeIcon,
    match: ["/home"],
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: Squares2x2Icon,
    match: ["/dashboard"],
  },
  {
    href: "/insights",
    label: "Insights",
    icon: ClipboardDocumentIcon,
    match: ["/insights"],
  },
  {
    href: "/templates",
    label: "Templates",
    icon: DocumentDuplicateIcon,
    match: ["/templates"],
  },
  {
    href: "/insights/new",
    label: "Create Insight",
    icon: SparklesIcon,
    match: ["/insights/new", "/analysis", "/analysis/schema"],
  },
];

export function SideNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { state, toggleSidebar } = useSidebar();
  const { user, isAdmin } = useAuth();

  const displayName = user?.name || user?.username || "Account";

  const handleLogout = () => signOut({ callbackUrl: "/login" });

  const handleSidebarClick = (e: React.MouseEvent) => {
    // Only expand if collapsed and not clicking on a link or trigger
    const target = e.target as HTMLElement;
    if (
      state === "collapsed" &&
      !target.closest("a") &&
      !target.closest('[data-sidebar="trigger"]')
    ) {
      toggleSidebar();
    }
  };

  return (
    <Sidebar
      collapsible="icon"
      variant="sidebar"
      side="left"
      style={{
        // Expanded panel and icon rail
        // @ts-ignore - CSS var on React style
        "--sidebar-width": "10rem",
        // @ts-ignore
        "--sidebar-width-icon": "2.75rem",
      }}
    >
      <SidebarRail />
      <SidebarHeader
        className="px-2 py-2"
        onClick={handleSidebarClick}
        style={{
          cursor: state === "collapsed" ? "e-resize" : "default",
        }}
      >
        <div className="flex items-center gap-2">
          {state === "expanded" && (
            <>
              <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center">
                <svg
                  className="w-3.5 h-3.5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <span className="text-sm font-semibold text-slate-900">
                InsightGen
              </span>
            </>
          )}
          <SidebarTrigger
            className={`h-12 w-12 p-1 ${
              state === "collapsed" ? "mx-auto" : "ml-auto"
            }`}
          />
        </div>
      </SidebarHeader>
      <SidebarContent
        onClick={handleSidebarClick}
        style={{
          cursor: state === "collapsed" ? "e-resize" : "default",
        }}
      >
        <SidebarGroup>
          {/* Group label hidden to reduce visual noise */}
          <SidebarGroupLabel className="sr-only">Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((it) => {
                const Icon = it.icon as any;
                const active = it.match.some(
                  (prefix: string) =>
                    pathname === prefix || pathname.startsWith(`${prefix}/`)
                );
                return (
                  <SidebarMenuItem key={it.href}>
                    <Link href={it.href} className="block w-full">
                      <SidebarMenuButton isActive={active} tooltip={it.label}>
                        <Icon className="w-4 h-4" />
                        <span>{it.label}</span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton
                      isActive={pathname === "/profile"}
                      tooltip={displayName}
                      className="justify-start"
                    >
                      <UserIcon className="w-4 h-4" />
                      {state === "expanded" && (
                        <div className="ml-2 flex-1 min-w-0">
                          <span className="text-sm font-medium text-slate-900 block truncate max-w-[120px]">
                            {displayName}
                          </span>
                        </div>
                      )}
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    side="right"
                    className="w-48"
                  >
                    <DropdownMenuLabel>{displayName}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => router.push("/profile")}>
                      Profile
                    </DropdownMenuItem>
                    {isAdmin && (
                      <>
                        <DropdownMenuItem
                          onClick={() => router.push("/admin/users")}
                        >
                          User Management
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => router.push("/admin/customers")}
                        >
                          Customers Setup
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push("/admin")}>
                          AI Providers
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout}>
                      <ArrowRightOnRectangleIcon className="mr-2 h-4 w-4" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
}
