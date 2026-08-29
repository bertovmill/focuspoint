"use client";

import { useState, useEffect, useCallback } from "react";
import { PlusIcon, PencilIcon, TrashIcon, ClockIcon, PlayIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { usePolling } from "@/app/_components/use-polling";

interface ScheduledTask {
  id: number;
  title: string;
  prompt: string;
  cron: string;
  schedule: string;
  notify: boolean;
  enabled: boolean;
  last_run_at: string | null;
}

interface TaskForm {
  title: string;
  prompt: string;
  cron: string;
  notify: boolean;
}

const emptyForm: TaskForm = { title: "", prompt: "", cron: "0 9 * * *", notify: true };

export function ScheduledTasksPanel({ onRunNow }: { onRunNow?: (prompt: string) => void }) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TaskForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/scheduled-tasks");
      if (res.ok) setTasks(await res.json());
    } catch {
      // silently fail — agent can still be used
    } finally {
      setLoading(false);
    }
  }, []);

  usePolling(fetchTasks, 60_000);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (task: ScheduledTask) => {
    setEditingId(task.id);
    setForm({ title: task.title, prompt: task.prompt, cron: task.cron, notify: task.notify });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.prompt.trim() || !form.cron.trim()) {
      toast.error("Title, prompt, and cron are all required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(editingId ? `/api/scheduled-tasks/${editingId}` : "/api/scheduled-tasks", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to save");
      }
      setDialogOpen(false);
      await fetchTasks();
      toast.success(editingId ? "Schedule updated." : "Schedule created.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save schedule.");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (task: ScheduledTask) => {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, enabled: !t.enabled } : t)));
    try {
      const res = await fetch(`/api/scheduled-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !task.enabled }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, enabled: task.enabled } : t)));
      toast.error("Couldn't update schedule.");
    }
  };

  const handleDelete = async (id: number) => {
    const prev = tasks;
    setTasks((p) => p.filter((t) => t.id !== id));
    try {
      const res = await fetch(`/api/scheduled-tasks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Schedule deleted.");
    } catch {
      setTasks(prev);
      toast.error("Couldn't delete schedule.");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted-foreground">Tasks Cael runs automatically on a cadence.</p>
        <Button size="sm" onClick={openCreate}>
          <PlusIcon className="size-4" />
          New
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <Empty className="py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClockIcon className="size-5" />
            </EmptyMedia>
            <EmptyTitle>No scheduled tasks</EmptyTitle>
            <EmptyDescription>Create one, or ask Cael to schedule something for you.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <Card key={task.id} className="gap-1 rounded-lg p-3 shadow-none">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p
                    className={cn(
                      "text-sm font-medium truncate",
                      !task.enabled && "text-muted-foreground line-through",
                    )}
                  >
                    {task.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{task.schedule}</p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button onClick={() => toggleEnabled(task)} title={task.enabled ? "Pause" : "Resume"}>
                    <Badge variant={task.enabled ? "default" : "outline"} className="cursor-pointer">
                      {task.enabled ? "On" : "Off"}
                    </Badge>
                  </button>
                  {onRunNow && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => onRunNow(task.prompt)}
                      aria-label="Run now"
                      title="Run now"
                    >
                      <PlayIcon className="size-3" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon-xs" onClick={() => openEdit(task)} aria-label="Edit schedule">
                    <PencilIcon className="size-3" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Delete schedule"
                      >
                        <TrashIcon className="size-3" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this scheduled task?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This can&rsquo;t be undone. &ldquo;{task.title}&rdquo; will stop running.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(task.id)}
                          className="bg-destructive text-white hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit scheduled task" : "New scheduled task"}</DialogTitle>
            <DialogDescription>
              Cael runs this prompt automatically on the cron cadence below, evaluated in UTC.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Title, e.g. Evening wind-down check-in"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
            <Textarea
              placeholder="What should Cael do when this fires?"
              rows={4}
              value={form.prompt}
              onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
            />
            <div>
              <Input
                placeholder="Cron, e.g. 0 21 * * *"
                value={form.cron}
                onChange={(e) => setForm((f) => ({ ...f, cron: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                5 fields: minute hour day month weekday, in UTC. &quot;0 21 * * *&quot; = daily at 9pm UTC.
              </p>
            </div>
            <button type="button" onClick={() => setForm((f) => ({ ...f, notify: !f.notify }))}>
              <Badge variant={form.notify ? "default" : "outline"} className="cursor-pointer">
                {form.notify ? "Texts me the result" : "Runs silently"}
              </Badge>
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
