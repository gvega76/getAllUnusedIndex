// Extract the user and password from the provided connection string
const inputURI = process.argv[2];
const credentialsPattern = /\/\/([^:]+):([^@]+)@/;
const match = inputURI.match(credentialsPattern);

if (!match) {
  throw new Error("Invalid connection string. Expected format: mongodb[+srv]://user:password@URI/database");
}

const user = match[1];
const password = match[2];

// Extract dbname from connection string if present
let dbNameFromURI = null;
const dbNameMatch = inputURI.match(/\/([^/?]+)(\?|$)/);
if (dbNameMatch && dbNameMatch[1] && !dbNameMatch[1].includes('@')) {
  dbNameFromURI = dbNameMatch[1];
}

const servers = rs.status().members;
const nodes = servers.length;
const sysColls = [
  "system.roles",
  "system.users",
  "system.version",
  "system.namespaces",
  "system.indexes",
  "system.profile",
  "system.js",
  "system.views",
];

const unusedIndexDict = {};

// Iterate over each server/node in the replica set
servers.forEach((server) => {
  // Construct a new connection string using the extracted credentials and current server hostname
  let connectionString;
  if (inputURI.startsWith('mongodb+srv://')) {
    connectionString = `mongodb://${user}:${password}@${server.name}/admin?directConnection=true&tls=true`;
  } else {
    connectionString = `mongodb://${user}:${password}@${server.name}/admin?directConnection=true`;
  }
  const cluster = Mongo(connectionString);
  cluster.setReadPref("nearest");
  const adminDB = cluster.getDB("admin");

  let appDBs;
  if (dbNameFromURI) {
    appDBs = [dbNameFromURI];
  } else {
    const { databases } = adminDB.adminCommand({ listDatabases: 1, nameOnly: true });
    appDBs = databases
      .map((db) => db.name)
      .filter((dbName) => !["admin", "local", "config"].includes(dbName));
  }

  appDBs.forEach((dbName) => {
    const currDB = adminDB.getSiblingDB(dbName);
    const collInfos = currDB.getCollectionInfos();

    collInfos.forEach((coll) => {
      // Skip system collections and views
      if (sysColls.includes(coll.name) || coll.type === "view") {
        return;
      }

      const currColl = currDB.getCollection(coll.name);

      // Process only collections (coll.type undefined or "collection")
      if (!coll.type || coll.type === "collection") {
        const statsCursor = currColl.aggregate([
          { $indexStats: {} },
          { $match: { "accesses.ops": 0 } },
          { $project: { name: 1, accesses: 1, key: 1 } },
        ]);

        while (statsCursor.hasNext()) {
          const ixStats = statsCursor.next();
          const key = `${dbName}.${coll.name}.${ixStats.name}`;
          unusedIndexDict[key] = (unusedIndexDict[key] || 0) + 1;
        }
      }
    });
  });
});

const notUsed = Object.keys(unusedIndexDict)
  .filter((key) => unusedIndexDict[key] === nodes)
  .reduce((obj, key) => {
    obj[key] = unusedIndexDict[key];
    return obj;
  }, {});

// Output as CSV
const csvRows = ["Database,Collection,IndexName"];
Object.keys(notUsed).forEach((key) => {
  const [db, coll, idx] = key.split('.');
  csvRows.push(`${db},${coll},${idx}`);
});
print(csvRows.join('\n'));

