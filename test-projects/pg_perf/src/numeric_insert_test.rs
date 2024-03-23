use std::env;
use std::process::Command;
use rand;
use postgres::{Client, IsolationLevel, NoTls, Row, Transaction};
use postgres::types::{ToSql, Type};
use stopwatch::{Stopwatch};

fn single_inserts_float() {
  let mut float_inserts: Vec<String> = vec![];
  let mut num_inserts: Vec<String> = vec![];
  for _ in 0 .. 100000 {
    let float: f64 = f64::MAX * rand::random::<f64>();
    float_inserts.push(format!("insert into floats values ({});", float));
    num_inserts.push(format!("insert into numerics values ({});", float));
  }


  let user: String = env::var("USER").unwrap();
  let connection_string = &format!("host=localhost user={} dbname=pg_perf", user);
  let mut client: Client = Client::connect(connection_string, NoTls).unwrap();


  let mut sw = Stopwatch::start_new();
  let mut transaction = client.build_transaction()
    .isolation_level(IsolationLevel::RepeatableRead)
    .start().unwrap();
  for cmd in &num_inserts {
    transaction.execute(cmd, &[]).unwrap();
  }
  transaction.commit().unwrap();
  sw.stop();
  println!("num time: {:?}", sw.elapsed_ms());


  let mut sw = Stopwatch::start_new();
  let mut transaction = client.build_transaction()
    .isolation_level(IsolationLevel::RepeatableRead)
    .start().unwrap();
  for cmd in &float_inserts {
    transaction.execute(cmd, &[]).unwrap();
  }
  transaction.commit().unwrap();
  sw.stop();
  println!("flt time: {:?}", sw.elapsed_ms());

}

fn single_inserts() {
  let mut int_inserts: Vec<String> = vec![];
  let mut num_inserts: Vec<String> = vec![];
  for _ in 0 .. 100000 {
    let int: i64 = rand::random();
    int_inserts.push(format!("insert into integers values ({});", int));
    num_inserts.push(format!("insert into numerics values ({});", int));
  }


  let user: String = env::var("USER").unwrap();
  let connection_string = &format!("host=localhost user={} dbname=pg_perf", user);
  let mut client: Client = Client::connect(connection_string, NoTls).unwrap();


  let mut sw = Stopwatch::start_new();
  let mut transaction = client.build_transaction()
    .isolation_level(IsolationLevel::RepeatableRead)
    .start().unwrap();
  for cmd in &num_inserts {
    transaction.execute(cmd, &[]).unwrap();
  }
  transaction.commit().unwrap();
  sw.stop();
  println!("num time: {:?}", sw.elapsed_ms());


  let mut sw = Stopwatch::start_new();
  let mut transaction = client.build_transaction()
    .isolation_level(IsolationLevel::RepeatableRead)
    .start().unwrap();
  for cmd in &int_inserts {
    transaction.execute(cmd, &[]).unwrap();
  }
  transaction.commit().unwrap();
  sw.stop();
  println!("int time: {:?}", sw.elapsed_ms());

}

fn bulk_insert() {

  let mut int_insert = "insert into integers values".to_string();
  let mut num_insert = "insert into numerics values".to_string();
  for _ in 0 .. 1000000 {
    let int: i64 = rand::random();
    let int_str = format!(" ({}),", int);
    int_insert += &int_str;
    num_insert += &int_str;
  }
  int_insert.pop();
  int_insert += ";";
  num_insert.pop();
  num_insert += ";";


  let user: String = env::var("USER").unwrap();
  let connection_string = &format!("host=localhost user={} dbname=pg_perf", user);
  let mut client: Client = Client::connect(connection_string, NoTls).unwrap();


  let mut sw = Stopwatch::start_new();
  let mut transaction = client.build_transaction()
    .isolation_level(IsolationLevel::RepeatableRead)
    .start().unwrap();
  transaction.execute(&num_insert, &[]).unwrap();
  transaction.commit().unwrap();
  sw.stop();
  println!("num time: {:?}", sw.elapsed_ms());


  let mut sw = Stopwatch::start_new();
  let mut transaction = client.build_transaction()
    .isolation_level(IsolationLevel::RepeatableRead)
    .start().unwrap();
  transaction.execute(&int_insert, &[]).unwrap();
  transaction.commit().unwrap();
  sw.stop();
  println!("int time: {:?}", sw.elapsed_ms());

}

fn setup_database() {
  let home_dir: String =
    env::vars().filter(|&(ref k, _)|
      k == "HOME"
    ).next().unwrap().1;

  let create_db = home_dir.clone() + "/Desktop/pg_perf/sql_setup/setup_numeric_insert_test_db.sql";

  Command::new("createdb").arg("pg_perf").output().unwrap();
  Command::new("psql").args(["-d", "pg_perf", "-f", &create_db]).output().unwrap();
}

fn teardown_database() {
  Command::new("dropdb").arg("pg_perf").output().unwrap();
}
