## Schema

```sql
CREATE TABLE simple_query_lookup (
 collection_parent_path      TEXT,
 collection_id               TEXT,
 document_id                 TEXT,
 field_name                  TEXT,
 field_value                 field_value, -- We maybe want to blow this up, so that we don't need custom functions
 PRIMARY KEY (collection_parent_path, collection_id, document_id, field_name)
);


CREATE INDEX simple_query_idx ON simple_query_lookup(collection_id, field_name, field_value, collection_parent_path);
CREATE INDEX simple_query_deletion_idx ON simple_query_lookup(collection_parent_path, collection_id, document_id);


CREATE TABLE simple_query_subscriptions (
 collection_parent_path      TEXT,
 collection_id               TEXT,
 field_name                  TEXT,
 field_operator              TEXT, -- maybe an enum?
 field_value                 field_value,
 subscription_id             TEXT,
 PRIMARY KEY (subscription_id)
);


CREATE INDEX simple_query_collection_subscription_idx ON
simple_query_subscriptions(collection_id, field_name, field_operator, field_value, collection_parent_path);
```

## Queries
