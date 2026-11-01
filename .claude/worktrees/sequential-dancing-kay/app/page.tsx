import { AgentChat } from "@/app/_components/agent-chat";
import { Dashboard } from "@/app/_components/dashboard";

export default function Page() {
  return (
    <main className="flex h-dvh overflow-hidden bg-background text-foreground">
      {/* Dashboard panel — hidden on mobile, visible on desktop */}
      <aside className="hidden lg:flex lg:w-[380px] xl:w-[420px] shrink-0 flex-col border-r border-border">
        <Dashboard />
      </aside>

      {/* Chat panel — full width on mobile, remainder on desktop */}
      <div className="flex flex-1 flex-col min-w-0">
        <AgentChat />
      </div>
    </main>
  );
}
