# getAllUnusedIndex
Get the list of indexes that are not used in all the nodes in a Replica Set (only works for Replica Sets)

# usage
To get indexes not used all DBs
mongosh "mongodb://username:password@host"  getAllUnusedIndexesV2.js  
To get information only for one DB
mongosh "mongodb://username:password@host/DBNAME"  getAllUnusedIndexesV2.js

