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
  // Connect to the cluster; optionally, use the specific node by uncommenting below:
  // const cluster = Mongo(`mongodb://usuario:password@${server.name}/admin`);
  const cluster = Mongo(process.argv[2]);
  cluster.setReadPref("nearest");
  const adminDB = cluster.getDB("admin");

  const { databases } = adminDB.adminCommand({ listDatabases: 1, nameOnly: true });

  // Filter out admin, local and config databases
  const appDBs = databases
    .map((db) => db.name)
    .filter((dbName) => !["admin", "local", "config"].includes(dbName));

  appDBs.forEach((dbName) => {
    const currDB = adminDB.getSiblingDB(dbName);
    const collInfos = currDB.getCollectionInfos();

    collInfos.forEach((coll) => {
      // Skip system collections and views
      if (sysColls.includes(coll.name) || coll.type === "view") {
        return;
      }

      const currColl = currDB.getCollection(coll.name);

      // Only process collections (coll.type undefined or "collection")
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

console.table(notUsed);