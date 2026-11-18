-- A name for an audit.
--
-- One brand is audited in several markets, and the list showed every run as
-- "16 Nov 2026 · 10 prompts". Seventeen of those are indistinguishable, so the
-- question "which one had the Argentina prompts" had no answer on the screen.
--
-- Nullable on purpose: a run without a name falls back to its date, market and
-- prompt count, which is what every existing row will do. Nothing to backfill.
--
-- No policy change needed. The client already updates this table when a model
-- is added to a finished audit, so whatever row-level security allows that
-- allows this.

alter table audits add column if not exists name text;

comment on column audits.name is
  'Optional label the user gives a run. Falls back to date, market and prompt count when null.';
