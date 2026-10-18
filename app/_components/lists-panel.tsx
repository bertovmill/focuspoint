"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PlusIcon, TrashIcon, ListChecksIcon, ChevronLeftIcon, CheckIcon, CircleIcon, PencilIcon } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ListSummary {
  id: number;
  name: string;
  created_at: string;
  open_count: number;
  item_count: number;
}

interface ListItem {
  id: number;
  list_id: number;
  title: string;
  completed: boolean;
  created_at: string;
  completed_at: string | null;
}

interface ListDetail {
  id: number;
  name: string;
  created_at: string;
  items: ListItem[];
}

export function ListsPanel() {
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ListDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);

  const [newItemTitle, setNewItemTitle] = useState("");
  const [addingItem, setAddingItem] = useState(false);

  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editItemTitle, setEditItemTitle] = useState("");
  const editItemRef = useRef<HTMLInputElement>(null);

  const loadLists = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lists");
      if (res.ok) setLists(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  useEffect(() => {
    if (editingItemId !== null) editItemRef.current?.focus();
  }, [editingItemId]);

  const openList = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/lists/${id}`);
      if (res.ok) setSelected(await res.json());
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const backToLists = () => {
    setSelected(null);
    setNewItemTitle("");
    setEditingItemId(null);
    loadLists();
  };

  const handleCreateList = async () => {
    const name = newListName.trim();
    if (!name) {
      toast.error("Give your list a name");
      return;
    }
    setCreatingList(true);
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      const list = await res.json();
      setLists((prev) => [...prev, { ...list, open_count: 0, item_count: 0 }]);
      setNewListOpen(false);
      setNewListName("");
      toast.success("List created");
    } catch {
      toast.error("Failed to create list");
    } finally {
      setCreatingList(false);
    }
  };

  const handleDeleteList = async (id: number) => {
    const prev = lists;
    setLists((l) => l.filter((list) => list.id !== id));
    try {
      const res = await fetch(`/api/lists/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setLists(prev);
      toast.error("Failed to delete list");
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const title = newItemTitle.trim();
    if (!title) return;
    setAddingItem(true);
    setNewItemTitle("");
    try {
      const res = await fetch(`/api/lists/${selected.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error();
      const item = await res.json();
      setSelected((s) => (s ? { ...s, items: [item, ...s.items] } : s));
    } catch {
      toast.error("Failed to add item");
      setNewItemTitle(title);
    } finally {
      setAddingItem(false);
    }
  };

  const handleToggleItem = async (item: ListItem) => {
    if (!selected) return;
    const completed = !item.completed;
    setSelected((s) =>
      s ? { ...s, items: s.items.map((i) => (i.id === item.id ? { ...i, completed } : i)) } : s
    );
    try {
      const res = await fetch(`/api/lists/${selected.id}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setSelected((s) =>
        s ? { ...s, items: s.items.map((i) => (i.id === item.id ? { ...i, completed: !completed } : i)) } : s
      );
      toast.error("Failed to update item");
    }
  };

  const startEditItem = (item: ListItem) => {
    setEditingItemId(item.id);
    setEditItemTitle(item.title);
  };

  const cancelEditItem = () => {
    setEditingItemId(null);
    setEditItemTitle("");
  };

  const saveEditItem = async (item: ListItem) => {
    if (!selected) return;
    const title = editItemTitle.trim();
    if (!title) return;
    setEditingItemId(null);
    setSelected((s) =>
      s ? { ...s, items: s.items.map((i) => (i.id === item.id ? { ...i, title } : i)) } : s
    );
    try {
      const res = await fetch(`/api/lists/${selected.id}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Failed to rename item");
    }
  };

  const handleDeleteItem = async (item: ListItem) => {
    if (!selected) return;
    const prevItems = selected.items;
    setSelected((s) => (s ? { ...s, items: s.items.filter((i) => i.id !== item.id) } : s));
    try {
      const res = await fetch(`/api/lists/${selected.id}/items/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setSelected((s) => (s ? { ...s, items: prevItems } : s));
      toast.error("Failed to delete item");
    }
  };

  // ---- Inside a selected list ----
  if (selected || detailLoading) {
    return (
      <div className="space-y-5">
        <button
          onClick={backToLists}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeftIcon className="size-4" />
          All lists
        </button>

        {detailLoading || !selected ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
          </div>
        ) : (
          <>
            <h2 className="text-sm font-medium">{selected.name}</h2>

            <form onSubmit={handleAddItem} className="flex gap-2">
              <Input
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                placeholder="Add an item…"
                disabled={addingItem}
              />
              <Button type="submit" size="icon" disabled={addingItem || !newItemTitle.trim()}>
                <PlusIcon className="size-4" />
              </Button>
            </form>

            {selected.items.length === 0 ? (
              <Empty className="py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ListChecksIcon className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>No items yet</EmptyTitle>
                  <EmptyDescription>Add your first item above.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="space-y-1.5">
                {selected.items.map((item) =>
                  editingItemId === item.id ? (
                    <div key={item.id} className="flex items-center gap-2 p-2">
                      <Input
                        ref={editItemRef}
                        value={editItemTitle}
                        onChange={(e) => setEditItemTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEditItem(item);
                          if (e.key === "Escape") cancelEditItem();
                        }}
                        className="flex-1"
                      />
                      <Button size="xs" onClick={() => saveEditItem(item)}>Save</Button>
                      <Button size="xs" variant="outline" onClick={cancelEditItem}>Cancel</Button>
                    </div>
                  ) : (
                    <Card key={item.id} className="p-3 flex flex-row items-center gap-3 group">
                      <button
                        onClick={() => handleToggleItem(item)}
                        className={cn(
                          "shrink-0 transition-colors",
                          item.completed ? "text-primary" : "text-muted-foreground hover:text-foreground"
                        )}
                        aria-label={item.completed ? "Mark incomplete" : "Mark complete"}
                      >
                        {item.completed ? <CheckIcon className="size-4" /> : <CircleIcon className="size-4" />}
                      </button>
                      <span
                        className={cn(
                          "flex-1 text-sm truncate",
                          item.completed && "line-through text-muted-foreground"
                        )}
                      >
                        {item.title}
                      </span>
                      <button
                        onClick={() => startEditItem(item)}
                        className="tap-target shrink-0 opacity-0 group-hover:opacity-100 touch:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                        aria-label="Edit item"
                      >
                        <PencilIcon className="size-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item)}
                        className="tap-target shrink-0 opacity-0 group-hover:opacity-100 touch:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        aria-label="Delete item"
                      >
                        <TrashIcon className="size-3.5" />
                      </button>
                    </Card>
                  )
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ---- List of lists ----
  return (
    <div className="space-y-5">
      <Dialog
        open={newListOpen}
        onOpenChange={(open) => {
          setNewListOpen(open);
          if (!open) setNewListName("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New list</DialogTitle>
            <DialogDescription>Give your list a name, like "Groceries" or "Content Ideas".</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="List name"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateList()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewListOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateList} disabled={creatingList}>
              {creatingList ? "Creating…" : "Create list"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Button onClick={() => setNewListOpen(true)} className="w-full gap-1.5">
        <PlusIcon className="size-4" />
        New list
      </Button>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : lists.length === 0 ? (
        <Empty className="py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListChecksIcon className="size-5" />
            </EmptyMedia>
            <EmptyTitle>No lists yet</EmptyTitle>
            <EmptyDescription>Create a list to start tracking items.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-2">
          {lists.map((list) => (
            <Card
              key={list.id}
              className="p-3.5 flex flex-row items-center gap-3 cursor-pointer hover:bg-muted/40 transition-colors group"
              onClick={() => openList(list.id)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{list.name}</p>
                <Badge variant="outline" className="mt-1 text-xs">
                  {list.open_count} open · {list.item_count} total
                </Badge>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="tap-target shrink-0 opacity-0 group-hover:opacity-100 touch:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    aria-label="Delete list"
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete "{list.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will also delete all items in this list. This can't be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDeleteList(list.id)}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
