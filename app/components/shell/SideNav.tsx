"use client";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useState } from "react";
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
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HomeIcon } from "@/components/heroicons";
import { Squares2x2Icon } from "@/components/heroicons";
import { ClipboardDocumentIcon } from "@/components/heroicons";
import { SparklesIcon } from "@/components/heroicons";
import { UserIcon } from "@/components/heroicons";
import { DocumentDuplicateIcon } from "@/components/heroicons";
import { ArrowRightOnRectangleIcon } from "@/components/heroicons";
import { ChevronDownIcon, CpuChipIcon } from "@/components/heroicons";
import { usePathname } from "next/navigation";

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
  const { state, toggleSidebar } = useSidebar();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);

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
              {isAdmin && (
                <SidebarMenuItem>
                  <DropdownMenu
                    open={adminMenuOpen}
                    onOpenChange={setAdminMenuOpen}
                  >
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton
                        isActive={
                          pathname === "/admin" ||
                          pathname.startsWith("/admin/")
                        }
                        tooltip="Admin Panel"
                        className="w-full"
                      >
                        <UserIcon className="w-4 h-4" />
                        <span>Admin</span>
                        <ChevronDownIcon className="w-3 h-3 ml-auto" />
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      side="right"
                      align="start"
                      className="w-48"
                      sideOffset={8}
                    >
                      <DropdownMenuItem asChild>
                        <Link
                          href="/admin"
                          className="flex items-center w-full"
                          onClick={() => setAdminMenuOpen(false)}
                        >
                          <CpuChipIcon className="w-4 h-4 mr-2" />
                          AI Provider Administration
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link
                          href="/admin/users"
                          className="flex items-center w-full"
                          onClick={() => setAdminMenuOpen(false)}
                        >
                          <UserIcon className="w-4 h-4 mr-2" />
                          Manage Users
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <Link href="/profile" className="block w-full">
                  <SidebarMenuButton
                    isActive={pathname === "/profile"}
                    tooltip="Profile"
                  >
                    <UserIcon className="w-4 h-4" />
                    <span>Profile</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  tooltip="Sign Out"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <ArrowRightOnRectangleIcon className="w-4 h-4" />
                  <span>Sign Out</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
}
