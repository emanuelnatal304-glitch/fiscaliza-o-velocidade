-- Execute uma vez no SQL Editor do Supabase.
create table public.medicoes (
 id uuid primary key default gen_random_uuid(),
 usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 placa text not null check (placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
 trecho text not null,
 distancia_km numeric(8,3) not null check (distancia_km > 0),
 limite_kmh numeric(5,1) not null check (limite_kmh > 0),
 entrada_em timestamptz not null,
 saida_em timestamptz,
 velocidade_kmh numeric(6,2),
 infracao boolean,
 criado_em timestamptz not null default now(),
 check (saida_em is null or saida_em > entrada_em)
);
-- Só pode haver uma passagem aberta por placa.
create unique index medicoes_aberta_idx on public.medicoes(usuario_id, placa) where saida_em is null;
create index medicoes_usuario_idx on public.medicoes(usuario_id, entrada_em desc);
alter table public.medicoes enable row level security;
revoke all on public.medicoes from anon;
grant select, insert, update on public.medicoes to authenticated;
create policy "Consultar próprias medições" on public.medicoes for select to authenticated using (usuario_id = (select auth.uid()));
create policy "Registrar próprias medições" on public.medicoes for insert to authenticated with check (usuario_id = (select auth.uid()));
create policy "Alterar próprias medições" on public.medicoes for update to authenticated using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
