-- National food-composition tables (ANSES-Ciqual, CoFID, CREA) as a local
-- search source, replacing Edamam.
--
-- Why a separate table rather than `foods` rows with user_id is null (which RLS
-- would already make world-readable):
--
--   1. useFoodSearch orders the local `foods` query by created_at desc, limit
--      20. ~5,300 freshly-imported rows are the newest rows in the table, so
--      they would fill every slot — hiding both the user's own custom foods and
--      the community foods that share that one query.
--   2. food_logs.food_id points at `foods`. Refreshing a dataset in place would
--      retroactively rewrite what people already ate, and pruning a food that
--      upstream dropped would cascade-delete their logs. Here a `foods` row is
--      materialized by upsertExternalFood() at log time — a snapshot — so this
--      table can be replaced wholesale without touching history.
--   3. It makes the new source structurally identical to Open Food Facts and
--      USDA: a SearchFn in the Edge Function's SOURCES array.
--
-- Everything here is public reference data. There is no user data in this
-- schema, so it is world-readable and written only by the service role (from
-- scripts/import-reference-foods.mjs).

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- reference_foods
-- ---------------------------------------------------------------------------

create table if not exists public.reference_foods (
  source          text not null check (source in ('ciqual', 'cofid', 'crea')),
  external_id     text not null,
  -- The dataset's own primary name: French for Ciqual, English for CoFID,
  -- Italian for CREA.
  name            text not null,
  name_lang       text not null check (name_lang ~ '^[a-z]{2}$'),
  -- Ciqual carries alim_nom_eng alongside alim_nom_fr; the others ship one
  -- language, so this is null there.
  name_en         text,
  -- Search synonyms: alim_nom_index_fr/eng for Ciqual, the food description and
  -- group label for CoFID, the category label for CREA.
  synonyms        text,
  -- Every dataset is per 100 g of edible portion — except CoFID's alcoholic
  -- beverages (group Q), which are per 100 ml. Stored rather than assumed so
  -- the app never restates a volume as a mass.
  serving_amount  numeric not null default 100 check (serving_amount > 0),
  serving_unit    text not null default 'g' check (serving_unit in ('g', 'ml')),
  carbs_g         numeric not null check (carbs_g >= 0),
  protein_g       numeric not null check (protein_g >= 0),
  fats_g          numeric not null check (fats_g >= 0),
  kcal            numeric check (kcal >= 0),
  -- e.g. 'ciqual-2025-11-03'. Both open licences require the version to be
  -- stated alongside the data, and the importer prunes on it.
  dataset_version text not null,
  -- Maintained by the trigger below, never written by the importer.
  search_text     text not null default '',
  search_vec      tsvector not null default ''::tsvector,
  updated_at      timestamptz not null default now(),
  primary key (source, external_id)
);

-- ---------------------------------------------------------------------------
-- Search columns
--
-- A trigger rather than GENERATED columns: unaccent() is STABLE, not IMMUTABLE,
-- so it cannot appear in a generated expression without wrapping it in a
-- function that lies about its volatility. Accent folding is not optional here
-- — "poêlé", "crème" and "bœuf" are half of Ciqual, and nobody types the
-- diacritics into a phone search box.
-- ---------------------------------------------------------------------------

create or replace function public.reference_foods_search()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.search_text := lower(unaccent(
    coalesce(new.name, '') || ' ' ||
    coalesce(new.name_en, '') || ' ' ||
    coalesce(new.synonyms, '')
  ));
  -- Weighted so a hit on the food's own name outranks a hit on a synonym.
  new.search_vec :=
       setweight(to_tsvector('simple', lower(unaccent(coalesce(new.name, '')))), 'A')
    || setweight(to_tsvector('simple', lower(unaccent(coalesce(new.name_en, '')))), 'B')
    || setweight(to_tsvector('simple', lower(unaccent(coalesce(new.synonyms, '')))), 'C');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists reference_foods_search_biu on public.reference_foods;

create trigger reference_foods_search_biu
  before insert or update on public.reference_foods
  for each row execute function public.reference_foods_search();

-- 'simple' rather than 'french'/'english': the config would have to vary per
-- row, and stemming buys little on a corpus of noun phrases while costing the
-- prefix matching that makes results appear mid-word. Fuzziness comes from the
-- trigram index instead.
create index if not exists reference_foods_vec_idx
  on public.reference_foods using gin (search_vec);

create index if not exists reference_foods_trgm_idx
  on public.reference_foods using gin (search_text extensions.gin_trgm_ops);

-- Supports the importer's "delete everything not in the version I just loaded".
create index if not exists reference_foods_version_idx
  on public.reference_foods (source, dataset_version);

-- ---------------------------------------------------------------------------
-- reference_datasets: one row per loaded dataset.
--
-- Both open licences require the source *and the version* to be stated wherever
-- the data is reused, so the attribution lives beside the data rather than only
-- in a README that can drift. It is also what makes the importer idempotent:
-- the checksum of the committed CSV says whether there is anything to do.
-- ---------------------------------------------------------------------------

