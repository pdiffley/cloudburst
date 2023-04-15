# Simple Query Support

TODO: Convert to lightweight ADR format: https://github.com/joelparkerhenderson/architecture-decision-record/blob/main/templates/decision-record-template-by-michael-nygard/index.md

Do we offer the firestore support all fields option?

Pro: Avoids work of specifying new indexes before migrating to cloudburst

Con: Automatically supporting all fields dramatically affects performance

Provide the option of both?

Just more work and complexity, but is the best of both worlds.

Best plan

Allows people to start with the easy version and then optimize when they are scaled up or their requests are stable.

## Simple Query Support for All Fields

One table that supports queries for document ids based on a single field name and value (see schema review)

One table that supports looking up all subscribed queries on a document's field.

If automatic query support for all fields is on, 
on document write,
1. all fields in the document are added to the simple query look up table
2. we check for all possible subscriptions for all fields and operator combinations

on query,
1. the query results are returned

on subscription,
1. the subscription is added to the subscription table

If automatic query support is off, (todo: how do we track which fields are indexed for queries?)

on document write,
1. fields that support queries (for the documents collection and/or collection group) will be added
  to the simple query lookup table
2. we check for subscriptions on the supported field and operator combinations

on query,
1. the query results are returned if the query is supported

on subscription,
1. the subscription is added to the subscription table if the query is supported

