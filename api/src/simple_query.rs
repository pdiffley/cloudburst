use postgres::{Transaction};
use uuid::Uuid;

use crate::protos::document_protos::Document;
use crate::security_rules::{Operation, operation_is_allowed, UserId};
use crate::security_rules::UserId::User;
use crate::sql_types::field_value;
use crate::utils::{field_value_proto_to_sql};
use crate::basic_read::get_document;

// TODO: Add security check when updating subscription data

pub fn simple_query(
  transaction: &mut Transaction,
  user_id: &UserId,
  collection_parent_path: &Option<String>,
  collection_id: &str,
  field_name: &str,
  field_operator: &str,
  field_value: &field_value,
) -> Vec<Document> {
  if let User(user_id) = user_id {
    assert!(operation_is_allowed(user_id, &Operation::List,
                                 &collection_parent_path,
                                 collection_id, &None));
  }

  let query_result;
  if let Some(collection_parent_path) = collection_parent_path {
    let query_string = format!("SELECT collection_parent_path, collection_id, document_id from simple_query_lookup where collection_parent_path = $1 and collection_id = $2 and field_name = $3 and field_value {} $4", field_operator);
    query_result = transaction.query(
      &query_string,
      &[&collection_parent_path, &collection_id, &field_name, &field_value])
  } else {
    let query_string = format!("SELECT collection_parent_path, collection_id, document_id from simple_query_lookup where collection_id = $1 and field_name = $2 and field_value {} $3", field_operator);
    query_result = transaction.query(
      &query_string,
      &[&collection_id, &field_name, &field_value])
  }
  query_result.unwrap().into_iter()
    .map(|row| get_document(transaction, user_id,row.get("collection_parent_path"),
                            row.get("collection_id"), row.get("document_id")).unwrap())
    .collect()
}

pub fn get_matching_simple_query_subscriptions(transaction: &mut Transaction, collection_parent_path: &str, collection_id: &str, document: &Document) -> Vec<String> {
  let operator_pairs = vec![("<", ">"), ("<=", ">="), ("=", "="), ("!=", "!="), (">", "<"), (">=", "<=")];

  let mut matching_subscriptions = vec![];
  for (field_name, field_value) in document.fields.iter() {
    let sql_field_value = field_value_proto_to_sql(field_value);
    for operator_pair in &operator_pairs {
      let collection_query = format!("select subscription_id from simple_query_subscriptions where collection_parent_path = $1 and collection_id = $2 and field_name = $3 and field_operator = $4 and field_value {} $5", operator_pair.1);
      let collection_subscriptions = transaction.query(
        &collection_query,
        &[&collection_parent_path, &collection_id, &field_name, &operator_pair.0, &sql_field_value],
      ).unwrap().into_iter().map(|x| x.get::<usize, String>(0));
      matching_subscriptions.extend(collection_subscriptions);

      let collection_group_query = format!("select subscription_id from simple_query_subscriptions where collection_parent_path IS NULL and collection_id = $1 and field_name = $2 and field_operator = $3 and field_value {} $4", operator_pair.1);
      let collection_group_subscriptions = transaction.query(
        &collection_group_query,
        &[&collection_id, &field_name, &operator_pair.0, &sql_field_value],
      ).unwrap().into_iter().map(|x| x.get::<usize, String>(0));
      matching_subscriptions.extend(collection_group_subscriptions)
    }
  }

  matching_subscriptions
}

pub fn add_document_to_simple_query_table(
  transaction: &mut Transaction,
  collection_parent_path: &str,
  collection_id: &str,
  document_id: &str,
  document: &Document,
)
{
  for (field_name, field_value) in document.fields.iter() {
    let field_value = field_value_proto_to_sql(&field_value);
    transaction.execute(
      "insert into simple_query_lookup values ($1, $2, $3, $4, $5)",
      &[&collection_parent_path, &collection_id, &document_id, &field_name, &field_value]).unwrap();
  }
}

pub fn delete_document_from_simple_query_table(
  transaction: &mut Transaction,
  collection_parent_path: &str,
  collection_id: &str,
  document_id: &str,
)
{
  transaction.execute(
    "delete from simple_query_lookup where collection_parent_path=$1 and collection_id=$2 and document_id=$3",
    &[&collection_parent_path, &collection_id, &document_id]).unwrap();
}

pub fn subscribe_to_simple_query(
  transaction: &mut Transaction,
  client_id: &str,
  user_id: &UserId,
  collection_parent_path: &Option<String>,
  collection_id: &str,
  field_name: &str,
  field_operator: &str,
  field_value: &field_value)
  -> String
{
  if let User(user_id) = user_id {
    assert!(operation_is_allowed(user_id, &Operation::List,
                                 &collection_parent_path,
                                 collection_id, &None));
  }

  let subscription_id: String = Uuid::new_v4().as_simple().to_string();
  transaction.execute("insert into client_subscriptions values ($1, $2)",
                      &[&subscription_id, &client_id]).unwrap();

  let collection_parent_path_string: String;
  if let Some(collection_parent_path) = collection_parent_path {
    collection_parent_path_string = collection_parent_path.clone();
  } else {
    collection_parent_path_string = "NULL".to_owned();
  }

  transaction.execute("insert into simple_query_subscriptions values ($1, $2, $3, $4, $5, $6)",
                      &[&collection_parent_path_string, &collection_id, &field_name, &field_operator, &field_value, &subscription_id]).unwrap();

  // Todo: trigger first subscription update?
  subscription_id
}
