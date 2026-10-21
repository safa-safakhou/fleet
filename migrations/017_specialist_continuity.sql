-- Separate new profile namespace; no state migration, enrollment or configuration change.
ALTER TABLE continuity_states DROP CONSTRAINT IF EXISTS continuity_states_namespace_check;
ALTER TABLE continuity_states ADD CONSTRAINT continuity_states_namespace_check
 CHECK(namespace IN ('reactive-cognition@1','specialist-coordinator@1','reactive-cognition@1.1'));
