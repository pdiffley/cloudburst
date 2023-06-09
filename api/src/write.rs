use postgres::{Transaction};
use prost::Message;
use uuid::Uuid;

use crate::basic_read::{get_document, get_matching_basic_subscription_ids};
use crate::composite_query::{add_document_to_composite_query_tables, CompositeFieldGroup, delete_document_from_composite_query_tables, get_matching_composite_query_subscriptions};
use crate::protos::document_protos::Document;
use crate::security_rules::{Operation, operation_is_allowed, UserId};
use crate::security_rules::UserId::User;
use crate::simple_query::{add_document_to_simple_query_table, delete_document_from_simple_query_table, get_matching_simple_query_subscriptions};
use crate::update_queue::write_change_to_update_queues;

fn create_document(
  transaction: &mut Transaction,
  collection_parent_path: &str,
  collection_id: &str,
  document_id: &str,
  update_id: &str,
  document: &Document,
  composite_groups: &[CompositeFieldGroup],
) {
  let mut encoded_document: Vec<u8> = vec![];
  document.encode(&mut encoded_document).unwrap();

  add_document_to_documents_table(transaction, collection_parent_path, collection_id, document_id, update_id, &encoded_document);
  add_document_to_simple_query_table(transaction, collection_parent_path, collection_id, document_id, document);
  add_document_to_composite_query_tables(transaction, collection_parent_path, collection_id, document_id, document, composite_groups);

  let mut matching_subscriptions = vec![];
  matching_subscriptions.extend(get_matching_basic_subscription_ids(transaction, collection_parent_path, collection_id, document_id).into_iter());
  matching_subscriptions.extend(get_matching_simple_query_subscriptions(transaction, collection_parent_path, collection_id, document).into_iter());
  matching_subscriptions.extend(get_matching_composite_query_subscriptions(transaction, document, composite_groups).into_iter());

  write_change_to_update_queues(transaction, &matching_subscriptions, collection_parent_path, collection_id, document_id, update_id, &Some(encoded_document));
  // Todo: Ping client-server connection to trigger update (this would actually happen after the transaction)
}

pub fn delete_document(
  transaction: &mut Transaction,
  user_id: &UserId,
  collection_parent_path: &str,
  collection_id: &str,
  document_id: &str,
  composite_groups: &[CompositeFieldGroup],
) {
  if let User(user_id) = user_id {
    assert!(operation_is_allowed(user_id, &Operation::Delete,
                                 &Some(collection_parent_path.to_owned()),
                                 collection_id, &Some(document_id.to_owned())));
  }

  if let Some(document) = get_document(transaction, user_id, collection_parent_path, collection_id, document_id) {
    delete_document_from_documents_table(transaction, collection_parent_path, collection_id, document_id);
    delete_document_from_simple_query_table(transaction, collection_parent_path, collection_id, document_id);
    delete_document_from_composite_query_tables(transaction, collection_parent_path, collection_id, document_id, composite_groups);

    let mut matching_subscriptions = vec![];
    matching_subscriptions.extend(get_matching_basic_subscription_ids(transaction, collection_parent_path, collection_id, document_id).into_iter());
    matching_subscriptions.extend(get_matching_simple_query_subscriptions(transaction, collection_parent_path, collection_id, &document).into_iter());
    matching_subscriptions.extend(get_matching_composite_query_subscriptions(transaction, &document, composite_groups).into_iter());

    let update_id: String = Uuid::new_v4().as_simple().to_string();
    write_change_to_update_queues(transaction, &matching_subscriptions, collection_parent_path, collection_id, document_id, &update_id, &None);
    // Todo: Ping client-server connection to trigger update (this would actually happen after the transaction)
  }
}

pub fn write_document(
  transaction: &mut Transaction,
  user_id: &UserId,
  mut document: Document,
  composite_groups: &[CompositeFieldGroup],
)
{
  let collection_parent_path: String = document.id.clone().unwrap().collection_parent_path.clone();
  let collection_id: String = document.id.clone().unwrap().collection_id.clone();
  let document_id: String = document.id.clone().unwrap().document_id.clone();
  let update_id: String = Uuid::new_v4().as_simple().to_string();
  document.update_id = Some(update_id.clone());

  let operation: Operation;
  if document_exists(transaction, &collection_parent_path, &collection_id, &document_id) {
    operation = Operation::Update;
  } else {
    operation = Operation::Create;
  }

  if let User(user_id) = user_id {
    assert!(operation_is_allowed(user_id, &operation,
                                 &Some(collection_parent_path.to_owned()),
                                 &collection_id, &Some(document_id.to_owned())));
  }

  delete_document(transaction, &UserId::Admin, &collection_parent_path, &collection_id, &document_id, composite_groups);
  create_document(transaction, &collection_parent_path, &collection_id, &document_id, &update_id, &document, composite_groups);
}

fn add_document_to_documents_table(
  transaction: &mut Transaction,
  collection_parent_path: &str,
  collection_id: &str,
  document_id: &str,
  update_id: &str,
  encoded_document: &[u8])
{
  transaction.execute(
    "insert into documents values ($1, $2, $3, $4, $5)",
    &[&collection_parent_path, &collection_id, &document_id, &encoded_document, &update_id]).unwrap();
}

fn delete_document_from_documents_table(
  transaction: &mut Transaction,
  collection_parent_path: &str,
  collection_id: &str,
  document_id: &str,
) {
  transaction.execute(
    "delete from documents where collection_parent_path=$1 and collection_id=$2 and document_id=$3",
    &[&collection_parent_path, &collection_id, &document_id])
    .unwrap();
}

fn document_exists(
  transaction: &mut Transaction,
  collection_parent_path: &str,
  collection_id: &str,
  document_id: &str,
) -> bool {
  let document_exists = transaction.query(
    "SELECT 1 FROM documents WHERE collection_parent_path=$1 and collection_id=$2 and document_id=$3",
    &[&collection_parent_path, &collection_id, &document_id],
  ).unwrap().len() > 0;
  document_exists
}
