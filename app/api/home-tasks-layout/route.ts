import { NextResponse } from "next/server";
import { getSettingsDoc, setSettingsDoc } from "@/lib/settings-doc";
import { DEFAULT_HOME_TASKS_LAYOUT, HOME_TASKS_LAYOUT_KEY, parseHomeTasksLayout } from "@/lib/home-tasks-layout";

// The home Tasks block's drag order and column sort, kept in app_settings so they
// follow Berto across the web app, the Mac app and any browser.
export async function GET() {
  try {
    const doc = await getSettingsDoc(HOME_TASKS_LAYOUT_KEY);
    let layout = null;
    try {
      layout = parseHomeTasksLayout(JSON.parse(doc.content || "null"));
    } catch {}
    return NextResponse.json(layout ?? DEFAULT_HOME_TASKS_LAYOUT);
  } catch {
    return NextResponse.json({ error: "Couldn't load the task order" }, { status: 500 });
  }
}

// PUT { order, sort } — the whole layout.
export async function PUT(req: Request) {
  try {
    const layout = parseHomeTasksLayout(await req.json());
    if (!layout) return NextResponse.json({ error: "order must be task ids; sort must be null or { key, dir }" }, { status: 400 });
    await setSettingsDoc(HOME_TASKS_LAYOUT_KEY, JSON.stringify(layout));
    return NextResponse.json(layout);
  } catch {
    return NextResponse.json({ error: "Couldn't save the task order" }, { status: 500 });
  }
}
