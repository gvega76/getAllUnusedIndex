# getAllUnusedIndex
Get the list of indexes that are not used in all the nodes in a Replica Set (only works for Replica Sets)
As It is, it requires the user name and password in the connection strings. 

# usage
To get indexes not used all DBs <br />
<pre><code>mongosh "mongodb://username:password@host"  getAllUnusedIndexesV2.js  <br /></code></pre>
To get information only for one DB <br />
<pre><code>
mongosh "mongodb://username:password@host/DBNAME"  getAllUnusedIndexesV2.js <br />
mongosh "mongodb+srv://USERNAE:PASSWORD@cluster/DBNAME" getAllUnusedIndexesV2.js </code></pre>

