import { NextResponse } from "next/server";
import { getSettingsDoc, setSettingsDoc } from "@/lib/settings-doc";
import { DEFAULT_VIEWS, TASK_VIEWS_KEY, parseViews } from "@/lib/task-views";

// The Tasks table's saved view tabs (filters, sorts, grouping), kept in app_settings
// so they follow Berto across the web app, the Mac app and any browser.
export async function GET() {
  try {
    const doc = await getSettingsDoc(TASK_VIEWS_KEY);
    let views = null;
    try {
      views = parseViews(JSON.parse(doc.content || "null"));
    } catch {}
    return NextResponse.json({ views: views ?? DEFAULT_VIEWS });
  } catch {
    return NextResponse.json({ error: "Couldn't load task views" }, { status: 500 });
  }
}

// PUT { views } — the whole list, in tab order.
export async function PUT(req: Request) {
  try {
    const { views: raw } = await req.json();
    const views = parseViews(raw);
    if (!views) return NextResponse.json({ error: "views must be a non-empty array" }, { status: 400 });
    await setSettingsDoc(TASK_VIEWS_KEY, JSON.stringify(views));
    return NextResponse.json({ views });
  } catch {
    return NextResponse.json({ error: "Couldn't save task views" }, { status: 500 });
  }
}
