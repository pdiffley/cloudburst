# How do we handle document ids
Every document has a collection_parent_path, collection_id, document_id.
The collection_parent_path for root level collections is "/"

We could have a table mapping full document identifiers to a uuid which would be used in other tables. This is potentially slightly more space efficient, but would then require joins for almost all operations, which we would like to avoid. This approach would also limit the flexibility of queries at the collection and collection_group level.

Instead we will include the full set of identifiers for a document (collection_parent_path, collection_id, and document_id) in rows that require a document id.
