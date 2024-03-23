CREATE TABLE IF NOT EXISTS source_table (
  col1 INT,
  col2 REAL
);

CREATE TABLE IF NOT EXISTS target_table (
  col1 INT,
  col2 REAL
);

CREATE OR REPLACE FUNCTION test_trigger_fn() RETURNS TRIGGER AS $$
  BEGIN
    -- RAISE NOTICE 'hi!';
    EXECUTE 'insert into target_table values($1.col1, $1.col2)'
    USING NEW;
    RETURN NEW;
  END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER test_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON source_table
  FOR EACH ROW
  EXECUTE FUNCTION test_trigger_fn();

insert into source_table values (1, 4.0);



