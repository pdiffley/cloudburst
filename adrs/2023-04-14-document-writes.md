Our documnet write functions do most of the heavy lifting to supports Cloudburst's querying capabilities.
When we mutate a document, we need to update all of the corresponding lookup and subscription tables.

## What types of mutations do we support
1. delete document
2. upsert document
3. merge document (shallow and deep)

## What operations happen when a document is mutated?

The general process for all write operations is as follows
1. identify what changes are being made if there is an existing document
2. get the list of fields that are changing for this document
  a. categories for the way a field can change include (deletion, addition, modification)
2. update the document in the Documents table
3. update the simple and complex query lookup tables for the changed fields
4. get the list of subscriptions affected by the write


## Delete

The delete operation will check if a document exists in the database.
If does not, the delete is a no-op. 
If the document does existing, we load the existing document. The list of changing fields
is just the list of all fields in the document.

It is possible to delete all of the fields for the document from lookup tables without
reading the existing document, but updating the subscriptions requires looking up the 
existing document's fields.

## Upsert

If the document does not exist, all of the fields are new and we proceed as we did in the
deletion case (except that we are inserting rows).

If the document does exist, we first get the original document. We then do a diff on the fields
in the original and new document. This generates the list of fields which are being deleted, added, or modified.
With that we the update the lookup tables and get the list of affected subscriptions

## Merge

In the merge case, if a document exists, we first get the original document, then merge the 
new data into that document to get the final document. We then proceed as in the upsert case.

If there is no existing document, we proceed as in the upsert case.
