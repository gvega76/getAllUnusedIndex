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
const indexSinceDict = {};
const uptimes = [];

// Iterate over each server/node in the replica set
servers.forEach((server) => {
  // Construct a new connection string using the extracted credentials and current server hostname
  let connectionString;
  if (inputURI.startsWith('mongodb+srv://')) {
    connectionString = `mongodb://${user}:${password}@${server.name}/admin?directConnection=true&tls=true`;
  } else {
    connectionString = `mongodb://${user}:${password}@${server.name}/admin?directConnection=true`;
  }
  let cluster;
  let adminDB;
  try {
    cluster = Mongo(connectionString);
    cluster.setReadPref("nearest");
    adminDB = cluster.getDB("admin");
  } catch (e) {
    print(`Error connecting to node ${server.name}: ${e.message}`);
    // Continue with the next node
    return;
  }

  // Capture uptime for this node
  try {
    const serverStatus = adminDB.serverStatus();
    if (serverStatus && typeof serverStatus.uptime === 'number') {
      uptimes.push(serverStatus.uptime);
    }
  } catch (e) {
    print(`Warning: Could not get server status from ${server.name}: ${e.message}`);
  }

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
          // Record the most recent 'since' value for this index
          if (ixStats.accesses && ixStats.accesses.since) {
            if (!indexSinceDict[key] || new Date(ixStats.accesses.since) > new Date(indexSinceDict[key])) {
              indexSinceDict[key] = ixStats.accesses.since;
            }
          }
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

// Report lowest uptime
if (uptimes.length > 0) {
  const minUptimeSec = Math.min.apply(null, uptimes);
  const minUptimeHours = minUptimeSec / 3600;
  const minUptimeDays = minUptimeSec / 86400;
  print(`Lowest server uptime: ${minUptimeSec.toFixed(0)} seconds (${minUptimeHours.toFixed(2)} hours, ${minUptimeDays.toFixed(2)} days)`);
}
  // Output as CSV
const csvRows = ["Database,Collection,IndexName,MostRecentSince"];
Object.keys(notUsed).forEach((key) => {
  const [db, coll, idx] = key.split('.');
  let since = indexSinceDict[key] || '';
  // Convert to ISO format if possible
  if (since) {
    const dateObj = new Date(since);
    if (!isNaN(dateObj.getTime())) {
      since = dateObj.toISOString();
    }
  }
  csvRows.push(`${db},${coll},${idx},${since}`);
});

print(csvRows.join('\n'));


