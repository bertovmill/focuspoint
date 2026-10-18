"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateSelectArg, EventClickArg, EventDropArg } from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import { CalendarIcon, PlusIcon, TrashIcon, UnplugIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useIsDesktop } from "@/hooks/use-is-desktop";

type Status =
  | { state: "loading" }
  | { state: "unconfigured" }
  | { state: "disconnected" }
  | { state: "connected"; email: string | null };

interface EventDraft {
  id: string | null; // null = creating
  title: string;
  description: string;
  start: string; // datetime-local value, or YYYY-MM-DD when allDay
  end: string; // for allDay this is the INCLUSIVE end date shown to the user
  allDay: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

function toLocalInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toLocalDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toLocalDate(d);
}

// Google/FullCalendar use an exclusive end for all-day events; the form shows inclusive.
function draftToApiBody(draft: EventDraft) {
  return draft.allDay
    ? { title: draft.title, description: draft.description, allDay: true, start: draft.start, end: addDays(draft.end, 1) }
    : {
        title: draft.title,
        description: draft.description,
        allDay: false,
        start: new Date(draft.start).toISOString(),
        end: new Date(draft.end).toISOString(),
      };
}

export function CalendarPanel() {
  const [status, setStatus] = useState<Status>({ state: "loading" });
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const calendarRef = useRef<FullCalendar>(null);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    // Surface the OAuth redirect result once, then clean the URL.
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") toast.success("Google Calendar connected");
    else if (params.get("google") === "error") toast.error("Google Calendar connection failed — try again");
    if (params.has("google")) {
      params.delete("google");
      params.delete("reason");
      const qs = params.toString();
      window.history.replaceState({}, "", qs ? `?${qs}` : window.location.pathname);
    }

    fetch("/api/google/status")
      .then((r) => r.json())
      .then((s) => {
        if (!s.configured) setStatus({ state: "unconfigured" });
        else if (!s.connected) setStatus({ state: "disconnected" });
        else setStatus({ state: "connected", email: s.email });
      })
      .catch(() => setStatus({ state: "disconnected" }));
  }, []);

  const refetch = useCallback(() => calendarRef.current?.getApi().refetchEvents(), []);

  const handleSelect = useCallback((sel: DateSelectArg) => {
    setDraft({
      id: null,
      title: "",
      description: "",
      allDay: sel.allDay,
      start: sel.allDay ? toLocalDate(sel.start) : toLocalInput(sel.start),
      end: sel.allDay ? addDays(toLocalDate(sel.end), -1) : toLocalInput(sel.end),
    });
    sel.view.calendar.unselect();
  }, []);

  /*
   * Drag-to-select is the only way to create an event on the desktop grid, and it
   * isn't available on a phone — there the same drag scrolls the agenda. So touch
   * gets an explicit button, opening the same draft dialog pre-filled with the next
   * whole hour.
   */
  const handleNewEvent = useCallback(() => {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    setDraft({
      id: null,
      title: "",
      description: "",
      allDay: false,
      start: toLocalInput(start),
      end: toLocalInput(end),
    });
  }, []);

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const e = arg.event;
    if (!e.start) return;
    const end = e.end ?? e.start;
    setDraft({
      id: e.id,
      title: e.title,
      description: (e.extendedProps.description as string) ?? "",
      allDay: e.allDay,
      start: e.allDay ? toLocalDate(e.start) : toLocalInput(e.start),
      end: e.allDay ? addDays(toLocalDate(end), e.end ? -1 : 0) : toLocalInput(end),
    });
  }, []);

  const handleMove = useCallback(async (arg: EventDropArg | EventResizeDoneArg) => {
    const e = arg.event;
    if (!e.start) return arg.revert();
    const end = e.end ?? e.start;
    const body = e.allDay
      ? { allDay: true, start: toLocalDate(e.start), end: toLocalDate(e.end ?? new Date(e.start.getTime() + 86400000)) }
      : { allDay: false, start: e.start.toISOString(), end: end.toISOString() };
    const res = await fetch(`/api/calendar/events/${encodeURIComponent(e.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error("Couldn't move event");
      arg.revert();
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft || !draft.title.trim() || !draft.start || !draft.end) return;
    setSaving(true);
    const body = draftToApiBody({ ...draft, title: draft.title.trim() });
    const res = draft.id
      ? await fetch(`/api/calendar/events/${encodeURIComponent(draft.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      : await fetch("/api/calendar/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
    setSaving(false);
    if (res.ok) {
      setDraft(null);
      refetch();
    } else {
      toast.error(draft.id ? "Couldn't update event" : "Couldn't create event");
    }
  }, [draft, refetch]);

  const handleDelete = useCallback(async () => {
    if (!draft?.id) return;
    setSaving(true);
    const res = await fetch(`/api/calendar/events/${encodeURIComponent(draft.id)}`, { method: "DELETE" });
    setSaving(false);
    if (res.ok) {
      setDraft(null);
      refetch();
    } else {
      toast.error("Couldn't delete event");
    }
  }, [draft, refetch]);

  const handleDisconnect = useCallback(async () => {
    await fetch("/api/google/status", { method: "DELETE" });
    setStatus({ state: "disconnected" });
    toast.success("Google Calendar disconnected");
  }, []);

  if (status.state === "loading") {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (status.state === "unconfigured") {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarIcon />
          </EmptyMedia>
          <EmptyTitle>Google OAuth not configured</EmptyTitle>
          <EmptyDescription>
            Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local (and Vercel), then reload.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (status.state === "disconnected") {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarIcon />
          </EmptyMedia>
          <EmptyTitle>Connect Google Calendar</EmptyTitle>
          <EmptyDescription>
            One-time sign-in with your Google account. Events become viewable and editable right here.
          </EmptyDescription>
        </EmptyHeader>
        <Button onClick={() => (window.location.href = "/api/google/connect")}>Connect Google Calendar</Button>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{status.email ?? "Google Calendar"}</span>
        <div className="flex shrink-0 items-center gap-1">
          {!isDesktop && (
            <Button size="sm" onClick={handleNewEvent}>
              <PlusIcon className="size-4" />
              New event
            </Button>
          )}
          <button
            onClick={handleDisconnect}
            className="tap-target flex items-center gap-1.5 rounded-lg p-1.5 transition-colors hover:bg-muted hover:text-foreground"
            title="Disconnect Google Calendar"
          >
            <UnplugIcon className="size-3.5" />
            <span className="lg:inline">Disconnect</span>
          </button>
        </div>
      </div>

      <FullCalendar
        ref={calendarRef}
        /*
         * A month grid needs seven columns. At 390px each is 55px wide, which clips
         * every event title to a few characters and pushes Saturday off screen — the
         * view is legible as a shape and useless as information. So a phone gets the
         * agenda instead: `listWeek`, one chronological column of full titles and
         * times, which is what you want to know from a phone anyway.
         *
         * `initialView` is read once per mount and there is no prop to change it
         * after, so the breakpoint keys the component and a change remounts it on
         * the right view. Calling `changeView` from an effect looks tidier and
         * doesn't hold — FullCalendar re-applies its own view on the prop updates
         * that land in the same commit, and the desktop kept rendering the agenda.
         * Crossing `lg` is rare enough that a remount costs nothing.
         */
        key={isDesktop ? "desktop" : "mobile"}
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        initialView={isDesktop ? "dayGridMonth" : "listWeek"}
        /*
         * Three toolbar groups don't fit on one 390px line — the view buttons
         * collided with the title. On a phone the navigation keeps the header and
         * the view switcher drops to its own centred row, which also gives every
         * button room to be a real 44px target.
         */
        headerToolbar={
          isDesktop
            ? { left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }
            : { left: "prev,next", center: "title", right: "today" }
        }
        footerToolbar={isDesktop ? false : { center: "listWeek,dayGridMonth,timeGridDay" }}
        // The agenda has no natural "empty day" row, so say so rather than
        // rendering a blank panel.
        noEventsText="Nothing scheduled this week"
        height="auto"
        nowIndicator
        // Dragging to create an event needs a pointer to be worth offering; on a
        // phone the same drag is how you scroll the agenda.
        selectable={isDesktop}
        selectMirror={isDesktop}
        editable={isDesktop}
        dayMaxEventRows={4}
        events={(info, success, failure) => {
          const params = new URLSearchParams({
            timeMin: info.start.toISOString(),
            timeMax: info.end.toISOString(),
          });
          fetch(`/api/calendar/events?${params}`)
            .then(async (r) => {
              if (r.status === 409) {
                setStatus({ state: "disconnected" });
                return success([]);
              }
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              success(await r.json());
            })
            .catch(failure);
        }}
        select={handleSelect}
        eventClick={handleEventClick}
        eventDrop={handleMove}
        eventResize={handleMove}
      />

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit event" : "New event"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <Input
                autoFocus
                placeholder="Event title"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={draft.allDay}
                  onChange={(e) => {
                    const allDay = e.target.checked;
                    setDraft({
                      ...draft,
                      allDay,
                      start: allDay ? draft.start.slice(0, 10) : `${draft.start.slice(0, 10)}T09:00`,
                      end: allDay ? draft.end.slice(0, 10) : `${draft.end.slice(0, 10)}T10:00`,
                    });
                  }}
                  className="accent-primary"
                />
                All day
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Start</span>
                  <Input
                    type={draft.allDay ? "date" : "datetime-local"}
                    value={draft.start}
                    onChange={(e) => setDraft({ ...draft, start: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">End</span>
                  <Input
                    type={draft.allDay ? "date" : "datetime-local"}
                    value={draft.end}
                    onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                  />
                </div>
              </div>
              <Textarea
                placeholder="Description (optional)"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                rows={3}
              />
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {draft?.id ? (
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={saving}>
                <TrashIcon className="size-4" />
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setDraft(null)} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !draft?.title.trim()}>
                {saving && <Spinner className="size-4" />}
                {draft?.id ? "Save" : "Create"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
