// Every tool Cael has, by name, so the MCP server can offer the same set to any
// MCP client (Claude Code, claude.ai, Codex) without maintaining a second copy of
// each one. eve discovers these by file path; here the path *is* the name.

import add_calendar_event from "@/agent/tools/add_calendar_event";
import add_family_memory from "@/agent/tools/add_family_memory";
import add_todo from "@/agent/tools/add_todo";
import add_vision_item from "@/agent/tools/add_vision_item";
import ai_reading_list from "@/agent/tools/ai_reading_list";
import capture_thought from "@/agent/tools/capture_thought";
import complete_todo from "@/agent/tools/complete_todo";
import create_folder from "@/agent/tools/create_folder";
import create_scheduled_task from "@/agent/tools/create_scheduled_task";
import delete_scheduled_task from "@/agent/tools/delete_scheduled_task";
import delete_vision_item from "@/agent/tools/delete_vision_item";
import get_dream_summary from "@/agent/tools/get_dream_summary";
import get_luma_event from "@/agent/tools/get_luma_event";
import get_scorecard from "@/agent/tools/get_scorecard";
import import_reading_notes from "@/agent/tools/import_reading_notes";
import latest_ai_news from "@/agent/tools/latest_ai_news";
import list_calendar_events from "@/agent/tools/list_calendar_events";
import list_folders from "@/agent/tools/list_folders";
import list_github_prs from "@/agent/tools/list_github_prs";
import list_luma_events from "@/agent/tools/list_luma_events";
import list_meal_history from "@/agent/tools/list_meal_history";
import list_notes from "@/agent/tools/list_notes";
import list_nutrition from "@/agent/tools/list_nutrition";
import list_reading from "@/agent/tools/list_reading";
import list_scheduled_tasks from "@/agent/tools/list_scheduled_tasks";
import list_sketches from "@/agent/tools/list_sketches";
import list_todos from "@/agent/tools/list_todos";
import list_vision from "@/agent/tools/list_vision";
import list_workout_notes from "@/agent/tools/list_workout_notes";
import list_workouts from "@/agent/tools/list_workouts";
import log_meal from "@/agent/tools/log_meal";
import log_metrics from "@/agent/tools/log_metrics";
import log_nutrition_day from "@/agent/tools/log_nutrition_day";
import log_reading from "@/agent/tools/log_reading";
import log_thank_you from "@/agent/tools/log_thank_you";
import log_workout from "@/agent/tools/log_workout";
import log_workout_note from "@/agent/tools/log_workout_note";
import post_linkedin from "@/agent/tools/post_linkedin";
import post_task_update from "@/agent/tools/post_task_update";
import post_tweet from "@/agent/tools/post_tweet";
import read_sketch from "@/agent/tools/read_sketch";
import save_dream from "@/agent/tools/save_dream";
import search_memory from "@/agent/tools/search_memory";
import set_daily_meal from "@/agent/tools/set_daily_meal";
import set_focus from "@/agent/tools/set_focus";
import sync_luma from "@/agent/tools/sync_luma";
import update_scheduled_task from "@/agent/tools/update_scheduled_task";
import update_todo from "@/agent/tools/update_todo";
import update_vision_item from "@/agent/tools/update_vision_item";

export const agentTools = {
  add_calendar_event,
  add_family_memory,
  add_todo,
  add_vision_item,
  ai_reading_list,
  capture_thought,
  complete_todo,
  create_folder,
  create_scheduled_task,
  delete_scheduled_task,
  delete_vision_item,
  get_dream_summary,
  get_luma_event,
  get_scorecard,
  import_reading_notes,
  latest_ai_news,
  list_calendar_events,
  list_folders,
  list_github_prs,
  list_luma_events,
  list_meal_history,
  list_notes,
  list_nutrition,
  list_reading,
  list_scheduled_tasks,
  list_sketches,
  list_todos,
  list_vision,
  list_workout_notes,
  list_workouts,
  log_meal,
  log_metrics,
  log_nutrition_day,
  log_reading,
  log_thank_you,
  log_workout,
  log_workout_note,
  post_linkedin,
  post_task_update,
  post_tweet,
  read_sketch,
  save_dream,
  search_memory,
  set_daily_meal,
  set_focus,
  sync_luma,
  update_scheduled_task,
  update_todo,
  update_vision_item,
};
