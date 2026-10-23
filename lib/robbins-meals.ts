// The meal bank Berto switched to on 2026-10-23: Tony Robbins' discipline of
// eating. Every meal keeps the four rules in lib/nutrition.ts — mostly
// water-rich food, never animal protein with starch, greens first, and fruit
// alone (Meal 1 is always fruit). Seeded once by applySchema in lib/db.ts;
// photos are made the first time a meal shows up on Home.
export const ROBBINS_MEALS: { slot: string; name: string; description: string; ingredients: string[] }[] = [
  // Meal 1 — fruit alone, on an empty stomach
  { slot: "meal1", name: "Mango, papaya & lime plate", description: "Ripe mango and papaya, sliced and squeezed with lime. Nothing else.", ingredients: ["Mango", "Papaya", "Lime"] },
  { slot: "meal1", name: "Watermelon & mint", description: "Big chilled wedges of watermelon torn with fresh mint — the most water-rich start there is.", ingredients: ["Watermelon", "Mint"] },
  { slot: "meal1", name: "Berry bowl", description: "Blueberries, raspberries and strawberries, piled high and eaten slowly.", ingredients: ["Blueberries", "Raspberries", "Strawberries"] },
  { slot: "meal1", name: "Pineapple & kiwi", description: "Fresh pineapple spears and halved golden kiwi.", ingredients: ["Pineapple", "Golden kiwi"] },
  { slot: "meal1", name: "Green juice & melon", description: "Celery, cucumber, apple and lemon juice, then a plate of honeydew and cantaloupe.", ingredients: ["Celery", "Cucumber", "Green apple", "Lemon", "Honeydew", "Cantaloupe"] },
  { slot: "meal1", name: "Citrus salad", description: "Blood orange, grapefruit and navel orange rounds with a few pomegranate seeds.", ingredients: ["Blood orange", "Grapefruit", "Navel orange", "Pomegranate"] },

  // Meal 2 — big water-rich plates: vegetables with protein OR with starch
  { slot: "meal2", name: "Rainbow chopped salad with grilled chicken", description: "Romaine, cucumber, tomato, peppers and radish with sliced grilled chicken and a lemon-olive oil dressing. No bread.", ingredients: ["Chicken breast", "Romaine", "Cucumber", "Cherry tomatoes", "Peppers", "Radish", "Lemon", "Olive oil"] },
  { slot: "meal2", name: "Avocado & sprout power salad", description: "Spinach, sprouts, cucumber and avocado with pumpkin seeds and a lemon-tahini drizzle.", ingredients: ["Spinach", "Alfalfa sprouts", "Cucumber", "Avocado", "Pumpkin seeds", "Tahini", "Lemon"] },
  { slot: "meal2", name: "Niçoise-style salmon salad (no potato)", description: "Flaked salmon, green beans, soft eggs, olives and tomatoes over butter lettuce.", ingredients: ["Salmon fillets", "Green beans", "Eggs", "Kalamata olives", "Cherry tomatoes", "Butter lettuce", "Dijon mustard", "Olive oil"] },
  { slot: "meal2", name: "Quinoa & roasted vegetable bowl", description: "Warm quinoa with roasted zucchini, peppers and red onion on a bed of arugula — starch and veg, no meat.", ingredients: ["Quinoa", "Zucchini", "Peppers", "Red onion", "Arugula", "Olive oil", "Lemon"] },
  { slot: "meal2", name: "Gazpacho with cucumber salad", description: "Chilled blended tomato, cucumber and pepper soup with a crisp cucumber-dill salad.", ingredients: ["Tomatoes", "Cucumber", "Peppers", "Garlic", "Red onion", "Dill", "Olive oil", "Sherry vinegar"] },
  { slot: "meal2", name: "Lettuce-wrap turkey tacos", description: "Spiced ground turkey in butter lettuce cups with pico de gallo, avocado and lime. No tortillas.", ingredients: ["Ground turkey", "Butter lettuce", "Tomatoes", "Red onion", "Cilantro", "Avocado", "Lime", "Cumin"] },
  { slot: "meal2", name: "Sweet potato & kale bowl", description: "Roasted sweet potato, massaged kale, red cabbage and avocado with a lime dressing.", ingredients: ["Sweet potato", "Kale", "Red cabbage", "Avocado", "Lime", "Olive oil"] },
  { slot: "meal2", name: "Greek salad with grilled shrimp", description: "Tomato, cucumber, pepper, red onion and olives with garlicky grilled shrimp. No pita.", ingredients: ["Shrimp", "Tomatoes", "Cucumber", "Peppers", "Red onion", "Kalamata olives", "Oregano", "Olive oil"] },
  { slot: "meal2", name: "Thai crunch salad", description: "Shredded cabbage, carrot, edamame, cucumber and herbs with a lime-ginger dressing.", ingredients: ["Napa cabbage", "Carrots", "Edamame", "Cucumber", "Cilantro", "Mint", "Ginger", "Lime"] },

  // Meal 3 — evening plates, same rule: protein + veg, or starch + veg
  { slot: "meal3", name: "Lemon-herb salmon with asparagus", description: "Pan-seared salmon with roasted asparagus and a big green salad. No rice.", ingredients: ["Salmon fillets", "Asparagus", "Lemon", "Dill", "Mixed greens", "Olive oil"] },
  { slot: "meal3", name: "Zucchini noodles with turkey meatballs", description: "Spiralised zucchini, fresh tomato-basil sauce and baked turkey meatballs. No pasta.", ingredients: ["Zucchini", "Ground turkey", "Tomatoes", "Basil", "Garlic", "Olive oil"] },
  { slot: "meal3", name: "Roasted vegetable & chickpea tray", description: "Cauliflower, carrots, red onion and chickpeas roasted with cumin, over spinach with tahini.", ingredients: ["Cauliflower", "Carrots", "Red onion", "Chickpeas", "Spinach", "Tahini", "Cumin"] },
  { slot: "meal3", name: "Grilled chicken with broccolini & greens", description: "Herb-marinated chicken thighs with charred broccolini and an arugula salad.", ingredients: ["Chicken thighs", "Broccolini", "Arugula", "Lemon", "Garlic", "Rosemary", "Olive oil"] },
  { slot: "meal3", name: "Stuffed bell peppers with wild rice", description: "Peppers filled with wild rice, mushrooms, spinach and herbs, with a side of greens. No meat.", ingredients: ["Peppers", "Wild rice", "Mushrooms", "Spinach", "Onion", "Parsley", "Mixed greens"] },
  { slot: "meal3", name: "Cod in tomato & fennel broth", description: "Flaky cod poached in a light tomato-fennel broth with green beans.", ingredients: ["Cod fillets", "Fennel", "Tomatoes", "Garlic", "Green beans", "Parsley", "Olive oil"] },
  { slot: "meal3", name: "Big green vegetable curry", description: "Coconut curry with spinach, zucchini, green beans and peas over cauliflower rice.", ingredients: ["Spinach", "Zucchini", "Green beans", "Peas", "Cauliflower", "Coconut milk", "Green curry paste", "Lime"] },
  { slot: "meal3", name: "Steak salad with chimichurri", description: "Sliced grilled flank steak over romaine, tomatoes and cucumber with chimichurri. No potatoes.", ingredients: ["Flank steak", "Romaine", "Tomatoes", "Cucumber", "Parsley", "Garlic", "Red wine vinegar", "Olive oil"] },
  { slot: "meal3", name: "Minestrone verde", description: "Brothy spring vegetable soup — zucchini, leeks, peas, white beans and kale with pesto.", ingredients: ["Zucchini", "Leeks", "Peas", "Cannellini beans", "Kale", "Basil", "Vegetable broth"] },
];
