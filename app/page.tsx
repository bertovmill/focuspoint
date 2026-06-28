"use client";

import { useState } from "react";
import { MessageCircleIcon, ListTodoIcon, FileTextIcon } from "lucide-react";
import { AgentChat } from "@/app/_components/agent-chat";
import { Dashboard } from "@/app/_components/dashboard";
import { cn } from "@/lib/utils";

type MobileTab = "chat" | "tasks" | "notes";

export default function Page() {
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");

  return (
    <main className="flex h-dvh overflow-hidden bg-background text-foreground">
      {/* Dashboard panel — sidebar on desktop, full-screen on mobile for tasks/notes */}
      <aside
        className={cn(
          "shrink-0 flex-col border-r border-border",
          mobileTab !== "chat" ? "flex flex-1" : "hidden",
          "lg:flex lg:flex-none lg:w-[380px] xl:w-[420px]",
        )}
      >
        <Dashboard activeTab={mobileTab === "notes" ? "notes" : "todos"} />
      </aside>

      {/* Chat panel — full width on mobile (when chat tab active), remainder on desktop */}
      <div
        className={cn(
          "flex-col min-w-0",
          mobileTab === "chat" ? "flex flex-1" : "hidden",
          "lg:flex lg:flex-1",
        )}
      >
        <AgentChat hasMobileNav />
      </div>

      {/* Mobile bottom navigation bar */}
      <nav className="fixed bottom-0 inset-x-0 h-16 lg:hidden flex items-center border-t border-border bg-background/95 backdrop-blur-sm z-50">
        <NavButton
          label="Chat"
          icon={<MessageCircleIcon className="size-5" />}
          active={mobileTab === "chat"}
          onClick={() => setMobileTab("chat")}
        />
        <NavButton
          label="Tasks"
          icon={<ListTodoIcon className="size-5" />}
          active={mobileTab === "tasks"}
          onClick={() => setMobileTab("tasks")}
        />
        <NavButton
          label="Notes"
          icon={<FileTextIcon className="size-5" />}
          active={mobileTab === "notes"}
          onClick={() => setMobileTab("notes")}
        />
      </nav>
    </main>
  );
}

function NavButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-1 h-full transition-colors",
        active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}
