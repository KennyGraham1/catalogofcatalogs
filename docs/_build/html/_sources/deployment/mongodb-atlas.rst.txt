====================
MongoDB Atlas Setup
====================

Use MongoDB Atlas for production to ensure replica set support and reliable
transaction handling.

1. Create a cluster at https://www.mongodb.com/atlas
2. Create a database user with read/write permissions
3. Add your production IPs to the Network Access list
4. Copy the connection string from the driver configuration
5. Set ``MONGODB_URI`` and (optionally) ``MONGODB_DATABASE`` in your environment

Example connection string:

.. code-block:: text

   mongodb+srv://<username>:<password>@<cluster>.mongodb.net/earthquake_catalogue?retryWrites=true&w=majority

Ensure your deployment has the same database name configured as the application.
