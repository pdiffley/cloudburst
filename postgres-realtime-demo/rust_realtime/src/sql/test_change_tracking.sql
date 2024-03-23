CREATE TABLE IF NOT EXISTS _cb_change_queue(
  table_name    TEXT,
  cb_row_id     UUID PRIMARY KEY,
  update_id     UUID UNIQUE,
  lb_index      INT8
);

CREATE TABLE IF NOT EXISTS source_table (
  str_id TEXT,
  col2 REAL,
  int_id INT,
  PRIMARY KEY(int_id, str_id)
);

CREATE TABLE IF NOT EXISTS _cb_row_id_source_table432 (
  cb_row_id UUID PRIMARY KEY,
  user_pkey_int_id TEXT,
  user_pkey_str_id INT
);

CREATE UNIQUE INDEX ON _cb_row_id_source_table432 (user_pkey_int_id, user_pkey_str_id);

