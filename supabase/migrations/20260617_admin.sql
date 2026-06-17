-- Add admin flag to profiles
alter table profiles add column if not exists is_admin boolean not null default false;

-- Grant adam.furgison@gmail.com admin access
update profiles
set is_admin = true
where id = (select id from auth.users where email = 'adam.furgison@gmail.com');
