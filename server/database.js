import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const itemColumns = 'id, type, title, category, location, contact, description AS desc, date';

export function createItemsDatabase(dataDirectory, defaultItemsFile) {
  mkdirSync(dataDirectory, { recursive: true });
  const database = new Database(path.join(dataDirectory, 'campus-trace.sqlite'));
  database.pragma('journal_mode = WAL');
  database.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      location TEXT NOT NULL,
      contact TEXT NOT NULL,
      description TEXT NOT NULL,
      date TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    )
  `);

  const columns = database.prepare('PRAGMA table_info(items)').all();
  if (!columns.some((column) => column.name === 'sort_order')) {
    database.exec('ALTER TABLE items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
    database.exec('UPDATE items SET sort_order = id');
  }

  const itemCount = database.prepare('SELECT COUNT(*) AS count FROM items').get().count;
  if (itemCount === 0) {
    const legacyItemsFile = path.join(dataDirectory, 'items.json');
    const sourceFile = existsSync(legacyItemsFile) ? legacyItemsFile : defaultItemsFile;
    const items = JSON.parse(readFileSync(sourceFile, 'utf8'));
    if (!Array.isArray(items)) throw new Error('Campus records must be a JSON array.');

    const insertItem = database.prepare(`
      INSERT INTO items (id, type, title, category, location, contact, description, date, sort_order)
      VALUES (@id, @type, @title, @category, @location, @contact, @desc, @date, @sort_order)
    `);
    database.transaction((seedItems) => {
      for (const [index, item] of seedItems.entries()) {
        insertItem.run({ ...item, sort_order: seedItems.length - index });
      }
    })(items);
  }

  const listItems = database.prepare(`SELECT ${itemColumns} FROM items ORDER BY sort_order DESC`);
  const getItem = database.prepare(`SELECT ${itemColumns} FROM items WHERE id = ?`);
  const insertItem = database.prepare(`
    INSERT INTO items (id, type, title, category, location, contact, description, date, sort_order)
    VALUES (@id, @type, @title, @category, @location, @contact, @desc, @date, @sort_order)
  `);
  const updateItem = database.prepare(`
    UPDATE items
    SET type = @type, title = @title, category = @category, location = @location,
        contact = @contact, description = @desc
    WHERE id = @id
  `);
  const deleteItem = database.prepare('DELETE FROM items WHERE id = ?');
  const deleteAllItems = database.prepare('DELETE FROM items');

  return {
    list: () => listItems.all(),
    get: (id) => getItem.get(id),
    create: (item) => insertItem.run(item),
    update: (item) => updateItem.run(item),
    delete: (id) => deleteItem.run(id),
    replaceAll: (items) => database.transaction((replacementItems) => {
      deleteAllItems.run();
      for (const [index, item] of replacementItems.entries()) {
        insertItem.run({ ...item, sort_order: replacementItems.length - index });
      }
    })(items),
    nextSortOrder: () => database.prepare(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS sort_order FROM items',
    ).get().sort_order,
    nextId: () => Math.max(
      Date.now(),
      (database.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM items').get().id) + 1,
    ),
    close: () => database.close(),
  };
}
