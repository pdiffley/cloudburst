# Simple Query Support

## Status

Proposed

## Context

Firestore offers a feature that we'll call "automatic simple query indexing". A "simple query" in this context refers to any query that sorts or filters by only one document field. "Automatic" means that indexes for this category of queries are built for all collections, without users having to manually enable or configure them.

This document discusses the extent to which Cloudburst should implement an analogous feature.

### Tradeoffs

All query indexes in Cloudburst have write performance costs. Adding indexes automatically for all fields would incur a significant write performance cost by default for users. This is true even for use cases that require indexes for very few document fields.

In addition, this makes writes for large, deeply nested documents (like rich text documents) particularly slow, as indexes will need to be generated for each nested property on each write.

On the other hand, the ability to write arbitrary data to collections, and change the shape of that data over time without thinking about a "schema" or other aspects of data migration is a significant factor in the appeal of document stores like Cloudburst. Users will likely expect to be able to construct basic queries for their data without requiring initial setup.

## Decision

Cloudburst should support automatic simple query indexing out of the box, but allow users to opt out, and alternatively manually specify the fields that should be indexed for simple queries.

This should allow new users to develop their applications freely to start, and later choose to optimize, once their query patterns are more stable.

## Conseqeuences

As noted earlier, this will mean that out-of-the-box write performance will be worse, to support writing to indexes for all fields.

This adds a new configuration interface for Cloudburst, as users will need to be able to disable automatic simple query indexing. There will also need to be an interface for specifying which fields should be indexed for a given collection or collection group.

Cloudburst will maintain a table for simple query lookups, allowing lookup of documemt ids by field value. There will be another table that allows lookups of subscription ids by field name.

See the schema review for more detail on these tables.

Cloudburst will need to be able to quickly lookup the configuration for a project and condition its writes to these index tables on that configuration. We should allow this requirement to inform decisions about the Cloudburst configuration system.