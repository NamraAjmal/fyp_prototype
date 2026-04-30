-- Insert Super Admin User (Organization-independent)
-- Password: SuperAdmin@2024
-- Hash: scrypt:32768:8:1$doM4Ao7Ha8nTMF9c$2c5e56f0c2af537d3f07921367c45cf8ef1012abd9505b12777a25db223af7b0ca7135a71613c961d73a78c48b8f023534fd0961db2fae7cd6135c462a0a209c
INSERT INTO public.access_users (email, username, display_name, password_hash, role, organization_id, is_active)
VALUES (
  'admin@smartcity.local',
  'admin',
  'System Administrator',
  'scrypt:32768:8:1$doM4Ao7Ha8nTMF9c$2c5e56f0c2af537d3f07921367c45cf8ef1012abd9505b12777a25db223af7b0ca7135a71613c961d73a78c48b8f023534fd0961db2fae7cd6135c462a0a209c',
  'admin',
  NULL,  -- Super admin has no organization scope
  true
)
ON CONFLICT (email) DO UPDATE
SET 
  password_hash = 'scrypt:32768:8:1$doM4Ao7Ha8nTMF9c$2c5e56f0c2af537d3f07921367c45cf8ef1012abd9505b12777a25db223af7b0ca7135a71613c961d73a78c48b8f023534fd0961db2fae7cd6135c462a0a209c',
  role = 'admin',
  is_active = true;
