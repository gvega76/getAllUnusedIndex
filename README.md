# getAllUnusedIndex
Get the list of indexes that are not used in all the nodes in a Replica Set (only works for Replica Sets)
As It is, it requires the user name and password in the connection strings. 

# usage
To get indexes not used all DBs <br />
mongosh "mongodb://username:password@host"  getAllUnusedIndexesV2.js  <br />
To get information only for one DB <br />
mongosh "mongodb://username:password@host/DBNAME"  getAllUnusedIndexesV2.js <br />
mongosh "mongodb+srv://USERNAE:PASSWORD@clusterdm.eehyp.mongodb.net/DBNAME" getAllUnusedIndexesV2.js

