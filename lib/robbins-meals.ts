// The meal bank Berto switched to on 2026-10-23: Tony Robbins' discipline of
// eating. Every meal keeps the rules in lib/nutrition.ts — mostly water-rich
// food, never animal protein with starch, greens first. The fruit plates were
// Meal 1 until he dropped "fruit alone in the morning" (2026-10-26); they're
// snacks now. Seeded once by applySchema in lib/db.ts,
// which also fills in the full recipe (amounts, time, steps) on meals that
// don't have one yet; photos are made the first time a meal shows up on Home.

export interface RobbinsMeal {
  slot: string;
  name: string;
  description: string;
  /** Plain names — they feed the Groceries list. */
  ingredients: string[];
  minutes: number;
  /** The recipe's ingredient list with amounts, for one serving. */
  lines: string[];
  steps: string[];
}

export const ROBBINS_MEALS: RobbinsMeal[] = [
  // Snacks — fruit plates
  {
    slot: "snack",
    name: "Mango, papaya & lime plate",
    description: "Ripe mango and papaya, sliced and squeezed with lime. Nothing else.",
    ingredients: ["Mango", "Papaya", "Lime"],
    minutes: 5,
    lines: ["1 ripe mango", "½ small ripe papaya", "½ lime"],
    steps: [
      "Slice the mango cheeks off the stone, score the flesh in a grid and turn each cheek inside out.",
      "Halve the papaya, scoop out the seeds and cut it into long wedges.",
      "Arrange on a plate and squeeze the lime over everything. Eat it on its own and wait at least 30 minutes before anything else.",
    ],
  },
  {
    slot: "snack",
    name: "Watermelon & mint",
    description: "Big chilled wedges of watermelon torn with fresh mint — the most water-rich start there is.",
    ingredients: ["Watermelon", "Mint"],
    minutes: 5,
    lines: ["¼ small watermelon, well chilled", "6 fresh mint leaves"],
    steps: [
      "Cut the watermelon into thick wedges or big chunks.",
      "Tear the mint over the top and serve straight from the fridge.",
    ],
  },
  {
    slot: "snack",
    name: "Berry bowl",
    description: "Blueberries, raspberries and strawberries, piled high and eaten slowly.",
    ingredients: ["Blueberries", "Raspberries", "Strawberries"],
    minutes: 5,
    lines: ["1 cup blueberries", "½ cup raspberries", "1 cup strawberries"],
    steps: [
      "Rinse the berries gently and let them drain on a towel.",
      "Hull and halve the strawberries.",
      "Pile everything into a big bowl and eat slowly.",
    ],
  },
  {
    slot: "snack",
    name: "Pineapple & kiwi",
    description: "Fresh pineapple spears and halved golden kiwi.",
    ingredients: ["Pineapple", "Golden kiwi"],
    minutes: 8,
    lines: ["¼ fresh pineapple", "2 golden kiwis"],
    steps: [
      "Cut the top and skin off the pineapple, quarter it lengthwise and slice off the core. Cut one quarter into spears.",
      "Halve the kiwis; eat them with a spoon straight from the skin.",
    ],
  },
  {
    slot: "snack",
    name: "Green juice & melon",
    description: "Celery, cucumber, apple and lemon juice, then a plate of honeydew and cantaloupe.",
    ingredients: ["Celery", "Cucumber", "Green apple", "Lemon", "Honeydew", "Cantaloupe"],
    minutes: 10,
    lines: ["4 celery stalks", "1 cucumber", "1 green apple", "½ lemon, peeled", "2 cups honeydew, cubed", "2 cups cantaloupe, cubed"],
    steps: [
      "Juice the celery, cucumber, apple and lemon (or blend with ½ cup water and strain).",
      "Drink the juice first.",
      "Ten minutes later, have the melon on its own plate.",
    ],
  },
  {
    slot: "snack",
    name: "Citrus salad",
    description: "Blood orange, grapefruit and navel orange rounds with a few pomegranate seeds.",
    ingredients: ["Blood orange", "Grapefruit", "Navel orange", "Pomegranate"],
    minutes: 10,
    lines: ["1 blood orange", "½ pink grapefruit", "1 navel orange", "2 tbsp pomegranate seeds"],
    steps: [
      "Cut the top and bottom off each fruit, then slice the peel and pith away following the curve.",
      "Slice the fruit into thin rounds and overlap them on a plate.",
      "Scatter the pomegranate seeds over the top.",
    ],
  },

  // Meal 2 — big water-rich plates: vegetables with protein OR with starch
  {
    slot: "meal2",
    name: "Rainbow chopped salad with grilled chicken",
    description: "Romaine, cucumber, tomato, peppers and radish with sliced grilled chicken and a lemon-olive oil dressing. No bread.",
    ingredients: ["Chicken breast", "Romaine", "Cucumber", "Cherry tomatoes", "Peppers", "Radish", "Lemon", "Olive oil"],
    minutes: 25,
    lines: ["1 chicken breast (about 200 g)", "1 romaine heart", "½ cucumber", "1 cup cherry tomatoes", "½ red pepper", "½ yellow pepper", "4 radishes", "1 lemon", "2 tbsp olive oil", "Salt and pepper"],
    steps: [
      "Pound the chicken to an even thickness, rub with 1 tsp oil, salt and pepper, and grill or pan-sear 5–6 minutes a side until cooked through. Rest 5 minutes.",
      "Chop the romaine, cucumber, peppers and radishes into small even pieces; halve the tomatoes.",
      "Whisk the juice of the lemon with the rest of the oil and a pinch of salt.",
      "Toss the vegetables with the dressing, pile into a big bowl and top with the sliced chicken.",
    ],
  },
  {
    slot: "meal2",
    name: "Avocado & sprout power salad",
    description: "Spinach, sprouts, cucumber and avocado with pumpkin seeds and a lemon-tahini drizzle.",
    ingredients: ["Spinach", "Alfalfa sprouts", "Cucumber", "Avocado", "Pumpkin seeds", "Tahini", "Lemon"],
    minutes: 10,
    lines: ["3 big handfuls baby spinach", "1 cup alfalfa sprouts", "½ cucumber, sliced", "1 ripe avocado", "2 tbsp pumpkin seeds", "1 tbsp tahini", "½ lemon", "Salt"],
    steps: [
      "Toast the pumpkin seeds in a dry pan for 2–3 minutes until they pop.",
      "Whisk the tahini with the lemon juice, a pinch of salt and enough water to make it pourable.",
      "Layer the spinach, cucumber and sprouts; slice the avocado over the top.",
      "Drizzle with the tahini and scatter the seeds.",
    ],
  },
  {
    slot: "meal2",
    name: "Niçoise-style salmon salad (no potato)",
    description: "Flaked salmon, green beans, soft eggs, olives and tomatoes over butter lettuce.",
    ingredients: ["Salmon fillets", "Green beans", "Eggs", "Kalamata olives", "Cherry tomatoes", "Butter lettuce", "Dijon mustard", "Olive oil"],
    minutes: 25,
    lines: ["1 salmon fillet (about 150 g)", "1 cup green beans, trimmed", "2 eggs", "8 Kalamata olives", "1 cup cherry tomatoes", "1 head butter lettuce", "1 tsp Dijon mustard", "1 tbsp red wine vinegar", "2 tbsp olive oil", "Salt and pepper"],
    steps: [
      "Boil the eggs for 7 minutes, then move them to ice water. Blanch the green beans in the same pot for 3 minutes and cool them too.",
      "Season the salmon and roast at 425°F (220°C) for 10–12 minutes, or sear skin-side down for 4 minutes then flip for 2.",
      "Whisk the mustard, vinegar, oil and a pinch of salt.",
      "Arrange the lettuce, beans, halved tomatoes, olives and halved eggs on a platter, flake the salmon over and spoon on the dressing.",
    ],
  },
  {
    slot: "meal2",
    name: "Quinoa & roasted vegetable bowl",
    description: "Warm quinoa with roasted zucchini, peppers and red onion on a bed of arugula — starch and veg, no meat.",
    ingredients: ["Quinoa", "Zucchini", "Peppers", "Red onion", "Arugula", "Olive oil", "Lemon"],
    minutes: 35,
    lines: ["½ cup quinoa, rinsed", "1 zucchini", "1 red pepper", "½ red onion", "2 handfuls arugula", "2 tbsp olive oil", "½ lemon", "Salt and pepper"],
    steps: [
      "Heat the oven to 425°F (220°C). Cut the zucchini, pepper and onion into bite-size pieces, toss with 1 tbsp oil, salt and pepper, and roast 25 minutes, turning once.",
      "Meanwhile simmer the quinoa in 1 cup salted water, covered, for 15 minutes; rest 5 minutes and fluff.",
      "Dress the arugula with the lemon juice and remaining oil.",
      "Bowl it up: arugula, warm quinoa, roasted vegetables on top.",
    ],
  },
  {
    slot: "meal2",
    name: "Gazpacho with cucumber salad",
    description: "Chilled blended tomato, cucumber and pepper soup with a crisp cucumber-dill salad.",
    ingredients: ["Tomatoes", "Cucumber", "Peppers", "Garlic", "Red onion", "Dill", "Olive oil", "Sherry vinegar"],
    minutes: 15,
    lines: ["4 ripe tomatoes", "1½ cucumbers", "½ red pepper", "1 small garlic clove", "¼ red onion", "Small bunch dill", "3 tbsp olive oil", "1 tbsp sherry vinegar", "Salt"],
    steps: [
      "Roughly chop the tomatoes, 1 cucumber, the pepper, garlic and half the onion. Blend with 2 tbsp oil, the vinegar and 1 tsp salt until smooth.",
      "Chill for at least 30 minutes (or blend with a few ice cubes to serve now).",
      "Thinly slice the remaining cucumber and onion, toss with chopped dill, a pinch of salt and the last of the oil.",
      "Pour the gazpacho into a bowl and serve the cucumber salad alongside.",
    ],
  },
  {
    slot: "meal2",
    name: "Lettuce-wrap turkey tacos",
    description: "Spiced ground turkey in butter lettuce cups with pico de gallo, avocado and lime. No tortillas.",
    ingredients: ["Ground turkey", "Butter lettuce", "Tomatoes", "Red onion", "Cilantro", "Avocado", "Lime", "Cumin"],
    minutes: 20,
    lines: ["200 g ground turkey", "1 head butter lettuce", "2 tomatoes", "¼ red onion", "Small bunch cilantro", "1 avocado", "1 lime", "1 tsp cumin", "½ tsp smoked paprika", "1 tsp olive oil", "Salt"],
    steps: [
      "Brown the turkey in the oil over medium-high heat, breaking it up, about 6 minutes. Add the cumin, paprika and a big pinch of salt and cook 1 minute more.",
      "Dice the tomatoes and onion, chop the cilantro, and mix with half the lime juice and a pinch of salt for pico de gallo.",
      "Slice the avocado and squeeze the rest of the lime over it.",
      "Spoon the turkey into lettuce cups and top with pico and avocado.",
    ],
  },
  {
    slot: "meal2",
    name: "Sweet potato & kale bowl",
    description: "Roasted sweet potato, massaged kale, red cabbage and avocado with a lime dressing.",
    ingredients: ["Sweet potato", "Kale", "Red cabbage", "Avocado", "Lime", "Olive oil"],
    minutes: 35,
    lines: ["1 medium sweet potato", "1 bunch kale, stems removed", "1 cup red cabbage, shredded", "½ avocado", "1 lime", "2 tbsp olive oil", "½ tsp chili flakes", "Salt"],
    steps: [
      "Heat the oven to 425°F (220°C). Cube the sweet potato, toss with 1 tbsp oil, chili and salt, and roast 25–30 minutes until caramelised.",
      "Tear the kale, add half the lime juice, the rest of the oil and a pinch of salt, and massage with your hands for 1 minute until it softens.",
      "Toss the cabbage into the kale.",
      "Top with the warm sweet potato and sliced avocado, and squeeze over the last of the lime.",
    ],
  },
  {
    slot: "meal2",
    name: "Greek salad with grilled shrimp",
    description: "Tomato, cucumber, pepper, red onion and olives with garlicky grilled shrimp. No pita.",
    ingredients: ["Shrimp", "Tomatoes", "Cucumber", "Peppers", "Red onion", "Kalamata olives", "Oregano", "Olive oil"],
    minutes: 20,
    lines: ["200 g large shrimp, peeled", "1 garlic clove, grated", "3 ripe tomatoes", "1 cucumber", "1 green pepper", "¼ red onion", "10 Kalamata olives", "1 tsp dried oregano", "3 tbsp olive oil", "1 tbsp red wine vinegar", "Salt"],
    steps: [
      "Toss the shrimp with the garlic, 1 tbsp oil and a pinch of salt. Grill or sear over high heat 1–2 minutes a side until pink.",
      "Cut the tomatoes, cucumber and pepper into big chunks; slice the onion thin.",
      "Toss the vegetables and olives with the rest of the oil, the vinegar, oregano and salt.",
      "Pile the shrimp on top.",
    ],
  },
  {
    slot: "meal2",
    name: "Thai crunch salad",
    description: "Shredded cabbage, carrot, edamame, cucumber and herbs with a lime-ginger dressing.",
    ingredients: ["Napa cabbage", "Carrots", "Edamame", "Cucumber", "Cilantro", "Mint", "Ginger", "Lime"],
    minutes: 15,
    lines: ["3 cups Napa cabbage, finely shredded", "1 carrot, julienned", "¾ cup shelled edamame", "½ cucumber, julienned", "Handful cilantro", "Handful mint", "1 tsp grated ginger", "1 lime", "1 tbsp tamari", "1 tsp toasted sesame oil"],
    steps: [
      "Cook the edamame in boiling water for 3 minutes, drain and cool.",
      "Whisk the ginger, lime juice, tamari and sesame oil.",
      "Toss the cabbage, carrot, cucumber, edamame and torn herbs with the dressing and let it sit 5 minutes before eating.",
    ],
  },

  // Meal 3 — evening plates, same rule: protein + veg, or starch + veg
  {
    slot: "meal3",
    name: "Lemon-herb salmon with asparagus",
    description: "Pan-seared salmon with roasted asparagus and a big green salad. No rice.",
    ingredients: ["Salmon fillets", "Asparagus", "Lemon", "Dill", "Mixed greens", "Olive oil"],
    minutes: 20,
    lines: ["1 salmon fillet (about 180 g)", "1 bunch asparagus, ends snapped", "1 lemon", "2 tbsp chopped dill", "2 handfuls mixed greens", "2 tbsp olive oil", "Salt and pepper"],
    steps: [
      "Heat the oven to 425°F (220°C). Toss the asparagus with 1 tsp oil and salt and roast 10–12 minutes.",
      "Pat the salmon dry and season. Sear skin-side down in 1 tsp oil over medium-high heat for 4–5 minutes until crisp, flip and cook 2 minutes more.",
      "Off the heat, squeeze half the lemon over the salmon and scatter the dill.",
      "Dress the greens with the rest of the lemon and oil and serve everything together.",
    ],
  },
  {
    slot: "meal3",
    name: "Zucchini noodles with turkey meatballs",
    description: "Spiralised zucchini, fresh tomato-basil sauce and baked turkey meatballs. No pasta.",
    ingredients: ["Zucchini", "Ground turkey", "Tomatoes", "Basil", "Garlic", "Olive oil"],
    minutes: 35,
    lines: ["250 g ground turkey", "2 medium zucchini", "4 ripe tomatoes (or 1 can whole tomatoes)", "Handful basil", "2 garlic cloves", "1 egg", "1 tbsp olive oil", "½ tsp dried oregano", "Salt and pepper"],
    steps: [
      "Heat the oven to 400°F (200°C). Mix the turkey, egg, half the garlic (grated), oregano, salt and pepper; roll into 10 balls and bake on a lined tray 18–20 minutes.",
      "Sizzle the remaining garlic, sliced, in the oil. Add the chopped tomatoes and a pinch of salt and simmer 15 minutes, crushing them as they soften. Tear in the basil.",
      "Spiralise the zucchini and toss in a hot pan for 1–2 minutes — just warmed, not soggy.",
      "Top the noodles with the sauce and meatballs.",
    ],
  },
  {
    slot: "meal3",
    name: "Roasted vegetable & chickpea tray",
    description: "Cauliflower, carrots, red onion and chickpeas roasted with cumin, over spinach with tahini.",
    ingredients: ["Cauliflower", "Carrots", "Red onion", "Chickpeas", "Spinach", "Tahini", "Cumin"],
    minutes: 40,
    lines: ["½ head cauliflower, in florets", "2 carrots, in batons", "1 red onion, in wedges", "1 can chickpeas, drained and dried", "3 handfuls spinach", "2 tbsp tahini", "½ lemon", "1½ tsp cumin", "2 tbsp olive oil", "Salt"],
    steps: [
      "Heat the oven to 425°F (220°C). Toss the cauliflower, carrots, onion and chickpeas with the oil, cumin and salt on a big tray.",
      "Roast 30–35 minutes, turning once, until the edges char and the chickpeas crisp.",
      "Whisk the tahini with the lemon juice, a pinch of salt and water until drizzly.",
      "Pile the hot vegetables on the spinach so it wilts a little, and drizzle with tahini.",
    ],
  },
  {
    slot: "meal3",
    name: "Grilled chicken with broccolini & greens",
    description: "Herb-marinated chicken thighs with charred broccolini and an arugula salad.",
    ingredients: ["Chicken thighs", "Broccolini", "Arugula", "Lemon", "Garlic", "Rosemary", "Olive oil"],
    minutes: 30,
    lines: ["2 boneless chicken thighs", "1 bunch broccolini", "2 handfuls arugula", "1 lemon", "2 garlic cloves, grated", "1 sprig rosemary, chopped", "2 tbsp olive oil", "Salt and pepper"],
    steps: [
      "Rub the chicken with the garlic, rosemary, half the lemon juice, 1 tbsp oil, salt and pepper. Leave 10 minutes (or overnight).",
      "Grill or pan-sear the thighs over medium-high heat 5–6 minutes a side until cooked through. Rest 5 minutes.",
      "Char the broccolini in the same pan with a splash of water, 4–5 minutes.",
      "Dress the arugula with the rest of the lemon and oil, and serve with the sliced chicken and broccolini.",
    ],
  },
  {
    slot: "meal3",
    name: "Stuffed bell peppers with wild rice",
    description: "Peppers filled with wild rice, mushrooms, spinach and herbs, with a side of greens. No meat.",
    ingredients: ["Peppers", "Wild rice", "Mushrooms", "Spinach", "Onion", "Parsley", "Mixed greens"],
    minutes: 60,
    lines: ["2 red peppers", "½ cup wild rice blend", "150 g mushrooms, chopped", "2 handfuls spinach", "½ onion, diced", "Small bunch parsley", "2 handfuls mixed greens", "1 tbsp olive oil", "Salt and pepper"],
    steps: [
      "Simmer the wild rice in plenty of salted water for 40 minutes until tender; drain.",
      "Heat the oven to 400°F (200°C). Cut the tops off the peppers and scoop out the seeds.",
      "Soften the onion in the oil, add the mushrooms and cook until golden, then wilt in the spinach. Stir in the rice and chopped parsley and season well.",
      "Pack the filling into the peppers, stand them in a dish and bake 25 minutes. Serve with the greens.",
    ],
  },
  {
    slot: "meal3",
    name: "Cod in tomato & fennel broth",
    description: "Flaky cod poached in a light tomato-fennel broth with green beans.",
    ingredients: ["Cod fillets", "Fennel", "Tomatoes", "Garlic", "Green beans", "Parsley", "Olive oil"],
    minutes: 30,
    lines: ["1 cod fillet (about 180 g)", "1 small fennel bulb, thinly sliced", "2 tomatoes, chopped", "2 garlic cloves, sliced", "1 cup green beans, trimmed", "Small bunch parsley", "1 cup vegetable broth", "1 tbsp olive oil", "Salt"],
    steps: [
      "Soften the fennel and garlic in the oil over medium heat for 8 minutes.",
      "Add the tomatoes and broth and simmer 10 minutes.",
      "Add the green beans, then nestle in the salted cod. Cover and simmer gently 6–8 minutes until it flakes.",
      "Ladle into a wide bowl and scatter with parsley.",
    ],
  },
  {
    slot: "meal3",
    name: "Big green vegetable curry",
    description: "Coconut curry with spinach, zucchini, green beans and peas over cauliflower rice.",
    ingredients: ["Spinach", "Zucchini", "Green beans", "Peas", "Cauliflower", "Coconut milk", "Green curry paste", "Lime"],
    minutes: 30,
    lines: ["2 tbsp green curry paste", "1 can (400 ml) light coconut milk", "1 zucchini, in half-moons", "1 cup green beans, cut in thirds", "½ cup peas", "3 handfuls spinach", "½ head cauliflower", "1 lime", "Handful Thai basil or cilantro"],
    steps: [
      "Fry the curry paste in a splash of the coconut milk's cream for 1 minute, then add the rest of the can and ½ cup water.",
      "Simmer the zucchini and green beans in it 6 minutes; add the peas and spinach for the last 2.",
      "Grate or pulse the cauliflower into rice and steam or pan-fry it for 4 minutes.",
      "Finish the curry with lime juice and herbs, and spoon over the cauliflower rice.",
    ],
  },
  {
    slot: "meal3",
    name: "Steak salad with chimichurri",
    description: "Sliced grilled flank steak over romaine, tomatoes and cucumber with chimichurri. No potatoes.",
    ingredients: ["Flank steak", "Romaine", "Tomatoes", "Cucumber", "Parsley", "Garlic", "Red wine vinegar", "Olive oil"],
    minutes: 25,
    lines: ["200 g flank steak", "1 romaine heart", "1 cup cherry tomatoes", "½ cucumber", "Big bunch parsley", "1 garlic clove", "1 tbsp red wine vinegar", "3 tbsp olive oil", "Pinch chili flakes", "Salt and pepper"],
    steps: [
      "Season the steak well and sear in a very hot pan 3–4 minutes a side for medium-rare. Rest 5 minutes.",
      "Finely chop the parsley and garlic and stir with the vinegar, oil, chili and salt to make chimichurri.",
      "Chop the romaine, halve the tomatoes and slice the cucumber.",
      "Slice the steak thinly against the grain, lay it over the salad and spoon over the chimichurri.",
    ],
  },
  {
    slot: "meal3",
    name: "Minestrone verde",
    description: "Brothy spring vegetable soup — zucchini, leeks, peas, white beans and kale with pesto.",
    ingredients: ["Zucchini", "Leeks", "Peas", "Cannellini beans", "Kale", "Basil", "Vegetable broth"],
    minutes: 35,
    lines: ["1 leek, sliced", "1 zucchini, diced", "½ cup peas", "1 can cannellini beans, drained", "2 handfuls kale, chopped", "4 cups vegetable broth", "Big handful basil", "1 garlic clove", "3 tbsp olive oil", "Salt"],
    steps: [
      "Soften the leek in 1 tbsp oil with a pinch of salt for 6 minutes.",
      "Add the zucchini and broth and simmer 10 minutes. Add the beans, peas and kale and simmer 5 more.",
      "Pound or blend the basil, garlic, a pinch of salt and the rest of the oil into a quick pesto.",
      "Ladle the soup into bowls and swirl in the pesto.",
    ],
  },
];
