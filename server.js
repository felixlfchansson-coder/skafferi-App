const express = require("express");
const fs = require("fs");

const app = express();
const port = 3000;

app.use(express.json());

// Läs JSON-filer
const pantryText = fs.readFileSync("./data/pantry.json", "utf8");
const recipesText = fs.readFileSync("./data/recipes.json", "utf8");
const shoppingListText = fs.readFileSync("./data/shopping-list.json", "utf8");

// Gör text till JavaScript-data
const pantry = JSON.parse(pantryText);
const recipes = JSON.parse(recipesText);
const shoppingList = JSON.parse(shoppingListText);

// Routes
app.get("/", (req, res) => {
    res.send("Servern fungerar!");
});

app.get("/pantry", (req, res) => {
    res.json(pantry);
});

app.post("/pantry", (req, res) => {

    const newItem = req.body;

    pantry[newItem.location].push({
        id: Date.now(),
        name: newItem.name,
        quantity: newItem.quantity,
        amount: newItem.amount,
        unit: newItem.unit
    });

    fs.writeFileSync(
        "./data/pantry.json",
        JSON.stringify(pantry, null, 4)
    );

    res.json({
        message: "Vara tillagd",
        item: newItem
    });

});

app.get("/recipes", (req, res) => {
    res.json(recipes);
});

app.get("/shopping-list", (req, res) => {
    res.json(shoppingList);
});

// Starta servern
app.listen(port, () => {
    console.log(`Servern körs på http://localhost:${port}`);
});
