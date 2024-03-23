CREATE TABLE documents (
  num_a      REAL,
  num_b      REAL
);

CREATE INDEX two_column_idx
ON documents(num_a, num_b);


--EXPLAIN SELECT * from documents WHERE num_a < 0.5 AND num_b < 0.75;