create table if not exists public.reference_datasets (
  source      text primary key check (source in ('ciqual', 'cofid', 'crea')),
  version     text not null,
  checksum    text not null, -- sha256 of the committed CSV
  row_count   integer not null check (row_count >= 0),
  license     text not null,
  attribution text not null,
  source_url  text not null,
  imported_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security + grants
--
-- The grants are not decorative: config.toml's auto_expose_new_tables is unset,
-- so new entities created by `postgres` in `public` are NOT reachable through
-- the Data API roles. Without these, everything below works against
-- `supabase start` and 404s in production.
-- ---------------------------------------------------------------------------

alter table public.reference_foods enable row level security;
alter table public.reference_datasets enable row level security;

create policy "reference_foods readable by everyone" on public.reference_foods
  for select using (true);

create policy "reference_datasets readable by everyone" on public.reference_datasets
  for select using (true);

-- No insert/update/delete policies, deliberately: only the service role (which
-- bypasses RLS) writes here.
grant select on public.reference_foods to anon, authenticated;
grant select on public.reference_datasets to anon, authenticated;
grant select, insert, update, delete on public.reference_foods to service_role;
grant select, insert, update, delete on public.reference_datasets to service_role;

-- ---------------------------------------------------------------------------
-- search_reference_foods: ranked lookup, called by the food-search Edge
-- Function with the anon key.
--
-- Why a function and not a PostgREST query: PostgREST can express the predicate
-- but can only order by columns, and there is no way to sort by ts_rank().
-- Ranking is the entire point.
--
-- security invoker (the default) is deliberate: the table is world-readable by
-- policy, so definer rights would be gratuitous privilege on a function that
-- takes an arbitrary user-supplied string.
-- ---------------------------------------------------------------------------

create or replace function public.search_reference_foods(
  q text,
  lang text default 'en',
  max_results integer default 20
)
returns table (
  source         text,
  external_id    text,
  name           text,
  serving_amount numeric,
  serving_unit   text,
  carbs_g        numeric,
  protein_g      numeric,
  fats_g         numeric
)
language plpgsql
set search_path = public, extensions
as $$
declare
  needle text;
  tsq    tsquery;
begin
  -- Fold to the same shape as search_text, then reduce to alphanumeric tokens.
  -- That reduction is also what makes the to_tsquery() construction below
  -- injection-proof: afterwards a token cannot contain a tsquery operator.
  needle := lower(unaccent(coalesce(q, '')));
  needle := trim(regexp_replace(needle, '[^a-z0-9]+', ' ', 'g'));
  if needle = '' then
    return;
  end if;

  -- Prefix-match every token so results land while the user is still typing
  -- ("chick" -> "chicken breast"). plainto_/websearch_to_tsquery cannot do this.
  select to_tsquery('simple', string_agg(t || ':*', ' & '))
    into tsq
    from unnest(string_to_array(needle, ' ')) as t
   where t <> '';

  -- Looser than the 0.3 default: food names are long, so even an exactly right
  -- two-word query is a small fraction of the row's trigram set.
  perform set_config('pg_trgm.similarity_threshold', '0.20', true);

  return query
  select r.source,
         r.external_id,
         -- Ciqual ships an English name; prefer it when that is what was asked
         -- for. The other datasets have no name_en, so this is a no-op there.
         case
           when lang = 'en' and coalesce(r.name_en, '') <> '' then r.name_en
           else r.name
         end,
         r.serving_amount,
         r.serving_unit,
         r.carbs_g,
         r.protein_g,
         r.fats_g
    from public.reference_foods r
    -- Both arms are index-usable: gin(search_vec) and gin(search_text trgm).
   where (tsq is not null and r.search_vec @@ tsq)
      or r.search_text % needle
   order by
        -- Lexeme match dominates; trigram similarity breaks ties and rescues
        -- typos. Language and prefix are nudges, not gates: filtering on
        -- name_lang would make CoFID invisible to the de/es/pt/nl locales, for
        -- which an English food name is far better than nothing.
          ts_rank(r.search_vec, coalesce(tsq, ''::tsquery)) * 4.0
        + similarity(r.search_text, needle)
        + case when r.name_lang = lang then 0.5 else 0 end
        + case when r.search_text like needle || '%' then 0.3 else 0 end
        desc,
        -- Shorter names are the generic entries ("Milk, whole" before
        -- "Milk, whole, pasteurised, fortified with vitamin D").
        length(r.name) asc,
        -- A total order, so equal-scoring rows don't shuffle between calls.
        r.source, r.external_id
   limit greatest(1, least(coalesce(max_results, 20), 50));
end;
$$;

revoke all on function public.search_reference_foods(text, text, integer) from public;
grant execute on function public.search_reference_foods(text, text, integer)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- foods.source: allow the three new sources (mirrors 0002 / 0005).
--
-- 'edamam' stays even though the source is retired: users have already logged
-- Edamam foods, and Postgres validates existing rows when adding a CHECK, so
-- dropping the value would make this migration fail outright on any database
-- holding even one of them. Those rows keep rendering their attribution chip.
-- ---------------------------------------------------------------------------

alter table public.foods
  drop constraint if exists foods_source_check;

alter table public.foods
  add constraint foods_source_check
  check (source in ('custom', 'openfoodfacts', 'usda', 'edamam', 'ciqual', 'cofid', 'crea'));
