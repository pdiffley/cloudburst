use std::env;
use std::process::Command;
use rand;
use postgres::{Client, IsolationLevel, NoTls, Row, Transaction};
use postgres::types::{ToSql, Type};
use stopwatch::{Stopwatch};

pub fn run_value_between_columns_test() {
  teardown_database();
  setup_database();
  bulk_insert();
}

fn bulk_insert() {
  let mut float_insert = "insert into documents values".to_string();
  for _ in 0 .. 1000000 {
    let float1: f64 = rand::random();
    let float2: f64 = float1 + (1.0 - float1) * rand::random::<f64>();
    let float_str = format!(" ({}, {}),", float1, float2);
    float_insert += &float_str;
  }
  float_insert.pop();
  float_insert += ";";


  let user: String = env::var("USER").unwrap();
  let connection_string = &format!("host=localhost user={} dbname=pg_perf", user);
  let mut client: Client = Client::connect(connection_string, NoTls).unwrap();


  let mut sw = Stopwatch::start_new();
  let mut transaction = client.build_transaction()
    .isolation_level(IsolationLevel::RepeatableRead)
    .start().unwrap();
  transaction.execute(&float_insert, &[]).unwrap();
  transaction.commit().unwrap();
  sw.stop();
  println!("float insert time: {:?}", sw.elapsed_ms());


  
}

fn setup_database() {
  let home_dir: String =
    env::vars().filter(|&(ref k, _)|
      k == "HOME"
    ).next().unwrap().1;

  let create_db = home_dir.clone() + "/Desktop/pg_perf/sql_setup/setup_value_between_columns_test_db.sql";

  Command::new("createdb").arg("pg_perf").output().unwrap();
  Command::new("psql").args(["-d", "pg_perf", "-f", &create_db]).output().unwrap();
}

fn teardown_database() {
  Command::new("dropdb").arg("pg_perf").output().unwrap();
}
