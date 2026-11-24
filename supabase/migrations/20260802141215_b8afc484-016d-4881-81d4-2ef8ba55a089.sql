REVOKE ALL ON SCHEMA graphql FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SCHEMA graphql_public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA graphql, graphql_public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA graphql, graphql_public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA graphql REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA graphql_public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;