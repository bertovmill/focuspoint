import { routeEval } from "./route";

export default routeEval({
  description: "What to eat reads his meal notes or recent meals before suggesting anything.",
  prompt: "What should I have for dinner tonight?",
  anyOf: ["meals_doc", "list_meal_history", "list_nutrition"],
  never: ["set_daily_meal"],
});
