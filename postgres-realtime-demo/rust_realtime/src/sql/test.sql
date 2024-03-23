-- add to change queue
-- update id table
CREATE OR REPLACE FUNCTION _cb_track_change_<*add uuid*>() RETURNS TRIGGER AS $$
  DECLARE
    cb_row_id UUID
  BEGIN
    
    IF (TG_OP = 'INSERT') THEN
      cb_row_id := gen_random_uuid;
      -- get insert ids statement from tables data and execute
      INSERT INTO <row_id_table> (cb_row_id_column_name, <cb_col_name_1>, <cb_col_name2>...) VALUES (cb_row_id, NEW.<user_col_name1>, NEW.<user_col_name2>)
      INSERT INTO _cb_change_queue VALUES (TG_TABLE_NAME, cb_row_id, gen_random_uuid(), gen_random_int());
      RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
      SELECT cb_row_id INTO cb_row_id FROM <row_id_table> WHERE cb_primary_key_col_name1 = NEW.<user_primary_key_col_name1> AND cb_primary_key_col_name2 = NEW.<user_primary_key_col_name2> FOR UPDATE;

      -- run primary key has changed function
        -- if changed run update primary key record function
        UPDATE <row_id_table_name> SET cb_p_key_col1 = NEW.p_key_col1, cb_p_key_col2 = NEW.p_key_col2 WHERE cb_row_id = cb_row_id;
      INSERT INTO _cb_change_queue 
      VALUES (TG_TABLE_NAME, cb_row_id, gen_random_uuid(), gen_random_int())
      ON CONFLICT (cb_row_id) DO UPDATE 
      SET update_id = gen_random_uuid();

      RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
      -- get cb_row_id with old primary key
      -- delete row with cb_row_id

      INSERT INTO _cb_change_queue 
      VALUES (TG_TABLE_NAME, _cb_row_id, gen_random_uuid(), gen_random_int())
      ON CONFLICT (cb_row_id) DO UPDATE
      SET update_id = gen_random_uuid();
      RETURN OLD;
    END IF;
  END;
$$ LANGUAGE plpgsql;



CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE FUNCTION key_cmp_<table_id>(NEW record, OLD record) RETURNS INT8 AS $$
  BEGIN
    RETURN NEW.<primarykeycol> == OLD.<primarykeycol> AND NEW.<col2> == OLD.<col2>;
  END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION gen_random_ints() RETURNS INT8 AS $$
  DECLARE
    a int8;
  BEGIN
    FOR i IN 1..1000000 LOOP
      a := gen_random_int();
    END LOOP;
    RETURN a;
  END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION test() RETURNS BOOLEAN AS $$
  BEGIN
    RAISE NOTICE 'TEST';
    RETURN True;
  END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION test_exec() RETURNS BOOLEAN AS $$
  DECLARE
    result BOOLEAN;
  BEGIN
    EXECUTE 'SELECT test()'
    INTO result;
    RETURN result;
   END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION test_conditional() RETURNS BOOLEAN AS $$
  DECLARE
    result BOOLEAN;
  BEGIN
    IF (EXECUTE 'test()') THEN
      RETURN True;
    END IF;
    RETURN False;
   END;
$$ LANGUAGE plpgsql;


CREATE TABLE source_table (
  col1 INT,
  col2 REAL
);

CREATE TABLE target_table (
  col1 INT,
  col2 REAL
);

CREATE OR REPLACE FUNCTION test_trigger_fn() RETURNS TRIGGER AS $$
  DECLARE
    cb_row_id UUID;
  BEGIN
    cb_row_id := gen_random_uuid();
    RAISE EXCEPTION 'notice!!';
    EXECUTE 'RAISE NOTICE ''notice!!!!!''';
    EXECUTE 'INSERT INTO target_table VALUES (NEW.col1, NEW.col2)';
    RETURN NEW;
  END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER test_trigger
    BEFORE UPDATE ON source_table
    FOR EACH ROW
    EXECUTE FUNCTION test_trigger_fn();