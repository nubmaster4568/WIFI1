-- Table: admin_users
CREATE TABLE admin_users (
    user_id text NOT NULL
);

-- Table: locations
CREATE TABLE locations (
    id integer NOT NULL DEFAULT nextval('locations_id_seq'::regclass),
    location_name text,
    PRIMARY KEY (id)
);
-- Table: cities
CREATE TABLE cities (
    id INTEGER NOT NULL DEFAULT nextval('cities_id_seq'::regclass),
    city_name TEXT,
    PRIMARY KEY (id)
);

-- Table: products
CREATE TABLE products (
    id INTEGER NOT NULL DEFAULT nextval('products_id_seq'::regclass),
    location_id INTEGER NOT NULL,
    name TEXT,
    weight REAL,
    price REAL,
    type TEXT,
    identifier TEXT,
    product_image BYTEA,
    location_image BYTEA,
    status TEXT DEFAULT 'ON'::text,
    FOREIGN KEY (location_id) REFERENCES locations(id),
    PRIMARY KEY (id)
);


-- Table: transactions
CREATE TABLE transactions (
    id integer NOT NULL DEFAULT nextval('transactions_id_seq'::regclass),
    product_name text,
    product_price real,
    product_id text,
    status text,
    user_id text,
    amount_in_dash real,
    lat real,
    lng real,
    PRIMARY KEY (id)
);

-- Table: users
CREATE TABLE users (
    id integer NOT NULL DEFAULT nextval('users_id_seq'::regclass),
    user_id text NOT NULL,
    wallet_address text,
    PRIMARY KEY (id)
);



CREATE TABLE locations (
    id INTEGER NOT NULL DEFAULT nextval('locations_id_seq'::regclass),
    city_id INTEGER NOT NULL,
    location_name TEXT,
    latitude REAL,
    longitude REAL,
    FOREIGN KEY (city_id) REFERENCES cities(id),
    PRIMARY KEY (id)
);