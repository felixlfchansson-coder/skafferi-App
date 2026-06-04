const express = require("express");

// Istället för fs (filsystem) importerar vi nu vår databas.
// db-objektet har allt vi behöver för att läsa och skriva data.
const db = require("./database");

const app = express();
const port = 3000;

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

app.use(express.json());

// ─────────────────────────────────────────
// Rot-route
// ─────────────────────────────────────────

app.get("/", (req, res) => {
    res.send("Servern fungerar!");
});

// ─────────────────────────────────────────
// PANTRY
// ─────────────────────────────────────────

// Hämta hela skafferiet
// db.prepare() förbereder en SQL-fråga.
// .all() kör frågan och returnerar ALLA matchande rader som en array.
app.get("/pantry", (req, res) => {
    const items = db.prepare("SELECT * FROM pantry").all();

    // Vi grupperar raderna efter location så svaret liknar det gamla JSON-formatet.
    // reduce() bygger upp ett objekt steg för steg — en rad i taget.
    const grouped = items.reduce((result, item) => {
        if (!result[item.location]) result[item.location] = [];
        result[item.location].push(item);
        return result;
    }, { kyl: [], frys: [], skafferi: [] });

    res.json(grouped);
});

// Lägg till vara
// .run() kör en fråga som ÄNDRAR data (INSERT, UPDATE, DELETE).
// ? är platshållare — värden skickas in separat för att förhindra SQL-injection.
// SQL-injection = när någon skickar elak kod i ett textfält för att hacka databasen.
app.post("/pantry", (req, res) => {
    const { location, name, quantity, amount, unit } = req.body;

    if (!name) {
        return res.status(400).json({ error: "name krävs" });
    }

    const result = db.prepare(`
        INSERT INTO pantry (name, location, quantity, amount, unit)
        VALUES (?, ?, ?, ?, ?)
    `).run(name, location, quantity ?? null, amount ?? null, unit ?? "");

    // result.lastInsertRowid är id:t som databasen gav den nya raden automatiskt.
    const newItem = db.prepare("SELECT * FROM pantry WHERE id = ?").get(result.lastInsertRowid);

    res.status(201).json({ message: "Vara tillagd", item: newItem });
});

// Uppdatera vara
// .get() kör en fråga och returnerar EN rad (eller undefined om den inte finns).
app.put("/pantry/:id", (req, res) => {
    const { id } = req.params;
    const { name, quantity, amount, unit } = req.body;

    const item = db.prepare("SELECT * FROM pantry WHERE id = ?").get(id);

    if (!item) {
        return res.status(404).json({ error: "Varan hittades inte" });
    }

    // Vi använder ?? för att behålla gamla värdet om inget nytt skickas in.
    // Exempel: om man bara skickar { quantity: 5 } behålls name, amount och unit som de var.
    db.prepare(`
        UPDATE pantry SET name = ?, quantity = ?, amount = ?, unit = ?
        WHERE id = ?
    `).run(
        name ?? item.name,
        quantity ?? item.quantity,
        amount ?? item.amount,
        unit ?? item.unit,
        id
    );

    const updatedItem = db.prepare("SELECT * FROM pantry WHERE id = ?").get(id);
    res.json({ message: "Vara uppdaterad", item: updatedItem });
});

// Ta bort vara
app.delete("/pantry/:id", (req, res) => {
    const { id } = req.params;

    const item = db.prepare("SELECT * FROM pantry WHERE id = ?").get(id);

    if (!item) {
        return res.status(404).json({ error: "Varan hittades inte" });
    }

    db.prepare("DELETE FROM pantry WHERE id = ?").run(id);

    res.json({ message: "Vara borttagen", item });
});

// ─────────────────────────────────────────
// RECIPES
// ─────────────────────────────────────────

// Hämta alla recept med ingredienser
app.get("/recipes", (req, res) => {
    const recipes = db.prepare("SELECT * FROM recipes").all();

    // För varje recept hämtar vi dess ingredienser från ingredients-tabellen.
    // WHERE recipe_id = ? filtrerar fram bara de ingredienser som tillhör detta recept.
    const recipesWithIngredients = recipes.map((recipe) => {
        const ingredients = db.prepare("SELECT * FROM ingredients WHERE recipe_id = ?").all(recipe.id);
        return {
            ...recipe,
            favorite: recipe.favorite === 1, // Omvandla 0/1 till false/true
            ingredients
        };
    });

    res.json({ customRecipes: recipesWithIngredients });
});

