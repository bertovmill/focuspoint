// Every tool Cael has, by name, so the MCP server can offer the same set to any
// MCP client (Claude Code, claude.ai, Codex) without maintaining a second copy of
// each one. eve discovers these by file path; here the path *is* the name.

import add_calendar_event from "@/agent/tools/add_calendar_event";
import add_family_memory from "@/agent/tools/add_family_memory";
import add_todo from "@/agent/tools/add_todo";
import add_vision_item from "@/agent/tools/add_vision_item";
import ai_reading_list from "@/agent/lib/toolsets/events_and_news/ai_reading_list";
import capture_thought from "@/agent/tools/capture_thought";
import complete_todo from "@/agent/tools/complete_todo";
import create_folder from "@/agent/tools/create_folder";
import delete_vision_item from "@/agent/tools/delete_vision_item";
import get_luma_event from "@/agent/lib/toolsets/events_and_news/get_luma_event";
import get_scorecard from "@/agent/tools/get_scorecard";
import import_reading_notes from "@/agent/tools/import_reading_notes";
import latest_ai_news from "@/agent/lib/toolsets/events_and_news/latest_ai_news";
import list_calendar_events from "@/agent/tools/list_calendar_events";
import list_folders from "@/agent/tools/list_folders";
import list_github_prs from "@/agent/tools/list_github_prs";
import list_luma_events from "@/agent/lib/toolsets/events_and_news/list_luma_events";
import list_meal_history from "@/agent/tools/list_meal_history";
import list_notes from "@/agent/tools/list_notes";
import list_nutrition from "@/agent/tools/list_nutrition";
import list_training_plan from "@/agent/tools/list_training_plan";
import list_reading from "@/agent/tools/list_reading";
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
import meals_doc from "@/agent/tools/meals_doc";
import post_linkedin from "@/agent/lib/toolsets/publishing/post_linkedin";
import post_task_update from "@/agent/tools/post_task_update";
import post_tweet from "@/agent/lib/toolsets/publishing/post_tweet";
import principles_doc from "@/agent/tools/principles_doc";
import read_sketch from "@/agent/tools/read_sketch";
import search_memory from "@/agent/tools/search_memory";
import set_daily_meal from "@/agent/tools/set_daily_meal";
import set_training_session from "@/agent/tools/set_training_session";
import sync_workouts from "@/agent/tools/sync_workouts";
import training_plan_doc from "@/agent/tools/training_plan_doc";
import set_focus from "@/agent/tools/set_focus";
import sync_luma from "@/agent/lib/toolsets/events_and_news/sync_luma";
import update_todo from "@/agent/tools/update_todo";
import update_vision_item from "@/agent/tools/update_vision_item";
import generate_post_image from "@/agent/lib/toolsets/publishing/generate_post_image";
import get_post from "@/agent/lib/toolsets/publishing/get_post";
import list_posts from "@/agent/lib/toolsets/publishing/list_posts";
import publish_post from "@/agent/lib/toolsets/publishing/publish_post";
import save_post from "@/agent/lib/toolsets/publishing/save_post";
import list_portfolio from "@/agent/lib/toolsets/publishing/list_portfolio";
import save_capability from "@/agent/lib/toolsets/publishing/save_capability";
import save_portfolio_project from "@/agent/lib/toolsets/publishing/save_portfolio_project";

export const agentTools = {
  add_calendar_event,
  add_family_memory,
  add_todo,
  add_vision_item,
  ai_reading_list,
  capture_thought,
  complete_todo,
  create_folder,
  delete_vision_item,
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
  list_training_plan,
  list_reading,
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
  meals_doc,
  post_linkedin,
  post_task_update,
  post_tweet,
  principles_doc,
  read_sketch,
  search_memory,
  set_daily_meal,
  set_training_session,
  sync_workouts,
  training_plan_doc,
  set_focus,
  sync_luma,
  update_todo,
  update_vision_item,
  generate_post_image,
  get_post,
  list_posts,
  publish_post,
  save_post,
  list_portfolio,
  save_capability,
  save_portfolio_project,
};
