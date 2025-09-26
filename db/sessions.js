const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI is not defined in environment variables.');
}

const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 5000,
});

let cachedDb;
let cachedCollection;

async function connect() {
  if (cachedDb) {
    return cachedDb;
  }

  await client.connect();
  const database = client.db(process.env.MONGODB_DATABASE || 'sessions');
  cachedDb = database;
  return cachedDb;
}

async function getSessionsCollection() {
  if (cachedCollection) {
    return cachedCollection;
  }

  const db = await connect();
  const collection = db.collection(process.env.MONGODB_COLLECTION || 'sessions');
  cachedCollection = collection;
  return cachedCollection;
}

module.exports = {
  connect,
  getSessionsCollection,
};