// Lägg till recept
// db.transaction() kör flera SQL-frågor som EN operation.
// Antingen lyckas ALLT, eller så sparas INGET.
// Perfekt här — vi vill inte spara ett recept utan ingredienser, eller tvärtom.
app.post("/recipes", (req, res) => {
    const { title, portions, cookingTime, instructions, ingredients } = req.body;

    if (!title) {
        return res.status(400).json({ error: "title krävs" });
    }
    if (!Array.isArray(ingredients) || ingredients.length === 0) {
        return res.status(400).json({ error: "ingredients måste vara en array med minst en ingrediens" });
    }

    const insertRecipe = db.prepare(`
        INSERT INTO recipes (title, portions, cooking_time, instructions)
        VALUES (?, ?, ?, ?)
    `);

    const insertIngredient = db.prepare(`
        INSERT INTO ingredients (recipe_id, name, amount, unit)
        VALUES (?, ?, ?, ?)
    `);

    // Allt inuti transaction() körs som ett block.
    const createRecipe = db.transaction(() => {
        const result = insertRecipe.run(
            title,
            portions ?? null,
            cookingTime ?? null,
            instructions ?? ""
        );

        const recipeId = result.lastInsertRowid;

        for (const ingredient of ingredients) {
            insertIngredient.run(recipeId, ingredient.name, ingredient.amount ?? null, ingredient.unit ?? "");
        }

        return recipeId;
    });

    const newId = createRecipe();
    const newRecipe = db.prepare("SELECT * FROM recipes WHERE id = ?").get(newId);
    const newIngredients = db.prepare("SELECT * FROM ingredients WHERE recipe_id = ?").all(newId);

    res.status(201).json({
        message: "Recept tillagt",
        recipe: { ...newRecipe, favorite: false, ingredients: newIngredients }
    });
});

// Favoritmarkera recept (toggle)
app.put("/recipes/:id/favorite", (req, res) => {
    const { id } = req.params;
    const recipe = db.prepare("SELECT * FROM recipes WHERE id = ?").get(id);

    if (!recipe) {
        return res.status(404).json({ error: "Receptet hittades inte" });
    }

    // Om favorite är 0 (false) byter vi till 1 (true), och tvärtom.
    const newFavorite = recipe.favorite === 1 ? 0 : 1;
    db.prepare("UPDATE recipes SET favorite = ? WHERE id = ?").run(newFavorite, id);

    res.json({ message: `Favorit: ${newFavorite === 1}`, recipeId: Number(id), favorite: newFavorite === 1 });
});

// Ta bort recept (ingredienser tas bort automatiskt via ON DELETE CASCADE)
app.delete("/recipes/:id", (req, res) => {
    const { id } = req.params;
    const recipe = db.prepare("SELECT * FROM recipes WHERE id = ?").get(id);

    if (!recipe) {
        return res.status(404).json({ error: "Receptet hittades inte" });
    }

    db.prepare("DELETE FROM recipes WHERE id = ?").run(id);

    res.json({ message: "Recept borttaget", recipe });
});

// Kolla vad som saknas i skafferiet för ett recept
app.get("/recipes/:id/missing", (req, res) => {
    const { id } = req.params;
    const recipe = db.prepare("SELECT * FROM recipes WHERE id = ?").get(id);

    if (!recipe) {
        return res.status(404).json({ error: "Receptet hittades inte" });
    }

    const ingredients = db.prepare("SELECT * FROM ingredients WHERE recipe_id = ?").all(id);

    // För varje ingrediens kollar vi om det finns en vara med samma namn i pantry.
    // LOWER() gör jämförelsen skiftlägesokänslig — "Mjölk" och "mjölk" matchar.
    const missing = ingredients.filter((ingredient) => {
        const found = db.prepare(`
            SELECT * FROM pantry WHERE LOWER(name) = LOWER(?)
        `).get(ingredient.name);
        return !found;
    });

    res.json({
        recipe: recipe.title,
        totalIngredients: ingredients.length,
        missingCount: missing.length,
        missing
    });
});

// ─────────────────────────────────────────
// SHOPPING LIST
// ─────────────────────────────────────────

