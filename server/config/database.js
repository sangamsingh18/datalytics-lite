// Use: Connects Node.js to MongoDB.
// centralizes the database connection logic."
const mongoose = require('mongoose');
const env = require('./environment');
const { Dataset } = require('../models/Dataset');

let db = null;

// In-memory fallback collections for development when MongoDB is not running locally
const inMemoryStore = {
  users: [],
  datasets: [],
  chats: [],
  payments: [],
};

function matchesQuery(doc, query = {}) {
  if (!doc) return false;
  return Object.entries(query).every(([k, v]) => {
    if (doc[k] === v) return true;
    if (doc[k] == null || v == null) return doc[k] === v;
    return String(doc[k]) === String(v);
  });
}

const createInMemoryCollection = (collectionName) => ({
  async findOne(query = {}, options = {}) {
    const list = inMemoryStore[collectionName] || [];
    const item = list.find((doc) => matchesQuery(doc, query));
    if (!item) return null;
    const res = { ...item };
    if (options.projection) {
      Object.keys(options.projection).forEach((key) => {
        if (!options.projection[key]) delete res[key];
      });
    }
    return res;
  },
  async insertOne(doc) {
    const newDoc = { _id: Date.now().toString(), ...doc };
    if (!inMemoryStore[collectionName]) inMemoryStore[collectionName] = [];
    inMemoryStore[collectionName].push(newDoc);
    return { insertedId: newDoc._id };
  },
  async updateOne(query = {}, update = {}) {
    const list = inMemoryStore[collectionName] || [];
    const item = list.find((doc) => matchesQuery(doc, query));
    if (item && update.$set) {
      Object.assign(item, update.$set);
    }
    return { modifiedCount: item ? 1 : 0, matchedCount: item ? 1 : 0 };
  },
  async replaceOne(query = {}, doc = {}, options = {}) {
    if (!inMemoryStore[collectionName]) inMemoryStore[collectionName] = [];
    const list = inMemoryStore[collectionName];
    const idx = list.findIndex((d) => matchesQuery(d, query));
    const itemWithId = { _id: (idx >= 0 ? list[idx]._id : Date.now().toString()), ...doc };
    if (idx >= 0) {
      list[idx] = itemWithId;
    } else if (options.upsert) {
      list.push(itemWithId);
    }
    return { upsertedId: itemWithId._id };
  },
  find(query = {}, options = {}) {
    let list = inMemoryStore[collectionName] || [];
    list = list.filter((doc) => matchesQuery(doc, query));
    return {
      sort() {
        return this;
      },
      limit(n) {
        list = list.slice(0, n);
        return this;
      },
      async toArray() {
        return list.map((doc) => {
          const res = { ...doc };
          if (options.projection) {
            Object.keys(options.projection).forEach((k) => {
              if (!options.projection[k]) delete res[k];
            });
          }
          return res;
        });
      },
    };
  },
});

const inMemoryDB = {
  collection(name) {
    return createInMemoryCollection(name);
  },
  async command() {
    return { ok: 1 };
  },
};

async function connectDB() {
  if (db) return db;
  await mongoose.connect(env.mongodbUri, {
    dbName: env.mongodbDb,
    serverSelectionTimeoutMS: 2000,
  });
  db = mongoose.connection.db;
  return db;
}

function getDB() {
  return db || inMemoryDB;
}

function isMongoConnected() {
  return Boolean(db && mongoose.connection.readyState === 1);
}

/** Save dataset JSON to MongoDB. Mirrors save_dataset() in database.py. */
async function saveDataset(sessionId, filename, jsonData, meta) {
  const database = getDB();
  const datasetData = {
    session_id: sessionId,
    filename,
    data: jsonData,
    meta,
  };
  if (isMongoConnected()) {
    const saved = await Dataset.findOneAndUpdate(
      { session_id: sessionId },
      { $set: datasetData, $setOnInsert: { created_at: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    return String(saved._id);
  }
  const doc = new Dataset(datasetData).toObject();
  const result = await database.collection('datasets').replaceOne(
    { session_id: sessionId },
    doc,
    { upsert: true }
  );
  return String(result.upsertedId || sessionId);
}

/** Retrieve dataset document for a session. Mirrors get_dataset(). */
async function getDataset(sessionId) {
  if (isMongoConnected()) {
    return Dataset.findOne({ session_id: sessionId }).lean();
  }
  const database = getDB();
  return database.collection('datasets').findOne({ session_id: sessionId });
}

/** Append a chat message to the session's history. Mirrors save_chat_message(). */
async function saveChatMessage(sessionId, role, content) {
  const database = getDB();
  await database.collection('chats').insertOne({
    session_id: sessionId,
    role,
    content,
  });
}

/** Get last N chat messages for a session, oldest first. Mirrors get_chat_history(). */
async function getChatHistory(sessionId, limit = 20) {
  const database = getDB();
  const docs = await database
    .collection('chats')
    .find({ session_id: sessionId }, { projection: { _id: 0, role: 1, content: 1 } })
    .sort({ _id: -1 })
    .limit(limit)
    .toArray();
  return docs.reverse();
}

/** Test MongoDB connectivity. Mirrors ping_db(). */
async function pingDB() {
  try {
    await getDB().command({ ping: 1 });
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  connectDB,
  getDB,
  isMongoConnected,
  saveDataset,
  getDataset,
  saveChatMessage,
  getChatHistory,
  pingDB,
};
