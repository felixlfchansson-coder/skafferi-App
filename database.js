// Vi importerar better-sqlite3 som är ett paket för att prata med SQLite.
// SQLite är en databas som sparas som EN fil på din dator (pantry-app.db).
// Det är som JSON-filer fast mycket kraftfullare.
const Database = require("better-sqlite3");

// Här skapar vi (eller öppnar) databasfilen.
// Om filen inte finns skapar better-sqlite3 den automatiskt.
// Tänk på det som: const text = fs.readFileSync("fil.json") fast för en databas.
const db = new Database("./data/pantry-app.db");

// WAL = Write-Ahead Logging.
// En inställning som gör databasen snabbare och säkrare.
// Om servern kraschar mitt i en skrivning går ingen data förlorad.
// Du behöver inte förstå exakt hur det fungerar — bara att det alltid ska vara på.
db.pragma("journal_mode = WAL");

// ─────────────────────────────────────────
// TABELLER
// ─────────────────────────────────────────
//
// En databas är uppbyggd av TABELLER.
// En tabell är som ett Excel-ark — den har kolumner och rader.
//
// Exempel på hur pantry-tabellen ser ut:
//
// | id | name     | location | quantity | amount | unit |
// |----|----------|----------|----------|--------|------|
// |  1 | Mjölk    | kyl      | 2        | 1.5    | L    |
// |  2 | Kyckling | frys     | 1        | 500    | g    |
// |  3 | Pasta    | skafferi | 1        | 500    | g    |
//
// Varje RAD är en vara.
// Varje KOLUMN är ett fält (id, name, location osv).
//
// db.exec() kör SQL-kod. SQL är språket man använder för att
// skapa, läsa, uppdatera och ta bort data i en databas.

db.exec(`

    -- CREATE TABLE IF NOT EXISTS betyder:
    -- "Skapa den här tabellen, men bara om den inte redan finns."
    -- Det är viktigt! Annars skulle vi få ett fel varje gång servern startar.

    CREATE TABLE IF NOT EXISTS pantry (

        -- INTEGER = heltal (1, 2, 3...)
        -- PRIMARY KEY = varje rad har ett unikt id
        -- AUTOINCREMENT = databasen räknar upp id:t automatiskt (1, 2, 3...)
        -- Du slipper Date.now() — databasen sköter det!
        id          INTEGER PRIMARY KEY AUTOINCREMENT,

        -- TEXT = vanlig text
        -- NOT NULL = fältet måste ha ett värde, det får inte vara tomt
        name        TEXT    NOT NULL,

        -- CHECK() är en regel som databasen kontrollerar automatiskt.
        -- Om du försöker lägga till location = "garderob" vägrar databasen.
        -- Det är som validering, fast inbyggd i databasen istället för i server.js.
        location    TEXT    NOT NULL CHECK(location IN ('kyl', 'frys', 'skafferi')),

        -- REAL = decimaltal (1.5, 500.0...)
        -- Inget NOT NULL här = fältet får vara tomt (null är ok)
        quantity    REAL,
        amount      REAL,

        -- DEFAULT '' betyder att om man inte skickar med unit
        -- sätts det automatiskt till en tom textsträng istället för null
        unit        TEXT    DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS recipes (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        title        TEXT    NOT NULL,
        portions     INTEGER,
        cooking_time INTEGER,

        -- SQLite har ingen Boolean (sant/falskt).
        -- Istället används INTEGER: 0 = false, 1 = true.
        -- favorite = 0 betyder "inte favorit" som standard.
        favorite     INTEGER DEFAULT 0,
        instructions TEXT    DEFAULT ''
    );

    -- Varför en egen tabell för ingredienser?
    -- Ett recept har FLERA ingredienser.
    -- En databasrad kan inte innehålla en lista.
    -- Lösningen: varje ingrediens är en egen rad med recipe_id som
    -- pekar tillbaka på vilket recept den tillhör.
    --
    -- Exempel:
    -- | id | recipe_id | name         | amount | unit |
    -- |----|-----------|--------------|--------|------|
    -- |  1 |         1 | Köttfärs     | 500    | g    |
    -- |  2 |         1 | Tacokrydda   | 1      | påse |
    -- |  3 |         2 | Kycklingfilé | 600    | g    |
    --
    -- recipe_id 1 = Tacos, recipe_id 2 = Kycklinggryta

    CREATE TABLE IF NOT EXISTS ingredients (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,

        -- REFERENCES recipes(id) är en FOREIGN KEY.
        -- Det betyder: "recipe_id måste peka på ett id som finns i recipes-tabellen."
        -- Du kan inte lägga till en ingrediens till ett recept som inte existerar.
        --
        -- ON DELETE CASCADE betyder:
        -- "Om receptet tas bort, ta automatiskt bort alla dess ingredienser."
        -- Annars skulle det finnas ingredienser kvar som pekar på ingenting.
        recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,

        name      TEXT    NOT NULL,
        amount    REAL,
        unit      TEXT    DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS shopping_list (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        name      TEXT    NOT NULL,
        location  TEXT    NOT NULL CHECK(location IN ('kyl', 'frys', 'skafferi')),
        quantity  REAL,
        amount    REAL,
        unit      TEXT    DEFAULT ''
    );
`);

// Vi exporterar db-objektet så att server.js kan importera det.
// Det är samma princip som module.exports i andra filer.
// I server.js skriver vi: const db = require("./database");
module.exports = db;