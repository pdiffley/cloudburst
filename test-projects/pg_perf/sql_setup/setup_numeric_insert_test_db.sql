CREATE TABLE integers (
  myints      INT8
);

CREATE INDEX integers_myints_idx
ON integers(myints);

CREATE TABLE floats (
  myfloats      FLOAT8
);

CREATE INDEX floats_myfloats_idx
ON floats(myfloats);


CREATE TABLE numerics (
  mynumerics numeric
);

CREATE INDEX numerics_myints_idx
ON numerics(mynumerics);


