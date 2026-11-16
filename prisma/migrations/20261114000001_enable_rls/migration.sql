-- Liga RLS em TODAS as tabelas do schema public, sem nenhuma policy.
-- Efeito: a API pública do Supabase (PostgREST, chave anon/authenticated)
-- não consegue ler nem gravar nada. O app acessa o banco só pelo servidor,
-- com o usuário "postgres" (BYPASSRLS). Nunca criar policy "using (true)".

DO $$
DECLARE
	t record;
BEGIN
	FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
		EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
	END LOOP;
END $$;

-- Rede de segurança: tabela criada por migration futura nasce com RLS ligado.
-- Event trigger exige privilégio; se o papel não tiver, avisa e segue (nesse
-- caso `npm run db:check-rls` continua sendo a checagem obrigatória).
CREATE OR REPLACE FUNCTION public.enable_rls_on_new_tables() RETURNS event_trigger
LANGUAGE plpgsql AS $fn$
DECLARE
	obj record;
BEGIN
	FOR obj IN
		SELECT * FROM pg_event_trigger_ddl_commands()
		WHERE command_tag = 'CREATE TABLE' AND schema_name = 'public'
	LOOP
		EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', obj.object_identity);
	END LOOP;
END
$fn$;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'enable_rls_new_tables') THEN
		CREATE EVENT TRIGGER enable_rls_new_tables ON ddl_command_end
			WHEN TAG IN ('CREATE TABLE')
			EXECUTE FUNCTION public.enable_rls_on_new_tables();
	END IF;
EXCEPTION WHEN insufficient_privilege THEN
	RAISE NOTICE 'Sem privilégio para criar event trigger; rode npm run db:check-rls após cada migration.';
END $$;
