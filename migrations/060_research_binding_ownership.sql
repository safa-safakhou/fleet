-- Explicit fresh-binding enrollment owns future native event/periodic task keys.
-- Existing exact-key routes retain their original behavior and cannot override it.
CREATE TABLE IF NOT EXISTS research_binding_routes (
 binding_id uuid PRIMARY KEY REFERENCES environment_bindings(id),
 profile_id text NOT NULL,profile_version text NOT NULL,
 manifest_digest text NOT NULL REFERENCES research_manifests(digest),
 created_at timestamptz NOT NULL
);
CREATE OR REPLACE FUNCTION research_inherit_task_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE exact_route research_task_routes%ROWTYPE; binding_route research_binding_routes%ROWTYPE;
        selected_digest text; selected_profile text; selected_version text;
BEGIN
 SELECT * INTO exact_route FROM research_task_routes WHERE binding_id=NEW.binding_id AND task_key=NEW.task_key;
 SELECT * INTO binding_route FROM research_binding_routes WHERE binding_id=NEW.binding_id;
 IF exact_route.binding_id IS NOT NULL AND binding_route.binding_id IS NOT NULL AND
    (exact_route.manifest_digest<>binding_route.manifest_digest OR exact_route.profile_id<>binding_route.profile_id OR exact_route.profile_version<>binding_route.profile_version)
 THEN RAISE EXCEPTION 'RESEARCH_ROUTE_PROFILE_MISMATCH'; END IF;
 selected_digest=coalesce(exact_route.manifest_digest,binding_route.manifest_digest);
 selected_profile=coalesce(exact_route.profile_id,binding_route.profile_id);
 selected_version=coalesce(exact_route.profile_version,binding_route.profile_version);
 IF selected_digest IS NOT NULL THEN
  IF selected_profile<>NEW.profile_id OR selected_version<>NEW.profile_version THEN RAISE EXCEPTION 'RESEARCH_ROUTE_PROFILE_MISMATCH'; END IF;
  UPDATE platform_tasks SET scheduler_owner='temporal',research_manifest_digest=selected_digest WHERE id=NEW.id;
  INSERT INTO research_task_owners(task_id,manifest_digest,phase,created_at) VALUES(NEW.id,selected_digest,'ready',NEW.created_at);
 END IF;
 RETURN NEW;
END $$;
