const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
const defaultDbName = (() => {
  if (!uri) return undefined;
  try {
    const pathName = new URL(uri).pathname;
    return pathName && pathName !== '/' ? pathName.slice(1) : undefined;
  } catch {
    return undefined;
  }
})();

let mongoClient = null;
let connectPromise = null;

async function getMongoClient() {
  if (!uri) {
    throw new Error('MONGODB_URI is not set');
  }

  if (mongoClient) {
    return mongoClient;
  }

  if (connectPromise) {
    return connectPromise;
  }

  const client = new MongoClient(uri);
  connectPromise = client.connect()
    .then(() => {
      mongoClient = client;
      connectPromise = null;
      return mongoClient;
    })
    .catch((err) => {
      connectPromise = null;
      mongoClient = null;
      throw err;
    });

  return connectPromise;
}

async function checkMongoConnection() {
  const client = await getMongoClient();
  if (!defaultDbName) {
    throw new Error('Database name is missing in MONGODB_URI');
  }
  await client.db(defaultDbName).command({ ping: 1 });
}

module.exports = {
  getMongoClient,
  checkMongoConnection,
};