// Hämta hela inköpslistan
app.get("/shopping-list", (req, res) => {
    const items = db.prepare("SELECT * FROM shopping_list").all();

    const grouped = items.reduce((result, item) => {
        if (!result[item.location]) result[item.location] = [];
        result[item.location].push(item);
        return result;
    }, { kyl: [], frys: [], skafferi: [] });

    res.json(grouped);
});

// Lägg till vara på inköpslistan
app.post("/shopping-list", (req, res) => {
    const { location, name, quantity, amount, unit } = req.body;

    if (!name) {
        return res.status(400).json({ error: "name krävs" });
    }

    const result = db.prepare(`
        INSERT INTO shopping_list (name, location, quantity, amount, unit)
        VALUES (?, ?, ?, ?, ?)
    `).run(name, location, quantity ?? null, amount ?? null, unit ?? "");

    const newItem = db.prepare("SELECT * FROM shopping_list WHERE id = ?").get(result.lastInsertRowid);

    res.status(201).json({ message: "Vara tillagd på inköpslistan", item: newItem });
});

// Ta bort vara från inköpslistan
app.delete("/shopping-list/:id", (req, res) => {
    const { id } = req.params;
    const item = db.prepare("SELECT * FROM shopping_list WHERE id = ?").get(id);

    if (!item) {
        return res.status(404).json({ error: "Varan hittades inte" });
    }

    db.prepare("DELETE FROM shopping_list WHERE id = ?").run(id);

    res.json({ message: "Vara borttagen från inköpslistan", item });
});

// ✨ Markera vara som köpt → flyttas automatiskt till skafferiet
app.put("/shopping-list/:id/bought", (req, res) => {
    const { id } = req.params;

    const item = db.prepare("SELECT * FROM shopping_list WHERE id = ?").get(id);

    if (!item) {
        return res.status(404).json({ error: "Varan hittades inte" });
    }

    // Kör borttagning från inköpslistan + flytt till pantry som en transaction.
    // Om något går fel sparas ingenting — varan ligger kvar på inköpslistan.
    const buyItem = db.transaction(() => {
        db.prepare("DELETE FROM shopping_list WHERE id = ?").run(id);

        // Kolla om varan redan finns i skafferiet
        const existing = db.prepare(`
            SELECT * FROM pantry WHERE LOWER(name) = LOWER(?) AND location = ?
        `).get(item.name, item.location);

        if (existing) {
            // Varan finns redan — lägg ihop quantity
            db.prepare("UPDATE pantry SET quantity = ? WHERE id = ?")
                .run((existing.quantity ?? 0) + (item.quantity ?? 1), existing.id);
        } else {
            // Ny vara — lägg till i skafferiet
            db.prepare(`
                INSERT INTO pantry (name, location, quantity, amount, unit)
                VALUES (?, ?, ?, ?, ?)
            `).run(item.name, item.location, item.quantity, item.amount, item.unit);
        }
    });

    buyItem();

    res.json({ message: `${item.name} flyttad till skafferiet`, item });
});

// Hämta alla unika varunamn för autokomplettering
app.get("/pantry/suggestions", (req, res) => {
    const suggestions = db.prepare(`
        SELECT DISTINCT name FROM pantry
        ORDER BY name ASC
    `).all();

    res.json(suggestions.map((row) => row.name));
});

// Sök efter produkter via Open Food Facts
app.get("/food/search", async (req, res) => {
    const query = req.query.q;

    if (!query) {
        return res.status(400).json({ error: "q krävs" });
    }

    try {
       const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'SkafferiApp/1.0 (kontakt@skafferi.se)'
            }
            });
        const data = await response.json();

        const products = data.products.map((p) => ({
            name: p.product_name || p.generic_name || query,
            brand: p.brands || null,
            amount: p.product_quantity || null,
            unit: p.quantity_unit || null,
            barcode: p.code || null,
            image: p.image_front_small_url || p.image_url || null,
        }));

        res.json(products);
    } catch (e) {
    console.log("FEL:", e.message);
    res.status(500).json({ error: "Kunde inte hämta produkter" });
}
});

// ─────────────────────────────────────────
// Starta servern
// ─────────────────────────────────────────

app.listen(port, () => {
    console.log(`Servern körs på http://localhost:${port}`);
});